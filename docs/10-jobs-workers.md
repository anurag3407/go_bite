# 10 — Background Jobs & Workers

> plan.md §7.7. Separate process `apps/worker` (BullMQ consumers on Redis). **Web request paths only enqueue — they never do slow I/O inline.**

## 10.1 Process Model
- `pnpm dev` runs web + worker via turbo; production runs a dedicated `worker` container (1+ replicas).
- One worker process registers all queue processors; each queue has its own concurrency:

| Queue | Concurrency | Job | Trigger | Payload |
|:--|:--|:--|:--|:--|
| `sms-otp` | 5 | send OTP SMS | enqueued by `/auth/otp/request` | `{ phone, otp }` |
| `notifications` | 10 | templated SMS / push | order state transitions | `{ userId, template, vars }` |
| `order-timeout` | 2 | auto-cancel unaccepted orders | delayed job at order placement (`delay: 10min`) | `{ orderId }` |
| `snooze-wake` | 1 | unsnooze shop | delayed at snooze | `{ shopId }` |
| `payment-reconcile` | 1 | poll PENDING payments | repeatable cron `*/5 * * * *` | `{}` |
| `geo-refresh` | 1 | rebuild `gb:geo:campuses` | repeatable `0 * * * *` + on campus CRUD | `{}` |
| `metrics-rollup` | 1 | persist Redis counters → daily rows | repeatable `30 23 * * *` | `{ day }` |

## 10.2 Worker Skeleton (apps/worker/src/index.ts)
```ts
const queues = { smsOtp, notifications, orderTimeout, snoozeWake, paymentReconcile, geoRefresh, metricsRollup };

orderTimeout.process(async ({ data }) => {
  const updated = await orderService.expireIfStillPlaced(data.orderId); // atomic status check in SQL
  if (updated) await refundService.refundIfPaid(updated.id);            // idempotent
});

snoozeWake.process(async ({ data }) => {
  await shopService.clearSnooze(data.shopId);   // DB + write-through to gb:shop:{id}:status + publish event
});

process.on("SIGTERM", async () => { await closeAllWorkers(); await redis.quit(); process.exit(0); });
```

## 10.3 Job Rules
1. **Idempotency first** — every handler must be safe to run twice (delayed retries exist). Status checks are conditional SQL (`WHERE status='PLACED'`), not read-then-write.
2. **Retries:** SMS 3×, notifications 5×, reconcile 3×; exponential backoff; attempts exhausted → **DLQ** (`failed` set) → Sentry alert `queue.dlq`.
3. **Timeouts:** every processor wrapped with a 30 s job-level timeout.
4. **Ordering:** `order-timeout` job is cancelled on accept/reject (`job.remove()` by stored `jobId` on the order row — column `timeout_job_id`).
5. Logging: every job logs `queue`, `jobId`, `durationMs`, `attempt` with the correlation `requestId` of its enqueuer when available.

## 10.4 Enqueueing (packages/core)
```ts
await queues.orderTimeout.add("expire", { orderId }, { delay: 10 * 60_000, jobId: `timeout:${orderId}` });
await queues.notifications.add("send", { userId, template: "ORDER_ACCEPTED", vars: { orderNumber, eta } },
  { attempts: 5, backoff: { type: "exponential", base: 2000 } });
// cron-style (worker bootstrap only):
await queues.paymentReconcile.add("poll", {}, { repeat: { pattern: "*/5 * * * *" } });
```

## 10.5 Operations
| Task | How |
|:--|:--|
| Inspect queues (local) | Bull Board mounted at `/dev/queues` (dev-only route, blocked by env assertion) |
| Check lag in prod | Redis: `bull:payment-reconcile:wait` list length; alert if > 100 or oldest > 5 min |
| Retry a stuck DLQ job | admin script `pnpm queue:retry <queue>` (SUPER_ADMIN audited) |
| Graceful deploy | SIGTERM → finish in-flight jobs (≤ 30 s) → container exits → new container |
| Full re-process after outage | reconcile/replay scripts re-enqueue from Postgres (`notification_logs` QUEUED, PENDING payments) — never from Redis |

→ Next: [Security](11-security.md)
