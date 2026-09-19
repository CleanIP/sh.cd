import { describe, expect, test } from "bun:test";
import { createRenderer } from "../server/render/base";
import { parseNet, renderNet, renderRouteDetail, type NetData } from "../server/render/net";

const emptyNet = (over: Partial<NetData> = {}): NetData => ({
  nat: null, tcp: null, v6: null, dnsMs: null, tlsMs: null, latency: [], latency6: [], latencyCity: [],
  routes: [], routesLarge: [], edu: [], routes6: [], speed: [], speedCn: [], intl: [],
  deep: false, dur: null, ...over,
});

describe("DNS 解析耗时", () => {
  test("解析并展示", () => {
    const net = parseNet({ nt_tcp: "bbr|fq|a|b", nt_dns: "230" })!;
    expect(net.dnsMs).toBe(230);
    const text = renderNet(createRenderer("zh", false), net, null).join("\n");
    expect(text).toContain("DNS 解析");
    expect(text).toContain("230 ms");
  });
  test("非法值丢弃, 超 1 秒提示会拖高延迟", () => {
    expect(parseNet({ nt_dns: "abc" })?.dnsMs).toBeNull();
    const net = emptyNet({ tcp: ["bbr", "fq", "", ""], dnsMs: 1500 });
    const text = renderNet(createRenderer("zh", false), net, null).join("\n");
    expect(text).toContain("拖高延迟");
  });
  test("TLS 握手耗时解析并展示", () => {
    const net = parseNet({ nt_tls: "180" })!;
    expect(net.tlsMs).toBe(180);
    const text = renderNet(createRenderer("zh", false), net, null).join("\n");
    expect(text).toContain("TLS");
  });
  test("IPv6 不可用标红, 可用标绿", () => {
    const no = emptyNet({ v6: false });
    const noColor = renderNet(createRenderer("zh", true), no, null).join("\n");
    expect(noColor).toContain("不可用");
    expect(noColor).toContain("41m");
    const yes = emptyNet({ v6: true });
    const yesColor = renderNet(createRenderer("zh", true), yes, null).join("\n");
    expect(yesColor).toContain("可用");
    expect(yesColor).not.toContain("41m");
  });
});

describe("延迟染色 (100/200/300)", () => {
  const lat = (vals: number[]) => parseNet({ lat_bj_ct: vals.join(",") })!;
  test("中位数按档染色", () => {
    const green = renderNet(createRenderer("zh", true), lat([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]), null).join("\n");
    expect(green).toContain("38;2;53;169;82m");
    expect(green).not.toContain("31m");
    expect(green).not.toContain("33m");
    const yellow = renderNet(createRenderer("zh", true), lat([210, 211, 212, 213, 214, 215, 216, 217, 218, 219]), null).join("\n");
    expect(yellow).toContain("33m");
    expect(yellow).not.toContain("31m");
    const red = renderNet(createRenderer("zh", true), lat([310, 311, 312, 313, 314, 315, 316, 317, 318, 319]), null).join("\n");
    expect(red).toContain("31m");
  });
  test("单条坏采样在走势里标红", () => {
    const text = renderNet(createRenderer("zh", true), lat([10, 11, 12, 13, 14, 15, 16, 17, 18, 350]), null).join("\n");
    expect(text).toContain("31m");
  });
  test("国际按跨境刻度", () => {
    const red = renderNet(createRenderer("zh", true), parseNet({ il_hk: "450|0" })!, null).join("\n");
    expect(red).toContain("31m");
    const mid = renderNet(createRenderer("zh", true), parseNet({ il_hk: "150|0" })!, null).join("\n");
    expect(mid).not.toContain("31m");
    expect(mid).not.toContain("33m");
  });
});

describe("ECMP 标记", () => {  const hops = (list: Array<[number, string]>) => list.map(([ttl, ip]) => ({ ttl, ip }));
  test("同 TTL 多 IP 时提示多路径", () => {
    const net = emptyNet({ routes: [{ city: "bj", carrier: "ct", hops: hops([[5, "1.1.1.1"], [5, "2.2.2.2"]]) }] });
    const text = renderRouteDetail(createRenderer("zh", false), net, {}).join("\n");
    expect(text).toContain("ECMP");
  });
  test("干净路径不提示", () => {
    const net = emptyNet({ routes: [{ city: "bj", carrier: "ct", hops: hops([[5, "1.1.1.1"], [6, "2.2.2.2"]]) }] });
    const text = renderRouteDetail(createRenderer("zh", false), net, {}).join("\n");
    expect(text).not.toContain("ECMP");
  });
});

describe("丢包采样 (10 次)", () => {
  const ten = "150.1,152.2,151.3,153.4,154.5,156.6,157.7,158.8,159.9,0";
  test("三网延迟收 10 采样, 1 超时标黄", () => {
    const net = parseNet({ lat_bj_ct: ten })!;
    expect(net.latency[0]!.samples).toHaveLength(10);
    const text = renderNet(createRenderer("zh", true), net, null).join("\n");
    expect(text).toContain("33m");
  });
  test("国际点 中位数|丢包数, 老格式按未知收", () => {
    expect(parseNet({ il_hk: "151.5|1" })!.intl).toEqual([{ place: "hk", ms: 151.5, lost: 1 }]);
    expect(parseNet({ il_hk: "151.5|0" })!.intl).toEqual([{ place: "hk", ms: 151.5, lost: 0 }]);
    expect(parseNet({ il_hk: "151.5" })!.intl).toEqual([{ place: "hk", ms: 151.5, lost: null }]);
    const warn = renderNet(createRenderer("zh", true), parseNet({ il_hk: "151.5|1" })!, null).join("\n");
    expect(warn).toContain("33m");
    const clean = renderNet(createRenderer("zh", true), parseNet({ il_hk: "40.5|0" })!, null).join("\n");
    expect(clean).not.toContain("33m");
  });
  test("教育网延迟收 10 采样", () => {
    const net = parseNet({
      rte_bj: "3:218.30.48.73,6:202.97.94.1,9:101.4.114.5",
      late_bj: "150.1,152.2,151.3,153.4,154.5,156.6,157.7,158.8,159.9,155.0",
    })!;
    expect(net.edu[0]!.samples).toHaveLength(10);
  });
});
