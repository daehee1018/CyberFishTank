import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

export function pwaBuild(): Plugin {
  let outDir: string;
  let root: string;
  return {
    name: 'cyberfishtank-pwa',
    apply: 'build',
    configResolved(config) { root = config.root; outDir = resolve(root, config.build.outDir); },
    writeBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter(file => /\.(js|css)$/.test(file)).map(file => `/${file}`);
      const publicAssets = ['/offline.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-192.png', '/icons/icon-maskable-512.png', '/fonts/PretendardVariable.woff2'];
      const hash = createHash('sha256');
      const template = readFileSync(resolve(root, 'public/sw.js'), 'utf8');
      hash.update(template);
      for (const file of [...assets, ...publicAssets, '/index.html']) hash.update(readFileSync(resolve(outDir, file.slice(1))));
      const version = hash.digest('hex').slice(0, 16);
      const worker = template.replace("const VERSION = 'development';", `const VERSION = '${version}';`)
        .replace("const PRECACHE = ['/offline.html', '/icons/icon-192.png'];", `const PRECACHE = ${JSON.stringify([...assets, ...publicAssets])};`);
      writeFileSync(resolve(outDir, 'sw.js'), worker);
      writeFileSync(resolve(outDir, 'pwa-version.json'), JSON.stringify({ version }));
    },
  };
}
