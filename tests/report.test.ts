import { describe, expect, test } from "bun:test";
import { createRenderer, width } from "../server/render/base";
import { parseIpcheckFields, renderLocalSections } from "../server/render/local";
import { classifyRoute } from "../server/render/route";

const SAMPLE = {
  media_netflix: "yes|US",
  media_youtube: "no|CN",
  media_tiktok: "no|",
  media_prime: "fail",
  media_chatgpt: "web|HK",
  media_claude: "yes|US",
  media_gemini: "yes|USA",
  mail_gmail: "ok",
  mail_outlook: "fail",
  mail_qq: "ok",
  lat_bj_ct: "155.1|0",
  lat_bj_cu: "fail",
  lat_bj_cm: "1163.7|2",
  lat_gd_ct: "88.0|0",
  // 一台洛杉矶云服务器的实测回程 (机房出口的两跳换成了文档示例地址)
  rt_bj_ct: "2:10.110.193.1,3:218.30.48.73,4:59.43.189.37,5:59.43.38.189,7:59.43.46.85,9:106.120.253.242",
  rt_bj_cu: "2:10.110.193.1,3:198.51.100.2,4:198.51.100.1,5:210.14.165.41,6:218.105.131.101,7:210.78.30.158",
  rt_bj_cm: "3:223.120.201.69,4:223.120.197.5,5:223.120.161.5,6:221.183.92.117",
  rt_gd_ct: "3:218.30.48.73,4:59.43.184.117,5:59.43.250.53,6:59.43.16.181,7:202.97.43.81,8:202.105.158.33",
  rt_gd_cu: "none",
  sp_1: "near|Irving, TX|511.9|506.5",
  sp_2: "cu|bj|1543.3|fail",
  sp_3: "cu|sh|fail|fail",
  dns: "187efa4f7b638767390e68709b8f4816",
};

describe("ipcheck 本机检测字段", () => {
  test("按白名单解析", () => {
    const local = parseIpcheckFields(SAMPLE);
    expect(local.media.netflix).toEqual({ status: "yes", region: "US" });
    expect(local.media.tiktok).toEqual({ status: "no", region: "" });
    expect(local.media.prime).toEqual({ status: "fail", region: "" });
    expect(local.mail).toEqual({ gmail: true, outlook: false, qq: true });
    expect(local.latency).toContainEqual({ province: "bj", carrier: "cu", ms: null, lost: 4 });
    expect(local.latency).toContainEqual({ province: "bj", carrier: "cm", ms: 1163.7, lost: 2 });
    expect(local.dnsUuid).toBe(SAMPLE.dns);
  });

  // 字段会原样进终端报告, 不能让人塞控制符或任意文本
  test("不认识的键和不合规的值一律丢掉", () => {
    const local = parseIpcheckFields({
      media_netflix: "yes|US\x1b[2J",
      media_youtube: "unlocked",
      media_evil: "yes|US",
      mail_gmail: "ok\n",
      lat_bj_ct: "12|9",
      lat_xx_ct: "12.0|0",
      dns: "../../etc/passwd",
    });
    expect(local.media).toEqual({});
    expect(local.mail).toBeNull();
    expect(local.latency).toEqual([]);
    expect(local.dnsUuid).toBeNull();
  });

  test("没测的段不出", () => {
    const R = createRenderer("zh", false);
    expect(renderLocalSections(R, parseIpcheckFields({}), null)).toEqual([]);
  });
});

describe("ipcheck 报告排版", () => {
  const dns = [
    { ip: "1.1.1.1", asn: 13335, org: "Cloudflare, Inc.", country: "美国" },
    { ip: "2400:3200:baba::1", asn: 37963, org: "Alibaba", country: "中国" },
  ];

  for (const lang of ["zh", "en"] as const) {
    test(`${lang} 纯文本不超过报告宽度`, () => {
      const lines = renderLocalSections(createRenderer(lang, false), parseIpcheckFields(SAMPLE), dns);
      const text = lines.join("\n");
      expect(text).not.toContain("\x1b");
      for (const line of lines) expect(width(line)).toBeLessThanOrEqual(62);
    });
  }

  test("状态文案与地区", () => {
    const text = renderLocalSections(createRenderer("zh", false), parseIpcheckFields(SAMPLE), dns).join("\n");
    expect(text).toContain("[解锁]  US");
    expect(text).toContain("[仅网页版]  HK");
    // Gemini 的三位国家码转成两位
    expect(text).toMatch(/Gemini\s+\[可用\]  US/);
    // 检测失败不显示地区
    expect(text).toMatch(/Prime Video\s+\[检测失败\]\n/);
    expect(text).toContain("[开放]");
    expect(text).toContain("超时");
    expect(text).toContain("1164 ms 丢2");
    expect(text).toContain("AS13335 Cloudflare, Inc. · 美国");
  });

  test("同一归属的 DNS 节点合并成一行", () => {
    const google = ["172.253.1.30", "74.125.181.150", "172.253.9.218"].map((ip) => ({ ip, asn: 15169, org: "Google LLC", country: "美国" }));
    const text = renderLocalSections(createRenderer("zh", false), parseIpcheckFields({}), google).join("\n");
    expect(text).toContain("172.253.1.30    AS15169 Google LLC · 美国  等 3 个节点");
    expect(text).not.toContain("74.125.181.150");
  });

  test("回程线路与测速", () => {
    const text = renderLocalSections(createRenderer("zh", false), parseIpcheckFields(SAMPLE), null).join("\n");
    expect(text).toMatch(/北京\s+CN2 GIA\s+9929\s+CMIN2/);
    // 3 跳 CN2 之后只有一跳 163 交付 = GIA; 广州联通一跳都没回应
    expect(text).toMatch(/广州\s+CN2 GIA\s+无回应/);
    expect(text).toContain("就近 Irving, TX");
    expect(text).toMatch(/北京联通\s+1\.54 Gbps\s+连接失败/);
    expect(text).toMatch(/上海联通\s+连接失败/);
    expect(text).toMatch(/电信 · 移动\s+暂无境外可用的测速节点/);
  });

  test("回程与测速字段校验", () => {
    const local = parseIpcheckFields({
      rt_bj_ct: "3:59.43.1.1;rm -rf",
      rt_xx_ct: "3:59.43.1.1",
      sp_1: "near|\x1b[31mevil|1|1",
      sp_2: "vpn|x|1|1",
      sp_3: "cu|北京联通|1|1",
    });
    expect(local.routes).toEqual([]);
    expect(local.speed).toBeNull();
  });

  test("邮件全部不通时只给结论", () => {
    const text = renderLocalSections(createRenderer("zh", false), parseIpcheckFields({ mail_gmail: "fail", mail_qq: "fail" }), null).join("\n");
    expect(text).toContain("[不通]");
    expect(text).not.toContain("邮箱握手");
  });
});

describe("三网回程线路判定", () => {
  const hops = (...ips: string[]) => ips.map((ip, i) => ({ ttl: i + 3, ip }));

  test("电信", () => {
    expect(classifyRoute("ct", hops("59.43.1.1", "59.43.2.2")).code).toBe("ct_cn2_gia");
    expect(classifyRoute("ct", hops("59.43.1.1", "202.97.1.1")).code).toBe("ct_cn2_mixed");
    expect(classifyRoute("ct", hops("202.97.1.1", "59.43.1.1", "59.43.2.2")).code).toBe("ct_cn2_gt");
    expect(classifyRoute("ct", hops("59.43.1.1", "59.43.2.2", "202.97.1.1", "202.97.2.2")).code).toBe("ct_cn2_mixed");
    expect(classifyRoute("ct", hops("202.97.1.1", "202.97.2.2")).code).toBe("ct_163");
    // 只见一跳 163 = 只到了目的网, 不下结论
    expect(classifyRoute("ct", hops("202.97.1.1")).code).toBe("unknown");
    expect(classifyRoute("ct", hops("69.194.1.1")).code).toBe("ct_ctgnet");
  });

  test("联通", () => {
    expect(classifyRoute("cu", hops("218.105.1.1", "219.158.1.1")).code).toBe("cu_9929");
    expect(classifyRoute("cu", hops("219.158.1.1", "210.51.1.1")).code).toBe("cu_9929_mixed");
    expect(classifyRoute("cu", hops("219.158.1.1", "219.158.2.2")).code).toBe("cu_4837");
    // 前缀按完整字节段匹配, 61.140 不是 CUG
    expect(classifyRoute("cu", hops("61.140.1.1")).code).toBe("unknown");
    expect(classifyRoute("cu", hops("61.14.1.1")).code).toBe("cu_cug");
  });

  test("移动", () => {
    expect(classifyRoute("cm", hops("223.120.201.69", "221.183.1.1")).code).toBe("cm_cmin2");
    expect(classifyRoute("cm", hops("223.120.10.1", "223.119.8.1")).code).toBe("cm_cmin2_mixed");
    expect(classifyRoute("cm", hops("223.120.10.1")).code).toBe("cm_cmi");
    expect(classifyRoute("cm", hops("221.183.1.1")).code).toBe("cm_cmnet");
  });
});
