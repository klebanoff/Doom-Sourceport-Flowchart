import { NODE_HEIGHT } from "./constants";
import { parseDescriptionSegments, layoutTokens } from "./renderer";
import type { CameraLike, LayoutNode, LinkHitArea } from "./types";

export const PANEL_HEADER_HEIGHT = 44;

export function getPanelTop(canvas: HTMLCanvasElement): number {
  return Math.floor(canvas.clientHeight / 2);
}

export function isInPanel(canvas: HTMLCanvasElement, y: number): boolean {
  return y >= getPanelTop(canvas);
}

export interface DrawPanelResult {
  linkAreas: LinkHitArea[];
  contentHeight: number;
  maxScroll: number;
  closeButtonRect: { x: number; y: number; width: number; height: number };
}

export function drawPanel(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  node: LayoutNode,
  scrollY: number
): DrawPanelResult {
  const panelTop = getPanelTop(canvas);
  const panelWidth = canvas.clientWidth;
  const panelHeight = canvas.clientHeight - panelTop;

  const bodyTop = panelTop + PANEL_HEADER_HEIGHT;
  const bodyHeight = panelHeight - PANEL_HEADER_HEIGHT;
  const PADDING = 14;
  const FONT_SIZE = 14;
  const LINE_HEIGHT = 20;
  const BODY_FONT = `${FONT_SIZE}px sans-serif`;
  const SCROLLBAR_WIDTH = 6;
  const SCROLLBAR_MARGIN = 4;
  const contentMaxWidth = panelWidth - PADDING * 2 - SCROLLBAR_WIDTH - SCROLLBAR_MARGIN;

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.save();
  ctx.fillStyle = "#1e1e2e";
  ctx.fillRect(0, panelTop, panelWidth, panelHeight);
  ctx.strokeStyle = "#555555";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, panelTop);
  ctx.lineTo(panelWidth, panelTop);
  ctx.stroke();
  ctx.restore();

  // ── Header ───────────────────────────────────────────────────────────────────
  const closeBtnSize = PANEL_HEADER_HEIGHT;
  const closeButtonRect = {
    x: panelWidth - closeBtnSize,
    y: panelTop,
    width: closeBtnSize,
    height: closeBtnSize,
  };

  ctx.save();
  ctx.font = `bold 15px sans-serif`;
  ctx.fillStyle = "#e0e0e0";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(
    node.name,
    PADDING,
    panelTop + PANEL_HEADER_HEIGHT / 2,
    panelWidth - PADDING - closeBtnSize - PADDING
  );
  ctx.restore();

  // Close button ×
  ctx.save();
  ctx.font = `bold 20px sans-serif`;
  ctx.fillStyle = "#aaaaaa";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(
    "×",
    closeButtonRect.x + closeBtnSize / 2,
    closeButtonRect.y + closeBtnSize / 2
  );
  ctx.restore();

  // Separator below header
  ctx.save();
  ctx.strokeStyle = "#333344";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, bodyTop);
  ctx.lineTo(panelWidth, bodyTop);
  ctx.stroke();
  ctx.restore();

  // ── Body (clipped + scrolled) ─────────────────────────────────────────────
  const segments = parseDescriptionSegments(node.description ?? "");
  const tokens = layoutTokens(
    ctx,
    segments,
    0,
    0,
    contentMaxWidth,
    BODY_FONT,
    LINE_HEIGHT
  );

  const lastToken = tokens[tokens.length - 1];
  const contentHeight = lastToken
    ? lastToken.y + lastToken.height + PADDING
    : LINE_HEIGHT + PADDING;
  const maxScroll = Math.max(0, contentHeight - bodyHeight + PADDING);
  const clampedScroll = Math.max(0, Math.min(maxScroll, scrollY));

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, bodyTop, panelWidth, bodyHeight);
  ctx.clip();

  const bodyOffsetX = PADDING;
  const bodyOffsetY = bodyTop + PADDING - clampedScroll;

  const linkAreas: LinkHitArea[] = [];

  ctx.textBaseline = "top";
  ctx.shadowColor = "transparent";

  for (const token of tokens) {
    const screenX = bodyOffsetX + token.x;
    const screenY = bodyOffsetY + token.y;

    // Skip tokens fully outside the visible body area
    if (screenY + token.height < bodyTop || screenY > bodyTop + bodyHeight) {
      continue;
    }

    if (token.url) {
      ctx.font = BODY_FONT;
      ctx.fillStyle = "#7ec8e3";
      ctx.fillText(token.text, screenX, screenY);
      ctx.beginPath();
      ctx.strokeStyle = "#7ec8e3";
      ctx.lineWidth = 1;
      ctx.moveTo(screenX, screenY + FONT_SIZE + 1);
      ctx.lineTo(screenX + token.width, screenY + FONT_SIZE + 1);
      ctx.stroke();

      // Only register hit area if visible
      const hitTop = Math.max(screenY, bodyTop);
      const hitBottom = Math.min(screenY + token.height, bodyTop + bodyHeight);
      if (hitBottom > hitTop) {
        linkAreas.push({
          url: token.url,
          x: screenX,
          y: hitTop,
          width: token.width,
          height: hitBottom - hitTop,
        });
      }
    } else {
      ctx.font = BODY_FONT;
      ctx.fillStyle = "#cccccc";
      ctx.fillText(token.text, screenX, screenY);
    }
  }

  ctx.restore();

  // ── Scrollbar ─────────────────────────────────────────────────────────────
  if (contentHeight > bodyHeight) {
    const trackX = panelWidth - SCROLLBAR_WIDTH - SCROLLBAR_MARGIN;
    const trackY = bodyTop + SCROLLBAR_MARGIN;
    const trackH = bodyHeight - SCROLLBAR_MARGIN * 2;
    const thumbH = Math.max(20, (bodyHeight / contentHeight) * trackH);
    const thumbY =
      trackY + (clampedScroll / maxScroll) * (trackH - thumbH);

    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === "function") {
      (ctx as any).roundRect(trackX, trackY, SCROLLBAR_WIDTH, trackH, 3);
    } else {
      ctx.rect(trackX, trackY, SCROLLBAR_WIDTH, trackH);
    }
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === "function") {
      (ctx as any).roundRect(trackX, thumbY, SCROLLBAR_WIDTH, thumbH, 3);
    } else {
      ctx.rect(trackX, thumbY, SCROLLBAR_WIDTH, thumbH);
    }
    ctx.fill();
    ctx.restore();
  }

  return { linkAreas, contentHeight, maxScroll, closeButtonRect };
}

export function getNodeScreenHalfHeight(
  camera: CameraLike
): number {
  return (NODE_HEIGHT * camera.scale) / 2;
}
