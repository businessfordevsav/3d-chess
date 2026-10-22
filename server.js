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
const rooms = new Map(); // id -> { id, game, seats: { w?: { token, ws }, b?: ... }, touched }
const COLORS = ['w', 'b'];
const send = (ws, m) => ws?.readyState === 1 && ws.send(JSON.stringify(m));

function broadcast(room) {
  // per seat: null = nobody yet, 'here' = connected, 'away' = disconnected but can come back
  const seats = Object.fromEntries(COLORS.map(c => [c, room.seats[c] ? (room.seats[c].ws ? 'here' : 'away') : null]));
  for (const c of COLORS) send(room.seats[c]?.ws, { t: 'state', pgn: room.game.pgn(), seats });
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });
wss.on('connection', ws => {
  let room, color;

  function take(token = randomUUID()) {
    room.seats[color]?.ws?.close(); // same seat opened in another tab: the newest one wins
    room.seats[color] = { token, ws };
    room.touched = Date.now();
    send(ws, { t: 'joined', room: room.id, color, token });
    broadcast(room);
  }

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'create' && !room) {
      if (rooms.size >= 10000) return send(ws, { t: 'error', msg: 'The server is full right now. Try again later.' });
      const id = randomBytes(4).toString('hex');
      room = { id, game: new Chess(), seats: {} };
      rooms.set(id, room);
      color = Math.random() < 0.5 ? 'w' : 'b';
      take();
    } else if (m.t === 'join' && !room) {
      const r = rooms.get(m.room);
      if (!r) return send(ws, { t: 'error', msg: 'Game not found. It may have expired.' });
      const mine = COLORS.find(c => r.seats[c] && r.seats[c].token === m.token);
      const free = COLORS.find(c => !r.seats[c]);
      if (!mine && !free) return send(ws, { t: 'error', msg: 'This game already has two players.' });
      room = r;
      color = mine ?? free;
      take(mine && r.seats[mine].token);
    } else if (m.t === 'move' && room) {
      if (room.game.turn() === color && room.seats.w && room.seats.b) {
        try { room.game.move({ from: m.from, to: m.to, promotion: m.promotion }); } catch {}
      }
      room.touched = Date.now();
      broadcast(room); // also resyncs a sender whose move was refused
    }
  });

  ws.on('close', () => {
    if (room?.seats[color]?.ws !== ws) return;
    room.seats[color].ws = null;
    broadcast(room);
  });
});

// drop rooms nobody has touched for a day once both players have left
setInterval(() => {
  for (const [id, r] of rooms) if (Date.now() - r.touched > 864e5 && !r.seats.w?.ws && !r.seats.b?.ws) rooms.delete(id);
}, 36e5).unref();

server.listen(PORT, () => console.log(`3D Chess on http://localhost:${PORT}`));
