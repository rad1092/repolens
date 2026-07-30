import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import {
  resolveActionBaseline,
  resolveWorkspacePath,
} from "../src/action-context.js";
import {
  loadAcceptedBaseline,
  parseBaselineV3,
} from "../src/baseline.js";
import { parseCliArgs } from "../src/cli.js";
import {
  CONFIG_SCHEMA_URL,
  parseConfig,
  renderDefaultConfig,
} from "../src/config.js";
import { TOOL_VERSION } from "../src/constants.js";
import { RepoLensError } from "../src/errors.js";
import { renderHtml, renderJson } from "../src/reporters.js";
import { runAudit } from "../src/runner.js";
import {
  regressionFindings,
  renderSarif,
} from "../src/sarif.js";
import {
  acceptCurrentBaseline,
  DEFAULT_BASELINE_PATH,
  setupRepository,
} from "../src/setup.js";

const execFileAsync = promisify(execFile);
const testRoot = dirname(fileURLToPath(import.meta.url));
const compiledAction = resolve(testRoot, "../src/action.js");
const compiledCli = resolve(testRoot, "../src/cli.js");
const gitEnvironment = {
  ...process.env,
  GIT_AUTHOR_NAME: "RepoLens Test",
  GIT_AUTHOR_EMAIL: "repolens@example.invalid",
  GIT_COMMITTER_NAME: "RepoLens Test",
  GIT_COMMITTER_EMAIL: "repolens@example.invalid",
};
const actionSha = "a".repeat(40);
const futureExpiration = new Date(
  Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
).toISOString();

interface Fixture {
  root: string;
  cleanup: () => Promise<void>;
}

async function commit(root: string, message: string): Promise<string> {
  await execFileAsync("git", ["add", "-A"], { cwd: root });
  await execFileAsync("git", ["commit", "-m", message], {
    cwd: root,
    env: gitEnvironment,
  });
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: root,
  });
  return stdout.trim();
}

async function makeRepository(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "repolens-v3-"));
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "README.md"), "# Fixture\n", "utf8");
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "repolens-fixture",
        version: "1.0.0",
        private: true,
        scripts: {
          test: "node --test",
          lint: "node --check src/index.js",
          build: "node --check src/index.js",
          ci: "npm test && npm run lint && npm run build",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "package-lock.json"),
    `${JSON.stringify(
      {
        name: "repolens-fixture",
        version: "1.0.0",
        lockfileVersion: 3,
        requires: true,
        packages: {
          "": {
            name: "repolens-fixture",
            version: "1.0.0",
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "src", "index.js"),
    "export const ready = true;\n",
    "utf8",
  );
  await writeFile(
    join(root, ".github", "workflows", "ci.yml"),
    `name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5
      - run: npm run ci
`,
    "utf8",
  );
  await writeFile(
    join(root, ".github", "dependabot.yml"),
    `version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
`,
    "utf8",
  );
  await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "RepoLens Test"], {
    cwd: root,
  });
  await execFileAsync(
    "git",
    ["config", "user.email", "repolens@example.invalid"],
    { cwd: root },
  );
  await commit(root, "initial fixture");
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function auditOptions(
  root: string,
  overrides: Partial<Parameters<typeof runAudit>[0]> = {},
): Parameters<typeof runAudit>[0] {
  return {
    target: root,
    configPath: null,
    baselinePath: null,
    failOn: "none",
    strict: false,
    offline: true,
    githubToken: null,
    now: new Date("2026-07-29T00:00:00.000Z"),
    ...overrides,
  };
}

async function setupFixture(fixture: Fixture): Promise<{
  baseline: string;
  workflow: string;
}> {
  const result = await setupRepository({
    target: fixture.root,
    force: false,
    reason: "Initial fixture debt reviewed",
    owner: "RepoLens Test",
    expiresAt: futureExpiration,
    actionSha,
    githubToken: null,
  });
  await commit(fixture.root, "configure RepoLens");
  return { baseline: result.baseline, workflow: result.workflow };
}

async function introduceMutableAction(root: string): Promise<void> {
  const workflow = join(root, ".github", "workflows", "ci.yml");
  const source = await readFile(workflow, "utf8");
  await writeFile(
    workflow,
    source.replace(
      "actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5",
      "actions/checkout@v5",
    ),
    "utf8",
  );
  await commit(root, "introduce mutable action");
}

async function runAction(options: {
  root: string;
  baseline: string;
  eventName?: string;
  eventPath?: string;
}): Promise<{
  code: number;
  stdout: string;
  stderr: string;
  output: string;
  summary: string;
}> {
  const output = join(options.root, ".action-output");
  const summary = join(options.root, ".action-summary");
  const runner = join(options.root, ".runner");
  await writeFile(output, "", "utf8");
  await writeFile(summary, "", "utf8");
  try {
    const result = await execFileAsync(process.execPath, [compiledAction], {
      cwd: options.root,
      env: {
        ...process.env,
        GITHUB_WORKSPACE: options.root,
        RUNNER_TEMP: runner,
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
        GITHUB_RUN_ID: "1234",
        GITHUB_JOB: "inspect",
        GITHUB_ACTION: "repolens",
        GITHUB_EVENT_NAME: options.eventName ?? "push",
        ...(options.eventPath
          ? { GITHUB_EVENT_PATH: options.eventPath }
          : {}),
        INPUT_TARGET: ".",
        INPUT_CONFIG: ".repolens.json",
        INPUT_BASELINE: options.baseline,
        INPUT_FAIL_ON: "new-warning",
      },
    });
    return {
      code: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      output: await readFile(output, "utf8"),
      summary: await readFile(summary, "utf8"),
    };
  } catch (error) {
    const failure = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: failure.code ?? 2,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      output: await readFile(output, "utf8"),
      summary: await readFile(summary, "utf8"),
    };
  }
}

test("keeps the CLI version synchronized with package metadata", async () => {
  const packageJson = JSON.parse(
    await readFile(resolve(testRoot, "../../package.json"), "utf8"),
  ) as { version?: string };
  assert.equal(TOOL_VERSION, "0.4.0");
  assert.equal(TOOL_VERSION, packageJson.version);
});

test("setup writes one canonical config, compact baseline, and SHA-pinned workflow", async () => {
  const fixture = await makeRepository();
  try {
    const setup = await setupFixture(fixture);
    const config = JSON.parse(
      await readFile(join(fixture.root, ".repolens.json"), "utf8"),
    ) as {
      schema?: number;
      checks?: unknown;
      policy?: { failOn?: string };
    };
    const baseline = await loadAcceptedBaseline(setup.baseline);
    const workflow = await readFile(setup.workflow, "utf8");

    assert.equal(config.schema, 2);
    assert.deepEqual(config.checks, {});
    assert.equal(config.policy?.failOn, "new-warning");
    assert.equal(baseline.baseline.schemaVersion, 3);
    assert.equal(baseline.baseline.kind, "repolens-baseline");
    assert.equal(
      baseline.baseline.acceptance.reason,
      "Initial fixture debt reviewed",
    );
    assert.match(
      baseline.baseline.acceptance.baseCommit,
      /^[a-f0-9]{40}$/,
    );
    assert.match(
      workflow,
      new RegExp(`uses: rad1092/repolens@${actionSha}`),
    );
    assert.doesNotMatch(workflow, /rad1092\/repolens@v/);
    assert.match(workflow, /fetch-depth: 0/);
    assert.match(workflow, /report-sarif/);
    assert.match(workflow, /branches: \["main"\]/);
    assert.doesNotMatch(workflow, /^\s+fail-on:/m);
  } finally {
    await fixture.cleanup();
  }
});

test("setup targets the repository branch instead of assuming main", async () => {
  const fixture = await makeRepository();
  try {
    await execFileAsync("git", ["branch", "-m", "trunk"], {
      cwd: fixture.root,
    });
    const setup = await setupFixture(fixture);
    const workflow = await readFile(setup.workflow, "utf8");
    assert.match(workflow, /branches: \["trunk"\]/);
    assert.doesNotMatch(workflow, /branches: \[main\]/);
  } finally {
    await fixture.cleanup();
  }
});

test("setup baseline includes the workflow it creates before the first commit", async () => {
  const fixture = await makeRepository();
  try {
    await rm(join(fixture.root, ".github"), {
      recursive: true,
      force: true,
    });
    await commit(fixture.root, "remove existing automation");
    const setup = await setupFixture(fixture);
    const unchanged = await runAudit(
      auditOptions(fixture.root, {
        baselinePath: setup.baseline,
        failOn: "new-warning",
      }),
    );
    assert.equal(unchanged.exitCode, 0);
    assert.equal(unchanged.report.summary?.newRegressions, 0);
    assert.ok((unchanged.report.summary?.acceptedDebt ?? 0) > 0);
  } finally {
    await fixture.cleanup();
  }
});

test("relative config and baseline paths resolve inside the prepared checkout", async () => {
  const fixture = await makeRepository();
  try {
    await setupFixture(fixture);
    const result = await runAudit(
      auditOptions(fixture.root, {
        configPath: ".repolens.json",
        baselinePath: DEFAULT_BASELINE_PATH,
        failOn: null,
        strict: null,
      }),
    );
    assert.equal(
      result.configSource,
      join(fixture.root, ".repolens.json"),
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.report.summary?.newRegressions, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("remote baseline check resolves default and explicit paths inside the clone", async () => {
  const fixture = await makeRepository();
  const remoteRoot = await mkdtemp(join(tmpdir(), "repolens-remote-"));
  try {
    const setup = await setupFixture(fixture);
    const customBaseline = join(
      fixture.root,
      ".repolens",
      "baselines",
      "custom.json",
    );
    await writeFile(
      customBaseline,
      await readFile(setup.baseline, "utf8"),
      "utf8",
    );
    await commit(fixture.root, "add explicit relative baseline");

    const bare = join(remoteRoot, "default-baseline.git");
    await execFileAsync("git", ["clone", "--bare", fixture.root, bare]);
    const gitConfig = join(remoteRoot, "gitconfig");
    const remoteUrl =
      "https://github.com/repolens-fixture/default-baseline.git";
    await execFileAsync(
      "git",
      [
        "config",
        "--file",
        gitConfig,
        `url.${pathToFileURL(bare).href}.insteadOf`,
        remoteUrl,
      ],
    );
    const env = {
      ...process.env,
      GIT_CONFIG_GLOBAL: gitConfig,
      GIT_CONFIG_NOSYSTEM: "1",
    };

    const defaultResult = await execFileAsync(
      process.execPath,
      [
        compiledCli,
        "baseline",
        "check",
        "repolens-fixture/default-baseline",
        "--offline",
      ],
      { env },
    );
    assert.match(defaultResult.stdout, /NO NEW REGRESSIONS/);

    const explicitResult = await execFileAsync(
      process.execPath,
      [
        compiledCli,
        "baseline",
        "check",
        "repolens-fixture/default-baseline",
        "--baseline",
        ".repolens/baselines/custom.json",
        "--offline",
      ],
      { env },
    );
    assert.match(explicitResult.stdout, /NO NEW REGRESSIONS/);
  } finally {
    await fixture.cleanup();
    await rm(remoteRoot, { recursive: true, force: true });
  }
});

test("setup validates acceptance before writing partial files", async () => {
  const fixture = await makeRepository();
  try {
    await assert.rejects(
      setupRepository({
        target: fixture.root,
        force: false,
        reason: "Reviewed existing maintenance findings",
        owner: "RepoLens Test",
        expiresAt: "2020-01-01T00:00:00Z",
        actionSha,
        githubToken: null,
      }),
      (error: unknown) =>
        error instanceof RepoLensError &&
        error.code === "BASELINE_INVALID",
    );
    await assert.rejects(readFile(join(fixture.root, ".repolens.json")));
    await assert.rejects(
      readFile(join(fixture.root, DEFAULT_BASELINE_PATH)),
    );
    await assert.rejects(
      readFile(
        join(fixture.root, ".github", "workflows", "repolens.yml"),
      ),
    );
  } finally {
    await fixture.cleanup();
  }
});

test("unchanged setup baseline passes and a new mutable action blocks with location", async () => {
  const fixture = await makeRepository();
  try {
    const setup = await setupFixture(fixture);
    const unchanged = await runAudit(
      auditOptions(fixture.root, {
        baselinePath: setup.baseline,
        failOn: "new-warning",
      }),
    );
    assert.equal(unchanged.exitCode, 0);
    assert.equal(unchanged.report.summary?.newRegressions, 0);

    await introduceMutableAction(fixture.root);
    const regressed = await runAudit(
      auditOptions(fixture.root, {
        baselinePath: setup.baseline,
        failOn: "new-warning",
      }),
    );
    const finding = regressionFindings(regressed.report).find(
      (item) => item.ruleId === "workflow/action-pin",
    );
    assert.equal(regressed.exitCode, 1);
    assert.equal(regressed.report.comparison.new.warning, 1);
    assert.equal(finding?.location?.path, ".github/workflows/ci.yml");
    assert.ok((finding?.location?.line ?? 0) > 0);
    assert.match(finding?.fingerprint ?? "", /^[a-f0-9]{64}$/);
  } finally {
    await fixture.cleanup();
  }
});

test("repeated uses of the same mutable action receive distinct stable fingerprints", async () => {
  const fixture = await makeRepository();
  try {
    const workflowPath = join(
      fixture.root,
      ".github",
      "workflows",
      "ci.yml",
    );
    const workflow = await readFile(workflowPath, "utf8");
    await writeFile(
      workflowPath,
      workflow.replace(
        "      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5",
        "      - uses: actions/checkout@v5\n      - uses: actions/checkout@v5",
      ),
      "utf8",
    );
    const baselinePath = await acceptCurrentBaseline({
      target: fixture.root,
      output: null,
      reason: "Repeated action references reviewed for fixture",
      owner: "RepoLens Test",
      expiresAt: futureExpiration,
      fromV2: null,
      force: false,
    });
    const loaded = await loadAcceptedBaseline(baselinePath);
    const pins = loaded.baseline.accepted.filter(
      (finding) => finding.ruleId === "workflow/action-pin",
    );
    assert.equal(pins.length, 2);
    assert.notEqual(pins[0]?.fingerprint, pins[1]?.fingerprint);
    const unchanged = await runAudit(
      auditOptions(fixture.root, {
        baselinePath,
        failOn: "new-warning",
      }),
    );
    assert.equal(unchanged.exitCode, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("a broken repository cannot earn a synthetic score or pass presence checks", async () => {
  const fixture = await makeRepository();
  try {
    await writeFile(
      join(fixture.root, ".github", "workflows", "ci.yml"),
      `name: CI
on:
  pull_request:
permissions:
  contents: read
jobs: []
`,
      "utf8",
    );
    await writeFile(
      join(fixture.root, ".github", "dependabot.yml"),
      `version: 2
updates:
  - package-ecosystem: npm
    schedule: weekly
`,
      "utf8",
    );
    await writeFile(
      join(fixture.root, "package-lock.json"),
      "not a lockfile\n",
      "utf8",
    );
    const packagePath = join(fixture.root, "package.json");
    const packageJson = JSON.parse(
      await readFile(packagePath, "utf8"),
    ) as { scripts: Record<string, string> };
    packageJson.scripts = {
      test: "exit 1",
      lint: "exit 1",
      build: "exit 1",
    };
    await writeFile(
      packagePath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8",
    );
    const result = await runAudit(auditOptions(fixture.root));
    const rules = new Set(
      result.report.findings.map((finding) => finding.ruleId),
    );
    assert.equal("score" in result.report, false);
    assert.equal("grade" in result.report, false);
    assert.ok(rules.has("workflow/syntax"));
    assert.ok(rules.has("dependabot/syntax"));
    assert.ok(rules.has("node/lockfile-syntax"));
    assert.ok(rules.has("node/script-contract"));
    assert.doesNotMatch(renderJson(result.report), /"severity": "pass"/);
    await assert.rejects(
      execFileAsync("npm", ["test"], { cwd: fixture.root }),
    );
  } finally {
    await fixture.cleanup();
  }
});

test("npm ci is installation, not evidence that verification scripts ran", async () => {
  const fixture = await makeRepository();
  try {
    const workflowPath = join(
      fixture.root,
      ".github",
      "workflows",
      "ci.yml",
    );
    const workflow = await readFile(workflowPath, "utf8");
    await writeFile(
      workflowPath,
      workflow.replace("npm run ci", "npm ci"),
      "utf8",
    );
    const result = await runAudit(auditOptions(fixture.root));
    const wiring = result.report.findings.filter(
      (finding) => finding.ruleId === "workflow/script-wiring",
    );
    assert.equal(wiring.length, 3);
  } finally {
    await fixture.cleanup();
  }
});

test("quoted or commented npm text is not treated as a workflow invocation", async () => {
  const fixture = await makeRepository();
  try {
    const workflowPath = join(
      fixture.root,
      ".github",
      "workflows",
      "ci.yml",
    );
    const workflow = await readFile(workflowPath, "utf8");
    await writeFile(
      workflowPath,
      workflow.replace(
        "      - run: npm run ci",
        `      - run: |
          echo "npm run ci && npm run lint"
          printf '%s\\n' 'npm test; npm run build'
          # npm run build`,
      ),
      "utf8",
    );
    const result = await runAudit(auditOptions(fixture.root));
    const wiring = result.report.findings.filter(
      (finding) => finding.ruleId === "workflow/script-wiring",
    );
    assert.deepEqual(
      wiring.map((finding) => finding.evidence[0]?.value).sort(),
      ["build", "lint", "test"],
    );
  } finally {
    await fixture.cleanup();
  }
});

test("the npm init test placeholder is not accepted as verification", async () => {
  const fixture = await makeRepository();
  try {
    const packagePath = join(fixture.root, "package.json");
    const packageJson = JSON.parse(
      await readFile(packagePath, "utf8"),
    ) as { scripts: Record<string, string> };
    packageJson.scripts.test =
      'echo "Error: no test specified" && exit 1';
    await writeFile(
      packagePath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8",
    );
    const result = await runAudit(auditOptions(fixture.root));
    assert.ok(
      result.report.findings.some(
        (finding) =>
          finding.ruleId === "node/script-contract" &&
          finding.summary.includes("test script is a placeholder"),
      ),
    );
  } finally {
    await fixture.cleanup();
  }
});

test("echo, printf, and simple-success scripts are placeholders", async () => {
  const fixture = await makeRepository();
  try {
    const packagePath = join(fixture.root, "package.json");
    const packageJson = JSON.parse(
      await readFile(packagePath, "utf8"),
    ) as { scripts: Record<string, string> };
    packageJson.scripts.test = 'echo "tests; passed"';
    packageJson.scripts.lint = "printf 'lint passed\\n'";
    packageJson.scripts.build = "true";
    await writeFile(
      packagePath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8",
    );
    const result = await runAudit(auditOptions(fixture.root));
    const placeholders = result.report.findings.filter(
      (finding) => finding.ruleId === "node/script-contract",
    );
    assert.deepEqual(
      placeholders.map((finding) => finding.evidence[0]?.value).sort(),
      ['echo "tests; passed"', "printf 'lint passed\\n'", "true"].sort(),
    );
  } finally {
    await fixture.cleanup();
  }
});

test("workflow permissions reject unsupported scalar and mapping values", async () => {
  const fixture = await makeRepository();
  try {
    const workflowPath = join(
      fixture.root,
      ".github",
      "workflows",
      "ci.yml",
    );
    const workflow = await readFile(workflowPath, "utf8");
    await writeFile(
      workflowPath,
      workflow
        .replace("  contents: read", "  contents: admin")
        .replace(
          "  verify:\n    runs-on:",
          "  verify:\n    permissions:\n      checks: false\n    runs-on:",
        ),
      "utf8",
    );
    const result = await runAudit(auditOptions(fixture.root));
    const permission = result.report.findings.find(
      (finding) => finding.ruleId === "workflow/permissions",
    );
    assert.match(permission?.summary ?? "", /unsupported permission/);
    assert.match(permission?.summary ?? "", /contents/);
    assert.match(permission?.summary ?? "", /checks/);
  } finally {
    await fixture.cleanup();
  }
});

test("job-scoped write permissions require trusted workflow triggers", async () => {
  const fixture = await makeRepository();
  try {
    const releasePath = join(
      fixture.root,
      ".github",
      "workflows",
      "release.yml",
    );
    const releaseWorkflow = `name: Release
on:
  push:
    tags: ["v*"]
permissions:
  contents: read
jobs:
  publish:
    permissions:
      contents: write
    runs-on: ubuntu-latest
    steps:
      - run: npm run build
`;
    await writeFile(releasePath, releaseWorkflow, "utf8");
    const releaseAudit = await runAudit(auditOptions(fixture.root));
    assert.ok(
      !releaseAudit.report.findings.some(
        (finding) =>
          finding.ruleId === "workflow/permissions" &&
          finding.location?.path === ".github/workflows/release.yml",
      ),
    );

    await writeFile(
      releasePath,
      releaseWorkflow.replace(
        '  push:\n    tags: ["v*"]',
        "  pull_request:",
      ),
      "utf8",
    );
    const pullRequestAudit = await runAudit(auditOptions(fixture.root));
    const unsafeWrite = pullRequestAudit.report.findings.find(
      (finding) =>
        finding.ruleId === "workflow/permissions" &&
        finding.location?.path === ".github/workflows/release.yml",
    );
    assert.match(unsafeWrite?.summary ?? "", /publish: contents: write/);

    await writeFile(
      releasePath,
      releaseWorkflow.replace(
        '  push:\n    tags: ["v*"]',
        "  workflow_call:",
      ),
      "utf8",
    );
    const reusableAudit = await runAudit(auditOptions(fixture.root));
    assert.ok(
      reusableAudit.report.findings.some(
        (finding) =>
          finding.ruleId === "workflow/permissions" &&
          finding.location?.path === ".github/workflows/release.yml" &&
          finding.summary.includes("publish: contents: write"),
      ),
    );
  } finally {
    await fixture.cleanup();
  }
});

test("Dependabot directory forms are mutually exclusive and structural", async () => {
  const fixture = await makeRepository();
  try {
    await writeFile(
      join(fixture.root, ".github", "dependabot.yml"),
      `version: 2
updates:
  - package-ecosystem: npm
    directory: /
    directories: [/]
    schedule:
      interval: weekly
  - package-ecosystem: github-actions
    directories: /
    schedule:
      interval: weekly
`,
      "utf8",
    );
    const result = await runAudit(auditOptions(fixture.root));
    const syntax = result.report.findings.find(
      (finding) => finding.ruleId === "dependabot/syntax",
    );
    assert.match(syntax?.summary ?? "", /mutually exclusive/);
    assert.match(
      syntax?.summary ?? "",
      /directories must be a non-empty array/,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("each direct dependency requires an installed lockfile package entry", async () => {
  const fixture = await makeRepository();
  try {
    const manifestPath = join(fixture.root, "package.json");
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as Record<string, unknown>;
    manifest.dependencies = { example: "^1.0.0" };
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    const lockPath = join(fixture.root, "package-lock.json");
    const lock = JSON.parse(
      await readFile(lockPath, "utf8"),
    ) as { packages: Record<string, Record<string, unknown>> };
    lock.packages[""] = {
      ...lock.packages[""],
      dependencies: { example: "^1.0.0" },
    };
    await writeFile(
      lockPath,
      `${JSON.stringify(lock, null, 2)}\n`,
      "utf8",
    );
    const result = await runAudit(auditOptions(fixture.root));
    const lockEntry = result.report.findings.find(
      (finding) =>
        finding.ruleId === "node/lockfile-sync" &&
        finding.summary.includes("node_modules/example"),
    );
    assert.ok(lockEntry);

    lock.packages["node_modules/example"] = { link: true };
    await writeFile(
      lockPath,
      `${JSON.stringify(lock, null, 2)}\n`,
      "utf8",
    );
    const withEntry = await runAudit(auditOptions(fixture.root));
    assert.equal(
      withEntry.report.findings.some(
        (finding) =>
          finding.ruleId === "node/lockfile-sync" &&
          finding.summary.includes("node_modules/example"),
      ),
      false,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("accepted debt passes without Action annotations", async () => {
  const fixture = await makeRepository();
  try {
    await setupFixture(fixture);
    await introduceMutableAction(fixture.root);
    const accepted = await acceptCurrentBaseline({
      target: fixture.root,
      output: ".repolens/baselines/accepted-debt.json",
      reason: "Mutable action retained for migration test",
      owner: "RepoLens Test",
      expiresAt: futureExpiration,
      fromV2: null,
      force: false,
    });
    const action = await runAction({
      root: fixture.root,
      baseline: accepted,
    });
    assert.equal(action.code, 0);
    assert.doesNotMatch(action.stdout, /::warning/);
    assert.match(action.output, /^new=0$/m);
    assert.match(action.output, /^accepted=1$/m);
    assert.match(action.output, /^report-sarif=.+repolens-results\.sarif$/m);
    assert.match(action.summary, /0 new/);
    assert.match(action.summary, /1 accepted/);
  } finally {
    await fixture.cleanup();
  }
});

test("Action emits only a new regression with file and line annotation", async () => {
  const fixture = await makeRepository();
  try {
    const setup = await setupFixture(fixture);
    await introduceMutableAction(fixture.root);
    const action = await runAction({
      root: fixture.root,
      baseline: setup.baseline,
    });
    assert.equal(action.code, 1);
    assert.match(
      action.stdout,
      /::warning title=RepoLens · workflow\/action-pin,file=\.github\/workflows\/ci\.yml,line=\d+,col=1::/,
    );
    assert.match(action.output, /^new=1$/m);
  } finally {
    await fixture.cleanup();
  }
});

test("SARIF contains stable rule, location, and fingerprint for regressions", async () => {
  const fixture = await makeRepository();
  try {
    const setup = await setupFixture(fixture);
    await introduceMutableAction(fixture.root);
    const result = await runAudit(
      auditOptions(fixture.root, {
        baselinePath: setup.baseline,
        failOn: "new-warning",
      }),
    );
    const finding = regressionFindings(result.report)[0];
    const sarif = JSON.parse(renderSarif(result.report)) as {
      runs: Array<{
        results: Array<{
          ruleId: string;
          locations: Array<{
            physicalLocation: {
              artifactLocation: { uri: string };
              region: { startLine: number };
            };
          }>;
          partialFingerprints: { primaryLocationLineHash: string };
        }>;
      }>;
    };
    const sarifResult = sarif.runs[0]?.results[0];
    assert.equal(sarifResult?.ruleId, "workflow/action-pin");
    assert.equal(
      sarifResult?.locations[0]?.physicalLocation.artifactLocation.uri,
      ".github/workflows/ci.yml",
    );
    assert.ok(
      (sarifResult?.locations[0]?.physicalLocation.region.startLine ?? 0) >
        0,
    );
    assert.equal(
      sarifResult?.partialFingerprints.primaryLocationLineHash,
      finding?.fingerprint,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("pull-request baseline changes cannot approve their own regression", async () => {
  const fixture = await makeRepository();
  try {
    const setup = await setupFixture(fixture);
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "HEAD"],
      { cwd: fixture.root },
    );
    const baseSha = stdout.trim();
    const eventPath = join(fixture.root, "event.json");
    await writeFile(
      eventPath,
      JSON.stringify({ pull_request: { base: { sha: baseSha } } }),
      "utf8",
    );
    const baseline = JSON.parse(
      await readFile(setup.baseline, "utf8"),
    ) as { acceptance: { reason: string } };
    baseline.acceptance.reason = "Changed in the same pull request";
    await writeFile(
      setup.baseline,
      `${JSON.stringify(baseline, null, 2)}\n`,
      "utf8",
    );
    await assert.rejects(
      resolveActionBaseline({
        workspace: fixture.root,
        requested: DEFAULT_BASELINE_PATH,
        eventName: "pull_request",
        eventPath,
        runnerTemp: join(fixture.root, ".runner"),
      }),
      (error: unknown) =>
        error instanceof RepoLensError &&
        error.code === "BASELINE_TAMPERED",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("workspace-scoped Action paths reject traversal", () => {
  assert.throws(
    () => resolveWorkspacePath("/tmp/workspace", "../outside", "target"),
    (error: unknown) =>
      error instanceof RepoLensError &&
      error.code === "WORKSPACE_BOUNDARY",
  );
});

test("v2 report baselines require explicit reviewed migration", async () => {
  const fixture = await makeRepository();
  try {
    const v2 = join(fixture.root, "old-report.json");
    await writeFile(
      v2,
      JSON.stringify({
        schemaVersion: 2,
        generatedAt: "2026-07-28T00:00:00.000Z",
        findings: [],
      }),
      "utf8",
    );
    await assert.rejects(
      runAudit(
        auditOptions(fixture.root, {
          baselinePath: v2,
          failOn: "new-warning",
        }),
      ),
      (error: unknown) =>
        error instanceof RepoLensError &&
        error.code === "BASELINE_MIGRATION_REQUIRED",
    );
    const migratedPath = await acceptCurrentBaseline({
      target: fixture.root,
      output: ".repolens/baselines/migrated.json",
      reason: "Reviewed migration from version two report",
      owner: "RepoLens Test",
      expiresAt: futureExpiration,
      fromV2: v2,
      force: false,
    });
    const migrated = await loadAcceptedBaseline(migratedPath);
    assert.equal(migrated.baseline.migratedFrom?.schemaVersion, 2);
    assert.match(
      migrated.baseline.migratedFrom?.sha256 ?? "",
      /^[a-f0-9]{64}$/,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("reviewed config ignores require fingerprints, reasons, and expiration", async () => {
  const fixture = await makeRepository();
  try {
    await introduceMutableAction(fixture.root);
    const initial = await runAudit(auditOptions(fixture.root));
    const finding = initial.report.findings.find(
      (item) => item.ruleId === "workflow/action-pin",
    );
    assert.ok(finding?.fingerprint);
    const config = {
      ...JSON.parse(renderDefaultConfig()),
      checks: {
        "workflow/action-pin": {
          ignore: [
            {
              fingerprint: finding?.fingerprint,
              reason: "Pinned after upstream migration completes",
              expiresAt: futureExpiration,
            },
          ],
        },
      },
    };
    await writeFile(
      join(fixture.root, ".repolens.json"),
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8",
    );
    const ignored = await runAudit(
      auditOptions(fixture.root, {
        failOn: "warning",
      }),
    );
    assert.equal(ignored.exitCode, 0);
    assert.equal(ignored.report.ignoredFindings?.length, 1);
    assert.equal(
      ignored.report.ignoredFindings?.[0]?.ignored?.reason,
      "Pinned after upstream migration completes",
    );

    config.checks["workflow/action-pin"].ignore[0].expiresAt =
      "2026-01-01T00:00:00.000Z";
    await writeFile(
      join(fixture.root, ".repolens.json"),
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8",
    );
    const expired = await runAudit(
      auditOptions(fixture.root, {
        failOn: "warning",
      }),
    );
    assert.equal(expired.exitCode, 1);
    assert.ok(
      expired.report.findings.some(
        (item) => item.ruleId === "config/ignore-expired",
      ),
    );
    assert.throws(
      () =>
        parseConfig({
          schema: 2,
          checks: {
            "workflow/action-pin": {
              enabled: false,
            },
          },
        }),
      /reason/,
    );
    assert.throws(
      () =>
        parseConfig({
          schema: 2,
          checks: {
            "workflow/action-pin": {
              reason: "This would otherwise be a no-op",
              expiresAt: futureExpiration,
            },
          },
        }),
      /only valid when enabled is false/,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("schema 1 cannot silently ignore schema 2 rule policy", () => {
  const rendered = JSON.parse(renderDefaultConfig()) as {
    $schema?: string;
    schema?: number;
  };
  assert.equal(rendered.$schema, CONFIG_SCHEMA_URL);
  assert.equal(rendered.schema, 2);
  assert.equal(
    parseConfig({
      $schema: CONFIG_SCHEMA_URL,
      schema: 2,
    }).schema,
    2,
  );
  assert.throws(
    () => parseConfig({ $schema: "file:///tmp/schema.json", schema: 2 }),
    /\$schema must be an HTTPS URL/,
  );
  assert.throws(
    () =>
      parseConfig({
        schema: 1,
        checks: {
          "workflow/action-pin": {
            severity: "critical",
          },
        },
      }),
    /checks requires RepoLens config schema 2/,
  );
  assert.throws(
    () => parseConfig({ schema: 1, staleDays: 30 }),
    /staleDays and largeFileMB are no longer evaluated/,
  );
  assert.throws(
    () => parseConfig({ schema: 1, largeFileMB: 10 }),
    /staleDays and largeFileMB are no longer evaluated/,
  );
  assert.throws(
    () =>
      parseConfig({
        schema: 2,
        checks: {
          "workflow/action-pin": {
            enabled: false,
            reason: "Temporary release exception",
            expiresAt: "2030-01-01",
          },
        },
      }),
    /RFC 3339 date-time/,
  );
  assert.throws(
    () =>
      parseConfig({
        schema: 2,
        checks: {
          "workflow/action-pin": {
            enabled: false,
            reason: "Temporary release exception",
            expiresAt: "2030-02-30T00:00:00Z",
          },
        },
      }),
    /RFC 3339 date-time/,
  );
});

test("standalone HTML reports preserve policy, evidence, and limitations", async () => {
  const fixture = await makeRepository();
  try {
    await introduceMutableAction(fixture.root);
    const result = await runAudit(auditOptions(fixture.root));
    const report = {
      ...result.report,
      repository: {
        ...result.report.repository,
        name: "<unsafe repository>",
      },
      limitations: [
        ...result.report.limitations,
        "Does not execute <repository scripts>.",
      ],
    };
    const html = renderHtml(report);
    assert.match(html, /STATUS POLICY PASSED/);
    assert.match(html, /Configured evidence/);
    assert.match(html, /Scope and limitations/);
    assert.match(html, /Finding ID/);
    assert.match(html, /offline report/);
    assert.match(html, /default-src &#39;none&#39;|default-src 'none'/);
    assert.match(html, /&lt;unsafe repository&gt;/);
    assert.match(html, /Does not execute &lt;repository scripts&gt;\./);
    assert.doesNotMatch(html, /<unsafe repository>/);
  } finally {
    await fixture.cleanup();
  }
});

test("baseline metadata validates owner, reason, timestamps, and commit", () => {
  const baseline = {
    schemaVersion: 3,
    kind: "repolens-baseline",
    tool: { name: "RepoLens", version: TOOL_VERSION },
    repository: { name: "fixture", githubUrl: null },
    acceptance: {
      reason: "Reviewed existing maintenance debt",
      owner: "Maintainer",
      acceptedAt: "2026-07-29T00:00:00.000Z",
      expiresAt: futureExpiration,
      baseCommit: "a".repeat(40),
    },
    accepted: [],
  };
  assert.equal(
    parseBaselineV3(baseline, new Date("2026-07-29")).schemaVersion,
    3,
  );
  assert.throws(
    () =>
      parseBaselineV3(
        {
          ...baseline,
          acceptance: { ...baseline.acceptance, owner: "" },
        },
        new Date("2026-07-29"),
      ),
    /owner/,
  );
  assert.throws(
    () =>
      parseBaselineV3(
        baseline,
        new Date(Date.parse(futureExpiration) + 1),
      ),
    (error: unknown) =>
      error instanceof RepoLensError &&
      error.code === "BASELINE_EXPIRED",
  );
  assert.throws(
    () =>
      parseBaselineV3(
        {
          ...baseline,
          acceptance: {
            ...baseline.acceptance,
            acceptedAt: "2026-07-29",
          },
        },
        new Date("2026-07-29"),
      ),
    /RFC 3339 date-time/,
  );
  assert.throws(
    () =>
      parseBaselineV3(
        { ...baseline, typoThatWouldBeIgnored: true },
        new Date("2026-07-29"),
      ),
    (error: unknown) =>
      error instanceof RepoLensError &&
      error.code === "BASELINE_INVALID",
  );
});

test("strict mode reserves exit 2 for unavailable npm coverage", async () => {
  const fixture = await makeRepository();
  const originalFetch = globalThis.fetch;
  try {
    const manifestPath = join(fixture.root, "package.json");
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as Record<string, unknown>;
    manifest.dependencies = { example: "^1.0.0" };
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    const lockPath = join(fixture.root, "package-lock.json");
    const lock = JSON.parse(
      await readFile(lockPath, "utf8"),
    ) as {
      packages: Record<string, Record<string, unknown>>;
    };
    lock.packages[""] = {
      ...lock.packages[""],
      dependencies: { example: "^1.0.0" },
    };
    await writeFile(
      lockPath,
      `${JSON.stringify(lock, null, 2)}\n`,
      "utf8",
    );
    globalThis.fetch = (async () =>
      new Response("{}", { status: 403 })) as typeof fetch;
    const result = await runAudit(
      auditOptions(fixture.root, {
        offline: false,
        strict: true,
      }),
    );
    assert.equal(result.exitCode, 2);
    assert.equal(result.report.policy.operationalError, true);
    assert.ok(result.report.counts.unknown > 0);
    assert.ok(
      result.report.findings.every(
        (finding) =>
          finding.severity !== "unknown" ||
          finding.ruleId === "coverage/npm",
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
    await fixture.cleanup();
  }
});

test("CLI command parser exposes setup, baseline, doctor, and explain without raw tokens", () => {
  const command = (args: string[]): string => {
    const parsed = parseCliArgs(args);
    assert.notEqual(parsed, "help");
    assert.notEqual(parsed, "version");
    return typeof parsed === "string" ? parsed : parsed.command;
  };

  assert.equal(command(["setup"]), "setup");
  assert.equal(
    command(["baseline", "accept"]),
    "baseline-accept",
  );
  assert.equal(
    command(["baseline", "check"]),
    "baseline-check",
  );
  assert.equal(command(["doctor"]), "doctor");
  assert.equal(
    command(["explain", "workflow/action-pin"]),
    "explain",
  );
  assert.throws(
    () => parseCliArgs(["scan", ".", "--token", "secret"]),
    /Raw tokens/,
  );
  assert.throws(
    () => parseCliArgs(["scan", ".", "--stale-days", "30"]),
    /Unknown scan argument/,
  );
});
