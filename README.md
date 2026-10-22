# 3D Chess

A 3D chess game that runs in the browser: Three.js renders the board, chess.js enforces the rules, and Stockfish 10 is the computer opponent. Everything lives in `index.html`, with the libraries loaded from a CDN. There is no build step.

## Run

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. It needs to be served over HTTP, not opened as `file://`, because the Stockfish Web Worker won't load otherwise.

## Features

- Drag to orbit the camera and scroll to zoom. Click a piece to see its legal moves, then click a target square to move.
- Moves animate, and there is a promotion picker, an undo button, and a list of captured pieces with the material score.
- Two players on one screen, with auto-flip so the board turns to whoever moves next.
- A computer opponent at Easy, Medium, Hard or Max; you can play White or Black.

## Debugging

The browser console exposes `game` (the chess.js instance) and `restart`. To load a position from a FEN string:

```js
restart(() => game.load('7k/1P6/8/8/8/8/8/K7 w - - 0 1'))
```
