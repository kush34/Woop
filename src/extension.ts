import * as vscode from 'vscode';

type StoredCmd = {
	label: string;
	command: string;
	directory: string;
};

type StoredCmdMap = Record<string, StoredCmd>;


export function activate(context: vscode.ExtensionContext) {
	console.log('dash extension activated');

	const statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		100
	);

	statusBarItem.text = "$(send)";
	statusBarItem.tooltip = "Click me";
	statusBarItem.command = "woop.menu";
	statusBarItem.show();

	let statusItems: vscode.StatusBarItem[] = [];

	const setProjectCmds = vscode.commands.registerCommand(
		"woop.setCmd",
		async () => {
			const label = await vscode.window.showInputBox({
				prompt: "Status bar label",
				placeHolder: "Backend",
			});

			if (!label) return;

			const cmd = await vscode.window.showInputBox({
				prompt: "Command to run",
				placeHolder: "npm run dev",
			});

			if (!cmd) return;

			const dir = await vscode.window.showInputBox({
				prompt: "Choose the project dir inside which to run the cmd or / for current lvl",
				placeHolder: "/"
			})
			if (!dir) return;

			const key = label.toLowerCase().replace(/\s+/g, "_");

			const existing =
				context.globalState.get<StoredCmdMap>("woop.cmds") ?? {};

			existing[key] = {
				label,
				command: cmd,
				directory: dir
			};

			await context.globalState.update("woop.cmds", existing);

			vscode.window.showInformationMessage(
				`Command "${label}" added to status bar`
			);

			createStatusBarItems(context);
		}
	);

	function createStatusBarItems(context: vscode.ExtensionContext) {
		statusItems.forEach(i => i.dispose());
		statusItems = [];

		const cmds =
			context.globalState.get<StoredCmdMap>("woop.cmds") ?? {};

		for (const key of Object.keys(cmds)) {
			const { label, command, directory } = cmds[key];

			const item = vscode.window.createStatusBarItem(
				vscode.StatusBarAlignment.Left
			);

			item.text = `$(terminal) ${label}`;
			item.tooltip = command;

			// build final shell command ONCE
			const finalCommand =
				directory && directory !== "/"
					? `cd "${directory}" && ${command}`
					: command;

			item.command = {
				command: "woop.runCmd",
				title: "Run Command",
				arguments: [finalCommand],
			};

			item.show();
			statusItems.push(item);
		}
	}


	const runCmd = vscode.commands.registerCommand(
		"woop.runCmd",
		async (command: string, label: string) => {
		let terminal = vscode.window.terminals.find(t => t.name === label);

			if (!terminal) {
				terminal = vscode.window.createTerminal(label);
			}

			terminal.show();
			terminal.sendText(command);
		}
	);

	const menu = vscode.commands.registerCommand("woop.menu", async () => {
		const choice = await vscode.window.showQuickPick(
			[
				{
					label: "📂 Select Project Directory",
					description: "Set project folder",
					action: "dashGUI",
				},
				{
					label: "▶ view project Dir",
					description: "Notifys you the path for project dir set",
					action: "view",
				},
			],
			{
				title: "Woop Menu",
				placeHolder: "Choose an action",
			}
		);

		if (!choice) return; 
		switch (choice.action) {
			case "dashGUI":
				vscode.commands.executeCommand("woop.dashGUI");
				break;
			case "view":
				vscode.commands.executeCommand("woop.view");
				break;
		}
	});

	const dashGUI = vscode.commands.registerCommand('woop.dashGUI', async () => {
		const result = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: "Select Project Folder",
		});

		// user cancelled → do nothing
		if (!result || result.length === 0) return;

		const projectDir = result[0].fsPath;

		await context.globalState.update("projectDir", projectDir);

		vscode.window.showInformationMessage(
			`Project directory set: ${projectDir}`
		);
	})
	// SET PROJECT DIR
	const setDash = vscode.commands.registerCommand('woop.setDash', async () => {
		const input = await vscode.window.showInputBox({
			placeHolder: 'Paste absolute project directory path'
		});

		if (!input || !input.trim()) return;

		await context.globalState.update('projectDir', input.trim());
		vscode.window.showInformationMessage('Project directory set');
	});
	const noti = vscode.commands.registerCommand('woop.noti', async () => {
		vscode.window.showInformationMessage('Workinggggggggg');
	});

	// VIEW CURRENT DIR
	const viewDash = vscode.commands.registerCommand('woop.view', () => {
		const path = context.globalState.get<string>('projectDir');

		if (!path) {
			vscode.window.showInformationMessage(
				'No project dir set. Run "dash.setDash" first.'
			);
			return;
		}

		vscode.window.showInformationMessage(`Current Dir: ${path}`);
	});

	// MAIN COMMAND
	const dash = vscode.commands.registerCommand('woop.dash', async () => {
		const path = context.globalState.get<string>('projectDir');

		if (!path) {
			vscode.window.showErrorMessage(
				'No project dir set. Run "dash.setDash" first.'
			);
			return;
		}

		const baseUri = vscode.Uri.file(path);

		// validate path exists
		try {
			await vscode.workspace.fs.stat(baseUri);
		} catch {
			vscode.window.showErrorMessage('Stored path does not exist');
			return;
		}

		const folderUri = await pickDirectory(baseUri);
		if (!folderUri) return;

		await openFolderInCurrentWindow(folderUri);
	});

	context.subscriptions.push(setDash, viewDash, dash, runCmd);

	/* ------------ helpers ------------ */

	async function readDirectories(baseUri: vscode.Uri) {
		const entries = await vscode.workspace.fs.readDirectory(baseUri);
		return entries
			.filter(([_, type]) => type === vscode.FileType.Directory)
			.map(([name]) => name);
	}

	async function pickDirectory(baseUri: vscode.Uri) {
		const dirs = await readDirectories(baseUri);

		if (!dirs.length) {
			vscode.window.showWarningMessage('No folders found');
			return;
		}

		const selected = await vscode.window.showQuickPick(dirs, {
			placeHolder: 'Select a folder to open'
		});

		if (!selected) return;

		return vscode.Uri.joinPath(baseUri, selected);
	}

	async function openFolderInCurrentWindow(folderUri: vscode.Uri) {
		await vscode.commands.executeCommand(
			'vscode.openFolder',
			folderUri,
			false
		);
	}
}

export function deactivate() { }
