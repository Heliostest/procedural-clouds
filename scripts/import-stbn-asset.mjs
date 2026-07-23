import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRevision = 'b012ad06d858fc035d88aacfd73f092f93c994e4';
const upstreamUrl = `https://raw.githubusercontent.com/takram-design-engineering/three-geospatial/${upstreamRevision}/packages/core/assets/stbn.bin`;
const siblingSource = path.resolve(root, '..', 'three-geospatial', 'packages', 'core', 'assets', 'stbn.bin');
const requestedSource = process.env.STBN_SOURCE ? path.resolve(process.env.STBN_SOURCE) : '';
const destinationDirectory = path.join(root, 'src', 'assets');
const destination = path.join(destinationDirectory, 'stbn.bin');
const expectedBytes = 128 * 128 * 64;
const expectedSha256 = '51f52f21e5578384585050390821a0a486dcb81e11a716fa7b92fbb6515ba852';

let sourceLabel = upstreamUrl;
let data;
const localSource = requestedSource || (existsSync(siblingSource) ? siblingSource : '');
if (localSource) {
  sourceLabel = localSource;
  data = readFileSync(localSource);
} else {
  const response = await fetch(upstreamUrl);
  if (!response.ok) throw new Error(`Unable to download pinned STBN asset: HTTP ${response.status}`);
  data = Buffer.from(await response.arrayBuffer());
}
const digest = createHash('sha256').update(data).digest('hex');
if (data.byteLength !== expectedBytes || digest !== expectedSha256) {
  throw new Error(`Unexpected STBN source: bytes=${data.byteLength}, sha256=${digest}`);
}
mkdirSync(destinationDirectory, { recursive: true });
writeFileSync(destination, data);
console.log(`Imported ${data.byteLength} byte STBN asset (${digest}) from ${sourceLabel} to ${destination}`);
