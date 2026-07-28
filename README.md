# RepoLens

RepoLens is a read-only maintenance triage tool for local and GitHub
repositories. It answers two bounded questions:

1. What should a maintainer inspect next?
2. Which critical, warning, or unknown findings changed since a saved report?

It runs as a Node.js CLI or a GitHub Action. The same report model renders as a
terminal summary, versioned JSON, standalone HTML, or GitHub-flavored Markdown.
The score remains available for rough orientation, but policy decisions use
explicit finding counts and baseline changes.

## Install

Node.js 20.11 or newer is required.

```sh
npm install --global \
  https://github.com/rad1092/repolens/releases/download/v0.2.0/rad1092-repolens-0.2.0.tgz
repolens --version
```

From a source checkout:

```sh
npm ci
npm run build
npm link
repolens scan .
```

The unscoped `repolens` name on npm belongs to a different project. This
package is prepared as `@rad1092/repolens` for a future scoped npm release, but
v0.2.0 is installed from its versioned GitHub Release tarball.

## The maintenance loop

Create a policy:

```sh
repolens init
```

Inspect the current repository:

```sh
repolens scan .
repolens scan owner/repository
```

Save a baseline after reviewing the evidence:

```sh
repolens scan . \
  --format json \
  --output .repolens/baselines/accepted.json \
  --fail-on none
```

Compare after the next change:

```sh
repolens compare . \
  --baseline .repolens/baselines/accepted.json \
  --fail-on new-warning
```

Fix an item, run the same command again, and replace the baseline only after
the remaining findings are intentionally accepted. RepoLens never updates the
baseline implicitly.

The default detection scope excludes `.repolens/`. A baseline selected from
another path inside the target is also excluded for that run.

For aggregate findings, RepoLens compares stable evidence identities as well
as severity. A newly affected file, dependency, action, or TODO therefore
counts as worsened even when the finding remains a warning or critical.
Volatile details such as file size, dependency version, and TODO line number
do not create a regression by themselves. New reports retain a full,
non-display comparison digest so a 12-item evidence preview cannot create a
false regression when its order changes. Older baselines remain compatible;
they use severity and the full total when available, without inferring changes
from a truncated preview.

## Commands

```text
repolens scan [target] [options]
repolens compare [target] --baseline <report.json> [options]
repolens init [directory] [--force]
```

`scan` accepts a local directory, `owner/repository`, or a GitHub URL. Calling
`repolens [target]` remains a shorthand for `repolens scan [target]`.

Common options:

```text
--format terminal,json,html,github
--output <file-or-directory>
--config <path>
--fail-on none|critical|warning|new-critical|new-warning
--strict
--offline
--token-env <environment-variable>
--stale-days <days>
--large-file-mb <megabytes>
```

Run `repolens --help` for the canonical list.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Inspection completed and the selected policy passed |
| `1` | Inspection completed and the selected policy failed |
| `2` | Configuration or execution failed, or strict mode found unavailable inspection areas |

Without a baseline, `new-critical` and `new-warning` use current findings so a
missing baseline cannot silently clear a gate.

## Configuration

`repolens init` writes `.repolens.json`:

```json
{
  "schema": 1,
  "excludes": [
    "**/.repolens/**",
    "**/fixtures/**",
    "**/__fixtures__/**",
    "**/testdata/**"
  ],
  "staleDays": 180,
  "largeFileMB": 1,
  "policy": {
    "failOn": "critical",
    "strict": false
  }
}
```

The JSON Schema is checked in as
[`/.repolens.schema.json`](.repolens.schema.json). Unknown config fields fail
with exit `2`, which catches misspelled policy names instead of ignoring them.

Exclude globs apply before every file-based check. Reports always show the
number of discovered, included, and excluded files plus the active globs. That
is why this repository can exclude its deliberately tracked credential
detection fixtures without disguising the reduced scope.

## What it checks

| Area | Evidence |
| --- | --- |
| Documentation | Root README, license, security policy, contribution guide |
| CI intent | GitHub Actions workflow files |
| Workflow hygiene | External actions pinned to full commit SHAs |
| Dependency upkeep | Lockfiles, root npm ranges, Dependabot or Renovate config |
| Repository rules | Default-branch protection or a matching active ruleset |
| Package scripts | Root Node.js test, build, and lint script names |
| Maintenance debt | Bounded TODO/FIXME evidence and large tracked files |
| Credential hygiene | Tracked `.env`-pattern filenames; values are never reported |
| Activity | Latest commit, release, open issues, and open pull requests |

A workflow file is evidence that automation is configured; the latest run is
separate evidence. Dependency freshness compares supported root npm semver
ranges with the registry `latest` tag. Compatibility and vulnerability review
remain the responsibility of their dedicated tools.

## Unknown is a first-class result

GitHub permission failures, API rate limits, timeouts, and incomplete npm
metadata are reported as `unknown`. They are never converted into a pass.

Use non-strict mode for a best-effort local review. Use `strict: true` when CI
must fail with exit `2` unless all requested external metadata was available.
`--offline` is an intentional scope choice and is displayed as such rather
than treated as an operational failure.

## GitHub Action

The repository contains a bundled Node action. Pin it to a verified full commit
SHA:

```yaml
name: Repository maintenance

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: "17 0 * * 1"

permissions:
  contents: read

jobs:
  inspect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5

      - id: repolens
        uses: rad1092/repolens@REPLACE_WITH_A_VERIFIED_FULL_COMMIT_SHA
        env:
          GITHUB_TOKEN: ${{ github.token }}
        with:
          target: "."
          config: ".repolens.json"
          fail-on: critical
```

The action adds a Markdown job summary and annotations. It exposes current and
new finding counts plus absolute paths to JSON, HTML, and Markdown reports so
the caller can upload them with `actions/upload-artifact`.

See [`examples/repolens-workflow.yml`](examples/repolens-workflow.yml) for the
complete artifact step.

## GitHub authentication

Public metadata works anonymously until GitHub's API rate limit is reached.
For private repositories or settings that need authentication, pass a token
through an environment variable:

```sh
export REPOLENS_GITHUB_TOKEN="..."
repolens scan owner/private-repository \
  --token-env REPOLENS_GITHUB_TOKEN
```

RepoLens rejects `--token`. Remote Git authentication is supplied to the
temporary Git process through environment-backed configuration. It is not
written to the checkout, report, log, or config file.

Use the narrowest read permission available. Repository rules and some
security settings can remain unknown when the token cannot read them.

## Inspection boundary

During a scan RepoLens limits its activity to:

- reads tracked files or walks a non-Git directory;
- performs read-only Git queries;
- uses a temporary shallow clone for a remote target;
- fetches point-in-time GitHub and npm metadata;
- leaves audited dependencies, hooks, tests, builds, and package scripts
  untouched;
- leaves the target unchanged.

`init` and an explicit `--output` are the only requested writes. Published
reports can reveal repository names, file paths, commit subjects, and selected
TODO/FIXME lines, so review them before publishing.

## Development

```sh
npm ci
npm run check
npm run example
```

`npm run check` compiles, runs the test suite, checks TypeScript, and rebuilds
the committed GitHub Action bundle. CI additionally rejects a stale bundle.
Tests cover raw-token rejection, symlink
boundaries, explicit config exclusions, baseline comparison, policy exit codes,
strict unknown handling, report escaping, and the controls that previously
allowed an unprotected repository to appear perfect.

## Current scope

- Vulnerability, secret-value, license, and test-result evidence comes from
  dedicated scanners and CI systems.
- Repository changes, issue creation, dependency merges, and account dashboards
  remain maintainer-controlled actions.
- Root Node.js dependency ranges receive version comparison. Other ecosystems
  receive lockfile and repository-level checks.
- Remote scans use shallow history.
- Text and filename heuristics can produce false positives. Keep reviewed
  exclusions explicit so every report shows its detection scope.
- Output formats focus on terminal, JSON, HTML, and GitHub Markdown because most
  findings describe repository-level maintenance decisions.

## License

[MIT](LICENSE)
