import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { auditTarget } from "../src/audit.js";
import { parseCliArgs } from "../src/cli.js";
import { TOOL_VERSION } from "../src/constants.js";
import { renderHtml, renderJson, renderTerminal } from "../src/reporters.js";
import { prepareRepository } from "../src/scanner.js";

const execFileAsync = promisify(execFile);
const testRoot = dirname(fileURLToPath(import.meta.url));
const sourceFixture = resolve(testRoot, "../../test/fixtures/mixed");

test("keeps the CLI version synchronized with package metadata", async () => {
  const packageJson = JSON.parse(
    await readFile(resolve(testRoot, "../../package.json"), "utf8"),
  ) as { version?: string };
  assert.equal(TOOL_VERSION, packageJson.version);
});

async function makeGitFixture(): Promise<{
  root: string;
  cleanup: () => Promise<void>;
}> {
  const temporary = await mkdtemp(join(tmpdir(), "repolens-test-"));
  const root = join(temporary, "mixed");
  await cp(sourceFixture, root, { recursive: true });
  await writeFile(join(root, "large.dat"), "x".repeat(2_048), "utf8");
  await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
  await execFileAsync("git", ["add", "-f", "."], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "fixture commit"], {
    cwd: root,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "RepoLens Test",
      GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "RepoLens Test",
      GIT_COMMITTER_EMAIL: "test@example.invalid",
    },
  });
  return {
    root,
    cleanup: async () => rm(temporary, { recursive: true, force: true }),
  };
}

test("parses CLI formats and refuses raw tokens", () => {
  const parsed = parseCliArgs([
    "owner/repository",
    "--format",
    "all",
    "--output",
    "reports",
    "--offline",
    "--large-file-mb",
    "2",
  ]);
  assert.notEqual(parsed, "help");
  assert.notEqual(parsed, "version");
  if (typeof parsed === "string") return;

  assert.equal(parsed.target, "owner/repository");
  assert.deepEqual(parsed.formats, ["terminal", "json", "html"]);
  assert.equal(parsed.output, "reports");
  assert.equal(parsed.offline, true);
  assert.equal(parsed.largeFileBytes, 2 * 1024 * 1024);
  assert.throws(
    () => parseCliArgs([".", "--token", "secret"]),
    /Raw tokens are not accepted/,
  );
});

test("refuses credentials embedded in GitHub URLs without echoing them", async () => {
  await assert.rejects(
    prepareRepository(
      "https://user:supersecret@github.com/owner/repository",
      null,
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /use --token-env/);
      assert.doesNotMatch(error.message, /supersecret/);
      return true;
    },
  );
});

test("audits a tracked fixture and produces prioritized actions", async () => {
  const fixture = await makeGitFixture();
  try {
    const report = await auditTarget(fixture.root, {
      now: new Date("2026-07-28T00:00:00.000Z"),
      staleDays: 3650,
      largeFileBytes: 1024,
      maxTodoMatches: 10,
      offline: true,
      githubToken: null,
    });

    assert.equal(report.repository.kind, "local");
    assert.equal(report.schemaVersion, 1);
    assert.ok(report.score < 100);
    assert.equal(
      report.findings.find((item) => item.id === "readme")?.severity,
      "pass",
    );
    assert.equal(
      report.findings.find((item) => item.id === "license")?.severity,
      "warning",
    );
    assert.equal(
      report.findings.find((item) => item.id === "ci")?.severity,
      "pass",
    );
    assert.equal(
      report.findings.find((item) => item.id === "tracked-env")?.severity,
      "critical",
    );
    assert.match(
      report.findings.find((item) => item.id === "todo-fixme")?.summary ?? "",
      /2 TODO\/FIXME/,
    );
    assert.match(
      report.findings.find((item) => item.id === "large-files")?.summary ?? "",
      /tracked file/,
    );
    assert.equal(report.actions[0]?.check, "tracked-env");

    const combined = `${renderJson(report)}${renderHtml(report)}${renderTerminal(report, { color: false })}`;
    assert.doesNotMatch(combined, /not-a-real-secret/);
    assert.match(combined, /\.env/);
  } finally {
    await fixture.cleanup();
  }
});

test("reports an npm range that excludes the registry latest version", async () => {
  const fixture = await makeGitFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url =
      input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    assert.match(url, /^https:\/\/registry\.npmjs\.org\//);
    return new Response(JSON.stringify({ version: "8.0.0" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const report = await auditTarget(fixture.root, {
      now: new Date("2026-07-28T00:00:00.000Z"),
      staleDays: 3650,
      largeFileBytes: 10 * 1024 * 1024,
      maxTodoMatches: 10,
      offline: false,
      githubToken: null,
    });
    const finding = report.findings.find(
      (item) => item.id === "outdated-dependencies",
    );
    assert.equal(finding?.severity, "warning");
    assert.match(finding?.summary ?? "", /1 declared range/);
    assert.match(String(finding?.evidence[0]?.value), /\^7\.0\.0 → 8\.0\.0/);
  } finally {
    globalThis.fetch = originalFetch;
    await fixture.cleanup();
  }
});

test("renders standalone HTML and stable JSON without executable content", async () => {
  const fixture = await makeGitFixture();
  try {
    const report = await auditTarget(fixture.root, {
      now: new Date("2026-07-28T00:00:00.000Z"),
      staleDays: 3650,
      largeFileBytes: 10 * 1024 * 1024,
      maxTodoMatches: 10,
      offline: true,
      githubToken: null,
    });
    const html = renderHtml(report);
    const json = JSON.parse(renderJson(report)) as { schemaVersion?: number };

    assert.match(html, /^<!doctype html>/);
    assert.match(html, /Content-Security-Policy/);
    assert.doesNotMatch(html, /<script\b/i);
    assert.doesNotMatch(html, /(?:href|src)="\//i);
    assert.doesNotMatch(html, /https?:\/\/[^"]+\.(?:js|css)/i);
    assert.equal(json.schemaVersion, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("does not follow tracked symlinks outside the repository", async () => {
  const fixture = await makeGitFixture();
  try {
    const outside = join(dirname(fixture.root), "outside.txt");
    await writeFile(
      outside,
      `${"TO"}${"DO"}: password=must-not-appear-in-a-report\n`,
      "utf8",
    );
    await symlink("../outside.txt", join(fixture.root, "linked-note.txt"));
    await execFileAsync("git", ["add", "linked-note.txt"], { cwd: fixture.root });
    await execFileAsync("git", ["commit", "-m", "add safe symlink fixture"], {
      cwd: fixture.root,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "RepoLens Test",
        GIT_AUTHOR_EMAIL: "test@example.invalid",
        GIT_COMMITTER_NAME: "RepoLens Test",
        GIT_COMMITTER_EMAIL: "test@example.invalid",
      },
    });

    const report = await auditTarget(fixture.root, {
      now: new Date("2026-07-28T00:00:00.000Z"),
      staleDays: 3650,
      largeFileBytes: 10 * 1024 * 1024,
      maxTodoMatches: 10,
      offline: true,
      githubToken: null,
    });
    assert.doesNotMatch(renderJson(report), /must-not-appear/);
  } finally {
    await fixture.cleanup();
  }
});

test("CLI help is available from the compiled executable", async () => {
  const cliPath = resolve(testRoot, "../src/cli.js");
  const { stdout } = await execFileAsync(process.execPath, [cliPath, "--help"]);
  assert.match(stdout, /Usage:/);
  assert.match(stdout, /--token-env/);
  assert.match(stdout, /tokens are never written/i);
});

test("CLI writes JSON and HTML reports only when requested", async () => {
  const fixture = await makeGitFixture();
  const outputRoot = await mkdtemp(join(tmpdir(), "repolens-output-"));
  try {
    const cliPath = resolve(testRoot, "../src/cli.js");
    await execFileAsync(
      process.execPath,
      [
        cliPath,
        fixture.root,
        "--offline",
        "--format",
        "json,html",
        "--output",
        outputRoot,
      ],
    );
    const json = await readFile(
      join(outputRoot, "repolens-report.json"),
      "utf8",
    );
    const html = await readFile(
      join(outputRoot, "repolens-report.html"),
      "utf8",
    );
    assert.match(json, /"schemaVersion": 1/);
    assert.match(html, /RepoLens report/);
  } finally {
    await fixture.cleanup();
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("a non-git directory can be audited without mutation", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "repolens-plain-"));
  try {
    await mkdir(join(temporary, "src"), { recursive: true });
    await writeFile(join(temporary, "README.md"), "# Plain\n", "utf8");
    await writeFile(
      join(temporary, "src", "index.js"),
      "export const ok = true;\n",
      "utf8",
    );
    const before = await readFile(join(temporary, "README.md"), "utf8");
    const report = await auditTarget(temporary, {
      now: new Date("2026-07-28T00:00:00.000Z"),
      staleDays: 180,
      largeFileBytes: 1024 * 1024,
      maxTodoMatches: 10,
      offline: true,
      githubToken: null,
    });
    const after = await readFile(join(temporary, "README.md"), "utf8");
    assert.equal(before, after);
    assert.equal(report.repository.kind, "local");
    assert.equal(
      report.findings.find((item) => item.id === "readme")?.severity,
      "pass",
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
