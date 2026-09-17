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
 */
export function rateLimitKey(ip: string): string {
  const v = (ip || "").trim().toLowerCase()
  if (!v) return "unknown"
  if (!v.includes(":")) return v
  if (!v.includes("::")) return v.split(":").slice(0, 4).join(":") + "::/64"
  const [head = "", tail = ""] = v.split("::")
  const h = head ? head.split(":").filter(Boolean) : []
  const t = tail ? tail.split(":").filter(Boolean) : []
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t]
  return full.slice(0, 4).join(":") + "::/64"
}

/** 同一个 key 在 windowMs 内最多 limit 次; 超限时给出还要等多少秒 */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean, retryAfterSec: number } {
  ensureSweeper(windowMs)
  const now = Date.now()
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
