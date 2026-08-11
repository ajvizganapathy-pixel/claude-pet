// Printed after `npm install`. It says what to do next and does nothing else.
//
// Deliberately not a build, and emphatically not a registration: writing to the
// user's `claude_desktop_config.json` is a change to another application's
// configuration, and `npm install` is not consent for that. `npm run setup`
// asks for it explicitly.
//
// Never fails the install — a broken hint must not break a dependency tree.

import process from 'node:process';

// Quiet in CI and in anything installing this as a dependency: the message is
// for a human who just cloned the repo.
const noise = process.env['CI'] || process.env['npm_config_global'];
if (!noise) {
  const windows = process.platform === 'win32';
  console.log(`
  claude-pet installed.

    npm run setup     build, register with Claude Desktop, and verify${
      windows ? '' : `\n                      (registration is skipped on ${process.platform})`
    }
    npm run doctor    check the Claude Desktop -> companion chain
    npm start         run the companion
`);
}

process.exitCode = 0;
