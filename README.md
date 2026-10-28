# 3D Chess

A 3D chess game that runs in the browser: Three.js renders the board, chess.js enforces the rules, and Stockfish 10 is the computer opponent. The page is `index.html`; the browser libraries are served by the site itself from `vendor/`, not from public CDNs. There is no build step.

## Run

```bash
npm install
npm start
```

Then open http://localhost:3000. The Node server (`server.js`) serves the game, runs the lobby and game rooms, and stores accounts and finished games in SQLite at `data/chess.db` (Node's built-in `node:sqlite`, so Node 22.13 or newer; set `DB_FILE` to use another file). Passwords are hashed with scrypt; sessions are HttpOnly cookies, marked Secure when served over HTTPS (directly or behind a proxy that sets `X-Forwarded-Proto`). Local play (two players on one screen, or against the computer) also works from any static server, such as `python3 -m http.server 5173 --bind 127.0.0.1 --directory .`.

`npm test` starts a server on port 3999 and checks the Glicko-2 maths against the paper's worked example, the room protocol and accounts: sign-up and sign-in, rated games and profiles, joining, spectators, chat, matchmaking, turn order, illegal moves, clocks, draw offers, rematch, resigning, reconnecting, resuming games after a restart, losing on time (including the draw when the opponent can't mate), and which files get served.

`npm test` also runs `test-security.mjs` on port 3998: chess rules enforced by the server (castling, en passant, promotion, check, draws), an adversarial scenario matrix (double moves, races, replays, forged results, spectators acting, late moves, malformed messages, restarts), and regressions for the security fixes.

### Deploying

The site runs on the shared VPS behind its Traefik: `Dockerfile`, `docker-compose.yml` (the container, with the Traefik labels for `DOMAIN`) and `deploy/` (deploy and backup scripts). [DEPLOY.md](DEPLOY.md) covers DNS, settings, deploying, backups, email, Google sign-in, and what to do after launch. Production settings are listed in `.env.example`. `GET /healthz` answers `ok` for monitors.

### Browser libraries (`vendor/`)

three.js, chess.js and Stockfish are copied from `node_modules` into `vendor/` (committed), so the site serves its own scripts and its Content Security Policy allows scripts only from itself. Their versions are pinned in `package.json` and checked against `package-lock.json`'s integrity hashes on install. After changing one, run:

```bash
npm run vendor
```

### Accounts: email and Google sign-in

The first screen asks players to sign in, create an account, or **continue as a guest**, and a friend opening a game link sees it before joining. A guest gets a real but temporary account with a generated name like `Guest_SwiftRook42` (opponents see it; guest games are unrated). From the profile a guest can **save the account** with a username, email and password, or with Google, and keep its games; signing out of an unsaved guest account removes it, and unused guest accounts are cleaned up after 30 days. Names starting with `Guest_` are reserved. The username field has a **Generate** button for a free chess-themed name and checks availability as you type. Players sign up with a username, an email and a password (or with Google), confirm their email by a link, and can reset a forgotten password by email. **Account settings** has change email, change or set password, connect or disconnect Google, the list of signed-in devices (sign out one or all others), and delete account. Reset and confirmation links are single-use, stored hashed, and expire (1 hour and 24 hours); a password reset or change signs out other devices.

Configure with environment variables:

| Variable | What it's for |
|---|---|
| `APP_URL` | The site's public address, used in emailed links, the Google redirect, and the page's canonical, social-card and sitemap URLs, e.g. `https://chess.example.com` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Your mail server (port 465 uses TLS directly; 587 upgrades with STARTTLS) |
| `CONTACT_EMAIL` | Shown as the contact address on the About, Privacy and Terms pages |
| `MAIL_FROM` | The sender, e.g. `3D Chess <no-reply@chess.example.com>` (defaults to `SMTP_USER`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From a Google Cloud "OAuth client ID" (type: Web application). Add `APP_URL/auth/google/callback` as an authorized redirect URI. Without these the Google button is hidden. |

Without `SMTP_HOST`, emails are printed to the server console as `MAIL {...}` lines, which is handy locally. In production (`NODE_ENV=production`) the server warns about this at startup, because reset links would end up in your logs.

### Deploying behind a proxy

Rate limits (sign-ups, logins, connections, waiting rooms) are per client address. Behind a reverse proxy or a host like Render or Fly, every request appears to come from the proxy, so set `TRUST_PROXY=1` there to use the first `X-Forwarded-For` address instead. Never set it when clients connect to Node directly, or they could fake their address.

### Search engines and sharing

The page carries a title, description, canonical link, Open Graph and Twitter cards (`og-image.jpg`, 1200×630) and JSON-LD structured data. The server also serves `/robots.txt` and `/sitemap.xml`, marks private game links (`/g/…`), `/api` and `/auth` as `noindex`, and compresses text files (brotli or gzip) with ETags, so repeat visits get a 304.

Beside the game, the server renders plain HTML pages (no scripts) from `pages.js`, styled by `pages.css`: `/learn` and its chess guides (written in `learn.js`), `/how-to-play`, `/about`, `/privacy`, `/terms`, `/leaderboard` (players with a settled rating) and `/u/<name>` profiles. The sitemap lists them, plus every registered player with a rated game; guest profiles and unknown pages are `noindex`. The privacy policy and terms describe what this code does, but they are a starting point, not legal advice: review them, and set `CONTACT_EMAIL`, before launch.

All absolute URLs come from `APP_URL`, so set it to the real domain in production, otherwise search engines and link previews see `localhost`. After deploying, add the site to Google Search Console and submit `APP_URL/sitemap.xml`.

### Ads (Google AdSense)

Ads are off until `ADSENSE_CLIENT` is set; until then the page loads no ad scripts and keeps its strict security policy.

| Variable | What it's for |
|---|---|
| `ADSENSE_CLIENT` | Your publisher id, e.g. `ca-pub-1234567890123456` |
| `ADSENSE_SLOT_MENU` | A display ad unit id for the Menu |
| `ADSENSE_SLOT_PAGE` | A display ad unit id for the content pages |

Ads appear only where nobody is playing: in the Menu (the script loads the first time it opens) and on How to play, About, the leaderboard and profiles. There are none during a game, on the game-over screen, or on the privacy, terms and 404 pages. Each slot is labelled "Advertisement", has room reserved so the page doesn't jump, and is hidden when Google has no ad to show. With ads on, the server also serves `/ads.txt`, the security policy allows Google's ad hosts, and the privacy policy gains an Advertising section.

To go live:

1. Deploy with `APP_URL` set, apply at adsense.google.com, and add the site. Approval needs the real domain and its content pages.
2. Create two responsive display ad units, then set the three variables above and restart.
3. In AdSense, go to **Privacy & messaging** and publish a **European regulations** message (a Google-certified consent banner). It's required for visitors in the EEA, UK and Switzerland, and the AdSense script shows it automatically, so the site needs no banner of its own.

## Features

- Drag to orbit the camera and scroll to zoom. Click a piece to see its legal moves, then click a target square to move.
- Moves animate, and there is a promotion picker, an undo button, and a list of captured pieces with the material score.
- Draws follow FIDE rules: threefold repetition and the fifty-move rule are claimed with a **Claim draw** button (either player, online or local), while fivefold repetition, the 75-move rule, stalemate and insufficient material end the game by themselves.
- Two players on one screen, with auto-flip so the board turns to whoever moves next.
- Play a friend online: **Play a friend online** makes a private room with an unguessable link like `/g/5b15e7f0e6065acb`. Your friend opens it and you each get a colour. The server checks every move, and refreshing the page puts you back in your seat.
- A menu at `/` with quick pairing against a random opponent (one queue per time control), private game links, local play, and a list of live matchmaking games anyone can watch (private friend games are not listed). Players can chat in a game; spectators can read the chat.
- Online games have clocks (1+0, 3+2, 5+3, 10+0, 15+10, or no clock), resigning, draw offers, a rematch with colours swapped, a move list, and a game-over screen. The server keeps the time, so a slow or tampered page can't stop the clock. Like lichess, each side must make its first move within 30 seconds (White from when both players are seated, Black from White's first move), or the game is aborted: no result, no rating change, and it isn't saved.
- Accounts (optional): sign up with a name and password, keep a Glicko-2 rating, the system lichess uses, where a "?" marks a provisional rating (games between two signed-in players are rated), and see your game history with replays. Signed-in players get their seat back from any tab; a seat that belongs to an account can only be retaken while signed in to it, and signing out clears the tab's seat tokens. To stop rating farming with a second account, games where both players are on the same network, and games beyond the 3rd rated one between the same two accounts in 24 hours, are played and saved but not rated (the result screen says why). Finished games are saved with full PGN headers, and games in progress survive a server restart (their clocks pause while it is down).
- A computer opponent at Easy, Medium, Hard or Max; you can play White or Black.
- Realistic 3D-model pieces, a real marble board plus four colour boards, and sounds made with Web Audio, so there are no audio files. Settings are remembered.
- Save and load games as PGN files. The current game is also saved automatically and comes back after a reload.

## Debugging

The browser console exposes `game` (the chess.js instance) and `restart`. To load a position from a FEN string:

```js
restart(() => game.load('7k/1P6/8/8/8/8/8/K7 w - - 0 1'))
```

## Credits

The realistic pieces and marble board are the [Chess Set](https://polyhaven.com/a/chess_set) model by Riley Queen, from Poly Haven, licensed CC0. They're stored in `models/chess_set/` at 1k texture resolution (7 MB).

Stockfish 10 (the asm.js build from the `stockfish` npm package) is free software under the GPL-3.0; its license is in `vendor/stockfish.COPYING.txt` and its source is at https://github.com/nmrugg/stockfish.js (v10.0.2). three.js (MIT) and chess.js (BSD-2-Clause) licenses are in `vendor/` too.
