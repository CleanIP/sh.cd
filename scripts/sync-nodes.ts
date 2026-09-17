// 同步 Zstatic 的节点清单: 省级 93 个 + 市级 223 个。
//
//   bun run nodes:check   只比对, 有出入就以退出码 1 结束 (发版前跑一下)
//   bun run nodes:sync    比对并写回 server/render/cities.ts 与 check.sh 里的 CITY_NODES
//
// 清单来源是 zstaticcdn.com 节点查询页的数据文件。节点用域名不用 IP, 对方换机器我们不用动;
// 真要增删节点时, 这里能一眼看出差异。城市中文名用清单自带的标注, 清单没写的按拼音对照表补
// (归属库对 CDN 节点的定位不准, 不能拿来当城市名)。

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { CITY_NODES } from "../server/render/cities"

// 站点会 302 到实际的静态域名, 数据文件跟着走
const SITE = "https://www.zstaticcdn.com/"
const DATA_FILE = "nodes_data.js"
const ROOT = resolve(import.meta.dir, "..")

/** 清单没写中文名的节点 (都是省会或大城市), 按拼音补 */
const PINYIN: Record<string, string> = {
  hefei: "合肥", wuhu: "芜湖", fuzhou: "福州", nanping: "南平", ningde: "宁德", xiamen: "厦门",
  dongguan: "东莞", guangzhou: "广州", jieyang: "揭阳", shenzhen: "深圳", lanzhou: "兰州", qingyang: "庆阳",
  zhongwei: "中卫", guiyang: "贵阳", luoyang: "洛阳", zhengzhou: "郑州", wuhan: "武汉", xiangyang: "襄阳",
  xiaogan: "孝感", yichang: "宜昌", langfang: "廊坊", xiongan: "雄安", haikou: "海口", changsha: "长沙",
  chenzhou: "郴州", huaihua: "怀化", yongzhou: "永州", zhuzhou: "株洲", changchun: "长春", nanjing: "南京",
  suzhou: "苏州", wuxi: "无锡", zhenjiang: "镇江", liaoyang: "辽阳", huhehaote: "呼和浩特",
  chengdu: "成都", jinan: "济南", qingdao: "青岛", ankang: "安康", weinan: "渭南", xian: "西安",
  xianyang: "咸阳", taiyuan: "太原", wulumuqi: "乌鲁木齐", lasa: "拉萨", hangzhou: "杭州", ningbo: "宁波",
  // 同名不同地: 按省份区分
  "js-taizhou": "泰州", "zj-taizhou": "台州",
}
/** 英文名按拼音拼写, 这几个用通行写法 */
const EN: Record<string, string> = { xian: "Xi'an", wulumuqi: "Urumqi", lasa: "Lhasa", huhehaote: "Hohhot" }

export interface CityNode { key: string, host: string, province: string, carrier: "ct" | "cu" | "cm", zh: string, en: string }

export function parseNodes(js: string): { province: string[], city: CityNode[] } {
  const province = [...new Set([...js.matchAll(/([a-z]{2}-(?:ct|cu|cm)-v4)\.ip\.zstaticcdn\.com/g)].map((m) => m[1]!))].sort()
  const cityStart = js.indexOf("cityKeyList")
  const tail = js.slice(cityStart)
  const keys = new Set([...tail.slice(0, tail.indexOf("]")).matchAll(/"([a-z0-9-]+-(?:ct|cu|cm)-v4)"/g)].map((m) => m[1]!))
  const meta = new Map<string, string>()
  for (const m of tail.slice(tail.indexOf("extraCityNodeMeta")).matchAll(/"([a-z0-9-]+-(?:ct|cu|cm)-v4)":\s*"([^"]+)"/g)) {
    keys.add(m[1]!)
    meta.set(m[1]!, m[2]!)
  }
  const city: CityNode[] = []
  for (const key of [...keys].sort()) {
    const parts = key.split("-")
    const prov = parts[0]!
    const carrier = parts[parts.length - 2] as CityNode["carrier"]
    const cityKey = parts.slice(1, -2).join("-")
    const label = meta.get(key)
    const zh = label
      ? label.replace(/^(北京市|天津市|上海市|重庆市|.+?省|.+?自治区)/, "").replace(/市$/, "")
      : PINYIN[`${prov}-${cityKey}`] ?? PINYIN[cityKey.replace(/-/g, "")] ?? ""
    if (!zh) {
      console.error(`缺中文名: ${key} —— 在 scripts/sync-nodes.ts 的拼音表里补一条`)
      continue
    }
    city.push({
      key: `${prov}_${cityKey.replace(/-/g, "")}_${carrier}`,
      host: `${key}.ip.zstaticcdn.com`,
      province: prov,
      carrier,
      zh,
      en: EN[cityKey.replace(/-/g, "")] ?? cityKey.split("-").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(""),
    })
  }
  return { province, city }
}

function renderCities(city: CityNode[]): string {
  return [
    "// Zstatic 的市级节点 (清单见 scripts/sync-nodes.ts, 用 bun run nodes:sync 更新)。",
    "// 键 = <省>_<城市拼音>_<运营商>, 与脚本提交的 latc_ 字段一一对应。",
    'export const CITY_NODES: Array<[key: string, province: string, carrier: "ct" | "cu" | "cm", zh: string, en: string]> = [',
    ...city.map((c) => `  ["${c.key}", "${c.province}", "${c.carrier}", "${c.zh}", "${c.en}"],`),
    "]",
    "",
  ].join("\n")
}

function replaceCityNodes(script: string, city: CityNode[]): string {
  const start = script.indexOf('CITY_NODES="\n')
  const end = script.indexOf('\n"\n', start)
  if (start < 0 || end < 0) throw new Error("check.sh 里找不到 CITY_NODES")
  return script.slice(0, start) + 'CITY_NODES="\n' + city.map((c) => `${c.key}|${c.host}`).join("\n") + script.slice(end)
}

const write = process.argv.includes("--write")
const site = await fetch(SITE, { redirect: "follow", signal: AbortSignal.timeout(20_000) })
if (!site.ok) throw new Error(`打不开节点查询页: HTTP ${site.status}`)
const res = await fetch(new URL(DATA_FILE, site.url), { signal: AbortSignal.timeout(20_000) })
const js = res.ok ? await res.text() : ""
if (!js.includes("provinceBaseData")) throw new Error(`拉取节点清单失败 (${new URL(DATA_FILE, site.url)}): HTTP ${res.status}`)
const { province, city } = parseNodes(js)
console.log(`清单: 省级 ${province.length} 个 · 市级 ${city.length} 个`)

const have = new Set(CITY_NODES.map(([k]) => k))
const want = new Set(city.map((c) => c.key))
const added = city.filter((c) => !have.has(c.key)).map((c) => c.key)
const removed = [...have].filter((k) => !want.has(k))
const script = readFileSync(resolve(ROOT, "check.sh"), "utf8")
const scriptKeys = new Set([...script.matchAll(/^([a-z0-9_]+)\|[a-z0-9-]+\.ip\.zstaticcdn\.com$/gm)].map((m) => m[1]!))
const scriptDiff = city.filter((c) => !scriptKeys.has(c.key)).map((c) => c.key)

if (added.length) console.log(`新增 ${added.length} 个: ${added.slice(0, 10).join(", ")}${added.length > 10 ? " …" : ""}`)
if (removed.length) console.log(`已下线 ${removed.length} 个: ${removed.slice(0, 10).join(", ")}${removed.length > 10 ? " …" : ""}`)
if (scriptDiff.length) console.log(`check.sh 里缺 ${scriptDiff.length} 个`)

if (!added.length && !removed.length && !scriptDiff.length) {
  console.log("与仓库里的清单一致")
} else if (write) {
  writeFileSync(resolve(ROOT, "server/render/cities.ts"), renderCities(city))
  writeFileSync(resolve(ROOT, "check.sh"), replaceCityNodes(script, city))
  console.log("已写回 server/render/cities.ts 与 check.sh")
} else {
  console.log("要更新就跑 bun run nodes:sync")
  process.exit(1)
}
