// A server for a check, on a port of its own: the system picks one that is free, so checks run side by side,
// in other worktrees or other checkouts too (a fixed port made a second run load the FIRST run's server, and so
// its code). PORT=4190 asks for that one instead (and fails if it is taken).
//   const { preview, dev } = require('./lib/serve.cjs');
//   const { server, url } = await preview();          // the built app (dist/): npm run build:bundled first
//   const { server, url } = await dev({ mode: 'bundled', server: { hmr: false } });   // the dev server, from src/
//   ... await p.goto(url) ...; await server.close();
const net = require('node:net');

const asked = () => (process.env.PORT ? { port: +process.env.PORT, strictPort: true } : { port: 0, strictPort: false });
const urlOf = (server, fallback) => {
  const u = server.resolvedUrls?.local?.[0];
  if (u) return u.endsWith('/') ? u : u + '/';
  const a = (server.httpServer || server.server)?.address?.();
  return `http://localhost:${a && typeof a === 'object' ? a.port : fallback}/`;
};
/** The built app (vite preview of dist/). o: vite preview options. */
async function preview(o = {}) {
  const vite = await import('vite');
  const server = await vite.preview({ ...o, preview: { ...asked(), ...(o.preview || {}) } });
  return { server, url: urlOf(server) };
}
/** The dev server (src/ as it is now). o: vite createServer options. */
async function dev(o = {}) {
  const vite = await import('vite');
  const server = await vite.createServer({ logLevel: 'error', ...o, server: { ...asked(), ...(o.server || {}) } });
  await server.listen();
  return { server, url: urlOf(server) };
}
/** A port nobody is using now (for a server of your own that must know its port before it starts). */
function freePort() {
  return new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
}
module.exports = { preview, dev, freePort };
