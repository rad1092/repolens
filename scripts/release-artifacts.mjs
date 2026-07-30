import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const releaseRoot = join(repositoryRoot, "release");
const packageJson = JSON.parse(
  readFileSync(join(repositoryRoot, "package.json"), "utf8"),
);

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  });
}

function sha256(path) {
  return createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
}

const requestedTag = argumentValue("--tag");
const expectedTag = `v${packageJson.version}`;
if (requestedTag && requestedTag !== expectedTag) {
  throw new Error(
    `Release tag ${requestedTag} does not match package version ${expectedTag}.`,
  );
}

rmSync(releaseRoot, { recursive: true, force: true });
mkdirSync(releaseRoot, { recursive: true });

run("npm", ["run", "check"], { stdio: "inherit" });
const packed = JSON.parse(
  run("npm", [
    "pack",
    "--json",
    "--pack-destination",
    releaseRoot,
  ]),
);
const packageMetadata = packed[0];
if (
  typeof packageMetadata?.filename !== "string" ||
  typeof packageMetadata?.integrity !== "string"
) {
  throw new Error("npm pack did not return complete package metadata.");
}

const tarball = join(releaseRoot, packageMetadata.filename);
const digest = sha256(tarball);
const comparisonRoot = mkdtempSync(
  join(tmpdir(), "repolens-reproducibility-"),
);
try {
  const comparison = JSON.parse(
    run("npm", [
      "pack",
      "--json",
      "--pack-destination",
      comparisonRoot,
    ]),
  );
  const comparisonFilename = comparison[0]?.filename;
  if (
    typeof comparisonFilename !== "string" ||
    sha256(join(comparisonRoot, comparisonFilename)) !== digest
  ) {
    throw new Error(
      "Two clean package builds produced different SHA-256 digests.",
    );
  }
} finally {
  rmSync(comparisonRoot, { recursive: true, force: true });
}

const manifest = {
  schemaVersion: 1,
  package: {
    name: packageJson.name,
    version: packageJson.version,
    filename: packageMetadata.filename,
    sha256: digest,
    integrity: packageMetadata.integrity,
    size: packageMetadata.size,
    unpackedSize: packageMetadata.unpackedSize,
    entryCount: packageMetadata.entryCount,
    node: packageJson.engines?.node ?? null,
  },
};
writeFileSync(
  join(releaseRoot, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
writeFileSync(
  join(releaseRoot, "SHA256SUMS"),
  `${digest}  ${packageMetadata.filename}\n`,
  "utf8",
);

run(
  process.execPath,
  [join(repositoryRoot, "scripts", "verify-package.mjs"), tarball],
  { stdio: "inherit" },
);
process.stdout.write(
  `Created reproducible release artifacts in ${releaseRoot}\n`,
);
