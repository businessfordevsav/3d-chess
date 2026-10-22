// Game server: serves the page and model files, and runs private 1v1 rooms over WebSocket.
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

function broadcast(room) {
  // per seat: null = nobody yet, 'here' = connected, 'away' = disconnected but can come back
  const seats = Object.fromEntries(COLORS.map(c => [c, room.seats[c] ? (room.seats[c].ws ? 'here' : 'away') : null]));
  const c = room.clock;
  const clock = c && { running: c.running, ...Object.fromEntries(COLORS.map(s => [s, c[s] - (s === c.running ? Date.now() - c.since : 0)])) };
  const state = { t: 'state', pgn: room.game.pgn(), seats, tc: room.tc, clock, result: room.result, drawOffer: room.drawOffer, rematch: [...room.rematch] };
  for (const s of COLORS) send(room.seats[s]?.ws, { ...state, you: s });
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });
wss.on('connection', ws => {
  let room;
  const mine = () => COLORS.find(c => room?.seats[c]?.ws === ws); // seats swap on rematch, so look it up each time

  function take(color, token = randomUUID()) {
    room.seats[color]?.ws?.close(); // same seat opened in another tab: the newest one wins
    room.seats[color] = { token, ws };
    room.touched = Date.now();
    send(ws, { t: 'joined', room: room.id, token });
    broadcast(room);
  }

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'create' && !room) {
      if (rooms.size >= 10000) return send(ws, { t: 'error', msg: 'The server is full right now. Try again later.' });
      room = { id: randomBytes(4).toString('hex'), seats: {}, tc: m.tc in TIME_CONTROLS ? m.tc : '5+3' };
      newGame(room);
      rooms.set(room.id, room);
      return take(Math.random() < 0.5 ? 'w' : 'b');
    }
    if (m.t === 'join' && !room) {
      const r = rooms.get(m.room);
      if (!r) return send(ws, { t: 'error', msg: 'Game not found. It may have expired.' });
      const seat = COLORS.find(c => r.seats[c] && r.seats[c].token === m.token);
      const free = COLORS.find(c => !r.seats[c]);
      if (!seat && !free) return send(ws, { t: 'error', msg: 'This game already has two players.' });
      room = r;
      return take(seat ?? free, seat && r.seats[seat].token);
    }

    const color = mine();
    if (!color) return;
    const playing = room.seats.w && room.seats.b && !room.result;
    room.touched = Date.now();

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
    const color = mine();
    if (!color) return;
    room.seats[color].ws = null;
    broadcast(room);
  });
});

// drop rooms nobody has touched for a day once both players have left
setInterval(() => {
  for (const [id, r] of rooms) if (Date.now() - r.touched > 864e5 && !r.seats.w?.ws && !r.seats.b?.ws) rooms.delete(id);
}, 36e5).unref();

server.listen(PORT, () => console.log(`3D Chess on http://localhost:${PORT}`));
