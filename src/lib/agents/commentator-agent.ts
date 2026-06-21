import { runAgent } from "./runner";

export async function runCommentatorAgent(
  postText: string,
  profileName: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const input = `Write a LinkedIn comment on this post by ${profileName}.

Post content:
"""
${postText.slice(0, 2000)}
"""

Write a single comment in the voice of a PropTech and AI Automation thought leader. Be specific to what they wrote. Add real value. Keep it under 5 sentences.`;

  const result = await runAgent({
    role: "commentator",
    input,
    onProgress,
  });

  return result.output.trim();
}
