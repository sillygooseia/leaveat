const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const rootDir = path.join(__dirname, '..', 'dist', 'leaveat', 'browser');
const marketingDir = path.join(__dirname, '..', 'marketing');
const port = process.env.PORT || 8080;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

function sendResponse(res, status, content, contentType) {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(content);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendResponse(res, 500, 'Internal Server Error', 'text/plain; charset=utf-8');
      return;
    }
    sendResponse(res, 200, data, contentType);
  });
}

function fileExists(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function serveMarketingIndex(res) {
  const filePath = path.join(marketingDir, 'index.html');
  if (!fileExists(filePath)) {
    sendResponse(res, 404, 'Marketing page not found', 'text/plain; charset=utf-8');
    return;
  }
  sendFile(res, filePath);
}

const server = http.createServer((req, res) => {
  const requestUrl = url.parse(req.url || '/');
  const pathname = decodeURIComponent(requestUrl.pathname || '/');

  if (pathname === '/' || pathname === '/index.html' || pathname === '/home' || pathname === '/home/') {
    serveMarketingIndex(res);
    return;
  }

  if (pathname.startsWith('/marketing/')) {
    const marketingPath = path.join(marketingDir, pathname.replace('/marketing/', ''));
    if (fileExists(marketingPath)) {
      sendFile(res, marketingPath);
      return;
    }
    sendResponse(res, 404, 'Not Found', 'text/plain; charset=utf-8');
    return;
  }

  const filePath = path.join(rootDir, pathname);
  if (fileExists(filePath)) {
    sendFile(res, filePath);
    return;
  }

  // If requested path is not a static asset, fallback to Angular app
  const indexPath = path.join(rootDir, 'index.html');
  if (fileExists(indexPath)) {
    sendFile(res, indexPath);
    return;
  }

  sendResponse(res, 404, 'Not Found', 'text/plain; charset=utf-8');
});

server.listen(port, () => {
  console.log(`LeaveAt local preview server running on http://localhost:${port}`);
  console.log('Root / and /home serve the marketing page; /schedule serves the app.');
});
