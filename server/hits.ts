// 脚本运行次数, 显示在报告底部「今日 N 次 · 累计 N 次」。
// 存 $DATA_DIR/hits.json, tmp + rename 原子替换; 单进程写, 无并发问题。

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

interface Store {
  total: number
  /** 按东八区日期的每日次数, 只留最近 7 天 */
  days: Record<string, number>
}

const FILE = resolve(process.env.DATA_DIR || "data", "hits.json")

let cache: Store | null = null

function load(): Store {
  if (cache) return cache
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8"))
    cache = { total: Number(raw.total) || 0, days: raw.days && typeof raw.days === "object" ? raw.days : {} }
  } catch {
    cache = { total: 0, days: {} }
  }
  return cache
}

// 用户大多在中国, 按 UTC 切天会在早 8 点前显示昨天的数
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date())

export function hitStats(): { total: number, today: number } {
  const s = load()
  return { total: s.total, today: s.days[today()] || 0 }
}

export function recordHit(): { total: number, today: number } {
  const s = load()
  const day = today()
  s.total += 1
  s.days[day] = (s.days[day] || 0) + 1
  for (const d of Object.keys(s.days).sort().slice(0, -7)) delete s.days[d]
  try {
    mkdirSync(dirname(FILE), { recursive: true })
    writeFileSync(`${FILE}.tmp`, JSON.stringify(s))
    renameSync(`${FILE}.tmp`, FILE)
  } catch {
    // 写盘失败只影响重启后的计数, 不让请求失败
  }
  return { total: s.total, today: s.days[day] || 0 }
}
