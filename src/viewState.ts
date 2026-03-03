import type { CameraLike, LayoutResult } from "./types";
import { NODE_HEIGHT, NODE_WIDTH, VIEWPORT_PADDING } from "./constants";

export interface CameraState {
  offsetX: number;
  offsetY: number;
  scale: number;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 10;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function computeWorldBounds(render: LayoutResult): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} | null {
  if (!render.nodes || render.nodes.length === 0) {
    return null;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const halfWidth = NODE_WIDTH / 2;
  const halfHeight = NODE_HEIGHT / 2;

  for (let i = 0; i < render.nodes.length; i++) {
    const node = render.nodes[i];
    const nodeMinX = node.X - halfWidth;
    const nodeMaxX = node.X + halfWidth;
    const nodeMinY = node.Y - halfHeight;
    const nodeMaxY = node.Y + halfHeight;

    if (nodeMinX < minX) minX = nodeMinX;
    if (nodeMaxX > maxX) maxX = nodeMaxX;
    if (nodeMinY < minY) minY = nodeMinY;
    if (nodeMaxY > maxY) maxY = nodeMaxY;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }

  return { minX, maxX, minY, maxY };
}

function computeZoomToFitState(
  render: LayoutResult,
  canvas: HTMLCanvasElement
): CameraState {
  const bounds = computeWorldBounds(render);
  if (!bounds) {
    return { offsetX: 0, offsetY: 0, scale: 1 };
  }

  const worldWidth = bounds.maxX - bounds.minX || NODE_WIDTH;
  const worldHeight = bounds.maxY - bounds.minY || NODE_HEIGHT;

  const contentWidth = Math.max(
    1,
    canvas.clientWidth - 2 * VIEWPORT_PADDING
  );
  const contentHeight = Math.max(
    1,
    canvas.clientHeight - 2 * VIEWPORT_PADDING
  );

  const scaleX = contentWidth / worldWidth;
  const scaleY = contentHeight / worldHeight;
  const targetScale = clamp(Math.min(scaleX, scaleY) * 0.9, MIN_SCALE, MAX_SCALE);

  const worldCenterX = (bounds.minX + bounds.maxX) / 2;
  const worldCenterY = (bounds.minY + bounds.maxY) / 2;

  const screenCenterX = VIEWPORT_PADDING + contentWidth / 2;
  const screenCenterY = VIEWPORT_PADDING + contentHeight / 2;

  const offsetX = worldCenterX - screenCenterX / targetScale;
  const offsetY = worldCenterY - screenCenterY / targetScale;

  return {
    offsetX,
    offsetY,
    scale: targetScale,
  };
}

export function initCameraView(
  camera: CameraLike,
  render: LayoutResult,
  canvas: HTMLCanvasElement
): void {
  const fitted = computeZoomToFitState(render, canvas);
  camera.offsetX = fitted.offsetX;
  camera.offsetY = fitted.offsetY;
  camera.scale = fitted.scale;
}

