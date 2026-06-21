import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profileId");

  const rows = profileId
    ? await db.select().from(schema.linkedinEngagements)
        .where(eq(schema.linkedinEngagements.profileId, Number(profileId)))
        .orderBy(desc(schema.linkedinEngagements.createdAt))
        .limit(50)
    : await db.select().from(schema.linkedinEngagements)
        .orderBy(desc(schema.linkedinEngagements.createdAt))
        .limit(50);

  return NextResponse.json(rows);
}
