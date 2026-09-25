// app/api/health/ready/route.ts
// Readiness probe: verifies the data layer and KV layer, and reports any
// configuration that would make this deployment unready to serve real traffic.

import { appEnv, productionReadinessIssues } from '@/lib/server/env';
import { ok, withApi } from '@/lib/server/http';
import { kv } from '@/lib/server/kv';
import { getStore, persistenceMode } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export const GET = withApi(async ({ requestId }) => {
  const issues = productionReadinessIssues();

  let dataLayerUp = true;
  try {
    await getStore().listCampuses();
  } catch (error) {
    console.error('[health] data layer check failed', error);
    dataLayerUp = false;
  }

  let kvUp = true;
  try {
    await kv.set('gb:health:ready', '1', 5);
  } catch (error) {
    console.error('[health] kv layer check failed', error);
    kvUp = false;
  }

  const ready = dataLayerUp && kvUp;
  const blockingIssues = appEnv.isProduction ? issues : [];

  return ok(
    {
      ready: ready && blockingIssues.length === 0,
      dataLayer: dataLayerUp,
      kv: kvUp,
      persistence: persistenceMode(),
      configIssues: issues,
    },
    requestId,
    { status: ready && blockingIssues.length === 0 ? 200 : 503 },
  );
});
