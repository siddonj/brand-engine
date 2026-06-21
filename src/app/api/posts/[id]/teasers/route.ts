import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { runTeaserAgent } from "@/lib/agents/teaser-agent";
import type { GutenbergBlock } from "@/lib/agents/writer-agent";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const postId = Number(id);

  const [post] = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .limit(1);

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  let blocks: GutenbergBlock[] = [];
  try {
    blocks = JSON.parse(post.contentBlocks) as GutenbergBlock[];
  } catch {
    blocks = [];
  }

  const settings = await db.select().from(schema.settings);
  const settingsMap: Record<string, string> = {};
  for (const row of settings) settingsMap[row.key] = row.value;

  const wpUrl = settingsMap.wp_url || "";
  const postUrl = wpUrl ? `${wpUrl}/?p=${post.wordpressDraftId || postId}` : `https://yoursite.com/?p=${postId}`;

  try {
    const teasers = await runTeaserAgent(post.title, blocks, postUrl);
    return NextResponse.json(teasers);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Teaser generation failed" },
      { status: 500 }
    );
  }
}
