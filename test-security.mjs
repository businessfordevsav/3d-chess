// Security, rules and adversarial regression tests for the game server: npm test
// Every check talks to a real server.js over HTTP/WebSocket with a throwaway database.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import WebSocket from 'ws';

const PORT = 3998, BASE = `http://localhost:${PORT}`, DB_FILE = join(tmpdir(), `chess-security-${process.pid}.db`);
let srv;
async function startServer(env = {}) {
  srv = spawn(process.execPath, ['--no-warnings', 'server.js'], {
    cwd: import.meta.dirname, env: { ...process.env, PORT, DB_FILE, TRUST_PROXY: '1', ...env }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  srv.exited = new Promise(r => srv.once('exit', r));
  await new Promise(r => srv.stdout.once('data', r));
}
async function stopServer() { srv.kill(); await srv.exited; }
const alive = () => srv.exitCode === null && srv.signalCode === null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The server runs with TRUST_PROXY=1 here, so each test "client" gets its own address via X-Forwarded-For
// and per-network limits don't interfere between unrelated checks.
let ipSeq = 0;
const freshIp = () => `10.0.${ipSeq >> 8}.${ipSeq++ & 255}`;

function client({ cookie, ip = freshIp(), origin } = {}) {
  const headers = { 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) };
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`, { headers });
  const inbox = [], all = [], waiting = [];
  ws.on('error', () => {});
  ws.on('message', d => {
    const m = JSON.parse(d);
    all.push(m);
    const i = waiting.findIndex(([t]) => t === m.t);
    i >= 0 ? waiting.splice(i, 1)[0][1](m) : inbox.push(m);
  });
  const opened = new Promise(r => ws.once('open', r));
  const closed = new Promise(r => ws.once('close', code => r(code)));
  return {
    ws, all, opened, closed, ip,
    next(t, ms = 3000) {
      const i = inbox.findIndex(m => m.t === t);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((res, rej) => { waiting.push([t, res]); setTimeout(() => rej(new Error(`timed out waiting for "${t}"`)), ms); });
    },
    last: t => all.filter(m => m.t === t).at(-1),
    drain() { inbox.length = 0; }, // forget queued messages so the next wait sees only new ones
    async send(m) { await opened; ws.send(typeof m === 'string' ? m : JSON.stringify(m)); },
    close() { ws.close(); },
  };
}
const moves = pgn => pgn.replace(/\[.*?\]\s*/g, '').replace(/\s*(\*|1-0|0-1|1\/2-1\/2)$/, '').trim();
const post = (path, body, headers = {}) => fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': freshIp(), ...headers }, body: JSON.stringify(body) });
async function signup(name) {
  const r = await post('/api/signup', { name, password: 'correct horse' });
  assert.equal(r.status, 201, `sign up ${name}`);
  return r.headers.get('set-cookie').split(';')[0];
}
const profile = async name => (await fetch(BASE + '/api/users/' + name)).json();

// seat two players in a new private room; resolves to { w, b, room, tokens }
async function pair(tc = 'none', cookieA, cookieB) {
  const a = client({ cookie: cookieA });
  a.send({ t: 'create', tc });
  const ja = await a.next('joined');
  await a.next('state');
  const b = client({ cookie: cookieB });
  b.send({ t: 'join', room: ja.room });
  const jb = await b.next('joined');
  const sb = await b.next('state');
  await a.next('state');
  return sb.you === 'w' ? { w: b, b: a, room: ja.room, tokens: { w: jb.token, b: ja.token } } : { w: a, b, room: ja.room, tokens: { w: ja.token, b: jb.token } };
}
// a move and the state that follows it (both players receive it)
async function play(g, who, from, to, promotion) {
  g[who].send({ t: 'move', from, to, promotion });
  const [s] = await Promise.all([g.w.next('state'), g.b.next('state')]);
  return s;
}
// rooms planted straight into the database, so tests can start from any FEN; both seats are guests
function plant(id, fen, { tc = 'none', clock = null } = {}) {
  const db = new DatabaseSync(DB_FILE);
  db.prepare('INSERT INTO live_rooms VALUES (?, ?, ?)').run(id, JSON.stringify({
    tc, listed: false, ip: null, pgn: `[SetUp "1"]\n[FEN "${fen}"]\n\n*`,
    seats: { w: { token: `w-${id}`, userId: null }, b: { token: `b-${id}`, userId: null } },
    clock, result: null, drawOffer: null, rematch: [], chat: [], savedAt: Date.now(),
  }), Date.now());
  db.close();
}
async function seat(id) {
  const w = client(), b = client();
  w.send({ t: 'join', room: id, token: `w-${id}` });
  b.send({ t: 'join', room: id, token: `b-${id}` });
  await Promise.all([w.next('joined'), b.next('joined')]);
  await Promise.all([w.next('state'), b.next('state')]);
  await sleep(150); // the first to join also gets a state when the second arrives; let it land, then drop it
  w.drain(); b.drain();
  return { w, b, room: id };
}
const closeAll = (...gs) => { for (const g of gs) for (const k of ['w', 'b']) g[k]?.close(); };

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', name, e.message]); }
}

// --- planted positions (written before the server starts so they load as live rooms) ---
await startServer(); // creates the schema
await stopServer();
plant('castle0001', '4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1');                  // f1 attacked: O-O through check
plant('castle0002', 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');                // castling rights lost after the king moves
plant('check00001', '4k3/8/8/8/8/8/3r4/4K3 w - - 0 1');                     // d1 attacked: moving into check
plant('pinned0001', '4k3/4r3/8/8/8/8/4B3/4K3 w - - 0 1');                   // bishop pinned to the king
for (const p of 'qrbn') plant(`promo000${p}`, '8/1P5k/8/8/8/8/7P/K7 w - - 0 1'); // promotion to each piece
plant('promobad01', '8/1P5k/8/8/8/8/7P/K7 w - - 0 1');                      // invalid promotion pieces
plant('stalemate1', 'k7/8/1Q6/8/8/8/8/7K w - - 0 1');                       // Qc7 stalemates
plant('insuffic01', '8/8/8/4k3/8/8/3n4/4K3 w - - 0 1');                     // Kxd2 leaves bare kings
plant('fiftymove1', '8/8/8/4k3/8/8/8/R3K3 w - - 99 80');                    // the 100th quiet half-move: claimable
plant('fiftymove2', '8/8/8/4k3/8/8/8/R3K3 w - - 99 80');                    // claimed with the wrong player… then right
plant('seventyfive', '8/8/8/4k3/8/8/8/R3K3 w - - 149 80');                  // the 150th quiet half-move: automatic
plant('flagrace01', '3qk3/8/8/8/8/8/8/4K3 w - - 0 1', { tc: '1+0', clock: { w: 300, b: 6e4, inc: 0, running: 'w', since: Date.now() } });
await startServer();

try {
  // ===== chess rules, enforced by the server =====
  await check('rules: castling through an attacked square is refused, the other side is allowed', async () => {
    const g = await seat('castle0001');
    let s = await play(g, 'w', 'e1', 'g1');
    assert.equal(moves(s.pgn), '', 'O-O through f1 accepted');
    s = await play(g, 'w', 'e1', 'c1');
    assert.equal(moves(s.pgn), '1. O-O-O');
    closeAll(g);
  });
  await check('rules: no castling after the king has moved and come back', async () => {
    const g = await seat('castle0002');
    for (const [who, f, t] of [['w', 'e1', 'f1'], ['b', 'e8', 'f8'], ['w', 'f1', 'e1'], ['b', 'f8', 'e8']]) await play(g, who, f, t);
    const s = await play(g, 'w', 'e1', 'g1');
    assert.equal(moves(s.pgn).split(/\s+/).filter(x => !x.endsWith('.')).length, 4, 'castled after the king moved');
    closeAll(g);
  });
  await check('rules: moving into check and moving a pinned piece are refused', async () => {
    const g = await seat('check00001');
    assert.equal(moves((await play(g, 'w', 'e1', 'd1')).pgn), '');
    assert.equal(moves((await play(g, 'w', 'e1', 'f1')).pgn), '1. Kf1');
    const p = await seat('pinned0001');
    assert.equal(moves((await play(p, 'w', 'e2', 'd3')).pgn), '');
    closeAll(g, p);
  });
  await check('rules: en passant only on the very next move', async () => {
    const now = await pair(), later = await pair();
    for (const g of [now, later]) for (const [who, f, t] of [['w', 'e2', 'e4'], ['b', 'a7', 'a6'], ['w', 'e4', 'e5'], ['b', 'd7', 'd5']]) await play(g, who, f, t);
    assert.match(moves((await play(now, 'w', 'e5', 'd6')).pgn), /exd6$/);
    await play(later, 'w', 'h2', 'h3'); await play(later, 'b', 'h7', 'h6');
    assert.doesNotMatch(moves((await play(later, 'w', 'e5', 'd6')).pgn), /exd6/, 'en passant accepted a move too late');
    closeAll(now, later);
  });
  await check('rules: promotion to queen, rook, bishop and knight', async () => {
    for (const p of 'qrbn') {
      const g = await seat(`promo000${p}`);
      assert.match(moves((await play(g, 'w', 'b7', 'b8', p)).pgn), new RegExp(`b8=${p.toUpperCase()}`));
      closeAll(g);
    }
  });
  await check('scenario 11: invalid or missing promotion pieces are refused', async () => {
    const g = await seat('promobad01');
    for (const p of ['k', 'p', 'K', 'qq', 'x', '', undefined]) assert.equal(moves((await play(g, 'w', 'b7', 'b8', p)).pgn), '', `promotion ${p}`);
    closeAll(g);
  });
  await check('rules: checkmate ends the game and nothing moves afterwards (scenario 5)', async () => {
    const g = await pair();
    let s;
    for (const [who, f, t] of [['w', 'f2', 'f3'], ['b', 'e7', 'e5'], ['w', 'g2', 'g4'], ['b', 'd8', 'h4']]) s = await play(g, who, f, t);
    assert.deepEqual(s.result, { winner: 'b', reason: 'checkmate' });
    s = await play(g, 'w', 'e2', 'e3');
    assert.equal(moves(s.pgn), '1. f3 e5 2. g4 Qh4#');
    closeAll(g);
  });
  await check('rules: stalemate and insufficient material end the game at once', async () => {
    const st = await seat('stalemate1');
    assert.deepEqual((await play(st, 'w', 'b6', 'c7')).result, { winner: null, reason: 'stalemate' });
    const im = await seat('insuffic01');
    assert.deepEqual((await play(im, 'w', 'e1', 'd2')).result, { winner: null, reason: 'insufficient material' });
    closeAll(st, im);
  });
  await check('rules: threefold repetition is a draw a player claims; play goes on until someone does', async () => {
    const tf = await pair();
    let s;
    const shuffle = [['w', 'g1', 'f3'], ['b', 'g8', 'f6'], ['w', 'f3', 'g1'], ['b', 'f6', 'g8']];
    for (const [who, f, t] of shuffle) s = await play(tf, who, f, t);
    assert.equal(s.claimable, null, 'claimable after only two occurrences');
    for (const [who, f, t] of shuffle) s = await play(tf, who, f, t);
    assert.equal(s.result, null, 'threefold ended the game by itself');
    assert.equal(s.claimable, 'threefold repetition');
    tf.b.send({ t: 'claim' }); // either player may claim, here the one not on move
    const [c] = await Promise.all([tf.w.next('state'), tf.b.next('state')]);
    assert.deepEqual(c.result, { winner: null, reason: 'threefold repetition' });
    closeAll(tf);
  });
  await check('rules: claims are checked by the server; spectators and early claims change nothing', async () => {
    const g = await pair();
    await play(g, 'w', 'e2', 'e4');
    g.w.send({ t: 'claim', reason: 'threefold repetition' }); // nothing to claim
    const spy = client();
    spy.send({ t: 'join', room: g.room }); await spy.next('joined');
    await sleep(250);
    assert.equal(g.b.last('state').result, null);
    // the fifty-move rule: claimable after the 100th quiet half-move; a spectator's claim is ignored
    const fm = await seat('fiftymove2');
    const s = await play(fm, 'w', 'a1', 'a2');
    assert.equal(s.result, null, 'fifty moves ended the game by itself');
    assert.equal(s.claimable, '50-move rule');
    const watcher = client();
    watcher.send({ t: 'join', room: 'fiftymove2' }); await watcher.next('joined');
    watcher.send({ t: 'claim' }); await sleep(250);
    assert.equal(fm.w.last('state').result, null, 'a spectator claimed the draw');
    fm.w.drain(); fm.b.drain(); // drop the updates sent when the spectator joined
    fm.w.send({ t: 'claim' });
    const [c] = await Promise.all([fm.w.next('state'), fm.b.next('state')]);
    assert.deepEqual(c.result, { winner: null, reason: '50-move rule' });
    closeAll(g, fm); spy.close(); watcher.close();
  });
  await check('rules: fivefold repetition and the 75-move rule end the game automatically', async () => {
    const ff = await pair();
    let s;
    for (let i = 0; i < 4; i++) for (const [who, f, t] of [['w', 'g1', 'f3'], ['b', 'g8', 'f6'], ['w', 'f3', 'g1'], ['b', 'f6', 'g8']]) s = await play(ff, who, f, t);
    assert.deepEqual(s.result, { winner: null, reason: 'fivefold repetition' });
    const sf = await seat('seventyfive');
    assert.deepEqual((await play(sf, 'w', 'a1', 'a2')).result, { winner: null, reason: '75-move rule' });
    // the fifty-move claim from earlier also still works on its own room
    const fm = await seat('fiftymove1');
    assert.equal((await play(fm, 'w', 'a1', 'a2')).claimable, '50-move rule');
    closeAll(ff, sf, fm);
  });

  // ===== adversarial scenario matrix =====
  await check('scenario 1: a player cannot move twice in a row', async () => {
    const g = await pair();
    await play(g, 'w', 'e2', 'e4');
    const s = await play(g, 'w', 'd2', 'd4');
    assert.equal(moves(s.pgn), '1. e4');
    closeAll(g);
  });
  await check('scenario 2: an illegal move is refused and the next legal one accepted', async () => {
    const g = await pair();
    assert.equal(moves((await play(g, 'w', 'e2', 'e5')).pgn), '');
    assert.equal(moves((await play(g, 'w', 'e2', 'e4')).pgn), '1. e4');
    closeAll(g);
  });
  await check('scenario 3: two conflicting moves sent at once: exactly one is applied', async () => {
    const g = await pair();
    g.w.ws.send(JSON.stringify({ t: 'move', from: 'e2', to: 'e4' }));
    g.w.ws.send(JSON.stringify({ t: 'move', from: 'd2', to: 'd4' }));
    await sleep(300);
    assert.equal(moves(g.b.last('state').pgn), '1. e4');
    closeAll(g);
  });
  await check('scenario 4 and 15: resending a move (also after reconnecting) never applies it twice', async () => {
    const g = await pair();
    await play(g, 'w', 'e2', 'e4');
    g.w.ws.send(JSON.stringify({ t: 'move', from: 'e2', to: 'e4' }));
    g.w.close();
    const again = client();
    again.send({ t: 'join', room: g.room, token: g.tokens.w });
    await again.next('joined');
    await again.next('state');
    again.send({ t: 'move', from: 'e2', to: 'e4' });
    const s = await again.next('state');
    assert.equal(moves(s.pgn), '1. e4');
    again.close(); g.b.close();
  });
  await check('scenario 6 and 14: client-supplied results, boards and histories are ignored', async () => {
    const g = await pair();
    for (const m of [{ t: 'state', result: { winner: 'w', reason: 'checkmate' }, pgn: '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#' },
      { t: 'result', winner: 'w' }, { t: 'finish', winner: 'w' }, { t: 'move', from: 'e2', to: 'e4', fen: '8/8/8/8/8/8/8/K6k w - - 0 1', result: { winner: 'w' }, pgn: '1. f3' }])
      g.w.ws.send(JSON.stringify(m));
    await sleep(300);
    const s = g.b.last('state');
    assert.equal(moves(s.pgn), '1. e4');
    assert.equal(s.result, null);
    closeAll(g);
  });
  await check('scenario 7: spectators and strangers cannot act on a game', async () => {
    const g = await pair();
    const spy = client();
    spy.send({ t: 'join', room: g.room, token: 'guessed-token' });
    assert.equal((await spy.next('joined')).token, null);
    for (const m of [{ t: 'move', from: 'e2', to: 'e4' }, { t: 'resign' }, { t: 'draw' }, { t: 'rematch' }, { t: 'chat', text: 'hi' }]) spy.ws.send(JSON.stringify(m));
    await sleep(300);
    const s = g.w.last('state');
    assert.equal(moves(s.pgn), '');
    assert.equal(s.result, null);
    assert.equal(s.drawOffer, null);
    assert.ok(!g.w.all.some(m => m.t === 'chat' && m.log.length), 'a spectator chat message got through');
    closeAll(g); spy.close();
  });
  await check('scenario 8: reconnecting does not reset or pause your clock', async () => {
    const g = await pair('1+0');
    await play(g, 'w', 'e2', 'e4');
    const before = g.b.last('state').clock.b;
    g.b.close();
    await sleep(600);
    const back = client();
    back.send({ t: 'join', room: g.room, token: g.tokens.b });
    await back.next('joined');
    const s = await back.next('state');
    assert.equal(s.clock.running, 'b');
    assert.ok(s.clock.b <= before - 500, `clock went from ${before} to ${s.clock.b}`);
    back.close(); g.w.close();
  });
  await check('scenario 9: a move arriving after the deadline is refused and the game is lost on time', async () => {
    const g = await seat('flagrace01');
    await sleep(350);
    g.w.send({ t: 'move', from: 'e1', to: 'e2' });
    await sleep(200);
    const s = g.b.last('state');
    assert.equal(moves(s.pgn), '');
    assert.deepEqual(s.result, { winner: 'b', reason: 'timeout' });
    closeAll(g);
  });
  await check('scenario 10: malformed, hostile and oversized messages do not crash the server', async () => {
    const c = client();
    await c.opened;
    for (const raw of ['null', '1', '"x"', '[]', '{}', '{"t":5}', '{"t":"move","from":{"x":1},"to":[1]}', '{"__proto__":{"t":"lobby","polluted":1}}',
      '{"t":"join","room":{"toString":1}}', '{"t":"seek","tc":"__proto__"}', 'not json', '{"t":"chat","text":{"a":1}}']) c.ws.send(raw);
    c.ws.send(Buffer.from([0xff, 0xfe, 0xfd])); // not valid UTF-8 JSON
    await sleep(300);
    assert.ok(alive(), 'server died on a malformed message');
    const big = client();
    await big.opened;
    big.ws.send(JSON.stringify({ t: 'chat', text: 'x'.repeat(5000) }));
    assert.ok([1006, 1009].includes(await big.closed), 'oversized message did not close the connection');
    await sleep(200);
    assert.ok(alive(), 'server died on an oversized message');
    const after = client();
    after.send({ t: 'lobby' });
    await after.next('lobby');
    c.close(); after.close();
  });
  await check('scenario 12: a finished, rated game is not rated or saved twice after a restart', async () => {
    const x = await signup('restart_x'), y = await signup('restart_y');
    const g = await pair('none', x, y);
    await play(g, 'w', 'e2', 'e4'); await play(g, 'b', 'e7', 'e5');
    g.w.send({ t: 'resign' });
    await Promise.all([g.w.next('state'), g.b.next('state')]);
    const before = [await profile('restart_x'), await profile('restart_y')];
    closeAll(g);
    await stopServer();
    await startServer();
    const after = [await profile('restart_x'), await profile('restart_y')];
    assert.deepEqual(after.map(p => [p.rating, p.games.length]), before.map(p => [p.rating, p.games.length]));
  });
  await check('scenario 13: matchmaking and room inputs cannot be bent', async () => {
    for (const tc of ['toString', '__proto__', 'constructor', 'hasOwnProperty', 42, null]) {
      const c = client();
      c.send({ t: 'seek', tc });
      await sleep(80);
      assert.ok(!c.all.some(m => m.t === 'seeking'), `seek accepted tc ${tc}`);
      c.send({ t: 'create', tc });
      const s = await c.next('state');
      assert.equal(s.tc, '5+3', `create kept tc ${tc}`);
      c.close();
    }
    // the same account can't be paired with itself
    const solo = await signup('solo_player');
    const s1 = client({ cookie: solo }), s2 = client({ cookie: solo });
    s1.send({ t: 'seek', tc: '3+2' }); await s1.next('seeking');
    s2.send({ t: 'seek', tc: '3+2' }); await s2.next('seeking');
    assert.ok(!s1.all.some(m => m.t === 'joined') && !s2.all.some(m => m.t === 'joined'), 'paired a player with themselves');
    s1.close(); s2.close();
  });

  // ===== confirmed findings (regressions) =====
  await check('F-01/F-02: "null" and oversized frames no longer stop the server', async () => {
    const c = client();
    await c.send('null');
    await sleep(200);
    assert.ok(alive());
  });
  await check('F-03: time control "toString" cannot create a NaN clock that flags on the first move', async () => {
    const g = await pair('toString');
    const s = await play(g, 'w', 'e2', 'e4');
    assert.equal(s.tc, '5+3');
    assert.equal(s.result, null);
    closeAll(g);
  });
  await check('F-04: one account in two rated games at once: both results count', async () => {
    const carol = await signup('carol'), dave = await signup('dave'), erin = await signup('erin');
    const a = await pair('none', carol, dave), b = await pair('none', carol, erin);
    for (const g of [a, b]) { await play(g, 'w', 'e2', 'e4'); await play(g, 'b', 'e7', 'e5'); }
    const carolIn = g => g.w.last('state').players.w?.name === 'carol' ? 'w' : 'b';
    a[carolIn(a)].send({ t: 'resign' }); await sleep(250);
    b[carolIn(b) === 'w' ? 'b' : 'w'].send({ t: 'resign' }); await sleep(250);
    const p = await profile('carol');
    const sum = p.games.reduce((t, x) => t + (x.white === 'carol' ? x.white_change : x.black_change), 0);
    assert.ok(Math.abs(p.rating - (1500 + sum)) <= 1, `rating ${p.rating}, but its changes add up to ${1500 + sum}`);
    closeAll(a, b);
  });
  await check('F-05/R-3: an account seat keeps its account; the token alone only lets you watch', async () => {
    const fred = await signup('fred'), gina = await signup('gina');
    const g = await pair('none', fred, gina);
    await play(g, 'w', 'e2', 'e4'); await play(g, 'b', 'e7', 'e5');
    const fredColor = g.w.last('state').players.w.name === 'fred' ? 'w' : 'b';
    // the seat token without fred's login (a tab left after signing out, or a copied token): spectator only
    const ghost = client();
    ghost.send({ t: 'join', room: g.room, token: g.tokens[fredColor] });
    assert.equal((await ghost.next('joined')).token, null);
    const gs = await ghost.next('state');
    assert.equal(gs.you, null);
    assert.equal(gs.players[fredColor].name, 'fred');
    ghost.send({ t: 'resign' }); await sleep(250);
    assert.equal(g.b.last('state').result, null, 'the token alone could resign for fred');
    // another account holding the token can't take it either
    const ivan = await signup('ivan_x'), other = client({ cookie: ivan });
    other.send({ t: 'join', room: g.room, token: g.tokens[fredColor] });
    assert.equal((await other.next('joined')).token, null);
    // fred himself, signed in, gets the seat back without any token; his resignation counts
    const back = client({ cookie: fred });
    back.send({ t: 'join', room: g.room });
    await back.next('joined');
    assert.equal((await back.next('state')).you, fredColor);
    back.send({ t: 'resign' }); await sleep(250);
    const p = await profile('fred');
    assert.equal(p.games.length, 1);
    assert.ok(p.rating < 1500);
    closeAll(g); ghost.close(); other.close(); back.close();
  });
  await check('R-1: two accounts on the same network play unrated (anti-farming)', async () => {
    const ip = freshIp(), x = await signup('same_net_a'), y = await signup('same_net_b');
    const a = client({ cookie: x, ip });
    a.send({ t: 'create', tc: 'none' });
    const ja = await a.next('joined');
    await a.next('state');
    const b = client({ cookie: y, ip });
    b.send({ t: 'join', room: ja.room });
    await b.next('joined');
    const sb = await b.next('state');
    await a.next('state');
    const g = sb.you === 'w' ? { w: b, b: a } : { w: a, b };
    await play(g, 'w', 'e2', 'e4'); await play(g, 'b', 'e7', 'e5');
    g.w.send({ t: 'resign' });
    const [s] = await Promise.all([g.w.next('state'), g.b.next('state')]);
    assert.equal(s.result.changes, undefined);
    assert.match(s.result.unrated, /same network/);
    for (const n of ['same_net_a', 'same_net_b']) {
      const p = await profile(n);
      assert.deepEqual([p.rating, p.games.length, p.games[0].rated], [1500, 1, 0], n);
    }
    closeAll(g);
  });
  await check('R-1: after 3 rated games between the same two accounts in a day, more are unrated', async () => {
    const x = await signup('repeat_a'), y = await signup('repeat_b');
    const outcomes = [];
    for (let i = 0; i < 4; i++) {
      const g = await pair('none', x, y);
      await play(g, 'w', 'e2', 'e4'); await play(g, 'b', 'e7', 'e5');
      g.b.send({ t: 'resign' });
      const [s] = await Promise.all([g.w.next('state'), g.b.next('state')]);
      outcomes.push(s.result.unrated ?? 'rated');
      closeAll(g);
    }
    assert.deepEqual(outcomes.slice(0, 3), ['rated', 'rated', 'rated']);
    assert.match(outcomes[3], /3 rated games/);
    const p = await profile('repeat_a');
    assert.deepEqual(p.games.map(gm => gm.rated), [0, 1, 1, 1]); // newest first
  });
  await check('F-06: one network cannot fill the server with empty rooms', async () => {
    const ip = freshIp();
    let created = 0;
    for (let i = 0; i < 14; i++) {
      const c = client({ ip });
      c.send({ t: 'create', tc: 'none' });
      const r = await Promise.race([c.next('joined').then(() => 1), c.next('error').then(() => 0)]);
      created += r;
      c.close();
    }
    assert.equal(created, 10);
    const other = client(); // another network still can
    other.send({ t: 'create', tc: 'none' });
    await other.next('joined');
    other.close();
  });
  await check('F-07: message floods close the connection; F-08: connections per network are capped', async () => {
    const c = client();
    await c.opened;
    for (let i = 0; i < 100; i++) c.ws.send(JSON.stringify({ t: 'lobby' }));
    assert.equal(await c.closed, 1008);
    const ip = freshIp(), cs = Array.from({ length: 33 }, () => client({ ip }));
    await sleep(700);
    assert.equal(cs.filter(x => x.ws.readyState === WebSocket.OPEN).length, 30);
    cs.forEach(x => x.close());
  });
  await check('F-09: private friend games are not listed for strangers; matchmaking games are', async () => {
    const g = await pair();
    const p1 = client(), p2 = client();
    p1.send({ t: 'seek', tc: '10+0' }); await p1.next('seeking');
    p2.send({ t: 'seek', tc: '10+0' });
    const { room: public_ } = await p2.next('joined');
    await sleep(400);
    const lob = client();
    lob.send({ t: 'lobby' });
    const l = await lob.next('lobby');
    assert.ok(!l.games.some(x => x.id === g.room), 'private game listed');
    assert.ok(l.games.some(x => x.id === public_), 'matchmaking game missing');
    assert.match(g.room, /^[0-9a-f]{16}$/, 'room ids should be 64-bit');
    closeAll(g); p1.close(); p2.close(); lob.close();
  });
  await check('F-10: sign-ups are limited per network; system-looking names are reserved', async () => {
    const ip = freshIp(), statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await post('/api/signup', { name: `burst_${i}`, password: 'correct horse' }, { 'x-forwarded-for': ip })).status);
    assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429, 429]);
    for (const name of ['Guest', 'white', 'BLACK', 'Stockfish', 'admin']) assert.equal((await post('/api/signup', { name, password: 'correct horse' })).status, 400, name);
  });
  await check('F-11: signing out ends the sockets opened with that session', async () => {
    const hank = await signup('hank');
    const c = client({ cookie: hank });
    c.send({ t: 'lobby' }); await c.next('lobby');
    await post('/api/logout', {}, { cookie: hank });
    assert.equal(await c.closed, 4001);
  });
  await check('F-12: security headers on pages and API', async () => {
    for (const p of ['/', '/api/me']) {
      const h = (await fetch(BASE + p)).headers;
      assert.match(h.get('content-security-policy'), /frame-ancestors 'none'/);
      assert.equal(h.get('x-frame-options'), 'DENY');
      assert.equal(h.get('x-content-type-options'), 'nosniff');
    }
    assert.equal((await fetch(BASE + '/api/me')).headers.get('cache-control'), 'no-store');
  });
  await check('F-15: scripts come only from this site; the page\'s inline scripts are allowed by exact hash', async () => {
    const r = await fetch(BASE + '/'), html = await r.text();
    const scriptSrc = r.headers.get('content-security-policy').split('; ').find(d => d.startsWith('script-src '));
    assert.doesNotMatch(scriptSrc, /unsafe-inline|unsafe-eval|https?:|blob:|\*/, `script-src too loose: ${scriptSrc}`);
    // the hashes must match the page's inline scripts exactly, or the browser would block them
    const { createHash } = await import('node:crypto');
    const want = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].filter(m => m[1].trim())
      .map(m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
    assert.equal(want.length, 2, 'expected the import map and the module script');
    for (const h of want) assert.ok(scriptSrc.includes(h), `missing hash ${h}`);
    assert.doesNotMatch(html, /cdn\.jsdelivr|cdnjs|unpkg/, 'the page still references a script CDN');
    // the vendored libraries are served as JavaScript, and nothing outside vendor/ leaks through it
    for (const p of ['/vendor/three/build/three.module.js', '/vendor/three/examples/jsm/loaders/GLTFLoader.js', '/vendor/chess.js', '/vendor/stockfish.js'])
      assert.match((await fetch(BASE + p)).headers.get('content-type'), /text\/javascript/, p);
    for (const p of ['/vendor/../server.js', '/vendor/%2e%2e/package.json', '/vendor/', '/node_modules/ws/package.json'])
      assert.equal((await fetch(BASE + p)).status, 404, p);
  });
  await check('F-13: an unknown name and a wrong password look the same to the client', async () => {
    await signup('ivy');
    const a = await post('/api/login', { name: 'ivy', password: 'wrong password' }), b = await post('/api/login', { name: 'nobody_here', password: 'wrong password' });
    assert.deepEqual([a.status, await a.json()], [b.status, await b.json()]);
  });

  // ===== F-14: first-move deadline (run with a 0.8 s window instead of 30 s) =====
  await stopServer();
  await startServer({ FIRST_MOVE_MS: '800' });
  await check('F-14: no first move from White in time: the game is aborted, unrated and not saved', async () => {
    const jo = await signup('abort_w'), ka = await signup('abort_b');
    const g = await pair('3+2', jo, ka);
    const s0 = g.w.last('state');
    assert.ok(s0.firstMoveMs > 0 && s0.firstMoveMs <= 800, `firstMoveMs ${s0.firstMoveMs}`);
    await sleep(1100);
    const s = g.b.last('state');
    assert.deepEqual(s.result, { winner: null, reason: 'aborted' });
    for (const n of ['abort_w', 'abort_b']) {
      const p = await profile(n);
      assert.deepEqual([p.rating, p.games.length], [1500, 0], n);
    }
    // a late move after the abort changes nothing; a rematch still works
    g.w.send({ t: 'move', from: 'e2', to: 'e4' }); await sleep(150);
    assert.equal(moves(g.b.last('state').pgn), '');
    g.w.send({ t: 'rematch' }); g.b.send({ t: 'rematch' }); await sleep(250);
    const r = g.b.last('state');
    assert.equal(r.result, null);
    assert.ok(r.firstMoveMs > 0, 'the rematch should have its own first-move deadline');
    closeAll(g);
  });
  await check('F-14: White moves, Black never does: aborted after Black\'s own window', async () => {
    const g = await pair('none');
    await sleep(500);
    await play(g, 'w', 'e2', 'e4'); // 0.5 s into White's 0.8 s
    await sleep(500);
    assert.equal(g.b.last('state').result, null, 'aborted before Black\'s window ran out');
    await sleep(500);
    assert.deepEqual(g.b.last('state').result, { winner: null, reason: 'aborted' });
    closeAll(g);
  });
  await check('F-14: once both sides have moved there is no deadline, and reconnecting does not reset it', async () => {
    const g = await pair('none');
    await play(g, 'w', 'e2', 'e4');
    const s = await play(g, 'b', 'e7', 'e5');
    assert.equal(s.firstMoveMs, null);
    await sleep(1000);
    assert.equal(g.w.last('state').result, null);
    const h = await pair('none');
    await sleep(500);
    h.w.close(); // White drops and comes back: the deadline keeps running
    const back = client();
    back.send({ t: 'join', room: h.room, token: h.tokens.w });
    await back.next('joined');
    assert.ok((await back.next('state')).firstMoveMs <= 350, 'reconnecting reset the deadline');
    await sleep(500);
    assert.deepEqual(h.b.last('state').result, { winner: null, reason: 'aborted' });
    closeAll(g); back.close(); h.b.close();
  });

  // without TRUST_PROXY, X-Forwarded-For is ignored, so a client can't dodge limits by inventing addresses
  await check('F-10b: X-Forwarded-For is ignored unless TRUST_PROXY is set', async () => {
    await stopServer();
    await startServer({ TRUST_PROXY: '' });
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await post('/api/signup', { name: `xff_${i}`, password: 'correct horse' })).status); // a different X-F-F each time
    assert.deepEqual(statuses.slice(5), [429, 429]);
  });

  assert.ok(alive(), 'server stopped during the run');
} finally {
  srv.kill();
  await srv.exited;
  for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) rmSync(f, { force: true });
}

for (const [status, name, why] of results) console.log(`${status}  ${name}${why ? `\n      ${why}` : ''}`);
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\nsecurity: ${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
