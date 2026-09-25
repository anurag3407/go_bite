# 14 — Deployment on a VPS

> plan.md §18. Target: **single VPS, Docker Compose, Nginx, Let's Encrypt**, zero-downtime deploys, nightly backups. Designed so horizontal scale-out is a config change, not a rewrite.

## 14.1 Sizing & Base Setup
| Stage | VPS spec | Est. cost |
|:--|:--|:--|
| Launch (single campus) | 4 vCPU / 8 GB / 160 GB NVMe, Ubuntu 24.04 LTS | ₹800–1600/mo (Hetzner/DigitalOcean) |
| Multi-campus | 8 vCPU / 16 GB, add managed DB later | — |

```bash
# as root, once
adduser deploy && usermod -aG sudo,docker deploy
apt update && apt -y upgrade
apt -y install docker.io docker-compose-v2 nginx certbot python3-certbot-nginx git ufw
ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable
# Postgres/Redis ports are NEVER opened (compose binds them to internal network only)
```

## 14.2 Repository & Secrets Layout on VPS
```bash
sudo -u deploy git clone git@github.com:anurag3407/go_bite.git /home/deploy/go-bite
# secrets live OUTSIDE the repo:
/etc/gobite/prod.env        # mode 600, root:deploy — all vars from plan.md §19
/etc/gobite/pg.env          # POSTGRES_PASSWORD etc.
```
`docker-compose.prod.yml` references both via `env_file`. Images are built **on the VPS** in this setup (simplest); CI can pre-build to GHCR later without changing compose semantics.

## 14.3 Production Compose (shape — lives at `infra/docker-compose.prod.yml`)
```yaml
services:
  web:
    build: { context: ., dockerfile: apps/web/Dockerfile }
    env_file: [/etc/gobite/prod.env]
    depends_on: { postgres: { condition: service_healthy }, redis: { condition: service_healthy } }
    deploy: { replicas: 1 }          # scale with --scale web=2 behind nginx
    healthcheck: { test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health/live"], interval: 30s }
  worker:
    build: { context: ., dockerfile: apps/worker/Dockerfile }
    env_file: [/etc/gobite/prod.env]
    restart: unless-stopped
  postgres:
    image: postgis/postgis:16-3.4
    env_file: [/etc/gobite/pg.env]
    volumes: [pgdata:/var/lib/postgresql/data]
    # ports: NOT exposed — internal network only
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U gobite"], interval: 10s }
  redis:
    image: redis:7-alpine
    command: ["redis-server","--appendonly","yes","--appendfsync","everysec","--maxmemory","2gb","--maxmemory-policy","allkeys-lru"]
    volumes: [redisdata:/data]
volumes: { pgdata: {}, redisdata: {} }
```
`APP_URL`/`BETTER_AUTH_URL` = `https://gobite.in`; `REDIS_URL`/`DATABASE_URL` use compose DNS (`redis://redis:6379`, `postgres://…@postgres:5432/…`).


## 14.4 Nginx Reverse Proxy + TLS
```nginx
# /etc/nginx/sites-available/gobite
map $http_upgrade $connection_upgrade { default upgrade; '' close; }

server {
  listen 80; server_name gobite.in www.gobite.in;
  location /.well-known/acme-challenge/ { root /var/www/certbot; }
  location / { return 301 https://$host$request_uri; }
}
server {
  listen 443 ssl http2; server_name gobite.in;
  ssl_certificate     /etc/letsencrypt/live/gobite.in/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/gobite.in/privkey.pem;
  add_header Strict-Transport-Security "max-age=31536000; preload" always;

  client_max_body_size 12m;                      # uploads ≤10MB
  proxy_http_version 1.1;
  proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto https;
  proxy_read_timeout 3600s;                      # ← SSE long-lived connections

  location / {
    proxy_pass http://127.0.0.1:3000;            # compose publishes web on loopback only
    proxy_set_header Connection "";              # keep-alive upstream
  }
  location = /api/health/ready {                 # short timeout for LB semantics
    proxy_pass http://127.0.0.1:3000; proxy_read_timeout 5s;
  }
}
server {                                          # optional CDN/media origin later
  listen 443 ssl; server_name cdn.gobite.in;
  ssl_certificate     /etc/letsencrypt/live/gobite.in/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/gobite.in/privkey.pem;
}
```
```bash
sudo ln -s /etc/nginx/sites-available/gobite /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d gobite.in -d www.gobite.in --redirect --hsts
echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'" | crontab -
# media files (shop images, print docs): store on VPS volume now; move to R2/S3 + cdn.gobite.in when traffic grows
```

## 14.5 Zero-Downtime Deploy Script (`infra/deploy.sh` — invoked by CI or manually)
```bash
#!/usr/bin/env bash
set -euo pipefail
cd /home/deploy/go-bite
PREV_SHA=$(git rev-parse HEAD)
git fetch --all --prune && git checkout "origin/main" --detach

pnpm install --frozen-lockfile
pnpm db:migrate                                   # additive migrations only (plan §3.6)
docker compose -f infra/docker-compose.prod.yml build web worker
docker compose -f infra/docker-compose.prod.yml up -d --no-deps --remove-orphans web worker

for i in $(seq 1 30); do
  curl -fsS http://127.0.0.1:3000/api/health/ready | grep -q '"postgres":true' && \
  curl -fsS http://127.0.0.1:3000/api/health/ready | grep -q '"redis":true'   && OK=1 && break
  sleep 2
done
[ "${OK:-}" = "1" ] || { echo "SMOKE FAILED → rolling back"; git checkout "$PREV_SHA"; \
  docker compose -f infra/docker-compose.prod.yml up -d --no-deps web worker; exit 1; }
echo "deployed $(git rev-parse --short HEAD)"
```
**Rollback:** re-run script at previous SHA (migrations must stay backward-compatible with N-1 code — additive rule). DB restore rollback → [17-runbooks](17-troubleshooting-runbooks.md).

## 14.6 Backups
```bash
# /etc/cron.d/gobite-backup — 02:00 IST daily, 30-day retention
0 2 * * * deploy /usr/bin/pg_dump -Fc -h 127.0.0.1 -U gobite gobite > /var/backups/gobite/gobite_$(date +%F).dump
5 2 * * * deploy /usr/bin/rclone copy /var/backups/gobite s3:gobite-backups/pg --retention-daily 30
10 2 * * * deploy tar czf - -C /var/lib/docker/volumes/gobite_redisdata _ | gzip > /var/backups/gobite/redis_$(date +%F).tgz
```
- Redis AOF is **not** a backup of truth — Postgres dump is the restore source; Redis rebuilds warm on boot.
- **Monthly restore drill** into a scratch container; measure time; record in [18-changelog](18-glossary-and-changelog.md).

## 14.7 Monitoring on the VPS
| Tool | Use |
|:--|:--|
| `docker stats`, `htop`, `df -h` | quick health |
| `journalctl -u docker`, Nginx access/error logs, pino JSON logs (`docker compose logs -f web`) | digging |
| healthchecks.io ping from cron (backup) + `/ready` probe every 60 s | outage alerts |
| Sentry (app errors) + Uptime Kuma (optional, self-hosted) | errors & uptime |

## 14.8 Scaling Path (do in this order)
1. **Vertical** — bump VPS RAM/CPU (5-minute change).
2. **Read cache pressure** — raise Redis maxmemory; add CDN for images.
3. **Horizontal web** — `--scale web=2` + Nginx `upstream { server 127.0.0.1:3000; server 127.0.0.1:3001; }` (stateless by design — plan §1.5).
4. **Worker isolation** — dedicated small VPS for `worker` or scale replicas.
5. **Managed data tier** — Managed Postgres (+ read replica) and managed Redis; flip `DATABASE_URL`/`REDIS_URL`; keep same versions.
6. **Media offload** — R2/S3 + `cdn.gobite.in`.
7. Multi-region is out of scope until proven need (ADR).

## 14.9 First-Launch Checklist
- [ ] DNS A record → VPS; UFW allows only 22/80/443
- [ ] `/etc/gobite/*.env` present, mode 600, `TEST_OTP_ENABLED` **absent/false**
- [ ] `docker compose up -d` healthy; `curl /api/health/ready` both true
- [ ] Migrations applied; seeds for real campuses run once (`pnpm db:seed`)
- [ ] Certbot issued + auto-renew cron
- [ ] Backup cron + offsite copy verified by restoring a dump
- [ ] Razorpay live webhook URL registered + signature verified
- [ ] Fast2SMS DLT templates approved
- [ ] Sentry DSN receiving; healthchecks.io alert configured
- [ ] `deploy.sh` run twice successfully (proves rollback path)

→ Next: [React Native Migration](15-react-native-migration.md)

