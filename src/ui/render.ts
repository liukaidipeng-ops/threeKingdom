import {
  CENTER_FILE,
  DEPTH,
  FRONTIER_NAME,
  RIVER_NAME,
  RIVER_RANK,
  frontierKey,
  leftOf,
  type Board,
} from '../engine/board';
import {
  CITY_IDS,
  CITY_NAME,
  FACTION_COLOR,
  FACTION_NAME,
  FACTION_RULER,
  FRAME_FACTION,
  pieceChar,
} from '../engine/factions';
import { inCheck } from '../engine/rules';
import type { GameState } from '../engine/types';
import { Layout, pathData, type Point } from './geometry';

export const PIECE_R = 0.32;

export interface Highlights {
  selected: number | null;
  moveTargets: number[];
}

const f3 = (n: number) => n.toFixed(3);

function poly(points: Point[], cls: string, extra = ''): string {
  return `<path class="${cls}" d="${pathData(points, true)}" ${extra}/>`;
}

/** 棋盘本身（不随局面变化），按视角缓存 */
export function renderStatic(board: Board, layout: Layout): string {
  const out: string[] = [];

  // 底色与区域
  for (const face of board.faces) {
    const nodes = face.map((id) => board.nodes[id]);
    let cls = 'face';
    const terrains = new Set(nodes.map((n) => n.terrain));
    if (terrains.size === 1 && nodes[0].terrain !== 'plain') cls += ` face-${nodes[0].terrain}`;
    else if (nodes.every((n) => n.region === 'jingzhou')) cls += ' face-jingzhou';
    out.push(poly(layout.face(face), cls));
  }

  // 河道：本土前方中间五路
  const lo = RIVER_RANK - 0.42;
  const hi = RIVER_RANK + 0.42;
  for (let p = 0; p < 3; p++) {
    const band: [number, number][] = [
      [1.55, lo],
      [6.45, lo],
      [6.45, hi],
      [1.55, hi],
    ];
    out.push(poly(layout.polyline(p, band, 12), 'river'));
  }

  // 山：柔和的底色（裁剪在棋盘范围内）
  const outline = board.faces.map((face) => `<path d="${pathData(layout.face(face), true)}"/>`).join('');
  out.push(`<clipPath id="board-clip">${outline}</clipPath><g clip-path="url(#board-clip)">`);
  for (const node of board.nodes) {
    if (node.terrain !== 'mountain') continue;
    const p = layout.pos[node.id];
    out.push(`<circle class="spot-mountain" cx="${f3(p.x)}" cy="${f3(p.y)}" r="0.42"/>`);
  }
  out.push('</g>');

  // 荆州水印
  out.push(`<text class="watermark" x="0" y="0.35">荆州</text>`);

  // 网格线：通向山里的线段画成虚线（不可通行）
  const mountain = (id: number) => board.nodes[id].terrain === 'mountain';
  const open: string[] = [];
  const blocked: string[] = [];
  for (const line of board.lines) {
    for (let i = 0; i < line.nodes.length - 1; i++) {
      const [a, b] = [line.nodes[i], line.nodes[i + 1]];
      (mountain(a) || mountain(b) ? blocked : open).push(pathData(layout.segment(a, b)));
    }
  }
  out.push(`<path class="grid-blocked" d="${blocked.join('')}"/>`);
  out.push(`<path class="grid" d="${open.join('')}"/>`);

  // 九宫斜线
  for (let p = 0; p < 3; p++) {
    for (const coords of [
      [
        [CENTER_FILE - 1, 0],
        [CENTER_FILE + 1, 2],
      ],
      [
        [CENTER_FILE + 1, 0],
        [CENTER_FILE - 1, 2],
      ],
    ] as [number, number][][]) {
      out.push(`<path class="palace" d="${pathData(layout.polyline(p, coords))}"/>`);
    }
  }

  // 地形符号
  for (const node of board.nodes) {
    if (node.terrain === 'plain') continue;
    const p = layout.pos[node.id];
    if (node.terrain !== 'mountain') continue;
    out.push(`<text class="glyph" x="${f3(p.x)}" y="${f3(p.y + 0.12)}">⛰</text>`);
  }

  // 势力名（底线外）与边境名（凹口处）
  for (let p = 0; p < 3; p++) {
    const faction = FRAME_FACTION[p];
    // 沿底线方向书写，字头朝外
    const at = layout.project(p, CENTER_FILE, -1.15);
    const a = layout.project(p, CENTER_FILE + 1, -1.15);
    const b = layout.project(p, CENTER_FILE - 1, -1.15);
    let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    out.push(
      `<text class="faction-label" x="${f3(at.x)}" y="${f3(at.y)}" dy="0.18" transform="rotate(${f3(angle)} ${f3(at.x)} ${f3(at.y)})" fill="${FACTION_COLOR[faction]}">${FACTION_NAME[faction]} · ${FACTION_RULER[faction]}</text>`,
    );
    const notch = layout.project(p, -1.3, DEPTH);
    const name = FRONTIER_NAME[frontierKey(faction, FRAME_FACTION[leftOf(p)])];
    out.push(`<text class="frontier-label" x="${f3(notch.x)}" y="${f3(notch.y + 0.18)}">${name}</text>`);
    // 河名写在河道靠右的一端（该方视角）
    const river = layout.project(p, 6.45, RIVER_RANK + 0.62);
    out.push(`<text class="river-label" x="${f3(river.x)}" y="${f3(river.y + 0.1)}">${RIVER_NAME[faction]}</text>`);
  }
  return out.join('');
}

export function renderDynamic(board: Board, layout: Layout, state: GameState, hl: Highlights): string {
  const out: string[] = [];
  const pos = layout.pos;

  // 城池
  for (const city of CITY_IDS) {
    const id = board.cityNode[city];
    const p = pos[id];
    const owner = state.cities[city];
    const color = owner ? FACTION_COLOR[owner] : '#8a7a5c';
    out.push(
      `<rect class="city" x="${f3(p.x - 0.4)}" y="${f3(p.y - 0.4)}" width="0.8" height="0.8" rx="0.12" stroke="${color}"/>`,
    );
    const label = layout.project(board.nodes[id].aliases[0].frame, CENTER_FILE + 0.95, 6);
    out.push(
      `<text class="city-label" x="${f3(label.x)}" y="${f3(label.y + 0.12)}" fill="${color}">${CITY_NAME[city]}${owner ? '·' + FACTION_NAME[owner] : ''}</text>`,
    );
  }

  // 上一步
  const last = state.lastAction;
  if (last) {
    for (const id of [last.from, last.to]) {
      const p = pos[id];
      out.push(`<circle class="last-move" cx="${f3(p.x)}" cy="${f3(p.y)}" r="${PIECE_R + 0.07}"/>`);
    }
  }

  // 棋子
  const checked = new Set(state.alive.filter((f) => inCheck(board, state, f)));
  for (const piece of state.pieces) {
    if (!piece) continue;
    const p = pos[piece.node];
    const color = FACTION_COLOR[piece.owner];
    const cls = ['piece'];
    if (piece.node === hl.selected) cls.push('selected');
    if (piece.kind === 'king' && checked.has(piece.owner)) cls.push('in-check');
    out.push(`<g class="${cls.join(' ')}" transform="translate(${f3(p.x)} ${f3(p.y)})">`);
    out.push(`<circle class="piece-body" r="${PIECE_R}" stroke="${color}"/>`);
    out.push(`<circle class="piece-ring" r="${PIECE_R - 0.05}" stroke="${color}"/>`);
    out.push(`<text class="piece-text" y="0.125" fill="${color}">${pieceChar(piece.kind, piece.faction)}</text>`);
    if (piece.faction !== piece.owner) {
      out.push(`<circle class="defector" cx="0.24" cy="-0.24" r="0.09" fill="${FACTION_COLOR[piece.faction]}"/>`);
    }
    out.push('</g>');
  }

  // 可走位置
  for (const id of hl.moveTargets) {
    const p = pos[id];
    const capture = state.occ[id] >= 0;
    out.push(
      capture
        ? `<circle class="target-capture" cx="${f3(p.x)}" cy="${f3(p.y)}" r="${PIECE_R + 0.06}"/>`
        : `<circle class="target" cx="${f3(p.x)}" cy="${f3(p.y)}" r="0.11"/>`,
    );
  }

  // 点击区域
  for (const node of board.nodes) {
    const p = pos[node.id];
    out.push(`<circle class="hit" data-node="${node.id}" cx="${f3(p.x)}" cy="${f3(p.y)}" r="0.4"/>`);
  }
  return out.join('');
}
