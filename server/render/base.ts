// 终端纯文本报告的基础排版: 颜色、对齐、报告头、IP 情报各段。
//
// 文案口径: IP 类型 / 原生广播 / ASN 类型 / 风险等级的中英文与 cleanip.io 网页保持一致, 那边改译名时这里跟着改。

export interface IpReport {
  ok?: boolean
  ip?: string
  ip_version?: number
  hostname?: string
  geo?: Record<string, any>
  network?: Record<string, any>
  risk?: Record<string, any>
  purity?: Record<string, any>
  known_ip?: Record<string, any>
}

/** 报告宽度 (分隔线长度) */
export const W = 62

// —— 颜色 ——
// 品牌绿 #35A952 (与 logo / main.css --color-brand 一致) 用 24 位真彩: 16 色的 32 号绿由终端主题决定,
// 各家深浅不一, 对不上 logo。黄 / 红 / 灰只是状态色, 用 16 色基础码, 兼容性最好。
// 灰色用 90 (亮黑) 而不是 2 (dim), dim 在 Windows Terminal 之外常被忽略。
// 界面里不再用青 / 蓝色 (用户要求: 品牌色只有绿)。
const ANSI = {
  bold: "\x1b[1m",
  underline: "\x1b[4m",
  brand: "\x1b[38;2;53;169;82m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  // 徽章: 底色 + 前景色。绿底配白字 (同网站按钮), 黄底配黑字 (白字在黄底上看不清)
  badgeGood: "\x1b[48;2;53;169;82m\x1b[97m\x1b[1m",
  badgeWarn: "\x1b[43m\x1b[30m\x1b[1m",
  badgeBad: "\x1b[41m\x1b[97m\x1b[1m",
  badgeNeutral: "\x1b[100m\x1b[97m",
} as const
export type Style = keyof typeof ANSI
export type Paint = (s: string, ...styles: Style[]) => string

export type Tone = "good" | "warn" | "bad" | "neutral"
const TONE_TEXT: Record<Tone, Style[]> = { good: ["brand"], warn: ["yellow"], bad: ["red"], neutral: [] }
const TONE_BADGE: Record<Tone, Style> = { good: "badgeGood", warn: "badgeWarn", bad: "badgeBad", neutral: "badgeNeutral" }

function painter(enabled: boolean): Paint {
  if (!enabled) return (s) => s
  return (s, ...styles) => (styles.length ? styles.map((k) => ANSI[k]).join("") + s + "\x1b[0m" : s)
}

const CLI_UA = /^(curl|wget|httpie|xh)\//i

/** ?color=0/1 强制关/开; 否则只有 curl / wget / HTTPie / xh 才上色 (浏览器打开会看到一堆控制符)。 */
export function wantsColor(q: Record<string, unknown>, ua: string): boolean {
  const flag = typeof q.color === "string" ? q.color.toLowerCase() : ""
  if (["0", "false", "no", "off"].includes(flag)) return false
  if (["1", "true", "yes", "on"].includes(flag)) return true
  return CLI_UA.test(ua)
}

// 与后端 score/classify.go 的分档对齐: 纯净度 A (≥85) 以上绿, C (≥50) 以上黄;
// 风险分 Clean (<25) 绿, Low Risk (<50) 以内黄, 其余红。
function purityTone(score: number): Tone {
  return score >= 85 ? "good" : score >= 50 ? "warn" : "bad"
}
function riskTone(score: number): Tone {
  return score < 25 ? "good" : score < 50 ? "warn" : "bad"
}

// —— 文案 ——
export type Lang = "zh" | "en"
export type Pair = [zh: string, en: string]

export function langOf(v: unknown): Lang {
  return typeof v === "string" && v.toLowerCase().startsWith("en") ? "en" : "zh"
}

const IP_TYPES: Record<string, { text: Pair, tone: Tone }> = {
  "Residential IP": { text: ["住宅 IP", "Residential IP"], tone: "good" },
  "Mobile IP": { text: ["移动 IP", "Mobile IP"], tone: "good" },
  "Business IP": { text: ["商业 IP", "Business IP"], tone: "good" },
  "Education IP": { text: ["教育 IP", "Education IP"], tone: "good" },
  "Government IP": { text: ["政府 IP", "Government IP"], tone: "good" },
  "IDC": { text: ["机房 IP", "Datacenter IP"], tone: "warn" },
  "Public DNS": { text: ["公共 DNS", "Public DNS"], tone: "warn" },
  "Root DNS": { text: ["根 DNS", "Root DNS"], tone: "warn" },
  "Public CDN": { text: ["公共 CDN", "Public CDN"], tone: "warn" },
  "Residential Proxy": { text: ["住宅代理", "Residential Proxy"], tone: "warn" },
  "Relay IP": { text: ["中继", "Relay"], tone: "warn" },
  "VPN IP": { text: ["VPN", "VPN"], tone: "bad" },
  "Proxy IP": { text: ["代理", "Proxy"], tone: "bad" },
  "Tor IP": { text: ["Tor", "Tor"], tone: "bad" },
  "Unknown": { text: ["未知", "Unknown"], tone: "neutral" },
}
/** 同 utils/ipDisplay.ts normalizeIpType: hosting / datacenter 各种写法都归到 IDC。 */
function normalizeIpType(t: string): string {
  return ["hosting", "hosting / idc", "hosting ip", "datacenter", "datacenter ip", "idc"].includes(t.trim().toLowerCase()) ? "IDC" : t
}

const NATIVE: Record<string, { text: Pair, tone: Tone }> = {
  "Native IP": { text: ["原生 IP", "Native IP"], tone: "good" },
  "Broadcast IP": { text: ["广播 IP", "Broadcast IP"], tone: "warn" },
  "Unannounced IP": { text: ["未通告", "Unannounced"], tone: "neutral" },
}

const ASN_TYPES: Record<string, Pair> = {
  isp: ["ISP", "ISP"],
  residential: ["ISP", "ISP"],
  hosting: ["IDC", "IDC"],
  datacenter: ["IDC", "IDC"],
  cdn: ["CDN", "CDN"],
  content: ["内容/CDN", "Content/CDN"],
  business: ["企业", "Business"],
  education: ["教育", "Education"],
  government: ["政府", "Government"],
  mobile: ["移动", "Mobile"],
  cellular: ["移动", "Mobile"],
  banking: ["金融", "Finance"],
  inactive: ["未启用", "Inactive"],
}

const RISK_LEVELS: Record<string, Pair> = {
  "Very Clean": ["极低风险", "Very low risk"],
  "Clean": ["低风险", "Low risk"],
  "Neutral": ["中性", "Neutral"],
  "Low Risk": ["低风险", "Low risk"],
  "Medium": ["中等风险", "Medium risk"],
  "Medium Risk": ["中等风险", "Medium risk"],
  "High": ["高风险", "High risk"],
  "High Risk": ["高风险", "High risk"],
  "Critical": ["极高风险", "Critical risk"],
  "Critical Risk": ["极高风险", "Critical risk"],
}

const TEXT = {
  ip: ["IP", "IP"],
  rdns: ["rDNS", "rDNS"],
  location: ["归属地", "Location"],
  asn: ["运营商 / ASN", "ISP / ASN"],
  asnType: ["网络类型", "Network type"],
  ipType: ["IP 类型", "IP type"],
  native: ["原生 / 广播", "Native / Broadcast"],
  residential: ["住宅概率", "Residential prob."],
  purity: ["纯净度评分", "Purity score"],
  riskScore: ["风险评分", "Risk score"],
  lowerBetter: ["← 越低越好", "← lower is better"],
  flags: ["风险标记", "Risk flags"],
  noFlags: ["未检出", "None detected"],
  abuse: ["滥用举报", "Abuse reports"],
  known: ["已知服务", "Known service"],
  unknown: ["未知", "Unknown"],
} satisfies Record<string, Pair>

function flagLabels(lang: Lang): Array<[field: string, text: string, tone: Tone]> {
  const zh = lang === "zh"
  return [
    ["is_vpn", "VPN", "bad"],
    ["is_proxy", zh ? "代理" : "Proxy", "bad"],
    ["is_residential_proxy", zh ? "住宅代理" : "Residential proxy", "bad"],
    ["is_tor", "Tor", "bad"],
    ["is_datacenter", zh ? "数据中心" : "Datacenter", "warn"],
    ["is_hosting", zh ? "主机托管" : "Hosting", "warn"],
    ["is_relay", zh ? "中继" : "Relay", "warn"],
    // 移动网络本身不是风险, 只做中性提示
    ["is_mobile", zh ? "移动网络" : "Mobile network", "neutral"],
  ]
}

const HAS_CJK = /[一-鿿]/

/** 中文字符按 2 列宽计, 保证等宽终端里对齐。 */
export function width(s: string): number {
  let n = 0
  for (const ch of s) n += /[一-鿿　-〿＀-￯]/.test(ch) ? 2 : 1
  return n
}
export function pad(s: string, to: number): string {
  return s + " ".repeat(Math.max(0, to - width(s)))
}

/**
 * 0-100 分画成 20 格进度条。
 * 纯文本模式保持 ASCII `[####----]`, 任何终端、任何编码都不会乱;
 * 彩色模式能进到这里的都是 curl/wget, 用实心块 + 灰色空槽, 填充段按分档着色。
 */
function bar(score: number, tone: Tone, paint: Paint, color: boolean): string {
  const filled = Math.round((Math.max(0, Math.min(100, score)) / 100) * 20)
  if (!color) return "[" + "#".repeat(filled) + "-".repeat(20 - filled) + "]"
  return paint("█".repeat(filled), ...TONE_TEXT[tone]) + paint("░".repeat(20 - filled), "gray")
}

/**
 * logo: 单个品牌绿方块。终端字符格高约为宽的 2 倍, 两个全块 █ 并排才接近正方形。
 * (09-15 先试过用半块字符画 3 行圆环, 用户看了觉得不像, 改成方块。)
 */
const LOGO = "██"

export interface Renderer {
  lang: Lang
  color: boolean
  L: (p: Pair) => string
  paint: Paint
  tonePaint: (s: string, tone: Tone, ...extra: Style[]) => string
  /** 徽章: 彩色模式是带底色的色块, 纯文本模式退化成 [文字] */
  badge: (s: string, tone: Tone) => string
  hr: (ch?: string) => string
  row: (label: string, value: string) => string
  labelW: number
}

export function createRenderer(lang: Lang, color: boolean): Renderer {
  const paint = painter(color)
  // 英文标签比中文长 ("Native / Broadcast" 18 列), 标签列跟着放宽
  const labelW = lang === "zh" ? 16 : 20
  return {
    lang,
    color,
    L: (p) => p[lang === "zh" ? 0 : 1],
    paint,
    tonePaint: (s, tone, ...extra) => paint(s, ...TONE_TEXT[tone], ...extra),
    badge: (s, tone) => (color ? paint(` ${s} `, TONE_BADGE[tone]) : `[${s}]`),
    hr: (ch = "─") => paint(ch.repeat(W), ch === "═" ? "brand" : "gray"),
    row: (label, value) => `  ${pad(label, labelW)}${value}`,
    labelW,
  }
}

/** CLEAN IP 字符画 (ANSI Shadow 字体), 与 check.sh 的 SHCD_LOGO 逐字一致 (tests/banner.test.ts 核对) */
export const BANNER_LOGO = [
  " ██████╗██╗     ███████╗ █████╗ ███╗   ██╗   ██╗██████╗",
  "██╔════╝██║     ██╔════╝██╔══██╗████╗  ██║   ██║██╔══██╗",
  "██║     ██║     █████╗  ███████║██╔██╗ ██║   ██║██████╔╝",
  "██║     ██║     ██╔══╝  ██╔══██║██║╚██╗██║   ██║██╔═══╝",
  "╚██████╗███████╗███████╗██║  ██║██║ ╚████║   ██║██║",
  " ╚═════╝╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝╚═╝",
]

/** 脚本开头: 空行 + 字符画 (方块品牌绿、阴影灰) + 空行 + 副标题 + 标语 + 空行。和 check.sh print_banner 输出一致 */
export function renderBanner(R: Renderer, subtitle: string, tagline: string): string[] {
  const { paint } = R
  const logo = (line: string) => line.split(/(█+)/).map((seg) => (!seg ? "" : seg.startsWith("█") ? paint(seg, "brand") : paint(seg, "gray"))).join("")
  return ["", ...BANNER_LOGO.map((line) => `  ${logo(line)}`), "", `  ${paint(subtitle, "bold")}`, `  ${paint(tagline, "gray")}`, ""]
}

/** 品牌头: 空行 + 方块 logo + CleanIP.io + 副标题 + 标语 + 双线 + 空行。副标题 + 8 列缩进总宽不要超过 W。 */
export function renderHeader(R: Renderer, subtitle: string, tagline: string): string[] {
  const { paint } = R
  return [
    "",
    // 副标题 / 标语与品牌名左对齐 (缩进 = 2 + 方块 2 + 间隔 2)
    `  ${paint(LOGO, "brand")}  ${paint("CleanIP.io", "brand", "bold")}`,
    `        ${paint(subtitle, "bold")}`,
    `        ${paint(tagline, "gray")}`,
    R.hr("═"),
    "",
  ]
}

/** 阶段标题条: 方块 + 标题 + 细线 + 用时 */
export function stageBar(R: Renderer, title: string, dur: number | null): string {
  const { paint, lang } = R
  const took = dur === null ? "" : dur >= 60
    ? (lang === "zh" ? `用时 ${Math.floor(dur / 60)} 分 ${dur % 60} 秒` : `took ${Math.floor(dur / 60)}m ${dur % 60}s`)
    : (lang === "zh" ? `用时 ${dur} 秒` : `took ${dur}s`)
  const fill = Math.max(2, W - 2 - 2 - 2 - width(title) - 2 - width(took) - (took ? 1 : 0))
  return `  ${paint("██", "brand")}  ${paint(title, "bold")}  ${paint("─".repeat(fill), "gray")}${took ? " " + paint(took, "gray") : ""}`
}

/** IP 基本信息 + 评分两段, 到评分段结尾的分隔线为止。 */
export function renderIpSections(R: Renderer, r: IpReport & { ip: string }): string[] {
  const { lang, L, paint, tonePaint, badge, hr, row, color } = R
  const text = (key: keyof typeof TEXT) => L(TEXT[key])
  const geo = r.geo || {}
  const net = r.network || {}
  const risk = r.risk || {}
  const pur = r.purity || {}

  // 英文版: 国家用后端 country_en; 省市目前只有中文名 (英文锚点已丢失), 含中文就不显示
  const loc = (lang === "zh"
    ? [geo.country, geo.region, geo.city]
    : [geo.country_en || geo.country, geo.region, geo.city].filter((s) => !HAS_CJK.test(String(s || "")))
  ).filter(Boolean).join(" · ") || text("unknown")
  const asn = net.asn ? `AS${net.asn}${net.asn_name ? " " + net.asn_name : ""}` : text("unknown")
  const score = typeof pur.score === "number" ? pur.score : null

  const out: string[] = []
  out.push(row(text("ip"), paint(r.ip, "bold") + (r.ip_version ? paint(`  (IPv${r.ip_version})`, "gray") : "")))
  if (r.hostname) out.push(row(text("rdns"), r.hostname))
  out.push(row(text("location"), loc))
  out.push(row(text("asn"), asn))
  if (net.asn_type) {
    const t = ASN_TYPES[String(net.asn_type).toLowerCase().trim()]
    out.push(row(text("asnType"), t ? L(t) : String(net.asn_type)))
  }
  if (pur.ip_type) {
    const raw = normalizeIpType(String(pur.ip_type))
    const t = IP_TYPES[raw]
    out.push(row(text("ipType"), t ? badge(L(t.text), t.tone) : badge(raw, "neutral")))
  }
  if (pur.native_label) {
    const raw = String(pur.native_label)
    const t = NATIVE[raw]
    out.push(row(text("native"), t ? badge(L(t.text), t.tone) : badge(raw, "neutral")))
  }
  if (typeof pur.residential_probability === "number") {
    out.push(row(text("residential"), `${pur.residential_probability}%`))
  }
  out.push("")
  out.push(hr())
  if (score !== null) {
    const tone = purityTone(score)
    const grade = pur.grade ? tonePaint(` (${pur.grade})`, tone, "bold") : ""
    out.push(row(text("purity"), `${bar(score, tone, paint, color)} ${tonePaint(`${score}`, tone, "bold")}/100${grade}`))
  }
  if (typeof risk.risk_score === "number") {
    const tone = riskTone(risk.risk_score)
    const level = risk.risk_label ? RISK_LEVELS[String(risk.risk_label)] : undefined
    const label = risk.risk_label ? ` ${level ? L(level) : String(risk.risk_label)}` : ""
    out.push(row(text("riskScore"), tonePaint(`${risk.risk_score}/100${label}`, tone) + paint(`  ${text("lowerBetter")}`, "gray")))
  }
  // 命中的风险标记 —— 只列命中的, 没命中就显示「未检出」
  const flags = flagLabels(lang).filter(([field]) => risk[field]).map(([, s, tone]) => badge(s, tone))
  out.push(row(text("flags"), flags.length ? flags.join(" ") : tonePaint(text("noFlags"), "good")))
  if (typeof risk.abuse_reports === "number" && risk.abuse_reports > 0) {
    const users = risk.abuse_distinct_users
    const abuse = lang === "zh"
      ? `${risk.abuse_reports} 次${users ? ` / ${users} 个来源` : ""}`
      : `${risk.abuse_reports} reports${users ? ` / ${users} sources` : ""}`
    out.push(row(text("abuse"), paint(abuse, "red")))
  }
  const known = lang === "zh" ? (r.known_ip?.label_zh || r.known_ip?.label) : (r.known_ip?.label || r.known_ip?.label_zh)
  if (known) out.push(row(text("known"), String(known)))
  out.push(hr())
  return out
}

/** 网站上该 IP 的完整报告链接 */
export function fullReportUrl(lang: Lang, ip: string): string {
  return `https://cleanip.io/${lang === "zh" ? "" : "en/"}${ip}`
}
