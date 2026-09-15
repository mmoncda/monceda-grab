const PREVIEW_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";

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

function isRenderTunnelUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();

    return (
      host === "monceda-grab-api-us.onrender.com" ||
      host.endsWith(".onrender.com")
    );
  } catch {
    return false;
  }
}

function mediaHeaders(range?: string | null) {
  const headers: Record<string, string> = {
    Accept: "video/*,*/*;q=0.8",
    "User-Agent": PREVIEW_USER_AGENT,
  };

  if (range) {
    headers.Range = range;
  }

  return headers;
}

function parsePositiveLength(value: string | null) {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const number = Number(value);

  return Number.isSafeInteger(number) && number > 0
    ? number
    : null;
}

function parseRangeStart(value: string | null) {
  if (!value) {
    return null;
  }

  const match = /^bytes=(\d+)-\d*$/i.exec(
    value.trim(),
  );

  if (!match) {
    return null;
  }

  const start = Number(match[1]);

  return Number.isSafeInteger(start) && start >= 0
    ? start
    : null;
}

async function getCompleteLength(mediaUrl: string) {
  try {
    const head = await fetch(mediaUrl, {
      method: "HEAD",
      headers: mediaHeaders(),
      redirect: "follow",
    });

    const length = parsePositiveLength(
      head.headers.get("Content-Length"),
    );

    if (head.body) {
      try {
        await head.body.cancel();
      } catch {
      }
    }

    if (head.ok && length) {
      return length;
    }
  } catch {
  }

  try {
    const probe = await fetch(mediaUrl, {
      headers: mediaHeaders(),
      redirect: "follow",
    });

    const length = parsePositiveLength(
      probe.headers.get("Content-Length"),
    );

    if (probe.body) {
      try {
        await probe.body.cancel();
      } catch {
      }
    }

    if (probe.ok && length) {
      return length;
    }
  } catch {
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const mediaUrl =
      requestUrl.searchParams.get("url") || "";

    if (!isAllowedPreviewUrl(mediaUrl)) {
      return new Response("Invalid preview URL", {
        status: 400,
      });
    }

    const range =
      request.headers.get("range");

    const upstream = await fetch(mediaUrl, {
      headers: mediaHeaders(range),
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
      upstream.headers.get("Content-Type") ||
        "video/mp4",
    );

    const contentLength =
      upstream.headers.get("Content-Length");

    if (contentLength) {
      headers.set(
        "Content-Length",
        contentLength,
      );
    }

    let contentRange =
      upstream.headers.get("Content-Range");

    if (
      !contentRange &&
      upstream.status === 206 &&
      range &&
      contentLength &&
      isRenderTunnelUrl(mediaUrl)
    ) {
      const start = parseRangeStart(range);

      const partialLength =
        parsePositiveLength(contentLength);

      if (
        start !== null &&
        partialLength !== null
      ) {
        const totalLength =
          await getCompleteLength(mediaUrl);

        const end =
          start + partialLength - 1;

        if (
          totalLength !== null &&
          end < totalLength
        ) {
          contentRange =
            `bytes ${start}-${end}/${totalLength}`;
        }
      }
    }

    if (contentRange) {
      headers.set(
        "Content-Range",
        contentRange,
      );
    }

    headers.set(
      "Accept-Ranges",
      upstream.headers.get("Accept-Ranges") ||
        "bytes",
    );

    headers.set(
      "Cache-Control",
      "private, no-store",
    );

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    console.error(
      "Preview proxy error:",
      error,
    );

    return new Response("Preview failed", {
      status: 500,
    });
  }
}
