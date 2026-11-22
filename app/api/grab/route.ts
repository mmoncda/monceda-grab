import {
  getInstagramRegularProcessorAuthHeaders,
  getProcessorAuthHeaders,
} from "../_processor-auth";

const COBALT_API = "https://monceda-grab-api-us.onrender.com/";
const FALLBACK_API =
  "https://monceda-grab-fallback-37436353153.asia-southeast1.run.app/extract";

const INSTAGRAM_PROCESSOR_BASE =
  (
    process.env.MONCEDA_PROCESSOR_URL?.trim() ||
    "https://monceda-grab-fallback-cev7vd4azq-as.a.run.app"
  ).replace(/\/+$/, "");

const INSTAGRAM_STORY_EXTRACT_API =
  `${INSTAGRAM_PROCESSOR_BASE}/instagram/story/extract`;

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

// Resolve public Facebook app share links before choosing an extractor.
// Only permitted Facebook hosts are fetched; never follow arbitrary redirects.
function isFacebookShareLink(value: string): boolean {
  try {
    const u = new URL(value);
    const host = getHost(value);
    return u.protocol === "https:" &&
      ((["facebook.com", "m.facebook.com", "web.facebook.com"].includes(host) &&
        /^\/share\/(?:r|v)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)) ||
       (host === "fb.watch" && /^\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)));
  } catch { return false; }
}

async function resolveFacebookShareLink(value: string): Promise<string | null> {
  if (!isFacebookShareLink(value)) return null;
  const permittedHosts = new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "fb.watch"]);
  const first = new URL(value);
  first.search = ""; // tracking parameters aren't needed to identify the Reel
  let current = first.toString();
  for (let attempt = 0; attempt < 4; attempt++) {
    const parsed = new URL(current);
    if (parsed.protocol !== "https:" || !permittedHosts.has(parsed.hostname.toLowerCase())) return null;
    if (/^\/reel\/\d+\/?$/.test(parsed.pathname))
      return `https://www.facebook.com${parsed.pathname}`;
    try {
      const response = await fetch(current, {
        method: "GET", redirect: "manual", signal: AbortSignal.timeout(6000),
        headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; MoncedaGrab/1.0)" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return null;
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return null;
      const html = (await response.text()).slice(0, 250000)
        .replace(/\\u002[fF]/g, "/").replace(/\\\//g, "/").replace(/&amp;/g, "&");
      const match = html.match(/(?:https?:\/\/(?:www\.|m\.)?facebook\.com)?\/reel\/(\d+)/i);
      return match ? `https://www.facebook.com/reel/${match[1]}` : null;
    } catch { return null; }
  }
  return null;
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
      /^\/(?:reels?|p|tv|stories)\//i.test(parsed.pathname)
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

function isTikTok(value: string) {
  const host = getHost(value);

  return (
    host === "tiktok.com" ||
    host === "vm.tiktok.com" ||
    host === "vt.tiktok.com"
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const submittedUrl = String(body?.url || "").trim();
    const url = isFacebookShareLink(submittedUrl)
      ? (await resolveFacebookShareLink(submittedUrl)) || submittedUrl
      : submittedUrl;

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
          headers: getProcessorAuthHeaders({
            "Content-Type": "application/json",
            Accept: "application/json",
          }),
          body: JSON.stringify({ url }),
          redirect: "manual",
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
        isInstagramStory(url)
          ? INSTAGRAM_STORY_EXTRACT_API
          : FALLBACK_API;

      const instagramRequest: RequestInit = {
        method: "POST",
        headers: isInstagramStory(url)
          ? getProcessorAuthHeaders({
              "Content-Type": "application/json",
              Accept: "application/json",
            })
          : getInstagramRegularProcessorAuthHeaders({
              "Content-Type": "application/json",
              Accept: "application/json",
            }),
        body: JSON.stringify({ url }),
        redirect: "manual",
      };

      let fallbackResponse = await fetch(instagramApi, instagramRequest);
      if (fallbackResponse.status === 422 && /^\/p\/[A-Za-z0-9_-]+\/?$/i.test(new URL(url).pathname)) {
        await fallbackResponse.body?.cancel();
        fallbackResponse = await fetch(
          "https://igphoto-98f7c9a---monceda-grab-fallback-cev7vd4azq-as.a.run.app/extract",
          instagramRequest,
        );
      }

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

      console.warn("[Instagram extraction diagnostic]", {
        upstreamStatus: fallbackResponse.status,
        resultKeys: Object.keys(fallbackResult ?? {}),
        processorReason: String(
          fallbackResult?.reason ?? "No reason provided"
        ).replace(/https?:\/\/\S+/g, "[URL]").slice(0, 1000),
        errorMessage: String(
          typeof fallbackResult?.error === "string"
            ? fallbackResult.error
            : (
                fallbackResult?.error &&
                typeof fallbackResult.error === "object" &&
                "message" in fallbackResult.error
                  ? fallbackResult.error.message
                  : "No error message field"
              )
        ).replace(/https?:\/\/\S+/g, "[URL]").slice(0, 600),
        contentType: fallbackResponse.headers.get("content-type"),
        isStory: isInstagramStory(url),
        resultStatus: fallbackResult?.status ?? null,
        hasUrl: Boolean(fallbackResult?.url),
        itemCount: fallbackItems.length,
        pickerCount: Array.isArray(fallbackResult?.picker)
          ? fallbackResult.picker.length : 0,
        errorCode:
          typeof fallbackResult?.error === "object" &&
          fallbackResult.error !== null &&
          "code" in fallbackResult.error
            ? fallbackResult.error.code : null,
      });

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
    const reel = new URL(url);
    const isFacebookReel = reel.protocol === "https:" &&
      ["facebook.com", "m.facebook.com"].includes(getHost(url)) &&
      /^\/reel\/\d+\/?$/.test(reel.pathname);
    if (isFacebookReel) {
      const response = await fetch("https://reel-e349a283---monceda-grab-fallback-cev7vd4azq-as.a.run.app/extract", {
        method: "POST",
        headers: getInstagramRegularProcessorAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ url }),
        redirect: "manual",
      });
      if (response.ok) {
        const media: ApiResult = await response.json();
        if (media.status === "ok" && typeof media.url === "string" && media.url.startsWith("https://")) {
          return Response.json({ ...media, fallback: true, facebook_reel: true });
        }
      }
      return Response.json({ status: "error", error: { code: "error.api.fetch.fail" } },
        { status: response.ok ? 502 : response.status });
    }

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
      if (isTikTok(url)) {
        try {
          const response = await fetch(FALLBACK_API, {
            method: "POST",
            headers: getInstagramRegularProcessorAuthHeaders({
              "Content-Type": "application/json",
              Accept: "application/json",
            }),
            body: JSON.stringify({ url }),
            redirect: "manual",
          });
          if (response.ok) {
            const media: ApiResult = await response.json();
            if (media?.status === "ok" && typeof media.url === "string" && media.url.startsWith("https://")) {
              return Response.json({ ...media, fallback: true });
            }
          }
        } catch {
          // Continue to the original error response.
        }
      }
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
        headers: getProcessorAuthHeaders({
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
        body: JSON.stringify({ url }),
        redirect: "manual",
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

    /*
     * TikTok:
     * Keep Cobalt as the working media/download source.
     * Ask the existing yt-dlp processor only for metadata,
     * then merge safe text fields into the response.
     *
     * If metadata lookup fails, the original Cobalt response
     * is returned unchanged.
     */
    if (isTikTok(url)) {
      try {
        const metadataResponse = await fetch(FALLBACK_API, {
          method: "POST",
          headers: getInstagramRegularProcessorAuthHeaders({
            "Content-Type": "application/json",
            Accept: "application/json",
          }),
          body: JSON.stringify({ url }),
          redirect: "manual",
        });

        const metadataResult: ApiResult | null =
          await metadataResponse
            .json()
            .catch(() => null);

        if (
          metadataResponse.ok &&
          metadataResult?.status === "ok"
        ) {
          const title =
            typeof metadataResult.title === "string"
              ? metadataResult.title.trim()
              : "";

          const description =
            typeof metadataResult.description === "string"
              ? metadataResult.description.trim()
              : "";

          const uploader =
            typeof metadataResult.uploader === "string"
              ? metadataResult.uploader.trim()
              : "";

          return Response.json({
            ...cobaltResult,
            ...(title ? { title } : {}),
            ...(description ? { description } : {}),
            ...(uploader ? { uploader } : {}),
          });
        }
      } catch (error) {
        console.warn(
          "[TikTok metadata enrichment failed]",
          error instanceof Error
            ? error.message
            : "unknown error",
        );
      }
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
