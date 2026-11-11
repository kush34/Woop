// Compiles the baseline (git HEAD) and the working tree so both can be
// benchmarked by run.js.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const tmp = path.join(__dirname, '.tmp');

fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(path.join(tmp, 'baseline'), { recursive: true });

const headSrc = execFileSync('git', ['show', 'HEAD:src/extension.ts'], { cwd: root, encoding: 'utf8' });
fs.writeFileSync(path.join(tmp, 'baseline', 'extension.ts'), headSrc);

const tsc = path.join(root, 'node_modules', '.bin', 'tsc');

// Baseline: single file, no perf module.
execFileSync(tsc, [
	path.join(tmp, 'baseline', 'extension.ts'),
	'--outDir', path.join(tmp, 'baseline', 'out'),
	'--module', 'node16', '--target', 'ES2022', '--strict', '--skipLibCheck',
], { cwd: root, stdio: 'inherit' });

// Working tree: normal project build.
execFileSync(tsc, ['-p', '.'], { cwd: root, stdio: 'inherit' });

for (const p of [path.join(tmp, 'baseline', 'out', 'extension.js'), path.join(root, 'out', 'extension.js')]) {
	if (!fs.existsSync(p)) throw new Error('missing build output: ' + p);
}
console.log('built baseline ->', path.join(tmp, 'baseline', 'out', 'extension.js'));
console.log('built current  ->', path.join(root, 'out', 'extension.js'));
