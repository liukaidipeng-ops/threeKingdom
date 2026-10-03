import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/engine/ai';
import { DEPTH } from '../src/engine/board';
import {
  applyAction,
  fireTargets,
  inCheck,
  initialState,
  legalActions,
  pieceMoves,
} from '../src/engine/rules';
import type { GameState } from '../src/engine/types';
import { at, board, emptyState, place, placeKings, sorted } from './helpers';

describe('开局', () => {
  const s = initialState(board);

  it('三方各 16 子，蜀先走，无人被将军', () => {
    expect(s.pieces.length).toBe(48);
    expect(s.turn).toBe('shu');
    for (const f of ['wei', 'wu', 'shu'] as const) expect(inCheck(board, s, f)).toBe(false);
  });

  it('开局可走 50 步：比普通象棋（44 步）多出的都是炮的长线', () => {
    expect(legalActions(board, s).length).toBe(50);
    // 蜀左炮沿秦岭（蜀军可自由过山）一路打到魏的右马
    const leftCannon = s.pieces.find((p) => p?.faction === 'shu' && p.kind === 'cannon' && p.node === at('shu', 1, 2))!;
    expect(pieceMoves(board, s, leftCannon)).toContain(at('wei', 7, 0));
  });
});

describe('车与地形', () => {
  it('魏车冲进长江（水域）必须停下', () => {
    const s = emptyState('wei');
    placeKings(s);
    const car = place(s, 'chariot', 'wei', at('wei', 0, 3));
    const moves = pieceMoves(board, s, car);
    expect(moves).toContain(at('wei', 0, 5));
    expect(moves).not.toContain(at('wei', 0, 6));
  });

  it('吴车在水域中畅行', () => {
    const s = emptyState('wu');
    placeKings(s);
    const car = place(s, 'chariot', 'wu', at('wu', 8, 3));
    const moves = pieceMoves(board, s, car);
    // 沿吴的右路一直冲进魏的左路
    expect(moves).toContain(at('wei', 0, 4));
  });

  it('蜀车在秦岭（山地）中畅行，魏车进山要停', () => {
    const s = emptyState('shu');
    placeKings(s);
    const shuCar = place(s, 'chariot', 'shu', at('shu', 0, 4));
    expect(pieceMoves(board, s, shuCar)).toContain(at('wei', 8, 4));
    const weiCar = place(s, 'chariot', 'wei', at('wei', 7, 4));
    const weiMoves = pieceMoves(board, s, weiCar);
    expect(weiMoves).toContain(at('wei', 7, 5));
    expect(weiMoves).not.toContain(at('wei', 7, 6));
  });

  it('车穿过中心直行', () => {
    const s = emptyState('wei');
    placeKings(s, ['wei']);
    place(s, 'king', 'wei', at('wei', 3, 0));
    const car = place(s, 'chariot', 'wei', at('wei', 4, 5));
    const moves = pieceMoves(board, s, car);
    expect(moves).toContain(board.center);
    expect(moves).toContain(at('wu', 1, DEPTH)); // 蜀吴交界的前沿线（三峡，水域，停下）
    expect(moves).not.toContain(at('wu', 0, DEPTH));
    // 不会拐到另外两家的中路上
    expect(moves).not.toContain(at('wu', 4, 6));
    expect(moves).not.toContain(at('shu', 4, 6));
  });
});

describe('马', () => {
  it('空旷处有 8 个落点', () => {
    const s = emptyState('wu');
    placeKings(s);
    const horse = place(s, 'horse', 'wu', at('wu', 4, 3));
    expect(pieceMoves(board, s, horse).length).toBe(8);
  });

  it('蹩马腿', () => {
    const s = emptyState('wu');
    placeKings(s);
    const horse = place(s, 'horse', 'wu', at('wu', 4, 3));
    place(s, 'soldier', 'wu', at('wu', 4, 4));
    const moves = pieceMoves(board, s, horse);
    expect(moves).not.toContain(at('wu', 3, 5));
    expect(moves).not.toContain(at('wu', 5, 5));
    expect(moves.length).toBe(6);
  });

  it('魏马（虎豹骑）在平原上不怕蹩腿', () => {
    const s = emptyState('wei');
    placeKings(s);
    const horse = place(s, 'horse', 'wei', at('wei', 4, 3));
    place(s, 'soldier', 'wei', at('wei', 4, 4));
    expect(pieceMoves(board, s, horse)).toContain(at('wei', 3, 5));
  });

  it('马跳过中心时只有正前方两侧两个落点', () => {
    const s = emptyState('wei');
    placeKings(s);
    const horse = place(s, 'horse', 'wu', at('wei', 4, 6));
    const moves = pieceMoves(board, s, horse);
    // 经过中心的那一跳：落在中心正前方那条射线两侧的格子对角
    expect(moves).toContain(at('wu', 3, 6));
    expect(moves).toContain(at('shu', 5, 6));
    expect(moves).not.toContain(at('wu', 5, 6));
    expect(moves).not.toContain(at('shu', 3, 6));
  });

  it('非吴的马不能跳进水域，非蜀的马不能跳上山地', () => {
    const s = emptyState('wei');
    placeKings(s);
    const horse = place(s, 'horse', 'wei', at('wei', 1, 3));
    const moves = pieceMoves(board, s, horse);
    expect(moves).not.toContain(at('wei', 0, 5));
    expect(moves).toContain(at('wei', 2, 5));
  });
});

describe('炮与藤甲兵', () => {
  it('炮隔子打', () => {
    const s = emptyState('wei');
    placeKings(s);
    const cannon = place(s, 'cannon', 'wei', at('wei', 2, 2));
    place(s, 'soldier', 'wei', at('wei', 2, 4));
    place(s, 'chariot', 'wu', at('wei', 2, 6));
    expect(pieceMoves(board, s, cannon)).toContain(at('wei', 2, 6));
  });

  it('藤甲兵不能被炮吃，但可以被车吃', () => {
    const s = emptyState('wei');
    placeKings(s);
    const cannon = place(s, 'cannon', 'wei', at('wei', 2, 2));
    place(s, 'soldier', 'wei', at('wei', 2, 4));
    place(s, 'soldier', 'shu', at('wei', 2, 6));
    expect(pieceMoves(board, s, cannon)).not.toContain(at('wei', 2, 6));
    const car = place(s, 'chariot', 'wei', at('wei', 3, 6));
    expect(pieceMoves(board, s, car)).toContain(at('wei', 2, 6));
  });
});

describe('兵', () => {
  it('未过河只能直进', () => {
    const s = emptyState('wu');
    placeKings(s);
    const soldier = place(s, 'soldier', 'wu', at('wu', 2, 3));
    expect(pieceMoves(board, s, soldier)).toEqual([at('wu', 2, 4)]);
  });

  it('过河后可前进或横走，不能后退', () => {
    const s = emptyState('wu');
    placeKings(s);
    const soldier = place(s, 'soldier', 'wu', at('wu', 2, 5));
    expect(sorted(pieceMoves(board, s, soldier))).toEqual(
      sorted([at('wu', 2, 6), at('wu', 1, 5), at('wu', 3, 5)]),
    );
  });

  it('在中心可以走 5 个方向（只不能退回来路）', () => {
    const s = emptyState('wu');
    placeKings(s);
    const soldier = place(s, 'soldier', 'wu', board.center);
    const moves = pieceMoves(board, s, soldier);
    expect(moves.length).toBe(5);
    expect(moves).not.toContain(at('wu', 4, 6));
  });

  it('在敌方本土向敌方底线前进，左右都可以横走', () => {
    const s = emptyState('wu');
    placeKings(s);
    const soldier = place(s, 'soldier', 'wu', at('wei', 4, 3));
    expect(sorted(pieceMoves(board, s, soldier))).toEqual(
      sorted([at('wei', 4, 2), at('wei', 3, 3), at('wei', 5, 3)]),
    );
  });
});

describe('将军、吃将与归降', () => {
  it('不能走出让自己主公被吃的棋', () => {
    const s = emptyState('wei');
    placeKings(s);
    // 吴车在魏中路上，魏士挡着
    place(s, 'advisor', 'wei', at('wei', 4, 1));
    place(s, 'chariot', 'wu', at('wei', 4, 5));
    const legal = legalActions(board, s);
    expect(legal.some((a) => a.type === 'move' && a.from === at('wei', 4, 1))).toBe(false);
  });

  it('吃掉主公：该国出局，残部归降', () => {
    const s = emptyState('wu');
    placeKings(s, ['wei']);
    place(s, 'king', 'wei', at('wei', 4, 0));
    const weiCar = place(s, 'chariot', 'wei', at('wei', 0, 0));
    const car = place(s, 'chariot', 'wu', at('wei', 4, 4));
    const next = applyAction(board, s, { type: 'move', from: car.node, to: at('wei', 4, 0) });
    expect(next.alive).not.toContain('wei');
    expect(next.pieces[weiCar.id]!.owner).toBe('wu');
    expect(next.pieces[weiCar.id]!.faction).toBe('wei');
    expect(next.turn).toBe('shu');
  });

  it('只剩一家时获胜', () => {
    const s = emptyState('wu');
    placeKings(s, ['wei']);
    place(s, 'king', 'wei', at('wei', 4, 0));
    const car = place(s, 'chariot', 'wu', at('wei', 4, 4));
    s.alive = ['wu', 'wei'];
    const next = applyAction(board, s, { type: 'move', from: car.node, to: at('wei', 4, 0) });
    expect(next.result).toEqual({ winner: 'wu', reason: 'last-standing' });
  });
});

describe('火攻', () => {
  it('烧掉相邻敌子，藤甲兵连片被烧', () => {
    const s = emptyState('wu');
    placeKings(s);
    place(s, 'soldier', 'wu', at('wu', 2, 5));
    place(s, 'soldier', 'shu', at('wu', 2, 6));
    place(s, 'soldier', 'shu', at('wu', 3, 6));
    place(s, 'soldier', 'shu', at('wu', 4, 6));
    place(s, 'soldier', 'shu', at('wu', 6, 6)); // 不相连
    expect(fireTargets(board, s, 'wu')).toEqual([at('wu', 2, 6)]);
    const next = applyAction(board, s, { type: 'fire', target: at('wu', 2, 6) });
    expect(next.occ[at('wu', 2, 6)]).toBe(-1);
    expect(next.occ[at('wu', 3, 6)]).toBe(-1);
    expect(next.occ[at('wu', 4, 6)]).toBe(-1);
    expect(next.occ[at('wu', 6, 6)]).not.toBe(-1);
    expect(next.fireUses).toBe(1);
  });

  it('不能烧主公，用完后不能再用', () => {
    const s = emptyState('wu');
    placeKings(s);
    place(s, 'advisor', 'wu', at('shu', 3, 0)); // 紧挨着蜀主公
    expect(fireTargets(board, s, 'wu')).toEqual([]);
    place(s, 'horse', 'wu', at('wu', 2, 5));
    place(s, 'horse', 'wei', at('wu', 2, 6));
    s.fireUses = 0;
    expect(fireTargets(board, s, 'wu')).toEqual([]);
  });
});

describe('荆州三城', () => {
  /** 走一步主公（闲着） */
  const idle = (s: GameState) =>
    applyAction(board, s, legalActions(board, s).find((a) => a.type === 'move' && s.pieces[s.occ[a.from]]!.kind === 'king')!);

  it('只插旗、不驻军不算霸业', () => {
    const s = emptyState('shu');
    placeKings(s);
    s.cities = { xiangyang: 'shu', jiangling: 'shu', jiangxia: 'shu' };
    place(s, 'soldier', 'shu', board.cityNode.xiangyang);
    place(s, 'soldier', 'shu', board.cityNode.jiangling);
    const next = idle(idle(idle(s)));
    expect(next.turn).toBe('shu');
    expect(next.result).toBeNull();
  });

  it('轮到自己时三城都有己方驻军即获胜', () => {
    const s = emptyState('shu');
    placeKings(s);
    place(s, 'soldier', 'shu', board.cityNode.xiangyang);
    place(s, 'soldier', 'shu', board.cityNode.jiangling);
    place(s, 'soldier', 'shu', board.center);
    const afterShu = applyAction(board, s, { type: 'move', from: board.center, to: board.cityNode.jiangxia });
    expect(afterShu.cities.jiangxia).toBe('shu');
    expect(afterShu.result).toBeNull(); // 要坚守到下一次轮到自己
    const back = idle(idle(afterShu));
    expect(back.result).toEqual({ winner: 'shu', reason: 'cities' });
  });
});

describe('电脑对局', () => {
  function checkInvariants(s: GameState) {
    s.occ.forEach((id, node) => {
      if (id >= 0) expect(s.pieces[id]!.node).toBe(node);
    });
    for (const p of s.pieces) if (p) expect(s.occ[p.node]).toBe(p.id);
    for (const f of s.alive) expect(s.pieces.some((p) => p?.kind === 'king' && p.owner === f)).toBe(true);
  }

  it('三个电脑能下完 150 步，状态始终自洽', () => {
    let seed = 42;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let s = initialState(board);
    for (let i = 0; i < 150 && !s.result; i++) {
      const action = chooseAction(board, s, random);
      expect(action).not.toBeNull();
      s = applyAction(board, s, action!);
      checkInvariants(s);
    }
  }, 60_000);
});
