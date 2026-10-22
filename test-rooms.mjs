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
  a.send({ t: 'create' });
  const ja = await a.next('joined');
  await a.next('state');
  const b = client();
  b.send({ t: 'join', room: ja.room });
  const jb = await b.next('joined');
  assert.notEqual(jb.color, ja.color);
  const s = await b.next('state');
  assert.deepEqual(s.seats, { w: 'here', b: 'here' });
  await a.next('state');
  const [white, black] = ja.color === 'w' ? [a, b] : [b, a];

  // moving out of turn and illegal moves change nothing
  black.send({ t: 'move', from: 'e7', to: 'e5' });
  assert.equal(moves((await black.next('state')).pgn), '');
  await white.next('state');
  white.send({ t: 'move', from: 'e2', to: 'e5' });
  assert.equal(moves((await white.next('state')).pgn), '');
  await black.next('state');

  // a legal move reaches both players
  white.send({ t: 'move', from: 'e2', to: 'e4' });
  assert.equal(moves((await black.next('state')).pgn), '1. e4');
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
  assert.equal((await b2.next('joined')).color, jb.color);
  assert.equal(moves((await b2.next('state')).pgn), '1. e4');

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
