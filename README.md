# RepoLens

RepoLens fails a pull request that adds a new maintenance problem to a Node
repository on GitHub Actions: an unpinned action, a write-scoped token, a
`test`, `lint` or `build` script that CI never runs, a lockfile that disagrees
with `package.json`, a gap in Dependabot. Problems that already exist are
reviewed once and recorded in a baseline, so they don't block anyone.

Product guide: [https://repolens.whago.net/](https://repolens.whago.net/)

## RepoLens and OpenSSF Scorecard

[Scorecard](https://github.com/ossf/scorecard) checks several of the same
things. The difference is what each one reports.

| | RepoLens | OpenSSF Scorecard |
| --- | --- | --- |
| Reports | Only what this pull request made worse than the reviewed baseline | A 0 to 10 rating for the whole repository |
| Existing problems | Accepted once with a reason, owner and expiry | Counted on every run |
| Who can accept a problem | The baseline is read from the base branch, so a pull request cannot approve its own regression | Not applicable |
| Checks both have | Pinned actions, token permissions, Dependabot coverage | Pinned-Dependencies, Token-Permissions, Dependency-Update-Tool |
| Only here | `test`/`lint`/`build` scripts reachable from a PR workflow, `package.json` and lockfile agreement (npm, pnpm, Yarn, Bun), tracked `.env` files | Branch protection, code review, maintenance activity, signed releases, fuzzing, SAST |
| Output | Annotations on new findings, job summary, SARIF | SARIF, badge, public results API |

Use Scorecard for the overall picture and RepoLens as the merge gate that keeps
a pull request from making it worse.

The website is documentation only. Repository inspection runs in the CLI or
the pinned GitHub Action; nothing is uploaded.

## Install

Node.js 20.11 or newer.

```sh
npx @rad1092/repolens setup .
```

Or install it:

```sh
npm install --global @rad1092/repolens
repolens --version
```

The npm package is published from the release workflow with npm provenance.
Each GitHub Release also carries the package tarball, its SHA-256 digest and a
build attestation:

```sh
npm install --global \
  https://github.com/rad1092/repolens/releases/download/v0.4.0/rad1092-repolens-0.4.0.tgz
```

The unscoped `repolens` name on npm belongs to another project.

## Start the gate

Run setup once from a committed Git repository:

```sh
repolens setup .
```

Setup writes exactly three files:

- `.repolens.json` — rule policy and reviewed exceptions
- `.repolens/baselines/accepted.json` — compact baseline schema v3
- `.github/workflows/repolens.yml` — SHA-pinned pull-request gate

The baseline records who accepted the current findings, why, and until when.
By default the owner is your `git config user.name`, the reason is an initial
review note and the acceptance expires in 90 days. Teams can set them:

```sh
repolens setup . \
  --owner "Platform team" \
  --reason "Existing findings reviewed in maintenance review 42" \
  --expires 6m
```

`--expires` takes an RFC 3339 time or a duration such as `30d`, `12w`, `6m`
or `1y`. The generated workflow reads its gate policy from `.repolens.json`
instead of duplicating it, and pins the RepoLens Action to the commit behind
this release's tag. To pin a different reviewed commit, pass
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

RepoLens v0.4 covers a small contract:

| Rule area | Validation |
| --- | --- |
| GitHub Actions | YAML parses; a pull-request trigger exists; token permissions are explicit and read-only |
| Action supply chain | Third-party `uses:` references are pinned to full commit SHAs |
| CI wiring | Real `test`, `lint`, and `build` scripts are reachable from a pull-request workflow through `npm`, `pnpm`, `yarn` or `bun run` |
| Node manifest | `package.json` parses and verification scripts are not placeholders |
| Lockfile | The lockfile of the package manager in use (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` or text `bun.lock`) parses, agrees with `package.json`, and has an entry for every direct dependency. `packageManager` in `package.json` decides which one is expected. Binary `bun.lockb` is not read |
| Dependency automation | Dependabot v2 parses and covers npm (or bun) plus GitHub Actions at the repository root |
| Credential filename risk | Tracked `.env`-style files are reported without reading or printing their values |
| Update context | Declared, locked, latest, and change type are shown for the updater to review |

A file merely existing never counts as proof that it works. RepoLens parses the
configuration and traces script wiring, but labels configured commands as
`configured-not-executed`.

Use dedicated tools for the analysis they own:

- OpenSSF Scorecard for an overall security posture rating
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

v0.4 writes config schema 2:

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

The tag workflow publishes three release artifacts and the npm package:

- `rad1092-repolens-<version>.tgz` — installable CLI package
- `SHA256SUMS` — digest for the package bytes
- `manifest.json` — package name, version, size, integrity, runtime, and digest

The tag workflow refuses to publish unless repository release
immutability is already enabled. Publication is fail-closed. Before the
release job can run:

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
immutable. When the `NPM_TOKEN` secret is set, the same verified tarball is
published to npm with `npm publish --provenance`. Verify a downloaded package
with:

```sh
gh attestation verify rad1092-repolens-0.4.0.tgz \
  --repo rad1092/repolens
```
