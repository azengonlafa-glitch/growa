// Builds docs/flowcharts.html from the Mermaid blocks in docs/flowcharts.md
import { readFileSync, writeFileSync } from 'node:fs';

const md = readFileSync('docs/flowcharts.md', 'utf8');
const sections = md
  .split(/^## /m)
  .map((chunk) => [null, chunk.split('\n')[0], chunk.match(/```mermaid\n([\s\S]*?)```/)?.[1]])
  .filter(([, , code]) => code);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const body = sections
  .map(([, title, code]) => `<section><h2>${esc(title)}</h2><pre class="mermaid">${esc(code)}</pre></section>`)
  .join('\n');

writeFileSync('docs/flowcharts.html', `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MediLink Flowcharts</title>
<style>
  body { font-family: system-ui, "Noto Sans Thai", sans-serif; margin: 0 auto; max-width: 1200px; padding: 16px; background: #fff; color: #1a1a1a; }
  section { margin-bottom: 48px; }
  pre.mermaid { background: none; }
  #status { padding: 8px 12px; border-radius: 6px; background: #eef; }
</style>
</head>
<body>
<h1>MediLink — Flowcharts</h1>
<p id="status">กำลังตรวจแผนภาพ...</p>
${body}
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: false, flowchart: { htmlLabels: true } });
  const errors = [];
  for (const [i, el] of [...document.querySelectorAll('pre.mermaid')].entries()) {
    try { await mermaid.parse(el.textContent); } catch (e) { errors.push('แผนภาพ ' + (i + 1) + ': ' + e.message); }
  }
  await mermaid.run();
  document.getElementById('status').textContent = errors.length
    ? 'พบข้อผิดพลาด: ' + errors.join(' | ')
    : 'แผนภาพทั้ง ' + document.querySelectorAll('pre.mermaid').length + ' ภาพถูกต้อง';
</script>
</body>
</html>
`);
console.log(`wrote docs/flowcharts.html with ${sections.length} diagrams`);
