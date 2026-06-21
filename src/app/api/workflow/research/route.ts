import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { inngest } from "@/inngest/client";

const startSchema = z.object({ topicId: z.number() });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { topicId } = parsed.data;

  const [topic] = await db
    .select()
    .from(schema.topics)
    .where(eq(schema.topics.id, topicId))
    .limit(1);

  if (!topic) return NextResponse.json({ error: "Topic not found" }, { status: 404 });

  if (topic.status === "researching" || topic.status === "drafting") {
    return NextResponse.json({ error: "Topic is already being processed" }, { status: 409 });
  }

  const [job] = await db
    .insert(schema.jobLogs)
    .values({
      jobType: "pipeline",
      entityId: topicId,
      status: "running",
      logOutput: `${new Date().toISOString()} Pipeline started for: ${topic.title}`,
    })
    .returning();

  await inngest.send({ name: "pipeline/run", data: { topicId, jobId: job.id } });

  return NextResponse.json({ jobId: job.id, topicId }, { status: 202 });
}
