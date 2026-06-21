import { db, schema } from "@/lib/db";

export interface UnsplashPhoto {
  id: string;
  altDescription: string;
  urls: { regular: string; full: string; small: string };
  downloadUrl: string;
  photographer: string;
  photographerUrl: string;
}

async function getAccessKey(): Promise<string> {
  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  const key = map.unsplash_access_key || process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new Error("Unsplash access key not configured in Settings");
  return key;
}

export async function searchPhotos(query: string, count = 1): Promise<UnsplashPhoto[]> {
  const key = await getAccessKey();

  const params = new URLSearchParams({
    query,
    per_page: String(count),
    orientation: "landscape",
    content_filter: "high",
  });

  const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
    headers: { Authorization: `Client-ID ${key}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Unsplash error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    results: Array<{
      id: string;
      alt_description: string;
      urls: { regular: string; full: string; small: string };
      links: { download_location: string };
      user: { name: string; links: { html: string } };
    }>;
  };

  return data.results.map((p) => ({
    id: p.id,
    altDescription: p.alt_description || query,
    urls: p.urls,
    downloadUrl: p.links.download_location,
    photographer: p.user.name,
    photographerUrl: p.user.links.html,
  }));
}

// Required by Unsplash API terms — must trigger download when using a photo
export async function triggerDownload(photo: UnsplashPhoto): Promise<void> {
  try {
    const key = await getAccessKey();
    await fetch(`${photo.downloadUrl}?client_id=${key}`);
  } catch {
    // Non-critical — don't fail the pipeline
  }
}
