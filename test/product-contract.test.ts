import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const releaseCommit = "00c84775267424a640abbee86fd2b1a1e5f6c159";
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

test("ships a copyable baseline-aware Action workflow pinned to v0.2.0", async () => {
  const [example, readme, landing] = await Promise.all([
    repositoryFile("examples/repolens-workflow.yml"),
    repositoryFile("README.md"),
    repositoryFile("docs/index.html"),
  ]);
  const pinnedRepoLens = `uses: rad1092/repolens@${releaseCommit} # v0.2.0`;

  for (const source of [example, readme, landing]) {
    assert.match(source, new RegExp(pinnedRepoLens.replaceAll("/", "\\/")));
    assert.match(source, /\.repolens\/baselines\/accepted\.json/);
    assert.match(source, /fail-on: new-warning/);
    assert.doesNotMatch(source, /REPLACE_WITH|uses: rad1092\/repolens@v0\.2\.0/);
  }

  assert.match(
    example,
    /repolens scan \. --format json --output \.repolens\/baselines\/accepted\.json --fail-on none/,
  );
  assert.match(
    readme,
    /repolens scan \.[\s\S]*--format json[\s\S]*--output \.repolens\/baselines\/accepted\.json[\s\S]*--fail-on none/,
  );
  assert.ok(
    readme.indexOf("--output .repolens/baselines/accepted.json") <
      readme.indexOf(pinnedRepoLens),
  );

  const actionReferences = [
    ...example.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm),
  ].map((match) => match[1] ?? "");
  assert.ok(actionReferences.length >= 3);
  for (const reference of actionReferences) {
    assert.match(reference, /@[0-9a-f]{40}$/);
  }

  assert.match(landing, /Status POLICY PASSED/);
  assert.match(landing, /New\s+0 critical/);
  assert.match(landing, /Base\s+2026-07-28T09:00:00\.000Z/);
  assert.match(landing, /Policy new-warning/);
  assert.match(landing, /Score\s+94\/100/);
  assert.doesNotMatch(landing, /Now\s+0 critical/);
  assert.match(landing, /Grade A \(secondary heuristic\)/);
  assert.doesNotMatch(landing, /accepted in baseline · no regression/);
});
