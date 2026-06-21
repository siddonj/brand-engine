import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

export async function GET() {
  const rows = await db.select().from(schema.settings);
  const s: Record<string, string> = {};
  for (const row of rows) s[row.key] = row.value;

  return NextResponse.json({
    client_id: s.linkedin_client_id || "(not set)",
    client_secret_set: !!s.linkedin_client_secret,
    redirect_uri: s.linkedin_redirect_uri || "(not set — will use origin fallback)",
    access_token_set: !!s.linkedin_access_token,
    token_expires_at: s.linkedin_token_expires_at
      ? new Date(Number(s.linkedin_token_expires_at)).toISOString()
      : "(not set)",
    last_error: s.linkedin_last_error || "(none)",
  });
}
