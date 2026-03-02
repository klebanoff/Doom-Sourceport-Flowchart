import { NODE_HEIGHT, NODE_WIDTH } from "./constants";
import { LayoutNode, Point, Rect } from "./types";

export interface SCurveControlPoints {
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
}

export function getSCurveControlPoints(
  sx: number,
  sy: number,
  tx: number,
  ty: number
): SCurveControlPoints {
  const midX = (sx + tx) / 2;
  return {
    c1x: midX,
    c1y: sy,
    c2x: midX,
    c2y: ty,
  };
}

export function sampleSCurve(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  t: number
): [number, number] {
  const { c1x, c1y, c2x, c2y } = getSCurveControlPoints(sx, sy, tx, ty);

  const mt = 1 - t;

  const x =
    mt * mt * mt * sx +
    3 * mt * mt * t * c1x +
    3 * mt * t * t * c2x +
    t * t * t * tx;

  const y =
    mt * mt * mt * sy +
    3 * mt * mt * t * c1y +
    3 * mt * t * t * c2y +
    t * t * t * ty;

  return [x, y];
}


export function getNodeBounds(node: LayoutNode): Rect {
  return {
    left: node.X - NODE_WIDTH / 2,
    right: node.X + NODE_WIDTH / 2,
    top: node.Y - NODE_HEIGHT / 2,
    bottom: node.Y + NODE_HEIGHT / 2,
  };
}

export function expandBounds(rect: Rect, padding: number): Rect {
  return {
    left: rect.left - padding,
    right: rect.right + padding,
    top: rect.top - padding,
    bottom: rect.bottom + padding,
  };
}


export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

export function cornersOf(rect: Rect): Point[] {
  return [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ];
}

export function dist(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}
