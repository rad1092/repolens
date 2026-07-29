import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

test("documents the v0.3 regression gate without stale score or mutable Action guidance", async () => {
  const [example, readme, landing, actionRaw, packageRaw] = await Promise.all([
    repositoryFile("examples/repolens-workflow.yml"),
    repositoryFile("README.md"),
    repositoryFile("docs/index.html"),
    repositoryFile("action.yml"),
    repositoryFile("package.json"),
  ]);
  const packageJson = JSON.parse(packageRaw) as { version?: string };
  const publicCopy = `${example}\n${readme}\n${landing}`;

  assert.equal(packageJson.version, "0.3.0");
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
  assert.doesNotMatch(publicCopy, /\bScore\b|\bGrade\b|v0\.2\.0/);
  assert.doesNotMatch(
    publicCopy,
    /uses:\s*rad1092\/repolens@(?:main|master|v\d)/,
  );

  assert.match(actionRaw, /using: node24/);
  assert.match(actionRaw, /report-sarif:/);
  assert.doesNotMatch(actionRaw, /^\s*score:/m);
});
