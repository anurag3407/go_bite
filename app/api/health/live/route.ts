// app/api/health/live/route.ts
// Liveness probe: reports only that the process is up (used by the LB).
import { ok, withApi } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = withApi(async ({ requestId }) => ok({ ok: true }, requestId));
