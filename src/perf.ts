import * as vscode from 'vscode';

/* ================================================================
   LIGHTWEIGHT TIMING
   In-memory ring buffer of command timings, surfaced by `woop.perf`.
================================================================ */

type Sample = { label: string; ms: number };

const MAX_SAMPLES = 200;
const samples: Sample[] = [];

export function start(): number {
	return performance.now();
}

export function mark(label: string, startedAt: number): void {
	samples.push({ label, ms: performance.now() - startedAt });
	if (samples.length > MAX_SAMPLES) {
		samples.shift();
	}
}

export async function report(): Promise<void> {
	if (!samples.length) {
		vscode.window.showInformationMessage('Woop: no timings recorded yet — run a woop command first.');
		return;
	}

	const byLabel = new Map<string, number[]>();
	for (const s of samples) {
		const list = byLabel.get(s.label) ?? [];
		list.push(s.ms);
		byLabel.set(s.label, list);
	}

	const items = [...byLabel].map(([label, times]) => ({
		label,
		description: `last ${times[times.length - 1].toFixed(1)} ms · avg ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)} ms · n=${times.length}`,
	}));

	await vscode.window.showQuickPick(items, { title: 'Woop — Command Timings', placeHolder: 'Measured in the extension host' });
}
