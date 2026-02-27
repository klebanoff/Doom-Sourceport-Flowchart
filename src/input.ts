import type { CameraLike } from "./types";

type TouchMode = "single" | "double";

type TouchLike = Pick<Touch, "pageX" | "pageY">;

type DrawCallback = () => void;

export function setupInputHandlers(
  canvas: HTMLCanvasElement,
  camera: CameraLike,
  onDraw: DrawCallback,
  getNodeIdAtScreenPosition: (x: number, y: number) => string | null,
  onHoverNodeChange: (id: string | null) => void
): void {
  let prevMouseX = 0;
  let prevMouseY = 0;
  let touchMode: TouchMode = "single";
  const prevTouch: [TouchLike | null, TouchLike | null] = [null, null];
  let touching = false;
  let currentHoveredId: string | null = null;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  canvas.onmousedown = handlePointerDown;
  document.body.addEventListener("mousemove", handlePointerMove);
  document.body.addEventListener("mouseup", handlePointerUp);

  canvas.addEventListener("touchstart", (event: TouchEvent) => {
    onTouchStart(event.touches);
  });

  canvas.addEventListener("touchmove", (event: TouchEvent) => {
    onTouchMove(event.touches);
  });

  canvas.onwheel = (e: WheelEvent) => {
    e.preventDefault();
    const [prevWheelX, prevWheelY] = camera.screenToWorld(e.x, e.y);
    camera.scale -= (10 * camera.scale) / e.deltaY;
    const [afterWheelX, afterWheelY] = camera.screenToWorld(e.x, e.y);
    camera.offsetX += prevWheelX - afterWheelX;
    camera.offsetY += prevWheelY - afterWheelY;
    onDraw();
  };

  function updateHover(screenX: number, screenY: number): void {
    const id = getNodeIdAtScreenPosition(screenX, screenY);
    if (id === currentHoveredId) {
      return;
    }

    currentHoveredId = id;
    onHoverNodeChange(id);
  }

  function handlePointerDown(e: MouseEvent | TouchEvent): void {
    touching = true;
    let x = 0;
    let y = 0;
    if (e.type === "touchstart") {
      const touchEvent = e as TouchEvent;
      const firstTouch = touchEvent.touches[0];
      if (!firstTouch) return;
      x = firstTouch.clientX;
      y = firstTouch.clientY;
    } else {
      const mouseEvent = e as MouseEvent;
      x = mouseEvent.clientX;
      y = mouseEvent.clientY;
    }
    prevMouseX = x;
    prevMouseY = y;
    updateHover(x, y);
  }

  function handlePointerMove(e: MouseEvent | TouchEvent): void {
    let x = 0;
    let y = 0;
    if (e.type === "touchmove") {
      const touchEvent = e as TouchEvent;
      const firstTouch = touchEvent.touches[0];
      if (!firstTouch) return;
      x = firstTouch.clientX;
      y = firstTouch.clientY;
    } else {
      const mouseEvent = e as MouseEvent;
      x = mouseEvent.clientX;
      y = mouseEvent.clientY;
    }

    updateHover(x, y);

    if (!touching) return;

    camera.offsetX -= (x - prevMouseX) / camera.scale;
    camera.offsetY -= (y - prevMouseY) / camera.scale;
    prevMouseX = x;
    prevMouseY = y;
    onDraw();
  }

  function handlePointerUp(): void {
    touching = false;
  }

  function onTouchStart(touches: TouchList): void {
    if (touches.length === 1) {
      touchMode = "single";
    } else if (touches.length >= 2) {
      touchMode = "double";
    }

    prevTouch[0] = touches[0] ?? null;
    prevTouch[1] = touches[1] ?? null;

    onTouchMove(touches);
  }

  function onTouchMove(touches: TouchList): void {
    const firstTouch = touches[0];
    if (!firstTouch || !prevTouch[0]) {
      return;
    }

    const touch0X = firstTouch.pageX;
    const touch0Y = firstTouch.pageY;
    const prevTouch0X = prevTouch[0].pageX;
    const prevTouch0Y = prevTouch[0].pageY;

    if (touchMode === "single") {
      const panX = touch0X - prevTouch0X;
      const panY = touch0Y - prevTouch0Y;

      camera.offsetX -= panX / camera.scale;
      camera.offsetY -= panY / camera.scale;
      onDraw();
    }

    if (touchMode === "double") {
      const secondTouch = touches[1];
      const prevSecond = prevTouch[1];

      if (secondTouch && prevSecond) {
        const touch1X = secondTouch.pageX;
        const touch1Y = secondTouch.pageY;
        const prevTouch1X = prevSecond.pageX;
        const prevTouch1Y = prevSecond.pageY;

        const distancePreviousTouches = Math.hypot(
          prevTouch0X - prevTouch1X,
          prevTouch0Y - prevTouch1Y
        );

        const distanceCurrentTouches = Math.hypot(
          touch0X - touch1X,
          touch0Y - touch1Y
        );

        if (distancePreviousTouches !== 0) {
          const zoomAmount = distanceCurrentTouches / distancePreviousTouches;
          camera.scale *= zoomAmount;
          onDraw();
        }
      }
    }

    prevTouch[0] = touches[0] ?? null;
    prevTouch[1] = touches[1] ?? null;
  }

  function resetCanvasSize(): void {
    canvas.width = document.body.clientWidth;
    canvas.height = document.body.clientHeight;
    onDraw();
  }

  window.onresize = resetCanvasSize;
}

