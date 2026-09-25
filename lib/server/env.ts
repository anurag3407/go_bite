// lib/server/env.ts
// Central, validated access to server configuration.
// The app must boot in "demo mode" (no credentials) so the pilot stays runnable,
// but production gaps are surfaced loudly via assertProductionReady().

import { z } from 'zod';

const rawSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  FAST2SMS_API_KEY: z.string().min(1).optional(),
  FAST2SMS_SENDER_ID: z.string().min(1).optional(),
  FAST2SMS_OTP_TEMPLATE_ID: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(16).optional(),

  CRON_SECRET: z.string().min(16).optional(),

  MAX_DAILY_SMS: z.coerce.number().int().positive().optional(),

  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
});

const parsed = rawSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  FAST2SMS_API_KEY: process.env.FAST2SMS_API_KEY,
  FAST2SMS_SENDER_ID: process.env.FAST2SMS_SENDER_ID,
  FAST2SMS_OTP_TEMPLATE_ID: process.env.FAST2SMS_OTP_TEMPLATE_ID,
  SESSION_SECRET: process.env.SESSION_SECRET,
  CRON_SECRET: process.env.CRON_SECRET,
  MAX_DAILY_SMS: process.env.MAX_DAILY_SMS,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
});

// A malformed URL (e.g. a typo in a dashboard env var) silently disabling
// persistence is a launch hazard, so validation failure is loud but non-fatal.
if (!parsed.success) {
  console.error(
    '[env] Invalid environment configuration; falling back to demo mode:',
    parsed.error.flatten().fieldErrors,
  );
}

const raw = parsed.success
  ? parsed.data
  : { NODE_ENV: (process.env.NODE_ENV as 'development') ?? 'development' };

const isProduction = raw.NODE_ENV === 'production';

/** True only when we can actually persist to Postgres. */
export const persistenceEnabled = Boolean(
  raw.NEXT_PUBLIC_SUPABASE_URL && raw.SUPABASE_SERVICE_ROLE_KEY,
);

/** True when real OTP SMS can be dispatched. */
export const smsEnabled = Boolean(raw.FAST2SMS_API_KEY);

/**
 * True only when a real payment gateway is wired up. Until then, online payment
 * methods are rejected outright instead of being falsely marked as captured.
 */
export const paymentGatewayEnabled = Boolean(
  raw.RAZORPAY_KEY_ID && raw.RAZORPAY_KEY_SECRET,
);

/**
 * In demo mode we cannot send SMS, so the OTP is returned to the client and
 * logged. This is only ever allowed outside production (see assertProductionReady).
 */
export const otpDevMode = !smsEnabled && !isProduction;

/**
 * Pepper for OTP hashing and session-token hashing. In production a real secret
 * is mandatory; in dev we derive a stable value so restarts do not log everyone out.
 */
export const sessionSecret =
  raw.SESSION_SECRET ?? `insecure-dev-secret-do-not-use-in-production-${raw.NODE_ENV}`;

export const appEnv = {
  nodeEnv: raw.NODE_ENV,
  isProduction,
  appUrl: raw.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  supabaseUrl: raw.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: raw.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: raw.SUPABASE_SERVICE_ROLE_KEY,
  fast2smsApiKey: raw.FAST2SMS_API_KEY,
  fast2smsSenderId: raw.FAST2SMS_SENDER_ID,
  fast2smsOtpTemplateId: raw.FAST2SMS_OTP_TEMPLATE_ID,
  cronSecret: raw.CRON_SECRET,
  maxDailySms: raw.MAX_DAILY_SMS ?? 1000,
  razorpayKeyId: raw.RAZORPAY_KEY_ID,
} as const;

export type ReadinessIssue = { variable: string; message: string };

/**
 * Returns the list of things that make this deployment unsafe/unready to launch.
 * Consumed by GET /api/health/ready and logged at boot.
 */
export function productionReadinessIssues(): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];

  if (!raw.SESSION_SECRET) {
    issues.push({
      variable: 'SESSION_SECRET',
      message: 'Required in production: signs OTP and session-token hashes.',
    });
  }
  if (!persistenceEnabled) {
    issues.push({
      variable: 'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY',
      message: 'Required in production: without these, data is held in memory and lost on restart.',
    });
  }
  if (!smsEnabled) {
    issues.push({
      variable: 'FAST2SMS_API_KEY',
      message: 'Required in production: without this, no OTP can be delivered to users.',
    });
  }
  if (!raw.NEXT_PUBLIC_APP_URL) {
    issues.push({
      variable: 'NEXT_PUBLIC_APP_URL',
      message: 'Recommended: used for absolute links and origin checks.',
    });
  }
  if (!raw.FAST2SMS_SENDER_ID) {
    issues.push({
      variable: 'FAST2SMS_SENDER_ID',
      message: 'Required in production: DLT-approved sender id, or Fast2SMS rejects every SMS.',
    });
  }
  if (!raw.FAST2SMS_OTP_TEMPLATE_ID) {
    issues.push({
      variable: 'FAST2SMS_OTP_TEMPLATE_ID',
      message: 'Required in production: DLT template id for the OTP template.',
    });
  }
  if (!raw.CRON_SECRET) {
    issues.push({
      variable: 'CRON_SECRET',
      message: 'Required in production: protects POST /api/v1/cron/expire-orders (order auto-cancel).',
    });
  }

  return issues;
}

/** Logs (and in production, throws on) configuration that is unsafe to launch with. */
export function assertProductionReady(): void {
  const issues = productionReadinessIssues();
  if (issues.length === 0) return;

  const summary = issues.map((i) => `  - ${i.variable}: ${i.message}`).join('\n');
  if (isProduction) {
    throw new Error(`[env] Production configuration is incomplete:\n${summary}`);
  }
  console.warn(
    `[env] Running in demo mode (data is in-memory and OTPs are logged, not sent):\n${summary}`,
  );
}
