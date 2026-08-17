const COBALT_API = "https://monceda-grab-api-us.onrender.com/";
const FALLBACK_API = "https://monceda-grab-fallback.onrender.com/extract";

function looksLikeImage(value: unknown) {
  const text = String(value || "")
    .split("?")[0]
    .toLowerCase();

  return /\.(jpe?g|png|webp|gif|avif)$/.test(text);
}

function cobaltReturnedImageOnly(result: any) {
  if (looksLikeImage(result?.filename)) {
    return true;
  }

  if (looksLikeImage(result?.url)) {
    return true;
  }

  const picker = Array.isArray(result?.picker)
    ? result.picker
    : [];

  if (picker.length === 0) {
    return false;
  }

  const hasVideo = picker.some((item: any) => {
    const type = String(
      item?.type || item?.mediaType || "",
    ).toLowerCase();

    return (
      type.includes("video") ||
      /\.(mp4|mov|m4v|webm)$/i.test(
        String(item?.url || "").split("?")[0],
      )
    );
  });

  const hasImage = picker.some((item: any) => {
    const type = String(
      item?.type || item?.mediaType || "",
    ).toLowerCase();

    return (
      type.includes("image") ||
      looksLikeImage(item?.url) ||
      looksLikeImage(item?.filename)
    );
  });

  return hasImage && !hasVideo;
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

function isInstagramMediaPost(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    return (
      host === "instagram.com" &&
      /^\/(?:reel|p|tv)\//i.test(parsed.pathname)
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
    if (isInstagramMediaPost(url)) {
      const fallbackResponse = await fetch(FALLBACK_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ url }),
      });

      let fallbackResult: any = null;

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
            message:
              "Instagram could not provide a downloadable video for this Reel.",
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

    let cobaltResult: any = null;

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

      let fallbackResult: any = null;

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
