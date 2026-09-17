// sh.cd 检测脚本报告的公共小工具: 字段校验、按终端宽度截断、单位换算、延迟走势小图。

import { width } from "./base"

const str = (v: unknown) => (typeof v === "string" ? v : "")

/** 自由文本字段 (CPU 型号、系统名等): 拒绝控制字符 (含 ESC), 限长, 按竖线拆成若干段 */
export function textParts(v: unknown, count: number, max = 160): string[] | null {
  const s = str(v)
  if (!s || s.length > max * count || /[\x00-\x1f\x7f]/.test(s)) return null
  const parts = s.split("|")
  if (parts.length !== count) return null
  return parts.map((p) => p.trim())
}

/** 数字字段, 可带小数; 空串 / fail 返回 null */
export function num(v: string | undefined): number | null {
  if (v === undefined || v === "" || v === "fail") return null
  if (!/^-?\d{1,15}(\.\d{1,4})?$/.test(v)) return null
  return Number(v)
}

/** 按终端列宽截断, 超出用 … */
export function fit(s: string, max: number): string {
  if (width(s) <= max) return s
  let out = ""
  for (const ch of s) {
    if (width(out + ch) > max - 1) break
    out += ch
  }
  return out.trimEnd() + "…"
}

/** 按终端列宽折行 (优先在空格处断) */
export function wrap(s: string, max: number): string[] {
  const words = s.split(" ")
  const lines: string[] = []
  let cur = ""
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (width(next) <= max) cur = next
    else {
      if (cur) lines.push(cur)
      cur = width(w) > max ? fit(w, max) : w
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : [""]
}

export function fmtBytes(b: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"]
  let v = b
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

/** KiB/s → MB/s 或 GB/s */
export function fmtKiB(kib: number): string {
  const mb = kib / 1024
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB/s`
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB/s`
}

export function fmtIops(iops: number): string {
  if (iops >= 1000) return `${(iops / 1000).toFixed(iops >= 100000 ? 0 : 1)}K`
  return String(Math.round(iops))
}

export function fmtMbps(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(2)} Gbps`
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} Mbps`
}

export function fmtUptime(sec: number, zh: boolean): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (zh) return d ? `${d} 天 ${h} 小时` : h ? `${h} 小时 ${m} 分` : `${m} 分钟`
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
}

const BLOCKS = "▁▂▃▄▅▆▇█"

/** 延迟走势小图: 按给定区间映射到 8 级方块, 丢包 (null) 画成 × */
export function spark(samples: Array<number | null>, lo: number, hi: number): string {
  return samples.map((s) => {
    if (s === null) return "×"
    const r = hi > lo ? (s - lo) / (hi - lo) : 0
    return BLOCKS[Math.max(0, Math.min(7, Math.round(r * 7)))]!
  }).join("")
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** 值超出列宽时按 " · " 分段折行, 第一行带标签 */
export function rowsFlex(row: (label: string, value: string) => string, label: string, value: string, max: number): string[] {
  const strip = (s: string) => s.replace(/\x1b\[[\d;]*m/g, "")
  if (width(strip(value)) <= max) return [row(label, value)]
  const out: string[] = []
  let cur = ""
  for (const seg of value.split(" · ")) {
    const next = cur ? `${cur} · ${seg}` : seg
    if (width(strip(next)) > max && cur) {
      out.push(row(out.length ? "" : label, cur))
      cur = seg
    } else cur = next
  }
  if (cur) out.push(row(out.length ? "" : label, cur))
  return out
}

/** 去掉行尾空格, 包括夹在行尾颜色控制符前面的空格 (彩色模式下 trimEnd 去不掉) */
export function rtrim(s: string): string {
  let prev = ""
  let cur = s
  while (prev !== cur) {
    prev = cur
    cur = cur.replace(/ +((?:\x1b\[[\d;]*m)+)$/, "$1").replace(/ +$/, "")
  }
  return cur
}

export { str }
