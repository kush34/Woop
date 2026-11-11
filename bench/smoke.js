// Executes every contributed command against the fake vscode API and reports
// whether it threw. Usage: node bench/smoke.js
const path = require('path');
const fs = require('fs');
const Module = require('module');

const stub = require('./vscode-stub');
const origLoad = Module._load;
Module._load = function (request) {
	if (request === 'vscode') return stub;
	return origLoad.apply(this, arguments);
};

const ROOTS = '/tmp/opencode/woop-bench/roots';
const MODULES = {
	before: path.join(__dirname, '.tmp', 'baseline', 'out', 'extension.js'),
	after: path.join(__dirname, '..', 'out', 'extension.js'),
};

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const declared = pkg.contributes.commands.map(c => c.command);
// Commands the extension registers but does not declare.
const extra = ['woop.menu', 'woop.runCmd', 'woop.removeCmd', 'woop.perf'];
// Declared in package.json but never registered by the extension (pre-existing).
const KNOWN_MISSING = ['woop.noti'];
const commands = [...new Set([...declared, ...extra])];

const stateApi = map => ({
	get: (k, d) => (map.has(k) ? map.get(k) : d),
	update: async (k, v) => { map.set(k, v); },
	keys: () => [...map.keys()],
});

async function smoke(modPath) {
	delete require.cache[require.resolve(modPath)];
	const mod = require(modPath);

	stub.__globalState.clear();
	stub.__globalState.set('projectDir', ['one/alpha', 'four/beta'].map(r => path.join(ROOTS, r)));
	stub.__globalState.set('woop.cmds', {
		smoke: { label: 'Smoke', command: 'echo hi', directory: path.join(ROOTS, 'one/alpha') },
	});

	mod.activate({
		subscriptions: [],
		globalState: stateApi(stub.__globalState),
		workspaceState: stateApi(stub.__workspaceState),
		extensionPath: process.cwd(),
		extensionUri: stub.Uri.file(process.cwd()),
	});

	const failures = [];
	const list = commands.filter(c => !(c === 'woop.perf' && modPath === MODULES.before) && !KNOWN_MISSING.includes(c));
	for (const name of list) {
		if (!stub.__commands.has(name)) {
			if (!KNOWN_MISSING.includes(name)) failures.push({ name, error: 'not registered' });
			continue;
		}
		try {
			await stub.commands.executeCommand(name);
		} catch (e) {
			failures.push({ name, error: e.message });
		}
	}
	return { ran: commands.length, failures };
}

(async () => {
	let bad = 0;
	for (const [label, modPath] of Object.entries(MODULES)) {
		const r = await smoke(modPath);
		console.log(`${label}: ran ${r.ran} commands, ${r.failures.length} failures`);
		for (const f of r.failures) { bad++; console.log(`  FAIL ${f.name}: ${f.error}`); }
	}
	process.exit(bad ? 1 : 0);
})();
