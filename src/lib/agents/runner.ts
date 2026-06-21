import OpenAI from "openai";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  handler: (input: Record<string, string>) => Promise<string>;
}

export interface RunAgentOptions {
  role: string;
  input: string;
  tools?: AgentTool[];
  onProgress?: (message: string) => void;
}

export interface RunAgentResult {
  output: string;
  parsed?: unknown;
}

function toOpenRouterModel(model: string): string {
  const map: Record<string, string> = {
    "claude-opus-4-8": "anthropic/claude-opus-4-5",
    "claude-sonnet-4-6": "anthropic/claude-sonnet-4-5",
    "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4-5",
  };
  if (model.includes("/")) return model;
  return map[model] || `anthropic/${model}`;
}

async function getApiKey(): Promise<string> {
  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  const key = map.openrouter_api_key || process.env.OPENROUTER_API_KEY || "";
  if (!key) throw new Error("OpenRouter API key not configured. Set OPENROUTER_API_KEY or add it in Settings.");
  return key;
}

export async function runAgent(options: RunAgentOptions): Promise<RunAgentResult> {
  const { role, input, tools = [], onProgress } = options;

  const [agent] = await db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.role, role))
    .limit(1);

  if (!agent) throw new Error(`Agent with role "${role}" not found`);

  const apiKey = await getApiKey();
  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://brand-engine.vercel.app",
      "X-Title": "Brand Engine",
    },
  });

  const model = toOpenRouterModel(agent.model);
  const orTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: agent.systemPrompt },
    { role: "user", content: input },
  ];

  onProgress?.(`[${agent.name}] Starting with model ${model} via OpenRouter...`);

  let fullOutput = "";
  let iterations = 0;

  while (iterations < 10) {
    iterations++;
    const response = await client.chat.completions.create({
      model,
      max_tokens: agent.maxTokens,
      temperature: agent.temperature,
      tools: orTools.length > 0 ? orTools : undefined,
      messages,
    });

    const choice = response.choices[0];
    if (!choice) break;

    if (choice.finish_reason === "stop") {
      fullOutput += choice.message.content || "";
      break;
    }

    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
      messages.push(choice.message);
      const toolResults: OpenAI.ChatCompletionToolMessageParam[] = [];

      for (const call of choice.message.tool_calls) {
        const fn = (call as { id: string; function?: { name: string; arguments: string } }).function;
        if (!fn) continue;
        const tool = tools.find((t) => t.name === fn.name);
        if (!tool) continue;
        onProgress?.(`[${agent.name}] Using tool: ${fn.name}`);
        try {
          const args = JSON.parse(fn.arguments) as Record<string, string>;
          const result = await tool.handler(args);
          toolResults.push({ role: "tool", tool_call_id: call.id, content: result });
        } catch (err) {
          toolResults.push({
            role: "tool",
            tool_call_id: call.id,
            content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
          });
        }
      }
      messages.push(...toolResults);
      continue;
    }

    fullOutput += choice.message.content || "";
    break;
  }

  let parsed: unknown;
  try {
    const jsonMatch = fullOutput.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // Not JSON, fine
  }

  onProgress?.(`[${agent.name}] Completed.`);
  return { output: fullOutput, parsed };
}

export async function appendJobLog(jobLogId: number, message: string) {
  const [existing] = await db
    .select()
    .from(schema.jobLogs)
    .where(eq(schema.jobLogs.id, jobLogId))
    .limit(1);
  if (!existing) return;

  await db
    .update(schema.jobLogs)
    .set({ logOutput: existing.logOutput + `\n${new Date().toISOString()} ${message}` })
    .where(eq(schema.jobLogs.id, jobLogId));
}
