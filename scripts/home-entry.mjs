import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const cookie = 'omeumes-lan';
const idle = 3 * 60 * 60 * 1000;
const passwordOptions = { N: 2 ** 17, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
const noCache = 'private, no-store';

export async function hashPassword(password, salt = randomBytes(32)) {
  return { salt: salt.toString('hex'), hash: (await derive(password, salt, 64, passwordOptions)).toString('hex') };
}

function loginPage(message = '') {
  return `<!doctype html><html lang="pt-PT"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Entrar · O meu mês</title>
<style>body{background:#f5f7ee;color:#18362b;font:16px system-ui;margin:24px}main{max-width:26rem;margin:8vh auto;padding:24px;background:white;border-radius:12px}form,label{display:grid;gap:10px}input,button{box-sizing:border-box;min-height:44px;font:inherit;padding:8px;border:1px solid #52635a;border-radius:6px}button{background:#235f50;color:white}p[role=alert]{color:#8c2418}:focus-visible{outline:3px solid #235f50;outline-offset:3px}</style>
<main><h1>O meu mês</h1><p>Acesso privado em casa</p>${message ? `<p role="alert">${message}</p>` : ''}
<form method="post" action="/entrar"><label>Utilizador<input name="username" autocomplete="username" value="omeumes" readonly></label>
<label>Palavra-passe<input name="password" type="password" autocomplete="current-password" maxlength="256" required></label>
<button>Entrar</button></form></main></html>`;
}

function reply(res, status, payload, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': noCache,
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY', ...headers,
  });
  res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

function login(res, status, message) {
  reply(res, status, loginPage(message), {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    ...(status === 429 ? { 'Retry-After': '60' } : {}),
  });
}

function cookieValue(value) {
  return `${cookie}=${value}; Path=/; HttpOnly; SameSite=Strict${value ? '' : '; Max-Age=0'}`;
}

async function body(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function homeEntry({ origin, upstream, proof, credential, allowed, enabled = () => true, now = Date.now }) {
  const host = new URL(origin).host;
  const sessions = new Map();
  const sockets = new Set();
  let attempts = [];
  let checking = false;
  const server = createServer({ requestTimeout: 15_000, headersTimeout: 10_000,
    keepAliveTimeout: 3000, maxHeaderSize: 12_288 }, (req, res) => {
    void route(req, res).catch(() => {
      if (!res.headersSent) reply(res, 503, { message: 'Entrada doméstica temporariamente indisponível.' });
      else res.destroy();
    });
  });
  server.maxConnections = 32;
  server.setTimeout(20_000, socket => socket.destroy());
  server.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    if (!allowed(socket.remoteAddress)) socket.destroy();
  });
  server.on('upgrade', (_req, socket) => socket.destroy());
  server.on('connect', (_req, socket) => socket.destroy());
  const invalidate = () => {
    sessions.clear();
    for (const socket of sockets) socket.destroy();
  };
  async function route(req, res) {
    const ip = req.socket.remoteAddress;
    if (!allowed(ip) || req.headers.host !== host) return reply(res, 403, { message: 'Acesso indisponível.' });
    if (!enabled()) {
      return reply(res, 503, 'O meu mês · Defina a credencial pessoal no PC para abrir o login.', {
        'Content-Type': 'text/plain; charset=utf-8',
      });
    }
    const target = req.url ?? '';
    // Admit only the known app surface. Never forward absolute paths, rewrites or alternate encodings.
    const url = /^\/(?!\/)[^\\#%]*$/.test(target) ? new URL(target, origin) : null;
    const path = url?.pathname;
    if (!url || target.split('?')[0] !== path) return reply(res, 404, { message: 'Página indisponível.' });
    const post = req.method === 'POST';
    if (post && req.headers.origin !== origin) return reply(res, 403, { message: 'Origem do pedido inválida.' });
    const token = req.headers.cookie?.match(/(?:^|;\s*)omeumes-lan=([0-9a-f]{64})(?:;|$)/)?.[1];
    const time = now();
    for (const [id, session] of sessions) {
      if (time < session.seen || time - session.seen >= idle || !allowed(session.ip)) sessions.delete(id);
    }
    const session = sessions.get(token);
    const signedIn = session?.ip === ip && !!session;
    if (path === '/entrar' && req.method === 'GET') return signedIn
      ? reply(res, 303, '', { Location: '/' }) : login(res, 200);
    if (path === '/entrar' && post) {
      attempts = attempts.filter(t => time >= t && time - t < 60_000);
      if (checking || attempts.length >= 5) return login(res, 429, 'Aguarde um minuto antes de voltar a tentar.');
      if (req.headers['content-type'] !== 'application/x-www-form-urlencoded') return login(res, 415, 'Formato de pedido inválido.');
      attempts.push(time);
      checking = true;
      try {
        const raw = await body(req, 4096);
        if (!raw) return login(res, 413, 'Pedido demasiado extenso.');
        const fields = new URLSearchParams(raw.toString());
        const password = fields.get('password');
        if (!password || password.length > 256) return login(res, 401, 'Credencial inválida.');
        const result = await hashPassword(password, Buffer.from(credential.salt, 'hex'));
        if (!timingSafeEqual(Buffer.from(result.hash, 'hex'), Buffer.from(credential.hash, 'hex')) ||
            fields.get('username') !== 'omeumes') return login(res, 401, 'Credencial inválida.');
        if (!allowed(ip) || req.destroyed && !req.complete || res.destroyed) return;
        if (signedIn) sessions.delete(token);
        if (sessions.size >= 8) sessions.delete(sessions.keys().next().value);
        const id = randomBytes(32).toString('hex');
        sessions.set(id, { ip, seen: now() });
        return reply(res, 303, '', { Location: '/', 'Set-Cookie': cookieValue(id) });
      } finally { checking = false; }
    }
    if (path === '/sair' && post) {
      if (signedIn) sessions.delete(token);
      return reply(res, 303, '', { Location: '/entrar', 'Set-Cookie': cookieValue('') });
    }
    if (!signedIn) return path === '/' && req.method === 'GET'
      ? reply(res, 303, '', { Location: '/entrar' })
      : reply(res, 401, { code: 'SESSION', message: 'Sessão terminada. Volte a entrar em O meu mês.' });
    const asset = path === '/icon.svg' || /^\/_next\/static\/[a-zA-Z0-9_./-]+$/.test(path);
    const readable = req.method === 'GET' && (path === '/' || asset || path === '/api/state');
    const writable = post && (path === '/api/state' || path === '/api/local-files');
    if (!readable && !writable) return reply(res, 404, { message: 'Página indisponível.' });
    const payload = post ? await body(req, 128_000) : undefined;
    if (payload === null) return reply(res, 413, { message: 'Pedido demasiado extenso.' });
    if (res.destroyed) return;
    const checkedAt = now();
    if (!allowed(ip) || sessions.get(token) !== session || checkedAt < session.seen || checkedAt - session.seen >= idle) {
      return reply(res, 401, { code: 'SESSION', message: 'Sessão terminada. Volte a entrar em O meu mês.' });
    }
    if (!asset) session.seen = checkedAt;
    const headers = { host, 'x-omeumes-entry': proof, 'x-forwarded-proto': 'http' };
    for (const name of ['origin', 'accept', 'content-type']) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }
    if (payload) headers['content-length'] = payload.length;
    const next = httpRequest({ hostname: '127.0.0.1', port: upstream, method: req.method, path: target, headers }, result => {
      const responseHeaders = { 'Cache-Control': noCache, 'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' };
      for (const name of ['content-type', 'content-length', 'content-encoding']) {
        if (result.headers[name]) responseHeaders[name] = result.headers[name];
      }
      res.writeHead(result.statusCode, responseHeaders);
      result.on('error', () => res.destroy());
      result.pipe(res);
    });
    next.setTimeout(16_000, () => next.destroy());
    next.on('error', () => {
      if (!res.headersSent) reply(res, 502, { message: 'Não foi possível confirmar a resposta do servidor local.' });
      else res.destroy();
    });
    res.on('close', () => { if (!res.writableFinished) next.destroy(); });
    next.end(payload);
  }
  return { server, invalidate };
}
