// The pages beside the game: how to play, about, privacy, terms, the leaderboard and public player profiles.
// Rendered on the server as plain HTML with no scripts (so the default CSP applies), styled by /pages.css,
// so they load fast and search engines can read them in full.
const UPDATED = '24 October 2026'; // privacy and terms: change when their text changes
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const day = ms => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const NAV = [['/leaderboard', 'Leaderboard'], ['/how-to-play', 'How to play'], ['/about', 'About']];
const FOOT = [...NAV, ['/privacy', 'Privacy'], ['/terms', 'Terms']];

export function sitePages(db, APP_URL, CONTACT_EMAIL, ADS) {
  // ads go where a page body says <!--ad-->: only on content pages (not legal or error pages), never in the game
  const AD = ADS?.page && `<aside class="ad" aria-label="Advertisement"><span>Advertisement</span>` +
    `<ins class="adsbygoogle" data-ad-client="${ADS.client}" data-ad-slot="${ADS.page}" data-ad-format="auto" data-full-width-responsive="true"></ins></aside>`;
  const withAds = body => AD && body.includes('<!--ad-->');
  const contact = CONTACT_EMAIL
    ? `email <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>`
    : 'use the contact details given by the operator of this site';
  const link = ([href, text], path) => `<a href="${href}"${href === path ? ' aria-current="page"' : ''}>${text}</a>`;
  const layout = ({ path, title, description, body, noindex }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} – 3D Chess</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${APP_URL}${path}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}${ADS ? `<meta name="google-adsense-account" content="${ADS.client}">\n` : ''}<meta name="theme-color" content="#0e0f12">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:type" content="website">
<meta property="og:site_name" content="3D Chess">
<meta property="og:title" content="${esc(title)} – 3D Chess">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${APP_URL}${path}">
<meta property="og:image" content="${APP_URL}/og-image.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/pages.css">
${withAds(body) ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS.client}" crossorigin="anonymous"></script>
<script src="/ads.js" defer></script>
` : ''}</head>
<body>
<header class="top">
  <a class="brand" href="/" aria-label="3D Chess, play"><span class="brand-mark" aria-hidden="true">♞</span><span class="brand-name">3D Chess</span></a>
  <nav aria-label="Site">${NAV.map(l => link(l, path)).join('')}<a class="play" href="/">Play</a></nav>
</header>
<main>
${body.replaceAll('<!--ad-->', AD || '')}
</main>
<footer><div>${FOOT.map(l => link(l, path)).join('')}<span>© ${new Date().getFullYear()} 3D Chess</span></div></footer>
</body>
</html>
`;

  const STATIC = {
    '/how-to-play': {
      title: 'How to Play Chess Online in 3D',
      description: 'How to start a game, move pieces and use the 3D board, plus the chess rules, draws, time controls and ratings used on 3D Chess.',
      body: `<p class="eyebrow">Guide</p>
<h1>How to play</h1>
<p class="lede">Everything you need to start a game, move the pieces and understand the rules, clocks and ratings.</p>

<h2>Start a game</h2>
<p>Open <a href="/">the game</a> and press <b>Menu</b>:</p>
<ul>
  <li><b>Quick pairing</b>: pick a time control and you're paired with the next player looking for the same one.</li>
  <li><b>Play a friend</b>: you get a private link. Send it to them and the game starts once they open it. Anyone else with the link can watch.</li>
  <li><b>Play the computer</b>: Stockfish at four levels, Easy, Medium, Hard and Max.</li>
  <li><b>Pass and play</b>: two players take turns on one screen.</li>
</ul>
<p>You can sign in to keep a rating and a game history, or continue as a guest.</p>

<!--ad-->
<h2>Using the 3D board</h2>
<ul>
  <li><b>Move a piece</b>: click it, then click the square to move to. Legal squares light up.</li>
  <li><b>Look around</b>: drag on the board to rotate the camera, scroll or pinch to zoom.</li>
  <li><b>Flip</b> turns the board to the other side. In pass-and-play you can have it turn after every move.</li>
  <li>The <b>☰</b> button opens the move list, chat (in online games) and settings such as board themes and sound.</li>
</ul>

<h2>The rules in brief</h2>
<p>White moves first and players take turns. The goal is to <b>checkmate</b>: attack the enemy king so that it has no way out.</p>
<ul>
  <li><b>King</b>: one square in any direction. It may never move into check.</li>
  <li><b>Queen</b>: any distance along a row, column or diagonal.</li>
  <li><b>Rook</b>: any distance along a row or column.</li>
  <li><b>Bishop</b>: any distance along a diagonal.</li>
  <li><b>Knight</b>: an L shape, two squares one way and one to the side. It jumps over other pieces.</li>
  <li><b>Pawn</b>: one square forward, or two from its starting square, and captures one square diagonally forward.</li>
</ul>
<h3>Special moves</h3>
<ul>
  <li><b>Castling</b>: the king moves two squares towards a rook and the rook jumps to its other side. Neither piece may have moved, the squares between must be empty, and the king may not be in check, pass through check or land in check.</li>
  <li><b>En passant</b>: when a pawn moves two squares and lands beside an enemy pawn, that pawn may capture it as if it had moved one square, but only on the very next move.</li>
  <li><b>Promotion</b>: a pawn reaching the last row becomes a queen, rook, bishop or knight. You choose.</li>
</ul>

<h2>How a game ends</h2>
<ul>
  <li><b>Checkmate</b> wins. So does your opponent <b>resigning</b> or <b>running out of time</b>, unless you don't have enough pieces left to ever checkmate, in which case it's a draw.</li>
  <li><b>Stalemate</b> (no legal move but not in check) and <b>insufficient material</b> are draws straight away.</li>
  <li><b>Threefold repetition</b> and the <b>fifty-move rule</b> (fifty moves each with no capture or pawn move) let either player claim a draw with the <b>Claim draw</b> button. Play continues until someone does.</li>
  <li><b>Fivefold repetition</b> and the <b>75-move rule</b> end the game as a draw automatically, as in FIDE rules.</li>
  <li>You can <b>offer a draw</b>, and your opponent can accept or decline.</li>
  <li>If a player doesn't make their first move within 30 seconds, the game is <b>aborted</b>: no result and no rating change.</li>
</ul>

<h2>Time controls</h2>
<p>Each player has their own clock, which runs only on their turn. "3+2" means 3 minutes each, plus 2 seconds added after every move.</p>
<ul>
  <li><b>Bullet</b>: 1+0</li>
  <li><b>Blitz</b>: 3+2 and 5+3</li>
  <li><b>Rapid</b>: 10+0 and 15+10</li>
  <li><b>No clock</b>: take as long as you like.</li>
</ul>

<h2>Ratings</h2>
<p>Signed-in players have a rating, calculated with the Glicko-2 system, as used by many chess sites. Everyone starts at 1500. A <b>?</b> after a rating means it is still provisional: it moves quickly until you've played a few rated games.</p>
<p>To keep ratings fair, some games are played unrated: games with a guest, games between two accounts on the same network, and more than three games a day between the same two players.</p>
<p>See where you stand on the <a href="/leaderboard">leaderboard</a>.</p>
<!--ad-->
<a class="cta" href="/">Play now</a>`,
    },
    '/about': {
      title: 'About 3D Chess',
      description: '3D Chess is a free chess game in realistic 3D: play friends by link, random opponents with clocks and ratings, or the Stockfish computer, right in your browser.',
      body: `<p class="eyebrow">About</p>
<h1>Chess, in realistic 3D</h1>
<p class="lede">3D Chess is a free chess game that runs in your browser, on a realistic marble board you can turn and zoom.</p>
<div class="grid">
  <div class="card"><h3>Play a friend</h3><p>Make a private link and send it. No sign-up needed.</p></div>
  <div class="card"><h3>Play online</h3><p>Get paired with a random opponent, with clocks, chat and ratings.</p></div>
  <div class="card"><h3>Play the computer</h3><p>Stockfish at four levels, from beginner-friendly to full strength.</p></div>
  <div class="card"><h3>Fair and secure</h3><p>The server checks every move and runs the clocks, so games can't be tampered with.</p></div>
</div>
<h2>Features</h2>
<ul>
  <li>A photorealistic chess set and board, plus wood, marble, green and night themes.</li>
  <li>Bullet, blitz and rapid time controls, or no clock at all.</li>
  <li>Glicko-2 ratings, a <a href="/leaderboard">leaderboard</a> and a public profile with your recent games.</li>
  <li>Full chess rules: castling, en passant, promotion, and FIDE draw rules.</li>
  <li>Spectators, rematches, draw offers and in-game chat.</li>
  <li>Sign in with email or Google, or play as a guest.</li>
</ul>
<!--ad-->
<h2>Credits</h2>
<ul>
  <li>The chess set and board are the <a href="https://polyhaven.com/a/chess_set" rel="noopener">Chess Set</a> model by Riley Queen, from Poly Haven (CC0).</li>
  <li>The computer opponent is <a href="https://stockfishchess.org/" rel="noopener">Stockfish</a> (GPL-3.0), in the <a href="https://github.com/nmrugg/stockfish.js" rel="noopener">stockfish.js</a> build.</li>
  <li>3D rendering by <a href="https://threejs.org/" rel="noopener">three.js</a> (MIT); move rules by <a href="https://github.com/jhlywa/chess.js" rel="noopener">chess.js</a> (BSD-2-Clause).</li>
</ul>
<h2>Contact</h2>
<p>Questions, bugs or ideas? Please ${contact}.</p>
<a class="cta" href="/">Play now</a>`,
    },
    '/privacy': {
      title: 'Privacy Policy',
      description: 'What 3D Chess collects, why, how long it is kept, and how to delete your account.',
      body: `<p class="eyebrow">Legal</p>
<h1>Privacy policy</h1>
<p class="muted">Last updated ${UPDATED}</p>
<p>This policy explains what 3D Chess ("we") collects when you use this site, and why. We collect only what the game needs, there are no analytics, and we don't sell your data.${ADS ? ' The site shows ads from Google AdSense: see <a href="#ads">Advertising</a>.' : ' There are no ads and no tracking.'}</p>

<h2>What we collect</h2>
<h3>If you play without an account</h3>
<p>Games against the computer and pass-and-play games happen entirely in your browser. For online games we keep the game itself (moves, clocks and chat) on the server while it is in progress.</p>
<h3>Accounts</h3>
<ul>
  <li><b>Username</b>, shown to other players and on your public profile.</li>
  <li><b>Email address</b>, used to confirm your account and send password-reset links. It is never shown to other players.</li>
  <li><b>Password</b>, stored only as a salted scrypt hash. We can't see it.</li>
  <li><b>Rating and finished games</b> (players, moves, result, time control and date), shown on your public profile and the leaderboard.</li>
  <li><b>Sessions</b>: for each device you're signed in on, when it signed in, when it was last used and its browser name, so you can review and sign out devices in your account settings.</li>
</ul>
<h3>Sign in with Google</h3>
<p>If you use Google, we receive your Google account's ID, email address and name. We use them only to sign you in and to suggest a username. We don't get access to anything else in your Google account.</p>
<h3>Guest accounts</h3>
<p>Continuing as a guest creates a temporary account with a generated name and no email. It is deleted when you sign out, or after 30 days, unless you save it as a full account.</p>
<h3>Network addresses</h3>
<p>We use your IP address to limit abuse (for example, too many sign-ups or connections) and to play games between two accounts on the same network unrated. Addresses are kept in memory for these limits, and with a game room while it is in progress, not in your account.</p>

<h2>Cookies</h2>
<p>We use one cookie, <code>sid</code>, to keep you signed in, and a short-lived one, <code>g_oauth</code>, during Google sign-in. Both are essential, can't be read by scripts and are never used for tracking. Your browser's session storage also remembers your seat in a game you're playing, so you can reload the page without losing it.${ADS ? ' Google sets its own advertising cookies when ads are shown; see below.' : ''}</p>
${ADS ? `
<h2 id="ads">Advertising</h2>
<p>The menu and some pages (never a game in progress) show ads from <b>Google AdSense</b>. Google and its partners use cookies and similar technology to show ads, measure them and, where you allow it, personalise them based on your visits to this and other sites. Google receives your IP address and browser details when an ad loads.</p>
<ul>
  <li>Visitors in the EEA, UK and Switzerland are asked for consent first, through Google's consent message, and can change their choice at any time from the "Privacy and cookie settings" link it adds.</li>
  <li>Elsewhere, you can turn off personalised ads in <a href="https://adssettings.google.com" rel="noopener">Google's ad settings</a>, or for many companies at <a href="https://www.aboutads.info/choices" rel="noopener">aboutads.info</a>.</li>
  <li>Learn more in <a href="https://policies.google.com/technologies/partner-sites" rel="noopener">how Google uses information from sites that use its services</a>.</li>
</ul>
<p>We don't share your account details with advertisers.</p>
` : ''}
<h2>Other services</h2>
<ul>
  <li><b>Google Fonts</b>: the site's fonts are loaded from Google, which receives your IP address and browser details when they load.</li>
  <li><b>Google</b>, if you choose to sign in with it.</li>${ADS ? '\n  <li><b>Google AdSense</b>, which shows the ads (see Advertising).</li>' : ''}
  <li><b>Email delivery</b>: account emails are sent through our mail provider.</li>
</ul>

<h2>How long we keep it</h2>
<p>Your account and games are kept until you delete your account. Sign-in sessions end 30 days after you sign in, or when you sign out. One-time email links expire within 24 hours. Unsaved guest accounts are deleted after 30 days.</p>

<h2>Your choices</h2>
<ul>
  <li>Change your email or password, see your signed-in devices and sign them out in <b>Account settings</b>.</li>
  <li><b>Delete your account</b> from Account settings at any time. Your account, rating and sign-in details are removed. Finished games stay in your opponents' histories without your name.</li>
  <li>To ask what we hold about you, or anything else about your data, ${contact}.</li>
</ul>

<h2>Children</h2>
<p>3D Chess is suitable for all ages, but you need to be at least 13, or have a parent's permission, to create an account.</p>

<h2>Changes</h2>
<p>If we change this policy we'll update the date at the top. Significant changes will be announced on the site.</p>`,
    },
    '/terms': {
      title: 'Terms of Use',
      description: 'The rules for using 3D Chess: accounts, fair play, chat and liability.',
      body: `<p class="eyebrow">Legal</p>
<h1>Terms of use</h1>
<p class="muted">Last updated ${UPDATED}</p>
<p>By using 3D Chess you agree to these terms. If you don't agree, please don't use the site.</p>

<h2>Your account</h2>
<ul>
  <li>You need to be at least 13, or have a parent's permission, to create an account.</li>
  <li>Keep your password to yourself. You're responsible for what happens on your account.</li>
  <li>One account per person. Usernames must not impersonate others, be offensive, or look like staff or system names.</li>
</ul>

<h2>Fair play</h2>
<ul>
  <li>Don't use chess engines, other people or any other outside help during rated games.</li>
  <li>Don't manipulate ratings, for example by playing your own second account or losing on purpose.</li>
  <li>Don't interfere with the site: no attacks, scraping at volume, automated play, or attempts to get around limits.</li>
</ul>
<p>We may make games unrated, adjust ratings, or suspend or delete accounts that break these rules.</p>

<h2>Chat and behaviour</h2>
<p>Be respectful. No harassment, hate, threats, spam or sharing other people's personal information.</p>

<h2>The service</h2>
<p>3D Chess is free and provided "as is", without warranties of any kind. We do our best to keep it running and keep your data safe, but we can't promise it will always be available or error-free, and games may occasionally be lost, for example during maintenance. To the extent the law allows, we aren't liable for any loss arising from using the site.</p>
<p>We may change or discontinue features, and update these terms. The date at the top shows when they last changed. Continuing to use the site means you accept the updated terms.</p>

<h2>Open-source parts</h2>
<p>The site includes Stockfish (GPL-3.0), three.js (MIT), chess.js (BSD-2-Clause) and a chess set model from Poly Haven (CC0). Their licenses apply to those parts. See <a href="/about">About</a> for details.</p>

<h2>Contact</h2>
<p>Questions about these terms? Please ${contact}.</p>`,
    },
  };

  const leaders = db.prepare(`SELECT u.name, u.rating, (SELECT COUNT(*) FROM games g WHERE g.rated = 1 AND (g.white = u.id OR g.black = u.id)) AS played
    FROM users u WHERE u.guest = 0 AND u.rd <= 110 ORDER BY u.rating DESC LIMIT 100`); // rd <= 110: provisional ratings aren't ranked
  const player = db.prepare('SELECT id, name, rating, rd, guest, created FROM users WHERE name = ?'); // name is COLLATE NOCASE
  const record = db.prepare(`SELECT COUNT(*) AS played,
      SUM((white = :id AND winner = 'w') OR (black = :id AND winner = 'b')) AS won,
      SUM(winner IS NULL) AS drawn FROM games WHERE rated = 1 AND (white = :id OR black = :id)`);
  const recent = db.prepare(`SELECT g.tc, g.winner, g.reason, g.rated, g.ended, g.white_change, g.black_change,
      wu.name AS white, bu.name AS black FROM games g LEFT JOIN users wu ON wu.id = g.white LEFT JOIN users bu ON bu.id = g.black
    WHERE g.white = ? OR g.black = ? ORDER BY g.ended DESC LIMIT 30`);
  const profiled = db.prepare(`SELECT u.name, MAX(g.ended) AS last FROM users u JOIN games g ON g.rated = 1 AND (g.white = u.id OR g.black = u.id)
    WHERE u.guest = 0 GROUP BY u.id ORDER BY last DESC LIMIT 5000`);
  const playerLink = name => name ? `<a href="/u/${esc(name)}">${esc(name)}</a>` : 'Anonymous';

  function leaderboard() {
    const rows = leaders.all();
    return {
      title: 'Chess Leaderboard: Top Rated Players',
      description: 'The top rated players on 3D Chess, ranked by their Glicko-2 rating from online games.',
      body: `<p class="eyebrow">Rankings</p>
<h1>Leaderboard</h1>
<p class="lede">The top rated players. Ratings use Glicko-2 and appear here once they're no longer provisional, after a few rated games.</p>
${rows.length ? `<div class="scroll"><table class="table">
<thead><tr><th class="rank">#</th><th>Player</th><th class="num">Rating</th><th class="num hide-sm">Rated games</th></tr></thead>
<tbody>
${rows.map((r, i) => `<tr><td class="rank">${i + 1}</td><td>${playerLink(r.name)}</td><td class="num">${Math.round(r.rating)}</td><td class="num hide-sm">${r.played}</td></tr>`).join('\n')}
</tbody></table></div>` : '<div class="card"><p>No ranked players yet. Play a few rated games online to be the first.</p></div>'}
<!--ad-->
<a class="cta" href="/">Play a rated game</a>`,
    };
  }

  function profile(u) {
    const rec = record.get({ id: u.id });
    const games = recent.all(u.id, u.id);
    const rating = `${Math.round(u.rating)}${u.rd > 110 ? '?' : ''}`;
    return {
      title: `${u.name}: ${rating} rated chess player`,
      description: `${u.name} plays chess on 3D Chess, rated ${rating}, with ${rec.played} rated game${rec.played === 1 ? '' : 's'}. See their recent games and results.`,
      noindex: !!u.guest, // guest accounts are temporary
      body: `<p class="eyebrow">${u.guest ? 'Guest player' : 'Player'}</p>
<h1>${esc(u.name)}</h1>
<p class="muted">Joined ${day(u.created)}</p>
<div class="stats">
  <div class="stat"><b>${rating}</b><span>${u.rd > 110 ? 'Rating, provisional' : 'Rating'}</span></div>
  <div class="stat"><b>${rec.played}</b><span>Rated games</span></div>
  <div class="stat"><b>${rec.won ?? 0} / ${rec.drawn ?? 0} / ${rec.played - (rec.won ?? 0) - (rec.drawn ?? 0)}</b><span>Won / drawn / lost</span></div>
</div>
<h2>Recent games</h2>
${games.length ? `<div class="scroll"><table class="table">
<thead><tr><th>Result</th><th>Opponent</th><th class="hide-sm">Game</th><th class="num">Rating</th><th class="num hide-sm">Date</th></tr></thead>
<tbody>
${games.map(g => {
    const mine = g.white === u.name ? 'w' : 'b', outcome = !g.winner ? 'draw' : g.winner === mine ? 'win' : 'loss';
    const change = g[mine === 'w' ? 'white_change' : 'black_change'];
    return `<tr><td class="${outcome}">${outcome[0].toUpperCase() + outcome.slice(1)}</td><td>${playerLink(mine === 'w' ? g.black : g.white)}</td>` +
      `<td class="hide-sm muted">${g.tc === 'none' ? 'No clock' : esc(g.tc)} · ${esc(g.reason)}</td>` +
      `<td class="num">${g.rated ? (change >= 0 ? '+' : '') + change : '<span class="muted">unrated</span>'}</td><td class="num hide-sm muted">${day(g.ended)}</td></tr>`;
  }).join('\n')}
</tbody></table></div>` : '<div class="card"><p>No finished games yet.</p></div>'}
<!--ad-->
<a class="cta" href="/">Play now</a>`,
    };
  }

  const notFound = { title: 'Page not found', description: 'This page does not exist.', noindex: true,
    body: '<p class="eyebrow">404</p>\n<h1>Page not found</h1>\n<p class="lede">That page doesn\'t exist, or the player has deleted their account.</p>\n<a class="cta" href="/">Back to the game</a>' };

  return {
    // { status, html, noindex } for a page, { redirect } to its canonical address, or null when the path isn't a page
    render(path) {
      if (STATIC[path]) return { status: 200, html: layout({ path, ...STATIC[path] }) };
      if (path === '/leaderboard') return { status: 200, html: layout({ path, ...leaderboard() }) };
      const m = path.match(/^\/u\/([A-Za-z0-9_]{1,40})$/);
      if (!m) return null;
      const u = player.get(m[1]);
      if (!u) return { status: 404, html: layout({ path, ...notFound }) };
      if (u.name !== m[1]) return { redirect: `/u/${u.name}` }; // one address per player, whatever the capitalisation
      const pg = profile(u);
      return { status: 200, noindex: pg.noindex, html: layout({ path, ...pg }) };
    },
    notFound: path => layout({ path, ...notFound }),
    // for sitemap.xml: the pages and every registered player with a rated game, as [path, lastmod ms or null]
    sitemap: () => [['/', null], ['/leaderboard', null], ...Object.keys(STATIC).map(p => [p, null]),
      ...profiled.all().map(r => [`/u/${r.name}`, r.last])],
  };
}
