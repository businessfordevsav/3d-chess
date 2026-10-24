// Smoke test for the room server: npm test
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import WebSocket from 'ws';
import { glicko2 } from './glicko2.js';

// the worked example from Glickman's Glicko-2 paper
const ex = glicko2({ rating: 1500, rd: 200, vol: 0.06 }, [[{ rating: 1400, rd: 30 }, 1], [{ rating: 1550, rd: 100 }, 0], [{ rating: 1700, rd: 300 }, 0]]);
assert.deepEqual([ex.rating.toFixed(2), ex.rd.toFixed(2), ex.vol.toFixed(5)], ['1464.05', '151.52', '0.06000']);

const PORT = 3999, BASE = `http://localhost:${PORT}`, DB_FILE = join(tmpdir(), `chess-test-${process.pid}.db`);
let srv;
async function startServer() {
  srv = spawn(process.execPath, ['--no-warnings', 'server.js'], { cwd: import.meta.dirname, env: { ...process.env, PORT, DB_FILE, TRUST_PROXY: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
}
async function stopServer() {
  const exited = new Promise(r => srv.once('exit', r));
  srv.kill();
  await exited;
}
await startServer();

// each connection gets its own address (the server trusts X-Forwarded-For here): rated games need
// the two players on different networks
let nextIp = 0;
function client(cookie) {
  const headers = { 'x-forwarded-for': `10.1.${nextIp >> 8}.${nextIp++ & 255}`, ...(cookie ? { cookie } : {}) };
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`, { headers }), inbox = [], waiting = [];
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

  // a third person watches: no seat, no token, and can't move or chat
  const c = client();
  c.send({ t: 'join', room: ja.room });
  assert.equal((await c.next('joined')).token, null);
  const watching = await c.next('state');
  assert.equal(watching.you, null);
  assert.equal(watching.watchers, 1);
  await a.next('state'); await b.next('state');
  c.send({ t: 'move', from: 'e7', to: 'e5' });
  c.send({ t: 'chat', text: 'hi from the crowd' });

  // chat from a player reaches both players and the spectator
  white.send({ t: 'chat', text: '  good luck!  ' });
  for (const x of [a, b, c]) {
    let log;
    do log = (await x.next('chat')).log; while (!log.length); // skip the history sent on joining
    assert.deepEqual(log, [{ from: 'w', name: null, text: 'good luck!' }]); // guests have no name
  }

  // a player who drops can come back to the same seat with their token
  b.ws.close();
  assert.equal((await a.next('state')).seats[jb.color], 'away');
  await c.next('state');
  const b2 = client();
  b2.send({ t: 'join', room: ja.room, token: jb.token });
  await b2.next('joined');
  const back = await b2.next('state');
  assert.equal(back.you, jb.color);
  assert.equal(moves(back.pgn), '1. e4');
  assert.equal((await a.next('state')).seats[jb.color], 'here');
  await c.next('state');

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

  // matchmaking: two seekers on the same time control get paired; the lobby lists live games
  const lob = client();
  lob.send({ t: 'lobby' });
  await lob.next('lobby');
  const s1 = client(), s2 = client();
  s1.send({ t: 'seek', tc: '10+0' });
  assert.equal((await s1.next('seeking')).tc, '10+0');
  s2.send({ t: 'seek', tc: '10+0' });
  const [p1, p2] = [await s1.next('joined'), await s2.next('joined')];
  assert.equal(p1.room, p2.room);
  const [st1, st2] = [await s1.next('state'), await s2.next('state')];
  assert.notEqual(st1.you, st2.you);
  assert.equal(st1.tc, '10+0');
  let listed;
  do listed = await lob.next('lobby'); while (!listed.games.some(g => g.id === p1.room));
  assert.deepEqual(listed.seeking, []);

  // accounts: sign up, bad input, duplicates, wrong password, JSON-only posts
  const post = (path, body, type = 'application/json') => fetch(BASE + path, { method: 'POST', headers: { 'content-type': type }, body: JSON.stringify(body) });
  const signup = async name => {
    const r = await post('/api/signup', { name, email: `${name}@example.test`, password: 'correct horse' });
    assert.equal(r.status, 201);
    return r.headers.get('set-cookie').split(';')[0];
  };
  const alice = await signup('alice'), bob = await signup('bob');
  assert.equal((await post('/api/signup', { name: 'ALICE', email: 'alice2@example.test', password: 'correct horse' })).status, 409);
  assert.equal((await post('/api/signup', { name: 'x', email: 'x@example.test', password: 'correct horse' })).status, 400);
  assert.equal((await post('/api/signup', { name: 'carol', email: 'carol@example.test', password: 'short' })).status, 400);
  assert.equal((await post('/api/login', { name: 'alice', password: 'wrong password' })).status, 401);
  assert.equal((await post('/api/login', { name: 'alice', password: 'correct horse' }, 'text/plain')).status, 415);
  const login = await post('/api/login', { name: 'alice', password: 'correct horse' });
  assert.equal((await login.json()).user.name, 'alice');
  const me = await (await fetch(BASE + '/api/me', { headers: { cookie: alice } })).json();
  assert.deepEqual(me.user, { id: 1, name: 'alice', rating: 1500, provisional: true, guest: false, hasEmail: true, emailVerified: false });

  // a rated game between two accounts: names in state, Elo after the result, saved to both profiles
  const ua = client(alice), ub = client(bob);
  ua.send({ t: 'create', tc: 'none' });
  const room = (await ua.next('joined')).room;
  await ua.next('state');
  ub.send({ t: 'join', room });
  await ub.next('joined');
  const st = await ub.next('state');
  await ua.next('state');
  assert.deepEqual(Object.values(st.players).map(p => p.name).sort(), ['alice', 'bob']);
  const [uw, ubk] = st.you === 'w' ? [ub, ua] : [ua, ub];
  let final;
  for (const [who, from, to] of [[uw, 'f2', 'f3'], [ubk, 'e7', 'e5'], [uw, 'g2', 'g4'], [ubk, 'd8', 'h4']]) { // fool's mate
    who.send({ t: 'move', from, to });
    [final] = [await ua.next('state'), await ub.next('state')];
  }
  assert.equal(final.result.reason, 'checkmate');
  assert.deepEqual(final.result.changes, { w: -162, b: 162 }); // Glicko-2: two new, uncertain ratings move a lot
  const loserName = st.you === 'w' ? 'bob' : 'alice';
  const prof = await (await fetch(BASE + '/api/users/' + loserName)).json();
  assert.equal(prof.rating, 1338);
  assert.equal(prof.provisional, true);
  assert.equal(prof.games.length, 1);
  assert.equal(prof.games[0].reason, 'checkmate');
  const saved = await (await fetch(BASE + '/api/games/' + prof.games[0].id)).json();
  assert.match(saved.pgn, /Qh4#/);

  // a signed-in player gets their seat back without the tab's token, e.g. after closing the tab
  ua.ws.close();
  const ua2 = client(alice);
  ua2.send({ t: 'join', room });
  await ua2.next('joined');
  assert.equal((await ua2.next('state')).you, st.you === 'w' ? 'b' : 'w');

  // a WebSocket opened from another site's page doesn't get the user's account
  const evil = new WebSocket(`ws://localhost:${PORT}/ws`, { headers: { cookie: bob, origin: 'http://evil.example' } }), evilMsgs = [];
  evil.on('message', d => evilMsgs.push(JSON.parse(d)));
  await new Promise(r => evil.once('open', r));
  evil.send(JSON.stringify({ t: 'join', room }));
  await new Promise(r => setTimeout(r, 300));
  assert.equal(evilMsgs.find(m => m.t === 'state').you, null); // only a spectator, not bob's seat
  for (const x of [ua2, ub]) x.ws.close();
  evil.close();

  // over HTTPS (here: a proxy saying so) the session cookie is marked Secure
  const viaHttps = await fetch(BASE + '/api/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
    body: JSON.stringify({ name: 'dave', email: 'dave@example.test', password: 'correct horse' }) });
  assert.match(viaHttps.headers.get('set-cookie'), /; Secure/);
  assert.doesNotMatch(alice, /Secure/);

  {
  // games in progress survive a server restart: same moves, same seat, clock paused while down
  const q1 = client(), q2 = client();
  q1.send({ t: 'create', tc: '10+0' });
  const live = await q1.next('joined');
  await q1.next('state');
  q2.send({ t: 'join', room: live.room });
  const live2 = await q2.next('joined');
  const before = await q2.next('state');
  await q1.next('state');
  const [lw, lwTok] = before.you === 'w' ? [q2, live2.token] : [q1, live.token];
  lw.send({ t: 'move', from: 'd2', to: 'd4' });
  const moved = await lw.next('state');
  q1.ws.close(); q2.ws.close();
  await stopServer();

  // also plant two games whose side to move has 50 ms left, to check both ways of losing on time (FIDE 6.9)
  const plant = (id, fen) => new DatabaseSync(DB_FILE).prepare('INSERT INTO live_rooms VALUES (?, ?, ?)').run(id, JSON.stringify({
    tc: '1+0', pgn: `[SetUp "1"]\n[FEN "${fen}"]\n\n*`, seats: { w: { token: 't1', userId: null }, b: { token: 't2', userId: null } },
    clock: { w: 50, b: 6e4, inc: 0, running: 'w', since: Date.now() }, result: null, drawOffer: null, rematch: [], chat: [], savedAt: Date.now() }), Date.now());
  plant('bare0001', '4k3/8/8/8/8/8/8/4K2Q w - - 0 1');  // Black has only a king: White's flag is a draw
  plant('queen001', '3qk3/8/8/8/8/8/8/4K3 w - - 0 1');  // Black has a queen: White loses on time
  await startServer();

  const back = client();
  back.send({ t: 'join', room: live.room, token: lwTok });
  await back.next('joined');
  const resumed = await back.next('state');
  assert.equal(moves(resumed.pgn), '1. d4');
  assert.equal(resumed.you, 'w'); // lw is whoever played White
  assert.equal(resumed.clock.running, 'b');
  assert.ok(Math.abs(resumed.clock.b - moved.clock.b) < 1000, 'clock paused during the restart');
  back.ws.close();
  await new Promise(r => setTimeout(r, 300)); // let the planted clocks run out
  for (const [id, result] of [['bare0001', { winner: null, reason: 'timeout vs insufficient material' }], ['queen001', { winner: 'b', reason: 'timeout' }]]) {
    const w = client();
    w.send({ t: 'join', room: id, token: 't1' });
    await w.next('joined');
    assert.deepEqual((await w.next('state')).result, result, id);
    w.ws.close();
  }
  }

  // only the page and the model folder are served
  assert.equal((await fetch(BASE + '/')).status, 200);
  assert.equal((await fetch(BASE + '/g/' + ja.room)).status, 200);
  assert.equal((await fetch(BASE + '/models/chess_set/chess_set_1k.gltf')).status, 200);
  for (const p of ['/icon.svg', '/favicon.ico']) assert.equal((await fetch(BASE + p)).headers.get('content-type'), 'image/svg+xml', p);
  for (const p of ['/server.js', '/package.json', '/models/../server.js', '/models/%2e%2e/server.js']) assert.equal((await fetch(BASE + p)).status, 404, p);

  console.log('rooms: all checks passed');
  for (const x of [a, b2, c, lob, s1, s2]) x.ws.close();
} finally {
  srv.kill();
  for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) rmSync(f, { force: true });
}
