// 报告生成: 脚本在本机测完一个阶段就 POST /report, 返回排好版的终端报告 (或 format=json)。
//
//   stage=hw       硬件与性能              render/hw.ts
//   stage=ip       IP 质量 (按出口各一次)   render/base.ts + render/ip.ts + render/local.ts
//   stage=net      网络质量                render/net.ts
//   stage=route    回程路由详情 (逐跳)      render/net.ts
//   stage=summary  体检总览 (跑了两项以上时, 脚本把全部字段再交一次)
//
// 只查调用者自己的出口 IP, 不接受指定目标; 不设次数上限, 限流只防同一出口短时间内反复刷。
//
// 表单字段见 check.sh 各阶段注释与 render/local.ts 顶注; 另有:
//   v=1.1.0  lang=zh|en  color=0|1  format=json  stage=…  seq=本次运行的第几次提交 (1 才计数)
//   stages=本次计划跑几项  via=proxy  dur=阶段耗时秒  deep=1  banner=1 (脚本已打印开头字符画)
//   run=本次运行的随机密钥 (32 位十六进制): 带上时各阶段存进结果页, 最后的页脚给出链接 (server/results.ts)

import { hitStats, recordHit } from "./hits"
import { rateLimit, rateLimitKey } from "./limit"
import { createRenderer, langOf, renderHeader, renderIpSections, stageBar, type Renderer } from "./render/base"
import { HW_TITLE, parseHw, renderHw } from "./render/hw"
import { renderIpDetail } from "./render/ip"
import { parseIpcheckFields, renderLocalSections } from "./render/local"
import { NET_TITLE, parseNet, renderNet, renderRouteDetail, ROUTE_TITLE, type HopInfo } from "./render/net"
import { classifyRoute } from "./render/route"
import { renderSummary } from "./render/summary"
import { hwFact, ipFact, isRunKey, netFacts, saveSection, type Fact, type FactKey, type SectionKey } from "./results"
import { bgpInfo, fetchIp, geoLookup, resolveDns } from "./upstream"

export type Form = Record<string, string | string[]>

export interface Reply {
  status: number
  headers: Record<string, string>
  body: string
}

const text = (status: number, body: string, headers: Record<string, string> = {}): Reply =>
  ({ status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...headers }, body })

const json = (value: unknown): Reply =>
  ({ status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body: JSON.stringify(value) })

const STAGES = ["hw", "ip", "net", "route", "summary"] as const

/** 总览的用时: 脚本把各阶段的 dur 都交上来 (同名字段解析成数组) 时求和 */
function sumDur(v: string | string[] | undefined): number {
  return (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === "string" && /^\d{1,5}$/.test(x)).map(Number).reduce((a, b) => a + b, 0)
}

export async function handleReport(body: Form, caller: string): Promise<Reply> {
  const one = (k: string) => (typeof body[k] === "string" ? body[k] : undefined)
  const lang = langOf(one("lang"))
  const zh = lang === "zh"
  const asJson = one("format") === "json"
  const version = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(one("v") || "") ? one("v")! : ""
  const stage = STAGES.find((s) => s === one("stage"))
  if (!stage) return text(400, zh ? "请更新脚本: bash <(curl -Ls https://sh.cd)\n" : "Please update the script: bash <(curl -Ls https://sh.cd)\n")
  if (!caller) return text(400, zh ? "未能识别你的出口 IP, 请稍后重试。\n" : "Could not detect your public IP. Please try again later.\n")

  const limited = rateLimit(rateLimitKey(caller), 40, 10 * 60_000)
  if (!limited.ok) {
    return text(429, zh ? `检测过于频繁, 请 ${limited.retryAfterSec} 秒后重试。\n` : `Too many checks. Please retry in ${limited.retryAfterSec} seconds.\n`,
      { "retry-after": String(limited.retryAfterSec) })
  }

  // 每次运行只在第一次提交时计一次 (一次全检会提交好几次)
  const hits = one("seq") === "1" ? recordHit() : hitStats()
  const dur = /^\d{1,5}$/.test(one("dur") || "") ? Number(one("dur")) : null
  const single = one("stages") === "1"

  // 文本报告里本机所在网段的 IP 只留前两段, 截图可以直接分享; JSON 是给用户自己存档的, 保留完整数据
  const R = createRenderer(lang, one("color") === "1", caller)
  const { paint } = R
  const out: string[] = []
  const done = () => text(200, out.join("\n"))
  // 结果页: JSON 输出不保存
  const runKey = !asJson && isRunKey(one("run")) ? one("run")! : null
  const planned = /^\d{1,2}$/.test(one("stages") || "") ? Number(one("stages")) : 1
  const blocked = () => text(403, zh
    ? "当前出口 IP 因程序化抓取已被限制访问。\n如属误封请到 https://cleanip.io/feedback 反馈。\n"
    : "This IP has been restricted due to automated scraping.\nIf this is a mistake, let us know at https://cleanip.io/feedback\n")

  const header = (stageTitle: string) => {
    // 脚本已经在终端里打印了开头字符画 (banner=1) 时不再重复报告头
    if (one("seq") !== "1") {
      out.push("")
    } else if (one("banner") !== "1") {
      out.push(...renderHeader(R,
        zh ? "服务器体检 · 硬件与性能 · IP 质量 · 网络质量" : "Server check-up · Hardware · IP quality · Network",
        `sh.cd${version ? ` v${version}` : ""}`))
    }
    out.push(stageBar(R, stageTitle, dur), "")
  }
  const footer = (link: string | null) => {
    out.push("")
    if (link) out.push(`  ${paint(zh ? "查看与分享" : "View & share", "gray")}  ${paint(link, "brand", "bold")}`, "")
    const today = hits.today.toLocaleString("en-US")
    const total = hits.total.toLocaleString("en-US")
    out.push(paint(zh ? `  脚本检测: 今日 ${today} 次 · 累计 ${total} 次` : `  Script runs: ${today} today · ${total} total`, "gray"))
    out.push(paint(zh ? "  源码: https://github.com/CleanIP/sh.cd" : "  Source: https://github.com/CleanIP/sh.cd", "gray"))
    out.push("")
  }
  /**
   * 输出一个阶段: 终端报告 = 报告头与阶段标题条 + 内容 (+ 页脚)。
   * 带运行密钥时, 同样的内容再按彩色 / 纯文本各排一次存进结果页 (build 必须是纯函数)。
   */
  const emit = (key: SectionKey, title: string | null, build: (X: Renderer) => string[], withFooter: boolean, facts: Partial<Record<FactKey, Fact>> = {}) => {
    let link: string | null = null
    if (runKey) {
      const section = (X: Renderer) => [...(title ? [stageBar(X, title, dur), ""] : []), ...build(X)].join("\n")
      link = saveSection(runKey, { lang, version, planned, ip: R.ip(caller) },
        { key, dur: title ? dur : null, ansi: section(createRenderer(lang, true, caller)), plain: section(createRenderer(lang, false, caller)) }, facts)
    }
    if (title) header(title)
    else out.push("")
    out.push(...build(R))
    if (withFooter) footer(link)
    return done()
  }
  const line = (routes: { carrier: Parameters<typeof classifyRoute>[0], hops: Parameters<typeof classifyRoute>[1] }) =>
    routes.hops.length ? classifyRoute(routes.carrier, routes.hops).code : "no_reply"

  // —— 硬件与性能 ——
  if (stage === "hw") {
    const hw = parseHw(body)
    if (asJson) return json({ ok: true, stage, hardware: hw })
    const fact = hw ? hwFact(hw, lang) : null
    return emit("hw", zh ? HW_TITLE[0] : HW_TITLE[1], (X) => (hw ? renderHw(X, hw) : []), single, fact ? { hw: fact } : {})
  }

  // —— 回程路由详情: 每一跳查归属 (只用本地地理库) ——
  if (stage === "route") {
    const net = parseNet(body)
    const ips = [...new Set([...(net?.routes || []), ...(net?.routes6 || [])].flatMap((r) => r.hops.map((h) => h.ip)))]
      .filter((ip) => !/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|f[cd]|fe80)/i.test(ip)).slice(0, 160)
    const geo = await geoLookup(ips, caller)
    const hops: Record<string, HopInfo> = {}
    for (const ip of ips) {
      const row = geo[ip]
      if (!row) continue
      const place = zh ? [row.geo?.country, row.geo?.region !== row.geo?.city ? row.geo?.region : "", row.geo?.city] : [row.geo?.country_en || row.geo?.country, row.geo?.city]
      hops[ip] = { asn: row.network?.asn || undefined, org: row.network?.asn_org || row.network?.asn_name || undefined, place: place.filter(Boolean).join(" ") || undefined }
    }
    const withInfo = (rows: NonNullable<typeof net>["routes"] | undefined) => rows?.map((r) => ({ ...r, line: line(r), hops: r.hops.map((h) => ({ ...h, ...hops[h.ip] })) }))
    if (asJson) return json({ ok: true, stage, routes: withInfo(net?.routes), routes6: withInfo(net?.routes6) })
    // 全部检测时后面还有总览, 页脚留给总览; 网络质量阶段已经给过三网线路要点, 单独跑回程详情时才补
    const facts = net && single ? netFacts(net, lang) : {}
    return emit("route", zh ? ROUTE_TITLE[0] : ROUTE_TITLE[1], (X) => (net ? renderRouteDetail(X, net, hops) : []), single, facts)
  }

  // —— 网络质量 ——
  if (stage === "net") {
    const net = parseNet(body)
    const bgp = await bgpInfo((await fetchIp(caller)).r)
    if (asJson) return json({ ok: true, stage, network: net && { ...net, routes: net.routes.map((r) => ({ ...r, line: line(r) })), routes6: net.routes6.map((r) => ({ ...r, line: line(r) })) }, bgp })
    return emit("net", zh ? NET_TITLE[0] : NET_TITLE[1], (X) => (net ? renderNet(X, net, bgp) : []), single, net ? netFacts(net, lang) : {})
  }

  // —— 体检总览 ——
  if (stage === "summary") {
    const { r, blocked: isBlocked } = await fetchIp(caller)
    if (isBlocked) return blocked()
    const local = parseIpcheckFields(body)
    const parts = {
      hw: parseHw(body),
      ip: r,
      local: Object.keys(local.media).length || local.mail ? local : null,
      net: parseNet(body),
      took: sumDur(body.dur),
    }
    return emit("summary", null, (X) => renderSummary(X, parts), true)
  }

  // —— IP 质量 ——
  const local = parseIpcheckFields(body)
  const [ipResult, dns] = await Promise.all([
    fetchIp(caller),
    local.dnsUuid ? resolveDns(local.dnsUuid, caller, lang) : Promise.resolve(null),
  ])
  if (ipResult.blocked) return blocked()
  const r = ipResult.r
  if (asJson) {
    return json({ ok: true, stage, ip: r, local: { media: local.media, mail: local.mail, dns } })
  }
  const key: SectionKey = one("via") === "proxy" ? "ipp" : caller.includes(":") ? "ip6" : "ip4"
  const fact = r ? ipFact(r, lang) : null
  return emit(key, zh ? "IP 质量" : "IP quality", (X) => [
    ...(r
      ? [...renderIpSections(X, { ...r, ip: r.ip! }), ...renderIpDetail(X, r)]
      : [X.row(zh ? "IP 情报" : "IP intel", X.paint(zh ? "暂时获取失败, 请稍后重试" : "Temporarily unavailable, please retry later", "yellow")), X.hr()]),
    ...renderLocalSections(X, local, dns),
  ], single, fact ? { ip: fact } : {})
}
