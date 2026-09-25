# 17 — Troubleshooting & Runbooks

> Keep this cold and factual: symptom → cause → command. Every incident resolved via a playbook gets an entry in [18-changelog](18-glossary-and-changelog.md).

## 17.1 Error-Code Decoder (client-facing)
| You see | Meaning | What to do |
|:--|:--|:--|
| `VALIDATION_ERROR` | request body failed schema | check `error.details.fieldErrors`; contract in [06-api-reference](06-api-reference.md) |
| `UNAUTHORIZED` (401) | session missing/expired/revoked | re-login; RN: clear secure-store token |
| `FORBIDDEN_TENANT` (403) | right login, wrong role/scope | verify seeded role; check `shopId`/`campusId` on session |
| `RATE_LIMITED` (429) | limiter fired | honor `retryAfterSec`; see [11-security](11-security.md) matrix |
| `AUTH_OTP_COOLDOWN` | <60 s since last OTP | wait shown seconds |
| `AUTH_OTP_LOCKED` (423) | >4 OTPs in an hour | wait 1 h (dev: `DEL gb:otp:lockout:{phone}`) |
| `CART_CONFLICT_SINGLE_SHOP` | cart held another shop's items | UI shows Replace? → `DELETE /cart` then add |
| `SHOP_CLOSED` | shop closed/snoozed | show closed state; check `gb:shop:{id}:status` |
| `ORDER_INVALID_STATE` | illegal transition attempt | inspect `history[]`; state machine in plan §10.1 |
| `PIN_MISMATCH` / `PIN_LOCKED` | wrong PIN / 5 failed | customer re-shows PIN; locked → QUERY_RESOLVER override |
| `PAYMENT_PENDING` (202) | capture not confirmed yet | wait for webhook/reconcile (≤5 min); "Check status" button |
| `DEPENDENCY_DOWN` (503) | Redis/PG outage | see playbooks below |
| `INTERNAL` (500) | unhandled | grab `error.details.sentryId` → Sentry issue |

## 17.2 Production Playbooks

### PB-1: 5xx spike after deploy (rollback <2 min)
```bash
ssh deploy@vps 'cd /home/deploy/go-bite && git fetch && ./infra/deploy.sh'   # CI re-runs at last green tag, or:
ssh deploy@vps 'cd /home/deploy/go-bite && git checkout vX.Y.Z --detach && \
  docker compose -f infra/docker-compose.prod.yml up -d --build --no-deps web worker'
curl -fsS https://gobite.in/api/health/ready
```
Then: Sentry → offending release → fix forward with patch release. Migrations stay (additive).

### PB-2: Redis down / flapping
Symptoms: 503 `DEPENDENCY_DOWN` on cart/auth, SSE silent, queue lag grows.
```bash
docker compose -f infra/docker-compose.prod.yml ps redis
docker compose logs --tail 200 redis
docker compose restart redis                       # AOF replays; sessions/cart TTLs intact
docker stats --no-stream | grep redis              # OOM? raise --maxmemory or find runaway keys
curl -fsS http://127.0.0.1:3000/api/health/ready   # expect {"postgres":true,"redis":true}
```
If AOF corrupt: stop → `mv appendonlydir appendonlydir.bak` → start (hot state rebuilds; verify orders flow — Postgres was never affected) → note in changelog.

### PB-3: Postgres down / slow
```bash
docker compose -f infra/docker-compose.prod.yml ps postgres
docker compose logs --tail 200 postgres
docker exec -it gobite-postgres-1 psql -U gobite -c "select count(*) from pg_stat_activity;"
# slow queries:
psql -U gobite -c "select pid, now()-query_start age, left(query,80) from pg_stat_activity where state='active' order by age desc limit 10;"
df -h            # disk full is the #1 cause → clean logs/images: docker system prune -af
```
Never `docker compose down -v` on prod (deletes volumes/backups path). Drain traffic: `/ready` already fails → LB stops sending; leave web up (it will recover).

### PB-4: Stuck BullMQ queue (jobs not draining)
```bash
docker compose logs --tail 300 worker | grep -E "error|dlq"
docker compose restart worker
# inspect: redis-cli LLEN bull:notifications:wait
```
If jobs died mid-flight: re-drive from Postgres truth — `notification_logs WHERE status='QUEUED'`, `payments WHERE status='PENDING'` (reconcile cron self-heals the latter). Workers are idempotent by rule ([10-jobs-workers](10-jobs-workers.md) §10.3).

### PB-5: SSL expiry / renewal failure
```bash
sudo certbot certificates
sudo certbot renew --dry-run
sudo systemctl reload nginx
```

### PB-6: Restore Postgres from backup
```bash
# pick dump: ls /var/backups/gobite/gobite_*.dump
docker compose -f infra/docker-compose.prod.yml stop web worker     # stop writes
docker exec -i gobite-postgres-1 pg_restore -U gobite -d gobite --clean --if-exists < gobite_2026-09-24.dump
docker compose -f infra/docker-compose.prod.yml start web worker
curl -fsS https://gobite.in/api/health/ready
# Redis: leave empty — sessions force re-login; carts rebuild; warm caches refill in ≤5 min
```
Record RTO achieved in [18-changelog](18-glossary-and-changelog.md) (target: <30 min).

### PB-7: OTP SMS not delivering (prod)
1. `notification_logs WHERE template='OTP' AND status='FAILED'` → provider error.
2. Check DLT template approval + sender ID in Fast2SMS dashboard.
3. Worker up? `docker compose logs worker | grep sms-otp`.
4. Temporary mitigation: raise cooldown instead of lowering (never disable limits).

### PB-8: Suspected tenant leak / fraud attempt
1. Note `requestId` from error toast → grep logs → `security.tenant_probe` entries.
2. Preserve `audit_logs` rows; export to incident note.
3. Lock involved accounts (`users.is_active=false`), rotate session (DEL keys), file ADR/log entry; escalate to SUPER_ADMIN desk.

## 17.3 Local Dev Quick Fixes
| Symptom | Fix |
|:--|:--|
| boot crash naming env var | add to `.env` (names: plan §19) |
| `ECONNREFUSED 5432/6379` | `pnpm infra:up` |
| migration drift | `pnpm infra:down -v` → migrate+seed |
| port 3000 busy | `lsof -i :3000` kill; or change PORT |
| SSE works locally, not behind Nginx | `proxy_read_timeout 3600s` missing (see [14](14-deployment-vps.md) §14.4) |

→ Next: [Glossary & Changelog](18-glossary-and-changelog.md)
