import { runAgent } from "./runner";

export interface SEOMetadata {
  meta_title: string;
  meta_description: string;
  focus_keyphrase: string;
  slug: string;
  excerpt: string;
}

export async function runSEOAgent(
  topic: string,
  contentBlocks: unknown[],
  onProgress?: (msg: string) => void
): Promise<SEOMetadata> {
  const textContent = (contentBlocks as Array<{ content?: string; items?: string[] }>)
    .map((b) => b.content || b.items?.join(" ") || "")
    .join(" ")
    .slice(0, 3000);

  const input = `Generate RankMath-optimized SEO metadata for this PropTech/AI blog post.

Topic: ${topic}

Post content preview:
${textContent}

Return ONLY valid JSON with these exact keys: meta_title, meta_description, focus_keyphrase, slug, excerpt.
No markdown, no explanation, just the JSON object.`;

  const result = await runAgent({
    role: "seo",
    input,
    onProgress,
  });

  if (result.parsed && typeof result.parsed === "object" && !Array.isArray(result.parsed)) {
    return result.parsed as SEOMetadata;
  }

  // Fallback defaults
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  return {
    meta_title: topic.slice(0, 60),
    meta_description: `Expert insights on ${topic} for PropTech and AI professionals.`.slice(0, 160),
    focus_keyphrase: topic.split(" ").slice(0, 3).join(" "),
    slug,
    excerpt: `Explore the latest insights on ${topic} and what it means for the future of PropTech.`,
  };
}
