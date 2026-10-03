/**
 * 三人棋盘的拓扑结构（与绘制无关）。
 *
 * 每一方有自己的坐标系 frame：f = 0..8 为路（从该方视角的左手边数起），
 * r = 0..7 为线（0 为底线，4 为河岸，7 为与邻国共享的「前沿线」）。
 *
 *   - r 0..4：本土（含九宫）
 *   - r 5   ：河道（中间五路为水，两边为山）
 *   - r 6   ：荆州
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
/** 河道所在的线 */
export const RIVER_RANK = 5;
/** 边境（山）占两边各两路：f ≤ 1 或 f ≥ 7 */
const EDGE_FILES = 2;
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
  /** 各方本土前的河道节点（下标为 frame） */
  rivers: number[][];
  cityNode: Record<CityId, number>;
  idAt(frame: number, f: number, r: number): number;
  tryIdAt(frame: number, f: number, r: number): number | undefined;
  coord(node: number, frame: number): { f: number; r: number } | null;
  /** 包含边 a-b 的格子 */
  facesOnEdge(a: number, b: number): number[][];
}

const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** 三处边境山脉：魏蜀之间秦岭，魏吴之间大别山，吴蜀之间巫山 */
export const FRONTIER_NAME: Record<string, string> = {
  'shu-wei': '秦岭',
  'wei-wu': '大别山',
  'shu-wu': '巫山',
};

/** 各方本土前的河：魏前汉水，吴前长江，蜀前川江 */
export const RIVER_NAME: Record<Faction, string> = { wei: '汉水', wu: '长江', shu: '川江' };

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
    } else if (node.aliases.some((a) => a.f < EDGE_FILES || a.f >= FILES - EDGE_FILES)) {
      node.region = 'frontier';
      node.terrain = 'mountain';
    } else if (node.aliases[0].r === RIVER_RANK) {
      node.region = 'river';
      node.terrain = 'water';
    } else {
      node.region = 'jingzhou';
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
    rivers: [0, 1, 2].map((p) => nodes.filter((n) => n.region === 'river' && n.aliases[0].frame === p).map((n) => n.id)),
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
