# RepoLens

RepoLens is a read-only Node.js and TypeScript CLI that turns a local or GitHub
repository into three maintenance views:

- a concise terminal summary;
- structured JSON for automation;
- one self-contained HTML report for review or static hosting.

It answers a practical question: **what should a maintainer fix next?** Every
scored finding includes evidence, a bounded deduction, and a concrete action.
RepoLens does not claim that a repository is secure or that its tests pass.

## Quick start

```sh
npm ci
npm run build
node dist/src/cli.js .
```

Audit a public GitHub repository without checking it out yourself:

```sh
node dist/src/cli.js owner/repository
node dist/src/cli.js https://github.com/owner/repository
```

Generate all three reports:

```sh
node dist/src/cli.js . --format all --output reports
```

This writes:

```text
reports/
├── repolens-report.html
├── repolens-report.json
└── repolens-report.txt
```

The default command prints only to the terminal and writes nothing.

## What it checks

| Area | Check | Scope |
| --- | --- | --- |
| Documentation | Root README and license | Recognized root filenames |
| Automation | GitHub Actions workflows | `.github/workflows/*.yml` or `.yaml` |
| Dependencies | Lockfiles | npm, pnpm, Yarn, Bun, Cargo, Go, Ruby, Python, PHP |
| Node.js | Root package scripts | `test`, `build`, and `lint` |
| Freshness | Outdated dependencies | Supported root npm semver ranges vs. registry `latest` |
| Maintenance debt | TODO and FIXME | Tracked text files, with bounded evidence |
| Repository size | Large files | Tracked files above a configurable threshold |
| Credential hygiene | Tracked `.env` risk | Filenames only; values are not read into reports |
| Governance | Security and contribution docs | Root or `.github/` |
| Activity | Latest commit and release | Local Git plus GitHub API when available |
| Queue | Open issues and pull requests | GitHub API; token optional |
| Branching | Default branch | GitHub metadata, origin HEAD, then current branch |

Common generated directories, dependency trees, lockfile bodies, minified
assets, files over 1 MiB, and tracked environment-file contents are excluded
from TODO/FIXME scanning.

## Score

The score begins at 100. Missing or risky maintenance controls make bounded
deductions:

- tracked environment files: up to 20 points;
- missing README or license: 10 points each;
- missing CI, lockfile, scripts, or stale dependencies: bounded per check;
- stale activity, large files, TODO/FIXME, and governance gaps: smaller
  deductions.

Informational GitHub counts and non-applicable checks do not lower the score.
Grades are A (90–100), B (80–89), C (70–79), D (60–69), and F (below 60).
The JSON `findings` array contains the exact deduction for every check, so the
result is explainable rather than opaque.

## CLI

```text
Usage:
  repolens [target] [options]

Options:
  -f, --format <value>       terminal, json, html, all, or a comma-separated list
  -o, --output <path>       file for one format; directory for multiple formats
      --offline             skip GitHub API and npm registry checks
      --token-env <name>    environment variable containing a GitHub token
      --stale-days <days>   stale commit threshold (default: 180)
      --large-file-mb <mb>  large tracked-file threshold (default: 1)
      --max-todos <count>   maximum TODO/FIXME evidence rows (default: 50)
      --no-color            disable ANSI colors
  -h, --help                show help
  -v, --version             show version
```

Run `repolens --help` for the canonical help text.

### Output behavior

- One selected format without `--output` is written to stdout.
- Multiple formats without `--output` print the terminal report and write
  `repolens-report.json` and `repolens-report.html` in the current directory.
- `--output` writes only because the caller explicitly requested a destination.
- Reports are UTF-8. JSON uses schema version `1`.

## GitHub authentication

Public repositories and public API metadata work without a token until GitHub's
anonymous rate limit is reached. For private repositories or higher API limits,
place a token in an environment variable:

```sh
export REPOLENS_GITHUB_TOKEN="..."
node dist/src/cli.js owner/private-repository \
  --token-env REPOLENS_GITHUB_TOKEN
```

RepoLens intentionally rejects `--token`. A token is passed to the temporary
Git process through environment-backed Git configuration and to GitHub over an
Authorization header. It is not written to the checkout, report, logs, or a
RepoLens configuration file. RepoLens removes its temporary remote checkout
after the report model has been created.

Use the narrowest token permissions that can read the selected repository and
its metadata. Unset the environment variable when finished.

## Read-only boundary

By default RepoLens:

- reads tracked files or walks a non-Git directory;
- runs read-only Git queries;
- performs a shallow temporary clone for a remote target;
- fetches point-in-time GitHub and npm metadata;
- never installs audited dependencies;
- never runs audited build, test, hook, or package scripts;
- never edits the target repository.

Generating JSON or HTML is an explicit output action. A published report can
reveal repository names, file paths, commit subjects, and selected TODO/FIXME
lines. Review it before making it public.

## HTML report and nested hosting

The HTML reporter contains its CSS inline and has no JavaScript, remote fonts,
analytics, or root-relative assets. The same file works at:

- `https://whago.net/repolens/`
- `https://rad1092.github.io/repolens/`
- any other nested static path.

Generate the checked-in example:

```sh
npm run example
```

The result is [`examples/index.html`](examples/index.html). The public Pages
workflow instead audits the real `rad1092/whago-home` repository, then uploads
the standalone report as `site/index.html`. This keeps the demo honest without
misclassifying RepoLens's deliberately tracked `.env` detection fixture as a
production credential incident.

## Continuous integration and Pages

`.github/workflows/ci.yml` runs the clean build, fixture tests, and TypeScript
lint gate on pushes and pull requests.

`.github/workflows/pages.yml` verifies RepoLens, audits the public
`rad1092/whago-home` repository, generates a standalone HTML report plus JSON,
and deploys them with the official GitHub Pages actions. It reads the workflow
token from an environment variable; the generated files contain no token.

## Development

```sh
npm run build     # compile src and tests
npm test          # compile and run fixture tests
npm run lint      # strict TypeScript check
npm run check     # clean build, tests, and lint
npm run example   # regenerate examples/index.html
```

Tests cover CLI parsing and help, raw-token rejection, tracked `.env` detection,
TODO/FIXME evidence, large files, scoring and action priority, JSON/HTML output,
non-Git directories, explicit output writes, and report redaction.

## Known limits

- Dependency freshness currently covers supported semver ranges in the root
  npm `package.json`; it is not a compatibility resolver.
- RepoLens does not run tests, inspect runtime behavior, scan vulnerabilities,
  validate license compatibility, or detect every secret.
- GitHub metadata is best effort and can be unavailable offline or when rate
  limited.
- Remote audits use a shallow history, so long-term activity analysis is
  intentionally out of scope.
- Filename and text heuristics can produce false positives. Use the evidence and
  action as a review queue, not as an automatic merge gate.

## License

[MIT](LICENSE)
