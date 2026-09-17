// sh.cd 在浏览器里打开时的首页 (curl / wget 拿到的仍是脚本本身, 见 server/main.ts)。
//
// 独立的一页 HTML, 无外部依赖: 字体 Ioskeley Mono (SIL OFL 1.1) 由本服务 /fonts/ 提供, 中文回落到系统黑体。
// 示例报告四个标签 (总览 / 硬件 / IP / 网络) 用线上报告同一套排版函数生成 (server/sample.ts), 再把 ANSI 转成 HTML。
// 版式呼应终端报告: 章节标题 = 绿色方块 + 标题 + 细线, 和报告里的阶段标题条一致。
// 访客可见文案不写实现细节 (后端 / 缓存 / 接口名等)。

import { BANNER_LOGO, type Lang } from "./render/base"
import { ansiToHtml, cleanipLogo, escapeHtml, href, icon, pageHead, siteFooter, siteHeader } from "./site"
import { VERSION } from "./version"
import { sampleReports, type SampleTab } from "./sample"

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
  title: string
  description: string
  eyebrow: string
  changelog: string
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
}

const COPY: Record<Lang, Copy> = {
  zh: {
    title: "sh.cd · 一行命令体检服务器",
    description: "一行命令体检服务器：硬件与性能跑分、IP 纯净度与流媒体解锁、BGP、三网延迟与回程线路、国内外带宽测速。",
    eyebrow: "服务器体检脚本 · {logo} 出品",
    changelog: "更新日志",
    heading: ["一行命令，", "给服务器做一次全面体检"],
    lead: "硬件与性能、IP 纯净度与解锁、BGP 与三网回程、国内外带宽，一口气测完，最后给一屏适合截图的总览。",
    copy: "复制",
    copied: "已复制",
    meta: ["只需要 bash 与 curl", "Linux / macOS", "全检约 5 分钟", "中途不用操作", "结果页一键分享"],
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
        items: ["系统、内核、虚拟化与温度", "CPU 型号、缓存与指令集", "sysbench 跑分，Geekbench 6（-g）", "内存容量与读写带宽", "fio 4K 与顺序读写，ATTO 表（-d）", "物理机硬盘 SMART 与内存条规格"],
      },
      {
        name: "IP 质量", flag: "-I", time: "约 30 秒",
        items: ["归属、原生或广播、IP 类型", "纯净度、综合与风险评分", "VPN / 代理 / Tor / 滥用多源检测", "Netflix、ChatGPT 等 9 项解锁", "25 端口与 12 家邮箱握手", "DNS 出口与各平台适用分"],
      },
      {
        name: "网络质量", flag: "-N", time: "约 3–5 分钟",
        items: ["NAT 类型（NAT1–4）与 TCP 策略", "BGP 上游、对等与 RPKI", "31 省三网延迟 + 223 个市级节点", "31 省三网回程 + 教育网回程（-R）", "三网与国际测速，分省测速（-p）", "六大洲 36 个国际节点延迟"],
      },
    ],
    optionsTitle: "参数",
    optionsMeta: "完整参数运行 -h 查看",
    options: [
      ["不带参数", "进入菜单；1 一键全检，2 全部检测"],
      ["-A", "跳过菜单，直接一键全检"],
      ["-A -d", "全部检测：一键全检加深度模式、Geekbench、分省测速、全省回程与逐跳详情"],
      ["-H  -I  -N", "只测硬件与性能 / IP 质量 / 网络质量"],
      ["-d", "深度模式：硬盘 ATTO 表、回程每一跳的延迟"],
      ["-g", "Geekbench 6 跑分，结果会公开上传到 Geekbench 官网"],
      ["-p", "国内分省测速，多数节点不接受境外连接"],
      ["-y", "缺少检测工具时直接安装"],
      ["-4  -6", "只检测 IPv4 或 IPv6 的 IP 质量"],
      ["-x PROXY", "检测代理的出口，例 socks5h://127.0.0.1:1080"],
      ["-S LIST", "跳过部分检测：bench,media,mail,dns,latency,route,speed"],
      ["-R", "全省回程：31 省三网 + 大包 + 教育网回程"],
      ["-c", "市级延迟：223 个市级节点"],
      ["-P", "不生成结果页"],
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
      "CPU / 内存跑分与硬盘读写需要 sysbench、fio，物理机读硬盘健康与内存条还需要 smartmontools、dmidecode：缺少时开始前询问一次，15 秒不回答默认安装；不安装则跳过或用系统自带工具近似测量。",
      "除此之外不安装任何软件、不修改系统；硬盘测试的临时文件与 Geekbench 程序测完即删。",
    ],
    privacyTitle: "会发送哪些数据",
    privacy: [
      "检测在你的机器上完成，结果提交到 sh.cd 生成报告：硬件型号与跑分、硬盘健康、解锁与邮箱握手结果、延迟、回程逐跳 IP、测速结果。",
      "使用 -g 时 Geekbench 会把跑分结果公开上传到 Geekbench 官网，报告只附结果页链接。",
      "每次检测生成一个结果页 sh.cd/results/…，可复制链接或导出 Markdown 分享；报告里的 IP 只显示前两段，保存 365 天，不想保存加 -P。",
      "只查询发起请求的出口 IP，不能指定其他 IP。",
      "不读取、不发送主机名、文件或登录信息，也不发送硬盘和内存条的序列号。",
    ],
  },
  en: {
    title: "sh.cd · One-line server check-up",
    description: "One command to check a server: hardware benchmarks, IP purity and streaming unlocks, BGP, latency and return routes to China, and bandwidth.",
    eyebrow: "Server check-up script · by {logo}",
    changelog: "Changelog",
    heading: ["One command,", "a full server check-up"],
    lead: "Hardware and benchmarks, IP purity and unlocks, BGP and return routes to China, bandwidth at home and abroad — all in one run, ending with a one-screen summary.",
    copy: "Copy",
    copied: "Copied",
    meta: ["bash + curl only", "Linux / macOS", "About 5 min", "No prompts along the way", "Shareable results page"],
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
        items: ["OS, kernel, virtualization, temps", "CPU model, cache and extensions", "sysbench, Geekbench 6 (-g)", "Memory size and throughput", "fio 4K and sequential I/O, ATTO (-d)", "Bare metal: disk SMART and DIMMs"],
      },
      {
        name: "IP quality", flag: "-I", time: "30 s",
        items: ["Location, native or broadcast, IP type", "Purity, overall and risk scores", "VPN / proxy / Tor / abuse checks", "9 unlocks incl. Netflix and ChatGPT", "Port 25 and 12 mail providers", "DNS egress and platform fit"],
      },
      {
        name: "Network quality", flag: "-N", time: "3–5 min",
        items: ["NAT type (NAT1–4) and TCP settings", "BGP upstreams, peers and RPKI", "31 provinces plus 223 city nodes", "Routes: 31 provinces + CERNET (-R)", "Speed to China, provinces (-p), abroad", "Latency to 36 sites on 6 continents"],
      },
    ],
    optionsTitle: "Options",
    optionsMeta: "run with -h for all",
    options: [
      ["no options", "Open the menu: 1 full check-up, 2 all checks"],
      ["-A", "Skip the menu and run the full check-up"],
      ["-A -d", "All checks: full check-up plus deep mode, Geekbench, provincial speed, routes for all provinces and hop details"],
      ["-H  -I  -N", "Hardware / IP quality / network only"],
      ["-d", "Deep mode: ATTO table, latency per route hop"],
      ["-g", "Geekbench 6; results are uploaded publicly to Geekbench Browser"],
      ["-p", "Speed tests to Chinese provinces; most block traffic from abroad"],
      ["-y", "Install missing tools without asking"],
      ["-4  -6", "IP quality for IPv4 or IPv6 only"],
      ["-x PROXY", "Check a proxy exit, e.g. socks5h://127.0.0.1:1080"],
      ["-S LIST", "Skip: bench,media,mail,dns,latency,route,speed"],
      ["-R", "Routes for 31 provinces, large packets and CERNET"],
      ["-c", "Latency to 223 city-level nodes"],
      ["-P", "Don't create a results page"],
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
      "Benchmarks need sysbench and fio; on bare metal, disk health and memory modules also need smartmontools and dmidecode. You are asked once before starting, and they install by default after 15 s. Without them those parts are skipped or measured roughly with built-in tools.",
      "Nothing else is installed or changed; disk test files and Geekbench are removed afterwards.",
    ],
    privacyTitle: "What is sent",
    privacy: [
      "Checks run on your machine; results are sent to sh.cd to build the report: hardware model and scores, disk health, unlock and SMTP results, latency, per-hop route IPs and speed.",
      "With -g, Geekbench uploads its results publicly to Geekbench Browser; the report only links to that page.",
      "Each run gets a results page at sh.cd/results/… to share as a link or Markdown; IPs show only the first two parts, pages are kept for 365 days, and -P turns it off.",
      "Only the IP making the request is looked up — no other IP can be queried.",
      "No hostname, files or credentials are read or sent, and no disk or memory serial numbers.",
    ],
  },
}



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

  const html = `${pageHead(lang, "home", t.title, t.description, "", { analytics: true })}
<body>
${siteHeader(lang, "home")}

<main class="wrap">
  <div class="hero">
    <p class="eyebrow">${t.eyebrow.replace("{logo}", cleanipLogo(14))}<a class="eyebrow-link" href="${href("changelog", lang)}">v${VERSION} · ${t.changelog} →</a></p>
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

${siteFooter(lang)}
<script>${SCRIPT(t)}</script>
</body>
</html>
`
  cache.set(lang, html)
  return html
}
