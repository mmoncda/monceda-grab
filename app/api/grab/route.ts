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

function isInstagramReel(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    return (
      host === "instagram.com" &&
      /^\/reel\//i.test(parsed.pathname)
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

    // 1. Primary processor: Cobalt
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

    const cobaltResult = await cobaltResponse.json();

    if (!cobaltResponse.ok || cobaltResult.status === "error") {
      return Response.json(cobaltResult, {
        status: cobaltResponse.status,
      });
    }

    // 2. Use yt-dlp fallback for:
    //    - Instagram Reels when Cobalt returns only an image
    //    - Bluesky tunnel responses because the current Cobalt
    //      tunnel can return a zero-byte download.
    const shouldUseFallback =
      (
        isInstagramReel(url) &&
        cobaltReturnedImageOnly(cobaltResult)
      ) ||
      (
        isBluesky(url) &&
        cobaltResult?.status === "tunnel"
      );

    // Dailymotion currently returns a broken Cobalt tunnel,
    // while the yt-dlp fallback requires unavailable browser
    // impersonation on the current Render runtime.
    if (
      (
        isDailymotion(url) ||
        isVimeo(url)
      ) &&
      (
        cobaltResult?.status === "tunnel" ||
        cobaltResult?.status === "error"
      )
    ) {
      return Response.json(
        {
          status: "error",
          error: {
            code: "error.api.fetch.fail",
            message:
              isVimeo(url)
                ? "Vimeo downloads are temporarily unavailable while the media processor is being updated."
                : "Dailymotion downloads are temporarily unavailable while the media processor is being updated.",
          },
        },
        { status: 422 },
      );
    }

    if (!shouldUseFallback) {
      return Response.json(cobaltResult);
    }

    // 3. yt-dlp video fallback
    const fallbackResponse = await fetch(FALLBACK_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ url }),
    });

    const fallbackResult = await fallbackResponse.json();

    if (
      fallbackResponse.ok &&
      fallbackResult.status === "ok" &&
      fallbackResult.url
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
            "The primary processor could not provide a usable video and the fallback processor also failed.",
        },
      },
      { status: 422 },
    );
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
