import { Composio } from "@composio/core";
import { db, schema } from "@/lib/db";

export async function getComposioClient(): Promise<Composio> {
  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  const apiKey = map.composio_api_key || process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("Composio API key not configured in Settings");

  return new Composio({ apiKey });
}

export async function getLinkedInConnectedAccountId(): Promise<string> {
  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  const id = map.composio_linkedin_account_id;
  if (!id) throw new Error("LinkedIn connected account ID not configured in Settings. Connect LinkedIn in your Composio dashboard first.");
  return id;
}

export async function getMyLinkedInPersonUrn(): Promise<string> {
  const composio = await getComposioClient();
  const accountId = await getLinkedInConnectedAccountId();

  const { data } = await composio.tools.proxyExecute({
    connectedAccountId: accountId,
    endpoint: "/v2/userinfo",
    method: "GET",
  });

  const personId = (data as { sub?: string })?.sub;
  if (!personId) throw new Error("Could not retrieve LinkedIn person ID");
  return `urn:li:person:${personId}`;
}

export interface LinkedInPost {
  urn: string;
  text: string;
  author: string;
  createdAt: number;
}

export async function getRecentPostsFromProfile(personUrn: string): Promise<LinkedInPost[]> {
  const composio = await getComposioClient();
  const accountId = await getLinkedInConnectedAccountId();

  try {
    const { data } = await composio.tools.proxyExecute({
      connectedAccountId: accountId,
      endpoint: `/v2/ugcPosts?q=authors&authors=List(${encodeURIComponent(personUrn)})&count=5`,
      method: "GET",
    });

    const elements = (data as { elements?: Array<{ id: string; specificContent?: { "com.linkedin.ugc.ShareContent"?: { shareCommentary?: { text?: string } } }; created?: { time?: number }; author?: string }> })?.elements || [];

    return elements.map((el) => ({
      urn: el.id || "",
      text: el.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text || "",
      author: el.author || personUrn,
      createdAt: el.created?.time || Date.now(),
    }));
  } catch {
    return [];
  }
}

export async function postLinkedInComment(params: {
  postUrn: string;
  commentText: string;
  actorUrn: string;
}): Promise<{ success: boolean; result: string }> {
  const composio = await getComposioClient();
  const accountId = await getLinkedInConnectedAccountId();

  const result = await composio.tools.execute("LINKEDIN_CREATE_COMMENT", {
    connectedAccountId: accountId,
    arguments: {
      actor: params.actorUrn,
      object: params.postUrn,
      target_urn: params.postUrn,
      message: { text: params.commentText },
    },
  });

  const success = !result.error;
  return {
    success,
    result: JSON.stringify(result).slice(0, 500),
  };
}

export async function testComposioConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const composio = await getComposioClient();
    const accountId = await getLinkedInConnectedAccountId();
    const { data } = await composio.tools.proxyExecute({
      connectedAccountId: accountId,
      endpoint: "/v2/userinfo",
      method: "GET",
    });
    if ((data as { sub?: string })?.sub) return { ok: true };
    return { ok: false, error: "Could not retrieve LinkedIn profile" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}
