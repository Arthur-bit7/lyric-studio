// Original synthesized accompaniment. No recording or copyrighted song is bundled.
const fs = require('node:fs');
const path = require('node:path');

function generateDemo() {
  const rate = 22050, samples = rate * 20;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  const notes = [[261.63,329.63,392],[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66],[261.63,329.63,392]];
  for (let i = 0; i < samples; i++) {
    const t = i / rate, chord = notes[Math.min(4, Math.floor(t / 4))];
    let value = 0;
    chord.forEach((freq, j) => {
      const phase = ((t - j * .22) % 2 + 2) % 2;
      value += .13 * Math.exp(-phase * 2.1) * Math.sin(2 * Math.PI * freq * t);
      value += .025 * Math.exp(-phase * 3) * Math.sin(2 * Math.PI * freq * 2 * t);
    });
    value *= Math.min(t * 3, 1, Math.max(0, (20 - t) * 2));
    buffer.writeInt16LE(Math.trunc(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2);
  }
  return buffer;
}
function ensureDemo(destination) {
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.writeFileSync(destination, generateDemo());
  }
}
if (require.main === module) {
  const destination = path.join(__dirname, '..', 'public', 'demo.wav');
  ensureDemo(destination);
  console.log('Demo ready: public/demo.wav');
}
module.exports = {generateDemo, ensureDemo};
