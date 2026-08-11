// `npm run setup` — everything a fresh clone needs, in one command.
//
//   git clone … && cd claude-pet && npm install && npm run setup
//
// Builds, registers the MCP server with Claude Desktop, then runs the doctor so
// the result is verified rather than assumed. Safe to re-run: registration is a
// merge, and a build is idempotent.
//
// Off Windows it still builds and still reports, but skips registration — there
// is no Claude Desktop config to merge into.

import { spawn } from 'node:child_process';
import process from 'node:process';

const skipRegister = process.argv.includes('--no-register') || process.platform !== 'win32';

/** Runs a step, inheriting stdio, and resolves its exit code. */
function run(label, args) {
  console.log(`\n── ${label}\n`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', cwd: process.cwd() });
    child.on('error', (err) => {
      console.error(`  could not run ${label}: ${err.message}`);
      resolve(1);
    });
    child.on('exit', (code) => resolve(code ?? 0));
  });
}

const build = await run('Building', ['scripts/build.mjs']);
if (build !== 0) {
  console.error('\nBuild failed; stopping here. Nothing has been registered.');
  process.exit(build);
}

if (skipRegister) {
  const why =
    process.platform === 'win32'
      ? '--no-register was passed'
      : `this is ${process.platform}, and Claude Desktop registration is Windows-only`;
  console.log(`\n── Skipping registration\n\n  ${why}.`);
} else {
  // A failed registration is worth reporting but not worth aborting on: the
  // doctor run below explains it better than an exit code does.
  await run('Registering with Claude Desktop', ['dist/mcp/register.js']);
}

const doctor = await run('Checking the connection', ['dist/mcp/doctor.js']);

console.log('─'.repeat(60));
if (doctor === 0) {
  console.log(`
Setup complete.

  1. Quit Claude Desktop fully from the system tray, then reopen it.
     The config is only read at launch — closing the window is not enough.
  2. Start the companion:  npm start
  3. Ask Claude to do something real, and watch the character.

Re-run 'npm run doctor' any time the companion stops reacting.`);
} else {
  console.log(`
Setup finished with problems — see the FAIL lines above.
Fix those, then re-run: npm run doctor`);
}
console.log();
process.exit(doctor);
