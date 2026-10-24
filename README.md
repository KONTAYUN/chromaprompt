# ChromaPrompt - 参考图 HEX 色彩解构与反推提示词工作台

根据一张或者多张参考图精准分析画面色彩空间，提取核心 HEX 色标、面积分布与色彩调和关系，并反推严格保持色彩一致性的 AI 图像生成提示词，支持中英文双语一键切换。默认使用浏览器本地 Canvas 提取色彩；用户可选填自己的 OpenAI 兼容模型进行 AI 深度分析。

## ✨ 核心特性

- **多图参考解析**：支持单张或多张参考图同时输入，智能提取画面主色调、辅色调、高光点缀色与环境阴影色。
- **三类提示词**：通用还原、视觉描述、色彩约束，均不绑定具体模型或版本。
- **中英文双语一键切换**：一键切换生成的提示词语言（中文/英文），方便国内与国际 AI 工具使用。
- **画板实时吸色器**：支持在参考图画布上实时鼠标悬停、放大采样任意像素并一键复制 HEX 代码。
- **可选模型配置**：在网页中填写 OpenAI 兼容 API Base URL、API Key 和模型名称，可主动读取 `/models` 列表；配置保存在用户浏览器本地，直连失败时自动转发模型列表请求。
- **模型无关**：输出可直接交给不同图像模型继续编辑，不附带版本参数或专用语法。

## 🚀 本地运行指南

### 1. 安装依赖
```bash
npm ci
```

### 2. （可选）配置环境变量
项目不需要在服务端配置模型密钥。用户在网页中填写的配置保存在当前浏览器的 `localStorage`。AI 分析请求由本站在内存中转发到用户指定的模型服务，转发完成后立即释放请求体，不写入文件、数据库或日志。模型列表直连失败时自动转发 `/models` 请求。

所有可选项见 [`.env.example`](.env.example)，常用的有：

| 变量 | 作用 |
| --- | --- |
| `ACCESS_CODE` | 设置后，模型转发功能需要先输入该访问口令（签名的 HttpOnly 会话 Cookie）。**公网部署强烈建议设置** |
| `TRUST_PROXY` | 前面有 Nginx/Caddy/云负载均衡时设为 `1`，限流才能识别真实客户端 IP，Cookie 才会带 `Secure` |
| `ALLOW_PRIVATE_UPSTREAM` | 默认 `false`：转发层拒绝访问内网/回环/保留地址（防 SSRF）。**仅本地测试**（例如连本机 Ollama，或本机开着 Clash/Surge 等 fake-IP 代理，公网域名会被解析成 `198.18.x.x`）时设为 `true`，并同时设置 `HOST=127.0.0.1` |
| `UPSTREAM_ALLOWED_HOSTS` | 可选：只允许转发到这些模型服务域名（含子域名） |
| `CHAT_RATE_LIMIT` / `MODELS_RATE_LIMIT` | 每个客户端 IP 在 10 分钟窗口内的请求上限（默认 20 / 30） |
| `RELAY_MAX_CONCURRENT` / `RELAY_MAX_CONCURRENT_PER_IP` | 同时进行的转发数量上限（默认 8 / 2） |

### 3. 启动本地开发服务
```bash
npm run dev
```
打开浏览器访问 [http://localhost:3000](http://localhost:3000)。

### 4. 构建生产版本
```bash
npm run build   # 构建前端 dist/，并把 server.ts 打包为 server.js
npm start       # node server.js --production
```

### 5. Docker 部署
```bash
docker build -t chromaprompt .
docker run -d --name chromaprompt --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e ACCESS_CODE="换成你自己的口令" \
  -e TRUST_PROXY=1 \
  chromaprompt
```
镜像为多阶段构建：运行时只包含 `server.js`、`dist/` 和生产依赖，以非 root 用户（`node`）运行，带 `HEALTHCHECK`（`/healthz`），收到 `SIGTERM` 会优雅退出。

本站服务器提供页面和静态资源；模型列表直连失败时自动通过 `/api/models` 转发，AI 图片分析统一通过 `/api/chat/completions` 转发。请求只在内存中处理，不保存图片或 API Key。

**上云部署清单**
- **必须放在 HTTPS 后面**（Nginx / Caddy / 云负载均衡）。用户的 API Key 会经浏览器发给本站再转发，没有 TLS 就是明文。上例把端口只绑定到 `127.0.0.1`，由反向代理对外提供 443。
- 设置 `TRUST_PROXY=1`（前面只有一层代理时），否则所有访客会被当成同一个 IP 限流。
- 公网部署请设置 `ACCESS_CODE`；不设置时服务会在启动日志里给出警告，此时只有限流在保护转发接口。
- 反向代理需要放行较大的请求体（图片以 base64 发送），例如 Nginx 设置 `client_max_body_size 60m;`，并保持 `MAX_BODY_MB`（默认 50）不大于它。
- AI 分析向上游使用流式请求，再由本站整理为完整 JSON 返回，保留模型默认推理能力。等待期间本站每 10 秒向浏览器发送一个空白字符作为保活（JSON 允许前导空白），因此代理的读超时不需要设得很大；仍建议 `proxy_read_timeout 300s;`，并关闭该路径的响应缓冲（本站已发送 `X-Accel-Buffering: no`）。单次分析最长 5 分钟（`UPSTREAM_TIMEOUT_MS`），上游 2 分钟无数据则中止（`UPSTREAM_IDLE_TIMEOUT_MS`）。

Nginx 示例：
```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 60m;
    proxy_read_timeout 300s;
}
```

### 转发层的安全措施
- 只允许转发到公网单播地址；回环、内网、链路本地、运营商级 NAT（含阿里云元数据 `100.100.100.200`）、保留段、IPv4 映射 IPv6、NAT64 等一律拒绝。检查发生在建立连接的那一次 DNS 解析里，不存在“先校验再重新解析”的 DNS rebinding 窗口；不跟随重定向。
- 按客户端 IP 限流，并限制同时进行的转发数量；可选访问口令；口令登录自身有防暴力破解限流。
- 浏览器断开时立即中止对上游模型的请求，不再消耗 token。

## 🛠️ 技术栈
- **前端**：React 19, TypeScript, Tailwind CSS, Lucide Icons, Canvas API
- **服务端**：Node.js, Express 静态页面服务
- **模型调用**：模型列表浏览器优先直连 OpenAI-compatible `/models`；AI 图片分析通过本站临时转发 `/chat/completions`

### 隐私边界
普通色彩提取和画板吸色只在浏览器内运行。用户点击“AI 深度分析”后，图片会经过本站服务器转发到用户填写的第三方或自建模型服务。本站只在内存中处理请求，不写入文件、数据库或日志，模型设置保存在浏览器本地。若要求图片完全不经过本站或任何第三方服务，请只使用本地功能，或部署本地推理模型。
- **工程化**：Vite 8, tsx
