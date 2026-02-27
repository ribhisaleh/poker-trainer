import sharp from "sharp";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "../public");

// Poker-themed adaptive icon: dark felt background + emerald spade
// Pure SVG paths — no fonts needed, renders cleanly at any size
function buildSvg(size) {
  const r = size;
  const cx = r / 2;
  const cy = r / 2;
  const scale = r / 512;

  // Spade coordinates (designed on 512×512 grid, scaled)
  const s = (n) => Math.round(n * scale * 10) / 10;

  // Background rounded corner radius
  const bgRadius = s(76);

  // Spade main body path (pure bezier curves, no text)
  // Head of spade
  const spadeHead = `
    M${s(256)},${s(88)}
    C${s(256)},${s(88)} ${s(76)},${s(194)} ${s(76)},${s(306)}
    C${s(76)},${s(382)} ${s(162)},${s(424)} ${s(256)},${s(378)}
    C${s(350)},${s(424)} ${s(436)},${s(382)} ${s(436)},${s(306)}
    C${s(436)},${s(194)} ${s(256)},${s(88)} ${s(256)},${s(88)} Z
  `.trim();

  // Stem (tapered rect)
  const stem = `
    M${s(220)},${s(378)}
    L${s(198)},${s(446)}
    L${s(314)},${s(446)}
    L${s(292)},${s(378)} Z
  `.trim();

  // Base bar (rounded ends)
  const baseBar = `
    M${s(172)},${s(434)}
    Q${s(172)},${s(462)} ${s(200)},${s(462)}
    L${s(312)},${s(462)}
    Q${s(340)},${s(462)} ${s(340)},${s(434)}
    Q${s(340)},${s(446)} ${s(172)},${s(446)} Z
  `.trim();

  // Small suit pips in corners (circles) for detail at large size
  const pip = (x, y, pr) =>
    `<circle cx="${s(x)}" cy="${s(y)}" r="${s(pr)}" fill="#10b981" opacity="0.25"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r}" height="${r}" viewBox="0 0 ${r} ${r}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </radialGradient>
    <radialGradient id="sg" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#34d399"/>
      <stop offset="100%" stop-color="#059669"/>
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="${s(8)}" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${r}" height="${r}" rx="${bgRadius}" fill="url(#bg)"/>

  <!-- Subtle border ring -->
  <rect width="${r}" height="${r}" rx="${bgRadius}" fill="none"
    stroke="#10b981" stroke-width="${s(3)}" stroke-opacity="0.35"/>

  <!-- Corner pips -->
  ${pip(80, 80, 18)}
  ${pip(432, 80, 18)}
  ${pip(80, 432, 18)}
  ${pip(432, 432, 18)}

  <!-- Spade glow layer -->
  <g filter="url(#glow)" opacity="0.6">
    <path d="${spadeHead}" fill="#10b981"/>
  </g>

  <!-- Spade main shape -->
  <path d="${spadeHead}" fill="url(#sg)"/>
  <path d="${stem}" fill="url(#sg)"/>
  <path d="${baseBar}" fill="url(#sg)"/>
</svg>`;
}

async function generate(size, filename) {
  const svg = buildSvg(size);
  const svgBuf = Buffer.from(svg);
  const outPath = resolve(publicDir, filename);
  await sharp(svgBuf).png().toFile(outPath);
  console.log(`✓ Generated ${filename} (${size}×${size})`);
}

await generate(192, "icon-192.png");
await generate(512, "icon-512.png");
// Apple touch icon (180×180, no rounded corners — iOS clips it)
await generate(180, "apple-touch-icon.png");
console.log("Done.");
