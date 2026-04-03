/** 3D draw buffer for Alchemy scenes. Collects points and line segments. */

const TAU = Math.PI * 2;

const MAX_POINTS = 4000;
const MAX_SEGMENTS = 8000;

export class SceneBuffer {
  /** Point data: [x, y, z, r, g, b, a, size] per point */
  readonly pts = new Float32Array(MAX_POINTS * 8);
  ptN = 0;

  /** Line segment data: pairs of [x,y,z,r,g,b,a] vertices */
  readonly segs = new Float32Array(MAX_SEGMENTS * 14);
  segN = 0;

  // polyline tracking
  private _hp = false;
  private _px = 0;
  private _py = 0;
  private _pz = 0;
  private _pr = 0;
  private _pg = 0;
  private _pb = 0;
  private _pa = 0;

  clear() {
    this.ptN = 0;
    this.segN = 0;
    this._hp = false;
  }

  /** Add a 3D point. x,y = offset from center (pixels), z = depth (0=near). */
  point(
    x: number,
    y: number,
    z: number,
    r: number,
    g: number,
    b: number,
    a: number,
    size: number,
  ) {
    const i = this.ptN * 8;
    if (i + 8 > this.pts.length) return;
    const d = this.pts;
    d[i] = x;
    d[i + 1] = y;
    d[i + 2] = z;
    d[i + 3] = r;
    d[i + 4] = g;
    d[i + 5] = b;
    d[i + 6] = a;
    d[i + 7] = size;
    this.ptN++;
  }

  /** Start a new polyline */
  lineStart() {
    this._hp = false;
  }

  /** Add vertex to current polyline. Pairs become line segments. */
  lineTo(
    x: number,
    y: number,
    z: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ) {
    if (this._hp) {
      const i = this.segN * 14;
      if (i + 14 > this.segs.length) return;
      const d = this.segs;
      d[i] = this._px;
      d[i + 1] = this._py;
      d[i + 2] = this._pz;
      d[i + 3] = this._pr;
      d[i + 4] = this._pg;
      d[i + 5] = this._pb;
      d[i + 6] = this._pa;
      d[i + 7] = x;
      d[i + 8] = y;
      d[i + 9] = z;
      d[i + 10] = r;
      d[i + 11] = g;
      d[i + 12] = b;
      d[i + 13] = a;
      this.segN++;
    }
    this._hp = true;
    this._px = x;
    this._py = y;
    this._pz = z;
    this._pr = r;
    this._pg = g;
    this._pb = b;
    this._pa = a;
  }

  /** Draw a full circle as line segments */
  circle(
    cx: number,
    cy: number,
    z: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    a: number,
    n = 32,
  ) {
    this.lineStart();
    for (let i = 0; i <= n; i++) {
      const angle = (i / n) * TAU;
      this.lineTo(
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius,
        z,
        r,
        g,
        b,
        a,
      );
    }
  }

  /** Draw a partial arc as line segments */
  arc(
    cx: number,
    cy: number,
    z: number,
    radius: number,
    start: number,
    end: number,
    r: number,
    g: number,
    b: number,
    a: number,
    n = 16,
  ) {
    this.lineStart();
    for (let i = 0; i <= n; i++) {
      const angle = start + (i / n) * (end - start);
      this.lineTo(
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius,
        z,
        r,
        g,
        b,
        a,
      );
    }
  }
}

/** HSL → RGB. h in degrees, s and l in [0,100]. Returns [r, g, b] in [0,1]. */
export function hsl(h: number, s: number, l: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = s / 100;
  const ll = l / 100;
  if (ss === 0) return [ll, ll, ll];
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const f = (t: number) => {
    const tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)];
}
