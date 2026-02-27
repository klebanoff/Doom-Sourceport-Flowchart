import {
  NODE_WIDTH,
  NODE_HEIGHT,
  PADDING_BETWEEN_NODES_X,
  PADDING_BETWEEN_NODES_Y,
} from "./constants";
import { LANE_ORDER } from "./laneConfig";
import type { DoomData, LayoutNode, LayoutResult } from "./types";
import { routeLinksAroundNodes } from "./linkRouting";

export function computeLayout(data: DoomData): LayoutResult {
  const nodeSizeX = NODE_WIDTH;
  const nodeSizeY = NODE_HEIGHT;
  const paddingBetweenNodesX = PADDING_BETWEEN_NODES_X;
  const paddingBetweenNodesY = PADDING_BETWEEN_NODES_Y;

  const laneOrder = LANE_ORDER;

  const normalized = normalizeDoomData(data);

  const result: LayoutResult = {
    nodes: [],
    links: [],
    lanes: [],
    timelineMarkers: [],
  };

  const augmented: LayoutNode[] = normalized.map((node) => {
    const date = new Date(node.releaseDate);
    const _dateValue = date.getTime();
    return {
      ...node,
      _dateValue,
      _laneKey: "",
      _rowIndex: 0,
      X: 0,
      Y: 0,
    };
  });

  const dateValues = augmented
    .map((n) => n._dateValue)
    .filter((v) => typeof v === "number" && !Number.isNaN(v));

  const minDateValue = Math.min.apply(null, dateValues);
  const maxDateValue = Math.max.apply(null, dateValues);
  const minYear = new Date(minDateValue).getFullYear();
  const maxYear = new Date(maxDateValue).getFullYear();
  const timeRange = maxDateValue - minDateValue || 1;

  const horizontalStep =
    (nodeSizeX + paddingBetweenNodesX * 1.5) * 1.5;
  const yearSpan = maxYear - minYear || 1;
  const timelineWidth = (yearSpan + 1) * horizontalStep;
  const leftMargin = 200;
  const rightMargin = 200;
  const usableWidth = Math.max(
    timelineWidth - leftMargin - rightMargin,
    nodeSizeX + paddingBetweenNodesX
  );

  const topPadding = 150;
  const baseRowHeight = nodeSizeY + paddingBetweenNodesY;

  augmented.forEach((node) => {
    const laneKey = node.geneticLine || "other";
    node._laneKey = laneKey;
  });

  augmented.forEach((node) => {
    const ratio =
      (node._dateValue - minDateValue) / timeRange;
    const x =
      leftMargin +
      ratio * usableWidth;

    node.X = x;
  });

  const laneRowInfo: Record<string, { rowCount: number }> = {};

  laneOrder.forEach((laneKey) => {
    const laneNodes = augmented
      .filter((n) => n._laneKey === laneKey)
      .sort((a, b) => a.X - b.X);

    const rows: LayoutNode[] = [];

    for (let i = 0; i < laneNodes.length; i++) {
      const node = laneNodes[i];
      let placed = false;

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const lastNodeInRow = rows[rowIndex];
        const minAllowedX =
          lastNodeInRow.X + nodeSizeX + paddingBetweenNodesX;
        if (node.X >= minAllowedX) {
          node._rowIndex = rowIndex;
          rows[rowIndex] = node;
          placed = true;
          break;
        }
      }

      if (!placed) {
        const newRowIndex = rows.length;
        node._rowIndex = newRowIndex;
        rows.push(node);
      }
    }

    laneRowInfo[laneKey] = {
      rowCount: rows.length || 1,
    };
  });

  let currentTop = topPadding;

  for (let i = 0; i < laneOrder.length; i++) {
    const key = laneOrder[i];
    const rowMeta = laneRowInfo[key] || { rowCount: 1 };
    const laneRowCount = Math.max(rowMeta.rowCount, 1);
    const laneHeight =
      laneRowCount * baseRowHeight + paddingBetweenNodesY;
    const top = currentTop;
    const bottom = top + laneHeight;
    const yCenter = top + laneHeight / 2;

    result.lanes.push({
      key,
      index: i,
      rowCount: laneRowCount,
      top,
      bottom,
      yCenter,
    });

    currentTop = bottom + paddingBetweenNodesY;
  }

  augmented.forEach((node) => {
    const lane =
      result.lanes.find((l) => l.key === node._laneKey) ||
      result.lanes[result.lanes.length - 1];
    const rowIndex = typeof node._rowIndex === "number" ? node._rowIndex : 0;

    const firstRowCenter =
      lane.top + paddingBetweenNodesY + baseRowHeight / 2;
    const yCenter =
      firstRowCenter + rowIndex * baseRowHeight;

    node.Y = yCenter;
  });

  for (let i = 0; i < augmented.length; i++) {
    const node = augmented[i];
    result.nodes.push(node);

    if (node.parents && node.parents.length > 0) {
      const primaryParentId = node.parents[0];
      for (let j = 0; j < node.parents.length; j++) {
        const parentId = node.parents[j];
        const parentNode = augmented.find((x) => x.id === parentId);
        if (!parentNode) {
          continue;
        }

        result.links.push({
          source: parentNode.id,
          sourceX: parentNode.X,
          sourceY: parentNode.Y,
          target: node.id,
          targetX: node.X,
          targetY: node.Y,
          isPrimary: parentId === primaryParentId,
        });
      }
    }
  }

  routeLinksAroundNodes(result.links, result.nodes);

  for (let year = minYear; year <= maxYear; year++) {
    const yearDate = new Date(year, 0, 1);
    const yearValue = yearDate.getTime();
    const ratio = (yearValue - minDateValue) / timeRange;
    const x =
      leftMargin +
      ratio * usableWidth;
    result.timelineMarkers.push({
      year,
      x,
    });
  }

  return result;
}

export function normalizeDoomData(data: DoomData): DoomData {
  const byId = new Map<string, DoomData[number]>();
  const normalized: DoomData = [];

  for (let i = 0; i < data.length; i++) {
    const node = data[i];
    const normalizedNode: DoomData[number] = {
      ...node,
      children: node.children ? [...node.children] : [],
      parents: node.parents ? [...node.parents] : [],
    };

    normalized.push(normalizedNode);
    byId.set(normalizedNode.id, normalizedNode);
  }

  for (let i = 0; i < normalized.length; i++) {
    const element = normalized[i];

    if (element.children && element.children.length > 0) {
      for (let j = 0; j < element.children.length; j++) {
        const childId = element.children[j];
        const childNode = byId.get(childId);
        if (!childNode) {
          continue;
        }
        if (!childNode.parents) {
          childNode.parents = [];
        }
        if (!childNode.parents.includes(element.id)) {
          childNode.parents.push(element.id);
        }
      }
    }

    if (element.parents && element.parents.length > 0) {
      for (let j = 0; j < element.parents.length; j++) {
        const parentId = element.parents[j];
        const parentNode = byId.get(parentId);
        if (!parentNode) {
          continue;
        }
        if (!parentNode.children) {
          parentNode.children = [];
        }
        if (!parentNode.children.includes(element.id)) {
          parentNode.children.push(element.id);
        }
      }
    }
  }

  return normalized;
}

