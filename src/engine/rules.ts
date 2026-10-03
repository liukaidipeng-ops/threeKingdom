import { CENTER_FILE, DEPTH, FILES, LAST_HOME_RANK, type Board } from './board';
import {
  CITY_IDS,
  CITY_NAME,
  CITY_SCORE,
  FACTION_FRAME,
  FACTION_NAME,
  FRAME_FACTION,
  MAX_PLY,
  PIECE_VALUE,
  TURN_ORDER,
  pieceName,
} from './factions';
import type { Action, CityId, Faction, GameState, Piece, PieceKind } from './types';

// ---------------------------------------------------------------------------
// 开局

/** 每一方的初始摆法（该方坐标系），与普通象棋一致 */
const SETUP: { kind: PieceKind; f: number; r: number }[] = [
  { kind: 'chariot', f: 0, r: 0 },
  { kind: 'horse', f: 1, r: 0 },
  { kind: 'elephant', f: 2, r: 0 },
  { kind: 'advisor', f: 3, r: 0 },
  { kind: 'king', f: 4, r: 0 },
  { kind: 'advisor', f: 5, r: 0 },
  { kind: 'elephant', f: 6, r: 0 },
  { kind: 'horse', f: 7, r: 0 },
  { kind: 'chariot', f: 8, r: 0 },
  { kind: 'cannon', f: 1, r: 2 },
  { kind: 'cannon', f: 7, r: 2 },
  ...[0, 2, 4, 6, 8].map((f) => ({ kind: 'soldier' as const, f, r: 3 })),
];

export function initialState(board: Board): GameState {
  const pieces: Piece[] = [];
  const occ = new Array<number>(board.nodes.length).fill(-1);
  for (const faction of FRAME_FACTION) {
    const frame = FACTION_FRAME[faction];
    for (const s of SETUP) {
      const node = board.idAt(frame, s.f, s.r);
      const piece: Piece = { id: pieces.length, kind: s.kind, faction, owner: faction, node };
      pieces.push(piece);
      occ[node] = piece.id;
    }
  }
  return {
    pieces,
    occ,
    turn: TURN_ORDER[0],
    alive: [...TURN_ORDER],
    cities: { xiangyang: null, jiangling: null, jiangxia: null },
    ply: 0,
    lastMover: null,
    lastAction: null,
    result: null,
    eliminations: [],
    log: [],
  };
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    pieces: s.pieces.map((p) => (p ? { ...p } : null)),
    occ: s.occ.slice(),
    alive: s.alive.slice(),
    cities: { ...s.cities },
    eliminations: s.eliminations.slice(),
    log: s.log.slice(),
  };
}

// ---------------------------------------------------------------------------
// 地形与兵种特性

/** 山（三处边境）不可通行：不能进入，直线、炮弹、马腿都被山挡住 */
export function isMountain(board: Board, node: number): boolean {
  return board.nodes[node].terrain === 'mountain';
}

/** 河道（各方本土前方）：魏骑不能一跳越过；吴炮在自家河道（长江）里平移不受阻挡；吴兵可一步过河 */
export function isRiver(board: Board, node: number): boolean {
  return board.nodes[node].terrain === 'water';
}

const isRattan = (p: Piece) => p.kind === 'soldier' && p.faction === 'shu';

export function canCapture(attacker: Piece, target: Piece): boolean {
  if (target.owner === attacker.owner) return false;
  // 藤甲兵：兵吃不动，其他棋子照常可以吃
  if (isRattan(target) && attacker.kind === 'soldier') return false;
  return true;
}

/** 兵的「前进度」：在本方坐标系里就是线号，在别家的地盘里是 2×DEPTH − 该家线号。数值变小即为后退。 */
export function soldierProgress(board: Board, frame: number, node: number): number {
  const c = board.coord(node, frame);
  if (c) return c.r;
  return 2 * DEPTH - board.nodes[node].aliases[0].r;
}

// ---------------------------------------------------------------------------
// 走法生成（不考虑本方主公是否被攻击）

function pieceAt(state: GameState, node: number): Piece | null {
  const id = state.occ[node];
  return id >= 0 ? state.pieces[id] : null;
}

function pushIfAllowed(state: GameState, piece: Piece, node: number, out: number[]) {
  const target = pieceAt(state, node);
  if (!target || canCapture(piece, target)) out.push(node);
}

export function pieceMoves(board: Board, state: GameState, piece: Piece): number[] {
  const out: number[] = [];
  const from = piece.node;
  switch (piece.kind) {
    case 'chariot':
      for (const ref of board.nodeLines[from]) {
        const ids = board.lines[ref.line].nodes;
        for (const step of [-1, 1]) {
          for (let i = ref.index + step; i >= 0 && i < ids.length; i += step) {
            const n = ids[i];
            if (isMountain(board, n)) break;
            const target = pieceAt(state, n);
            if (target) {
              if (canCapture(piece, target)) out.push(n);
              break;
            }
            out.push(n);
          }
        }
      }
      break;

    case 'cannon':
      for (const ref of board.nodeLines[from]) {
        const ids = board.lines[ref.line].nodes;
        for (const step of [-1, 1]) {
          // 平移：和车一样
          for (let i = ref.index + step; i >= 0 && i < ids.length; i += step) {
            const n = ids[i];
            if (isMountain(board, n) || state.occ[n] >= 0) break;
            out.push(n);
          }
          // 隔子打：炮弹也飞不过山
          let screened = false;
          for (let i = ref.index + step; i >= 0 && i < ids.length; i += step) {
            if (isMountain(board, ids[i])) break;
            const target = pieceAt(state, ids[i]);
            if (!target) continue;
            if (!screened) {
              screened = true;
              continue;
            }
            if (canCapture(piece, target)) out.push(ids[i]);
            break;
          }
        }
      }
      // 吴 · 巡河炮：在自家河道（长江）里平移时不受棋子阻挡，可到这条河上任意空位（吃子仍按普通炮）
      if (piece.faction === 'wu') {
        const ownRiver = board.rivers[FACTION_FRAME.wu];
        if (ownRiver.includes(from)) {
          for (const n of ownRiver) {
            if (n !== from && state.occ[n] < 0 && !out.includes(n)) out.push(n);
          }
        }
      }
      break;

    case 'horse': {
      const seen = new Set<number>();
      for (const ref of board.nodeLines[from]) {
        const ids = board.lines[ref.line].nodes;
        for (const step of [-1, 1]) {
          const legIdx = ref.index + step;
          const beyondIdx = legIdx + step;
          if (beyondIdx < 0 || beyondIdx >= ids.length) continue;
          const leg = ids[legIdx];
          if (isMountain(board, leg)) continue;
          if (piece.faction === 'wei') {
            // 魏 · 虎豹骑：不怕蹩马腿，但不能一跳越过河道，必须先落进河里
            if (isRiver(board, leg) && !isRiver(board, from)) continue;
          } else if (state.occ[leg] >= 0) {
            continue;
          }
          // 「日」字：先沿直线走一步到马腿，再走到马腿前方那条边两侧格子的对角
          for (const face of board.facesOnEdge(leg, ids[beyondIdx])) {
            const dest = face[(face.indexOf(leg) + 2) % 4];
            if (seen.has(dest)) continue;
            seen.add(dest);
            if (isMountain(board, dest)) continue;
            pushIfAllowed(state, piece, dest, out);
          }
        }
      }
      break;
    }

    case 'elephant': {
      const frame = FACTION_FRAME[piece.faction];
      const c = board.coord(from, frame);
      if (!c) break;
      for (const [df, dr] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const f = c.f + 2 * df;
        const r = c.r + 2 * dr;
        if (f < 0 || f >= FILES || r < 0 || r > LAST_HOME_RANK) continue;
        if (state.occ[board.idAt(frame, c.f + df, c.r + dr)] >= 0) continue; // 塞象眼
        pushIfAllowed(state, piece, board.idAt(frame, f, r), out);
      }
      break;
    }

    case 'advisor':
    case 'king': {
      const frame = FACTION_FRAME[piece.faction];
      const c = board.coord(from, frame);
      if (!c) break;
      const steps =
        piece.kind === 'advisor'
          ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
          : [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [df, dr] of steps) {
        const f = c.f + df;
        const r = c.r + dr;
        if (f < CENTER_FILE - 1 || f > CENTER_FILE + 1 || r < 0 || r > 2) continue; // 九宫
        pushIfAllowed(state, piece, board.idAt(frame, f, r), out);
      }
      break;
    }

    case 'soldier': {
      const frame = FACTION_FRAME[piece.faction];
      const here = soldierProgress(board, frame, from);
      const inHome = board.nodes[from].home === frame;
      // 到了本方河岸（本土最前一线）就可以横走，这样两边被山挡住的兵也能挪到中路过河
      const onBank = inHome && here === LAST_HOME_RANK;
      // 未过河只能直进。过河后：藤甲兵只进不退（可横走）；魏、吴的普通兵还可以后退
      const allowed = (n: number, steps: number) => {
        const p = soldierProgress(board, frame, n);
        if (inHome) return p === here + steps || (onBank && steps === 1 && p === here);
        return isRattan(piece) ? p >= here : true;
      };
      for (const ref of board.nodeLines[from]) {
        const ids = board.lines[ref.line].nodes;
        for (const step of [-1, 1]) {
          const n = ids[ref.index + step];
          if (n === undefined || isMountain(board, n) || !allowed(n, 1)) continue;
          pushIfAllowed(state, piece, n, out);
          // 吴兵通水性：从河岸一步跨过河道到对岸（中间的河道点必须是空的）
          const far = ids[ref.index + 2 * step];
          if (
            piece.faction === 'wu' &&
            !isRiver(board, from) &&
            isRiver(board, n) &&
            state.occ[n] < 0 &&
            far !== undefined &&
            !isRiver(board, far) &&
            !isMountain(board, far) &&
            allowed(far, 2)
          ) {
            pushIfAllowed(state, piece, far, out);
          }
        }
      }
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 将军判定

export function kingOf(state: GameState, faction: Faction): Piece | null {
  for (const p of state.pieces) {
    if (p && p.kind === 'king' && p.owner === faction) return p;
  }
  return null;
}

/** node 上的棋子（属于 defender）能否被任意对手吃到 */
export function isAttacked(board: Board, state: GameState, node: number, defender: Faction): boolean {
  for (const p of state.pieces) {
    if (!p || p.owner === defender) continue;
    if (pieceMoves(board, state, p).includes(node)) return true;
  }
  return false;
}

export function inCheck(board: Board, state: GameState, faction: Faction): boolean {
  const king = kingOf(state, faction);
  return king ? isAttacked(board, state, king.node, faction) : false;
}

// ---------------------------------------------------------------------------
// 执行

function removePiece(state: GameState, node: number): Piece | null {
  const id = state.occ[node];
  if (id < 0) return null;
  const piece = state.pieces[id];
  state.pieces[id] = null;
  state.occ[node] = -1;
  return piece;
}

/** 只改动棋子位置，不推进回合、不记谱。供合法性检查与 AI 使用。 */
export function simulate(board: Board, state: GameState, action: Action): GameState {
  const s = cloneState(state);
  const me = s.turn;
  const moverId = s.occ[action.from];
  const captured = removePiece(s, action.to);
  s.occ[action.from] = -1;
  s.occ[action.to] = moverId;
  s.pieces[moverId]!.node = action.to;
  if (captured?.kind === 'king') eliminate(s, captured.owner, me, 'king-captured');
  const city = board.nodes[action.to].city;
  if (city) s.cities[city] = me;
  return s;
}

/** 势力出局：主公被吃时，残部归降吃掉主公的一方；被困毙时残部归降上一个行棋者 */
function eliminate(s: GameState, loser: Faction, by: Faction | null, reason: 'king-captured' | 'no-moves') {
  if (!s.alive.includes(loser)) return;
  s.alive = s.alive.filter((f) => f !== loser);
  const heir = by && s.alive.includes(by) ? by : null;
  for (const p of s.pieces) {
    if (!p || p.owner !== loser) continue;
    if (p.kind === 'king' || !heir) removePiece(s, p.node);
    else p.owner = heir;
  }
  for (const city of CITY_IDS) {
    if (s.cities[city] === loser) s.cities[city] = heir;
  }
  s.eliminations.push({ faction: loser, by: heir, reason, ply: s.ply });
}

export function legalActions(board: Board, state: GameState, faction: Faction = state.turn): Action[] {
  if (state.result || faction !== state.turn) return [];
  const actions: Action[] = [];
  for (const p of state.pieces) {
    if (!p || p.owner !== faction) continue;
    for (const to of pieceMoves(board, state, p)) {
      const action: Action = { type: 'move', from: p.node, to };
      if (!inCheck(board, simulate(board, state, action), faction)) actions.push(action);
    }
  }
  return actions;
}

export function isLegal(board: Board, state: GameState, action: Action): boolean {
  return legalActions(board, state).some((a) => a.from === action.from && a.to === action.to);
}

function describe(board: Board, state: GameState, action: Action): string {
  const me = state.turn;
  const mover = pieceAt(state, action.from)!;
  const target = pieceAt(state, action.to);
  let text = `${pieceName(mover.kind, mover.faction)} ${board.nodes[action.from].label}→${board.nodes[action.to].label}`;
  if (target) text += `，吃${FACTION_NAME[target.owner]}${pieceName(target.kind, target.faction)}`;
  const city = board.nodes[action.to].city;
  if (city && state.cities[city] !== me) text += `，占领${CITY_NAME[city]}`;
  return text;
}

/** 执行一步（调用方应先确认合法），并推进到下一位行棋者 */
export function applyAction(board: Board, state: GameState, action: Action): GameState {
  const me = state.turn;
  const text = describe(board, state, action);
  const before = state.alive.length;
  const s = simulate(board, state, action);
  s.log.push({ ply: s.ply, faction: me, text });
  for (const e of s.eliminations.slice(s.eliminations.length - (before - s.alive.length))) {
    s.log.push({ ply: s.ply, faction: me, text: `${FACTION_NAME[e.faction]}国主公被擒，残部归降${FACTION_NAME[me]}` });
  }
  s.ply += 1;
  s.lastMover = me;
  s.lastAction = action;
  advanceTurn(board, s);
  return s;
}

export function nextInOrder(alive: readonly Faction[], current: Faction): Faction {
  const start = TURN_ORDER.indexOf(current);
  for (let k = 1; k <= TURN_ORDER.length; k++) {
    const f = TURN_ORDER[(start + k) % TURN_ORDER.length];
    if (alive.includes(f)) return f;
  }
  return current;
}

function advanceTurn(board: Board, s: GameState) {
  for (;;) {
    if (s.alive.length <= 1) {
      s.result = { winner: s.alive[0] ?? null, reason: 'last-standing' };
      return;
    }
    s.turn = nextInOrder(s.alive, s.turn);
    if (garrisonedCities(board, s, s.turn).length === CITY_IDS.length) {
      s.result = { winner: s.turn, reason: 'cities' };
      return;
    }
    if (s.ply >= MAX_PLY) {
      const scores = computeScores(s);
      const best = Math.max(...s.alive.map((f) => scores[f]));
      const leaders = s.alive.filter((f) => scores[f] === best);
      s.result = { winner: leaders.length === 1 ? leaders[0] : null, reason: 'move-limit', scores };
      return;
    }
    if (legalActions(board, s).length > 0) return;
    // 无子可走（被将死或困毙）：出局，残部归降上一个行棋者
    const loser = s.turn;
    eliminate(s, loser, s.lastMover !== loser ? s.lastMover : null, 'no-moves');
    s.log.push({ ply: s.ply, faction: loser, text: `${FACTION_NAME[loser]}国无子可走，出局` });
  }
}

export function computeScores(s: GameState): Record<Faction, number> {
  const scores: Record<Faction, number> = { wei: 0, wu: 0, shu: 0 };
  for (const p of s.pieces) if (p) scores[p.owner] += PIECE_VALUE[p.kind];
  for (const c of CITY_IDS) {
    const owner = s.cities[c];
    if (owner) scores[owner] += CITY_SCORE;
  }
  return scores;
}

/** 城池旗帜：最后一个进驻的势力（离开后旗帜仍在），用于回合上限计分 */
export function citiesOwned(s: GameState, f: Faction): CityId[] {
  return CITY_IDS.filter((c) => s.cities[c] === f);
}

/** 驻军：城上站着 f 的棋子。轮到你时三城都有己方驻军即获胜（荆州霸业）。 */
export function garrisonedCities(board: Board, s: GameState, f: Faction): CityId[] {
  return CITY_IDS.filter((c) => pieceAt(s, board.cityNode[c])?.owner === f);
}
