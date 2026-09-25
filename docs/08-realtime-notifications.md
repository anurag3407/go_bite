# 08 — Realtime & Notifications

> plan.md §11–§12. Web realtime = **SSE over Redis Pub/Sub**; messaging = **Fast2SMS via BullMQ**; mobile push = **Expo Push behind `NotificationProvider` (Phase 9)**.

## 8.1 SSE Endpoint
```
GET /api/v1/events/stream?topics=order:{orderId},shop:{shopId}:orders
Accept: text/event-stream        (cookie or Bearer auth required)
```
- Server subscribes (`redisSub`) to each requested channel, validates authorization, forwards events.
- Heartbeat comment `: ping` every 25 s; client auto-reconnects with `Last-Event-ID`; server replays from `order_status_history` if the client fell behind on an order topic.
- Transport-independent **event envelope is frozen** (RN will consume the same payloads):

```jsonc
{
  "id": "evt_01J...", "topic": "order:9f1c...",
  "type": "order.status_changed",   // order.placed|accepted|preparing|out_for_delivery|delivered|cancelled
  "orderId": "9f1c...", "orderNumber": "GB-BIH-10492",
  "status": "PREPARING", "occurredAt": "2026-09-24T12:01:00.000Z"
}
```
Additional event types: `order.incoming` (shop feed → audio bell), `campus.banner` (admin announcements), `shop.status_changed`.

## 8.2 Topic Authorization
| Topic | Subscriber must be |
|:--|:--|
| `order:{orderId}` | order's customer **or** staff of the order's shop |
| `shop:{shopId}:orders` | SHOP_OWNER/STAFF with `session.shopId == shopId` |
| `campus:{campusId}` | session with `activeCampusId == campusId` |

Unauthorized topic → silently dropped + WARN log (never leak existence).

## 8.3 Web Client Pattern
```ts
// apps/web/lib/use-event-stream.ts — wraps EventSource with auto-reconnect
export function useEventStream(topics: string[], onEvent: (e: GoBiteEvent) => void) { /* … */ }

// tracking screen
useEventStream([`order:${orderId}`], (e) =>
  queryClient.setQueryData(orderKey(e.orderId), (old) => applyEvent(old, e)));
```
- Screens subscribe narrowly (one order, one shop) — never open a stream with `*`.
- **Fallback:** if SSE errors 3× within 30 s, switch to 15 s polling of `GET /orders/{id}` (same `applyEvent` logic via `history[]`).
- Shop dashboard additionally unlocks audio on first user gesture (browser autoplay policy) and plays the bell on `order.incoming`.

## 8.4 Publish Side (packages/core — after transaction commit ONLY)
```ts
await EventBus.publish(keys.events.order(order.id), orderPlacedEvent);     // customer + shop channels
await EventBus.publish(keys.events.shop(shop.id), { type: "order.incoming", … });
```
If Redis Pub/Sub is down: commit still stands; notification falls back to the `notifications` queue; SSE clients poll (plan §7.8). `order_status_history` remains the replay source.

## 8.5 NotificationProvider (the RN seam)
SMS sending uses `FAST2SMS_API_KEY` + `FAST2SMS_SENDER_ID` (plan §19, DLT-registered sender).
```ts
export interface NotificationProvider {
  sendSms(phone: string, template: string, vars: Record<string, string>): Promise<void>;
  sendPush(userId: string, template: string, vars: Record<string, string>): Promise<void>;
}
```
| Phase | SMS impl | Push impl |
|:--|:--|:--|
| 1–8 | `Fast2SmsProvider` (BullMQ `sms-otp` / `notifications` queues) | no-op stub (logs) |
| 9 (RN) | unchanged | `ExpoPushProvider` reads active `device_tokens` |

## 8.6 SMS Templates (DLT variables → template IDs in env)
| Template | Trigger | Vars |
|:--|:--|:--|
| `OTP` | `/auth/otp/request` | `{otp}` (5-min expiry, never logged) |
| `ORDER_ACCEPTED` | status → ACCEPTED | `{orderNumber}`, `{eta}` |
| `OUT_FOR_DELIVERY` | status → OUT_FOR_DELIVERY | `{orderNumber}`, `{pinHint:"show PIN in app"}` — **PIN never in SMS** |
| `ORDER_CANCELLED` | reject/timeout | `{orderNumber}`, `{reason}` |
| `REFUND_ISSUED` | resolver action | `{orderNumber}`, `{amount}` |

Every send → `notification_logs` row (`QUEUED → SENT/FAILED`); provider failures retry 3× (SMS) / 5× (push) then DLQ → Sentry alert.

## 8.7 Future Push (Phase 9, contract ready now)
Client registers via `POST /devices {platform, expoPushToken}` → `device_tokens`. Order events enqueue push jobs; `ExpoPushProvider` sends through Expo Push API. No changes to core event logic.

→ Next: [Payments](09-payments.md)
