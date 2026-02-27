import {
  NODE_WIDTH,
  NODE_HEIGHT,
  PADDING_BETWEEN_NODES_X,
  geneticLines,
} from "./constants";
import { getLaneDisplayName, getLaneColors } from "./laneConfig";
import type { CameraLike, LayoutResult, LayoutNode } from "./types";
import { getSCurveControlPoints } from "./geometry";

function darkenColor(hex: string, factor: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) {
    return hex;
  }

  const intFromHex = (start: number) =>
    parseInt(match[1].slice(start, start + 2), 16);

  const r = intFromHex(0);
  const g = intFromHex(2);
  const b = intFromHex(4);

  const clamp = (value: number) => Math.max(0, Math.min(255, value));

  const toHex = (value: number) => clamp(value).toString(16).padStart(2, "0");

  const nr = Math.round(r * factor);
  const ng = Math.round(g * factor);
  const nb = Math.round(b * factor);

  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: CameraLike,
  render: LayoutResult
): void {
  const nodeSizeX = NODE_WIDTH;
  const nodeSizeY = NODE_HEIGHT;
  const paddingBetweenNodesX = PADDING_BETWEEN_NODES_X;
  const scale = camera.scale;
  const worldToScreen = (x: number, y: number) => camera.worldToScreen(x, y);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawLaneBackgrounds();
  drawTimelineAxis();
  drawLegend();

  for (let i = 0; i < render.links.length; i++) {
    renderLink(render.links[i]);
  }
  for (let i = 0; i < render.nodes.length; i++) {
    renderNode(render.nodes[i]);
  }

  function drawLaneBackgrounds(): void {
    if (!render.lanes || render.lanes.length === 0) {
      return;
    }

    const nodeXs = render.nodes.map((n) => n.X);
    const worldMinX =
      Math.min.apply(null, nodeXs) - (nodeSizeX + paddingBetweenNodesX);
    const worldMaxX =
      Math.max.apply(null, nodeXs) + (nodeSizeX + paddingBetweenNodesX);

    for (let i = 0; i < render.lanes.length; i++) {
      const lane = render.lanes[i];
      const colors = getLaneColors(lane.key);

      const [x1, y1] = worldToScreen(worldMinX, lane.top);
      const [x2, y2] = worldToScreen(worldMaxX, lane.bottom);
      const width = x2 - x1;
      const height = y2 - y1;

      ctx.fillStyle = colors.background;
      ctx.fillRect(x1, y1, width, height);

      const [labelX, labelY] = worldToScreen(
        worldMinX + 20,
        lane.yCenter
      );
      const laneLabel = getLaneDisplayName(lane.key);
      const labelColor = darkenColor(colors.stroke, 0.6);

      // Маленькая подпись слева
      ctx.save();
      ctx.fillStyle = labelColor;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.font = `${144 * scale}px sans-serif`;
      ctx.fillText(laneLabel, labelX, labelY);
      ctx.restore();

      // Крупный фон-лейбл по центру дорожки
      // const [centerX, centerY] = worldToScreen(worldCenterX, lane.yCenter);
      // ctx.save();
      // ctx.globalAlpha = 0.45;
      // ctx.fillStyle = labelColor;
      // ctx.textAlign = "center";
      // ctx.textBaseline = "middle";
      // ctx.font = `${72 * scale}px sans-serif`;
      // ctx.fillText(laneLabel.toUpperCase(), centerX, centerY);
      // ctx.restore();
    }
  }

  function drawTimelineAxis(): void {
    if (
      !render.timelineMarkers ||
      render.timelineMarkers.length === 0 ||
      !render.lanes ||
      render.lanes.length === 0
    ) {
      return;
    }

    const laneHeight = render.lanes[0].bottom - render.lanes[0].top;
    const minLaneTop = Math.min.apply(
      null,
      render.lanes.map((lane) => lane.top)
    );
    const maxLaneBottom = Math.max.apply(
      null,
      render.lanes.map((lane) => lane.bottom)
    );
    const axisY = minLaneTop - laneHeight * 0.4;

    const nodeXs = render.nodes.map((n) => n.X);
    const worldMinX =
      Math.min.apply(null, nodeXs) - (nodeSizeX + paddingBetweenNodesX);
    const worldMaxX =
      Math.max.apply(null, nodeXs) + (nodeSizeX + paddingBetweenNodesX);

    const [axisStartX, axisScreenY] = worldToScreen(worldMinX, axisY);
    const [axisEndX] = worldToScreen(worldMaxX, axisY);

    ctx.save();
    ctx.strokeStyle = "#888888";
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = `${14 * scale}px sans-serif`;

    const yearLabelScreenY = 20;

    ctx.beginPath();
    ctx.moveTo(axisStartX, axisScreenY);
    ctx.lineTo(axisEndX, axisScreenY);
    ctx.stroke();

    for (let i = 0; i < render.timelineMarkers.length; i++) {
      const marker = render.timelineMarkers[i];
      const [markerX, markerY] = worldToScreen(marker.x, axisY);
      const [, bottomScreenY] = worldToScreen(marker.x, maxLaneBottom);

      ctx.beginPath();
      ctx.moveTo(markerX, markerY);
      ctx.lineTo(markerX, bottomScreenY);
      ctx.stroke();

      ctx.fillText(String(marker.year), markerX, yearLabelScreenY);
    }

    ctx.restore();
  }

  function drawLegend(): void {
    const legendEntries: string[] = [
      geneticLines.official,
      geneticLines.heretic,
      geneticLines.hexen,
      geneticLines.console,
      geneticLines.boom,
      geneticLines.zdoom,
      geneticLines.chocolate,
      geneticLines.eternity,
      geneticLines.dosdoom,
      geneticLines.doomsday,
      geneticLines.vavoom,
      "other",
    ];

    const legendX = 16;
    const legendY = 40;
    const boxSize = 12;
    const lineHeight = 18;
    const paddingX = 8;

    ctx.save();
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    for (let i = 0; i < legendEntries.length; i++) {
      const key = legendEntries[i];
      const colors = getLaneColors(key);
      const y = legendY + i * lineHeight;

      const boxY = y - boxSize / 2;

      ctx.fillStyle = colors.background;
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 1;
      ctx.fillRect(legendX, boxY, boxSize, boxSize);
      ctx.strokeRect(legendX, boxY, boxSize, boxSize);

      ctx.fillStyle = darkenColor(colors.stroke, 0.7);
      const label = getLaneDisplayName(key);
      ctx.fillText(label, legendX + boxSize + paddingX, y);
    }

    ctx.restore();
  }

  function renderLink(line: LayoutResult["links"][number]): void {
    let [startX, startY] = worldToScreen(line.sourceX, line.sourceY);
    let [endX, endY] = worldToScreen(line.targetX, line.targetY);

    const parentNode = render.nodes.find((n) => n.id === line.source);
    const laneKey =
      parentNode && parentNode._laneKey ? parentNode._laneKey : "other";
    const colors = getLaneColors(laneKey);

    ctx.save();
    ctx.beginPath();

    const waypoints = line.waypoints ?? [];

    if (!waypoints.length) {
      const { c1x, c1y, c2x, c2y } = getSCurveControlPoints(
        startX,
        startY,
        endX,
        endY
      );

      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, endX, endY);
    } else {
      const points: { x: number; y: number }[] = [];
      points.push({ x: startX, y: startY });

      for (let i = 0; i < waypoints.length; i++) {
        const [wx, wy] = worldToScreen(waypoints[i].x, waypoints[i].y);
        points.push({ x: wx, y: wy });
      }

      points.push({ x: endX, y: endY });

      ctx.moveTo(points[0].x, points[0].y);

      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];

        const { c1x, c1y, c2x, c2y } = getSCurveControlPoints(
          p0.x,
          p0.y,
          p1.x,
          p1.y
        );

        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p1.x, p1.y);
      }
    }

    ctx.setLineDash(
      line.isPrimary ? [] : [10 * scale, 6 * scale]
    );
    ctx.lineWidth = line.isPrimary ? 3 * scale : 1.5 * scale;
    ctx.strokeStyle = colors.stroke;
    ctx.stroke();
    ctx.restore();
  }

  function renderNode(node: LayoutNode): void {
    let x = node.X - nodeSizeX / 2;
    let y = node.Y - nodeSizeY / 2;
    [x, y] = worldToScreen(x, y);
    let textX = node.X;
    let textY = node.Y;
    [textX, textY] = worldToScreen(textX, textY);

    let fillStyle = "#FFFFFF";
    let strokeStyle = "#000000";
    let dash: number[] = [];

    switch (node.type) {
      case "mainline":
        fillStyle = "#FFE6CC";
        strokeStyle = "#D79B00";
        break;
      case "official":
        fillStyle = "#FFF2CC";
        strokeStyle = "#D6B656";
        break;
      case "unrelated":
        fillStyle = "#FFFFFF";
        strokeStyle = "#000000";
        dash = [4 * scale, 2 * scale];
        break;
      case "console":
        fillStyle = "#E0F7FA";
        strokeStyle = "#00838F";
        break;
    }

    ctx.save();
    ctx.setLineDash(dash);
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 2 * scale;
    ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
    ctx.shadowBlur = 10 * scale;
    ctx.shadowOffsetX = 2 * scale;
    ctx.shadowOffsetY = 2 * scale;

    const width = nodeSizeX * scale;
    const height = nodeSizeY * scale;
    const radius = 10 * scale;

    ctx.beginPath();
    if (typeof (ctx as any).roundRect === "function") {
      (ctx as any).roundRect(x, y, width, height, radius);
    } else {
      ctx.rect(x, y, width, height);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textBaseline = "middle";
    const fontSize = 30 * scale;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    wrapText(ctx, node.name, textX, textY, nodeSizeX * scale, fontSize);
    ctx.restore();
  }

  function wrapText(
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ): void {
    const words = text.split(" ");
    const textRender: { line: string; x: number; y: number }[] = [];
    let line = "";

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = context.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        textRender.push({ line, x, y });
        line = words[n] + " ";
        y += lineHeight;
      } else {
        line = testLine;
      }
    }

    textRender.push({ line, x, y });
    const moveTextUp =
      (textRender.length * lineHeight) / 2 - lineHeight / 2;

    for (let i = 0; i < textRender.length; i++) {
      const row = textRender[i];
      context.fillText(row.line, row.x, row.y - moveTextUp);
    }
  }
}

