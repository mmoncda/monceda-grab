import { getProcessorAuthHeaders } from "../_processor-auth";

function isAllowedPreviewUrl(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();

    return (
      parsed.protocol === "https:" &&
      (
        host === "monceda-grab-api-us.onrender.com" ||
        host.endsWith(".onrender.com") ||
        host === "video.twimg.com" ||
        host.endsWith(".fbcdn.net") ||
        host === "cdninstagram.com" ||
        host.endsWith(".cdninstagram.com") ||
        host.endsWith(".sc-cdn.net")
      )
    );
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);

    const mediaUrl = (
      requestUrl.searchParams.get("url") || ""
    ).replace(/&amp;/g, "&");

    const audioUrl = (
      requestUrl.searchParams.get("audio_url") || ""
    ).replace(/&amp;/g, "&");

    const normalizeInstagram =
      requestUrl.searchParams.get("normalize") === "1";

    if (!isAllowedPreviewUrl(mediaUrl)) {
      return new Response("Invalid preview URL", { status: 400 });
    }

    if (audioUrl && !isAllowedPreviewUrl(audioUrl)) {
      return new Response("Invalid preview audio URL", {
        status: 400,
      });
    }

    const mediaHost =
      new URL(mediaUrl).hostname.toLowerCase();

    const isInstagramMedia =
      mediaHost === "cdninstagram.com" ||
      mediaHost.endsWith(".cdninstagram.com");

    const shouldNormalizeInstagram =
      normalizeInstagram && isInstagramMedia;

    const range = request.headers.get("range");

    const upstream = shouldNormalizeInstagram
      ? await fetch(
          "https://monceda-grab-fallback-37436353153.asia-southeast1.run.app/instagram/normalize",
          {
            method: "POST",
            headers: getProcessorAuthHeaders({
              "Content-Type": "application/json",
              Accept: "video/mp4",
            }),
            body: JSON.stringify({
              url: mediaUrl,
              ...(audioUrl
                ? { audio_url: audioUrl }
                : {}),
            }),
            redirect: "manual",
          },
        )
      : await fetch(mediaUrl, {
          headers: {
            Accept: "video/*,*/*;q=0.8",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
            ...(range ? { Range: range } : {}),
          },
          redirect: "follow",
        });

    if (!upstream.ok || !upstream.body) {
      return new Response("Preview fetch failed", {
        status: upstream.status || 502,
      });
    }

    const headers = new Headers();

    headers.set(
      "Content-Type",
      upstream.headers.get("Content-Type") || "video/mp4",
    );

    const contentLength =
      upstream.headers.get("Content-Length");

    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    if (!shouldNormalizeInstagram) {
      const contentRange =
        upstream.headers.get("Content-Range");

      if (contentRange) {
        headers.set("Content-Range", contentRange);
      }

      headers.set(
        "Accept-Ranges",
        upstream.headers.get("Accept-Ranges") || "bytes",
      );
    }

    headers.set("Cache-Control", "private, no-store");

    return new Response(upstream.body, {
      status: shouldNormalizeInstagram
        ? 200
        : upstream.status === 206
          ? 206
          : 200,
      headers,
    });
  } catch (error) {
    console.error("Preview proxy error:", error);

    return new Response("Preview failed", {
      status: 500,
    });
  }
}
