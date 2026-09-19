import { describe, expect, test } from "bun:test";
import { createRenderer } from "../server/render/base";
import { parseHw, renderHw } from "../server/render/hw";
import { parseIpcheckFields, renderLocalSections } from "../server/render/local";

describe("硬件新字段", () => {
  test("steal 与时钟偏移解析并展示", () => {
    const hw = parseHw({ hw_cpu: "Test CPU|4|8|1|3000|12", hw_csteal: "15|3", hw_ntp: "-2500|chrony" })!;
    expect(hw.csteal).toEqual(["15", "3"]);
    expect(hw.ntp).toEqual(["-2500", "chrony"]);
    const text = renderHw(createRenderer("zh", false), hw).join("\n");
    expect(text).toContain("宿主偷用 15%");
    expect(text).toContain("-2500 ms");
  });
  test("无新字段时老报告不变", () => {
    const hw = parseHw({ hw_cpu: "Test CPU|4|8|1|3000|12" })!;
    const text = renderHw(createRenderer("zh", false), hw).join("\n");
    expect(text).not.toContain("宿主偷用");
    expect(text).not.toContain("时钟偏移");
  });
});

describe("fio p99", () => {
  const cpu = { hw_cpu: "Test CPU|4|8|1|3000|12" };
  test("6 段新格式解析并展示尾延迟", () => {
    const hw = parseHw({ ...cpu, bn_r4q1: "100|25000|180|90|22000|420" })!;
    const text = renderHw(createRenderer("zh", false), hw).join("\n");
    expect(text).toContain("p99");
    expect(text).toContain("180us");
    expect(text).toContain("420us");
  });
  test("4 段老格式照常排版, 不出 p99", () => {
    const hw = parseHw({ ...cpu, bn_r4q1: "100|25000|90|22000" })!;
    const text = renderHw(createRenderer("zh", false), hw).join("\n");
    expect(text).toContain("4K");
    expect(text).not.toContain("p99");
  });
  test("毫秒级 p99 换算单位", () => {
    const hw = parseHw({ ...cpu, bn_r4q1: "100|25000|18340|90|22000|1200" })!;
    const text = renderHw(createRenderer("zh", false), hw).join("\n");
    expect(text).toContain("18.3ms");
    expect(text).toContain("1.20ms");
  });
});

describe("邮件 587", () => {  test("25 不通但 587 通时提示走提交端口", () => {
    const local = parseIpcheckFields({ mail_gmail: "fail", mail_gmail_587: "ok" });
    expect(local.mail587?.gmail).toBe("ok");
    const text = renderLocalSections(createRenderer("zh", false), local, null).join("\n");
    expect(text).toContain("587");
  });
  test("25 通时不采集 587", () => {
    const local = parseIpcheckFields({ mail_gmail: "ok" });
    expect(local.mail587).toBeNull();
  });
});
