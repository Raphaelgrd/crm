// Run with: node generate-icon.js
// Generates icon.png from the SVG using canvas (requires canvas npm package)
// Or just use any 128x128 PNG and name it icon.png

const { createCanvas } = require("canvas");
const fs = require("fs");

function makeIcon(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext("2d");

  // Background
  ctx.fillStyle = "#0f0f0f";
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.2);
  ctx.fill();

  // Red dot (recording indicator)
  ctx.fillStyle = "#ef4444";
  ctx.beginPath();
  ctx.arc(size * 0.72, size * 0.28, size * 0.12, 0, Math.PI * 2);
  ctx.fill();

  // Mic shape
  const mx = size * 0.42;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(mx - size * 0.1, size * 0.2, size * 0.2, size * 0.32, size * 0.06);
  ctx.fill();

  // Arc
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size * 0.05;
  ctx.beginPath();
  ctx.arc(mx, size * 0.55, size * 0.18, Math.PI, 0, true);
  ctx.stroke();

  // Stem
  ctx.beginPath();
  ctx.moveTo(mx, size * 0.73);
  ctx.lineTo(mx, size * 0.82);
  ctx.stroke();

  // Base
  ctx.lineWidth = size * 0.05;
  ctx.beginPath();
  ctx.moveTo(mx - size * 0.12, size * 0.82);
  ctx.lineTo(mx + size * 0.12, size * 0.82);
  ctx.stroke();

  return c.toBuffer("image/png");
}

try {
  const buf = makeIcon(128);
  fs.writeFileSync("icon.png", buf);
  console.log("icon.png created (128x128)");
} catch (e) {
  console.log("canvas not available — add a 128x128 PNG named icon.png manually");
}
