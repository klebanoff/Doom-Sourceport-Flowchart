import { computeLayout } from "./layout";
import { Camera } from "./camera";
import { drawScene } from "./renderer";
import { setupInputHandlers } from "./input";
import type { DoomData } from "./types";
import { simpleCrossLaneSample } from "./devSamples";

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

  let data: DoomData;
  if (useDevSample) {
    data = simpleCrossLaneSample;
  } else {
    const response = await fetch("data.json");
    data = (await response.json()) as DoomData;
  }

  const render = computeLayout(data);

  const draw = () => {
    drawScene(ctx, canvas, camera, render);
  };

  setupInputHandlers(canvas, camera, draw);
  draw();
}

window.addEventListener("load", () => {
  void init().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
  });
});

