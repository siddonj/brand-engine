import { runAgent } from "./runner";

export interface GutenbergBlock {
  type: "paragraph" | "heading" | "list" | "quote" | "separator" | "callout" | "image";
  content?: string;
  level?: 2 | 3;
  ordered?: boolean;
  items?: string[];
  citation?: string;
  // image block fields (populated after Unsplash fetch + WP media upload)
  url?: string;
  alt?: string;
  caption?: string;
  mediaId?: number;
}

export async function runWriterAgent(
  topic: string,
  researchBrief: string,
  onProgress?: (msg: string) => void
): Promise<GutenbergBlock[]> {
  const input = `Write a comprehensive blog post based on the following research brief.

Topic: ${topic}

Research Brief:
${researchBrief}

Requirements:
- 1500-2500 words
- Expert PropTech/AI voice — authoritative, data-driven, actionable
- Strong opening that hooks the reader in the first paragraph
- Well-structured with H2 and H3 headings
- Include specific statistics and examples from the research
- End with clear, actionable takeaways
- Speak directly to PropTech and AI automation professionals

Return ONLY a valid JSON array of Gutenberg blocks. No markdown, no explanation, just the JSON array.`;

  const result = await runAgent({
    role: "writer",
    input,
    onProgress,
  });

  if (Array.isArray(result.parsed)) {
    return result.parsed as GutenbergBlock[];
  }

  // Fallback: wrap raw text in paragraph blocks
  return [{ type: "paragraph", content: result.output }];
}
