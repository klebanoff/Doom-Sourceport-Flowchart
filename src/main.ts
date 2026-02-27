import { computeLayout } from "./layout";
import { Camera } from "./camera";
import { drawScene } from "./renderer";
import { setupInputHandlers } from "./input";
import type { DoomData } from "./types";
import { simpleCrossLaneSample } from "./devSamples";

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

  const draw = () => {
    drawScene(ctx, canvas, camera, render);
  };

  setupInputHandlers(canvas, camera, draw);
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

