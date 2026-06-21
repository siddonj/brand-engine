import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { fetchWordPressPost } from "@/lib/wordpress/client";

// Pulls the current WordPress post content back into the local DB.
// WordPress block markup is stored as a single "raw" block so the teaser
// agent can read the full text content.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const postId = Number(id);

  const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).limit(1);
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (!post.wordpressDraftId) return NextResponse.json({ error: "No WordPress draft ID on this post" }, { status: 400 });

  const wpPost = await fetchWordPressPost(post.wordpressDraftId);
  if (!wpPost) return NextResponse.json({ error: `Could not fetch WordPress post ${post.wordpressDraftId}` }, { status: 502 });

  // Strip Gutenberg block comments and HTML tags to get plain text,
  // then store as a single paragraph block so teaser/other agents can read it.
  const plainText = wpPost.content
    .replace(/<!-- [^>]+ -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const contentBlocks = [{ type: "paragraph", content: plainText }];

  // Sync title, excerpt, slug, and content from WordPress
  await db.update(schema.posts).set({
    title: wpPost.title || post.title,
    excerpt: wpPost.excerpt
      ? wpPost.excerpt.replace(/<[^>]+>/g, "").trim()
      : post.excerpt,
    slug: wpPost.slug || post.slug,
    contentBlocks: JSON.stringify(contentBlocks),
  }).where(eq(schema.posts.id, postId));

  return NextResponse.json({
    ok: true,
    title: wpPost.title,
    slug: wpPost.slug,
    contentLength: plainText.length,
    wordpressLink: wpPost.link,
  });
}
