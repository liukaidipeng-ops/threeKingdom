/**
 * 三人棋盘的拓扑结构（与绘制无关）。
 *
 * 每一方有自己的坐标系 frame：f = 0..8 为路（从该方视角的左手边数起），
 * r = 0..7 为线（0 为底线，4 为河岸，7 为与邻国共享的「前沿线」）。
 *
 *   - r 0..4：本土（含九宫），河在 4 与 5 之间
 *   - r 5..6：中立地带
 *   - r = 7 ：前沿线。左半边 (f 0..4) 与左邻的右半边重合，右半边与右邻的左半边重合，
 *             三条前沿线交汇于棋盘中心。
 *
 * 这和三人国际象棋（Yalta）的棋盘是同一种「折线网格」：
 * 往前直走时，左半边的路通向左邻，右半边的路通向右邻，中路穿过中心通向另外两家的交界。
 * 除中心点（6 条射线）外，每个点都和普通象棋一样只有上下左右四个方向，
 * 所以车马炮兵的走法可以原样沿用。
 */
import { CITY_FRAME, CITY_IDS, CITY_NAME, FACTION_NAME, FRAME_FACTION } from './factions';
import type { CityId, Faction, Region, Terrain } from './types';

export const FILES = 9;
export const CENTER_FILE = 4;
/** 前沿线的线号 */
export const DEPTH = 7;
/** 本土最后一条线（河岸） */
export const LAST_HOME_RANK = 4;
/** 城池所在的线 */
export const CITY_RANK = 6;

export const leftOf = (frame: number): number => (frame + 1) % 3;
export const rightOf = (frame: number): number => (frame + 2) % 3;

export interface Alias {
  frame: number;
  f: number;
  r: number;
}

export interface BoardNode {
  id: number;
  /** 该点在各方坐标系中的坐标（前沿线上的点有两个，中心点有三个） */
  aliases: Alias[];
  terrain: Terrain;
  region: Region;
  /** 本土归属的 frame，非本土为 null */
  home: number | null;
  city: CityId | null;
  center: boolean;
  label: string;
}

export interface Line {
  id: number;
  nodes: number[];
}

export interface LineRef {
  line: number;
  index: number;
}

export interface Board {
  nodes: BoardNode[];
  /** 「直线」：车、炮沿直线滑行，马腿与兵的前进也以直线为准 */
  lines: Line[];
  /** 网格中的四边形格子（按顺序的 4 个顶点），用于定义斜线（马、象、士） */
  faces: number[][];
  nodeLines: LineRef[][];
  neighbors: number[][];
  center: number;
  cityNode: Record<CityId, number>;
  idAt(frame: number, f: number, r: number): number;
  tryIdAt(frame: number, f: number, r: number): number | undefined;
  coord(node: number, frame: number): { f: number; r: number } | null;
  /** 包含边 a-b 的格子 */
  facesOnEdge(a: number, b: number): number[][];
}

const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * 边境地形。每两家之间的边境各有一种地形：
 *   魏—吴：长江（水域）  魏—蜀：秦岭（山地）  吴—蜀：三峡（吴侧与江面为水域，蜀侧为山地）
 */
function frontierTerrain(a: Faction, b: Faction, side: Faction | null): Terrain {
  const pair = new Set([a, b]);
  if (pair.has('wei') && pair.has('wu')) return 'water';
  if (pair.has('wei') && pair.has('shu')) return 'mountain';
  return side === 'shu' ? 'mountain' : 'water';
}

export const FRONTIER_NAME: Record<string, string> = {
  'wei-wu': '长江',
  'shu-wei': '秦岭',
  'shu-wu': '三峡',
};

export function frontierKey(a: Faction, b: Faction): string {
  return [a, b].sort().join('-');
}

export function buildBoard(): Board {
  const nodes: BoardNode[] = [];
  const index = new Map<string, number>();
  const key = (p: number, f: number, r: number) => `${p},${f},${r}`;

  const addNode = (aliases: Alias[]): number => {
    const id = nodes.length;
    nodes.push({
      id,
      aliases,
      terrain: 'plain',
      region: 'jingzhou',
      home: null,
      city: null,
      center: false,
      label: '',
    });
    for (const a of aliases) index.set(key(a.frame, a.f, a.r), id);
    return id;
  };

  for (let p = 0; p < 3; p++) {
    for (let r = 0; r < DEPTH; r++) {
      for (let f = 0; f < FILES; f++) addNode([{ frame: p, f, r }]);
    }
  }
  const center = addNode([0, 1, 2].map((p) => ({ frame: p, f: CENTER_FILE, r: DEPTH })));
  nodes[center].center = true;
  for (let p = 0; p < 3; p++) {
    const n = leftOf(p);
    for (let f = 0; f < CENTER_FILE; f++) {
      addNode([
        { frame: p, f, r: DEPTH },
        { frame: n, f: FILES - 1 - f, r: DEPTH },
      ]);
    }
  }

  const tryIdAt = (p: number, f: number, r: number) => index.get(key(p, f, r));
  const idAt = (p: number, f: number, r: number) => {
    const id = tryIdAt(p, f, r);
    if (id === undefined) throw new Error(`no node at frame ${p} (${f}, ${r})`);
    return id;
  };

  // ---- 直线 ----
  const lines: Line[] = [];
  const addLine = (ids: number[]) => lines.push({ id: lines.length, nodes: ids });
  for (let p = 0; p < 3; p++) {
    // 横线（同一线）
    for (let r = 0; r < DEPTH; r++) {
      addLine(Array.from({ length: FILES }, (_, f) => idAt(p, f, r)));
    }
    // 左半边的纵线：穿过前沿线进入左邻的右半边
    const n = leftOf(p);
    for (let f = 0; f < CENTER_FILE; f++) {
      const ids: number[] = [];
      for (let r = 0; r <= DEPTH; r++) ids.push(idAt(p, f, r));
      for (let r = DEPTH - 1; r >= 0; r--) ids.push(idAt(n, FILES - 1 - f, r));
      addLine(ids);
    }
    // 中路：穿过中心，接上另外两家之间的前沿线
    const ids: number[] = [];
    for (let r = 0; r <= DEPTH; r++) ids.push(idAt(p, CENTER_FILE, r));
    for (let f = CENTER_FILE - 1; f >= 0; f--) ids.push(idAt(n, f, DEPTH));
    addLine(ids);
  }

  const nodeLines: LineRef[][] = nodes.map(() => []);
  const neighborSets: Set<number>[] = nodes.map(() => new Set());
  for (const line of lines) {
    line.nodes.forEach((id, i) => {
      nodeLines[id].push({ line: line.id, index: i });
      if (i > 0) neighborSets[id].add(line.nodes[i - 1]);
      if (i < line.nodes.length - 1) neighborSets[id].add(line.nodes[i + 1]);
    });
  }

  // ---- 格子 ----
  const faces: number[][] = [];
  const edgeFaces = new Map<string, number[][]>();
  for (let p = 0; p < 3; p++) {
    for (let r = 0; r < DEPTH; r++) {
      for (let f = 0; f < FILES - 1; f++) {
        const face = [idAt(p, f, r), idAt(p, f + 1, r), idAt(p, f + 1, r + 1), idAt(p, f, r + 1)];
        faces.push(face);
        for (let k = 0; k < 4; k++) {
          const ek = edgeKey(face[k], face[(k + 1) % 4]);
          const list = edgeFaces.get(ek) ?? [];
          list.push(face);
          edgeFaces.set(ek, list);
        }
      }
    }
  }

  // ---- 区域、地形、城池 ----
  const cityNode = {} as Record<CityId, number>;
  for (const city of CITY_IDS) {
    const id = idAt(CITY_FRAME[city], CENTER_FILE, CITY_RANK);
    nodes[id].city = city;
    cityNode[city] = id;
  }

  for (const node of nodes) {
    const homeAlias = node.aliases.find((a) => a.r <= LAST_HOME_RANK);
    if (homeAlias) {
      node.region = 'home';
      node.home = homeAlias.frame;
    } else {
      const edgeAlias = node.aliases.find((a) => a.f <= 1 || a.f >= FILES - 2);
      if (edgeAlias) {
        node.region = 'frontier';
        const p = edgeAlias.frame;
        const other = edgeAlias.f <= 1 ? leftOf(p) : rightOf(p);
        const side = node.aliases.length > 1 ? null : FRAME_FACTION[p];
        node.terrain = frontierTerrain(FRAME_FACTION[p], FRAME_FACTION[other], side);
      } else {
        node.region = 'jingzhou';
      }
    }
    node.label = makeLabel(node);
  }

  return {
    nodes,
    lines,
    faces,
    nodeLines,
    neighbors: neighborSets.map((s) => [...s]),
    center,
    cityNode,
    idAt,
    tryIdAt,
    coord(node, frame) {
      const a = nodes[node].aliases.find((x) => x.frame === frame);
      return a ? { f: a.f, r: a.r } : null;
    },
    facesOnEdge(a, b) {
      return edgeFaces.get(edgeKey(a, b)) ?? [];
    },
  };
}

/** 记谱用的位置名：城池用城名，中心为「荆州」，其余为「魏3-5」（该方视角第 3 路、第 5 线，路从右往左数） */
function makeLabel(node: BoardNode): string {
  if (node.center) return '荆州';
  if (node.city) return CITY_NAME[node.city];
  const a = node.aliases[0];
  return `${FACTION_NAME[FRAME_FACTION[a.frame]]}${FILES - a.f}-${a.r + 1}`;
}

/** 单例：棋盘结构是固定的 */
let shared: Board | null = null;
export function getBoard(): Board {
  shared ??= buildBoard();
  return shared;
}
