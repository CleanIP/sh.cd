import { describe, expect, test } from "bun:test";
import { createRenderer, width } from "../server/render/base";
import { CITY_NODES } from "../server/render/cities";
import { PROVINCES } from "../server/render/local";
import { parseNet, renderNet, renderRouteDetail } from "../server/render/net";

const strip = (s: string) => s.replace(/\x1b\[[\d;]*m/g, "");
const assertWidth = (lines: string[]) => {
  for (const line of lines) expect(width(strip(line))).toBeLessThanOrEqual(62);
};

// 全省回程: 31 省 × 三网 (2026-09-18 洛杉矶实测的跳点形态, 地址取自骨干网公开网段)
const HOPS = {
  ct: "3:218.30.48.73,4:59.43.181.145,5:59.43.39.213,7:59.43.80.145,10:36.112.241.78",
  cu: "3:43.255.170.65,4:198.51.100.9,6:218.105.131.125,7:210.78.30.166,8:219.158.32.45",
  cm: "3:223.120.201.69,4:223.120.197.5,5:223.120.161.5,6:221.183.92.117",
};
const HOPS6 = {
  ct: "3/2001:418:16::10a,8/240e:0:a::ca:74d4,12/240e:c:4801:4::3",
  cu: "3/2001:db8::1,6/2408:8000:1::1,9/2408:8956:1::2",
  cm: "3/2401:f6e0:402::15,6/2402:4f00:100::979,9/2409:8080:0:4:3c3:3f3:2:1",
};
const fields: Record<string, string> = {};
PROVINCES.forEach(([p], i) => {
  for (const c of ["ct", "cu", "cm"] as const) {
    fields[`rt_${p}_${c}`] = HOPS[c];
    // 大包: 让一部分省份走不同的线路, 看两张表能不能对照出来
    fields[`rtl_${p}_${c}`] = i % 3 === 0 ? HOPS[c].replace("59.43.181.145", "202.97.94.1") : HOPS[c];
    fields[`rt6_${p}_${c}`] = HOPS6[c];
    // 延迟: 含超时与丢包, 取最宽的显示 (三位数延迟 + 100% 丢包)
    fields[`lat_${p}_${c}`] = i % 5 === 0 ? "0,0,0,0,0" : `${120 + i}.1,${130 + i}.2,0,${140 + i}.3,${150 + i}.4`;
    fields[`lat6_${p}_${c}`] = `${200 + i}.1,${210 + i}.2,${220 + i}.3,0,0`;
  }
});

describe("全省回程", () => {
  const net = parseNet(fields)!;

  test("解析 31 省 × 三网, 普通 / 大包 / IPv6 各一份", () => {
    expect(net.routes).toHaveLength(93);
    expect(net.routesLarge).toHaveLength(93);
    expect(net.routes6).toHaveLength(93);
    expect(new Set(net.routes.map((r) => r.city)).size).toBe(31);
  });

  for (const lang of ["zh", "en"] as const) {
    for (const color of [false, true]) {
      test(`${lang} ${color ? "彩色" : "纯文本"} 不超过报告宽度`, () => {
        assertWidth(renderNet(createRenderer(lang, color), net, null));
        assertWidth(renderRouteDetail(createRenderer(lang, color), net, {}));
      });
    }
  }

  test("表格: 线路简称 + 延迟 + 丢包, 大包单独一张表", () => {
    const text = strip(renderNet(createRenderer("zh", false), net, null).join("\n"));
    expect(text).toContain("全省回程线路");
    expect(text).toContain("全省回程线路 · 大包");
    expect(text).toContain("全省回程线路 · IPv6");
    expect(text).toMatch(/天津\s+CN2GIA\s+\d+\s+20%\s+9929\s+\d+\s+20%\s+CMIN2\s+\d+\s+20%/);
    expect(text).toMatch(/北京\s+CN2GIA\s+100%\s+9929\s+100%/);
    // 大包绕开了 CN2 入口的省份, 在大包表里变成 CN2GT
    expect(text).toMatch(/大包[\s\S]*?北京\s+CN2GT/);
    expect(text).toContain("内蒙古");
  });

  test("三城模式仍用原来的表", () => {
    const cityOnly = parseNet({ rt_bj_ct: HOPS.ct, rt_sh_ct: HOPS.ct, rt_gd_ct: HOPS.ct })!;
    const text = strip(renderNet(createRenderer("zh", false), cityOnly, null).join("\n"));
    expect(text).toContain("三网回程线路");
    expect(text).not.toContain("全省回程线路");
    expect(text).toContain("CN2 GIA");
  });

  test("逐跳详情覆盖全省, 含大包与 IPv6", () => {
    const detail = strip(renderRouteDetail(createRenderer("zh", false), net, {}).join("\n"));
    expect(detail).toContain("北京电信");
    expect(detail).toContain("新疆移动");
    expect(detail).toContain("IPv4 · 大包回程");
    expect(detail).toContain("IPv6");
  });
});

// 教育网: 每省一所高校, IPv4 走 CERNET, IPv6 走 CERNET2
describe("教育网回程", () => {
  const eduFields: Record<string, string> = {};
  PROVINCES.forEach(([p], i) => {
    eduFields[`rte_${p}`] = i % 4 === 0
      ? "3:223.120.201.69,5:223.120.161.5,9:101.4.117.1"   // 经 CMI 进教育网
      : "3:218.30.48.73,6:202.97.94.1,9:101.4.114.5";      // 经 163
    eduFields[`late_${p}`] = `${150 + i}.1,${152 + i}.2,0,${155 + i}.3,${151 + i}.4`;
    eduFields[`rte6_${p}`] = "3/2001:470:1:1::1,6/2001:7fa:0:1::1,9/2001:da8:200::1";
    eduFields[`late6_${p}`] = `${160 + i}.1,${162 + i}.2,${161 + i}.3,${163 + i}.4,${164 + i}.5`;
  });
  const net = parseNet(eduFields)!;

  test("解析 31 省 × CERNET / CERNET2", () => {
    expect(net.edu).toHaveLength(62);
    expect(net.edu.filter((x) => x.v6)).toHaveLength(31);
    expect(net.edu[0]!.samples).toHaveLength(5);
  });

  test("线路取进教育网前最后经过的骨干网 / 境外转接方", () => {
    const text = strip(renderNet(createRenderer("zh", false), net, null).join("\n"));
    expect(text).toContain("教育网回程");
    expect(text).toMatch(/北京\s+CMIN2\s+\d+\s+20%\s+CMI\s+\d+/);
    expect(text).toMatch(/天津\s+163\s+\d+/);
  });

  for (const lang of ["zh", "en"] as const) {
    for (const color of [false, true]) {
      test(`${lang} ${color ? "彩色" : "纯文本"} 不超过报告宽度`, () => {
        assertWidth(renderNet(createRenderer(lang, color), net, null));
        assertWidth(renderRouteDetail(createRenderer(lang, color), net, {}));
      });
    }
  }

  test("逐跳详情单独列出教育网", () => {
    const detail = strip(renderRouteDetail(createRenderer("zh", false), net, {}).join("\n"));
    expect(detail).toContain("CERNET · IPv4");
    expect(detail).toContain("CERNET2 · IPv6");
    expect(detail).toContain("北京 教育网回程");
  });
});

// 市级延迟: zstatic 的 223 个市级节点
describe("市级延迟", () => {
  const fields: Record<string, string> = {};
  CITY_NODES.forEach(([key], i) => {
    fields[`latc_${key}`] = i % 7 === 0 ? "0,0,0,0,0" : `${40 + (i % 90)}.1,${45 + (i % 90)}.2,${i % 5 === 0 ? 0 : 50 + (i % 90)}.3,${48 + (i % 90)}.4,${52 + (i % 90)}.5`;
  });
  const net = parseNet(fields)!;

  test("223 个节点都能解析, 每个都有省份与城市名", () => {
    expect(net.latencyCity).toHaveLength(CITY_NODES.length);
    expect(new Set(net.latencyCity.map((x) => x.province)).size).toBeGreaterThanOrEqual(25);
    for (const x of net.latencyCity) expect(x.zh).not.toBe("");
  });

  for (const lang of ["zh", "en"] as const) {
    for (const color of [false, true]) {
      test(`${lang} ${color ? "彩色" : "纯文本"} 不超过报告宽度`, () => assertWidth(renderNet(createRenderer(lang, color), net, null)));
    }
  }

  test("按省分组, 超时与丢包标出来", () => {
    const text = strip(renderNet(createRenderer("zh", false), net, null).join("\n"));
    expect(text).toContain("市级延迟");
    expect(text).toMatch(/\n  安徽\n/);
    expect(text).toMatch(/合肥\s+\d+\s+\d+\s+\d+/);
    expect(text).toMatch(/\n  台州\s/);
    expect(text).toMatch(/×/);
  });
});
