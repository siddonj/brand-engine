import { db, schema } from "@/lib/db";

const BASE = "https://api.linkedin.com";

async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

async function saveSetting(key: string, value: string) {
  await db
    .insert(schema.settings)
    .values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date().toISOString() } });
}

export async function getValidAccessToken(): Promise<string> {
  const s = await getSettings();
  const token = s.linkedin_access_token;
  const expiresAt = s.linkedin_token_expires_at ? Number(s.linkedin_token_expires_at) : 0;
  const refreshToken = s.linkedin_refresh_token;
  const clientId = s.linkedin_client_id;
  const clientSecret = s.linkedin_client_secret;

  if (!token) throw new Error("LinkedIn not connected. Click 'Connect LinkedIn' in Settings.");

  const isExpired = Date.now() > expiresAt - 60_000;
  if (!isExpired) return token;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("LinkedIn access token expired and no refresh credentials available. Re-connect in Settings.");
  }

  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number; refresh_token?: string };

  await saveSetting("linkedin_access_token", data.access_token);
  await saveSetting("linkedin_token_expires_at", String(Date.now() + data.expires_in * 1000));
  if (data.refresh_token) await saveSetting("linkedin_refresh_token", data.refresh_token);

  return data.access_token;
}

async function linkedinGet(path: string): Promise<unknown> {
  const token = await getValidAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": "202401",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn API ${res.status}: ${text}`);
  }
  return res.json();
}

async function linkedinPost(path: string, body: unknown): Promise<unknown> {
  const token = await getValidAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": "202401",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn API ${res.status}: ${text}`);
  }
  if (res.status === 201) return {};
  return res.json();
}

export async function getMyPersonUrn(): Promise<string> {
  const data = await linkedinGet("/v2/userinfo") as { sub?: string };
  if (!data.sub) throw new Error("Could not retrieve LinkedIn person ID");
  return `urn:li:person:${data.sub}`;
}

export interface LinkedInPost {
  urn: string;
  text: string;
  author: string;
  createdAt: number;
}

export async function getRecentPostsFromProfile(personUrn: string): Promise<LinkedInPost[]> {
  try {
    const data = await linkedinGet(
      `/v2/ugcPosts?q=authors&authors=List(${encodeURIComponent(personUrn)})&count=5`
    ) as { elements?: Array<{
      id: string;
      specificContent?: { "com.linkedin.ugc.ShareContent"?: { shareCommentary?: { text?: string } } };
      created?: { time?: number };
      author?: string;
    }> };

    return (data.elements || []).map((el) => ({
      urn: el.id || "",
      text: el.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text || "",
      author: el.author || personUrn,
      createdAt: el.created?.time || Date.now(),
    }));
  } catch {
    return [];
  }
}

export async function postComment(params: {
  postUrn: string;
  commentText: string;
  actorUrn: string;
}): Promise<{ success: boolean; result: string }> {
  try {
    await linkedinPost(`/v2/socialActions/${encodeURIComponent(params.postUrn)}/comments`, {
      actor: params.actorUrn,
      message: { text: params.commentText },
    });
    return { success: true, result: "Comment posted" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, result: msg };
  }
}

export async function testLinkedInConnection(): Promise<{ ok: boolean; name?: string; error?: string }> {
  try {
    const data = await linkedinGet("/v2/userinfo") as { sub?: string; name?: string };
    if (data.sub) return { ok: true, name: data.name };
    return { ok: false, error: "Could not retrieve LinkedIn profile" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}
