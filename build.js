/**
 * Build script for the analytics tracker.
 *
 * Uses esbuild to produce tracker.min.js as a minified IIFE.
 *
 * WHY esbuild (from research):
 * - Near-instantaneous builds (Go-based, ~100x faster than Terser)
 * - For a ~6 KB vanilla JS IIFE, the size difference vs Terser is < 50 bytes
 * - Native --format=iife support, zero config needed
 * - Single CLI command, no config file required
 *
 * Usage:
 *   node build.js
 *
 * Or equivalently via npx:
 *   npx esbuild tracker.js --bundle --minify --format=iife --outfile=tracker.min.js
 */

const { build } = require('esbuild');
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

async function run() {
  const outfile = path.join(__dirname, 'tracker.min.js');

  await build({
    entryPoints: [path.join(__dirname, 'tracker.js')],
    outfile: outfile,
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2017'],  // Target ES2017 for broad compatibility
    // No sourcemap in production to minimize served bytes.
    // Developers can build with --sourcemap for debugging.
    legalComments: 'none',
  });

  // Report sizes
  const raw = fs.readFileSync(outfile);
  const gzipped = zlib.gzipSync(raw);

  console.log('');
  console.log('✅ Build complete: tracker.min.js');
  console.log('──────────────────────────────────');
  console.log(`   Minified: ${raw.length} bytes (${(raw.length / 1024).toFixed(2)} KB)`);
  console.log(`   Gzipped:  ${gzipped.length} bytes (${(gzipped.length / 1024).toFixed(2)} KB)`);
  console.log('');

  if (gzipped.length < 1536) {
    console.log('🎯 Under 1.5 KB gzipped target — excellent!');
  } else if (gzipped.length < 2048) {
    console.log('✅ Under 2 KB gzipped — within acceptable range.');
  } else {
    console.log('⚠️  Over 2 KB gzipped — consider trimming features.');
  }
}

run().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
