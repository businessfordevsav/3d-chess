// Game server: serves the page and model files, and runs the lobby, matchmaking and game rooms over WebSocket.
// Every move is re-checked with chess.js here, so a modified client can't play illegal moves.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer } from 'ws';
import { Chess } from 'chess.js';

const ROOT = import.meta.dirname, PORT = process.env.PORT || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg' };

// --- database: accounts, sessions, finished games ---
const DB_FILE = process.env.DB_FILE || join(ROOT, 'data', 'chess.db');
if (DB_FILE !== ':memory:') mkdirSync(join(DB_FILE, '..'), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, hash TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 1500, created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY, white INTEGER REFERENCES users(id), black INTEGER REFERENCES users(id),
    tc TEXT NOT NULL, pgn TEXT NOT NULL, winner TEXT, reason TEXT NOT NULL, rated INTEGER NOT NULL,
    white_change INTEGER, black_change INTEGER, ended INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS games_by_white ON games(white, ended);
  CREATE INDEX IF NOT EXISTS games_by_black ON games(black, ended);
`);
const SESSION_MS = 30 * 864e5;
const sha = t => createHash('sha256').update(t).digest('hex'); // session tokens are stored hashed
function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [salt, key] = stored.split(':');
  return timingSafeEqual(scryptSync(pw, salt, 64), Buffer.from(key, 'hex'));
}
const cookies = req => Object.fromEntries((req.headers.cookie ?? '').split(';').map(p => p.trim().split('=')).filter(p => p.length === 2));
function userFromReq(req) {
  const sid = cookies(req).sid;
  return sid ? db.prepare(`SELECT u.id, u.name, u.rating FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.created > ?`).get(sha(sid), Date.now() - SESSION_MS) ?? null : null;
}
function startSession(res, user) {
  const sid = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(sha(sid), user.id, Date.now());
  // ponytail: add "; Secure" once the site is served over HTTPS
  res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}`);
}

// --- JSON API: sign up, sign in, sign out, profiles ---
const json = (res, code, body) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
const loginTries = new Map(); // ip -> recent failed attempt times
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
      if (password.length < 8 || password.length > 200) return json(res, 400, { error: 'Passwords need at least 8 characters.' });
      try {
        const { lastInsertRowid } = db.prepare('INSERT INTO users (name, hash, created) VALUES (?, ?, ?)').run(name, hashPassword(password), Date.now());
        const user = { id: Number(lastInsertRowid), name, rating: 1500 };
        startSession(res, user);
        return json(res, 201, { user });
      } catch {
        return json(res, 409, { error: 'That name is taken.' });
      }
    }
    if (path === '/api/login') {
      const ip = req.socket.remoteAddress, now = Date.now();
      const tries = (loginTries.get(ip) ?? []).filter(t => now - t < 15 * 6e4);
      if (tries.length >= 10) return json(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
      const row = db.prepare('SELECT id, name, rating, hash FROM users WHERE name = ?').get(name);
      if (!row || !checkPassword(password, row.hash)) {
        loginTries.set(ip, [...tries, now]);
        return json(res, 401, { error: 'Wrong name or password.' });
      }
      const user = { id: row.id, name: row.name, rating: row.rating };
      startSession(res, user);
      return json(res, 200, { user });
    }
    if (path === '/api/logout') {
      const sid = cookies(req).sid;
      if (sid) db.prepare('DELETE FROM sessions WHERE token = ?').run(sha(sid));
      res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
      return json(res, 200, { user: null });
    }
  }
  if (req.method === 'GET') {
    if (path === '/api/me') return json(res, 200, { user: userFromReq(req) });
    const profile = path.match(/^\/api\/users\/([A-Za-z0-9_]{3,20})$/);
    if (profile) {
      const u = db.prepare('SELECT id, name, rating, created FROM users WHERE name = ?').get(profile[1]);
      if (!u) return json(res, 404, { error: 'No such player.' });
      const games = db.prepare(`SELECT g.id, g.tc, g.winner, g.reason, g.rated, g.ended, g.white_change, g.black_change,
          wu.name AS white, bu.name AS black FROM games g LEFT JOIN users wu ON wu.id = g.white LEFT JOIN users bu ON bu.id = g.black
        WHERE g.white = ? OR g.black = ? ORDER BY g.ended DESC LIMIT 30`).all(u.id, u.id);
      return json(res, 200, { name: u.name, rating: u.rating, created: u.created, games });
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
  let path = '';
  try { path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)); } catch {}
  if (path.startsWith('/api/')) return api(req, res, path).catch(() => json(res, 500, { error: 'Server error.' }));
  // only the page and the model folder are public
  const file = path === '/' || /^\/g\/[a-z0-9]+$/.test(path) ? 'index.html' : path.startsWith('/models/') ? path.slice(1) : null;
  try {
    if (!file) throw 0;
    const body = await readFile(join(ROOT, file));
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

// ponytail: live rooms are in memory, so a restart drops games in progress (finished games are saved to the database)
const rooms = new Map(); // id -> room, see newGame() for the per-game fields
const COLORS = ['w', 'b'], other = c => c === 'w' ? 'b' : 'w';
const TIME_CONTROLS = { '1+0': [1, 0], '3+2': [3, 2], '5+3': [5, 3], '10+0': [10, 0], '15+10': [15, 10], none: null }; // minutes + seconds added per move
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
}

function finish(room, winner, reason) {
  const c = room.clock;
  if (c?.running) c[c.running] = Math.max(0, c[c.running] - (Date.now() - c.since));
  if (c) c.running = null;
  room.result = { winner, reason };
  room.drawOffer = null;
  clearTimeout(room.flagTimer);
  saveGame(room);
}

// Elo with K = 20; only games between two different signed-in players that got past move 1 are rated
function saveGame(room) {
  const g = room.game, r = room.result, w = room.seats.w?.user, b = room.seats.b?.user;
  if (!g.history().length || (!w && !b)) return; // nothing worth keeping
  const rated = !!(w && b && w.id !== b.id && g.history().length >= 2);
  if (rated) {
    const score = r.winner === 'w' ? 1 : r.winner === 'b' ? 0 : 0.5;
    const expected = 1 / (1 + 10 ** ((b.rating - w.rating) / 400));
    const dw = Math.round(20 * (score - expected));
    r.changes = { w: dw, b: -dw };
    for (const [u, d] of [[w, dw], [b, -dw]]) {
      u.rating += d;
      db.prepare('UPDATE users SET rating = rating + ? WHERE id = ?').run(d, u.id);
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

function checkEnd(room) {
  const g = room.game;
  if (g.isCheckmate()) finish(room, other(g.turn()), 'checkmate');
  else if (g.isStalemate()) finish(room, null, 'stalemate');
  else if (g.isInsufficientMaterial()) finish(room, null, 'insufficient material');
  else if (g.isThreefoldRepetition()) finish(room, null, 'threefold repetition');
  else if (g.isDraw()) finish(room, null, '50-move rule');
}

// flag the side to move when its time runs out, even if nobody sends anything
function schedule(room) {
  clearTimeout(room.flagTimer);
  const c = room.clock;
  if (!c?.running || room.result) return;
  room.flagTimer = setTimeout(() => {
    if (c[c.running] - (Date.now() - c.since) > 0) return schedule(room);
    finish(room, other(c.running), 'timeout'); // ponytail: a flag against a lone king should be a draw (FIDE 6.9)
    broadcast(room);
  }, c[c.running] - (Date.now() - c.since) + 20);
}

const players = room => Object.fromEntries(COLORS.map(c => {
  const u = room.seats[c]?.user;
  return [c, u ? { name: u.name, rating: u.rating } : null]; // null = guest
}));
const members = room => [...COLORS.map(c => room.seats[c]?.ws), ...room.watchers].filter(Boolean);

function broadcast(room) {
  // per seat: null = nobody yet, 'here' = connected, 'away' = disconnected but can come back
  const seats = Object.fromEntries(COLORS.map(c => [c, room.seats[c] ? (room.seats[c].ws ? 'here' : 'away') : null]));
  const c = room.clock;
  const clock = c && { running: c.running, ...Object.fromEntries(COLORS.map(s => [s, c[s] - (s === c.running ? Date.now() - c.since : 0)])) };
  const state = { t: 'state', pgn: room.game.pgn(), seats, players: players(room), tc: room.tc, clock, result: room.result,
    drawOffer: room.drawOffer, rematch: [...room.rematch], watchers: room.watchers.size };
  for (const s of COLORS) send(room.seats[s]?.ws, { ...state, you: s });
  for (const ws of room.watchers) send(ws, { ...state, you: null });
  lobbyChanged();
}

function createRoom(tc) {
  const room = { id: randomBytes(4).toString('hex'), seats: {}, watchers: new Set(), chat: [], tc: tc in TIME_CONTROLS ? tc : '5+3' };
  newGame(room);
  rooms.set(room.id, room);
  return room;
}

function enter(ws, room, color, token = randomUUID()) {
  leaveLobby(ws);
  ws.room = room;
  if (color) {
    room.seats[color]?.ws?.close(); // same seat opened in another tab: the newest one wins
    room.seats[color] = { token, ws, user: ws.user };
  } else room.watchers.add(ws);
  room.touched = Date.now();
  send(ws, { t: 'joined', room: room.id, token: color ? token : null });
  send(ws, { t: 'chat', log: room.chat });
  broadcast(room);
}

// --- lobby: live games to watch, and one waiting seeker per time control ---
const lobby = new Set(), seeks = new Map(); // seeks: tc -> ws waiting for an opponent
let lobbyTimer = null;
const lobbyState = () => ({
  t: 'lobby',
  games: [...rooms.values()].filter(r => r.seats.w && r.seats.b && !r.result).slice(-20).map(r => ({ id: r.id, tc: r.tc, moves: r.game.history().length, players: players(r) })),
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
wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;
  let sameSite = true;
  try { sameSite = !origin || new URL(origin).host === req.headers.host; } catch { sameSite = false; }
  ws.user = sameSite ? userFromReq(req) : null; // never trust a cookie sent from another site's page
  const mine = () => ws.room && COLORS.find(c => ws.room.seats[c]?.ws === ws); // seats swap on rematch, so look it up each time

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (!ws.room) {
      if (m.t === 'lobby') { lobby.add(ws); return send(ws, lobbyState()); }
      if (m.t === 'seek' && m.tc in TIME_CONTROLS) {
        leaveLobby(ws);
        lobby.add(ws);
        const opp = seeks.get(m.tc);
        if (opp && opp.readyState === 1 && !(ws.user && opp.user?.id === ws.user.id)) {
          seeks.delete(m.tc);
          const room = createRoom(m.tc), flip = Math.random() < 0.5;
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
        if (rooms.size >= 10000) return send(ws, { t: 'error', msg: 'The server is full right now. Try again later.' });
        return enter(ws, createRoom(m.tc), Math.random() < 0.5 ? 'w' : 'b');
      }
      if (m.t === 'join') {
        const r = rooms.get(m.room);
        if (!r) return send(ws, { t: 'error', msg: 'Game not found. It may have expired.' });
        const seat = COLORS.find(c => r.seats[c] && (r.seats[c].token === m.token || (ws.user && r.seats[c].user?.id === ws.user.id)));
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
      return;
    }
    if (m.t === 'move') {
      if (playing && room.game.turn() === color) {
        const c = room.clock, spent = c?.running ? Date.now() - c.since : 0;
        if (c && c[color] - spent <= 0) finish(room, other(color), 'timeout');
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
            checkEnd(room);
            schedule(room);
          }
        }
      }
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
      }
    } else return;
    broadcast(room); // also resyncs a sender whose move was refused
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

// drop rooms nobody has touched for a day once both players have left
setInterval(() => {
  for (const [id, r] of rooms) if (Date.now() - r.touched > 864e5 && !members(r).length) rooms.delete(id);
}, 36e5).unref();

server.listen(PORT, () => console.log(`3D Chess on http://localhost:${PORT}`));
