// sh.cd 在浏览器里打开时的说明页 (curl / wget 拿到的仍是脚本本身, 见 server/main.ts)。
//
// 独立的一页 HTML: sh.cd 是脚本入口域名, 页面只需要命令、示例报告和说明。
// 示例报告用真实的终端排版函数 (render/base / render/local) 生成再把 ANSI 转成 HTML,
// 报告格式改了这里自动跟上, 不会和实际输出对不上。
// 访客可见文案不写实现细节 (后端 / 缓存 / 接口名等), 见项目约定。

import { createRenderer, renderHeader, renderIpSections, type IpReport, type Lang } from "./render/base"
import { ipcheckSubtitle, parseIpcheckFields, renderLocalSections } from "./render/local"

// —— 示例报告 ——

const SAMPLE_IP: IpReport & { ip: string } = {
  ok: true,
  ip: "203.0.113.8",
  ip_version: 4,
  geo: { country: "美国", country_en: "United States", region: "加利福尼亚州", city: "洛杉矶" },
  network: { asn: 64500, asn_name: "Example Cloud LLC", asn_type: "hosting" },
  risk: { risk_score: 18, risk_label: "Clean", is_datacenter: true },
  purity: { score: 86, grade: "A", ip_type: "hosting", native_label: "Native IP", residential_probability: 4 },
}

const SAMPLE_FIELDS = {
  media_netflix: "yes|US", media_youtube: "yes|US", media_tiktok: "yes|US", media_prime: "yes|US",
  media_chatgpt: "yes|US", media_claude: "yes|US", media_gemini: "yes|USA",
  mail_gmail: "ok", mail_outlook: "ok", mail_yahoo: "ok", mail_icloud: "ok", mail_qq: "ok", mail_163: "ok",
  lat_bj_ct: "153.9|0", lat_bj_cu: "155.1|0", lat_bj_cm: "154.9|0",
  lat_sh_ct: "133.5|0", lat_sh_cu: "133.4|0", lat_sh_cm: "130.9|0",
  lat_gd_ct: "157.5|0", lat_gd_cu: "161.5|0", lat_gd_cm: "172.4|0",
  rt_bj_ct: "4:59.43.189.37,5:59.43.38.189", rt_bj_cu: "6:218.105.131.101", rt_bj_cm: "3:223.120.201.69",
  rt_sh_ct: "4:59.43.189.33,6:59.43.159.97", rt_sh_cu: "6:218.105.2.150", rt_sh_cm: "3:223.120.201.69",
  rt_gd_ct: "4:59.43.184.117,5:59.43.250.53", rt_gd_cu: "6:218.105.131.181", rt_gd_cm: "3:223.120.201.69",
  sp_1: "near|Los Angeles, CA|912.4|887.0", sp_2: "cu|bj|543.3|589.0", sp_3: "cu|sh|501.2|563.0",
}

function sampleReport(lang: Lang): string {
  const R = createRenderer(lang, true)
  const dns = [{ ip: "8.8.8.8", asn: 15169, org: "Google LLC", country: lang === "zh" ? "美国" : "United States" }]
  return [
    ...renderHeader(R, ipcheckSubtitle(lang), "https://sh.cd"),
    ...renderIpSections(R, SAMPLE_IP),
    ...renderLocalSections(R, parseIpcheckFields(SAMPLE_FIELDS), dns),
  ].join("\n")
}

// —— ANSI → HTML ——
// 只认报告里实际用到的几种: 1 粗体 / 4 下划线 / 品牌绿 / 33 黄 / 31 红 / 90 灰 / 四种徽章底色 / 0 复位

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

function ansiToHtml(input: string): string {
  let classes: string[] = []
  let out = ""
  const re = /\x1b\[([\d;]*)m/g
  let last = 0
  const emit = (text: string) => {
    if (!text) return
    // 汉字固定 2 列、其它非 ASCII 字符 (框线 / 方块 / 勾叉) 固定 1 列, 否则浏览器里等宽对不齐
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

// —— 文案 ——

const COPY = {
  zh: {
    htmlLang: "zh-CN",
    title: "sh.cd · CleanIP 服务器体检",
    description: "一行命令体检服务器：硬件与性能跑分、IP 纯净度与流媒体解锁、BGP、三网延迟与回程线路、带宽测速。",
    heading: "一行命令，给服务器做一次全面体检",
    lead: "硬件与性能跑分、IP 纯净度与流媒体解锁、BGP 与三网回程线路、国内外带宽，按项目分步检测，每一项跑完先看结果再决定要不要继续。",
    copy: "复制",
    copied: "已复制",
    sample: "示例报告",
    featuresTitle: "检测内容",
    features: [
      ["server", "硬件与性能", "虚拟化、CPU 与指令集、内存超开迹象；sysbench CPU / 内存跑分，fio 硬盘四项与 ATTO 块大小表。"],
      ["shield", "IP 纯净度", "归属、原生或广播、纯净度与综合评分、多源检测、风险因素、黑名单与各平台适用分。"],
      ["tv", "流媒体与 AI 解锁", "Netflix、Disney+、YouTube Premium、TikTok、Prime Video、Reddit、ChatGPT、Claude、Gemini。"],
      ["mail", "邮件端口", "25 端口出站，以及 Gmail、Outlook、QQ、163、Mail.ru 等 12 家邮箱的握手结果。"],
      ["route", "BGP 与回程线路", "上游与对等、NAT 类型与 TCP 策略；识别 CN2 GIA、9929、CMIN2 等回程线路，可看逐跳详情。"],
      ["activity", "延迟与带宽", "全国 31 省三网延迟走势、12 个国际节点延迟、国内三网与 6 个国际节点的上传下载。"],
    ],
    paramsTitle: "常用参数",
    params: [
      ["不带参数", "进入菜单，选一键全检后一口气测完，最后出总览"],
      ["-H / -I / -N", "只测硬件与性能 / IP 质量 / 网络质量"],
      ["-A", "跳过菜单，直接一键全检"],
      ["-d", "深度模式：ATTO 块大小表、逐跳回程路由"],
      ["-y", "缺少 sysbench / fio 时直接安装"],
      ["-x socks5h://127.0.0.1:1080", "检测代理的出口"],
      ["-j / -E", "输出 JSON / 英文报告"],
    ],
    paramsMore: "完整参数运行 -h 查看。",
    requireTitle: "运行要求",
    require: "只需要 bash 与 curl，Linux 上检测最完整。CPU、内存跑分与硬盘读写需要 sysbench、fio，系统里没有时开始前询问一次（15 秒不回答默认安装）；其余检测不安装任何软件、不修改系统。",
    privacyTitle: "会发送哪些数据",
    privacy: "检测在你的机器上完成，完成后把检测结果提交到 sh.cd 生成报告：硬件型号与跑分、解锁与邮箱握手结果、延迟、回程逐跳 IP 与测速结果。只查询发起请求的出口 IP，不能指定其他 IP；不读取、不发送主机名、文件或登录信息。",
    footerSource: "源码",
    switchLang: "English",
    switchHref: "?lang=en",
  },
  en: {
    htmlLang: "en",
    title: "sh.cd · Server check-up by CleanIP",
    description: "One command to check a server: hardware benchmarks, IP purity and streaming unlocks, BGP, latency and return routes to China, and bandwidth.",
    heading: "One command for a full server check-up",
    lead: "Hardware benchmarks, IP purity and streaming unlocks, BGP and return routes to China, and bandwidth — section by section, with a look at each result before moving on.",
    copy: "Copy",
    copied: "Copied",
    sample: "Sample report",
    featuresTitle: "What it checks",
    features: [
      ["server", "Hardware & performance", "Virtualization, CPU extensions, memory overcommit; sysbench CPU and memory, fio disk tests and ATTO table."],
      ["shield", "IP purity", "Location, native or broadcast, purity and overall scores, multi-source checks, blacklists and platform fit."],
      ["tv", "Streaming & AI", "Netflix, Disney+, YouTube Premium, TikTok, Prime Video, Reddit, ChatGPT, Claude and Gemini."],
      ["mail", "Mail port 25", "Outbound port 25 and SMTP handshakes with 12 providers including Gmail, Outlook and QQ."],
      ["route", "BGP & routes", "Upstreams and peers, NAT and TCP settings; detects CN2 GIA, 9929, CMIN2 and more, hop by hop."],
      ["activity", "Latency & bandwidth", "Latency to 31 Chinese provinces and 12 international sites; speed to China carriers and 6 regions."],
    ],
    paramsTitle: "Common options",
    params: [
      ["no options", "Open the menu; the full check-up runs straight through to a summary"],
      ["-H / -I / -N", "Hardware / IP quality / network only"],
      ["-A", "Skip the menu and run the full check-up"],
      ["-d", "Deep mode: ATTO table, hop-by-hop routes"],
      ["-y", "Install sysbench / fio without asking"],
      ["-x socks5h://127.0.0.1:1080", "Check a proxy's exit"],
      ["-j / -E", "JSON output / English report"],
    ],
    paramsMore: "Run with -h for all options.",
    requireTitle: "Requirements",
    require: "Only bash and curl; most complete on Linux. CPU, memory and disk benchmarks need sysbench and fio — you are asked once before starting (installs by default after 15 s). Everything else installs nothing and changes nothing.",
    privacyTitle: "What data is sent",
    privacy: "Checks run on your machine; the results are sent to sh.cd to build the report: hardware model and scores, unlock and SMTP results, latency, per-hop route IPs and speed. Only the IP making the request is looked up; no hostname, files or credentials are read or sent.",
    footerSource: "Source",
    switchLang: "中文",
    switchHref: "?lang=zh",
  },
} as const

// Lucide 图标 (ISC 许可), 与站点统一用线性图标, 不用 emoji
const ICONS: Record<string, string> = {
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  tv: '<rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  server: '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
}
const icon = (name: string, size: number, cls = "icon") =>
  `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`

const COMMAND = "bash <(curl -Ls https://sh.cd)"

const CSS = `
:root {
  --color-primary: #35a952;
  --color-primary-hover: #30984a;
  --color-secondary: #111827;
  --color-neutral-50: #f8f9fa;
  --color-neutral-100: #f3f4f6;
  --color-neutral-200: #e5e7eb;
  --color-neutral-300: #d1d5db;
  --color-neutral-400: #9ca3af;
  --color-neutral-500: #6b7280;
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
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}
* { box-sizing: border-box; }
body { margin: 0; background: #ffffff; color: var(--color-neutral-900); font: 400 var(--text-base)/1.5 var(--font-sans); }
a { color: inherit; }
.wrap { max-width: 880px; margin: 0 auto; padding-inline: var(--space-4); }
header.top { display: flex; align-items: center; justify-content: space-between; padding-block: var(--space-6); }
.brand { display: flex; align-items: center; gap: var(--space-2); font-weight: 600; text-decoration: none; }
.brand-mark { width: var(--space-4); height: var(--space-4); background: var(--color-primary); border-radius: var(--radius-sm); }
.top-links { display: flex; gap: var(--space-4); font-size: var(--text-sm); color: var(--color-neutral-500); }
.top-links a { text-decoration: none; }
.top-links a:hover { color: var(--color-neutral-900); }
.hero { padding-block: var(--space-8) var(--space-6); }
h1 { margin: 0 0 var(--space-3); font-size: var(--text-2xl); font-weight: 600; line-height: 1.25; }
h2 { margin: 0 0 var(--space-4); font-size: var(--text-lg); font-weight: 600; line-height: 1.25; }
.lead { margin: 0; color: var(--color-neutral-500); max-width: 680px; }
.cmd { display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-6); padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4); border: 1px solid var(--color-neutral-300); border-radius: var(--radius-md); background: var(--color-neutral-50); }
.cmd code { flex: 1; min-width: 0; overflow-x: auto; white-space: nowrap; font: 400 var(--text-base)/1.5 var(--font-mono); }
.cmd code .prompt { color: var(--color-neutral-400); user-select: none; }
.btn { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); border: 0; border-radius: var(--radius-sm); background: var(--color-primary); color: #ffffff; font: 600 var(--text-sm)/1.5 var(--font-sans); cursor: pointer; white-space: nowrap; }
.btn:hover { background: var(--color-primary-hover); }
section { padding-block: var(--space-8); }
.term-label { margin: 0 0 var(--space-2); font-size: var(--text-sm); color: var(--color-neutral-500); }
.term { margin: 0; padding: var(--space-6); overflow-x: auto; border-radius: var(--radius-lg); background: var(--color-secondary); color: var(--color-neutral-200); font: 400 var(--text-sm)/1.5 var(--font-mono); }
.term .w1 { display: inline-block; width: 1ch; }
.term .w2 { display: inline-block; width: 2ch; }
.a-b { font-weight: 600; }
.a-u { text-decoration: underline; }
.a-g { color: var(--color-primary); }
.a-y { color: var(--color-warning); }
.a-r { color: var(--color-error); }
.a-k { color: var(--color-neutral-500); }
.bg-g { background: var(--color-primary); }
.bg-y { background: var(--color-warning); }
.bg-r { background: var(--color-error); }
.bg-k { background: var(--color-neutral-500); }
.f-w { color: #ffffff; }
.f-d { color: var(--color-neutral-900); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-3); }
.card { padding: var(--space-4); border: 1px solid var(--color-neutral-200); border-radius: var(--radius-lg); }
.card .icon { color: var(--color-primary); }
.card h3 { margin: var(--space-2) 0 var(--space-1); font-size: var(--text-base); font-weight: 600; line-height: 1.25; }
.card p { margin: 0; font-size: var(--text-sm); color: var(--color-neutral-500); }
.params { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
.params td { padding: var(--space-2) var(--space-3) var(--space-2) 0; border-bottom: 1px solid var(--color-neutral-200); vertical-align: top; }
.params td:first-child { width: 1%; padding-right: var(--space-8); white-space: nowrap; font-family: var(--font-mono); color: var(--color-neutral-900); }
.params td:last-child { color: var(--color-neutral-500); }
.note { margin: var(--space-3) 0 0; font-size: var(--text-sm); color: var(--color-neutral-500); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-8); }
.two p { margin: 0; font-size: var(--text-sm); color: var(--color-neutral-500); }
footer { padding-block: var(--space-8) var(--space-12); font-size: var(--text-sm); color: var(--color-neutral-500); border-top: 1px solid var(--color-neutral-200); }
footer a { text-decoration: none; }
footer a:hover { color: var(--color-neutral-900); }
@media (max-width: 640px) {
  h1 { font-size: var(--text-xl); }
  .term { padding: var(--space-4); font-size: var(--text-xs); }
  .cmd code { font-size: var(--text-sm); }
  .two { grid-template-columns: 1fr; gap: var(--space-6); }
  .params td:first-child { white-space: normal; word-break: break-all; }
}
`

const cache = new Map<Lang, string>()

export function landingPage(lang: Lang): string {
  const hit = cache.get(lang)
  if (hit) return hit
  const t = COPY[lang]
  const html = `<!doctype html>
<html lang="${t.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.title}</title>
<meta name="description" content="${t.description}">
<link rel="canonical" href="https://sh.cd/${lang === "en" ? "?lang=en" : ""}">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#35a952"/></svg>')}">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="brand" href="https://cleanip.io${lang === "en" ? "/en" : ""}"><span class="brand-mark"></span>CleanIP.io</a>
    <nav class="top-links">
      <a href="https://github.com/CleanIP/sh.cd">GitHub</a>
      <a href="${t.switchHref}">${t.switchLang}</a>
    </nav>
  </header>

  <div class="hero">
    <h1>${t.heading}</h1>
    <p class="lead">${t.lead}</p>
    <div class="cmd">
      <code><span class="prompt">$ </span>${escapeHtml(COMMAND)}</code>
      <button class="btn" type="button" data-copy="${escapeHtml(COMMAND)}">${icon("copy", 16)}<span>${t.copy}</span></button>
    </div>
  </div>

  <section>
    <p class="term-label">${t.sample}</p>
    <pre class="term">${ansiToHtml(sampleReport(lang))}</pre>
  </section>

  <section>
    <h2>${t.featuresTitle}</h2>
    <div class="grid">
      ${t.features.map(([ic, title, desc]) => `<div class="card">${icon(ic, 20)}<h3>${title}</h3><p>${desc}</p></div>`).join("\n      ")}
    </div>
  </section>

  <section>
    <h2>${t.paramsTitle}</h2>
    <table class="params">
      ${t.params.map(([flag, desc]) => `<tr><td>${escapeHtml(flag)}</td><td>${desc}</td></tr>`).join("\n      ")}
    </table>
    <p class="note">${t.paramsMore}</p>
  </section>

  <section class="two">
    <div><h2>${t.requireTitle}</h2><p>${t.require}</p></div>
    <div><h2>${t.privacyTitle}</h2><p>${t.privacy}</p></div>
  </section>

  <footer>
    <a href="https://cleanip.io${lang === "en" ? "/en" : ""}">CleanIP.io</a> ·
    <a href="https://github.com/CleanIP/sh.cd">${t.footerSource}</a> · MIT
  </footer>
</div>
<script>
document.querySelectorAll("[data-copy]").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var label = btn.querySelector("span");
    navigator.clipboard.writeText(btn.getAttribute("data-copy")).then(function () {
      label.textContent = ${JSON.stringify(t.copied)};
      setTimeout(function () { label.textContent = ${JSON.stringify(t.copy)}; }, 1600);
    });
  });
});
</script>
</body>
</html>
`
  cache.set(lang, html)
  return html
}
