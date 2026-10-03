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
    title: '虎豹骑',
    lines: [
      '魏马（骑）在平原（魏本土、荆州）上不受蹩马腿限制。',
      '劣势：通往蜀、吴的边境都是山地或水域，铁骑难以通过。',
    ],
  },
  shu: {
    title: '藤甲兵 · 蜀道',
    lines: [
      '蜀兵（藤）刀枪不入：不能被炮吃掉。',
      '蜀军所有棋子在山地中通行无阻。',
      '劣势：藤甲怕火，会被吴军火攻连片烧毁。',
    ],
  },
  wu: {
    title: '水军 · 火攻',
    lines: [
      '吴军所有棋子在水域中通行无阻。',
      '火攻（全局限 2 次，代替一步棋）：烧掉一枚与吴军棋子相邻的敌子（主公除外）；烧到藤甲兵时，相连的藤甲兵一起烧掉。',
    ],
  },
};

export const FIRE_ATTACK_USES = 2;

/** 回合上限（按单步计）：三方各走 150 步 */
export const MAX_PLY = 450;

/** 回合上限时每座城的分值 */
export const CITY_SCORE = 3;
