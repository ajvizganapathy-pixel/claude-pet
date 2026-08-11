/**
 * CLI for registering the companion with Claude Desktop.
 *
 *   npm run register           # add or update the entry
 *   npm run register -- --check   # show what would change, write nothing
 *   npm run register -- --remove  # take the entry out again
 *
 * A backup is written before any change, and the file is replaced atomically.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildEntry,
  configPath,
  planRegistration,
  planRemoval,
  SERVER_KEY,
  type RegistrationPlan,
} from './registration.js';

const args = new Set(process.argv.slice(2));
const check = args.has('--check');
const remove = args.has('--remove');

const appData = process.env['APPDATA'];
if (!appData) {
  console.error('APPDATA is not set; this tool is Windows-only.');
  process.exit(1);
}

const target = configPath(appData);
// Bundled as CommonJS, so __dirname points at the installed dist/mcp directory
// whatever the app was packaged into.
const serverPath = path.join(__dirname, 'server.js');

function readConfig(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return {};
    // A config we cannot parse is a config we must not overwrite.
    console.error(`Could not parse ${file}. Fix or move it before registering.`);
    process.exit(1);
  }
}

const existing = readConfig(target);
const entry = buildEntry(process.execPath, serverPath);

const plan: RegistrationPlan = remove ? planRemoval(existing) : planRegistration(existing, entry);

console.log(`Config: ${target}`);
if (plan.entry) {
  console.log(`Entry:  "${SERVER_KEY}" -> ${plan.entry.command} ${plan.entry.args.join(' ')}`);
  if (plan.entry.env) {
    const env = Object.entries(plan.entry.env).map(([k, v]) => `${k}=${v}`);
    console.log(`Env:    ${env.join(' ')}`);
  }
}
console.log(`Action: ${plan.action}`);

if (!plan.config) {
  console.log('Nothing to do.');
  process.exit(0);
}

if (check) {
  console.log('\n--check: no changes written. Resulting mcpServers would be:');
  console.log(JSON.stringify(plan.config['mcpServers'], null, 2));
  process.exit(0);
}

writeConfig(target, plan.config);
console.log('\nDone. Quit Claude Desktop from the tray and reopen it — the config is only');
console.log('read at launch, so closing the window is not enough.');

function writeConfig(file: string, config: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  if (fs.existsSync(file)) {
    const backup = `${file}.saber-backup`;
    fs.copyFileSync(file, backup);
    console.log(`Backup: ${backup}`);
  }

  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
}
