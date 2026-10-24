// Game server: serves the page and model files, and runs the lobby, matchmaking and game rooms over WebSocket.
// Every move is re-checked with chess.js here, so a modified client can't play illegal moves.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer } from 'ws';
import { Chess } from 'chess.js';
import { glicko2 } from './glicko2.js';

const ROOT = import.meta.dirname, PORT = process.env.PORT || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

// --- database: accounts, sessions, finished games ---
const DB_FILE = process.env.DB_FILE || join(ROOT, 'data', 'chess.db');
if (DB_FILE !== ':memory:') mkdirSync(join(DB_FILE, '..'), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 2000;'); // readers don't block the writer; wait briefly instead of failing on a lock
db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, hash TEXT NOT NULL,
    rating REAL NOT NULL DEFAULT 1500, rd REAL NOT NULL DEFAULT 350, vol REAL NOT NULL DEFAULT 0.06, created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY, white INTEGER REFERENCES users(id), black INTEGER REFERENCES users(id),
    tc TEXT NOT NULL, pgn TEXT NOT NULL, winner TEXT, reason TEXT NOT NULL, rated INTEGER NOT NULL,
    white_change INTEGER, black_change INTEGER, ended INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS games_by_white ON games(white, ended);
  CREATE INDEX IF NOT EXISTS games_by_black ON games(black, ended);
  CREATE TABLE IF NOT EXISTS live_rooms (id TEXT PRIMARY KEY, data TEXT NOT NULL, touched INTEGER NOT NULL);
`);
// databases made before Glicko-2 lack the deviation and volatility columns
const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userCols.includes('rd')) db.exec('ALTER TABLE users ADD COLUMN rd REAL NOT NULL DEFAULT 350');
if (!userCols.includes('vol')) db.exec('ALTER TABLE users ADD COLUMN vol REAL NOT NULL DEFAULT 0.06');
// what other players and the page see: a rounded rating, flagged "?" while it is still uncertain
const publicUser = u => u && { id: u.id, name: u.name, rating: Math.round(u.rating), provisional: u.rd > 110 };
const SESSION_MS = 30 * 864e5;
const sha = t => createHash('sha256').update(t).digest('hex'); // session tokens are stored hashed
// scrypt runs on the libuv thread pool, so hashing never blocks game traffic on the event loop
const scryptAsync = promisify(scrypt);
async function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scryptAsync(pw, salt, 64)).toString('hex')}`;
}
async function checkPassword(pw, stored) {
  const [salt, key] = stored.split(':');
  return timingSafeEqual(await scryptAsync(pw, salt, 64), Buffer.from(key, 'hex'));
}
const DUMMY_HASH = `${'0'.repeat(32)}:${'0'.repeat(128)}`; // checked for unknown names so a miss takes as long as a hit
const cookies = req => Object.fromEntries((req.headers.cookie ?? '').split(';').map(p => p.trim().split('=')).filter(p => p.length === 2));
function userFromReq(req) {
  const sid = cookies(req).sid;
  return sid ? db.prepare(`SELECT u.id, u.name, u.rating, u.rd, u.vol FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.created > ?`).get(sha(sid), Date.now() - SESSION_MS) ?? null : null;
}
// HTTPS directly, or behind a proxy/host (Render, Fly, nginx) that terminates TLS and says so
const cookieFlags = req => 'HttpOnly; SameSite=Lax; Path=/' + (req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '');
function startSession(req, res, user) {
  const sid = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(sha(sid), user.id, Date.now());
  res.setHeader('Set-Cookie', `sid=${sid}; ${cookieFlags(req)}; Max-Age=${SESSION_MS / 1000}`);
}

// Behind a reverse proxy every request comes from the proxy's address; set TRUST_PROXY=1 there so
// limits apply per real client (the first X-Forwarded-For hop). Never set it when clients connect directly.
const clientIp = req => (process.env.TRUST_PROXY && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress;
// at most `max` events per `ms` for each key; returns false once the key is over the limit
function limiter(max, ms) {
  const hits = new Map();
  const allow = key => {
    const now = Date.now(), recent = (hits.get(key) ?? []).filter(t => now - t < ms);
    if (recent.length >= max) { hits.set(key, recent); return false; }
    hits.set(key, [...recent, now]);
    return true;
  };
  allow.sweep = () => { const now = Date.now(); for (const [k, v] of hits) if (v.every(t => now - t >= ms)) hits.delete(k); };
  return allow;
}
const signupLimit = limiter(5, 60 * 6e4), loginLimit = limiter(20, 15 * 6e4);
const RESERVED = /^(guest|white|black|stockfish|admin|administrator|moderator|system|server|3dchess)$/i; // names that read like system labels

// --- JSON API: sign up, sign in, sign out, profiles ---
const json = (res, code, body) => res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
// Sent with every response. Scripts come only from this site (three.js, chess.js and Stockfish are served
// from vendor/); the page's own inline scripts (import map, module script) are allowed by their exact hash,
// so no other inline script can run. Only the fonts come from Google.
const csp = (scriptHashes = []) => ["default-src 'self'", ["script-src 'self'", ...scriptHashes.map(h => `'sha256-${h}'`)].join(' '),
  "worker-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:", "connect-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
const inlineScriptHashes = html => [...html.toString().matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .filter(m => m[1].trim()).map(m => createHash('sha256').update(m[1]).digest('base64'));
const SECURITY_HEADERS = {
  'Content-Security-Policy': csp(),
  'X-Frame-Options': 'DENY', // no framing: stops clickjacking of Resign and similar buttons
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin', // game links in the URL don't leak to the font host
};
async function readJson(req) {
  let body = '';
  for await (const chunk of req) if ((body += chunk).length > 1e4) throw new Error('too big');
  return JSON.parse(body || '{}');
}

async function api(req, res, path) {
  if (req.method === 'POST') {
    // JSON-only POSTs can't be sent by a plain cross-site form, which keeps sign-in safe from CSRF
    if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Send JSON.' });
    let body;
    try { body = await readJson(req); } catch { return json(res, 400, { error: 'Bad request.' }); }
    const name = String(body.name ?? '').trim(), password = String(body.password ?? '');

    if (path === '/api/signup') {
      if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) return json(res, 400, { error: 'Names are 3-20 letters, digits or _.' });
      if (RESERVED.test(name)) return json(res, 400, { error: 'That name is reserved. Pick another one.' });
      if (password.length < 8 || password.length > 200) return json(res, 400, { error: 'Passwords need at least 8 characters.' });
      if (!signupLimit(clientIp(req))) return json(res, 429, { error: 'Too many new accounts from your network. Try again later.' });
      const hash = await hashPassword(password);
      try {
        const { lastInsertRowid } = db.prepare('INSERT INTO users (name, hash, created) VALUES (?, ?, ?)').run(name, hash, Date.now());
        const user = { id: Number(lastInsertRowid), name, rating: 1500, rd: 350 };
        startSession(req, res, user);
        return json(res, 201, { user: publicUser(user) });
      } catch {
        return json(res, 409, { error: 'That name is taken.' });
      }
    }
    if (path === '/api/login') {
      if (!loginLimit(clientIp(req))) return json(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
      const row = db.prepare('SELECT id, name, rating, rd, hash FROM users WHERE name = ?').get(name);
      const ok = await checkPassword(password, row?.hash ?? DUMMY_HASH); // always hash, so timing doesn't reveal which names exist
      if (!row || !ok) return json(res, 401, { error: 'Wrong name or password.' });
      startSession(req, res, row);
      return json(res, 200, { user: publicUser(row) });
    }
    if (path === '/api/logout') {
      const sid = cookies(req).sid;
      if (sid) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(sha(sid));
        for (const ws of wss.clients) if (ws.sid === sha(sid)) ws.close(4001, 'signed out'); // the session is gone for open sockets too
      }
      res.setHeader('Set-Cookie', `sid=; ${cookieFlags(req)}; Max-Age=0`);
      return json(res, 200, { user: null });
    }
  }
  if (req.method === 'GET') {
    if (path === '/api/me') return json(res, 200, { user: publicUser(userFromReq(req)) });
    const profile = path.match(/^\/api\/users\/([A-Za-z0-9_]{3,20})$/);
    if (profile) {
      const u = db.prepare('SELECT id, name, rating, rd, created FROM users WHERE name = ?').get(profile[1]);
      if (!u) return json(res, 404, { error: 'No such player.' });
      const games = db.prepare(`SELECT g.id, g.tc, g.winner, g.reason, g.rated, g.ended, g.white_change, g.black_change,
          wu.name AS white, bu.name AS black FROM games g LEFT JOIN users wu ON wu.id = g.white LEFT JOIN users bu ON bu.id = g.black
        WHERE g.white = ? OR g.black = ? ORDER BY g.ended DESC LIMIT 30`).all(u.id, u.id);
      return json(res, 200, { ...publicUser(u), created: u.created, games });
    }
    const game = path.match(/^\/api\/games\/(\d+)$/);
    if (game) {
      const g = db.prepare('SELECT id, pgn FROM games WHERE id = ?').get(Number(game[1]));
      return g ? json(res, 200, g) : json(res, 404, { error: 'No such game.' });
    }
  }
  json(res, 404, { error: 'Not found.' });
}

const server = createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  let path = '';
  try { path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)); } catch {}
  if (path.startsWith('/api/')) return api(req, res, path).catch(() => json(res, 500, { error: 'Server error.' }));
  // only the page, its icon, the model folder and the vendored libraries are public
  // (browsers that still ask for /favicon.ico get the same icon)
  const file = path === '/' || /^\/g\/[a-z0-9]+$/.test(path) ? 'index.html' : path === '/icon.svg' || path === '/favicon.ico' ? 'icon.svg'
    : path.startsWith('/models/') || path.startsWith('/vendor/') ? path.slice(1) : null;
  try {
    if (!file) throw 0;
    const body = await readFile(join(ROOT, file));
    if (file === 'index.html') res.setHeader('Content-Security-Policy', csp(inlineScriptHashes(body))); // hashed each time, so edits stay in sync
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

// live rooms are kept in memory and mirrored to the live_rooms table on every change, so a restart resumes them
const rooms = new Map(); // id -> room, see newGame() for the per-game fields
const COLORS = ['w', 'b'], other = c => c === 'w' ? 'b' : 'w';
const TIME_CONTROLS = { '1+0': [1, 0], '3+2': [3, 2], '5+3': [5, 3], '10+0': [10, 0], '15+10': [15, 10], none: null }; // minutes + seconds added per move
const validTc = tc => typeof tc === 'string' && Object.hasOwn(TIME_CONTROLS, tc); // not `in`: that also accepts "toString", "__proto__"…
// like lichess: each side must make its first move within 30 s (White from when both are seated, Black
// from White's first move) or the game is aborted: no result, no rating, not saved. FIRST_MOVE_MS is for tests.
const FIRST_MOVE_MS = Number(process.env.FIRST_MOVE_MS) || 30_000;
const LIMITS = { ratedVsSamePerDay: 3, roomsPerIp: 10, connectionsPerIp: 30, maxRooms: 10000, msgBurst: 30, msgPerSec: 10, idleRoomMs: 10 * 6e4 };
const send = (ws, m) => ws?.readyState === 1 && ws.send(JSON.stringify(m));

function newGame(room) {
  const tc = TIME_CONTROLS[room.tc];
  room.game = new Chess();
  // clock: ms left per side; `running` side has been thinking since `since`. It starts after White's first move.
  room.clock = tc && { w: tc[0] * 6e4, b: tc[0] * 6e4, inc: tc[1] * 1e3, running: null, since: 0 };
  room.result = null;     // { winner: 'w' | 'b' | null, reason }
  room.drawOffer = null;  // colour that offered
  room.rematch = new Set();
  clearTimeout(room.flagTimer);
  clearTimeout(room.abortTimer);
  room.abortAt = null;
}

// (re)arm the first-move deadline; a no-op once both sides have moved or the game is over
function scheduleAbort(room) {
  clearTimeout(room.abortTimer);
  const played = room.game.history().length;
  if (room.result || played >= 2 || !(room.seats.w && room.seats.b)) { room.abortAt = null; return; }
  room.abortAt ??= Date.now() + FIRST_MOVE_MS;
  room.abortTimer = setTimeout(() => {
    if (room.result || room.game.history().length !== played) return; // someone moved in time
    finish(room, null, 'aborted');
    broadcast(room);
  }, room.abortAt - Date.now());
}

function finish(room, winner, reason) {
  const c = room.clock;
  if (c?.running) c[c.running] = Math.max(0, c[c.running] - (Date.now() - c.since));
  if (c) c.running = null;
  room.result = { winner, reason };
  room.drawOffer = null;
  room.abortAt = null;
  clearTimeout(room.flagTimer);
  clearTimeout(room.abortTimer);
  // the saved game, both rating updates and the room's own "finished" state commit together or not at all,
  // so a crash can never leave a room that would be finished (and rated) a second time after a restart
  db.exec('BEGIN IMMEDIATE');
  try {
    saveGame(room);
    persist(room);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// Rated: games between two different signed-in players that got past move 1, except (to stop one person
// farming rating with a second account) games where both seats were taken from the same network, and
// games beyond the 3rd rated one between the same two accounts in 24 h. Those still count, unrated.
function saveGame(room) {
  const g = room.game, r = room.result, w = room.seats.w?.user, b = room.seats.b?.user;
  if (r.reason === 'aborted' || !g.history().length || (!w && !b)) return; // nothing worth keeping
  const eligible = !!(w && b && w.id !== b.id && g.history().length >= 2);
  if (eligible && room.seats.w.ip && room.seats.w.ip === room.seats.b.ip) r.unrated = 'both players on the same network';
  else if (eligible && db.prepare(`SELECT COUNT(*) AS n FROM games WHERE rated = 1 AND ended > ?
      AND ((white = ? AND black = ?) OR (white = ? AND black = ?))`).get(Date.now() - 864e5, w.id, b.id, b.id, w.id).n >= LIMITS.ratedVsSamePerDay)
    r.unrated = `${LIMITS.ratedVsSamePerDay} rated games against each other in the last 24 hours`;
  const rated = eligible && !r.unrated;
  if (rated) {
    // a player may be in several games at once: rate from the database, not from this room's copy,
    // or the second result would overwrite the first (lost update)
    const fresh = db.prepare('SELECT rating, rd, vol FROM users WHERE id = ?');
    Object.assign(w, fresh.get(w.id));
    Object.assign(b, fresh.get(b.id));
    const score = r.winner === 'w' ? 1 : r.winner === 'b' ? 0 : 0.5;
    const nw = glicko2(w, [[b, score]]), nb = glicko2(b, [[w, 1 - score]]); // each game is its own rating period, as on lichess
    r.changes = { w: Math.round(nw.rating) - Math.round(w.rating), b: Math.round(nb.rating) - Math.round(b.rating) };
    for (const [u, n] of [[w, nw], [b, nb]]) {
      Object.assign(u, n);
      db.prepare('UPDATE users SET rating = ?, rd = ?, vol = ? WHERE id = ?').run(n.rating, n.rd, n.vol, u.id);
    }
  }
  // PGN headers so a downloaded game says who played and how it ended
  const headers = { Event: rated ? 'Rated game' : 'Casual game', Site: '3D Chess', Date: new Date().toISOString().slice(0, 10).replaceAll('-', '.'),
    White: w?.name ?? 'Guest', Black: b?.name ?? 'Guest', Result: r.winner === 'w' ? '1-0' : r.winner === 'b' ? '0-1' : '1/2-1/2',
    TimeControl: room.tc, Termination: r.reason };
  for (const [k, v] of Object.entries(headers)) g.setHeader(k, v);
  db.prepare(`INSERT INTO games (white, black, tc, pgn, winner, reason, rated, white_change, black_change, ended)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(w?.id ?? null, b?.id ?? null, room.tc, g.pgn(), r.winner, r.reason,
    rated ? 1 : 0, r.changes?.w ?? null, r.changes?.b ?? null, Date.now());
}

// Losing on time is a draw when the opponent could never checkmate (FIDE 6.9). We use the common
// approximation: a bare king, or king + one bishop/knight against a bare king, can't win.
function flag(room, color) {
  const pieces = c => room.game.board().flat().filter(p => p && p.color === c && p.type !== 'k');
  const mine = pieces(other(color)), theirs = pieces(color);
  const canWin = mine.length > 0 && !(mine.length === 1 && 'nb'.includes(mine[0].type) && !theirs.length);
  finish(room, canWin ? other(color) : null, canWin ? 'timeout' : 'timeout vs insufficient material');
}

// FIDE draw rules (art. 9): threefold repetition and the fifty-move rule are draws a player may *claim*;
// the game ends by itself only at fivefold repetition or seventy-five moves. A position is the same when
// the pieces, side to move, castling rights and en passant square all match (the first four FEN fields).
const positionKey = fen => fen.split(' ').slice(0, 4).join(' ');
function repetitions(g) {
  const moves = g.history({ verbose: true }), now = positionKey(g.fen());
  if (!moves.length) return 1;
  return [moves[0].before, ...moves.map(m => m.after)].filter(f => positionKey(f) === now).length;
}
const halfmoves = g => Number(g.fen().split(' ')[4]); // since the last capture or pawn move
const claimableDraw = g => repetitions(g) >= 3 ? 'threefold repetition' : halfmoves(g) >= 100 ? '50-move rule' : null;

function checkEnd(room) {
  const g = room.game;
  if (g.isCheckmate()) finish(room, other(g.turn()), 'checkmate'); // checkmate on the 75th move still wins
  else if (g.isStalemate()) finish(room, null, 'stalemate');
  else if (g.isInsufficientMaterial()) finish(room, null, 'insufficient material');
  else if (repetitions(g) >= 5) finish(room, null, 'fivefold repetition');
  else if (halfmoves(g) >= 150) finish(room, null, '75-move rule');
}

// flag the side to move when its time runs out, even if nobody sends anything
function schedule(room) {
  clearTimeout(room.flagTimer);
  const c = room.clock;
  if (!c?.running || room.result) return;
  room.flagTimer = setTimeout(() => {
    if (c[c.running] - (Date.now() - c.since) > 0) return schedule(room);
    flag(room, c.running);
    broadcast(room);
  }, c[c.running] - (Date.now() - c.since) + 20);
}

const players = room => Object.fromEntries(COLORS.map(c => {
  const u = room.seats[c]?.user;
  return [c, u ? { name: u.name, rating: Math.round(u.rating), provisional: u.rd > 110 } : null]; // null = guest
}));
const members = room => [...COLORS.map(c => room.seats[c]?.ws), ...room.watchers].filter(Boolean);

function broadcast(room) {
  // per seat: null = nobody yet, 'here' = connected, 'away' = disconnected but can come back
  const seats = Object.fromEntries(COLORS.map(c => [c, room.seats[c] ? (room.seats[c].ws ? 'here' : 'away') : null]));
  const c = room.clock;
  const clock = c && { running: c.running, ...Object.fromEntries(COLORS.map(s => [s, c[s] - (s === c.running ? Date.now() - c.since : 0)])) };
  const state = { t: 'state', pgn: room.game.pgn(), seats, players: players(room), tc: room.tc, clock, result: room.result,
    drawOffer: room.drawOffer, rematch: [...room.rematch], watchers: room.watchers.size,
    firstMoveMs: room.abortAt && Math.max(0, room.abortAt - Date.now()), // time left for the pending first move, or null
    claimable: room.result ? null : claimableDraw(room.game) }; // a draw either player may claim right now, or null
  for (const s of COLORS) send(room.seats[s]?.ws, { ...state, you: s });
  for (const ws of room.watchers) send(ws, { ...state, you: null });
  lobbyChanged();
  persist(room);
}

function persist(room) {
  const seats = Object.fromEntries(COLORS.map(c => [c, room.seats[c] ? { token: room.seats[c].token, userId: room.seats[c].user?.id ?? null, ip: room.seats[c].ip ?? null } : null]));
  const data = { tc: room.tc, listed: room.listed, ip: room.ip, pgn: room.game.pgn(), seats, clock: room.clock, result: room.result, drawOffer: room.drawOffer,
    rematch: [...room.rematch], chat: room.chat, savedAt: Date.now() };
  db.prepare('INSERT OR REPLACE INTO live_rooms VALUES (?, ?, ?)').run(room.id, JSON.stringify(data), room.touched ?? Date.now());
}

function restoreRooms() {
  const getUser = db.prepare('SELECT id, name, rating, rd, vol FROM users WHERE id = ?');
  for (const row of db.prepare('SELECT id, data, touched FROM live_rooms').all()) {
    try {
      const d = JSON.parse(row.data);
      if (!validTc(d.tc)) throw new Error('bad time control');
      const room = { id: row.id, tc: d.tc, listed: !!d.listed, ip: d.ip ?? null, seats: {}, watchers: new Set(), chat: d.chat, touched: row.touched };
      newGame(room);
      if (d.pgn) room.game.loadPgn(d.pgn);
      Object.assign(room, { clock: d.clock, result: d.result, drawOffer: d.drawOffer, rematch: new Set(d.rematch) });
      const c = room.clock;
      if (c?.running) { c[c.running] -= d.savedAt - c.since; c.since = Date.now(); } // clocks pause while the server is down
      for (const col of COLORS) if (d.seats[col]) {
        room.seats[col] = { token: d.seats[col].token, ws: null, user: d.seats[col].userId ? getUser.get(d.seats[col].userId) ?? null : null, ip: d.seats[col].ip ?? null };
      }
      rooms.set(room.id, room);
      schedule(room);
      scheduleAbort(room); // the first-move deadline restarts too, like the paused clocks
    } catch {
      db.prepare('DELETE FROM live_rooms WHERE id = ?').run(row.id); // unreadable: drop it rather than crash at startup
    }
  }
}

// listed: shown in the lobby's live games (matchmaking games only; private friend games stay unlisted)
function createRoom(tc, { listed = false, ip = null } = {}) {
  const room = { id: randomBytes(8).toString('hex'), seats: {}, watchers: new Set(), chat: [], tc: validTc(tc) ? tc : '5+3', listed, ip }; // 64-bit ids: not guessable
  newGame(room);
  rooms.set(room.id, room);
  return room;
}

function enter(ws, room, color, token = randomUUID()) {
  leaveLobby(ws);
  ws.room = room;
  if (color) {
    const seat = room.seats[color];
    seat?.ws?.close(); // same seat opened in another tab: the newest one wins
    // the seat's account is fixed when it is first taken: rejoining with the seat token but without
    // (or with another) login must not turn a rated seat into a guest seat or hand it to someone else
    room.seats[color] = { token, ws, user: seat ? seat.user : ws.user, ip: seat ? seat.ip : ws.ip };
  } else room.watchers.add(ws);
  room.touched = Date.now();
  scheduleAbort(room);
  send(ws, { t: 'joined', room: room.id, token: color ? token : null });
  send(ws, { t: 'chat', log: room.chat });
  broadcast(room);
}

// --- lobby: live games to watch, and one waiting seeker per time control ---
const lobby = new Set(), seeks = new Map(); // seeks: tc -> ws waiting for an opponent
let lobbyTimer = null;
const lobbyState = () => ({
  t: 'lobby',
  games: [...rooms.values()].filter(r => r.listed && r.seats.w && r.seats.b && !r.result).slice(-20).map(r => ({ id: r.id, tc: r.tc, moves: r.game.history().length, players: players(r) })),
  seeking: [...seeks.keys()],
});
function lobbyChanged() {
  lobbyTimer ??= setTimeout(() => { // batch bursts of changes
    lobbyTimer = null;
    const m = lobbyState();
    for (const ws of lobby) send(ws, m);
  }, 300);
}
function leaveLobby(ws) {
  lobby.delete(ws);
  for (const [tc, w] of seeks) if (w === ws) { seeks.delete(tc); lobbyChanged(); }
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });
const connectionsPerIp = new Map();
const SQUARE = /^[a-h][1-8]$/;
wss.on('connection', (ws, req) => {
  // an unhandled 'error' (bad frame, oversized message) would otherwise throw and stop the whole server
  ws.on('error', () => ws.terminate());
  ws.ip = clientIp(req);
  const open = (connectionsPerIp.get(ws.ip) ?? 0) + 1;
  connectionsPerIp.set(ws.ip, open);
  ws.once('close', () => { const n = connectionsPerIp.get(ws.ip) - 1; n ? connectionsPerIp.set(ws.ip, n) : connectionsPerIp.delete(ws.ip); });
  if (open > LIMITS.connectionsPerIp) return ws.close(1013, 'too many connections');

  const origin = req.headers.origin;
  let sameSite = true;
  try { sameSite = !origin || new URL(origin).host === req.headers.host; } catch { sameSite = false; }
  ws.user = sameSite ? userFromReq(req) : null; // never trust a cookie sent from another site's page
  if (ws.user) ws.sid = sha(cookies(req).sid);
  const mine = () => ws.room && COLORS.find(c => ws.room.seats[c]?.ws === ws); // seats swap on rematch, so look it up each time
  let tokens = LIMITS.msgBurst, refilled = Date.now(); // token bucket: a short burst, then msgPerSec

  const onMessage = raw => {
    const now = Date.now();
    tokens = Math.min(LIMITS.msgBurst, tokens + (now - refilled) / 1000 * LIMITS.msgPerSec);
    refilled = now;
    if (tokens < 1) return ws.close(1008, 'too many messages'); // flooding: every message costs a broadcast and a DB write
    tokens--;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return; // e.g. "null", "1", "[]"

    if (!ws.room) {
      if (m.t === 'lobby') { lobby.add(ws); return send(ws, lobbyState()); }
      if (m.t === 'seek' && validTc(m.tc)) {
        leaveLobby(ws);
        lobby.add(ws);
        const opp = seeks.get(m.tc);
        if (opp && opp.readyState === 1 && !(ws.user && opp.user?.id === ws.user.id)) {
          if (rooms.size >= LIMITS.maxRooms) return send(ws, { t: 'error', msg: 'The server is full right now. Try again later.' });
          seeks.delete(m.tc);
          const room = createRoom(m.tc, { listed: true }), flip = Math.random() < 0.5;
          enter(opp, room, flip ? 'w' : 'b');
          enter(ws, room, flip ? 'b' : 'w');
        } else {
          seeks.set(m.tc, ws);
          send(ws, { t: 'seeking', tc: m.tc });
          lobbyChanged();
        }
        return;
      }
      if (m.t === 'cancelSeek') { leaveLobby(ws); lobby.add(ws); return send(ws, { t: 'seeking', tc: null }); }
      if (m.t === 'create') {
        if (rooms.size >= LIMITS.maxRooms) return send(ws, { t: 'error', msg: 'The server is full right now. Try again later.' });
        // rooms still waiting for a second player, per network: stops one client filling the server with empty rooms
        const waiting = [...rooms.values()].filter(r => r.ip === ws.ip && !(r.seats.w && r.seats.b)).length;
        if (waiting >= LIMITS.roomsPerIp) return send(ws, { t: 'error', msg: 'You have too many games waiting for an opponent. Finish or wait for one first.' });
        return enter(ws, createRoom(m.tc, { ip: ws.ip }), Math.random() < 0.5 ? 'w' : 'b');
      }
      if (m.t === 'join') {
        const r = typeof m.room === 'string' && rooms.get(m.room);
        if (!r) return send(ws, { t: 'error', msg: 'Game not found. It may have expired.' });
        // A guest seat is reclaimed with its token. A seat that belongs to an account needs that account's login:
        // the token alone (left in a tab after signing out, say) only lets you watch.
        const owns = c => !r.seats[c].user || r.seats[c].user.id === ws.user?.id;
        const seat = COLORS.find(c => r.seats[c] && owns(c) && ((typeof m.token === 'string' && r.seats[c].token === m.token) || r.seats[c].user));
        const free = COLORS.find(c => !r.seats[c]);
        return seat ? enter(ws, r, seat, r.seats[seat].token) : free ? enter(ws, r, free) : enter(ws, r, null); // full: watch
      }
      return;
    }

    const room = ws.room, color = mine();
    if (!color) return; // spectators only watch
    const playing = room.seats.w && room.seats.b && !room.result;
    room.touched = Date.now();

    if (m.t === 'chat') {
      const text = String(m.text ?? '').trim().slice(0, 200);
      if (!text || Date.now() - (ws.lastChat ?? 0) < 500) return;
      ws.lastChat = Date.now();
      const msg = { from: color, name: ws.user?.name ?? null, text };
      room.chat = [...room.chat.slice(-49), msg];
      for (const w of members(room)) send(w, { t: 'chat', log: [msg] });
      persist(room);
      return;
    }
    if (m.t === 'move') {
      const shaped = typeof m.from === 'string' && SQUARE.test(m.from) && typeof m.to === 'string' && SQUARE.test(m.to) &&
        (m.promotion === undefined || (typeof m.promotion === 'string' && 'qrbn'.includes(m.promotion) && m.promotion.length === 1));
      if (shaped && playing && room.game.turn() === color) {
        const c = room.clock, spent = c?.running ? Date.now() - c.since : 0;
        if (c && c[color] - spent <= 0) flag(room, color);
        else {
          let ok = true;
          try { room.game.move({ from: m.from, to: m.to, promotion: m.promotion }); } catch { ok = false; }
          if (ok) {
            if (c) {
              c[color] += c.running ? c.inc - spent : 0;
              c.running = other(color);
              c.since = Date.now();
            }
            room.drawOffer = null; // making a move declines a pending offer
            room.abortAt = null; // White's first move starts Black's 30 s
            checkEnd(room);
            schedule(room);
            scheduleAbort(room);
          }
        }
      }
    } else if (m.t === 'claim' && playing) {
      const draw = claimableDraw(room.game); // decided by the server, never by what the client says
      if (draw) finish(room, null, draw);
    } else if (m.t === 'resign' && playing) {
      finish(room, other(color), 'resignation');
    } else if (m.t === 'draw' && playing) {
      if (room.drawOffer === other(color)) finish(room, null, 'agreement');
      else room.drawOffer = color;
    } else if (m.t === 'decline' && room.drawOffer === other(color)) {
      room.drawOffer = null;
    } else if (m.t === 'rematch' && room.result) {
      room.rematch.add(color);
      if (room.rematch.size === 2) {
        [room.seats.w, room.seats.b] = [room.seats.b, room.seats.w]; // swap colours
        newGame(room);
        scheduleAbort(room);
      }
    } else return;
    broadcast(room); // also resyncs a sender whose move was refused
  };
  // a bug in one handler must not take every game down with it: drop that connection, keep serving the rest
  ws.on('message', raw => {
    try { onMessage(raw); } catch (e) { console.error('message handler failed:', e); ws.close(1011, 'server error'); }
  });

  ws.on('close', () => {
    leaveLobby(ws);
    const room = ws.room, color = mine();
    if (!room) return;
    room.watchers.delete(ws);
    if (color) room.seats[color].ws = null;
    broadcast(room);
  });
});

// Drop rooms nobody is in: after 10 minutes if no game ever started, after a day otherwise.
// Also forget old rate-limit entries and expired sessions.
function sweep() {
  const now = Date.now();
  for (const [id, r] of rooms) {
    if (members(r).length) continue;
    const started = r.seats.w && r.seats.b && r.game.history().length;
    if (now - r.touched > (started ? 864e5 : LIMITS.idleRoomMs)) {
      clearTimeout(r.flagTimer);
      clearTimeout(r.abortTimer);
      rooms.delete(id);
      db.prepare('DELETE FROM live_rooms WHERE id = ?').run(id);
    }
  }
  signupLimit.sweep();
  loginLimit.sweep();
  db.prepare('DELETE FROM sessions WHERE created <= ?').run(now - SESSION_MS);
}
setInterval(sweep, 6e4).unref();

restoreRooms();

server.listen(PORT, () => console.log(`3D Chess on http://localhost:${PORT}`));
