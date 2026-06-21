import type { GutenbergBlock } from "@/lib/agents/writer-agent";

export function serializeBlocksToWP(blocks: GutenbergBlock[]): string {
  return blocks.map(serializeBlock).join("\n\n");
}

function serializeBlock(block: GutenbergBlock): string {
  switch (block.type) {
    case "heading": {
      const level = block.level || 2;
      return `<!-- wp:heading {"level":${level}} -->\n<h${level}>${block.content || ""}</h${level}>\n<!-- /wp:heading -->`;
    }

    case "paragraph":
      return `<!-- wp:paragraph -->\n<p>${block.content || ""}</p>\n<!-- /wp:paragraph -->`;

    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = (block.items || []).map((item) => `<li>${item}</li>`).join("");
      const ordered = block.ordered ? '{"ordered":true}' : "";
      return `<!-- wp:list ${ordered} -->\n<${tag}>${items}</${tag}>\n<!-- /wp:list -->`;
    }

    case "quote":
      return `<!-- wp:quote -->\n<blockquote class="wp-block-quote"><p>${block.content || ""}</p>${block.citation ? `<cite>${block.citation}</cite>` : ""}</blockquote>\n<!-- /wp:quote -->`;

    case "separator":
      return `<!-- wp:separator -->\n<hr class="wp-block-separator has-alpha-channel-opacity"/>\n<!-- /wp:separator -->`;

    case "callout":
      return `<!-- wp:pullquote -->\n<figure class="wp-block-pullquote"><blockquote><p>${block.content || ""}</p></blockquote></figure>\n<!-- /wp:pullquote -->`;

    case "image": {
      if (!block.url) return "";
      const idAttr = block.mediaId ? `{"id":${block.mediaId},"sizeSlug":"large","linkDestination":"none"}` : `{"sizeSlug":"large","linkDestination":"none"}`;
      const imgClass = block.mediaId ? ` class="wp-image-${block.mediaId}"` : "";
      const caption = block.caption ? `\n<figcaption class="wp-element-caption">${escapeHtml(block.caption)}</figcaption>` : "";
      return `<!-- wp:image ${idAttr} -->\n<figure class="wp-block-image size-large"><img src="${block.url}" alt="${escapeHtml(block.alt || "")}"${imgClass}/>${caption}</figure>\n<!-- /wp:image -->`;
    }

    default:
      return `<!-- wp:paragraph -->\n<p>${block.content || ""}</p>\n<!-- /wp:paragraph -->`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function blocksToHtml(blocks: GutenbergBlock[]): string {
  return blocks.map(blockToHtml).join("\n");
}

function blockToHtml(block: GutenbergBlock): string {
  switch (block.type) {
    case "heading": {
      const level = block.level || 2;
      return `<h${level}>${block.content || ""}</h${level}>`;
    }
    case "paragraph":
      return `<p>${block.content || ""}</p>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = (block.items || []).map((item) => `<li>${item}</li>`).join("");
      return `<${tag}>${items}</${tag}>`;
    }
    case "quote":
      return `<blockquote><p>${block.content || ""}</p>${block.citation ? `<cite>— ${block.citation}</cite>` : ""}</blockquote>`;
    case "separator":
      return `<hr />`;
    case "callout":
      return `<div class="callout"><p>${block.content || ""}</p></div>`;
    default:
      return `<p>${block.content || ""}</p>`;
  }
}
