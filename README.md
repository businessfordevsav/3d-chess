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

### Browser libraries (`vendor/`)

three.js, chess.js and Stockfish are copied from `node_modules` into `vendor/` (committed), so the site serves its own scripts and its Content Security Policy allows scripts only from itself. Their versions are pinned in `package.json` and checked against `package-lock.json`'s integrity hashes on install. After changing one, run:

```bash
npm run vendor
```

### Deploying behind a proxy

Rate limits (sign-ups, logins, connections, waiting rooms) are per client address. Behind a reverse proxy or a host like Render or Fly, every request appears to come from the proxy, so set `TRUST_PROXY=1` there to use the first `X-Forwarded-For` address instead. Never set it when clients connect to Node directly, or they could fake their address.

## Features

- Drag to orbit the camera and scroll to zoom. Click a piece to see its legal moves, then click a target square to move.
- Moves animate, and there is a promotion picker, an undo button, and a list of captured pieces with the material score.
- Two players on one screen, with auto-flip so the board turns to whoever moves next.
- Play a friend online: **Play a friend online** makes a private room with an unguessable link like `/g/5b15e7f0e6065acb`. Your friend opens it and you each get a colour. The server checks every move, and refreshing the page puts you back in your seat.
- A menu at `/` with quick pairing against a random opponent (one queue per time control), private game links, local play, and a list of live matchmaking games anyone can watch (private friend games are not listed). Players can chat in a game; spectators can read the chat.
- Online games have clocks (1+0, 3+2, 5+3, 10+0, 15+10, or no clock), resigning, draw offers, a rematch with colours swapped, a move list, and a game-over screen. The server keeps the time, so a slow or tampered page can't stop the clock. Like lichess, each side must make its first move within 30 seconds (White from when both players are seated, Black from White's first move), or the game is aborted: no result, no rating change, and it isn't saved.
- Accounts (optional): sign up with a name and password, keep a Glicko-2 rating, the system lichess uses, where a "?" marks a provisional rating (games between two signed-in players are rated), and see your game history with replays. Signed-in players get their seat back from any tab. Finished games are saved with full PGN headers, and games in progress survive a server restart (their clocks pause while it is down).
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
