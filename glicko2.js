// Glicko-2 rating update (Mark Glickman, "Example of the Glicko-2 system", 2012).
// p: { rating, rd, vol }; results: [[opponent { rating, rd }, score 1 | 0.5 | 0], ...] from one rating period.
// Returns p's new { rating, rd, vol }.
// ponytail: RD doesn't grow while a player is inactive (step 6 with no games); add it if returning players' ratings feel stiff
const SCALE = 173.7178, TAU = 0.5;

export function glicko2(p, results) {
  const mu = (p.rating - 1500) / SCALE, phi = p.rd / SCALE;
  const games = results.map(([o, score]) => {
    const g = 1 / Math.sqrt(1 + 3 * (o.rd / SCALE) ** 2 / Math.PI ** 2);
    return { g, E: 1 / (1 + Math.exp(-g * (mu - (o.rating - 1500) / SCALE))), score };
  });
  const v = 1 / games.reduce((t, { g, E }) => t + g ** 2 * E * (1 - E), 0);
  const sum = games.reduce((t, { g, E, score }) => t + g * (score - E), 0), delta = v * sum;

  // step 5: new volatility, solving f(x) = 0 with the Illinois method
  const a = Math.log(p.vol ** 2);
  const f = x => Math.exp(x) * (delta ** 2 - phi ** 2 - v - Math.exp(x)) / (2 * (phi ** 2 + v + Math.exp(x)) ** 2) - (x - a) / TAU ** 2;
  let A = a, B;
  if (delta ** 2 > phi ** 2 + v) B = Math.log(delta ** 2 - phi ** 2 - v);
  else { let k = 1; while (f(a - k * TAU) < 0) k++; B = a - k * TAU; }
  let fA = f(A), fB = f(B);
  while (Math.abs(B - A) > 1e-6) {
    const C = A + (A - B) * fA / (fB - fA), fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  const vol = Math.exp(A / 2);

  const phiNew = 1 / Math.sqrt(1 / (phi ** 2 + vol ** 2) + 1 / v);
  return { rating: 1500 + SCALE * (mu + phiNew ** 2 * sum), rd: Math.min(350, Math.max(45, SCALE * phiNew)), vol };
}
