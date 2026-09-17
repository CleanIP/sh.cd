# sh.cd

CleanIP 出品的服务器全面体检脚本：硬件与性能、IP 质量、网络质量，一行命令跑完。

```bash
bash <(curl -Ls https://sh.cd)
```

在终端里运行会进入菜单：1 一键全检、2 全部检测、3–5 单项检测、6 三城回程、7 全省回程、8 带宽测速。一键全检按 **硬件 → IP → 网络** 的顺序一口气测完，中途不需要操作，每一项测完立即显示结果，最后给出一屏总览。

## 检测内容

### 硬件与性能

| 项目 | 内容 |
| --- | --- |
| 系统 | 发行版与内核、虚拟化类型（KVM / Xen / OpenVZ / LXC / 物理机等）、运行时间与负载、进程与服务、时区、CPU / 硬盘 / 主板温度（系统能读到时） |
| 主板与设备 | 厂商型号、BIOS、芯片组、网卡、显卡 |
| CPU | 型号、核心与线程、频率、L1/L2/L3 缓存、AES-NI / AVX2 / AVX-512 / VT-x 等指令集、sysbench 单线程与多线程跑分；`-g` 加跑 Geekbench 6 |
| 内存 | 容量与占用、Swap、内存气球、sysbench 读写带宽；物理机列出插槽数、最大容量、ECC 与每条内存的容量、代数、频率、厂商型号 |
| 硬盘 | 块设备与容量、fio 4K 随机 Q1 / Q32、顺序 1M Q1 / Q8 的读写速度与 IOPS；`-d` 加测 ATTO 块大小表；物理机读 SMART：健康状态、通电时间、温度、寿命已用、累计写入、坏道重映射 |

硬盘 SMART、内存条与温度只有物理机（独立服务器）读得到，而且需要 root 或免密 sudo；虚拟机上这几项不显示。

Geekbench 6（`-g`，全部检测默认包含）从 Geekbench 官方下载约 220 MB，跑 3–10 分钟，免费版会把结果公开上传到 Geekbench 官网，报告里给出结果页链接；内存加 Swap 不足 1.5 GB、剩余空间不足 1 GB 或下载太慢时跳过。

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
| 本地策略 | NAT 类型（公网直连 / 防火墙 / 全锥形 NAT1 / 受限锥形 NAT2 / 端口限制锥形 NAT3 / 对称 NAT4）、TCP 拥塞控制与队列、收发缓冲区、IPv6 可用性 |
| BGP 与接入 | ASN 注册信息与地址、路由与 RPKI、上游 / 对等 / 下游数量、IX 与机房数、主要上游 |
| 三网延迟 | 全国 31 省电信 / 联通 / 移动的 TCP 延迟，每格 5 次采样的走势与中位数；有 IPv6 时加测三网 IPv6 延迟 |
| 三网回程线路 | 默认测北京、上海、广州三网回程，识别 CN2 GIA / CN2 GT / 163 / CTGNET / 9929 / 4837 / CUG / CMIN2 / CMI；有 IPv6 时 IPv6 回程也测；菜单 6 或全部检测（菜单 2 / `-A -d`）看逐跳位置、延迟与 ASN |
| 全省回程 | 菜单 7 或 `-R`（全部检测默认包含）：31 省 × 三网共 93 条线路，每格给出线路类型、延迟中位数与丢包；同一批目标再用 1400 字节的大包测一遍（大包回程），有 IPv6 时 IPv6 回程也是全省 |
| 教育网回程 | 随全省回程一起测：每省一所高校官网，IPv4 走 CERNET、IPv6 走 CERNET2，给出进教育网前最后经过的骨干网、延迟与丢包 |
| 带宽测速 | 就近节点、国内电信 / 联通、中国移动香港，以及香港 / 东京 / 新加坡 / 洛杉矶 / 法兰克福 / 伦敦的上传下载 |
| 分省测速 | `-p`（全部检测默认包含）：北京、天津、上海、江苏、浙江、福建、湖北、湖南、四川的三网节点 |
| 国际延迟 | 按大洲 36 个点：亚洲（香港、台北、东京、首尔、新加坡、吉隆坡、曼谷、雅加达、马尼拉、胡志明市、孟买）、中东（迪拜、利雅得、特拉维夫）、欧洲（伦敦、法兰克福、阿姆斯特丹、巴黎、马德里、华沙、赫尔辛基、莫斯科、伊斯坦布尔）、非洲（约翰内斯堡、开罗、卡萨布兰卡）、北美（洛杉矶、圣何塞、西雅图、达拉斯、纽约、多伦多）、南美（圣保罗、圣地亚哥）、大洋洲（悉尼、奥克兰）；TCP 握手延迟，不含域名解析 |

国内移动的测速节点全部不接受境外连接或对境外限速，所以移动用中国移动香港节点代替，报告里标明是香港。

分省测速的节点大多拦截境外来源（从洛杉矶只能连上北京、上海、江苏的几个），连不上的显示「不可达」；在国内的服务器上跑才测得全。

## 参数

```
  -H            硬件与性能
  -I            IP 质量
  -N            网络质量
  -A            一键全检: 硬件 → IP → 网络 (同菜单第 1 项)
  -A -d         全部检测: 一键全检 + 深度模式 + Geekbench + 分省测速 + 回程详情 (同菜单第 2 项)
  -d            深度模式: 硬盘 ATTO 块大小表、回程每一跳的延迟
  -g            Geekbench 6 跑分 (下载约 220 MB, 结果会公开上传到 Geekbench 官网)
  -p            国内分省测速 (多数节点拦截境外来源, 国内服务器上测得全)
  -R            全省回程: 31 省 × 三网 + 大包 + 教育网回程 (同菜单第 7 项)
  -y            缺少检测工具时直接安装, 不询问

  -4 / -6       只检测 IPv4 或 IPv6 (IP 质量)
  -x PROXY      通过代理检测代理的出口, 例: socks5h://user:pass@host:1080
  -i IFACE      指定网卡, 例: eth0
  -S LIST       跳过部分检测: bench,media,mail,dns,latency,route,speed
  -j            输出 JSON (不生成结果页)
  -P            不生成结果页
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

## 结果页

每次检测结束时报告底部给出一个结果页地址，例如 `https://sh.cd/results/7xKp2mQa9Z`（10 位编号）：

- 浏览器打开：按总览 / 硬件 / IP / 网络 / 回程分页查看，顶部列出硬件、IP、三网回程、带宽要点
- 一键「复制链接」「复制 Markdown」「下载 .md」，Markdown 每一项是一个代码块，贴到论坛或文档里排版不乱
- 终端里查看：`curl -s https://sh.cd/results/<编号>`；纯文本 `<编号>.txt`、Markdown `<编号>.md`
- 报告里本机网段的 IP 只显示前两段；结果页不进搜索引擎，保存 365 天
- 不想保存加 `-P`；`-j` 输出 JSON 时也不保存

编号由脚本本次运行生成的随机密钥推出，只有这次运行能写入，拿到链接的人只能查看。

## 运行要求

- bash 3.2 及以上与 curl；Linux 上检测最完整，macOS 可以跑 IP 质量和大部分网络检测
- CPU / 内存跑分与硬盘读写需要 `sysbench`、`fio`；物理机读硬盘 SMART 与内存条还需要 `smartmontools`、`dmidecode`。系统里没有时开始前询问一次，同意（或 15 秒不回答）才用系统的包管理器安装（需要 root 或免密 sudo）；不安装则跳过或用 openssl 与 dd 近似测量
- 除此之外不安装任何软件、不修改系统；硬盘测试与 Geekbench 在当前目录（不可写时换家目录等）写入临时文件，测完删除

使用代理（`-x`）时，网络质量测的是本机而不是代理，所以会跳过；邮件端口检测也会跳过。

## 会发送哪些数据

脚本在本机完成检测后，按阶段把结果提交到 sh.cd 生成报告：

- 硬件：系统与内核版本、虚拟化类型、主板 / CPU / 显卡 / 网卡型号、内存与硬盘容量、跑分结果、温度；物理机的硬盘型号与 SMART 健康、内存条规格与厂商型号（不含序列号）
- IP：解锁状态与地区、邮箱握手成功与否、一次性的 DNS 检测编号
- 网络：NAT 类型与公网 IP、TCP 参数、三网延迟（IPv4 / IPv6）、回程逐跳 IP、测速结果
- 脚本版本、报告语言与是否带颜色
- 本次运行的随机密钥（用于生成结果页，加 `-P` 时不发送）

IP 地址来自请求本身，只查询发起请求的出口 IP，不能指定其他 IP；IP 情报由 sh.cd 向 CleanIP 查询。脚本不读取、不发送主机名、文件或登录信息。

使用 `-g` 时，Geekbench 程序自己会把跑分结果公开上传到 Geekbench 官网（免费版必须上传），脚本只取结果页链接，不提交用于认领结果的私有链接。

## 数据来源与致谢

- IP 情报、评分与归属：[CleanIP](https://cleanip.io)
- BGP 邻居与 ASN 名称：[RIPEstat](https://stat.ripe.net)；IX 与机房数：[PeeringDB](https://www.peeringdb.com)
- 回程线路的骨干网段、IPv6 回程目标与网段清单、判定规则参考 [oneclickvirt/backtrace](https://github.com/oneclickvirt/backtrace)（Apache-2.0，网段清单见 `server/render/prefix/NOTICE`）
- NAT 类型：按 RFC 3489 向公共 STUN 服务器探测
- CPU 跑分：[Geekbench 6](https://www.geekbench.com)（`-g`，由 Primate Labs 提供，结果公开在 Geekbench Browser）
- 测速节点来自 Speedtest 的公开节点，国内节点与分省节点清单参考 [spiritLHLS/speedtest.net-CN-ID](https://github.com/spiritLHLS/speedtest.net-CN-ID) 与 [spiritLHLS/speedtest.cn-CN-ID](https://github.com/spiritLHLS/speedtest.cn-CN-ID)（MIT），逐个实测后选用；国际测速节点为 GSL Networks，国际延迟节点优先 GSL Networks 等机房节点，当地没有时用当地主要运营商的 Speedtest 节点
- 三网延迟节点：zstatic 公共测试节点
- 更新日志：[CHANGELOG.md](CHANGELOG.md) · https://sh.cd/changelog

## 仓库结构

```
check.sh            检测脚本, 在用户机器上运行 (bash 3.2 兼容, 只依赖 curl)
server/main.ts      服务入口 (Bun, 无第三方依赖): 下发脚本 / 浏览器说明页 / 生成报告
server/report.ts    按阶段解析脚本提交的字段, 调用 render/ 排版
server/render/      终端报告排版: 硬件、IP、网络、回程判定、总览 (prefix/ 是 IPv6 骨干网段清单)
server/upstream.ts  IP 情报、DNS 出口、BGP 数据的获取
server/landing.ts   浏览器打开 sh.cd 时的首页
server/results.ts   检测结果页 https://sh.cd/results/<编号> (网页 / Markdown / 纯文本)
server/changelog.ts 更新日志页 https://sh.cd/changelog
server/site.ts      官网各页共用的样式、顶栏与页脚
server/sample.ts    首页的示例报告 (示例数据, 用线上同一套排版生成)
assets/fonts/       官网字体 Ioskeley Mono (SIL OFL 1.1, 授权见 OFL.txt)
assets/brand/       CleanIP logo
tests/              排版与字段解析测试
deploy/             systemd 服务、环境变量样例、发布脚本
```

## 开发

```bash
bun install           # 只装类型检查用的开发依赖
bun run check         # 脚本语法 + 测试 + 类型检查
bun run dev           # 本地起服务, 默认 127.0.0.1:3410
SHCD_API=http://127.0.0.1:3410 bash check.sh -H    # 让脚本提交到本地服务
SHCD_DUMP=1 bash check.sh -N                        # 只打印本机检测字段, 不提交
```

服务需要的环境变量见 `deploy/sh.cd.env.example`；发布用 `deploy/deploy.sh`，连接参数写在不进仓库的 `deploy/.env`。

### 发版

每次发布都要更新日志：

1. 改 `check.sh` 里的 `VERSION`
2. 在 `CHANGELOG.md` 与 `CHANGELOG.en.md` 最上面各加一段 `## v版本 · 日期`，分「新增 / 修复」（英文 Added / Fixed）列出改动
3. `bun run check` 通过后运行 `deploy/deploy.sh`

测试会核对：最新一段更新日志等于脚本版本、中英文两份的版本与日期一致，漏写日志发布脚本会停下。官网 https://sh.cd/changelog 直接读这两份文件。

## 许可

[MIT](LICENSE)

---

## English

A one-line server check-up by CleanIP: hardware and benchmarks, IP quality, and network quality.

```bash
bash <(curl -Ls https://sh.cd) -E
```

Run it in a terminal to open the menu. The full check-up runs hardware → IP → network straight through, shows each section as soon as it finishes, and ends with a one-screen summary. Requires bash (3.2+) and curl; sysbench and fio (plus smartmontools and dmidecode on bare metal) are installed only if you agree (or with `-y`). `-g` adds Geekbench 6 (results are uploaded publicly to Geekbench Browser) and `-p` adds speed tests to Chinese provinces; menu option 2 / `-A -d` runs everything. Each run ends with a shareable results page (`https://sh.cd/results/<id>`) with one-click link and Markdown export; add `-P` to skip it. Run with `-h` for all options.
