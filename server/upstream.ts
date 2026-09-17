// 报告需要的外部数据: CleanIP 的 IP 情报、DNS 探针事件、RIPEstat / PeeringDB 的 BGP 信息。
//
// 连接参数都来自环境变量 (见 deploy/sh.cd.env.example), 仓库里不写任何地址或密钥:
//   CLEANIP_API            CleanIP API 地址
//   CLEANIP_API_KEY        API key, 与 CLEANIP_ORIGIN 成对 (key 配了域名白名单时没有 Origin 会被忽略)
//   CLEANIP_ORIGIN
//   DNS_PROBE_ZONE         DNS 探针的一次性子域所在的域
//   DNS_PROBE_NS_URLS      权威 NS 的事件接口, 逗号分隔
//   DNS_PROBE_TOKEN

import type { FullReport } from "./render/ip"
import type { BgpInfo } from "./render/net"
import type { DnsResolver } from "./render/local"

const env = (k: string) => String(process.env[k] || "").trim()

const UA = "sh.cd (+https://sh.cd)"

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

async function getJson<T>(url: string, opts: { timeout: number, method?: string, headers?: Record<string, string>, body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: { "content-type": "application/json", ...opts.headers },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(opts.timeout),
  })
  if (!res.ok) throw new HttpError(res.status)
  return res.json() as Promise<T>
}

/**
 * 调 CleanIP API, 把脚本运行者的 IP 作为 X-Real-IP 传过去: 按 IP 的限流和爬虫识别都作用在运行者身上,
 * 不会全算到本服务头上。UA 用 sh.cd 自己的, 查询按普通访客查本机的方式进行 (不喂存量快照)。
 */
function cleanip<T>(path: string, caller: string, opts: { timeout: number, method?: string, body?: unknown }): Promise<T> {
  const headers: Record<string, string> = { "x-real-ip": caller, "user-agent": UA }
  if (env("CLEANIP_API_KEY") && env("CLEANIP_ORIGIN")) {
    headers["x-api-key"] = env("CLEANIP_API_KEY")
    headers.origin = env("CLEANIP_ORIGIN")
  }
  return getJson<T>(`${env("CLEANIP_API").replace(/\/+$/, "")}${path}`, { ...opts, headers })
}

export async function fetchIp(caller: string): Promise<{ r: FullReport | null, blocked: boolean }> {
  try {
    const r = await cleanip<FullReport>(`/api/v2/${encodeURIComponent(caller)}`, caller, { timeout: 12000 })
    return { r: r?.ok && r.ip ? r : null, blocked: false }
  } catch (e) {
    return { r: null, blocked: e instanceof HttpError && e.status === 403 }
  }
}

/** 批量查归属 (mode=geo 只用本地地理库, 不调付费源), 一次最多 10 个 */
export async function geoLookup(ips: string[], caller: string): Promise<Record<string, any>> {
  const out: Record<string, any> = {}
  const groups: string[][] = []
  for (let i = 0; i < ips.length; i += 10) groups.push(ips.slice(i, i + 10))
  await Promise.all(groups.map(async (g) => {
    try {
      const res = await cleanip<{ results?: Record<string, any> }>("/api/v2/batch", caller, { method: "POST", body: { ips: g, mode: "geo" }, timeout: 8000 })
      Object.assign(out, res?.results || {})
    } catch { /* 查不到的跳过 */ }
  }))
  return out
}

// —— DNS 出口 ——
// 脚本按系统 DNS 解析几个一次性子域, 权威 NS 记下来问的递归服务器 (事件在 NS 内存里保留约 8 分钟)。

export function dnsProbeStart() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const uuid = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  const zone = env("DNS_PROBE_ZONE").replace(/\.+$/, "")
  return zone ? { ok: true, uuid, probeHost: `${uuid}.${zone}` } : { ok: false }
}

export async function resolveDns(uuid: string, caller: string, lang: "zh" | "en"): Promise<DnsResolver[] | null> {
  const urls = env("DNS_PROBE_NS_URLS").split(",").map((s) => s.trim()).filter(Boolean)
  const token = env("DNS_PROBE_TOKEN")
  if (!urls.length || !token || !/^[0-9a-f]{32}$/.test(uuid)) return null
  const chunks = await Promise.all(urls.map(async (u) => {
    try {
      const r = await getJson<{ events?: Array<{ resolver_ip?: string, at?: string }> }>(`${u.replace(/\/+$/, "")}/events?uuid=${uuid}`, {
        timeout: 4000, headers: { authorization: `Bearer ${token}` },
      })
      return Array.isArray(r?.events) ? r.events : []
    } catch {
      return []
    }
  }))
  const events = chunks.flat().sort((a, b) => String(a.at).localeCompare(String(b.at)))
  const ips = [...new Set(events.map((e) => e.resolver_ip).filter((x): x is string => Boolean(x)))].slice(0, 10)
  if (!ips.length) return []
  const results = await geoLookup(ips, caller)
  return ips.map((ip) => {
    const row = results[ip] || {}
    return {
      ip,
      asn: row.network?.asn || undefined,
      org: row.network?.asn_org || row.network?.asn_name || row.network?.isp || undefined,
      country: (lang === "zh" ? row.geo?.country : row.geo?.country_en || row.geo?.country) || undefined,
    }
  })
}

// —— BGP 与接入: RIPEstat 邻居 + PeeringDB 接入点数, 按 ASN 缓存 12 小时 ——

type Peering = Pick<BgpInfo, "upstreams" | "counts" | "ix" | "fac">
const bgpCache = new Map<number, { at: number, v: Peering }>()

async function fetchPeering(asn: number): Promise<Peering> {
  const hit = bgpCache.get(asn)
  if (hit && Date.now() - hit.at < 12 * 3600_000) return hit.v
  const v: Peering = { upstreams: [] }
  await Promise.all([
    (async () => {
      try {
        const res = await getJson<{ data?: { neighbours?: Array<{ asn: number, type: string, power?: number }> } }>(
          `https://stat.ripe.net/data/asn-neighbours/data.json?resource=AS${asn}`, { timeout: 8000 })
        const ns = res?.data?.neighbours || []
        const up = ns.filter((n) => n.type === "left").sort((a, b) => (b.power ?? 0) - (a.power ?? 0))
        v.counts = { upstreams: up.length, peers: ns.filter((n) => n.type === "uncertain").length, downstreams: ns.filter((n) => n.type === "right").length }
        v.upstreams = up.slice(0, 8).map((n) => ({ asn: n.asn }))
      } catch { /* RIPEstat 偶发超时, 不影响其它段 */ }
    })(),
    (async () => {
      try {
        const res = await getJson<{ data?: Array<{ ix_count?: number, fac_count?: number }> }>(`https://www.peeringdb.com/api/net?asn=${asn}`, { timeout: 8000 })
        const n = res?.data?.[0]
        if (n) {
          v.ix = n.ix_count
          v.fac = n.fac_count
        }
      } catch { /* PeeringDB 没有登记的网络很常见 */ }
    })(),
  ])
  // 上游名称: RIPEstat as-names ("COGENT-174 - Cogent Communications, US" → "Cogent Communications")
  await Promise.all(v.upstreams.map(async (u) => {
    try {
      const res = await getJson<{ data?: { names?: Record<string, string> } }>(`https://stat.ripe.net/data/as-names/data.json?resource=AS${u.asn}`, { timeout: 6000 })
      const raw = res?.data?.names?.[String(u.asn)]
      if (raw) u.name = (raw.includes(" - ") ? raw.split(" - ").slice(1).join(" - ") : raw).replace(/, [A-Z]{2}$/, "")
    } catch { /* 没有名称就只显示 AS 号 */ }
  }))
  bgpCache.set(asn, { at: Date.now(), v })
  return v
}

export async function bgpInfo(r: FullReport | null): Promise<BgpInfo | null> {
  const net = r?.network
  if (!net?.asn) return null
  const peering = await fetchPeering(Number(net.asn))
  const address = typeof net.asn_address === "string" ? net.asn_address.split("\n").map((s: string) => s.trim()).filter(Boolean).join(", ") : undefined
  return {
    asn: Number(net.asn),
    name: net.asn_org || net.asn_name,
    rir: net.rir,
    created: net.asn_created,
    updated: net.asn_updated,
    address,
    route: net.route,
    range: net.ip_range,
    rpki: net.rpki_status,
    ...peering,
  }
}
