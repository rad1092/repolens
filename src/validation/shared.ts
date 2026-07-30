import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  LineCounter,
  isMap,
  parseDocument,
} from "yaml";

import type { FindingLocation } from "../types.js";

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function location(
  path: string,
  line: number | null = 1,
): FindingLocation {
  return { path, line, column: line === null ? null : 1 };
}

export function lineOf(raw: string, pattern: RegExp): number {
  const lines = raw.split(/\r?\n/);
  const index = lines.findIndex((line) => pattern.test(line));
  return index >= 0 ? index + 1 : 1;
}

export async function readTracked(
  root: string,
  files: Set<string>,
  path: string,
): Promise<string | null> {
  if (!files.has(path)) return null;
  const absolute = join(root, path);
  const fileStat = await lstat(absolute).catch(() => null);
  if (!fileStat?.isFile() || fileStat.isSymbolicLink()) return null;
  return readFile(absolute, "utf8").catch(() => null);
}

export function parseYamlObject(
  path: string,
  raw: string,
): { value: JsonObject | null; errors: string[] } {
  const lineCounter = new LineCounter();
  const document = parseDocument(raw, {
    lineCounter,
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });
  const errors = document.errors.map((error) => error.message);
  if (errors.length > 0 || !isMap(document.contents)) {
    return {
      value: null,
      errors:
        errors.length > 0
          ? errors
          : [`${path} must contain a YAML mapping at its root.`],
    };
  }
  const value = document.toJS({ maxAliasCount: 50 }) as unknown;
  return isObject(value)
    ? { value, errors: [] }
    : {
        value: null,
        errors: [`${path} must contain a YAML mapping at its root.`],
      };
}
