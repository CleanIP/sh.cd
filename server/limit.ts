// 进程内滑动窗口限流: 只防同一出口短时间内反复刷, 不设每日次数上限。
// 单进程服务, 不引 Redis; 进程重启会清零, 对这个目标无所谓。

const buckets = new Map<string, number[]>()

let sweeper: ReturnType<typeof setInterval> | null = null
function ensureSweeper(windowMs: number) {
  if (sweeper) return
  sweeper = setInterval(() => {
    const cutoff = Date.now() - windowMs
    for (const [k, hits] of buckets) {
      if (!hits.length || hits[hits.length - 1]! < cutoff) buckets.delete(k)
    }
  }, 5 * 60_000)
  sweeper.unref?.()
}

/**
 * 限流键: IPv4 原样, IPv6 按 /64 聚合。
 * 系统的 IPv6 隐私扩展会轮换临时地址, 按完整地址限流等于没限流; /64 是单个局域网的标准分配单位。
 * 各组去前导零后再取前 4 组, "2001:0db8…" 与 "2001:db8…" 是同一个 key。
 */
export function rateLimitKey(ip: string): string {
  const v = (ip || "").trim().toLowerCase()
  if (!v) return "unknown"
  if (!v.includes(":")) return v
  const [head = "", tail = ""] = v.split("::")
  const h = head ? head.split(":") : []
  const t = tail ? tail.split(":") : []
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t]
  if (full.length !== 8 || full.some((g) => !/^[0-9a-f]{0,4}$/.test(g))) return v
  return full.map((g) => g.replace(/^0+/, "") || "0").slice(0, 4).join(":") + "::/64"
}

/**
 * 报告与 DNS 接口只给检测脚本用: 脚本的 UA 固定是 "sh.cd/<版本> (+https://sh.cd)" (check.sh 的 UA_SELF)。
 * 2026-09-27 13:44 起有程序 (UA vpn-probe/cleanip) 从 532 个 VPN 出口直接调 /report 查出口 IP,
 * 不下载也不运行脚本, 一天三百多次, 灌水运行次数又消耗 IP 查询额度。UA 能伪造, 这里只挡住不装的。
 */
const SCRIPT_UA = /^sh\.cd\/\d{1,3}\.\d{1,3}\.\d{1,3} \(\+https:\/\/sh\.cd\)$/

export function isScriptClient(ua: string | null | undefined): boolean {
  return SCRIPT_UA.test((ua || "").trim())
}

/** 同一个 key 在 windowMs 内最多 limit 次; 超限时给出还要等多少秒 (key 上限 2 万, 防 key 爆炸打爆内存) */
const MAX_KEYS = 20_000
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean, retryAfterSec: number } {
  ensureSweeper(windowMs)
  const now = Date.now()
  if (!buckets.has(key) && buckets.size >= MAX_KEYS) {
    const oldest = buckets.keys().next()
    if (!oldest.done) buckets.delete(oldest.value)
  }
  let hits = buckets.get(key)
  if (!hits) buckets.set(key, (hits = []))
  let drop = 0
  while (drop < hits.length && hits[drop]! < now - windowMs) drop++
  if (drop) hits.splice(0, drop)
  if (hits.length >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hits[0]! + windowMs - now) / 1000)) }
  }
  hits.push(now)
  return { ok: true, retryAfterSec: 0 }
}
