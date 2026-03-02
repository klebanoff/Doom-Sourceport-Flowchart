import { NODE_WIDTH, NODE_HEIGHT } from "./constants";
import { getNodeBounds, expandBounds, rectsIntersect, cornersOf, dist } from "./geometry";
import type { LayoutLink, LayoutNode, Point, Rect } from "./types";

const ROUTE_PADDING = 10;
const EPSILON = 1e-6;
// Expand the source–target bounding box by this amount when filtering obstacles.
const CORRIDOR_MARGIN = 2 * Math.max(NODE_WIDTH, NODE_HEIGHT);

function getBoundaryPoint(rect: Rect, target: Point): Point {
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;

  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
    return { x: cx, y: cy };
  }

  const halfW = (rect.right - rect.left) / 2;
  const halfH = (rect.bottom - rect.top) / 2;

  const scaleX = Math.abs(dx) > EPSILON ? halfW / Math.abs(dx) : Infinity;
  const scaleY = Math.abs(dy) > EPSILON ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);

  return { x: cx + dx * scale, y: cy + dy * scale };
}

function segmentIntersectsRect(p1: Point, p2: Point, rect: Rect): boolean {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  const p = [-dx, dx, -dy, dy];
  const q = [
    p1.x - rect.left,
    rect.right - p1.x,
    p1.y - rect.top,
    rect.bottom - p1.y,
  ];

  let tMin = 0;
  let tMax = 1;

  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < EPSILON) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        tMin = Math.max(tMin, t);
      } else {
        tMax = Math.min(tMax, t);
      }
    }
  }

  return tMin <= tMax;
}

function isLineClear(p1: Point, p2: Point, obstacles: Rect[]): boolean {
  if (dist(p1, p2) < EPSILON) return true;

  for (const obs of obstacles) {
    if (!segmentIntersectsRect(p1, p2, obs)) continue;

    // Allow grazing the outer boundary (corner waypoints sit exactly on it);
    // only block if the segment penetrates the interior.
    const inner: Rect = {
      left: obs.left + EPSILON,
      right: obs.right - EPSILON,
      top: obs.top + EPSILON,
      bottom: obs.bottom - EPSILON,
    };
    if (segmentIntersectsRect(p1, p2, inner)) return false;
  }

  return true;
}

function interpolateAlongPath(
  points: Point[],
  cumDist: number[],
  targetDist: number
): Point {
  if (points.length === 1) return points[0];

  targetDist = Math.max(0, Math.min(targetDist, cumDist[cumDist.length - 1]));

  for (let i = 1; i < cumDist.length; i++) {
    if (cumDist[i] >= targetDist) {
      const segLen = cumDist[i] - cumDist[i - 1];
      const t = segLen < EPSILON ? 0 : (targetDist - cumDist[i - 1]) / segLen;
      const a = points[i - 1];
      const b = points[i];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }

  return points[points.length - 1];
}

// Binary min-heap used by dijkstra. Each entry is [distance, nodeIndex].
type HeapEntry = [number, number];

function heapPush(heap: HeapEntry[], entry: HeapEntry): void {
  heap.push(entry);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent][0] <= heap[i][0]) break;
    [heap[parent], heap[i]] = [heap[i], heap[parent]];
    i = parent;
  }
}

function heapPop(heap: HeapEntry[]): HeapEntry {
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;
      if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
      if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
      if (smallest === i) break;
      [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
      i = smallest;
    }
  }
  return top;
}

function dijkstra(
  adjacency: Map<number, { to: number; w: number }[]>,
  start: number,
  end: number
): number[] {
  const distArr = new Map<number, number>();
  const prev = new Map<number, number>();
  distArr.set(start, 0);

  const heap: HeapEntry[] = [[0, start]];

  while (heap.length > 0) {
    const [d, u] = heapPop(heap);

    if (u === end) break;

    // Skip stale heap entries (lazy deletion).
    if (d > (distArr.get(u) ?? Infinity)) continue;

    const neighbors = adjacency.get(u);
    if (!neighbors) continue;

    for (const { to, w } of neighbors) {
      const alt = d + w;
      if (alt < (distArr.get(to) ?? Infinity)) {
        distArr.set(to, alt);
        prev.set(to, u);
        heapPush(heap, [alt, to]);
      }
    }
  }

  if (!distArr.has(end)) return [];

  const path: number[] = [];
  let cur: number | undefined = end;
  while (cur !== undefined) {
    path.unshift(cur);
    cur = prev.get(cur);
  }
  return path;
}

// Solves for cubic Bézier control points C1, C2 such that B(1/3) = mid1 and
// B(2/3) = mid2, given fixed endpoints B(0) = P0 and B(1) = P3.
// Returns null when the 2×2 linear system is degenerate.
function fitCubicControlPoints(
  P0: Point,
  P3: Point,
  mid1: Point,
  mid2: Point
): { control1: Point; control2: Point } | null {
  const t1 = 1 / 3;
  const t2 = 2 / 3;

  const a11 = 3 * (1 - t1) * (1 - t1) * t1;
  const a12 = 3 * (1 - t1) * t1 * t1;
  const a21 = 3 * (1 - t2) * (1 - t2) * t2;
  const a22 = 3 * (1 - t2) * t2 * t2;

  const b1x = mid1.x - ((1 - t1) ** 3 * P0.x + t1 ** 3 * P3.x);
  const b1y = mid1.y - ((1 - t1) ** 3 * P0.y + t1 ** 3 * P3.y);
  const b2x = mid2.x - ((1 - t2) ** 3 * P0.x + t2 ** 3 * P3.x);
  const b2y = mid2.y - ((1 - t2) ** 3 * P0.y + t2 ** 3 * P3.y);

  const det = a11 * a22 - a12 * a21;
  if (Math.abs(det) < EPSILON) return null;

  return {
    control1: {
      x: (b1x * a22 - b2x * a12) / det,
      y: (b1y * a22 - b2y * a12) / det,
    },
    control2: {
      x: (a11 * b2x - a21 * b1x) / det,
      y: (a11 * b2y - a21 * b1y) / det,
    },
  };
}

function collinearControls(
  start: Point,
  end: Point
): { control1: Point; control2: Point } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return {
    control1: { x: start.x + dx / 3, y: start.y + dy / 3 },
    control2: { x: start.x + (dx * 2) / 3, y: start.y + (dy * 2) / 3 },
  };
}

function writeToLink(
  link: LayoutLink,
  startPoint: Point,
  endPoint: Point,
  control1: Point,
  control2: Point
): void {
  link.sourceX = startPoint.x;
  link.sourceY = startPoint.y;
  link.targetX = endPoint.x;
  link.targetY = endPoint.y;
  link.c1x = control1.x;
  link.c1y = control1.y;
  link.c2x = control2.x;
  link.c2y = control2.y;
}

function routeLink(link: LayoutLink, nodeMap: Map<string, LayoutNode>): void {
  const sourceNode = nodeMap.get(link.source);
  const targetNode = nodeMap.get(link.target);
  if (!sourceNode || !targetNode) return;

  const sourceBounds = getNodeBounds(sourceNode);
  const targetBounds = getNodeBounds(targetNode);
  const startPoint = getBoundaryPoint(sourceBounds, { x: targetNode.X, y: targetNode.Y });
  const endPoint = getBoundaryPoint(targetBounds, { x: sourceNode.X, y: sourceNode.Y });

  const corridorRaw: Rect = {
    left: Math.min(sourceBounds.left, targetBounds.left),
    right: Math.max(sourceBounds.right, targetBounds.right),
    top: Math.min(sourceBounds.top, targetBounds.top),
    bottom: Math.max(sourceBounds.bottom, targetBounds.bottom),
  };
  const corridor = expandBounds(corridorRaw, CORRIDOR_MARGIN);

  // Compute each candidate node's bounds once; reuse for corridor-filter and padding.
  const paddedObstacles: Rect[] = [];
  for (const node of nodeMap.values()) {
    if (node === sourceNode || node === targetNode) continue;
    const bounds = getNodeBounds(node);
    if (rectsIntersect(bounds, corridor)) {
      paddedObstacles.push(expandBounds(bounds, ROUTE_PADDING));
    }
  }

  const { control1: col1, control2: col2 } = collinearControls(startPoint, endPoint);

  if (isLineClear(startPoint, endPoint, paddedObstacles)) {
    writeToLink(link, startPoint, endPoint, col1, col2);
    return;
  }

  const waypoints: Point[] = [startPoint, endPoint];
  for (const obs of paddedObstacles) {
    for (const corner of cornersOf(obs)) {
      const insideAny = paddedObstacles.some(
        (o) =>
          corner.x > o.left + EPSILON &&
          corner.x < o.right - EPSILON &&
          corner.y > o.top + EPSILON &&
          corner.y < o.bottom - EPSILON
      );
      if (!insideAny) waypoints.push(corner);
    }
  }

  const adjacency = new Map<number, { to: number; w: number }[]>();
  const n = waypoints.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!isLineClear(waypoints[i], waypoints[j], paddedObstacles)) continue;
      const d = dist(waypoints[i], waypoints[j]);
      if (!adjacency.has(i)) adjacency.set(i, []);
      if (!adjacency.has(j)) adjacency.set(j, []);
      adjacency.get(i)!.push({ to: j, w: d });
      adjacency.get(j)!.push({ to: i, w: d });
    }
  }

  const pathIndices = dijkstra(adjacency, 0, 1);

  if (pathIndices.length === 0) {
    writeToLink(link, startPoint, endPoint, col1, col2);
    return;
  }

  const pathPoints = pathIndices.map((i) => waypoints[i]);

  const cumDist: number[] = [0];
  for (let k = 1; k < pathPoints.length; k++) {
    cumDist.push(cumDist[k - 1] + dist(pathPoints[k - 1], pathPoints[k]));
  }
  const totalDist = cumDist[cumDist.length - 1];

  const mid1 = interpolateAlongPath(pathPoints, cumDist, totalDist / 3);
  const mid2 = interpolateAlongPath(pathPoints, cumDist, (totalDist * 2) / 3);

  const fitted = fitCubicControlPoints(startPoint, endPoint, mid1, mid2);
  if (!fitted) {
    writeToLink(link, startPoint, endPoint, col1, col2);
    return;
  }

  writeToLink(link, startPoint, endPoint, fitted.control1, fitted.control2);
}

export function routeLinksAroundNodes(
  links: LayoutLink[],
  nodes: LayoutNode[]
): void {
  const nodeMap = new Map<string, LayoutNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  for (const link of links) {
    routeLink(link, nodeMap);
  }
}
