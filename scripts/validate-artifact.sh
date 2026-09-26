#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

worker="${SITES_PROJECT_ROOT}/dist/server/index.js"
hosting="${SITES_PROJECT_ROOT}/dist/.openai/hosting.json"

[[ -f "${worker}" ]] || {
  echo "Missing Sites Worker entry: dist/server/index.js" >&2
  exit 66
}
[[ -f "${hosting}" ]] || {
  echo "Missing packaged Sites manifest: dist/.openai/hosting.json" >&2
  exit 66
}

# MG-RELEASE-6: Refuse to validate an artifact containing secrets.
node --input-type=module - "${SITES_PROJECT_ROOT}" <<'NODE'
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
const dist = path.join(root, "dist");
const envPath = path.join(root, ".env.local");

let token = "";

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(
      /^\s*(?:export\s+)?MONCEDA_PROCESSOR_TOKEN\s*=\s*(.*)$/
    );

    if (match) {
      token = match[1].trim();

      if (
        token.length >= 2 &&
        ((token.startsWith('"') && token.endsWith('"')) ||
         (token.startsWith("'") && token.endsWith("'")))
      ) {
        token = token.slice(1, -1);
      }
      break;
    }
  }
}

const secretBytes = token ? Buffer.from(token) : null;
const findings = [];
let checked = 0;

function inspect(directory) {
  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    const fullPath = path.join(directory, entry.name);
    const relative = path.relative(dist, fullPath);

    if (entry.isSymbolicLink()) {
      findings.push(`${relative}: unexpected symlink`);
      continue;
    }

    if (entry.isDirectory()) {
      inspect(fullPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    checked++;

    if (/^\.(?:dev\.vars|env)(?:\..*)?$/.test(entry.name)) {
      findings.push(`${relative}: environment file in artifact`);
      continue;
    }

    if (
      secretBytes &&
      fs.readFileSync(fullPath).includes(secretBytes)
    ) {
      findings.push(`${relative}: processor token in artifact`);
    }
  }
}

inspect(dist);

console.log(`Release safety: scanned ${checked} artifact files`);

if (findings.length) {
  for (const finding of findings) {
    console.error(`STOP — ${finding}`);
  }

  process.exit(65);
}

console.log(
  secretBytes
    ? "PASS — No local processor token or environment files in artifact"
    : "PASS — No environment files; exact-token scan unavailable"
);
NODE

node --input-type=module - "${worker}" "${hosting}" <<'NODE'
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [workerPath, hostingPath] = process.argv.slice(2);
JSON.parse(await readFile(hostingPath, "utf8"));

const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set("sites-validation", `${process.pid}-${Date.now()}`);
const worker = await import(workerUrl.href);
if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error("dist/server/index.js must have an ESM default export with fetch(request, env, ctx)");
}
NODE

echo "Validated Sites artifact: ESM Worker default.fetch and hosting manifest are present."
