import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const assetsDirectory = path.resolve('dist', 'assets');
const assetFiles = (await readdir(assetsDirectory))
  .filter((file) => file.endsWith('.js'));

const forbiddenPatterns = [
  'GEMINI_API_KEY',
  // Production mode defines the Preview-only value as empty. A real-looking
  // Google API key in a production bundle is always a release blocker.
  'AIzaSy',
];

for (const file of assetFiles) {
  const source = await readFile(path.join(assetsDirectory, file), 'utf8');
  for (const pattern of forbiddenPatterns) {
    if (source.includes(pattern)) {
      throw new Error(`Client bundle ${file} unexpectedly contains ${pattern}.`);
    }
  }
}

console.log(`Verified ${assetFiles.length} client bundles: no Gemini credential value found.`);
