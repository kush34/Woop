import * as vscode from 'vscode';

/* ================================================================
   LIGHTWEIGHT TIMING
   Per-label totals, surfaced by `woop.perf`.
================================================================ */

type Stat = { last: number; sum: number; n: number };

const stats = new Map<string, Stat>();

export function start(): number {
	return performance.now();
}

export function mark(label: string, startedAt: number): void {
	const ms = performance.now() - startedAt;
	const s = stats.get(label) ?? { last: 0, sum: 0, n: 0 };
	stats.set(label, { last: ms, sum: s.sum + ms, n: s.n + 1 });
}

export async function report(): Promise<void> {
	if (!stats.size) {
		vscode.window.showInformationMessage('Woop: no timings recorded yet — run a woop command first.');
		return;
	}

	const items = [...stats].map(([label, s]) => ({
		label,
		description: `last ${s.last.toFixed(1)} ms · avg ${(s.sum / s.n).toFixed(1)} ms · n=${s.n}`,
	}));

	await vscode.window.showQuickPick(items, { title: 'Woop — Command Timings', placeHolder: 'Measured in the extension host' });
}
