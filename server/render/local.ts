// sh.cd 检测脚本 (github.com/CleanIP/sh.cd) 提交上来的本机检测结果: 解析 + 排版。
//
// 脚本在用户机器上测流媒体 / AI 解锁、邮件 25 端口、三网 TCP 延迟与回程线路、DNS 出口、带宽, 以表单字段提交:
//   media_<服务>=yes|US       yes | no | originals | web | fail, 竖线后是地区码 (Gemini 为三位码)
//   mail_<邮箱>=ok|fail
//   lat_<省>_<ct|cu|cm>=155.1|0   毫秒|4 次里失败次数, 或 fail
//   rt_<bj|sh|gd>_<ct|cu|cm>=3:59.43.1.1,4:202.97.1.1   回程逐跳 TTL:IP, 一跳都没回应为 none
//   sp_<n>=<near|ct|cu|cm>|<节点>|<下载 Mbps>|<上传 Mbps>   测不出为 fail; 节点: 就近节点为城市名原文, 三网为省份代码
//   dns=<32 位 hex>          DNS 探针的一次性 uuid
// 字段一律按白名单 + 正则收, 不认识的丢掉 —— 这些值会原样进终端报告, 不能让人塞控制符进来。

import { pad, width, type Lang, type Pair, type Renderer, type Tone } from "./base"
import { classifyRoute, type RouteHop } from "./route"

export const MEDIA = [
  ["netflix", "Netflix", "stream"],
  ["disney", "Disney+", "stream"],
  ["youtube", "YouTube Premium", "stream"],
  ["tiktok", "TikTok", "stream"],
  ["prime", "Prime Video", "stream"],
  ["reddit", "Reddit", "stream"],
  ["chatgpt", "ChatGPT", "ai"],
  ["claude", "Claude", "ai"],
  ["gemini", "Gemini", "ai"],
] as const

export const MAIL = [
  ["gmail", "Gmail"],
  ["outlook", "Outlook"],
  ["yahoo", "Yahoo"],
  ["icloud", "iCloud"],
  ["qq", "QQ"],
  ["163", "163"],
  ["mailru", "Mail.ru"],
  ["aol", "AOL"],
  ["gmx", "GMX"],
  ["mailcom", "Mail.com"],
  ["sohu", "Sohu"],
  ["sina", "Sina"],
] as const

export const PROVINCES: Array<[code: string, zh: string, en: string]> = [
  ["bj", "北京", "Beijing"], ["tj", "天津", "Tianjin"], ["he", "河北", "Hebei"], ["sx", "山西", "Shanxi"], ["nm", "内蒙古", "Inner Mongolia"],
  ["ln", "辽宁", "Liaoning"], ["jl", "吉林", "Jilin"], ["hl", "黑龙江", "Heilongjiang"],
  ["sh", "上海", "Shanghai"], ["js", "江苏", "Jiangsu"], ["zj", "浙江", "Zhejiang"], ["ah", "安徽", "Anhui"], ["fj", "福建", "Fujian"], ["jx", "江西", "Jiangxi"], ["sd", "山东", "Shandong"],
  ["ha", "河南", "Henan"], ["hb", "湖北", "Hubei"], ["hn", "湖南", "Hunan"],
  ["gd", "广东", "Guangdong"], ["gx", "广西", "Guangxi"], ["hi", "海南", "Hainan"],
  ["cq", "重庆", "Chongqing"], ["sc", "四川", "Sichuan"], ["gz", "贵州", "Guizhou"], ["yn", "云南", "Yunnan"], ["xz", "西藏", "Tibet"],
  ["sn", "陕西", "Shaanxi"], ["gs", "甘肃", "Gansu"], ["qh", "青海", "Qinghai"], ["nx", "宁夏", "Ningxia"], ["xj", "新疆", "Xinjiang"],
]

// 回程线路的测试目标城市, 与 check.sh ROUTE_TARGETS 一致
export const ROUTE_CITIES: Array<[code: string, zh: string, en: string]> = [
  ["bj", "北京", "Beijing"], ["sh", "上海", "Shanghai"], ["gd", "广州", "Guangzhou"],
]

const CARRIERS = ["ct", "cu", "cm"] as const
type Carrier = typeof CARRIERS[number]

export type MediaStatus = "yes" | "no" | "originals" | "web" | "fail"

export interface IpcheckLocal {
  media: Record<string, { status: MediaStatus, region: string }>
  /** 没测 (IPv6 / 代理 / 指定网卡 / -S mail) 时为 null */
  mail: Record<string, boolean> | null
  latency: Array<{ province: string, carrier: Carrier, ms: number | null, lost: number }>
  /** hops 为空数组 = 一跳都没回应 */
  routes: Array<{ city: string, carrier: Carrier, hops: RouteHop[] }>
  /** 没测 (没加 -s / 非 Linux / 代理) 时为 null */
  speed: Array<{ carrier: "near" | Carrier, name: string, down: number | null, up: number | null }> | null
  dnsUuid: string | null
}

export interface DnsResolver {
  ip: string
  asn?: number
  org?: string
  country?: string
}

const str = (v: unknown) => (typeof v === "string" ? v : "")

export function parseIpcheckFields(body: Record<string, unknown>): IpcheckLocal {
  const local: IpcheckLocal = { media: {}, mail: null, latency: [], routes: [], speed: null, dnsUuid: null }

  for (const [key] of MEDIA) {
    const m = /^(yes|no|originals|web|fail)(?:\|([A-Z]{2,3})?)?$/.exec(str(body[`media_${key}`]))
    if (m) local.media[key] = { status: m[1] as MediaStatus, region: m[2] || "" }
  }

  for (const [key] of MAIL) {
    const v = str(body[`mail_${key}`])
    if (v !== "ok" && v !== "fail") continue
    local.mail ??= {}
    local.mail[key] = v === "ok"
  }

  for (const [prov] of PROVINCES) {
    for (const carrier of CARRIERS) {
      const v = str(body[`lat_${prov}_${carrier}`])
      if (v === "fail") {
        local.latency.push({ province: prov, carrier, ms: null, lost: 4 })
        continue
      }
      const m = /^(\d{1,5}(?:\.\d)?)\|([0-4])$/.exec(v)
      if (m) local.latency.push({ province: prov, carrier, ms: Number(m[1]), lost: Number(m[2]) })
    }
  }

  for (const [city] of ROUTE_CITIES) {
    for (const carrier of CARRIERS) {
      const v = str(body[`rt_${city}_${carrier}`])
      if (v === "none") {
        local.routes.push({ city, carrier, hops: [] })
        continue
      }
      if (!/^\d{1,2}:(?:\d{1,3}\.){3}\d{1,3}(?:,\d{1,2}:(?:\d{1,3}\.){3}\d{1,3}){0,59}$/.test(v)) continue
      const hops = v.split(",").map((h) => {
        const [ttl, ip] = h.split(":")
        return { ttl: Number(ttl), ip: ip! }
      })
      local.routes.push({ city, carrier, hops })
    }
  }

  for (let n = 1; n <= 9; n++) {
    // 就近节点名是 Speedtest 列表里的城市名, 只收字母数字与常见标点; 三网节点只收省份代码, 名字由报告按语言生成
    const m = /^(near|ct|cu|cm)\|([\p{L}\p{N} .,()'-]{1,40})\|(\d{1,6}(?:\.\d)?|fail)\|(\d{1,6}(?:\.\d)?|fail)$/u.exec(str(body[`sp_${n}`]))
    if (!m) continue
    if (m[1] !== "near" && !PROVINCES.some(([code]) => code === m[2])) continue
    local.speed ??= []
    local.speed.push({
      carrier: m[1] as "near" | Carrier,
      name: m[2]!.trim(),
      down: m[3] === "fail" ? null : Number(m[3]),
      up: m[4] === "fail" ? null : Number(m[4]),
    })
  }

  const dns = str(body.dns)
  if (/^[0-9a-f]{32}$/.test(dns)) local.dnsUuid = dns
  return local
}

// Gemini 给的是三位国家码; 只收常见的, 认不出就原样显示
const ALPHA3: Record<string, string> = {
  USA: "US", CAN: "CA", MEX: "MX", BRA: "BR", ARG: "AR", CHL: "CL", GBR: "GB", IRL: "IE", FRA: "FR", DEU: "DE",
  NLD: "NL", BEL: "BE", LUX: "LU", CHE: "CH", AUT: "AT", ITA: "IT", ESP: "ES", PRT: "PT", SWE: "SE", NOR: "NO",
  DNK: "DK", FIN: "FI", ISL: "IS", POL: "PL", CZE: "CZ", HUN: "HU", ROU: "RO", BGR: "BG", GRC: "GR", TUR: "TR",
  UKR: "UA", RUS: "RU", ISR: "IL", ARE: "AE", SAU: "SA", IND: "IN", PAK: "PK", BGD: "BD", THA: "TH", VNM: "VN",
  MYS: "MY", SGP: "SG", IDN: "ID", PHL: "PH", KHM: "KH", HKG: "HK", MAC: "MO", TWN: "TW", CHN: "CN", JPN: "JP",
  KOR: "KR", AUS: "AU", NZL: "NZ", ZAF: "ZA", EGY: "EG", NGA: "NG", KEN: "KE", KAZ: "KZ", LVA: "LV", LTU: "LT",
  EST: "EE", SVK: "SK", SVN: "SI", HRV: "HR", SRB: "RS", MDA: "MD", GEO: "GE", ARM: "AM", AZE: "AZ", MNG: "MN",
}
function regionCode(r: string): string {
  return r.length === 3 ? (ALPHA3[r] || r) : r
}

const T = {
  subtitle: ["IP 质量 · 流媒体解锁 · 邮件端口 · 三网延迟与线路", "IP quality · Streaming & AI · Mail · China routes"],
  media: ["流媒体 / AI 解锁", "Streaming & AI"],
  yesStream: ["解锁", "Unlocked"],
  yesAi: ["可用", "Available"],
  originals: ["仅自制剧", "Originals only"],
  web: ["仅网页版", "Web only"],
  no: ["不可用", "Unavailable"],
  fail: ["检测失败", "Check failed"],
  mail: ["邮件", "Mail"],
  port25: ["25 端口出站", "Outbound port 25"],
  open: ["开放", "Open"],
  blocked: ["不通", "Blocked"],
  blockedHint: ["多为服务商封禁了 25 端口", "Usually blocked by the provider"],
  handshake: ["邮箱握手", "SMTP handshake"],
  latency: ["三网延迟 (TCP)", "China carrier latency (TCP)"],
  ct: ["电信", "Telecom"],
  cu: ["联通", "Unicom"],
  cm: ["移动", "Mobile"],
  timeout: ["超时", "timeout"],
  lost: ["丢", "loss"],
  route: ["三网回程线路", "Return routes to China"],
  routeNone: ["无回应", "No reply"],
  routeLegend: ["精品线路: CN2 GIA · CTGNET · 9929 · CMIN2", "Premium: CN2 GIA · CTGNET · 9929 · CMIN2"],
  speed: ["带宽测速", "Bandwidth"],
  down: ["下载", "Download"],
  up: ["上传", "Upload"],
  near: ["就近", "Nearby"],
  speedFail: ["连接失败", "Failed"],
  noNode: ["暂无境外可用的测速节点", "No test server reachable from abroad"],
  dns: ["DNS 出口", "DNS resolvers"],
  dnsNone: ["未捕获到 (系统 DNS 可能有缓存或被拦截)", "None captured (cached or intercepted)"],
  unknown: ["未知", "Unknown"],
} satisfies Record<string, Pair>

export function ipcheckSubtitle(lang: Lang): string {
  return T.subtitle[lang === "zh" ? 0 : 1]
}

function latencyTone(ms: number): Tone {
  // 境外到国内 150ms 上下是常态, 只把明显好的标绿、明显差的标黄
  return ms < 100 ? "good" : ms < 200 ? "neutral" : "warn"
}

/** 本机检测的几段报告, 每段以分隔线结尾。没测的段整段不出。 */
export function renderLocalSections(R: Renderer, local: IpcheckLocal, dns: DnsResolver[] | null): string[] {
  const { L, paint, tonePaint, badge, hr, row, lang } = R
  const title = (p: Pair) => `  ${paint(L(p), "bold")}`
  const out: string[] = []

  const mediaRows = MEDIA.filter(([key]) => local.media[key])
  if (mediaRows.length) {
    out.push(title(T.media))
    for (const [key, name, kind] of mediaRows) {
      const { status, region } = local.media[key]!
      const [text, tone]: [Pair, Tone] = status === "yes"
        ? [kind === "ai" ? T.yesAi : T.yesStream, "good"]
        : status === "originals" ? [T.originals, "warn"]
          : status === "web" ? [T.web, "warn"]
            : status === "no" ? [T.no, "bad"]
              : [T.fail, "neutral"]
      const code = region ? regionCode(region) : ""
      out.push(row(name, badge(L(text), tone) + (code && status !== "fail" ? paint(`  ${code}`, "gray") : "")))
    }
    out.push(hr())
  }

  if (local.mail) {
    const results = MAIL.filter(([key]) => local.mail![key] !== undefined)
    const anyOk = results.some(([key]) => local.mail![key])
    out.push(title(T.mail))
    out.push(row(L(T.port25), anyOk
      ? badge(L(T.open), "good")
      : badge(L(T.blocked), "bad") + paint(`  ${L(T.blockedHint)}`, "gray")))
    if (anyOk) {
      const marks = results.map(([key, name]) => pad(name, 9) + (local.mail![key] ? tonePaint("✓", "good") : tonePaint("✗", "bad")))
      // 一行 3 个, 6 个挤一行会超出报告宽度; 名字补齐到同宽, 上下两行才对得齐
      for (let i = 0; i < marks.length; i += 3) {
        out.push(row(i === 0 ? L(T.handshake) : "", marks.slice(i, i + 3).join("   ")))
      }
    }
    out.push(hr())
  }

  if (local.latency.length) {
    // 最长的格子是 "1164 ms loss2" (13 列), 留 1 列间隔。省名最长 "Inner Mongolia" 14 列,
    // 这张表的标签列中英文都用 16, 不跟英文报告的 20: 2 + 16 + 3×14 = 60, 放得进 62
    const COL = 14
    const latRow = (label: string, value: string) => `  ${pad(label, 16)}${value}`
    out.push(title(T.latency))
    out.push(latRow("", CARRIERS.map((c) => paint(pad(L(T[c]), COL), "gray")).join("").trimEnd()))
    const cell = (v?: { ms: number | null, lost: number }) => {
      if (!v) return pad("-", COL)
      if (v.ms === null) return tonePaint(pad(L(T.timeout), COL), "bad")
      const s = `${Math.round(v.ms)} ms${v.lost ? ` ${L(T.lost)}${v.lost}` : ""}`
      return tonePaint(pad(s, COL), v.lost ? "warn" : latencyTone(v.ms))
    }
    for (const [code, zh, en] of PROVINCES) {
      const cells = local.latency.filter((x) => x.province === code)
      if (!cells.length) continue
      out.push(latRow(lang === "zh" ? zh : en, CARRIERS.map((c) => cell(cells.find((x) => x.carrier === c))).join("").trimEnd()))
    }
    out.push(hr())
  }

  if (local.routes.length) {
    const COL = 14
    const tableRow = (label: string, value: string) => `  ${pad(label, 16)}${value}`
    out.push(title(T.route))
    out.push(tableRow("", CARRIERS.map((c) => paint(pad(L(T[c]), COL), "gray")).join("").trimEnd()))
    for (const [code, zh, en] of ROUTE_CITIES) {
      const cells = local.routes.filter((x) => x.city === code)
      if (!cells.length) continue
      const value = CARRIERS.map((c) => {
        const r = cells.find((x) => x.carrier === c)
        if (!r) return pad("-", COL)
        if (!r.hops.length) return paint(pad(L(T.routeNone), COL), "gray")
        const cls = classifyRoute(c, r.hops)
        const text = pad(L(cls.label), COL)
        return cls.code === "unknown" ? paint(text, "gray") : tonePaint(text, cls.tone, ...(cls.tone === "good" ? ["bold" as const] : []))
      }).join("").trimEnd()
      out.push(tableRow(lang === "zh" ? zh : en, value))
    }
    out.push(`  ${paint(L(T.routeLegend), "gray")}`)
    out.push(hr())
  }

  if (local.speed) {
    const LABEL = 24
    const COL = 14
    const mbps = (v: number | null) => {
      if (v === null) return tonePaint(pad(L(T.speedFail), COL), "bad")
      const s = v >= 1000 ? `${(v / 1000).toFixed(2)} Gbps` : `${v >= 100 ? Math.round(v) : v.toFixed(1)} Mbps`
      return pad(s, COL)
    }
    // 节点名 (如就近节点的城市) 可能很长, 截到标签列放得下
    const fit = (s: string, max: number) => {
      let o = ""
      for (const ch of s) {
        if (width(o + ch) > max) return o.trimEnd() + "…"
        o += ch
      }
      return o
    }
    // 先补齐宽度再上色, 控制符不能算进宽度
    out.push(`  ${paint(pad(L(T.speed), LABEL), "bold")}${paint(pad(L(T.down), COL) + L(T.up), "gray")}`)
    for (const s of local.speed) {
      const prov = PROVINCES.find(([code]) => code === s.name)
      const label = s.carrier === "near"
        ? `${L(T.near)} ${s.name}`
        : lang === "zh" ? `${prov![1]}${L(T[s.carrier])}` : `${L(T[s.carrier])} ${prov![2]}`
      out.push(`  ${pad(fit(label, LABEL - 2), LABEL)}${s.down === null && s.up === null ? tonePaint(L(T.speedFail), "bad") : (mbps(s.down) + mbps(s.up)).trimEnd()}`)
    }
    // 没有节点的运营商如实写出来, 不拿别的节点冒充
    const missing = CARRIERS.filter((c) => !local.speed!.some((s) => s.carrier === c))
    if (missing.length) {
      out.push(`  ${pad(missing.map((c) => L(T[c])).join(" · "), LABEL)}${paint(L(T.noNode), "gray")}`)
    }
    out.push(hr())
  }

  if (dns) {
    out.push(title(T.dns))
    if (!dns.length) {
      out.push(`  ${paint(L(T.dnsNone), "gray")}`)
    }
    // 公共 DNS 一次会从同一家的好几个节点来问 (洛杉矶实测 Google 6 个), 按归属合并成一行
    const groups = new Map<string, { first: string, info: string, count: number }>()
    for (const d of dns) {
      const info = [d.asn ? `AS${d.asn}${d.org ? " " + d.org : ""}` : "", d.country || ""].filter(Boolean).join(" · ")
      const key = info || d.ip
      const g = groups.get(key)
      if (g) g.count++
      else groups.set(key, { first: d.ip, info: info || L(T.unknown), count: 1 })
    }
    for (const g of groups.values()) {
      const more = g.count > 1 ? paint(lang === "zh" ? `  等 ${g.count} 个节点` : `  +${g.count - 1} more`, "gray") : ""
      // IPv6 地址放不进标签列, 另起一行缩进写归属
      if (g.first.length < R.labelW) out.push(row(g.first, g.info + more))
      else out.push(`  ${g.first}`, row("", g.info + more))
    }
    out.push(hr())
  }

  return out
}
