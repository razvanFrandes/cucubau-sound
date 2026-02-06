const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname, '..', 'public', 'icons');

sizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background circle
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 1, 0, Math.PI * 2);
  ctx.fillStyle = '#1f2937';
  ctx.fill();

  // Red center
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/4, 0, Math.PI * 2);
  ctx.fillStyle = '#ef4444';
  ctx.fill();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buffer);
  console.log(`Created icon${size}.png`);
});
