// sh.cd 检测脚本「硬件与性能」阶段: 解析脚本提交的系统 / 硬件信息与跑分, 排成终端报告。
// 字段格式见 check.sh 的「一、硬件与性能」段注释。

import { pad, W, width, type Pair, type Renderer, type Tone } from "./base"
import { fit, fmtBytes, fmtIops, fmtKiB, fmtUptime, num, rowsFlex, str, textParts, wrap } from "./util"

type Parts = string[] | null

export interface HwData {
  os: Parts
  virt: string | null
  uptime: Parts
  procs: Parts
  tz: Parts
  board: Parts
  chipset: string[]
  nic: string[]
  gpu: string[]
  cpu: Parts
  cache: Parts
  flags: string[] | null
  mem: Parts
  overcommit: Parts
  disk: Parts
  bench: {
    cpu: Parts
    mem: Parts
    disk: Record<string, Parts>
    atto: Array<[size: string, parts: string[]]>
    dd: Parts
    /** Geekbench: [版本, 状态, 单核, 多核, 结果页] */
    gb: Parts
  }
  /** 温度 (°C), 每类一个 */
  temps: Array<{ kind: string, c: number }>
  /** 物理机硬盘 SMART */
  smart: SmartDisk[]
  /** 物理机内存插槽: 最大容量字节 | 插槽数 | 纠错 */
  dimmArray: Parts
  dimms: Dimm[]
  /** 物理机上没有 root, 读不了 SMART 与内存条 */
  noRoot: boolean
  dur: number | null
}

export interface SmartDisk {
  proto: string
  model: string
  bytes: number | null
  kind: string
  health: string
  hours: number | null
  temp: number | null
  used: number | null
  written: number | null
  realloc: number | null
  pending: number | null
  uncorrect: number | null
  mediaErr: number | null
}

export interface Dimm {
  count: number
  bytes: number
  type: string
  speed: number | null
  conf: number | null
  maker: string
  part: string
  rank: number | null
  form: string
}

const list = (v: unknown) => {
  const s = str(v)
  if (!s || s.length > 600 || /[\x00-\x1f\x7f|]/.test(s)) return []
  return s.split(";").map((x) => x.trim()).filter(Boolean).slice(0, 4)
}

export const ATTO_SIZES = ["512", "1k", "2k", "4k", "8k", "16k", "32k", "64k", "128k", "256k", "512k", "1m", "2m", "4m", "8m", "16m", "32m", "64m"]

export function parseHw(body: Record<string, unknown>): HwData | null {
  if (!Object.keys(body).some((k) => k.startsWith("hw_"))) return null
  const virt = str(body.hw_virt)
  const flags = str(body.hw_flags)
  return {
    os: textParts(body.hw_os, 3),
    virt: /^[a-z0-9-]{1,24}$/.test(virt) ? virt : null,
    uptime: textParts(body.hw_uptime, 2, 60),
    procs: textParts(body.hw_procs, 4, 12),
    tz: textParts(body.hw_tz, 3, 60),
    board: textParts(body.hw_board, 4),
    chipset: list(body.hw_chipset),
    nic: list(body.hw_nic),
    gpu: list(body.hw_gpu),
    cpu: textParts(body.hw_cpu, 6),
    cache: textParts(body.hw_cache, 4, 24),
    flags: /^[a-z0-9_,]{0,200}$/.test(flags) ? flags.split(",").filter(Boolean) : null,
    mem: textParts(body.hw_mem, 5, 24),
    overcommit: textParts(body.hw_overcommit, 2, 24),
    disk: textParts(body.hw_disk, 7, 40),
    bench: {
      cpu: textParts(body.bn_cpu, 4, 24),
      mem: textParts(body.bn_mem, 3, 24),
      disk: Object.fromEntries(["r4q1", "r4q32", "s1q1", "s1q8"].map((k) => [k, textParts(body[`bn_${k}`], 4, 20)])),
      atto: ATTO_SIZES.map((s) => [s, textParts(body[`bn_atto_${s}`], 4, 20)] as const).filter((x): x is [string, string[]] => !!x[1]),
      dd: textParts(body.bn_dd, 3, 24),
      gb: parseGb(str(body.bn_gb)),
    },
    temps: str(body.hw_temp).split(",").map((x) => /^(cpu|nvme|disk|gpu|board):(\d{1,3}(?:\.\d)?)$/.exec(x)).filter((m): m is RegExpExecArray => !!m).map((m) => ({ kind: m[1]!, c: Number(m[2]) })),
    smart: Array.from({ length: 8 }, (_, i) => parseSmart(str(body[`sm_${i + 1}`]))).filter((x): x is SmartDisk => !!x),
    dimmArray: textParts(body.mm_array, 3, 40),
    dimms: Array.from({ length: 6 }, (_, i) => parseDimm(str(body[`mm_${i + 1}`]))).filter((x): x is Dimm => !!x),
    noRoot: str(body.hw_noroot) === "1",
    dur: num(str(body.dur)),
  }
}

const okText = (s: string | undefined, max = 60) => (s !== undefined && s.length <= max && !/[\x00-\x1f\x7f]/.test(s) ? s.trim() : "")
const optNum = (s: string | undefined) => (s && /^\d{1,20}$/.test(s) ? Number(s) : null)

function parseGb(v: string): Parts {
  const m = /^(\d+\.\d+\.\d+)\|(ok|unsupported|lowmem|nospace|download|fail)(?:\|(\d{0,6})\|(\d{0,7})\|(https:\/\/browser\.geekbench\.com\/v6\/cpu\/\d{1,12}))?$/.exec(v)
  return m ? [m[1]!, m[2]!, m[3] ?? "", m[4] ?? "", m[5] ?? ""] : null
}

function parseSmart(v: string): SmartDisk | null {
  if (!v || v.length > 300) return null
  const p = v.split("|")
  if (p.length !== 13 || !/^(nvme|ata|scsi|)$/.test(p[0]!) || !/^(nvme|ssd|hdd|)$/.test(p[3]!) || !/^(pass|fail|)$/.test(p[4]!)) return null
  const model = okText(p[1])
  if (!model) return null
  return {
    proto: p[0]!, model, bytes: optNum(p[2]), kind: p[3]!, health: p[4]!, hours: optNum(p[5]), temp: optNum(p[6]),
    used: optNum(p[7]), written: optNum(p[8]), realloc: optNum(p[9]), pending: optNum(p[10]), uncorrect: optNum(p[11]), mediaErr: optNum(p[12]),
  }
}

function parseDimm(v: string): Dimm | null {
  if (!v || v.length > 200) return null
  const p = v.split("|")
  if (p.length !== 9 || !/^\d{1,3}$/.test(p[0]!) || !/^\d{1,15}$/.test(p[1]!)) return null
  return {
    count: Number(p[0]), bytes: Number(p[1]), type: okText(p[2], 20), speed: optNum(p[3]), conf: optNum(p[4]),
    maker: okText(p[5], 30), part: okText(p[6], 30), rank: optNum(p[7]), form: okText(p[8], 20),
  }
}

const VIRT: Record<string, [Pair, Tone]> = {
  none: [["物理机", "Bare metal"], "good"],
  kvm: [["KVM 虚拟机", "KVM VM"], "neutral"],
  qemu: [["QEMU 虚拟机", "QEMU VM"], "neutral"],
  bochs: [["KVM 虚拟机", "KVM VM"], "neutral"],
  xen: [["Xen 虚拟机", "Xen VM"], "neutral"],
  vmware: [["VMware 虚拟机", "VMware VM"], "neutral"],
  oracle: [["VirtualBox 虚拟机", "VirtualBox VM"], "neutral"],
  microsoft: [["Hyper-V 虚拟机", "Hyper-V VM"], "neutral"],
  amazon: [["AWS Nitro 虚拟机", "AWS Nitro VM"], "neutral"],
  google: [["Google Cloud 虚拟机", "Google Cloud VM"], "neutral"],
  vm: [["虚拟机", "Virtual machine"], "neutral"],
  openvz: [["OpenVZ 容器", "OpenVZ container"], "warn"],
  lxc: [["LXC 容器", "LXC container"], "warn"],
  "lxc-libvirt": [["LXC 容器", "LXC container"], "warn"],
  docker: [["Docker 容器", "Docker container"], "warn"],
  podman: [["Podman 容器", "Podman container"], "warn"],
  "systemd-nspawn": [["nspawn 容器", "nspawn container"], "warn"],
  wsl: [["WSL", "WSL"], "neutral"],
}

// 指令集: 顺序即显示顺序; 虚拟化扩展在 VM 里通常不透传, 缺失只做灰色提示
const FLAGS: Array<[keys: string[], label: string, virtExt: boolean]> = [
  [["aes"], "AES-NI", false],
  [["avx2"], "AVX2", false],
  [["avx512f"], "AVX-512", false],
  [["bmi2"], "BMI2", false],
  [["sha_ni", "sha2"], "SHA", false],
  [["vmx", "svm"], "VT-x/AMD-V", true],
  [["ept", "npt"], "EPT/NPT", true],
]

const T = {
  title: ["硬件与性能", "Hardware & performance"],
  system: ["系统", "System"],
  os: ["系统", "OS"],
  kernel: ["内核", "Kernel"],
  virt: ["虚拟化", "Virtualization"],
  uptime: ["运行时间", "Uptime"],
  load: ["负载", "load"],
  procs: ["进程", "Processes"],
  tz: ["时区", "Time zone"],
  board: ["主板与设备", "Board & devices"],
  model: ["型号", "Model"],
  bios: ["BIOS", "BIOS"],
  chipset: ["芯片组", "Chipset"],
  nic: ["网卡", "Network"],
  gpu: ["显卡", "Graphics"],
  cpu: ["CPU", "CPU"],
  cores: ["核心", "Cores"],
  cache: ["缓存", "Cache"],
  flags: ["指令集", "Extensions"],
  score: ["跑分", "Score"],
  single: ["单线程", "single"],
  multi: ["多线程", "multi"],
  mem: ["内存", "Memory"],
  used: ["已用", "used"],
  avail: ["可用", "free"],
  swap: ["Swap", "Swap"],
  overcommit: ["内存气球", "Memory balloon"],
  balloonOn: ["已启用", "Enabled"],
  balloonOff: ["未启用", "Not present"],
  memBench: ["读写带宽", "Throughput"],
  read: ["读", "read"],
  write: ["写", "write"],
  disk: ["硬盘", "Disk"],
  capacity: ["容量", "Capacity"],
  device: ["测试设备", "Test device"],
  reading: ["读取", "Read"],
  writing: ["写入", "Write"],
  noTools: ["未安装 sysbench / fio，以下为系统自带工具的近似值", "sysbench / fio not installed; rough built-in measurements"],
  approx: ["近似", "approx."],
  atto: ["ATTO 块大小", "ATTO block sizes"],
  temp: ["温度", "Temperature"],
  modules: ["内存条", "Modules"],
  slots: ["插槽", "Slots"],
  health: ["健康", "Health"],
  noRoot: ["需要 root 才能读取硬盘健康与内存条", "Root is needed to read disk health and memory modules"],
  gbSkip: ["Geekbench", "Geekbench"],
} satisfies Record<string, Pair>

const TEMP_NAMES: Record<string, Pair> = { cpu: ["CPU", "CPU"], nvme: ["NVMe", "NVMe"], disk: ["硬盘", "Disk"], gpu: ["显卡", "GPU"], board: ["主板", "Board"] }
// 超过这个温度标黄: CPU 85°C, NVMe 70°C, 机械盘 50°C
const TEMP_WARN: Record<string, number> = { cpu: 85, nvme: 70, disk: 50, gpu: 85, board: 70 }

const GB_SKIP: Record<string, Pair> = {
  unsupported: ["不支持此架构, 已跳过", "unsupported architecture, skipped"],
  lowmem: ["内存加 Swap 不足 1.5 GB, 已跳过", "less than 1.5 GB memory + swap, skipped"],
  nospace: ["磁盘剩余不足 1 GB, 已跳过", "less than 1 GB free disk, skipped"],
  download: ["下载太慢或失败, 已跳过", "download too slow or failed, skipped"],
  fail: ["运行或上传失败", "run or upload failed"],
}

const CASES: Array<[key: string, label: Pair]> = [
  ["r4q1", ["4K 随机 Q1", "4K rand Q1"]],
  ["r4q32", ["4K 随机 Q32", "4K rand Q32"]],
  ["s1q1", ["顺序 1M Q1", "Seq 1M Q1"]],
  ["s1q8", ["顺序 1M Q8", "Seq 1M Q8"]],
]

/** lscpu 新版给的缓存是所有实例合计 ("512 KiB (16 instances)"), 换算成每个实例; 旧版格式 ("32K") 原样 */
export function cachePerInstance(v: string): string {
  const m = /^([\d.]+)\s*([KMG])(?:i?B)?\s*\((\d+) instances?\)$/i.exec(v.trim())
  if (!m) return v.replace(/\s*\(.*\)$/, "")
  const kib = Number(m[1]) * { K: 1, M: 1024, G: 1024 * 1024 }[m[2]!.toUpperCase() as "K" | "M" | "G"] / Number(m[3])
  const [n, unit] = kib >= 1024 * 1024 ? [kib / 1024 / 1024, "GiB"] : kib >= 1024 ? [kib / 1024, "MiB"] : [kib, "KiB"]
  return `${Number(n.toFixed(1))} ${unit}`
}

export function renderHw(R: Renderer, hw: HwData): string[] {
  const { L, paint, tonePaint, badge, hr, row, lang, labelW } = R
  const zh = lang === "zh"
  const VW = W - 2 - labelW
  const out: string[] = []
  const title = (p: Pair) => out.push(`  ${paint(L(p), "bold")}`)
  const put = (label: string, value: string) => out.push(...rowsFlex(row, label, value, VW))
  /** 长文本按值列宽折行, 第一行带标签 */
  const putWrapped = (label: string, value: string) => wrap(value, VW).forEach((line, i) => put(i ? "" : label, line))

  // —— 系统 ——
  title(T.system)
  if (hw.os) {
    putWrapped(L(T.os), [hw.os[0], hw.os[2]].filter(Boolean).join(" · "))
    if (hw.os[1]) put(L(T.kernel), fit(hw.os[1], VW))
  }
  if (hw.virt) {
    const v = VIRT[hw.virt]
    put(L(T.virt), v ? badge(L(v[0]), v[1]) : badge(hw.virt, "neutral"))
  }
  if (hw.uptime) {
    const up = num(hw.uptime[0])
    put(L(T.uptime), [up !== null ? fmtUptime(up, zh) : "", hw.uptime[1] ? paint(`${L(T.load)} ${hw.uptime[1]}`, "gray") : ""].filter(Boolean).join(" · "))
  }
  if (hw.procs) {
    const [p, u, sa, st] = hw.procs
    const bits = [zh ? `${p} 个` : `${p}`]
    if (u) bits.push(zh ? `登录 ${u}` : `${u} logged in`)
    if (sa && st) bits.push(zh ? `服务 ${sa} / ${st} 运行中` : `services ${sa} / ${st} running`)
    put(L(T.procs), bits.join(" · "))
  }
  if (hw.tz) {
    const off = /^[+-]\d{4}$/.test(hw.tz[1]!) ? ` (UTC${hw.tz[1]!.slice(0, 3)}:${hw.tz[1]!.slice(3)})` : ""
    put(L(T.tz), fit(`${hw.tz[0]}${off}${hw.tz[2] ? ` · ${hw.tz[2]}` : ""}`, VW))
  }
  if (hw.temps.length) {
    put(L(T.temp), hw.temps.map((t) => `${L(TEMP_NAMES[t.kind]!)} ${tonePaint(`${Math.round(t.c)}°C`, t.c >= (TEMP_WARN[t.kind] ?? 85) ? "warn" : "neutral")}`).join(" · "))
  }
  out.push(hr())

  // —— 主板与设备 ——
  const hasBoard = hw.board?.some(Boolean) || hw.chipset.length || hw.nic.length || hw.gpu.length
  if (hasBoard) {
    title(T.board)
    if (hw.board) {
      const [vendor, product, biosVendor, biosVer] = hw.board
      if (vendor || product) putWrapped(L(T.model), [vendor, product].filter(Boolean).join(" "))
      if (biosVendor || biosVer) put(L(T.bios), fit([biosVendor, biosVer].filter(Boolean).join(" "), VW))
    }
    const devices = (label: Pair, names: string[]) => names.forEach((n, i) => put(i ? "" : L(label), fit(n, VW)))
    devices(T.chipset, hw.chipset)
    devices(T.nic, hw.nic)
    devices(T.gpu, hw.gpu)
    out.push(hr())
  }

  // —— CPU ——
  title(T.cpu)
  if (hw.cpu) {
    const [model, cores, threads, , mhz, usage] = hw.cpu
    if (model) putWrapped(L(T.model), model)
    const bits = [zh ? `${cores} 核 ${threads} 线程` : `${cores} core${cores === "1" ? "" : "s"} ${threads} thread${threads === "1" ? "" : "s"}`]
    if (num(mhz) !== null) bits.push(`${mhz} MHz`)
    if (num(usage) !== null) bits.push(zh ? `占用 ${usage}%` : `${usage}% busy`)
    put(L(T.cores), bits.join(" · "))
  }
  if (hw.cache?.some(Boolean)) {
    const names = ["L1d", "L1i", "L2", "L3"]
    const text = hw.cache.map((v, i) => (v ? `${names[i]} ${cachePerInstance(v)}` : "")).filter(Boolean).join(" · ")
    putWrapped(L(T.cache), text)
  }
  if (hw.flags) {
    // ARM (含 Apple 芯片) 没有 AVX / BMI / VT-x 这些 x86 指令集, 全标 ✗ 会误导, 只列 ARM 也有的两项
    const arm = /^(arm|aarch)/i.test(hw.os?.[2] ?? "")
    const shown: typeof FLAGS = arm ? [[["aes"], "AES", false], [["sha2", "sha1"], "SHA", false]] : FLAGS
    // 缺失一律灰色: 虚拟机不透传虚拟化扩展是常态, 老 CPU 没有 AVX-512 也不算问题
    const marks = shown.map(([keys, label]) => {
      const has = keys.some((k) => hw.flags!.includes(k))
      return has ? `${tonePaint("✓", "good")} ${label}` : paint(`✗ ${label}`, "gray")
    })
    // 一行放不下就折成两行
    const lines: string[][] = [[]]
    let w = 0
    for (const [i, m] of marks.entries()) {
      const mw = shown[i]![1].length + 2
      if (w + mw + 2 > VW && lines.at(-1)!.length) {
        lines.push([])
        w = 0
      }
      lines.at(-1)!.push(m)
      w += mw + 2
    }
    lines.forEach((l, i) => put(i ? "" : L(T.flags), l.join("  ")))
  }
  if (hw.bench.cpu) {
    const [tool, s1, sn, threads] = hw.bench.cpu
    const label = `${L(T.score)}`
    const round = (v: string | undefined) => (num(v) !== null ? String(Math.round(num(v)!)) : "-")
    if (tool === "sysbench") {
      put(label, `${L(T.single)} ${paint(round(s1), "bold")} · ${L(T.multi)} ${paint(round(sn), "bold")}${paint(zh ? `  sysbench ${threads} 线程` : `  sysbench ${threads}T`, "gray")}`)
    } else {
      put(label, `${L(T.single)} ${paint(`${round(s1)} MB/s`, "bold")} · ${L(T.multi)} ${paint(`${round(sn)} MB/s`, "bold")}`)
      put("", paint(zh ? "openssl SHA-256 吞吐, 未装 sysbench 时的近似值" : "openssl SHA-256 throughput (sysbench not installed)", "gray"))
    }
  }
  if (hw.bench.gb) {
    const [ver, status, single, multi, url] = hw.bench.gb
    const label = `Geekbench ${ver!.split(".")[0]}`
    if (status === "ok" && single && multi) {
      put(label, `${L(T.single)} ${paint(single, "bold")} · ${L(T.multi)} ${paint(multi, "bold")}`)
    } else if (status === "ok") {
      // 结果页有人机验证, 脚本读不到分数, 请用户在浏览器里打开
      put(label, zh ? "已上传, 在浏览器打开结果页查看单核 / 多核分" : "Uploaded; see scores on the result page")
    } else {
      put(label, paint(L(GB_SKIP[status!] ?? GB_SKIP.fail!), "gray"))
    }
    // 链接比值列宽, 单独一行少缩进, 保证完整可点
    if (url) out.push(`  ${paint(url, "brand", "underline")}`)
  }
  out.push(hr())

  // —— 内存 ——
  title(T.mem)
  if (hw.mem) {
    const mem = hw.mem
    const total = num(mem[0])
    const used = num(mem[1])
    const avail = num(mem[2])
    const swapTotal = num(mem[3])
    const swapUsed = num(mem[4])
    if (total) {
      const pct = used !== null ? ` (${Math.round((used / total) * 100)}%)` : ""
      put(L(T.mem), [fmtBytes(total), used !== null ? `${L(T.used)} ${fmtBytes(used)}${pct}` : "", avail !== null ? `${L(T.avail)} ${fmtBytes(avail)}` : ""].filter(Boolean).join(" · "))
    }
    if (swapTotal !== null) {
      put(L(T.swap), swapTotal > 0 ? `${fmtBytes(swapTotal)} · ${L(T.used)} ${fmtBytes(swapUsed ?? 0)}` : paint(zh ? "未启用" : "none", "gray"))
    }
  }
  if (hw.overcommit) {
    const oc = hw.overcommit[0]!.split(",")
    const balloon = oc.includes("balloon")
    // 只报内存气球设备: 有它宿主才能在运行中回收内存, 是超开常用的手段, 但很多平台默认就挂着, 不算问题。
    // 不报 KSM: 虚拟机里读到的是虚拟机自己的 KSM 开关, 反映不了宿主有没有合并内存。
    put(L(T.overcommit), balloon
      ? `${L(T.balloonOn)}${paint(zh ? "  宿主可在运行中回收内存" : "  host can reclaim RAM", "gray")}`
      : paint(L(T.balloonOff), "gray"))
  }
  if (hw.bench.mem) {
    const [tool, r, w] = hw.bench.mem
    const mib = (v: string | undefined) => (num(v) !== null ? fmtKiB(num(v)! * 1024) : "-")
    // 旧版脚本交的 dd 数值不是内存带宽, 不显示
    if (tool === "sysbench") put(L(T.memBench), `${L(T.read)} ${paint(mib(r), "bold")} · ${L(T.write)} ${paint(mib(w), "bold")}`)
  }
  if (hw.dimmArray) {
    const [maxB, slots, ecc] = hw.dimmArray
    const installed = hw.dimms.reduce((n, m) => n + m.count, 0)
    const bits: string[] = []
    if (num(slots)) bits.push(zh ? `${slots} 个 · 已插 ${installed}` : `${slots} · ${installed} used`)
    if (num(maxB)) bits.push(zh ? `最大 ${fmtBytes(num(maxB)!)}` : `max ${fmtBytes(num(maxB)!)}`)
    if (ecc && !/^None$/i.test(ecc)) bits.push(tonePaint(ecc, /ECC/i.test(ecc) ? "good" : "neutral"))
    if (bits.length) put(L(T.slots), bits.join(" · "))
  }
  hw.dimms.forEach((m, i) => {
    const speed = m.speed ? `-${m.speed}` : ""
    const conf = m.conf && m.speed && m.conf !== m.speed ? paint(zh ? ` 运行 ${m.conf}` : ` at ${m.conf}`, "gray") : ""
    put(i ? "" : L(T.modules), `${m.count} × ${fmtBytes(m.bytes)} ${m.type}${speed}${conf}`)
    const who = [m.maker, m.part, m.rank ? `${m.rank}R` : ""].filter(Boolean).join(" · ")
    if (who) put("", paint(fit(who, VW), "gray"))
  })
  if (hw.noRoot) put("", paint(L(T.noRoot), "gray"))
  out.push(hr())

  // —— 硬盘 ——
  title(T.disk)
  if (hw.disk) {
    const [count, total, size, used, avail, dev, type] = hw.disk
    const isVm = hw.virt !== null && hw.virt !== "none"
    const bits: string[] = []
    if (num(count)) bits.push(zh ? `${count} 块 · 共 ${fmtBytes(num(total)!)}` : `${count} disk(s) · ${fmtBytes(num(total)!)}`)
    // 已用比例按 df 的算法: 已用 / (已用 + 可用), 保留给 root 的块不算, 和用户自己跑 df 看到的一致
    const usedB = num(used)
    const availB = num(avail)
    const pct = usedB !== null && availB !== null && usedB + availB > 0 ? Math.ceil((usedB / (usedB + availB)) * 100) : null
    if (num(size)) bits.push(`${zh ? "测试分区" : "test fs"} ${fmtBytes(num(size)!)}${pct !== null ? ` ${L(T.used)} ${pct}%` : ""}`)
    put(L(T.capacity), bits.join(" · "))
    // 虚拟磁盘的「是否机械盘」标志常常误报 (virtio 默认报 1), 只对物理机显示 SSD / HDD
    if (dev) put(L(T.device), `${dev}${!isVm && type ? ` · ${type.toUpperCase()}` : ""}`)
  }
  for (const d of hw.smart) {
    const kind = d.kind === "nvme" ? "NVMe" : d.kind.toUpperCase()
    putWrapped(L(T.model), [d.model, d.bytes ? fmtBytes(d.bytes) : "", kind].filter(Boolean).join(" · "))
    const bits: string[] = []
    bits.push(d.health === "pass" ? tonePaint(zh ? "✓ 通过" : "✓ passed", "good") : d.health === "fail" ? tonePaint(zh ? "✗ 未通过" : "✗ failed", "bad") : paint(zh ? "未知" : "unknown", "gray"))
    if (d.hours !== null) bits.push(zh ? `通电 ${d.hours.toLocaleString("en-US")} 小时` : `${d.hours.toLocaleString("en-US")} h on`)
    if (d.temp !== null) bits.push(tonePaint(`${d.temp}°C`, d.temp >= (d.kind === "hdd" ? 50 : 70) ? "warn" : "neutral"))
    if (d.used !== null) bits.push(tonePaint(zh ? `寿命已用 ${d.used}%` : `${d.used}% worn`, d.used >= 90 ? "bad" : d.used >= 70 ? "warn" : "neutral"))
    if (d.written !== null) bits.push(zh ? `写入 ${fmtBytes(d.written)}` : `${fmtBytes(d.written)} written`)
    put(L(T.health), bits.join(" · "))
    const errs: string[] = []
    if (d.realloc) errs.push(zh ? `重映射 ${d.realloc}` : `reallocated ${d.realloc}`)
    if (d.pending) errs.push(zh ? `待映射 ${d.pending}` : `pending ${d.pending}`)
    if (d.uncorrect) errs.push(zh ? `无法修复 ${d.uncorrect}` : `uncorrectable ${d.uncorrect}`)
    if (d.mediaErr) errs.push(zh ? `介质错误 ${d.mediaErr}` : `media errors ${d.mediaErr}`)
    if (errs.length) put("", tonePaint(`! ${errs.join(" · ")}`, "warn"))
  }
  // 先按终端列宽补齐纯文本再上色, 控制符不能算进宽度
  const padL = (s: string, w: number) => " ".repeat(Math.max(0, w - width(s))) + s
  const ioCell = (bw: number | null, iops: number | null, colW: number, bwW: number) =>
    bw === null ? pad("-", colW) : paint(pad(fmtKiB(bw), bwW), "bold") + paint(padL(fmtIops(iops ?? 0), 5), "gray") + " ".repeat(Math.max(0, colW - bwW - 5))
  const cases = CASES.filter(([k]) => hw.bench.disk[k])
  if (cases.length) {
    const COL = 20
    out.push(row("", paint(pad(`${L(T.reading)} · IOPS`, COL + 2) + `${L(T.writing)} · IOPS`, "gray")))
    for (const [k, label] of cases) {
      const p = hw.bench.disk[k]!
      put(L(label), `${ioCell(num(p[0]), num(p[1]), COL, 11)}  ${ioCell(num(p[2]), num(p[3]), COL, 11)}`.trimEnd())
    }
  } else if (hw.bench.dd) {
    const w = num(hw.bench.dd[0])
    const r = num(hw.bench.dd[1])
    const iops = num(hw.bench.dd[2])
    out.push(row("", paint(L(T.noTools), "gray")))
    if (w !== null || r !== null) put(zh ? "顺序 1M" : "Seq 1M", `${L(T.read)} ${paint(r !== null ? fmtKiB(r / 1024) : "-", "bold")} · ${L(T.write)} ${paint(w !== null ? fmtKiB(w / 1024) : "-", "bold")}`)
    if (iops !== null) put(zh ? "4K 同步写" : "4K sync write", `${paint(fmtIops(iops), "bold")} IOPS`)
  }
  if (hw.bench.atto.length) {
    out.push("")
    out.push(`  ${paint(pad(L(T.atto), labelW), "bold")}${paint(pad(`${L(T.reading)} · IOPS`, 22) + `${L(T.writing)} · IOPS`, "gray")}`)
    for (const [size, parts] of hw.bench.atto) {
      out.push(`  ${pad(size.toUpperCase(), labelW)}${ioCell(num(parts[0]), num(parts[1]), 20, 11)}  ${ioCell(num(parts[2]), num(parts[3]), 20, 11)}`.trimEnd())
    }
  }
  out.push(hr())
  return out
}

export const HW_TITLE = T.title
