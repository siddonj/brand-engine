import { inngest } from "./client";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { runResearchAgent } from "@/lib/agents/research-agent";
import { runWriterAgent } from "@/lib/agents/writer-agent";
import { runSEOAgent } from "@/lib/agents/seo-agent";

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

export const pipelineFunction = inngest.createFunction(
  {
    id: "run-pipeline",
    name: "Run Content Pipeline",
    timeouts: { finish: "15m" },
    triggers: [{ event: "pipeline/run" }],
  },
  async ({ event }: { event: { data: { topicId: number; jobId: number } } }) => {
    const { topicId, jobId } = event.data;
    const log = (msg: string) => appendLog(jobId, msg);

    try {
      const [topic] = await db
        .select()
        .from(schema.topics)
        .where(eq(schema.topics.id, topicId))
        .limit(1);

      if (!topic) throw new Error("Topic not found");

      let keywords: string[] = [];
      try {
        keywords = JSON.parse(topic.keywords);
      } catch {
        keywords = [];
      }

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
);
