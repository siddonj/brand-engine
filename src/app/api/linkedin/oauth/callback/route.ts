import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

async function save(key: string, value: string) {
  await db
    .insert(schema.settings)
    .values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date().toISOString() } });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // Log everything LinkedIn sent back so we can debug
  const rows = await db.select().from(schema.settings);
  const allParams = Object.fromEntries(searchParams.entries());
  // Store raw callback params temporarily in DB for debugging
  await db.insert(schema.settings)
    .values({ key: "linkedin_last_error", value: `callback params: ${JSON.stringify(allParams)}`, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: `callback params: ${JSON.stringify(allParams)}`, updatedAt: new Date().toISOString() } });
  const s: Record<string, string> = {};
  for (const row of rows) s[row.key] = row.value;

  const clientId = s.linkedin_client_id;
  const clientSecret = s.linkedin_client_secret;
  const redirectUri = s.linkedin_redirect_uri || `${req.nextUrl.origin}/api/linkedin/oauth/callback`;
  // Use the stored redirect URI's origin so we never redirect to 0.0.0.0
  const appBase = new URL(redirectUri).origin;

  if (error || !code) {
    await save("linkedin_last_error", error || "no_code_returned");
    return NextResponse.redirect(`${appBase}/settings?linkedin_error=1`);
  }

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appBase}/settings?linkedin_error=missing_credentials`);
  }

  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    const rawText = await tokenRes.text();
    let errMsg = rawText;
    try {
      const j = JSON.parse(rawText) as Record<string, string>;
      errMsg = j.error_description || j.error || rawText;
    } catch { /* not JSON, use raw text */ }
    const fullError = `${tokenRes.status}: ${errMsg}`;
    console.error("LinkedIn token exchange failed:", fullError);
    await save("linkedin_last_error", fullError);
    return NextResponse.redirect(`${appBase}/settings?linkedin_error=1`);
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
  };

  await save("linkedin_access_token", tokens.access_token);
  await save("linkedin_token_expires_at", String(Date.now() + tokens.expires_in * 1000));
  if (tokens.refresh_token) await save("linkedin_refresh_token", tokens.refresh_token);
  await save("linkedin_last_error", "");

  return NextResponse.redirect(`${appBase}/settings?linkedin_connected=1`);
}
