import { NextRequest } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const id = Number(jobId);

  const encoder = new TextEncoder();
  let lastLogLength = 0;
  let pollCount = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const poll = async () => {
        const [job] = await db
          .select()
          .from(schema.jobLogs)
          .where(eq(schema.jobLogs.id, id))
          .limit(1);

        if (!job) {
          send({ type: "error", message: "Job not found" });
          controller.close();
          return;
        }

        const newLines = job.logOutput.slice(lastLogLength);
        if (newLines.length > 0) {
          send({ type: "log", lines: newLines, full: job.logOutput });
          lastLogLength = job.logOutput.length;
        }

        send({ type: "status", status: job.status, completedAt: job.completedAt });

        if (job.status === "completed" || job.status === "error") {
          controller.close();
          return;
        }

        pollCount++;
        if (pollCount > 300) {
          send({ type: "timeout", message: "Polling timeout reached" });
          controller.close();
          return;
        }

        setTimeout(poll, 1500);
      };

      await poll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
