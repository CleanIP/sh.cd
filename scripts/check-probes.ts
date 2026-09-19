// 探针节点巡检: check.sh 里写死的 EDU / 国际延迟 / 分省测速 / 测速节点是否还活着。
//
//   bun run probes:check
//
// 只读检查, 不写回任何文件。TCP 能连上算活, 连不上的列出来并以 exit 1 结束;
// EDU 的 IPv4 再用 RIPEstat (免 key) 核对是否还在 AS4538 (CERNET), 不在的只告警
// (分支校园可能挂运营商线路, 不算死节点)。

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..")
const sh = readFileSync(resolve(ROOT, "check.sh"), "utf8")

function block(name: string): string[] {
  // 表有用双引号也有单引号, 首行可能与引号同行、结尾引号可能在行尾, 都接受
  const m = new RegExp(`${name}=["']\\n?([\\s\\S]*?)["'](?:\\n|$)`).exec(sh)
  if (!m) throw new Error(`check.sh 里找不到 ${name}`)
  return m[1]!.split("\n").map((l) => l.trim()).filter(Boolean)
}

export interface EduNode { prov: string, v4: string, v6: string }
export function parseEdu(src = sh): EduNode[] {
  const lines = src === sh ? block("EDU_NODES") : src.split("\n").map((l) => l.trim()).filter(Boolean)
  return lines.map((l) => {
    const [prov = "", v4 = "", v6 = ""] = l.split("|")
    return { prov, v4, v6 }
  }).filter((n) => n.prov)
}

export interface IntlNode { code: string, hosts: string[] }
export function parseIntl(src = sh): IntlNode[] {
  const lines = src === sh ? block("INTL_NODES") : src.split("\n").map((l) => l.trim()).filter(Boolean)
  return lines.map((l) => {
    const i = l.indexOf(":")
    return { code: l.slice(0, i), hosts: l.slice(i + 1).split("|").filter(Boolean) }
  }).filter((n) => n.code && n.hosts.length)
}

export interface SpeedNode { group: string, host: string, port: number }
export function parseHostports(src: string): SpeedNode[] {
  return src.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const f = l.split("|")
    const [host = "", port = ""] = (f.at(-1) ?? "").split(":")
    return { group: f[0] ?? l, host, port: Number(port) }
  }).filter((n) => n.host.includes(".") && Number.isInteger(n.port) && n.port > 0 && n.port < 65536)
}

async function tcpOpen(host: string, port: number, ms = 5000): Promise<boolean> {
  try {
    const sock = await Promise.race([
      Bun.connect({ hostname: host, port, socket: {} }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
    ])
    sock.end()
    return true
  } catch {
    return false
  }
}

async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++
      out[k] = await fn(items[k]!)
    }
  }))
  return out as R[]
}

/** RIPEstat 看 IP 当前归属 ASN (免 key, 失败返回空数组, 不让巡检挂掉) */
async function ripeAsns(ip: string): Promise<number[]> {
  try {
    const res = await fetch(`https://stat.ripe.net/data/network-info/data.json?resource=${ip}`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    const j = await res.json() as { data?: { asns?: number[] } }
    return Array.isArray(j?.data?.asns) ? j.data.asns : []
  } catch {
    return []
  }
}

const edu = parseEdu()
const intl = parseIntl()
const cnSpeed = parseHostports(block("CN_SPEED_NODES").join("\n"))
const speed = parseHostports(block("SPEED_NODES").join("\n"))

if (import.meta.main) {
  const dead: string[] = []
  const asnWarn: string[] = []

console.log(`EDU: ${edu.length} 省 × IPv4/IPv6 · 国际延迟: ${intl.length} 点 · 分省测速: ${cnSpeed.length} 节点 · 测速: ${speed.length} 节点`)

// EDU: 443 建连 + IPv4 归属 ASN
await mapLimit(edu, 8, async ({ prov, v4, v6 }) => {
  if (!await tcpOpen(v4, 443)) dead.push(`edu ${prov} IPv4 ${v4} 443 不通`)
  if (v6 && !await tcpOpen(v6, 443)) dead.push(`edu ${prov} IPv6 ${v6} 443 不通`)
  const asns = await ripeAsns(v4)
  if (asns.length && !asns.includes(4538)) asnWarn.push(`edu ${prov} ${v4} 不在 AS4538 (当前 ${asns.join(",")})`)
})

// 国际延迟与测速节点: 主机能解析、8080 端口能连上其一即可
await mapLimit([...intl.map((n) => ({ label: `intl ${n.code}`, hosts: n.hosts, port: 8080 })),
  ...cnSpeed.map((n) => ({ label: `cn ${n.group}`, hosts: [n.host], port: n.port })),
  ...speed.map((n) => ({ label: `speed ${n.group}`, hosts: [n.host], port: n.port }))], 10, async ({ label, hosts, port }) => {
  let ok = false
  for (const h of hosts) {
    try {
      const addrs = await Bun.dns.lookup(h)
      if (!addrs.length) continue
    } catch { continue }
    if (await tcpOpen(h, port)) { ok = true; break }
  }
  if (!ok) dead.push(`${label} 全连不上 (${hosts.join(" / ")})`)
})

  for (const w of asnWarn) console.log(`告警 ${w}`)
  if (!dead.length && !asnWarn.length) {
    console.log("节点全活")
  } else {
    for (const d of dead) console.log(`死亡 ${d}`)
    console.log(`共 ${dead.length} 个死亡 · ${asnWarn.length} 个 ASN 告警`)
    if (dead.length) process.exit(1)
  }
}
