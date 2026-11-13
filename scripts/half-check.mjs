// Checks the kit's half-precision shader maths (src/kit/half.js halfFn: SGSR 2's upscale, the sharp picture
// read, smoke and fire, the grade) two ways:
// 1. naga, the WebGPU shader checker Firefox uses, compiles each function on its own in half (f16, as phones
//    with 'shader-f16' compile it) and in full (f32, as everything else does). The build machine's WebGPU has
//    no half precision, so this is the only compile the half versions get before a phone builds them. Chrome
//    and Android compile with Tint, not naga: the two agree on what is valid WGSL, give or take the odd corner.
//    Needs naga (cargo install naga-cli); without it, this part says so and is skipped.
// 2. In the test browser (scripts/half-check/index.html), the start-up check (halfCheck) that keeps a phone
//    safe: this WebGPU has no half, so it must say so; told the chip has it, it must find every half function
//    refused and draw each in full, with no error reported for the device.
//   node scripts/half-check.mjs [--print] [--no-browser]      (--print: also print each function's WGSL)
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const print = process.argv.includes('--print'), browser = !process.argv.includes('--no-browser');
let bad = 0;

// 1. naga
let naga = 'naga';
try { execFileSync(naga, ['--version'], { stdio: 'pipe' }); } catch (_) {
  const home = path.join(os.homedir(), '.cargo', 'bin', 'naga');
  naga = fs.existsSync(home) ? home : null;
}
await import('../src/kit/hd3d-gpu.js');   // loads every pass that makes a half function (framegen.js, gas-gpu.js...)
const { halfTexts } = await import('../src/kit/half.js');
if (!naga) console.log('SKIP naga: not installed (cargo install naga-cli), so the half-precision shaders were not compiled');
else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'half-'));
  let n = 0, nb = 0;
  for (const p of ['f16', 'f32']) {
    for (const { name, code } of halfTexts(p)) {
      const file = path.join(dir, `${name}_${p}.wgsl`), text = (p === 'f16' ? 'enable f16;\n' : '') + code + '\n';
      fs.writeFileSync(file, text); n++;
      if (print) console.log(`// ${name} (${p})\n${text}`);
      try { execFileSync(naga, [file], { stdio: 'pipe' }); console.log(`ok    ${name} in ${p === 'f16' ? 'half' : 'full'}`); }
      catch (e) { nb++; console.log(`FAIL  ${name} in ${p === 'f16' ? 'half' : 'full'}:\n${String(e.stderr || e.stdout || e.message).trim()}`); }
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(nb ? `naga: ${nb} of ${n} failed` : `naga: all ${n} compile`); bad += nb;
}

// 2. the start-up check, in the test browser
if (browser) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const vite = await import('vite');
  const server = await vite.createServer({ server: { port: 4280 + Math.floor(Math.random() * 50), strictPort: false }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`${server.resolvedUrls.local[0]}scripts/half-check/`);
  await p.waitForFunction(() => window.result, null, { timeout: 120000 });
  const r = await p.evaluate(() => window.result);
  await b.close(); await server.close();
  const check = (ok, what) => { console.log(`${ok ? 'ok   ' : 'FAIL '} ${what}`); if (!ok) bad++; };
  if (r.error) check(false, 'the start-up check ran: ' + r.error);
  else {
    check(r.real.chip === false && !r.real.failed.length && /no half/.test(r.real.info), `this browser's WebGPU has no half and says so: ${r.real.info}`);
    check(r.fake.chip === true && r.fake.failed.length === r.fake.n && r.fake.uncaptured === 0 && /full/.test(r.fake.info), `told it had: all ${r.fake.n} refused, drawn in full, nothing reported as an error: ${r.fake.info}`);
  }
  check(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join('; ') : ''));
}
console.log(bad ? `${bad} failed` : 'all passed');
process.exit(bad ? 1 : 0);
