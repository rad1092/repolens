# Security policy

RepoLens reads repository files and may make outbound requests to GitHub and
the npm registry. It does not execute audited repository scripts.

## Reporting a vulnerability

Please use a private GitHub security advisory for vulnerabilities that could
expose credentials, escape the selected repository boundary, or execute
untrusted repository content. Do not open a public issue until a fix is
available.

Include the RepoLens version, operating system, Node.js version, a minimal
reproduction, and whether the target was local or remote. Replace all real
credentials and private repository names with inert placeholders.

## Credential handling

GitHub tokens are accepted only through a named environment variable. RepoLens
does not include token values in terminal, JSON, or HTML reports and does not
write them to configuration files. Reports can still contain repository names,
file paths, commit subjects, and selected TODO/FIXME lines; review a report
before publishing it.
