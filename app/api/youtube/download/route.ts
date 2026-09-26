import { getYoutubeProcessorAuthHeaders } from "../../_processor-auth";

function getYoutubeProcessorUrl() {
  const value =
    process.env.MONCEDA_YOUTUBE_PROCESSOR_URL?.trim();

  if (!value) {
    throw new Error(
      "MONCEDA_YOUTUBE_PROCESSOR_URL is not configured",
    );
  }

  return value.replace(/\/+$/, "");
}

function isYouTubeUrl(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();

    if (
      host !== "youtube.com" &&
      host !== "www.youtube.com" &&
      host !== "m.youtube.com" &&
      host !== "music.youtube.com" &&
      host !== "youtu.be"
    ) {
      return false;
    }

    if (host === "youtu.be") {
      return parsed.pathname.length > 1;
    }

    return (
      parsed.searchParams.has("v") ||
      /^\/shorts\/[^/]+/i.test(parsed.pathname) ||
      /^\/live\/[^/]+/i.test(parsed.pathname) ||
      /^\/embed\/[^/]+/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

async function proxyYoutubeDownload(url: string) {
  if (!isYouTubeUrl(url)) {
    return Response.json(
      {
        status: "error",
        error: "invalid_youtube_url",
      },
      { status: 400 },
    );
  }

  try {
    const processorUrl = getYoutubeProcessorUrl();

    const upstream = await fetch(
      `${processorUrl}/youtube/download`,
      {
        method: "POST",
        headers: getYoutubeProcessorAuthHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ url }),
        cache: "no-store",
      },
    );

    if (!upstream.ok) {
      const detail = await upstream
        .json()
        .catch(() => null);

      return Response.json(
        {
          status: "error",
          error:
            detail?.error ||
            "youtube_download_failed",
        },
        { status: upstream.status },
      );
    }

    if (!upstream.body) {
      return Response.json(
        {
          status: "error",
          error: "youtube_download_empty",
        },
        { status: 502 },
      );
    }

    const headers = new Headers();

    headers.set(
      "Content-Type",
      upstream.headers.get("Content-Type") ||
        "video/mp4",
    );

    headers.set(
      "Content-Disposition",
      upstream.headers.get("Content-Disposition") ||
        'attachment; filename="youtube-video.mp4"',
    );

    headers.set("Cache-Control", "private, no-store");

    const contentLength =
      upstream.headers.get("Content-Length");

    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error(
      "YouTube download route error:",
      error,
    );

    return Response.json(
      {
        status: "error",
        error: "youtube_download_failed",
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const payload = await request
    .json()
    .catch(() => ({}));

  const url =
    typeof payload?.url === "string"
      ? payload.url.trim()
      : "";

  return proxyYoutubeDownload(url);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  const url =
    requestUrl.searchParams.get("url")?.trim() || "";

  return proxyYoutubeDownload(url);
}
