// Reads barcodes and QR codes off the main thread (jobs.js runCode), for gs.vision's Scanner on phones
// whose web view has no barcode reader of its own. ZXing takes a few milliseconds to tens of them for
// a camera picture, several times a second, and none of it needs the page. The picture's pixels in,
// what it found out: [{ text, format, corners }] in the picture's own pixels.
import { readBarcodes, prepareZXingModule } from 'zxing-wasm/reader';
import wasm from 'zxing-wasm/reader/zxing_reader.wasm?url';

// (ZXing would fetch its .wasm from a public server: ours ships with the app)
const ready = prepareZXingModule({ overrides: { locateFile: (path, prefix) => path.endsWith('.wasm') ? wasm : prefix + path }, fireImmediately: true });
self.onmessage = async e => {
  const { id, data } = e.data;
  try {
    await ready;
    if (!data.pixels) { self.postMessage({ id, r: [] }); return; }   // (a first job with no picture just gets the reader loaded)
    const found = await readBarcodes(new ImageData(new Uint8ClampedArray(data.pixels), data.w, data.h), data.opts);
    self.postMessage({ id, r: found.map(r => ({ text: r.text, format: r.format, corners: [r.position.topLeft, r.position.topRight, r.position.bottomRight, r.position.bottomLeft] })) });
  } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
