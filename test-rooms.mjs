// Smoke test for the room server: npm test
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const PORT = 3999, BASE = `http://localhost:${PORT}`;
const srv = spawn(process.execPath, ['server.js'], { cwd: import.meta.dirname, env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.once('data', r));

function client() {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`), inbox = [], waiting = [];
  ws.on('message', d => {
    const m = JSON.parse(d), i = waiting.findIndex(([t]) => t === m.t);
    i >= 0 ? waiting.splice(i, 1)[0][1](m) : inbox.push(m);
  });
  const next = t => {
    const i = inbox.findIndex(m => m.t === t);
    return i >= 0 ? Promise.resolve(inbox.splice(i, 1)[0]) : new Promise(r => waiting.push([t, r]));
  };
  const opened = new Promise(r => ws.once('open', r));
  return { ws, next, send: async m => { await opened; ws.send(JSON.stringify(m)); } };
}
const moves = pgn => pgn.replace(/\[.*?\]\s*/g, '').replace(/\s*\*$/, '').trim(); // just the moves

try {
  // create, then a friend joins and gets the other colour
  const a = client();
  a.send({ t: 'create', tc: '3+2' });
  const ja = await a.next('joined');
  const sa = await a.next('state');
  assert.equal(sa.tc, '3+2');
  assert.deepEqual(sa.clock, { running: null, w: 180000, b: 180000 });
  const b = client();
  b.send({ t: 'join', room: ja.room });
  const jb = await b.next('joined');
  const s = await b.next('state');
  assert.deepEqual(s.seats, { w: 'here', b: 'here' });
  const aColor = (await a.next('state')).you;
  jb.color = s.you;
  assert.notEqual(jb.color, aColor);
  const [white, black] = aColor === 'w' ? [a, b] : [b, a];

  // moving out of turn and illegal moves change nothing
  black.send({ t: 'move', from: 'e7', to: 'e5' });
  assert.equal(moves((await black.next('state')).pgn), '');
  await white.next('state');
  white.send({ t: 'move', from: 'e2', to: 'e5' });
  assert.equal(moves((await white.next('state')).pgn), '');
  await black.next('state');

  // a legal move reaches both players and starts Black's clock
  white.send({ t: 'move', from: 'e2', to: 'e4' });
  const after = await black.next('state');
  assert.equal(moves(after.pgn), '1. e4');
  assert.equal(after.clock.running, 'b');
  assert.equal(after.clock.w, 180000); // White's first move is free, no increment yet
  await white.next('state');

  // a third person can't take a seat
  const c = client();
  c.send({ t: 'join', room: ja.room });
  assert.match((await c.next('error')).msg, /two players/);

  // a player who drops can come back to the same seat with their token
  b.ws.close();
  assert.equal((await a.next('state')).seats[jb.color], 'away');
  const b2 = client();
  b2.send({ t: 'join', room: ja.room, token: jb.token });
  await b2.next('joined');
  const back = await b2.next('state');
  assert.equal(back.you, jb.color);
  assert.equal(moves(back.pgn), '1. e4');
  assert.equal((await a.next('state')).seats[jb.color], 'here');

  // draw offer: offering twice from one side does nothing; the other side accepting ends the game
  const both = async () => [await a.next('state'), await b2.next('state')];
  const blackLive = jb.color === 'b' ? b2 : a, whiteLive = jb.color === 'b' ? a : b2;
  whiteLive.send({ t: 'draw' });
  let [x] = await both();
  assert.equal(x.drawOffer, 'w');
  blackLive.send({ t: 'decline' });
  [x] = await both();
  assert.equal(x.drawOffer, null);
  whiteLive.send({ t: 'draw' });
  await both();
  blackLive.send({ t: 'draw' });
  [x] = await both();
  assert.deepEqual(x.result, { winner: null, reason: 'agreement' });
  assert.equal(x.clock.running, null);

  // moves after the game ends are refused
  blackLive.send({ t: 'move', from: 'e7', to: 'e5' });
  [x] = await both();
  assert.equal(moves(x.pgn), '1. e4');

  // rematch needs both players, then colours swap and the clock resets
  whiteLive.send({ t: 'rematch' });
  [x] = await both();
  assert.deepEqual(x.rematch, ['w']);
  blackLive.send({ t: 'rematch' });
  const [ra, rb] = await both();
  assert.equal(moves(ra.pgn), '');
  assert.equal(ra.result, null);
  assert.equal(ra.clock.w, 180000);
  assert.equal(ra.you, aColor === 'w' ? 'b' : 'w');
  assert.notEqual(ra.you, rb.you);

  // resigning ends the game for the other side
  const newWhite = ra.you === 'w' ? a : b2;
  newWhite.send({ t: 'resign' });
  [x] = await both();
  assert.deepEqual(x.result, { winner: 'b', reason: 'resignation' });

  // only the page and the model folder are served
  assert.equal((await fetch(BASE + '/')).status, 200);
  assert.equal((await fetch(BASE + '/g/' + ja.room)).status, 200);
  assert.equal((await fetch(BASE + '/models/chess_set/chess_set_1k.gltf')).status, 200);
  for (const p of ['/server.js', '/package.json', '/models/../server.js', '/models/%2e%2e/server.js']) assert.equal((await fetch(BASE + p)).status, 404, p);

  console.log('rooms: all checks passed');
  for (const x of [a, b2, c]) x.ws.close();
} finally {
  srv.kill();
}
