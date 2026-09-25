// lib/server/store/index.ts
// Single entry point for persistence. Chooses the Supabase adapter when
// credentials are present, otherwise falls back to the in-memory demo store.

import { appEnv, persistenceEnabled } from '../env';
import { memoryStore } from './memory';
import { createSupabaseStore } from './supabase';
import type { DataStore } from './types';

let cached: DataStore | undefined;

export function getStore(): DataStore {
  if (cached) return cached;

  if (persistenceEnabled && appEnv.supabaseUrl && appEnv.supabaseServiceRoleKey) {
    cached = createSupabaseStore(appEnv.supabaseUrl, appEnv.supabaseServiceRoleKey);
  } else {
    cached = memoryStore;
  }
  return cached;
}

export function persistenceMode(): 'supabase' | 'memory' {
  return getStore().persistent ? 'supabase' : 'memory';
}

export type { DataStore } from './types';
