import { env } from "cloudflare:workers";

const PROCESSOR_TOKEN_ENV = "MONCEDA_PROCESSOR_TOKEN";
const PROCESSOR_TOKEN_HEADER = "X-Monceda-Processor-Token";

export function getProcessorAuthHeaders(
  initialHeaders: HeadersInit = {},
): Headers {
  const token = process.env[PROCESSOR_TOKEN_ENV]?.trim();

  if (!token) {
    throw new Error(
      `${PROCESSOR_TOKEN_ENV} is not configured`,
    );
  }

  const headers = new Headers(initialHeaders);

  headers.set(
    PROCESSOR_TOKEN_HEADER,
    token,
  );

  return headers;
}


export function getYoutubeProcessorAuthHeaders(
  headers?: HeadersInit,
) {
  const token =
    String(env.MONCEDA_YOUTUBE_PROCESSOR_TOKEN || "").trim();

  if (!token) {
    throw new Error(
      "MONCEDA_YOUTUBE_PROCESSOR_TOKEN is not configured",
    );
  }

  const nextHeaders = new Headers(headers);

  nextHeaders.set(
    "X-Monceda-Processor-Token",
    token,
  );

  return nextHeaders;
}

export function getInstagramRegularProcessorAuthHeaders(
  headers: Record<string, string> = {},
) {
  const token =
    String(env.MONCEDA_INSTAGRAM_REGULAR_TOKEN || "").trim();

  if (!token) {
    throw new Error(
      "MONCEDA_INSTAGRAM_REGULAR_TOKEN is not configured",
    );
  }

  return {
    ...headers,
    "X-Monceda-Processor-Token": token,
  };
}

