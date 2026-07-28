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

import { auditTarget, createAuditReport } from "../src/audit.js";
import { parseCliArgs } from "../src/cli.js";
import {
  DEFAULT_CONFIG,
  loadConfig,
  parseConfig,
  renderDefaultConfig,
} from "../src/config.js";
import { TOOL_VERSION } from "../src/constants.js";
import { compareWithBaseline } from "../src/comparison.js";
import { evaluatePolicy, policyExitCode } from "../src/policy.js";
import {
  renderGitHubMarkdown,
  renderHtml,
  renderJson,
  renderTerminal,
} from "../src/reporters.js";
import { runAudit } from "../src/runner.js";
import { prepareRepository, scanRepository } from "../src/scanner.js";

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
  if (parsed.command === "init") {
    assert.fail("expected a scan command");
  }
  assert.equal(parsed.command, "scan");

  assert.equal(parsed.target, "owner/repository");
  assert.deepEqual(parsed.formats, ["terminal", "json", "html", "github"]);
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
    assert.equal(report.schemaVersion, 2);
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

    const combined = `${renderJson(report)}${renderHtml(report)}${renderTerminal(report, { color: false })}${renderGitHubMarkdown(report)}`;
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
    assert.doesNotMatch(html, /[ \t]+$/m);
    assert.equal(json.schemaVersion, 2);
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

test("CLI executes through the symlink shape used by global npm installs", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "repolens-bin-"));
  try {
    const cliPath = resolve(testRoot, "../src/cli.js");
    const linkedCli = join(temporary, "repolens");
    await symlink(cliPath, linkedCli);
    const { stdout } = await execFileAsync(process.execPath, [
      linkedCli,
      "--version",
    ]);
    assert.equal(stdout.trim(), TOOL_VERSION);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
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
        "--fail-on",
        "none",
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
    assert.match(json, /"schemaVersion": 2/);
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

test("an explicit in-target baseline does not amplify a non-git scan", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "repolens-plain-baseline-"));
  try {
    await mkdir(join(temporary, "src"), { recursive: true });
    await writeFile(join(temporary, "README.md"), "# Plain baseline\n", "utf8");
    await writeFile(
      join(temporary, "src", "index.js"),
      "// TODO: keep this one reviewed item\nexport const ok = true;\n",
      "utf8",
    );
    const options = {
      target: temporary,
      configPath: null,
      failOn: "none" as const,
      strict: false,
      offline: true,
      staleDays: null,
      largeFileBytes: 2_048,
      maxTodoMatches: 10,
      githubToken: null,
      now: new Date("2026-07-28T00:00:00.000Z"),
    };
    const initial = await runAudit({ ...options, baselinePath: null });
    const baselinePath = join(temporary, "accepted[final].json");
    const baselineJson = renderJson(initial.report);
    assert.ok(Buffer.byteLength(baselineJson) > 2_048);
    await writeFile(baselinePath, baselineJson, "utf8");

    const compared = await runAudit({ ...options, baselinePath });
    assert.equal(
      compared.report.findings.find((item) => item.id === "todo-fixme")
        ?.summary,
      initial.report.findings.find((item) => item.id === "todo-fixme")
        ?.summary,
    );
    assert.equal(
      compared.report.findings.find((item) => item.id === "large-files")
        ?.severity,
      "pass",
    );
    assert.equal(compared.report.comparison.new.warning, 0);
    assert.ok(
      compared.report.coverage.excludes.includes(
        "accepted\\[final\\].json",
      ),
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("a committed .repolens baseline stays outside later scans", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "repolens-git-baseline-"));
  try {
    await mkdir(join(temporary, "src"), { recursive: true });
    await writeFile(join(temporary, "README.md"), "# Git baseline\n", "utf8");
    await writeFile(
      join(temporary, "src", "index.js"),
      "// TODO: keep this one reviewed item\nexport const ok = true;\n",
      "utf8",
    );
    await execFileAsync("git", ["init", "-b", "main"], { cwd: temporary });
    await execFileAsync("git", ["add", "."], { cwd: temporary });
    await execFileAsync("git", ["commit", "-m", "initial fixture"], {
      cwd: temporary,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "RepoLens Test",
        GIT_AUTHOR_EMAIL: "test@example.invalid",
        GIT_COMMITTER_NAME: "RepoLens Test",
        GIT_COMMITTER_EMAIL: "test@example.invalid",
      },
    });

    const options = {
      target: temporary,
      configPath: null,
      failOn: "none" as const,
      strict: false,
      offline: true,
      staleDays: null,
      largeFileBytes: 2_048,
      maxTodoMatches: 10,
      githubToken: null,
      now: new Date("2026-07-28T00:00:00.000Z"),
    };
    const initial = await runAudit({ ...options, baselinePath: null });
    const baselinePath = join(
      temporary,
      ".repolens",
      "baselines",
      "accepted.json",
    );
    await mkdir(dirname(baselinePath), { recursive: true });
    await writeFile(baselinePath, renderJson(initial.report), "utf8");
    await execFileAsync("git", ["add", "-f", baselinePath], {
      cwd: temporary,
    });
    await execFileAsync("git", ["commit", "-m", "accept baseline"], {
      cwd: temporary,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "RepoLens Test",
        GIT_AUTHOR_EMAIL: "test@example.invalid",
        GIT_COMMITTER_NAME: "RepoLens Test",
        GIT_COMMITTER_EMAIL: "test@example.invalid",
      },
    });

    const scanned = await runAudit({ ...options, baselinePath: null });
    assert.equal(
      scanned.report.findings.find((item) => item.id === "todo-fixme")
        ?.summary,
      initial.report.findings.find((item) => item.id === "todo-fixme")
        ?.summary,
    );
    assert.equal(
      scanned.report.findings.find((item) => item.id === "large-files")
        ?.severity,
      "pass",
    );
    assert.ok(
      scanned.report.coverage.excludes.includes("**/.repolens/**"),
    );
    assert.ok(scanned.report.coverage.excludedFiles >= 1);

    const compared = await runAudit({ ...options, baselinePath });
    assert.equal(compared.report.comparison.new.warning, 0);
    assert.equal(
      compared.report.findings.find((item) => item.id === "todo-fixme")
        ?.summary,
      initial.report.findings.find((item) => item.id === "todo-fixme")
        ?.summary,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("gates a new large file while ignoring size-only evidence changes", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "repolens-large-delta-"));
  const target = join(temporary, "target");
  try {
    await mkdir(target);
    await writeFile(join(target, "README.md"), "# Large delta\n", "utf8");
    for (let index = 1; index <= 5; index += 1) {
      await writeFile(
        join(target, `large-${index}.dat`),
        "x".repeat(2_048),
        "utf8",
      );
    }

    const options = {
      target,
      configPath: null,
      strict: false,
      offline: true,
      staleDays: null,
      largeFileBytes: 1_024,
      maxTodoMatches: 20,
      githubToken: null,
      now: new Date("2026-07-28T00:00:00.000Z"),
    };
    const initial = await runAudit({
      ...options,
      baselinePath: null,
      failOn: "none",
    });
    const baselinePath = join(temporary, "accepted.json");
    await writeFile(baselinePath, renderJson(initial.report), "utf8");
    assert.equal(
      initial.report.findings.find((item) => item.id === "large-files")
        ?.summary,
      "5 tracked file(s) exceeded the configured size threshold.",
    );

    await writeFile(
      join(target, "large-1.dat"),
      "x".repeat(4_096),
      "utf8",
    );
    const resized = await runAudit({
      ...options,
      baselinePath,
      failOn: "new-warning",
    });
    assert.equal(resized.report.comparison.new.warning, 0);
    assert.equal(resized.exitCode, 0);

    await writeFile(
      join(target, "large-6.dat"),
      "x".repeat(2_048),
      "utf8",
    );
    const regressed = await runAudit({
      ...options,
      baselinePath,
      failOn: "new-warning",
    });
    const change = regressed.report.comparison.changes.find(
      (item) => item.check === "large-files",
    );
    assert.equal(regressed.report.comparison.new.warning, 1);
    assert.equal(regressed.exitCode, 1);
    assert.equal(change?.kind, "worsened");
    assert.equal(change?.from, "warning");
    assert.equal(change?.to, "warning");
    assert.match(change?.detail ?? "", /increased from 5 to 6/);

    const legacyBaselinePath = join(temporary, "legacy.json");
    await writeFile(
      legacyBaselinePath,
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: initial.report.generatedAt,
        findings: initial.report.findings.map((item) => ({
          id: item.id,
          title: item.title,
          severity: item.severity,
        })),
      }),
      "utf8",
    );
    const legacyCompared = await runAudit({
      ...options,
      baselinePath: legacyBaselinePath,
      failOn: "new-warning",
    });
    assert.equal(legacyCompared.report.comparison.new.warning, 0);
    assert.equal(legacyCompared.exitCode, 0);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("ignores display truncation churn while still gating the fourteenth large file", async () => {
  const temporary = await mkdtemp(
    join(tmpdir(), "repolens-large-boundary-"),
  );
  const target = join(temporary, "target");
  try {
    await mkdir(target);
    await writeFile(join(target, "README.md"), "# Large boundary\n", "utf8");
    for (let index = 1; index <= 13; index += 1) {
      await writeFile(
        join(target, `large-${String(index).padStart(2, "0")}.dat`),
        "x".repeat(2_048 + index),
        "utf8",
      );
    }

    const options = {
      target,
      configPath: null,
      strict: false,
      offline: true,
      staleDays: null,
      largeFileBytes: 1_024,
      maxTodoMatches: 20,
      githubToken: null,
      now: new Date("2026-07-28T00:00:00.000Z"),
    };
    const initial = await runAudit({
      ...options,
      baselinePath: null,
      failOn: "none",
    });
    const baselinePath = join(temporary, "accepted.json");
    await writeFile(baselinePath, renderJson(initial.report), "utf8");
    const previewOnlyBaseline = structuredClone(initial.report);
    for (const finding of previewOnlyBaseline.findings) {
      delete finding.comparisonEvidence;
    }
    const previewOnlyBaselinePath = join(
      temporary,
      "accepted-preview-only.json",
    );
    await writeFile(
      previewOnlyBaselinePath,
      renderJson(previewOnlyBaseline),
      "utf8",
    );
    const initialLarge = initial.report.findings.find(
      (item) => item.id === "large-files",
    );
    assert.equal(initialLarge?.comparisonEvidence?.count, 13);
    assert.equal(initialLarge?.evidence.length, 12);

    await writeFile(
      join(target, "large-01.dat"),
      "x".repeat(8_192),
      "utf8",
    );
    const reordered = await runAudit({
      ...options,
      baselinePath,
      failOn: "new-warning",
    });
    assert.equal(reordered.report.comparison.new.warning, 0);
    assert.equal(reordered.exitCode, 0);

    const reorderedFromPreview = await runAudit({
      ...options,
      baselinePath: previewOnlyBaselinePath,
      failOn: "new-warning",
    });
    assert.equal(reorderedFromPreview.report.comparison.new.warning, 0);
    assert.equal(reorderedFromPreview.exitCode, 0);

    await writeFile(
      join(target, "large-14.dat"),
      "x".repeat(2_048),
      "utf8",
    );
    const regressed = await runAudit({
      ...options,
      baselinePath,
      failOn: "new-warning",
    });
    assert.equal(regressed.report.comparison.new.warning, 1);
    assert.equal(regressed.exitCode, 1);
    assert.match(
      regressed.report.comparison.changes.find(
        (item) => item.check === "large-files",
      )?.detail ?? "",
      /increased from 13 to 14/,
    );

    const regressedFromPreview = await runAudit({
      ...options,
      baselinePath: previewOnlyBaselinePath,
      failOn: "new-warning",
    });
    assert.equal(regressedFromPreview.report.comparison.new.warning, 1);
    assert.equal(regressedFromPreview.exitCode, 1);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("gates a new tracked environment path at the same critical severity", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "repolens-env-delta-"));
  const target = join(temporary, "target");
  const gitEnvironment = {
    ...process.env,
    GIT_AUTHOR_NAME: "RepoLens Test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "RepoLens Test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  try {
    await mkdir(target);
    await writeFile(join(target, "README.md"), "# Env delta\n", "utf8");
    await writeFile(join(target, ".env"), "VALUE=redacted\n", "utf8");
    await execFileAsync("git", ["init", "-b", "main"], { cwd: target });
    await execFileAsync("git", ["add", "-f", "."], { cwd: target });
    await execFileAsync("git", ["commit", "-m", "one env path"], {
      cwd: target,
      env: gitEnvironment,
    });

    const options = {
      target,
      configPath: null,
      strict: false,
      offline: true,
      staleDays: null,
      largeFileBytes: null,
      maxTodoMatches: 20,
      githubToken: null,
      now: new Date("2026-07-28T00:00:00.000Z"),
    };
    const initial = await runAudit({
      ...options,
      baselinePath: null,
      failOn: "none",
    });
    const baselinePath = join(temporary, "accepted.json");
    await writeFile(baselinePath, renderJson(initial.report), "utf8");

    await writeFile(
      join(target, ".env.production"),
      "VALUE=redacted\n",
      "utf8",
    );
    await execFileAsync("git", ["add", "-f", ".env.production"], {
      cwd: target,
    });
    await execFileAsync("git", ["commit", "-m", "second env path"], {
      cwd: target,
      env: gitEnvironment,
    });

    const regressed = await runAudit({
      ...options,
      baselinePath,
      failOn: "new-critical",
    });
    const change = regressed.report.comparison.changes.find(
      (item) => item.check === "tracked-env",
    );
    assert.equal(regressed.report.comparison.new.critical, 1);
    assert.equal(regressed.exitCode, 1);
    assert.equal(change?.kind, "worsened");
    assert.equal(change?.from, "critical");
    assert.equal(change?.to, "critical");
    assert.match(change?.detail ?? "", /increased from 1 to 2/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("does not treat TODO line movement as new warning evidence", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "repolens-todo-delta-"));
  const target = join(temporary, "target");
  try {
    await mkdir(join(target, "src"), { recursive: true });
    await writeFile(join(target, "README.md"), "# TODO delta\n", "utf8");
    const todos = Array.from(
      { length: 21 },
      (_, index) => `// TODO: reviewed item ${index + 1}`,
    ).join("\n");
    await writeFile(join(target, "src", "index.js"), `${todos}\n`, "utf8");

    const options = {
      target,
      configPath: null,
      strict: false,
      offline: true,
      staleDays: null,
      largeFileBytes: null,
      maxTodoMatches: 50,
      githubToken: null,
      now: new Date("2026-07-28T00:00:00.000Z"),
    };
    const initial = await runAudit({
      ...options,
      baselinePath: null,
      failOn: "none",
    });
    const baselinePath = join(temporary, "accepted.json");
    await writeFile(baselinePath, renderJson(initial.report), "utf8");

    await writeFile(
      join(target, "src", "index.js"),
      `\n${todos}\n`,
      "utf8",
    );
    const compared = await runAudit({
      ...options,
      baselinePath,
      failOn: "new-warning",
    });
    assert.equal(compared.report.comparison.new.warning, 0);
    assert.equal(compared.exitCode, 0);
    assert.equal(
      compared.report.comparison.changes.some(
        (item) => item.check === "todo-fixme",
      ),
      false,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("validates config fields and loads explicit detection exclusions", async () => {
  assert.ok(DEFAULT_CONFIG.excludes.includes("**/.repolens/**"));
  assert.match(renderDefaultConfig(), /"\*\*\/\.repolens\/\*\*"/);
  assert.throws(
    () => parseConfig({ schema: 1, staleDay: 10 }),
    /unknown field: staleDay/,
  );
  assert.throws(
    () =>
      parseConfig({
        schema: 1,
        policy: { failOn: "everything" },
      }),
    /policy\.failOn/,
  );

  const temporary = await mkdtemp(join(tmpdir(), "repolens-config-"));
  try {
    const path = join(temporary, ".repolens.json");
    await writeFile(
      path,
      JSON.stringify({
        ...DEFAULT_CONFIG,
        excludes: ["test/fixtures/**"],
        policy: { failOn: "new-warning", strict: true },
      }),
      "utf8",
    );
    const loaded = await loadConfig(path, true);
    assert.deepEqual(loaded.config.excludes, ["test/fixtures/**"]);
    assert.equal(loaded.config.policy.failOn, "new-warning");
    assert.equal(loaded.config.policy.strict, true);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("compares a baseline and gates only new maintenance regressions", async () => {
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
    const baseline = {
      generatedAt: "2026-07-27T00:00:00.000Z",
      findings: report.findings.map((item) => ({
        id: item.id,
        title: item.title,
        severity:
          item.id === "tracked-env"
            ? ("pass" as const)
            : item.severity,
      })),
    };
    const compared = compareWithBaseline(report, baseline, "baseline.json");
    assert.equal(compared.comparison.new.critical, 1);
    assert.equal(
      compared.comparison.changes.find(
        (item) => item.check === "tracked-env",
      )?.kind,
      "worsened",
    );
    const gated = evaluatePolicy(compared, "new-critical", false);
    assert.equal(gated.policy.passed, false);
    assert.equal(policyExitCode(gated), 1);
  } finally {
    await fixture.cleanup();
  }
});

test("strict mode reserves exit 2 for unknown inspection coverage", async () => {
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
    const unknown = {
      ...report,
      counts: { ...report.counts, unknown: report.counts.unknown + 1 },
    };
    const gated = evaluatePolicy(unknown, "none", true);
    assert.equal(gated.policy.operationalError, true);
    assert.equal(policyExitCode(gated), 2);
  } finally {
    await fixture.cleanup();
  }
});

test("GitHub permission failures become unknown and exit 2 in strict mode", async () => {
  const fixture = await makeGitFixture();
  const originalFetch = globalThis.fetch;
  await execFileAsync(
    "git",
    ["remote", "add", "origin", "https://github.com/example/repository.git"],
    { cwd: fixture.root },
  );
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.href
          : input;
    if (url.startsWith("https://api.github.com/")) {
      return new Response("{}", { status: 403 });
    }
    return new Response(JSON.stringify({ version: "7.0.0" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await runAudit({
      target: fixture.root,
      configPath: null,
      baselinePath: null,
      failOn: "none",
      strict: true,
      offline: false,
      staleDays: null,
      largeFileBytes: null,
      maxTodoMatches: 10,
      githubToken: null,
      now: new Date("2026-07-28T00:00:00.000Z"),
    });
    assert.ok(result.report.counts.unknown > 0);
    assert.ok(result.report.coverage.unknownReasons.length > 0);
    assert.equal(result.exitCode, 2);
    assert.equal(result.report.policy.operationalError, true);
  } finally {
    globalThis.fetch = originalFetch;
    await fixture.cleanup();
  }
});

test("does not award a perfect score when update and branch controls are absent", async () => {
  const fixture = await makeGitFixture();
  try {
    const prepared = await prepareRepository(fixture.root, null);
    const options = {
      now: new Date("2026-07-28T00:00:00.000Z"),
      staleDays: 3650,
      largeFileBytes: 10 * 1024 * 1024,
      maxTodoMatches: 10,
      offline: true,
      githubToken: null,
    };
    const inventory = await scanRepository(prepared.identity, options);
    const report = createAuditReport(
      prepared.identity,
      {
        ...inventory,
        branchProtected: false,
        dependabotSecurityUpdates: false,
        dependencyUpdateFiles: [],
      },
      options,
    );
    assert.ok(report.score < 100);
    assert.equal(
      report.findings.find((item) => item.id === "branch-protection")
        ?.severity,
      "warning",
    );
    assert.equal(
      report.findings.find((item) => item.id === "dependency-updates")
        ?.severity,
      "warning",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("the repository config excludes credential-detection fixtures from self-audit", async () => {
  const repositoryRoot = resolve(testRoot, "../..");
  const result = await runAudit({
    target: repositoryRoot,
    configPath: null,
    baselinePath: null,
    failOn: "none",
    strict: false,
    offline: true,
    staleDays: null,
    largeFileBytes: null,
    maxTodoMatches: 10,
    githubToken: null,
    now: new Date("2026-07-28T00:00:00.000Z"),
  });
  assert.equal(
    result.report.findings.find((item) => item.id === "tracked-env")
      ?.severity,
    "pass",
  );
  assert.ok(result.report.coverage.excludedFiles > 0);
  assert.match(
    renderTerminal(result.report, { color: false }),
    /Scope\s+\d+\/\d+ files included/,
  );
});

test("ships a Node action bundle without the old fixed WHAGO target", async () => {
  const repositoryRoot = resolve(testRoot, "../..");
  const [metadata, bundle, packageJson] = await Promise.all([
    readFile(join(repositoryRoot, "action.yml"), "utf8"),
    readFile(join(repositoryRoot, "action", "index.cjs"), "utf8"),
    readFile(join(repositoryRoot, "package.json"), "utf8"),
  ]);
  assert.match(metadata, /using: node24/);
  assert.match(metadata, /new-critical/);
  assert.match(bundle, /RepoLens execution error/);
  assert.doesNotMatch(bundle, /rad1092\/whago-home/);
  assert.doesNotMatch(bundle, /not-a-real-secret/);
  assert.equal(
    (JSON.parse(packageJson) as { name?: string }).name,
    "@rad1092/repolens",
  );
});
