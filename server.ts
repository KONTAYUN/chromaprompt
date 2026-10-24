import express from 'express';
import dotenv from 'dotenv';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

function upstreamConnectionMessage(error: unknown): string {
  const candidate = error as { name?: string; cause?: { code?: string } } | undefined;
  if (candidate?.name === 'TimeoutError') return '上游模型请求超时。';
  if (candidate?.cause?.code === 'ECONNRESET') return '上游主动断开了模型请求。';
  if (candidate?.cause?.code === 'ENOTFOUND') return '上游域名无法解析。';
  return '无法连接上游模型服务。';
}

function reportUpstreamError(scope: string, error: unknown): void {
  if (process.env.NODE_ENV === 'production') return;
  const candidate = error as { name?: string; message?: string; cause?: { code?: string; name?: string } } | undefined;
  console.error(`[${scope}]`, {
    name: candidate?.name || 'Error',
    cause: candidate?.cause?.code || candidate?.cause?.name || '',
    message: candidate?.message || '',
  });
}

function assembleStreamingChatCompletion(body: string): Record<string, unknown> | null {
  let completion: any = null;
  let role = 'assistant';
  let content = '';
  let finishReason: string | null = null;
  let usage: unknown;

  for (const event of body.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();
    if (!data || data === '[DONE]') continue;

    let chunk: any;
    try {
      chunk = JSON.parse(data);
    } catch {
      continue;
    }
    if (chunk?.error) {
      throw new Error(chunk.error?.message || '上游流式响应返回错误。');
    }
    if (!completion) {
      completion = {
        ...chunk,
        object: 'chat.completion',
      };
    }

    const choice = chunk?.choices?.[0];
    const delta = choice?.delta;
    if (typeof delta?.role === 'string') role = delta.role;
    if (typeof delta?.content === 'string') content += delta.content;
    if (Array.isArray(delta?.content)) {
      content += delta.content
        .filter((part: any) => typeof part?.text === 'string')
        .map((part: any) => part.text)
        .join('');
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (chunk?.usage) usage = chunk.usage;
  }

  if (!completion) return null;
  completion.choices = [{
    index: 0,
    message: { role, content },
    finish_reason: finishReason || 'stop',
  }];
  if (usage) completion.usage = usage;
  return completion;
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (net.isIPv4(normalized)) {
    const parts = normalized.split('.').map(Number);
    const [a, b] = parts;
    return a === 10
      || a === 127
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || a === 0;
  }
  if (net.isIPv6(normalized)) {
    return normalized === '::1'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || normalized.startsWith('fe8')
      || normalized.startsWith('fe9')
      || normalized.startsWith('fea')
      || normalized.startsWith('feb')
      || normalized.startsWith('::ffff:10.')
      || normalized.startsWith('::ffff:192.168.')
      || normalized.startsWith('::ffff:172.');
  }
  return true;
}

// Request bodies are parsed only on the two explicit proxy routes below and are
// held in memory for the duration of a request. Nothing is written to disk or a
// database, and request bodies/API keys are never logged.

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, imageUpload: false, imageProxy: true, imagePersistence: false, modelListProxy: true });
});

// CORS fallback for providers that do not allow browser access to GET /models.
// This route forwards only the model-list request. It never accepts image data
// and never logs the user's API key.
app.get('/api/models', async (req, res) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
  const providerUrl = rawUrl.trim().replace(/\/+$/, '').replace(/\/(?:chat\/completions|models)$/i, '');
  const authorization = req.header('authorization');

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(providerUrl);
  } catch {
    res.status(400).json({ error: 'API Base URL 无效。' });
    return;
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    res.status(400).json({ error: 'API Base URL 必须使用 HTTP 或 HTTPS。' });
    return;
  }
  if (parsedUrl.username || parsedUrl.password) {
    res.status(400).json({ error: 'API Base URL 不支持内嵌用户名或密码。' });
    return;
  }

  try {
    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      throw new Error('private provider host');
    }
    const resolvedAddresses = await dns.lookup(hostname, { all: true });
    if (resolvedAddresses.length === 0 || resolvedAddresses.some(({ address }) => isPrivateAddress(address))) {
      throw new Error('private provider host');
    }
    const upstream = await fetch(`${providerUrl}/models`, {
      redirect: 'manual',
      headers: {
        Accept: 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
    });
    const body = await upstream.text();
    res.setHeader('Cache-Control', 'no-store');
    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);
    res.send(body);
  } catch (error) {
    reportUpstreamError('model-list-proxy', error);
    res.status(502).json({ error: upstreamConnectionMessage(error) });
  }
});

// AI analysis proxy. This route is intentionally request-scoped:
// it forwards the JSON body to the configured provider and immediately returns
// the provider response without persisting either the image or the API key.
app.post('/api/chat/completions', express.json({ limit: '50mb' }), async (req, res) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
  const providerUrl = rawUrl.trim().replace(/\/+$/, '').replace(/\/(?:chat\/completions|models)$/i, '');
  const authorization = req.header('authorization');

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(providerUrl);
  } catch {
    res.status(400).json({ error: 'API Base URL 无效。' });
    return;
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    res.status(400).json({ error: 'API Base URL 必须使用 HTTP 或 HTTPS。' });
    return;
  }
  if (parsedUrl.username || parsedUrl.password) {
    res.status(400).json({ error: 'API Base URL 不支持内嵌用户名或密码。' });
    return;
  }

  try {
    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      throw new Error('private provider host');
    }
    const resolvedAddresses = await dns.lookup(hostname, { all: true });
    if (resolvedAddresses.length === 0 || resolvedAddresses.some(({ address }) => isPrivateAddress(address))) {
      throw new Error('private provider host');
    }

    const upstream = await fetch(`${providerUrl}/chat/completions`, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(300_000),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      // Force streaming upstream even if an older cached frontend sends
      // stream:false. Some reasoning gateways close an idle non-streaming
      // connection while the model is still thinking.
      body: JSON.stringify({ ...req.body, stream: true }),
    });
    let body = await upstream.text();
    res.setHeader('Cache-Control', 'no-store');
    res.status(upstream.status);
    let contentType = upstream.headers.get('content-type');
    if (upstream.ok && contentType?.toLowerCase().includes('text/event-stream')) {
      const assembled = assembleStreamingChatCompletion(body);
      if (assembled) {
        body = JSON.stringify(assembled);
        contentType = 'application/json; charset=utf-8';
      }
    }
    if (contentType) res.setHeader('content-type', contentType);
    res.send(body);
  } catch (error) {
    reportUpstreamError('chat-proxy', error);
    res.status(502).json({ error: upstreamConnectionMessage(error) });
  }
});

// Keep the API surface explicit. The proxy accepts request-scoped image data
// only for the duration of the upstream call; it is never persisted.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');

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

  app.listen(port, '0.0.0.0', () => {
    console.log(`ChromaPrompt server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exitCode = 1;
});
