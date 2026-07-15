import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const supabaseUrl = "https://ehsmsjmmccliysxnkgpv.supabase.co";
const supabaseKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_GyQvDff2XwJyZwndeNT9og_Y8MXMIpK";

/**
 * Server-side Supabase client.
 * Uses the publishable key (anon role) — RLS is disabled and all tables
 * have been granted full access to the anon role, so this works for all
 * server-side operations including admin routes.
 *
 * This replaces the Prisma client. All API routes use this instead of
 * direct PostgreSQL connections, bypassing the IPv6 issue on Vercel
 * serverless (AWS Lambda only supports IPv4 outbound).
 */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/** Generate a unique ID for new records (replaces Prisma's cuid()) */
export function genId(): string {
  return randomUUID();
}
