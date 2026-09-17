// 更新日志页 https://sh.cd/changelog: 内容来自仓库根目录的 CHANGELOG.md (中文) 与 CHANGELOG.en.md (英文)。
//
// 文件格式 (两份结构一致, 版本与日期一一对应, tests/changelog.test.ts 核对):
//   ## v1.2.0 · 2026-09-17
//   ### 新增 | Added
//   - 条目, 可用 `代码`
//   ### 修复 | Fixed
// 最新版本写在最上面, 且必须等于 check.sh 的 VERSION —— 发版不写更新日志, 测试不过, 发布脚本不会上传。

import { readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import type { Lang } from "./render/base"
import { escapeHtml, pageHead, siteFooter, siteHeader } from "./site"
import { VERSION } from "./version"

export type ChangeKind = "added" | "fixed"

export interface Release {
  version: string
  date: string
  groups: Array<{ kind: ChangeKind, items: string[] }>
}

const KINDS: Record<string, ChangeKind> = { 新增: "added", added: "added", 修复: "fixed", fixed: "fixed" }

export function parseChangelog(md: string): { intro: string, releases: Release[] } {
  const releases: Release[] = []
  const intro: string[] = []
  let group: Release["groups"][number] | null = null
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd()
    const rel = /^## v(\d+\.\d+\.\d+) · (\d{4}-\d{2}-\d{2})$/.exec(line)
    if (rel) {
      releases.push({ version: rel[1]!, date: rel[2]!, groups: [] })
      group = null
      continue
    }
    const kind = /^### (.+)$/.exec(line)
    if (kind && releases.length) {
      const k = KINDS[kind[1]!.trim().toLowerCase()]
      if (!k) throw new Error(`unknown changelog section: ${kind[1]}`)
      group = { kind: k, items: [] }
      releases.at(-1)!.groups.push(group)
      continue
    }
    const item = /^- (.+)$/.exec(line)
    if (item && group) {
      group.items.push(item[1]!)
      continue
    }
    if (!releases.length && line && !line.startsWith("#")) intro.push(line)
  }
  return { intro: intro.join(" "), releases }
}

const FILES: Record<Lang, string> = {
  zh: resolve(import.meta.dir, "../CHANGELOG.md"),
  en: resolve(import.meta.dir, "../CHANGELOG.en.md"),
}

// 按文件修改时间缓存: 只更新日志文件时不用重启服务
const cache = new Map<Lang, { mtimeMs: number, md: string, html: string }>()

function load(lang: Lang): { md: string, html: string } {
  const file = FILES[lang]
  const mtimeMs = statSync(file).mtimeMs
  const hit = cache.get(lang)
  if (hit && hit.mtimeMs === mtimeMs) return hit
  const md = readFileSync(file, "utf8")
  const entry = { mtimeMs, md, html: renderPage(lang, parseChangelog(md)) }
  cache.set(lang, entry)
  return entry
}

/** curl 访问时给纯文本 */
export function changelogText(lang: Lang): string {
  return load(lang).md
}

export function changelogPage(lang: Lang): string {
  return load(lang).html
}

const COPY = {
  zh: {
    title: "更新日志 · sh.cd",
    description: "sh.cd 服务器体检脚本每个版本的新增功能与修复记录。",
    eyebrow: "当前版本",
    heading: "更新日志",
    latest: "最新",
    kinds: { added: "新增", fixed: "修复" },
    raw: "纯文本",
  },
  en: {
    title: "Changelog · sh.cd",
    description: "New features and fixes in each release of the sh.cd server check-up script.",
    eyebrow: "Current version",
    heading: "Changelog",
    latest: "Latest",
    kinds: { added: "Added", fixed: "Fixed" },
    raw: "Plain text",
  },
} as const

const CSS = `
.hero-sm { padding-block: var(--space-12) var(--space-8); }
.hero-sm .lead a { color: var(--color-neutral-900); text-decoration: underline; text-underline-offset: 3px; }
.releases { margin: 0 0 var(--space-12); padding: 0; list-style: none; }
.release { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: var(--space-8); padding-block: var(--space-8); border-top: 1px solid var(--color-neutral-200); scroll-margin-top: var(--space-16); }
.release-meta { position: sticky; top: calc(var(--space-16) + var(--space-6)); align-self: start; display: grid; gap: var(--space-1); justify-items: start; }
.release-version { display: inline-flex; align-items: center; gap: var(--space-3); font-size: var(--text-lg); font-weight: 600; line-height: 1.25; }
.release-version::before { content: ""; width: var(--space-3); height: var(--space-3); background: var(--color-neutral-300); }
.release:first-child .release-version::before { background: var(--color-primary); }
.release-version:hover { color: var(--color-primary-strong); }
.release-meta time { padding-left: var(--space-6); font-size: var(--text-sm); color: var(--color-neutral-500); }
.release-latest { margin: var(--space-2) 0 0 var(--space-6); padding: 0 var(--space-2); border-radius: var(--radius-sm); background: var(--color-primary-soft); color: var(--color-primary-strong); font-size: var(--text-xs); font-weight: 600; }
.release-body { display: grid; gap: var(--space-6); }
.change-kind { margin: 0 0 var(--space-2); font-size: var(--text-sm); font-weight: 600; color: var(--color-neutral-500); }
.changes { margin: 0; padding: 0; list-style: none; font-size: var(--text-sm); color: var(--color-neutral-700); }
.changes li { display: flex; gap: var(--space-3); padding-block: var(--space-2); border-bottom: 1px solid var(--color-neutral-100); }
.changes li::before { flex: none; content: "·"; color: var(--color-neutral-400); }
.changes.added li::before { content: "+"; color: var(--color-primary-strong); }
.changes code { padding: 0 var(--space-1); border-radius: var(--radius-sm); background: var(--color-neutral-100); color: var(--color-neutral-900); font: inherit; overflow-wrap: anywhere; }
@media (max-width: 720px) {
  .hero-sm { padding-block: var(--space-8) var(--space-6); }
  .release { grid-template-columns: minmax(0, 1fr); gap: var(--space-4); padding-block: var(--space-6); }
  .release-meta { position: static; display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-3); }
  .release-meta time { padding-left: 0; }
  .release-latest { margin: 0; }
}
`

// 条目里的 `代码` 转成 <code>, 其余转义
const inline = (s: string) => escapeHtml(s).replace(/`([^`]+)`/g, "<code>$1</code>")

function renderPage(lang: Lang, log: { intro: string, releases: Release[] }): string {
  const t = COPY[lang]
  const raw = "/changelog" + (lang === "en" ? "?lang=en&raw=1" : "?raw=1")
  return `${pageHead(lang, "changelog", t.title, t.description, CSS)}
<body>
${siteHeader(lang, "changelog")}

<main class="wrap">
  <div class="hero hero-sm">
    <p class="eyebrow">sh.cd · ${t.eyebrow} v${VERSION}</p>
    <h1>${t.heading}</h1>
    <p class="lead">${inline(log.intro)} <a href="${raw}">${t.raw}</a></p>
  </div>

  <ol class="releases">
    ${log.releases.map((r, i) => `<li class="release" id="v${r.version}">
      <div class="release-meta">
        <a class="release-version" href="#v${r.version}">v${r.version}</a>
        <time datetime="${r.date}">${r.date}</time>
        ${i === 0 ? `<span class="release-latest">${t.latest}</span>` : ""}
      </div>
      <div class="release-body">
        ${r.groups.map((g) => `<div>
          <h2 class="change-kind">${t.kinds[g.kind]}</h2>
          <ul class="changes ${g.kind}">${g.items.map((x) => `<li><span>${inline(x)}</span></li>`).join("")}</ul>
        </div>`).join("\n        ")}
      </div>
    </li>`).join("\n    ")}
  </ol>
</main>

${siteFooter(lang)}
</body>
</html>
`
}
