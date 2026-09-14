import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const grabRoute = await readFile(
  new URL("../app/api/grab/route.ts", import.meta.url),
  "utf8",
);

test("Bluesky fallback authenticates its processor request", () => {
  const marker =
    "const fallbackResponse = await fetch(FALLBACK_API, {";

  const start = grabRoute.indexOf(marker);

  assert.notEqual(
    start,
    -1,
    "Bluesky FALLBACK_API request must exist",
  );

  const end = grabRoute.indexOf("\n      });", start);

  assert.notEqual(
    end,
    -1,
    "Bluesky FALLBACK_API request must have a bounded call block",
  );

  const requestBlock = grabRoute.slice(start, end + 9);

  assert.match(
    requestBlock,
    /headers:\s*getProcessorAuthHeaders\(/,
    "Bluesky processor request must carry internal authentication",
  );

  assert.match(
    requestBlock,
    /redirect:\s*"manual"/,
    "Authenticated processor request must not automatically follow redirects",
  );
});
