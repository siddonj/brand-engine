import OpenAI from "openai";
import { db, schema } from "@/lib/db";

export async function simpleCompletion(prompt: string, maxTokens = 400): Promise<string> {
  const rows = await db.select().from(schema.settings);
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;

  const apiKey = s.openrouter_api_key || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OpenRouter API key not configured");

  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://brand-engine.vercel.app",
      "X-Title": "Brand Engine",
    },
  });

  const res = await client.chat.completions.create({
    model: "anthropic/claude-haiku-4-5",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  return res.choices[0]?.message?.content ?? "";
}
