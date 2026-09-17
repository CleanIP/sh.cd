// sh.cd 官网各页共用: 样式、页头、顶栏、页脚、图标。
//
// 整站一份样式表 (首页各区块的样式也在这里), 每页只内联一次, 不另发 CSS 文件。
// 设计令牌: 品牌绿 + 中性灰, 字号 12/14/16/20/24/32, 间距 4 的倍数, 圆角 4/8/12。
// 字体 Ioskeley Mono (SIL OFL 1.1) 由本服务 /fonts/ 提供, 中文回落到系统黑体。
// 页面里出现 CleanIP 的地方一律用官方横条 logo (assets/brand/cleanip-logo.svg), 不写文字。

import type { Lang } from "./render/base"
import { VERSION } from "./version"

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

// Lucide 图标 (ISC 许可)
const ICONS: Record<string, string> = {
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrow: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
}
export const icon = (name: string, size: number) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`

export const SITE_CSS = `
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
/* CleanIP logo: 横条 5:1, 高度由 cleanipLogo() 给定, 与旁边文字居中对齐 */
.cleanip-logo { display: inline-block; flex: none; vertical-align: middle; }
.brand-by { display: inline-flex; align-items: center; gap: var(--space-2); }
.nav { display: flex; align-items: center; gap: var(--space-6); font-size: var(--text-sm); color: var(--color-neutral-500); }
.nav a { white-space: nowrap; }
.nav a:hover, .nav a[aria-current="page"] { color: var(--color-neutral-900); }
.nav .ext { display: inline-flex; align-items: center; gap: var(--space-1); }
.nav .lang { padding: var(--space-1) var(--space-2); border: 1px solid var(--color-neutral-300); border-radius: var(--radius-sm); color: var(--color-neutral-900); }
.nav .lang:hover { background: var(--color-neutral-100); }

/* —— 首屏 —— */
.hero { padding-block: var(--space-16) var(--space-12); }
.eyebrow { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-6); font-size: var(--text-sm); color: var(--color-neutral-500); }
.eyebrow::before { content: ""; width: var(--space-2); height: var(--space-2); background: var(--color-primary); }
.eyebrow { flex-wrap: wrap; }
.eyebrow-link { margin-left: var(--space-2); color: var(--color-primary-strong); }
.eyebrow-link:hover { text-decoration: underline; text-underline-offset: 3px; }
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
footer .links { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-6); }
footer .footer-logo { display: inline-flex; }
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
  .nav .hide-sm, .nav .ext, .brand-by { display: none; }
  .nav { gap: var(--space-4); }
  .eyebrow-link { margin-left: 0; }
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


export type Page = "home" | "changelog"

/** CleanIP 官方横条 logo (viewBox 109.2 × 22), 按高度等比缩放 */
export function cleanipLogo(height: number): string {
  return `<img class="cleanip-logo" src="/brand/cleanip-logo.svg" alt="CleanIP" width="${Math.round((height * 109.2) / 22)}" height="${height}">`
}

const CHROME = {
  zh: {
    htmlLang: "zh-CN",
    nav: { sample: "示例", checks: "检测内容", options: "参数", data: "数据说明", changelog: "更新日志" },
    source: "源码",
    font: "字体",
    switchLang: "EN",
  },
  en: {
    htmlLang: "en",
    nav: { sample: "Sample", checks: "Checks", options: "Options", data: "Data", changelog: "Changelog" },
    source: "Source",
    font: "Font",
    switchLang: "中文",
  },
} as const

const PATHS: Record<Page, string> = { home: "/", changelog: "/changelog" }

/** 站内地址: 英文页带 ?lang=en */
export function href(page: Page, lang: Lang, hash = ""): string {
  return `${PATHS[page]}${lang === "en" ? "?lang=en" : ""}${hash}`
}

export function pageHead(lang: Lang, page: Page, title: string, description: string, extraCss = ""): string {
  const url = `https://sh.cd${href(page, lang)}`
  return `<!doctype html>
<html lang="${CHROME[lang].htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="theme-color" content="#ffffff">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${url}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="zh-CN" href="https://sh.cd${href(page, "zh")}">
<link rel="alternate" hreflang="en" href="https://sh.cd${href(page, "en")}">
<link rel="preload" href="/fonts/IoskeleyMono-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#111827"/><rect x="5" y="3" width="6" height="10" fill="#35a952"/></svg>')}">
<style>${SITE_CSS}${extraCss}</style>
</head>`
}

export function siteHeader(lang: Lang, page: Page): string {
  const c = CHROME[lang]
  // 首页的区块锚点在别的页面要带上首页地址
  const anchor = (hash: string) => (page === "home" ? hash : href("home", lang, hash))
  const current = (p: Page) => (p === page ? ' aria-current="page"' : "")
  return `<header class="top">
  <div class="wrap">
    <a class="brand" href="${href("home", lang)}"><span class="brand-block" aria-hidden="true"></span>sh.cd<span class="brand-by">by ${cleanipLogo(16)}</span></a>
    <nav class="nav" aria-label="sh.cd">
      <a class="hide-sm" href="${anchor("#sample")}">${c.nav.sample}</a>
      <a class="hide-sm" href="${anchor("#checks")}">${c.nav.checks}</a>
      <a class="hide-sm" href="${anchor("#options")}">${c.nav.options}</a>
      <a class="hide-sm" href="${anchor("#data")}">${c.nav.data}</a>
      <a href="${href("changelog", lang)}"${current("changelog")}>${c.nav.changelog}</a>
      <a class="ext" href="https://github.com/CleanIP/sh.cd">GitHub${icon("arrow", 16)}</a>
      <a class="lang" href="${href(page, lang === "zh" ? "en" : "zh")}" hreflang="${lang === "zh" ? "en" : "zh-CN"}">${c.switchLang}</a>
    </nav>
  </div>
</header>`
}

export function siteFooter(lang: Lang): string {
  const c = CHROME[lang]
  return `<footer>
  <div class="wrap">
    <span class="copyright">© ${new Date().getFullYear()} sh.cd · v${VERSION} · MIT</span>
    <div class="links">
      <a href="${href("changelog", lang)}">${c.nav.changelog}</a>
      <a href="https://github.com/CleanIP/sh.cd">${c.source}</a>
      <a class="footer-logo" href="https://cleanip.io${lang === "en" ? "/en" : ""}">${cleanipLogo(16)}</a>
      <a href="https://github.com/ahatem/IoskeleyMono">${c.font} Ioskeley Mono</a>
    </div>
  </div>
</footer>`
}
