# 15 — React Native Migration ("App Shifting")

> plan.md §3.3 + Phase 9. The web launch was deliberately built so this is a **new client, not a rewrite**: 100 % of backend, contracts, validation, cart, and auth stay identical.

## 15.1 What Stays vs What Changes
| Asset | Status in RN | Notes |
|:--|:--|:--|
| `/api/v1` endpoints + envelopes | ✅ unchanged | same `packages/api-client` calls |
| `packages/types` Zod schemas | ✅ reused | form validation via `zodResolver` |
| `packages/core`, `db`, `redis` | ✅ server-side only | no code runs on device |
| Better Auth sessions | ✅ | switch from cookie → `Authorization: Bearer <sessionToken>` (already issued) |
| Server cart (Redis) | ✅ | cart follows the user across web ↔ phone automatically |
| Event payloads | ✅ frozen schema | transport changes: SSE → polling + FCM push |
| Design tokens | ✅ `packages/config/tokens.ts` | Tailwind → **NativeWind** |
| Components | 🔄 rebuilt | shadcn/Tailwind → RN primitives (`View/Text/FlatList/Pressable`) |
| Navigation | 🔄 new | file routes → Expo Router stack/tabs |
| Push | 🆕 | `ExpoPushProvider` + `POST /devices` (tables/contracts already exist) |
| UPI | 🔄 | `upi://` intent via `Linking.openURL` instead of browser |

## 15.2 Scaffold (Phase 9 kickoff)
```bash
pnpm create expo-app apps/mobile --template tabs     # Expo SDK 52+, TypeScript strict
cd apps/mobile && pnpm add nativewind tailwindcss && pnpm add @tanstack/react-query zustand
pnpm add expo-secure-store expo-notifications expo-linking expo-web-browser
pnpm add @sentry/react-native
# metro.config.js: enable monorepo symlinks (watchFolders: repo root, nodeModulesPaths)
# tailwind.config.js: extends tokens from packages/config
```
Monorepo rules from [01-architecture](01-architecture.md) hold: mobile imports `packages/api-client|types|config` only — never `apps/web`.

## 15.3 Auth Adaptation (the only behavioral change)
```ts
// packages/api-client/src/http.ts — transport strategy injected by host app
export const transport: Transport = {
  getHeaders: async () => ({
    ...(await secureStore.getItemAsync("sessionToken")
        ? { Authorization: `Bearer ${await secureStore.getItemAsync("sessionToken")}` } : {}),
    "Idempotency-Key": crypto.randomUUID(),
  }),
};
```
- Login screens call the same `/auth/otp/request|verify`; persist `sessionToken` in **expo-secure-store** (Keychain/Keystore), not AsyncStorage.
- 401 → clear token → redirect to OTP screen. `POST /devices` on login registers push token.

## 15.4 Screen Mapping (web route → RN screen)
| Web | RN (Expo Router file) | Key components ported |
|:--|:--|:--|
| `/app` (home) | `app/(tabs)/index.tsx` | CampusSelector, BannerCarousel, ShopCard grid |
| `/shops/[slug]` | `app/shop/[slug].tsx` | ItemCard, VegFilter, CartBar |
| `/cart` (sheet) | modal `app/cart.tsx` | AddressBuilder, pricing breakdown |
| `/orders/[id]` (tracking) | `app/orders/[id].tsx` | OrderTimeline, **DeliveryPinCard**, call-shop button |
| `/orders` | `app/(tabs)/orders.tsx` | list + status chips |
| `/support` | `app/(tabs)/support.tsx` | ticket list/form |
| `/profile` | `app/(tabs)/profile.tsx` | logout, saved addresses |
| Auth screens | `app/(auth)/otp.tsx` | phone → OTP entry w/ cooldown countdown |

Shared logic hook implementations (`useCart`, `useOrderEvents` polling variant, `useShops`) move to a file importable by both hosts or are duplicated thin (document in PR).


## 15.5 Realtime & Push in RN
SSE (`EventSource`) is unreliable in RN background — replace transport, keep payloads:
| Concern | Web | RN |
|:--|:--|:--|
| Foreground live | `GET /events/stream` (SSE) | TanStack Query `refetchInterval` 10 s on active order **+** Expo Data Push (foreground) |
| Background / app-killed | n/a | **FCM/APNs via Expo Push** — server sends on the same core events |
| Registration | n/a | login → `POST /devices {platform:"ios"\|"android", expoPushToken}` |
| Permissions | n/a | `expo-notifications` request on first tracking screen; graceful deny → polling-only |

Server change (Phase 9, behind `NotificationProvider.sendPush`): the existing `notifications` BullMQ queue fans out **SMS template → push template** for `ORDER_ACCEPTED`, `OUT_FOR_DELIVERY`, `ORDER_CANCELLED`. No new event types; the envelope from [08-realtime-notifications](08-realtime-notifications.md) §8.1 is the push `data` payload.

## 15.6 UPI on Mobile
```ts
import * as Linking from "expo-linking";
const { intentUrl } = await api.payments.upiIntent(orderId);   // same endpoint
const supported = await Linking.canOpenURL(intentUrl);         // upi://pay?...
supported ? await Linking.openURL(intentUrl) : showQrFallback(intentUrl);
// return-from-app: poll POST /payments/{id}/status (3/min cap) + rely on push/SSE-equivalent event
```
No new gateway integration — Razorpay order/webhook path unchanged ([09-payments](09-payments.md)).

## 15.7 Phase 9 Parity Checklist (DoD for app shifting)
- [ ] All 8 customer screens exist and pass the same flows as web (browse→order→track→PIN→delivered)
- [ ] OTP login/verify with cooldown/lockout UX identical to web
- [ ] Session in SecureStore; logout clears it; 401 → auth redirect
- [ ] Cart shared across web ↔ app (same Redis cart, same `CART_CONFLICT_SINGLE_SHOP` behavior)
- [ ] Order tracking updates ≤10 s stale in foreground; push arrives when backgrounded
- [ ] `DeliveryPinCard` legible (large digits, contrast) and hidden post-delivery
- [ ] Shop dashboard works on a tablet (existing responsive promise)
- [ ] Push tokens registered/unregistered correctly on login/logout
- [ ] Deep link `gobite://orders/{id}` opens tracking (from push tap)
- [ ] Sentry RN SDK + same redaction rules as web
- [ ] `pnpm test:e2e-mobile` smoke (Maestro or Jest-RN) green in CI

## 15.8 Store Release Steps (both stores)
1. **App Store:** Apple Developer account → EAS build (`eas build -p ios`) → TestFlight internal group → review notes explaining OTP login (uses SMS, no email) → submit → phased release.
2. **Play Console:** EAS build/AAB → internal testing track → production with **data-safety form** (phone number collected, encrypted in transit, used for auth) → DLT compliance declaration for OTP SMS.
3. Both listings: privacy policy URL (`https://gobite.in/privacy`), screenshots from real flows, version = `1.0.0` aligned with `package.json`.

## 15.9 Known Pitfalls (read before porting)
| Pitfall | Mitigation |
|:--|:--|
| Tailwind classes don't exist in RN | NativeWind maps shared subset; components use token props, not arbitrary hex |
| `window`/`document` leaks into shared code | api-client must stay isomorphic — no DOM APIs; CI check `grep -r "window." packages/` |
| Cookie default in fetch | RN fetch ignores cookies anyway — Bearer header is the only path; test both |
| Keyboard covers OTP inputs | `KeyboardAvoidingView` on all auth forms |
| UPI intent has no return hook | always pair with payment-status polling + webhook truth |
| FlatList jank on menus | memoized `ItemCard`, `keyExtractor`, avoid inline arrays |
| Timezone drift on ETA | render relative times from server `occurredAt`, device tz only for display |
| Expo SDK upgrade churn | pin SDK; upgrade as its own PR with full regression of §15.7 |

→ Next: [CI/CD](16-cicd.md) · ← back to [index](README.md)

