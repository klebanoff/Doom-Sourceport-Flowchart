export type DoomNodeType = "mainline" | "official" | "unrelated" | "console";

export type DevelopmentStatus =
  | "discontinued"
  | "active"
  | "inactive"
  | "merged";

export type GeneticLine =
  | "official"
  | "heretic"
  | "hexen"
  | "console"
  | "sourceport"
  | "boom"
  | "zdoom"
  | "chocolate"
  | "eternity"
  | "dosdoom"
  | "doomsday"
  | "vavoom"
  | "other";

export interface DoomNode {
  id: string;
  name: string;
  type: DoomNodeType;
  releaseDate: string;
  geneticLine: GeneticLine;
  developmentStatus?: DevelopmentStatus;
  description?: string;
  children?: string[];
  parents?: string[];
}

export interface LinkHitArea {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TooltipBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  nodeScreenX: number;
  nodeScreenY: number;
  isAboveNode: boolean;
}

export type DoomData = DoomNode[];

export interface LayoutNode extends DoomNode {
  _dateValue: number;
  _laneKey: string;
  _rowIndex: number;
  X: number;
  Y: number;
}

export interface LayoutLink {
  source: string;
  sourceX: number;
  sourceY: number;
  target: string;
  targetX: number;
  targetY: number;
  isPrimary: boolean;
  /** World-space cubic Bézier control points. When present the renderer uses
   *  these instead of computing an S-curve from the endpoints in screen space. */
  c1x?: number;
  c1y?: number;
  c2x?: number;
  c2y?: number;
}

export interface LayoutLane {
  key: string;
  index: number;
  rowCount: number;
  top: number;
  bottom: number;
  yCenter: number;
}

export interface TimelineMarker {
  year: number;
  x: number;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  links: LayoutLink[];
  lanes: LayoutLane[];
  timelineMarkers: TimelineMarker[];
}

export interface CameraLike {
  offsetX: number;
  offsetY: number;
  scale: number;
  worldToScreen(x: number, y: number): [number, number];
  screenToWorld(x: number, y: number): [number, number];
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
