# 18 — Glossary & Changelog

## 18.1 Glossary
| Term | Definition |
|:--|:--|
| **Campus** | Tenancy root (`campus_id`); isolates shops, orders, addresses, banners. Geofenced by center+radius or PostGIS polygon. |
| **Self-delivery** | Model where shop staff deliver — no platform riders; completion gated by student's 4-digit PIN. |
| **Delivery PIN** | 4-digit code shown only to the student; required by `verify-pin` to reach `DELIVERED` (ADR-006). |
| **Envelope** | The `{success, data, error, meta}` wrapper on every API response. |
| **`ActorContext`** | `{userId, role, campusId, shopId}` built per request; the only identity services consume. |
| **Idempotency-Key** | Client-supplied UUID making a mutation replay-safe; stored in Redis 24 h + DB unique column. |
| **Write-through status** | Shop open/snooze mutations update Redis hash `gb:shop:{id}:status` in the same call as the DB write. |
| **Versioned cache** | Cache keys embed `v{ver}`; invalidation = `INCR` version, never key deletion scans. |
| **SSE** | Server-Sent Events; web realtime transport over `/api/v1/events/stream`. |
| **Event envelope** | Frozen `{id, topic, type, orderId, status, occurredAt}` payload shared by SSE and future push. |
| **Paise** | Integer unit used at all API boundaries (₹1 = 100 paise; ADR-005). |
| **`order-timeout`** | BullMQ delayed job auto-cancelling `PLACED` orders not accepted within 10 min. |
| **DLQ** | Dead-letter queue (BullMQ `failed` set) — terminal for retried jobs; pages on arrival. |
| **RLS** | Row-Level Security — Postgres second-layer tenancy guard. |
| **App shifting** | This project's term for converting the web product into the React Native app (Phase 9). |
| **DoD** | Definition of Done — the phase checklist in plan.md §21 that gates progress. |
| **ADR** | Architecture Decision Record — plan.md §22; required for any contract/stack deviation. |

## 18.2 Documentation Changelog

> **Rule (README §0.3):** every PR touching `docs/` **must append a row here.** Newest first. Columns: date · PR · docs touched · summary.

| Date | PR | Doc(s) | Summary |
|:--|:--|:--|:--|
| 2026-09-24 | (initial v2 docs set) | all | Created full documentation set: index + maintenance policy, architecture, getting started, database, redis, auth/RBAC, API reference, components, realtime, payments, jobs, security, observability, testing, VPS deployment, RN migration, CI/CD, runbooks, glossary. |
| — | — | — | *append your row above this line* |

### How to add an entry
```markdown
| 2026-10-01 | #123 | 06-api-reference.md, 09-payments.md | Added POST /payments/:id/status endpoint (UPI refresh) |
```

---

**End of documentation set.** Binding contract = `/plan.md`. Index & update policy = [README.md](README.md).
