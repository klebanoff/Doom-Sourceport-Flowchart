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
  render: LayoutResult,
  hoveredNodeId: string | null
): void {
  const nodeSizeX = NODE_WIDTH;
  const nodeSizeY = NODE_HEIGHT;
  const paddingBetweenNodesX = PADDING_BETWEEN_NODES_X;
  const scale = camera.scale;
  const worldToScreen = (x: number, y: number) => camera.worldToScreen(x, y);

  const hoveredId = hoveredNodeId;
  const relatedNodeIds = new Set<string>();

  if (hoveredId) {
    for (let i = 0; i < render.links.length; i++) {
      const link = render.links[i];
      if (link.source === hoveredId) {
        relatedNodeIds.add(link.target);
      } else if (link.target === hoveredId) {
        relatedNodeIds.add(link.source);
      }
    }
    relatedNodeIds.add(hoveredId);
  }

  const snappedScreenPositions = new Map<string, { x: number; y: number }>();

  if (hoveredId) {
    const hoveredNode = render.nodes.find((n) => n.id === hoveredId);
    if (hoveredNode) {
      const [hoveredScreenX, hoveredScreenY] = worldToScreen(
        hoveredNode.X,
        hoveredNode.Y
      );
      const screenWidth = canvas.width;
      const screenHeight = canvas.height;
      const edgeMargin = 20;
      const halfNodeWidthScreen = (nodeSizeX * scale) / 2;
      const halfNodeHeightScreen = (nodeSizeY * scale) / 2;
      const minX = edgeMargin + halfNodeWidthScreen;
      const maxX = screenWidth - edgeMargin - halfNodeWidthScreen;
      const minY = edgeMargin + halfNodeHeightScreen;
      const maxY = screenHeight - edgeMargin - halfNodeHeightScreen;

      for (const nodeId of relatedNodeIds) {
        if (nodeId === hoveredId) {
          continue;
        }

        const node = render.nodes.find((n) => n.id === nodeId);
        if (!node) {
          continue;
        }

        const [nodeScreenX, nodeScreenY] = worldToScreen(node.X, node.Y);

        if (
          nodeScreenX >= 0 &&
          nodeScreenX <= screenWidth &&
          nodeScreenY >= 0 &&
          nodeScreenY <= screenHeight
        ) {
          continue;
        }

        const intersection = intersectSegmentWithRect(
          hoveredScreenX,
          hoveredScreenY,
          nodeScreenX,
          nodeScreenY,
          minX,
          minY,
          maxX,
          maxY
        );

        if (intersection) {
          snappedScreenPositions.set(node.id, intersection);
        }
      }
    }
  }

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
    ctx.font = `${20 * scale}px sans-serif`;

    const yearLabelScreenY = 24;

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
      geneticLines.strife,
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

    const snappedSource = snappedScreenPositions.get(line.source);
    if (snappedSource) {
      startX = snappedSource.x;
      startY = snappedSource.y;
    }

    const snappedTarget = snappedScreenPositions.get(line.target);
    if (snappedTarget) {
      endX = snappedTarget.x;
      endY = snappedTarget.y;
    }

    const parentNode = render.nodes.find((n) => n.id === line.source);
    const laneKey =
      parentNode && parentNode._laneKey ? parentNode._laneKey : "other";
    const colors = getLaneColors(laneKey);

    const hasHover = !!hoveredId;
    const isHoveredLink =
      !!hoveredId &&
      (line.source === hoveredId || line.target === hoveredId);

    ctx.save();

    if (hasHover && !isHoveredLink) {
      ctx.globalAlpha = 0.3;
    }

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

    let lineWidth = line.isPrimary ? 3 * scale : 1.5 * scale;
    if (isHoveredLink) {
      lineWidth = line.isPrimary ? 4 * scale : 3 * scale;
    }

    const strokeColor = isHoveredLink
      ? darkenColor(colors.stroke, 0.7)
      : colors.stroke;

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
    ctx.restore();
  }

  function renderNode(node: LayoutNode): void {
    let centerX = node.X;
    let centerY = node.Y;
    [centerX, centerY] = worldToScreen(centerX, centerY);

    const snapped = snappedScreenPositions.get(node.id);
    if (snapped) {
      centerX = snapped.x;
      centerY = snapped.y;
    }

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

    const hasHover = !!hoveredId;
    const isHovered = hoveredId === node.id;
    const isRelated = relatedNodeIds.has(node.id) && !isHovered;
    const isDimmed = hasHover && !isHovered && !isRelated;

    const width = nodeSizeX * scale;
    const height = nodeSizeY * scale;
    const radius = 10 * scale;
    const x = centerX - width / 2;
    const y = centerY - height / 2;

    ctx.save();
    ctx.setLineDash(dash);
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = (isHovered ? 3 : 2) * scale;
    ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
    ctx.shadowBlur = isHovered ? 20 * scale : isRelated ? 14 * scale : 10 * scale;
    ctx.shadowOffsetX = 2 * scale;
    ctx.shadowOffsetY = 2 * scale;
    ctx.globalAlpha = isDimmed ? 0.3 : 1;

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
    ctx.globalAlpha = isDimmed ? 0.3 : 1;
    wrapText(ctx, node.name, centerX, centerY, nodeSizeX * scale, fontSize);
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

  function intersectSegmentWithRect(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
  ): { x: number; y: number } | null {
    const dx = bx - ax;
    const dy = by - ay;
    let closestT = Number.POSITIVE_INFINITY;
    let hitX = 0;
    let hitY = 0;

    const tryIntersect = (
      t: number,
      xConstraint: (x: number) => boolean,
      yConstraint: (y: number) => boolean
    ) => {
      if (t < 0 || t > 1 || t >= closestT) {
        return;
      }
      const x = ax + dx * t;
      const y = ay + dy * t;
      if (xConstraint(x) && yConstraint(y)) {
        closestT = t;
        hitX = x;
        hitY = y;
      }
    };

    if (dx !== 0) {
      const tLeft = (minX - ax) / dx;
      tryIntersect(
        tLeft,
        (x) => x >= minX - 1e-3 && x <= minX + 1e-3,
        (y) => y >= minY && y <= maxY
      );

      const tRight = (maxX - ax) / dx;
      tryIntersect(
        tRight,
        (x) => x >= maxX - 1e-3 && x <= maxX + 1e-3,
        (y) => y >= minY && y <= maxY
      );
    }

    if (dy !== 0) {
      const tTop = (minY - ay) / dy;
      tryIntersect(
        tTop,
        (x) => x >= minX && x <= maxX,
        (y) => y >= minY - 1e-3 && y <= minY + 1e-3
      );

      const tBottom = (maxY - ay) / dy;
      tryIntersect(
        tBottom,
        (x) => x >= minX && x <= maxX,
        (y) => y >= maxY - 1e-3 && y <= maxY + 1e-3
      );
    }

    if (!Number.isFinite(closestT)) {
      return null;
    }

    return { x: hitX, y: hitY };
  }
}
