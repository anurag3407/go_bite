# 02 — Ops, Infra and Reliability Gap Analysis (Single-VPS Production)

Scope: plan.md (S7 Redis, S16 Observability, S18 DevOps) + docs 10, 12, 14, 16, 17.
Lens: SRE on a single VPS at lunch-rush traffic. Date: 2026-09-24. Task: task_0002.
Severity: P0 = launch-blocker, P1 = fix in first month, P2 = backlog.

Counts: 7 x P0 / 6 x P1 / 4 x P2 = 17 gaps.

| # | Gap | Sev |
|---|---|---|
| G-01 | Single VPS/PG/Redis SPOF, no standby | P0 |
| G-02 | deploy.sh race + broken migration rollback | P0 |
| G-03 | BullMQ delayed/repeat jobs live only in Redis | P0 |
| G-04 | allkeys-lru evicts correctness keys | P0 |
| G-05 | Disk-full co-located blast radius, no paging monitor | P0 |
| G-06 | Same-disk pg_dump, no PITR, lossy unproven restore | P0 |
| G-07 | Single-channel / single-human alerting | P0 |
| G-08 | Certbot renewal silent failure + HSTS hard-down | P1 |
| G-09 | Single Nginx, single proxy_pass, global 3600s SSE timeout | P1 |
| G-10 | Docker images built on prod VPS steal CPU | P1 |
| G-11 | Sentry quota exhaustion blinds incidents | P1 |
| G-12 | Secret rotation without orchestration | P1 |
| G-13 | No NTP / clock-skew story | P1 |
| G-14 | No staging parity | P2 |
| G-15 | Unbounded logs, no rotation or search | P2 |
| G-16 | Provider-region + DNS SPOF | P2 |
| G-17 | Worker scale-out + 30s drain truncation | P2 |

---
## P0 — Launch-blockers

### G-01 — Single VPS / single PG / single Redis = total-outage SPOF
Evidence: 14 S14.1 sizes launch as one 4vCPU/8GB/160GB VPS; S14.3 runs web + worker + postgres + redis as containers on that host with local pgdata/redisdata volumes. S14.8 step 5 defers managed DB to later. plan S18.3 confirms prod = self-hosted VPS Postgres 16 + Redis 7. No standby host, PG replica, Redis replica/Sentinel, or multi-AZ anywhere.

Failure scenario: 12:35 lunch rush, 200 RPS menu reads + 20 RPS order placements (plan S17.1 load targets). Hypervisor reboots the host, NVMe bad block, or OOM-killer takes postgres. web, worker, PG, Redis die together. Nginx LB is on the same box (14 S14.4) so there is nothing to drain to. Recovery = new VPS + pg_restore of the 02:00 dump -> lose every order/payment/audit row since 02:00 (RPO 10-22h) plus all sessions/carts. RTO in hours while the campus walks to the canteen and never comes back.

Fix: declare RPO <= 24h / RTO <= 2h now. Before campus 2: (a) managed Postgres with WAL backups, or minimum a cheap second VPS receiving hourly `pg_dump -Fc | rclone rcat s3:gobite-backups/pg/...`; (b) DNS TTL 300s + A-record flip runbook; keep DNS on Cloudflare, not the VPS vendor. This week: hourly dumps off-host + weekly restore rehearsal recorded in docs/18 until RTO < 30min is measured.
