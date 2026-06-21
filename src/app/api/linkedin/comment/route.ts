import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { getMyPersonUrn, postComment } from "@/lib/linkedin/client";
import { runCommentatorAgent } from "@/lib/agents/commentator-agent";

function extractUrnFromUrl(url: string): string | null {
  const clean = url.trim();

  // Raw URN pasted directly
  if (clean.startsWith("urn:li:")) return clean;

  // /feed/update/urn:li:activity:1234567890/
  const feedUrnMatch = clean.match(/feed\/update\/(urn:li:[^/?&#]+)/);
  if (feedUrnMatch) return decodeURIComponent(feedUrnMatch[1]);

  // /posts/author_slug-activity7234567890123456789-XXXX/  or activity-7234...
  const activityMatch = clean.match(/activity-?(\d{10,})/);
  if (activityMatch) return `urn:li:activity:${activityMatch[1]}`;

  // ugcPost variant: /posts/author_slug-ugcPost7234567890123456789-XXXX/
  const ugcMatch = clean.match(/ugcPost-?(\d{10,})/);
  if (ugcMatch) return `urn:li:ugcPost:${ugcMatch[1]}`;

  // share variant: /posts/author_slug-share-7234567890123456789-XXXX/
  const shareMatch = clean.match(/share-(\d{10,})/);
  if (shareMatch) return `urn:li:share:${shareMatch[1]}`;

  // /feed/update/urn%3Ali%3Aactivity%3A1234567890
  if (clean.includes("%3A")) {
    const decoded = decodeURIComponent(clean);
    const decodedMatch = decoded.match(/(urn:li:[^/?&#\s]+)/);
    if (decodedMatch) return decodedMatch[1];
  }

  return null;
}

export async function POST(req: NextRequest) {
  const { postUrl, postText, authorName, previewOnly } = await req.json() as {
    postUrl: string;
    postText: string;
    authorName?: string;
    previewOnly?: boolean;
  };

  if (!postUrl || !postText) {
    return NextResponse.json({ error: "Post URL and post text are required" }, { status: 400 });
  }

  const postUrn = extractUrnFromUrl(postUrl);
  if (!postUrn) {
    return NextResponse.json({ error: `Could not extract URN from: "${postUrl}" — paste the full LinkedIn post URL (e.g. linkedin.com/posts/author_title-activity1234-XXXX/)` }, { status: 400 });
  }

  // Generate comment
  let commentText: string;
  try {
    commentText = await runCommentatorAgent(postText, authorName || "LinkedIn connection");
  } catch (err) {
    return NextResponse.json({ error: `Comment generation failed: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }

  // Preview only — return generated comment without posting
  if (previewOnly) {
    return NextResponse.json({ ok: false, commentText, postUrn });
  }

  // Get actor URN
  let actorUrn: string;
  try {
    actorUrn = await getMyPersonUrn();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "LinkedIn not connected" }, { status: 500 });
  }

  // Post comment
  const result = await postComment({ postUrn, commentText, actorUrn });

  // Save engagement record
  await db.insert(schema.linkedinEngagements).values({
    profileId: null,
    postUrn,
    postSnippet: postText.slice(0, 300),
    commentText,
    status: result.success ? "posted" : "failed",
    composioResult: result.result,
    postedAt: result.success ? new Date().toISOString() : null,
  });

  return NextResponse.json({ ok: result.success, commentText, postUrn, error: result.success ? undefined : result.result });
}

export async function PUT(req: NextRequest) {
  // Post a manually edited comment
  const { postUrn, commentText } = await req.json() as { postUrn: string; commentText: string };

  if (!postUrn || !commentText) {
    return NextResponse.json({ error: "postUrn and commentText required" }, { status: 400 });
  }

  let actorUrn: string;
  try {
    actorUrn = await getMyPersonUrn();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "LinkedIn not connected" }, { status: 500 });
  }

  const result = await postComment({ postUrn, commentText, actorUrn });

  await db.insert(schema.linkedinEngagements).values({
    profileId: null,
    postUrn,
    postSnippet: "",
    commentText,
    status: result.success ? "posted" : "failed",
    composioResult: result.result,
    postedAt: result.success ? new Date().toISOString() : null,
  });

  return NextResponse.json({ ok: result.success, error: result.success ? undefined : result.result });
}
