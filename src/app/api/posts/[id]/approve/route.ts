import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { createWordPressDraft, uploadMediaFromUrl, getCategories, getTags, createTag } from "@/lib/wordpress/client";
import { searchPhotos, triggerDownload } from "@/lib/unsplash/client";
import type { GutenbergBlock } from "@/lib/agents/writer-agent";
import { simpleCompletion } from "@/lib/agents/completion";

// Use Claude to generate Unsplash-friendly search queries from post content
async function generateImageQueries(title: string, blocks: GutenbergBlock[]): Promise<string[]> {
  const headings = blocks
    .filter((b) => b.type === "heading" && b.level === 2 && b.content)
    .map((b) => b.content as string)
    .slice(0, 5);

  const prompt = `You are helping find stock photos on Unsplash for a PropTech/real estate technology blog post.

Post title: "${title}"
Section headings: ${headings.map(h => `"${h}"`).join(", ") || "(none)"}

Generate exactly 4 Unsplash search queries — one for the featured/hero image and three for body images placed throughout the post.

Rules for good Unsplash queries:
- Unsplash has photos of: apartments, buildings, offices, technology, computers, people working, cityscapes, construction, meetings, etc.
- Unsplash does NOT have: PropTech logos, specific software UIs, niche industry diagrams
- Use 2-4 word concrete visual descriptions (what would a photographer caption this photo?)
- Map industry jargon to visual equivalents: "multifamily" → "apartment building", "AI" → "data center" or "laptop screen code", "leasing" → "apartment tour" or "signing documents", "cybersecurity" → "server room security", "access control" → "building entrance keypad", "property management" → "property manager office"
- Prefer: modern, professional, clean, architectural
- Avoid: religion, people (unless clearly professional context), abstract concepts

Return ONLY a JSON array of 4 strings, no explanation:
["query 1", "query 2", "query 3", "query 4"]`;

  try {
    const text = await simpleCompletion(prompt, 200);
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const queries = JSON.parse(match[0]) as string[];
      if (Array.isArray(queries) && queries.length > 0) return queries;
    }
  } catch {
    // Fall through to defaults
  }

  return ["apartment building exterior", "modern office technology", "real estate professional", "smart building lobby"];
}

// Use Claude to select categories and tags from the existing WP taxonomy
async function selectTaxonomy(
  title: string,
  excerpt: string,
  categories: { id: number; name: string }[],
  tags: { id: number; name: string }[]
): Promise<{ categoryIds: number[]; tagNames: string[] }> {
  const prompt = `You are categorizing a PropTech/real estate technology blog post for WordPress.

Post title: "${title}"
Post excerpt: "${excerpt}"

Available categories (pick 1-3 most relevant):
${categories.map((c) => `  ${c.id}: ${c.name}`).join("\n")}

Available tags (pick 3-6 most relevant, you may also suggest new tags not in this list):
${tags.map((t) => `  ${t.name}`).join(", ")}

Return ONLY valid JSON in this exact shape:
{
  "categoryIds": [<array of category IDs as numbers>],
  "tagNames": [<array of tag name strings — use exact existing names where possible, add new ones if needed>]
}`;

  try {
    const text = await simpleCompletion(prompt, 300);
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]) as { categoryIds: number[]; tagNames: string[] };
    }
  } catch {
    // Fall through
  }
  return { categoryIds: [], tagNames: [] };
}

// Weave image blocks into content after every ~3 H2 sections
function weaveImages(blocks: GutenbergBlock[], imageBlocks: GutenbergBlock[]): GutenbergBlock[] {
  if (imageBlocks.length === 0) return blocks;

  const result: GutenbergBlock[] = [];
  let h2Count = 0;
  let imageIndex = 0;

  for (const block of blocks) {
    result.push(block);

    if (block.type === "heading" && block.level === 2) {
      h2Count++;
      // Insert an image after the 2nd, 4th, 6th H2 (skipping the first section)
      if (h2Count % 2 === 0 && imageIndex < imageBlocks.length) {
        result.push(imageBlocks[imageIndex]);
        imageIndex++;
      }
    }
  }

  return result;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const postId = Number(id);

  const [post] = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .limit(1);

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  let blocks: GutenbergBlock[] = [];
  try {
    blocks = JSON.parse(post.contentBlocks) as GutenbergBlock[];
  } catch {
    return NextResponse.json({ error: "Invalid content blocks" }, { status: 400 });
  }

  // --- Image pipeline ---
  let featuredMediaId: number | undefined;
  let featuredImageUrl: string | undefined;
  const imageBlocks: GutenbergBlock[] = [];
  const imageWarnings: string[] = [];

  try {
    const queries = await generateImageQueries(post.title, blocks);
    const [featuredQuery, ...bodyQueries] = queries;

    // Section headings — used to give each body image contextual alt text
    const h2Headings = blocks
      .filter((b) => b.type === "heading" && b.level === 2 && b.content)
      .map((b) => b.content as string);

    // Fetch featured image — fallback to generic if query returns nothing
    let featuredPhotos = await searchPhotos(featuredQuery, 1);
    if (featuredPhotos.length === 0) {
      featuredPhotos = await searchPhotos("modern apartment building exterior", 1);
    }
    if (featuredPhotos.length > 0) {
      const photo = featuredPhotos[0];
      await triggerDownload(photo);
      try {
        const slug = post.slug.slice(0, 40);
        // Alt text: keyphrase + post title context, max ~125 chars for SEO
        const altText = `${post.focusKeyphrase} - ${post.title}`.slice(0, 125);
        const media = await uploadMediaFromUrl({
          imageUrl: photo.urls.regular,
          filename: `${slug}-featured`,
          altText,
        });
        featuredMediaId = media.id;
        featuredImageUrl = media.url;
      } catch (err) {
        imageWarnings.push(`Featured image upload failed: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    // Fetch body images (up to 3, one per section topic)
    for (let i = 0; i < bodyQueries.slice(0, 3).length; i++) {
      const query = bodyQueries[i];
      try {
        let photos = await searchPhotos(query, 1);
        if (photos.length === 0) {
          photos = await searchPhotos("modern office building technology", 1);
        }
        if (photos.length > 0) {
          const photo = photos[0];
          await triggerDownload(photo);
          const slug = post.slug.slice(0, 30);
          // Alt text: keyphrase + relevant section heading for context
          const sectionContext = h2Headings[i] || post.title;
          const altText = `${post.focusKeyphrase} - ${sectionContext}`.slice(0, 125);
          const media = await uploadMediaFromUrl({
            imageUrl: photo.urls.regular,
            filename: `${slug}-${imageBlocks.length + 1}`,
            altText,
          });
          imageBlocks.push({
            type: "image",
            url: media.url,
            alt: altText,
            caption: `Photo by ${photo.photographer} on Unsplash`,
            mediaId: media.id,
          });
        }
      } catch (err) {
        imageWarnings.push(`Body image ${imageBlocks.length + 1} failed: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }
  } catch (err) {
    // Unsplash not configured or rate-limited — continue without images
    imageWarnings.push(`Image pipeline skipped: ${err instanceof Error ? err.message : "unknown"}`);
  }

  // Weave body images into the blocks
  const enrichedBlocks = weaveImages(blocks, imageBlocks);

  // --- Taxonomy pipeline ---
  let categoryIds: number[] = [];
  let tagIds: number[] = [];

  try {
    if (true) {
      const [wpCategories, wpTags] = await Promise.all([getCategories(), getTags()]);
      const { categoryIds: selectedCatIds, tagNames } = await selectTaxonomy(
        post.title,
        post.excerpt,
        wpCategories,
        wpTags
      );

      categoryIds = selectedCatIds.filter((id) => wpCategories.some((c) => c.id === id));

      // Match tag names to existing IDs, create new ones if needed
      for (const name of tagNames) {
        const existing = wpTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          tagIds.push(existing.id);
        } else {
          const created = await createTag(name);
          if (created) tagIds.push(created.id);
        }
      }
    }
  } catch (err) {
    console.error("Taxonomy pipeline failed:", err);
    imageWarnings.push(`Taxonomy skipped: ${err instanceof Error ? err.message : "unknown"}`);
  }

  try {
    const wpPost = await createWordPressDraft({
      title: post.title,
      blocks: enrichedBlocks,
      slug: post.slug,
      excerpt: post.excerpt,
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      focusKeyphrase: post.focusKeyphrase,
      featuredMediaId,
      featuredImageUrl,
      categoryIds,
      tagIds,
    });

    await db
      .update(schema.posts)
      .set({
        status: "approved",
        wordpressDraftId: wpPost.id,
        approvedAt: new Date().toISOString(),
      })
      .where(eq(schema.posts.id, postId));

    return NextResponse.json({
      wordpressId: wpPost.id,
      link: wpPost.link,
      imagesAdded: imageBlocks.length,
      featuredImageSet: !!featuredMediaId,
      categoriesSet: categoryIds.length,
      tagsSet: tagIds.length,
      warnings: imageWarnings.length > 0 ? imageWarnings : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "WordPress publish failed" },
      { status: 500 }
    );
  }
}
