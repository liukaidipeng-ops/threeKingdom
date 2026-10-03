import './style.css';
import { chooseAction } from '../engine/ai';
import { getBoard } from '../engine/board';
import {
  CITY_IDS,
  CITY_SCORE,
  COMMON_RULES,
  FACTION_ABILITY,
  FACTION_COLOR,
  FACTION_FRAME,
  FACTION_NAME,
  FACTION_RULER,
  TURN_ORDER,
} from '../engine/factions';
import {
  applyAction,
  citiesOwned,
  computeScores,
  garrisonedCities,
  inCheck,
  initialState,
  legalActions,
} from '../engine/rules';
import type { Action, Faction, GameState } from '../engine/types';
import { Layout, rotationFor } from './geometry';
import { renderDynamic, renderStatic } from './render';

type Controller = 'human' | 'ai';
type ViewMode = 'map' | 'follow' | Faction;

/** 电脑每步之间的停顿，可用 ?delay=0 加速（例如观看电脑对局） */
const AI_DELAY_MS = Number(new URLSearchParams(location.search).get('delay') ?? 450);

const board = getBoard();
let state: GameState = initialState(board);
let history: GameState[] = [];
const controllers: Record<Faction, Controller> = { shu: 'human', wu: 'human', wei: 'human' };

let viewMode: ViewMode = 'map';
let followRotation = 0;
let selected: number | null = null;
let aiToken = 0;
let overlayDismissed = false;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = document.getElementById('board') as unknown as SVGSVGElement;

// ---------------------------------------------------------------------------
// 缓存

const layouts = new Map<number, { layout: Layout; staticSvg: string }>();
function currentLayout() {
  let rotation = 0;
  if (viewMode === 'follow') rotation = followRotation;
  else if (viewMode !== 'map') rotation = rotationFor(FACTION_FRAME[viewMode]);
  let entry = layouts.get(rotation);
  if (!entry) {
    const layout = new Layout(board, rotation);
    entry = { layout, staticSvg: renderStatic(board, layout) };
    layouts.set(rotation, entry);
  }
  return entry;
}

let legalCache: { state: GameState; actions: Action[] } | null = null;
function legal(): Action[] {
  if (legalCache?.state !== state) legalCache = { state, actions: legalActions(board, state) };
  return legalCache.actions;
}

const isHumanTurn = () => !state.result && controllers[state.turn] === 'human';

function moveTargets(): number[] {
  if (selected === null) return [];
  return legal().flatMap((a) => (a.type === 'move' && a.from === selected ? [a.to] : []));
}

// ---------------------------------------------------------------------------
// 渲染

function render() {
  const { layout, staticSvg } = currentLayout();
  svg.innerHTML =
    staticSvg +
    renderDynamic(board, layout, state, {
      selected,
      moveTargets: isHumanTurn() ? moveTargets() : [],
    });
  renderPanel();
}

const REASON_TEXT = {
  'last-standing': '一统天下',
  cities: '荆州霸业（三城驻军）',
  'move-limit': '回合上限，按子力与城池计分',
} as const;

function factionTag(f: Faction): string {
  return `<b style="color:${FACTION_COLOR[f]}">${FACTION_NAME[f]}</b>`;
}

function renderPanel() {
  const turnEl = $('turn');
  if (state.result) {
    const { winner, reason } = state.result;
    turnEl.innerHTML = `<div class="who">${winner ? `${factionTag(winner)} 获胜` : '平局'}</div><div class="hint">${REASON_TEXT[reason]}</div>`;
  } else {
    const me = state.turn;
    let hint: string;
    if (!isHumanTurn()) hint = '电脑思考中…';
    else if (selected !== null) hint = '点击绿色标记的位置走子';
    else hint = '点击己方棋子';
    const alert = inCheck(board, state, me) ? '<div class="alert">主公被将军！</div>' : '';
    turnEl.innerHTML = `<div class="who">轮到 ${factionTag(me)}（${FACTION_RULER[me]}）</div><div class="hint">第 ${Math.floor(state.ply / 3) + 1} 轮 · ${hint}</div>${alert}`;
  }

  const scores = computeScores(state);
  $('players').innerHTML = TURN_ORDER.map((f) => {
    const alive = state.alive.includes(f);
    const out = state.eliminations.find((e) => e.faction === f);
    const tags: string[] = [];
    if (alive && inCheck(board, state, f)) tags.push('<span class="tag">被将军</span>');
    if (out) tags.push(`<span class="tag">出局${out.by ? `，归降${FACTION_NAME[out.by]}` : ''}</span>`);
    const cities = citiesOwned(state, f).length;
    const garrison = garrisonedCities(board, state, f).length;
    const cls = ['player', alive ? '' : 'out', !state.result && state.turn === f ? 'current' : ''].join(' ');
    return `<div class="${cls}">
      <span class="dot" style="background:${FACTION_COLOR[f]}"></span>
      <div><b>${FACTION_NAME[f]}</b> ${FACTION_RULER[f]}${tags.join('')}
        <div class="meta">驻军 ${garrison}/${CITY_IDS.length} 城 · 城旗 ${cities} · 子力 ${alive ? scores[f] - cities * CITY_SCORE : 0}</div></div>
      <select data-faction="${f}" ${alive ? '' : 'disabled'}>
        <option value="human" ${controllers[f] === 'human' ? 'selected' : ''}>玩家</option>
        <option value="ai" ${controllers[f] === 'ai' ? 'selected' : ''}>电脑</option>
      </select>
    </div>`;
  }).join('');

  $<HTMLButtonElement>('undo').disabled = history.length === 0;

  $('log').innerHTML = state.log
    .map((e) => `<li>${factionTag(e.faction)} ${e.text}</li>`)
    .reverse()
    .join('');

  const overlay = $('overlay');
  if (state.result && !overlayDismissed) {
    const { winner, reason, scores: finalScores } = state.result;
    $('overlay-title').innerHTML = winner ? `${factionTag(winner)} 获胜` : '平局';
    let text = REASON_TEXT[reason];
    if (finalScores) text += '：' + TURN_ORDER.map((f) => `${FACTION_NAME[f]} ${finalScores[f]}`).join('，');
    $('overlay-text').textContent = text;
    overlay.hidden = false;
  } else {
    overlay.hidden = true;
  }
}

function renderAbilities() {
  const list = (lines: string[]) => `<ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
  $('abilities').innerHTML =
    TURN_ORDER.map((f) => {
      const a = FACTION_ABILITY[f];
      return `<div class="ability"><h3 style="color:${FACTION_COLOR[f]}">${FACTION_NAME[f]} · ${a.title}</h3>${list(a.lines)}</div>`;
    }).join('') + `<div class="ability"><h3>通用</h3>${list(COMMON_RULES)}</div>`;
}

// ---------------------------------------------------------------------------
// 交互

function commit(action: Action) {
  history.push(state);
  state = applyAction(board, state, action);
  selected = null;
  if (viewMode === 'follow' && controllers[state.turn] === 'human') {
    followRotation = rotationFor(FACTION_FRAME[state.turn]);
  }
  render();
  scheduleAI();
}

function scheduleAI() {
  const token = ++aiToken;
  if (state.result || controllers[state.turn] !== 'ai') return;
  window.setTimeout(() => {
    if (token !== aiToken) return;
    const action = chooseAction(board, state);
    if (action) commit(action);
  }, AI_DELAY_MS);
}

function onNodeClick(node: number) {
  if (!isHumanTurn()) return;
  if (selected !== null && moveTargets().includes(node)) {
    commit({ type: 'move', from: selected, to: node });
    return;
  }
  const pieceId = state.occ[node];
  const piece = pieceId >= 0 ? state.pieces[pieceId] : null;
  selected = piece && piece.owner === state.turn && selected !== node ? node : null;
  render();
}

svg.addEventListener('click', (e) => {
  const hit = (e.target as Element).closest('[data-node]');
  if (hit) onNodeClick(Number(hit.getAttribute('data-node')));
});

$('undo').addEventListener('click', () => {
  if (history.length === 0) return;
  aiToken++;
  do {
    state = history.pop()!;
  } while (history.length > 0 && controllers[state.turn] !== 'human');
  selected = null;
  overlayDismissed = false;
  render();
  scheduleAI();
});

function restart() {
  aiToken++;
  state = initialState(board);
  history = [];
  selected = null;
  overlayDismissed = false;
  followRotation = viewMode === 'follow' ? rotationFor(FACTION_FRAME[state.turn]) : 0;
  render();
  scheduleAI();
}

$('restart').addEventListener('click', restart);
$('overlay-restart').addEventListener('click', restart);
$('overlay-close').addEventListener('click', () => {
  overlayDismissed = true;
  render();
});

$('players').addEventListener('change', (e) => {
  const select = e.target as HTMLSelectElement;
  const faction = select.dataset.faction as Faction | undefined;
  if (!faction) return;
  controllers[faction] = select.value as Controller;
  selected = null;
  render();
  scheduleAI();
});

$<HTMLSelectElement>('view').addEventListener('change', (e) => {
  viewMode = (e.target as HTMLSelectElement).value as ViewMode;
  if (viewMode === 'follow') followRotation = rotationFor(FACTION_FRAME[state.turn]);
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && selected !== null) {
    selected = null;
    render();
  }
});

// 方便在浏览器控制台里调试
Object.assign(window, {
  __game: {
    board,
    controllers,
    legal,
    get state() {
      return state;
    },
  },
});

// ---------------------------------------------------------------------------
// 手机上棋盘太小：提供放大（棋盘在自己的容器里横向滚动）

const ZOOM_LEVELS = [1, 1.6, 2.2];
let zoomIndex = 0;
function applyZoom() {
  const wrap = svg.parentElement!;
  const zoom = ZOOM_LEVELS[zoomIndex];
  svg.style.width = `${zoom * 100}%`;
  svg.style.maxWidth = zoom > 1 ? 'none' : '';
  wrap.classList.toggle('zoomed', zoom > 1);
  wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2;
  $('zoom-label').textContent = `${Math.round(zoom * 100)}%`;
  $<HTMLButtonElement>('zoom-out').disabled = zoomIndex === 0;
  $<HTMLButtonElement>('zoom-in').disabled = zoomIndex === ZOOM_LEVELS.length - 1;
}
$('zoom-in').addEventListener('click', () => {
  zoomIndex = Math.min(zoomIndex + 1, ZOOM_LEVELS.length - 1);
  applyZoom();
});
$('zoom-out').addEventListener('click', () => {
  zoomIndex = Math.max(zoomIndex - 1, 0);
  applyZoom();
});

// ---------------------------------------------------------------------------
// 启动。发布为 Artifact 时，页面更新后可以接着下刚才那盘棋。

interface HotData {
  state?: GameState;
  history?: GameState[];
  controllers?: Record<Faction, Controller>;
  viewMode?: ViewMode;
}
interface Hot {
  data?: HotData;
  snapshot?: (fn: () => HotData) => void;
  ready?: (fn: (data: HotData) => void) => void;
}
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

function start(data: HotData = {}) {
  const saved = data.state;
  if (saved && Array.isArray(saved.pieces) && saved.occ?.length === board.nodes.length) {
    state = saved;
    history = data.history ?? [];
    Object.assign(controllers, data.controllers ?? {});
    viewMode = data.viewMode ?? 'map';
    $<HTMLSelectElement>('view').value = viewMode;
    if (viewMode === 'follow') followRotation = rotationFor(FACTION_FRAME[state.turn]);
  }
  renderAbilities();
  render();
  applyZoom();
  scheduleAI();
}

document.documentElement.lang = 'zh-CN';
try {
  hot?.snapshot?.(() => ({ state, history: history.slice(-40), controllers: { ...controllers }, viewMode }));
} catch {
  // 不在 Artifact 里时没有 hot，忽略
}
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
