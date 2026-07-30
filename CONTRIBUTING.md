# Contributing

## Setup

Requirements:

- Node.js 20.11 or newer
- npm
- Git

```sh
npm ci
npm test
```

`npm test` compiles TypeScript and runs fixture-based tests. Run the complete
local gate before opening a pull request:

```sh
npm run check
```

`npm run check` also packs the CLI, installs it into an empty temporary prefix,
and runs offline HTML, JSON, and SARIF reports plus exit-code checks through the
installed executable. This catches missing package files and broken `bin` paths
that source-level tests cannot.

## Change rules

- Keep audits read-only by default.
- Never accept a raw token on the command line or place one in report data.
- Do not execute package scripts from an audited repository.
- Add an inert fixture and a regression test for every new check.
- Keep the HTML reporter self-contained and usable from a nested URL.
- Describe false positives and unsupported ecosystems in the README.

Generated `dist/` files are not committed. The bundled
`action/index.cjs` is committed because GitHub Actions executes it directly;
run `npm run build:action` after changing action or runtime code.

## Prepare a release

Keep the version in `package.json`, `src/constants.ts`, and the configuration
schema `$id` synchronized, update the versioned install links, and run:

```sh
npm run release:artifacts -- --tag "v<version>"
```

The command runs the complete gate, builds the npm tarball twice, compares the
SHA-256 digests, installs the package in an empty prefix, and writes the
tarball, `SHA256SUMS`, and `manifest.json` under ignored `release/`.

Before pushing the tag, enable release immutability in the repository settings
and configure `IMMUTABLE_RELEASES_READ_TOKEN` with fine-grained
`Administration: read` access. This workflow deliberately cannot change that
setting. Existing releases do not become immutable when the setting is enabled.

The tag must point to a commit already contained in the default branch.
Node 20.11, 22, and 24 must all pass before the publish job starts. If the
immutable-release setting cannot be confirmed as enabled, the workflow stops
without creating a release. The workflow has read-only top-level permissions;
only its non-PR publish job receives the write scopes needed for release and
attestation creation.
