// 检测结果页: https://sh.cd/results/<10 位编号>
//
// 脚本每次运行生成一个随机密钥 (run=32 位十六进制) 随各阶段一起提交。编号 = SHA-256(密钥) 的前 64 位转 base58 取 10 位:
// 只有持有密钥的那次运行能往结果里写, 拿到编号 (链接) 只能看。JSON 输出 (-j) 与 -P 不提交密钥, 不保存。
// 每个阶段存彩色 (网页) 与纯文本 (Markdown / 纯文本) 两份, 都是和终端里一样打码过的报告 (本机网段的 IP 只留前两段)。
//
//   GET /results/<编号>        浏览器给网页; curl / wget 给终端报告 (?color=0 去掉颜色)
//   GET /results/<编号>.md     Markdown, 网页上「复制 Markdown」「下载 .md」用同一份
//   GET /results/<编号>.txt    纯文本
//
// 存 $DATA_DIR/results/<编号前 2 位>/<编号>.json, 最后一次写入起保存 RESULTS_TTL_DAYS 天 (默认 365), 过期定时删除。
// 访客可见文案不写实现细节。

import { createHash } from "node:crypto"
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { createRenderer, renderBanner, type IpReport, type Lang, type Pair } from "./render/base"
import { HW_TITLE, type HwData } from "./render/hw"
import { NET_TITLE, ROUTE_TITLE, type NetData } from "./render/net"
import { bestBandwidth, CARRIER_SHORT, latencyAvg, routeTops, VIRT_SHORT } from "./render/summary"
import { fmtBytes, fmtMbps, num } from "./render/util"
import { ansiToHtml, escapeHtml, icon, pageHead, siteFooter, siteHeader } from "./site"

// 调用时再读 DATA_DIR: 测试里换临时目录
const dir = () => resolve(process.env.DATA_DIR || "data", "results")
export const TTL_DAYS = Math.max(1, Number(process.env.RESULTS_TTL_DAYS) || 365)
const TTL_MS = TTL_DAYS * 86_400_000
const MAX_SECTIONS = 10
const MAX_FILE = 2_000_000
const COMMAND = "bash <(curl -Ls https://sh.cd)"

export type SectionKey = "summary" | "hw" | "ip4" | "ip6" | "ipp" | "net" | "route"
export type FactKey = "hw" | "ip" | "route" | "speed"

export interface Section {
  key: SectionKey
  dur: number | null
  /** 带 ANSI 颜色的报告 (含阶段标题条) */
  ansi: string
  plain: string
}

export interface Fact {
  value: string
  sub: string
}

export interface StoredResult {
  id: string
  created: number
  updated: number
  version: string
  lang: Lang
  /** 本次运行计划跑几项 (跑两项以上才有总览) */
  planned: number
  /** 打码后的出口 IP */
  ip: string
  sections: Section[]
  facts: Partial<Record<FactKey, Fact>>
}

// —— 编号 ——

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
export const RESULT_ID = /^[1-9A-HJ-NP-Za-km-z]{10}$/

export const isRunKey = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{32}$/.test(v)

export function resultId(runKey: string): string {
  const digest = createHash("sha256").update(`sh.cd/results:${runKey}`).digest()
  let n = digest.readBigUInt64BE(0)
  let id = ""
  for (let i = 0; i < 10; i++) {
    id += B58[Number(n % 58n)]
    n /= 58n
  }
  return id
}

export const resultUrl = (id: string) => `https://sh.cd/results/${id}`

// —— 存取 ——

const fileOf = (id: string) => resolve(dir(), id.slice(0, 2), `${id}.json`)

export function loadResult(id: string): StoredResult | null {
  if (!RESULT_ID.test(id)) return null
  try {
    const r = JSON.parse(readFileSync(fileOf(id), "utf8")) as StoredResult
    if (r.id !== id || !Array.isArray(r.sections) || Date.now() - r.updated > TTL_MS) return null
    return r
  } catch {
    return null
  }
}

/** 写入 (或替换同名的) 一段报告, 返回结果页地址; 写盘失败或超出大小时返回 null, 不影响终端报告 */
export function saveSection(runKey: string, meta: { lang: Lang, version: string, planned: number, ip: string }, section: Section, facts: Partial<Record<FactKey, Fact>>): string | null {
  const id = resultId(runKey)
  const now = Date.now()
  const r: StoredResult = loadResult(id) ?? { id, created: now, updated: now, version: meta.version, lang: meta.lang, planned: meta.planned, ip: meta.ip, sections: [], facts: {} }
  const at = r.sections.findIndex((s) => s.key === section.key)
  if (at >= 0) r.sections[at] = section
  else if (r.sections.length < MAX_SECTIONS) r.sections.push(section)
  else return null
  // IPv4 出口优先当作这台机器的 IP (IPv6 阶段在 IPv4 之后提交)
  if (meta.ip && (!r.ip || (r.ip.includes(":") && !meta.ip.includes(":")))) r.ip = meta.ip
  // 双栈时 IPv4 出口的归属作为这台机器的要点, IPv6 阶段不覆盖
  r.facts = { ...r.facts, ...facts, ...(section.key === "ip6" && r.facts.ip ? { ip: r.facts.ip } : {}) }
  r.updated = now
  r.planned = Math.max(r.planned, meta.planned)
  const json = JSON.stringify(r)
  if (json.length > MAX_FILE) return null
  try {
    const file = fileOf(id)
    mkdirSync(resolve(file, ".."), { recursive: true })
    writeFileSync(`${file}.tmp`, json)
    renameSync(`${file}.tmp`, file)
    return resultUrl(id)
  } catch {
    return null
  }
}

/** 删除过期的结果 (按文件修改时间) */
export function sweepResults(now = Date.now()): number {
  let removed = 0
  let shards: string[] = []
  try {
    shards = readdirSync(dir())
  } catch {
    return 0
  }
  for (const shard of shards) {
    const shardDir = resolve(dir(), shard)
    try {
      for (const name of readdirSync(shardDir)) {
        const file = resolve(shardDir, name)
        if (now - statSync(file).mtimeMs > TTL_MS) {
          rmSync(file, { force: true })
          removed++
        }
      }
    } catch {
      // 单个目录读不了跳过
    }
  }
  return removed
}

export function startResultSweeper(): void {
  sweepResults()
  setInterval(() => sweepResults(), 6 * 3_600_000).unref?.()
}

// —— 要点 (结果页顶部四格) ——

export function hwFact(hw: HwData, lang: Lang): Fact | null {
  const zh = lang === "zh"
  const a: string[] = []
  if (hw.virt) a.push((VIRT_SHORT[hw.virt] ?? [hw.virt, hw.virt])[zh ? 0 : 1])
  if (hw.cpu?.[1]) a.push(zh ? `${hw.cpu[1]} 核` : `${hw.cpu[1]} core${hw.cpu[1] === "1" ? "" : "s"}`)
  const mem = hw.mem ? num(hw.mem[0]) : null
  if (mem) a.push(fmtBytes(mem))
  const disk = hw.disk ? num(hw.disk[1]) : null
  if (disk) a.push(fmtBytes(disk))
  return a.length ? { value: a.join(" · "), sub: hw.cpu?.[0] || "" } : null
}

export function ipFact(r: IpReport, lang: Lang): Fact | null {
  const geo = r.geo || {}
  const net = r.network || {}
  const cjk = /[㐀-鿿]/
  const loc = (lang === "zh"
    ? [geo.country, geo.region !== geo.city ? geo.region : "", geo.city]
    : [geo.country_en || geo.country, geo.city].filter((s) => !cjk.test(String(s || "")))
  ).filter(Boolean).join(" ")
  const asn = net.asn ? `AS${net.asn}${net.asn_name || net.asn_org ? ` ${net.asn_name || net.asn_org}` : ""}` : ""
  return loc || asn ? { value: loc || asn, sub: loc ? asn : "" } : null
}

export function netFacts(net: NetData, lang: Lang): Partial<Record<FactKey, Fact>> {
  const zh = lang === "zh"
  const out: Partial<Record<FactKey, Fact>> = {}
  const tops = routeTops(net)
  const avg = latencyAvg(net.latency)
  if (tops.length) {
    out.route = {
      value: tops.map((t) => t.cls.label[zh ? 0 : 1]).join(" · "),
      sub: [tops.map((t) => CARRIER_SHORT[t.carrier][zh ? 0 : 1]).join(" / "), avg !== null ? `${zh ? "平均" : "avg"} ${avg} ms` : ""].filter(Boolean).join(" · "),
    }
  }
  const bw = bestBandwidth(net)
  if (bw) out.speed = { value: `${fmtMbps(bw.down)} / ${fmtMbps(bw.up)}`, sub: zh ? "下载 / 上传" : "down / up" }
  return out
}

// —— 文案 ——

const SECTION_TITLE: Record<SectionKey, Pair> = {
  summary: ["体检总览", "Summary"],
  hw: HW_TITLE,
  ip4: ["IP 质量", "IP quality"],
  ip6: ["IP 质量", "IP quality"],
  ipp: ["IP 质量", "IP quality"],
  net: NET_TITLE,
  route: ROUTE_TITLE,
}
const IP_SUFFIX: Partial<Record<SectionKey, Pair>> = { ip4: ["IPv4", "IPv4"], ip6: ["IPv6", "IPv6"], ipp: ["代理", "Proxy"] }
/** 网页与 Markdown 里总览放最前; 终端纯文本按实际运行顺序, 总览在最后 */
const PAGE_ORDER: SectionKey[] = ["summary", "hw", "ip4", "ip6", "ipp", "net", "route"]
const RUN_ORDER: SectionKey[] = ["hw", "ip4", "ip6", "ipp", "net", "route", "summary"]

const COPY = {
  zh: {
    title: (id: string) => `检测结果 ${id} · sh.cd`,
    description: "sh.cd 服务器体检结果: 硬件与性能、IP 质量、网络质量。",
    eyebrow: "检测结果",
    heading: "服务器体检报告",
    copyLink: "复制链接",
    copyMd: "复制 Markdown",
    downloadMd: "下载 .md",
    plain: "纯文本",
    copied: "已复制",
    copySection: "复制本段",
    facts: { hw: "硬件", ip: "IP", route: "三网回程", speed: "带宽" } as Record<FactKey, string>,
    summaryDesc: "每项两行结论",
    running: (n: number) => `检测仍在进行, 已完成 ${n} 项; 稍后刷新本页查看完整结果。`,
    notesTitle: "关于这份报告",
    notes: (id: string) => [
      "报告里本机网段的 IP 只显示前两段, 可以放心分享。",
      `数据由被测服务器上运行的脚本测得, 结果页保存 ${TTL_DAYS} 天。`,
      `在终端里查看: curl -s ${resultUrl(id)}`,
    ],
    runTitle: "检测你的服务器",
    copy: "复制",
    tz: "UTC+8",
    took: "用时",
    version: "脚本版本",
    time: "检测时间",
    online: "在线查看",
    mdFooter: `由 [sh.cd](https://sh.cd) 生成 · 在你的服务器上运行 \`${COMMAND}\``,
    notFoundTitle: "结果不存在 · sh.cd",
    notFound: "结果不存在或已过期",
    notFoundLead: `请检查链接是否完整; 结果页保存 ${TTL_DAYS} 天。`,
    textFooter: "查看与分享",
  },
  en: {
    title: (id: string) => `Result ${id} · sh.cd`,
    description: "sh.cd server check-up result: hardware, IP quality and network.",
    eyebrow: "Result",
    heading: "Server check-up report",
    copyLink: "Copy link",
    copyMd: "Copy Markdown",
    downloadMd: "Download .md",
    plain: "Plain text",
    copied: "Copied",
    copySection: "Copy section",
    facts: { hw: "Hardware", ip: "IP", route: "Routes to China", speed: "Bandwidth" } as Record<FactKey, string>,
    summaryDesc: "Two lines per section",
    running: (n: number) => `Still running: ${n} section${n === 1 ? "" : "s"} done. Refresh later for the full result.`,
    notesTitle: "About this report",
    notes: (id: string) => [
      "IP addresses in this machine's range show only the first two parts, so it is safe to share.",
      `Measured by the script on the server itself; results are kept for ${TTL_DAYS} days.`,
      `View in a terminal: curl -s ${resultUrl(id)}`,
    ],
    runTitle: "Check your server",
    copy: "Copy",
    tz: "UTC+8",
    took: "Took",
    version: "Script",
    time: "Checked",
    online: "View online",
    mdFooter: `Generated by [sh.cd](https://sh.cd) · run \`${COMMAND} -E\` on your server`,
    notFoundTitle: "Result not found · sh.cd",
    notFound: "Result not found or expired",
    notFoundLead: `Check that the link is complete; results are kept for ${TTL_DAYS} days.`,
    textFooter: "View & share",
  },
}

const fmtTime = (ms: number) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ms))

const fmtDur = (sec: number, zh: boolean) =>
  sec >= 60 ? (zh ? `${Math.floor(sec / 60)} 分 ${sec % 60} 秒` : `${Math.floor(sec / 60)}m ${sec % 60}s`) : zh ? `${sec} 秒` : `${sec}s`

const ordered = (r: StoredResult, order: SectionKey[]) =>
  order.map((k) => r.sections.find((s) => s.key === k)).filter((s): s is Section => Boolean(s))

function sectionTitle(r: StoredResult, key: SectionKey, lang: Lang): string {
  const i = lang === "zh" ? 0 : 1
  const suffix = IP_SUFFIX[key]
  // 只有一个 IP 出口时不加 IPv4 / IPv6 后缀
  const ipCount = r.sections.filter((s) => s.key in IP_SUFFIX).length
  return suffix && ipCount > 1 ? `${SECTION_TITLE[key][i]} · ${suffix[i]}` : SECTION_TITLE[key][i]
}

const totalDur = (r: StoredResult) => r.sections.reduce((s, x) => s + (x.key === "summary" ? 0 : x.dur ?? 0), 0)

/** 去掉阶段标题条与首尾空行 (Markdown 里标题另写) */
function bodyText(s: Section): string {
  const lines = s.plain.split("\n").map((l) => l.replace(/\s+$/, ""))
  if (lines[0]?.startsWith("  ██  ")) lines.shift()
  while (lines.length && !lines[0]) lines.shift()
  while (lines.length && !lines[lines.length - 1]) lines.pop()
  return lines.join("\n")
}

// —— 终端 / 纯文本 ——

export function resultText(r: StoredResult, color: boolean): string {
  const zh = r.lang === "zh"
  const R = createRenderer(r.lang, color)
  const out = renderBanner(R,
    zh ? "服务器体检 · 硬件与性能 · IP 质量 · 网络质量" : "Server check-up · Hardware · IP quality · Network",
    `v${r.version} · ${zh ? "CleanIP 出品" : "by CleanIP"} · https://sh.cd`)
  for (const s of ordered(r, RUN_ORDER)) {
    out.push((color ? s.ansi : s.plain).replace(/\n+$/, ""), "")
  }
  const t = COPY[r.lang]
  out.push(R.paint(`  ${t.time} ${fmtTime(r.created)} (${t.tz})`, "gray"))
  out.push(`  ${R.paint(t.textFooter, "gray")}  ${R.paint(resultUrl(r.id), "brand")}`, "")
  return out.join("\n")
}

// —— Markdown ——

export function resultMarkdown(r: StoredResult): string {
  const zh = r.lang === "zh"
  const t = COPY[r.lang]
  const took = totalDur(r)
  const out = [
    `# sh.cd ${t.heading}`,
    "",
    `- ${t.time}: ${fmtTime(r.created)} (${t.tz})`,
    ...(took ? [`- ${t.took}: ${fmtDur(took, zh)}`] : []),
    `- ${t.version}: sh.cd v${r.version}`,
    `- ${t.online}: ${resultUrl(r.id)}`,
  ]
  for (const s of ordered(r, PAGE_ORDER)) {
    out.push("", `## ${sectionTitle(r, s.key, r.lang)}${s.dur ? ` · ${t.took} ${fmtDur(s.dur, zh)}` : ""}`, "", "```text", bodyText(s), "```")
  }
  out.push("", "---", "", t.mdFooter, "")
  return out.join("\n")
}

// —— 网页 ——

const CSS = `
.result-hero { padding-block: var(--space-12) var(--space-8); }
.result-hero h1 .dim { display: block; margin-top: var(--space-1); font-size: var(--text-lg); font-weight: 400; }
.rid { padding: 0 var(--space-2); border: 1px solid var(--color-neutral-300); border-radius: var(--radius-sm); color: var(--color-neutral-700); font-size: var(--text-xs); }
.actions { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-6); }
.act { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-4); border: 1px solid var(--color-neutral-300); border-radius: var(--radius-md); background: var(--color-neutral-0); color: var(--color-neutral-900); font-size: var(--text-sm); font-weight: 600; line-height: 1.5; cursor: pointer; white-space: nowrap; }
.act:hover { background: var(--color-neutral-100); }
.act.primary { border-color: var(--color-secondary); background: var(--color-secondary); color: var(--color-neutral-0); }
.act.primary:hover { background: #000000; }
.act.done, .act.done:hover { border-color: var(--color-primary-strong); background: var(--color-primary-strong); color: var(--color-neutral-0); }
.act.quiet { border-color: transparent; background: transparent; color: var(--color-neutral-500); }
.act.quiet:hover { background: var(--color-neutral-100); color: var(--color-neutral-900); }
.notice { margin: 0 0 var(--space-6); padding: var(--space-3) var(--space-4); border-left: 2px solid var(--color-warning); background: var(--color-neutral-50); font-size: var(--text-sm); color: var(--color-neutral-700); }
.facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-block: 1px solid var(--color-neutral-200); }
.facts[data-n="1"] { grid-template-columns: minmax(0, 1fr); }
.facts[data-n="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.facts[data-n="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.fact { display: grid; align-content: start; gap: var(--space-1); min-width: 0; padding: var(--space-4) var(--space-4) var(--space-4) 0; }
.fact + .fact { padding-left: var(--space-4); border-left: 1px solid var(--color-neutral-200); }
.fact-label { font-size: var(--text-xs); color: var(--color-neutral-500); }
.fact-value { font-size: var(--text-base); font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }
.fact-sub { font-size: var(--text-xs); color: var(--color-neutral-500); overflow-wrap: anywhere; }
.result-report { padding-top: var(--space-8); }
.result-report .term { height: auto; min-height: 320px; }
.result-report .sample.single { grid-template-columns: minmax(0, 1fr); }
.term-bar { justify-content: space-between; }
.term-copy { display: inline-flex; align-items: center; gap: var(--space-2); flex: none; padding: var(--space-1) var(--space-2); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-neutral-400); font-size: var(--text-xs); cursor: pointer; }
.term-copy:hover { background: var(--color-secondary); color: var(--color-neutral-0); }
.term-copy.done { color: var(--color-primary); }
.result-notes .cmd { margin-top: 0; }
.result-notes .cmd code { font-size: var(--text-base); }
.result-notes .notes li { overflow-wrap: anywhere; }
@media (max-width: 720px) {
  .result-hero { padding-block: var(--space-8) var(--space-6); }
  .result-hero h1 .dim { font-size: var(--text-base); }
  .facts, .facts[data-n="3"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fact:nth-child(odd) { padding-left: 0; border-left: 0; }
  .fact:nth-child(n + 3) { border-top: 1px solid var(--color-neutral-200); }
  .result-report .term { min-height: 0; }
  .act { flex: 1 1 auto; justify-content: center; }
  .act.quiet { flex: none; }
}
`

/** <script type="application/json"> 里的数据: 防止文本里的 </script> 提前结束标签 */
const jsonScript = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c")

const SCRIPT = (t: typeof COPY["zh"] | typeof COPY["en"]) => `
(function () {
  var el = document.getElementById("result-data");
  var data = el ? JSON.parse(el.textContent) : { plain: {} };
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
  }
  // 剪贴板接口被浏览器拒绝 (未授权 / 页面不在前台) 时退回旧办法
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    fallbackCopy(text);
    return Promise.resolve();
  }
  var ICON_CHECK = ${JSON.stringify(icon("check", 16))};
  function flash(btn) {
    var label = btn.querySelector(".label");
    var iconEl = btn.querySelector(".icon");
    if (!btn._orig) btn._orig = { label: label ? label.textContent : "", icon: iconEl ? iconEl.outerHTML : "" };
    btn.classList.add("done");
    if (iconEl) iconEl.outerHTML = ICON_CHECK;
    if (label) label.textContent = ${JSON.stringify(t.copied)};
    clearTimeout(btn._t);
    btn._t = setTimeout(function () {
      btn.classList.remove("done");
      var cur = btn.querySelector(".icon");
      if (cur && btn._orig.icon) cur.outerHTML = btn._orig.icon;
      if (label) label.textContent = btn._orig.label;
    }, 1600);
  }
  function current() {
    var tab = document.querySelector('[role="tab"][aria-selected="true"]');
    return tab ? tab.getAttribute("data-key") : data.first;
  }
  document.querySelectorAll("[data-action]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var a = btn.getAttribute("data-action");
      var text = a === "link" ? data.url : a === "md" ? data.md : a === "section" ? data.plain[current()] : btn.getAttribute("data-copy");
      copyText(text).then(function () { flash(btn); });
    });
  });

  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  function select(tab, focus) {
    tabs.forEach(function (x) {
      var on = x === tab;
      x.setAttribute("aria-selected", on ? "true" : "false");
      x.tabIndex = on ? 0 : -1;
      document.getElementById(x.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () { select(tab, false); });
    tab.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      select(tabs[(i + d + tabs.length) % tabs.length], true);
    });
  });
})();
`

export function resultPage(r: StoredResult, lang: Lang): string {
  const t = COPY[lang]
  const zh = lang === "zh"
  const path = `/results/${r.id}`
  const url = resultUrl(r.id)
  const sections = ordered(r, PAGE_ORDER)
  const took = totalDur(r)
  const stageNames = sections.filter((s) => s.key !== "summary").map((s) => sectionTitle(r, s.key, lang))
  const facts = (["hw", "ip", "route", "speed"] as const).flatMap((k) => (r.facts[k] ? [[k, r.facts[k]!] as const] : []))
  const done = r.sections.filter((s) => s.key !== "summary").length
  const running = r.planned >= 2 && !r.sections.some((s) => s.key === "summary") && Date.now() - r.updated < 20 * 60_000
  const second = [r.ip, r.facts.ip?.value].filter(Boolean).join(" · ")
  const tabDesc = (s: Section) => (s.key === "summary" ? t.summaryDesc : s.dur ? `${t.took} ${fmtDur(s.dur, zh)}` : "")
  const data = {
    url,
    md: resultMarkdown(r),
    first: sections[0]?.key ?? "",
    plain: Object.fromEntries(sections.map((s) => [s.key, bodyText(s)])),
  }

  return `${pageHead(lang, "results", t.title(r.id), t.description, CSS, { path, noindex: true })}
<body>
${siteHeader(lang, "results", path)}

<main class="wrap">
  <div class="result-hero">
    <p class="eyebrow">${t.eyebrow}<span class="rid">${r.id}</span></p>
    <h1>${t.heading}${second ? `<span class="dim">${escapeHtml(second)}</span>` : ""}</h1>
    <ul class="meta">
      <li><time datetime="${new Date(r.created).toISOString()}">${fmtTime(r.created)} (${t.tz})</time></li>
      ${took ? `<li>${t.took} ${fmtDur(took, zh)}</li>` : ""}
      <li>sh.cd v${escapeHtml(r.version)}</li>
      ${stageNames.length ? `<li>${escapeHtml(stageNames.join(" · "))}</li>` : ""}
    </ul>
    <div class="actions">
      <button class="act primary" type="button" data-action="link">${icon("link", 16)}<span class="label">${t.copyLink}</span></button>
      <button class="act" type="button" data-action="md">${icon("copy", 16)}<span class="label">${t.copyMd}</span></button>
      <a class="act" href="${path}.md" download="sh.cd-${r.id}.md">${icon("download", 16)}<span class="label">${t.downloadMd}</span></a>
      <a class="act quiet" href="${path}.txt">${icon("file", 16)}<span class="label">${t.plain}</span></a>
    </div>
  </div>

  ${running ? `<p class="notice" role="status">${t.running(done)}</p>` : ""}
  ${facts.length ? `<div class="facts" data-n="${facts.length}">
    ${facts.map(([k, f]) => `<div class="fact"><span class="fact-label">${t.facts[k]}</span><span class="fact-value">${escapeHtml(f.value)}</span>${f.sub ? `<span class="fact-sub">${escapeHtml(f.sub)}</span>` : ""}</div>`).join("\n    ")}
  </div>` : ""}

  <section class="result-report" aria-label="${t.heading}">
    <div class="sample${sections.length > 1 ? "" : " single"}">
      ${sections.length > 1 ? `<div class="sample-tabs" role="tablist" aria-label="${t.heading}" aria-orientation="vertical">
        ${sections.map((s, i) => `<button class="sample-tab" type="button" role="tab" id="tab-${s.key}" data-key="${s.key}" aria-controls="panel-${s.key}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="tab-name">${escapeHtml(sectionTitle(r, s.key, lang))}</span><span class="tab-desc">${tabDesc(s)}</span></button>`).join("\n        ")}
      </div>` : ""}
      <div class="term-win">
        <div class="term-bar"><span class="term-cmd"><b>$</b> curl -s ${escapeHtml(url.replace("https://", ""))}</span><button class="term-copy" type="button" data-action="section">${icon("copy", 16)}<span class="label">${t.copySection}</span></button></div>
        ${sections.map((s, i) => `<pre class="term" id="panel-${s.key}"${sections.length > 1 ? ` role="tabpanel" aria-labelledby="tab-${s.key}"` : ""} tabindex="0"${i === 0 ? "" : " hidden"}>${ansiToHtml(s.ansi.replace(/\n+$/, ""))}</pre>`).join("\n        ")}
      </div>
    </div>
  </section>

  <section class="result-notes" aria-labelledby="notes-title">
    <div class="two">
      <div><h2 class="sub" id="notes-title">${t.notesTitle}</h2><ul class="notes">${t.notes(r.id).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>
      <div>
        <h2 class="sub">${t.runTitle}</h2>
        <div class="cmd">
          <code><span class="prompt">$</span>${escapeHtml(COMMAND)}</code>
          <button class="btn-primary" type="button" data-action="copy" data-copy="${escapeHtml(COMMAND)}">${icon("copy", 16)}<span class="label">${t.copy}</span></button>
        </div>
      </div>
    </div>
  </section>
</main>

${siteFooter(lang)}
<script type="application/json" id="result-data">${jsonScript(data)}</script>
<script>${SCRIPT(t)}</script>
</body>
</html>
`
}

export function resultNotFoundPage(lang: Lang, path: string): string {
  const t = COPY[lang]
  return `${pageHead(lang, "results", t.notFoundTitle, t.description, CSS, { path: "/results", noindex: true })}
<body>
${siteHeader(lang, "results", path)}

<main class="wrap">
  <div class="result-hero">
    <p class="eyebrow">${t.eyebrow} · 404</p>
    <h1>${t.notFound}</h1>
    <p class="lead">${t.notFoundLead}</p>
    <div class="cmd">
      <code><span class="prompt">$</span>${escapeHtml(COMMAND)}</code>
      <button class="btn-primary" type="button" data-action="copy" data-copy="${escapeHtml(COMMAND)}">${icon("copy", 16)}<span class="label">${t.copy}</span></button>
    </div>
  </div>
</main>

${siteFooter(lang)}
<script>${SCRIPT(t)}</script>
</body>
</html>
`
}
