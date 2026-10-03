import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/engine/ai';
import { DEPTH } from '../src/engine/board';
import { applyAction, inCheck, initialState, legalActions, pieceMoves } from '../src/engine/rules';
import type { GameState } from '../src/engine/types';
import { at, board, emptyState, place, placeKings, sorted } from './helpers';

describe('开局', () => {
  const s = initialState(board);

  it('三方各 16 子，蜀先走，无人被将军', () => {
    expect(s.pieces.length).toBe(48);
    expect(s.turn).toBe('shu');
    for (const f of ['wei', 'wu', 'shu'] as const) expect(inCheck(board, s, f)).toBe(false);
  });

  it('开局可走 38 步：两门炮往前只能走两步就被山挡住（普通象棋是 44 步）', () => {
    expect(legalActions(board, s).length).toBe(38);
  });

  it('炮打不过秦岭', () => {
    const leftCannon = s.pieces.find((p) => p?.faction === 'shu' && p.kind === 'cannon' && p.node === at('shu', 1, 2))!;
    const moves = pieceMoves(board, s, leftCannon);
    expect(moves).toContain(at('shu', 1, 4));
    expect(moves).not.toContain(at('shu', 1, 5));
    expect(moves).not.toContain(at('wei', 7, 0));
  });
});

describe('山与河道', () => {
  it('车走到山前为止', () => {
    const s = emptyState('wei');
    placeKings(s);
    const car = place(s, 'chariot', 'wei', at('wei', 0, 3));
    const moves = pieceMoves(board, s, car);
    expect(moves).toContain(at('wei', 0, 4));
    expect(moves).not.toContain(at('wei', 0, 5));
  });

  it('河道不挡路：车可以穿过河道和荆州，一直冲进邻国', () => {
    const s = emptyState('wei');
    placeKings(s);
    const car = place(s, 'chariot', 'wei', at('wei', 2, 4));
    const moves = pieceMoves(board, s, car);
    expect(moves).toContain(at('wei', 2, 5));
    expect(moves).toContain(at('wu', 6, 0));
  });

  it('炮弹飞不过山', () => {
    const s = emptyState('wei');
    placeKings(s);
    const cannon = place(s, 'cannon', 'wei', at('wei', 1, 2));
    place(s, 'soldier', 'wei', at('wei', 1, 3));
    place(s, 'chariot', 'wu', at('wu', 7, 4)); // 同一条直线上，但隔着大别山
    expect(pieceMoves(board, s, cannon)).not.toContain(at('wu', 7, 4));
  });

  it('车穿过中心直行，走到另一侧边境的山前为止', () => {
    const s = emptyState('wei');
    placeKings(s, ['wei']);
    place(s, 'king', 'wei', at('wei', 3, 0));
    const car = place(s, 'chariot', 'wei', at('wei', 4, 5));
    const moves = pieceMoves(board, s, car);
    expect(moves).toContain(board.center);
    expect(moves).toContain(at('wu', 2, DEPTH));
    expect(moves).not.toContain(at('wu', 1, DEPTH)); // 巫山
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

  it('马跳过中心时只有正前方两侧两个落点', () => {
    const s = emptyState('wei');
    placeKings(s);
    const horse = place(s, 'horse', 'wu', at('wei', 4, 6));
    const moves = pieceMoves(board, s, horse);
    expect(moves).toContain(at('wu', 3, 6));
    expect(moves).toContain(at('shu', 5, 6));
    expect(moves).not.toContain(at('wu', 5, 6));
    expect(moves).not.toContain(at('shu', 3, 6));
  });

  it('马跳不进山，也不能借山上的马腿跳', () => {
    const s = emptyState('wei');
    placeKings(s);
    const horse = place(s, 'horse', 'wu', at('wei', 2, 4));
    const moves = pieceMoves(board, s, horse);
    expect(moves).not.toContain(at('wei', 0, 5));
    expect(moves).not.toContain(at('wei', 1, 6));
    expect(moves).toContain(at('wei', 3, 6));

    const s2 = emptyState('wei');
    placeKings(s2);
    const h2 = place(s2, 'horse', 'wu', at('wei', 2, 5));
    expect(pieceMoves(board, s2, h2)).not.toContain(at('wei', 0, 4)); // 马腿在山上
  });

  it('其他势力的马可以一跳越过河道', () => {
    const s = emptyState('wu');
    placeKings(s);
    const horse = place(s, 'horse', 'wu', at('wu', 4, 4));
    expect(pieceMoves(board, s, horse)).toContain(at('wu', 3, 6));
  });
});

describe('魏 · 虎豹骑', () => {
  it('不受蹩马腿限制', () => {
    const s = emptyState('wei');
    placeKings(s);
    const horse = place(s, 'horse', 'wei', at('wei', 4, 2));
    place(s, 'soldier', 'wei', at('wei', 4, 3));
    expect(pieceMoves(board, s, horse)).toContain(at('wei', 3, 4));
  });

  it('不能一跳越过河道，但可以先跳进河里', () => {
    const s = emptyState('wei');
    placeKings(s);
    const horse = place(s, 'horse', 'wei', at('wei', 4, 4));
    const moves = pieceMoves(board, s, horse);
    expect(moves).not.toContain(at('wei', 3, 6));
    expect(moves).not.toContain(at('wei', 5, 6));
    expect(moves).toContain(at('wei', 2, 5)); // 落进河里
  });

  it('在河里时可以上岸', () => {
    const s = emptyState('wei');
    placeKings(s);
    const horse = place(s, 'horse', 'wei', at('wei', 2, 5));
    expect(pieceMoves(board, s, horse)).toContain(at('wei', 4, 6));
  });

  it('从荆州回撤也不能一跳越过河道', () => {
    const s = emptyState('wei');
    placeKings(s);
    const horse = place(s, 'horse', 'wei', at('wei', 4, 6));
    const moves = pieceMoves(board, s, horse);
    expect(moves).not.toContain(at('wei', 3, 4));
    expect(moves).not.toContain(at('wei', 5, 4));
  });
});

describe('吴 · 巡河炮', () => {
  it('在长江里平移不受棋子阻挡，可到这条河上任意空位', () => {
    const s = emptyState('wu');
    placeKings(s);
    const cannon = place(s, 'cannon', 'wu', at('wu', 2, 5));
    place(s, 'soldier', 'wu', at('wu', 3, 5));
    place(s, 'horse', 'wei', at('wu', 4, 5));
    const moves = pieceMoves(board, s, cannon);
    expect(moves).toContain(at('wu', 5, 5));
    expect(moves).toContain(at('wu', 6, 5));
    expect(moves).not.toContain(at('wu', 3, 5)); // 有子的位置不能落
  });

  it('吃子仍要隔炮架', () => {
    const s = emptyState('wu');
    placeKings(s);
    const cannon = place(s, 'cannon', 'wu', at('wu', 2, 5));
    place(s, 'horse', 'wei', at('wu', 4, 5));
    expect(pieceMoves(board, s, cannon)).not.toContain(at('wu', 4, 5)); // 没有炮架
    place(s, 'soldier', 'wu', at('wu', 3, 5));
    expect(pieceMoves(board, s, cannon)).toContain(at('wu', 4, 5)); // 隔着吴兵打
  });

  it('不能借河道调到别的河', () => {
    const s = emptyState('wu');
    placeKings(s);
    const cannon = place(s, 'cannon', 'wu', at('wu', 3, 5));
    expect(pieceMoves(board, s, cannon)).not.toContain(at('shu', 2, 5));
  });

  it('在别家的河里就是普通的炮', () => {
    const s = emptyState('wu');
    placeKings(s);
    const cannon = place(s, 'cannon', 'wu', at('wei', 2, 5));
    place(s, 'soldier', 'wei', at('wei', 3, 5));
    expect(pieceMoves(board, s, cannon)).not.toContain(at('wei', 4, 5));
  });

  it('别家的炮在长江里没有这个本事', () => {
    const s = emptyState('wei');
    placeKings(s);
    const cannon = place(s, 'cannon', 'wei', at('wu', 2, 5));
    place(s, 'soldier', 'wu', at('wu', 3, 5));
    expect(pieceMoves(board, s, cannon)).not.toContain(at('wu', 4, 5));
  });
});

describe('兵与藤甲兵', () => {
  it('未过河只能直进', () => {
    const s = emptyState('wu');
    placeKings(s);
    const soldier = place(s, 'soldier', 'wu', at('wu', 2, 3));
    expect(pieceMoves(board, s, soldier)).toEqual([at('wu', 2, 4)]);
  });

  it('魏、吴的普通兵过河后可进、可横、可退', () => {
    const s = emptyState('wu');
    placeKings(s);
    const soldier = place(s, 'soldier', 'wu', at('wu', 3, 5));
    expect(sorted(pieceMoves(board, s, soldier))).toEqual(
      sorted([at('wu', 3, 6), at('wu', 2, 5), at('wu', 4, 5), at('wu', 3, 4)]),
    );
  });

  it('藤甲兵过河后只进不退', () => {
    const s = emptyState('shu');
    placeKings(s);
    const soldier = place(s, 'soldier', 'shu', at('shu', 3, 5));
    expect(sorted(pieceMoves(board, s, soldier))).toEqual(
      sorted([at('shu', 3, 6), at('shu', 2, 5), at('shu', 4, 5)]),
    );
  });

  it('兵不能走进山里', () => {
    const s = emptyState('wu');
    placeKings(s);
    const soldier = place(s, 'soldier', 'wu', at('wu', 2, 5));
    expect(pieceMoves(board, s, soldier)).not.toContain(at('wu', 1, 5));
  });

  it('兵在中心：普通兵 6 个方向，藤甲兵不能退回来路', () => {
    const s = emptyState('wu');
    placeKings(s);
    const wuSoldier = place(s, 'soldier', 'wu', board.center);
    expect(pieceMoves(board, s, wuSoldier).length).toBe(6);
    const s2 = emptyState('shu');
    placeKings(s2);
    const rattan = place(s2, 'soldier', 'shu', board.center);
    const moves = pieceMoves(board, s2, rattan);
    expect(moves.length).toBe(5);
    expect(moves).not.toContain(at('shu', 4, 6));
  });

  it('在敌方本土向敌方底线前进', () => {
    const s = emptyState('shu');
    placeKings(s);
    const soldier = place(s, 'soldier', 'shu', at('wei', 4, 3));
    expect(sorted(pieceMoves(board, s, soldier))).toEqual(
      sorted([at('wei', 4, 2), at('wei', 3, 3), at('wei', 5, 3)]),
    );
  });

  it('藤甲兵不能被兵吃，但车、马、炮都可以吃', () => {
    const s = emptyState('wu');
    placeKings(s);
    place(s, 'soldier', 'shu', at('wu', 4, 6));
    const soldier = place(s, 'soldier', 'wu', at('wu', 4, 5));
    expect(pieceMoves(board, s, soldier)).not.toContain(at('wu', 4, 6));
    const car = place(s, 'chariot', 'wu', at('wu', 6, 6));
    expect(pieceMoves(board, s, car)).toContain(at('wu', 4, 6));
    const cannon = place(s, 'cannon', 'wu', at('wu', 4, 2));
    expect(pieceMoves(board, s, cannon)).toContain(at('wu', 4, 6)); // 隔着吴兵打
  });

  it('普通兵照常互相吃', () => {
    const s = emptyState('wu');
    placeKings(s);
    place(s, 'soldier', 'wei', at('wu', 3, 5));
    const soldier = place(s, 'soldier', 'wu', at('wu', 4, 5));
    expect(pieceMoves(board, s, soldier)).toContain(at('wu', 3, 5));
  });
});

describe('将军、吃将与归降', () => {
  it('不能走出让自己主公被吃的棋', () => {
    const s = emptyState('wei');
    placeKings(s);
    place(s, 'advisor', 'wei', at('wei', 4, 1));
    place(s, 'chariot', 'wu', at('wei', 4, 5));
    const legal = legalActions(board, s);
    expect(legal.some((a) => a.from === at('wei', 4, 1))).toBe(false);
  });

  it('吃掉主公：该国出局，残部归降', () => {
    const s = emptyState('wu');
    placeKings(s, ['wei']);
    place(s, 'king', 'wei', at('wei', 4, 0));
    const weiHorse = place(s, 'horse', 'wei', at('wei', 0, 0));
    const car = place(s, 'chariot', 'wu', at('wei', 4, 4));
    const next = applyAction(board, s, { type: 'move', from: car.node, to: at('wei', 4, 0) });
    expect(next.alive).not.toContain('wei');
    expect(next.pieces[weiHorse.id]!.owner).toBe('wu');
    expect(next.pieces[weiHorse.id]!.faction).toBe('wei');
    expect(next.turn).toBe('shu');
  });

  it('归降的虎豹骑仍然不怕蹩马腿', () => {
    const s = emptyState('wu');
    placeKings(s, ['wei']);
    const horse = place(s, 'horse', 'wei', at('wei', 4, 2), 'wu');
    place(s, 'soldier', 'wu', at('wei', 4, 3));
    expect(pieceMoves(board, s, horse)).toContain(at('wei', 3, 4));
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

describe('荆州三城', () => {
  /** 走一步主公（闲着） */
  const idle = (s: GameState) =>
    applyAction(board, s, legalActions(board, s).find((a) => s.pieces[s.occ[a.from]]!.kind === 'king')!);

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
    for (const p of s.pieces) {
      if (!p) continue;
      expect(s.occ[p.node]).toBe(p.id);
      expect(board.nodes[p.node].terrain).not.toBe('mountain');
    }
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
