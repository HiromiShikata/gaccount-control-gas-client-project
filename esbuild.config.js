const { build } = require('esbuild');
const { GasPlugin } = require('esbuild-gas-plugin');
const fs = require('fs');
const path = require('path');

build({
  entryPoints: ['src/Code.ts'],
  bundle: true,
  outfile: 'dist/Code.js',
  format: 'iife',
  platform: 'node',
  target: 'es2019',
  plugins: [GasPlugin],
})
  .then(() => {
    const distDir = path.join(__dirname, 'dist');
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    fs.copyFileSync(
      path.join(__dirname, 'src', 'appsscript.json'),
      path.join(distDir, 'appsscript.json'),
    );
  })
  .catch((error) => {
    console.error('Bundle failed:', error);
    process.exit(1);
  });
