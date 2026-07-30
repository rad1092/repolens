import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

const testRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testRoot, "../..");

async function repositoryFile(path: string): Promise<string> {
  return readFile(join(repositoryRoot, path), "utf8");
}

test("keeps product documentation on the independent RepoLens origin", async () => {
  const [landing, readme, packageRaw, workflowNames] = await Promise.all([
    repositoryFile("docs/index.html"),
    repositoryFile("README.md"),
    repositoryFile("package.json"),
    readdir(join(repositoryRoot, ".github/workflows")),
  ]);
  const packageJson = JSON.parse(packageRaw) as {
    description?: string;
    homepage?: string;
  };

  assert.equal(packageJson.homepage, "https://repolens.whago.net/");
  assert.match(packageJson.description ?? "", /CLI and GitHub Action/);
  assert.match(
    landing,
    /<link rel="canonical" href="https:\/\/repolens\.whago\.net\/">/,
  );
  assert.match(
    landing,
    /<meta property="og:url" content="https:\/\/repolens\.whago\.net\/">/,
  );
  assert.match(
    landing,
    /<meta property="og:image" content="https:\/\/repolens\.whago\.net\/og\.png">/,
  );
  assert.match(landing, /CLI \+ GitHub Action/);
  assert.match(readme, /https:\/\/repolens\.whago\.net\//);
  assert.doesNotMatch(
    `${landing}\n${readme}\n${packageRaw}`,
    /rad1092\.github\.io|actions\/deploy-pages|actions\/upload-pages-artifact/,
  );
  assert.ok(!workflowNames.includes("pages.yml"));

  const socialPreview = await readFile(join(repositoryRoot, "docs/og.png"));
  assert.deepEqual(
    [...socialPreview.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  );

  const workflowSources = await Promise.all(
    workflowNames.map((name) =>
      repositoryFile(join(".github/workflows", name)),
    ),
  );
  assert.doesNotMatch(
    workflowSources.join("\n"),
    /actions\/deploy-pages|actions\/upload-pages-artifact|github-pages/,
  );
});

test("documents the v0.4 regression gate without stale score or mutable Action guidance", async () => {
  const [
    example,
    readme,
    landing,
    actionRaw,
    packageRaw,
    schemaRaw,
    releaseWorkflow,
    releaseScript,
  ] = await Promise.all([
    repositoryFile("examples/repolens-workflow.yml"),
    repositoryFile("README.md"),
    repositoryFile("docs/index.html"),
    repositoryFile("action.yml"),
    repositoryFile("package.json"),
    repositoryFile(".repolens.schema.json"),
    repositoryFile(".github/workflows/release.yml"),
    repositoryFile("scripts/release-artifacts.mjs"),
  ]);
  const packageJson = JSON.parse(packageRaw) as {
    version?: string;
    scripts?: Record<string, string>;
  };
  const schema = JSON.parse(schemaRaw) as { $id?: string };
  const nextRelease = `v${packageJson.version}`;
  const currentPublicRelease = "v0.3.0";
  const release = parseYaml(releaseWorkflow) as {
    jobs?: {
      verify?: {
        strategy?: {
          matrix?: { "node-version"?: string[] };
        };
      };
      source?: unknown;
      release?: { needs?: string[] };
    };
  };
  const publicCopy = `${example}\n${readme}\n${landing}`;

  assert.equal(packageJson.version, "0.4.0");
  assert.equal(
    schema.$id,
    `https://raw.githubusercontent.com/rad1092/repolens/v${packageJson.version}/.repolens.schema.json`,
  );
  assert.match(readme, /repolens setup \./);
  assert.match(readme, /repolens baseline check/);
  assert.match(readme, /base branch/);
  assert.match(readme, /SARIF/);
  assert.match(readme, /not the compact\s+acceptance baseline/);
  assert.match(example, /repolens setup \./);
  assert.doesNotMatch(example, /^\s*(?:-\s*)?uses:/m);

  assert.match(landing, /Status NO NEW REGRESSIONS/);
  assert.match(landing, /Accepted 2/);
  assert.match(landing, /five outputs/i);
  assert.match(landing, /SARIF/);
  assert.match(landing, /separate compact baseline/);
  assert.match(landing, /Website is documentation/);
  assert.match(readme, /SHA256SUMS/);
  assert.match(readme, /empty prefix/);
  assert.match(readme, /IMMUTABLE_RELEASES_READ_TOKEN/);
  assert.match(readme, /existing\s+releases are not changed retroactively/);
  assert.match(readme, /Node 20\.11, 22, and 24/);
  assert.match(readme, /Current public release: v0\.3\.0/);
  assert.match(readme, /Next release source: v0\.4\.0/);
  assert.match(readme, /It has not been\s+published as a GitHub Release/);
  assert.match(readme, /npm run check/);
  assert.match(
    readme,
    new RegExp(
      `releases/download/${currentPublicRelease}/rad1092-repolens-${currentPublicRelease.slice(1)}\\.tgz`,
    ),
  );
  assert.match(
    landing,
    new RegExp(`releases/tag/${currentPublicRelease}`),
  );
  assert.match(landing, /next v0\.4\.0 source/i);
  assert.doesNotMatch(
    publicCopy,
    new RegExp(
      `github\\.com/rad1092/repolens/releases/(?:download|tag)/${nextRelease}(?:/|["')])`,
    ),
  );
  assert.match(
    readme,
    /refuses to publish unless repository release\s+immutability is already enabled/,
  );
  assert.doesNotMatch(readme, /is distributed as an immutable GitHub Release/);
  assert.equal(
    packageJson.scripts?.["release:artifacts"],
    "node scripts/release-artifacts.mjs",
  );
  assert.match(releaseWorkflow, /tags: \["v\*"\]/);
  assert.match(releaseWorkflow, /contents: read/);
  assert.match(releaseWorkflow, /contents: write/);
  assert.deepEqual(
    release.jobs?.verify?.strategy?.matrix?.["node-version"],
    ["20.11.0", "22", "24"],
  );
  assert.ok(release.jobs?.source);
  assert.deepEqual(release.jobs?.release?.needs, ["verify", "source"]);
  assert.match(releaseWorkflow, /git merge-base --is-ancestor/);
  assert.match(
    releaseWorkflow,
    /refs\/remotes\/origin\/\$DEFAULT_BRANCH/,
  );
  assert.match(releaseWorkflow, /IMMUTABLE_RELEASES_READ_TOKEN/);
  assert.match(
    releaseWorkflow,
    /repos\/\$GITHUB_REPOSITORY\/immutable-releases/,
  );
  assert.match(releaseWorkflow, /X-GitHub-Api-Version: 2026-03-10/);
  assert.match(releaseWorkflow, /--jq '\.enabled'/);
  assert.match(releaseWorkflow, /\[ "\$enabled" != "true" \]/);
  assert.match(releaseWorkflow, /--jq '\.immutable'/);
  assert.doesNotMatch(
    releaseWorkflow,
    /(?:--method|-X)\s+(?:PUT|PATCH|DELETE)/i,
  );
  assert.match(releaseWorkflow, /npm run release:artifacts/);
  assert.match(
    releaseWorkflow,
    /uses: actions\/attest@[a-f0-9]{40} # v4\.2\.1/,
  );
  assert.match(releaseWorkflow, /subject-checksums: release\/SHA256SUMS/);
  assert.match(releaseWorkflow, /gh release create/);
  assert.match(releaseScript, /SHA256SUMS/);
  assert.match(releaseScript, /different SHA-256 digests/);
  assert.doesNotMatch(publicCopy, /\bScore\b|\bGrade\b|v0\.2\.0/);
  assert.doesNotMatch(
    publicCopy,
    /uses:\s*rad1092\/repolens@(?:main|master|v\d)/,
  );

  assert.match(actionRaw, /using: node24/);
  assert.match(actionRaw, /report-sarif:/);
  assert.doesNotMatch(actionRaw, /^\s*score:/m);
});
