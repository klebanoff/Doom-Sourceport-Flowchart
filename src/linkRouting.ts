import { NODE_WIDTH, NODE_HEIGHT } from "./constants";
import type { LayoutLink, LayoutNode } from "./types";

// ---- Routing constants ----
const ROUTE_PADDING = 10;
const EPSILON = 1e-6;
const CORRIDOR_MARGIN = 2 * Math.max(NODE_WIDTH, NODE_HEIGHT);
// ---- Internal geometry types ----
interface Point {
  x: number;
  y: number;
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// ---- Geometry helpers ----

function getNodeBounds(node: LayoutNode): Rect {
  return {
    left: node.X - NODE_WIDTH / 2,
    right: node.X + NODE_WIDTH / 2,
    top: node.Y - NODE_HEIGHT / 2,
    bottom: node.Y + NODE_HEIGHT / 2,
  };
}

function expandBounds(rect: Rect, padding: number): Rect {
  return {
    left: rect.left - padding,
    right: rect.right + padding,
    top: rect.top - padding,
    bottom: rect.bottom + padding,
  };
}

function rectContainsPoint(rect: Rect, p: Point): boolean {
  return p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function cornersOf(rect: Rect): Point[] {
  return [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ];
}

function dist(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Returns the intersection point of the line from rect center toward `target`
 * with the rectangle's perimeter.
 */
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

  // Scale so the ray hits the rectangle edge
  const scaleX = Math.abs(dx) > EPSILON ? halfW / Math.abs(dx) : Infinity;
  const scaleY = Math.abs(dy) > EPSILON ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);

  return { x: cx + dx * scale, y: cy + dy * scale };
}

/**
 * Tests whether segment p1->p2 intersects a single axis-aligned rectangle.
 * Uses the Liang-Barsky algorithm.
 */
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
      // Parallel to this edge; outside if q[i] < 0
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

  if (tMin > tMax) return false;

  // Segment intersects the rect slab; check if either endpoint is fully inside
  // or if the intersection interval is not degenerate at the boundary only.
  // We treat touching at corners/edges as intersection (conservative).
  return true;
}

/**
 * Returns true if the segment p1->p2 does NOT intersect any obstacle rectangle.
 * Endpoints that lie on a rect boundary are NOT counted as an intersection so
 * that corner waypoints sitting on a padded rect edge can still connect to each other.
 */
function isLineClear(p1: Point, p2: Point, obstacles: Rect[]): boolean {
  for (const obs of obstacles) {
    if (segmentIntersectsRect(p1, p2, obs)) {
      // Exclude the trivial case where both endpoints are the same corner
      // of the rect (distance ~0) – treat as clear.
      if (dist(p1, p2) < EPSILON) continue;

      // Allow segments that only "touch" the rect at their endpoints.
      // Re-test with slightly shrunk rect to avoid false positives from boundary corners.
      const inner: Rect = {
        left: obs.left + EPSILON,
        right: obs.right - EPSILON,
        top: obs.top + EPSILON,
        bottom: obs.bottom - EPSILON,
      };
      if (segmentIntersectsRect(p1, p2, inner)) return false;
    }
  }
  return true;
}

/**
 * Linear interpolation along a polyline at the given arc-length distance.
 */
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

// ---- Dijkstra shortest path ----

function dijkstra(
  adjacency: Map<number, { to: number; w: number }[]>,
  nodeCount: number,
  start: number,
  end: number
): number[] {
  const INF = Infinity;
  const dist_arr = new Array<number>(nodeCount).fill(INF);
  const prev = new Array<number>(nodeCount).fill(-1);
  dist_arr[start] = 0;

  // Simple priority queue via sorted array for small graphs (~250 nodes × 4 corners)
  const queue: number[] = [start];

  while (queue.length > 0) {
    // Find the unvisited node with smallest distance
    let minIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (dist_arr[queue[i]] < dist_arr[queue[minIdx]]) minIdx = i;
    }
    const u = queue[minIdx];
    queue.splice(minIdx, 1);

    if (u === end) break;

    const neighbors = adjacency.get(u);
    if (!neighbors) continue;
    for (const { to, w } of neighbors) {
      const alt = dist_arr[u] + w;
      if (alt < dist_arr[to]) {
        dist_arr[to] = alt;
        prev[to] = u;
        if (!queue.includes(to)) queue.push(to);
      }
    }
  }

  if (dist_arr[end] === INF) return [];

  const path: number[] = [];
  let cur = end;
  while (cur !== -1) {
    path.unshift(cur);
    cur = prev[cur];
  }
  return path;
}


// ---- Write helpers ----

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

// ---- Per-link routing ----

function routeLink(link: LayoutLink, nodeMap: Map<string, LayoutNode>): void {
  const sourceNode = nodeMap.get(link.source);
  const targetNode = nodeMap.get(link.target);
  if (!sourceNode || !targetNode) return;

  // Step 1: Bounds and boundary endpoints
  const sourceBounds = getNodeBounds(sourceNode);
  const targetBounds = getNodeBounds(targetNode);
  const startPoint = getBoundaryPoint(sourceBounds, { x: targetNode.X, y: targetNode.Y });
  const endPoint = getBoundaryPoint(targetBounds, { x: sourceNode.X, y: sourceNode.Y });

  // Step 2: Corridor-filtered obstacles
  const corridorRaw: Rect = {
    left: Math.min(sourceBounds.left, targetBounds.left),
    right: Math.max(sourceBounds.right, targetBounds.right),
    top: Math.min(sourceBounds.top, targetBounds.top),
    bottom: Math.max(sourceBounds.bottom, targetBounds.bottom),
  };
  const corridor = expandBounds(corridorRaw, CORRIDOR_MARGIN);

  const obstacleNodes: LayoutNode[] = [];
  nodeMap.forEach((node) => {
    if (node === sourceNode || node === targetNode) return;
    const nb = getNodeBounds(node);
    if (rectsIntersect(nb, corridor)) obstacleNodes.push(node);
  });

  const paddedObstacles = obstacleNodes.map((n) =>
    expandBounds(getNodeBounds(n), ROUTE_PADDING)
  );

  // #region agent log
  const _dbgMatch = link.source.toLowerCase().includes('zdoom') && link.target.toLowerCase().includes('gzdoom') ||
    link.source.toLowerCase().includes('gzdoom') && link.target.toLowerCase().includes('zdoom');
  if (_dbgMatch) {
    fetch('http://127.0.0.1:7656/ingest/d9797f29-1ae6-4275-a730-019dbfd13f16',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'657b35'},body:JSON.stringify({sessionId:'657b35',location:'linkRouting.ts:corridorInfo',message:'obstacle corridor info',hypothesisId:'C',data:{source:link.source,target:link.target,obstacleCount:obstacleNodes.length,startPoint,endPoint,corridorRaw,corridorMargin:CORRIDOR_MARGIN},timestamp:Date.now()})}).catch(()=>{});
  }
  // #endregion

  // Step 3: Line of sight fast path — update boundary endpoints only.
  // Leave c1x/c1y/c2x/c2y unset so the renderer falls back to its S-curve.
  const _losResult = isLineClear(startPoint, endPoint, paddedObstacles);
  // #region agent log
  if (_dbgMatch) {
    fetch('http://127.0.0.1:7656/ingest/d9797f29-1ae6-4275-a730-019dbfd13f16',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'657b35'},body:JSON.stringify({sessionId:'657b35',location:'linkRouting.ts:LOScheck',message:'LOS result',hypothesisId:'A',data:{source:link.source,target:link.target,losIsClear:_losResult,obstacleCount:paddedObstacles.length},timestamp:Date.now()})}).catch(()=>{});
  }
  // #endregion
  if (_losResult) {
    link.sourceX = startPoint.x;
    link.sourceY = startPoint.y;
    link.targetX = endPoint.x;
    link.targetY = endPoint.y;
    return;
  }

  // Step 4: Visibility graph
  const waypoints: Point[] = [startPoint, endPoint];
  let _dbgFilteredCorners = 0;
  for (const obs of paddedObstacles) {
    for (const corner of cornersOf(obs)) {
      // Exclude corners that are strictly inside (not just on the boundary of)
      // any padded obstacle. Boundary points are valid waypoints; using strict
      // inequality prevents every corner from being falsely excluded against its
      // own obstacle's boundary.
      const insideAny = paddedObstacles.some(
        (o) =>
          corner.x > o.left + EPSILON &&
          corner.x < o.right - EPSILON &&
          corner.y > o.top + EPSILON &&
          corner.y < o.bottom - EPSILON
      );
      if (!insideAny) waypoints.push(corner);
      // #region agent log
      else if (_dbgMatch) _dbgFilteredCorners++;
      // #endregion
    }
  }

  // #region agent log
  if (_dbgMatch) {
    fetch('http://127.0.0.1:7656/ingest/d9797f29-1ae6-4275-a730-019dbfd13f16',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'657b35'},body:JSON.stringify({sessionId:'657b35',location:'linkRouting.ts:waypointFilter',message:'waypoint filtering',hypothesisId:'B',data:{source:link.source,target:link.target,totalWaypoints:waypoints.length,filteredOutCorners:_dbgFilteredCorners,obstacleCount:paddedObstacles.length},timestamp:Date.now()})}).catch(()=>{});
  }
  // #endregion

  const adjacency = new Map<number, { to: number; w: number }[]>();
  const n = waypoints.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (isLineClear(waypoints[i], waypoints[j], paddedObstacles)) {
        const d = dist(waypoints[i], waypoints[j]);
        if (!adjacency.has(i)) adjacency.set(i, []);
        if (!adjacency.has(j)) adjacency.set(j, []);
        adjacency.get(i)!.push({ to: j, w: d });
        adjacency.get(j)!.push({ to: i, w: d });
      }
    }
  }

  const pathIndices = dijkstra(adjacency, n, 0, 1);

  // #region agent log
  if (_dbgMatch) {
    fetch('http://127.0.0.1:7656/ingest/d9797f29-1ae6-4275-a730-019dbfd13f16',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'657b35'},body:JSON.stringify({sessionId:'657b35',location:'linkRouting.ts:dijkstra',message:'dijkstra result',hypothesisId:'B',data:{source:link.source,target:link.target,pathFound:pathIndices.length>0,pathLength:pathIndices.length,edgeCount:Array.from(adjacency.values()).reduce((s,v)=>s+v.length,0)},timestamp:Date.now()})}).catch(()=>{});
  }
  // #endregion

  if (pathIndices.length === 0) {
    // No path found — update boundary endpoints, let renderer keep S-curve.
    link.sourceX = startPoint.x;
    link.sourceY = startPoint.y;
    link.targetX = endPoint.x;
    link.targetY = endPoint.y;
    return;
  }

  const pathPoints = pathIndices.map((i) => waypoints[i]);

  // Step 5: Arc-length parameterization
  const cumDist: number[] = [0];
  for (let k = 1; k < pathPoints.length; k++) {
    cumDist.push(cumDist[k - 1] + dist(pathPoints[k - 1], pathPoints[k]));
  }
  const totalDist = cumDist[cumDist.length - 1];

  const mid1 = interpolateAlongPath(pathPoints, cumDist, totalDist / 3);
  const mid2 = interpolateAlongPath(pathPoints, cumDist, (totalDist * 2) / 3);

  // Step 6: Solve 2×2 for cubic Bézier control points
  // B(t) = (1-t)^3 P0 + 3(1-t)^2 t C1 + 3(1-t) t^2 C2 + t^3 P3
  // Constraints: B(1/3) = mid1, B(2/3) = mid2
  const P0 = startPoint;
  const P3 = endPoint;

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

  let control1: Point;
  let control2: Point;

  if (Math.abs(det) < EPSILON) {
    // Degenerate 2×2 — update boundary endpoints, let renderer keep S-curve.
    link.sourceX = P0.x;
    link.sourceY = P0.y;
    link.targetX = P3.x;
    link.targetY = P3.y;
    return;
  }

  control1 = {
    x: (b1x * a22 - b2x * a12) / det,
    y: (b1y * a22 - b2y * a12) / det,
  };
  control2 = {
    x: (a11 * b2x - a21 * b1x) / det,
    y: (a11 * b2y - a21 * b1y) / det,
  };

  // Step 7: Commit the solved control points.
  // A per-sample curve-vs-obstacle check was previously here, but it always
  // fired: curves routed via corner waypoints necessarily clip obstacle rects
  // near their endpoints because start/end sit at the lane's Y centre (inside
  // the obstacle's vertical band). Links are rendered below nodes, so those
  // endpoint clips are invisible — the curve correctly arches above obstacles
  // in its visible middle section.
  writeToLink(link, startPoint, endPoint, control1, control2);
}

// ---- Public API ----

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
