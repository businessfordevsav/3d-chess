// Game server: serves the page and model files, and runs the lobby, matchmaking and game rooms over WebSocket.
// Every move is re-checked with chess.js here, so a modified client can't play illegal moves.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Chess } from 'chess.js';

const ROOT = import.meta.dirname, PORT = process.env.PORT || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg' };

const server = createServer(async (req, res) => {
  let path = '';
  try { path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)); } catch {}
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

// ponytail: rooms live in memory, so a server restart drops games in progress; move to a database with accounts (M4)
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

const members = room => [...COLORS.map(c => room.seats[c]?.ws), ...room.watchers].filter(Boolean);

function broadcast(room) {
  // per seat: null = nobody yet, 'here' = connected, 'away' = disconnected but can come back
  const seats = Object.fromEntries(COLORS.map(c => [c, room.seats[c] ? (room.seats[c].ws ? 'here' : 'away') : null]));
  const c = room.clock;
  const clock = c && { running: c.running, ...Object.fromEntries(COLORS.map(s => [s, c[s] - (s === c.running ? Date.now() - c.since : 0)])) };
  const state = { t: 'state', pgn: room.game.pgn(), seats, tc: room.tc, clock, result: room.result, drawOffer: room.drawOffer,
    rematch: [...room.rematch], watchers: room.watchers.size };
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
    room.seats[color] = { token, ws };
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
  games: [...rooms.values()].filter(r => r.seats.w && r.seats.b && !r.result).slice(-20).map(r => ({ id: r.id, tc: r.tc, moves: r.game.history().length })),
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
wss.on('connection', ws => {
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
        if (opp && opp.readyState === 1) {
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
        const seat = COLORS.find(c => r.seats[c] && r.seats[c].token === m.token);
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
      const msg = { from: color, text };
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
