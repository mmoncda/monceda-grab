import { writeFileSync, unlinkSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const requiredSecrets = [
  "INSTAGRAM_COOKIES",
  "FACEBOOK_COOKIES",
];

const missing = requiredSecrets.filter(
  (name) => !process.env[name] || process.env[name].length === 0,
);

if (missing.length > 0) {
  console.error(
    `Missing required Cloudflare build secret(s): ${missing.join(", ")}`,
  );
  process.exitCode = 1;
} else {
  const secrets = Object.fromEntries(
    requiredSecrets.map((name) => [name, process.env[name]]),
  );

  const secretsFile = join(
    tmpdir(),
    `monceda-grab-processor-secrets-${randomUUID()}.json`,
  );

  try {
    writeFileSync(
      secretsFile,
      JSON.stringify(secrets),
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );

    chmodSync(secretsFile, 0o600);

    console.log("Cloudflare processor secrets prepared securely.");
    console.log("Secret values will not be printed.");

    const result = spawnSync(
      "npx",
      [
        "wrangler",
        "deploy",
        "--config",
        "wrangler.processor.jsonc",
        "--secrets-file",
        secretsFile,
      ],
      {
        stdio: "inherit",
        env: process.env,
      },
    );

    if (result.error) {
      console.error(`Wrangler launch failed: ${result.error.message}`);
      process.exitCode = 1;
    } else {
      process.exitCode = result.status ?? 1;
    }
  } finally {
    try {
      unlinkSync(secretsFile);
      console.log("Temporary secrets file removed.");
    } catch {
      // Nothing to remove.
    }
  }
}
