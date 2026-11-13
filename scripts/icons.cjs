// Builds every app icon (Android, iOS, web, Mac and Windows) from the layered SVGs in resources/icon/.
//   background.svg       full-bleed backdrop (gradient)
//   background-dark.svg  backdrop for the iOS dark-mode icon
//   foreground.svg       the artwork, drawn at its normal size on a 1024 canvas
//   monochrome.svg       one-colour silhouette for Android themed icons and the iOS tinted icon
// Run: npm run icons   (uses the Playwright Chromium that is already installed)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'resources/icon');
const svg = name => fs.readFileSync(path.join(SRC, name), 'utf8');
const uri = name => 'data:image/svg+xml;base64,' + Buffer.from(svg(name)).toString('base64');

// Adaptive / maskable icons crop the canvas, so the artwork is shrunk to sit inside the safe zone.
const ADAPTIVE_SCALE = 0.78;

// layers: [{ src, scale, tint }]; shape: 'square' | 'round' | 'rounded'; bg: CSS colour behind everything
async function render(page, out, size, layers, { shape = 'square', bg = 'transparent' } = {}) {
  const radius = shape === 'round' ? '50%' : shape === 'rounded' ? '22.5%' : '0';
  const imgs = layers.map(l =>
    `<img src="${uri(l.src)}" style="position:absolute;inset:0;width:100%;height:100%;transform:scale(${l.scale || 1})">`
  ).join('');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">
    <div style="position:relative;width:${size}px;height:${size}px;overflow:hidden;border-radius:${radius};background:${bg}">${imgs}</div>
  </body></html>`);
  await page.waitForFunction(() => [...document.images].every(i => i.complete));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: bg === 'transparent' });
  console.log(path.relative(ROOT, out), size);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const full = [{ src: 'background.svg' }, { src: 'foreground.svg' }];
  const adaptive = [{ src: 'background.svg' }, { src: 'foreground.svg', scale: ADAPTIVE_SCALE }];

  // Android: legacy square + round icons, and adaptive layers (108dp canvas) incl. monochrome for themed icons.
  const res = path.join(ROOT, 'android/app/src/main/res');
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(densities)) {
    const dir = path.join(res, 'mipmap-' + d);
    await render(page, path.join(dir, 'ic_launcher.png'), 48 * k, full, { shape: 'rounded' });
    await render(page, path.join(dir, 'ic_launcher_round.png'), 48 * k, full, { shape: 'round' });
    await render(page, path.join(dir, 'ic_launcher_foreground.png'), 108 * k, [{ src: 'foreground.svg', scale: ADAPTIVE_SCALE }]);
    await render(page, path.join(dir, 'ic_launcher_background.png'), 108 * k, [{ src: 'background.svg' }]);
    await render(page, path.join(dir, 'ic_launcher_monochrome.png'), 108 * k, [{ src: 'monochrome.svg', scale: ADAPTIVE_SCALE }]);
  }

  // iOS: one 1024 icon per appearance (light, dark, tinted). The light one must have no transparency.
  const ios = path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
  await render(page, path.join(ios, 'AppIcon-512@2x.png'), 1024, full, { bg: '#FF6A2B' });
  await render(page, path.join(ios, 'AppIcon-dark.png'), 1024, [{ src: 'background-dark.svg' }, { src: 'foreground.svg' }], { bg: '#0C0E12' });
  await render(page, path.join(ios, 'AppIcon-tinted.png'), 1024, [{ src: 'monochrome.svg' }], { bg: '#000' });

  // Web / PWA: favicon, Apple touch icon, manifest icons (any + maskable).
  const web = path.join(ROOT, 'public/icons');
  await render(page, path.join(web, 'favicon-32.png'), 32, full, { shape: 'rounded' });
  await render(page, path.join(web, 'apple-touch-icon.png'), 180, full, { bg: '#FF6A2B' });
  await render(page, path.join(web, 'icon-192.png'), 192, full, { shape: 'rounded' });
  await render(page, path.join(web, 'icon-512.png'), 512, full, { shape: 'rounded' });
  await render(page, path.join(web, 'maskable-512.png'), 512, adaptive, { bg: '#FF6A2B' });

  // Mac and Windows app (desktop/build, made into .icns and .ico when the app is built). A Mac icon is a
  // rounded square on Apple's grid: 824 of the 1024 canvas, with room round it for its shadow.
  const desk = path.join(ROOT, 'desktop/build');
  await page.setViewportSize({ width: 1024, height: 1024 });
  await page.setContent(`<html><body style="margin:0;background:transparent">
    <div style="position:absolute;left:100px;top:92px;width:824px;height:824px;border-radius:185px;overflow:hidden;box-shadow:0 10px 24px rgba(0,0,0,.32)">
      ${full.map(l => `<img src="${uri(l.src)}" style="position:absolute;inset:0;width:100%;height:100%">`).join('')}</div></body></html>`);
  await page.waitForFunction(() => [...document.images].every(i => i.complete));
  fs.mkdirSync(desk, { recursive: true });
  await page.screenshot({ path: path.join(desk, 'icon.png'), omitBackground: true });
  console.log('desktop/build/icon.png', 1024);
  await render(page, path.join(desk, 'icon-win.png'), 256, full, { shape: 'rounded' });
  await browser.close();

  // SVG favicon: background + foreground merged into one rounded file.
  const inner = s => s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  fs.writeFileSync(path.join(web, 'favicon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><clipPath id="r"><rect width="1024" height="1024" rx="230"/></clipPath>` +
    `<g clip-path="url(#r)">${inner(svg('background.svg'))}${inner(svg('foreground.svg'))}</g></svg>\n`);
  console.log('public/icons/favicon.svg');
})();
