// sh.cd 检测脚本「网络质量」阶段: 本地网络策略、BGP 与接入、31 省三网延迟、三网回程线路、测速、国际延迟,
// 以及「回程路由详情」(逐跳位置与 ASN)。字段格式见 check.sh 的「三、网络质量」段注释。

import { pad, W, width, type Pair, type Renderer, type Tone } from "./base"
import { PROVINCES, ROUTE_CITIES } from "./local"
import { classifyRoute, hopAsn, type Carrier, type RouteHop } from "./route"
import { fit, fmtMbps, median, num, rowsFlex, rtrim, rttSamples, spark, str, textParts, wrap } from "./util"

const CARRIERS = ["ct", "cu", "cm"] as const

// 地名最长 11 列 (国际延迟每格地名 11 列), 英文放不下的用通行简称
export const PLACES: Record<string, Pair> = {
  sh: ["上海", "Shanghai"], js: ["南京", "Nanjing"], bj: ["北京", "Beijing"],
  hk: ["香港", "Hong Kong"], tpe: ["台北", "Taipei"], tyo: ["东京", "Tokyo"], sel: ["首尔", "Seoul"],
  sgp: ["新加坡", "Singapore"], kul: ["吉隆坡", "K. Lumpur"], bkk: ["曼谷", "Bangkok"], jkt: ["雅加达", "Jakarta"],
  mnl: ["马尼拉", "Manila"], sgn: ["胡志明市", "Ho Chi Minh"], bom: ["孟买", "Mumbai"],
  dxb: ["迪拜", "Dubai"], ruh: ["利雅得", "Riyadh"], tlv: ["特拉维夫", "Tel Aviv"],
  lon: ["伦敦", "London"], fra: ["法兰克福", "Frankfurt"], ams: ["阿姆斯特丹", "Amsterdam"], par: ["巴黎", "Paris"],
  mad: ["马德里", "Madrid"], war: ["华沙", "Warsaw"], hel: ["赫尔辛基", "Helsinki"], mow: ["莫斯科", "Moscow"], ist: ["伊斯坦布尔", "Istanbul"],
  jnb: ["约翰内斯堡", "Jo'burg"], cai: ["开罗", "Cairo"], cas: ["卡萨布兰卡", "Casablanca"],
  lax: ["洛杉矶", "Los Angeles"], sjc: ["圣何塞", "San Jose"], sea: ["西雅图", "Seattle"], dfw: ["达拉斯", "Dallas"], nyc: ["纽约", "New York"], yyz: ["多伦多", "Toronto"],
  gru: ["圣保罗", "São Paulo"], scl: ["圣地亚哥", "Santiago"],
  syd: ["悉尼", "Sydney"], akl: ["奥克兰", "Auckland"],
}

/** 国际延迟按大洲分组 (顺序即报告顺序); 大洲名最长 10 列, 要和地名之间留空 */
export const INTL_GROUPS: Array<{ name: Pair, places: string[] }> = [
  { name: ["亚洲", "Asia"], places: ["hk", "tpe", "tyo", "sel", "sgp", "kul", "bkk", "jkt", "mnl", "sgn", "bom"] },
  { name: ["中东", "M. East"], places: ["dxb", "ruh", "tlv"] },
  { name: ["欧洲", "Europe"], places: ["lon", "fra", "ams", "par", "mad", "war", "hel", "mow", "ist"] },
  { name: ["非洲", "Africa"], places: ["jnb", "cai", "cas"] },
  { name: ["北美", "N. America"], places: ["lax", "sjc", "sea", "dfw", "nyc", "yyz"] },
  { name: ["南美", "S. America"], places: ["gru", "scl"] },
  { name: ["大洋洲", "Oceania"], places: ["syd", "akl"] },
]
const INTL_ORDER = INTL_GROUPS.flatMap((g) => g.places)

export type NatKind = "open" | "firewall" | "full_cone" | "restricted" | "port_restricted" | "symmetric" | "nat" | "blocked" | "fail"

export interface NetData {
  nat: { kind: NatKind, ip: string } | null
  tcp: string[] | null
  v6: boolean | null
  latency: Array<{ province: string, carrier: Carrier, samples: Array<number | null> }>
  latency6: Array<{ province: string, carrier: Carrier, samples: Array<number | null> }>
  routes: Array<{ city: string, carrier: Carrier, hops: RouteHop[] }>
  routes6: Array<{ city: string, carrier: Carrier, hops: RouteHop[] }>
  /** 分省测速: null = 该组节点都连不上 */
  speedCn: Array<{ province: string, carrier: Carrier, result: { city: string, down: number | "stall" | null, up: number | "stall" | null } | null }>
  /** null = 连接失败, "stall" = 节点不收发 (多为节点对来源限制) */
  speed: Array<{ carrier: "near" | "intl" | Carrier, place: string, down: number | "stall" | null, up: number | "stall" | null }>
  intl: Array<{ place: string, ms: number | null }>
  deep: boolean
  dur: number | null
}

export interface BgpInfo {
  asn?: number
  name?: string
  rir?: string
  created?: string
  updated?: string
  address?: string
  route?: string
  range?: string
  rpki?: string
  upstreams: Array<{ asn: number, name?: string }>
  counts?: { upstreams: number, peers: number, downstreams: number }
  ix?: number
  fac?: number
}

export interface HopInfo {
  asn?: number
  org?: string
  place?: string
}

const IPV4 = String.raw`(?:\d{1,3}\.){3}\d{1,3}`

export function parseNet(body: Record<string, unknown>): NetData | null {
  const keys = Object.keys(body)
  if (!keys.some((k) => /^(nt_|lat6?_|rt6?_|sp_|spc_|il_)/.test(k))) return null
  const data: NetData = {
    nat: null, tcp: null, v6: null, latency: [], latency6: [], routes: [], routes6: [], speed: [], speedCn: [], intl: [],
    deep: body.deep === "1", dur: num(str(body.dur)),
  }

  const nat = new RegExp(`^(open|firewall|full_cone|restricted|port_restricted|symmetric|nat)\\|(${IPV4})$`).exec(str(body.nt_nat))
  if (nat) data.nat = { kind: nat[1] as NatKind, ip: nat[2]! }
  else if (body.nt_nat === "blocked|") data.nat = { kind: "blocked", ip: "" }
  else if (body.nt_nat === "fail") data.nat = { kind: "fail", ip: "" }
  data.tcp = textParts(body.nt_tcp, 4, 60)
  if (body.nt_v6 === "yes" || body.nt_v6 === "no") data.v6 = body.nt_v6 === "yes"

  for (const [key, list] of [["lat", data.latency], ["lat6", data.latency6]] as const) {
    for (const [prov] of PROVINCES) {
      for (const carrier of CARRIERS) {
        const v = str(body[`${key}_${prov}_${carrier}`])
        if (!/^\d{1,5}(\.\d)?(,\d{1,5}(\.\d)?){4}$/.test(v)) continue
        list.push({ province: prov, carrier, samples: v.split(",").map((x) => (Number(x) > 0 ? Number(x) : null)) })
      }
    }
  }

  // IPv4 跳点 TTL:IP[:毫秒]; IPv6 地址本身带冒号, 用斜杠 TTL/IP[/毫秒]
  const routeSets = [
    { key: "rt", list: data.routes, sep: ":", re: new RegExp(`^\\d{1,2}:${IPV4}(:\\d{1,4})?$`) },
    { key: "rt6", list: data.routes6, sep: "/", re: /^\d{1,2}\/[0-9a-fA-F:]{2,39}(\/\d{1,4})?$/ },
  ]
  for (const { key, list, sep, re } of routeSets) {
    for (const [city] of ROUTE_CITIES) {
      for (const carrier of CARRIERS) {
        const v = str(body[`${key}_${city}_${carrier}`])
        if (v === "none") {
          list.push({ city, carrier, hops: [] })
          continue
        }
        const parts = v.split(",")
        if (!v || parts.length > 60 || !parts.every((p) => re.test(p))) continue
        list.push({
          city,
          carrier,
          hops: parts.map((p) => {
            const [ttl, ip, ms] = p.split(sep)
            return { ttl: Number(ttl), ip: ip!, ...(ms !== undefined ? { ms: Number(ms) } : {}) }
          }),
        })
      }
    }
  }

  for (let n = 1; n <= 16; n++) {
    const m = /^(near|intl|ct|cu|cm)\|([\p{L}\p{N} .,()'-]{1,40})\|(\d{1,6}(?:\.\d)?|fail|stall)\|(\d{1,6}(?:\.\d)?|fail|stall)$/u.exec(str(body[`sp_${n}`]))
    if (!m) continue
    if (m[1] !== "near" && !PLACES[m[2]!]) continue
    const val = (v: string) => (v === "fail" ? null : v === "stall" ? "stall" as const : Number(v))
    data.speed.push({ carrier: m[1] as NetData["speed"][number]["carrier"], place: m[2]!.trim(), down: val(m[3]!), up: val(m[4]!) })
  }

  for (const [prov] of PROVINCES) {
    for (const carrier of CARRIERS) {
      const v = str(body[`spc_${prov}_${carrier}`])
      if (v === "fail") {
        data.speedCn.push({ province: prov, carrier, result: null })
        continue
      }
      const m = /^([\p{Script=Han}]{1,6})\|(\d{1,6}(?:\.\d)?|fail|stall)\|(\d{1,6}(?:\.\d)?|fail|stall)$/u.exec(v)
      if (!m) continue
      const val = (x: string) => (x === "fail" ? null : x === "stall" ? "stall" as const : Number(x))
      data.speedCn.push({ province: prov, carrier, result: { city: m[1]!, down: val(m[2]!), up: val(m[3]!) } })
    }
  }

  for (const place of INTL_ORDER) {
    const v = str(body[`il_${place}`])
    if (v === "fail") data.intl.push({ place, ms: null })
    else if (/^\d{1,5}(\.\d)?$/.test(v)) data.intl.push({ place, ms: Number(v) })
  }
  return data
}

const T = {
  title: ["网络质量", "Network quality"],
  local: ["本地策略", "Local policy"],
  nat: ["NAT", "NAT"],
  open: ["公网直连", "Public IP"],
  natted: ["在 NAT 后", "Behind NAT"],
  natFail: ["未测出 (出站 UDP 可能被拦截)", "Unknown (outbound UDP may be blocked)"],
  cnSpeed: ["分省测速", "Provincial speed (China)"],
  cnSpeedNote: ["下载 / 上传 Mbps · - 无节点 · 多数节点拦截境外来源", "Down / up Mbps · - no server · most block foreign traffic"],
  unreachable: ["不可达", "blocked"],
  exitIp: ["出口", "exit"],
  tcp: ["TCP", "TCP"],
  cc: ["拥塞控制", "congestion"],
  qdisc: ["队列", "qdisc"],
  rmem: ["接收缓冲", "Receive buffer"],
  wmem: ["发送缓冲", "Send buffer"],
  v6: ["IPv6", "IPv6"],
  yes: ["可用", "Available"],
  no: ["不可用", "Unavailable"],
  bgp: ["BGP 与接入", "BGP & peering"],
  as: ["自治系统", "ASN"],
  registry: ["注册", "Registry"],
  address: ["地址", "Address"],
  route: ["路由", "Route"],
  allocated: ["分配", "allocated"],
  rpkiValid: ["RPKI 有效", "RPKI valid"],
  rpkiInvalid: ["RPKI 无效", "RPKI invalid"],
  rpkiUnknown: ["RPKI 未签名", "RPKI unsigned"],
  peering: ["接入", "Peering"],
  upstream: ["上游", "Upstreams"],
  latency: ["三网延迟", "China carrier latency"],
  latencyNote: ["TCP 握手 5 次, 走势 + 中位数 ms, × 为超时, 重传计入丢包", "5 TCP handshakes: trend + median ms, × = timeout"],
  avg: ["平均", "Average"],
  ct: ["电信", "Telecom"],
  cu: ["联通", "Unicom"],
  cm: ["移动", "Mobile"],
  routes: ["三网回程线路", "Return routes to China"],
  routeNone: ["无回应", "No reply"],
  routeLegend: ["精品线路: CN2 GIA · CTGNET · 9929 · CMIN2", "Premium: CN2 GIA · CTGNET · 9929 · CMIN2"],
  speed: ["带宽测速", "Bandwidth"],
  down: ["下载", "Download"],
  up: ["上传", "Upload"],
  near: ["就近", "Nearby"],
  speedFail: ["连接失败", "Failed"],
  speedStall: ["节点受限", "Throttled"],
  noNode: ["暂无境外可用的测速节点", "No test server reachable from abroad"],
  intl: ["国际延迟", "International latency"],
  intlNote: ["TCP 握手 ms, × 为超时", "TCP handshake ms, × = timeout"],
  detail: ["回程路由详情", "Hop-by-hop return routes"],
  private: ["内网", "private"],
} satisfies Record<string, Pair>

// NAT 类型: [名称, 色调, 补充说明]
const NAT_KINDS: Partial<Record<NatKind, [Pair, Tone, Pair | null]>> = {
  open: [["公网直连", "Public IP"], "good", null],
  firewall: [["公网直连, UDP 受限", "Public IP, UDP filtered"], "warn", ["入站 UDP 被过滤, P2P 与游戏联机可能受影响", "Inbound UDP is filtered; some P2P and games are affected"]],
  full_cone: [["全锥形 NAT (NAT1)", "Full cone (NAT1)"], "good", ["任何外部地址都能回连, P2P 最友好", "Reachable from any outside address; best for P2P"]],
  restricted: [["限制锥形 NAT (NAT2)", "Restricted cone (NAT2)"], "good", ["只接受访问过的 IP 回连", "Only IPs you contacted can reach back"]],
  port_restricted: [["端口限制锥形 NAT (NAT3)", "Port-restricted (NAT3)"], "warn", ["只接受访问过的 IP 与端口回连, P2P 较难打通", "Only contacted IP:port can reach back; P2P is harder"]],
  symmetric: [["对称形 NAT (NAT4)", "Symmetric (NAT4)"], "bad", ["每个目标换一个外部端口, P2P 基本打不通", "New external port per destination; P2P rarely works"]],
  nat: [["在 NAT 后", "Behind NAT"], "warn", ["类型未测全: 细分所需的 STUN 服务器连不上", "Type unknown: the STUN servers needed are unreachable"]],
  blocked: [["UDP 不通", "UDP blocked"], "bad", ["出站 UDP 被拦截, 语音视频与游戏联机可能受影响", "Outbound UDP is blocked; calls and games may fail"]],
}

function latencyTone(ms: number): Tone {
  // 境外到国内 150ms 上下是常态, 只把明显好的标绿、明显差的标黄
  return ms < 100 ? "good" : ms < 200 ? "neutral" : "warn"
}

const padL = (s: string, w: number) => " ".repeat(Math.max(0, w - width(s))) + s

function speedLabel(s: NetData["speed"][number], lang: "zh" | "en"): string {
  const zh = lang === "zh"
  const place = PLACES[s.place]
  if (s.carrier === "near") return `${zh ? "就近" : "Nearby"} ${s.place}`
  if (s.carrier === "intl") return place![zh ? 0 : 1]
  const carrier = T[s.carrier][zh ? 0 : 1]
  return zh ? `${place![0]}${carrier}` : `${carrier} ${place![1]}`
}

export function renderNet(R: Renderer, net: NetData, bgp: BgpInfo | null): string[] {
  const { L, paint, tonePaint, badge, hr, row, lang, labelW } = R
  const zh = lang === "zh"
  const VW = W - 2 - labelW
  const out: string[] = []
  const title = (p: Pair, note?: string) => {
    out.push(`  ${paint(L(p), "bold")}`)
    if (note) out.push(`  ${paint(note, "gray")}`)
  }
  const put = (label: string, value: string) => out.push(...rowsFlex(row, label, value, VW))

  // —— 本地策略 ——
  if (net.nat || net.tcp || net.v6 !== null) {
    title(T.local)
    if (net.nat) {
      const kind = NAT_KINDS[net.nat.kind]
      if (!kind) put(L(T.nat), paint(L(T.natFail), "gray"))
      else {
        const exit = net.nat.ip ? paint(`${net.nat.kind === "open" || net.nat.kind === "firewall" ? "" : `${L(T.exitIp)} `}${R.ip(net.nat.ip)}`, "gray") : ""
        // 用 " · " 连接, 英文类型名较长时出口 IP 自动折到下一行
        put(L(T.nat), [badge(L(kind[0]), kind[1]), exit].filter(Boolean).join(" · "))
        if (kind[2]) wrap(L(kind[2]), VW).forEach((l) => put("", paint(l, "gray")))
      }
    }
    if (net.tcp) {
      const [cc, qd, rmem, wmem] = net.tcp
      if (cc || qd) put(L(T.tcp), [cc ? `${L(T.cc)} ${tonePaint(cc, cc === "bbr" ? "good" : "neutral", "bold")}` : "", qd ? `${L(T.qdisc)} ${qd}` : ""].filter(Boolean).join(" · "))
      if (rmem) put(L(T.rmem), paint(rmem, "gray"))
      if (wmem) put(L(T.wmem), paint(wmem, "gray"))
    }
    if (net.v6 !== null) put(L(T.v6), net.v6 ? badge(L(T.yes), "good") : badge(L(T.no), "neutral"))
    out.push(hr())
  }

  // —— BGP 与接入 ——
  if (bgp && (bgp.asn || bgp.upstreams.length)) {
    title(T.bgp)
    if (bgp.asn) put(L(T.as), fit(`AS${bgp.asn}${bgp.name ? ` ${bgp.name}` : ""}`, VW))
    const reg = [bgp.rir, bgp.created ? `${bgp.created}${zh ? " 注册" : " registered"}` : "", bgp.updated && bgp.updated !== bgp.created ? `${bgp.updated}${zh ? " 更新" : " updated"}` : ""].filter(Boolean)
    if (reg.length) put(L(T.registry), reg.join(" · "))
    if (bgp.address) wrap(bgp.address, VW).slice(0, 2).forEach((l, i) => put(i ? "" : L(T.address), paint(l, "gray")))
    const rpki = bgp.rpki === "valid" ? tonePaint(L(T.rpkiValid), "good") : bgp.rpki === "invalid" ? tonePaint(L(T.rpkiInvalid), "bad") : bgp.rpki ? paint(L(T.rpkiUnknown), "gray") : ""
    const routeBits = [bgp.route ? R.ip(bgp.route) : "", bgp.range && bgp.range !== bgp.route ? `${L(T.allocated)} ${R.ip(bgp.range)}` : "", rpki].filter(Boolean)
    if (routeBits.length) put(L(T.route), routeBits.join(" · "))
    const peer: string[] = []
    if (bgp.counts) {
      peer.push(zh ? `上游 ${bgp.counts.upstreams}` : `${bgp.counts.upstreams} upstreams`)
      peer.push(zh ? `对等 ${bgp.counts.peers}` : `${bgp.counts.peers} peers`)
      if (bgp.counts.downstreams) peer.push(zh ? `下游 ${bgp.counts.downstreams}` : `${bgp.counts.downstreams} downstreams`)
    }
    if (bgp.ix !== undefined) peer.push(`IX ${bgp.ix}`)
    if (bgp.fac !== undefined) peer.push(zh ? `机房 ${bgp.fac}` : `${bgp.fac} facilities`)
    if (peer.length) put(L(T.peering), peer.join(" · "))
    if (bgp.upstreams.length) {
      const names = bgp.upstreams.slice(0, 8).map((u) => `AS${u.asn}${u.name ? ` ${fit(u.name, 22)}` : ""}`)
      const lines: string[] = []
      let cur = ""
      for (const n of names) {
        const next = cur ? `${cur} · ${n}` : n
        if (width(next) > VW && cur) {
          lines.push(cur)
          cur = n
        } else cur = next
      }
      if (cur) lines.push(cur)
      lines.slice(0, 3).forEach((l, i) => put(i ? "" : L(T.upstream), l))
    }
    out.push(hr())
  }

  // —— 三网延迟 (IPv4 / IPv6) ——
  const latencyTable = (rows: NetData["latency"], heading: string) => {
    if (!rows.length) return
    const LABEL = zh ? 10 : 16
    const COL = 15
    out.push(`  ${paint(heading, "bold")}`, `  ${paint(L(T.latencyNote), "gray")}`)
    out.push(`  ${pad("", LABEL)}${paint(CARRIERS.map((c) => pad(L(T[c]), COL)).join("").trimEnd(), "gray")}`)
    const medians: Record<string, number[]> = { ct: [], cu: [], cm: [] }
    for (const [code, pzh, pen] of PROVINCES) {
      const cells = rows.filter((x) => x.province === code)
      if (!cells.length) continue
      const value = rtrim(CARRIERS.map((c) => {
        const cell = cells.find((x) => x.carrier === c)
        if (!cell) return pad("-", COL)
        const { values: samples, lost } = rttSamples(cell.samples)
        const ok = samples.filter((s): s is number => s !== null)
        const m = median(ok)
        if (m === null) return tonePaint(pad(zh ? "×××××  超时" : "×××××  timeout", COL), "bad")
        medians[c]!.push(m)
        const lo = Math.min(...ok)
        const tone: Tone = lost ? "warn" : latencyTone(m)
        return paint(spark(samples, lo, Math.max(Math.max(...ok), lo + 20)), "gray") + " " + tonePaint(padL(String(Math.round(m)), 4), tone) + " ".repeat(COL - 10)
      }).join(""))
      out.push(`  ${pad(fit(zh ? pzh : pen, LABEL - 1), LABEL)}${value}`)
    }
    const avg = CARRIERS.map((c) => {
      const xs = medians[c]!
      return xs.length ? `${L(T[c])} ${Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)}` : ""
    }).filter(Boolean)
    if (avg.length) out.push(`  ${pad(L(T.avg), LABEL)}${paint(`${avg.join(" · ")} ms`, "bold")}`)
    out.push(hr())
  }
  latencyTable(net.latency, L(T.latency))
  latencyTable(net.latency6, `${L(T.latency)} · IPv6`)

  // —— 三网回程线路 (IPv4 / IPv6) ——
  const routeTable = (rows: NetData["routes"], heading: string) => {
    if (!rows.length) return
    const COL = 15
    const LABEL = zh ? 10 : 16
    out.push(`  ${paint(heading, "bold")}`)
    out.push(`  ${pad("", LABEL)}${paint(CARRIERS.map((c) => pad(L(T[c]), COL)).join("").trimEnd(), "gray")}`)
    for (const [code, czh, cen] of ROUTE_CITIES) {
      const cells = rows.filter((x) => x.city === code)
      if (!cells.length) continue
      const value = rtrim(CARRIERS.map((c) => {
        const r = cells.find((x) => x.carrier === c)
        if (!r) return pad("-", COL)
        if (!r.hops.length) return paint(pad(L(T.routeNone), COL), "gray")
        const cls = classifyRoute(c, r.hops)
        const text = pad(L(cls.label), COL)
        return cls.code === "unknown" ? paint(text, "gray") : tonePaint(text, cls.tone, ...(cls.tone === "good" ? ["bold" as const] : []))
      }).join(""))
      out.push(`  ${pad(zh ? czh : cen, LABEL)}${value}`)
    }
    out.push(`  ${paint(L(T.routeLegend), "gray")}`)
    out.push(hr())
  }
  routeTable(net.routes, L(T.routes))
  routeTable(net.routes6, `${L(T.routes)} · IPv6`)

  // —— 带宽测速 ——
  if (net.speed.length) {
    const LABEL = 26
    const COL = 14
    out.push(`  ${paint(pad(L(T.speed), LABEL), "bold")}${paint(pad(L(T.down), COL) + L(T.up), "gray")}`)
    const cell = (v: number | "stall" | null) => v === null
      ? tonePaint(pad(L(T.speedFail), COL), "bad")
      : v === "stall" ? paint(pad(L(T.speedStall), COL), "gray") : pad(fmtMbps(v), COL)
    // 一个方向不到另一个方向的十分之一, 基本是节点对该方向限速 (香港移动上传常见), 这个数不代表本机带宽, 标灰加说明
    let throttled = false
    for (const s of net.speed) {
      const lowDir = typeof s.down === "number" && typeof s.up === "number" && Math.max(s.down, s.up) >= 50 && Math.min(s.down, s.up) < Math.max(s.down, s.up) / 10
        ? (s.down < s.up ? "down" : "up") : null
      if (lowDir) throttled = true
      const c = (v: number | "stall" | null, dir: "down" | "up") => (lowDir === dir ? paint(pad(fmtMbps(v as number), COL), "gray") : cell(v))
      out.push(`  ${pad(fit(speedLabel(s, lang), LABEL - 2), LABEL)}${rtrim(c(s.down, "down") + c(s.up, "up"))}`)
    }
    if (throttled) out.push(`  ${paint(zh ? "灰色数值: 节点单向限速, 不代表本机带宽" : "Gray: throttled by the test server, not this machine", "gray")}`)
    // 没有节点的运营商如实写出来, 不拿别的节点冒充
    const missing = CARRIERS.filter((c) => !net.speed.some((s) => s.carrier === c))
    if (missing.length) out.push(`  ${pad(missing.map((c) => L(T[c])).join(" · "), LABEL)}${paint(L(T.noNode), "gray")}`)
    out.push(hr())
  }

  // —— 分省测速 ——
  if (net.speedCn.length) {
    const LABEL = zh ? 10 : 16
    const COL = 15
    out.push(`  ${paint(L(T.cnSpeed), "bold")}`, `  ${paint(L(T.cnSpeedNote), "gray")}`)
    out.push(`  ${pad("", LABEL)}${paint(CARRIERS.map((c) => pad(L(T[c]), COL)).join("").trimEnd(), "gray")}`)
    const v = (x: number | "stall" | null) => (typeof x === "number" ? String(Math.round(x)) : x === "stall" ? (zh ? "受限" : "ltd") : "-")
    for (const [code, pzh, pen] of PROVINCES) {
      const cells = net.speedCn.filter((x) => x.province === code)
      if (!cells.length) continue
      const value = rtrim(CARRIERS.map((c) => {
        const cell = cells.find((x) => x.carrier === c)
        if (!cell) return paint(pad("-", COL), "gray")
        if (!cell.result) return paint(pad(L(T.unreachable), COL), "gray")
        return pad(`${v(cell.result.down)} / ${v(cell.result.up)}`, COL)
      }).join(""))
      out.push(`  ${pad(fit(zh ? pzh : pen, LABEL - 1), LABEL)}${value}`)
    }
    out.push(hr())
  }

  // —— 国际延迟 ——
  if (net.intl.length) {
    title(T.intl)
    out.push(`  ${paint(L(T.intlNote), "gray")}`)
    // 每行: 大洲 11 列 + 3 格 (地名 11 列 + 延迟 4 列), 格间空 2 列, 共 62 列
    for (const group of INTL_GROUPS) {
      const cells = group.places.flatMap((place) => net.intl.filter((x) => x.place === place)).map((x) => {
        const name = fit(PLACES[x.place]![zh ? 0 : 1], 11)
        const ms = x.ms === null ? tonePaint(padL("×", 4), "bad") : tonePaint(padL(String(Math.round(x.ms)), 4), x.ms < 50 ? "good" : x.ms < 200 ? "neutral" : "warn")
        return pad(name, 11) + ms
      })
      for (let i = 0; i < cells.length; i += 3) {
        out.push(`  ${paint(pad(i ? "" : L(group.name), 11), "gray")}${cells.slice(i, i + 3).join("  ")}`)
      }
    }
    out.push(hr())
  }
  return out
}

const PRIVATE = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/

// 骨干网 ASN 的通俗叫法, 逐跳详情里比注册名好认
const BACKBONE: Record<string, Pair> = {
  AS4809: ["电信 CN2", "CT CN2"], AS4134: ["电信 163", "CT 163"], AS23764: ["电信 CTGNET", "CT CTGNET"],
  AS9929: ["联通 9929", "CU 9929"], AS10099: ["联通 CUG", "CU CUG"], AS4837: ["联通 4837", "CU 4837"],
  AS58807: ["移动 CMIN2", "CM CMIN2"], AS58453: ["移动 CMI", "CM CMI"], AS9808: ["移动 CMNET", "CM CMNET"],
}

/** 「回程路由详情」: 每个目标一段, 列出每一跳的 IP、延迟、ASN 与位置 */
export function renderRouteDetail(R: Renderer, net: NetData, hops: Record<string, HopInfo>): string[] {
  const { L, paint, tonePaint, hr, lang } = R
  const zh = lang === "zh"
  const out: string[] = []
  const TAIL = W - 2 - 3 - 16 - 7 - 2
  for (const [family, routes] of [["IPv4", net.routes], ["IPv6", net.routes6]] as const) {
    if (!routes.length) continue
    if (family === "IPv6") out.push(`  ${paint("IPv6", "bold")}`, "")
    for (const [code, czh, cen] of ROUTE_CITIES) {
      for (const carrier of CARRIERS) {
        const r = routes.find((x) => x.city === code && x.carrier === carrier)
        if (!r) continue
        const cls = r.hops.length ? classifyRoute(carrier, r.hops) : null
        const head = `${zh ? `${czh}${L(T[carrier])}` : `${L(T[carrier])} ${cen}`}`
        out.push(`  ${paint(head, "bold")}  ${cls ? (cls.code === "unknown" ? paint(L(cls.label), "gray") : tonePaint(L(cls.label), cls.tone, "bold")) : paint(L(T.routeNone), "gray")}`)
        for (const h of r.hops) {
          const info = hops[h.ip]
          const backbone = hopAsn(h.ip)
          const asn = backbone ?? (info?.asn ? `AS${info.asn}` : "")
          const name = backbone ? L(BACKBONE[backbone]!) : info?.org ? fit(info.org, 16) : ""
          const where = PRIVATE.test(h.ip) || /^f[cd]|^fe80/i.test(h.ip) ? L(T.private) : info?.place ?? ""
          const ms = h.ms !== undefined ? padL(`${h.ms} ms`, 7) : padL("", 7)
          const tail = fit([asn, name, where].filter(Boolean).join(" · "), TAIL)
          const shown = R.ip(h.ip)
          if (width(shown) <= 16) {
            out.push(`  ${paint(padL(String(h.ttl), 2), "gray")} ${pad(shown, 16)}${paint(ms, "gray")}  ${backbone ? tonePaint(tail, "good") : tail}`)
          } else {
            // IPv6 地址放不进 16 列: 地址单独一行, 延迟与归属缩进到下一行
            out.push(`  ${paint(padL(String(h.ttl), 2), "gray")} ${fit(shown, W - 5)}`)
            out.push(`     ${pad("", 16)}${paint(ms, "gray")}  ${backbone ? tonePaint(tail, "good") : tail}`.trimEnd())
          }
        }
        out.push("")
      }
    }
  }
  if (out.at(-1) === "") out.pop()
  out.push(hr())
  return out
}

export const NET_TITLE = T.title
export const ROUTE_TITLE = T.detail
