export type Faction = 'wei' | 'wu' | 'shu';

export type PieceKind =
  | 'king'
  | 'advisor'
  | 'elephant'
  | 'horse'
  | 'chariot'
  | 'cannon'
  | 'soldier';

/** 地形：平地 / 山（不可通行） / 河道 */
export type Terrain = 'plain' | 'mountain' | 'water';

/** 区域：本土 / 河道（各方本土前方） / 荆州（中央） / 边境（山） */
export type Region = 'home' | 'river' | 'jingzhou' | 'frontier';

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

/** 一步棋。保留 type 字段，方便以后加入计策等其他行动。 */
export interface Action {
  type: 'move';
  from: number;
  to: number;
}

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
  ply: number;
  lastMover: Faction | null;
  lastAction: Action | null;
  result: GameResult | null;
  eliminations: Elimination[];
  log: LogEntry[];
}
