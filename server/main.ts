// sh.cd 服务入口 (Bun, 无第三方依赖)。
//
//   GET  /            curl / wget 拿到检测脚本 check.sh; 浏览器 (Accept 带 text/html) 拿到说明页, ?raw=1 强制返回脚本
//   POST /report      生成报告 (server/report.ts)
//   POST /dns/start   DNS 出口检测: 发一个一次性子域名
//   GET  /healthz
//
// 只监听本机, 由反向代理转发; 访客 IP 取反代写入的 X-Real-IP (反代必须覆盖客户端自带的同名头)。
// 运行: bun run server/main.ts   环境变量见 deploy/sh.cd.env.example

import { readFile, stat } from "node:fs/promises"
import { resolve } from "node:path"
import { landingPage } from "./landing"
import { langOf } from "./render/base"
import { handleReport, type Form } from "./report"
import { dnsProbeStart } from "./upstream"

const SCRIPT = resolve(import.meta.dir, "../check.sh")
const MAX_BODY = 96_000

let cached: { mtimeMs: number, body: string } | null = null

async function script(): Promise<Response> {
  const headers = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", vary: "Accept" }
  try {
    const st = await stat(SCRIPT)
    if (!cached || cached.mtimeMs !== st.mtimeMs) cached = { mtimeMs: st.mtimeMs, body: await readFile(SCRIPT, "utf8") }
    return new Response(cached.body, { headers })
  } catch {
    // 用户是 bash <(curl ...) 直接执行响应体的, 出错也要返回一段能跑的 shell
    return new Response("echo 'sh.cd 暂时不可用, 请稍后重试 / sh.cd is temporarily unavailable, please retry later' >&2\nexit 1\n", { status: 503, headers })
  }
}

/** 表单解析: 同名字段 (各阶段的 dur) 合成数组 */
function parseForm(raw: string): Form {
  const out: Form = {}
  for (const [k, v] of new URLSearchParams(raw)) {
    const prev = out[k]
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v]
  }
  return out
}

const server = Bun.serve({
  hostname: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3410),
  maxRequestBodySize: MAX_BODY * 2,
  async fetch(req, srv) {
    const url = new URL(req.url)
    const caller = (req.headers.get("x-real-ip") || srv.requestIP(req)?.address || "").trim()

    if (url.pathname === "/" && (req.method === "GET" || req.method === "HEAD")) {
      const accept = req.headers.get("accept") || ""
      if (accept.includes("text/html") && !url.searchParams.has("raw")) {
        const lang = url.searchParams.has("lang")
          ? langOf(url.searchParams.get("lang"))
          : langOf((req.headers.get("accept-language") || "zh").startsWith("zh") ? "zh" : "en")
        return new Response(landingPage(lang), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", vary: "Accept" } })
      }
      return script()
    }

    if (url.pathname === "/report" && req.method === "POST") {
      if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return new Response("payload too large\n", { status: 413 })
      const raw = await req.text()
      if (raw.length > MAX_BODY) return new Response("payload too large\n", { status: 413 })
      const reply = await handleReport(parseForm(raw), caller)
      return new Response(reply.body, { status: reply.status, headers: reply.headers })
    }

    if (url.pathname === "/dns/start" && req.method === "POST") {
      return Response.json(dnsProbeStart(), { headers: { "cache-control": "no-store" } })
    }

    if (url.pathname === "/healthz") return new Response("ok\n")
    return new Response("not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } })
  },
})

console.log(`sh.cd listening on ${server.hostname}:${server.port}`)
