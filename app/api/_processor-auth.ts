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
