// Runs the real extension commands against the fake vscode API and records
// black-box timings. Usage: node bench/run.js [--json out.json]
const path = require('path');
const Module = require('module');

const stub = require('./vscode-stub');
const bench = stub.__bench;

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

const FOUR = ['four/alpha', 'four/beta', 'four/gamma', 'four/delta'];
const SCENARIOS = [
	{ id: '1root-local', label: '1 root · 2,000 dirs · local SSD', rpc: 0.5, roots: ['one/alpha'] },
	{ id: '4root-local', label: '4 roots · 6,000 dirs · local SSD', rpc: 0.5, roots: FOUR },
	{ id: '4root-slow', label: '4 roots · 6,000 dirs · 15 ms per file-service call', rpc: 15, roots: FOUR },
];
const ITERATIONS = 15;
const median = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

const stateApi = map => ({
	get: (k, d) => (map.has(k) ? map.get(k) : d),
	update: async (k, v) => { map.set(k, v); },
	keys: () => [...map.keys()],
});

async function loadModule(modPath) {
	delete require.cache[require.resolve(modPath)];
	return require(modPath);
}

async function activateFresh(modPath, rootPaths) {
	const mod = await loadModule(modPath);
	stub.__resetGlobalState();
	stub.__workspaceState.clear();
	stub.__globalState.set('projectDir', rootPaths);
	bench.reset();
	mod.activate({
		subscriptions: [],
		globalState: stateApi(stub.__globalState),
		workspaceState: stateApi(stub.__workspaceState),
		extensionPath: process.cwd(),
		extensionUri: stub.Uri.file(process.cwd()),
	});
	return mod;
}

async function runCommand(name, roots) {
	bench.reset();
	const t0 = bench.now();
	await stub.commands.executeCommand(name);
	return {
		total: bench.now() - t0,
		visible: bench.pickerShownAt === null ? null : bench.pickerShownAt - t0,
		items: bench.itemsReadyAt === null ? null : bench.itemsReadyAt - t0,
	};
}

async function measureVersion(modPath, scenario) {
	const roots = scenario.roots.map(r => path.join(ROOTS, r));
	stub.__setRpc(scenario.rpc);

	const coldDash = [];
	const warmDash = [];
	const coldNext = [];
	const warmNext = [];

	for (let i = 0; i < ITERATIONS; i++) {
		let mod = await activateFresh(modPath, roots);
		coldDash.push(await runCommand('woop.dash', roots));
		warmDash.push(await runCommand('woop.dash', roots));

		mod = await activateFresh(modPath, roots);
		coldNext.push((await runCommand('woop.nextProject', roots)).total);
		warmNext.push((await runCommand('woop.nextProject', roots)).total);
	}

	return {
		dash: {
			coldVisible: median(coldDash.map(r => r.visible)),
			coldItems: median(coldDash.map(r => r.items)),
			coldTotal: median(coldDash.map(r => r.total)),
			warmVisible: median(warmDash.map(r => r.visible)),
			warmItems: median(warmDash.map(r => r.items)),
			warmTotal: median(warmDash.map(r => r.total)),
		},
		nextProject: { cold: median(coldNext), warm: median(warmNext) },
	};
}

(async () => {
	const results = { scenarios: [], meta: { iterations: ITERATIONS, measuredAt: new Date().toISOString() } };

	for (const scenario of SCENARIOS) {
		const before = await measureVersion(MODULES.before, scenario);
		const after = await measureVersion(MODULES.after, scenario);
		results.scenarios.push({ id: scenario.id, label: scenario.label, rpc: scenario.rpc, roots: scenario.roots.length, before, after });
		console.log(scenario.label);
		console.table({ before: flatten(before), after: flatten(after) });
	}

	const out = path.join(__dirname, 'results.json');
	require('fs').writeFileSync(out, JSON.stringify(results, null, 2));
	console.log('wrote', out);
	process.exit(0);
})();

function flatten(r) {
	return {
		'dash picker visible (ms)': r.dash.coldVisible,
		'dash items ready (ms)': r.dash.coldItems,
		'dash total (ms)': r.dash.coldTotal,
		'dash warm total (ms)': r.dash.warmTotal,
		'nextProject cold (ms)': r.nextProject.cold,
		'nextProject warm (ms)': r.nextProject.warm,
	};
}
