import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client for the SERVER only (route handlers). It uses the service_role key,
 * which bypasses RLS: it must never reach the browser. `server-only` makes any import
 * from a client component a build error; the key has no NEXT_PUBLIC_ prefix, so Next
 * never inlines it in a bundle; errors and logs never print it.
 *
 *   SUPABASE_URL               https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  service_role (secret) key — server env only
 */

const TIMEOUT_MS = 8000;
let cached: { id: string; client: SupabaseClient } | null = null;

export function supabaseConfigured(): boolean {
  return !!process.env.SUPABASE_URL?.trim() && !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
}

function validUrl(raw: string): URL {
  const url = new URL(raw);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  // https only, except a local mock / local stack (tests, e2e, `supabase start`).
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('SUPABASE_URL must use https');
  return url;
}

export function getSupabase(): SupabaseClient {
  const rawUrl = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rawUrl || !key) throw new Error('Supabase is not configured');
  const url = validUrl(rawUrl).origin;
  // Re-created when the configuration changes (tests); the key itself is never logged.
  const id = `${url}|${key.length}|${key.slice(-6)}`;
  if (cached?.id === id) return cached.client;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      // Resolved at call time (stubbable in tests), with a timeout so a slow database
      // never hangs a form submission.
      fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS) }),
    },
  });
  cached = { id, client };
  return client;
}
