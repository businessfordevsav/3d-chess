// Game server: serves the page and model files, and runs the lobby, matchmaking and game rooms over WebSocket.
// Every move is re-checked with chess.js here, so a modified client can't play illegal moves.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { brotliCompressSync, gzipSync, constants as zlib } from 'node:zlib';
import { join, normalize, extname } from 'node:path';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer } from 'ws';
import nodemailer from 'nodemailer';
import { Chess } from 'chess.js';
import { glicko2 } from './glicko2.js';
import { sitePages } from './pages.js';

const ROOT = import.meta.dirname, PORT = process.env.PORT || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8' };

// --- database: accounts, sessions, one-time links, finished games ---
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
  -- one-time links (email verification, password reset), stored hashed like session tokens
  CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
    email TEXT, expires INTEGER NOT NULL);
`);
// columns added after the first release; existing databases are upgraded in place
const addColumn = (table, col, type) => {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
};
addColumn('users', 'rd', 'REAL NOT NULL DEFAULT 350');
addColumn('users', 'vol', 'REAL NOT NULL DEFAULT 0.06');
addColumn('users', 'email', 'TEXT');
addColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'google_sub', 'TEXT'); // Google's stable account id, when linked
addColumn('users', 'guest', 'INTEGER NOT NULL DEFAULT 0'); // a temporary guest account, until it is saved
addColumn('sessions', 'ua', 'TEXT');
addColumn('sessions', 'last_seen', 'INTEGER');
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email COLLATE NOCASE);
  CREATE UNIQUE INDEX IF NOT EXISTS users_google ON users(google_sub);`);

// what other players and the page see: a rounded rating, flagged "?" while it is still uncertain (never the email)
const publicUser = u => u && { id: u.id, name: u.name, rating: Math.round(u.rating), provisional: u.rd > 110, guest: !!u.guest };
// what the signed-in user sees about themselves
const selfUser = u => u && { ...publicUser(u), hasEmail: !!u.email, emailVerified: !!u.email_verified };
const SESSION_MS = 30 * 864e5;
const sha = t => createHash('sha256').update(t).digest('hex'); // tokens are stored hashed: a database leak doesn't hand out logins
// scrypt runs on the libuv thread pool, so hashing never blocks game traffic on the event loop
const scryptAsync = promisify(scrypt);
async function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scryptAsync(pw, salt, 64)).toString('hex')}`;
}
const DUMMY_HASH = `${'0'.repeat(32)}:${'0'.repeat(128)}`; // checked for unknown names so a miss takes as long as a hit
async function checkPassword(pw, stored) {
  const [salt, key] = (stored || DUMMY_HASH).split(':'); // '' = no password (Google-only account): never matches
  const ok = timingSafeEqual(await scryptAsync(pw, salt, 64), Buffer.from(key, 'hex'));
  return ok && !!stored;
}
const cookies = req => Object.fromEntries((req.headers.cookie ?? '').split(';').map(p => p.trim().split('=')).filter(p => p.length === 2));
function userFromReq(req) {
  const sid = cookies(req).sid;
  if (!sid) return null;
  const u = db.prepare(`SELECT u.*, s.rowid AS session_id, s.last_seen FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.created > ?`).get(sha(sid), Date.now() - SESSION_MS);
  if (u && Date.now() - (u.last_seen ?? 0) > 10 * 6e4) db.prepare('UPDATE sessions SET last_seen = ? WHERE token = ?').run(Date.now(), sha(sid)); // "last active", at most every 10 min
  return u ?? null;
}
// HTTPS directly, or behind a proxy/host (Render, Fly, nginx) that terminates TLS and says so
const cookieFlags = req => 'HttpOnly; SameSite=Lax; Path=/' + (req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '');
function startSession(req, res, user) {
  const sid = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, created, ua, last_seen) VALUES (?, ?, ?, ?, ?)')
    .run(sha(sid), user.id, Date.now(), String(req.headers['user-agent'] ?? '').slice(0, 200), Date.now());
  res.setHeader('Set-Cookie', `sid=${sid}; ${cookieFlags(req)}; Max-Age=${SESSION_MS / 1000}`);
}
// sign a user out everywhere (optionally keeping one session), including open game connections
function endSessions(userId, keepHash = null) {
  const gone = db.prepare('SELECT token FROM sessions WHERE user_id = ? AND token IS NOT ?').all(userId, keepHash).map(r => r.token);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token IS NOT ?').run(userId, keepHash);
  for (const ws of wss.clients) if (gone.includes(ws.sid)) ws.close(4001, 'signed out');
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
const mailIpLimit = limiter(5, 60 * 6e4), mailUserLimit = limiter(3, 60 * 6e4); // reset/verification emails
const guestLimit = limiter(10, 60 * 6e4), usernameLimit = limiter(120, 6e4); // new guest accounts; username checks/suggestions
const LIMITERS = [signupLimit, loginLimit, mailIpLimit, mailUserLimit, guestLimit, usernameLimit];
const RESERVED = /^(guest|white|black|stockfish|admin|administrator|moderator|system|server|3dchess)$/i; // names that read like system labels
const NAME = /^[A-Za-z0-9_]{3,20}$/;
const GUEST_PREFIX = /^guest_/i; // guest accounts are called Guest_…; nobody else may take a name like that
// why a username can't be chosen, or null if it's free
function usernameProblem(name) {
  if (!NAME.test(name)) return 'Usernames are 3-20 letters, digits or _.';
  if (RESERVED.test(name) || GUEST_PREFIX.test(name)) return 'That username is reserved. Pick another one.';
  if (db.prepare('SELECT 1 FROM users WHERE name = ?').get(name)) return 'That username is taken.';
  return null;
}
// chess-flavoured names like SwiftKnight42; with a prefix for guests (Guest_SwiftKnight42, still 20 characters at most)
const ADJECTIVES = ['Swift', 'Bold', 'Quiet', 'Clever', 'Brave', 'Lucky', 'Sharp', 'Calm', 'Royal', 'Silent', 'Rapid', 'Steady',
  'Golden', 'Shadow', 'Iron', 'Silver', 'Noble', 'Wild', 'Cosmic', 'Mighty', 'Hidden', 'Gentle', 'Fierce', 'Witty'];
const PIECES = ['Pawn', 'Rook', 'Knight', 'Bishop', 'Queen', 'King', 'Gambit', 'Castle', 'Fork', 'Pin', 'Check', 'Tempo'];
function generateUsername(prefix = '') {
  const pick = list => list[randomBytes(1)[0] % list.length];
  for (let i = 0; i < 200; i++) {
    const name = `${prefix}${pick(ADJECTIVES)}${pick(PIECES)}${randomBytes(1)[0] % 100}`;
    if (name.length <= 20 && !db.prepare('SELECT 1 FROM users WHERE name = ?').get(name)) return name;
  }
  return `${prefix}Player${randomBytes(3).readUIntBE(0, 3)}`.slice(0, 20); // practically never reached
}
// removes an account; its games stay in opponents' histories without its name
function deleteAccount(userId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE games SET white = NULL WHERE white = ?').run(userId);
    db.prepare('UPDATE games SET black = NULL WHERE black = ?').run(userId);
    db.prepare('DELETE FROM tokens WHERE user_id = ?').run(userId);
    endSessions(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  for (const r of rooms.values()) for (const c of COLORS) if (r.seats[c]?.user?.id === userId) r.seats[c].user = null; // live seats become plain guests
}
// deliberately strict: no quotes, brackets, commas or semicolons, so mail-header parsing can't be tricked
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const validEmail = e => e.length <= 254 && EMAIL.test(e);
const validPassword = p => p.length >= 8 && p.length <= 200;

// --- email: verification and password-reset links, over SMTP ---
// Without SMTP_HOST (local development, tests) messages go to the console instead, as one "MAIL {json}" line.
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const mailer = process.env.SMTP_HOST && nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT) === 465,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
});
if (!mailer && process.env.NODE_ENV === 'production') console.warn('warning: SMTP_HOST is not set, so emails (including reset links) are written to the log');
if (process.env.NODE_ENV === 'production' && !/^https:\/\//.test(APP_URL)) console.warn(`warning: APP_URL is ${APP_URL}; set it to the site's https:// address for links, sign-in and SEO`);
async function sendMail(to, subject, text) {
  try {
    if (mailer) await mailer.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
    else console.log('MAIL ' + JSON.stringify({ to, subject, text }));
  } catch (e) { console.error('sending email failed:', e.message); } // never leak SMTP errors to the client
}
// one live link per user and purpose; single use; stored hashed
function issueToken(userId, kind, ms, email = null) {
  const t = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM tokens WHERE user_id = ? AND kind = ?').run(userId, kind);
  db.prepare('INSERT INTO tokens VALUES (?, ?, ?, ?, ?)').run(sha(t), userId, kind, email, Date.now() + ms);
  return t;
}
function useToken(t, kind) {
  if (typeof t !== 'string' || !/^[0-9a-f]{64}$/.test(t)) return null;
  const row = db.prepare('SELECT * FROM tokens WHERE token = ? AND kind = ?').get(sha(t), kind);
  if (!row) return null;
  db.prepare('DELETE FROM tokens WHERE token = ?').run(row.token);
  return row.expires > Date.now() ? row : null;
}
const sendVerification = (user, email) => sendMail(email, 'Confirm your email for 3D Chess',
  `Hi ${user.name},\n\nConfirm this email address for your 3D Chess account:\n${APP_URL}/?verify=${issueToken(user.id, 'verify', 864e5, email)}\n\n` +
  `The link works once and expires in 24 hours. If you didn't sign up, ignore this message.`);
const sendReset = user => sendMail(user.email, 'Reset your 3D Chess password',
  `Hi ${user.name},\n\nChoose a new password here:\n${APP_URL}/?reset=${issueToken(user.id, 'reset', 36e5)}\n\n` +
  `The link works once and expires in 1 hour. If you didn't ask for this, ignore this message; your password stays the same.`);

// --- JSON API: accounts, sessions, profiles ---
const json = (res, code, body) => res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
const redirect = (res, to) => res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' }).end();
// Sent with every response. Scripts come only from this site (three.js, chess.js and Stockfish are served
// from vendor/); the page's own inline scripts (import map, module script) are allowed by their exact hash,
// so no other inline script can run. Only the fonts come from Google.
// --- ads: Google AdSense, off (no scripts, strict CSP) unless ADSENSE_CLIENT is set ---
// ADSENSE_CLIENT is the publisher id (ca-pub-…); the slots are ad unit ids from the AdSense dashboard.
// Consent for visitors in the EEA, UK and Switzerland is Google's own message (AdSense > Privacy & messaging),
// served by the same AdSense script, so there is no banner of our own.
const slot = v => /^\d{5,20}$/.test(v ?? '') ? v : null;
const ADS = /^ca-pub-\d{10,20}$/.test(process.env.ADSENSE_CLIENT ?? '')
  ? { client: process.env.ADSENSE_CLIENT, menu: slot(process.env.ADSENSE_SLOT_MENU), page: slot(process.env.ADSENSE_SLOT_PAGE) } : null;
if (process.env.ADSENSE_CLIENT && !ADS) console.warn('warning: ADSENSE_CLIENT should look like ca-pub-1234567890123456; ads are off');
// the hosts AdSense loads scripts, ad frames, pixels and its consent message from
const AD_HOSTS = 'https://*.googlesyndication.com https://*.google.com https://*.gstatic.com https://*.doubleclick.net https://*.adtrafficquality.google';
const csp = (scriptHashes = []) => ["default-src 'self'", ["script-src 'self'", ...scriptHashes.map(h => `'sha256-${h}'`), ...(ADS ? [AD_HOSTS] : [])].join(' '),
  "worker-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com",
  `img-src 'self' data: blob:${ADS ? ' https:' : ''}`, `connect-src 'self'${ADS ? ' ' + AD_HOSTS : ''}`, ...(ADS ? [`frame-src ${AD_HOSTS}`] : []),
  "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
// hashes of the inline scripts that run (the import map and the module); JSON-LD is data, not script, so it's skipped
const inlineScriptHashes = html => [...html.toString().matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => m[2].trim() && !m[1].includes('application/ld+json')).map(m => createHash('sha256').update(m[2]).digest('base64'));
const SECURITY_HEADERS = {
  'Content-Security-Policy': csp(),
  'X-Frame-Options': 'DENY', // no framing: stops clickjacking of Resign and similar buttons
  'X-Content-Type-Options': 'nosniff',
  // game links and one-time links in the URL don't leak to the font host; with ads on, other sites get only
  // the origin, which AdSense needs to serve ads for this site
  'Referrer-Policy': ADS ? 'strict-origin-when-cross-origin' : 'same-origin',
};
async function readJson(req) {
  let body = '';
  for await (const chunk of req) if ((body += chunk).length > 1e4) throw new Error('too big');
  const v = JSON.parse(body || '{}');
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
  return v;
}
const str = v => typeof v === 'string' ? v : ''; // inputs are strings or nothing

async function api(req, res, path) {
  if (req.method === 'POST') {
    // JSON-only POSTs can't be sent by a plain cross-site form, which keeps these endpoints safe from CSRF
    if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Send JSON.' });
    let body;
    try { body = await readJson(req); } catch { return json(res, 400, { error: 'Bad request.' }); }
    const ip = clientIp(req);

    if (path === '/api/signup') {
      const name = str(body.name).trim(), email = str(body.email).trim(), password = str(body.password);
      const problem = usernameProblem(name);
      if (problem) return json(res, problem.includes('taken') ? 409 : 400, { error: problem });
      if (!validEmail(email)) return json(res, 400, { error: 'Enter a valid email address. It is used to reset your password.' });
      if (!validPassword(password)) return json(res, 400, { error: 'Passwords need at least 8 characters.' });
      if (!signupLimit(ip)) return json(res, 429, { error: 'Too many new accounts from your network. Try again later.' });
      const hash = await hashPassword(password);
      try {
        const { lastInsertRowid } = db.prepare('INSERT INTO users (name, hash, created, email) VALUES (?, ?, ?, ?)').run(name, hash, Date.now(), email);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(lastInsertRowid));
        startSession(req, res, user);
        await sendVerification(user, email);
        return json(res, 201, { user: selfUser(user) });
      } catch {
        const nameTaken = db.prepare('SELECT 1 FROM users WHERE name = ?').get(name);
        return json(res, 409, { error: nameTaken ? 'That username is taken.' : 'An account already uses that email. Sign in, or reset your password.' });
      }
    }
    if (path === '/api/login') {
      if (!loginLimit(ip)) return json(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
      const login = str(body.login ?? body.name).trim(), password = str(body.password);
      const row = db.prepare(`SELECT * FROM users WHERE ${login.includes('@') ? 'email' : 'name'} = ? COLLATE NOCASE`).get(login); // emails match in any case, like names
      const ok = await checkPassword(password, row ? row.hash : DUMMY_HASH); // always hash, so timing doesn't reveal which accounts exist
      if (!row || !ok) return json(res, 401, { error: 'Wrong username, email or password. Signed up with Google? Use Continue with Google.' });
      startSession(req, res, row);
      return json(res, 200, { user: selfUser(row) });
    }
    if (path === '/api/guest') {
      if (userFromReq(req)) return json(res, 400, { error: 'You are already signed in.' });
      if (!guestLimit(ip)) return json(res, 429, { error: 'Too many guest accounts from your network. Try again later.' });
      const { lastInsertRowid } = db.prepare('INSERT INTO users (name, hash, created, guest) VALUES (?, ?, ?, 1)').run(generateUsername('Guest_'), '', Date.now());
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(lastInsertRowid));
      startSession(req, res, user);
      return json(res, 201, { user: selfUser(user) });
    }
    if (path === '/api/logout') {
      const sid = cookies(req).sid, u = userFromReq(req);
      if (u?.guest) { // an unsaved guest account can't be signed back into, so signing out ends it
        deleteAccount(u.id);
        res.setHeader('Set-Cookie', `sid=; ${cookieFlags(req)}; Max-Age=0`);
        return json(res, 200, { user: null, deleted: true });
      }
      if (sid) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(sha(sid));
        for (const ws of wss.clients) if (ws.sid === sha(sid)) ws.close(4001, 'signed out'); // the session is gone for open sockets too
      }
      res.setHeader('Set-Cookie', `sid=; ${cookieFlags(req)}; Max-Age=0`);
      return json(res, 200, { user: null });
    }
    if (path === '/api/verify') {
      const row = useToken(body.token, 'verify');
      const u = row && db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
      if (!u || u.email !== row.email) return json(res, 400, { error: 'This confirmation link has expired or was already used.' });
      db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(u.id);
      return json(res, 200, { ok: true });
    }
    if (path === '/api/forgot') {
      const email = str(body.email).trim();
      // the same answer whether or not the address has an account, so this can't be used to find accounts
      if (!validEmail(email)) return json(res, 400, { error: 'Enter a valid email address.' });
      if (!mailIpLimit(ip)) return json(res, 429, { error: 'Too many requests. Try again later.' });
      const u = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
      if (u && mailUserLimit(`reset:${u.id}`)) await sendReset(u);
      return json(res, 200, { ok: true, message: 'If that email belongs to an account, a reset link is on its way.' });
    }
    if (path === '/api/reset') {
      const password = str(body.password);
      if (!validPassword(password)) return json(res, 400, { error: 'Passwords need at least 8 characters.' });
      const row = useToken(body.token, 'reset');
      const u = row && db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
      if (!u) return json(res, 400, { error: 'This reset link has expired or was already used. Ask for a new one.' });
      // opening the link proves the email works, so it counts as verified; every old session is signed out
      db.prepare('UPDATE users SET hash = ?, email_verified = 1 WHERE id = ?').run(await hashPassword(password), u.id);
      endSessions(u.id);
      startSession(req, res, u);
      return json(res, 200, { user: selfUser({ ...u, email_verified: 1 }) });
    }

    // --- signed-in account management ---
    if (path.startsWith('/api/account/')) {
      const me = userFromReq(req);
      if (!me) return json(res, 401, { error: 'Sign in first.' });
      const myHash = sha(cookies(req).sid);
      // changes that could lock someone out need the current password (Google-only accounts have none)
      const confirmed = async () => !me.hash || await checkPassword(str(body.current), me.hash);

      if (path === '/api/account/upgrade') {
        if (!me.guest) return json(res, 400, { error: 'This account is already saved.' });
        const name = str(body.name).trim(), email = str(body.email).trim(), password = str(body.password);
        const problem = usernameProblem(name);
        if (problem) return json(res, problem.includes('taken') ? 409 : 400, { error: problem });
        if (!validEmail(email)) return json(res, 400, { error: 'Enter a valid email address. It is used to reset your password.' });
        if (!validPassword(password)) return json(res, 400, { error: 'Passwords need at least 8 characters.' });
        try {
          db.prepare('UPDATE users SET name = ?, email = ?, email_verified = 0, hash = ?, guest = 0 WHERE id = ?').run(name, email, await hashPassword(password), me.id);
        } catch {
          return json(res, 409, { error: db.prepare('SELECT 1 FROM users WHERE name = ?').get(name) ? 'That username is taken.' : 'An account already uses that email.' });
        }
        const saved = db.prepare('SELECT * FROM users WHERE id = ?').get(me.id);
        for (const r of rooms.values()) for (const c of COLORS) if (r.seats[c]?.user?.id === me.id) r.seats[c].user.name = name; // live games show the new name
        await sendVerification(saved, email);
        return json(res, 200, { user: selfUser(saved) });
      }
      if (path === '/api/account/password') {
        const password = str(body.password);
        if (!validPassword(password)) return json(res, 400, { error: 'Passwords need at least 8 characters.' });
        if (!await confirmed()) return json(res, 403, { error: 'Your current password is not right.' });
        db.prepare('UPDATE users SET hash = ? WHERE id = ?').run(await hashPassword(password), me.id);
        endSessions(me.id, myHash); // other devices must sign in with the new password
        return json(res, 200, { ok: true });
      }
      if (path === '/api/account/email') {
        const email = str(body.email).trim();
        if (!validEmail(email)) return json(res, 400, { error: 'Enter a valid email address.' });
        if (!await confirmed()) return json(res, 403, { error: 'Your current password is not right.' });
        if (!mailUserLimit(`verify:${me.id}`)) return json(res, 429, { error: 'Too many emails. Try again later.' });
        try { db.prepare('UPDATE users SET email = ?, email_verified = 0 WHERE id = ?').run(email, me.id); }
        catch { return json(res, 409, { error: 'Another account already uses that email.' }); }
        await sendVerification(me, email);
        return json(res, 200, { ok: true });
      }
      if (path === '/api/account/resend') {
        if (!me.email || me.email_verified) return json(res, 400, { error: 'There is nothing to confirm.' });
        if (!mailUserLimit(`verify:${me.id}`)) return json(res, 429, { error: 'Too many emails. Try again later.' });
        await sendVerification(me, me.email);
        return json(res, 200, { ok: true });
      }
      if (path === '/api/account/sessions/revoke') {
        const s = db.prepare('SELECT token FROM sessions WHERE rowid = ? AND user_id = ?').get(Number(body.id), me.id);
        if (!s) return json(res, 404, { error: 'No such session.' });
        db.prepare('DELETE FROM sessions WHERE token = ?').run(s.token);
        for (const ws of wss.clients) if (ws.sid === s.token) ws.close(4001, 'signed out');
        return json(res, 200, { ok: true });
      }
      if (path === '/api/account/sessions/revoke-others') {
        endSessions(me.id, myHash);
        return json(res, 200, { ok: true });
      }
      if (path === '/api/account/google/unlink') {
        if (!me.hash) return json(res, 400, { error: 'Set a password first, or you could not sign in at all.' });
        db.prepare('UPDATE users SET google_sub = NULL WHERE id = ?').run(me.id);
        return json(res, 200, { ok: true });
      }
      if (path === '/api/account/delete') {
        const ok = me.hash ? await checkPassword(str(body.current), me.hash) : str(body.confirm) === me.name;
        if (!ok) return json(res, 403, { error: me.hash ? 'Your current password is not right.' : 'Type your username to confirm.' });
        deleteAccount(me.id);
        res.setHeader('Set-Cookie', `sid=; ${cookieFlags(req)}; Max-Age=0`);
        return json(res, 200, { ok: true });
      }
    }
  }
  if (req.method === 'GET') {
    if (path === '/api/me') return json(res, 200, { user: selfUser(userFromReq(req)) });
    if (path === '/api/config') return json(res, 200, { google: !!GOOGLE.id, ads: ADS?.menu ? { client: ADS.client, slot: ADS.menu } : null });
    if (path === '/api/usernames/check' || path === '/api/usernames/suggest') {
      if (!usernameLimit(clientIp(req))) return json(res, 429, { error: 'Slow down a little.' });
      if (path.endsWith('suggest')) return json(res, 200, { name: generateUsername() });
      const problem = usernameProblem(String(new URL(req.url, 'http://x').searchParams.get('name') ?? '').trim());
      return json(res, 200, { available: !problem, error: problem });
    }
    if (path === '/api/account') {
      const me = userFromReq(req);
      if (!me) return json(res, 401, { error: 'Sign in first.' });
      const sessions = db.prepare('SELECT rowid AS id, ua, created, last_seen FROM sessions WHERE user_id = ? AND created > ? ORDER BY last_seen DESC')
        .all(me.id, Date.now() - SESSION_MS).map(s => ({ id: s.id, ua: s.ua, created: s.created, lastSeen: s.last_seen, current: s.id === me.session_id }));
      return json(res, 200, { name: me.name, guest: !!me.guest, email: me.email, emailVerified: !!me.email_verified, hasPassword: !!me.hash,
        google: !!me.google_sub, googleAvailable: !!GOOGLE.id, created: me.created, sessions });
    }
    const profile = path.match(/^\/api\/users\/([A-Za-z0-9_]{3,20})$/);
    if (profile) {
      const u = db.prepare('SELECT id, name, rating, rd, guest, created FROM users WHERE name = ?').get(profile[1]);
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

// --- Sign in with Google (OAuth 2.0 authorization code flow, with state and PKCE) ---
// Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; the authorized redirect URI is APP_URL + /auth/google/callback.
// The three endpoint URLs can be overridden for tests only.
const GOOGLE = {
  id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET,
  auth: process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
  token: process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
  userinfo: process.env.GOOGLE_USERINFO_URL || 'https://openidconnect.googleapis.com/v1/userinfo',
};
// a username from the Google profile: letters, digits and _ only, made unique with a number if needed
function nameFromGoogle(info, gEmail) {
  let base = String(info.name || gEmail?.split('@')[0] || 'player').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 15);
  if (base.length < 3 || RESERVED.test(base) || GUEST_PREFIX.test(base)) base = `player_${base}`.slice(0, 15);
  let name = base;
  for (let i = 0; db.prepare('SELECT 1 FROM users WHERE name = ?').get(name) && i < 50; i++) name = `${base}${randomBytes(2).readUInt16BE() % 10000}`;
  return name;
}
async function google(req, res, url) {
  if (!GOOGLE.id) return redirect(res, '/?auth=google-off');
  const redirectUri = `${APP_URL}/auth/google/callback`;
  if (url.pathname === '/auth/google') {
    const state = randomBytes(24).toString('base64url'), verifier = randomBytes(32).toString('base64url');
    const linking = url.searchParams.get('link') === '1' ? '1' : '0'; // connect Google to the signed-in account
    // state (against login CSRF) and the PKCE verifier live in a short-lived cookie only this browser has
    res.setHeader('Set-Cookie', `g_oauth=${state}.${verifier}.${linking}; ${cookieFlags(req)}; Max-Age=600`);
    const q = new URLSearchParams({ client_id: GOOGLE.id, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' });
    return redirect(res, `${GOOGLE.auth}?${q}`);
  }
  // the callback
  const [state, verifier, linking] = (cookies(req).g_oauth ?? '').split('.');
  res.setHeader('Set-Cookie', `g_oauth=; ${cookieFlags(req)}; Max-Age=0`);
  const code = url.searchParams.get('code');
  if (!state || !verifier || url.searchParams.get('state') !== state || !code) return redirect(res, '/?auth=failed');
  let info;
  try {
    const t = await fetch(GOOGLE.token, { method: 'POST', signal: AbortSignal.timeout(10_000), headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: GOOGLE.id, client_secret: GOOGLE.secret ?? '', redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }) });
    if (!t.ok) throw new Error(`token endpoint ${t.status}`);
    const { access_token } = await t.json();
    const u = await fetch(GOOGLE.userinfo, { signal: AbortSignal.timeout(10_000), headers: { authorization: `Bearer ${access_token}` } });
    if (!u.ok) throw new Error(`userinfo endpoint ${u.status}`);
    info = await u.json();
  } catch (e) {
    console.error('Google sign-in failed:', e.message);
    return redirect(res, '/?auth=failed');
  }
  const sub = typeof info.sub === 'string' && info.sub, gEmail = typeof info.email === 'string' && validEmail(info.email) && info.email_verified === true ? info.email : null;
  if (!sub) return redirect(res, '/?auth=failed');
  let user = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(sub);
  const current = userFromReq(req);
  if (linking === '1' && current) {
    if (user && user.id !== current.id) return redirect(res, '/?auth=google-in-use');
    db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').run(sub, current.id);
    if (current.guest) { // saving a guest account with Google: it becomes a full account named after the Google profile
      const emailFree = gEmail && !db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE AND id != ?').get(gEmail, current.id);
      const name = nameFromGoogle(info, gEmail);
      db.prepare('UPDATE users SET guest = 0, name = ?, email = ?, email_verified = ? WHERE id = ?').run(name, emailFree ? gEmail : null, emailFree ? 1 : 0, current.id);
      for (const r of rooms.values()) for (const c of COLORS) if (r.seats[c]?.user?.id === current.id) r.seats[c].user.name = name;
      return redirect(res, '/?auth=google-saved');
    }
    return redirect(res, '/?auth=google-linked');
  }
  // an existing account with the same email, confirmed on both sides, is the same person: link it
  if (!user && gEmail) {
    const byEmail = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE AND email_verified = 1 AND google_sub IS NULL').get(gEmail);
    if (byEmail) { db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').run(sub, byEmail.id); user = byEmail; }
  }
  if (!user) {
    if (!signupLimit(clientIp(req))) return redirect(res, '/?auth=too-many');
    const name = nameFromGoogle(info, gEmail);
    const emailFree = gEmail && !db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE').get(gEmail);
    const { lastInsertRowid } = db.prepare('INSERT INTO users (name, hash, created, email, email_verified, google_sub) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, '', Date.now(), emailFree ? gEmail : null, emailFree ? 1 : 0, sub);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(lastInsertRowid));
  }
  startSession(req, res, user);
  return redirect(res, '/?auth=google');
}

// --- static files: the page, its icons and share image, the 3D model and the vendored libraries ---
// Text-like files are compressed (brotli or gzip) once per version and kept in memory; every file gets an
// ETag so repeat visits revalidate with a cheap 304 instead of downloading again.
const PUBLIC_FILES = new Set(['pages.css', 'ads.js', 'icon.svg', 'og-image.jpg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'site.webmanifest']);
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.gltf', '.bin', '.svg', '.webmanifest', '.xml', '.txt']);
const compressed = new Map(); // `${file}:${mtime}:${encoding}` -> Buffer
function publicFile(path) {
  if (path === '/' || /^\/g\/[a-z0-9]+$/.test(path)) return 'index.html';
  if (path === '/favicon.ico') return 'icon.svg'; // browsers that still ask for it get the same icon
  if (PUBLIC_FILES.has(path.slice(1))) return path.slice(1);
  if (path.startsWith('/models/') || path.startsWith('/vendor/')) return path.slice(1);
  return null;
}
async function serveFile(req, res, file, path) {
  const info = await stat(join(ROOT, file));
  if (!info.isFile()) throw new Error('not a file');
  const page = file === 'index.html';
  const etag = `W/"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  // the page revalidates every time (it changes with deploys); libraries, the model and images are cached for a day
  res.setHeader('Cache-Control', page ? 'no-cache' : 'public, max-age=86400');
  res.setHeader('ETag', etag);
  if (path.startsWith('/g/')) res.setHeader('X-Robots-Tag', 'noindex, nofollow'); // private game links stay out of search results
  let body = await readFile(join(ROOT, file));
  if (page) {
    body = Buffer.from(body.toString().replaceAll('__APP_URL__', APP_URL)); // absolute URLs for canonical, Open Graph, JSON-LD
    // hashed each time, so edits stay in sync; also on a 304, whose headers replace the cached ones,
    // or a refresh would get the hash-less default CSP and block the page's own scripts
    res.setHeader('Content-Security-Policy', csp(inlineScriptHashes(body)));
  }
  if (req.headers['if-none-match'] === etag) return res.writeHead(304).end();
  sendBody(req, res, 200, type, body, COMPRESSIBLE.has(extname(file)) && `${file}:${info.mtimeMs}`);
}
// cacheKey: compress once and keep it (files); true: compress every time (rendered pages); false: send as is
function sendBody(req, res, status, type, body, cacheKey) {
  const accept = String(req.headers['accept-encoding'] ?? '');
  const encoding = !cacheKey ? null : /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
  if (cacheKey) res.setHeader('Vary', 'Accept-Encoding');
  if (encoding) {
    const key = `${cacheKey}:${encoding}`, squeeze = () => encoding === 'br'
      ? brotliCompressSync(body, { params: { [zlib.BROTLI_PARAM_QUALITY]: cacheKey === true ? 5 : 9, [zlib.BROTLI_PARAM_SIZE_HINT]: body.length } })
      : gzipSync(body, { level: cacheKey === true ? 6 : 9 });
    if (cacheKey === true) body = squeeze();
    else body = compressed.get(key) ?? compressed.set(key, squeeze()).get(key);
    res.setHeader('Content-Encoding', encoding);
  }
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': body.length }).end(req.method === 'HEAD' ? undefined : body);
}

// --- crawler files ---
const robotsTxt = () => `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /auth/\n\nSitemap: ${APP_URL}/sitemap.xml\n`;
const STARTED = new Date().toISOString().slice(0, 10);
const sitemapXml = () => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.sitemap().map(([p, last]) => `  <url><loc>${APP_URL}${p}</loc><lastmod>${last ? new Date(last).toISOString().slice(0, 10) : STARTED}</lastmod></url>`).join('\n')}
</urlset>
`;
// how to play, about, privacy, terms, leaderboard and /u/<name> profiles (see pages.js)
const pages = sitePages(db, APP_URL, process.env.CONTACT_EMAIL, ADS);

const server = createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  let path = '';
  try { path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)); } catch {}
  if (path.startsWith('/api/')) {
    res.setHeader('X-Robots-Tag', 'noindex');
    return api(req, res, path).catch(() => json(res, 500, { error: 'Server error.' }));
  }
  if (path === '/auth/google' || path === '/auth/google/callback') {
    res.setHeader('X-Robots-Tag', 'noindex');
    return google(req, res, new URL(req.url, 'http://x')).catch(() => redirect(res, '/?auth=failed'));
  }
  // for Docker's HEALTHCHECK and uptime monitors: up, and the database answers
  if (path === '/healthz') return res.writeHead(200, { 'Content-Type': TYPES['.txt'], 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' })
    .end(db.prepare('SELECT 1 AS ok').get().ok ? 'ok\n' : 'db\n');
  if (path === '/robots.txt') return res.writeHead(200, { 'Content-Type': TYPES['.txt'], 'Cache-Control': 'public, max-age=3600' }).end(robotsTxt());
  // AdSense's authorized-seller file; f08c47fec0942fa0 is Google's own fixed id
  if (path === '/ads.txt' && ADS) return res.writeHead(200, { 'Content-Type': TYPES['.txt'], 'Cache-Control': 'public, max-age=3600' })
    .end(`google.com, ${ADS.client.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);
  if (path === '/sitemap.xml') return res.writeHead(200, { 'Content-Type': TYPES['.xml'], 'Cache-Control': 'public, max-age=3600' }).end(sitemapXml());
  const isRead = ['GET', 'HEAD'].includes(req.method);
  const page = isRead && pages.render(path);
  if (page?.redirect) return res.writeHead(301, { Location: page.redirect }).end();
  if (page) {
    res.setHeader('Cache-Control', 'no-cache');
    if (page.status !== 200 || page.noindex) res.setHeader('X-Robots-Tag', 'noindex');
    return sendBody(req, res, page.status, TYPES['.html'], Buffer.from(page.html), true);
  }
  const file = publicFile(path);
  try {
    if (!file || !isRead) throw new Error('not found');
    await serveFile(req, res, file, path);
  } catch {
    res.setHeader('X-Robots-Tag', 'noindex');
    if (isRead && !extname(path)) sendBody(req, res, 404, TYPES['.html'], Buffer.from(pages.notFound(path)), true);
    else res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
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
  const eligible = !!(w && b && w.id !== b.id && !w.guest && !b.guest && g.history().length >= 2); // guest accounts play unrated
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
  return [c, u ? { name: u.name, rating: Math.round(u.rating), provisional: u.rd > 110, guest: !!u.guest } : null]; // null = anonymous
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
  persist(room); // saved before anyone hears of it, so a crash can't lose a move a player already saw
  for (const s of COLORS) send(room.seats[s]?.ws, { ...state, you: s });
  for (const ws of room.watchers) send(ws, { ...state, you: null });
  lobbyChanged();
}

function persist(room) {
  const seats = Object.fromEntries(COLORS.map(c => [c, room.seats[c] ? { token: room.seats[c].token, userId: room.seats[c].user?.id ?? null, ip: room.seats[c].ip ?? null } : null]));
  const data = { tc: room.tc, listed: room.listed, ip: room.ip, pgn: room.game.pgn(), seats, clock: room.clock, result: room.result, drawOffer: room.drawOffer,
    rematch: [...room.rematch], chat: room.chat, savedAt: Date.now() };
  db.prepare('INSERT OR REPLACE INTO live_rooms VALUES (?, ?, ?)').run(room.id, JSON.stringify(data), room.touched ?? Date.now());
}

function restoreRooms() {
  const getUser = db.prepare('SELECT id, name, rating, rd, vol, guest FROM users WHERE id = ?');
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
  const u = sameSite ? userFromReq(req) : null; // never trust a cookie sent from another site's page
  ws.user = u && { id: u.id, name: u.name, rating: u.rating, rd: u.rd, vol: u.vol, guest: u.guest }; // just what games need: no hash, no email
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
      // playing needs an account (a guest account counts); without one you can only watch
      if ((m.t === 'seek' || m.t === 'create') && !ws.user) return send(ws, { t: 'error', msg: 'Sign in or continue as a guest to play.' });
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
        const free = ws.user && COLORS.find(c => !r.seats[c]);
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
  for (const l of LIMITERS) l.sweep();
  for (const { id } of db.prepare(`SELECT id FROM users WHERE guest = 1 AND created <= ?
      AND NOT EXISTS (SELECT 1 FROM sessions WHERE user_id = users.id)`).all(now - SESSION_MS)) deleteAccount(id);
  db.prepare('DELETE FROM tokens WHERE expires <= ?').run(now);
  db.prepare('DELETE FROM sessions WHERE created <= ?').run(now - SESSION_MS);
}
setInterval(sweep, 6e4).unref();

restoreRooms();

server.listen(PORT, () => console.log(`3D Chess listening on port ${PORT} (${APP_URL})`));
// docker stop / systemd send SIGTERM: stop taking requests, close the database cleanly (rooms are already saved), exit
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => {
  server.close();
  for (const ws of wss.clients) ws.close(1012, 'server restarting'); // 1012: clients reconnect
  db.close();
  process.exit(0);
});
