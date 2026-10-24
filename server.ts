import express, { type NextFunction, type Request, type Response } from 'express';
import dotenv from 'dotenv';
import { rateLimit } from 'express-rate-limit';
import ipaddr from 'ipaddr.js';
import crypto from 'node:crypto';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

function envInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function envList(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parseTrustProxy(value: string | undefined): boolean | number | string {
  const raw = (value ?? '').trim();
  if (!raw || raw === 'false') return false;
  if (raw === 'true') return true;
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10);
  return raw;
}

const port = envInt('PORT', 3000);
const host = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');

const MAX_BODY_MB = envInt('MAX_BODY_MB', 50);
const UPSTREAM_TIMEOUT_MS = envInt('UPSTREAM_TIMEOUT_MS', 300_000);
const UPSTREAM_IDLE_TIMEOUT_MS = envInt('UPSTREAM_IDLE_TIMEOUT_MS', 120_000);
const MODELS_TIMEOUT_MS = envInt('MODELS_TIMEOUT_MS', 30_000);
const HEARTBEAT_INTERVAL_MS = envInt('HEARTBEAT_INTERVAL_MS', 10_000);
const MAX_UPSTREAM_BODY_BYTES = 8 * 1024 * 1024;
const MAX_COMPLETION_CHARS = 2 * 1024 * 1024;

const ALLOW_PRIVATE_UPSTREAM = process.env.ALLOW_PRIVATE_UPSTREAM === 'true';
const ALLOWED_UPSTREAM_HOSTS = envList('UPSTREAM_ALLOWED_HOSTS');
const ACCESS_CODE = process.env.ACCESS_CODE ?? '';
const SESSION_TTL_MS = envInt('SESSION_TTL_HOURS', 24 * 7) * 3_600_000;

app.disable('x-powered-by');
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

class UpstreamBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamBlockedError';
  }
}

class UpstreamTimeoutError extends Error {
  constructor(message = 'upstream timeout') {
    super(message);
    this.name = 'TimeoutError';
  }
}

class UpstreamResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamResponseError';
  }
}

function upstreamConnectionMessage(error: unknown): string {
  const candidate = error as { name?: string; code?: string; cause?: { code?: string } } | undefined;
  const code = candidate?.code ?? candidate?.cause?.code;
  if (candidate?.name === 'TimeoutError') return '上游模型请求超时。';
  if (candidate?.name === 'UpstreamBlockedError') return '出于安全考虑，不允许转发到内网或保留地址的模型服务。';
  if (candidate?.name === 'UpstreamResponseError') return (error as Error).message;
  if (code === 'ECONNRESET') return '上游主动断开了模型请求。';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return '上游域名无法解析。';
  if (code === 'ECONNREFUSED') return '上游拒绝了连接。';
  return '无法连接上游模型服务。';
}

function reportUpstreamError(scope: string, error: unknown): void {
  if (isProduction) return;
  const candidate = error as { name?: string; message?: string; code?: string; cause?: { code?: string; name?: string } } | undefined;
  console.error(`[${scope}]`, {
    name: candidate?.name || 'Error',
    cause: candidate?.code || candidate?.cause?.code || candidate?.cause?.name || '',
    message: candidate?.message || '',
  });
}

// ---------------------------------------------------------------------------
// Upstream access: SSRF protection
// ---------------------------------------------------------------------------

// Only globally routable unicast addresses are allowed. ipaddr.js classifies
// loopback, private, link-local, carrier-grade NAT (100.64/10, which includes
// some cloud metadata services), benchmarking/documentation/reserved ranges,
// multicast, 6to4/Teredo/NAT64 and others as non-unicast. IPv4-mapped IPv6
// addresses are unwrapped first so ::ffff:127.0.0.1 is judged as 127.0.0.1.
function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  return ipaddr.process(address).range() === 'unicast';
}

function assertAddressesAllowed(addresses: string[]): void {
  if (ALLOW_PRIVATE_UPSTREAM) return;
  const rejected = addresses.length === 0 ? 'no address' : addresses.find((address) => !isPublicAddress(address));
  if (rejected) {
    // The address is only logged outside production (reportUpstreamError); on
    // a dev machine behind a fake-IP proxy (198.18.0.0/15) it explains the block.
    throw new UpstreamBlockedError(`non-public provider address ${rejected}`);
  }
}

// Validation happens inside the socket's own DNS lookup, so the address that is
// checked is the address that is connected to (no resolve-then-resolve-again
// window for DNS rebinding).
function safeLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void,
): void {
  dns.lookup(hostname, { family: options.family, hints: options.hints, all: true }, (error, addresses) => {
    if (error) {
      callback(error, options.all ? [] : '', 0);
      return;
    }
    try {
      assertAddressesAllowed(addresses.map(({ address }) => address));
    } catch (blocked) {
      callback(blocked as NodeJS.ErrnoException, options.all ? [] : '', 0);
      return;
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
}

function hostnameAllowed(hostname: string): boolean {
  if (ALLOWED_UPSTREAM_HOSTS.length === 0) return true;
  return ALLOWED_UPSTREAM_HOSTS.some((entry) => hostname === entry || hostname.endsWith(`.${entry}`));
}

type ProviderTarget = { ok: true; url: URL } | { ok: false; status: number; message: string };

function resolveProviderTarget(req: Request, suffix: '/models' | '/chat/completions'): ProviderTarget {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, status: 400, message: 'API Base URL 无效。' };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, status: 400, message: 'API Base URL 必须使用 HTTP 或 HTTPS。' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, status: 400, message: 'API Base URL 不支持内嵌用户名或密码。' };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostnameAllowed(hostname)) {
    return { ok: false, status: 403, message: '该模型服务地址不在允许列表中。' };
  }
  // Socket lookups are skipped for IP literals, so check those up front.
  if (net.isIP(hostname)) {
    try {
      assertAddressesAllowed([hostname]);
    } catch (blocked) {
      reportUpstreamError('provider-url', blocked);
      return { ok: false, status: 403, message: upstreamConnectionMessage(blocked) };
    }
  }

  const target = new URL(parsed.href);
  target.hash = '';
  target.pathname = target.pathname.replace(/\/+$/, '').replace(/\/(?:chat\/completions|models)$/i, '') + suffix;
  return { ok: true, url: target };
}

interface UpstreamCall {
  response: Promise<http.IncomingMessage>;
  destroy: (error?: Error) => void;
}

function openUpstream(
  target: URL,
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string },
): UpstreamCall {
  const transport = target.protocol === 'https:' ? https : http;
  const headers = { ...init.headers };
  if (init.body !== undefined) headers['Content-Length'] = String(Buffer.byteLength(init.body));

  let request!: http.ClientRequest;
  const response = new Promise<http.IncomingMessage>((resolve, reject) => {
    // Redirects are never followed (a redirect could point at an internal host).
    request = transport.request(target, { method: init.method, headers, lookup: safeLookup as any, agent: false }, resolve);
    request.on('error', reject);
    request.end(init.body);
  });
  return { response, destroy: (error) => request.destroy(error) };
}

async function readBodyText(stream: http.IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new UpstreamResponseError('上游响应体过大。');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function providerErrorText(body: string, fallback: string): string {
  try {
    const payload = JSON.parse(body);
    if (typeof payload?.error === 'string') return payload.error;
    if (payload?.error?.message) return String(payload.error.message);
    if (payload?.message) return String(payload.message);
  } catch {
    // not JSON; fall through to a trimmed excerpt
  }
  const excerpt = body.trim().slice(0, 300);
  return excerpt || fallback;
}

// ---------------------------------------------------------------------------
// Streaming chat completion assembly (incremental, size-capped)
// ---------------------------------------------------------------------------

class StreamingCompletionAssembler {
  private pending = '';
  private completion: any = null;
  private role = 'assistant';
  private content = '';
  private finishReason: string | null = null;
  private usage: unknown;

  push(text: string): void {
    this.pending += text;
    const events = this.pending.split(/\r?\n\r?\n/);
    this.pending = events.pop() ?? '';
    if (this.pending.length > MAX_UPSTREAM_BODY_BYTES) throw new UpstreamResponseError('上游流式响应体过大。');
    for (const event of events) this.consume(event);
  }

  finish(): Record<string, unknown> | null {
    if (this.pending.trim()) this.consume(this.pending);
    this.pending = '';
    if (!this.completion) return null;
    this.completion.choices = [{
      index: 0,
      message: { role: this.role, content: this.content },
      finish_reason: this.finishReason || 'stop',
    }];
    if (this.usage) this.completion.usage = this.usage;
    return this.completion;
  }

  private consume(event: string): void {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();
    if (!data || data === '[DONE]') return;

    let chunk: any;
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    if (chunk?.error) {
      throw new UpstreamResponseError(chunk.error?.message || '上游流式响应返回错误。');
    }
    if (!this.completion) {
      this.completion = { ...chunk, object: 'chat.completion' };
    }

    const choice = chunk?.choices?.[0];
    const delta = choice?.delta;
    if (typeof delta?.role === 'string') this.role = delta.role;
    if (typeof delta?.content === 'string') this.content += delta.content;
    if (Array.isArray(delta?.content)) {
      this.content += delta.content
        .filter((part: any) => typeof part?.text === 'string')
        .map((part: any) => part.text)
        .join('');
    }
    if (this.content.length > MAX_COMPLETION_CHARS) throw new UpstreamResponseError('上游返回内容过长。');
    if (choice?.finish_reason) this.finishReason = choice.finish_reason;
    if (chunk?.usage) this.usage = chunk.usage;
  }
}

// ---------------------------------------------------------------------------
// Access control: optional shared access code + signed session cookie
// ---------------------------------------------------------------------------

const SESSION_COOKIE = 'cp_session';
const sessionKey = crypto
  .createHash('sha256')
  .update(`${process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex')}\0${ACCESS_CODE}`)
  .digest();

function signSession(expiresAt: number): string {
  const signature = crypto.createHmac('sha256', sessionKey).update(String(expiresAt)).digest('base64url');
  return `${expiresAt}.${signature}`;
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

function hasValidSession(req: Request): boolean {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return false;
  const [expiresAt, signature] = token.split('.');
  const expected = signSession(Number(expiresAt)).split('.')[1];
  if (!expiresAt || !signature || Number(expiresAt) < Date.now()) return false;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function accessCodeMatches(candidate: unknown): boolean {
  if (typeof candidate !== 'string') return false;
  const digest = (value: string) => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(candidate), digest(ACCESS_CODE));
}

function requireAccess(req: Request, res: Response, next: NextFunction): void {
  if (!ACCESS_CODE || hasValidSession(req)) {
    next();
    return;
  }
  res.status(401).json({ error: '需要访问口令。', code: 'AUTH_REQUIRED' });
}

// ---------------------------------------------------------------------------
// Rate and concurrency limits for the relay routes
// ---------------------------------------------------------------------------

const tooManyRequests = { error: '请求过于频繁，请稍后再试。' };

const chatLimiter = rateLimit({
  windowMs: envInt('CHAT_RATE_WINDOW_MS', 10 * 60_000),
  limit: envInt('CHAT_RATE_LIMIT', 60),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooManyRequests,
});

const modelsLimiter = rateLimit({
  windowMs: envInt('MODELS_RATE_WINDOW_MS', 10 * 60_000),
  limit: envInt('MODELS_RATE_LIMIT', 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooManyRequests,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: '尝试次数过多，请稍后再试。' },
});

const MAX_CONCURRENT_RELAYS = envInt('RELAY_MAX_CONCURRENT', 8);
const MAX_CONCURRENT_RELAYS_PER_IP = envInt('RELAY_MAX_CONCURRENT_PER_IP', 2);
let activeRelays = 0;
const activeRelaysByIp = new Map<string, number>();

// Each in-flight relay can hold a large request body and a long upstream
// connection, so cap how many run at once overall and per client.
function relaySlot(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || 'unknown';
  const perIp = activeRelaysByIp.get(ip) ?? 0;
  if (activeRelays >= MAX_CONCURRENT_RELAYS || perIp >= MAX_CONCURRENT_RELAYS_PER_IP) {
    res.status(429).json({ error: '当前转发请求过多，请稍后再试。' });
    return;
  }
  activeRelays += 1;
  activeRelaysByIp.set(ip, perIp + 1);
  res.once('close', () => {
    activeRelays -= 1;
    const remaining = (activeRelaysByIp.get(ip) ?? 1) - 1;
    if (remaining > 0) activeRelaysByIp.set(ip, remaining);
    else activeRelaysByIp.delete(ip);
  });
  next();
}

// Request bodies are parsed only on the explicit proxy route below and are
// held in memory for the duration of a request. Nothing is written to disk or a
// database, and request bodies/API keys are never logged.

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, imageUpload: false, imageProxy: true, imagePersistence: false, modelListProxy: true });
});

app.get('/api/session', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ authRequired: Boolean(ACCESS_CODE), authenticated: !ACCESS_CODE || hasValidSession(req) });
});

app.post('/api/login', loginLimiter, express.json({ limit: '1kb' }), (req, res) => {
  if (!ACCESS_CODE) {
    res.json({ ok: true });
    return;
  }
  if (!accessCodeMatches(req.body?.code)) {
    res.status(401).json({ error: '访问口令不正确。' });
    return;
  }
  const expiresAt = Date.now() + SESSION_TTL_MS;
  res.cookie(SESSION_COOKIE, signSession(expiresAt), {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
  res.json({ ok: true });
});

// CORS fallback for providers that do not allow browser access to GET /models.
// This route forwards only the model-list request. It never accepts image data
// and never logs the user's API key.
app.get('/api/models', requireAccess, modelsLimiter, relaySlot, async (req, res) => {
  const target = resolveProviderTarget(req, '/models');
  if (!target.ok) {
    res.status(target.status).json({ error: target.message });
    return;
  }

  const authorization = req.header('authorization');
  const upstream = openUpstream(target.url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
  });
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    upstream.destroy(new UpstreamTimeoutError());
  }, MODELS_TIMEOUT_MS);
  res.once('close', () => {
    clearTimeout(deadline);
    if (!res.writableFinished) upstream.destroy();
  });

  try {
    const upstreamRes = await upstream.response;
    const body = await readBodyText(upstreamRes, MAX_UPSTREAM_BODY_BYTES);
    res.setHeader('Cache-Control', 'no-store');
    res.status(upstreamRes.statusCode ?? 502);
    const contentType = upstreamRes.headers['content-type'];
    if (contentType) res.setHeader('content-type', contentType);
    res.send(body);
  } catch (caught) {
    if (res.destroyed) return;
    // Destroying the request mid-response surfaces as a generic reset, so a
    // deadline we triggered ourselves is reported as the timeout it was.
    const error = timedOut ? new UpstreamTimeoutError() : caught;
    reportUpstreamError('model-list-proxy', error);
    const blocked = (error as Error)?.name === 'UpstreamBlockedError';
    res.status(blocked ? 403 : 502).json({ error: upstreamConnectionMessage(error) });
  } finally {
    clearTimeout(deadline);
  }
});

// AI analysis proxy. This route is intentionally request-scoped:
// it forwards the JSON body to the configured provider and immediately returns
// the provider response without persisting either the image or the API key.
//
// The upstream call is always streamed so the provider connection stays active
// while a reasoning model thinks. The browser still receives one JSON document:
// until the answer is ready, the response is kept alive with whitespace (valid
// leading JSON whitespace) so reverse proxies and load balancers do not time
// out an apparently idle connection. If the upstream fails after that point the
// status line is already sent, so the failure is reported as `{ "error": ... }`
// in a 200 response, which the frontend treats as an error.
app.post(
  '/api/chat/completions',
  requireAccess,
  chatLimiter,
  relaySlot,
  express.json({ limit: `${MAX_BODY_MB}mb` }),
  async (req, res) => {
    const target = resolveProviderTarget(req, '/chat/completions');
    if (!target.ok) {
      res.status(target.status).json({ error: target.message });
      return;
    }

    const authorization = req.header('authorization');
    const upstream = openUpstream(target.url, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream, application/json',
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      // Force streaming upstream even if an older cached frontend sends
      // stream:false. Some reasoning gateways close an idle non-streaming
      // connection while the model is still thinking.
      body: JSON.stringify({ ...req.body, stream: true }),
    });

    let committed = false;
    let timedOut = false;
    let idleTimer: NodeJS.Timeout | undefined;
    const abortOnTimeout = () => {
      timedOut = true;
      upstream.destroy(new UpstreamTimeoutError());
    };
    const deadline = setTimeout(abortOnTimeout, UPSTREAM_TIMEOUT_MS);
    const heartbeat = setInterval(() => {
      if (res.destroyed) return;
      if (!committed) {
        committed = true;
        res.status(200);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
      }
      res.write(' ');
    }, HEARTBEAT_INTERVAL_MS);
    const cleanup = () => {
      clearTimeout(deadline);
      clearTimeout(idleTimer);
      clearInterval(heartbeat);
    };
    res.once('close', () => {
      cleanup();
      // The browser went away: stop spending tokens on an answer nobody reads.
      if (!res.writableFinished) upstream.destroy();
    });

    const fail = (status: number, message: string) => {
      cleanup();
      if (res.destroyed) return;
      if (committed) res.end(JSON.stringify({ error: message }));
      else res.status(status).json({ error: message });
    };

    try {
      const upstreamRes = await upstream.response;
      const statusCode = upstreamRes.statusCode ?? 502;
      const contentType = upstreamRes.headers['content-type'] ?? '';

      let body: string;
      let responseType = contentType;
      if (statusCode >= 200 && statusCode < 300 && contentType.toLowerCase().includes('text/event-stream')) {
        const assembler = new StreamingCompletionAssembler();
        const armIdleTimer = () => {
          clearTimeout(idleTimer);
          idleTimer = setTimeout(abortOnTimeout, UPSTREAM_IDLE_TIMEOUT_MS);
        };
        armIdleTimer();
        upstreamRes.setEncoding('utf8');
        for await (const chunk of upstreamRes) {
          armIdleTimer();
          assembler.push(chunk as string);
        }
        const assembled = assembler.finish();
        if (!assembled) {
          fail(502, '上游流式响应没有返回有效内容。');
          return;
        }
        body = JSON.stringify(assembled);
        responseType = 'application/json; charset=utf-8';
      } else {
        body = await readBodyText(upstreamRes, MAX_UPSTREAM_BODY_BYTES);
        if (statusCode < 200 || statusCode >= 300) {
          fail(committed ? 502 : statusCode, providerErrorText(body, `模型服务返回 HTTP ${statusCode}。`));
          return;
        }
      }

      cleanup();
      if (res.destroyed) return;
      if (committed) {
        res.end(body);
      } else {
        res.setHeader('Cache-Control', 'no-store');
        res.status(statusCode);
        if (responseType) res.setHeader('content-type', responseType);
        res.send(body);
      }
    } catch (caught) {
      const error = timedOut ? new UpstreamTimeoutError() : caught;
      reportUpstreamError('chat-proxy', error);
      const blocked = (error as Error)?.name === 'UpstreamBlockedError';
      fail(blocked ? 403 : 502, upstreamConnectionMessage(error));
    }
  },
);

// Keep the API surface explicit. The proxy accepts request-scoped image data
// only for the duration of the upstream call; it is never persisted.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

app.use('/api', (error: any, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: `图片总体积超过服务器限制（${MAX_BODY_MB} MB），请减少图片数量或先压缩。` });
  } else if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: '请求体不是有效的 JSON。' });
  } else {
    if (!isProduction) console.error('[api]', error?.message || error);
    res.status(500).json({ error: '服务器内部错误。' });
  }
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const server = app.listen(port, host, () => {
    console.log(`ChromaPrompt server listening on http://${host}:${port}`);
    if (!ACCESS_CODE) {
      console.warn('[security] ACCESS_CODE is not set: anyone who can reach this server can use the model relay (rate limits still apply).');
    }
    if (ALLOW_PRIVATE_UPSTREAM) {
      console.warn('[security] ALLOW_PRIVATE_UPSTREAM=true: the relay may connect to private/loopback addresses. Do not enable this on a public server.');
    }
  });

  // Stay above typical load balancer / reverse proxy idle timeouts (60s) so a
  // kept-alive connection is never closed by Node first, which shows up as 502s.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exitCode = 1;
});
