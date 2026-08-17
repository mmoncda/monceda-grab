function isAllowedMediaUrl(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();

    return (
      parsed.protocol === "https:" &&
      (
        host === "sc-cdn.net" ||
        host.endsWith(".sc-cdn.net") ||
        host === "video.twimg.com" ||
        host.endsWith(".fbcdn.net")
      )
    );
  } catch {
    return false;
  }
}

function sanitizeFilename(value: string) {
  const cleaned = value
    .replace(/[\r\n"]/g, "")
    .replace(/[\/\\]/g, "_")
    .trim();

  if (!cleaned) {
    return "snapchat-media.mp4";
  }

  return /\.[a-z0-9]{2,5}$/i.test(cleaned)
    ? cleaned
    : `${cleaned}.mp4`;
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);

    let mediaUrl =
      requestUrl.searchParams.get("url") || "";

    let audioUrl =
      requestUrl.searchParams.get("audio_url") || "";

    const filename = sanitizeFilename(
      requestUrl.searchParams.get("filename") ||
        "snapchat-media.mp4",
    );

    /*
     * Some processor responses can contain HTML-escaped
     * query separators.
     */
    mediaUrl = mediaUrl.replace(/&amp;/g, "&");
    audioUrl = audioUrl.replace(/&amp;/g, "&");

    if (!isAllowedMediaUrl(mediaUrl)) {
      return Response.json(
        {
          status: "error",
          error: {
            code: "error.api.download.invalid",
          },
        },
        { status: 400 },
      );
    }

    if (
      audioUrl &&
      !isAllowedMediaUrl(audioUrl)
    ) {
      return Response.json(
        {
          status: "error",
          error: {
            code: "error.api.download.invalid",
          },
        },
        { status: 400 },
      );
    }

    const mediaHost = new URL(mediaUrl)
      .hostname
      .toLowerCase();

    const isInstagramMedia =
      mediaHost === "fbcdn.net" ||
      mediaHost.endsWith(".fbcdn.net");

    const upstream = isInstagramMedia
      ? await fetch(
          "https://monceda-grab-fallback.onrender.com/instagram/normalize",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "video/mp4",
            },
            body: JSON.stringify({
              url: mediaUrl,
              ...(audioUrl
                ? { audio_url: audioUrl }
                : {}),
            }),
          },
        )
      : await fetch(mediaUrl, {
          headers: {
            Accept: "video/*,*/*;q=0.8",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
        });

    if (!upstream.ok || !upstream.body) {
      return Response.json(
        {
          status: "error",
          error: {
            code: "error.api.download.fetch",
          },
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
      `attachment; filename="${filename}"`,
    );

    const contentLength =
      upstream.headers.get("Content-Length");

    if (contentLength) {
      headers.set(
        "Content-Length",
        contentLength,
      );
    }

    headers.set(
      "Cache-Control",
      "private, no-store",
    );

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error(
      "Media download proxy error:",
      error,
    );

    return Response.json(
      {
        status: "error",
        error: {
          code: "error.api.download.fetch",
        },
      },
      { status: 500 },
    );
  }
}
