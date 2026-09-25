# 06 — API Reference (`/api/v1`)

> Contract source of truth: Zod schemas in `packages/types` (plan.md §9). OpenAPI JSON: `GET /api/v1/openapi.json`. This doc is the human-readable companion — **update it in the same PR as any contract change.**

## 6.1 Conventions
- **Base URL:** `http://localhost:3000/api/v1` (prod: `https://<domain>/api/v1`).
- **Auth:** cookie (web) or `Authorization: Bearer` (mobile) — see [05-auth-rbac](05-auth-rbac.md).
- **Envelope (every response, no exceptions):**
```jsonc
{ "success": true,  "data": { }, "error": null,
  "meta": { "requestId": "req_01J...", "timestamp": "2026-09-24T12:00:00.000Z" } }
{ "success": false, "data": null,
  "error": { "code": "SHOP_CLOSED", "message": "…", "details": { } },
  "meta": { "requestId": "req_01J...", "timestamp": "…" } }
```
- **Money:** integer `*_paise` fields only. **Pagination:** cursor (`?cursor&limit`, response `meta.nextCursor`). **Idempotency:** endpoints marked ⚠ require `Idempotency-Key: <uuid-v4>`; replays return stored body + `Idempotency-Replayed: true`.
- **Rate limits:** per-endpoint buckets in [11-security](11-security.md) §11.2 → `429 RATE_LIMITED` + `retryAfterSec`.
- **Versioning:** additive changes never break; breaking changes become `/api/v2` (ADR required).

## 6.2 Error Codes (exhaustive)
| Code | HTTP | Meaning |
|:--|:--|:--|
| `VALIDATION_ERROR` | 400 | Zod failure; `details.fieldErrors` |
| `UNAUTHORIZED` | 401 | no/invalid session |
| `FORBIDDEN_TENANT` | 403 | wrong role/tenant |
| `NOT_FOUND` | 404 | absent or cross-tenant (never leak existence) |
| `CAMPUS_REQUIRED` | 409 | no active campus |
| `SHOP_CLOSED` / `SHOP_DELIVERY_DISABLED` | 409 | shop not accepting |
| `CART_CONFLICT_SINGLE_SHOP` | 409 | cart belongs to other shop (payload = current cart) |
| `CART_EMPTY` / `CART_ITEM_UNAVAILABLE` / `MIN_ORDER_NOT_MET` | 409 | checkout validation |
| `ORDER_INVALID_STATE` | 409 | illegal state transition |
| `PIN_MISMATCH` / `PIN_LOCKED` | 422 / 423 | wrong PIN / attempts exhausted |
| `AUTH_OTP_*` | 401/423/429 | see [05-auth-rbac](05-auth-rbac.md) |
| `RATE_LIMITED` | 429 | sliding-window limiter |
| `PAYMENT_FAILED` / `PAYMENT_PENDING` | 402 / 202 | gateway outcomes |
| `DEPENDENCY_DOWN` | 503 | Redis/PG/gateway unreachable |
| `INTERNAL` | 500 | + `details.sentryId` |

## 6.3 Auth & Campus
| Method Path | Role | Request → data |
|:--|:--|:--|
| `POST /auth/otp/request` ⚠rate | public | `{phone}` → `{cooldownSec:60}` |
| `POST /auth/otp/verify` | public | `{phone,otp,campusId?}` → `{user,sessionToken,expiresAt}` |
| `POST /auth/logout` | any | → `{ok:true}` (Redis revocation) |
| `GET /auth/session` | any | → `{user:{id,name,role,activeCampusId,shopId?}}` |
| `GET /campuses` | public | `?lat&lng` → `{campuses[],resolvedCampusId}` |
| `POST /users/me/campus` | CUSTOMER | `{campusId}` → `{user}` |

```bash
curl -sX POST localhost:3000/api/v1/auth/otp/request -H 'Content-Type: application/json' -d '{"phone":"+919000000001"}'
```

## 6.4 Catalog & Cart
| Method Path | Role | Request → data |
|:--|:--|:--|
| `GET /campuses/{campusId}/shops` | public | `?serviceType&openNow` → `{shops[]}` (cache 300 s) |
| `GET /shops/{shopId}` | public | → `{shop}` incl. live `status` |
| `GET /shops/{shopId}/menu` | public | → `{categories[],items[]}` (prices in paise) |
| `GET /cart` | CUSTOMER | → `{cart:{shopId,campusId,items[],subtotalPaise}}` |
| `PUT /cart/items` | CUSTOMER | `{shopId,itemId,quantity}` → `{cart}` |
| `DELETE /cart/items/{itemId}` | CUSTOMER | → `{cart}` |
| `DELETE /cart` | CUSTOMER | → `{ok:true}` |
| `POST /cart/validate` | CUSTOMER | → `{cart,pricing,issues[]}` (checkout precondition) |

```bash
curl -sX PUT localhost:3000/api/v1/cart/items -H 'Content-Type: application/json' \
  -b cookie.txt -d '{"shopId":"…","itemId":"…","quantity":2}'
# cross-shop add → 409 {"error":{"code":"CART_CONFLICT_SINGLE_SHOP","details":{"cart":{…}}}}
```


## 6.5 Orders & Payments ⚠ (Idempotency-Key required on POSTs)
| Method Path | Role | Request → data |
|:--|:--|:--|
| `POST /orders` ⚠ | CUSTOMER | `{locationId, roomOrFlat, landmark?, dropNote?, paymentMethod}` → `201 {order}` (server-priced from `POST /cart/validate`) |
| `GET /orders` | CUSTOMER | `?status` → `{orders[]}` (cursor) |
| `GET /orders/{id}` | CUSTOMER/SHOP_* | → `{order, history[]}` (PIN only to customer) |
| `POST /orders/{id}/cancel` | CUSTOMER | `{reason}` → `{order}` (≤120 s while PLACED) |
| `POST /orders/{id}/accept` / `/reject` | SHOP_* | `{etaMin?}` / `{reason}` → `{order}` |
| `POST /orders/{id}/status` | SHOP_* | `{toStatus:"PREPARING"\|"OUT_FOR_DELIVERY"}` → `{order}` |
| `POST /orders/{id}/verify-pin` | CUSTOMER | `{pin}` → `{order.status:"DELIVERED"}` (422 `PIN_MISMATCH`) |
| `POST /payments/upi-intent` ⚠ | CUSTOMER | `{orderId}` → `{intentUrl,gatewayOrderId,expiresAt}` |
| `POST /payments/{id}/status` | CUSTOMER | → `{payment:{status}}` (rate-limited check) |
| `POST /webhooks/razorpay` | gateway | HMAC-signed; see [09-payments](09-payments.md) |

```bash
curl -sX POST localhost:3000/api/v1/orders -b cookie.txt \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen)" \
  -d '{"locationId":"…","roomOrFlat":"B-204","paymentMethod":"UPI_INTENT"}'
# 201 → data.order {id, orderNumber:"GB-BIH-10492", status:"PLACED", totalPaise:18400, history:[…]}
```

## 6.6 Shop Operations (SHOP_OWNER / SHOP_STAFF, scoped)
| Method Path | Notes |
|:--|:--|
| `GET /shop/orders` | `?status=NEW\|ACTIVE\|HISTORY` live queue; mirrors SSE `order.incoming` |
| `GET /shop/menu` / `POST /shop/menu` (upsert) / `DELETE /shop/menu/{itemId}` | price/availability edits write-through to menu cache |
| `POST /shop/status` | `{status:"OPEN"\|"CLOSED"\|"SNOOZED", until?}` → write-through + event publish; auto-snooze on order-cap breach |
| `PUT /shop/fees` | `{platformFeePaise, deliveryFeePaise, minOrderPaise}` (CONFIG_CHANGER+ override via admin) |
| `POST /support/orders/{id}/resolve-pin` | QUERY_RESOLVER only → returns current PIN; audited |

## 6.7 Support & Admin
| Method Path | Role |
|:--|:--|
| `GET/POST /support/tickets` (`{orderId?, subject, body}`) | CUSTOMER |
| `GET /support/tickets` / `PATCH /support/tickets/{id}` (`{status, resolution?}`) | QUERY_RESOLVER |
| `POST /admin/campuses`, `PATCH /admin/campuses/{id}` | SUPER_ADMIN (creates geofence; bumps campus geo version) |
| `POST /admin/shops`, `PATCH /admin/shops/{id}` (incl. `commission_pct`; seeds `PLATFORM_FEE_PCT` default) | SUPER_ADMIN / CAMPUS_ADMIN |
| `GET /admin/audit-logs` | SUPER_ADMIN |
| `GET /admin/metrics` | SUPER_ADMIN (60 s cached, [12-observability](12-observability-logging.md)) |
| `POST /devices` (`{platform, expoPushToken}`) | any authed (Phase 9-ready) |

## 6.8 Events & Health (outside the envelope where noted)
| Method Path | Response |
|:--|:--|
| `GET /events/stream?topics=` | `text/event-stream` — see [08-realtime](08-realtime-notifications.md) |
| `GET /health/live` / `GET /health/ready` | plain/JSON liveness & readiness (no envelope; used by Nginx/CI) |
| `GET /openapi.json` | machine contract (drift-checked in CI, [16-cicd](16-cicd.md)) |

## 6.9 Pagination & Replay Examples
```http
GET /api/v1/orders?limit=20&cursor=eyJpZCI6MTAxfQ
→ { "success": true, "data": { "orders": [ … ] },
     "meta": { "requestId":"req_…", "timestamp":"…", "nextCursor": "eyJpZCI6ODF9" } }

POST /api/v1/orders  Idempotency-Key: 6f1c…
→ 201 first time;  replay same key+body → 201/200 stored response + "Idempotency-Replayed: true"
   same key + DIFFERENT body → 409 VALIDATION_ERROR {code:"IDEMPOTENCY_KEY_REUSE"}
```

