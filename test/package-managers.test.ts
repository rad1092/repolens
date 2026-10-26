import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { runAudit } from "../src/runner.js";
import {
  parseBunLockfile,
  parsePnpmLockfile,
  parseYarnLockfile,
} from "../src/validation/lockfiles.js";
import { invokedPackageScripts } from "../src/validation/shell.js";

const execFileAsync = promisify(execFile);
const gitEnvironment = {
  ...process.env,
  GIT_AUTHOR_NAME: "RepoLens Test",
  GIT_AUTHOR_EMAIL: "repolens@example.invalid",
  GIT_COMMITTER_NAME: "RepoLens Test",
  GIT_COMMITTER_EMAIL: "repolens@example.invalid",
};

const manifest = {
  dependencies: { "left-pad": "^1.3.0", "@scope/kit": "~2.0.0" },
  devDependencies: { typescript: "^5.4.0" },
};

test("pnpm lockfile v9 agreement and peer suffixes", () => {
  const raw = `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      left-pad:
        specifier: ^1.3.0
        version: 1.3.0
      '@scope/kit':
        specifier: ~2.0.0
        version: 2.0.1(react@18.2.0)
    devDependencies:
      typescript:
        specifier: ^5.4.0
        version: 5.4.5
packages: {}
`;
  const parsed = parsePnpmLockfile(raw, manifest);
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.mismatches, []);
  assert.equal(parsed.locked.get("@scope/kit"), "2.0.1");

  const drifted = parsePnpmLockfile(raw.replace("specifier: ^5.4.0", "specifier: ^5.0.0"), manifest);
  assert.deepEqual(drifted.mismatches, [
    { scope: "devDependencies", name: "typescript", expected: "^5.4.0", actual: "^5.0.0" },
  ]);
});

test("pnpm lockfile v5 keeps specifiers at the root", () => {
  const raw = `lockfileVersion: 5.4
specifiers:
  left-pad: ^1.3.0
dependencies:
  left-pad: 1.3.0
`;
  const parsed = parsePnpmLockfile(raw, { dependencies: { "left-pad": "^1.3.0" } });
  assert.deepEqual(parsed.mismatches, []);
  assert.equal(parsed.locked.get("left-pad"), "1.3.0");
});

test("yarn classic and berry lockfiles need an entry per declared range", () => {
  const classic = `# yarn lockfile v1

"@scope/kit@~2.0.0":
  version "2.0.1"
  resolved "https://registry.yarnpkg.com/@scope/kit/-/kit-2.0.1.tgz"

left-pad@^1.3.0, left-pad@^1.0.0:
  version "1.3.0"
`;
  const parsed = parseYarnLockfile(classic, manifest);
  assert.equal(parsed.error, null);
  assert.deepEqual(
    parsed.mismatches.map((mismatch) => mismatch.name),
    ["typescript@^5.4.0"],
  );
  assert.equal(parsed.locked.get("left-pad"), "1.3.0");

  const berry = `__metadata:
  version: 8
  cacheKey: 10c0

"left-pad@npm:^1.3.0":
  version: 1.3.0
  resolution: "left-pad@npm:1.3.0"

"@scope/kit@npm:~2.0.0":
  version: 2.0.1

"typescript@npm:^5.4.0, typescript@npm:^5.0.0":
  version: 5.4.5
`;
  assert.deepEqual(parseYarnLockfile(berry, manifest).mismatches, []);
});

test("text bun.lock agreement with trailing commas", () => {
  const raw = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "app",
      "dependencies": {
        "left-pad": "^1.3.0",
        "@scope/kit": "~2.0.0",
      },
      "devDependencies": {
        "typescript": "^5.4.0",
      },
    },
  },
  "packages": {
    "left-pad": ["left-pad@1.3.0", "", {}, "sha512-x"],
    "@scope/kit": ["@scope/kit@2.0.1", "", {}, "sha512-y"],
  },
}
`;
  const parsed = parseBunLockfile(raw, manifest);
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.mismatches, [
    { scope: "packages", name: "typescript", expected: "installed package entry", actual: null },
  ]);
  assert.equal(parsed.locked.get("@scope/kit"), "2.0.1");
});

test("pnpm, yarn and bun script runs count as workflow wiring", () => {
  assert.deepEqual(invokedPackageScripts("pnpm test && pnpm run lint"), ["test", "lint"]);
  assert.deepEqual(invokedPackageScripts("pnpm --filter web build"), ["build"]);
  assert.deepEqual(invokedPackageScripts("pnpm install --frozen-lockfile"), []);
  assert.deepEqual(invokedPackageScripts("yarn lint; yarn install"), ["lint"]);
  assert.deepEqual(invokedPackageScripts("bun run build && bun test"), ["build"]);
  assert.deepEqual(invokedPackageScripts("CI=1 npm run build"), ["build"]);
  assert.deepEqual(invokedPackageScripts("npm ci && npm test"), ["test"]);
  assert.deepEqual(invokedPackageScripts("echo pnpm build"), []);
});

async function pnpmRepository(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "repolens-pnpm-"));
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({
      name: "pnpm-fixture",
      private: true,
      packageManager: "pnpm@9.12.0",
      scripts: { test: "node --test", lint: "tsc --noEmit", build: "tsc" },
      dependencies: { "left-pad": "^1.3.0" },
    }, null, 2)}\n`,
  );
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      left-pad:
        specifier: ^1.3.0
        version: 1.3.0
`,
  );
  await writeFile(
    join(root, ".github", "workflows", "ci.yml"),
    `name: CI
on:
  pull_request:
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint && pnpm test && pnpm run build
`,
  );
  await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
  await execFileAsync("git", ["add", "-A"], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "fixture"], { cwd: root, env: gitEnvironment });
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test("a pnpm repository is checked against pnpm-lock.yaml and its pnpm scripts", async () => {
  const fixture = await pnpmRepository();
  try {
    const result = await runAudit({
      target: fixture.root,
      configPath: null,
      baselinePath: null,
      failOn: "none",
      strict: false,
      offline: true,
      githubToken: null,
      now: new Date("2026-07-29T00:00:00.000Z"),
    });
    const ruleIds = result.report.findings.map((finding) => finding.ruleId);
    assert.equal(ruleIds.includes("node/lockfile-syntax"), false, ruleIds.join(", "));
    assert.equal(ruleIds.includes("node/lockfile-sync"), false, ruleIds.join(", "));
    assert.equal(ruleIds.includes("workflow/script-wiring"), false, ruleIds.join(", "));
  } finally {
    await fixture.cleanup();
  }
});

test("a declared package manager without its lockfile is reported by name", async () => {
  const fixture = await pnpmRepository();
  try {
    await execFileAsync("git", ["rm", "-q", "pnpm-lock.yaml"], { cwd: fixture.root });
    await execFileAsync("git", ["commit", "-q", "-m", "drop lock"], { cwd: fixture.root, env: gitEnvironment });
    const result = await runAudit({
      target: fixture.root,
      configPath: null,
      baselinePath: null,
      failOn: "none",
      strict: false,
      offline: true,
      githubToken: null,
      now: new Date("2026-07-29T00:00:00.000Z"),
    });
    const missing = result.report.findings.find((finding) => finding.ruleId === "node/lockfile-syntax");
    assert.ok(missing);
    assert.match(missing.summary, /pnpm-lock\.yaml is missing/);
    assert.ok(missing.evidence.some((item) => item.value === "pnpm install --lockfile-only"));
  } finally {
    await fixture.cleanup();
  }
});

test("acceptance expiry accepts durations", async () => {
  const { resolveExpiry } = await import("../src/setup.js");
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(resolveExpiry("30d", now), "2026-01-31T00:00:00.000Z");
  assert.equal(resolveExpiry("1y", now), "2027-01-01T00:00:00.000Z");
  assert.equal(resolveExpiry(null, now), "2026-04-01T00:00:00.000Z");
  assert.equal(resolveExpiry("2027-05-01T00:00:00Z", now), "2027-05-01T00:00:00Z");
});
