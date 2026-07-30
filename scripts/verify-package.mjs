import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageJson = JSON.parse(
  readFileSync(join(repositoryRoot, "package.json"), "utf8"),
);
const temporaryRoot = mkdtempSync(
  join(tmpdir(), "repolens-package-smoke-"),
);

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
    ...options,
  });
}

function expectExitCode(command, args, expected) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
  });
  if (result.error) throw result.error;
  const actual = result.status ?? -1;
  if (actual !== expected) {
    throw new Error(
      `Expected exit ${expected} from ${args.join(" ")}, received ${actual}.\n${result.stderr}`,
    );
  }
}

function packageTarball() {
  const output = JSON.parse(
    run("npm", [
      "pack",
      "--json",
      "--pack-destination",
      temporaryRoot,
    ]),
  );
  const filename = output[0]?.filename;
  if (typeof filename !== "string") {
    throw new Error("npm pack did not return a package filename.");
  }
  return join(temporaryRoot, filename);
}

try {
  const requested = process.argv[2];
  const tarball = requested
    ? resolve(repositoryRoot, requested)
    : packageTarball();
  if (!statSync(tarball).isFile()) {
    throw new Error(`Package tarball was not found: ${tarball}`);
  }

  const prefix = join(temporaryRoot, "install");
  run("npm", ["install", "--global", "--prefix", prefix, tarball]);
  const executable =
    process.platform === "win32"
      ? join(prefix, "repolens.cmd")
      : join(prefix, "bin", "repolens");
  const installedVersion = run(executable, ["--version"]).trim();
  if (installedVersion !== packageJson.version) {
    throw new Error(
      `Installed CLI reported ${installedVersion}; expected ${packageJson.version}.`,
    );
  }

  const reports = join(temporaryRoot, "reports");
  const fixture = join(repositoryRoot, "test", "fixtures", "example");
  run(executable, [
    "scan",
    fixture,
    "--offline",
    "--fail-on",
    "none",
    "--format",
    "html,json,sarif",
    "--output",
    reports,
  ]);
  const html = readFileSync(
    join(reports, "repolens-report.html"),
    "utf8",
  );
  for (const required of [
    "STATUS POLICY PASSED",
    "Configured evidence",
    "Scope and limitations",
    "default-src 'none'",
  ]) {
    if (!html.includes(required)) {
      throw new Error(`Installed CLI report is missing: ${required}`);
    }
  }
  const json = JSON.parse(
    readFileSync(join(reports, "repolens-report.json"), "utf8"),
  );
  if (
    json.schemaVersion !== 3 ||
    json.policy?.passed !== true ||
    json.policy?.failOn !== "none"
  ) {
    throw new Error(
      "Installed CLI JSON report does not preserve the passing policy contract.",
    );
  }
  const sarif = JSON.parse(
    readFileSync(join(reports, "repolens-report.sarif"), "utf8"),
  );
  if (
    sarif.version !== "2.1.0" ||
    !Array.isArray(sarif.runs) ||
    !Array.isArray(sarif.runs[0]?.results)
  ) {
    throw new Error(
      "Installed CLI did not produce a valid SARIF 2.1.0 result envelope.",
    );
  }

  expectExitCode(
    executable,
    ["scan", fixture, "--offline", "--no-color"],
    1,
  );
  expectExitCode(
    executable,
    [
      "scan",
      fixture,
      "--offline",
      "--config",
      "missing-repolens-config.json",
      "--no-color",
    ],
    2,
  );

  process.stdout.write(
    `Verified ${packageJson.name} ${installedVersion}: install, offline HTML/JSON/SARIF reports, and exit codes 0/1/2.\n`,
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
