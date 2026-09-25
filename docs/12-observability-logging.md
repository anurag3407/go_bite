# 12 — Observability & Logging

> plan.md §16. Three pillars: **structured logs (pino)**, **errors (Sentry)**, **metrics (Redis counters → daily rollups)** — plus health endpoints for orchestration.

## 12.1 Request Correlation
- Every request gets `requestId` (`req_<ulid>`), stored in `AsyncLocalStorage`, echoed in response `meta.requestId` and every log line, and propagated into enqueued jobs (`job.data.requestId`).
- Frontend surfaces `requestId` in error toasts → students quote it to QUERY_RESOLVER → logs grep instantly.

## 12.2 Log Format (pino JSON; dev = pretty transport)
Level comes from `LOG_LEVEL` (plan §19; default `info` in prod, `debug` locally); transport pretty-printing is dev-only.
```jsonc
{ "level": 30, "time": 1727092800000, "requestId": "req_01J...", "userId": "u_…",
  "campusId": "…", "route": "POST /api/v1/orders", "status": 201, "durationMs": 182,
  "msg": "request_completed" }
```
| Level | Use |
|:--|:--|
| DEBUG | dev-only verbose (never enabled in prod) |
| INFO | requests, job lifecycle, webhook events, state transitions |
| WARN | redis.cache_bypass, tenant_probe, queue lag, slow query |
| ERROR | unhandled exceptions (always also → Sentry with same requestId) |

**Redaction (normative):** `req.headers.authorization`, `req.headers.cookie`, `body.otp`, `body.pin`, `*.delivery_pin`, `*.phone` (→ `sha256[:10]`), `*.upi_vpa`, `*.transaction_ref`.

## 12.3 Sentry
- Init reads `SENTRY_DSN` (plan §19); `@sentry/nextjs` (web + API) and worker init share the same project; Phase 9 adds `@sentry/react-native`.
- 100 % error sampling, 10 % transaction sampling; release tagging via `SENTRY_RELEASE` (git SHA from CI).
- Alert rules: any `INTERNAL` error rate > 5/min for 10 min; new issue on `main`; `queue.dlq`; `payment.reconcile_stuck`.
- User context attached: `{ id, role, campusId }` (phone never sent).

## 12.4 Metrics (Redis counters → `metrics-rollup` → daily rows)
| Counter | Meaning | Healthy signal |
|:--|:--|:--|
| `orders.placed / delivered / cancelled` | funnel | cancel rate < 10 % |
| `payments.failed` | gateway trouble | spikes → webhook/key check |
| `otp.sent / otp.locked` | auth abuse | locked ratio < 1 % |
| `webhook.replayed` | gateway retries | persistent > 0 → our 200s failing |
| `api.4xx / api.5xx` | contract/health | 5xx < 0.5 % |

Exposed to admin dashboard via `GET /admin/metrics` (SUPER_ADMIN; cached 60 s).

## 12.5 Health Endpoints
| Endpoint | Checks | Consumers |
|:--|:--|:--|
| `GET /api/health/live` | process alive | container `HEALTHCHECK` |
| `GET /api/health/ready` | `SELECT 1` + Redis `PING` → `{postgres, redis}` | Nginx upstream, deploy smoke test, uptime monitor |

Failure of `/ready` (503) is the drain signal — deploy scripts and LBs use it exclusively.

## 12.6 What To Watch Daily (VPS dashboard checklist)
| Signal | Source | Threshold → action |
|:--|:--|:--|
| 5xx rate | Nginx access log / Sentry | > 0.5 % → see [17-runbooks](17-troubleshooting-runbooks.md) |
| Redis memory/evictions | `INFO memory` | evicted > 0 → investigate `allkeys-lru` victims |
| Queue lag | BullMQ lists | > 100 jobs → scale worker |
| Disk / pg_dump age | cron log | missed backup → restore drill |
| Cert expiry | `certbot certificates` | < 15 d → renew check |

→ Next: [Testing](13-testing.md)
