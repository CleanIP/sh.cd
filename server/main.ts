// sh.cd 服务入口 (Bun, 无第三方依赖)。
//
//   GET  /            curl / wget 拿到检测脚本 check.sh; 浏览器 (Accept 带 text/html) 拿到说明页, ?raw=1 强制返回脚本
//   POST /report      生成报告 (server/report.ts)
//   POST /dns/start   DNS 出口检测: 发一个一次性子域名
//   GET  /changelog   更新日志: 浏览器给网页, curl 给 Markdown 纯文本 (server/changelog.ts)
//   GET  /results/<编号>[.md|.txt]   检测结果页 (server/results.ts)
//   GET  /fonts/*    官网字体 Ioskeley Mono (SIL OFL 1.1, 授权文本 /fonts/OFL.txt)
//   GET  /brand/cleanip-logo.svg   CleanIP logo
//   GET  /healthz
//
// 只监听本机, 由反向代理转发; 访客 IP 取反代写入的 X-Real-IP (反代必须覆盖客户端自带的同名头)。
// 运行: bun run server/main.ts   环境变量见 deploy/sh.cd.env.example

import { readFile, stat } from "node:fs/promises"
import { resolve } from "node:path"
import { changelogPage, changelogText } from "./changelog"
import { hitStats } from "./hits"
import { landingPage } from "./landing"
import { langOf } from "./render/base"
import { handleReport, type Form } from "./report"
import { loadResult, resultMarkdown, resultNotFoundPage, resultPage, resultText, startResultSweeper } from "./results"
import { withHits } from "./site"
import { dnsProbeStart } from "./upstream"

const SCRIPT = resolve(import.meta.dir, "../check.sh")
const FONTS = resolve(import.meta.dir, "../assets/fonts")
// 全省回程 (-R) 一次要交 93 条线路 × 最多三份 (普通 / 大包 / IPv6), 表单编码后比原文大一倍
const MAX_BODY = 400_000

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

/** 网页响应: 页脚的脚本运行次数在这里填 (页面本身有缓存) */
function htmlPage(html: string, lang: ReturnType<typeof langOf>, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(withHits(html, lang, hitStats()), { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...headers } })
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

startResultSweeper()

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
        return htmlPage(landingPage(lang), lang, { vary: "Accept" })
      }
      return script()
    }

    if (url.pathname === "/changelog" && (req.method === "GET" || req.method === "HEAD")) {
      const lang = langOf(url.searchParams.get("lang") ?? ((req.headers.get("accept-language") || "zh").startsWith("zh") ? "zh" : "en"))
      const headers = { "cache-control": "no-cache", vary: "Accept" }
      if ((req.headers.get("accept") || "").includes("text/html") && !url.searchParams.has("raw")) {
        return htmlPage(changelogPage(lang), lang, headers)
      }
      return new Response(changelogText(lang), { headers: { ...headers, "content-type": "text/plain; charset=utf-8" } })
    }

    const result = /^\/results\/([^/.]+)(\.md|\.txt)?$/.exec(url.pathname)
    if (result && (req.method === "GET" || req.method === "HEAD")) {
      const r = loadResult(result[1]!)
      const html = (req.headers.get("accept") || "").includes("text/html") && !result[2] && !url.searchParams.has("raw")
      const lang = url.searchParams.has("lang")
        ? langOf(url.searchParams.get("lang"))
        : r?.lang ?? langOf((req.headers.get("accept-language") || "zh").startsWith("zh") ? "zh" : "en")
      // 运行中的检测会继续往结果里写, 不让中间层缓存旧内容; 结果页不进搜索引擎
      const headers = { "cache-control": "no-cache", "x-robots-tag": "noindex, nofollow", vary: "Accept" }
      if (!r) {
        return html
          ? htmlPage(resultNotFoundPage(lang, url.pathname), lang, headers, 404)
          : new Response(lang === "zh" ? "结果不存在或已过期\n" : "Result not found or expired\n", { status: 404, headers: { ...headers, "content-type": "text/plain; charset=utf-8" } })
      }
      if (result[2] === ".md") {
        return new Response(resultMarkdown(r), { headers: { ...headers, "content-type": "text/markdown; charset=utf-8", "content-disposition": `inline; filename="sh.cd-${r.id}.md"` } })
      }
      if (html) return htmlPage(resultPage(r, lang), lang, headers)
      // 终端里看: curl / wget 默认带颜色, ?color=0 / 1 手动指定; .txt 始终不带颜色
      const ua = (req.headers.get("user-agent") || "").toLowerCase()
      const color = result[2] !== ".txt" && (url.searchParams.has("color") ? url.searchParams.get("color") === "1" : /^(curl|wget)\//.test(ua))
      return new Response(resultText(r, color), { headers: { ...headers, "content-type": "text/plain; charset=utf-8" } })
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

    // 字体按文件名白名单取, 不拼任意路径; 文件名不变内容就不变, 可以长期缓存
    const font = /^\/fonts\/(IoskeleyMono-(?:Regular|SemiBold)\.woff2|OFL\.txt)$/.exec(url.pathname)
    if (font && (req.method === "GET" || req.method === "HEAD")) {
      const file = Bun.file(resolve(FONTS, font[1]!))
      if (await file.exists()) {
        return new Response(file, {
          headers: {
            "content-type": font[1]!.endsWith(".woff2") ? "font/woff2" : "text/plain; charset=utf-8",
            "cache-control": "public, max-age=31536000, immutable",
            "access-control-allow-origin": "*",
          },
        })
      }
    }

    if (url.pathname === "/brand/cleanip-logo.svg" && (req.method === "GET" || req.method === "HEAD")) {
      return new Response(Bun.file(resolve(import.meta.dir, "../assets/brand/cleanip-logo.svg")), {
        headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" },
      })
    }

    if (url.pathname === "/healthz") return new Response("ok\n")
    return new Response("not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } })
  },
})

console.log(`sh.cd listening on ${server.hostname}:${server.port}`)
