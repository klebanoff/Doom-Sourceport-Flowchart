export class Camera {
  offsetX: number;
  offsetY: number;
  scale: number;

  constructor() {
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;
  }

  worldToScreen(x: number, y: number): [number, number] {
    return [(x - this.offsetX) * this.scale, (y - this.offsetY) * this.scale];
  }

  screenToWorld(x: number, y: number): [number, number] {
    return [x / this.scale + this.offsetX, y / this.scale + this.offsetY];
  }
}

