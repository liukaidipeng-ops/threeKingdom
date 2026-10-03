import type { CityId, Faction, PieceKind } from './types';

/**
 * 棋盘上的三个方位（frame）。
 * 0：魏（北，上方） 1：吴（东南，右下） 2：蜀（西南，左下）
 * 每一方的「左手邻居」是 frame + 1，「右手邻居」是 frame + 2（取模 3）。
 */
export const FRAME_FACTION: readonly Faction[] = ['wei', 'wu', 'shu'];

export const FACTION_FRAME: Record<Faction, number> = { wei: 0, wu: 1, shu: 2 };

/** 行棋顺序：最强的魏最后走 */
export const TURN_ORDER: readonly Faction[] = ['shu', 'wu', 'wei'];

export const FACTION_NAME: Record<Faction, string> = { wei: '魏', wu: '吴', shu: '蜀' };

export const FACTION_RULER: Record<Faction, string> = { wei: '曹操', wu: '孙权', shu: '刘备' };

export const FACTION_COLOR: Record<Faction, string> = {
  wei: '#2f5aa8',
  wu: '#c0392b',
  shu: '#2e8b57',
};

export const CITY_NAME: Record<CityId, string> = {
  xiangyang: '襄阳',
  jiangling: '江陵',
  jiangxia: '江夏',
};

/** 每座城位于哪一方的中路上（靠近该方） */
export const CITY_FRAME: Record<CityId, number> = {
  xiangyang: FACTION_FRAME.wei,
  jiangxia: FACTION_FRAME.wu,
  jiangling: FACTION_FRAME.shu,
};

export const CITY_IDS: readonly CityId[] = ['xiangyang', 'jiangling', 'jiangxia'];

const BASE_CHAR: Record<PieceKind, string> = {
  king: '',
  advisor: '士',
  elephant: '象',
  horse: '马',
  chariot: '车',
  cannon: '炮',
  soldier: '兵',
};

/** 棋子上显示的字。特色兵种用专门的字：魏「骑」（虎豹骑）、蜀「藤」（藤甲兵）。 */
export function pieceChar(kind: PieceKind, faction: Faction): string {
  if (kind === 'king') return FACTION_NAME[faction];
  if (kind === 'horse' && faction === 'wei') return '骑';
  if (kind === 'soldier' && faction === 'shu') return '藤';
  return BASE_CHAR[kind];
}

export const PIECE_NAME: Record<PieceKind, string> = {
  king: '主公',
  advisor: '士',
  elephant: '象',
  horse: '马',
  chariot: '车',
  cannon: '炮',
  soldier: '兵',
};

export function pieceName(kind: PieceKind, faction: Faction): string {
  if (kind === 'king') return FACTION_RULER[faction];
  if (kind === 'horse' && faction === 'wei') return '虎豹骑';
  if (kind === 'soldier' && faction === 'shu') return '藤甲兵';
  if (kind === 'cannon' && faction === 'wu') return '巡河炮';
  return PIECE_NAME[kind];
}

/** 子力价值：用于 AI 评估和回合上限时的计分 */
export const PIECE_VALUE: Record<PieceKind, number> = {
  king: 0,
  advisor: 2,
  elephant: 2,
  horse: 4,
  chariot: 9,
  cannon: 4.5,
  soldier: 1,
};

export interface FactionAbility {
  title: string;
  lines: string[];
}

export const FACTION_ABILITY: Record<Faction, FactionAbility> = {
  wei: {
    title: '虎豹骑（马）',
    lines: [
      '魏马（骑）不受蹩马腿限制。',
      '但不能一跳越过河道：必须先落进河里，下一步再上岸。',
    ],
  },
  shu: {
    title: '藤甲兵（兵）',
    lines: [
      '蜀兵（藤）刀枪不入：不能被兵吃掉（车、马、炮等其他棋子照常可以吃）。',
      '藤甲沉重，只进不退：过河后可前进、横走，不能后退。',
    ],
  },
  wu: {
    title: '巡河炮（炮）',
    lines: [
      '吴炮在自家河道（长江）里平移时不受棋子阻挡，可以一步走到这条河上的任意空位。',
      '吃子仍按普通炮：要隔一个炮架。在别家的河里就是普通的炮。',
    ],
  },
};

/** 不属于某一方的通用规则，显示在特色说明后面 */
export const COMMON_RULES: string[] = [
  '魏、吴的普通兵过河后，除了前进、横走，还可以后退。',
  '三处边境是山，不可通行：棋子不能进入，车、炮的直线和炮弹都被山挡住，马也跳不过去。',
];

/** 回合上限（按单步计）：三方各走 150 步 */
export const MAX_PLY = 450;

/** 回合上限时每座城的分值 */
export const CITY_SCORE = 3;
