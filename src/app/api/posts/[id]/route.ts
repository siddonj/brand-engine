import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, Number(id)))
    .limit(1);

  if (!post[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(post[0]);
}
