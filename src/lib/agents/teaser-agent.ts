import { runAgent } from "./runner";

export interface LinkedInTeaser {
  hook_type: "insight" | "story" | "question";
  content: string;
}

export async function runTeaserAgent(
  postTitle: string,
  contentBlocks: unknown[],
  postUrl: string,
  onProgress?: (msg: string) => void
): Promise<LinkedInTeaser[]> {
  const textContent = (contentBlocks as Array<{ content?: string; items?: string[] }>)
    .map((b) => b.content || b.items?.join(" ") || "")
    .join(" ")
    .slice(0, 4000);

  const input = `Create 3 LinkedIn post variants to promote this PropTech/AI blog post.

Post Title: ${postTitle}

Post content summary:
${textContent}

Create 3 variants: insight hook, story hook, question hook.
Rules:
- Each must be under 1300 characters
- Do NOT include any URL or link in the post — the link will be added automatically as the first comment
- End each post with a soft CTA (e.g. "Read the full breakdown below ↓" or "Details in the comments")
- Separate paragraphs with a blank line (double newline)
- Use bullet points (•) for lists, each on its own line

Return ONLY a valid JSON array with 3 objects, each having hook_type and content fields.
No markdown, no explanation, just the JSON array.`;

  const result = await runAgent({
    role: "teaser",
    input,
    onProgress,
  });

  if (Array.isArray(result.parsed) && result.parsed.length > 0) {
    return result.parsed as LinkedInTeaser[];
  }

  // Fallback
  return [
    {
      hook_type: "insight",
      content: `${postTitle}\n\nRead the full breakdown in the comments.\n\n#PropTech #AIAutomation #RealEstateTech`,
    },
  ];
}
