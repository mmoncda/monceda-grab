import { getYoutubeProcessorAuthHeaders } from "../../_processor-auth";

function getYoutubeProcessorUrl() {
  const base =
    process.env.MONCEDA_YOUTUBE_PROCESSOR_URL?.trim();

  if (!base) {
    throw new Error(
      "MONCEDA_YOUTUBE_PROCESSOR_URL is not configured",
    );
  }

  return base.replace(/\/+$/, "");
}

function isYouTubeUrl(value: string) {
  try {
    const parsed = new URL(value);

    const host = parsed.hostname
      .replace(/^www\./, "")
      .toLowerCase();

    if (
      host !== "youtube.com" &&
      host !== "m.youtube.com" &&
      host !== "music.youtube.com" &&
      host !== "youtu.be"
    ) {
      return false;
    }

    if (host === "youtu.be") {
      return Boolean(parsed.pathname.replace(/^\/+/, ""));
    }

    return (
      /^\/watch\/?$/i.test(parsed.pathname) ||
      /^\/shorts\/[^/]+/i.test(parsed.pathname) ||
      /^\/embed\/[^/]+/i.test(parsed.pathname) ||
      /^\/live\/[^/]+/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = String(body?.url || "").trim();

    if (!isYouTubeUrl(url)) {
      return Response.json(
        {
          status: "error",
          error: "invalid_youtube_url",
        },
        {
          status: 400,
        },
      );
    }

    const processorUrl = getYoutubeProcessorUrl();

    const upstream = await fetch(
      `${processorUrl}/youtube/extract`,
      {
        method: "POST",
        headers: getYoutubeProcessorAuthHeaders({
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
        body: JSON.stringify({ url }),
        cache: "no-store",
      },
    );

    const result = await upstream
      .json()
      .catch(() => ({
        status: "error",
        error: "youtube_extract_invalid_response",
      }));

    return Response.json(result, {
      status: upstream.status,
    });
  } catch (error) {
    console.error("YouTube extract route error:", error);

    return Response.json(
      {
        status: "error",
        error: "youtube_extract_failed",
      },
      {
        status: 500,
      },
    );
  }
}
