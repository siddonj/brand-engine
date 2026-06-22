import { NextRequest, NextResponse } from "next/server";
import { db, schema, execute } from "@/lib/db";
import { eq } from "drizzle-orm";
import { testWordPressConnection } from "@/lib/wordpress/client";
import { testPostizConnection } from "@/lib/postiz/client";
import { testLinkedInConnection } from "@/lib/linkedin/client";

const ALLOWED_KEYS = [
  "wp_url",
  "wp_username",
  "wp_app_password",
  "postiz_api_key",
  "postiz_base_url",
  "postiz_linkedin_id",
  "tavily_api_key",
  "openrouter_api_key",
  "linkedin_client_id",
  "linkedin_client_secret",
  "linkedin_access_token",
  "linkedin_refresh_token",
  "linkedin_token_expires_at",
  "linkedin_redirect_uri",
  "unsplash_access_key",
];

const MASKED_KEYS = [
  "wp_app_password",
  "postiz_api_key",
  "openrouter_api_key",
  "tavily_api_key",
  "unsplash_access_key",
  "linkedin_client_secret",
  "linkedin_access_token",
  "linkedin_refresh_token",
];

export async function GET() {
  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = MASKED_KEYS.includes(row.key) && row.value ? "••••••••" : row.value;
  }
  return NextResponse.json(map);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, string>;

    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_KEYS.includes(key)) continue;
      if (value === "••••••••") continue;

      await execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        [key, value, new Date().toISOString()]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[settings POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { service } = await req.json();

  if (service === "wordpress") {
    const result = await testWordPressConnection();
    return NextResponse.json(result);
  }

  if (service === "postiz") {
    const ok = await testPostizConnection();
    return NextResponse.json({ ok });
  }

  if (service === "linkedin") {
    const result = await testLinkedInConnection();
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown service" }, { status: 400 });
}
