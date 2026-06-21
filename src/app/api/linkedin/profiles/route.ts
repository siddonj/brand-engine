import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  linkedinUrl: z.string().url(),
  linkedinPersonUrn: z.string().default(""),
  notes: z.string().default(""),
});

export async function GET() {
  const profiles = await db
    .select()
    .from(schema.watchedProfiles)
    .orderBy(desc(schema.watchedProfiles.createdAt));
  return NextResponse.json(profiles);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const [profile] = await db.insert(schema.watchedProfiles).values(parsed.data).returning();
  return NextResponse.json(profile, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json() as { id: number; active?: boolean; linkedinPersonUrn?: string; notes?: string };
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const dbUpdates: Partial<typeof schema.watchedProfiles.$inferInsert> = {};
  if (updates.active !== undefined) dbUpdates.active = updates.active;
  if (updates.linkedinPersonUrn !== undefined) dbUpdates.linkedinPersonUrn = updates.linkedinPersonUrn;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

  await db.update(schema.watchedProfiles).set(dbUpdates).where(eq(schema.watchedProfiles.id, id));
  const [updated] = await db.select().from(schema.watchedProfiles).where(eq(schema.watchedProfiles.id, id)).limit(1);
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await db.delete(schema.watchedProfiles).where(eq(schema.watchedProfiles.id, id));
  return NextResponse.json({ ok: true });
}
