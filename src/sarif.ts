import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { RULES } from "./rules.js";
import type { AuditReport, Finding } from "./types.js";

export function regressionFindings(report: AuditReport): Finding[] {
  const actionable = report.findings.filter(
    (finding) =>
      !finding.ignored &&
      (finding.severity === "critical" ||
        finding.severity === "warning" ||
        finding.severity === "unknown"),
  );
  if (!report.comparison.baseline) return actionable;
  const regressions = new Set(
    report.comparison.changes
      .filter(
        (change) =>
          change.kind === "new" || change.kind === "worsened",
      )
      .map((change) => change.fingerprint)
      .filter((value): value is string => typeof value === "string"),
  );
  return actionable.filter(
    (finding) =>
      typeof finding.fingerprint === "string" &&
      regressions.has(finding.fingerprint),
  );
}

function sarifLevel(finding: Finding): "error" | "warning" | "note" {
  if (finding.severity === "critical") return "error";
  if (finding.severity === "warning") return "warning";
  return "note";
}

export function renderSarif(
  report: AuditReport,
  sourceRoot: string | null = null,
): string {
  const findings = regressionFindings(report).filter(
    (finding) =>
      finding.location !== null &&
      finding.location !== undefined &&
      typeof finding.ruleId === "string" &&
      typeof finding.fingerprint === "string",
  );
  const ruleIds = [...new Set(findings.map((finding) => finding.ruleId ?? ""))];
  const rules = ruleIds.map((ruleId) => {
    const rule = RULES.get(ruleId);
    return {
      id: ruleId,
      name: rule?.title ?? ruleId,
      shortDescription: {
        text: rule?.explanation ?? "RepoLens maintenance regression.",
      },
      help: {
        text: rule?.remediation ?? "Review the RepoLens finding.",
      },
      properties: {
        tags: ["maintenance", "repolens"],
      },
    };
  });
  const results = findings.map((finding) => {
    const location = finding.location;
    const region =
      location?.line === null || location?.line === undefined
        ? undefined
        : {
            startLine: location.line,
            ...(location.column === null
              ? {}
              : { startColumn: location.column }),
          };
    return {
      ruleId: finding.ruleId,
      level: sarifLevel(finding),
      message: { text: finding.summary },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: location?.path.replaceAll("\\", "/"),
              ...(sourceRoot ? { uriBaseId: "%SRCROOT%" } : {}),
            },
            ...(region ? { region } : {}),
          },
        },
      ],
      partialFingerprints: {
        primaryLocationLineHash: finding.fingerprint,
      },
      properties: {
        remediation: finding.remediation ?? null,
        source: finding.source ?? "repolens",
      },
    };
  });
  return `${JSON.stringify(
    {
      version: "2.1.0",
      $schema:
        "https://json.schemastore.org/sarif-2.1.0.json",
      runs: [
        {
          tool: {
            driver: {
              name: "RepoLens",
              version: report.tool.version,
              informationUri: "https://repolens.whago.net/",
              rules,
            },
          },
          ...(sourceRoot
            ? {
                originalUriBaseIds: {
                  "%SRCROOT%": {
                    uri: pathToFileURL(
                      `${resolve(sourceRoot)}${sep}`,
                    ).href,
                  },
                },
              }
            : {}),
          results,
        },
      ],
    },
    null,
    2,
  )}\n`;
}
