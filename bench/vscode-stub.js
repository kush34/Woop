// Minimal fake `vscode` module so the real extension can run under plain Node.
// File I/O goes to the real fs with an artificial per-call delay that models
// the extension-host <-> file-service round trip (WOOP_RPC_MS).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

let RPC_MS = Number(process.env.WOOP_RPC_MS ?? 0);const bench = {
	now: () => performance.now(),
	pickerShownAt: null,
	itemsReadyAt: null,
	opened: null,
	autoAccept: true,
	reset() { this.pickerShownAt = null; this.itemsReadyAt = null; this.opened = null; },
};

const rpc = () => (RPC_MS > 0 ? new Promise(r => setTimeout(r, RPC_MS)) : Promise.resolve());

const makeUri = p => ({ fsPath: p, path: p, scheme: 'file', toString: () => 'file://' + p });
const Uri = {
	file: makeUri,
	joinPath: (base, ...parts) => makeUri(path.join(base.fsPath, ...parts)),
};

const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 };

const globalState = new Map();
const workspaceState = new Map();

const commands = new Map();

class QuickPick {
	constructor() {
		this._items = [];
		this._itemsListeners = [];
		this._accept = [];
		this._hide = [];
		this._buttons = [];
		this.selectedItems = [];
		this.busy = false;
		this.visible = false;
		this.placeholder = '';
		this._accepted = false;
	}
	get items() { return this._items; }
	set items(v) {
		this._items = v;
		bench.itemsReadyAt = bench.now();
		this._itemsListeners.forEach(f => f(v));
		if (bench.autoAccept && !this._accepted) setTimeout(() => this.accept(), 0);
	}
	show() { this.visible = true; bench.pickerShownAt = bench.now(); }
	hide() { this.visible = false; this._hide.forEach(f => f()); }
	dispose() { this.hide(); }
	onDidAccept(f) { this._accept.push(f); return { dispose() {} }; }
	onDidHide(f) { this._hide.push(f); return { dispose() {} }; }
	onDidTriggerButton(f) { this._buttons.push(f); return { dispose() {} }; }
	onDidChangeValue() { return { dispose() {} }; }
	onDidChangeActive() { return { dispose() {} }; }
	onDidChangeSelection() { return { dispose() {} }; }
	accept() {
		if (this._accepted) return;
		this._accepted = true;
		this.selectedItems = this._items.length ? [this._items[0]] : [];
		this._accept.forEach(f => f());
	}
	triggerButton(i) { this._buttons.forEach(f => f(i)); }
}

const dispose = () => ({ dispose() {} });
const statusBarItem = () => ({ show() {}, hide() {}, dispose() {}, text: '', tooltip: '', command: undefined, color: undefined });

const window = {
	createStatusBarItem: statusBarItem,
	createTerminal: () => ({ show() {}, sendText() {}, dispose() {}, name: 't' }),
	onDidCloseTerminal: dispose,
	terminals: [],
	showInformationMessage: async () => undefined,
	showErrorMessage: async () => undefined,
	showInputBox: async () => undefined,
	showOpenDialog: async () => undefined,
	createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, dispose() {} }),
	showQuickPick: async (items, opts) => {
		bench.pickerShownAt = bench.now();
		bench.itemsReadyAt = bench.pickerShownAt;
		const list = await items;
		if (opts && opts.canPickMany) return list;
		return list.find(i => i.uri) ?? list[0];
	},
	createQuickPick: () => new QuickPick(),
};

module.exports = {
	Uri,
	FileType,
	workspace: {
		fs: {
			stat: async uri => { await rpc(); await fsp.stat(uri.fsPath); return {}; },
			readFile: async uri => { await rpc(); return fsp.readFile(uri.fsPath); },
			readDirectory: async uri => {
				await rpc();
				const entries = await fsp.readdir(uri.fsPath, { withFileTypes: true });
				return entries.map(e => [e.name, e.isDirectory() ? FileType.Directory : FileType.File]);
			},
		},
		workspaceFolders: undefined,
	},
	window,
	commands: {
		registerCommand: (name, fn) => { commands.set(name, fn); return dispose(); },
		executeCommand: async (name, ...args) => {
			if (name === 'vscode.openFolder') { bench.opened = args[0]; return; }
			const fn = commands.get(name);
			return fn ? fn(...args) : undefined;
		},
		getCommands: async () => [...commands.keys()],
	},
	StatusBarAlignment: { Left: 1, Right: 2 },
	ThemeColor: class { constructor(id) { this.id = id; } },
	ThemeIcon: class { constructor(id) { this.id = id; } },
	QuickPickItemKind: { Separator: -1, Default: 0 },
	__bench: bench,
	__commands: commands,
	__resetGlobalState: () => globalState.clear(),
	__globalState: globalState,
	__workspaceState: workspaceState,
	__setRpc: ms => { RPC_MS = ms; },
};
