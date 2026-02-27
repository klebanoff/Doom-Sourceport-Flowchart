import type { DoomData } from "./types";

export const simpleCrossLaneSample: DoomData = [
  {
    id: "a",
    name: "A",
    type: "mainline",
    releaseDate: "1993-01-01",
    geneticLine: "official",
    children: ["b"],
  },
  {
    id: "b",
    name: "B",
    type: "mainline",
    releaseDate: "1994-01-01",
    geneticLine: "boom",
    parents: ["a"],
  },
  {
    id: "c",
    name: "C",
    type: "mainline",
    releaseDate: "1993-06-01",
    geneticLine: "zdoom",
    children: [],
    parents: [],
  },
];

