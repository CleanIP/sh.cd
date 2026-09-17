import { describe, expect, test } from "bun:test";
import { landingPage } from "../server/landing";
import { changelogPage } from "../server/changelog";
import { HITS_SLOT, withHits } from "../server/site";
import { width } from "../server/render/base";
import { sampleReports } from "../server/sample";

const strip = (s: string) => s.replace(/\x1b\[[\d;]*m/g, "");

describe("首页", () => {
  for (const lang of ["zh", "en"] as const) {
    test(`${lang} 页面完整`, () => {
      const html = landingPage(lang);
      expect(html).toContain("bash &lt;(curl -Ls https://sh.cd)");
      expect(html.match(/role="tabpanel"/g)).toHaveLength(4);
      expect(html).toContain("/fonts/IoskeleyMono-Regular.woff2");
      expect(html).not.toContain("undefined");
      expect(html).not.toMatch(/\x1b/);
    });

    test(`${lang} 示例报告不超过报告宽度`, () => {
      for (const report of Object.values(sampleReports(lang))) {
        for (const line of strip(report).split("\n")) expect(width(line)).toBeLessThanOrEqual(62);
      }
    });
  }

  test("示例数据不含真实服务器地址", () => {
    const all = [landingPage("zh"), landingPage("en")].join("\n");
    const ips = [...all.matchAll(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g)].map((m) => m[0]);
    // 只允许文档示例段、内网、公共 DNS 与国内骨干网回程跳
    const allowed = /^(203\.0\.113\.|10\.|127\.|8\.8\.8\.8$|59\.43\.|218\.105\.|219\.158\.|223\.120\.|221\.183\.|106\.120\.|101\.95\.|61\.49\.)/;
    expect(ips.filter((ip) => !allowed.test(ip))).toEqual([]);
  });
});

describe("页脚的脚本运行次数", () => {
  test("页面里留占位, 响应前填当前次数", () => {
    expect(landingPage("zh")).toContain(HITS_SLOT);
    const zh = withHits(landingPage("zh"), "zh", { today: 1234, total: 56789 });
    expect(zh).toContain("脚本检测 今日 1,234 次 · 累计 56,789 次");
    expect(zh).not.toContain(HITS_SLOT);
    expect(withHits(landingPage("en"), "en", { today: 1, total: 2 })).toContain("Script runs: 1 today · 2 total");
  });

  test("更新日志页也有", () => {
    expect(withHits(changelogPage("zh"), "zh", { today: 3, total: 4 })).toContain("脚本检测 今日 3 次 · 累计 4 次");
  });
});
