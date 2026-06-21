import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const updatePostSchema = z.object({
  id: z.number(),
  title: z.string().optional(),
  contentBlocks: z.array(z.unknown()).optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  focusKeyphrase: z.string().optional(),
  excerpt: z.string().optional(),
  status: z.enum(["drafting", "pending_review", "approved", "published", "rejected"]).optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const query = db.select().from(schema.posts).orderBy(desc(schema.posts.createdAt));
  const posts = await query;

  const filtered = status ? posts.filter((p) => p.status === status) : posts;
  return NextResponse.json(filtered);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const parsed = updatePostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { id, ...updates } = parsed.data;
  const dbUpdates: Partial<typeof schema.posts.$inferInsert> = {};

  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.contentBlocks !== undefined) dbUpdates.contentBlocks = JSON.stringify(updates.contentBlocks);
  if (updates.metaTitle !== undefined) dbUpdates.metaTitle = updates.metaTitle;
  if (updates.metaDescription !== undefined) dbUpdates.metaDescription = updates.metaDescription;
  if (updates.focusKeyphrase !== undefined) dbUpdates.focusKeyphrase = updates.focusKeyphrase;
  if (updates.excerpt !== undefined) dbUpdates.excerpt = updates.excerpt;
  if (updates.status !== undefined) dbUpdates.status = updates.status;

  await db.update(schema.posts).set(dbUpdates).where(eq(schema.posts.id, id));
  const updated = await db.select().from(schema.posts).where(eq(schema.posts.id, id)).limit(1);
  return NextResponse.json(updated[0]);
}
