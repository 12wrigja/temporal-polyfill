/**
 * @fileoverview Validate the build outputs have reasonably useful sourcemaps
 */
import sourcemapValidate from 'sourcemap-validator';

import * as fs from 'fs/promises';

const UTF8 = {encoding: 'utf-8'} as const;

async function validate(file: string) {
  const [jsFileContent, sourceMapFileContent] = await Promise.all([
      fs.readFile(file, UTF8),
      fs.readFile(file + '.map', UTF8),
  ]);
  try {
    sourcemapValidate(jsFileContent, sourceMapFileContent);
  } catch (e) {
    console.log(`Validation for ${file} failed: `, e);
    return;
  }
  console.log(`Validation for ${file} succeeded.`);
}

await validate('../dist/index.esm.js');
await validate('../dist/index.cjs');
await validate('../dist/index.umd.js');