# RepoLens

RepoLens is a read-only regression gate for the maintenance contract of Node
repositories that use GitHub Actions.

It answers one question on a pull request: did this change introduce a new
repository-maintenance problem?

RepoLens validates the repository state, records reviewed existing debt in a
compact baseline, and reports only new or worsened findings as annotations and
SARIF. It does not execute project scripts or replace security, code-quality,
or dependency-update tools.

Product guide: [https://repolens.whago.net/](https://repolens.whago.net/)

The website is documentation and a download route. Repository inspection runs
only in the installed CLI or the pinned GitHub Action; RepoLens does not upload
a repository to the website.

## Install

Node.js 20.11 or newer is required.

### Current public release: v0.3.0

The current public release is v0.3.0:

```sh
npm install --global \
  https://github.com/rad1092/repolens/releases/download/v0.3.0/rad1092-repolens-0.3.0.tgz
repolens --version
```

### Next release source: v0.4.0

This repository currently contains the next v0.4.0 source. It has not been
published as a GitHub Release. From a reviewed source checkout, run the complete
gate before linking the development build:

```sh
npm ci
npm run check
npm link
repolens --version
```

The unscoped `repolens` name on npm belongs to another project. This package is
named `@rad1092/repolens`.

The scoped package is intended for GitHub Release distribution rather than the
npm registry. The tag workflow refuses to publish unless repository release
immutability is already enabled, then publishes the package with its SHA-256
digest. Download the tarball, compare that digest, and install the verified
local file when your environment requires an explicit supply-chain check.

## Start the gate

Run setup once from a committed Git repository:

```sh
repolens setup . \
  --reason "Existing maintenance findings reviewed before enabling the gate" \
  --owner "Repository maintainers"
```

Setup writes exactly three files:

- `.repolens.json` — rule policy and reviewed exceptions
- `.repolens/baselines/accepted.json` — compact baseline schema v3
- `.github/workflows/repolens.yml` — SHA-pinned pull-request gate

If `--expires` is omitted, setup uses a 90-day review window. The generated
workflow reads its gate policy from `.repolens.json` instead of duplicating it.

Setup resolves the immutable commit behind the matching RepoLens release tag.
Before that tag exists, pass a reviewed full commit explicitly with
`--action-sha <40-character-sha>`.

Review the files, then commit them in a change separate from future debt
acceptance:

```sh
git add .repolens.json .repolens .github/workflows/repolens.yml
git commit -m "chore: enable RepoLens maintenance gate"
```

Confirm that the configuration, baseline, and baseline commit are usable:

```sh
repolens doctor .
repolens baseline check . --offline
```

On pull requests, the Action reads the baseline from the base branch. A pull
request cannot edit that baseline and use the edit to approve its own
regressions.

## What it validates

RepoLens v0.4 deliberately covers a small contract:

| Rule area | Validation |
| --- | --- |
| GitHub Actions | YAML parses; a pull-request trigger exists; token permissions are explicit and read-only |
| Action supply chain | Third-party `uses:` references are pinned to full commit SHAs |
| CI wiring | Real `test`, `lint`, and `build` scripts are reachable from a pull-request workflow |
| Node manifest | `package.json` parses and verification scripts are not placeholders |
| npm lockfile | `package-lock.json` parses, root declarations agree, and every direct dependency has a package entry |
| Dependency automation | Dependabot v2 parses and covers npm plus GitHub Actions at the repository root |
| Credential filename risk | Tracked `.env`-style files are reported without reading or printing their values |
| Update context | Declared, locked, latest, and change type are shown for the updater to review |

A file merely existing never counts as proof that it works. RepoLens parses the
configuration and traces script wiring, but labels configured commands as
`configured-not-executed`.

Use dedicated tools for the analysis they own:

- actionlint for complete GitHub Actions linting
- zizmor for GitHub Actions security analysis
- CodeQL, Semgrep, or SonarQube for source analysis
- Trivy or another vulnerability scanner for known vulnerabilities
- Dependabot or Renovate for update proposals

## Baselines and exit codes

The baseline stores only actionable finding identities plus:

- the reviewer and reason
- acceptance and expiration timestamps
- the Git commit on which the review was based

It is not a saved presentation report and it never updates implicitly.

```sh
repolens baseline accept . \
  --reason "Remaining findings reviewed in maintenance review 42" \
  --owner "Platform team"
```

| Code | Meaning |
| --- | --- |
| `0` | The selected gate passed |
| `1` | A maintenance regression violated policy |
| `2` | Configuration, baseline, requested coverage, or execution was incomplete |

`unknown` remains visible. With `strict: true`, unavailable requested coverage
returns exit `2`; it is never converted into a pass.

### Migrating a v2 report baseline

A v2 report cannot silently become a v3 acceptance record. Review the current
scan and migrate explicitly:

```sh
repolens baseline accept . \
  --from-v2 old-repolens-report.json \
  --reason "Re-reviewed existing debt during v3 migration" \
  --owner "Repository maintainers"
```

The v3 baseline records the source report hash as migration provenance.

## Configuration

The next-release v0.4 source writes schema 2. Its versioned schema URL becomes
available when the v0.4.0 tag is published:

```json
{
  "$schema": "https://raw.githubusercontent.com/rad1092/repolens/v0.4.0/.repolens.schema.json",
  "schema": 2,
  "excludes": [
    "**/.repolens/**",
    "**/fixtures/**",
    "**/__fixtures__/**",
    "**/testdata/**"
  ],
  "policy": {
    "failOn": "new-warning",
    "strict": false
  },
  "checks": {}
}
```

Each rule can be enabled or disabled, have its severity changed, or ignore a
specific fingerprint. Disabling a rule and ignoring a finding both require a
reason and expiration. Expired exceptions become findings instead of
disappearing.

```json
{
  "schema": 2,
  "checks": {
    "workflow/action-pin": {
      "severity": "critical"
    },
    "dependabot/actions-coverage": {
      "enabled": false,
      "reason": "Migration tracked in infrastructure issue 42",
      "expiresAt": "2099-10-01T00:00:00Z"
    }
  }
}
```

Run `repolens explain <rule-id>` for the rule rationale and remediation. The
checked-in [JSON Schema](.repolens.schema.json) lists all configurable rule
IDs.

## Commands

```text
repolens setup [directory] [options]
repolens scan [target] [options]
repolens compare [target] --baseline <baseline.json> [options]
repolens baseline accept [target] [options]
repolens baseline check [target] [options]
repolens doctor [target]
repolens explain <rule-id>
```

Reports are available as terminal text, versioned JSON, standalone HTML,
GitHub-flavored Markdown, and SARIF:

The JSON report is machine-readable audit output. It is not the compact
acceptance baseline stored under `.repolens/baselines/`.

The HTML report is one self-contained offline file. It includes the policy
result, detection and npm-metadata coverage, finding evidence, reviewed
exceptions, configured-but-not-executed commands, and declared limitations. It
contains no scripts, remote fonts, analytics, or network requests.

```sh
repolens compare . \
  --baseline .repolens/baselines/accepted.json \
  --fail-on new-warning \
  --format terminal,json,html,github,sarif \
  --output .repolens/reports
```

The Action annotates only new or worsened findings. Accepted debt remains in
the job summary without generating repeated annotations.

## Authentication

Public GitHub repositories clone without a token. For a private remote target,
supply a token through an environment variable:

```sh
export REPOLENS_GITHUB_TOKEN="..."
repolens scan owner/private-repository \
  --token-env REPOLENS_GITHUB_TOKEN
```

RepoLens rejects raw `--token` arguments. Credentials are not written to the
checkout, configuration, or report.

## Release artifacts

The tag workflow can publish three artifacts:

- `rad1092-repolens-<version>.tgz` — installable CLI package
- `SHA256SUMS` — digest for the package bytes
- `manifest.json` — package name, version, size, integrity, runtime, and digest

Publication is fail-closed. Before the release job can run:

- Node 20.11, 22, and 24 must each pass the CLI, Action, package, and report gate.
- The tag commit must already belong to the default branch history.
- Repository release immutability must be enabled outside the workflow.
- `IMMUTABLE_RELEASES_READ_TOKEN` must contain a fine-grained token with only
  the repository `Administration: read` permission needed to inspect that
  setting.

The workflow only calls GitHub's read endpoint for the immutability setting. It
never enables or disables the setting. If the token is absent, the setting
cannot be read, or `enabled` is not `true`, no release is created. GitHub only
makes releases created after that setting is enabled immutable; existing
releases are not changed retroactively.

After those checks, the release build creates the package twice and requires
identical SHA-256 digests. It installs the tarball into an empty prefix and runs
the packaged CLI through offline HTML, JSON, and SARIF reports plus exit codes
`0`, `1`, and `2`. The workflow signs SLSA build provenance with GitHub artifact
attestations and verifies that GitHub reports the published release as
immutable. After v0.4.0 is published, verify its downloaded package with:

```sh
gh attestation verify rad1092-repolens-0.4.0.tgz \
  --repo rad1092/repolens
```
