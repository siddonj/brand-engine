import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updateAgentSchema = z.object({
  id: z.number(),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().min(100).max(32000).optional(),
  enabled: z.boolean().optional(),
});

export async function GET() {
  const agents = await db.select().from(schema.agents).orderBy(schema.agents.id);
  return NextResponse.json(agents);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const parsed = updateAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { id, ...updates } = parsed.data;
  const dbUpdates: Partial<typeof schema.agents.$inferInsert> = {};
  if (updates.model !== undefined) dbUpdates.model = updates.model;
  if (updates.systemPrompt !== undefined) dbUpdates.systemPrompt = updates.systemPrompt;
  if (updates.temperature !== undefined) dbUpdates.temperature = updates.temperature;
  if (updates.maxTokens !== undefined) dbUpdates.maxTokens = updates.maxTokens;
  if (updates.enabled !== undefined) dbUpdates.enabled = updates.enabled;

  await db.update(schema.agents).set(dbUpdates).where(eq(schema.agents.id, id));
  const updated = await db.select().from(schema.agents).where(eq(schema.agents.id, id)).limit(1);
  return NextResponse.json(updated[0]);
}
