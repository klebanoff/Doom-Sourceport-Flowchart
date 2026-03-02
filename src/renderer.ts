import {
  NODE_WIDTH,
  NODE_HEIGHT,
  PADDING_BETWEEN_NODES_X,
  geneticLines,
  VIEWPORT_PADDING,
  MIN_YEAR_LABEL_FONT_SIZE,
} from "./constants";
import { getLaneDisplayName, getLaneColors } from "./laneConfig";
import type {
  CameraLike,
  LayoutResult,
  LayoutNode,
  DevelopmentStatus,
} from "./types";
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

interface RenderContext {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  camera: CameraLike;
  render: LayoutResult;
  hoveredNodeId: string | null;
  scale: number;
  worldToScreen(x: number, y: number): [number, number];
  contentLeft: number;
  contentTop: number;
  contentWidth: number;
  contentHeight: number;
  relatedNodeIds: Set<string>;
  snappedScreenPositions: Map<string, { x: number; y: number }>;
}

interface LaneExtents {
  laneHeight: number;
  minLaneTop: number;
  maxLaneBottom: number;
  axisY: number;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: CameraLike,
  render: LayoutResult,
  hoveredNodeId: string | null
): void {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const context = createRenderContext(ctx, canvas, camera, render, hoveredNodeId);

  clearCanvas(context);
  beginContentClip(context);

  drawLaneBackgrounds(context);
  drawTimelineAxis(context);
  renderLinks(context);
  renderNodes(context);

  endContentClip(context);
  drawContentBorder(context);
  drawLegend(context);
}

function createRenderContext(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: CameraLike,
  render: LayoutResult,
  hoveredNodeId: string | null
): RenderContext {
  const scale = camera.scale;
  const worldToScreen = (x: number, y: number) => camera.worldToScreen(x, y);

  const contentLeft = VIEWPORT_PADDING;
  const contentTop = VIEWPORT_PADDING;
  const contentWidth = canvas.clientWidth - 2 * VIEWPORT_PADDING;
  const contentHeight = canvas.clientHeight - 2 * VIEWPORT_PADDING;

  const relatedNodeIds = computeRelatedNodeIds(render, hoveredNodeId);
  const snappedScreenPositions = computeSnappedScreenPositions(
    render,
    camera,
    canvas,
    relatedNodeIds,
    hoveredNodeId
  );

  return {
    ctx,
    canvas,
    camera,
    render,
    hoveredNodeId,
    scale,
    worldToScreen,
    contentLeft,
    contentTop,
    contentWidth,
    contentHeight,
    relatedNodeIds,
    snappedScreenPositions,
  };
}

function clearCanvas(context: RenderContext): void {
  const { ctx, canvas } = context;
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
}

function beginContentClip(context: RenderContext): void {
  const { ctx, contentLeft, contentTop, contentWidth, contentHeight } = context;
  ctx.save();
  ctx.beginPath();
  ctx.rect(contentLeft, contentTop, contentWidth, contentHeight);
  ctx.clip();
}

function endContentClip(context: RenderContext): void {
  context.ctx.restore();
}

function drawContentBorder(context: RenderContext): void {
  const { ctx, contentLeft, contentTop, contentWidth, contentHeight } = context;
  ctx.save();
  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 1;
  ctx.strokeRect(contentLeft, contentTop, contentWidth, contentHeight);
  ctx.restore();
}

function drawLegend(context: RenderContext): void {
  const { ctx } = context;

  const legendEntries: string[] = [
    geneticLines.official,
    geneticLines.heretic,
    geneticLines.hexen,
    geneticLines.strife,
    geneticLines.console,
    geneticLines.boom,
    geneticLines.zdoom,
    geneticLines.chocolate,
    geneticLines.doomsday,
    geneticLines.vavoom,
    "other",
  ];

  const legendX = VIEWPORT_PADDING + 16;
  const legendY = VIEWPORT_PADDING + 40;
  const boxSize = 12;
  const lineHeight = 18;
  const paddingX = 8;

  ctx.save();
  ctx.font = "12px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  ctx.fillStyle = darkenColor("#000000", 0.7);
  ctx.fillText("Genetic line", legendX, legendY - 14);

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

  const devStatusLegendTop = legendY + legendEntries.length * lineHeight + 12;
  const devStatusEntries: { status: DevelopmentStatus; label: string }[] = [
    { status: "discontinued", label: "Discontinued" },
    { status: "active", label: "Active" },
    { status: "inactive", label: "Inactive" },
    { status: "merged", label: "Merged" },
  ];
  ctx.fillStyle = darkenColor("#000000", 0.7);
  ctx.fillText("Development status", legendX, devStatusLegendTop - 12);
  for (let i = 0; i < devStatusEntries.length; i++) {
    const { status, label } = devStatusEntries[i];
    const y = devStatusLegendTop + 4 + i * lineHeight;
    const boxY = y - boxSize / 2;
    drawDevelopmentStatusIconInBox(
      ctx,
      status,
      legendX,
      boxY,
      boxSize,
      1
    );
    ctx.fillStyle = darkenColor("#000000", 0.7);
    ctx.fillText(label, legendX + boxSize + paddingX, y);
  }

  ctx.restore();
}

function computeRelatedNodeIds(
  render: LayoutResult,
  hoveredId: string | null
): Set<string> {
  const relatedNodeIds = new Set<string>();

  if (!hoveredId) {
    return relatedNodeIds;
  }

  for (let i = 0; i < render.links.length; i++) {
    const link = render.links[i];
    if (link.source === hoveredId) {
      relatedNodeIds.add(link.target);
    } else if (link.target === hoveredId) {
      relatedNodeIds.add(link.source);
    }
  }

  relatedNodeIds.add(hoveredId);

  return relatedNodeIds;
}

function computeSnappedScreenPositions(
  render: LayoutResult,
  camera: CameraLike,
  canvas: HTMLCanvasElement,
  relatedNodeIds: Set<string>,
  hoveredId: string | null
): Map<string, { x: number; y: number }> {
  const snappedScreenPositions = new Map<string, { x: number; y: number }>();

  if (!hoveredId) {
    return snappedScreenPositions;
  }

  const hoveredNode = render.nodes.find((n) => n.id === hoveredId);
  if (!hoveredNode) {
    return snappedScreenPositions;
  }

  const [hoveredScreenX, hoveredScreenY] = camera.worldToScreen(
    hoveredNode.X,
    hoveredNode.Y
  );

  const screenWidth = canvas.clientWidth;
  const screenHeight = canvas.clientHeight;
  const edgeMargin = VIEWPORT_PADDING;
  const scale = camera.scale;
  const halfNodeWidthScreen = (NODE_WIDTH * scale) / 2;
  const halfNodeHeightScreen = (NODE_HEIGHT * scale) / 2;
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

    const [nodeScreenX, nodeScreenY] = camera.worldToScreen(node.X, node.Y);

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

  return snappedScreenPositions;
}

function computeLaneExtents(render: LayoutResult): LaneExtents {
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

  return {
    laneHeight,
    minLaneTop,
    maxLaneBottom,
    axisY,
  };
}

function computeFrameBounds(
  context: RenderContext,
  laneExtents: LaneExtents,
  framePadding: number
): {
  frameLeft: number;
  frameRight: number;
  frameTop: number;
  frameBottom: number;
  topLaneY: number;
  bottomLaneY: number;
  axisY: number;
} {
  const {
    render,
    worldToScreen,
    contentLeft,
    contentTop,
    contentWidth,
    contentHeight,
  } = context;
  const { minLaneTop, maxLaneBottom, axisY } = laneExtents;

  const firstMarker = render.timelineMarkers[0];
  const lastMarker = render.timelineMarkers[render.timelineMarkers.length - 1];
  const [firstMarkerX] = worldToScreen(firstMarker.x, axisY);
  const [lastMarkerX] = worldToScreen(lastMarker.x, axisY);

  let frameLeft = Math.min(firstMarkerX, lastMarkerX);
  let frameRight = Math.max(firstMarkerX, lastMarkerX);

  const [, topLaneY] = worldToScreen(0, minLaneTop);
  const [, bottomLaneY] = worldToScreen(0, maxLaneBottom);

  frameLeft -= framePadding;
  frameRight += framePadding;
  let frameTop = topLaneY - framePadding;
  let frameBottom = bottomLaneY + framePadding;

  frameLeft = Math.max(contentLeft, frameLeft);
  frameRight = Math.min(contentLeft + contentWidth, frameRight);
  frameTop = Math.max(contentTop, frameTop);
  frameBottom = Math.min(contentTop + contentHeight, frameBottom);

  return {
    frameLeft,
    frameRight,
    frameTop,
    frameBottom,
    topLaneY,
    bottomLaneY,
    axisY,
  };
}

function drawLaneBackgrounds(context: RenderContext): void {
  const {
    ctx,
    render,
    worldToScreen,
    scale,
  } = context;

  if (!render.lanes || render.lanes.length === 0) {
    return;
  }

  if (!render.timelineMarkers || render.timelineMarkers.length === 0) {
    return;
  }

  const nodeXs = render.nodes.map((n) => n.X);
  const worldMinX =
    Math.min.apply(null, nodeXs) - (NODE_WIDTH + PADDING_BETWEEN_NODES_X);
  const worldMaxX =
    Math.max.apply(null, nodeXs) + (NODE_WIDTH + PADDING_BETWEEN_NODES_X);

  const laneExtents = computeLaneExtents(render);
  const framePadding = 16 * scale;

  const { frameLeft, frameRight, frameTop, frameBottom } = computeFrameBounds(
    context,
    laneExtents,
    framePadding
  );

  for (let i = 0; i < render.lanes.length; i++) {
    const lane = render.lanes[i];
    const colors = getLaneColors(lane.key);

    const [, rawY1] = worldToScreen(worldMinX, lane.top);
    const [, rawY2] = worldToScreen(worldMaxX, lane.bottom);
    let y1 = Math.max(frameTop, rawY1);
    let y2 = Math.min(frameBottom, rawY2);

    if (y2 <= y1) {
      continue;
    }

    const height = y2 - y1;

    const x1 = frameLeft;
    const width = frameRight - frameLeft;

    ctx.fillStyle = colors.background;
    ctx.fillRect(x1, y1, width, height);

    const [labelX, labelY] = worldToScreen(worldMinX + 20, lane.yCenter);
    const laneLabel = getLaneDisplayName(lane.key);
    const labelColor = darkenColor(colors.stroke, 0.6);

    ctx.save();
    ctx.fillStyle = labelColor;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = `${144 * scale}px sans-serif`;
    ctx.fillText(laneLabel, labelX, labelY);
    ctx.restore();
  }
}

function drawTimelineAxis(context: RenderContext): void {
  const {
    ctx,
    render,
    worldToScreen,
    scale,
  } = context;

  if (
    !render.timelineMarkers ||
    render.timelineMarkers.length === 0 ||
    !render.lanes ||
    render.lanes.length === 0
  ) {
    return;
  }

  const laneExtents = computeLaneExtents(render);
  const framePadding = 80 * scale;

  const { frameLeft, frameRight, frameTop, frameBottom, axisY } =
    computeFrameBounds(context, laneExtents, framePadding);

  ctx.save();
  ctx.strokeStyle = "#888888";
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  const yearLabelFontSize = Math.max(MIN_YEAR_LABEL_FONT_SIZE, 20 * scale);
  const yearLabelScreenY = frameTop - 4;

  ctx.font = `${yearLabelFontSize}px sans-serif`;

  for (let i = 0; i < render.timelineMarkers.length; i++) {
    const marker = render.timelineMarkers[i];
    const [markerX] = worldToScreen(marker.x, axisY);

    ctx.beginPath();
    ctx.moveTo(markerX, frameTop);
    ctx.lineTo(markerX, frameBottom);
    ctx.stroke();

    ctx.fillText(String(marker.year), markerX, yearLabelScreenY);
  }

  ctx.beginPath();
  ctx.lineWidth = 4;
  ctx.rect(
    frameLeft,
    frameTop,
    frameRight - frameLeft,
    frameBottom - frameTop
  );
  ctx.stroke();

  ctx.restore();
}

function renderLinks(context: RenderContext): void {
  const { render } = context;

  for (let i = 0; i < render.links.length; i++) {
    renderSingleLink(context, render.links[i]);
  }
}

function renderSingleLink(
  context: RenderContext,
  line: LayoutResult["links"][number]
): void {
  const {
    ctx,
    render,
    worldToScreen,
    snappedScreenPositions,
    hoveredNodeId,
    scale,
  } = context;

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

  const hasHover = !!hoveredNodeId;
  const isHoveredLink =
    !!hoveredNodeId &&
    (line.source === hoveredNodeId || line.target === hoveredNodeId);

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

  ctx.setLineDash(line.isPrimary ? [] : [10 * scale, 6 * scale]);

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

function drawDevelopmentStatusIconInBox(
  ctx: CanvasRenderingContext2D,
  status: DevelopmentStatus,
  left: number,
  top: number,
  size: number,
  lineScale: number
): void {
  if (size < 4) {
    return;
  }
  const cx = left + size / 2;
  const cy = top + size / 2;
  const r = Math.max(0.5, size / 2 - 1);
  const inset = Math.max(1, Math.min(2, size / 4));

  ctx.save();

  switch (status) {
    case "discontinued": {
      ctx.strokeStyle = "#c62828";
      ctx.lineWidth = Math.max(1, 2 * lineScale);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(left, top);
      ctx.lineTo(left + size, top + size);
      ctx.moveTo(left + size, top);
      ctx.lineTo(left, top + size);
      ctx.stroke();
      break;
    }
    case "active": {
      ctx.fillStyle = "#2e7d32";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "inactive": {
      ctx.strokeStyle = "#757575";
      ctx.lineWidth = Math.max(1, 1.5 * lineScale);
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0.5, r - 1), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "merged": {
      ctx.strokeStyle = "#455a64";
      ctx.lineWidth = Math.max(1, 1.5 * lineScale);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(cx, top + inset);
      ctx.lineTo(cx, cy + inset);
      ctx.moveTo(left + inset, top + size - inset);
      ctx.lineTo(cx, cy + inset);
      ctx.moveTo(left + size - inset, top + size - inset);
      ctx.lineTo(cx, cy + inset);
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

function renderNodes(context: RenderContext): void {
  const { render } = context;

  for (let i = 0; i < render.nodes.length; i++) {
    renderSingleNode(context, render.nodes[i]);
  }
}

function renderSingleNode(context: RenderContext, node: LayoutNode): void {
  const {
    ctx,
    worldToScreen,
    snappedScreenPositions,
    hoveredNodeId,
    relatedNodeIds,
    scale,
  } = context;

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

  const hasHover = !!hoveredNodeId;
  const isHovered = hoveredNodeId === node.id;
  const isRelated = relatedNodeIds.has(node.id) && !isHovered;
  const isDimmed = hasHover && !isHovered && !isRelated;

  const width = NODE_WIDTH * scale;
  const height = NODE_HEIGHT * scale;
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

  if (node.developmentStatus) {
    const iconPadding = 5 * scale;
    const iconSize = 14 * scale;
    const iconLeft = x + width - iconPadding - iconSize;
    const iconTop = y + iconPadding;
    ctx.save();
    ctx.globalAlpha = isDimmed ? 0.3 : 1;
    drawDevelopmentStatusIconInBox(
      ctx,
      node.developmentStatus,
      iconLeft,
      iconTop,
      iconSize,
      scale
    );
    ctx.restore();
  }

  ctx.save();
  ctx.textBaseline = "middle";
  const fontSize = 30 * scale;
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.globalAlpha = isDimmed ? 0.3 : 1;
  wrapText(ctx, node.name, centerX, centerY, NODE_WIDTH * scale, fontSize);
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
  const moveTextUp = (textRender.length * lineHeight) / 2 - lineHeight / 2;

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
