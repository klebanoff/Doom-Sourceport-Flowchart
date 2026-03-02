import { computeLayout } from "./layout";
import { Camera } from "./camera";
import { drawScene } from "./renderer";
import { drawPanel, isInPanel } from "./panel";
import { setupInputHandlers } from "./input";
import type { DoomData, LinkHitArea, TooltipBounds } from "./types";
import { simpleCrossLaneSample } from "./devSamples";
import { NODE_HEIGHT, NODE_WIDTH } from "./constants";

async function loadDataJson(): Promise<DoomData | null> {
  try {
    const response = await fetch("data.json", { cache: "no-store" });
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error("Failed to load data.json:", response.status);
      return null;
    }

    const json = (await response.json()) as unknown;
    if (!Array.isArray(json)) {
      // eslint-disable-next-line no-console
      console.error("data.json is not an array");
      return null;
    }

    return json as DoomData;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Error while loading data.json", error);
    return null;
  }
}

async function init(): Promise<void> {
  const canvas = document.getElementById("doomCanvas") as HTMLCanvasElement | null;
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const camera = new Camera();

  const useDevSample = false;

  let data: DoomData | null;
  if (useDevSample) {
    data = simpleCrossLaneSample;
  } else {
    data = await loadDataJson();
  }

  if (!data) {
    return;
  }

  let render = computeLayout(data);
  let mouseHoveredId: string | null = null;
  let tappedNodeId: string | null = null;
  let panelScrollY = 0;
  let panelMaxScroll = 0;
  let linkHitAreas: LinkHitArea[] = [];
  let panelCloseRect: { x: number; y: number; width: number; height: number } | null = null;
  let tooltipBounds: TooltipBounds | null = null;

  const getNodeIdAtWorldPosition = (worldX: number, worldY: number): string | null => {
    const halfWidth = NODE_WIDTH / 2;
    const halfHeight = NODE_HEIGHT / 2;

    for (let i = 0; i < render.nodes.length; i++) {
      const node = render.nodes[i];
      const minX = node.X - halfWidth;
      const maxX = node.X + halfWidth;
      const minY = node.Y - halfHeight;
      const maxY = node.Y + halfHeight;

      if (worldX >= minX && worldX <= maxX && worldY >= minY && worldY <= maxY) {
        return node.id;
      }
    }

    return null;
  };

  const getNodeIdAtScreenPosition = (screenX: number, screenY: number): string | null => {
    // Sticky hover: keep mouseHoveredId when the pointer is inside the tooltip
    // box or inside the invisible triangle bridging the node to the tooltip.
    if (mouseHoveredId && tooltipBounds) {
      const tb = tooltipBounds;
      if (
        screenX >= tb.x && screenX <= tb.x + tb.width &&
        screenY >= tb.y && screenY <= tb.y + tb.height
      ) {
        return mouseHoveredId;
      }
      // Invisible triangle: node center → the two near corners of the tooltip
      const nearY = tb.isAboveNode ? tb.y + tb.height : tb.y;
      if (isPointInTriangle(
        screenX, screenY,
        tb.nodeScreenX, tb.nodeScreenY,
        tb.x, nearY,
        tb.x + tb.width, nearY
      )) {
        return mouseHoveredId;
      }
    }

    const [worldX, worldY] = camera.screenToWorld(screenX, screenY);
    return getNodeIdAtWorldPosition(worldX, worldY);
  };

  const draw = () => {
    const highlightNodeId = mouseHoveredId ?? tappedNodeId;
    const sceneResult = drawScene(
      ctx,
      canvas,
      camera,
      render,
      highlightNodeId,
      !!mouseHoveredId
    );
    tooltipBounds = sceneResult.tooltipBounds;

    let panelAreas: LinkHitArea[] = [];
    if (tappedNodeId) {
      const node = render.nodes.find((n) => n.id === tappedNodeId);
      if (node?.description) {
        const result = drawPanel(ctx, canvas, node, panelScrollY);
        panelAreas = result.linkAreas;
        panelMaxScroll = result.maxScroll;
        panelCloseRect = result.closeButtonRect;
      }
    }

    linkHitAreas = [...sceneResult.linkAreas, ...panelAreas];
  };

  const handleHoverChange = (id: string | null) => {
    mouseHoveredId = id;
    draw();
  };

  const handleNodeTap = (id: string | null) => {
    tappedNodeId = id;
    panelScrollY = 0;
    draw();
  };

  const handlePanelScroll = (delta: number) => {
    panelScrollY = Math.max(0, Math.min(panelMaxScroll, panelScrollY + delta));
    draw();
  };

  const handleCanvasClick = (x: number, y: number) => {
    if (tappedNodeId && panelCloseRect) {
      const r = panelCloseRect;
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
        handleNodeTap(null);
        return;
      }
    }
    for (const area of linkHitAreas) {
      if (
        x >= area.x &&
        x <= area.x + area.width &&
        y >= area.y &&
        y <= area.y + area.height
      ) {
        window.open(area.url, "_blank");
        return;
      }
    }
  };

  const onCameraMove = (): boolean => {
    if (!mouseHoveredId) return false;
    const node = render.nodes.find((n) => n.id === mouseHoveredId);
    if (!node) {
      mouseHoveredId = null;
      return true;
    }
    const [sx, sy] = camera.worldToScreen(node.X, node.Y);
    if (sx < 0 || sx > canvas.clientWidth || sy < 0 || sy > canvas.clientHeight) {
      mouseHoveredId = null;
      return true;
    }
    return false;
  };

  const checkIsInPanel = (x: number, y: number): boolean =>
    tappedNodeId !== null && isInPanel(canvas, y);

  setupInputHandlers(
    canvas,
    camera,
    draw,
    getNodeIdAtScreenPosition,
    handleHoverChange,
    onCameraMove,
    handleNodeTap,
    handlePanelScroll,
    handleCanvasClick,
    checkIsInPanel
  );
  draw();

  if (!useDevSample) {
    let lastSerialized = JSON.stringify(data);

    window.setInterval(async () => {
      const next = await loadDataJson();
      if (!next) {
        return;
      }

      const serialized = JSON.stringify(next);
      if (serialized === lastSerialized) {
        return;
      }

      lastSerialized = serialized;
      render = computeLayout(next);
      mouseHoveredId = null;
      tappedNodeId = null;
      panelScrollY = 0;
      draw();
    }, 5000);
  }
}

function isPointInTriangle(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number
): boolean {
  const d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const d2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  const d3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

window.addEventListener("load", () => {
  void init().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
  });
});

