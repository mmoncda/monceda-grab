const STORY_API =
  "https://monceda-grab-fallback-37436353153.asia-southeast1.run.app/instagram/download";

function isInstagramStory(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    return (
      parsed.protocol === "https:" &&
      host === "instagram.com" &&
      /^\/stories\//i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const url = requestUrl.searchParams.get("url") || "";

    if (!isInstagramStory(url)) {
      return Response.json(
        {
          status: "error",
          error: {
            code: "error.api.link.invalid",
          },
        },
        { status: 400 },
      );
    }

    const upstream = await fetch(STORY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "video/mp4",
      },
      body: JSON.stringify({ url }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");

      console.error(
        "Instagram Story backend failed:",
        upstream.status,
        detail,
      );

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
      'attachment; filename="instagram-story.mp4"',
    );

    const contentLength =
      upstream.headers.get("Content-Length");

    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    headers.set("Cache-Control", "private, no-store");

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error(
      "Instagram Story download proxy error:",
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
