// Account system tests: sign-up and email confirmation, sign-in by name or email, password reset,
// account settings (password, email, sessions, deletion) and Sign in with Google: npm test
// Emails are read from the server's console outbox (no SMTP configured); Google is a local mock.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const PORT = 3994, BASE = `http://localhost:${PORT}`, GPORT = 3995, GBASE = `http://localhost:${GPORT}`;
const DB_FILE = join(tmpdir(), `chess-accounts-${process.pid}.db`);

// --- a stand-in for Google's OAuth endpoints ---
const google = { challenge: null, profiles: {}, calls: [] };
const mock = createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const url = new URL(req.url, GBASE);
  if (url.pathname === '/token') {
    const f = new URLSearchParams(body);
    google.calls.push(Object.fromEntries(f));
    const verifierOk = createHash('sha256').update(f.get('code_verifier') ?? '').digest('base64url') === google.challenge;
    const profile = google.profiles[f.get('code')];
    if (f.get('client_secret') !== 'test-secret' || !verifierOk || !profile) return res.writeHead(400).end('{"error":"invalid_grant"}');
    return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access_token: `at-${f.get('code')}` }));
  }
  if (url.pathname === '/userinfo') {
    const code = (req.headers.authorization ?? '').replace('Bearer at-', '');
    return google.profiles[code] ? res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(google.profiles[code])) : res.writeHead(401).end();
  }
  res.writeHead(404).end();
});
await new Promise(r => mock.listen(GPORT, r));

// --- the game server, with its mail outbox captured from stdout ---
const outbox = [];
const srv = spawn(process.execPath, ['--no-warnings', 'server.js'], {
  cwd: import.meta.dirname, stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, PORT, DB_FILE, TRUST_PROXY: '1', APP_URL: BASE, SMTP_HOST: '',
    GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret',
    GOOGLE_AUTH_URL: `${GBASE}/auth`, GOOGLE_TOKEN_URL: `${GBASE}/token`, GOOGLE_USERINFO_URL: `${GBASE}/userinfo` },
});
let started;
const ready = new Promise(r => started = r);
let buf = '';
srv.stdout.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (line.startsWith('MAIL ')) outbox.push(JSON.parse(line.slice(5)));
    if (line.includes('3D Chess listening')) started();
  }
});
await ready;

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ipSeq = 0;
const freshIp = () => `10.9.${ipSeq >> 8}.${ipSeq++ & 255}`;
const post = (path, body, { cookie, ip = freshIp() } = {}) => fetch(BASE + path, { method: 'POST', redirect: 'manual',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const get = (path, { cookie, ip = freshIp() } = {}) => fetch(BASE + path, { redirect: 'manual', headers: { 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) } });
const cookieOf = r => r.headers.get('set-cookie')?.split(';')[0];
const me = async cookie => (await (await get('/api/me', { cookie })).json()).user;
const mailTo = async (to, ms = 2000) => { // newest email to an address
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(30)) { const m = outbox.filter(x => x.to === to).at(-1); if (m) return m; }
  return null;
};
const linkToken = (mail, kind) => mail?.text.match(new RegExp(`\\?${kind}=([0-9a-f]{64})`))?.[1];
async function signup(name, email = `${name}@example.test`, password = 'correct horse 1') {
  const r = await post('/api/signup', { name, email, password });
  assert.equal(r.status, 201, `sign up ${name}: ${(await r.clone().json()).error}`);
  return cookieOf(r);
}
const login = async (loginId, password, opts) => post('/api/login', { login: loginId, password }, opts);

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message]); }
}

try {
  await check('sign-up needs a valid email; duplicates are refused with a clear message', async () => {
    for (const email of ['', 'no-at-sign', 'a@b', 'x"@example.test', 'a@b.c;evil@x.test', 'a <b@c.test>']) {
      assert.equal((await post('/api/signup', { name: 'mailtest', email, password: 'correct horse 1' })).status, 400, `email ${JSON.stringify(email)}`);
    }
    await signup('anna');
    const dupe = await post('/api/signup', { name: 'anna2', email: 'ANNA@example.test', password: 'correct horse 1' });
    assert.equal(dupe.status, 409);
    assert.match((await dupe.json()).error, /already uses that email/);
    assert.match((await (await post('/api/signup', { name: 'Anna', email: 'other@example.test', password: 'correct horse 1' })).json()).error, /username is taken/);
  });
  await check('a confirmation email is sent; its link confirms once and then stops working', async () => {
    const c = await signup('ben');
    assert.equal((await me(c)).emailVerified, false);
    const mail = await mailTo('ben@example.test');
    assert.match(mail.subject, /Confirm your email/);
    assert.ok(mail.text.startsWith('Hi ben'), 'personal greeting');
    const token = linkToken(mail, 'verify');
    assert.ok(token, 'link with a token');
    assert.equal((await post('/api/verify', { token: token.replace(/.$/, '0') })).status, 400, 'a tampered token');
    assert.equal((await post('/api/verify', { token })).status, 200);
    assert.equal((await me(c)).emailVerified, true);
    assert.equal((await post('/api/verify', { token })).status, 400, 'used twice');
    for (const bad of ['', 'x'.repeat(64), { a: 1 }, null]) assert.equal((await post('/api/verify', { token: bad })).status, 400);
  });
  await check('sign in with name or email; failures look the same either way', async () => {
    await signup('cara');
    assert.equal((await login('cara', 'correct horse 1')).status, 200);
    assert.equal((await login('CARA@example.test', 'correct horse 1')).status, 200);
    const a = await login('cara', 'wrong'), b = await login('nobody@example.test', 'wrong'), c = await login('nobody', 'wrong');
    assert.deepEqual([a.status, b.status, c.status], [401, 401, 401]);
    const msgs = [await a.json(), await b.json(), await c.json()].map(x => x.error);
    assert.ok(msgs.every(m => m === msgs[0]), 'error messages differ');
  });
  await check('forgot password: same answer for unknown emails; a real one gets a one-time reset link', async () => {
    const before = outbox.length;
    const unknown = await post('/api/forgot', { email: 'ghost@example.test' });
    const c = await signup('dina');
    const known = await post('/api/forgot', { email: 'dina@example.test' });
    assert.deepEqual([unknown.status, (await unknown.json()).message], [known.status, (await known.json()).message]);
    assert.ok(!outbox.slice(before).some(m => m.to === 'ghost@example.test'), 'mailed an address with no account');
    const token = linkToken(await mailTo('dina@example.test'), 'reset');
    assert.ok(token, 'reset link');
    const other = cookieOf(await login('dina', 'correct horse 1'));
    assert.equal((await post('/api/reset', { token, password: 'short' })).status, 400, 'weak password accepted');
    const done = await post('/api/reset', { token, password: 'a brand new password' });
    assert.equal(done.status, 200);
    const fresh = cookieOf(done);
    assert.equal((await me(fresh)).name, 'dina', 'signed in by the reset');
    assert.equal(await me(c), null, 'the old session survived the reset');
    assert.equal(await me(other), null, 'another old session survived the reset');
    assert.equal((await login('dina', 'correct horse 1')).status, 401, 'the old password still works');
    assert.equal((await login('dina', 'a brand new password')).status, 200);
    assert.equal((await me(fresh)).emailVerified, true, 'using the emailed link proves the address');
    assert.equal((await post('/api/reset', { token, password: 'another new password' })).status, 400, 'link used twice');
  });
  await check('reset links expire; a newer link replaces the older one', async () => {
    await signup('emil');
    await post('/api/forgot', { email: 'emil@example.test' });
    const first = linkToken(await mailTo('emil@example.test'), 'reset');
    await sleep(50);
    await post('/api/forgot', { email: 'emil@example.test' });
    const second = linkToken(outbox.filter(m => m.to === 'emil@example.test').at(-1), 'reset');
    assert.notEqual(first, second);
    assert.equal((await post('/api/reset', { token: first, password: 'a brand new password' })).status, 400, 'the replaced link still works');
    const db = new DatabaseSync(DB_FILE);
    db.prepare("UPDATE tokens SET expires = ? WHERE kind = 'reset'").run(Date.now() - 1000);
    db.close();
    assert.equal((await post('/api/reset', { token: second, password: 'a brand new password' })).status, 400, 'an expired link works');
  });
  await check('reset emails are rate limited per account and per network', async () => {
    await signup('fred_r');
    const before = outbox.filter(m => m.to === 'fred_r@example.test').length;
    for (let i = 0; i < 6; i++) await post('/api/forgot', { email: 'fred_r@example.test' });
    assert.equal(outbox.filter(m => m.to === 'fred_r@example.test').length - before, 3, 'per-account limit');
    const ip = freshIp(), statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await post('/api/forgot', { email: `x${i}@example.test` }, { ip })).status);
    assert.deepEqual(statuses.slice(5), [429, 429]);
  });
  await check('change password: needs the current one, signs out other devices, keeps this one', async () => {
    const c = await signup('gail');
    const other = cookieOf(await login('gail', 'correct horse 1'));
    assert.equal((await post('/api/account/password', { current: 'wrong', password: 'a brand new password' }, { cookie: c })).status, 403);
    assert.equal((await post('/api/account/password', { current: 'correct horse 1', password: 'tiny' }, { cookie: c })).status, 400);
    assert.equal((await post('/api/account/password', { current: 'correct horse 1', password: 'a brand new password' }, { cookie: c })).status, 200);
    assert.equal((await me(c)).name, 'gail');
    assert.equal(await me(other), null);
    assert.equal((await login('gail', 'a brand new password')).status, 200);
    assert.equal((await post('/api/account/password', { password: 'x'.repeat(10) })).status, 401, 'works without signing in');
  });
  await check('change email: needs the password, starts unconfirmed, old links stop working', async () => {
    const c = await signup('hugo');
    const oldLink = linkToken(await mailTo('hugo@example.test'), 'verify');
    assert.equal((await post('/api/account/email', { email: 'hugo2@example.test', current: 'nope' }, { cookie: c })).status, 403);
    assert.equal((await post('/api/account/email', { email: 'anna@example.test', current: 'correct horse 1' }, { cookie: c })).status, 409);
    assert.equal((await post('/api/account/email', { email: 'hugo2@example.test', current: 'correct horse 1' }, { cookie: c })).status, 200);
    assert.equal((await post('/api/verify', { token: oldLink })).status, 400, 'a link for the old address confirmed the new one');
    const newLink = linkToken(await mailTo('hugo2@example.test'), 'verify');
    assert.equal((await post('/api/verify', { token: newLink })).status, 200);
    const acct = await (await get('/api/account', { cookie: c })).json();
    assert.deepEqual([acct.email, acct.emailVerified], ['hugo2@example.test', true]);
    assert.equal((await login('hugo2@example.test', 'correct horse 1')).status, 200);
  });
  await check('sessions: listed with the current one marked; can be signed out singly or all at once', async () => {
    const c = await signup('ida');
    const b = cookieOf(await login('ida', 'correct horse 1')), x = cookieOf(await login('ida', 'correct horse 1'));
    let acct = await (await get('/api/account', { cookie: c })).json();
    assert.equal(acct.sessions.length, 3);
    assert.equal(acct.sessions.filter(s => s.current).length, 1);
    const target = acct.sessions.find(s => !s.current);
    const stranger = await signup('jon');
    assert.equal((await post('/api/account/sessions/revoke', { id: target.id }, { cookie: stranger })).status, 404, 'revoked someone else\'s session');
    assert.equal((await post('/api/account/sessions/revoke', { id: target.id }, { cookie: c })).status, 200);
    const alive = [await me(b), await me(x)].filter(Boolean).length;
    assert.equal(alive, 1);
    await post('/api/account/sessions/revoke-others', {}, { cookie: c });
    assert.deepEqual([await me(b), await me(x)], [null, null]);
    assert.equal((await me(c)).name, 'ida');
    acct = await (await get('/api/account', { cookie: c })).json();
    assert.equal(acct.sessions.length, 1);
    assert.equal('email' in (await (await get('/api/users/ida')).json()), false, 'a public profile shows the email');
  });
  await check('delete account: needs the password; the account goes, the name frees up', async () => {
    const c = await signup('kim');
    assert.equal((await post('/api/account/delete', { current: 'wrong' }, { cookie: c })).status, 403);
    assert.equal((await post('/api/account/delete', { current: 'correct horse 1' }, { cookie: c })).status, 200);
    assert.equal(await me(c), null);
    assert.equal((await get('/api/users/kim')).status, 404);
    assert.equal((await login('kim', 'correct horse 1')).status, 401);
    await signup('kim', 'kim2@example.test');
  });

  // --- Sign in with Google ---
  const startGoogle = async (cookie, link = false) => {
    const r = await get(link ? '/auth/google?link=1' : '/auth/google', { cookie });
    assert.equal(r.status, 302);
    const to = new URL(r.headers.get('location'));
    assert.equal(to.origin + to.pathname, `${GBASE}/auth`);
    assert.equal(to.searchParams.get('client_id'), 'test-client');
    assert.equal(to.searchParams.get('redirect_uri'), `${BASE}/auth/google/callback`);
    assert.equal(to.searchParams.get('code_challenge_method'), 'S256');
    google.challenge = to.searchParams.get('code_challenge');
    return { state: to.searchParams.get('state'), oauth: cookieOf(r) };
  };
  const finishGoogle = (code, { state, oauth }, cookie, stateOverride) =>
    get(`/auth/google/callback?code=${code}&state=${stateOverride ?? state}`, { cookie: [oauth, cookie].filter(Boolean).join('; ') });

  await check('Google: a new Google account becomes a player with a confirmed email', async () => {
    google.profiles['code-lena'] = { sub: 'g-1001', email: 'lena.m@gmail.example', email_verified: true, name: 'Lena Müller' };
    const r = await finishGoogle('code-lena', await startGoogle());
    assert.equal(r.headers.get('location'), '/?auth=google');
    const u = await me(cookieOf(r));
    assert.match(u.name, /^Lena_M/);
    assert.equal(u.emailVerified, true);
    assert.equal(google.calls.at(-1).client_secret, 'test-secret');
    // signing in again finds the same player
    const again = await finishGoogle('code-lena', await startGoogle());
    assert.equal((await me(cookieOf(again))).id, u.id);
  });
  await check('Google: a wrong or missing state, or a failed token exchange, signs nobody in', async () => {
    google.profiles['code-mo'] = { sub: 'g-1002', email: 'mo@gmail.example', email_verified: true, name: 'Mo' };
    const s = await startGoogle();
    const forged = await finishGoogle('code-mo', s, null, 'forged-state');
    assert.equal(forged.headers.get('location'), '/?auth=failed');
    assert.equal(cookieOf(forged)?.startsWith('sid='), false);
    const noCookie = await get(`/auth/google/callback?code=code-mo&state=${s.state}`);
    assert.equal(noCookie.headers.get('location'), '/?auth=failed');
    const badCode = await finishGoogle('code-unknown', await startGoogle());
    assert.equal(badCode.headers.get('location'), '/?auth=failed');
    const s2 = await startGoogle();
    google.challenge = 'not-the-real-challenge'; // as if the verifier didn't match (PKCE)
    assert.equal((await finishGoogle('code-mo', s2)).headers.get('location'), '/?auth=failed');
  });
  await check('Google: links to an existing account only when both emails are confirmed', async () => {
    const c = await signup('nora', 'nora@gmail.example');
    google.profiles['code-nora'] = { sub: 'g-1003', email: 'nora@gmail.example', email_verified: true, name: 'Nora' };
    let r = await finishGoogle('code-nora', await startGoogle());
    assert.notEqual((await me(cookieOf(r))).name, 'nora', 'linked to an account whose email was never confirmed');
    // with the email confirmed, a different Google account with that email links instead of creating a new player
    await post('/api/verify', { token: linkToken(await mailTo('nora@gmail.example'), 'verify') });
    const c2 = await signup('olga', 'olga@gmail.example');
    await post('/api/verify', { token: linkToken(await mailTo('olga@gmail.example'), 'verify') });
    google.profiles['code-olga'] = { sub: 'g-1004', email: 'olga@gmail.example', email_verified: true, name: 'Olga' };
    r = await finishGoogle('code-olga', await startGoogle());
    assert.equal((await me(cookieOf(r))).name, 'olga');
    // Google saying the email is unconfirmed never links
    const c3 = await signup('pia', 'pia@gmail.example');
    await post('/api/verify', { token: linkToken(await mailTo('pia@gmail.example'), 'verify') });
    google.profiles['code-pia'] = { sub: 'g-1005', email: 'pia@gmail.example', email_verified: false, name: 'Pia' };
    r = await finishGoogle('code-pia', await startGoogle());
    assert.notEqual((await me(cookieOf(r))).name, 'pia');
    void c; void c2; void c3;
  });
  await check('Google: connect and disconnect from account settings; one Google account per player', async () => {
    const c = await signup('quinn');
    google.profiles['code-quinn'] = { sub: 'g-1006', email: 'q@gmail.example', email_verified: true, name: 'Q' };
    let r = await finishGoogle('code-quinn', await startGoogle(c, true), c);
    assert.equal(r.headers.get('location'), '/?auth=google-linked');
    assert.equal((await (await get('/api/account', { cookie: c })).json()).google, true);
    r = await finishGoogle('code-quinn', await startGoogle());
    assert.equal((await me(cookieOf(r))).name, 'quinn', 'Google sign-in should reach the connected account');
    const other = await signup('rosa');
    r = await finishGoogle('code-quinn', await startGoogle(other, true), other);
    assert.equal(r.headers.get('location'), '/?auth=google-in-use');
    assert.equal((await post('/api/account/google/unlink', {}, { cookie: c })).status, 200);
    assert.equal((await (await get('/api/account', { cookie: c })).json()).google, false);
  });
  await check('Google: saving a guest account with Google makes it a full account named from the profile', async () => {
    const c = cookieOf(await post('/api/guest', {}));
    google.profiles['code-yara'] = { sub: 'g-2001', email: 'yara@gmail.example', email_verified: true, name: 'Yara Novak' };
    const r = await finishGoogle('code-yara', await startGoogle(c, true), c);
    assert.equal(r.headers.get('location'), '/?auth=google-saved');
    const u = await me(c);
    assert.deepEqual([u.guest, u.emailVerified], [false, true]);
    assert.match(u.name, /^Yara_Novak/);
    const again = await finishGoogle('code-yara', await startGoogle());
    assert.equal((await me(cookieOf(again))).id, u.id, 'Google signs in to the saved account');
  });
  await check('Google-only accounts: no password sign-in, can set one, can\'t unlink, delete by typing the name', async () => {
    google.profiles['code-sami'] = { sub: 'g-1007', email: 'sami@gmail.example', email_verified: true, name: 'Sami' };
    const c = cookieOf(await finishGoogle('code-sami', await startGoogle()));
    const name = (await me(c)).name;
    assert.equal((await login(name, '')).status, 401);
    assert.equal((await post('/api/account/google/unlink', {}, { cookie: c })).status, 400, 'unlinked the only way to sign in');
    const acct = await (await get('/api/account', { cookie: c })).json();
    assert.deepEqual([acct.hasPassword, acct.google], [false, true]);
    assert.equal((await post('/api/account/delete', { confirm: 'not-my-name' }, { cookie: c })).status, 403);
    assert.equal((await post('/api/account/password', { password: 'my first password' }, { cookie: c })).status, 200, 'setting a first password');
    assert.equal((await login(name, 'my first password')).status, 200);
    const c2 = cookieOf(await finishGoogle('code-sami', await startGoogle()));
    google.profiles['code-tess'] = { sub: 'g-1008', email: 'tess@gmail.example', email_verified: true, name: 'Tess' };
    const t = cookieOf(await finishGoogle('code-tess', await startGoogle()));
    assert.equal((await post('/api/account/delete', { confirm: (await me(t)).name }, { cookie: t })).status, 200);
    void c2;
  });
  // --- usernames ---
  await check('usernames: suggestions are free and well-formed; the live check explains problems', async () => {
    const seen = new Set();
    for (let i = 0; i < 5; i++) {
      const { name } = await (await get('/api/usernames/suggest')).json();
      assert.match(name, /^[A-Za-z]+[0-9]{1,2}$/);
      assert.ok(name.length >= 3 && name.length <= 20);
      seen.add(name);
      assert.equal((await (await get('/api/usernames/check?name=' + name)).json()).available, true);
    }
    assert.ok(seen.size >= 3, 'suggestions should vary');
    const check = async n => (await get('/api/usernames/check?name=' + encodeURIComponent(n))).json();
    assert.deepEqual(await check('anna'), { available: false, error: 'That username is taken.' });
    assert.match((await check('ab')).error, /3-20/);
    assert.match((await check('Guest_Me')).error, /reserved/);
    assert.match((await check('admin')).error, /reserved/);
    assert.equal((await check('brand_new_name')).available, true);
    assert.equal((await post('/api/signup', { name: 'guest_fake', email: 'gf@example.test', password: 'correct horse 1' })).status, 400, 'a Guest_ name for a real account');
  });

  // --- guest accounts ---
  await check('guest accounts: Continue as guest makes a signed-in Guest_ account', async () => {
    const r = await post('/api/guest', {});
    assert.equal(r.status, 201);
    const c = cookieOf(r), u = await me(c);
    assert.match(u.name, /^Guest_[A-Za-z]+[0-9]{1,2}$/);
    assert.ok(u.name.length <= 20);
    assert.deepEqual([u.guest, u.hasEmail], [true, false]);
    assert.equal((await (await get('/api/users/' + u.name)).json()).guest, true, 'profiles mark guests');
    assert.equal((await post('/api/guest', {}, { cookie: c })).status, 400, 'a second guest while signed in');
    assert.equal((await login(u.name, '')).status, 401, 'guests have no password to sign in with');
    const ip = freshIp(), statuses = [];
    for (let i = 0; i < 12; i++) statuses.push((await post('/api/guest', {}, { ip })).status);
    assert.deepEqual(statuses.slice(10), [429, 429], 'guest accounts per network are limited');
  });
  await check('guest accounts: saving one keeps the account, with a real username, email and password', async () => {
    const c = cookieOf(await post('/api/guest', {}));
    const guestName = (await me(c)).name;
    assert.equal((await post('/api/account/upgrade', { name: 'anna', email: 'g1@example.test', password: 'correct horse 1' }, { cookie: c })).status, 409);
    assert.equal((await post('/api/account/upgrade', { name: 'Guest_Again', email: 'g1@example.test', password: 'correct horse 1' }, { cookie: c })).status, 400);
    assert.equal((await post('/api/account/upgrade', { name: 'saved_guest', email: 'anna@example.test', password: 'correct horse 1' }, { cookie: c })).status, 409);
    assert.equal((await post('/api/account/upgrade', { name: 'saved_guest', email: 'g1@example.test', password: 'short' }, { cookie: c })).status, 400);
    const r = await post('/api/account/upgrade', { name: 'saved_guest', email: 'g1@example.test', password: 'correct horse 1' }, { cookie: c });
    assert.equal(r.status, 200);
    const u = await me(c);
    assert.deepEqual([u.name, u.guest, u.hasEmail, u.emailVerified], ['saved_guest', false, true, false]);
    assert.ok(linkToken(await mailTo('g1@example.test'), 'verify'), 'a confirmation email');
    assert.equal((await get('/api/users/' + guestName)).status, 404, 'the old Guest_ name still exists');
    assert.equal((await login('saved_guest', 'correct horse 1')).status, 200);
    assert.equal((await post('/api/account/upgrade', { name: 'twice', email: 'g2@example.test', password: 'correct horse 1' }, { cookie: c })).status, 400, 'saved twice');
    assert.equal((await post('/api/account/upgrade', { name: 'x_x_x', email: 'g3@example.test', password: 'correct horse 1' }, { cookie: await signup('vic') })).status, 400, 'a full account "upgraded"');
  });
  await check('guest accounts: signing out removes an unsaved guest account', async () => {
    const c = cookieOf(await post('/api/guest', {}));
    const name = (await me(c)).name;
    const r = await post('/api/logout', {}, { cookie: c });
    assert.equal((await r.json()).deleted, true);
    assert.equal(await me(c), null);
    assert.equal((await get('/api/users/' + name)).status, 404);
    // a full account signing out is only signed out
    const full = await signup('wren');
    await post('/api/logout', {}, { cookie: full });
    assert.equal((await get('/api/users/wren')).status, 200);
  });

  await check('account endpoints need JSON and a session; unknown routes are 404', async () => {
    const plain = await fetch(BASE + '/api/account/password', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
    assert.equal(plain.status, 415);
    assert.equal((await get('/api/account')).status, 401);
    assert.equal((await post('/api/account/nope', {}, { cookie: await signup('uma') })).status, 404);
    assert.equal((await post('/api/signup', [1, 2])).status, 400);
  });
} finally {
  srv.kill();
  mock.close();
  await sleep(100);
  for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) rmSync(f, { force: true });
}

for (const [status, name, why] of results) console.log(`${status}  ${name}${why ? `\n      ${why}` : ''}`);
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\naccounts: ${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
