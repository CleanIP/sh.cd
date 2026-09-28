import { expect, test } from "bun:test";
import { isScriptClient } from "../server/limit";

test("只有检测脚本能用报告接口", () => {
  expect(isScriptClient("sh.cd/1.3.3 (+https://sh.cd)")).toBe(true);
  expect(isScriptClient("sh.cd/10.0.0 (+https://sh.cd)")).toBe(true);
  // 2026-09-27 起直接调 /report 查 VPN 出口的程序
  expect(isScriptClient("vpn-probe/cleanip")).toBe(false);
  expect(isScriptClient("vpn-probe-reputation-test/1.0")).toBe(false);
  expect(isScriptClient("curl/8.14.1")).toBe(false);
  expect(isScriptClient("sh.cd/1.3.3")).toBe(false);
  expect(isScriptClient("")).toBe(false);
  expect(isScriptClient(null)).toBe(false);
});
