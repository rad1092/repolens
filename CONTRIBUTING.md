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
