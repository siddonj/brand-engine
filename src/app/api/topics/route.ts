import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const createTopicSchema = z.object({
  title: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  targetAudience: z.string().default("PropTech and AI professionals"),
});

export async function GET() {
  const topics = await db.select().from(schema.topics).orderBy(desc(schema.topics.createdAt));
  return NextResponse.json(topics);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createTopicSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const [topic] = await db
    .insert(schema.topics)
    .values({
      ...parsed.data,
      keywords: JSON.stringify(parsed.data.keywords),
    })
    .returning();

  return NextResponse.json(topic, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await db.delete(schema.topics).where(eq(schema.topics.id, id));
  return NextResponse.json({ ok: true });
}
