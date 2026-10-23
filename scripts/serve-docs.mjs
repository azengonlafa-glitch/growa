// Serves docs/ on http://localhost:5173 for previewing flowcharts.html
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'docs');
const types = { '.html': 'text/html; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([\/])+/, '');
  const file = join(root, path || 'flowcharts.html');
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const content = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(5173, () => console.log('docs on http://localhost:5173'));
