# 02 — Getting Started (Local Development)

>plan.md Phase 0–1 environment. Target: a working dev loop in <15 minutes.

## 2.1 Prerequisites
| Tool | Version | Check | Install |
|:--|:--|:--|:--|
| Node.js | 22 LTS | `node -v` | `nvm install 22` |
| pnpm | 9+ | `pnpm -v` | `corepack enable && corepack prepare pnpm@9 --activate` |
| Docker Desktop / Engine | latest | `docker -v` | docker.com (compose v2 required) |
| Git | 2.x | `git -v` | — |
| psql (optional) | 16+ | `psql --version` | brew/apt |

## 2.2 First Run
```bash
git clone git@github.com:anurag3407/go_bite.git && cd go-bite
pnpm install                       # workspace deps (turbo)
cp .env.example .env               # see table below
pnpm infra:up                      # docker compose: postgres+postgis, redis7
docker compose -f infra/docker-compose.yml ps   # both must be "healthy"
pnpm db:migrate && pnpm db:seed    # DDL + fixtures (idempotent)
pnpm dev                           # turbo: web (:3000) + worker
curl -s http://localhost:3000/api/health/ready | jq   # {"postgres":true,"redis":true}
```

### Minimum `.env` for local work
| Var | Local value |
|:--|:--|
| `DATABASE_URL` | `postgres://gobite:gobite@localhost:5432/gobite` |
| `REDIS_URL` | `redis://localhost:6379` |
| `BETTER_AUTH_SECRET` | any 32-byte hex: `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` |
| `APP_URL` | `http://localhost:3000` |
| `OTP_PEPPER` | `openssl rand -hex 32` |
| `TEST_OTP_ENABLED` | `true` (**process refuses `true` when NODE_ENV=production**) |
| `FAST2SMS_API_KEY` / `RAZORPAY_*` | optional locally — SMS/gateway calls short-circuit to mocks |

Full list → plan.md §19; validation lives in `packages/config/env.ts` (boot fails fast with the missing var’s name).

## 2.3 Test Accounts (seeded; OTP bypass = `123456` when `TEST_OTP_ENABLED=true`)
| Phone | Role | Scope |
|:--|:--|:--|
| `+919000000001` | CUSTOMER | IIT Patna (Bihta) |
| `+919000000002` | SHOP_OWNER | Night Canteen |
| `+919000000003` | SHOP_STAFF | Night Canteen |
| `+919000000004` | CAMPUS_ADMIN | IIT Patna |
| `+919000000005` | SUPER_ADMIN | global |
| `+919000000006` | QUERY_RESOLVER | IIT Patna |
| `+919000000007` | CONFIG_CHANGER | global |

Seeded campuses: **IIT Patna (Bihta)**, **IIT Kanpur**, **NIT Patna**. 6 shops across FOOD_DINING / SALON_GROOMING / LAUNDRY / PRINT_STATIONERY with 40+ items.

## 2.4 Script Reference (root `package.json`, normative)
| Script | What it does |
|:--|:--|
| `pnpm dev` | turbo dev → `apps/web` + `apps/worker` with watch |
| `pnpm build` | production build of all packages/apps |
| `pnpm infra:up` / `pnpm infra:down` | start/stop Postgres+Redis containers (data in named volumes) |
| `pnpm db:generate` | drizzle-kit generate → new SQL in `packages/db/migrations` |
| `pnpm db:migrate` | apply pending migrations |
| `pnpm db:seed` | idempotent fixtures (safe to re-run) |
| `pnpm lint` / `pnpm typecheck` | quality gates (must be 0 errors) |
| `pnpm test` | Vitest unit (packages) |
| `pnpm test:integration` | Vitest + testcontainers (PG+Redis) |
| `pnpm test:e2e` | Playwright against dev stack |
| `pnpm k6:smoke` | load smoke (menu read, order write) |
| `pnpm openapi:diff` | fail CI if API changed without plan/types update |

## 2.5 Ports
| Port | Service |
|:--|:--|
| 3000 | Next.js web + API |
| 5432 | Postgres (local only) |
| 6379 | Redis (local only) |

## 2.6 Daily Loop & Hygiene
- Branch → implement → `pnpm lint && pnpm typecheck && pnpm test` → update docs (see [README policy](README.md)) → Conventional Commit `feat(phase-3): …` → PR.
- Reset local data: `pnpm infra:down -v && pnpm infra:up && pnpm db:migrate && pnpm db:seed`.

## 2.7 Common Local Issues
| Symptom | Cause | Fix |
|:--|:--|:--|
| Boot crash naming an env var | `env.ts` validation | add it to `.env` (names in §19 of plan.md) |
| `ECONNREFUSED 5432/6379` | infra down | `pnpm infra:up`, check `docker compose ps` |
| Migration drift error | local DB ahead/behind | `pnpm infra:down -v` then migrate+seed again |
| OTP SMS never arrives | no Fast2SMS key | use `TEST_OTP_ENABLED=true` + OTP `123456` |
| Port 3000 busy | stray dev server | `lsof -i :3000` and kill |
| Cart request → 503 | Redis down | `pnpm infra:up` (cart fails-closed by design, plan §7.8) |

→ Next: [Database](03-database.md)
