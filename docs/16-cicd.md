# 16 — CI/CD

> plan.md §18.4. GitHub Actions. Every PR must be green **and** update docs (see [README policy](README.md)).

## 16.1 Workflows
| File | Trigger | Jobs (in order) |
|:--|:--|:--|
| `ci.yml` | every PR + push to `main` | ① `lint` (ESLint flat + boundaries) ② `typecheck` (tsc --noEmit all projects) ③ `unit` (Vitest packages) ④ `build` (turbo build web+worker) ⑤ `integration` (testcontainers PG+PostGIS & Redis services) ⑥ `openapi:diff` (contract vs `main`) ⑦ `docs-link-check` |
| `e2e.yml` | push to `main` + nightly | compose up → migrate+seed → Playwright → teardown |
| `deploy.yml` | tag `v*` or manual dispatch | build → (optional) push GHCR → SSH `infra/deploy.sh` → smoke `/api/health/ready` → Sentry release → notify |

## 16.2 Skeleton (`ci.yml` excerpt)
```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test -- --coverage
      - run: pnpm build
      - run: pnpm openapi:diff
      - run: pnpm docs:check          # links, fences, env-var names vs packages/config
  integration:
    runs-on: ubuntu-latest
    needs: quality
    services: {}                       # testcontainers spins PG+Redis itself
    steps: [/* checkout, install, pnpm test:integration */]
```

## 16.3 Secrets (GitHub Environments: `preview`, `staging`, `production`)
| Secret | Used by |
|:--|:--|
| `VPS_HOST`, `VPS_SSH_KEY`, `VPS_USER` | deploy.yml SSH |
| `SENTRY_AUTH_TOKEN`, `SENTRY_DSN` | source maps + release |
| `EXPO_ACCESS_TOKEN` | Phase 9 EAS builds of the RN app |
| `RAZORPAY_*`, `FAST2SMS_API_KEY` | staging deploy env sync (never in repo) |
Deployment secrets live **on the VPS** (`/etc/gobite/*.env`); CI only triggers the script over SSH.

## 16.4 Release & Rollback Flow
1. Merge to `main` → CI green required (branch protection: 1 approving review + all checks).
2. Tag `v1.4.0` (Conventional Commits → changelog) → `deploy.yml` runs `deploy.sh`.
3. Smoke fails → script auto-rolls containers to previous image/SHA → job fails → Sentry alert.
4. Bad release, needs code rollback: re-run `deploy.yml` at previous tag (migrations are additive / N-1 compatible).
5. Every deploy posts Sentry release + git SHA so errors map to code.

## 16.5 Pipeline Invariants
- No direct commits to `main` (PR only).
- `pnpm openapi:diff` failing = contract changed → update `plan.md` §9 + [06-api-reference](06-api-reference.md) in the **same PR**.
- Docker build cache kept via `cache-from/to: type=gha`.
- Runner never holds production secrets for PRs from forks (environment approval gate on `production`).

→ Next: [Troubleshooting & Runbooks](17-troubleshooting-runbooks.md)
