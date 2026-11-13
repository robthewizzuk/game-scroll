// Board games on a grid: match-3, merge, 2048-style sliding, sorting, mine and block puzzles. The kit
// keeps the cells, finds matches, drops pieces into gaps, fills from the top, slides and merges, and
// moves each piece's drawn position smoothly; your game draws the pieces and sets the rules.
//
//   const { Board } = gs.board;
//   reset() { b = new Board(8, 8, { fill: () => ({ kind: rnd(5) | 0 }) }); b.settle(); }   // no matches at the start
//   down(x, y) { pick = b.cellAt(x, y, X0, Y0, SIZE); }
//   up(x, y) {
//     const to = b.cellAt(x, y, X0, Y0, SIZE); if (!pick || !to || !b.adjacent(pick, to)) return;
//     b.swap(pick, to);
//     if (!b.matches().length) b.swap(pick, to);                    // no match: swap back (it animates)
//   }
//   update(dt) {
//     b.update(dt);                                                  // moves pieces towards their cells
//     if (!b.busy) { const g = b.matches(); if (g.length) { score += b.clear(g); b.fall(); b.refill(); } }
//   }
//   draw(c) { b.each((p, col, row) => drawGem(c, X0 + p.x * SIZE, Y0 + p.y * SIZE, p.kind)); }
//
// A piece is any object you like; the board adds x, y (where it is drawn, in cells) and its cell.
// same(a, b) says which pieces match (default: equal `kind`).
//
// 2048-style: b.slide('left', { merge: (a, b) => a.kind === b.kind && { kind: a.kind * 2 } }) returns
// { moved, merged: [piece...] }. Flood fill: b.flood(col, row) (connected same pieces, for "pop the
// group" games). b.hint() finds a swap that makes a match; b.shuffle() when there is none.

const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

export class Board {
  constructor(cols, rows, { fill = null, same = (a, b) => a && b && a.kind === b.kind, speed = 12, rng = Math.random } = {}) {
    this.cols = cols; this.rows = rows; this.fillFn = fill; this.same = same; this.speed = speed; this.rng = rng;
    this.cells = new Array(cols * rows).fill(null);
    this.gone = [];   // pieces cleared this frame (for effects): read and empty it yourself
    if (fill) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) this.put(c, r, fill(c, r, this));
  }
  in(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }
  get(c, r) { return this.in(c, r) ? this.cells[r * this.cols + c] : null; }
  /** Puts a piece in a cell (drawn there at once unless it already has a position). */
  put(c, r, p) {
    if (!this.in(c, r)) return null;
    this.cells[r * this.cols + c] = p;
    if (p) { p.col = c; p.row = r; if (p.x === undefined) { p.x = c; p.y = r; } }
    return p;
  }
  take(c, r) { const p = this.get(c, r); if (p) this.cells[r * this.cols + c] = null; return p; }
  /** Calls fn(piece, col, row) for every piece. */
  each(fn) { for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) { const p = this.cells[r * this.cols + c]; if (p) fn(p, c, r); } }
  get pieces() { const a = []; this.each(p => a.push(p)); return a; }
  /** The cell under a point, for a board drawn at (x0, y0) with cells `size` wide: { col, row } or null. */
  cellAt(x, y, x0 = 0, y0 = 0, size = 1) { const c = Math.floor((x - x0) / size), r = Math.floor((y - y0) / size); return this.in(c, r) ? { col: c, row: r } : null; }
  adjacent(a, b) { return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1; }
  neighbours(c, r, diagonal = false) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc || !diagonal && dr && dc) continue;
      if (this.in(c + dc, r + dr)) out.push({ col: c + dc, row: r + dr, piece: this.get(c + dc, r + dr) });
    }
    return out;
  }

  /** Swaps two cells ({ col, row } each); the pieces slide across. */
  swap(a, b) {
    const pa = this.get(a.col, a.row), pb = this.get(b.col, b.row);
    this.put(a.col, a.row, pb); this.put(b.col, b.row, pa);
    if (!pb) this.cells[a.row * this.cols + a.col] = null;
    if (!pa) this.cells[b.row * this.cols + b.col] = null;
    return this;
  }

  /**
   * Lines of `min` or more matching pieces in a row or column. Crossing lines (L and T shapes) come
   * back as one group. Returns [{ pieces, cells: [{ col, row }], shape: 'line' | 'cross', size }].
   */
  matches({ min = 3 } = {}) {
    const mark = new Map(); let id = 0;
    const join = (cells) => {
      const ids = new Set(cells.map(k => mark.get(k)).filter(v => v !== undefined));
      const g = ids.size ? Math.min(...ids) : id++;
      for (const [k, v] of mark) if (ids.has(v)) mark.set(k, g);
      for (const k of cells) mark.set(k, g);
    };
    const run = (len, at) => {
      for (let i = 0; i < len;) {
        const p = at(i); let j = i + 1;
        if (p) while (j < len && this.same(p, at(j))) j++;
        if (p && j - i >= min) { const cells = []; for (let k = i; k < j; k++) cells.push(at.key(k)); join(cells); }
        i = j;
      }
    };
    for (let r = 0; r < this.rows; r++) { const at = c => this.get(c, r); at.key = c => r * this.cols + c; run(this.cols, at); }
    for (let c = 0; c < this.cols; c++) { const at = r => this.get(c, r); at.key = r => r * this.cols + c; run(this.rows, at); }
    const groups = new Map();
    for (const [k, g] of mark) { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(k); }
    return [...groups.values()].map(ks => {
      const cells = ks.map(k => ({ col: k % this.cols, row: Math.floor(k / this.cols) }));
      const rows = new Set(cells.map(c => c.row)).size, cols = new Set(cells.map(c => c.col)).size;
      return { cells, pieces: cells.map(c => this.get(c.col, c.row)), size: cells.length, shape: rows > 1 && cols > 1 ? 'cross' : 'line' };
    });
  }
  /** Removes these groups (or cells); returns how many pieces went. They're also in board.gone. */
  clear(groups) {
    let n = 0;
    for (const g of [].concat(groups)) for (const c of g.cells || [g]) { const p = this.take(c.col, c.row); if (p) { this.gone.push(p); n++; } }
    return n;
  }
  /** Pieces fall into the gaps below them (towards `dir`, default down). Returns the pieces that moved. */
  fall(dir = 'down') {
    const [dc, dr] = DIRS[dir], moved = [];
    const lines = dr ? this.cols : this.rows, len = dr ? this.rows : this.cols;
    for (let l = 0; l < lines; l++) {
      let to = 0;
      for (let k = 0; k < len; k++) {
        const i = (dr || dc) > 0 ? len - 1 - k : k, t = (dr || dc) > 0 ? len - 1 - to : to;
        const [c, r] = dr ? [l, i] : [i, l], [tc, tr] = dr ? [l, t] : [t, l];
        const p = this.get(c, r); if (!p) continue;
        if (c !== tc || r !== tr) { this.take(c, r); this.put(tc, tr, p); moved.push(p); }
        to++;
      }
    }
    return moved;
  }
  /** Fills empty cells with fill(col, row), starting above the board so they drop in. Returns the new pieces. */
  refill(fill = this.fillFn) {
    const made = [];
    for (let c = 0; c < this.cols; c++) {
      let above = 0;
      for (let r = this.rows - 1; r >= 0; r--) if (!this.get(c, r)) above++;
      for (let r = 0, k = 0; r < this.rows; r++) if (!this.get(c, r)) {
        const p = fill(c, r, this); if (!p) continue;
        p.x = c; p.y = -above + k++; this.put(c, r, p); made.push(p);
      }
    }
    return made;
  }
  /** Re-rolls pieces until there are no matches (and a move exists): a fair start. */
  settle({ min = 3, tries = 200 } = {}) {
    for (let t = 0; t < tries; t++) {
      const g = this.matches({ min });
      if (!g.length) { if (this.hint({ min }) || t > tries / 2) return this; this.shuffle(); continue; }
      // (a piece of another kind, in a cell of the match chosen at random: a fill that comes round in a cycle gave each match its own kind
      // back every time, or put back one that had just been taken away, and about one start in 400 ended with matches still on the board)
      for (const grp of g) { const c = grp.cells[Math.floor(this.rng() * grp.cells.length)], was = this.get(c.col, c.row); let p = this.fillFn?.(c.col, c.row, this); for (let k = 0; k < 8 && p && this.same(p, was); k++) p = this.fillFn(c.col, c.row, this); if (p) { p.x = c.col; p.y = c.row; this.put(c.col, c.row, p); } }
    }
    return this;
  }
  /** A swap that makes a match: { a, b } or null. */
  hint({ min = 3 } = {}) {
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) for (const [dc, dr] of [[1, 0], [0, 1]]) {
      const a = { col: c, row: r }, b = { col: c + dc, row: r + dr }; if (!this.in(b.col, b.row)) continue;
      const pa = this.get(a.col, a.row), pb = this.get(b.col, b.row); if (!pa || !pb || this.same(pa, pb)) continue;
      this.cells[r * this.cols + c] = pb; this.cells[b.row * this.cols + b.col] = pa;
      const ok = this.matches({ min }).length > 0;
      this.cells[r * this.cols + c] = pa; this.cells[b.row * this.cols + b.col] = pb;
      if (ok) return { a, b };
    }
    return null;
  }
  /** Mixes the pieces around (they slide to their new cells). */
  shuffle() {
    const ps = this.pieces, cells = ps.map(p => ({ col: p.col, row: p.row }));
    for (let i = ps.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [ps[i], ps[j]] = [ps[j], ps[i]]; }
    ps.forEach((p, i) => this.put(cells[i].col, cells[i].row, p));
    return this;
  }
  /**
   * 2048-style: every piece slides as far as it can towards dir; merge(a, b) returning a new piece
   * joins two (once per piece per slide). Returns { moved, merged: [new pieces], gone: [old pieces] }.
   */
  slide(dir, { merge = null } = {}) {
    const [dc, dr] = DIRS[dir]; let moved = false; const merged = [], gone = [];
    const lines = dr ? this.cols : this.rows, len = dr ? this.rows : this.cols, fwd = (dr || dc) > 0;
    for (let l = 0; l < lines; l++) {
      let to = 0, last = null;
      for (let k = 0; k < len; k++) {
        const i = fwd ? len - 1 - k : k;
        const [c, r] = dr ? [l, i] : [i, l];
        const p = this.get(c, r); if (!p) continue;
        const m = last && !last.justMerged && merge ? merge(last, p) : null;
        if (m) {
          this.take(c, r); this.take(last.col, last.row);
          m.x = last.x; m.y = last.y; m.justMerged = true;
          this.put(last.col, last.row, m); p.col = last.col; p.row = last.row;   // the old piece slides into the merge spot
          gone.push(p, last); merged.push(m); last = m; moved = true; continue;
        }
        const t = fwd ? len - 1 - to : to, [tc, tr] = dr ? [l, t] : [t, l];
        if (c !== tc || r !== tr) { this.take(c, r); this.put(tc, tr, p); moved = true; }
        last = p; to++;
      }
    }
    for (const m of merged) delete m.justMerged;
    this.gone.push(...gone);
    return { moved, merged, gone };
  }
  /** The connected cells of the same piece as (col, row): [{ col, row }]. */
  flood(col, row, same = this.same) {
    const start = this.get(col, row); if (!start) return [];
    const seen = new Set([row * this.cols + col]), out = [], q = [[col, row]];
    while (q.length) {
      const [c, r] = q.pop(); out.push({ col: c, row: r });
      for (const [dc, dr] of Object.values(DIRS)) {
        const nc = c + dc, nr = r + dr, k = nr * this.cols + nc;
        if (!this.in(nc, nr) || seen.has(k)) continue;
        const p = this.get(nc, nr); if (p && same(start, p)) { seen.add(k); q.push([nc, nr]); }
      }
    }
    return out;
  }
  /** Moves every piece's drawn x, y towards its cell (speed in cells a second). */
  update(dt) {
    const step = this.speed * dt; let busy = false;
    this.each(p => {
      const dx = p.col - p.x, dy = p.row - p.y;
      if (dx || dy) {
        const d = Math.hypot(dx, dy), k = d <= step ? 1 : step / d;
        p.x += dx * k; p.y += dy * k; if (k < 1) busy = true;
      }
    });
    this.busy = busy;
    return this;
  }
}
