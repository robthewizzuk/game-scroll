// Does the chip start on a pass when it is sent (queue.submit), or only when the running code ends? A heavy pass alone,
// then sent with its own time again spent in code after it, then with the code first: overlapped, the second is about
// the first; not, about twice it. Why src/kit/submit.js sends early.   node scripts/gpu-overlap.cjs
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
  const p = await b.newPage(); await p.route('https://x.test/', r => r.fulfill({ body: '<html></html>', contentType: 'text/html' })); await p.goto('https://x.test/');
  console.log(JSON.stringify(await p.evaluate(async () => {
    const a = await navigator.gpu.requestAdapter(), d = await a.requestDevice();
    const tex = d.createTexture({ size: [1024, 1024], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const m = d.createShaderModule({ code: `
      @vertex fn v(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { let p = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3)); return vec4f(p[i], 0, 1); }
      @fragment fn f(@builtin(position) q: vec4f) -> @location(0) vec4f { var s = 0.0; for (var i = 0; i < 400; i++) { s += sin(q.x * f32(i) * .01) * cos(q.y * f32(i) * .013); } return vec4f(fract(s), 0, 0, 1); }` });
    const pipe = d.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'v' }, fragment: { module: m, entryPoint: 'f', targets: [{ format: 'rgba8unorm' }] } });
    const pass = () => { const e = d.createCommandEncoder(), r = e.beginRenderPass({ colorAttachments: [{ view: tex.createView(), loadOp: 'clear', storeOp: 'store' }] }); r.setPipeline(pipe); r.draw(3); r.end(); return e.finish(); };
    const spin = ms => { const t = performance.now(); while (performance.now() - t < ms); };
    const done = () => d.queue.onSubmittedWorkDone();
    d.queue.submit([pass()]); await done();   // warm
    const out = { alone: [], thenSpin: [], spinFirst: [] };
    for (let k = 0; k < 4; k++) {
      let t = performance.now(); d.queue.submit([pass()]); await done(); const W = performance.now() - t; out.alone.push(Math.round(W));
      // the pass sent, then the same time again spent in code, then wait: overlapped, about W in all; not, about 2 W
      t = performance.now(); d.queue.submit([pass()]); spin(W); await done(); out.thenSpin.push(Math.round(performance.now() - t));
      // the code first, then the pass: always about 2 W (what holding every pass to the end of the frame's code does)
      t = performance.now(); spin(W); d.queue.submit([pass()]); await done(); out.spinFirst.push(Math.round(performance.now() - t));
    }
    return out;
  })));
  await b.close();
})();
