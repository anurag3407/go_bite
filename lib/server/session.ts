// lib/server/session.ts
// Dual-transport sessions (plan.md §6.1): httpOnly cookie for the web app,
// bearer token for future native clients. Both resolve to the same Actor.
// Server-side session records mean logout is an instant global revocation.

import type { NextRequest, NextResponse } from 'next/server';
import type { UserRole } from '@/lib/types';
import { appEnv } from './env';
import { generateToken, hashSecret } from './security';
import { getStore } from './store';

export const SESSION_COOKIE = 'gb_session';
/** Customers get long sessions; staff get short ones (P0 fraud control). */
export const SESSION_TTL_DAYS_CUSTOMER = 30;
export const SESSION_TTL_HOURS_PRIVILEGED = 12;
export const PRIVILEGED_SESSION_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'CAMPUS_ADMIN',
  'CONFIG_CHANGER',
  'QUERY_RESOLVER',
  'SHOP_OWNER',
  'SHOP_STAFF',
];
const CUSTOMER_TTL_MS = SESSION_TTL_DAYS_CUSTOMER * 24 * 60 * 60 * 1000;
const PRIVILEGED_TTL_MS = SESSION_TTL_HOURS_PRIVILEGED * 60 * 60 * 1000;

/** Session length follows the user's role at issue time. */
export function sessionTtlMsForRole(role: UserRole): number {
  return PRIVILEGED_SESSION_ROLES.includes(role) ? PRIVILEGED_TTL_MS : CUSTOMER_TTL_MS;
}

/** Everything a domain function needs to make authorisation decisions. */
export interface Actor {
  userId: string;
  role: UserRole;
  campusId: string | null;
  shopId: string | null;
  name: string;
  phone: string;
}

/** Reads the session token from the cookie, falling back to a bearer header. */
export function readSessionToken(req: NextRequest): string | null {
  const cookieToken = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookieToken) return cookieToken;

  const authorization = req.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim();
    return token.length > 0 ? token : null;
  }
  return null;
}

/**
 * Resolves the current actor, or null when unauthenticated/expired/disabled.
 * Never throws — callers decide whether absence is fatal.
 */
export async function resolveActor(req: NextRequest): Promise<Actor | null> {
  const token = readSessionToken(req);
  if (!token) return null;

  const store = getStore();
  const session = await store.getSession(hashSecret(token));
  if (!session) return null;

  const user = await store.getUserById(session.user_id);
  if (!user || !user.is_active) return null;

  return {
    userId: user.id,
    role: user.role,
    campusId: user.active_campus_id ?? null,
    shopId: user.shop_id ?? null,
    name: user.name,
    phone: user.phone,
  };
}

export interface IssuedSession {
  token: string;
  expiresAt: string;
}

/** Issues a new session. The raw token is returned once and never stored. */
export async function issueSession(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null; role?: UserRole },
): Promise<IssuedSession> {
  const role = meta.role ?? 'CUSTOMER';
  const token = generateToken();
  const expiresAt = new Date(Date.now() + sessionTtlMsForRole(role)).toISOString();

  await getStore().createSession({
    id: `sess-${crypto.randomUUID()}`,
    user_id: userId,
    token_hash: hashSecret(token),
    expires_at: expiresAt,
    ip_address: meta.ipAddress ?? null,
    user_agent: meta.userAgent ?? null,
  });

  return { token, expiresAt };
}

/** Revokes a single session by its raw token. */
export async function revokeSession(token: string): Promise<void> {
  await getStore().deleteSession(hashSecret(token));
}

/** Revokes every session for a user (lost/stolen device, role change). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await getStore().deleteUserSessions(userId);
}

export function sessionCookieOptions(expiresAt: string) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: appEnv.isProduction,
    path: '/',
    expires: new Date(expiresAt),
  };
}

/** Attaches the session cookie to a response (web clients). */
export function attachSessionCookie(res: NextResponse, session: IssuedSession): void {
  res.cookies.set({ ...sessionCookieOptions(session.expiresAt), value: session.token });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: appEnv.isProduction,
    path: '/',
    maxAge: 0,
  });
}

/** Best-effort client IP extraction from proxy headers. */
export function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
  return req.headers.get('x-real-ip');
}
