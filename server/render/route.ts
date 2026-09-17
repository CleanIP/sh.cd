// 三网回程线路判定: 按回程逐跳 IP 所属的骨干网段, 判断 CN2 GIA / 9929 / CMIN2 等线路类型。
//
// 骨干网段与判定规则对齐 github.com/oneclickvirt/backtrace (Apache-2.0) 的 bk/ipv4_asn.go 与
// bk/route_classification.go (2026-09-13 版本): 精品线路要求足够的跳数证据, 只看到一跳骨干或只到目的网时
// 不下结论。该项目前缀匹配不带点 ("61.14" 会连 61.140–149 一起匹配), 这里统一按完整字节段匹配。
//
// 与参考实现的一处不同: 只看到一跳 CN2 且全程没有 163 骨干时, 参考实现记为「CN2 混合」, 这里记为「CN2」
// (够不上确认 GIA, 但也没有混合的证据)。CN2 路由器对「TTL 超时」回包限速很严, 同一条线路连测几次,
// CN2 段有时回 1 跳有时回 3 跳 (2026-09-16 洛杉矶到上海电信), 按混合算会把同一条 GIA 线路时判时不判。
//
// 探测在用户机器上用 ping 按 TTL 逐跳完成 (check.sh run_route), 这里只做判定, 规则可以随时调整而不用改脚本。

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Pair, Tone } from "./base"

export interface RouteHop {
  ttl: number
  ip: string
  /** 深度模式下对该跳直接 ping 的延迟 */
  ms?: number
}

export interface RouteClass {
  code: string
  label: Pair
  tone: Tone
}

function octets(ip: string): number[] | null {
  const parts = ip.split(".").map(Number)
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? parts : null
}

function isCMIN2(o: number[]): boolean {
  if (o[0] !== 223) return false
  if (o[1] === 118 && o[2] === 32) return true
  if (o[1] === 120 && o[2]! >= 128) return true
  if (o[1] !== 119) return false
  const t = o[2]!
  return t === 8 || t === 9 || (t >= 10 && t <= 15) || (t >= 26 && t <= 29) || (t >= 32 && t <= 37)
    || t === 74 || t === 75 || t === 88 || t === 89 || t === 100 || t === 252 || t === 253
}

// —— IPv6: 骨干网段前缀取自 oneclickvirt/backtrace 的 bk/prefix/as*.txt (Apache-2.0, 见 prefix/NOTICE) ——
// 两种写法: CIDR ("2400:9380:9001::/48", 按位匹配) 与文本前缀 ("2402:4f00", 按地址文本开头匹配, 与参考实现一致);
// 多个命中取最长的。前缀最短 /20, 按地址第一组建索引。

const V6_ASNS = ["AS4809", "AS4134", "AS9929", "AS10099", "AS4837", "AS58807", "AS9808", "AS58453", "AS23764"]

export function v6ToBigInt(ip: string): bigint | null {
  const s = ip.toLowerCase()
  if (!/^[0-9a-f:]+$/.test(s) || (s.match(/::/g)?.length ?? 0) > 1) return null
  const [head = "", tail] = s.includes("::") ? s.split("::") : [s, undefined]
  const h = head ? head.split(":") : []
  const t = tail ? tail.split(":") : []
  const groups = tail === undefined ? h : [...h, ...Array(8 - h.length - t.length).fill("0"), ...t]
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n)
}

interface V6Prefix { asn: string, bits: number, net?: bigint, text?: string }
let v6Index: Map<string, V6Prefix[]> | null = null

function loadV6(): Map<string, V6Prefix[]> {
  if (v6Index) return v6Index
  const index = new Map<string, V6Prefix[]>()
  const add = (key: string, p: V6Prefix) => index.set(key, [...(index.get(key) ?? []), p])
  for (const asn of V6_ASNS) {
    let text = ""
    try {
      text = readFileSync(resolve(import.meta.dir, `prefix/${asn.toLowerCase()}.txt`), "utf8")
    } catch {
      continue
    }
    for (const raw of text.split("\n")) {
      const line = raw.trim().toLowerCase()
      if (!line) continue
      if (line.includes("/")) {
        const [addr, len] = line.split("/")
        const bits = Number(len)
        const n = v6ToBigInt(addr!)
        if (n === null || !(bits >= 16 && bits <= 128)) continue
        add(String((n >> 112n) & 0xffffn), { asn, bits, net: n >> BigInt(128 - bits) })
      } else {
        const first = parseInt(line.split(":")[0]!, 16)
        if (Number.isNaN(first)) continue
        add(String(first), { asn, bits: line.replace(/:/g, "").length * 4, text: line })
      }
    }
  }
  v6Index = index
  return index
}

function hopAsn6(ip: string): string | null {
  const n = v6ToBigInt(ip)
  if (n === null) return null
  const lower = ip.toLowerCase()
  let best: V6Prefix | null = null
  for (const p of loadV6().get(String((n >> 112n) & 0xffffn)) ?? []) {
    const hit = p.net !== undefined ? n >> BigInt(128 - p.bits) === p.net : lower.startsWith(p.text!)
    if (hit && (!best || p.bits > best.bits || (p.bits === best.bits && p.asn < best.asn))) best = p
  }
  return best?.asn ?? null
}

/** 骨干网 ASN, 认不出返回 null (IPv4 按网段规则, IPv6 按前缀表) */
export function hopAsn(ip: string): string | null {
  if (ip.includes(":")) return hopAsn6(ip)
  const o = octets(ip)
  if (!o) return null
  const [a, b] = o as [number, number, number, number]
  const is = (x: number, y: number) => a === x && b === y
  if (is(59, 43)) return "AS4809" // 电信 CN2
  if (is(202, 97)) return "AS4134" // 电信 163
  if (is(218, 105) || is(210, 51)) return "AS9929" // 联通 9929
  if (is(202, 77) || is(43, 252) || is(61, 14)) return "AS10099" // 联通 CUG
  if (is(219, 158)) return "AS4837" // 联通 4837
  if (isCMIN2(o)) return "AS58807" // 移动 CMIN2
  if (a === 223 && b >= 118 && b <= 121) return "AS58453" // 移动 CMI
  if (is(221, 183) || is(111, 24)) return "AS9808" // 移动 CMNET
  if (is(69, 194) || is(203, 22)) return "AS23764" // 电信 CTGNET
  return null
}

/** 第一次出现的位置与出现的跳数 (同一 TTL 有多个 IP 时算一跳) */
function position(hops: string[][], asn: string): [first: number, count: number] {
  let first = -1
  let count = 0
  hops.forEach((asns, i) => {
    if (!asns.includes(asn)) return
    if (first < 0) first = i
    count++
  })
  return [first, count]
}

const C = (code: string, zh: string, en: string, tone: Tone): RouteClass => ({ code, label: [zh, en], tone })
const UNKNOWN = C("unknown", "未识别", "Unknown", "neutral")

export type Carrier = "ct" | "cu" | "cm"

// 教育网线路常见的境外转接方 (骨干网段表里没有的几家), 按地址段前缀认
const TRANSIT: Array<[name: string, prefixes: string[]]> = [
  ["HE", ["184.104.", "184.105.", "216.218.", "74.82.", "64.62.", "2001:470:"]],
  ["NTT", ["129.250.", "2001:218:"]],
  ["Cogent", ["154.54.", "2001:550:"]],
  ["HKIX", ["123.255.90.", "202.40.161.", "2001:7fa:"]],
  ["Equinix", ["206.223.", "27.111.228.", "2001:de8:"]],
]

function transitOf(ip: string): string | null {
  const v = ip.toLowerCase()
  for (const [name, prefixes] of TRANSIT) {
    if (prefixes.some((p) => v.startsWith(p))) return name
  }
  return null
}

/**
 * 教育网回程: CERNET 自己不在骨干网段表里, 看这条线路在进教育网之前最后经过的骨干网 ——
 * 结果形如 CMI / 163 / 4837 / CN2, 认不出就是未识别。
 */
export function classifyEdu(route: RouteHop[]): { code: string, label: Pair } | null {
  let last: string | null = null
  for (const h of route) {
    const asn = hopAsn(h.ip)
    if (asn) { last = asn; continue }
    const t = transitOf(h.ip)
    if (t) last = t
  }
  if (!last) return null
  const name: Record<string, Pair> = {
    AS4809: ["CN2", "CN2"], AS4134: ["163", "163"], AS23764: ["CTGNET", "CTGNET"],
    AS9929: ["9929", "9929"], AS10099: ["CUG", "CUG"], AS4837: ["4837", "4837"],
    AS58807: ["CMIN2", "CMIN2"], AS58453: ["CMI", "CMI"], AS9808: ["CMNET", "CMNET"],
  }
  return { code: last, label: name[last] ?? [last, last] }
}

export function classifyRoute(carrier: Carrier, route: RouteHop[]): RouteClass {
  // 按 TTL 分组, 每跳一组 ASN
  const byTtl = new Map<number, Set<string>>()
  for (const h of route) {
    const asn = hopAsn(h.ip)
    if (!asn) continue
    if (!byTtl.has(h.ttl)) byTtl.set(h.ttl, new Set())
    byTtl.get(h.ttl)!.add(asn)
  }
  const hops = [...byTtl.entries()].sort((x, y) => x[0] - y[0]).map(([, s]) => [...s])

  if (carrier === "ct") {
    const [cn2, cn2Hops] = position(hops, "AS4809")
    const [ct163, ct163Hops] = position(hops, "AS4134")
    const [ctg] = position(hops, "AS23764")
    if (cn2 >= 0) {
      if (cn2Hops < 2) return ct163 < 0 ? C("ct_cn2", "CN2", "CN2", "neutral") : C("ct_cn2_mixed", "CN2 混合", "CN2 mixed", "neutral")
      if (ct163 < 0 || (cn2 < ct163 && ct163Hops <= 1)) return C("ct_cn2_gia", "CN2 GIA", "CN2 GIA", "good")
      if (cn2 < ct163) return C("ct_cn2_mixed", "CN2 混合", "CN2 mixed", "neutral")
      return C("ct_cn2_gt", "CN2 GT", "CN2 GT", "neutral")
    }
    if (ctg >= 0) return C("ct_ctgnet", "CTGNET", "CTGNET", "good")
    if (ct163 >= 0 && ct163Hops > 1) return C("ct_163", "163 普通", "163 std", "neutral")
    return UNKNOWN
  }

  if (carrier === "cu") {
    const [cu9929] = position(hops, "AS9929")
    const [cug] = position(hops, "AS10099")
    const [cu4837, cu4837Hops] = position(hops, "AS4837")
    if (cu9929 >= 0) {
      if (cu4837 >= 0 && cu4837 < cu9929) return C("cu_9929_mixed", "9929 混合", "9929 mixed", "neutral")
      return C("cu_9929", "9929", "9929", "good")
    }
    if (cug >= 0) return C("cu_cug", "CUG", "CUG", "neutral")
    if (cu4837 >= 0 && cu4837Hops > 1) return C("cu_4837", "4837 普通", "4837 std", "neutral")
    return UNKNOWN
  }

  const [cmin2] = position(hops, "AS58807")
  const [cmi] = position(hops, "AS58453")
  const [cmnet] = position(hops, "AS9808")
  if (cmin2 >= 0) {
    if (cmi >= 0 && cmi < cmin2) return C("cm_cmin2_mixed", "CMIN2 混合", "CMIN2 mixed", "neutral")
    return C("cm_cmin2", "CMIN2", "CMIN2", "good")
  }
  if (cmi >= 0) return C("cm_cmi", "CMI 普通", "CMI std", "neutral")
  if (cmnet >= 0) return C("cm_cmnet", "CMNET 普通", "CMNET std", "neutral")
  return UNKNOWN
}
