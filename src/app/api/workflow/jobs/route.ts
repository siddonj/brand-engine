import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { desc } from "drizzle-orm";

export async function GET() {
  const jobs = await db
    .select()
    .from(schema.jobLogs)
    .orderBy(desc(schema.jobLogs.startedAt))
    .limit(20);
  return NextResponse.json(jobs);
}
