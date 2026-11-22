import { getInstagramRegularProcessorAuthHeaders } from "../_processor-auth";

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

// When Safari requests a byte range from the mobile Facebook Share Reel
// preview, upstream normalization/CDN may ignore Range and return a full 200.
// Synthesize a correct 206 response, without changing other media previews.
const MOBILE_FB_PREVIEW_BUFFER_CAP = 32 * 1024 * 1024;

function parseMobileFbByteRange(requested: string, total: number):
  | { start: number; end: number }
  | null {
  if (!Number.isSafeInteger(total) || total <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(requested.trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(total - suffix, 0);
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : total - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
        start >= total || start > end) return null;
    end = Math.min(end, total - 1);
  }
  return { start, end };
}

function mobileFbRangeHeaders(upstream: Response, start: number, end: number, total: number): Headers {
  const headers = new Headers();
  const type = upstream.headers.get("Content-Type") || "video/mp4";
  headers.set("Content-Type", type.toLowerCase().startsWith("application/octet-stream") ? "video/mp4" : type);
  headers.set("Content-Length", String(end - start + 1));
  headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", "private, no-store");
  return headers;
}

// Stream only the requested segment, instead of buffering an entire Reel in a
// Cloudflare Worker. The upstream still has to provide its full Content-Length.
function sliceMobileFbVideo(body: ReadableStream<Uint8Array>, start: number, end: number): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const needed = end - start + 1;
  let position = 0;
  let delivered = 0;
  let closed = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (closed) return;
      try {
        while (delivered < needed) {
          const { done, value } = await reader.read();
          if (done) throw new Error("Incomplete upstream video range");
          const chunkStart = position;
          position += value.byteLength;
          const from = Math.max(0, start - chunkStart);
          const to = Math.min(value.byteLength, end + 1 - chunkStart);
          if (to <= from) continue;
          const piece = value.subarray(from, to);
          delivered += piece.byteLength;
          controller.enqueue(piece);
          if (delivered >= needed) {
            closed = true;
            controller.close();
            void reader.cancel().catch(() => undefined);
          }
          return;
        }
      } catch (error) {
        closed = true;
        controller.error(error);
        void reader.cancel().catch(() => undefined);
      }
    },
    async cancel(reason) {
      closed = true;
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}

// Handles only Range requests from the dedicated /share/r/ mobile player.
// Existing desktop paths, Download button, and other media stay untouched.
async function mobileFbRangedPreview(upstream: Response, range: string): Promise<Response | null> {
  // Original upstream already supports correct partial requests.
  if (upstream.status === 206 && /^bytes \d+-\d+\/\d+$/i.test(
    upstream.headers.get("Content-Range") || "")) return null;

  if (upstream.status !== 200 || !upstream.body) {
    await upstream.body?.cancel().catch(() => undefined);
    return new Response("Invalid partial video response", {
      status: 502, headers: { "Cache-Control": "private, no-store" },
    });
  }
  const type = (upstream.headers.get("Content-Type") || "video/mp4").toLowerCase();
  if (!type.startsWith("video/") && !type.startsWith("application/octet-stream")) {
    await upstream.body.cancel().catch(() => undefined);
    return new Response("Unexpected preview media type", { status: 502 });
  }

  const lengthHeader = upstream.headers.get("Content-Length");
  const length = lengthHeader && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : 0;
  if (Number.isSafeInteger(length) && length > 0) {
    const selected = parseMobileFbByteRange(range, length);
    if (!selected) {
      await upstream.body.cancel().catch(() => undefined);
      return new Response(null, { status: 416, headers: {
        "Content-Range": `bytes */${length}`, "Accept-Ranges": "bytes",
      }});
    }
    return new Response(sliceMobileFbVideo(upstream.body, selected.start, selected.end), {
      status: 206,
      headers: mobileFbRangeHeaders(upstream, selected.start, selected.end, length),
    });
  }

  // Some normalizers stream without a size header. Bound the memory used by
  // this fallback and never store the media or affect the download endpoint.
  const reader = upstream.body.getReader();
  const pieces: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MOBILE_FB_PREVIEW_BUFFER_CAP) {
        await reader.cancel().catch(() => undefined);
        return new Response("Preview exceeds worker streaming limit", { status: 502 });
      }
      pieces.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return new Response("Preview stream interrupted", { status: 502 });
  }
  const selected = parseMobileFbByteRange(range, size);
  if (!selected) return new Response(null, { status: 416, headers: {
    "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes",
  }});
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const piece of pieces) {
    bytes.set(piece, offset);
    offset += piece.byteLength;
  }
  const slice = bytes.buffer.slice(selected.start, selected.end + 1);
  return new Response(slice, {
    status: 206,
    headers: mobileFbRangeHeaders(upstream, selected.start, selected.end, size),
  });
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

    const facebookReel = requestUrl.searchParams.get("facebook_reel") === "1" &&
      (mediaHost === "fbcdn.net" || mediaHost.endsWith(".fbcdn.net") || isInstagramMedia);
    const shouldNormalizeInstagram =
      facebookReel || (normalizeInstagram && isInstagramMedia);

    const range = request.headers.get("range");
    const mobileFacebookSharePreview =
      requestUrl.searchParams.get("mobile_fb_share") === "1" &&
      (mediaHost === "fbcdn.net" || mediaHost.endsWith(".fbcdn.net"));


    /*
     * IG-FIX-25A DIRECT INSTAGRAM PREVIEW
     *
     * Preview requests must not launch FFmpeg.
     * Forward byte ranges directly to Instagram CDN.
     * Full MP4 normalization remains download-only.
     */
    /*
     * Regular Instagram Reel/video preview:
     * use the dedicated regular Instagram processor below.
     * Direct CDN preview is intentionally disabled because Instagram
     * CDN responses are not reliable for browser playback.
     */
    if (false && shouldNormalizeInstagram) {
      const previewHeaders = new Headers({
        Accept: "video/*,*/*;q=0.8",
        Referer: "https://www.instagram.com/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      });

      if (range) {
        previewHeaders.set("Range", range);
      }

      const cdnResponse = await fetch(mediaUrl, {
        method: "GET",
        headers: previewHeaders,
        redirect: "manual",
        cache: "no-store",
        signal: request.signal,
      });

      if (
        ![200, 206].includes(cdnResponse.status) ||
        !cdnResponse.body
      ) {
        console.warn(
          "Instagram preview CDN failure:",
          cdnResponse.status,
        );

        return new Response(
          "Instagram preview unavailable",
          {
            status:
              cdnResponse.status === 416
                ? 416
                : 502,
            headers: {
              "Cache-Control": "private, no-store",
            },
          },
        );
      }

      const upstreamType =
        cdnResponse.headers.get("Content-Type") ||
        "application/octet-stream";

      const normalizedType = upstreamType
        .split(";")[0]
        .trim()
        .toLowerCase();

      const validMediaType =
        normalizedType.startsWith("video/") ||
        normalizedType === "application/octet-stream";

      if (!validMediaType) {
        await cdnResponse.body.cancel().catch(
          () => undefined,
        );

        return new Response(
          "Invalid Instagram preview media",
          {
            status: 502,
            headers: {
              "Cache-Control": "private, no-store",
            },
          },
        );
      }

      const headers = new Headers();

      headers.set(
        "Content-Type",
        normalizedType === "application/octet-stream"
          ? "video/mp4"
          : upstreamType,
      );

      for (const name of [
        "Content-Length",
        "Content-Range",
        "Accept-Ranges",
      ]) {
        const value =
          cdnResponse.headers.get(name);

        if (value) {
          headers.set(name, value);
        }
      }

      headers.set(
        "Cache-Control",
        "private, no-store",
      );

      return new Response(
        cdnResponse.body,
        {
          status: cdnResponse.status,
          headers,
        },
      );
    }

    let upstream = shouldNormalizeInstagram
      ? await fetch(
          `${(
            facebookReel ? "https://reel-e349a283---monceda-grab-fallback-cev7vd4azq-as.a.run.app" :
            process.env.MONCEDA_INSTAGRAM_REGULAR_PROCESSOR_URL?.trim() ||
            "https://monceda-grab-fallback-cev7vd4azq-as.a.run.app"
          ).replace(/\/+$/, "")}/instagram/normalize`,
          {
            method: "POST",
            headers: getInstagramRegularProcessorAuthHeaders({
              "Content-Type": "application/json",
              Accept: "video/mp4",
              ...(range ? { Range: range } : {}),
            }),
            body: JSON.stringify({
              url: mediaUrl,
              ...(facebookReel ? { facebook_reel: true } : {}),
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

    const isTikTokTunnelMedia =
      mediaHost === "monceda-grab-api-us.onrender.com";

    const malformedTikTokRange =
      isTikTokTunnelMedia &&
      Boolean(range) &&
      upstream.status === 206 &&
      !upstream.headers.get("Content-Range");

    if (malformedTikTokRange) {
      await upstream.body?.cancel().catch(
        () => undefined,
      );

      upstream = await fetch(mediaUrl, {
        headers: {
          Accept: "video/*,*/*;q=0.8",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        },
        redirect: "follow",
        cache: "no-store",
        signal: request.signal,
      });
    }

    if (!upstream.ok || !upstream.body) {
      return new Response("Preview fetch failed", {
        status: upstream.status || 502,
      });
    }

    // A browser may request only bytes 0-1 or the MP4 index at its end.
    // Only the new mobile FB /share/r/ preview path adapts ignored ranges.
    if (mobileFacebookSharePreview && range) {
      const partial = await mobileFbRangedPreview(upstream, range);
      if (partial) return partial;
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

    const contentRange =
      upstream.headers.get("Content-Range");

    if (contentRange) {
      headers.set("Content-Range", contentRange);
    }

    headers.set(
      "Accept-Ranges",
      upstream.headers.get("Accept-Ranges") || "bytes",
    );

    headers.set("Cache-Control", "private, no-store");

    return new Response(upstream.body, {
      status:
        malformedTikTokRange
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
