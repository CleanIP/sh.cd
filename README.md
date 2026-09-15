# ipcheck

CleanIP 出品的一键 IP 质量检测脚本。一行命令，查清这台机器出口 IP 的纯净度、风险、流媒体与 AI 解锁、邮件端口和三网延迟。

```bash
bash <(curl -Ls https://sh.cd)
```

备用入口：

```bash
bash <(curl -Ls https://cleanip.io/ipcheck)
```

## 检测内容

| 模块 | 内容 |
| --- | --- |
| IP 信息 | 归属地、运营商 / ASN、网络类型、IP 类型、原生 / 广播、住宅概率 |
| 评分 | 纯净度评分、风险评分、风险标记（VPN / 代理 / Tor / 数据中心等）、滥用举报 |
| 流媒体 / AI 解锁 | Netflix、YouTube Premium、TikTok、Prime Video、ChatGPT、Claude、Gemini，附解锁地区 |
| 邮件 | 25 端口出站，以及 Gmail / Outlook / Yahoo / iCloud / QQ / 163 的 SMTP 握手 |
| 三网延迟 | 北京、上海、广东的电信 / 联通 / 移动 TCP 延迟与丢包；`-a` 测全国 31 省 |
| DNS 出口 | 系统 DNS 实际使用的递归服务器及其归属 |

双栈机器会分别给出 IPv4 和 IPv6 两份报告。

IP 信息与评分和 [cleanip.io](https://cleanip.io) 网页查询本机的结果一致；解锁、邮件、延迟、DNS 在你的机器上实测。

## 参数

```
  -4            只检测 IPv4
  -6            只检测 IPv6
  -x PROXY      通过代理检测, 例: socks5h://user:pass@host:1080
  -i IFACE      指定网卡, 例: eth0
  -a            三网延迟测全国 31 省 (默认只测北京 / 上海 / 广东)
  -S LIST       跳过部分检测: media,mail,latency,dns (逗号分隔)
  -j            输出 JSON
  -n            不显示颜色
  -l zh|en      语言 (-E 等同 -l en)
  -h            帮助
  -v            版本
```

示例：

```bash
# 检测代理出口
bash <(curl -Ls https://sh.cd) -x socks5h://127.0.0.1:1080

# 只测 IPv4, 三网延迟测全国
bash <(curl -Ls https://sh.cd) -4 -a

# 英文报告
bash <(curl -Ls https://sh.cd) -E

# 输出 JSON 存档
bash <(curl -Ls https://sh.cd) -j > report.json
```

## 运行要求

- bash 3.2 及以上（Linux 发行版自带的都可以，macOS 自带的也可以）与 curl
- 不需要 root，不安装任何软件，不修改系统

使用代理（`-x`）或指定网卡（`-i`）时，邮件端口检测会跳过；使用代理时三网延迟也会跳过（测到的只是到代理的延迟）。

## 会发送哪些数据

脚本在本机完成检测后，把以下内容提交到 cleanip.io 生成报告：

- 各项检测结果：解锁状态与地区、邮箱握手成功与否、三网延迟数值、一次性的 DNS 检测编号
- 脚本版本、报告语言与是否带颜色

IP 地址来自请求本身（只查询发起请求的出口 IP，不能指定其他 IP）。脚本不读取、不发送主机名、系统信息或任何文件。

## 许可

[MIT](LICENSE)

---

## English

One-line IP quality check by CleanIP: purity & risk scores, streaming / AI unlocks, mail port 25, latency to China Telecom / Unicom / Mobile, and DNS resolvers.

```bash
bash <(curl -Ls https://sh.cd) -E
```

Requires only bash (3.2+) and curl; no root, installs nothing. Run with `-h` for options.
