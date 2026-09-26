import { getProcessorAuthHeaders } from "../_processor-auth";

const STORY_EXTRACT_API =
  "https://monceda-grab-fallback-37436353153.asia-southeast1.run.app/instagram/story/extract";

type StoryItem = {
  id: string;
  url: string;
  ext?: string;
  audio_url?: string;
};

type StoryResult = {
  status?: string;
  items?: StoryItem[];
};

function isAllowedMediaUrl(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();

    return (
      parsed.protocol === "https:" &&
      (
        host === "cdninstagram.com" ||
        host.endsWith(".cdninstagram.com") ||
        host === "fbcdn.net" ||
        host.endsWith(".fbcdn.net")
      )
    );
  } catch {
    return false;
  }
}

function failure(
  code: string,
  status: number,
) {
  return Response.json(
    {
      status: "error",
      error: { code },
    },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);

    const sourceUrl =
      requestUrl.searchParams.get("source_url") || "";

    const itemId =
      requestUrl.searchParams.get("item_id") || "";

    let parsedSource: URL;

    try {
      parsedSource = new URL(sourceUrl);
    } catch {
      return failure("invalid_story_source", 400);
    }

    const host =
      parsedSource.hostname
        .replace(/^www\./, "")
        .toLowerCase();

    if (
      parsedSource.protocol !== "https:" ||
      host !== "instagram.com" ||
      !/^\/stories\/[^/]+(?:\/\d+)?\/?$/i.test(
        parsedSource.pathname,
      ) ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(itemId)
    ) {
      return failure("invalid_story_request", 400);
    }

    /*
     * Refresh the original Story collection.
     * Never reuse the old signed CDN URL.
     */
    const upstream = await fetch(
      STORY_EXTRACT_API,
      {
        method: "POST",
        headers: getProcessorAuthHeaders({
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
        body: JSON.stringify({
          url: sourceUrl,
        }),
        redirect: "manual",
        cache: "no-store",
      },
    );

    if (!upstream.ok) {
      return failure(
        "instagram_story_refresh_failed",
        upstream.status === 422 ? 422 : 502,
      );
    }

    let result: StoryResult;

    try {
      result = await upstream.json();
    } catch {
      return failure(
        "invalid_story_refresh_response",
        502,
      );
    }

    if (
      result.status !== "ok" ||
      !Array.isArray(result.items)
    ) {
      return failure(
        "instagram_story_refresh_failed",
        502,
      );
    }

    /*
     * Exact ID matching is mandatory.
     * Never fall back to the first Story.
     */
    const matches = result.items.filter(
      (item) =>
        item &&
        item.id === itemId,
    );

    if (matches.length !== 1) {
      return failure(
        "instagram_story_item_unavailable",
        404,
      );
    }

    const item = matches[0];

    if (
      typeof item.url !== "string" ||
      !isAllowedMediaUrl(item.url)
    ) {
      return failure(
        "instagram_story_media_unavailable",
        422,
      );
    }

    const mediaUrl =
      item.url.replace(/&amp;/g, "&");

    const audioUrl =
      typeof item.audio_url === "string"
        ? item.audio_url.replace(/&amp;/g, "&")
        : "";

    if (
      audioUrl &&
      !isAllowedMediaUrl(audioUrl)
    ) {
      return failure(
        "invalid_story_audio",
        422,
      );
    }

    const rawExt =
      String(item.ext || "mp4").toLowerCase();

    const allowedExtensions = new Set([
      "mp4",
      "mov",
      "m4v",
      "webm",
      "jpg",
      "jpeg",
      "png",
      "webp",
      "gif",
      "avif",
    ]);

    const ext =
      allowedExtensions.has(rawExt)
        ? rawExt
        : "mp4";

    const filename =
      `instagram_story_${itemId}.${ext}`;

    /*
     * Reuse the existing media download route.
     * Do not change other platform behavior.
     */
    const params = new URLSearchParams({
      url: mediaUrl,
      filename,
    });

    if (audioUrl) {
      params.set("audio_url", audioUrl);
    }

    return new Response(null, {
      status: 303,
      headers: {
        Location:
          `/api/download?${params.toString()}`,
        "Cache-Control": "private, no-store",
      },
    });

  } catch (error) {
    console.error(
      "Instagram Story item refresh error:",
      error instanceof Error
        ? error.name
        : "Unknown error",
    );

    return failure(
      "instagram_story_refresh_failed",
      502,
    );
  }
}
