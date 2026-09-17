import { describe, expect, test } from "bun:test";
import { createRenderer, ipMasker, renderIpSections, width } from "../server/render/base";
import { parseNet, renderNet, renderRouteDetail } from "../server/render/net";
import { renderSummary } from "../server/render/summary";

const strip = (s: string) => s.replace(/\x1b\[[\d;]*m/g, "");

describe("分享打码", () => {
  test("同 /16 的地址与网段只留前两段, 其它原样", () => {
    const mask = ipMasker("203.0.113.227");
    expect(mask("203.0.113.227")).toBe("203.0.*.*");
    expect(mask("203.0.112.0/21")).toBe("203.0.*.*/21");
    expect(mask("59.43.189.37")).toBe("59.43.189.37");
    expect(mask("8.8.8.8")).toBe("8.8.8.8");
    expect(ipMasker("2001:db8:5013:c501::1")("2001:db8:5013:c501::1")).toBe("2001:db8:*");
    expect(ipMasker(null)("203.0.113.227")).toBe("203.0.113.227");
  });

  test("IP 段: 地址打码, 反查主机名只留域名", () => {
    const R = createRenderer("zh", false, "203.0.113.227");
    const text = (hostname: string) => renderIpSections(R, { ip: "203.0.113.227", ip_version: 4, hostname }).join("\n");
    expect(text("203-0-113-227.static.example.net")).toContain("*.static.example.net");
    expect(text("203-0-113-227.static.example.net")).not.toContain("57");
    expect(text("my-vps")).not.toContain("my-vps");
    expect(text("203.0.113.227")).not.toContain("203.0.113.227");
  });

  test("网络与总览不出现完整 IP, 总览底线带入口命令", () => {
    const R = createRenderer("zh", false, "203.0.113.227");
    const net = parseNet({ nt_nat: "open|203.0.113.227", rt_bj_ct: "2:10.0.0.1,3:203.0.113.1:1,4:59.43.189.37:150" })!;
    const bgp = { asn: 64500, route: "203.0.113.0/24", range: "203.0.112.0/21", upstreams: [] };
    const all = [
      ...renderNet(R, net, bgp),
      ...renderRouteDetail(R, net, {}),
      ...renderSummary(R, { hw: null, ip: { ip: "203.0.113.227" }, local: null, net, took: 60 }),
    ];
    const text = all.map(strip).join("\n");
    expect(text).not.toMatch(/38\.64\.\d/);
    expect(text).toContain("203.0.*.*/24");
    expect(text).toContain("59.43.189.37");
    expect(text).toContain("bash <(curl -Ls https://sh.cd)");
    for (const line of all) expect(width(strip(line))).toBeLessThanOrEqual(62);
  });
});
