const COBALT_API = "https://monceda-grab-api-us.onrender.com/";
const FALLBACK_API =
  "https://monceda-grab-fallback-37436353153.asia-southeast1.run.app/extract";

const INSTAGRAM_STORY_EXTRACT_API =
  "https://monceda-grab-fallback-37436353153.asia-southeast1.run.app/instagram/story/extract";

const FACEBOOK_STORY_EXTRACT_API =
  "https://monceda-grab-fallback-37436353153.asia-southeast1.run.app/facebook/story/extract";

type ApiResult = {
  status?: string;
  url?: string;
  filename?: string;
  audio_url?: string;
  picker?: unknown[];
  items?: unknown[];
  error?: unknown;
  [key: string]: unknown;
};

function looksLikeImage(value: unknown) {
  const text = String(value || "")
    .split("?")[0]
    .toLowerCase();

  return /\.(jpe?g|png|webp|gif|avif)$/.test(text);
}

function getHost(value: string) {
  try {
    return new URL(value)
      .hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return "";
  }
}

function isFacebookStory(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname
      .replace(/^www\./, "")
      .toLowerCase();

    return (
      parsed.protocol === "https:" &&
      (host === "facebook.com" ||
        host === "m.facebook.com") &&
      /^\/stories\//i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}


function isInstagramMediaPost(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    return (
      host === "instagram.com" &&
      /^\/(?:reel|p|tv|stories)\//i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function isInstagramStory(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    return (
      host === "instagram.com" &&
      /^\/stories\//i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function hasInstagramStoryId(value: string) {
  try {
    const parsed = new URL(value);

    return /^\/stories\/[^/]+\/\d+\/?$/i.test(
      parsed.pathname,
    );
  } catch {
    return false;
  }
}

function isBluesky(value: string) {
  return getHost(value) === "bsky.app";
}

function isDailymotion(value: string) {
  const host = getHost(value);
  return host === "dailymotion.com" || host === "dai.ly";
}

function isVimeo(value: string) {
  const host = getHost(value);

  return (
    host === "vimeo.com" ||
    host === "player.vimeo.com"
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = String(body?.url || "").trim();

    if (!url) {
      return Response.json(
        {
          status: "error",
          error: { code: "error.api.link.invalid" },
        },
        { status: 400 },
      );
    }

    /*
     * Instagram media posts:
     * Use our yt-dlp fallback directly.
     *
     * Cobalt currently fails on some public Instagram posts,
     * while the fallback successfully resolves the actual video.
     */
    if (isFacebookStory(url)) {
      const storyResponse = await fetch(
        FACEBOOK_STORY_EXTRACT_API,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ url }),
        },
      );

      let storyResult: ApiResult | null = null;

      try {
        storyResult = await storyResponse.json();
      } catch {
        storyResult = null;
      }

      if (
        !storyResponse.ok ||
        storyResult?.status === "error"
      ) {
        return Response.json(
          storyResult || {
            status: "error",
            error: {
              code: "error.api.fetch.fail",
            },
          },
          {
            status:
              storyResponse.status || 502,
          },
        );
      }

      return Response.json({
        ...storyResult,
        facebook_story: true,
      });
    }

    if (isInstagramMediaPost(url)) {
      const instagramApi =
        isInstagramStory(url) &&
        hasInstagramStoryId(url)
          ? INSTAGRAM_STORY_EXTRACT_API
          : FALLBACK_API;

      const fallbackResponse = await fetch(instagramApi, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ url }),
      });

      let fallbackResult: ApiResult | null = null;

      try {
        fallbackResult = await fallbackResponse.json();
      } catch {
        fallbackResult = null;
      }

      const fallbackItems =
        Array.isArray(fallbackResult?.items)
          ? fallbackResult.items
          : [];

      const hasFallbackMedia =
        Boolean(fallbackResult?.url) ||
        fallbackItems.length > 0;

      if (
        fallbackResponse.ok &&
        fallbackResult?.status === "ok" &&
        hasFallbackMedia
      ) {
        return Response.json({
          ...fallbackResult,
          fallback: true,
          instagram_story: isInstagramStory(url),
          source_url: url,
        });
      }

      return Response.json(
        {
          status: "error",
          error: {
            code: "error.api.fetch.fail",
            message:
              "Instagram could not provide downloadable media for this post.",
          },
        },
        { status: 422 },
      );
    }

    /*
     * Other supported platforms continue using Cobalt.
     */
    const cobaltResponse = await fetch(COBALT_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        url,
        downloadMode: "auto",
        videoQuality: "max",
        filenameStyle: "basic",
      }),
    });

    let cobaltResult: ApiResult | null = null;

    try {
      cobaltResult = await cobaltResponse.json();
    } catch {
      cobaltResult = null;
    }

    if (!cobaltResponse.ok || cobaltResult?.status === "error") {
      if (isVimeo(url)) {
        return Response.json(
          {
            status: "error",
            error: {
              code: "error.api.vimeo.unavailable",
              message:
                "Vimeo downloads are temporarily unavailable because Vimeo currently requires authentication for media extraction.",
            },
          },
          { status: 422 },
        );
      }

      return Response.json(
        cobaltResult || {
          status: "error",
          error: { code: "error.api.fetch.fail" },
        },
        { status: cobaltResponse.status || 502 },
      );
    }

    /*
     * Keep the existing Bluesky fallback behavior.
     */
    if (
      isBluesky(url) &&
      cobaltResult?.status === "tunnel"
    ) {
      const fallbackResponse = await fetch(FALLBACK_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ url }),
      });

      let fallbackResult: ApiResult | null = null;

      try {
        fallbackResult = await fallbackResponse.json();
      } catch {
        fallbackResult = null;
      }

      if (
        fallbackResponse.ok &&
        fallbackResult?.status === "ok" &&
        fallbackResult?.url
      ) {
        return Response.json({
          ...fallbackResult,
          fallback: true,
        });
      }

      return Response.json(
        {
          status: "error",
          error: {
            code: "error.api.fetch.fail",
          },
        },
        { status: 422 },
      );
    }

    if (
      (isDailymotion(url) || isVimeo(url)) &&
      cobaltResult?.status === "tunnel"
    ) {
      return Response.json(
        {
          status: "error",
          error: {
            code: "error.api.fetch.fail",
            message: isVimeo(url)
              ? "Vimeo downloads are temporarily unavailable while the media processor is being updated."
              : "Dailymotion downloads are temporarily unavailable while the media processor is being updated.",
          },
        },
        { status: 422 },
      );
    }

    return Response.json(cobaltResult);
  } catch (error) {
    console.error("Grab proxy error:", error);

    return Response.json(
      {
        status: "error",
        error: { code: "error.api.fetch.fail" },
      },
      { status: 500 },
    );
  }
}
