import { geneticLines } from "./constants";

export const LANE_ORDER: string[] = [
  geneticLines.heretic,
  geneticLines.hexen,
  geneticLines.strife,
  geneticLines.doomsday,
  geneticLines.vavoom,
  geneticLines.chocolate,
  geneticLines.zdoom,
  geneticLines.boom,
  geneticLines.sourceport,
  "other",
  geneticLines.console,
  geneticLines.official,
];

export function getLaneDisplayName(key: string): string {
  switch (key) {
    case geneticLines.official:
      return "Official";
    case geneticLines.heretic:
      return "Heretic";
    case geneticLines.hexen:
      return "Hexen";
    case geneticLines.strife:
      return "Strife";
    case geneticLines.console:
      return "Console";
    case geneticLines.boom:
      return "Boom";
    case geneticLines.zdoom:
      return "ZDoom";
    case geneticLines.sourceport:
      return "Sourceport";
    case geneticLines.chocolate:
      return "Chocolate";
    case geneticLines.eternity:
      return "Eternity";
    case geneticLines.doomsday:
      return "Doomsday";
    case geneticLines.vavoom:
      return "Vavoom";
    default:
      return "Other";
  }
}

export function getLaneColors(
  key: string
): { background: string; stroke: string } {
  switch (key) {
    case geneticLines.official:
      return { background: "#FFF9E6", stroke: "#D79B00" };
    case geneticLines.heretic:
      return { background: "#E6F5FF", stroke: "#0066CC" };
    case geneticLines.hexen:
      return { background: "#EDE6FF", stroke: "#5E35B1" };
    case geneticLines.strife:
      return { background: "#FFE6F5", stroke: "#AD1457" };
    case geneticLines.console:
      return { background: "#E6FFF4", stroke: "#00796B" };
    case geneticLines.boom:
      return { background: "#FFE6F5", stroke: "#AD1457" };
    case geneticLines.zdoom:
      return { background: "#F0E6FF", stroke: "#512DA8" };
    case geneticLines.chocolate:
      return { background: "#F3E5AB", stroke: "#8D6E63" };
    case geneticLines.sourceport:
      return { background: "#E6F5FF", stroke: "#0066CC" };
    case geneticLines.eternity:
      return { background: "#E0F7FA", stroke: "#00838F" };
    case geneticLines.doomsday:
      return { background: "#ECEFF1", stroke: "#455A64" };
    case geneticLines.vavoom:
      return { background: "#FCE4EC", stroke: "#C2185B" };
    default:
      return { background: "#F5F5F5", stroke: "#9E9E9E" };
  }
}

