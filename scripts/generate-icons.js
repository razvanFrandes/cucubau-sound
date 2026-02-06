const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const svgTemplate = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 1}" fill="#1f2937"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size/4}" fill="#ef4444"/>
</svg>`;

const iconsDir = path.join(__dirname, '..', 'public', 'icons');

sizes.forEach(size => {
  const svg = svgTemplate(size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.svg`), svg);
  console.log(`Created icon${size}.svg`);
});
