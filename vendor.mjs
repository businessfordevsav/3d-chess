// Copies the browser libraries from node_modules into vendor/, so the site serves them itself instead of
// loading them from public CDNs. Versions are pinned in package.json and checked by package-lock.json
// integrity hashes. Run after changing any of them: npm run vendor
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const NM = join(import.meta.dirname, 'node_modules'), OUT = join(import.meta.dirname, 'vendor');
const FILES = {
  'three/build/three.module.js': 'three/build/three.module.js',
  'three/examples/jsm/controls/OrbitControls.js': 'three/examples/jsm/controls/OrbitControls.js',
  'three/examples/jsm/loaders/GLTFLoader.js': 'three/examples/jsm/loaders/GLTFLoader.js',
  'three/examples/jsm/environments/RoomEnvironment.js': 'three/examples/jsm/environments/RoomEnvironment.js',
  'three/examples/jsm/utils/BufferGeometryUtils.js': 'three/examples/jsm/utils/BufferGeometryUtils.js', // imported by GLTFLoader
  'three/LICENSE': 'three/LICENSE',
  'chess.js/dist/esm/chess.js': 'chess.js',
  'chess.js/LICENSE': 'chess.js.LICENSE',
  // the self-contained asm.js build: plays without WebAssembly, so the CSP needs no 'wasm-unsafe-eval'
  'stockfish/src/stockfish.asm.js': 'stockfish.js',
  'stockfish/Copying.txt': 'stockfish.COPYING.txt', // GPL-3.0: source at https://github.com/nmrugg/stockfish.js (v10.0.2)
};

rmSync(OUT, { recursive: true, force: true });
for (const [from, to] of Object.entries(FILES)) cpSync(join(NM, from), join(OUT, to));
console.log(`vendored ${Object.keys(FILES).length} files into vendor/`);
