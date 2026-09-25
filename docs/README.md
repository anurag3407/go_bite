# Go-Bite — Documentation

> Master documentation set for the **Go-Bite multi-campus hyperlocal delivery & concierge platform**.
> **The binding engineering contract is `/plan.md`.** This `docs/` set explains and operationalizes it. If docs and plan.md ever disagree, plan.md wins until an ADR resolves the conflict.

---

## Index

| # | Document | What it covers | Update this doc when… |
|--:|:--|:--|:--|
| 0 | [Documentation Maintenance Policy](#0-documentation-maintenance-policy--mandatory) | Rules for keeping docs truthful | — |
| 1 | [System Architecture](01-architecture.md) | Monorepo, layers, request lifecycle, state ownership, environments | topology, packages, or layering rules change |
| 2 | [Getting Started (Local Dev)](02-getting-started.md) | Prerequisites, env setup, first run, scripts, test accounts | scripts, env vars, or seeds change |
| 3 | [Database](03-database.md) | Every table, enums, indexes, migrations workflow, RLS, seeds | any migration / DDL change |
| 4 | [Redis](04-redis.md) | Key schema, cache, cart, rate limits, locks, Pub/Sub, failure modes | a Redis key, TTL, pattern, or queue changes |
| 5 | [Auth & RBAC](05-auth-rbac.md) | OTP flow, sessions, dual credentials, roles, tenant isolation | Better Auth config, roles, or session logic change |
| 6 | [API Reference](06-api-reference.md) | Every `/api/v1` endpoint: payloads, errors, curl examples | any API contract change (**same PR**) |
| 7 | [Frontend Components & Design System](07-frontend-components.md) | Tokens, component inventory, layouts, state, query patterns | component, API-field, or design-token changes |
| 8 | [Realtime & Notifications](08-realtime-notifications.md) | SSE, event schema, SMS/push, templates | event schema, channels, or providers change |
| 9 | [Payments](09-payments.md) | UPI intent, webhooks, refunds, reconciliation, money rules | gateway integration changes |
| 10 | [Background Jobs & Workers](10-jobs-workers.md) | BullMQ queues, payloads, retries, DLQ, adding a job | queue/job changes |
| 11 | [Security](11-security.md) | Headers, rate-limit matrix, fraud controls, secrets, audit | new endpoints, limit changes, security reviews |
| 12 | [Observability & Logging](12-observability-logging.md) | pino fields, redaction, Sentry, metrics, health, alerts | log/metric/alert changes |
| 13 | [Testing](13-testing.md) | Pyramid, writing each test type, fixtures, quality gates | test tooling or gate changes |
| 14 | [VPS Deployment](14-deployment-vps.md) | Provisioning → Docker → Nginx → TLS → zero-downtime deploys → backups → scaling | infra, compose, nginx, or deploy-script changes |
| 15 | [React Native Migration ("App Shifting")](15-react-native-migration.md) | Expo app, parity matrix, push, UPI, store release | any mobile ADR / RN decision changes |
| 16 | [CI/CD](16-cicd.md) | GitHub Actions jobs, secrets, release & rollback flow | workflow changes |
| 17 | [Troubleshooting & Runbooks](17-troubleshooting-runbooks.md) | Error-code decoder, prod playbooks (rollback, stuck queue, restore) | new incidents / playbooks |
| 18 | [Glossary & Changelog](18-glossary-and-changelog.md) | Terms, acronyms, **documentation changelog** | **every docs change (add entry)** |

---

## 0. Documentation Maintenance Policy (MANDATORY)

**This documentation must be updated together with the code changes it describes. Documentation is part of the Definition of Done, never an afterthought.**

1. **Same-PR rule.** Any PR that changes behavior, contracts, or configuration listed in the *“Update this doc when…”* column above **must include the matching documentation change in the same PR**. A PR that adds, renames, or removes an endpoint, env var, Redis key, DB table/column, role, queue, component, or deployment step **without updating docs is incomplete and must be rejected in review.**
2. **Contract-first order of work.** Start from `plan.md` (binding) → amend it + append an ADR if the architecture changes → update the relevant `docs/0x-*.md` → then write code. Never code-first with docs retrofitted later.
3. **Changelog entry required.** Append a row to [18-glossary-and-changelog.md](18-glossary-and-changelog.md) for every docs change: date, PR, doc(s) touched, one-line summary.
4. **CI link check.** `docs-link-check` runs on every PR (validates links, code fences, referenced env vars/paths against `packages/config/env.ts`); broken references fail the build.
5. **No aspirational docs.** Do not document features that are not merged. Future work must be explicitly marked `(Phase 9, planned)` — e.g., RN screens, campus wallet, RazorpayX payouts.
6. **Examples must run.** Every shell and curl snippet must work against `pnpm dev` defaults; API examples must match the Section 9 envelope of plan.md exactly.
7. **Reviewer checklist.** Reviewers verify docs coverage using the index table’s last column before approving; agents must explicitly report which docs they updated in their final task report.

---

*Start here: [System Architecture →](01-architecture.md)*
