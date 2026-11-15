// Chess for board games (gs.tabletop.Chess): the rules from chess.js (every legal move, check, mate,
// stalemate, castling, en passant, promotion, the draw rules) and a computer opponent that thinks in a
// worker, so the 3D keeps moving. Your game draws the board and pieces and decides everything else.
//
//   const { Chess } = gs.tabletop;
//   reset() { game = new Chess(api.load(null)?.fen); }            // make it in make() or reset(): the rules load first
//   game.moves('e2')            // [{ from, to, piece, color, captured, promotion, castle, enPassant, san }]
//   const m = game.move({ from: 'e2', to: 'e4' });                // null if it isn't legal; promotion: 'q' | 'r' | 'b' | 'n'
//   game.turn ('w' | 'b'), game.check, game.mate, game.stalemate, game.draw, game.over, game.fen
//   const reply = await game.think({ level: 2 });                 // { from, to, promotion }; levels 1..5 (Chess.LEVELS)
//   game.at('e4')               // { type: 'p', color: 'w' } or null;   game.pieces(): [{ square, type, color }]
import { lazy } from './lazy.js';
import { bestMove, LEVELS, evaluate } from './chess-ai.js';

const lib = lazy('The chess rules', () => import('chess.js'));
/** Loads the rules ahead of a game that needs them. */
export const loadChess = () => lib.load();

let worker = null, workerOff = false, jobs = 0;
const waiting = new Map();
function thinker() {
  if (worker || workerOff || typeof Worker !== 'function') return worker;
  try {
    worker = new Worker(new URL('./chess-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => { const w = waiting.get(e.data.job); if (w) { waiting.delete(e.data.job); w(e.data); } };
    worker.onerror = () => { workerOff = true; worker = null; for (const [, w] of waiting) w({ error: 'worker' }); waiting.clear(); };
  } catch { workerOff = true; worker = null; }
  return worker;
}

const slim = m => m && ({ from: m.from, to: m.to, piece: m.piece, color: m.color, captured: m.captured || null, promotion: m.promotion || null,
  castle: m.flags.includes('k') ? 'k' : m.flags.includes('q') ? 'q' : null, enPassant: m.flags.includes('e'), san: m.san });

export class Chess {
  /** fen: a position to start from (a saved game); left out, the usual start. */
  constructor(fen = null) {
    const { Chess: Rules } = lib.get();
    try { this.g = fen ? new Rules(fen) : new Rules(); } catch { this.g = new Rules(); }   // a damaged save starts a fresh game
  }
  /** 'w' or 'b': whose move it is. */
  get turn() { return this.g.turn(); }
  /** The position as text (FEN): small enough for api.save. */
  get fen() { return this.g.fen(); }
  get check() { return this.g.isCheck(); }
  get mate() { return this.g.isCheckmate(); }
  get stalemate() { return this.g.isStalemate(); }
  /** A draw of any kind: stalemate, too little material, the same position three times, fifty quiet moves. */
  get draw() { return this.g.isDraw(); }
  get over() { return this.g.isGameOver(); }
  /** How many moves have been played in this object (not counting any before a loaded position). */
  get count() { return this.g.history().length; }
  /** The piece on a square ('e4'): { type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k', color: 'w' | 'b' }, or null. */
  at(square) { return this.g.get(square) || null; }
  /** Every piece on the board: [{ square, type, color }]. */
  pieces() { return this.g.board().flat().filter(Boolean); }
  /** Legal moves, for one square or all of them. */
  moves(square = null) { return this.g.moves(square ? { square, verbose: true } : { verbose: true }).map(slim); }
  /** Plays { from, to, promotion } if it's legal and returns the move (with captured, castle, enPassant); else null. */
  move(m) { try { return slim(this.g.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' })); } catch { return null; } }
  /** Takes the last move back; returns it, or null. */
  undo() { return slim(this.g.undo()); }
  /** How the position stands for white in pawns (+1.5 is a pawn and a half up). */
  get balance() { return evaluate(this.g) / 100; }
  /**
   * The computer's move for the side to move: resolves { from, to, promotion } (null if there's none).
   * level 1..5 (Novice, Casual, Club, Sharp, Master); time: thinking time in ms (each level has its own).
   * skill 0..1 instead of a level: a number, or a gs.brains.Dial that follows the player.
   */
  think({ level = 2, time = null, skill = null } = {}) {
    if (skill != null && isFinite(+skill)) level = 1 + Math.max(0, Math.min(4, Math.floor(+skill * 5)));
    const fen = this.g.fen(), w = thinker();
    const here = () => { const { Chess: Rules } = lib.get(); return bestMove(new Rules(fen), { level, time: time ?? Math.min(LEVELS[Math.max(0, Math.min(4, level - 1))].time, 150) }); };   // no worker: a short think on the spot
    if (!w) return Promise.resolve(here());
    return new Promise(res => {
      const job = ++jobs;
      waiting.set(job, d => res(d.error ? here() : d.move));
      w.postMessage({ job, fen, level, time });
    });
  }
}
/** The opponent's levels: [{ name, depth, time }]. */
Chess.LEVELS = LEVELS.map(l => Object.freeze({ name: l.name, depth: l.depth, time: l.time }));
