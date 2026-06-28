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
    target: ['es2017'],  
    legalComments: 'none',
  });

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
