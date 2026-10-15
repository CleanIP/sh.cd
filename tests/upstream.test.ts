import { afterAll, describe, expect, test } from "bun:test"
import { fetchIp, geoLookup } from "../server/upstream"

// 模拟后端认证契约: 单 IP 和批量归属都必须携带内部服务证明。
const expectedProof = "ea1bdd3bd2f038948dd3aaaac99c1030345d9969ca6d294b3de133be9e35e2f3"
const requests: Request[] = []
const api = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  async fetch(req) {
    requests.push(req)
    if (req.headers.get("x-api-key") !== "pp_internal_test"
      || req.headers.get("origin") !== "https://cleanip.io"
      || req.headers.get("x-cleanip-internal") !== expectedProof) {
      return Response.json({ ok: false, code: "need_token" }, { status: 401 })
    }
    if (new URL(req.url).pathname.endsWith("/batch")) {
      const body = await req.json() as { ips: string[], mode: string }
      expect(body.mode).toBe("geo")
      return Response.json({ results: Object.fromEntries(body.ips.map(ip => [ip, { geo: { country: "测试" } }])) })
    }
    return Response.json({ ok: true, ip: "203.0.113.10" })
  },
})

const keys = ["CLEANIP_API", "CLEANIP_API_KEY", "CLEANIP_ORIGIN"] as const
const saved = keys.map(k => process.env[k])
afterAll(() => {
  api.stop(true)
  keys.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i] })
})

describe("CleanIP 内部服务认证", () => {
  test("IP 情报和批量归属带有效证明并保留调用者 IP", async () => {
    process.env.CLEANIP_API = api.url.toString()
    process.env.CLEANIP_API_KEY = "pp_internal_test"
    process.env.CLEANIP_ORIGIN = "https://cleanip.io"
    expect(await fetchIp("203.0.113.10")).toEqual({ r: { ok: true, ip: "203.0.113.10" }, blocked: false })
    expect(await geoLookup(["1.1.1.1"], "203.0.113.10")).toEqual({ "1.1.1.1": { geo: { country: "测试" } } })
    expect(requests.length).toBe(2)
    for (const req of requests) {
      expect(req.headers.get("x-real-ip")).toBe("203.0.113.10")
      expect(req.headers.get("user-agent")).toBe("sh.cd (+https://sh.cd)")
    }
  })
})
