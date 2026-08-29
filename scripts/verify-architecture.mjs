import { readFile } from 'node:fs/promises';

const sourceLimits = new Map([
  ['src/App.tsx', 2_500],
]);

for (const [path, maximumLines] of sourceLimits) {
  const source = await readFile(path, 'utf8');
  const lineCount = source.split(/\r?\n/).length;
  if (lineCount > maximumLines) {
    throw new Error(`${path} has ${lineCount} lines; keep it below ${maximumLines} by extracting focused components or hooks.`);
  }
  console.log(`Verified ${path}: ${lineCount}/${maximumLines} lines.`);
}
