import { computeLayout } from "./layout";
import { Camera } from "./camera";
import { drawScene } from "./renderer";
import { setupInputHandlers } from "./input";
import type { DoomData } from "./types";
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
  let hoveredNodeId: string | null = null;

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
    const [worldX, worldY] = camera.screenToWorld(screenX, screenY);
    return getNodeIdAtWorldPosition(worldX, worldY);
  };

  const draw = () => {
    drawScene(ctx, canvas, camera, render, hoveredNodeId);
  };

  const handleHoverChange = (id: string | null) => {
    if (hoveredNodeId === id) {
      return;
    }

    hoveredNodeId = id;
    draw();
  };

  setupInputHandlers(canvas, camera, draw, getNodeIdAtScreenPosition, handleHoverChange);
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
      hoveredNodeId = null;
      draw();
    }, 5000);
  }
}

window.addEventListener("load", () => {
  void init().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
  });
});

