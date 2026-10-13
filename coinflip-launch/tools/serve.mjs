// Minimal static file server for the project root (browsers block fonts loaded from file://).
import http from 'http';
import { readFile } from 'fs/promises';
import path from 'path';

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
};

export function serve(root, port = 0) {
  const server = http.createServer(async (req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(root, rel.endsWith('/') ? rel + 'index.html' : rel);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const { url } = await serve(root, Number(process.argv[2] || 8080));
  console.log(`serving ${root} at ${url}`);
}
