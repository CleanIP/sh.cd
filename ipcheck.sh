#!/usr/bin/env bash
#
# CleanIP ipcheck — 一键 IP 质量检测
#
#   bash <(curl -Ls https://sh.cd)
#   bash <(curl -Ls https://cleanip.io/ipcheck)        备用入口
#
# IP 情报与评分来自 CleanIP (与 cleanip.io 网页查询本机的结果一致);
# 流媒体 / AI 解锁、邮件端口、三网延迟与回程线路、DNS 出口、带宽测速只能在本机测, 测完连同评分一起生成报告。
#
# 不需要 root, 不安装任何软件, 不修改系统, 只依赖 bash 与 curl。
# 兼容 bash 3.2 (macOS 自带版本): 不用关联数组 / mapfile / ${var,,}。
#
# 源码: https://github.com/CleanIP/ipcheck    许可: MIT

VERSION="0.2.0"
API="${IPCHECK_API:-https://cleanip.io}"

UA_BROWSER='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
UA_SELF="ipcheck/$VERSION (+https://sh.cd)"

# ── 参数 ────────────────────────────────────────────────────────────────

LANG_OPT=zh
ONLY_FAMILY=""
PROXY=""
IFACE=""
JSON=0
OPT_NOCOLOR=0
ALL_PROVINCES=0
SPEED=0
SKIP=","

t() { if [ "$LANG_OPT" = en ]; then printf '%s' "$2"; else printf '%s' "$1"; fi; }

usage() {
	if [ "$LANG_OPT" = en ]; then
		cat <<EOF
CleanIP ipcheck v$VERSION — IP quality check

Usage: bash <(curl -Ls https://sh.cd) [options]

  -4            IPv4 only
  -6            IPv6 only
  -x PROXY      Check through a proxy, e.g. socks5h://user:pass@host:1080
  -i IFACE      Use a network interface, e.g. eth0
  -a            Latency to all 31 provinces (default: Beijing / Shanghai / Guangdong)
  -s            Bandwidth test (Linux only, about 1-2 minutes, uses a lot of traffic)
  -S LIST       Skip sections: media,mail,latency,route,dns
  -j            Output JSON
  -n            No colors
  -l zh|en      Language (-E = English)
  -h            Help
  -v            Version

Source: https://github.com/CleanIP/ipcheck
EOF
	else
		cat <<EOF
CleanIP ipcheck v$VERSION — IP 质量检测

用法: bash <(curl -Ls https://sh.cd) [参数]

  -4            只检测 IPv4
  -6            只检测 IPv6
  -x PROXY      通过代理检测, 例: socks5h://user:pass@host:1080
  -i IFACE      指定网卡, 例: eth0
  -a            三网延迟测全国 31 省 (默认只测北京 / 上海 / 广东)
  -s            带宽测速 (仅 Linux, 约 1–2 分钟, 流量消耗较大)
  -S LIST       跳过部分检测: media,mail,latency,route,dns (逗号分隔)
  -j            输出 JSON
  -n            不显示颜色
  -l zh|en      语言 (-E 等同 -l en)
  -h            帮助
  -v            版本

源码: https://github.com/CleanIP/ipcheck
EOF
	fi
}

# 先扫一遍语言参数, 让 -h 的帮助和参数报错也用对语言
for a in "$@"; do case "$a" in -E | -len* | -lEN*) LANG_OPT=en ;; esac; done

while getopts ":46x:i:asS:jnl:Ehv" opt; do
	case "$opt" in
	4) ONLY_FAMILY=4 ;;
	6) ONLY_FAMILY=6 ;;
	x) PROXY="$OPTARG" ;;
	i) IFACE="$OPTARG" ;;
	a) ALL_PROVINCES=1 ;;
	s) SPEED=1 ;;
	S) SKIP=",$OPTARG," ;;
	j) JSON=1 ;;
	n) OPT_NOCOLOR=1 ;;
	l) case "$OPTARG" in en* | EN*) LANG_OPT=en ;; *) LANG_OPT=zh ;; esac ;;
	E) LANG_OPT=en ;;
	h) usage; exit 0 ;;
	v) echo "ipcheck $VERSION"; exit 0 ;;
	:) printf '%s\n' "$(t "参数 -$OPTARG 缺少值" "Option -$OPTARG requires a value")" >&2; exit 2 ;;
	*) usage >&2; exit 2 ;;
	esac
done

skipped() { case "$SKIP" in *",$1,"*) return 0 ;; esac; return 1; }

if ! command -v curl >/dev/null 2>&1; then
	printf '%s\n' "$(t "需要 curl, 请先安装: apt install -y curl 或 yum install -y curl" "curl is required: apt install -y curl or yum install -y curl")" >&2
	exit 1
fi

# 颜色由服务端按这个开关输出; 重定向到文件或管道时自动关闭。遵循 NO_COLOR 约定。
COLOR=1
if [ "$OPT_NOCOLOR" = 1 ] || [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then COLOR=0; fi

TMP=$(mktemp -d 2>/dev/null || mktemp -d -t ipcheck)
cleanup() {
	jobs -p 2>/dev/null | xargs kill -9 2>/dev/null
	rm -rf "$TMP"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# ── 进度提示 (只写 stderr, 且只在终端里显示) ────────────────────────────────

progress() {
	[ -t 2 ] || return 0
	printf '\r\033[K  \033[38;2;53;169;82m██\033[0m %s' "$1" >&2
}
progress_done() {
	[ -t 2 ] && printf '\r\033[K' >&2
	return 0
}

# ── 网络参数 ────────────────────────────────────────────────────────────
# NET 按当前检测的出口重建; 所有出站请求 (含最后提交报告) 都走同一组参数,
# 服务端看到的来源 IP 才是正在检测的那个出口。

NET=()
set_net() {
	NET=()
	[ -n "$1" ] && NET+=("-$1")
	[ -n "$IFACE" ] && NET+=(--interface "$IFACE")
	[ -n "$PROXY" ] && NET+=(-x "$PROXY")
}
ccurl() { curl "${NET[@]}" "$@"; }
web() { ccurl -sL -m 10 -A "$UA_BROWSER" -H 'Accept-Language: en-US,en;q=0.9' "$@"; }

# 结果写成 "键=值" 一行一个, 提交报告时逐行作为表单字段
put() { printf '%s=%s\n' "$2" "$3" >>"$1/fields"; }

# ── 流媒体 / AI 解锁 ─────────────────────────────────────────────────────
# 值: yes | no | originals (Netflix 仅自制剧) | web (ChatGPT 仅网页版) | fail (请求失败或无法判断)
# 地区附在竖线后, 例: yes|US
# 判定依据 2026-09-15 在洛杉矶 (全部可用)、英国与香港 (ChatGPT / Claude / Gemini / TikTok 不可用) 实测过。

probe_netflix() {
	local d="$1" c1 c2 region ok=0 reach=0
	# 两部非自制剧: 能打开 = 完整解锁; 页面在但片子看不了 = 仅自制剧
	c1=$(web -o "$d/nf1" -w '%{http_code}' https://www.netflix.com/title/81280792) || c1=000
	c2=$(web -o "$d/nf2" -w '%{http_code}' https://www.netflix.com/title/70143836) || c2=000
	region=$(cat "$d/nf1" "$d/nf2" 2>/dev/null | grep -oE '"id":"[A-Z]{2}","countryName"' | head -n1 | cut -d'"' -f4)
	if [ "$c1" = 200 ] && ! grep -q 'Oh no' "$d/nf1"; then ok=1; fi
	if [ "$c2" = 200 ] && ! grep -q 'Oh no' "$d/nf2"; then ok=1; fi
	case "$c1$c2" in *200* | *404*) reach=1 ;; esac
	if [ $ok = 1 ]; then echo "yes|$region"
	elif [ $reach = 1 ]; then echo "originals|$region"
	elif [ "$c1" = 403 ] || [ "$c2" = 403 ]; then echo "no|$region"
	else echo "fail"; fi
}

probe_youtube() {
	local d="$1" region
	web -o "$d/yt" -b 'CONSENT=YES+cb' https://www.youtube.com/premium >/dev/null 2>&1
	region=$(grep -oE '"contentRegion":"[A-Z]{2}"' "$d/yt" 2>/dev/null | head -n1 | cut -d'"' -f4)
	if grep -q 'www.google.cn' "$d/yt" 2>/dev/null; then echo "no|CN"
	elif grep -q 'Premium is not available in your country' "$d/yt" 2>/dev/null; then echo "no|$region"
	elif grep -q 'ad-free' "$d/yt" 2>/dev/null; then echo "yes|$region"
	else echo "fail"; fi
}

probe_tiktok() {
	local d="$1" out region
	out=$(web -o "$d/tt" -w '%{http_code} %{url_effective}' https://www.tiktok.com/explore) || out=000
	region=$(grep -oE '"region":"[A-Z]+"' "$d/tt" 2>/dev/null | head -n1 | cut -d'"' -f4)
	case "$out" in
	000*) echo "fail" ;;
	# 不可用地区会被跳到 /xx/about 介绍页, region 也不再是两位国家码 (香港实测为 ALISG)
	*/about*) echo "no|" ;;
	*) if [ ${#region} = 2 ]; then echo "yes|$region"; else echo "fail"; fi ;;
	esac
}

probe_prime() {
	local d="$1" region
	web -o "$d/pv" https://www.primevideo.com >/dev/null 2>&1
	region=$(grep -oE '"currentTerritory":"[A-Z]{2}"' "$d/pv" 2>/dev/null | head -n1 | cut -d'"' -f4)
	if grep -q '"isServiceRestricted":true' "$d/pv" 2>/dev/null; then echo "no|$region"
	elif [ -n "$region" ]; then echo "yes|$region"
	else echo "fail"; fi
}

cf_loc() { ccurl -s -m 8 "https://$1/cdn-cgi/trace" 2>/dev/null | sed -n 's/^loc=\([A-Z][A-Z]\)$/\1/p'; }

probe_chatgpt() {
	local d="$1" code region
	code=$(ccurl -s -m 10 -A "$UA_BROWSER" -o "$d/oa1" -w '%{http_code}' \
		-H 'authorization: Bearer null' -H 'origin: https://platform.openai.com' \
		https://api.openai.com/compliance/cookie_requirements) || code=000
	ccurl -s -m 10 -A "$UA_BROWSER" -o "$d/oa2" https://ios.chat.openai.com/ >/dev/null 2>&1
	region=$(cf_loc chatgpt.com)
	if grep -q 'unsupported_country' "$d/oa1" "$d/oa2" 2>/dev/null; then echo "no|$region"
	elif grep -q 'VPN' "$d/oa2" 2>/dev/null; then echo "web|$region"
	elif [ "$code" = 200 ]; then echo "yes|$region"
	else echo "fail"; fi
}

probe_claude() {
	local out="" region i
	region=$(cf_loc claude.ai)
	# 不支持的地区 302 到 claude.com/app-unavailable-in-region。
	# claude.ai 会随机给非浏览器请求弹 Cloudflare 验证页 (403 "Just a moment", 洛杉矶实测 3 次 2 次), 多试几次
	for i in 1 2 3; do
		out=$(ccurl -s -m 10 -A "$UA_BROWSER" -o /dev/null -w '%{http_code} %{redirect_url}' https://claude.ai/) || out=000
		case "$out" in 403*) sleep 1 ;; *) break ;; esac
	done
	case "$out" in
	*unavailable-in-region*) echo "no|$region" ;;
	2* | 3*) echo "yes|$region" ;;
	403*)
		# 一直被验证页挡着看不到跳转, 退回按出口地区判断 (只列确定不支持的地区)
		case "$region" in
		CN | HK | MO | RU | BY | IR | KP | SY | CU) echo "no|$region" ;;
		"") echo "fail" ;;
		*) echo "yes|$region" ;;
		esac
		;;
	*) echo "fail" ;;
	esac
}

probe_gemini() {
	local d="$1" code region
	code=$(web -o "$d/gm" -w '%{http_code}' https://gemini.google.com/) || code=000
	# 页面里带出口的三位国家码 (USA / GBR / HKG)。按国家判断, 只列确定不支持的地区。
	# 不用页面里的功能开关判断: 常被引用的 45631641 在英国 (可用) 也是 false, 实为美国功能灰度,
	# 2026-09-15 用美 / 英 / 港三地页面对比确认; 其余随地区变化的开关也都是灰度, 随时会变。
	region=$(grep -oE ',2,1,200,"[A-Z]{3}"' "$d/gm" 2>/dev/null | head -n1 | cut -d'"' -f2)
	if [ "$code" != 200 ] || [ -z "$region" ]; then echo "fail"; return; fi
	case "$region" in
	CHN | HKG | RUS | BLR | IRN | PRK | SYR | CUB) echo "no|$region" ;;
	*) echo "yes|$region" ;;
	esac
}

run_media() {
	local d="$1" name
	for name in netflix youtube tiktok prime chatgpt claude gemini; do
		mkdir -p "$d/m_$name"
		(put "$d/m_$name" "media_$name" "$("probe_$name" "$d/m_$name")") &
	done
	wait
}

# ── 邮件: 各大邮箱 MX 的 25 端口握手 ─────────────────────────────────────
# 用 bash 的 /dev/tcp 读 SMTP 欢迎语 (220 开头); 自己计时杀进程, 因为 macOS 没有 timeout 命令。
# /dev/tcp 走系统默认出口, 无法绑定网卡也不能走代理, 所以 -x / -i 模式下跳过。

smtp_banner() {
	local host="$1" out="$2" i=0 pid
	(exec 3<>"/dev/tcp/$host/25" && IFS= read -r line <&3 && printf '%s' "$line" >"$out") 2>/dev/null &
	pid=$!
	while kill -0 "$pid" 2>/dev/null && [ $i -lt 60 ]; do
		sleep 0.1
		i=$((i + 1))
	done
	# 必须 -9: 子 shell 继承了顶层的 TERM trap, 而 bash 要等阻塞中的 connect 返回才执行 trap ——
	# 25 端口被静默丢包时 connect 会挂两分钟以上 (2026-09-15 香港机实测整个脚本卡死)
	kill -9 "$pid" 2>/dev/null
	wait "$pid" 2>/dev/null
	case "$(cat "$out" 2>/dev/null)" in 220*) return 0 ;; esac
	return 1
}

MAIL_HOSTS="gmail:gmail-smtp-in.l.google.com outlook:outlook-com.olc.protection.outlook.com yahoo:mta5.am0.yahoodns.net icloud:mx01.mail.icloud.com qq:mx1.qq.com 163:163mx01.mxmail.netease.com"

run_mail() {
	local d="$1" item
	mkdir -p "$d/mail"
	for item in $MAIL_HOSTS; do
		(
			if smtp_banner "${item#*:}" "$d/mail/banner_${item%%:*}"; then
				put "$d/mail" "mail_${item%%:*}" ok
			else
				put "$d/mail" "mail_${item%%:*}" fail
			fi
		) &
	done
	wait
}

# ── 三网延迟: TCP 握手, 每节点 4 次取中位数 ─────────────────────────────────
# 节点与 CleanIP 后台三网监测相同: <省>-<ct|cu|cm>-dualstack.ip.zstaticcdn.com。
# 只量 curl 的 time_connect (TCP 建连耗时), 不依赖 ping —— 很多机器禁 ICMP 或没有 ping 权限。
# 优先测 80 端口: 北京联通节点的 443 会丢掉第一个 SYN, 每次都多出 1 秒重传
# (2026-09-15 洛杉矶实测 443 ≈ 1180ms, 80 ≈ 156ms); 80 不通再退回 443。

PROVINCES_MAIN="bj sh gd"
PROVINCES_ALL="bj tj he sx nm ln jl hl sh js zj ah fj jx sd ha hb hn gd gx hi cq sc gz yn xz sn gs qh nx xj"

connect_time() {
	ccurl -s -o /dev/null -m 3 --connect-timeout 2 -w '%{time_connect}' "http://$1:$2/" 2>/dev/null
}
positive() { awk -v v="$1" 'BEGIN { exit !(v + 0 > 0) }'; }

lat_node() {
	local host="$1" i s ok="" lost=0 port=80
	positive "$(connect_time "$host" 80)" || port=443
	for i in 1 2 3 4; do
		s=$(connect_time "$host" "$port")
		if positive "$s"; then ok="$ok $s"; else lost=$((lost + 1)); fi
	done
	if [ -z "$ok" ]; then
		echo "fail"
		return
	fi
	# 中位数 (偶数个取中间两个的均值), 换算成毫秒保留 1 位; 竖线后是 4 次里失败的次数
	printf '%s\n' $ok | sort -n | awk -v lost="$lost" \
		'{ a[NR] = $1 } END { m = (NR % 2) ? a[(NR + 1) / 2] : (a[NR / 2] + a[NR / 2 + 1]) / 2; printf "%.1f|%d\n", m * 1000, lost }'
}

run_latency() {
	local d="$1" provs="$PROVINCES_MAIN" p c n=0
	[ "$ALL_PROVINCES" = 1 ] && provs="$PROVINCES_ALL"
	mkdir -p "$d/lat"
	for p in $provs; do
		for c in ct cu cm; do
			(put "$d/lat" "lat_${p}_$c" "$(lat_node "$p-$c-dualstack.ip.zstaticcdn.com")") &
			n=$((n + 1))
			# 全国模式 93 个节点: 分批并发, 同时发起太多连接会互相挤占, 测出来偏高
			[ $((n % 18)) = 0 ] && wait
		done
	done
	wait
}

# ── 三网回程线路: 逐跳记录去往国内三网的路由, 线路类型 (CN2 GIA / 9929 / CMIN2 …) 由报告按骨干网段判定 ──
# 不依赖 traceroute: 用系统自带的 ping 按 TTL 1–30 并行各发一个包, 收集「TTL 超时」回包的来源 IP。
# Linux 的 ping 不需要 root (2026-09-15 洛杉矶机 root 与 nobody 实测结果一致), 每个目标约 1–2 秒。
# 只测 IPv4: 骨干网段判定规则按 IPv4 整理。

ROUTE_TARGETS="bj_ct:219.141.140.10 bj_cu:202.106.195.68 bj_cm:221.179.155.161 sh_ct:202.96.209.133 sh_cu:210.22.97.1 sh_cm:211.136.112.200 gd_ct:58.60.188.222 gd_cu:210.21.196.6 gd_cm:120.196.165.24"

hop_ip() {
	local ttl="$1" target="$2"
	if [ "$(uname -s)" = Darwin ]; then
		# macOS: -m 是 TTL, -W 单位毫秒; -t 在 macOS 上是总超时
		ping -n -c 1 -W 1000 -m "$ttl" "$target" 2>/dev/null
	else
		ping -n -c 1 -W 1 -t "$ttl" ${IFACE:+-I "$IFACE"} "$target" 2>/dev/null
	fi | grep -oE '[Ff]rom ([0-9]{1,3}\.){3}[0-9]{1,3}' | head -n1 | cut -d' ' -f2
}

route_trace() {
	local target="$1" out="$2" ttl k
	# 每个 TTL 发 2 个包: 只发 1 个时常有中间跳不回应, 少了 CN2 段的跳数会把 GIA 误判成混合
	for ttl in $(seq 1 30); do
		for k in 1 2; do
			(ip=$(hop_ip "$ttl" "$target") && [ -n "$ip" ] && echo "$ttl:$ip" >>"$out") &
		done
	done
	wait
}

run_route() {
	local d="$1" item key n=0 hops
	command -v ping >/dev/null 2>&1 || return 0
	mkdir -p "$d/route"
	for item in $ROUTE_TARGETS; do
		key="${item%%:*}"
		(
			route_trace "${item#*:}" "$d/route/$key.hops"
			# 按跳数排序, 到达目标后后面的 TTL 都是目标自己回的, 只留第一次
			hops=$(sort -t: -k1,1n "$d/route/$key.hops" 2>/dev/null | awk -F: '!seen[$2]++' | paste -sd, -)
			put "$d/route" "rt_$key" "${hops:-none}"
		) &
		n=$((n + 1))
		# 3 个目标一批, 每批约 180 个 ping 同时在飞
		[ $((n % 3)) = 0 ] && wait
	done
	wait
}

# ── 带宽测速 (-s): Speedtest 节点的 TCP 协议, 4 条并发取第 2–8 秒的平均速度 ──────────────
# 不下载任何测速客户端: 用 /dev/tcp 发 Speedtest 服务器的 DOWNLOAD / UPLOAD 指令, dd 计量。
# dd 在后台时 SIGINT 会被忽略, 所以用两次 SIGUSR1 各取一次累计字节数, 相减去掉 TCP 慢启动的前 2 秒。
# 依赖 GNU / busybox dd 的 SIGUSR1 统计输出, 只在 Linux 上跑。
#
# 国内节点只列境外能连上且测得准的 (2026-09-16 洛杉矶与香港两地实测): 电信、移动的 Speedtest 节点
# 不接受境外连接或对境外限速, 报告里如实显示「暂无境外可用节点」。
# 一行一个: 运营商|省份代码 (报告按语言显示名称)|主机:端口
# 苏州移动 (speedtest.jsqiuying.com) 能连上但对境外下载限速到 0.5 Mbps (上传正常), 会误导, 不用。
SPEED_NODES='cu|bj|beijing.unicomtest.com:8080
cu|sh|mobile.shunicomtest.com.prod.hosts.ooklaserver.net:8080'

dd_bytes_secs() {
	# 从 dd 的统计输出取每一次的 "字节数 秒数"
	grep -E 'bytes.*copied' "$1" 2>/dev/null | sed -E 's/^([0-9]+) bytes.*copied, ([0-9.]+) s.*/\1 \2/'
}

speed_stream() {
	local dir="$1" host="${2%:*}" port="${2##*:}" err="$3" pid
	exec 3<>"/dev/tcp/$host/$port" || return 1
	if [ "$dir" = down ]; then
		printf 'DOWNLOAD 4000000000\n' >&3
		dd of=/dev/null bs=65536 <&3 2>"$err" &
	else
		printf 'UPLOAD 4000000000 0\n' >&3
		dd if=/dev/zero bs=65536 count=61035 >&3 2>"$err" &
	fi
	pid=$!
	sleep 2
	kill -USR1 "$pid" 2>/dev/null
	sleep 6
	kill -USR1 "$pid" 2>/dev/null
	sleep 0.2
	kill -9 "$pid" 2>/dev/null
	wait "$pid" 2>/dev/null
	exec 3<&-
}

# 4 条并发, 输出 Mbps (保留 1 位), 失败输出空
speed_dir() {
	local dir="$1" hostport="$2" d="$3" i
	for i in 1 2 3 4; do
		(speed_stream "$dir" "$hostport" "$d/$dir.$i.err") 2>/dev/null &
	done
	wait
	for i in 1 2 3 4; do dd_bytes_secs "$d/$dir.$i.err" | tail -n 2 | paste -sd' ' -; done |
		awk 'NF == 4 && $4 > $2 { bps += ($3 - $1) / ($4 - $2); n++ } END { if (n) printf "%.1f", bps * 8 / 1e6 }'
}

speed_hello() {
	(exec 3<>"/dev/tcp/${1%:*}/${1##*:}" && printf 'HI\n' >&3 && IFS= read -r -t 3 line <&3 && [ "${line#HELLO}" != "$line" ]) 2>/dev/null &
	local pid=$! i=0
	while kill -0 "$pid" 2>/dev/null && [ $i -lt 40 ]; do sleep 0.1; i=$((i + 1)); done
	if kill -0 "$pid" 2>/dev/null; then kill -9 "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; return 1; fi
	wait "$pid"
}

run_speed() {
	local d="$1" nodes="$SPEED_NODES" n=0 carrier name hostport down up near
	[ "$(uname -s)" = Linux ] || return 0
	mkdir -p "$d/speed"
	# 就近节点: Speedtest 按来源 IP 就近排序的公开列表, 取第一个, 代表这台机器本地的带宽
	near=$(ccurl -s -m 10 https://www.speedtest.net/speedtest-servers-static.php 2>/dev/null |
		grep -oE '<server [^>]+>' | head -n1)
	if [ -n "$near" ]; then
		name=$(printf '%s' "$near" | sed -E 's/.* name="([^"]*)".*/\1/')
		hostport=$(printf '%s' "$near" | sed -E 's/.* host="([^"]*)".*/\1/')
		nodes="near|$name|$hostport
$nodes"
	fi
	while IFS='|' read -r carrier name hostport; do
		[ -n "$hostport" ] || continue
		n=$((n + 1))
		progress "$(t "带宽测速: 第 $n 个节点…" "Bandwidth test: server $n…")"
		if ! speed_hello "$hostport" </dev/null; then
			put "$d/speed" "sp_$n" "$carrier|$name|fail|fail"
			continue
		fi
		mkdir -p "$d/speed/$n"
		down=$(speed_dir down "$hostport" "$d/speed/$n" </dev/null)
		up=$(speed_dir up "$hostport" "$d/speed/$n" </dev/null)
		put "$d/speed" "sp_$n" "$carrier|$name|${down:-fail}|${up:-fail}"
	done <<EOF
$nodes
EOF
}

# ── DNS 出口 ─────────────────────────────────────────────────────────────
# 按系统 DNS 解析几个一次性子域名, CleanIP 的权威 DNS 会记下是哪台递归服务器来问的。

run_dns() {
	local d="$1" resp uuid host p
	mkdir -p "$d/dns"
	resp=$(ccurl -s -m 8 -X POST -A "$UA_SELF" "$API/api/dns-probe/start" 2>/dev/null)
	uuid=$(printf '%s' "$resp" | grep -oE '"uuid":"[0-9a-f]{32}"' | cut -d'"' -f4)
	host=$(printf '%s' "$resp" | grep -oE '"probeHost":"[^"]+"' | cut -d'"' -f4)
	[ -n "$uuid" ] && [ -n "$host" ] || return 0
	for p in a1 b2 c3 d4; do
		(
			if [ -z "$PROXY" ] && command -v getent >/dev/null 2>&1; then
				getent ahosts "$p.$host" >/dev/null 2>&1
			else
				# 代理模式交给 curl: socks5h / http 代理由代理端解析, 测到的正是代理用的 DNS
				ccurl -s -o /dev/null -m 4 "http://$p.$host/" >/dev/null 2>&1
			fi
		) &
	done
	wait
	put "$d/dns" dns "$uuid"
}

# ── 单个出口的完整检测 ─────────────────────────────────────────────────────
# $1: 4 | 6 | p (代理出口, 不强制协议栈)

label_of() { case "$1" in 4) echo IPv4 ;; 6) echo IPv6 ;; *) t "代理出口" "Proxy exit" ;; esac; }

check_exit() {
	local ex="$1" seq="$2" d="$TMP/$1" fam="$1" label ip line code body
	local args
	[ "$ex" = p ] && fam=""
	label=$(label_of "$ex")
	mkdir -p "$d"
	: >"$d/fields"
	set_net "$fam"

	# Cloudflare 的 /cdn-cgi/trace 在 v4 / v6 都能回显来源 IP, 顺便确认连得上 CleanIP
	ip=$(ccurl -s -m 8 "$API/cdn-cgi/trace" 2>/dev/null | sed -n 's/^ip=//p')
	if [ -z "$ip" ]; then
		progress_done
		# 默认双栈检测时, 没有 IPv6 很常见, 不当成错误
		if [ "$JSON" != 1 ] && { [ -n "$ONLY_FAMILY" ] || [ "$ex" != 6 ]; }; then
			printf '  %s\n' "$(t "$label 无法连接到 cleanip.io, 已跳过" "$label cannot reach cleanip.io, skipped")" >&2
		fi
		return 1
	fi

	# DNS 出口与协议栈无关, 只在第一个出口测一次, 和解锁检测并行
	if ! skipped dns && [ "$seq" = 1 ]; then run_dns "$d" & fi
	if ! skipped media; then
		progress "$(t "[$label] 检测流媒体与 AI 解锁…" "[$label] Checking streaming & AI…")"
		run_media "$d"
	fi
	if ! skipped mail && [ "$ex" = 4 ] && [ -z "$PROXY" ] && [ -z "$IFACE" ]; then
		progress "$(t "[$label] 检测邮件端口…" "[$label] Checking mail ports…")"
		run_mail "$d"
	fi
	if ! skipped latency && [ -z "$PROXY" ]; then
		progress "$(t "[$label] 测三网延迟…" "[$label] Measuring China carrier latency…")"
		run_latency "$d"
	fi
	if ! skipped route && [ "$ex" = 4 ] && [ -z "$PROXY" ]; then
		progress "$(t "[$label] 测三网回程线路…" "[$label] Tracing routes to China carriers…")"
		run_route "$d"
	fi
	wait
	# 测速最后单独跑: 和其它检测同时进行会互相抢带宽
	if [ "$SPEED" = 1 ] && [ "$ex" = 4 ] && [ -z "$PROXY" ] && [ -z "$IFACE" ]; then
		run_speed "$d"
	fi
	progress "$(t "[$label] 生成报告…" "[$label] Generating report…")"

	cat "$d"/*/fields >>"$d/fields" 2>/dev/null

	# 调试: IPCHECK_DUMP=1 只打印本机检测结果, 不提交
	if [ -n "${IPCHECK_DUMP:-}" ]; then
		progress_done
		printf '[%s %s]\n' "$label" "$ip"
		sort "$d/fields"
		return 1
	fi

	args=(-d "v=$VERSION" -d "lang=$LANG_OPT" -d "color=$COLOR" -d "seq=$seq")
	[ "$JSON" = 1 ] && args+=(-d format=json)
	[ -n "$PROXY" ] && args+=(-d via=proxy)
	while IFS= read -r line; do
		[ -n "$line" ] && args+=(--data-urlencode "$line")
	done <"$d/fields"

	body=$(ccurl -s -m 45 -A "$UA_SELF" -w '\n%{http_code}' "${args[@]}" "$API/ipcheck/report" 2>/dev/null)
	code=${body##*$'\n'}
	body=${body%$'\n'*}
	progress_done
	if [ "$code" != 200 ] || [ -z "$body" ]; then
		[ -n "$body" ] && printf '%s\n' "$body" >&2
		printf '  %s\n' "$(t "[$label] 生成报告失败 (HTTP $code), 请稍后重试" "[$label] Report failed (HTTP $code), please retry later")" >&2
		return 1
	fi
	printf '%s\n' "$body" >"$d/report"
}

# ── 主流程 ──────────────────────────────────────────────────────────────

if [ -n "$PROXY" ]; then
	exits="p"
elif [ -n "$ONLY_FAMILY" ]; then
	exits="$ONLY_FAMILY"
else
	exits="4 6"
fi

progress "$(t "CleanIP ipcheck v$VERSION 检测中, 大约需要 20 秒…" "CleanIP ipcheck v$VERSION running, about 20 seconds…")"

seq=1
done_exits=""
for ex in $exits; do
	if check_exit "$ex" "$seq"; then
		done_exits="$done_exits $ex"
		seq=$((seq + 1))
	fi
done
progress_done

[ -n "${IPCHECK_DUMP:-}" ] && exit 0

if [ -z "$done_exits" ]; then
	printf '%s\n' "$(t "没有检测成功的出口, 请检查网络或代理设置。" "No exit could be checked. Please check your network or proxy settings.")" >&2
	exit 1
fi

if [ "$JSON" = 1 ]; then
	out="{"
	sep=""
	for ex in $done_exits; do
		case "$ex" in 4) key=ipv4 ;; 6) key=ipv6 ;; *) key=proxy ;; esac
		out="$out$sep\"$key\":$(cat "$TMP/$ex/report")"
		sep=","
	done
	printf '%s}\n' "$out"
else
	for ex in $done_exits; do cat "$TMP/$ex/report"; done
fi
