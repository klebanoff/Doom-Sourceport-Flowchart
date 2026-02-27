import {
  NODE_WIDTH,
  NODE_HEIGHT,
  PADDING_BETWEEN_NODES_X,
} from "./constants";
import type { LayoutLink, LayoutNode } from "./types";
import { sampleSCurve } from "./geometry";

const SAMPLES_PER_LINK = 24;
const HORIZONTAL_SKIP_THRESHOLD_MULTIPLIER = 2;
const VERTICAL_CLEARANCE_FACTOR = 0.7;
const ADDITIONAL_VERTICAL_CLEARANCE = NODE_HEIGHT;
const MAX_WAYPOINT_ADJUST_ITERATIONS = 3;

export function routeLinksAroundNodes(
  links: LayoutLink[],
  nodes: LayoutNode[]
): void {
  if (!links.length || !nodes.length) {
    return;
  }

  const horizontalSkipThreshold =
    NODE_WIDTH * HORIZONTAL_SKIP_THRESHOLD_MULTIPLIER;
  const marginX = NODE_WIDTH / 2 + PADDING_BETWEEN_NODES_X / 2;
  const baseMarginY = NODE_HEIGHT * VERTICAL_CLEARANCE_FACTOR;

  for (let i = 0; i < links.length; i++) {
    const link = links[i];

    const dx = link.targetX - link.sourceX;
    const dy = link.targetY - link.sourceY;
    const isHorizontal = Math.abs(dy) < 1e-3;

    if (!isHorizontal && Math.abs(dx) < horizontalSkipThreshold) {
      continue;
    }

    const candidates = getCollisionCandidates(
      link,
      nodes,
      marginX,
      baseMarginY
    );
    if (!candidates.length) {
      continue;
    }

    const blockingNodes = isHorizontal
      ? collectBlockingNodesHorizontal(link, candidates, marginX, baseMarginY)
      : collectBlockingNodes(link, candidates, marginX, baseMarginY);

    if (!blockingNodes.length) {
      continue;
    }

    const waypoints = isHorizontal
      ? buildWaypointsForHorizontalLink(
          link,
          blockingNodes,
          candidates,
          baseMarginY
        )
      : buildWaypointsForLink(link, blockingNodes, baseMarginY);

    if (!waypoints.length) {
      continue;
    }

    const adjustedWaypoints = adjustWaypoints(
      link,
      waypoints,
      candidates,
      marginX,
      baseMarginY
    );

    link.waypoints = adjustedWaypoints;
  }
}

function getCollisionCandidates(
  link: LayoutLink,
  nodes: LayoutNode[],
  marginX: number,
  baseMarginY: number
): LayoutNode[] {
  const minX = Math.min(link.sourceX, link.targetX) - marginX;
  const maxX = Math.max(link.sourceX, link.targetX) + marginX;

  const verticalMargin = NODE_HEIGHT / 2 + baseMarginY;
  const minY = Math.min(link.sourceY, link.targetY) - verticalMargin;
  const maxY = Math.max(link.sourceY, link.targetY) + verticalMargin;

  const candidates: LayoutNode[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.id === link.source || node.id === link.target) {
      continue;
    }

    if (node.X < minX || node.X > maxX) {
      continue;
    }

    if (node.Y < minY || node.Y > maxY) {
      continue;
    }

    candidates.push(node);
  }

  return candidates;
}

function collectBlockingNodes(
  link: LayoutLink,
  candidates: LayoutNode[],
  marginX: number,
  baseMarginY: number
): LayoutNode[] {
  const blockingNodes: LayoutNode[] = [];

  for (let s = 0; s <= SAMPLES_PER_LINK; s++) {
    const t = s / SAMPLES_PER_LINK;
    const [px, py] = sampleSCurve(
      link.sourceX,
      link.sourceY,
      link.targetX,
      link.targetY,
      t
    );

    for (let n = 0; n < candidates.length; n++) {
      const node = candidates[n];
      if (node.id === link.source || node.id === link.target) {
        continue;
      }

      if (pointHitsNode(px, py, node, marginX, baseMarginY)) {
        if (!blockingNodes.includes(node)) {
          blockingNodes.push(node);
        }
      }
    }
  }

  return blockingNodes;
}

function collectBlockingNodesHorizontal(
  link: LayoutLink,
  candidates: LayoutNode[],
  marginX: number,
  baseMarginY: number
): LayoutNode[] {
  const minX = Math.min(link.sourceX, link.targetX) - marginX;
  const maxX = Math.max(link.sourceX, link.targetX) + marginX;
  const verticalMargin = NODE_HEIGHT / 2 + baseMarginY;

  const blockingNodes: LayoutNode[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const node = candidates[i];
    if (node.id === link.source || node.id === link.target) {
      continue;
    }

    if (node.X < minX || node.X > maxX) {
      continue;
    }

    const dy = Math.abs(node.Y - link.sourceY);
    if (dy > verticalMargin) {
      continue;
    }

    blockingNodes.push(node);
  }

  blockingNodes.sort((a, b) => a.X - b.X);

  return blockingNodes;
}

function buildWaypointsForLink(
  link: LayoutLink,
  blockingNodes: LayoutNode[],
  baseMarginY: number
): { x: number; y: number }[] {
  const waypoints: { x: number; y: number }[] = [];

  for (let i = 0; i < blockingNodes.length; i++) {
    const node = blockingNodes[i];

    let bestT = 0.5;
    let bestDx = Number.POSITIVE_INFINITY;

    for (let s = 0; s <= SAMPLES_PER_LINK; s++) {
      const t = s / SAMPLES_PER_LINK;
      const [px] = sampleSCurve(
        link.sourceX,
        link.sourceY,
        link.targetX,
        link.targetY,
        t
      );

      const dx = Math.abs(px - node.X);
      if (dx < bestDx) {
        bestDx = dx;
        bestT = t;
      }
    }

    const [, curveY] = sampleSCurve(
      link.sourceX,
      link.sourceY,
      link.targetX,
      link.targetY,
      bestT
    );

    const sign = curveY < node.Y ? -1 : 1;
    const verticalMargin = NODE_HEIGHT / 2 + baseMarginY;
    const waypointY = node.Y + sign * verticalMargin;

    waypoints.push({
      x: node.X,
      y: waypointY,
    });
  }

  waypoints.sort((a, b) => a.x - b.x);

  return waypoints;
}

function chooseHorizontalWaypointDirection(
  link: LayoutLink,
  candidates: LayoutNode[]
): 1 | -1 {
  let aboveCount = 0;
  let belowCount = 0;
  const y = link.sourceY;

  for (let i = 0; i < candidates.length; i++) {
    const node = candidates[i];
    if (node.id === link.source || node.id === link.target) {
      continue;
    }
    if (node.Y < y) {
      aboveCount++;
    } else if (node.Y > y) {
      belowCount++;
    }
  }

  if (aboveCount > belowCount) {
    return 1;
  }

  return -1;
}

function buildWaypointsForHorizontalLink(
  link: LayoutLink,
  blockingNodes: LayoutNode[],
  candidates: LayoutNode[],
  baseMarginY: number
): { x: number; y: number }[] {
  if (!blockingNodes.length) {
    return [];
  }

  const waypoints: { x: number; y: number }[] = [];
  const direction = chooseHorizontalWaypointDirection(link, candidates);
  const verticalMargin = NODE_HEIGHT / 2 + baseMarginY;
  const waypointY = link.sourceY + direction * verticalMargin;

  for (let i = 0; i < blockingNodes.length; i++) {
    const node = blockingNodes[i];
    waypoints.push({
      x: node.X,
      y: waypointY,
    });
  }

  waypoints.sort((a, b) => a.x - b.x);

  return waypoints;
}

function adjustWaypoints(
  link: LayoutLink,
  waypoints: { x: number; y: number }[],
  candidates: LayoutNode[],
  marginX: number,
  baseMarginY: number
): { x: number; y: number }[] {
  const adjusted = waypoints.slice();

  for (let iter = 0; iter < MAX_WAYPOINT_ADJUST_ITERATIONS; iter++) {
    let anyChanged = false;

    for (let w = 0; w < adjusted.length; w++) {
      let wp = adjusted[w];

      for (let n = 0; n < candidates.length; n++) {
        const node = candidates[n];
        if (node.id === link.source || node.id === link.target) {
          continue;
        }

        if (!pointHitsNode(wp.x, wp.y, node, marginX, baseMarginY)) {
          continue;
        }

        const verticalMargin = NODE_HEIGHT / 2 + baseMarginY;
        const direction = wp.y < node.Y ? -1 : 1;
        wp = {
          x: wp.x,
          y: node.Y +
            direction *
              (verticalMargin + ADDITIONAL_VERTICAL_CLEARANCE * (iter + 1)),
        };
        anyChanged = true;
      }

      adjusted[w] = wp;
    }

    if (!anyChanged) {
      break;
    }
  }

  return adjusted;
}

function pointHitsNode(
  px: number,
  py: number,
  node: LayoutNode,
  marginX: number,
  baseMarginY: number
): boolean {
  const halfWidth = marginX;
  const halfHeight = NODE_HEIGHT / 2 + baseMarginY;

  const dx = Math.abs(px - node.X);
  const dy = Math.abs(py - node.Y);

  return dx <= halfWidth && dy <= halfHeight;
}

