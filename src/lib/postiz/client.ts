import { db, schema } from "@/lib/db";

async function getPostizCredentials() {
  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  if (!map.postiz_api_key) throw new Error("Missing Postiz API key in settings");

  return {
    apiKey: map.postiz_api_key,
    baseUrl: (map.postiz_base_url || "https://postiz.joshsiddon.com").replace(/\/$/, ""),
    linkedinIntegrationId: map.postiz_linkedin_id || "",
  };
}

// Minimal MCP client — initialize a session, then call a tool
async function mcpCall(
  baseUrl: string,
  apiKey: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const mcpUrl = `${baseUrl}/api/mcp`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "BrandEngine/1.0",
  };

  // 1. Initialize session
  const initRes = await fetch(mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0", id: 0, method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "brand-engine", version: "1.0" },
      },
    }),
  });
  if (!initRes.ok) throw new Error(`Postiz MCP init failed: ${initRes.status}`);
  const sessionId = initRes.headers.get("mcp-session-id") || initRes.headers.get("Mcp-Session-Id");
  if (!sessionId) throw new Error("Postiz MCP did not return a session ID");

  // 2. Call the tool
  const toolRes = await fetch(mcpUrl, {
    method: "POST",
    headers: { ...headers, "mcp-session-id": sessionId },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });
  if (!toolRes.ok) throw new Error(`Postiz MCP tool call failed: ${toolRes.status}`);

  const data = await toolRes.json() as {
    result?: { content?: Array<{ text?: string }> };
    error?: { message: string };
  };

  if (data.error) throw new Error(`Postiz MCP error: ${data.error.message}`);

  const text = data.result?.content?.map((c) => c.text || "").join("") || "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface ScheduledPost {
  id: string;
  status: string;
}

export async function scheduleLinkedInPost(params: {
  content: string;
  postLink?: string;
  scheduledAt?: Date;
  draft?: boolean;
}): Promise<ScheduledPost> {
  const creds = await getPostizCredentials();

  if (!creds.linkedinIntegrationId) {
    throw new Error("Postiz LinkedIn integration ID not configured in settings");
  }

  const scheduledDate = params.scheduledAt || new Date(Date.now() + 24 * 60 * 60 * 1000);

  const postsAndComments: Array<{ content: string; isComment?: boolean; attachments: [] }> = [
    { content: params.content, attachments: [] },
  ];

  if (params.postLink) {
    postsAndComments.push({
      content: `See Post Here: ${params.postLink}`,
      isComment: true,
      attachments: [],
    });
  }

  const socialPost = [{
    type: params.draft ? "draft" : "schedule",
    date: scheduledDate.toISOString(),
    integrationId: creds.linkedinIntegrationId,
    isPremium: false,
    shortLink: false,
    settings: [],
    postsAndComments,
  }];

  const result = await mcpCall(creds.baseUrl, creds.apiKey, "integrationSchedulePostTool", { socialPost }) as {
    output?: Array<{ postId: string }>;
  };

  const postId = result?.output?.[0]?.postId || "unknown";
  return { id: postId, status: params.draft ? "draft" : "scheduled" };
}

export async function testPostizConnection(): Promise<boolean> {
  try {
    const creds = await getPostizCredentials();
    const result = await mcpCall(creds.baseUrl, creds.apiKey, "integrationList", {}) as { output?: unknown[] };
    return Array.isArray(result?.output);
  } catch {
    return false;
  }
}
