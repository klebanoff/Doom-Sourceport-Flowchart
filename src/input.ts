import type { CameraLike } from "./types";

type TouchMode = "single" | "double" | "panelScroll";

type TouchLike = Pick<Touch, "pageX" | "pageY">;

type DrawCallback = () => void;

export function setupInputHandlers(
  canvas: HTMLCanvasElement,
  camera: CameraLike,
  onDraw: DrawCallback,
  getNodeIdAtScreenPosition: (x: number, y: number) => string | null,
  onHoverNodeChange: (id: string | null) => void,
  onCameraMove?: () => boolean,
  onNodeTap?: (id: string | null) => void,
  onPanelScroll?: (delta: number) => void,
  onCanvasClick?: (x: number, y: number) => void,
  isInPanel?: (x: number, y: number) => boolean,
  onCameraChange?: (camera: CameraLike) => void
): void {
  let prevMouseX = 0;
  let prevMouseY = 0;
  let touchMode: TouchMode = "single";
  const prevTouch: [TouchLike | null, TouchLike | null] = [null, null];
  let touching = false;
  let currentHoveredId: string | null = null;

  const dpr = window.devicePixelRatio || 1;
  const logicalWidth = document.body.clientWidth;
  const logicalHeight = document.body.clientHeight;
  canvas.style.width = logicalWidth + "px";
  canvas.style.height = logicalHeight + "px";
  canvas.width = Math.round(logicalWidth * dpr);
  canvas.height = Math.round(logicalHeight * dpr);

  canvas.onmousedown = handlePointerDown;
  document.body.addEventListener("mousemove", handlePointerMove);
  document.body.addEventListener("mouseup", handlePointerUp);
  canvas.addEventListener("mouseleave", clearHover);

  canvas.addEventListener("touchstart", (event: TouchEvent) => {
    onTouchStart(event.touches);
  });

  canvas.addEventListener("touchmove", (event: TouchEvent) => {
    onTouchMove(event.touches);
  });

  canvas.addEventListener("click", (e: MouseEvent) => {
    onCanvasClick?.(e.clientX, e.clientY);
  });

  canvas.onwheel = (e: WheelEvent) => {
    e.preventDefault();
    if (isInPanel?.(e.clientX, e.clientY)) {
      onPanelScroll?.(e.deltaY);
      return;
    }
    const [prevWheelX, prevWheelY] = camera.screenToWorld(e.x, e.y);
    camera.scale -= (10 * camera.scale) / e.deltaY;
    const [afterWheelX, afterWheelY] = camera.screenToWorld(e.x, e.y);
    camera.offsetX += prevWheelX - afterWheelX;
    camera.offsetY += prevWheelY - afterWheelY;
    onCameraChange?.(camera);
    onDraw();
  };

  function clearHover(): void {
    if (currentHoveredId === null) {
      return;
    }
    currentHoveredId = null;
    onHoverNodeChange(null);
  }

  function updateHover(screenX: number, screenY: number): void {
    const id = getNodeIdAtScreenPosition(screenX, screenY);
    if (id === currentHoveredId) {
      return;
    }

    currentHoveredId = id;
    onHoverNodeChange(id);
  }

  function handlePointerDown(e: MouseEvent): void {
    touching = true;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
    updateHover(e.clientX, e.clientY);
  }

  function handlePointerMove(e: MouseEvent): void {
    updateHover(e.clientX, e.clientY);

    if (!touching) return;

    camera.offsetX -= (e.clientX - prevMouseX) / camera.scale;
    camera.offsetY -= (e.clientY - prevMouseY) / camera.scale;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
    onCameraChange?.(camera);
    onDraw();
  }

  function handlePointerUp(): void {
    touching = false;
  }

  function onTouchStart(touches: TouchList): void {
    const firstTouch = touches[0];

    if (touches.length === 1 && firstTouch && isInPanel?.(firstTouch.clientX, firstTouch.clientY)) {
      touchMode = "panelScroll";
      prevTouch[0] = firstTouch;
      prevTouch[1] = null;
      return;
    }

    if (touches.length === 1) {
      touchMode = "single";
      if (firstTouch) {
        const nodeId = getNodeIdAtScreenPosition(firstTouch.clientX, firstTouch.clientY);
        onNodeTap?.(nodeId);
      }
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

    if (touchMode === "panelScroll") {
      const deltaY = touch0Y - prevTouch0Y;
      onPanelScroll?.(-deltaY);
      prevTouch[0] = firstTouch;
      return;
    }

    if (touchMode === "single") {
      const panX = touch0X - prevTouch0X;
      const panY = touch0Y - prevTouch0Y;

      camera.offsetX -= panX / camera.scale;
      camera.offsetY -= panY / camera.scale;
      const hoverCleared = onCameraMove?.() ?? false;
      if (hoverCleared) currentHoveredId = null;
      onCameraChange?.(camera);
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
          const hoverCleared = onCameraMove?.() ?? false;
          if (hoverCleared) currentHoveredId = null;
          onCameraChange?.(camera);
          onDraw();
        }
      }
    }

    prevTouch[0] = touches[0] ?? null;
    prevTouch[1] = touches[1] ?? null;
  }

  function resetCanvasSize(): void {
    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = document.body.clientWidth;
    const logicalHeight = document.body.clientHeight;
    canvas.style.width = logicalWidth + "px";
    canvas.style.height = logicalHeight + "px";
    canvas.width = Math.round(logicalWidth * dpr);
    canvas.height = Math.round(logicalHeight * dpr);
    onDraw();
  }

  window.onresize = resetCanvasSize;
}

