#!/usr/bin/env node
/**
 * Generate resources/icon.ico from resources/icon.iconset PNGs.
 * Pure Node: builds ICO container (PNG-embedded) so electron-builder gets at least 256x256.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsetDir = join(root, 'resources', 'icon.iconset');
const outIco = join(root, 'resources', 'icon.ico');

// ICO directory entry: width(1), height(1), colors(1), reserved(1), planes(2), bitcount(2), size(4), offset(4)
// Width/Height 0 means 256. Modern ICO embeds PNG as image data.
function writeIcoDirEntry(buf, offset, width, height, size, dataOffset) {
  buf.writeUInt8(width === 256 ? 0 : width, offset);
  buf.writeUInt8(height === 256 ? 0 : height, offset + 1);
  buf.writeUInt8(0, offset + 2);
  buf.writeUInt8(0, offset + 3);
  buf.writeUInt16LE(1, offset + 4);
  buf.writeUInt16LE(32, offset + 6);
  buf.writeUInt32LE(size, offset + 8);
  buf.writeUInt32LE(dataOffset, offset + 12);
}

const sizes = [16, 32, 64, 128, 256];
const pngBuffers = [];
for (const size of sizes) {
  const pngPath = join(iconsetDir, `icon_${size}x${size}.png`);
  if (!existsSync(pngPath)) {
    console.error('Missing:', pngPath);
    process.exit(1);
  }
  pngBuffers.push(readFileSync(pngPath));
}

const headerSize = 6;
const entrySize = 16;
const numImages = pngBuffers.length;
let dataOffset = headerSize + numImages * entrySize;
const icoParts = [];

// ICONDIR: reserved(2)=0, type(2)=1, count(2)
const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(numImages, 4);
icoParts.push(header);

const entries = Buffer.alloc(entrySize * numImages);
for (let i = 0; i < numImages; i++) {
  const size = sizes[i];
  const len = pngBuffers[i].length;
  writeIcoDirEntry(entries, i * entrySize, size, size, len, dataOffset);
  dataOffset += len;
}
icoParts.push(entries);
icoParts.push(...pngBuffers);

writeFileSync(outIco, Buffer.concat(icoParts));
console.log('Generated', outIco);
