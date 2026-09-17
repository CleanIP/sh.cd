import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BANNER_LOGO, createRenderer, renderBanner, width } from "../server/render/base";

test("首页示例的字符画与脚本逐字一致", () => {
  const script = readFileSync(resolve(import.meta.dir, "../check.sh"), "utf8");
  const m = /^SHCD_LOGO='([^']+)'$/m.exec(script);
  expect(m).not.toBeNull();
  expect(m![1]!.split("\n")).toEqual(BANNER_LOGO);
});

test("字符画不超过报告宽度, 着色不改变文字", () => {
  const plain = renderBanner(createRenderer("zh", false), "副标题", "标语");
  const colored = renderBanner(createRenderer("zh", true), "副标题", "标语");
  expect(colored.map((l) => l.replace(/\x1b\[[\d;]*m/g, ""))).toEqual(plain);
  for (const line of plain) expect(width(line)).toBeLessThanOrEqual(62);
});

test("变量后面紧跟非 ASCII 字符时必须加花括号", () => {
  // macOS 自带 bash 3.2 在 UTF-8 区域设置下把 "$C_G█" 解析成变量 "C_G\xe2", 开头字符画与进度提示会变成乱码
  const script = readFileSync(resolve(import.meta.dir, "../check.sh"), "utf8");
  const bad = script.split("\n").map((line, i) => [i + 1, line] as const)
    .filter(([, line]) => !line.trimStart().startsWith("#") && /\$[A-Za-z_]\w*[^\x00-\x7F]/.test(line));
  expect(bad).toEqual([]);
});
