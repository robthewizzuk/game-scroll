// The phone and driver steering list (how it works, and every field: src/steer.js; how to draw a rule from the
// reports: docs/crash-reports.md, "Chips and phones to steer"). Built into the app, and sent out in the catalogue,
// whose copy replaces this one from the next start, so a rule reaches phones without a new app.
// Plain data only (it is JSON in the catalogue): patterns are strings. `node scripts/steer.mjs` checks it.
//
// A rule looks like this (an example, not a rule in use):
//   { id: 'adreno-6xx-old-chrome-webgpu', why: 'WebGPU device lost 40 times in a week on Adreno 6xx with Chrome 13x (report, 2026-11-20)',
//     when: { platform: 'android', chip: 'Adreno \\(TM\\) 6\\d\\d', engine: 'Chrome <140' }, do: { webgpu: false } }
// Keep each rule as narrow as the reports show (the chip and the engine or driver versions where the trouble is),
// say why in `why` with what was seen and when, and take it out once the reports show the trouble gone.
export default [];
