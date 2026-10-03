export type Faction = 'wei' | 'wu' | 'shu';

export type PieceKind =
  | 'king'
  | 'advisor'
  | 'elephant'
  | 'horse'
  | 'chariot'
  | 'cannon'
  | 'soldier';

/** 地形：平地 / 山地 / 水域 */
export type Terrain = 'plain' | 'mountain' | 'water';

/** 区域：本土 / 荆州（中央） / 边境 */
export type Region = 'home' | 'jingzhou' | 'frontier';

export type CityId = 'xiangyang' | 'jiangling' | 'jiangxia';

export interface Piece {
  id: number;
  kind: PieceKind;
  /** 出身势力：决定兵种特性与走法朝向（士、象、兵），归降后不变 */
  faction: Faction;
  /** 当前控制者 */
  owner: Faction;
  node: number;
}

export type Action =
  | { type: 'move'; from: number; to: number }
  | { type: 'fire'; target: number };

export type EndReason = 'last-standing' | 'cities' | 'move-limit';

export interface GameResult {
  /** null 表示平局 */
  winner: Faction | null;
  reason: EndReason;
  scores?: Record<Faction, number>;
}

export interface Elimination {
  faction: Faction;
  by: Faction | null;
  reason: 'king-captured' | 'no-moves';
  ply: number;
}

export interface LogEntry {
  ply: number;
  faction: Faction;
  text: string;
}

export interface GameState {
  /** 以棋子 id 为下标，被吃掉的为 null */
  pieces: (Piece | null)[];
  /** 以节点 id 为下标，值为棋子 id，空位为 -1 */
  occ: number[];
  turn: Faction;
  /** 仍在场上的势力 */
  alive: Faction[];
  cities: Record<CityId, Faction | null>;
  /** 东吴「火攻」剩余次数（归属于吴军，降军亦可使用） */
  fireUses: number;
  ply: number;
  lastMover: Faction | null;
  lastAction: Action | null;
  result: GameResult | null;
  eliminations: Elimination[];
  log: LogEntry[];
}
