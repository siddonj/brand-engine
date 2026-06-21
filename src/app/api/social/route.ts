import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { scheduleLinkedInPost } from "@/lib/postiz/client";
import { z } from "zod";

const scheduleSchema = z.object({
  postId: z.number(),
  content: z.string(),
  hashtags: z.array(z.string()).default([]),
  scheduledAt: z.string().optional(),
  draft: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const postId = searchParams.get("postId");

  const query = postId
    ? db.select().from(schema.socialPosts).where(eq(schema.socialPosts.postId, Number(postId)))
    : db.select().from(schema.socialPosts).orderBy(desc(schema.socialPosts.createdAt));

  const results = await query;
  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { postId, content, hashtags, scheduledAt, draft } = parsed.data;

  // Look up the WordPress link for this post to put in the comment
  const [parentPost] = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .limit(1);

  // Build the WordPress link from the draft ID if available
  const [wpSettings] = await db.select().from(schema.settings).where(eq(schema.settings.key, "wp_url"));
  const wpUrl = wpSettings?.value?.replace(/\/$/, "") || "";
  const postLink = parentPost?.wordpressDraftId && wpUrl
    ? `${wpUrl}/?p=${parentPost.wordpressDraftId}`
    : undefined;

  const [socialPost] = await db
    .insert(schema.socialPosts)
    .values({
      postId,
      content,
      hashtags: JSON.stringify(hashtags),
      status: "pending",
    })
    .returning();

  try {
    const result = await scheduleLinkedInPost({
      content,
      postLink,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      draft,
    });

    await db
      .update(schema.socialPosts)
      .set({
        status: "scheduled",
        postizPostId: result.id,
        scheduledAt: scheduledAt || new Date(Date.now() + 86400000).toISOString(),
      })
      .where(eq(schema.socialPosts.id, socialPost.id));

    return NextResponse.json({ ...socialPost, postizId: result.id, status: "scheduled" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Postiz scheduling failed" },
      { status: 500 }
    );
  }
}
