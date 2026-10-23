const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const children = [];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      ...options,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${signal || code}`));
    });
  });
}

async function start() {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run this launcher with "npm run dev" from the repository root.');

  console.log('Starting PostgreSQL with Docker Compose...');
  await run('docker', ['compose', 'up', '-d', '--wait', 'db']);
  console.log('Starting the API and web app...');

  for (const directory of ['backend', 'frontend']) {
    const child = spawn(process.execPath, [npmCli, 'run', 'dev'], {
      cwd: path.join(root, directory),
      stdio: 'inherit',
    });
    children.push(child);
    child.once('error', (error) => {
      console.error(`Could not start ${directory}:`, error);
      stop(1);
    });
    child.once('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`${directory} stopped with exit code ${code}`);
        stop(code);
      }
    });
  }
}

function stop(exitCode = 0) {
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exitCode = exitCode;
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));

start().catch((error) => {
  console.error('Could not start Pitch development environment:', error.message);
  process.exitCode = 1;
});
