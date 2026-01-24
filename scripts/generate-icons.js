#!/usr/bin/env node
// generate-icons.js
// Generates PNG icons from the included SVG logo using sharp.
// Usage: npm run gen-icons

const fs = require('fs');
const path = require('path');

(async function main(){
  const svgPath = path.join(process.cwd(), 'src', 'web', 'public', 'img', 'logo.svg');
  if (!fs.existsSync(svgPath)) {
    console.error('SVG logo not found at', svgPath);
    process.exit(1);
  }
  const svg = fs.readFileSync(svgPath, 'utf8');

  try {
    const sharp = require('sharp');
    const outDir = path.join(process.cwd(), 'src', 'web', 'public', 'img');
    await sharp(Buffer.from(svg)).resize(512, 512, { fit: 'contain' }).png({ compressionLevel: 9 }).toFile(path.join(outDir, 'logo-512.png'));
    await sharp(Buffer.from(svg)).resize(128, 128, { fit: 'contain' }).png({ compressionLevel: 9 }).toFile(path.join(outDir, 'logo-128.png'));
    console.log('Generated logo-512.png and logo-128.png in src/web/public/img');
  } catch (e) {
    console.error('Failed to generate PNG icons. Make sure "sharp" is installed as a dev dependency.');
    console.error('Install with: npm install --save-dev sharp');
    console.error('Error:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();