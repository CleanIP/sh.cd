// sh.cd 检测脚本跑完两项以上时的「体检总览」: 每一项压成两行结论, 适合截图。
// 数据来自脚本最后一次提交的全部字段 (硬件 + IP + 网络) 与该 IP 的查询结果。

import { ipTypeText, pad, W, width, type IpReport, type Pair, type Renderer } from "./base"
import type { HwData } from "./hw"
import type { IpcheckLocal } from "./local"
import type { NetData } from "./net"
import { classifyRoute } from "./route"
import { fit, fmtBytes, fmtKiB, fmtMbps, median, num, rttSamples } from "./util"

const T = {
  title: ["体检总览", "Summary"],
  hw: ["硬件", "Hardware"],
  ip: ["IP", "IP"],
  net: ["网络", "Network"],
  took: ["用时", "took"],
} satisfies Record<string, Pair>

const VIRT_SHORT: Record<string, Pair> = {
  none: ["物理机", "Bare metal"], kvm: ["KVM", "KVM"], qemu: ["QEMU", "QEMU"], xen: ["Xen", "Xen"], vmware: ["VMware", "VMware"],
  microsoft: ["Hyper-V", "Hyper-V"], amazon: ["AWS", "AWS"], google: ["GCP", "GCP"], openvz: ["OpenVZ", "OpenVZ"], lxc: ["LXC", "LXC"],
  docker: ["Docker", "Docker"], vm: ["虚拟机", "VM"],
}

export function renderSummary(R: Renderer, parts: { hw: HwData | null, ip: IpReport | null, local: IpcheckLocal | null, net: NetData | null, took: number }): string[] {
  const { L, paint, tonePaint, badge, lang } = R
  const zh = lang === "zh"
  const LABEL = zh ? 8 : 10
  const VW = W - 2 - LABEL
  const out: string[] = []
  const line = (label: string, value: string) => out.push(`  ${paint(pad(label, LABEL), "gray")}${value}`)

  const took = parts.took >= 60 ? (zh ? `${Math.floor(parts.took / 60)} 分 ${parts.took % 60} 秒` : `${Math.floor(parts.took / 60)}m ${parts.took % 60}s`) : zh ? `${parts.took} 秒` : `${parts.took}s`
  const head = L(T.title)
  const right = `${parts.ip?.ip ? `${R.ip(parts.ip.ip)} · ` : ""}${L(T.took)} ${took}`
  out.push(`  ${paint(head, "bold")}${" ".repeat(Math.max(2, W - 2 - width(head) - width(right)))}${paint(right, "gray")}`)
  out.push(paint(`  ${"─".repeat(W - 2)}`, "gray"))

  const hw = parts.hw
  if (hw) {
    const a: string[] = []
    if (hw.virt) a.push(L(VIRT_SHORT[hw.virt] ?? [hw.virt, hw.virt]))
    if (hw.cpu) a.push(zh ? `${hw.cpu[1]} 核` : `${hw.cpu[1]} core${hw.cpu[1] === "1" ? "" : "s"}`)
    const mem = hw.mem ? num(hw.mem[0]) : null
    if (mem) a.push(fmtBytes(mem))
    const disk = hw.disk ? num(hw.disk[1]) : null
    if (disk) a.push(fmtBytes(disk))
    line(L(T.hw), fit(a.join(" · "), VW))
    const b: string[] = []
    const round = (v: string | undefined) => (num(v) !== null ? String(Math.round(num(v)!)) : "-")
    if (hw.bench.cpu?.[0] === "sysbench") b.push(`CPU ${zh ? "单核" : "1T"} ${paint(round(hw.bench.cpu[1]), "bold")} · ${zh ? "多核" : "MT"} ${paint(round(hw.bench.cpu[2]), "bold")}`)
    const r4 = hw.bench.disk.r4q1
    if (r4 && num(r4[0]) !== null) b.push(`4K ${zh ? "读" : "read"} ${paint(fmtKiB(num(r4[0])!), "bold")}`)
    if (b.length) line("", b.join(" · "))
  }

  const ip = parts.ip
  if (ip) {
    const pur = ip.purity || {}
    const risk = ip.risk || {}
    const a: string[] = []
    const tone = (score: number) => (score >= 85 ? "good" : score >= 50 ? "warn" : "bad")
    // 主分用综合评分, 和 cleanip.io 网页上的大数字一致; 纯净度并列 (两者口径不同, 综合评分会因恶意情报封顶)
    const env = (ip as { ip_environment?: { score?: number, grade?: string } }).ip_environment
    if (typeof env?.score === "number") {
      a.push(`${badge(`${env.score}${env.grade ? ` ${env.grade}` : ""}`, tone(env.score))} ${zh ? "综合" : "overall"}`)
      if (typeof pur.score === "number") a.push(`${zh ? "纯净度" : "purity"} ${pur.score}${pur.grade ? ` ${pur.grade}` : ""}`)
    } else if (typeof pur.score === "number") {
      a.push(`${badge(`${pur.score}${pur.grade ? ` ${pur.grade}` : ""}`, tone(pur.score))} ${zh ? "纯净度" : "purity"}`)
    }
    // 总览里去掉 " IP" 后缀省列宽: 机房 / 住宅 / 移动 …
    if (pur.ip_type) {
      const type = ipTypeText(String(pur.ip_type), lang).replace(/ IP$/, "")
      a.push(zh ? type : type.toLowerCase())
    }
    if (pur.native_label) a.push(String(pur.native_label).startsWith("Native") ? (zh ? "原生" : "native") : (zh ? "广播" : "broadcast"))
    line(L(T.ip), a.join(" · "))
    const b: string[] = []
    if (typeof risk.risk_score === "number") b.push(`${zh ? "风险" : "risk"} ${risk.risk_score}`)
    // 网站不支持 IPv6 的不算进分母
    const media = parts.local ? Object.values(parts.local.media).filter((m) => m.status !== "nov6") : []
    if (media.length) {
      const ok = media.filter((m) => m.status === "yes" || m.status === "originals" || m.status === "web").length
      b.push(`${zh ? "解锁" : "unlocks"} ${tonePaint(`${ok}/${media.length}`, ok === media.length ? "good" : "warn")}`)
    }
    if (parts.local?.mail) {
      const vals = Object.values(parts.local.mail).map((v) => v === "ok")
      b.push(`${zh ? "邮箱" : "mail"} ${vals.filter(Boolean).length}/${vals.length}`)
    }
    if (risk.dnsbl_checked) {
      const n = Array.isArray(risk.dnsbl_listed) ? risk.dnsbl_listed.length : 0
      b.push(`${zh ? "黑名单" : "blacklists"} ${tonePaint(String(n), n ? "warn" : "good")}`)
    }
    if (b.length) line("", b.join(" · "))
  }

  const net = parts.net
  if (net) {
    const a: string[] = []
    for (const c of ["ct", "cu", "cm"] as const) {
      const rs = net.routes.filter((r) => r.carrier === c && r.hops.length).map((r) => classifyRoute(c, r.hops))
      if (!rs.length) continue
      // 三个城市里出现最多的已识别线路; 三城都认不出才写未识别
      const known = rs.filter((cls) => cls.code !== "unknown")
      const counts = new Map<string, { n: number, cls: typeof rs[number] }>()
      for (const cls of known.length ? known : rs) counts.set(cls.code, { n: (counts.get(cls.code)?.n ?? 0) + 1, cls })
      const top = [...counts.values()].sort((x, y) => y.n - x.n)[0]!.cls
      const name = { ct: ["电信", "CT"], cu: ["联通", "CU"], cm: ["移动", "CM"] }[c] as Pair
      a.push(`${L(name)} ${top.tone === "good" ? tonePaint(L(top.label), "good", "bold") : L(top.label)}`)
    }
    if (a.length) line(L(T.net), a.join(" · "))
    const b: string[] = []
    const meds = net.latency.map((x) => median(rttSamples(x.samples).values.filter((s): s is number => s !== null))).filter((m): m is number => m !== null)
    if (meds.length) b.push(`${zh ? "三网平均" : "China avg"} ${paint(`${Math.round(meds.reduce((s, m) => s + m, 0) / meds.length)} ms`, "bold")}`)
    // 本机带宽: 就近节点上下行正常 (相差不到 5 倍) 就用它; 否则就近节点多半自己限速
    // (2026-09-17 香港机排到新竹, 下载 45 Mbps、上传 1.15 Gbps), 改取境外节点里上下行较小值最大的一个。
    // 国内节点从境外测普遍受限, 不参与。
    const isNum = (v: number | "stall" | null): v is number => typeof v === "number"
    const both = net.speed.filter((s): s is typeof s & { down: number, up: number } => isNum(s.down) && isNum(s.up))
    const balanced = (s: { down: number, up: number }) => Math.min(s.down, s.up) * 5 >= Math.max(s.down, s.up)
    const near = both.find((s) => s.carrier === "near" && balanced(s))
    const best = near ?? both.filter((s) => s.carrier === "near" || s.carrier === "intl").sort((x, y) => Math.min(y.down, y.up) - Math.min(x.down, x.up))[0]
    if (best) b.push(`${zh ? "带宽" : "bandwidth"} ${paint(`${fmtMbps(best.down)} / ${fmtMbps(best.up)}`, "bold")}`)
    if (b.length) line(a.length ? "" : L(T.net), b.join(" · "))
  }
  // 底线带上入口命令: 截图分享出去, 别人照着就能跑
  const cmd = "bash <(curl -Ls https://sh.cd)"
  out.push(`  ${paint("─".repeat(W - 2 - width(cmd) - 1), "gray")} ${paint(cmd, "brand")}`)
  return out
}
