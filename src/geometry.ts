export interface SCurveControlPoints {
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
}

export function getSCurveControlPoints(
  sx: number,
  sy: number,
  tx: number,
  ty: number
): SCurveControlPoints {
  const midX = (sx + tx) / 2;
  return {
    c1x: midX,
    c1y: sy,
    c2x: midX,
    c2y: ty,
  };
}

export function sampleSCurve(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  t: number
): [number, number] {
  const { c1x, c1y, c2x, c2y } = getSCurveControlPoints(sx, sy, tx, ty);

  const mt = 1 - t;

  const x =
    mt * mt * mt * sx +
    3 * mt * mt * t * c1x +
    3 * mt * t * t * c2x +
    t * t * t * tx;

  const y =
    mt * mt * mt * sy +
    3 * mt * mt * t * c1y +
    3 * mt * t * t * c2y +
    t * t * t * ty;

  return [x, y];
}

