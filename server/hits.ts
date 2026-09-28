// 脚本运行次数, 显示在报告底部「今日 N 次 · 累计 N 次」。 只算检测脚本自己的提交 (非脚本客户端在 main.ts 就被拒了)。
// 存 $DATA_DIR/hits.json, tmp + rename 原子替换; 单进程写, 无并发问题。
// 计数同步读缓存, 落盘异步, 不阻塞请求。

import { readFileSync } from "node:fs"
import { mkdir, rename, writeFile } from "node:fs/promises"
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

export async function recordHit(): Promise<{ total: number, today: number }> {
  const s = load()
  const day = today()
  s.total += 1
  s.days[day] = (s.days[day] || 0) + 1
  for (const d of Object.keys(s.days).sort().slice(0, -7)) delete s.days[d]
  try {
    await mkdir(dirname(FILE), { recursive: true })
    await writeFile(`${FILE}.tmp`, JSON.stringify(s))
    await rename(`${FILE}.tmp`, FILE)
  } catch (e) {
    // 写盘失败只影响重启后的计数, 不让请求失败, 但要记下来 (磁盘满了能早发现)
    console.error(`[sh.cd] hits write failed: ${e instanceof Error ? e.message : e}`)
  }
  return { total: s.total, today: s.days[day] || 0 }
}
