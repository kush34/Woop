import * as vscode from 'vscode';
import * as path from 'path';

/* ================================================================
   TYPES
================================================================ */

type CmdState = 'idle' | 'running' | 'error';

type StoredCmd = {
	label: string;
	command: string;
	directory: string;
};

type StoredCmdMap = Record<string, StoredCmd>;

type DetectedSuggestion = {
	label: string;
	command: string;
	directory: string;
};

/* ================================================================
   FRAMEWORK DETECTION RULES
================================================================ */

type DetectionRule = {
	files: string[];           // files that must exist (any one match)
	scriptKeys?: string[];     // package.json script keys to look for
	command: string;
	labelHint: string;
};

const DETECTION_RULES: DetectionRule[] = [
	// Node / JS frameworks — script-based
	{ files: ['package.json'], scriptKeys: ['dev'], command: 'npm run dev', labelHint: 'Dev' },
	{ files: ['package.json'], scriptKeys: ['start'], command: 'npm start', labelHint: 'Start' },
	{ files: ['package.json'], scriptKeys: ['serve'], command: 'npm run serve', labelHint: 'Serve' },
	// Python
	{ files: ['manage.py'], command: 'python manage.py runserver', labelHint: 'Django' },
	{ files: ['main.py'], command: 'python main.py', labelHint: 'Python' },
	{ files: ['app.py'], command: 'python app.py', labelHint: 'Flask' },
	{ files: ['uvicorn.toml', 'pyproject.toml'], command: 'uvicorn main:app --reload', labelHint: 'FastAPI' },
	// Rust
	{ files: ['Cargo.toml'], command: 'cargo run', labelHint: 'Rust' },
	// Go
	{ files: ['go.mod'], command: 'go run .', labelHint: 'Go' },
	// Java
	{ files: ['pom.xml'], command: 'mvn spring-boot:run', labelHint: 'Spring' },
	{ files: ['build.gradle', 'build.gradle.kts'], command: './gradlew bootRun', labelHint: 'Gradle' },
	// Ruby
	{ files: ['Gemfile'], command: 'bundle exec rails server', labelHint: 'Rails' },
	// PHP
	{ files: ['artisan'], command: 'php artisan serve', labelHint: 'Laravel' },
	// Docker
	{ files: ['docker-compose.yml', 'docker-compose.yaml'], command: 'docker-compose up', labelHint: 'Docker' },
];

// Common subfolders that usually represent separate runnable services
const SERVICE_FOLDERS = [
	'backend', 'frontend', 'client', 'server',
	'api', 'web', 'app', 'services', 'worker',
];

/* ================================================================
   DETECTION HELPERS
================================================================ */

async function fileExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

async function readJson(uri: vscode.Uri): Promise<Record<string, any> | null> {
	try {
		const bytes = await vscode.workspace.fs.readFile(uri);
		return JSON.parse(Buffer.from(bytes).toString('utf8'));
	} catch {
		return null;
	}
}

async function detectCommandsInDir(dirPath: string): Promise<DetectedSuggestion[]> {
	const suggestions: DetectedSuggestion[] = [];
	const dirUri = vscode.Uri.file(dirPath);
	const folderName = path.basename(dirPath);

	// Read package.json once if exists
	const pkgUri = vscode.Uri.joinPath(dirUri, 'package.json');
	const pkg = await readJson(pkgUri);
	const pkgScripts: Record<string, string> = pkg?.scripts ?? {};

	for (const rule of DETECTION_RULES) {
		// Check if any of the rule's files exist
		let fileMatch = false;
		for (const f of rule.files) {
			if (await fileExists(vscode.Uri.joinPath(dirUri, f))) {
				fileMatch = true;
				break;
			}
		}
		if (!fileMatch) continue;

		// If rule requires specific script keys, check package.json
		if (rule.scriptKeys?.length) {
			if (!pkg) continue;
			const hasScript = rule.scriptKeys.some(k => k in pkgScripts);
			if (!hasScript) continue;
		}

		// Build label: "FolderName · LabelHint" e.g. "Backend · Dev"
		const label = `${capitalize(folderName)} · ${rule.labelHint}`;

		// Avoid duplicate commands for same dir
		if (suggestions.some(s => s.command === rule.command && s.directory === dirPath)) continue;

		suggestions.push({ label, command: rule.command, directory: dirPath });
		break; // one suggestion per directory — pick first matching rule
	}

	return suggestions;
}

async function detectAllSuggestions(rootPath: string): Promise<DetectedSuggestion[]> {
	const all: DetectedSuggestion[] = [];

	// 1. Scan root itself
	const rootSuggestions = await detectCommandsInDir(rootPath);
	all.push(...rootSuggestions);

	// 2. Scan known service subfolders
	let entries: [string, vscode.FileType][] = [];
	try {
		entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(rootPath));
	} catch {
		// no read access — skip
	}

	for (const [name, type] of entries) {
		if (type !== vscode.FileType.Directory) continue;
		if (!SERVICE_FOLDERS.includes(name.toLowerCase())) continue;

		const subPath = path.join(rootPath, name);
		const subSuggestions = await detectCommandsInDir(subPath);
		all.push(...subSuggestions);
	}

	return all;
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function labelToKey(label: string): string {
	return label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

/* ================================================================
   ACTIVATE
================================================================ */

export function activate(context: vscode.ExtensionContext) {

	/* ---------- STATE MIGRATION ---------- */
	const storedProjectDir = context.globalState.get<any>('projectDir');
	if (typeof storedProjectDir === 'string') {
		context.globalState.update('projectDir', [storedProjectDir]);
	}

	/* ---------- TERMINAL STATE MAP ---------- */
	// key = label key, value = { terminal, state }
	const terminalStateMap = new Map<string, { terminal: vscode.Terminal; state: CmdState }>();

	/* ---------- STATUS BAR (menu icon) ---------- */
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = '$(send)';
	statusBarItem.tooltip = 'Woop Menu';
	statusBarItem.command = 'woop.menu';
	statusBarItem.show();

	let statusItems: vscode.StatusBarItem[] = [];

	/* ================================================================
	   STATUS BAR ITEM RENDERER
	================================================================ */

	function getItemAppearance(state: CmdState, label: string): { text: string; tooltip: string; color?: vscode.ThemeColor } {
		switch (state) {
			case 'running':
				return {
					text: `$(stop-circle) ${label}`,
					tooltip: `${label} is running — click to stop`,
					color: new vscode.ThemeColor('terminal.ansiGreen'),
				};
			case 'error':
				return {
					text: `$(warning) ${label}`,
					tooltip: `${label} stopped/errored — click to restart`,
					color: new vscode.ThemeColor('terminal.ansiRed'),
				};
			default:
				return {
					text: `$(terminal) ${label}`,
					tooltip: `Run ${label}`,
				};
		}
	}

	function createStatusBarItems() {
		statusItems.forEach(i => i.dispose());
		statusItems = [];

		const cmds = context.globalState.get<StoredCmdMap>('woop.cmds') ?? {};

		let priority = 10;
		for (const key of Object.keys(cmds)) {
			const { label, command, directory } = cmds[key];

			const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority--);

			const entry = terminalStateMap.get(key);
			const state: CmdState = entry?.state ?? 'idle';
			const appearance = getItemAppearance(state, label);

			item.text = appearance.text;
			item.tooltip = appearance.tooltip;
			if (appearance.color) item.color = appearance.color;

			const finalCommand = directory && directory !== '/'
				? `cd "${directory}" && ${command}`
				: command;

			item.command = {
				command: 'woop.runCmd',
				title: 'Run Command',
				arguments: [finalCommand, label, key],
			};

			item.show();
			statusItems.push(item);
		}
	}

	function refreshItemForKey(key: string) {
		// Cheaper than full rebuild — just recreate all (items are cheap)
		createStatusBarItems();
	}

	/* ================================================================
	   TERMINAL LIFECYCLE TRACKING
	================================================================ */

	context.subscriptions.push(
		vscode.window.onDidCloseTerminal(closed => {
			for (const [key, entry] of terminalStateMap.entries()) {
				if (entry.terminal === closed) {
					// Only mark error if it was running (not manually stopped)
					if (entry.state === 'running') {
						terminalStateMap.set(key, { terminal: closed, state: 'error' });
					} else {
						terminalStateMap.delete(key);
					}
					refreshItemForKey(key);
					break;
				}
			}
		})
	);

	/* ================================================================
	   RUN CMD (handles idle → run, running → stop, error → restart)
	================================================================ */

	const runCmd = vscode.commands.registerCommand(
		'woop.runCmd',
		async (command: string, label: string, key: string) => {
			const entry = terminalStateMap.get(key);
			const state: CmdState = entry?.state ?? 'idle';

			if (state === 'running' && entry?.terminal) {
				// STOP: send Ctrl+C
				entry.terminal.show();
				entry.terminal.sendText('\x03'); // works on mac/linux/windows
				terminalStateMap.set(key, { terminal: entry.terminal, state: 'idle' });
				refreshItemForKey(key);
				return;
			}

			if (state === 'error' && entry?.terminal) {
				// RESTART: reuse terminal if still alive (it may be disposed)
				// Check if terminal is still in vscode.window.terminals
				const stillAlive = vscode.window.terminals.includes(entry.terminal);
				const terminal = stillAlive
					? entry.terminal
					: vscode.window.createTerminal(label);

				terminal.show();
				terminal.sendText(command);
				terminalStateMap.set(key, { terminal, state: 'running' });
				refreshItemForKey(key);
				return;
			}

			// IDLE → start fresh
			let terminal = vscode.window.terminals.find(t => t.name === label);
			if (!terminal) {
				terminal = vscode.window.createTerminal(label);
			}
			terminal.show();
			terminal.sendText(command);
			terminalStateMap.set(key, { terminal, state: 'running' });
			refreshItemForKey(key);
		}
	);

	/* ================================================================
	   SET CMD (manual add)
	================================================================ */

	const setProjectCmds = vscode.commands.registerCommand('woop.setCmd', async () => {
		const label = await vscode.window.showInputBox({ prompt: 'Status bar label', placeHolder: 'Backend' });
		if (!label) return;

		const cmd = await vscode.window.showInputBox({ prompt: 'Command to run', placeHolder: 'npm run dev' });
		if (!cmd) return;

		const dir = await vscode.window.showInputBox({
			prompt: 'Directory (absolute path or "/" for current)',
			placeHolder: '/',
		});
		if (!dir) return;

		const key = labelToKey(label);
		const existing = context.globalState.get<StoredCmdMap>('woop.cmds') ?? {};
		existing[key] = { label, command: cmd, directory: dir };
		await context.globalState.update('woop.cmds', existing);
		createStatusBarItems();
	});

	/* ================================================================
	   AUTO-DETECT + SETUP POPUP (on workspace open)
	================================================================ */

	async function runSetupFlow(roots: readonly vscode.WorkspaceFolder[]) {
		const allSuggestions: DetectedSuggestion[] = [];

		for (const folder of roots) {
			const found = await detectAllSuggestions(folder.uri.fsPath);
			allSuggestions.push(...found);
		}

		if (!allSuggestions.length) {
			// Nothing detected — offer manual setup
			const go = await vscode.window.showInformationMessage(
				'Woop: No commands auto-detected. Set up manually?',
				'Set up', 'Skip'
			);
			if (go === 'Set up') vscode.commands.executeCommand('woop.setCmd');
			return;
		}

		// Build QuickPick items from suggestions
		type SuggestionItem = vscode.QuickPickItem & { suggestion: DetectedSuggestion };
		const items: SuggestionItem[] = allSuggestions.map(s => ({
			label: s.label,
			description: s.command,
			detail: s.directory,
			picked: true, // pre-select all
			suggestion: s,
		}));

		const picked = await vscode.window.showQuickPick(items, {
			canPickMany: true,
			title: 'Woop — Detected Commands',
			placeHolder: 'Select commands to add to status bar',
		});

		if (!picked?.length) return;

		const existing = context.globalState.get<StoredCmdMap>('woop.cmds') ?? {};

		for (const item of picked) {
			const { label, command, directory } = item.suggestion;
			const key = labelToKey(label);
			existing[key] = { label, command, directory };
		}

		await context.globalState.update('woop.cmds', existing);
		createStatusBarItems();

		vscode.window.showInformationMessage(`Woop: Added ${picked.length} command(s) to status bar.`);
	}

	/* ---------- Trigger setup on workspace open (once per session) ---------- */

	const SESSION_PROMPTED_KEY = 'woop.sessionPrompted';

	async function maybePromptSetup() {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders?.length) return; // no workspace open

		// Only prompt once per session (not per saved state)
		const alreadyPrompted = context.workspaceState.get<boolean>(SESSION_PROMPTED_KEY, false);
		if (alreadyPrompted) return;

		await context.workspaceState.update(SESSION_PROMPTED_KEY, true);

		const existingCmds = context.globalState.get<StoredCmdMap>('woop.cmds') ?? {};
		const hasExisting = Object.keys(existingCmds).length > 0;

		if (hasExisting) {
			// Already configured — silently load
			createStatusBarItems();
			return;
		}

		// Small delay so VS Code UI settles before showing popup
		await new Promise(r => setTimeout(r, 1500));

		const action = await vscode.window.showInformationMessage(
			'Woop: Set up run commands for this project?',
			'Auto-detect', 'Manual', 'Skip'
		);

		if (action === 'Auto-detect') {
			await runSetupFlow(folders);
		} else if (action === 'Manual') {
			vscode.commands.executeCommand('woop.setCmd');
		}
	}

	maybePromptSetup();

	/* ================================================================
	   MENU
	================================================================ */

	const menu = vscode.commands.registerCommand('woop.menu', async () => {
		const choice = await vscode.window.showQuickPick(
			[
				{ label: '$(add) Add Command (manual)', action: 'manual' },
				{ label: '$(search) Auto-detect Commands', action: 'detect' },
				{ label: '$(trash) Remove a Command', action: 'removeCmd' },
				{ label: '$(folder-opened) Add Project Dir', action: 'add' },
				{ label: '$(folder) Remove Project Dir', action: 'remove' },
				{ label: '$(list-unordered) View Dirs', action: 'view' },
			],
			{ title: 'Woop Menu', placeHolder: 'Choose an action' }
		);

		if (!choice) return;

		switch ((choice as any).action) {
			case 'manual': vscode.commands.executeCommand('woop.setCmd'); break;
			case 'detect': {
				const folders = vscode.workspace.workspaceFolders;
				if (!folders?.length) {
					vscode.window.showErrorMessage('No workspace open');
					return;
				}
				await runSetupFlow(folders);
				break;
			}
			case 'removeCmd': vscode.commands.executeCommand('woop.removeCmd'); break;
			case 'add': vscode.commands.executeCommand('woop.dashGUI'); break;
			case 'remove': vscode.commands.executeCommand('woop.removeProjectDir'); break;
			case 'view': vscode.commands.executeCommand('woop.view'); break;
		}
	});

	/* ================================================================
	   REMOVE CMD
	================================================================ */

	const removeCmd = vscode.commands.registerCommand('woop.removeCmd', async () => {
		const cmds = context.globalState.get<StoredCmdMap>('woop.cmds') ?? {};
		const keys = Object.keys(cmds);
		if (!keys.length) {
			vscode.window.showInformationMessage('No commands saved');
			return;
		}

		const items = keys.map(k => ({ label: cmds[k].label, description: cmds[k].command, key: k }));
		const picked = await vscode.window.showQuickPick(items, {
			canPickMany: true,
			title: 'Remove Commands',
			placeHolder: 'Select commands to remove',
		});

		if (!picked?.length) return;

		for (const p of picked) {
			delete cmds[(p as any).key];
			terminalStateMap.delete((p as any).key);
		}

		await context.globalState.update('woop.cmds', cmds);
		createStatusBarItems();
	});

	/* ================================================================
	   PROJECT DIR COMMANDS (unchanged logic, kept for compatibility)
	================================================================ */

	const dashGUI = vscode.commands.registerCommand('woop.dashGUI', async () => {
		const result = await vscode.window.showOpenDialog({
			canSelectFiles: false, canSelectFolders: true,
			canSelectMany: false, openLabel: 'Select Project Folder',
		});
		if (!result?.length) return;

		const dir = result[0].fsPath;
		const existing = context.globalState.get<string[]>('projectDir', []);
		if (!existing.includes(dir)) {
			await context.globalState.update('projectDir', [...existing, dir]);
		}
	});

	const removeProjectDir = vscode.commands.registerCommand('woop.removeProjectDir', async () => {
		const dirs = context.globalState.get<string[]>('projectDir', []);
		if (!dirs.length) { vscode.window.showInformationMessage('No project directories to remove'); return; }

		const picked = await vscode.window.showQuickPick(dirs, {
			title: 'Remove Project Directory', placeHolder: 'Select a directory to remove',
		});
		if (!picked) return;

		await context.globalState.update('projectDir', dirs.filter(d => d !== picked));
		vscode.window.showInformationMessage('Project directory removed');
	});

	const viewDash = vscode.commands.registerCommand('woop.view', () => {
		const paths = context.globalState.get<string[]>('projectDir', []);
		if (!paths.length) { vscode.window.showInformationMessage('No project dirs set'); return; }
		vscode.window.showInformationMessage(paths.join('\n'));
	});

	const dash = vscode.commands.registerCommand('woop.dash', async () => {
		const roots = context.globalState.get<string[]>('projectDir', []);
		if (!roots.length) { vscode.window.showErrorMessage('No project dirs set'); return; }

		const items: (vscode.QuickPickItem & { uri?: vscode.Uri })[] = [];

		for (const root of roots) {
			const rootUri = vscode.Uri.file(root);
			try { await vscode.workspace.fs.stat(rootUri); } catch { continue; }

			items.push({ label: rootUri.path.split('/').pop() ?? root, kind: vscode.QuickPickItemKind.Separator });

			const entries = await vscode.workspace.fs.readDirectory(rootUri);
			for (const [name, type] of entries) {
				if (type !== vscode.FileType.Directory) continue;
				items.push({ label: name, description: root, uri: vscode.Uri.joinPath(rootUri, name) });
			}
		}

		const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a project' });
		if (!picked?.uri) return;

		await vscode.commands.executeCommand('vscode.openFolder', picked.uri, false);
	});

	const setDash = vscode.commands.registerCommand('woop.setDash', async () => {
		const input = await vscode.window.showInputBox({ placeHolder: 'Paste absolute project directory path' });
		if (!input?.trim()) return;

		const existing = context.globalState.get<string[]>('projectDir', []);
		if (!existing.includes(input.trim())) {
			await context.globalState.update('projectDir', [...existing, input.trim()]);
		}
		vscode.window.showInformationMessage('Project directory set');
	});

	/* ================================================================
	   SUBSCRIPTIONS
	================================================================ */

	context.subscriptions.push(
		statusBarItem,
		setProjectCmds,
		dashGUI,
		removeProjectDir,
		viewDash,
		dash,
		menu,
		setDash,
		runCmd,
		removeCmd,
	);

	createStatusBarItems();
}

export function deactivate() { }