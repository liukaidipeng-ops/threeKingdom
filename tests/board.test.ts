import { describe, expect, it } from 'vitest';
import { CENTER_FILE, DEPTH, FILES, leftOf } from '../src/engine/board';
import { at, board } from './helpers';

describe('棋盘拓扑', () => {
  it('节点数：三方各 9×7，加 3 条前沿线（各 4 点）和中心', () => {
    expect(board.nodes.length).toBe(3 * FILES * DEPTH + 3 * 4 + 1);
  });

  it('前沿线左半边与左邻的右半边重合', () => {
    for (let p = 0; p < 3; p++) {
      for (let f = 0; f < CENTER_FILE; f++) {
        expect(board.idAt(p, f, DEPTH)).toBe(board.idAt(leftOf(p), FILES - 1 - f, DEPTH));
      }
    }
    expect(board.idAt(0, 4, DEPTH)).toBe(board.center);
    expect(board.idAt(1, 4, DEPTH)).toBe(board.center);
    expect(board.idAt(2, 4, DEPTH)).toBe(board.center);
  });

  it('中心有 6 个相邻点，其余点最多 4 个', () => {
    for (const node of board.nodes) {
      const n = board.neighbors[node.id].length;
      if (node.center) expect(n).toBe(6);
      else expect(n).toBeLessThanOrEqual(4);
    }
  });

  it('除中心（3 条线）外，每个点恰好在 2 条直线上', () => {
    for (const node of board.nodes) {
      expect(board.nodeLines[node.id].length).toBe(node.center ? 3 : 2);
    }
  });

  it('直线上没有重复的点，且相邻两点在棋盘上相连', () => {
    for (const line of board.lines) {
      expect(new Set(line.nodes).size).toBe(line.nodes.length);
      for (let i = 1; i < line.nodes.length; i++) {
        expect(board.neighbors[line.nodes[i]]).toContain(line.nodes[i - 1]);
      }
    }
  });

  it('魏的左路直通吴的右路', () => {
    const line = board.lines.find((l) => l.nodes[0] === at('wei', 0, 0) && l.nodes[1] === at('wei', 0, 1))!;
    expect(line.nodes.at(-1)).toBe(at('wu', 8, 0));
  });

  it('魏的中路穿过中心后接上蜀吴之间的前沿线', () => {
    const line = board.lines.find((l) => l.nodes[0] === at('wei', 4, 0) && l.nodes[1] === at('wei', 4, 1))!;
    expect(line.nodes).toContain(board.center);
    expect(line.nodes.at(-1)).toBe(at('wu', 0, DEPTH));
    expect(line.nodes.at(-1)).toBe(at('shu', 8, DEPTH));
  });

  it('格子数与每条边相邻的格子数', () => {
    expect(board.faces.length).toBe(3 * 8 * DEPTH);
    for (const [a, b] of [
      [at('wei', 3, 3), at('wei', 4, 3)],
      [board.center, at('wei', 4, 6)],
      [board.center, at('wei', 3, DEPTH)],
    ]) {
      expect(board.facesOnEdge(a, b).length).toBe(2);
    }
    expect(board.facesOnEdge(at('wei', 0, 0), at('wei', 1, 0)).length).toBe(1);
  });
});

describe('区域与地形', () => {
  const count = (pred: (n: (typeof board.nodes)[number]) => boolean) => board.nodes.filter(pred).length;

  it('本土 3×45，边境 30，其余为荆州', () => {
    expect(count((n) => n.region === 'home')).toBe(3 * 45);
    expect(count((n) => n.region === 'frontier')).toBe(30);
    expect(count((n) => n.region === 'jingzhou')).toBe(board.nodes.length - 135 - 30);
  });

  it('魏蜀之间是山地，魏吴之间是水域，吴蜀之间蜀侧为山、吴侧与江面为水', () => {
    expect(board.nodes[at('wei', 8, 5)].terrain).toBe('mountain');
    expect(board.nodes[at('shu', 0, 6)].terrain).toBe('mountain');
    expect(board.nodes[at('wei', 0, 5)].terrain).toBe('water');
    expect(board.nodes[at('wu', 8, 6)].terrain).toBe('water');
    expect(board.nodes[at('shu', 7, 5)].terrain).toBe('mountain');
    expect(board.nodes[at('wu', 1, 5)].terrain).toBe('water');
    expect(board.nodes[at('wu', 0, DEPTH)].terrain).toBe('water');
    expect(count((n) => n.terrain === 'mountain')).toBe(14);
    expect(count((n) => n.terrain === 'water')).toBe(16);
  });

  it('三座城都在荆州，各自靠近一方', () => {
    expect(board.cityNode.xiangyang).toBe(at('wei', 4, 6));
    expect(board.cityNode.jiangxia).toBe(at('wu', 4, 6));
    expect(board.cityNode.jiangling).toBe(at('shu', 4, 6));
    for (const id of Object.values(board.cityNode)) expect(board.nodes[id].region).toBe('jingzhou');
  });
});
