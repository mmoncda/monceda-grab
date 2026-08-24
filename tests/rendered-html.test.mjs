import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../dist/server/index.js";

const origin = "https://grab.moncedalabs.com";
const context = {
  waitUntil() {},
  passThroughOnException() {},
};

async function render(pathname) {
  const response = await worker.fetch(
    new Request(`${origin}${pathname}`),
    {},
    context,
  );

  assert.equal(response.status, 200, `${pathname} should render successfully`);
  return response.text();
}

const expectedCanonicals = [
  "/about",
  "/privacy",
  "/terms",
  "/copyright",
  "/guides",
  "/guides/how-to-save-your-own-public-media",
  "/guides/public-links-private-content-and-permission",
  "/guides/choose-video-quality-and-file-format",
  "/guides/protect-privacy-when-using-link-tools",
];

test("indexable pages render one self-referencing canonical", async () => {
  for (const pathname of expectedCanonicals) {
    const html = await render(pathname);
    const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)];

    assert.equal(canonicals.length, 1, `${pathname} should have one canonical`);
    assert.equal(canonicals[0][1], `${origin}${pathname}`);
  }
});

test("guide pages render unique titles and substantial editorial copy", async () => {
  const pages = await Promise.all(
    expectedCanonicals
      .filter((pathname) => pathname.startsWith("/guides/"))
      .map(async (pathname) => ({ pathname, html: await render(pathname) })),
  );

  const titles = pages.map(({ html }) => html.match(/<title>([^<]+)<\/title>/)?.[1]);
  assert.equal(new Set(titles).size, pages.length);

  for (const { pathname, html } of pages) {
    const visibleText = html
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<style[\s\S]*?<\/style>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[^;]+;/g, " ");
    const wordCount = visibleText.match(/[A-Za-z0-9’'-]+/g)?.length ?? 0;
    assert.ok(wordCount >= 450, `${pathname} rendered only ${wordCount} words`);
  }
});

test("built ads.txt authorizes the configured AdSense publisher", async () => {
  const ads = await readFile(new URL("../dist/client/ads.txt", import.meta.url), "utf8");
  assert.equal(
    ads.trim(),
    "google.com, pub-8831839251689024, DIRECT, f08c47fec0942fa0",
  );
});
