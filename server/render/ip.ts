// sh.cd 检测脚本「IP 质量」阶段的补充段落: 归属详情、多源检测结论、风险因素、黑名单、平台适用分。
// 数据来自 /api/v2/{ip} 的完整结果 (与网页查本机同一份)。基础信息与评分两段沿用 cli-report 的 renderIpSections。

import { pad, W, type IpReport, type Pair, type Renderer, type Tone } from "./base"
import { fit } from "./util"

export type FullReport = IpReport & {
  checks?: Array<{ key?: string, label?: string, verdict?: string, status?: string, sources?: string[] }>
  ip_environment?: { score?: number, grade?: string, capped?: boolean, cap_reason?: string }
  usage?: { open_ports?: number[] }
}

const T = {
  detail: ["归属详情", "Location details"],
  coords: ["坐标", "Coordinates"],
  accuracy: ["精度", "accuracy"],
  tz: ["时区", "Time zone"],
  local: ["当地", "local"],
  registry: ["登记", "Registry"],
  composite: ["综合评分", "Overall score"],
  capped: ["封顶", "capped"],
  ports: ["开放端口", "Open ports"],
  checks: ["多源检测", "Multi-source checks"],
  factors: ["风险因素", "Risk factors"],
  positives: ["利好因素", "Positives"],
  dnsbl: ["黑名单", "Blacklists"],
  dnsblNone: ["未命中", "Not listed"],
  platforms: ["平台适用", "Platform fit"],
} satisfies Record<string, Pair>

// 后端 checks 只有中文文案, 英文报告按 key 给标签、不显示结论原文
const CHECK_EN: Record<string, string> = {
  vpn: "VPN", proxy: "Proxy", tor: "Tor", abuse_history: "Abuse history", dnsbl: "DNSBL", hosting: "Hosting",
}

const PLATFORMS: Array<[key: string, label: Pair]> = [
  ["youtube", ["YouTube", "YouTube"]], ["netflix", ["Netflix", "Netflix"]], ["disney_plus", ["Disney+", "Disney+"]],
  ["tiktok", ["TikTok", "TikTok"]], ["ai_subscription", ["AI 订阅", "AI apps"]], ["twitter", ["X", "X"]],
  ["facebook", ["Facebook", "Facebook"]], ["ecommerce", ["电商", "E-commerce"]], ["payment", ["支付", "Payments"]],
  ["gaming", ["游戏", "Gaming"]],
]

const grade = (score: number): Tone => (score >= 70 ? "good" : score >= 50 ? "warn" : "bad")

export function renderIpDetail(R: Renderer, r: FullReport): string[] {
  const { L, paint, tonePaint, badge, hr, row, lang, labelW } = R
  const zh = lang === "zh"
  const VW = W - 2 - labelW
  const out: string[] = []
  const put = (label: string, value: string) => out.push(row(label, value))
  const geo = r.geo || {}
  const net = r.network || {}
  const risk = r.risk || {}
  const pur = r.purity || {}

  out.push(`  ${paint(L(T.detail), "bold")}`)
  if (typeof geo.latitude === "number" && typeof geo.longitude === "number") {
    put(L(T.coords), `${geo.latitude.toFixed(4)}, ${geo.longitude.toFixed(4)}${geo.accuracy_radius_km ? paint(` · ${L(T.accuracy)} ${geo.accuracy_radius_km} km`, "gray") : ""}`)
  }
  if (geo.timezone) {
    const local = typeof geo.local_time === "string" ? /T(\d{2}:\d{2})/.exec(geo.local_time)?.[1] : undefined
    put(L(T.tz), `${geo.timezone}${local ? paint(` · ${L(T.local)} ${local}`, "gray") : ""}`)
  }
  const reg = [net.rir, net.rir_netname || net.assigned_netname, net.ip_range || net.route].filter(Boolean).join(" · ")
  if (reg) put(L(T.registry), fit(reg, VW))
  const env = r.ip_environment
  if (env && typeof env.score === "number") {
    const tone = env.score >= 85 ? "good" : env.score >= 50 ? "warn" : "bad"
    const cap = env.capped && env.cap_reason && zh ? paint(`  ${L(T.capped)}: ${fit(env.cap_reason, VW - 12)}`, "gray") : ""
    put(L(T.composite), `${badge(`${env.score}${env.grade ? ` ${env.grade}` : ""}`, tone)}${cap}`)
  }
  const ports = r.usage?.open_ports
  if (Array.isArray(ports) && ports.length) put(L(T.ports), fit(ports.slice(0, 12).join(" · "), VW))
  out.push(hr())

  // —— 多源检测 ——
  const checks = (r.checks || []).filter((c) => c && c.key)
  if (checks.length) {
    out.push(`  ${paint(L(T.checks), "bold")}`)
    for (const c of checks) {
      const mark = c.status === "pass" ? tonePaint("✓", "good") : c.status === "fail" ? tonePaint("✗", "bad") : tonePaint("!", "warn")
      const label = zh ? (c.label || c.key!) : (CHECK_EN[c.key!] || c.key!)
      const LW = 14
      const verdictW = zh ? 22 : 0
      const verdict = zh && c.verdict ? pad(fit(c.verdict, verdictW), verdictW) : ""
      const sources = (c.sources || []).join(" · ")
      const rest = W - 4 - LW - (zh ? verdictW + 1 : 0)
      out.push(`  ${mark} ${pad(fit(label, LW - 1), LW)}${verdict}${verdict ? " " : ""}${paint(fit(sources, rest), "gray")}`.trimEnd())
    }
    if (zh) {
      const factors = (pur.risk_factors || []).filter((x: unknown) => typeof x === "string").slice(0, 4) as string[]
      factors.forEach((f, i) => put(i ? "" : L(T.factors), tonePaint(`! ${fit(f, VW - 2)}`, "warn")))
      const positives = (pur.positive_factors || []).filter((x: unknown) => typeof x === "string").slice(0, 3) as string[]
      positives.forEach((f, i) => put(i ? "" : L(T.positives), `${tonePaint("✓", "good")} ${fit(f, VW - 2)}`))
    } else if (Array.isArray(pur.risk_factors) && pur.risk_factors.length) {
      put(L(T.factors), tonePaint(`! ${pur.risk_factors.length}`, "warn"))
    }
    if (risk.dnsbl_checked) {
      const listed = Array.isArray(risk.dnsbl_listed) ? (risk.dnsbl_listed as string[]) : []
      put(L(T.dnsbl), listed.length ? tonePaint(fit(listed.join(" · "), VW), "warn") : tonePaint(L(T.dnsblNone), "good"))
    }
    out.push(hr())
  }

  // —— 平台适用分 ——
  const scores = pur.platform_scores as Record<string, number> | undefined
  if (scores && typeof scores === "object") {
    const items = PLATFORMS.filter(([k]) => typeof scores[k] === "number")
    if (items.length) {
      out.push(`  ${paint(L(T.platforms), "bold")}${paint(zh ? "  满分 100, 越高越适合" : "  out of 100, higher is better", "gray")}`)
      // 每格: 名称 10 列 + 分数 3 列, 格间空 6 列
      for (let i = 0; i < items.length; i += 3) {
        const line = items.slice(i, i + 3).map(([k, label]) => {
          const v = Math.round(scores[k]!)
          return pad(L(label), 10) + tonePaint(" ".repeat(Math.max(0, 3 - String(v).length)) + v, grade(v))
        }).join("      ")
        out.push(`  ${line}`)
      }
      out.push(hr())
    }
  }
  return out
}
