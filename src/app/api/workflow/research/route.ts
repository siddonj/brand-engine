import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { runResearchAgent } from "@/lib/agents/research-agent";
import { runWriterAgent } from "@/lib/agents/writer-agent";
import { runSEOAgent } from "@/lib/agents/seo-agent";

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

  // Create a job log entry
  const [job] = await db
    .insert(schema.jobLogs)
    .values({
      jobType: "pipeline",
      entityId: topicId,
      status: "running",
      logOutput: `${new Date().toISOString()} Pipeline started for: ${topic.title}`,
    })
    .returning();

  // Run pipeline asynchronously (fire and forget)
  runPipeline(topicId, job.id).catch(console.error);

  return NextResponse.json({ jobId: job.id, topicId }, { status: 202 });
}

async function appendLog(jobId: number, message: string) {
  const [existing] = await db
    .select()
    .from(schema.jobLogs)
    .where(eq(schema.jobLogs.id, jobId))
    .limit(1);
  if (!existing) return;

  await db
    .update(schema.jobLogs)
    .set({ logOutput: existing.logOutput + `\n${new Date().toISOString()} ${message}` })
    .where(eq(schema.jobLogs.id, jobId));
}

async function runPipeline(topicId: number, jobId: number) {
  const log = (msg: string) => appendLog(jobId, msg);

  try {
    const [topic] = await db
      .select()
      .from(schema.topics)
      .where(eq(schema.topics.id, topicId))
      .limit(1);

    if (!topic) throw new Error("Topic not found");

    let keywords: string[] = [];
    try { keywords = JSON.parse(topic.keywords); } catch { keywords = []; }

    // Step 1: Research
    await db.update(schema.topics).set({ status: "researching" }).where(eq(schema.topics.id, topicId));
    await log("=== RESEARCH PHASE ===");

    const researchBrief = await runResearchAgent(
      topic.title,
      keywords,
      topic.targetAudience,
      (msg) => log(msg)
    );

    await log("Research complete. Starting writing phase...");

    // Step 2: Write
    await db.update(schema.topics).set({ status: "drafting" }).where(eq(schema.topics.id, topicId));
    await log("=== WRITING PHASE ===");

    const blocks = await runWriterAgent(topic.title, researchBrief, (msg) => log(msg));
    await log(`Generated ${blocks.length} content blocks.`);

    // Step 3: SEO
    await log("=== SEO PHASE ===");
    const seo = await runSEOAgent(topic.title, blocks, (msg) => log(msg));
    await log(`SEO metadata: "${seo.meta_title}"`);

    // Save post
    const [post] = await db
      .insert(schema.posts)
      .values({
        topicId,
        title: seo.meta_title || topic.title,
        slug: seo.slug,
        contentBlocks: JSON.stringify(blocks),
        metaTitle: seo.meta_title,
        metaDescription: seo.meta_description,
        focusKeyphrase: seo.focus_keyphrase,
        excerpt: seo.excerpt,
        researchBrief,
        status: "pending_review",
      })
      .returning();

    await db.update(schema.topics).set({ status: "complete" }).where(eq(schema.topics.id, topicId));

    await db
      .update(schema.jobLogs)
      .set({ status: "completed", completedAt: new Date().toISOString() })
      .where(eq(schema.jobLogs.id, jobId));

    await log(`=== COMPLETE === Post #${post.id} ready for review.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await log(`ERROR: ${message}`);

    await db
      .update(schema.topics)
      .set({ status: "error", errorMessage: message })
      .where(eq(schema.topics.id, topicId));

    await db
      .update(schema.jobLogs)
      .set({ status: "error", completedAt: new Date().toISOString() })
      .where(eq(schema.jobLogs.id, jobId));
  }
}
