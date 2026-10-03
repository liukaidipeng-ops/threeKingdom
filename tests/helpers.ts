import { getBoard } from '../src/engine/board';
import { FACTION_FRAME } from '../src/engine/factions';
import { initialState } from '../src/engine/rules';
import type { Faction, GameState, Piece, PieceKind } from '../src/engine/types';

export const board = getBoard();

/** 空棋盘（无子），轮到 turn 走 */
export function emptyState(turn: Faction = 'shu'): GameState {
  const s = initialState(board);
  s.pieces = [];
  s.occ.fill(-1);
  s.turn = turn;
  return s;
}

export function place(
  s: GameState,
  kind: PieceKind,
  faction: Faction,
  node: number,
  owner: Faction = faction,
): Piece {
  if (s.occ[node] >= 0) throw new Error(`node ${node} occupied`);
  const piece: Piece = { id: s.pieces.length, kind, faction, owner, node };
  s.pieces.push(piece);
  s.occ[node] = piece.id;
  return piece;
}

/** 某一方坐标系中的节点 */
export function at(faction: Faction, f: number, r: number): number {
  return board.idAt(FACTION_FRAME[faction], f, r);
}

/** 给三方都放上主公（放在九宫中央的底线），避免「无主公」的特殊情况 */
export function placeKings(s: GameState, skip: Faction[] = []): void {
  for (const f of ['wei', 'wu', 'shu'] as Faction[]) {
    if (!skip.includes(f)) place(s, 'king', f, at(f, 4, 0));
  }
}

export function sorted(nodes: number[]): number[] {
  return [...nodes].sort((a, b) => a - b);
}
