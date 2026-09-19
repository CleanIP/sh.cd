import { describe, expect, test } from "bun:test";
import { parseEdu, parseHostports, parseIntl } from "../scripts/check-probes";

describe("探针节点解析 (不联网)", () => {
  test("EDU 表", () => {
    const nodes = parseEdu("bj|101.6.15.66|2402:f000:1:402:101:6:15:66\nsc|211.83.159.99|\n");
    expect(nodes).toEqual([
      { prov: "bj", v4: "101.6.15.66", v6: "2402:f000:1:402:101:6:15:66" },
      { prov: "sc", v4: "211.83.159.99", v6: "" },
    ]);
  });
  test("国际延迟表", () => {
    const nodes = parseIntl("hk:host1|host2\ntpe:host3\n");
    expect(nodes).toEqual([
      { code: "hk", hosts: ["host1", "host2"] },
      { code: "tpe", hosts: ["host3"] },
    ]);
  });
  test("host:port 表", () => {
    const nodes = parseHostports("sh|ct|上海|speedtest1.online.sh.cn:8080\nbadline\n");
    expect(nodes).toEqual([{ group: "sh", host: "speedtest1.online.sh.cn", port: 8080 }]);
  });
});
