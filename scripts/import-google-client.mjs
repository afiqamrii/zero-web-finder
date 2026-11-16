import { readFile } from 'node:fs/promises';
import { parseGoogleClient, safeSetupMessage, saveEnvValues } from './gmail-setup.mjs';
const path = process.argv[2] || '.local/launch/google-client.json';
try {
  let json;
  try { json = JSON.parse(await readFile(path, 'utf8')); }
  catch { console.error('Could not read a valid Google client JSON file. Save the download at .local/launch/google-client.json, then try again.'); process.exit(1); }
  await saveEnvValues(parseGoogleClient(json));
  console.log('Google client imported into ignored .env.local. No secret was printed. Run npm run gmail:connect to grant access.');
} catch (error) {
  console.error(safeSetupMessage(error));
  process.exitCode = 1;
}
