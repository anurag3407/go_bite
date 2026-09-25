# 07 — Frontend Components & Design System

> Figma file: `YumQuick` (tokens from node `1:423`, tracking screen node `240:3971`). Stack: Next.js 15 + Tailwind 4 + shadcn/ui. **Rule of thumb: if it would not translate to a React Native primitive, do not build it that way** (see [15-react-native-migration](15-react-native-migration.md)).

## 7.1 Design Tokens (single source: `packages/config/src/tokens.ts`)
| Token | Value | Usage |
|:--|:--|:--|
| `colors.orangeBase` | `#E95322` | primary buttons, price accents, active states |
| `colors.orangeLight` | `#FFDECF` | chips, badges, hover tints |
| `colors.fontDark` | `#391713` | headings/body on light |
| `colors.fontLight` | `#F8F8F8` | text on orange/dark |
| `colors.canvas` / `colors.card` | `#FAFAFA` / `#FFFFFF` | page bg / cards |
| `fonts.display/body` | `League Spartan` | loaded via `next/font` |
| `radius.card/button/pill` | `16 / 12 / 999` | shared corner scale |

Tailwind consumes tokens (`theme.extend.colors.brand…`); NativeWind consumes the same file in Phase 9 — never hardcode hex in components (ESLint `no-hex-colors`).

## 7.2 Layout Architecture
**Desktop ≥1024 px — 3-column canvas:** Topbar (logo, CampusDropdown, search, profile) / Left 240 px categories + active orders / Center fluid item grid (3-col cards) / Right 360 px sticky live cart (subtotal, address, Place Order, Live PIN).
**Mobile <1024 px — app shell:** header (campus tag, search, avatar) → horizontal story categories → banner carousel → vendor/item grid → **sticky cart bar** (“2 Items • ₹140 | VIEW CART”) → **bottom nav** `[Home][Orders][Support][Profile]`.
Wireframe source of truth: plan.md §14.2 ASCII diagrams.

## 7.3 Component Inventory
### Primitives (`apps/web/components/ui/*`, shadcn-based)
`Button` (variants: primary/secondary/ghost/danger, sizes sm/md) · `Card` · `Sheet` (mobile cart drawer) · `Dialog` · `Input` · `Select` · `Badge` (veg/non-veg, OPEN/CLOSED) · `Skeleton` · `Toast` · `Tabs` · `Avatar` · `BottomSheet` (mobile actions).

### Domain Components
| Component | Props (key) | Behavior / notes |
|:--|:--|:--|
| `Topbar` | `onSearch`, user | sticky; campus dropdown opens `CampusSelectorSheet` |
| `CampusSelector` | `campuses[], activeId, onPick` | geolocation first (`GET /campuses?lat&lng`), manual fallback; persists via `POST /users/me/campus` |
| `CategoryRail` | `categories[], active` | horizontal scroll (mobile) / vertical list (desktop) |
| `ShopCard` | `shop` | image, name, prep time, delivery fee, OPEN badge; entire card → `/shops/{slug}` |
| `ItemCard` | `item, qtyInCart, onAdd, onInc, onDec` | veg dot, price (paise → `formatINR`), +ADD stepper; disabled when `!isAvailable` or shop closed |
| `VegFilter` | `value, onChange` | veg/non-veg toggle (client filter + `?isVeg` param) |
| `CartRail` / `CartBar` | — | desktop right rail vs mobile sticky bar; both read `useCart()` |
| `AddressBuilder` | `locations[], value, onChange` | campus `campus_locations` select + `room_or_flat` + landmark + gate drop-off note |
| `OrderTimeline` | `order, history[]` | vertical stepper PLACED→…→DELIVERED; live-updates from `useOrderEvents` |
| `DeliveryPinCard` | `pin, status` | **most prominent element** (≥40 px digits, high contrast); hidden once DELIVERED |
| `ShopQueueCard` | `order, onAccept…` | shop dashboard row; audio bell on `order.incoming` |
| `PinEntryModal` | `onSubmit` | 4-digit input, 5 attempts → surfaces `PIN_LOCKED` + support path |
| `SnoozeToggle` | `shop.status` | owner-only; confirms duration, hits `POST /shop/status` |
| `BannerCarousel` | `banners[]` | campus announcements (admin-managed) |


## 7.4 Screen Composition (route → stacked components)
| Route | Composition (top→bottom / layers) |
|:--|:--|
| `/app` | `Topbar` → `CampusSelector`/banner → `CategoryRail` → `ShopCard[]` → `CartBar` (mobile) |
| `/shops/[slug]` | `ShopHeader` (status, ETA) → `VegFilter` + search → category sections of `ItemCard` → cart layer |
| cart drawer / `/cart` | `CartLines` (stepper) → pricing block → `AddressBuilder` → `PlaceOrderButton` (disabled until `POST /cart/validate` clean) |
| `/orders/[id]` | `OrderTimeline` + status chip → `DeliveryPinCard` (when out_for_delivery) → payment row → `CallShopButton` |
| `/orders` | filter chips by status → order cards → deep-link to tracking |
| `/shop` (dashboard) | shop header + `SnoozeToggle` + capacity meter → queue tabs (NEW/ACTIVE) of `ShopQueueCard` → `PinEntryModal` overlay |
| `/support` | ticket list → create form (`orderId` picker) → detail with timeline |
| `/profile` | user card, campus history, addresses, logout |

Empty/loading/error states are mandatory per screen: `Skeleton` (loading) · illustrated empty copy (e.g., “No orders yet — your next chai is 10 min away”) · error card with **requestId** + Retry.

## 7.5 State Management
| Concern | Tool | Shape |
|:--|:--|:--|
| Server cache | TanStack Query | keys: `['shops', campusId]`, `['menu', shopId]`, `['cart']`, `['order', id]`, `['orders', {status}]` |
| Session/identity | `useSession()` → `GET /auth/session` (staleTime 60 s) | `{user, activeCampusId}` — drives campus scope |
| Cart mutations | `useCart()` → wraps `/cart/*` + invalidates `['cart']` | optimistic `PUT` with rollback on 409 |
| UI (transient) | Zustand | `cartSheetOpen`, `vegOnly`, `activeCategory`, `toastQueue` — **no server data in Zustand** |
| Realtime | `useEventStream(topics, cb)` | merges events into Query cache ([08](08-realtime-notifications.md)) |

Rule: **server state lives in Query, device state in Zustand, auth in the hook** — identical pattern ports to RN (`@tanstack/react-query` native).

## 7.6 Utilities & Formatting
```ts
formatINR(paise: number) → "₹184.00"        // ONLY from integer paise; never float math
formatTime(iso) relative "2 min ago" | clock
formatOrderNumber("GB-BIH-10492")           // campus-tagged display
maskPhone("+919000000001") → "+91 90000 ***01"
```
Veg badge = API boolean `isVeg` (no emoji parsing). Status colors: PLACED/ACCEPTED `orangeLight`, PREPARING amber, OUT_FOR_DELIVERY brand, DELIVERED green, CANCELLED muted red.

## 7.7 Responsive & A11y Rules
- Breakpoints: `<640` phone, `640–1023` large phone/small tablet, `≥1024` 3-column desktop, `≥1440` max-w container.
- Touch targets ≥44 px on mobile; sticky bars respect `env(safe-area-inset-bottom)`.
- Focus rings visible on all interactive elements; modals trap focus; `aria-live="polite"` on cart totals and status changes; PIN inputs `inputMode="numeric"`, announced as masked.
- Contrast: `fontDark` on `canvas` ≈ 12:1; white on `orangeBase` checked ≥4.5:1 for button text.
- `prefers-reduced-motion` disables carousel auto-advance and timeline animations.

## 7.8 Figma ↔ Code Workflow
1. Tokens flow **Figma `1:423` → `packages/config/tokens.ts` → Tailwind/NativeWind** (never hand-copy hex).
2. New screen: implement from node reference (tracking = `240:3971`), attach screenshot in PR.
3. Visual regression: Playwright screenshot diff on `/app` + tracking (added Phase 7) — diffs block merge.
4. Any deviation from Figma needs a design note in the PR, not a silent drift.

→ Next: [Realtime & Notifications](08-realtime-notifications.md)

