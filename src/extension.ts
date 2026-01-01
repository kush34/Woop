import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	console.log('dash extension activated');

	// SET PROJECT DIR
	const setDash = vscode.commands.registerCommand('dash.setDash', async () => {
		const input = await vscode.window.showInputBox({
			placeHolder: 'Paste absolute project directory path'
		});

		if (!input || !input.trim()) return;

		await context.globalState.update('projectDir', input.trim());
		vscode.window.showInformationMessage('Project directory set');
	});

	// VIEW CURRENT DIR
	const viewDash = vscode.commands.registerCommand('dash.view', () => {
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
	const dash = vscode.commands.registerCommand('dash.dash', async () => {
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

	context.subscriptions.push(setDash, viewDash, dash);

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

export function deactivate() {}
