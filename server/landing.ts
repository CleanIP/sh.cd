// sh.cd 在浏览器里打开时的首页 (curl / wget 拿到的仍是脚本本身, 见 server/main.ts)。
//
// 独立的一页 HTML, 无外部依赖: 字体 Ioskeley Mono (SIL OFL 1.1) 由本服务 /fonts/ 提供, 中文回落到系统黑体。
// 示例报告四个标签 (总览 / 硬件 / IP / 网络) 用线上报告同一套排版函数生成 (server/sample.ts), 再把 ANSI 转成 HTML。
// 版式呼应终端报告: 章节标题 = 绿色方块 + 标题 + 细线, 和报告里的阶段标题条一致。
// 访客可见文案不写实现细节 (后端 / 缓存 / 接口名等)。

import { BANNER_LOGO, type Lang } from "./render/base"
import { sampleReports, type SampleTab } from "./sample"

// —— ANSI → HTML ——
// 只认报告里实际用到的几种: 1 粗体 / 4 下划线 / 品牌绿 / 33 黄 / 31 红 / 90 灰 / 徽章底色 / 0 复位

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

function ansiToHtml(input: string): string {
  let classes: string[] = []
  let out = ""
  const re = /\x1b\[([\d;]*)m/g
  let last = 0
  const emit = (text: string) => {
    if (!text) return
    // 汉字固定 2 列、其它非 ASCII 字符 (框线 / 方块 / 勾叉) 固定 1 列, 字体里缺字回落到别的字体时也对得齐
    const body = [...text].map((ch) => {
      if (/[一-鿿　-〿＀-￯]/.test(ch)) return `<span class="w2">${ch}</span>`
      if (ch.charCodeAt(0) > 127) return `<span class="w1">${escapeHtml(ch)}</span>`
      return escapeHtml(ch)
    }).join("")
    out += classes.length ? `<span class="${classes.join(" ")}">${body}</span>` : body
  }
  for (let m = re.exec(input); m; m = re.exec(input)) {
    emit(input.slice(last, m.index))
    last = re.lastIndex
    const codes = m[1]!.split(";").map(Number)
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i]
      if (c === 0) classes = []
      else if (c === 1) classes.push("a-b")
      else if (c === 4) classes.push("a-u")
      else if (c === 33) classes.push("a-y")
      else if (c === 31) classes.push("a-r")
      else if (c === 90) classes.push("a-k")
      else if (c === 30) classes.push("f-d")
      else if (c === 97) classes.push("f-w")
      else if (c === 43) classes.push("bg-y")
      else if (c === 41) classes.push("bg-r")
      else if (c === 100) classes.push("bg-k")
      else if ((c === 38 || c === 48) && codes[i + 1] === 2) {
        classes.push(c === 38 ? "a-g" : "bg-g")
        i += 4
      }
    }
  }
  emit(input.slice(last))
  return out
}

/** 报告转 HTML; 开头的字符画单独包一层, 行距设成字体里方块的高度 (1.25em), 上下正好连成片 */
function reportHtml(report: string): string {
  const lines = report.split("\n")
  const at = lines.findIndex((l) => l.replace(/\x1b\[[\d;]*m/g, "") === `  ${BANNER_LOGO[0]}`)
  if (at < 0) return ansiToHtml(report)
  const end = at + BANNER_LOGO.length
  return ansiToHtml(lines.slice(0, at).join("\n"))
    + `<span class="logo">${ansiToHtml(lines.slice(at, end).join("\n"))}</span>`
    + ansiToHtml(lines.slice(end).join("\n"))
}

// —— 文案 ——

const COMMAND = "bash <(curl -Ls https://sh.cd)"

interface Copy {
  htmlLang: string
  title: string
  description: string
  nav: { sample: string, checks: string, options: string, data: string }
  eyebrow: string
  heading: [string, string]
  lead: string
  copy: string
  copied: string
  meta: string[]
  stats: Array<[num: string, unit: string, label: string]>
  sampleTitle: string
  sampleMeta: string
  tabs: Record<SampleTab, [name: string, desc: string]>
  checksTitle: string
  checksMeta: string
  stages: Array<{ name: string, flag: string, time: string, items: string[] }>
  optionsTitle: string
  optionsMeta: string
  options: Array<[string, string]>
  examplesTitle: string
  examples: Array<[string, string]>
  dataTitle: string
  requireTitle: string
  require: string[]
  privacyTitle: string
  privacy: string[]
  footerSource: string
  footerFont: string
  switchLang: string
  switchHref: string
}

const COPY: Record<Lang, Copy> = {
  zh: {
    htmlLang: "zh-CN",
    title: "sh.cd · 一行命令体检服务器",
    description: "一行命令体检服务器：硬件与性能跑分、IP 纯净度与流媒体解锁、BGP、三网延迟与回程线路、国内外带宽测速。",
    nav: { sample: "示例", checks: "检测内容", options: "参数", data: "数据说明" },
    eyebrow: "服务器体检脚本 · CleanIP 出品",
    heading: ["一行命令，", "给服务器做一次全面体检"],
    lead: "硬件与性能、IP 纯净度与解锁、BGP 与三网回程、国内外带宽，一口气测完，最后给一屏适合截图的总览。",
    copy: "复制",
    copied: "已复制",
    meta: ["只需要 bash 与 curl", "Linux / macOS", "全检约 5 分钟", "中途不用操作"],
    stats: [["31", "省", "三网延迟走势"], ["9", "项", "流媒体与 AI 解锁"], ["12", "家", "邮箱 25 端口握手"], ["3", "城", "三网回程线路识别"]],
    sampleTitle: "示例报告",
    sampleMeta: "洛杉矶 KVM · 示例数据",
    tabs: {
      summary: ["总览", "每项压成两行结论，适合截图分享"],
      hw: ["硬件与性能", "虚拟化、指令集、CPU 与硬盘跑分"],
      ip: ["IP 质量", "纯净度、多源检测、解锁与邮箱"],
      net: ["网络质量", "BGP、31 省延迟、回程与测速"],
    },
    checksTitle: "检测内容",
    checksMeta: "硬件 → IP → 网络",
    stages: [
      {
        name: "硬件与性能", flag: "-H", time: "约 1–2 分钟",
        items: ["系统、内核与虚拟化类型", "CPU 型号、缓存与指令集", "sysbench 单核 / 多核跑分", "内存容量、超开迹象与读写带宽", "fio 4K 随机与顺序读写", "ATTO 块大小表（-d）"],
      },
      {
        name: "IP 质量", flag: "-I", time: "约 30 秒",
        items: ["归属、原生或广播、IP 类型", "纯净度、综合与风险评分", "VPN / 代理 / Tor / 滥用多源检测", "Netflix、ChatGPT 等 9 项解锁", "25 端口与 12 家邮箱握手", "DNS 出口与各平台适用分"],
      },
      {
        name: "网络质量", flag: "-N", time: "约 3 分钟",
        items: ["NAT 类型与 TCP 策略", "BGP 上游、对等与 RPKI", "31 省三网延迟走势", "CN2 GIA / 9929 / CMIN2 回程识别", "国内三网与 6 个国际节点测速", "12 个国际节点延迟"],
      },
    ],
    optionsTitle: "参数",
    optionsMeta: "完整参数运行 -h 查看",
    options: [
      ["不带参数", "进入菜单；选 1 一键全检"],
      ["-A", "跳过菜单，直接一键全检"],
      ["-H  -I  -N", "只测硬件与性能 / IP 质量 / 网络质量"],
      ["-d", "深度模式：ATTO 块大小表、逐跳回程路由"],
      ["-y", "缺少 sysbench / fio 时直接安装"],
      ["-4  -6", "只检测 IPv4 或 IPv6 的 IP 质量"],
      ["-x PROXY", "检测代理的出口，例 socks5h://127.0.0.1:1080"],
      ["-S LIST", "跳过部分检测：bench,media,mail,dns,latency,route,speed"],
      ["-j  -E  -n", "输出 JSON / 英文报告 / 不显示颜色"],
    ],
    examplesTitle: "常用示例",
    examples: [
      [`${COMMAND} -A`, "跳过菜单，一键全检"],
      [`${COMMAND} -I`, "只看 IP 质量"],
      [`${COMMAND} -I -x socks5h://127.0.0.1:1080`, "检测代理出口"],
      [`${COMMAND} -A -E -j > report.json`, "英文 JSON 存档"],
    ],
    dataTitle: "数据说明",
    requireTitle: "运行要求",
    require: [
      "bash 3.2 及以上与 curl；Linux 上检测最完整，macOS 可测 IP 质量和大部分网络项目。",
      "CPU / 内存跑分与硬盘读写需要 sysbench、fio：缺少时开始前询问一次，15 秒不回答默认安装；不安装则用系统自带工具近似测量。",
      "除此之外不安装任何软件、不修改系统；硬盘测试的临时文件测完即删。",
    ],
    privacyTitle: "会发送哪些数据",
    privacy: [
      "检测在你的机器上完成，结果提交到 sh.cd 生成报告：硬件型号与跑分、解锁与邮箱握手结果、延迟、回程逐跳 IP、测速结果。",
      "只查询发起请求的出口 IP，不能指定其他 IP。",
      "不读取、不发送主机名、文件或登录信息。",
    ],
    footerSource: "源码",
    footerFont: "字体",
    switchLang: "EN",
    switchHref: "?lang=en",
  },
  en: {
    htmlLang: "en",
    title: "sh.cd · One-line server check-up",
    description: "One command to check a server: hardware benchmarks, IP purity and streaming unlocks, BGP, latency and return routes to China, and bandwidth.",
    nav: { sample: "Sample", checks: "Checks", options: "Options", data: "Data" },
    eyebrow: "Server check-up script · by CleanIP",
    heading: ["One command,", "a full server check-up"],
    lead: "Hardware and benchmarks, IP purity and unlocks, BGP and return routes to China, bandwidth at home and abroad — all in one run, ending with a one-screen summary.",
    copy: "Copy",
    copied: "Copied",
    meta: ["bash + curl only", "Linux / macOS", "About 5 min", "No prompts along the way"],
    stats: [["31", "", "provinces × 3 carriers"], ["9", "", "streaming & AI unlocks"], ["12", "", "mail providers on port 25"], ["3", "", "cities of return routes"]],
    sampleTitle: "Sample report",
    sampleMeta: "Los Angeles KVM · sample data",
    tabs: {
      summary: ["Summary", "Two lines per section, made for screenshots"],
      hw: ["Hardware", "Virtualization, extensions, CPU and disk scores"],
      ip: ["IP quality", "Purity, multi-source checks, unlocks and mail"],
      net: ["Network", "BGP, latency, return routes and speed"],
    },
    checksTitle: "What it checks",
    checksMeta: "hardware → IP → network",
    stages: [
      {
        name: "Hardware & performance", flag: "-H", time: "1–2 min",
        items: ["OS, kernel and virtualization", "CPU model, cache and extensions", "sysbench single / multi-thread", "Memory, overcommit and throughput", "fio 4K random and sequential I/O", "ATTO block-size table (-d)"],
      },
      {
        name: "IP quality", flag: "-I", time: "30 s",
        items: ["Location, native or broadcast, IP type", "Purity, overall and risk scores", "VPN / proxy / Tor / abuse checks", "9 unlocks incl. Netflix and ChatGPT", "Port 25 and 12 mail providers", "DNS egress and platform fit"],
      },
      {
        name: "Network quality", flag: "-N", time: "3 min",
        items: ["NAT type and TCP settings", "BGP upstreams, peers and RPKI", "Latency to 31 Chinese provinces", "CN2 GIA / 9929 / CMIN2 detection", "Speed to China and 6 regions", "Latency to 12 international sites"],
      },
    ],
    optionsTitle: "Options",
    optionsMeta: "run with -h for all",
    options: [
      ["no options", "Open the menu; choose 1 for the full check-up"],
      ["-A", "Skip the menu and run everything"],
      ["-H  -I  -N", "Hardware / IP quality / network only"],
      ["-d", "Deep mode: ATTO table, hop-by-hop routes"],
      ["-y", "Install sysbench / fio without asking"],
      ["-4  -6", "IP quality for IPv4 or IPv6 only"],
      ["-x PROXY", "Check a proxy exit, e.g. socks5h://127.0.0.1:1080"],
      ["-S LIST", "Skip: bench,media,mail,dns,latency,route,speed"],
      ["-j  -E  -n", "JSON output / English report / no colors"],
    ],
    examplesTitle: "Examples",
    examples: [
      [`${COMMAND} -A -E`, "Full check-up, English"],
      [`${COMMAND} -I -E`, "IP quality only"],
      [`${COMMAND} -I -E -x socks5h://127.0.0.1:1080`, "Check a proxy exit"],
      [`${COMMAND} -A -E -j > report.json`, "Save as JSON"],
    ],
    dataTitle: "About your data",
    requireTitle: "Requirements",
    require: [
      "bash 3.2+ and curl. Most complete on Linux; macOS covers IP quality and most network checks.",
      "CPU, memory and disk benchmarks need sysbench and fio — you are asked once before starting, and they install by default after 15 s. Without them, built-in tools give rougher numbers.",
      "Nothing else is installed or changed; disk test files are removed afterwards.",
    ],
    privacyTitle: "What is sent",
    privacy: [
      "Checks run on your machine; results are sent to sh.cd to build the report: hardware model and scores, unlock and SMTP results, latency, per-hop route IPs and speed.",
      "Only the IP making the request is looked up — no other IP can be queried.",
      "No hostname, files or credentials are read or sent.",
    ],
    footerSource: "Source",
    footerFont: "Font",
    switchLang: "中文",
    switchHref: "?lang=zh",
  },
}

// Lucide 图标 (ISC 许可)
const ICONS: Record<string, string> = {
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrow: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
}
const icon = (name: string, size: number) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`

const CSS = `
@font-face { font-family: "Ioskeley Mono"; font-style: normal; font-weight: 400; font-display: swap; src: url("/fonts/IoskeleyMono-Regular.woff2") format("woff2"); }
@font-face { font-family: "Ioskeley Mono"; font-style: normal; font-weight: 600; font-display: swap; src: url("/fonts/IoskeleyMono-SemiBold.woff2") format("woff2"); }

:root {
  --color-primary: #35a952;
  --color-primary-strong: #23793a;
  --color-primary-strong-hover: #1f6d34;
  --color-primary-soft: #eaf6ed;
  --color-secondary: #111827;
  --color-secondary-raised: #1f2937;
  --color-neutral-0: #ffffff;
  --color-neutral-50: #f8f9fa;
  --color-neutral-100: #f3f4f6;
  --color-neutral-200: #e5e7eb;
  --color-neutral-300: #d1d5db;
  --color-neutral-400: #9ca3af;
  --color-neutral-500: #6b7280;
  --color-neutral-700: #374151;
  --color-neutral-900: #111827;
  --color-success: #35a952;
  --color-warning: #d4a72c;
  --color-error: #e5484d;
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 20px;
  --text-xl: 24px;
  --text-2xl: 32px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --shadow-2: 0 4px 12px rgba(0, 0, 0, 0.1);
  --font-mono: "Ioskeley Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", monospace;
  --term-text: #d1d5db;
  --content: 1080px;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: var(--space-16); }
body { margin: 0; background: var(--color-neutral-0); color: var(--color-neutral-900); font: 400 var(--text-base)/1.5 var(--font-mono); -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
button { font: inherit; color: inherit; }
.icon { flex: none; }
.wrap { max-width: var(--content); margin: 0 auto; padding-inline: var(--space-6); }
:focus-visible { outline: 2px solid var(--color-primary-strong); outline-offset: 2px; border-radius: var(--radius-sm); }

/* —— 顶栏 —— */
.top { position: sticky; top: 0; z-index: 10; background: var(--color-neutral-0); border-bottom: 1px solid var(--color-neutral-200); }
.top .wrap { display: flex; align-items: center; justify-content: space-between; gap: var(--space-6); height: var(--space-16); }
.brand { display: flex; align-items: center; gap: var(--space-3); font-size: var(--text-lg); font-weight: 600; }
.brand-block { width: var(--space-3); height: var(--space-6); background: var(--color-primary); }
.brand-by { font-size: var(--text-xs); font-weight: 400; color: var(--color-neutral-500); }
.nav { display: flex; align-items: center; gap: var(--space-6); font-size: var(--text-sm); color: var(--color-neutral-500); }
.nav a:hover { color: var(--color-neutral-900); }
.nav .ext { display: inline-flex; align-items: center; gap: var(--space-1); }
.nav .lang { padding: var(--space-1) var(--space-2); border: 1px solid var(--color-neutral-300); border-radius: var(--radius-sm); color: var(--color-neutral-900); }
.nav .lang:hover { background: var(--color-neutral-100); }

/* —— 首屏 —— */
.hero { padding-block: var(--space-16) var(--space-12); }
.eyebrow { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-6); font-size: var(--text-sm); color: var(--color-neutral-500); }
.eyebrow::before { content: ""; width: var(--space-2); height: var(--space-2); background: var(--color-primary); }
h1 { margin: 0; font-size: var(--text-2xl); font-weight: 600; line-height: 1.25; letter-spacing: -0.01em; }
h1 .dim { color: var(--color-neutral-400); }
.lead { max-width: 64ch; margin: var(--space-4) 0 0; color: var(--color-neutral-500); }

.cmd { display: flex; align-items: stretch; margin-top: var(--space-8); border: 1px solid var(--color-secondary); border-radius: var(--radius-md); overflow: hidden; }
.cmd code { display: flex; align-items: center; flex: 1; min-width: 0; padding: var(--space-4) var(--space-6); overflow-x: auto; white-space: nowrap; font: 400 var(--text-lg)/1.5 var(--font-mono); scrollbar-width: none; }
.cmd code::-webkit-scrollbar { display: none; }
.prompt { margin-right: var(--space-3); color: var(--color-primary-strong); user-select: none; }
.cursor { display: inline-block; width: 0.6em; height: 1.1em; margin-left: var(--space-1); background: var(--color-primary); vertical-align: text-bottom; animation: blink 1.1s steps(1) infinite; }
@keyframes blink { 50% { opacity: 0; } }
.btn-primary { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); min-width: 112px; padding: 0 var(--space-6); border: 0; background: var(--color-secondary); color: var(--color-neutral-0); font-size: var(--text-sm); font-weight: 600; cursor: pointer; }
.btn-primary:hover { background: #000000; }
.btn-primary.done { background: var(--color-primary-strong); }

.meta { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-6); margin: var(--space-4) 0 0; padding: 0; list-style: none; font-size: var(--text-sm); color: var(--color-neutral-500); }
.meta li { display: inline-flex; align-items: center; gap: var(--space-2); }
.meta li::before { content: "+"; color: var(--color-primary-strong); }

.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: var(--space-12); border-top: 1px solid var(--color-neutral-200); }
.stat { padding: var(--space-4) var(--space-4) 0 0; }
.stat + .stat { padding-left: var(--space-4); border-left: 1px solid var(--color-neutral-200); }
.stat b { display: flex; align-items: baseline; gap: var(--space-1); font-size: var(--text-2xl); font-weight: 600; line-height: 1.25; }
.stat small { font-size: var(--text-sm); font-weight: 400; color: var(--color-neutral-500); }
.stat span { font-size: var(--text-sm); color: var(--color-neutral-500); }

/* —— 章节标题: 呼应终端报告的阶段标题条 —— */
section { padding-block: var(--space-12); }
.sec-head { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-6); }
.sec-head::before { content: ""; width: var(--space-3); height: var(--space-3); background: var(--color-primary); }
.sec-head h2 { margin: 0; font-size: var(--text-lg); font-weight: 600; line-height: 1.25; white-space: nowrap; }
.sec-head .rule { flex: 1; height: 1px; background: var(--color-neutral-200); }
.sec-head .sec-meta { font-size: var(--text-sm); color: var(--color-neutral-400); white-space: nowrap; }

/* —— 示例报告: 左侧竖排标签, 右侧终端 —— */
.sample { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: var(--space-6); align-items: start; }
.sample > * { min-width: 0; }
.sample-tabs { display: grid; gap: var(--space-1); }
.sample-tab { display: grid; gap: var(--space-1); padding: var(--space-3) var(--space-4); border: 0; border-left: 2px solid var(--color-neutral-200); background: transparent; text-align: left; cursor: pointer; }
.sample-tab:hover { background: var(--color-neutral-50); }
.sample-tab[aria-selected="true"] { border-left-color: var(--color-primary); background: var(--color-neutral-50); }
.tab-name { font-size: var(--text-base); font-weight: 600; color: var(--color-neutral-500); }
.sample-tab[aria-selected="true"] .tab-name { color: var(--color-neutral-900); }
.tab-desc { font-size: var(--text-xs); color: var(--color-neutral-400); }
.term-win { min-width: 0; border-radius: var(--radius-lg); background: var(--color-secondary); box-shadow: var(--shadow-2); overflow: hidden; }
.term-bar { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-2) var(--space-6); background: var(--color-secondary-raised); }
.term-cmd { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-sm); color: var(--color-neutral-400); }
.term-cmd b { font-weight: 400; color: var(--color-primary); }
.term { height: 640px; margin: 0; padding: var(--space-4) var(--space-6) var(--space-6); overflow: auto; color: var(--term-text); font: 400 var(--text-base)/1.5 var(--font-mono); scrollbar-color: var(--color-neutral-700) transparent; }
.term .cursor { height: 1.2em; margin: 0; }
.term .w1 { display: inline-block; width: 1ch; }
.term .logo { display: block; line-height: 1.25; }
/* 汉字占两格; 字形略放大贴近终端里的观感 (transform 不影响排版宽度) */
.term .w2 { display: inline-block; width: 2ch; text-align: center; transform: scale(1.08); }
.a-b { font-weight: 600; color: var(--color-neutral-0); }
.a-u { text-decoration: underline; }
.a-g { color: var(--color-primary); }
.a-y { color: var(--color-warning); }
.a-r { color: var(--color-error); }
.a-k { color: var(--color-neutral-500); }
.bg-g { background: var(--color-primary); }
.bg-y { background: var(--color-warning); }
.bg-r { background: var(--color-error); }
.bg-k { background: var(--color-neutral-500); }
.f-w { color: var(--color-neutral-0); }
.f-d { color: var(--color-neutral-900); }

/* —— 检测内容 —— */
.stages { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-8); margin: 0; padding: 0; list-style: none; }
.stage { padding-top: var(--space-4); border-top: 2px solid var(--color-neutral-900); }
.stage-top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.stage-no { font-size: var(--text-sm); color: var(--color-primary-strong); font-weight: 600; }
.stage-flag { font-size: var(--text-xs); padding: 0 var(--space-2); border: 1px solid var(--color-neutral-300); border-radius: var(--radius-sm); color: var(--color-neutral-500); }
.stage h3 { margin: var(--space-2) 0 0; font-size: var(--text-lg); font-weight: 600; line-height: 1.25; }
.stage-time { margin: var(--space-1) 0 var(--space-4); font-size: var(--text-sm); color: var(--color-neutral-400); }
.stage ul { margin: 0; padding: 0; list-style: none; font-size: var(--text-sm); color: var(--color-neutral-700); }
.stage li { display: flex; gap: var(--space-2); padding-block: var(--space-2); border-bottom: 1px solid var(--color-neutral-100); }
.stage li::before { content: "·"; color: var(--color-neutral-400); }

/* —— 参数与示例 —— */
.two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-12); }
.two > * { min-width: 0; }
.opts { display: grid; grid-template-columns: max-content minmax(0, 1fr); margin: 0; font-size: var(--text-sm); }
.opts dt, .opts dd { margin: 0; padding-block: var(--space-2); border-bottom: 1px solid var(--color-neutral-100); }
.opts dt { padding-right: var(--space-6); font-weight: 600; white-space: pre; }
.opts dd { color: var(--color-neutral-500); overflow-wrap: anywhere; }
h3.sub { margin: 0 0 var(--space-3); font-size: var(--text-sm); font-weight: 600; color: var(--color-neutral-500); }
.examples { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.example { border: 1px solid var(--color-neutral-200); border-radius: var(--radius-md); background: var(--color-neutral-50); }
.example-note { padding: var(--space-2) var(--space-4) 0; font-size: var(--text-xs); color: var(--color-neutral-500); }
.example-row { display: flex; align-items: flex-start; gap: var(--space-2); padding: var(--space-1) var(--space-2) var(--space-2) var(--space-4); }
.example code { flex: 1; min-width: 0; overflow-wrap: anywhere; font: 400 var(--text-sm)/1.5 var(--font-mono); }
.btn-ghost { display: inline-flex; align-items: center; justify-content: center; width: var(--space-8); height: var(--space-8); flex: none; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-neutral-500); cursor: pointer; }
.btn-ghost:hover { background: var(--color-neutral-200); color: var(--color-neutral-900); }
.btn-ghost.done { color: var(--color-primary-strong); }

/* —— 数据说明 —— */
.notes { margin: 0; padding: 0; list-style: none; font-size: var(--text-sm); color: var(--color-neutral-700); }
.notes li { display: flex; gap: var(--space-3); padding-block: var(--space-2); }
.notes li::before { content: "+"; color: var(--color-primary-strong); }

footer { margin-top: var(--space-12); border-top: 1px solid var(--color-neutral-200); }
footer .wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3) var(--space-6); padding-block: var(--space-6) var(--space-12); font-size: var(--text-sm); color: var(--color-neutral-500); }
footer .copyright { display: inline-flex; align-items: center; gap: var(--space-2); }
footer .copyright::before { content: ""; width: var(--space-3); height: var(--space-3); background: var(--color-primary); }
footer .links { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-6); }
footer a:hover { color: var(--color-neutral-900); }

.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (max-width: 1000px) {
  .sample { grid-template-columns: minmax(0, 1fr); gap: var(--space-4); }
  .sample-tabs { display: flex; gap: 0; overflow-x: auto; border-bottom: 1px solid var(--color-neutral-200); scrollbar-width: none; }
  .sample-tab { flex: none; padding: var(--space-2) var(--space-4); border-left: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .sample-tab[aria-selected="true"] { border-bottom-color: var(--color-primary); background: transparent; }
  .tab-desc { display: none; }
  .term { font-size: var(--text-sm); }
}
@media (max-width: 960px) {
  .stages { grid-template-columns: minmax(0, 1fr); gap: var(--space-6); }
  .two { grid-template-columns: minmax(0, 1fr); gap: var(--space-8); }
}
@media (max-width: 720px) {
  .wrap { padding-inline: var(--space-4); }
  .sec-head .rule { display: none; }
  .sec-head .sec-meta { min-width: 0; margin-left: auto; overflow: hidden; text-overflow: ellipsis; font-size: var(--text-xs); }
  .nav .hide-sm { display: none; }
  .hero { padding-block: var(--space-12) var(--space-8); }
  h1 { font-size: var(--text-xl); }
  .cmd { flex-direction: column; }
  .cmd code { padding: var(--space-3) var(--space-4); font-size: var(--text-base); }
  .btn-primary { min-height: var(--space-12); }
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stat:nth-child(3) { padding-left: 0; border-left: 0; }
  .stat:nth-child(n + 3) { border-top: 1px solid var(--color-neutral-200); margin-top: var(--space-4); }
  section { padding-block: var(--space-8); }
  .term-bar { padding-inline: var(--space-4); }
  .term { height: 520px; padding: var(--space-3) var(--space-4) var(--space-4); font-size: var(--text-xs); }
  .opts dt { white-space: normal; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .cursor { animation: none; }
}
`

const SCRIPT = (t: Copy) => `
(function () {
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
    return Promise.resolve();
  }
  var ICON_COPY = ${JSON.stringify(icon("copy", 16))};
  var ICON_CHECK = ${JSON.stringify(icon("check", 16))};
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      copyText(btn.getAttribute("data-copy")).then(function () {
        var label = btn.querySelector(".label");
        btn.classList.add("done");
        btn.querySelector(".icon").outerHTML = ICON_CHECK;
        if (label) label.textContent = ${JSON.stringify(t.copied)};
        clearTimeout(btn._t);
        btn._t = setTimeout(function () {
          btn.classList.remove("done");
          btn.querySelector(".icon").outerHTML = ICON_COPY;
          if (label) label.textContent = ${JSON.stringify(t.copy)};
        }, 1600);
      });
    });
  });

  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  function select(tab, focus) {
    tabs.forEach(function (x) {
      var on = x === tab;
      x.setAttribute("aria-selected", on ? "true" : "false");
      x.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(x.getAttribute("aria-controls"));
      panel.hidden = !on;
      if (on) panel.scrollTop = 0;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () { select(tab, false); });
    tab.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      select(tabs[(i + d + tabs.length) % tabs.length], true);
    });
  });
})();
`

const cache = new Map<Lang, string>()

export function landingPage(lang: Lang): string {
  const hit = cache.get(lang)
  if (hit) return hit
  const t = COPY[lang]
  const reports = sampleReports(lang)
  const order: SampleTab[] = ["summary", "hw", "ip", "net"]
  const home = lang === "en" ? "/?lang=en" : "/"
  const cleanip = `https://cleanip.io${lang === "en" ? "/en" : ""}`

  const html = `<!doctype html>
<html lang="${t.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.title}</title>
<meta name="description" content="${escapeHtml(t.description)}">
<meta name="theme-color" content="#ffffff">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(t.title)}">
<meta property="og:description" content="${escapeHtml(t.description)}">
<meta property="og:url" content="https://sh.cd${home}">
<link rel="canonical" href="https://sh.cd${home}">
<link rel="alternate" hreflang="zh-CN" href="https://sh.cd/">
<link rel="alternate" hreflang="en" href="https://sh.cd/?lang=en">
<link rel="preload" href="/fonts/IoskeleyMono-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#111827"/><rect x="5" y="3" width="6" height="10" fill="#35a952"/></svg>')}">
<style>${CSS}</style>
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="brand" href="${home}"><span class="brand-block" aria-hidden="true"></span>sh.cd<span class="brand-by">by CleanIP</span></a>
    <nav class="nav" aria-label="sh.cd">
      <a class="hide-sm" href="#sample">${t.nav.sample}</a>
      <a class="hide-sm" href="#checks">${t.nav.checks}</a>
      <a class="hide-sm" href="#options">${t.nav.options}</a>
      <a class="hide-sm" href="#data">${t.nav.data}</a>
      <a class="ext" href="https://github.com/CleanIP/sh.cd">GitHub${icon("arrow", 16)}</a>
      <a class="lang" href="${t.switchHref}" hreflang="${lang === "zh" ? "en" : "zh-CN"}">${t.switchLang}</a>
    </nav>
  </div>
</header>

<main class="wrap">
  <div class="hero">
    <p class="eyebrow">${t.eyebrow}</p>
    <h1>${t.heading[0]}<br><span class="dim">${t.heading[1]}</span></h1>
    <p class="lead">${t.lead}</p>
    <div class="cmd">
      <code><span class="prompt">$</span>${escapeHtml(COMMAND)}<span class="cursor" aria-hidden="true"></span></code>
      <button class="btn-primary" type="button" data-copy="${escapeHtml(COMMAND)}">${icon("copy", 16)}<span class="label">${t.copy}</span></button>
    </div>
    <ul class="meta">
      ${t.meta.map((m) => `<li>${m}</li>`).join("")}
    </ul>
    <div class="stats">
      ${t.stats.map(([n, unit, label]) => `<div class="stat"><b>${n}${unit ? `<small>${unit}</small>` : ""}</b><span>${label}</span></div>`).join("")}
    </div>
  </div>

  <section id="sample" aria-labelledby="sample-title">
    <div class="sec-head"><h2 id="sample-title">${t.sampleTitle}</h2><span class="rule"></span><span class="sec-meta">${t.sampleMeta}</span></div>
    <div class="sample">
      <div class="sample-tabs" role="tablist" aria-label="${t.sampleTitle}" aria-orientation="vertical">
        ${order.map((k, i) => `<button class="sample-tab" type="button" role="tab" id="tab-${k}" aria-controls="panel-${k}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="tab-name">${t.tabs[k][0]}</span><span class="tab-desc">${t.tabs[k][1]}</span></button>`).join("\n        ")}
      </div>
      <div class="term-win">
        <div class="term-bar"><span class="term-cmd"><b>$</b> ${escapeHtml(COMMAND)} -A${lang === "en" ? " -E" : ""}</span></div>
        ${order.map((k, i) => `<pre class="term" id="panel-${k}" role="tabpanel" aria-labelledby="tab-${k}" tabindex="0"${i === 0 ? "" : " hidden"}>${reportHtml(reports[k])}\n\n  <span class="a-g">$</span> <span class="cursor" aria-hidden="true"></span></pre>`).join("\n        ")}
      </div>
    </div>
  </section>

  <section id="checks" aria-labelledby="checks-title">
    <div class="sec-head"><h2 id="checks-title">${t.checksTitle}</h2><span class="rule"></span><span class="sec-meta">${t.checksMeta}</span></div>
    <ol class="stages">
      ${t.stages.map((s, i) => `<li class="stage">
        <div class="stage-top"><span class="stage-no">0${i + 1}</span><span class="stage-flag">${s.flag}</span></div>
        <h3>${s.name}</h3>
        <p class="stage-time">${s.time}</p>
        <ul>${s.items.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
      </li>`).join("\n      ")}
    </ol>
  </section>

  <section id="options" aria-labelledby="options-title">
    <div class="sec-head"><h2 id="options-title">${t.optionsTitle}</h2><span class="rule"></span><span class="sec-meta">${t.optionsMeta}</span></div>
    <div class="two">
      <dl class="opts">
        ${t.options.map(([flag, desc]) => `<dt>${escapeHtml(flag)}</dt><dd>${escapeHtml(desc)}</dd>`).join("\n        ")}
      </dl>
      <div>
        <h3 class="sub">${t.examplesTitle}</h3>
        <ul class="examples">
          ${t.examples.map(([cmd, note]) => `<li class="example"><div class="example-note">${escapeHtml(note)}</div><div class="example-row"><code>${escapeHtml(cmd)}</code><button class="btn-ghost" type="button" data-copy="${escapeHtml(cmd)}" aria-label="${t.copy}">${icon("copy", 16)}</button></div></li>`).join("\n          ")}
        </ul>
      </div>
    </div>
  </section>

  <section id="data" aria-labelledby="data-title">
    <div class="sec-head"><h2 id="data-title">${t.dataTitle}</h2><span class="rule"></span></div>
    <div class="two">
      <div><h3 class="sub">${t.requireTitle}</h3><ul class="notes">${t.require.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>
      <div><h3 class="sub">${t.privacyTitle}</h3><ul class="notes">${t.privacy.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <span class="copyright">© ${new Date().getFullYear()} sh.cd · MIT</span>
    <div class="links">
      <a href="https://github.com/CleanIP/sh.cd">${t.footerSource}</a>
      <a href="${cleanip}">CleanIP.io</a>
      <a href="https://github.com/ahatem/IoskeleyMono">${t.footerFont} Ioskeley Mono</a>
    </div>
  </div>
</footer>
<script>${SCRIPT(t)}</script>
</body>
</html>
`
  cache.set(lang, html)
  return html
}
