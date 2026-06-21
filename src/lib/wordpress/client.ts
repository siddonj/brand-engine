import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { serializeBlocksToWP } from "@/lib/gutenberg/serializer";
import type { GutenbergBlock } from "@/lib/agents/writer-agent";

async function getWPCredentials() {
  const keys = ["wp_url", "wp_username", "wp_app_password"];
  const rows = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "wp_url"));

  const allRows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const row of allRows) {
    map[row.key] = row.value;
  }

  const missing = keys.filter((k) => !map[k]);
  if (missing.length > 0) {
    throw new Error(`Missing WordPress settings: ${missing.join(", ")}`);
  }

  return {
    url: map.wp_url.replace(/\/$/, ""),
    username: map.wp_username,
    password: map.wp_app_password,
  };
}

export interface WordPressPost {
  id: number;
  link: string;
  status: string;
}

export async function uploadMediaFromUrl(params: {
  imageUrl: string;
  filename: string;
  altText: string;
}): Promise<{ id: number; url: string }> {
  const creds = await getWPCredentials();
  const password = creds.password.replace(/\s/g, "");
  const auth = Buffer.from(`${creds.username}:${password}`).toString("base64");

  // Fetch the image from Unsplash
  const imgRes = await fetch(params.imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
  const imgBuffer = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get("content-type") || "image/jpeg";
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const filename = params.filename.endsWith(`.${ext}`) ? params.filename : `${params.filename}.${ext}`;

  const response = await fetch(`${creds.url}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "alt-text": params.altText,
    },
    body: imgBuffer,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WordPress media upload error ${response.status}: ${error}`);
  }

  const media = await response.json() as { id: number; source_url: string };
  return { id: media.id, url: media.source_url };
}

export interface WPTaxonomy {
  id: number;
  name: string;
  slug: string;
}

export async function getCategories(): Promise<WPTaxonomy[]> {
  const creds = await getWPCredentials();
  const auth = Buffer.from(`${creds.username}:${creds.password.replace(/\s/g, "")}`).toString("base64");
  const res = await fetch(`${creds.url}/wp-json/wp/v2/categories?per_page=100`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) return [];
  const data = await res.json() as Array<{ id: number; name: string; slug: string }>;
  return data.map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
}

export async function getTags(): Promise<WPTaxonomy[]> {
  const creds = await getWPCredentials();
  const auth = Buffer.from(`${creds.username}:${creds.password.replace(/\s/g, "")}`).toString("base64");
  const res = await fetch(`${creds.url}/wp-json/wp/v2/tags?per_page=100`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) return [];
  const data = await res.json() as Array<{ id: number; name: string; slug: string }>;
  return data.map((t) => ({ id: t.id, name: t.name, slug: t.slug }));
}

export async function createTag(name: string): Promise<WPTaxonomy | null> {
  const creds = await getWPCredentials();
  const auth = Buffer.from(`${creds.username}:${creds.password.replace(/\s/g, "")}`).toString("base64");
  const res = await fetch(`${creds.url}/wp-json/wp/v2/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { id: number; name: string; slug: string };
  return { id: data.id, name: data.name, slug: data.slug };
}

export async function createWordPressDraft(params: {
  title: string;
  blocks: GutenbergBlock[];
  slug: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  focusKeyphrase: string;
  featuredMediaId?: number;
  featuredImageUrl?: string;
  categoryIds?: number[];
  tagIds?: number[];
}): Promise<WordPressPost> {
  const creds = await getWPCredentials();
  const password = creds.password.replace(/\s/g, "");
  const auth = Buffer.from(`${creds.username}:${password}`).toString("base64");
  const content = serializeBlocksToWP(params.blocks);

  const body: Record<string, unknown> = {
    title: params.title,
    content,
    slug: params.slug,
    excerpt: params.excerpt,
    status: "draft",
    meta: {
      rank_math_title: params.metaTitle,
      rank_math_description: params.metaDescription,
      rank_math_focus_keyword: params.focusKeyphrase,
      ...(params.featuredImageUrl && {
        rank_math_og_image: params.featuredImageUrl,
        rank_math_twitter_image: params.featuredImageUrl,
      }),
    },
  };

  if (params.featuredMediaId) body.featured_media = params.featuredMediaId;
  if (params.categoryIds?.length) body.categories = params.categoryIds;
  if (params.tagIds?.length) body.tags = params.tagIds;

  const response = await fetch(`${creds.url}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WordPress API error ${response.status}: ${error}`);
  }

  return response.json();
}

export async function fetchWordPressPost(wpPostId: number): Promise<{
  title: string;
  content: string;
  excerpt: string;
  slug: string;
  link: string;
} | null> {
  try {
    const creds = await getWPCredentials();
    const auth = Buffer.from(`${creds.username}:${creds.password.replace(/\s/g, "")}`).toString("base64");
    const res = await fetch(`${creds.url}/wp-json/wp/v2/posts/${wpPostId}?context=edit`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      title: { raw: string };
      content: { raw: string };
      excerpt: { raw: string };
      slug: string;
      link: string;
    };
    return {
      title: data.title.raw,
      content: data.content.raw,
      excerpt: data.excerpt.raw,
      slug: data.slug,
      link: data.link,
    };
  } catch {
    return null;
  }
}

export async function testWordPressConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const creds = await getWPCredentials();
    // Strip spaces from application password (WP generates them with spaces for readability)
    const password = creds.password.replace(/\s/g, "");
    const auth = Buffer.from(`${creds.username}:${password}`).toString("base64");
    const response = await fetch(`${creds.url}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (response.ok) return { ok: true };
    const body = await response.json().catch(() => ({}));
    const message = body?.message || `HTTP ${response.status}`;
    return { ok: false, error: message };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}
