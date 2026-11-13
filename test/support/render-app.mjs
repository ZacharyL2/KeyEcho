import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath } from 'node:url';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { createServer } from 'vite';
import solid from 'vite-plugin-solid';

// Usage: render-app.mjs [fixture]. A fixture is a root-relative .tsx module
// whose `render()` resolves to the string printed on stdout; without one the
// whole App is rendered.
const fixture = process.argv[2];
const harnessId = '/__app_render.tsx';
globalThis.window = { setTimeout, clearTimeout };
// Sheet cleanup checks `instanceof HTMLElement`; there is no DOM here.
globalThis.HTMLElement = function HTMLElement() {};
globalThis.fetch = async () =>
  new Response(JSON.stringify({ schemaVersion: 2, packs: [] }));
const server = await createServer({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [
    {
      name: 'app-render-fixture',
      enforce: 'pre',
      resolveId(id) {
        if (id.endsWith('/services/bindings') || id === './services/bindings')
          return '\0app-commands.ts';
        return id === harnessId ? id : null;
      },
      load(id) {
        if (id === '\0app-commands.ts')
          return `
          export const commands = {
            getSounds: async () => ({ status: 'ok', data: [] }),
            getSelectedSound: async () => ({ status: 'ok', data: null }),
            openExternalUrl: async () => ({ status: 'ok', data: null }),
          };
        `;
        if (id !== harnessId) return null;
        return `
          import { renderToStringAsync } from 'solid-js/web';
          import App from '/src/App';
          export const render = () => renderToStringAsync(() => <App />, { timeoutMs: 5000 });
        `;
      },
    },
    vanillaExtractPlugin(),
    solid({ ssr: true, dev: false }),
  ],
});
let html;
try {
  const { RequestContext } = await import('solid-js/web');
  globalThis[RequestContext] = new AsyncLocalStorage();
  const { render } = await server.ssrLoadModule(fixture ?? harnessId);
  html = await globalThis[RequestContext].run({}, render);
  if (typeof html !== 'string' || html.length === 0)
    throw new Error('App did not render');
} finally {
  await server.close();
}
process.stdout.write(html, () => process.exit(0));
