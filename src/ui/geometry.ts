/**
 * 把棋盘拓扑映射到平面上。
 *
 * 每一方的坐标系可以看作普通象棋的半张棋盘：以中心为原点，x = f − 4，y = r − 7（底线在 y = −7）。
 * 这是一个下半平面（180°）；三方要分 360°，所以把角度压缩为 2/3（每方 120°），半径保持不变。
 * 这样一来，前沿线变成从中心射出的直线，过中心的三条中路在画面上仍是直线，
 * 其余的线变成平滑的弧线。
 */
import { CENTER_FILE, DEPTH, type Board } from '../engine/board';

export interface Point {
  x: number;
  y: number;
}

/** 各方「中心 → 底线」方向在画面上的角度（数学坐标，逆时针为正）：魏在上，吴在右下，蜀在左下 */
const BACK_ANGLE = [90, -30, 210];
const ANGLE_SCALE = 2 / 3;
const DEG = Math.PI / 180;

/** 半径方向的轻微放大：让中央的荆州显得开阔一些 */
function radial(rho: number): number {
  return 8.4 * Math.pow(rho / 8.06, 0.85);
}

/** 某方坐标系中的（可为小数的）坐标 → 世界坐标（y 向上） */
export function localToWorld(frame: number, f: number, r: number): Point {
  const x = f - CENTER_FILE;
  const y = r - DEPTH;
  const rho = Math.hypot(x, y);
  if (rho < 1e-9) return { x: 0, y: 0 };
  let theta = Math.atan2(y, x);
  if (theta > 0) theta -= 2 * Math.PI; // y = +0 且 x < 0 时取 −π
  const angle = theta * ANGLE_SCALE + (BACK_ANGLE[frame] + 60) * DEG;
  const rr = radial(rho);
  return { x: rr * Math.cos(angle), y: rr * Math.sin(angle) };
}

export class Layout {
  /** 每个节点在屏幕上的坐标（y 向下） */
  readonly pos: Point[];
  private readonly cos: number;
  private readonly sin: number;

  /** rotation：整个棋盘逆时针旋转的角度（度） */
  constructor(
    private readonly board: Board,
    rotation = 0,
  ) {
    this.cos = Math.cos(rotation * DEG);
    this.sin = Math.sin(rotation * DEG);
    this.pos = board.nodes.map((n) => {
      const a = n.aliases[0];
      return this.project(a.frame, a.f, a.r);
    });
  }

  project(frame: number, f: number, r: number): Point {
    const w = localToWorld(frame, f, r);
    const x = w.x * this.cos - w.y * this.sin;
    const y = w.x * this.sin + w.y * this.cos;
    return { x, y: -y };
  }

  /** 两个相邻节点之间的连线（在共同坐标系里插值，得到平滑曲线） */
  segment(a: number, b: number, steps = 6): Point[] {
    const na = this.board.nodes[a];
    const nb = this.board.nodes[b];
    for (const aa of na.aliases) {
      const ab = nb.aliases.find((x) => x.frame === aa.frame);
      if (!ab) continue;
      const pts: Point[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        pts.push(this.project(aa.frame, aa.f + (ab.f - aa.f) * t, aa.r + (ab.r - aa.r) * t));
      }
      return pts;
    }
    return [this.pos[a], this.pos[b]];
  }

  /** 某方坐标系中一条折线（按坐标插值）的屏幕点列 */
  polyline(frame: number, coords: [number, number][], steps = 6): Point[] {
    const pts: Point[] = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const [f0, r0] = coords[i];
      const [f1, r1] = coords[i + 1];
      for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
        const t = k / steps;
        pts.push(this.project(frame, f0 + (f1 - f0) * t, r0 + (r1 - r0) * t));
      }
    }
    return pts;
  }

  /** 格子的轮廓 */
  face(face: number[]): Point[] {
    const pts: Point[] = [];
    for (let k = 0; k < 4; k++) pts.push(...this.segment(face[k], face[(k + 1) % 4]).slice(0, -1));
    return pts;
  }
}

/** 视角：把某一方转到画面下方需要旋转的角度 */
export function rotationFor(frame: number | null): number {
  if (frame === null) return 0;
  return 270 - BACK_ANGLE[frame];
}

export function pathData(points: Point[], close = false): string {
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join('');
  return close ? `${d}Z` : d;
}
