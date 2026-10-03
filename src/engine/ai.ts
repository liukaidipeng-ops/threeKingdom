/**
 * 简易电脑对手：一步贪心 + 对手反击估计。
 * 目标是能陪人试玩、不犯明显的送子错误，而不是下得多强。
 */
import type { Board } from './board';
import { CITY_IDS, FACTION_FRAME, PIECE_VALUE } from './factions';
import { canCapture, garrisonedCities, legalActions, pieceMoves, simulate } from './rules';
import type { Action, Faction, GameState, Piece } from './types';

const KING_VALUE = 1000;

function value(p: Piece): number {
  return p.kind === 'king' ? KING_VALUE : PIECE_VALUE[p.kind];
}

/** 局面评估（站在 me 的角度）：己方子力 − 对手子力的一半（三人局里削弱一家也会让第三家得利）+ 城池 + 位置 */
function evaluate(board: Board, s: GameState, me: Faction): number {
  if (!s.alive.includes(me)) return -KING_VALUE;
  let score = 0;
  for (const p of s.pieces) {
    if (!p) continue;
    let v = p.kind === 'king' ? 0 : PIECE_VALUE[p.kind];
    const node = board.nodes[p.node];
    if (p.kind === 'soldier' && node.home !== null && node.home !== FACTION_FRAME[p.faction]) v += 0.6;
    else if (p.kind === 'soldier' && node.home === null) v += 0.4;
    if ((node.region === 'jingzhou' || node.region === 'river') && p.kind !== 'king') v += 0.15;
    score += p.owner === me ? v : -0.5 * v;
  }
  for (const c of CITY_IDS) {
    if (s.cities[c] === me) score += 1.5;
    else if (s.cities[c]) score -= 0.5;
  }
  // 荆州霸业：三城驻军即获胜，所以对手驻军越多越危险
  for (const f of s.alive) {
    const held = garrisonedCities(board, s, f).length;
    const weight = held === 3 ? 60 : held === 2 ? 4 : held;
    score += f === me ? weight : -1.2 * weight;
  }
  score -= 30 * (s.alive.length - 1);
  return score;
}

/** me 的棋子在 node 上是否有己方保护（假设该子被敌方吃掉后，己方能否吃回） */
function defended(board: Board, s: GameState, node: number, me: Faction, enemy: Faction): boolean {
  const victim = s.pieces[s.occ[node]]!;
  const saved = victim.owner;
  victim.owner = enemy;
  let result = false;
  for (const p of s.pieces) {
    if (p && p.owner === me && p !== victim && pieceMoves(board, s, p).includes(node)) {
      result = true;
      break;
    }
  }
  victim.owner = saved;
  return result;
}

/** 走完这一步后，对手下一步能给我造成的最大损失（粗略的静态交换估计） */
function worstThreat(board: Board, s: GameState, me: Faction): number {
  let worst = 0;
  for (const attacker of s.pieces) {
    if (!attacker || attacker.owner === me) continue;
    for (const to of pieceMoves(board, s, attacker)) {
      const victim = s.pieces[s.occ[to]];
      if (!victim || victim.owner !== me || !canCapture(attacker, victim)) continue;
      let loss = value(victim);
      if (loss < KING_VALUE && defended(board, s, to, me, attacker.owner)) loss -= value(attacker);
      worst = Math.max(worst, loss);
    }
  }
  return worst;
}

export function chooseAction(board: Board, state: GameState, random: () => number = Math.random): Action | null {
  const me = state.turn;
  const actions = legalActions(board, state, me);
  if (actions.length === 0) return null;
  const base = evaluate(board, state, me);
  let best: Action | null = null;
  let bestScore = -Infinity;
  for (const action of actions) {
    const next = simulate(board, state, action);
    let score = evaluate(board, next, me) - base;
    score -= 0.85 * worstThreat(board, next, me);
    score += random() * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best;
}
