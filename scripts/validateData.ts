import { readFile } from "node:fs/promises";
import process from "node:process";
import { doomTypes, geneticLines } from "../src/constants";
import type { DoomData, DoomNode } from "../src/types";
import { normalizeDoomData } from "../src/layout";

type IssueLevel = "error" | "warning";

interface Issue {
  level: IssueLevel;
  nodeId: string | null;
  message: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

function createAllowedTypeSets(): {
  allowedTypes: Set<string>;
  allowedGeneticLines: Set<string>;
} {
  const allowedTypes = new Set<string>([
    ...Object.values(doomTypes),
    "console",
  ]);

  const allowedGeneticLines = new Set<string>([
    ...Object.values(geneticLines),
    "other",
  ]);

  return { allowedTypes, allowedGeneticLines };
}

function validateNodesBasic(
  raw: unknown[],
  allowedTypes: Set<string>,
  allowedGeneticLines: Set<string>
): { data: DoomData; byId: Map<string, DoomNode>; issues: Issue[] } {
  const issues: Issue[] = [];
  const byId = new Map<string, DoomNode>();
  const data: DoomData = [];

  for (let index = 0; index < raw.length; index++) {
    const value = raw[index];

    if (!isPlainObject(value)) {
      issues.push({
        level: "error",
        nodeId: null,
        message: `Element at index ${index} is not an object`,
      });
      continue;
    }

    const obj = value as Record<string, unknown>;

    const id = obj.id;
    if (typeof id !== "string" || !id.trim()) {
      issues.push({
        level: "error",
        nodeId: null,
        message: `Element at index ${index} has invalid or missing "id"`,
      });
      continue;
    }

    if (byId.has(id)) {
      issues.push({
        level: "error",
        nodeId: id,
        message: `Duplicate id "${id}"`,
      });
      continue;
    }

    const name = obj.name;
    if (typeof name !== "string" || !name.trim()) {
      issues.push({
        level: "error",
        nodeId: id,
        message: `Node "${id}" has invalid or missing "name"`,
      });
    }

    const type = obj.type;
    if (typeof type !== "string") {
      issues.push({
        level: "error",
        nodeId: id,
        message: `Node "${id}" has non-string "type"`,
      });
    } else if (!allowedTypes.has(type)) {
      issues.push({
        level: "error",
        nodeId: id,
        message: `Node "${id}" has invalid "type": "${type}"`,
      });
    }

    const geneticLine = obj.geneticLine;
    if (typeof geneticLine !== "string") {
      issues.push({
        level: "error",
        nodeId: id,
        message: `Node "${id}" has non-string "geneticLine"`,
      });
    } else if (!allowedGeneticLines.has(geneticLine)) {
      issues.push({
        level: "error",
        nodeId: id,
        message: `Node "${id}" has invalid "geneticLine": "${geneticLine}"`,
      });
    }

    const releaseDate = obj.releaseDate;
    if (typeof releaseDate !== "string" || !releaseDate.trim()) {
      issues.push({
        level: "error",
        nodeId: id,
        message: `Node "${id}" has invalid or missing "releaseDate"`,
      });
    } else {
      const date = new Date(releaseDate);
      if (Number.isNaN(date.getTime())) {
        issues.push({
          level: "error",
          nodeId: id,
          message: `Node "${id}" has invalid date in "releaseDate": "${releaseDate}"`,
        });
      }
    }

    let children: string[] | undefined;
    if (Object.prototype.hasOwnProperty.call(obj, "children")) {
      const rawChildren = obj.children;
      if (!Array.isArray(rawChildren)) {
        issues.push({
          level: "error",
          nodeId: id,
          message: `Node "${id}" has non-array "children"`,
        });
      } else {
        children = [];
        for (let i = 0; i < rawChildren.length; i++) {
          const child = rawChildren[i];
          if (typeof child !== "string" || !child.trim()) {
            issues.push({
              level: "error",
              nodeId: id,
              message: `Node "${id}" has invalid child id at children[${i}]`,
            });
          } else {
            children.push(child);
          }
        }
      }
    }

    let parents: string[] | undefined;
    if (Object.prototype.hasOwnProperty.call(obj, "parents")) {
      const rawParents = obj.parents;
      if (!Array.isArray(rawParents)) {
        issues.push({
          level: "error",
          nodeId: id,
          message: `Node "${id}" has non-array "parents"`,
        });
      } else {
        parents = [];
        for (let i = 0; i < rawParents.length; i++) {
          const parent = rawParents[i];
          if (typeof parent !== "string" || !parent.trim()) {
            issues.push({
              level: "error",
              nodeId: id,
              message: `Node "${id}" has invalid parent id at parents[${i}]`,
            });
          } else {
            parents.push(parent);
          }
        }
      }
    }

    const node: DoomNode = {
      id,
      name: typeof name === "string" ? name : String(name),
      type: typeof type === "string" ? (type as DoomNode["type"]) : "official",
      releaseDate:
        typeof releaseDate === "string"
          ? releaseDate
          : String(releaseDate ?? ""),
      geneticLine:
        typeof geneticLine === "string"
          ? (geneticLine as DoomNode["geneticLine"])
          : "other",
      children,
      parents,
    };

    data.push(node);
    byId.set(id, node);
  }

  return { data, byId, issues };
}

function validateReferences(
  data: DoomData,
  byId: Map<string, DoomNode>
): Issue[] {
  const issues: Issue[] = [];

  for (let i = 0; i < data.length; i++) {
    const node = data[i];

    const children = node.children ?? [];
    for (let j = 0; j < children.length; j++) {
      const childId = children[j];

      if (childId === node.id) {
        issues.push({
          level: "error",
          nodeId: node.id,
          message: `Node "${node.id}" lists itself in children`,
        });
        continue;
      }

      const childNode = byId.get(childId);
      if (!childNode) {
        issues.push({
          level: "error",
          nodeId: node.id,
          message: `Node "${node.id}" has child "${childId}" which does not exist`,
        });
        continue;
      }

      if (childNode.children && childNode.children.includes(node.id)) {
        issues.push({
          level: "warning",
          nodeId: node.id,
          message: `Nodes "${node.id}" and "${childId}" reference each other as children (2-cycle)`,
        });
      }
    }

    const parents = node.parents ?? [];
    for (let j = 0; j < parents.length; j++) {
      const parentId = parents[j];

      if (parentId === node.id) {
        issues.push({
          level: "error",
          nodeId: node.id,
          message: `Node "${node.id}" lists itself in parents`,
        });
        continue;
      }

      const parentNode = byId.get(parentId);
      if (!parentNode) {
        issues.push({
          level: "error",
          nodeId: node.id,
          message: `Node "${node.id}" has parent "${parentId}" which does not exist`,
        });
        continue;
      }

      if (parentNode.parents && parentNode.parents.includes(node.id)) {
        issues.push({
          level: "warning",
          nodeId: node.id,
          message: `Nodes "${node.id}" and "${parentId}" reference each other as parents (2-cycle)`,
        });
      }
    }
  }

  return issues;
}

function validateConsistencyWithNormalization(data: DoomData): Issue[] {
  const issues: Issue[] = [];

  try {
    const normalized = normalizeDoomData(data);
    const byId = new Map<string, DoomNode>();

    for (let i = 0; i < normalized.length; i++) {
      const node = normalized[i];
      byId.set(node.id, node);
    }

    // After normalization, ensure that all parents/children reference existing ids.
    issues.push(...validateReferences(normalized, byId));
  } catch (error) {
    issues.push({
      level: "error",
      nodeId: null,
      message: `normalizeDoomData threw an error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }

  return issues;
}

function printIssues(issues: Issue[]): void {
  if (!issues.length) {
    console.log("[OK] No problems found in data.json");
    return;
  }

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const level = issue.level.toUpperCase();
    const idPart = issue.nodeId ?? "global";
    // eslint-disable-next-line no-console
    console.error(`[${level}][${idPart}] ${issue.message}`);
  }
}

async function main(): Promise<void> {
  const filePath = new URL("../data.json", import.meta.url);

  let rawText: string;
  try {
    rawText = await readFile(filePath, "utf8");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`Failed to read data.json: ${message}`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`Failed to parse data.json as JSON: ${message}`);
    process.exit(1);
  }

  if (!Array.isArray(parsed)) {
    // eslint-disable-next-line no-console
    console.error("data.json root must be an array");
    process.exit(1);
  }

  const { allowedTypes, allowedGeneticLines } = createAllowedTypeSets();

  const basicResult = validateNodesBasic(
    parsed,
    allowedTypes,
    allowedGeneticLines
  );

  const issues: Issue[] = [];
  issues.push(...basicResult.issues);

  issues.push(
    ...validateReferences(basicResult.data, basicResult.byId)
  );
  issues.push(
    ...validateConsistencyWithNormalization(basicResult.data)
  );

  printIssues(issues);

  const errorCount = issues.filter((i) => i.level === "error").length;
  const warningCount = issues.filter((i) => i.level === "warning").length;

  // eslint-disable-next-line no-console
  console.log(
    `Validation summary: ${errorCount} error(s), ${warningCount} warning(s)`
  );

  if (errorCount > 0) {
    process.exit(1);
  }

  process.exit(0);
}

void main();

