import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { url } = await req.json() as { url: string };
  if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });

  const rows = await db.select().from(schema.settings);
  const s: Record<string, string> = {};
  for (const row of rows) s[row.key] = row.value;

  const apiKey = s.tavily_api_key || process.env.TAVILY_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Tavily API key not configured in Settings" }, { status: 400 });

  const res = await fetch("https://api.tavily.com/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls: [url], api_key: apiKey }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Tavily error: ${err}` }, { status: 500 });
  }

  const data = await res.json() as {
    results?: Array<{ url: string; raw_content?: string }>;
    failed_results?: Array<{ url: string; error: string }>;
  };

  const result = data.results?.[0];
  if (!result?.raw_content) {
    return NextResponse.json({ error: "Could not extract post content" }, { status: 422 });
  }

  // Extract the post text — LinkedIn pages have a lot of boilerplate, try to isolate the post
  const raw = result.raw_content;

  // Look for the actual post body — typically appears after the author name block
  // and before LinkedIn's nav/footer boilerplate
  let postText = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 20) // skip short UI lines
    .slice(0, 40) // take the first meaningful chunk
    .join("\n")
    .slice(0, 2000);

  return NextResponse.json({ postText });
}
