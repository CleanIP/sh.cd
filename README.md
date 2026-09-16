# ipcheck

CleanIP 出品的服务器全面体检脚本：硬件与性能、IP 质量、网络质量，一行命令跑完。

```bash
bash <(curl -Ls https://sh.cd)
```

备用入口：

```bash
bash <(curl -Ls https://cleanip.io/ipcheck)
```

在终端里运行会进入菜单。一键全检按 **硬件 → IP → 网络** 的顺序一口气测完，中途不需要操作，每一项测完立即显示结果，最后给出一屏总览。

## 检测内容

### 硬件与性能

| 项目 | 内容 |
| --- | --- |
| 系统 | 发行版与内核、虚拟化类型（KVM / Xen / OpenVZ / LXC / 物理机等）、运行时间与负载、进程与服务、时区 |
| 主板与设备 | 厂商型号、BIOS、芯片组、网卡、显卡 |
| CPU | 型号、核心与线程、频率、L1/L2/L3 缓存、AES-NI / AVX2 / AVX-512 / VT-x 等指令集、sysbench 单线程与多线程跑分 |
| 内存 | 容量与占用、Swap、超开迹象（气球回收、KSM）、sysbench 读写带宽 |
| 硬盘 | 块设备与容量、fio 4K 随机 Q1 / Q32、顺序 1M Q1 / Q8 的读写速度与 IOPS；`-d` 加测 ATTO 块大小表 |

### IP 质量

| 项目 | 内容 |
| --- | --- |
| 基础信息 | 归属地、坐标与时区、运营商与 ASN、网络类型、IP 类型、原生 / 广播、住宅概率 |
| 评分 | 纯净度评分、综合评分、风险评分与风险标记、滥用举报 |
| 多源检测 | VPN、代理、Tor、滥用历史、黑名单、机房检测，列出依据的数据源；风险与利好因素 |
| 平台适用 | YouTube、Netflix、Disney+、TikTok、AI 订阅、电商、支付、游戏等平台的适用分 |
| 流媒体与 AI 解锁 | Netflix、Disney+、YouTube Premium、TikTok、Prime Video、Reddit、ChatGPT、Claude、Gemini，附解锁地区 |
| 邮件 | 25 端口出站，Gmail、Outlook、Yahoo、iCloud、QQ、163、Mail.ru、AOL、GMX、Mail.com、搜狐、新浪的握手结果 |
| DNS 出口 | 系统 DNS 实际使用的递归服务器及其归属 |

双栈机器会分别给出 IPv4 和 IPv6 的 IP 质量报告。

### 网络质量

| 项目 | 内容 |
| --- | --- |
| 本地策略 | NAT 类型（公网直连 / NAT 后）、TCP 拥塞控制与队列、收发缓冲区、IPv6 可用性 |
| BGP 与接入 | ASN 注册信息与地址、路由与 RPKI、上游 / 对等 / 下游数量、IX 与机房数、主要上游 |
| 三网延迟 | 全国 31 省电信 / 联通 / 移动的 TCP 延迟，每格 5 次采样的走势与中位数 |
| 三网回程线路 | 北京、上海、广州三网回程，识别 CN2 GIA / CN2 GT / 163 / CTGNET / 9929 / 4837 / CUG / CMIN2 / CMI；菜单 5 或 `-d` 看逐跳位置与 ASN |
| 带宽测速 | 就近节点、国内电信 / 联通、中国移动香港，以及香港 / 东京 / 新加坡 / 洛杉矶 / 法兰克福 / 伦敦的上传下载 |
| 国际延迟 | 香港、台北、首尔、东京、新加坡、悉尼、洛杉矶、纽约、法兰克福、阿姆斯特丹、伦敦、巴黎 |

国内移动的测速节点全部不接受境外连接或对境外限速，所以移动用中国移动香港节点代替，报告里标明是香港。

## 参数

```
  -H            硬件与性能
  -I            IP 质量
  -N            网络质量
  -A            一键全检 (同菜单第 1 项, 跳过菜单)
  -d            深度模式: 硬件 ATTO 块大小表、逐跳回程路由
  -y            缺少 sysbench / fio 时直接安装, 不询问

  -4 / -6       只检测 IPv4 或 IPv6 (IP 质量)
  -x PROXY      通过代理检测代理的出口, 例: socks5h://user:pass@host:1080
  -i IFACE      指定网卡, 例: eth0
  -S LIST       跳过部分检测: bench,media,mail,dns,latency,route,speed
  -j            输出 JSON
  -n            不显示颜色
  -l zh|en      语言 (-E 等同 -l en)
  -h / -v       帮助 / 版本
```

示例：

```bash
# 只看 IP 质量
bash <(curl -Ls https://sh.cd) -I

# 跳过菜单直接一键全检, 缺工具时直接安装
bash <(curl -Ls https://sh.cd) -A -y

# 检测代理出口的 IP 质量
bash <(curl -Ls https://sh.cd) -I -x socks5h://127.0.0.1:1080

# 英文报告, 输出 JSON 存档
bash <(curl -Ls https://sh.cd) -A -E -j > report.json
```

不带参数但输出被重定向（非终端）时，默认只测 IP 质量。

## 运行要求

- bash 3.2 及以上与 curl；Linux 上检测最完整，macOS 可以跑 IP 质量和大部分网络检测
- CPU / 内存跑分与硬盘读写需要 `sysbench`、`fio`。系统里没有时开始前询问一次，同意（或 15 秒不回答）才用系统的包管理器安装（需要 root 或免密 sudo）；不安装则用 openssl 与 dd 近似测量
- 除此之外不安装任何软件、不修改系统；硬盘测试在当前目录（不可写时换家目录等）写入临时文件，测完删除

使用代理（`-x`）时，网络质量测的是本机而不是代理，所以会跳过；邮件端口检测也会跳过。

## 会发送哪些数据

脚本在本机完成检测后，按阶段把结果提交到 cleanip.io 生成报告：

- 硬件：系统与内核版本、虚拟化类型、主板 / CPU / 显卡 / 网卡型号、内存与硬盘容量、跑分结果
- IP：解锁状态与地区、邮箱握手成功与否、一次性的 DNS 检测编号
- 网络：NAT 类型与公网 IP、TCP 参数、三网延迟、回程逐跳 IP、测速结果
- 脚本版本、报告语言与是否带颜色

IP 地址来自请求本身，只查询发起请求的出口 IP，不能指定其他 IP。脚本不读取、不发送主机名、文件或登录信息。

## 数据来源与致谢

- IP 情报、评分与归属：[CleanIP](https://cleanip.io)
- BGP 邻居与 ASN 名称：[RIPEstat](https://stat.ripe.net)；IX 与机房数：[PeeringDB](https://www.peeringdb.com)
- 回程线路的骨干网段与判定规则参考 [oneclickvirt/backtrace](https://github.com/oneclickvirt/backtrace)（Apache-2.0）
- 测速节点来自 Speedtest 的公开节点，国内节点清单参考 [spiritLHLS/speedtest.net-CN-ID](https://github.com/spiritLHLS/speedtest.net-CN-ID) 与 [spiritLHLS/speedtest.cn-CN-ID](https://github.com/spiritLHLS/speedtest.cn-CN-ID)（MIT），逐个实测后选用；国际节点为 GSL Networks
- 三网延迟节点：zstatic 公共测试节点

## 许可

[MIT](LICENSE)

---

## English

A one-line server check-up by CleanIP: hardware and benchmarks, IP quality, and network quality.

```bash
bash <(curl -Ls https://sh.cd) -E
```

Run it in a terminal to open the menu. The full check-up runs hardware → IP → network, shows each section as soon as it finishes, and asks before moving on. Requires bash (3.2+) and curl; sysbench and fio are installed only if you agree (or with `-y`). Run with `-h` for all options.
