import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

export async function GET(req: NextRequest) {
  const rows = await db.select().from(schema.settings);
  const s: Record<string, string> = {};
  for (const row of rows) s[row.key] = row.value;

  const clientId = s.linkedin_client_id;
  if (!clientId) {
    return NextResponse.redirect(new URL("/settings?error=missing_client_id", req.url));
  }

  const redirectUri = s.linkedin_redirect_uri || `${req.nextUrl.origin}/api/linkedin/oauth/callback`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile w_member_social",
    state: "brand_engine",
  });

  return NextResponse.redirect(
    `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
  );
}
