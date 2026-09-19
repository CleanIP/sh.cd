import { describe, expect, test } from "bun:test";
import { rateLimitKey } from "../server/limit";

describe("限流键", () => {
  test("IPv4 原样", () => {
    expect(rateLimitKey("1.2.3.4")).toBe("1.2.3.4");
  });
  test("IPv6 前导零归一, 不同写法同 key", () => {
    expect(rateLimitKey("2001:0db8:0000:0001::1")).toBe(rateLimitKey("2001:db8:0:1::1"));
    expect(rateLimitKey("2001:DB8:0:1::1")).toBe("2001:db8:0:1::/64");
  });
  test("IPv6 按 /64 聚合", () => {
    expect(rateLimitKey("2001:db8:abcd:0012::1")).toBe("2001:db8:abcd:12::/64");
  });
  test("非法输入不聚合", () => {
    expect(rateLimitKey("not-an-ip")).toBe("not-an-ip");
    expect(rateLimitKey("")).toBe("unknown");
  });
});
