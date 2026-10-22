# 3D Chess

A 3D chess game that runs in the browser: Three.js renders the board, chess.js enforces the rules, and Stockfish 10 is the computer opponent. Everything lives in `index.html`, with the libraries loaded from a CDN. There is no build step.

## Run

```bash
npm install
npm start
```

Then open http://localhost:3000. The Node server (`server.js`) serves the game and runs the online rooms. Local play (two players on one screen, or against the computer) also works from any static server, such as `python3 -m http.server 5173 --bind 127.0.0.1 --directory .`.

`npm test` starts a server on port 3999 and checks the room protocol: joining, turn order, illegal moves, reconnecting, and which files get served.

## Features

- Drag to orbit the camera and scroll to zoom. Click a piece to see its legal moves, then click a target square to move.
- Moves animate, and there is a promotion picker, an undo button, and a list of captured pieces with the material score.
- Two players on one screen, with auto-flip so the board turns to whoever moves next.
- Play a friend online: **Play a friend online** makes a private room with a link like `/g/1a2b3c4d`. Your friend opens it and you each get a colour. The server checks every move, and refreshing the page puts you back in your seat.
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
