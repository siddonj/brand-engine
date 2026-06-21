import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { getMyPersonUrn, getRecentPostsFromProfile, postComment } from "@/lib/linkedin/client";
import { runCommentatorAgent } from "@/lib/agents/commentator-agent";

export async function POST(req: NextRequest) {
  const { profileId } = await req.json() as { profileId?: number };

  const profiles = profileId
    ? await db.select().from(schema.watchedProfiles).where(
        and(eq(schema.watchedProfiles.id, profileId), eq(schema.watchedProfiles.active, true))
      )
    : await db.select().from(schema.watchedProfiles).where(eq(schema.watchedProfiles.active, true));

  if (profiles.length === 0) return NextResponse.json({ error: "No active profiles to scan" }, { status: 400 });

  let actorUrn: string;
  try {
    actorUrn = await getMyPersonUrn();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not get LinkedIn identity" }, { status: 500 });
  }

  const results: { profileId: number; name: string; newPosts: number; errors: string[] }[] = [];

  for (const profile of profiles) {
    if (!profile.linkedinPersonUrn) {
      results.push({ profileId: profile.id, name: profile.name, newPosts: 0, errors: ["No LinkedIn Person URN set"] });
      continue;
    }

    const errors: string[] = [];
    let newPosts = 0;

    try {
      const posts = await getRecentPostsFromProfile(profile.linkedinPersonUrn);
      const cutoff = profile.lastScannedAt ? new Date(profile.lastScannedAt).getTime() : 0;

      for (const post of posts) {
        if (post.createdAt < cutoff) continue;
        if (!post.text) continue;

        const existing = await db
          .select()
          .from(schema.linkedinEngagements)
          .where(eq(schema.linkedinEngagements.postUrn, post.urn))
          .limit(1);

        if (existing[0]) continue;

        let commentText = "";
        try {
          commentText = await runCommentatorAgent(post.text, profile.name);
        } catch (err) {
          errors.push(`Comment gen failed for ${post.urn}: ${err instanceof Error ? err.message : "unknown"}`);
          continue;
        }

        const result = await postComment({ postUrn: post.urn, commentText, actorUrn });

        await db.insert(schema.linkedinEngagements).values({
          profileId: profile.id,
          postUrn: post.urn,
          postSnippet: post.text.slice(0, 300),
          commentText,
          status: result.success ? "posted" : "failed",
          composioResult: result.result,
          postedAt: result.success ? new Date().toISOString() : null,
        });

        if (result.success) newPosts++;
        else errors.push(`Post failed: ${result.result}`);
      }

      await db
        .update(schema.watchedProfiles)
        .set({ lastScannedAt: new Date().toISOString() })
        .where(eq(schema.watchedProfiles.id, profile.id));

    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Scan failed");
    }

    results.push({ profileId: profile.id, name: profile.name, newPosts, errors });
  }

  return NextResponse.json({ results });
}
