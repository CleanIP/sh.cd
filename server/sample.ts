// 说明页的示例报告: 一台洛杉矶 KVM 云服务器的一次一键全检。
// 数值取自真实运行的量级, IP、网段、ASN、主机名都是文档示例值 (203.0.113.0/24、AS64500), 不指向任何真实机器。
// 各段用和线上报告完全相同的排版函数生成, 报告格式改了示例自动跟上。

import { createRenderer, renderBanner, renderIpSections, stageBar, type Lang } from "./render/base"
import { HW_TITLE, parseHw, renderHw } from "./render/hw"
import { renderIpDetail, type FullReport } from "./render/ip"
import { MAIL, parseIpcheckFields, PROVINCES, renderLocalSections } from "./render/local"
import { NET_TITLE, parseNet, renderNet, type BgpInfo } from "./render/net"
import { renderSummary } from "./render/summary"
import { VERSION } from "./version"

const HW_FIELDS = {
  hw_os: "Debian GNU/Linux 13 (trixie)|6.12.74+deb13+1-amd64|x86_64",
  hw_virt: "kvm",
  hw_uptime: "1320441|0.16 0.22 0.26",
  hw_procs: "212|1|24|141",
  hw_tz: "Asia/Shanghai|+0800|C.UTF-8",
  hw_board: "OpenStack Foundation|OpenStack Nova|SeaBIOS|1.16.1-1.el9",
  hw_chipset: "Intel Corporation 440FX - 82441FX PMC [Natoma]",
  hw_nic: "Red Hat, Inc. Virtio network device",
  hw_cpu: "AMD EPYC 9654 96-Core Processor|8|8|1|2396|3",
  hw_cache: "256 KiB|256 KiB|4 MiB|32 MiB",
  hw_flags: "aes,avx,avx2,avx512f,bmi1,bmi2,sha_ni,hypervisor",
  hw_mem: "16777216000|3355443200|13421772800|2147483648|0",
  hw_overcommit: "|0",
  hw_disk: "1|214748364800|214748364800|21474836480|193273528320|vda1|ssd",
  bn_cpu: "sysbench|2184.35|17120.52|8",
  bn_mem: "sysbench|31250.12|24880.47",
  bn_r4q1: "61840|15460|148220|37055",
  bn_r4q32: "412300|103075|398120|99530",
  bn_s1q1: "1812400|1769|2104800|2055",
  bn_s1q8: "2890100|2822|2744300|2680",
}

// 三网延迟: 按地理远近给个基准, 再用固定种子加一点抖动, 每次渲染都一样
function latencyFields(): Record<string, string> {
  const base: Record<string, number> = { sh: 128, js: 134, zj: 132, fj: 141, gd: 152, bj: 150, tj: 153, sd: 146 }
  const extra: Record<string, number> = { ct: 0, cu: 6, cm: 14 }
  let seed = 7
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const out: Record<string, string> = {}
  for (const [code] of PROVINCES) {
    for (const carrier of ["ct", "cu", "cm"]) {
      const b = (base[code] ?? 160 + Math.round(rand() * 40)) + extra[carrier]!
      out[`lat_${code}_${carrier}`] = Array.from({ length: 5 }, () => (b + rand() * 6).toFixed(1)).join(",")
    }
  }
  return out
}

const NET_FIELDS = {
  nt_nat: "open|203.0.113.8",
  nt_tcp: "bbr|fq|4096 131072 67108864|4096 16384 67108864",
  nt_v6: "yes",
  ...latencyFields(),
  rt_bj_ct: "2:10.0.0.1,4:59.43.189.37,5:59.43.38.189,7:59.43.46.85,9:106.120.253.242",
  rt_sh_ct: "2:10.0.0.1,4:59.43.189.33,6:59.43.159.97,8:101.95.88.194",
  rt_gd_ct: "2:10.0.0.1,4:59.43.184.117,5:59.43.250.53,7:59.43.16.181",
  rt_bj_cu: "2:10.0.0.1,5:218.105.131.101,7:219.158.32.45,9:61.49.214.18",
  rt_sh_cu: "2:10.0.0.1,5:218.105.2.150,7:219.158.8.117",
  rt_gd_cu: "2:10.0.0.1,5:218.105.131.181,7:219.158.96.29",
  rt_bj_cm: "2:10.0.0.1,3:223.120.201.69,4:223.120.197.5,6:221.183.92.117",
  rt_sh_cm: "2:10.0.0.1,3:223.120.201.69,4:223.120.222.25,6:221.183.89.170",
  rt_gd_cm: "2:10.0.0.1,3:223.120.201.69,4:223.120.172.49,6:221.183.94.25",
  sp_1: "near|Los Angeles, CA|912.4|887.0",
  sp_2: "ct|sh|541.8|603.2",
  sp_3: "cu|bj|568.3|598.1",
  sp_4: "cm|hk|587.0|412.6",
  sp_5: "intl|hk|486.7|515.1",
  sp_6: "intl|tyo|512.2|569.4",
  sp_7: "intl|sgp|517.3|735.0",
  sp_8: "intl|lax|940.1|921.6",
  sp_9: "intl|fra|444.9|494.3",
  sp_10: "intl|lon|556.2|526.8",
  il_hk: "151.5", il_tpe: "134.3", il_sel: "134.6", il_tyo: "108.5", il_sgp: "175.6", il_syd: "160.7",
  il_lax: "0.9", il_nyc: "63.6", il_fra: "147.7", il_ams: "141.9", il_lon: "132.7", il_par: "139.8",
  dur: "168",
}

const BGP: BgpInfo = {
  asn: 64500, name: "Example Cloud LLC", rir: "ARIN", created: "2019-04-11", updated: "2025-11-02",
  address: "100 Example Street, Los Angeles, CA, United States", route: "203.0.113.0/24", range: "203.0.113.0/24", rpki: "valid",
  upstreams: [{ asn: 4809, name: "China Telecom CN2" }, { asn: 10099, name: "China Unicom Global" }, { asn: 58453, name: "China Mobile International" }, { asn: 1299, name: "Arelion" }],
  counts: { upstreams: 4, peers: 36, downstreams: 0 }, ix: 3, fac: 2,
}

const IP_FIELDS = {
  media_netflix: "yes|US", media_disney: "yes|US", media_youtube: "yes|US", media_tiktok: "yes|US", media_prime: "yes|US",
  media_reddit: "yes|US", media_chatgpt: "yes|US", media_claude: "yes|US", media_gemini: "yes|USA",
  ...Object.fromEntries(MAIL.map(([key]) => [`mail_${key}`, key === "mailru" ? "fail" : "ok"])),
}

function sampleIp(lang: Lang): FullReport & { ip: string } {
  const zh = lang === "zh"
  return {
    ok: true,
    ip: "203.0.113.8",
    ip_version: 4,
    hostname: "vps.example.net",
    geo: {
      country: "美国", country_en: "United States", region: "加利福尼亚州", city: "洛杉矶",
      latitude: 34.0522, longitude: -118.2437, accuracy_radius_km: 10, timezone: "America/Los_Angeles", local_time: "2026-09-17T09:30:00",
    },
    network: { asn: 64500, asn_name: "Example Cloud LLC", asn_type: "hosting", rir: "ARIN", rir_netname: "EXAMPLE-CLOUD", route: "203.0.113.0/24" },
    risk: { risk_score: 12, risk_label: "Clean", is_datacenter: true, dnsbl_checked: true, dnsbl_listed: [] },
    purity: {
      score: 88, grade: "A", ip_type: "IDC", native_label: "Native IP", residential_probability: 4,
      risk_factors: ["数据中心 IP"],
      positive_factors: ["无滥用举报记录", "注册地与使用地一致"],
      platform_scores: { youtube: 92, netflix: 90, disney_plus: 88, tiktok: 81, ai_subscription: 86, twitter: 84, facebook: 79, ecommerce: 74, payment: 70, gaming: 91 },
    },
    ip_environment: { score: 86, grade: "A" },
    checks: [
      { key: "vpn", label: "VPN 检测", status: "pass", verdict: "未检测到 VPN", sources: ["ipapi.is", "ipinfo.io"] },
      { key: "proxy", label: "代理检测", status: "pass", verdict: "未检测到代理", sources: ["proxycheck.io", "ipapi.is"] },
      { key: "tor", label: "Tor 暗网检测", status: "pass", verdict: "非 Tor 出口节点", sources: ["Tor Project"] },
      { key: "abuse_history", label: "滥用历史", status: "pass", verdict: "无举报记录", sources: ["abuseipdb"] },
      { key: "hosting", label: "机房检测", status: "warn", verdict: zh ? "数据中心 IP" : "", sources: ["ipinfo.io", "ipapi.is"] },
    ],
  }
}


export type SampleTab = "summary" | "hw" | "ip" | "net"

/** 四段示例报告 (带 ANSI 颜色), 首页按标签切换 */
export function sampleReports(lang: Lang): Record<SampleTab, string> {
  // 和线上报告一样按示例 IP 打码
  const R = createRenderer(lang, true, "203.0.113.8")
  const zh = lang === "zh"
  const header = renderBanner(R,
    zh ? "服务器体检 · 硬件与性能 · IP 质量 · 网络质量" : "Server check-up · Hardware · IP quality · Network",
    `v${VERSION} · ${zh ? "CleanIP 出品" : "by CleanIP"} · https://sh.cd`)
  const hw = parseHw(HW_FIELDS)!
  const net = parseNet(NET_FIELDS)!
  const local = parseIpcheckFields(IP_FIELDS)
  const ip = sampleIp(lang)
  const dns = [{ ip: "8.8.8.8", asn: 15169, org: "Google LLC", country: zh ? "美国" : "United States" }]
  return {
    summary: [
      ...header,
      ...renderSummary(R, { hw, ip, local, net, took: 247 }),
    ].join("\n"),
    hw: [...header, stageBar(R, L2(HW_TITLE, zh), 54), "", ...renderHw(R, hw)].join("\n"),
    ip: [
      ...header, stageBar(R, zh ? "IP 质量" : "IP quality", 25), "",
      ...renderIpSections(R, ip), ...renderIpDetail(R, ip), ...renderLocalSections(R, local, dns),
    ].join("\n"),
    net: [...header, stageBar(R, L2(NET_TITLE, zh), 168), "", ...renderNet(R, net, BGP)].join("\n"),
  }
}

const L2 = (pair: readonly [string, string], zh: boolean) => (zh ? pair[0] : pair[1])
