import { describe, expect, test } from "bun:test";
import { createRenderer, width } from "../server/render/base";
import { parseHw, renderHw } from "../server/render/hw";
import { parseNet, renderNet, renderRouteDetail } from "../server/render/net";
import { parseIpcheckFields } from "../server/render/local";
import { classifyRoute } from "../server/render/route";
import { renderSummary } from "../server/render/summary";

// 一台 KVM 云服务器的实测字段 (IP、网段、ASN 与地址已换成文档示例值)
const HW = {
  bn_cpu: "sysbench|1004.00|15450.15|16",
  bn_mem: "sysbench|20594.91|17973.72",
  bn_r4q1: "8346|2086|42428|10607",
  bn_r4q32: "124031|31007|124534|31133",
  bn_s1q1: "437906|427|572572|559",
  bn_s1q8: "572347|558|571281|557",
  bn_atto_4k: "90000|22500|110000|27500",
  bn_atto_64m: "9800000|149|8200000|126",
  dur: "54",
  hw_board: "OpenStack Foundation|OpenStack Nova|SeaBIOS|1.16.1-1.el9",
  hw_cache: "512 KiB|512 KiB|64 MiB|256 MiB",
  hw_chipset: "Intel Corporation 440FX - 82441FX PMC [Natoma];Intel Corporation 82371SB PIIX3 ISA [Natoma/Triton II]",
  hw_cpu: "Intel Xeon Processor (Skylake, IBRS)|16|16|16|2299|0",
  hw_disk: "2|128849018880|20922114048|5716328448|14304587776|vda1|hdd",
  hw_flags: "aes,avx,avx2,avx512f,bmi1,bmi2,hypervisor",
  hw_gpu: "Red Hat, Inc. Virtio 1.0 GPU",
  hw_mem: "33659387904|12662206464|20997181440|4294963200|20152320",
  hw_nic: "Red Hat, Inc. Virtio network device",
  hw_os: "Debian GNU/Linux 13 (trixie)|6.12.74+deb13+1-amd64|x86_64",
  hw_overcommit: "balloon|1",
  hw_procs: "309|1|24|141",
  hw_tz: "Asia/Shanghai|+0800|C.UTF-8",
  hw_uptime: "320441|0.16 0.22 0.26",
  hw_virt: "kvm",
};

const NET = {
  nt_nat: "open|203.0.113.10",
  nt_tcp: "bbr|fq|4096 87380 33554432|4096 65536 33554432",
  nt_v6: "no",
  lat_bj_ct: "153.8,150.1,154.8,157.6,150.1",
  lat_bj_cu: "159.0,162.5,152.2,162.5,169.0",
  lat_bj_cm: "157.4,154.8,0,156.9,155.8",
  lat_nm_cu: "0,0,0,0,0",
  lat_sh_ct: "129.2,133.1,133.8,124.6,133.8",
  rt_bj_ct: "2:10.110.193.1:1,3:218.30.48.73:1,4:59.43.189.37,5:59.43.38.189,7:59.43.46.85,9:106.120.253.242",
  rt_bj_cu: "2:10.110.193.1,4:198.51.100.1,6:218.105.131.101,8:219.158.32.45,10:61.49.214.18",
  rt_bj_cm: "3:223.120.201.69,4:223.120.197.5,5:223.120.161.5,6:221.183.92.117",
  rt_sh_ct: "4:59.43.159.97,7:101.95.88.194,9:202.96.209.133",
  rt_gd_cm: "none",
  sp_1: "near|Georgetown, TX|493.6|500.0",
  sp_2: "ct|sh|520.9|581.9",
  sp_3: "cu|sh|526.1|533.9",
  sp_4: "cm|hk|570.6|stall",
  sp_5: "intl|hk|486.7|515.1",
  sp_6: "intl|lon|fail|fail",
  il_hk: "151.5", il_tpe: "134.3", il_sel: "134.6", il_tyo: "108.5", il_sgp: "241.6", il_syd: "180.7",
  il_lax: "2.9", il_nyc: "63.6", il_fra: "167.7", il_ams: "155.9", il_lon: "129.7", il_par: "fail",
  dur: "162",
};

const BGP = {
  asn: 64500, name: "Example Networks", rir: "ARIN", created: "2024-01-09", updated: "2024-01-09",
  address: "100 Example Street, Los Angeles, CA, 90017, United States", route: "203.0.113.0/24", range: "203.0.113.0/24", rpki: "valid",
  upstreams: [{ asn: 174, name: "Cogent Communications" }, { asn: 3257, name: "GTT" }, { asn: 6939, name: "Hurricane Electric" }],
  counts: { upstreams: 3, peers: 12, downstreams: 0 }, ix: 5, fac: 3,
};

const strip = (s: string) => s.replace(/\x1b\[[\d;]*m/g, "");

function assertWidth(lines: string[]) {
  for (const line of lines) expect(width(strip(line))).toBeLessThanOrEqual(62);
}

describe("硬件与性能", () => {
  const hw = parseHw(HW)!;

  test("解析", () => {
    expect(hw.virt).toBe("kvm");
    expect(hw.cpu?.[0]).toBe("Intel Xeon Processor (Skylake, IBRS)");
    expect(hw.chipset).toHaveLength(2);
    expect(hw.bench.atto.map(([s]) => s)).toEqual(["4k", "64m"]);
  });

  test("拒绝控制字符", () => {
    const bad = parseHw({ hw_os: "Debian\x1b[2J|6.1|x86_64", hw_virt: "kvm; rm", hw_chipset: "a|b" })!;
    expect(bad.os).toBeNull();
    expect(bad.virt).toBeNull();
    expect(bad.chipset).toEqual([]);
  });

  for (const lang of ["zh", "en"] as const) {
    for (const color of [false, true]) {
      test(`${lang} ${color ? "彩色" : "纯文本"} 不超过报告宽度`, () => assertWidth(renderHw(createRenderer(lang, color), hw)));
    }
  }

  test("ARM 只列 AES / SHA, 不把 x86 指令集标成缺失", () => {
    const mac = parseHw({ hw_os: "macOS 27.0|27.0.0|arm64", hw_flags: "aes,sha2", hw_virt: "none", hw_mem: "68719476736||||" })!;
    const text = renderHw(createRenderer("zh", false), mac).join("\n");
    expect(text).toContain("✓ AES  ✓ SHA");
    expect(text).not.toContain("AVX");
    expect(text).toMatch(/内存\s+64\.0 GB\n/);
  });

  test("内容", () => {
    const text = renderHw(createRenderer("zh", false), hw).join("\n");
    expect(text).toContain("[KVM 虚拟机]");
    expect(text).toContain("单线程 1004 · 多线程 15450");
    expect(text).toMatch(/内存气球\s+已启用/);
    // 虚拟机不显示磁盘类型 (virtio 的机械盘标志不可信)
    expect(text).not.toContain("HDD");
    expect(text).toMatch(/4K 随机 Q1\s+8\.2 MB\/s\s+2\.1K\s+41\.4 MB\/s/);
    expect(text).toContain("ATTO");
  });
});

describe("网络质量", () => {
  const net = parseNet(NET)!;

  test("解析", () => {
    expect(net.nat).toEqual({ kind: "open", ip: "203.0.113.10" });
    expect(net.latency.find((x) => x.province === "bj" && x.carrier === "cm")!.samples[2]).toBeNull();
    expect(net.routes.find((x) => x.city === "bj" && x.carrier === "ct")!.hops[0]).toEqual({ ttl: 2, ip: "10.110.193.1", ms: 1 });
    expect(net.speed).toHaveLength(6);
    expect(net.intl.find((x) => x.place === "par")!.ms).toBeNull();
  });

  test("拒绝不合规字段", () => {
    const bad = parseNet({ lat_bj_ct: "150;rm", rt_bj_ct: "3:59.43.1.1:x", sp_1: "ct|zz|1|1", il_hk: "\x1b" })!;
    expect(bad.latency).toEqual([]);
    expect(bad.routes).toEqual([]);
    expect(bad.speed).toEqual([]);
    expect(bad.intl).toEqual([]);
  });

  for (const lang of ["zh", "en"] as const) {
    for (const color of [false, true]) {
      test(`${lang} ${color ? "彩色" : "纯文本"} 不超过报告宽度`, () => {
        assertWidth(renderNet(createRenderer(lang, color), net, BGP));
        assertWidth(renderRouteDetail(createRenderer(lang, color), net, { "218.30.48.73": { asn: 4134, org: "China Telecom", place: "美国 洛杉矶" } }));
      });
    }
  }

  test("内容", () => {
    const text = renderNet(createRenderer("zh", false), net, BGP).join("\n");
    expect(text).toContain("[公网直连]");
    expect(text).toContain("拥塞控制 bbr · 队列 fq");
    expect(text).toContain("上游 3 · 对等 12 · IX 5 · 机房 3");
    expect(text).toMatch(/北京\s+\S{5}\s+154/);
    expect(text).toContain("×××××  超时");
    // 只见一跳 CN2、没有 163: 记为 CN2, 不记混合
    expect(text).toMatch(/上海\s+CN2\s/);
    expect(text).toContain("上海电信");
    expect(text).toContain("香港移动");
    expect(text).toMatch(/香港移动\s+571 Mbps\s+节点受限/);
    expect(text).not.toContain("暂无境外可用");
    expect(text).toMatch(/洛杉矶\s+3 ms/);
  });
});

test("总览", () => {
  const fields = { ...HW, ...NET, media_netflix: "yes|US", media_claude: "no|HK", mail_gmail: "ok", mail_qq: "fail" };
  const lines = renderSummary(createRenderer("zh", false), {
    hw: parseHw(fields),
    ip: { ok: true, ip: "203.0.113.10", purity: { score: 79, grade: "B", ip_type: "IDC", native_label: "Native IP" }, risk: { risk_score: 21, dnsbl_checked: true, dnsbl_listed: ["all.s5h.net"] } },
    local: parseIpcheckFields(fields),
    net: parseNet(fields),
    took: 337,
  });
  assertWidth(lines);
  const text = lines.join("\n");
  expect(text).toContain("用时 5 分 37 秒");
  expect(text).toContain("KVM · 16 核 · 31.3 GB · 120 GB");
  expect(text).toContain("解锁 1/2");
  expect(text).toContain("电信 CN2 GIA");
  expect(classifyRoute("ct", [{ ttl: 4, ip: "59.43.1.1" }]).code).toBe("ct_cn2");
});

test("缓存按实例换算, 已用比例与 df 一致", async () => {
  const { cachePerInstance } = await import("../server/render/hw");
  expect(cachePerInstance("512 KiB (16 instances)")).toBe("32 KiB");
  expect(cachePerInstance("256 MiB (16 instances)")).toBe("16 MiB");
  expect(cachePerInstance("1.5 MiB (2 instances)")).toBe("768 KiB");
  expect(cachePerInstance("32K")).toBe("32K");
  // 已用 5.95G / (5.95G + 13.6G) = 30.5% → 31%, 与 df 显示一致
  const hw = parseHw({ hw_disk: "2|128849018880|20922114048|6097678336|13922837504|vda1|hdd", hw_virt: "kvm" })!;
  expect(renderHw(createRenderer("zh", false), hw).join("\n")).toContain("已用 31%");
});

test("延迟: SYN 重传的样本算丢包, 不拉高中位数", async () => {
  const { rttSamples } = await import("../server/render/util");
  expect(rttSamples([189, 1199, 1193, null, 196])).toEqual([189, null, null, null, 196]);
  const net = parseNet({ lat_bj_ct: "189,1199,1193,0,196" })!;
  expect(renderNet(createRenderer("zh", false), net, null).join("\n")).toMatch(/北京\s+\S{5}\s+193/);
});

test("总览带宽: 就近节点单向受限时改取境外节点", () => {
  const net = parseNet({
    sp_1: "near|Hsinchu|45.4|1150.0", sp_2: "ct|js|230.0|stall", sp_3: "intl|hk|1400.0|4120.0", sp_4: "intl|sgp|3290.0|3670.0",
  })!;
  const text = renderSummary(createRenderer("zh", false), { hw: null, ip: null, local: null, net, took: 1 }).join("\n");
  expect(text).toContain("带宽 3.29 Gbps / 3.67 Gbps");
  expect(renderNet(createRenderer("zh", false), net, null).join("\n")).toContain("灰色数值");
});
