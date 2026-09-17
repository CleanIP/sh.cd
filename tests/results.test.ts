import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 结果与计数都写进临时目录 (模块在调用时读 DATA_DIR)
const DATA = mkdtempSync(join(tmpdir(), "shcd-results-"));
process.env.DATA_DIR = DATA;
afterAll(() => rmSync(DATA, { recursive: true, force: true }));

const { width } = await import("../server/render/base");
const { handleReport } = await import("../server/report");
const R = await import("../server/results");

const KEY = "0123456789abcdef0123456789abcdef";
const strip = (s: string) => s.replace(/\x1b\[[\d;]*m/g, "");

// 一台 KVM 云服务器的硬件字段 (与 stages.test.ts 同源, 已脱敏)
const HW = {
  hw_os: "Debian GNU/Linux 13 (trixie)|6.12.74+deb13+1-amd64|x86_64",
  hw_virt: "kvm",
  hw_cpu: "Intel Xeon Processor (Skylake, IBRS)|16|16|1|2299|0",
  hw_mem: "33607983104|12347629568|21260353536|4294963200|395313152",
  hw_disk: "2|128849018880|20937965568|6458015744|14479949824|vda1|",
  bn_cpu: "sysbench|984.00|13657.00|16",
  dur: "161",
};
const post = (fields: Record<string, string>, caller = "203.0.113.45") =>
  handleReport(Object.fromEntries(Object.entries({ v: "1.4.0", lang: "zh", color: "1", seq: "1", banner: "1", ...fields })), caller);

describe("结果编号", () => {
  test("由密钥确定, 10 位 base58", () => {
    const id = R.resultId(KEY);
    expect(id).toMatch(R.RESULT_ID);
    expect(R.resultId(KEY)).toBe(id);
    expect(R.resultId("f".repeat(32))).not.toBe(id);
  });
  test("只接受 32 位小写十六进制密钥", () => {
    expect(R.isRunKey(KEY)).toBe(true);
    expect(R.isRunKey(KEY.toUpperCase())).toBe(false);
    expect(R.isRunKey(KEY.slice(1))).toBe(false);
    expect(R.isRunKey(undefined)).toBe(false);
  });
  test("非法编号直接判不存在", () => {
    expect(R.loadResult("../../etc/x")).toBeNull();
    expect(R.loadResult("0OIl000000")).toBeNull();
  });
});

describe("保存与展示", () => {
  test("单项检测: 终端页脚给出链接, 结果页存彩色与纯文本两份", async () => {
    const reply = await post({ stage: "hw", stages: "1", run: KEY, ...HW });
    expect(reply.status).toBe(200);
    const id = R.resultId(KEY);
    const linkLine = strip(reply.body).split("\n").find((l) => l.includes("/results/"))!;
    expect(linkLine).toBe(`  查看与分享  https://sh.cd/results/${id}`);
    expect(width(linkLine)).toBeLessThanOrEqual(62);

    const r = R.loadResult(id)!;
    expect(r.sections.map((s) => s.key)).toEqual(["hw"]);
    expect(r.sections[0]!.ansi).toContain("\x1b[");
    expect(r.sections[0]!.plain).not.toContain("\x1b[");
    expect(r.sections[0]!.plain).toContain("[KVM 虚拟机]");
    expect(r.ip).toBe("203.0.*.*");
    expect(r.facts.hw).toEqual({ value: "KVM · 16 核 · 31.3 GB · 120 GB", sub: "Intel Xeon Processor (Skylake, IBRS)" });
  });

  test("同一阶段再次提交替换而不是追加; 不带密钥或 JSON 输出不保存", async () => {
    await post({ stage: "hw", stages: "1", run: KEY, ...HW, dur: "170" });
    const r = R.loadResult(R.resultId(KEY))!;
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0]!.dur).toBe(170);

    const other = "a".repeat(32);
    await post({ stage: "hw", stages: "1", run: other, format: "json", ...HW });
    expect(R.loadResult(R.resultId(other))).toBeNull();
    const plain = await post({ stage: "hw", stages: "1", ...HW });
    expect(plain.body).not.toContain("/results/");
  });

  test("Markdown: 元信息 + 每段一个代码块, 不含颜色控制符与阶段标题条", () => {
    const md = R.resultMarkdown(R.loadResult(R.resultId(KEY))!);
    expect(md.startsWith("# sh.cd 服务器体检报告\n")).toBe(true);
    expect(md).toContain(`- 在线查看: https://sh.cd/results/${R.resultId(KEY)}`);
    expect(md).toContain("## 硬件与性能 · 用时 2 分 50 秒\n\n```text\n  系统\n");
    expect(md).not.toContain("\x1b");
    expect(md).not.toContain("██  硬件与性能");
    expect(md.match(/```/g)!.length % 2).toBe(0);
  });

  test("网页: 转义报告内容, 内嵌数据不会提前结束 script 标签", () => {
    const r = R.loadResult(R.resultId(KEY))!;
    const evil = { ...r, facts: { hw: { value: "<img src=x onerror=alert(1)>", sub: "</script><script>alert(1)</script>" } },
      sections: [{ ...r.sections[0]!, ansi: "<b>x</b>", plain: "</script><script>alert(1)</script>" }] };
    const html = R.resultPage(evil, "zh");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>x</b>");
    const data = html.slice(html.indexOf('id="result-data">'), html.indexOf("</script>", html.indexOf('id="result-data">')));
    expect(data).not.toContain("</script><script>alert");
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  test("纯文本: 按运行顺序, 不带颜色时没有控制符", () => {
    const text = R.resultText(R.loadResult(R.resultId(KEY))!, false);
    expect(text).not.toContain("\x1b");
    expect(text).toContain(`查看与分享  https://sh.cd/results/${R.resultId(KEY)}`);
    for (const line of text.split("\n")) expect(width(line)).toBeLessThanOrEqual(62);
  });
});

describe("要点", () => {
  test("双栈时 IPv6 阶段不覆盖 IPv4 的归属", () => {
    const key = "b".repeat(32);
    const meta = { lang: "zh" as const, version: "1.4.0", planned: 3, ip: "203.0.*.*" };
    const sec = (k: "ip4" | "ip6") => ({ key: k, dur: 10, ansi: "", plain: "" });
    R.saveSection(key, meta, sec("ip4"), { ip: { value: "美国 洛杉矶", sub: "AS64500" } });
    R.saveSection(key, { ...meta, ip: "2001:db8:*" }, sec("ip6"), { ip: { value: "日本 东京", sub: "AS64501" } });
    const r = R.loadResult(R.resultId(key))!;
    expect(r.facts.ip!.value).toBe("美国 洛杉矶");
    expect(r.ip).toBe("203.0.*.*");
  });

  test("过期的结果读不到, 清理时删除", () => {
    const key = "c".repeat(32);
    R.saveSection(key, { lang: "en", version: "1.4.0", planned: 1, ip: "" }, { key: "hw", dur: 1, ansi: "", plain: "" }, {});
    expect(R.loadResult(R.resultId(key))).not.toBeNull();
    expect(R.sweepResults(Date.now() + (R.TTL_DAYS + 1) * 86_400_000)).toBeGreaterThanOrEqual(1);
    expect(R.loadResult(R.resultId(key))).toBeNull();
  });
});
