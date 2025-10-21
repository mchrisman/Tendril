import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));

const sharedConfig = {
  entryPoints: ['src/tendril-api.js'],
  bundle: true,
  sourcemap: true,
  banner: {
    js: `/**
 * Tendril v${pkg.version}
 * ${pkg.description}
 * @license ${pkg.license}
 */`
  }
};

// ESM build
await esbuild.build({
  ...sharedConfig,
  format: 'esm',
  outfile: 'dist/tendril.esm.js',
  platform: 'neutral',
  target: 'es2020'
});

// CommonJS build
await esbuild.build({
  ...sharedConfig,
  format: 'cjs',
  outfile: 'dist/tendril.cjs',
  platform: 'node',
  target: 'node16'
});

console.log('✨ Build complete!');
console.log('  → dist/tendril.esm.js (ESM)');
console.log('  → dist/tendril.cjs (CommonJS)');
