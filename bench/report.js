// Renders bench/results.json into a self-contained bench/report.html.
const fs = require('fs');
const path = require('path');

const results = JSON.parse(fs.readFileSync(path.join(__dirname, 'results.json'), 'utf8'));
const fmt = n => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2));
const times = (a, b) => (b > 0 ? `${fmt(a / b)}×` : '—');

const ROWS = [
	['dash · picker visible', s => s.dash.coldVisible],
	['dash · items populated', s => s.dash.coldItems],
	['dash · cached (2nd open)', s => s.dash.warmTotal],
	['nextProject · cold', s => s.nextProject.cold],
	['nextProject · cached', s => s.nextProject.warm],
];

const scenarioCards = results.scenarios.map(s => {
	const rows = ROWS.map(([label, pick]) => {
		const before = pick(s.before);
		const after = pick(s.after);
		const max = Math.max(before, after, 0.001);
		const w = v => `max(${v === 0 ? 0 : 2}px, ${(v / max) * 100}%)`;
		return `<div class="row">
			<div class="label">${label}</div>
			<div class="bars">
				<div class="barline"><div class="bar before" style="width:${w(before)}"></div><span class="val beforev">${fmt(before)} ms</span></div>
				<div class="barline"><div class="bar after" style="width:${w(after)}"></div><span class="val afterv">${fmt(after)} ms</span></div>
			</div>
			<div class="gain">${times(before, after)}</div>
		</div>`;
	}).join('');

	return `<section class="card">
		<h3>${s.label}</h3>
		<div class="scale">${s.roots} root${s.roots > 1 ? 's' : ''} · ${s.rpc} ms per file-service call</div>
		${rows}
	</section>`;
}).join('');

const headline = (() => {
	const s = results.scenarios[results.scenarios.length - 1];
	return { before: s.before.dash.coldVisible, after: s.after.dash.coldVisible };
})();

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>woop · before / after</title>
<style>
	* { box-sizing: border-box; }
	body { margin: 0; font-family: var(--font-sans, system-ui, sans-serif); color: var(--foreground, #ededed); }
	.wrap { display: flex; flex-direction: column; gap: 18px; padding: 4px 0 8px; }
	.head { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 18px; }
	.hero { display: flex; flex-direction: column; gap: 2px; }
	.hero b { font-size: 30px; letter-spacing: -0.02em; color: var(--foreground, #ededed); }
	.legend { display: flex; gap: 16px; font-size: 12px; margin-left: auto; }
	.sw { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; }
	.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; }
	.card { background: var(--card, #191919); border: 1px solid var(--border, #2b2b2b); border-radius: var(--radius, 8px); padding: 14px 16px; color: var(--foreground, #ededed); }
	.card h3 { margin: 0 0 2px; font-size: 14px; }
	.scale { font-size: 11.5px; margin-bottom: 12px; }
	.row { display: grid; grid-template-columns: 1fr 86px; gap: 2px 10px; padding: 7px 0; border-top: 1px solid var(--border, #2b2b2b); }
	.row:first-of-type { border-top: 0; }
	.label { font-size: 12px; grid-column: 1 / -1; margin-bottom: 4px; }
	.bars { display: flex; flex-direction: column; gap: 4px; }
	.barline { display: flex; align-items: center; gap: 8px; min-width: 0; }
	.bar { height: 9px; border-radius: 3px; flex: 0 0 auto; }
	.before { background: var(--chart-4, #8b8b8b); opacity: .55; }
	.after { background: var(--chart-2, #22d3ee); }
	.val { font-size: 11.5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.afterv { font-weight: 600; }
	.gain { align-self: center; text-align: right; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.foot { font-size: 11.5px; line-height: 1.6; border-top: 1px solid var(--border, #2b2b2b); padding-top: 12px; }
	.foot, .scale, .label, .beforev, .legend, .hero span { color: var(--foreground, #dddddd); opacity: .6; }
	code { font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; background: var(--code-background, #262626); padding: 1px 5px; border-radius: 4px; }
	</style></head>
<body><div class="wrap">
	<div class="head">
		<div class="hero">
			<b>dash: ${fmt(headline.before)} ms → ${fmt(headline.after)} ms</b>
			<span>time until the project picker is on screen — before: after every directory is read; after: before any I/O starts</span>
		</div>
		<div class="legend">
			<span><i class="sw" style="background:var(--chart-4);opacity:.55"></i>before (HEAD)</span>
			<span><i class="sw" style="background:var(--chart-2)"></i>after</span>
		</div>
	</div>
	<div class="grid">${scenarioCards}</div>
	<div class="foot">
		Method: the real <code>activate()</code> from HEAD and from the working tree, driven through the same fake <code>vscode</code> API against
		real directories on disk. 7 iterations per metric, median. "per-file-service call" models the extension-host round trip; 0.5 ms is a local SSD,
		15 ms is a WSL / network / slow-disk share. <code>dash</code> stops after the picker returns a selection; the window reload after
		<code>vscode.openFolder</code> is VS Code's own cost and is not counted.
	</div>
</div></body></html>`;

fs.writeFileSync(path.join(__dirname, 'report.html'), html);
console.log('wrote bench/report.html');
