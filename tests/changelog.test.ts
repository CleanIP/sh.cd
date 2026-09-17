import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { changelogPage, parseChangelog } from "../server/changelog";
import { VERSION } from "../server/version";

const read = (f: string) => parseChangelog(readFileSync(resolve(import.meta.dir, "..", f), "utf8"));

describe("更新日志", () => {
  const zh = read("CHANGELOG.md");
  const en = read("CHANGELOG.en.md");

  test("最新版本就是脚本当前版本 (发版必须写更新日志)", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(zh.releases[0]!.version).toBe(VERSION);
  });

  test("中英文两份的版本与日期一一对应", () => {
    expect(en.releases.map((r) => [r.version, r.date])).toEqual(zh.releases.map((r) => [r.version, r.date]));
    zh.releases.forEach((r, i) => expect(en.releases[i]!.groups.map((g) => g.kind)).toEqual(r.groups.map((g) => g.kind)));
  });

  test("每个版本都有条目, 日期从新到旧", () => {
    for (const log of [zh, en]) {
      for (const r of log.releases) {
        expect(r.groups.length).toBeGreaterThan(0);
        for (const g of r.groups) expect(g.items.length).toBeGreaterThan(0);
      }
      const dates = log.releases.map((r) => r.date);
      expect([...dates].sort().reverse()).toEqual(dates);
    }
  });

  for (const lang of ["zh", "en"] as const) {
    test(`${lang} 页面`, () => {
      const html = changelogPage(lang);
      expect(html).toContain(`id="v${VERSION}"`);
      expect(html).not.toContain("undefined");
      expect(html).toContain("<code>");
    });
  }
});
