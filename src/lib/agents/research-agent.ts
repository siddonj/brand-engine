import { runAgent, AgentTool } from "./runner";
import { db, schema } from "@/lib/db";

async function tavilySearch(query: string): Promise<string> {
  const rows = await db.select().from(schema.settings);
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;
  const apiKey = s.tavily_api_key || process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY not set");

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: 8,
      include_answer: true,
      include_raw_content: false,
    }),
  });

  if (!response.ok) throw new Error(`Tavily error: ${response.statusText}`);
  const data = await response.json();

  const results = data.results?.map((r: { url: string; title: string; content: string }) =>
    `URL: ${r.url}\nTitle: ${r.title}\nSummary: ${r.content}`
  ).join("\n\n---\n\n");

  return `Search Answer: ${data.answer || "N/A"}\n\nTop Results:\n${results}`;
}

async function fetchUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; research-bot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return `Could not fetch URL: ${response.statusText}`;
    const html = await response.text();
    // Basic HTML strip
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);
    return text;
  } catch {
    return "Could not fetch URL";
  }
}

const searchTool: AgentTool = {
  name: "web_search",
  description: "Search the web for current information on a topic. Use specific, targeted queries.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query to execute" },
    },
    required: ["query"],
  },
  handler: async (input) => tavilySearch(input.query),
};

const fetchTool: AgentTool = {
  name: "fetch_url",
  description: "Fetch and read the content of a specific URL for detailed information.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to fetch and read" },
    },
    required: ["url"],
  },
  handler: async (input) => fetchUrl(input.url),
};

export interface ResearchBrief {
  summary: string;
  keyFindings: string[];
  industryContext: string;
  uniqueAngles: string[];
  suggestedStructure: string[];
  sources: string[];
}

export async function runResearchAgent(
  topic: string,
  keywords: string[],
  targetAudience: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const input = `Research the following topic for a PropTech and AI Automation thought leadership blog post:

Topic: ${topic}
Keywords to cover: ${keywords.join(", ")}
Target audience: ${targetAudience}

Please conduct thorough research using web searches. Focus on:
1. Recent trends and statistics (2024-2025)
2. Real-world PropTech/AI implementation examples
3. Business impact and ROI data
4. Challenges and solutions
5. Future outlook and predictions

Use the web_search tool multiple times with different queries to get comprehensive coverage. Then synthesize your findings into a detailed research brief.`;

  const result = await runAgent({
    role: "research",
    input,
    tools: [searchTool, fetchTool],
    onProgress,
  });

  return result.output;
}
