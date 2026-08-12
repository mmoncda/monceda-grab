const COBALT_API = "https://monceda-grab-api-us.onrender.com/";
const FALLBACK_API = "https://monceda-grab-fallback.onrender.com/extract";

function isImageFilename(filename: unknown) {
  return /\.(jpe?g|png|webp|gif)$/i.test(String(filename || ""));
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

    // 2. Cobalt sometimes returns the Reel preview JPG.
    //    Only use fallback for that specific failure.
    const shouldUseFallback =
      isInstagramReel(url) &&
      isImageFilename(cobaltResult.filename);

    if (!shouldUseFallback) {
      return Response.json(cobaltResult);
    }

    // 3. Instagram Reel video fallback: yt-dlp service
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
            "The primary processor returned only a preview image and the video fallback could not retrieve the Reel.",
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
