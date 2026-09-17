import { describe, expect, test } from "bun:test";
import { createRenderer, width } from "../server/render/base";
import { parseHw, renderHw } from "../server/render/hw";
import { INTL_GROUPS, parseNet, PLACES, renderNet, renderRouteDetail } from "../server/render/net";
import { classifyRoute, hopAsn } from "../server/render/route";
import { renderSummary } from "../server/render/summary";

const strip = (s: string) => s.replace(/\x1b\[[\d;]*m/g, "");
const assertWidth = (lines: string[]) => {
  for (const line of lines) expect(width(strip(line))).toBeLessThanOrEqual(62);
};

// 物理机样本: 字段取自 check.sh 的 smart_parse / dimm_parse 对 smartctl、dmidecode 标准输出的解析结果
const BARE = {
  hw_os: "Debian GNU/Linux 12 (bookworm)|6.1.0-18-amd64|x86_64",
  hw_virt: "none",
  hw_temp: "cpu:58.0,nvme:41.9,board:27.8",
  sm_1: "nvme|SAMSUNG MZQL2960HCJR-00A07|960197124096|nvme|pass|18452|38|2|50567901184000||||0",
  sm_2: "ata|Samsung SSD 870 EVO 1TB|1000204886016|ssd|pass|12034|32|4|19974320987136|0|0||",
  sm_3: "ata|ST4000NM0035-1V4107|4000787030016|hdd|fail|57021|37|||824|16|16|",
  mm_array: "1649267441664|8|Multi-bit ECC",
  mm_1: "2|34359738368|DDR4|3200|2933|Samsung|M393A4K40DB3-CWE|2|DIMM",
  mm_2: "1|17179869184|DDR4|2666|2666|Micron|18ASF2G72PDZ-2G6E1|1|DIMM",
  bn_gb: "6.7.1|ok|||https://browser.geekbench.com/v6/cpu/19198390",
};

describe("物理机硬件", () => {
  const hw = parseHw(BARE)!;

  test("解析", () => {
    expect(hw.temps).toEqual([{ kind: "cpu", c: 58 }, { kind: "nvme", c: 41.9 }, { kind: "board", c: 27.8 }]);
    expect(hw.smart).toHaveLength(3);
    expect(hw.smart[0]!.written).toBe(50567901184000);
    expect(hw.smart[2]!.health).toBe("fail");
    expect(hw.dimms.map((d) => d.count)).toEqual([2, 1]);
    expect(hw.bench.gb).toEqual(["6.7.1", "ok", "", "", "https://browser.geekbench.com/v6/cpu/19198390"]);
  });

  test("拒绝不合规字段", () => {
    const bad = parseHw({ hw_os: "x|y|z", hw_temp: "cpu:999999,evil:1", sm_1: "nvme|a\x1b[2J|1|nvme|pass|1|1|1|1||||", mm_1: "x|1|DDR4|1|1|a|b|1|c", bn_gb: "6.7.1|ok|||https://evil.example/v6/cpu/1" })!;
    expect(bad.temps).toEqual([]);
    expect(bad.smart).toEqual([]);
    expect(bad.dimms).toEqual([]);
    expect(bad.bench.gb).toBeNull();
  });

  for (const lang of ["zh", "en"] as const) {
    for (const color of [false, true]) {
      test(`${lang} ${color ? "彩色" : "纯文本"} 不超过报告宽度`, () => assertWidth(renderHw(createRenderer(lang, color), hw)));
    }
  }

  test("内容", () => {
    const text = renderHw(createRenderer("zh", false), hw).join("\n");
    expect(text).toContain("温度            CPU 58°C · NVMe 42°C · 主板 28°C");
    expect(text).toContain("插槽            8 个 · 已插 3 · 最大 1.5 TB · Multi-bit ECC");
    expect(text).toContain("2 × 32.0 GB DDR4-3200 运行 2933");
    expect(text).toContain("✗ 未通过");
    expect(text).toContain("! 重映射 824 · 待映射 16 · 无法修复 16");
    expect(text).toContain("寿命已用 2%");
    expect(text).toContain("在浏览器打开结果页查看单核 / 多核分");
    expect(text).toContain("https://browser.geekbench.com/v6/cpu/19198390");
  });

  test("Geekbench 跳过原因", () => {
    const text = renderHw(createRenderer("zh", false), parseHw({ hw_virt: "kvm", bn_gb: "6.7.1|download" })!).join("\n");
    expect(text).toContain("下载太慢或失败, 已跳过");
  });

  test("没有 root 时提示", () => {
    expect(renderHw(createRenderer("zh", false), parseHw({ hw_virt: "none", hw_noroot: "1" })!).join("\n")).toContain("需要 root");
  });
});

// 2026-09-17 香港机实测 IPv6 回程 (出口与前几跳换成文档地址) + 洛杉矶实测分省测速
const NET = {
  nt_nat: "port_restricted|203.0.113.45",
  nt_v6: "yes",
  lat_bj_ct: "189,1199,1193,0,196",
  lat6_bj_ct: "201.2,198.4,0,205.1,199.9",
  lat6_sh_cm: "88.1,90.2,87.5,89.9,91.0",
  rt_bj_cm: "3:223.120.201.69,4:223.120.197.5",
  rt6_bj_cm: "1/2001:db8::1,3/2001:db8:1::15,5/2402:4f00:4000::211,6/2402:4f00:100::979,8/2409:8080:0:4:3f1:393:2:0,18/2409:8c00:8421:1303::55/203",
  rt6_bj_ct: "3/2001:418:16::10a,8/240e:0:a::ca:5d9c,9/240e:2:a::c9:27ad,16/2400:89c0:1050::1:7:21a",
  spc_bj_cu: "北京|624.4|844.6",
  spc_js_cm: "苏州|stall|686.6",
  spc_sc_ct: "fail",
};

describe("网络: NAT / IPv6 / 分省测速", () => {
  const net = parseNet(NET)!;

  test("解析", () => {
    expect(net.nat).toEqual({ kind: "port_restricted", ip: "203.0.113.45" });
    expect(net.latency6).toHaveLength(2);
    expect(net.routes6.find((r) => r.carrier === "cm")!.hops.at(-1)).toEqual({ ttl: 18, ip: "2409:8c00:8421:1303::55", ms: 203 });
    expect(net.speedCn).toEqual([
      { province: "bj", carrier: "cu", result: { city: "北京", down: 624.4, up: 844.6 } },
      { province: "js", carrier: "cm", result: { city: "苏州", down: "stall", up: 686.6 } },
      { province: "sc", carrier: "ct", result: null },
    ]);
  });

  test("IPv6 骨干识别", () => {
    expect(hopAsn("2402:4f00:100::979")).toBe("AS58453");
    expect(hopAsn("2409:8080:0:4:3f1:393:2:0")).toBe("AS9808");
    expect(hopAsn("240e:0:a::ca:5d9c")).toBe("AS4134");
    expect(hopAsn("2001:418:16::10a")).toBeNull();
    expect(classifyRoute("cm", net.routes6.find((r) => r.carrier === "cm")!.hops).code).toBe("cm_cmi");
  });

  for (const lang of ["zh", "en"] as const) {
    for (const color of [false, true]) {
      test(`${lang} ${color ? "彩色" : "纯文本"} 不超过报告宽度`, () => {
        assertWidth(renderNet(createRenderer(lang, color, "203.0.113.45"), net, null));
        assertWidth(renderRouteDetail(createRenderer(lang, color), net, {}));
        for (const kind of ["open", "firewall", "full_cone", "restricted", "port_restricted", "symmetric", "nat"]) {
          assertWidth(renderNet(createRenderer(lang, color), parseNet({ nt_nat: `${kind}|1.2.3.4` })!, null));
        }
      });
    }
  }

  test("内容", () => {
    const text = renderNet(createRenderer("zh", false, "203.0.113.45"), net, null).join("\n");
    expect(text).toContain("[端口限制锥形 NAT (NAT3)] · 出口 203.0.*.*");
    expect(text).toContain("三网延迟 · IPv6");
    expect(text).toContain("三网回程线路 · IPv6");
    expect(text).toMatch(/北京\s+163 普通\s+-\s+CMI 普通/);
    expect(text).toContain("分省测速");
    expect(text).toMatch(/北京\s+-\s+624 \/ 845/);
    expect(text).toMatch(/江苏\s+-\s+-\s+受限 \/ 687/);
    expect(text).toContain("- 无节点");
    expect(text).toMatch(/四川\s+不可达/);
    expect(renderNet(createRenderer("zh", false), parseNet({ nt_nat: "blocked|" })!, null).join("\n")).toContain("UDP 不通");
    // IPv6 逐跳详情: 地址放不进 16 列时单独一行
    const detail = renderRouteDetail(createRenderer("zh", false), net, {}).join("\n");
    expect(detail).toContain("18 2409:8c00:8421:1303::55");
    expect(detail).toContain("203 ms");
  });

  test("总览带 IPv6 平均延迟且不超宽", () => {
    const withSpeed = parseNet({ ...NET, sp_1: "near|Los Angeles, CA|912.4|887.0" })!;
    const lines = renderSummary(createRenderer("zh", false), { hw: null, ip: null, local: null, net: withSpeed, took: 60 });
    assertWidth(lines);
    expect(lines.join("\n")).toContain("IPv6 145 ms");
  });
});

describe("国际延迟: 各大洲", () => {
  // 每个点都给值, 含四位数延迟与超时, 看最宽的情况
  const fields: Record<string, string> = {};
  INTL_GROUPS.flatMap((g) => g.places).forEach((p, i) => { fields[`il_${p}`] = i === 3 ? "fail" : i === 5 ? "1324.0" : (10 + i * 11.3).toFixed(1); });
  const net = parseNet(fields)!;

  test("36 个点, 地名都有中英文", () => {
    expect(net.intl).toHaveLength(36);
    for (const x of net.intl) expect(PLACES[x.place]).toBeDefined();
    expect(INTL_GROUPS.map((g) => g.name[0])).toEqual(["亚洲", "中东", "欧洲", "非洲", "北美", "南美", "大洋洲"]);
  });

  for (const lang of ["zh", "en"] as const) {
    for (const color of [false, true]) {
      test(`${lang} ${color ? "彩色" : "纯文本"} 不超过报告宽度`, () => assertWidth(renderNet(createRenderer(lang, color), net, null)));
    }
  }

  test("按大洲分行, 每行 3 个", () => {
    const zh = renderNet(createRenderer("zh", false), net, null).join("\n");
    expect(zh).toMatch(/\n  亚洲\s+香港\s+10  台北\s+21  东京\s+33\n\s+首尔\s+×  新加坡\s+55  吉隆坡\s+1324\n/);
    expect(zh).toMatch(/\n  非洲\s+约翰内斯堡\s+\d+  开罗\s+\d+  卡萨布兰卡\s+\d+\n/);
    const en = renderNet(createRenderer("en", false), net, null).join("\n");
    expect(en).toMatch(/\n  N\. America\s+Los Angeles\s+\d+  San Jose\s+\d+  Seattle\s+\d+\n\s+Dallas\s+\d+  New York\s+\d+  Toronto\s+\d+\n/);
    expect(zh).toMatch(/\n\s+赫尔辛基\s+\d+  莫斯科\s+\d+  伊斯坦布尔\s+\d+\n/);
  });
});
