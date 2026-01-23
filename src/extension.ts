import * as vscode from 'vscode';

type StoredCmd = {
	label: string;
	command: string;
	directory: string;
};

type StoredCmdMap = Record<string, StoredCmd>;

export function activate(context: vscode.ExtensionContext) {
	console.log('woop extension activated');

	/* ------------------ STATE MIGRATION ------------------ */

	const storedProjectDir = context.globalState.get<any>('projectDir');
	if (typeof storedProjectDir === 'string') {
		context.globalState.update('projectDir', [storedProjectDir]);
	}

	/* ------------------ STATUS BAR MENU ------------------ */

	const statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		100
	);

	statusBarItem.text = '$(send)';
	statusBarItem.tooltip = 'Woop Menu';
	statusBarItem.command = 'woop.menu';
	statusBarItem.show();

	let statusItems: vscode.StatusBarItem[] = [];

	/* ------------------ SET STATUS COMMAND ------------------ */

	const setProjectCmds = vscode.commands.registerCommand(
		'woop.setCmd',
		async () => {
			const label = await vscode.window.showInputBox({
				prompt: 'Status bar label',
				placeHolder: 'Backend',
			});
			if (!label) return;

			const cmd = await vscode.window.showInputBox({
				prompt: 'Command to run',
				placeHolder: 'npm run dev',
			});
			if (!cmd) return;

			const dir = await vscode.window.showInputBox({
				prompt:
					'Directory to run command in (absolute path or "/" for current)',
				placeHolder: '/',
			});
			if (!dir) return;

			const key = label.toLowerCase().replace(/\s+/g, '_');

			const existing =
				context.globalState.get<StoredCmdMap>('woop.cmds') ?? {};

			existing[key] = { label, command: cmd, directory: dir };

			await context.globalState.update('woop.cmds', existing);
			createStatusBarItems();
		}
	);

	/* ------------------ STATUS BAR ITEMS ------------------ */

	function createStatusBarItems() {
		statusItems.forEach(i => i.dispose());
		statusItems = [];

		const cmds =
			context.globalState.get<StoredCmdMap>('woop.cmds') ?? {};

		for (const key of Object.keys(cmds)) {
			const { label, command, directory } = cmds[key];

			const item = vscode.window.createStatusBarItem(
				vscode.StatusBarAlignment.Left
			);

			item.text = `$(terminal) ${label}`;
			item.tooltip = command;

			const finalCommand =
				directory && directory !== '/'
					? `cd "${directory}" && ${command}`
					: command;

			item.command = {
				command: 'woop.runCmd',
				title: 'Run Command',
				arguments: [finalCommand, label],
			};

			item.show();
			statusItems.push(item);
		}
	}

	/* ------------------ RUN CMD ------------------ */

	const runCmd = vscode.commands.registerCommand(
		'woop.runCmd',
		async (command: string, label: string) => {
			let terminal = vscode.window.terminals.find(
				t => t.name === label
			);

			if (!terminal) {
				terminal = vscode.window.createTerminal(label);
			}

			terminal.show();
			terminal.sendText(command);
		}
	);

	/* ------------------ MENU ------------------ */

	const menu = vscode.commands.registerCommand('woop.menu', async () => {
		const choice = await vscode.window.showQuickPick(
			[
				{ label: '➕ Add Project Directory', action: 'add' },
				{ label: '➖ Remove Project Directory', action: 'remove' },
				{ label: '📋 View Project Directories', action: 'view' },
			],
			{
				title: 'Woop Menu',
				placeHolder: 'Choose an action',
			}
		);

		if (!choice) return;

		switch (choice.action) {
			case 'add':
				vscode.commands.executeCommand('woop.dashGUI');
				break;
			case 'remove':
				vscode.commands.executeCommand('woop.removeProjectDir');
				break;
			case 'view':
				vscode.commands.executeCommand('woop.view');
				break;
		}
	});

	/* ------------------ ADD PROJECT DIR (GUI) ------------------ */

	const dashGUI = vscode.commands.registerCommand(
		'woop.dashGUI',
		async () => {
			const result = await vscode.window.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				openLabel: 'Select Project Folder',
			});

			if (!result?.length) return;

			const dir = result[0].fsPath;
			const existing = context.globalState.get<string[]>(
				'projectDir',
				[]
			);

			if (!existing.includes(dir)) {
				await context.globalState.update('projectDir', [
					...existing,
					dir,
				]);
			}
		}
	);

	/* ------------------ REMOVE PROJECT DIR ------------------ */

	const removeProjectDir = vscode.commands.registerCommand(
		'woop.removeProjectDir',
		async () => {
			const dirs = context.globalState.get<string[]>(
				'projectDir',
				[]
			);

			if (!dirs.length) {
				vscode.window.showInformationMessage(
					'No project directories to remove'
				);
				return;
			}

			const picked = await vscode.window.showQuickPick(dirs, {
				title: 'Remove Project Directory',
				placeHolder: 'Select a directory to remove',
			});

			if (!picked) return;

			const updated = dirs.filter(d => d !== picked);
			await context.globalState.update('projectDir', updated);

			vscode.window.showInformationMessage(
				'Project directory removed'
			);
		}
	);

	/* ------------------ VIEW DIRS ------------------ */

	const viewDash = vscode.commands.registerCommand(
		'woop.view',
		() => {
			const paths = context.globalState.get<string[]>(
				'projectDir',
				[]
			);

			if (!paths.length) {
				vscode.window.showInformationMessage(
					'No project dirs set'
				);
				return;
			}

			vscode.window.showInformationMessage(
				paths.join('\n')
			);
		}
	);

	/* ------------------ DASH PICKER ------------------ */

	const dash = vscode.commands.registerCommand('woop.dash', async () => {
		const roots = context.globalState.get<string[]>(
			'projectDir',
			[]
		);

		if (!roots.length) {
			vscode.window.showErrorMessage(
				'No project dirs set'
			);
			return;
		}

		const items: (vscode.QuickPickItem & {
			uri?: vscode.Uri;
		})[] = [];

		for (const root of roots) {
			const rootUri = vscode.Uri.file(root);

			try {
				await vscode.workspace.fs.stat(rootUri);
			} catch {
				continue;
			}

			const title = rootUri.path.split('/').pop() ?? root;

			items.push({
				label: title,
				kind: vscode.QuickPickItemKind.Separator,
			});

			const entries =
				await vscode.workspace.fs.readDirectory(rootUri);

			for (const [name, type] of entries) {
				if (type !== vscode.FileType.Directory) continue;

				items.push({
					label: name,
					description: root,
					uri: vscode.Uri.joinPath(rootUri, name),
				});
			}
		}

		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select a project',
		});

		if (!picked?.uri) return;

		await vscode.commands.executeCommand(
			'vscode.openFolder',
			picked.uri,
			false
		);
	});

	/* ------------------ SUBSCRIPTIONS ------------------ */

	context.subscriptions.push(
		statusBarItem,
		setProjectCmds,
		dashGUI,
		removeProjectDir,
		viewDash,
		dash,
		menu,
		runCmd
	);

	createStatusBarItems();
}

export function deactivate() {}
