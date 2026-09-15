#!/usr/bin/env bash
#
# CleanIP ipcheck — 服务器全面体检: 硬件与性能 · IP 质量 · 网络质量
#
#   bash <(curl -Ls https://sh.cd)
#   bash <(curl -Ls https://cleanip.io/ipcheck)        备用入口
#
# 在终端里运行会进入菜单, 一键全检按 硬件 → IP → 网络 的顺序, 每一项测完先显示结果再询问是否继续。
# IP 情报与评分、BGP 信息来自 CleanIP; 硬件跑分、解锁、邮件端口、三网延迟与回程、测速都在本机实测,
# 测完把结果提交给 CleanIP 排版成报告。
#
# 默认不安装任何软件、不修改系统, 只依赖 bash 与 curl。CPU / 内存跑分与硬盘读写需要 sysbench、fio,
# 系统里没有时先询问, 同意才安装 (-y 直接安装); 不安装则用系统自带工具近似测量。
# 兼容 bash 3.2 (macOS 自带版本): 不用关联数组 / mapfile / ${var,,}。
#
# 源码: https://github.com/CleanIP/ipcheck    许可: MIT

VERSION="1.0.0"
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
DEEP=0
AUTO_YES=0
NO_ASK=0
STAGES=""
SKIP=","

t() { if [ "$LANG_OPT" = en ]; then printf '%s' "$2"; else printf '%s' "$1"; fi; }

usage() {
	if [ "$LANG_OPT" = en ]; then
		cat <<EOF
CleanIP ipcheck v$VERSION — server check-up: hardware · IP quality · network

Usage: bash <(curl -Ls https://sh.cd) [options]
Run without options in a terminal to open the menu.

  -H            Hardware & performance
  -I            IP quality
  -N            Network quality
  -A            Everything, without prompts between sections
  -d            Deep mode: ATTO disk table, hop-by-hop routes
  -y            Install sysbench / fio without asking when missing

  -4 / -6       IPv4 or IPv6 only (IP quality)
  -x PROXY      Check a proxy exit, e.g. socks5h://user:pass@host:1080
  -i IFACE      Use a network interface, e.g. eth0
  -S LIST       Skip: bench,media,mail,dns,latency,route,speed
  -j            JSON output
  -n            No colors
  -l zh|en      Language (-E = English)
  -h / -v       Help / version

Source: https://github.com/CleanIP/ipcheck
EOF
	else
		cat <<EOF
CleanIP ipcheck v$VERSION — 服务器全面体检: 硬件与性能 · IP 质量 · 网络质量

用法: bash <(curl -Ls https://sh.cd) [参数]
在终端里不带参数运行会进入菜单。

  -H            硬件与性能
  -I            IP 质量
  -N            网络质量
  -A            全部检测, 中间不询问
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

源码: https://github.com/CleanIP/ipcheck
EOF
	fi
}

# 先扫一遍语言参数, 让 -h 的帮助和参数报错也用对语言
for a in "$@"; do case "$a" in -E | -len* | -lEN*) LANG_OPT=en ;; esac; done

add_stage() { case " $STAGES " in *" $1 "*) ;; *) STAGES="$STAGES $1" ;; esac; }

# -a / -s 是 v0.2 的参数 (全国延迟 / 测速), 现在网络质量默认就包含, 保留兼容
while getopts ":HINAdy46x:i:asS:jnl:Ehv" opt; do
	case "$opt" in
	H) add_stage hw ;;
	I) add_stage ip ;;
	N) add_stage net ;;
	A) add_stage hw; add_stage ip; add_stage net; NO_ASK=1 ;;
	d) DEEP=1 ;;
	y) AUTO_YES=1 ;;
	4) ONLY_FAMILY=4 ;;
	6) ONLY_FAMILY=6 ;;
	x) PROXY="$OPTARG" ;;
	i) IFACE="$OPTARG" ;;
	a | s) ;;
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

# 终端里交互 (菜单 / 阶段之间询问 / 询问安装); 输出 JSON 或被重定向时不交互
INTERACTIVE=0
if [ "$JSON" = 0 ] && [ -t 1 ] && { [ -t 0 ] || [ -r /dev/tty ]; }; then INTERACTIVE=1; fi

if [ "$COLOR" = 1 ]; then
	C_G=$'\033[38;2;53;169;82m' C_Y=$'\033[33m' C_R=$'\033[31m' C_K=$'\033[90m' C_B=$'\033[1m' C_0=$'\033[0m'
else
	C_G="" C_Y="" C_R="" C_K="" C_B="" C_0=""
fi

IS_LINUX=0
[ "$(uname -s)" = Linux ] && IS_LINUX=1

TMP=$(mktemp -d 2>/dev/null || mktemp -d -t ipcheck)
BENCH_FILE=""
cleanup() {
	jobs -p 2>/dev/null | xargs kill -9 2>/dev/null
	[ -n "$BENCH_FILE" ] && rm -f "$BENCH_FILE" 2>/dev/null
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

# 字段值去掉竖线与控制字符, 压缩空白
clean() { printf '%s' "$1" | tr -d '\000-\037|' | sed 's/  */ /g; s/^ //; s/ $//'; }

# 在 Linux 上给命令加超时; 没有 timeout 命令时原样执行
with_timeout() {
	local s="$1"
	shift
	if command -v timeout >/dev/null 2>&1; then timeout "$s" "$@"; else "$@"; fi
}

# 按 TCP 建连耗时量延迟 (秒)
connect_time() {
	ccurl -s -o /dev/null -m 3 --connect-timeout 2 -w '%{time_connect}' "http://$1:$2/" 2>/dev/null
}
positive() { awk -v v="$1" 'BEGIN { exit !(v + 0 > 0) }'; }

# ════════════════════════════════════════════════════════════════════════
# 一、硬件与性能
# ════════════════════════════════════════════════════════════════════════
# 字段 (报告按语言排版):
#   hw_os=系统|内核|架构   hw_virt=虚拟化代码   hw_uptime=秒|负载   hw_procs=进程|登录用户|运行服务|全部服务
#   hw_tz=时区|UTC偏移|区域设置   hw_board=厂商|型号|BIOS厂商|BIOS版本   hw_chipset / hw_nic / hw_gpu=名称;名称
#   hw_cpu=型号|核心|线程|插槽|MHz|占用%   hw_cache=L1d|L1i|L2|L3   hw_flags=aes,avx2,...
#   hw_mem=总|已用|可用|Swap总|Swap已用 (字节)   hw_overcommit=balloon,ksm|KSM 是否可用
#   hw_disk=块设备数|总容量|测试分区容量|已用|可用|设备名|ssd/hdd
#   bn_cpu=工具|单线程|多线程|线程数   bn_mem=工具|读|写   bn_r4q1 / bn_r4q32 / bn_s1q1 / bn_s1q8=读KiB/s|读IOPS|写KiB/s|写IOPS
#   bn_atto_<块大小>=同上 (-d)   bn_dd=顺序写字节/秒|顺序读字节/秒|4K同步写IOPS (没有 fio 时)

# 虚拟化 / 容器类型, 输出 systemd-detect-virt 风格的代码, 报告里再翻译
detect_virt() {
	local v
	if [ -f /.dockerenv ]; then echo docker; return; fi
	v=$(tr '\0' '\n' </proc/1/environ 2>/dev/null | sed -n 's/^container=//p' | head -n1)
	if [ -n "$v" ]; then echo "$v"; return; fi
	if [ -d /proc/vz ] && [ ! -d /proc/bc ]; then echo openvz; return; fi
	if command -v systemd-detect-virt >/dev/null 2>&1; then
		v=$(systemd-detect-virt 2>/dev/null)
		if [ -n "$v" ] && [ "$v" != none ]; then echo "$v"; return; fi
	fi
	v="$(cat /sys/class/dmi/id/sys_vendor /sys/class/dmi/id/product_name 2>/dev/null | tr '\n' ' ')"
	case "$v" in
	*KVM* | *QEMU* | *OpenStack* | *Bochs*) echo kvm ;;
	*VMware*) echo vmware ;;
	*VirtualBox*) echo oracle ;;
	*Xen* | *"HVM domU"*) echo xen ;;
	*Hyper-V* | *"Virtual Machine"*) echo microsoft ;;
	*Amazon*) echo amazon ;;
	*Google*) echo google ;;
	*)
		if grep -q '^flags.* hypervisor' /proc/cpuinfo 2>/dev/null; then echo vm
		elif [ "$IS_LINUX" = 1 ]; then echo none
		elif [ "$(sysctl -n kern.hv_vmm_present 2>/dev/null)" = 1 ]; then echo vm
		else echo none; fi
		;;
	esac
}

# lspci 的行只留设备名, 去掉地址与版本号, 同名去重
pci_names() {
	sed -E 's/^[0-9a-fA-F:.]+ [^:]+: //; s/ \(rev [0-9a-f]+\)$//' | tr -d '|;' | awk '!s[$0]++' | head -n 4 | paste -sd';' -
}

cpu_usage() {
	[ -r /proc/stat ] || return 0
	local a b
	a=$(head -n1 /proc/stat)
	sleep 0.5
	b=$(head -n1 /proc/stat)
	printf '%s\n%s\n' "$a" "$b" | awk '{ idle = $5 + $6; tot = 0; for (i = 2; i <= NF; i++) tot += $i
		if (NR == 1) { i1 = idle; t1 = tot } else if (tot > t1) printf "%.0f", (1 - (idle - i1) / (tot - t1)) * 100 }'
}

# 跑分目录: 当前目录、家目录等里第一个可写且不是内存盘的
bench_dir() {
	local dir fs
	for dir in "$PWD" "$HOME" /var/tmp /root /opt /; do
		[ -d "$dir" ] && [ -w "$dir" ] || continue
		fs=$(stat -f -c %T "$dir" 2>/dev/null)
		case "$fs" in tmpfs | ramfs | proc | sysfs) continue ;; esac
		echo "$dir"
		return
	done
}

hw_collect() {
	local d="$1" os kernel arch up load procs users sa="" st="" tz dmi=/sys/class/dmi/id pci
	mkdir -p "$d"

	arch=$(uname -m)
	kernel=$(uname -r)
	if [ -r /etc/os-release ]; then
		os=$(. /etc/os-release && printf '%s' "${PRETTY_NAME:-$NAME $VERSION_ID}")
	elif [ "$(uname -s)" = Darwin ]; then
		os="$(sw_vers -productName 2>/dev/null) $(sw_vers -productVersion 2>/dev/null)"
	else
		os=$(uname -s)
	fi
	put "$d" hw_os "$(clean "$os")|$(clean "$kernel")|$(clean "$arch")"
	put "$d" hw_virt "$(clean "$(detect_virt)")"

	if [ -r /proc/uptime ]; then
		up=$(cut -d. -f1 /proc/uptime)
		load=$(cut -d' ' -f1-3 /proc/loadavg)
	else
		up=$(($(date +%s) - $(sysctl -n kern.boottime 2>/dev/null | sed -E 's/.*sec = ([0-9]+).*/\1/')))
		load=$(sysctl -n vm.loadavg 2>/dev/null | tr -d '{}' | awk '{ print $1, $2, $3 }')
	fi
	put "$d" hw_uptime "$up|$load"

	procs=$(ps -e 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')
	users=$(who 2>/dev/null | wc -l | tr -d ' ')
	if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
		sa=$(systemctl list-units --type=service --state=running --no-legend 2>/dev/null | wc -l | tr -d ' ')
		st=$(systemctl list-units --type=service --all --no-legend 2>/dev/null | wc -l | tr -d ' ')
	fi
	put "$d" hw_procs "$procs|$users|$sa|$st"

	tz=$(timedatectl show -p Timezone --value 2>/dev/null)
	[ -z "$tz" ] && [ -L /etc/localtime ] && tz=$(readlink /etc/localtime | sed 's#.*zoneinfo/##')
	[ -z "$tz" ] && [ -r /etc/timezone ] && tz=$(cat /etc/timezone)
	put "$d" hw_tz "$(clean "${tz:-$(date +%Z)}")|$(date +%z)|$(clean "${LC_ALL:-${LANG:-C}}")"

	put "$d" hw_board "$(clean "$(cat $dmi/sys_vendor 2>/dev/null)")|$(clean "$(cat $dmi/product_name 2>/dev/null)")|$(clean "$(cat $dmi/bios_vendor 2>/dev/null)")|$(clean "$(cat $dmi/bios_version 2>/dev/null)")"
	if command -v lspci >/dev/null 2>&1; then
		pci=$(lspci 2>/dev/null)
		put "$d" hw_chipset "$(printf '%s\n' "$pci" | grep -E 'Host bridge|ISA bridge' | pci_names)"
		put "$d" hw_nic "$(printf '%s\n' "$pci" | grep -E 'Ethernet controller|Network controller' | pci_names)"
		put "$d" hw_gpu "$(printf '%s\n' "$pci" | grep -E 'VGA compatible|3D controller|Display controller' | pci_names)"
	fi

	hw_collect_cpu "$d"
	hw_collect_mem "$d"
	hw_collect_disk "$d"
}

hw_collect_cpu() {
	local d="$1" info model threads sockets per cores mhz flags="" fl x
	info=$(LC_ALL=C lscpu 2>/dev/null)
	lv() { printf '%s\n' "$info" | sed -n "s/^$1:[[:space:]]*//p" | head -n1; }
	model=$(lv 'Model name')
	[ -z "$model" ] && model=$(grep -m1 -E '^(model name|Hardware|cpu model)' /proc/cpuinfo 2>/dev/null | cut -d: -f2-)
	[ -z "$model" ] && model=$(sysctl -n machdep.cpu.brand_string 2>/dev/null)
	threads=$(lv 'CPU(s)')
	[ -z "$threads" ] && threads=$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null)
	sockets=$(lv 'Socket(s)')
	per=$(lv 'Core(s) per socket')
	if [ -n "$sockets" ] && [ -n "$per" ]; then cores=$((sockets * per)); else cores=$(sysctl -n hw.physicalcpu 2>/dev/null || echo "$threads"); fi
	mhz=$(lv 'CPU MHz')
	[ -z "$mhz" ] && mhz=$(grep -m1 'cpu MHz' /proc/cpuinfo 2>/dev/null | cut -d: -f2 | tr -d ' ')
	[ -z "$mhz" ] && mhz=$(lv 'CPU max MHz')
	put "$d" hw_cpu "$(clean "$model")|$cores|$threads|${sockets:-1}|${mhz%%.*}|$(cpu_usage)"
	put "$d" hw_cache "$(clean "$(lv 'L1d cache' | cut -d'(' -f1)")|$(clean "$(lv 'L1i cache' | cut -d'(' -f1)")|$(clean "$(lv 'L2 cache' | cut -d'(' -f1)")|$(clean "$(lv 'L3 cache' | cut -d'(' -f1)")"
	fl=" $(grep -m1 -E '^(flags|Features)' /proc/cpuinfo 2>/dev/null | cut -d: -f2) $(sysctl -n machdep.cpu.features machdep.cpu.leaf7_features 2>/dev/null | tr 'A-Z.' 'a-z_' | tr '\n' ' ') "
	for x in vmx svm aes avx avx2 avx512f bmi1 bmi2 sha_ni ept npt sha1 sha2 hypervisor; do
		case "$fl" in *" $x "*) flags="$flags,$x" ;; esac
	done
	put "$d" hw_flags "${flags#,}"
}

hw_collect_mem() {
	local d="$1" oc="" ksm=0
	if [ -r /proc/meminfo ]; then
		put "$d" hw_mem "$(awk '/^MemTotal:/ { t = $2 } /^MemAvailable:/ { a = $2 } /^SwapTotal:/ { st = $2 } /^SwapFree:/ { sf = $2 }
			END { printf "%.0f|%.0f|%.0f|%.0f|%.0f", t * 1024, (t - a) * 1024, a * 1024, st * 1024, (st - sf) * 1024 }' /proc/meminfo)"
	elif [ "$(uname -s)" = Darwin ]; then
		put "$d" hw_mem "$(sysctl -n hw.memsize 2>/dev/null)|||"
	fi
	# 超开迹象: virtio 气球回收设备、KSM 内存合并
	ls /sys/bus/virtio/drivers/virtio_balloon 2>/dev/null | grep -q virtio && oc="balloon"
	[ -e /sys/kernel/mm/ksm/run ] && ksm=1
	[ "$(cat /sys/kernel/mm/ksm/run 2>/dev/null)" = 1 ] && oc="$oc,ksm"
	[ "$IS_LINUX" = 1 ] && put "$d" hw_overcommit "${oc#,}|$ksm"
}

hw_collect_disk() {
	local d="$1" n=0 total=0 dev sz dir df src parent rota type=""
	for dev in /sys/block/*; do
		case "${dev##*/}" in loop* | ram* | zram* | sr* | fd* | dm-* | md* | nbd* | "*") continue ;; esac
		sz=$(cat "$dev/size" 2>/dev/null)
		[ "${sz:-0}" -gt 0 ] 2>/dev/null || continue
		n=$((n + 1))
		total=$((total + sz * 512))
	done
	dir=$(bench_dir)
	BENCH_DIR="$dir"
	[ -n "$dir" ] || return 0
	df=$(df -Pk "$dir" 2>/dev/null | tail -n1)
	src=$(printf '%s' "$df" | awk '{ print $1 }')
	parent=$(lsblk -no PKNAME "$src" 2>/dev/null | head -n1)
	[ -z "$parent" ] && parent=$(basename "$src" | sed -E 's/p?[0-9]+$//')
	rota=$(cat "/sys/block/$parent/queue/rotational" 2>/dev/null)
	case "$rota" in 0) type=ssd ;; 1) type=hdd ;; esac
	put "$d" hw_disk "$n|$total|$(printf '%s' "$df" | awk '{ printf "%.0f|%.0f|%.0f", $2 * 1024, $3 * 1024, $4 * 1024 }')|$(clean "$(basename "$src")")|$type"
}

# ── 跑分工具: 缺 sysbench / fio 时询问安装 ────────────────────────────────

ensure_bench_tools() {
	local missing="" sudo="" ans pm
	[ "$IS_LINUX" = 1 ] || return 0
	command -v sysbench >/dev/null 2>&1 || missing="$missing sysbench"
	command -v fio >/dev/null 2>&1 || missing="$missing fio"
	[ -n "$missing" ] || return 0
	if [ "$(id -u)" != 0 ]; then
		if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then sudo="sudo -n"; else return 0; fi
	fi
	for pm in apt-get dnf yum apk pacman zypper; do command -v "$pm" >/dev/null 2>&1 && break; pm=""; done
	[ -n "$pm" ] || return 0

	if [ "$AUTO_YES" != 1 ]; then
		[ "$INTERACTIVE" = 1 ] || return 0
		progress_done
		printf '\n  %s%s%s %s\n' "$C_Y" "!" "$C_0" "$(t "缺少测试工具:$missing" "Missing benchmark tools:$missing")"
		printf '    %s\n' "$(t "安装后才能测 CPU 跑分与硬盘读写; 不安装则用系统自带工具近似测量" "Needed for CPU scores and disk I/O; without them, rougher built-in measurements are used")"
		printf '    %s [Y/n] ' "$(t "现在用 $pm 安装?" "Install with $pm now?")"
		read -r ans </dev/tty || ans=n
		case "$ans" in n | N | no | No) return 0 ;; esac
	fi
	progress "$(t "安装$missing …" "Installing$missing …")"
	case "$pm" in
	apt-get)
		$sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $missing >/dev/null 2>&1 ||
			{ $sudo apt-get update -qq >/dev/null 2>&1 && $sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $missing >/dev/null 2>&1; }
		;;
	dnf | yum)
		case "$missing" in *sysbench*) $sudo "$pm" install -y -q epel-release >/dev/null 2>&1 ;; esac
		$sudo "$pm" install -y -q $missing >/dev/null 2>&1
		;;
	apk) $sudo apk add -q $missing >/dev/null 2>&1 ;;
	pacman) $sudo pacman -Sy --noconfirm $missing >/dev/null 2>&1 ;;
	zypper) $sudo zypper -n -q install $missing >/dev/null 2>&1 ;;
	esac
	progress_done
}

# ── 跑分 ────────────────────────────────────────────────────────────────

FIO_ENGINE=psync

# 输出 读KiB/s|读IOPS 或 写KiB/s|写IOPS (fio terse v3: 读在第 7/8 列, 写在第 48/49 列)
fio_run() {
	local rw="$1" bs="$2" depth="$3" secs="$4" out
	out=$(cd "$BENCH_DIR" && with_timeout $((secs + 60)) fio --name=ipcheck --filename=.ipcheck-fio --size=512M --direct=1 \
		--rw="$rw" --bs="$bs" --iodepth="$depth" --ioengine="$FIO_ENGINE" --runtime="$secs" --time_based \
		--group_reporting --output-format=terse --terse-version=3 2>/dev/null | tail -n1)
	case "$rw" in
	*read) printf '%s' "$out" | awk -F';' '{ printf "%s|%s", $7, $8 }' ;;
	*) printf '%s' "$out" | awk -F';' '{ printf "%s|%s", $48, $49 }' ;;
	esac
}

# dd 统计行换算成 字节/秒。GNU: "8589934592 bytes (8.6 GB, 8.0 GiB) copied, 1.2 s, 7.0 GB/s";
# busybox: "... copied, 1.2 seconds, ..."。容量括号里也有逗号, 不能按逗号拆 (2026-09-16 香港机实测全算成 1 GB/s)
dd_secs() { awk '/copied/ { t = $0; sub(/.*copied, /, "", t); sub(/ s.*/, "", t); print t }'; }
dd_rate() {
	awk '/copied/ { b = $1; t = $0; sub(/.*copied, /, "", t); sub(/ s.*/, "", t); if (t + 0 > 0) printf "%.0f", b / t }'
}

hw_bench() {
	local d="$1" threads s1 sn r w k
	threads=$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || echo 1)

	progress "$(t "[硬件] CPU 跑分…" "[Hardware] CPU benchmark…")"
	if command -v sysbench >/dev/null 2>&1; then
		s1=$(sysbench cpu --threads=1 --time=5 run 2>/dev/null | awk '/events per second/ { print $4 }')
		sn=$(sysbench cpu --threads="$threads" --time=5 run 2>/dev/null | awk '/events per second/ { print $4 }')
		put "$d" bn_cpu "sysbench|${s1:-fail}|${sn:-fail}|$threads"
	elif command -v openssl >/dev/null 2>&1; then
		# 16KB 块的 SHA-256 吞吐 (MB/s), 与 sysbench 分数不可比, 报告里注明
		s1=$(openssl speed -seconds 3 -evp sha256 2>/dev/null | awk '/^sha256/ { v = $NF; sub(/k$/, "", v); printf "%.1f", v / 1024 }')
		sn=$(openssl speed -multi "$threads" -seconds 3 -evp sha256 2>/dev/null | awk '/^sha256/ { v = $NF; sub(/k$/, "", v); printf "%.1f", v / 1024 }')
		put "$d" bn_cpu "openssl|${s1:-fail}|${sn:-fail}|$threads"
	fi

	progress "$(t "[硬件] 内存读写…" "[Hardware] Memory throughput…")"
	if command -v sysbench >/dev/null 2>&1; then
		r=$(sysbench memory --memory-block-size=1M --memory-total-size=1000G --memory-oper=read --time=3 run 2>/dev/null | grep -oE '[0-9.]+ MiB/sec' | cut -d' ' -f1)
		w=$(sysbench memory --memory-block-size=1M --memory-total-size=1000G --memory-oper=write --time=3 run 2>/dev/null | grep -oE '[0-9.]+ MiB/sec' | cut -d' ' -f1)
		put "$d" bn_mem "sysbench|${r:-fail}|${w:-fail}"
	elif [ "$IS_LINUX" = 1 ]; then
		r=$(dd if=/dev/zero of=/dev/null bs=1M count=8192 2>&1 | dd_rate)
		put "$d" bn_mem "dd|${r:-fail}|"
	fi

	[ -n "$BENCH_DIR" ] || return 0
	BENCH_FILE="$BENCH_DIR/.ipcheck-fio"
	if command -v fio >/dev/null 2>&1; then
		for k in libaio io_uring posixaio; do
			if fio --enghelp 2>/dev/null | grep -qw "$k"; then FIO_ENGINE=$k; break; fi
		done
		progress "$(t "[硬件] 硬盘 4K 随机读写…" "[Hardware] Disk 4K random I/O…")"
		put "$d" bn_r4q1 "$(fio_run randread 4k 1 4)|$(fio_run randwrite 4k 1 4)"
		put "$d" bn_r4q32 "$(fio_run randread 4k 32 4)|$(fio_run randwrite 4k 32 4)"
		progress "$(t "[硬件] 硬盘顺序读写…" "[Hardware] Disk sequential I/O…")"
		put "$d" bn_s1q1 "$(fio_run read 1m 1 4)|$(fio_run write 1m 1 4)"
		put "$d" bn_s1q8 "$(fio_run read 1m 8 4)|$(fio_run write 1m 8 4)"
		if [ "$DEEP" = 1 ]; then
			for k in 512 1k 2k 4k 8k 16k 32k 64k 128k 256k 512k 1m 2m 4m 8m 16m 32m 64m; do
				progress "$(t "[硬件] ATTO 块大小 $k…" "[Hardware] ATTO block size $k…")"
				put "$d" "bn_atto_$k" "$(fio_run read "$k" 4 2)|$(fio_run write "$k" 4 2)"
			done
		fi
		rm -f "$BENCH_FILE"
	elif [ "$IS_LINUX" = 1 ]; then
		progress "$(t "[硬件] 硬盘读写 (dd)…" "[Hardware] Disk I/O (dd)…")"
		BENCH_FILE="$BENCH_DIR/.ipcheck-dd"
		w=$(dd if=/dev/zero of="$BENCH_FILE" bs=1M count=1024 oflag=direct 2>&1 | dd_rate)
		r=$(dd if="$BENCH_FILE" of=/dev/null bs=1M iflag=direct 2>&1 | dd_rate)
		k=$(dd if=/dev/zero of="$BENCH_FILE" bs=4k count=2000 oflag=dsync 2>&1 | dd_secs | awk '$1 + 0 > 0 { printf "%.0f", 2000 / $1 }')
		put "$d" bn_dd "${w:-fail}|${r:-fail}|${k:-fail}"
		rm -f "$BENCH_FILE"
	fi
	progress_done
}

stage_hw() {
	local d="$TMP/hw"
	mkdir -p "$d"
	: >"$d/fields"
	progress "$(t "[硬件] 读取系统与硬件信息…" "[Hardware] Reading system information…")"
	hw_collect "$d"
	if ! skipped bench; then
		ensure_bench_tools
		hw_bench "$d"
	fi
	progress_done
}

# ════════════════════════════════════════════════════════════════════════
# 二、IP 质量
# ════════════════════════════════════════════════════════════════════════
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

# Disney+: 网页客户端的公开设备注册流程, 最后一步返回出口国家与是否在服务地区 (2026-09-16 洛杉矶 / 香港实测)
DISNEY_CLIENT='ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84'

probe_disney() {
	local r a tk rt g region sup
	r=$(ccurl -s -m 10 -A "$UA_BROWSER" -X POST https://disney.api.edge.bamgrid.com/devices \
		-H "authorization: Bearer $DISNEY_CLIENT" -H 'content-type: application/json; charset=UTF-8' \
		-d '{"deviceFamily":"browser","applicationRuntime":"chrome","deviceProfile":"windows","attributes":{}}' 2>/dev/null)
	a=$(printf '%s' "$r" | grep -oE '"assertion":"[^"]+"' | cut -d'"' -f4)
	[ -n "$a" ] || { echo fail; return; }
	tk=$(ccurl -s -m 10 -A "$UA_BROWSER" -X POST https://disney.api.edge.bamgrid.com/token \
		-H "authorization: Bearer $DISNEY_CLIENT" \
		--data-urlencode 'grant_type=urn:ietf:params:oauth:grant-type:token-exchange' \
		--data-urlencode 'latitude=0' --data-urlencode 'longitude=0' --data-urlencode 'platform=browser' \
		--data-urlencode "subject_token=$a" \
		--data-urlencode 'subject_token_type=urn:bamtech:params:oauth:token-type:device' 2>/dev/null)
	case "$tk" in *forbidden-location*) echo "no|"; return ;; esac
	rt=$(printf '%s' "$tk" | grep -oE '"refresh_token":"[^"]+"' | cut -d'"' -f4)
	[ -n "$rt" ] || { echo fail; return; }
	g=$(ccurl -s -m 10 -A "$UA_BROWSER" -X POST https://disney.api.edge.bamgrid.com/graph/v1/device/graphql \
		-H "authorization: $DISNEY_CLIENT" -H 'content-type: application/json' \
		-d "{\"query\":\"mutation refreshToken(\$input: RefreshTokenInput!) { refreshToken(refreshToken: \$input) { activeSession { sessionId } } }\",\"variables\":{\"input\":{\"refreshToken\":\"$rt\"}}}" 2>/dev/null)
	region=$(printf '%s' "$g" | grep -oE '"countryCode":"[A-Z]{2}"' | head -n1 | cut -d'"' -f4)
	sup=$(printf '%s' "$g" | grep -oE '"inSupportedLocation":(true|false)' | head -n1 | cut -d: -f2)
	if [ -z "$region" ]; then echo fail
	elif [ "$sup" = false ]; then echo "no|$region"
	else echo "yes|$region"; fi
}

# Reddit: 被封的出口直接 403, 正常返回页面并带国家码
probe_reddit() {
	local d="$1" code region
	code=$(web -o "$d/rd" -w '%{http_code}' https://www.reddit.com/svc/shreddit/reddit-chat) || code=000
	region=$(grep -oE 'country="[A-Z]{2}"' "$d/rd" 2>/dev/null | head -n1 | cut -d'"' -f2)
	case "$code" in
	200) echo "yes|$region" ;;
	403) echo "no|" ;;
	*) echo fail ;;
	esac
}

run_media() {
	local d="$1" name
	for name in netflix disney youtube tiktok prime reddit chatgpt claude gemini; do
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

MAIL_HOSTS="gmail:gmail-smtp-in.l.google.com outlook:outlook-com.olc.protection.outlook.com yahoo:mta5.am0.yahoodns.net icloud:mx01.mail.icloud.com qq:mx1.qq.com 163:163mx01.mxmail.netease.com mailru:mxs.mail.ru aol:mx-aol.mail.gm0.yahoodns.net gmx:mx00.gmx.net mailcom:mx00.mail.com sohu:sohumx.h.a.sohu.com sina:freemx1.sinamail.sina.com.cn"

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

# 单个出口: $1 = 4 | 6 | p (代理出口, 不强制协议栈); 本地检测结果写进 $TMP/ip<出口>/fields
stage_ip_exit() {
	local ex="$1" seq="$2" d="$TMP/ip$1" fam="$1" label ip
	[ "$ex" = p ] && fam=""
	case "$ex" in 4) label=IPv4 ;; 6) label=IPv6 ;; *) label=$(t "代理出口" "Proxy exit") ;; esac
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
		progress "$(t "[IP $label] 检测流媒体与 AI 解锁…" "[IP $label] Checking streaming & AI…")"
		run_media "$d"
	fi
	if ! skipped mail && [ "$ex" = 4 ] && [ -z "$PROXY" ] && [ -z "$IFACE" ]; then
		progress "$(t "[IP $label] 检测邮件端口…" "[IP $label] Checking mail ports…")"
		run_mail "$d"
	fi
	wait
	cat "$d"/*/fields >>"$d/fields" 2>/dev/null
	progress_done
}

# ════════════════════════════════════════════════════════════════════════
# 三、网络质量
# ════════════════════════════════════════════════════════════════════════
# 字段:
#   nt_nat=open|公网IP 或 nat|公网IP 或 fail   nt_tcp=拥塞控制|队列|rmem|wmem   nt_v6=yes|no
#   lat_<省>_<ct|cu|cm>=5 次采样毫秒 (0 = 丢包), 逗号分隔
#   rt_<bj|sh|gd>_<ct|cu|cm>=TTL:IP,…  (深度模式 TTL:IP:毫秒)   一跳都没回应为 none
#   sp_<n>=<ct|cu|cm|intl|near>|<地点代码或城市名>|下载Mbps|上传Mbps
#   il_<地点代码>=毫秒 或 fail

# ── 本地网络策略: NAT 类型 (纯 bash 发 STUN 请求)、TCP 拥塞控制与缓冲区 ──
# bash 的 UDP 连接每次换源端口, 无法用同一端口问两台 STUN 服务器, 所以只区分「公网直连」与「在 NAT 后」。

stun_mapped() {
	local ip tid req hex i type len v port a
	ip=$(getent ahostsv4 "$1" 2>/dev/null | awk 'NR == 1 { print $1 }')
	[ -n "$ip" ] || return 0
	tid=$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')
	req="\\x00\\x01\\x00\\x00\\x21\\x12\\xa4\\x42$(printf '%s' "$tid" | sed 's/../\\x&/g')"
	hex=$(with_timeout 3 bash -c "exec 3<>/dev/udp/$ip/$2; printf '$req' >&3; dd bs=1024 count=1 <&3 2>/dev/null | od -An -tx1 -v" 2>/dev/null | tr -d ' \n')
	i=40
	while [ $i -lt ${#hex} ]; do
		type=${hex:$i:4}
		len=$((16#${hex:$((i + 4)):4}))
		v=${hex:$((i + 8)):$((len * 2))}
		if { [ "$type" = 0020 ] || [ "$type" = 0001 ]; } && [ "${v:2:2}" = 01 ]; then
			port=$((16#${v:4:4}))
			a=${v:8:8}
			if [ "$type" = 0020 ]; then a=$(printf '%08x' $((16#$a ^ 0x2112a442))); fi
			echo "$((16#${a:0:2})).$((16#${a:2:2})).$((16#${a:4:2})).$((16#${a:6:2}))"
			return 0
		fi
		i=$((i + 8 + ((len + 3) / 4) * 8))
	done
}

net_local() {
	local d="$1" mapped="" s local_ips cc qd rm wm v6
	if [ "$IS_LINUX" = 1 ]; then
		for s in stun.cloudflare.com:3478 stun.l.google.com:19302; do
			mapped=$(stun_mapped "${s%:*}" "${s#*:}")
			[ -n "$mapped" ] && break
		done
		if [ -z "$mapped" ]; then put "$d" nt_nat fail
		else
			local_ips=" $(ip -4 -o addr show 2>/dev/null | awk '{ sub(/\/.*/, "", $4); printf "%s ", $4 }')"
			case "$local_ips" in *" $mapped "*) put "$d" nt_nat "open|$mapped" ;; *) put "$d" nt_nat "nat|$mapped" ;; esac
		fi
		cc=$(sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null)
		qd=$(sysctl -n net.core.default_qdisc 2>/dev/null)
		rm=$(sysctl -n net.ipv4.tcp_rmem 2>/dev/null | tr -s '\t ' ' ')
		wm=$(sysctl -n net.ipv4.tcp_wmem 2>/dev/null | tr -s '\t ' ' ')
		put "$d" nt_tcp "$(clean "$cc")|$(clean "$qd")|$(clean "$rm")|$(clean "$wm")"
	fi
	v6=no
	[ -n "$(curl -6 -s -m 5 "$API/cdn-cgi/trace" 2>/dev/null | sed -n 's/^ip=//p')" ] && v6=yes
	put "$d" nt_v6 "$v6"
}

# ── 三网延迟: 全国 31 省 × 电信 / 联通 / 移动, TCP 握手, 每节点 5 次 ──────────────
# 节点与 CleanIP 后台三网监测相同: <省>-<ct|cu|cm>-dualstack.ip.zstaticcdn.com。
# 只量 curl 的 time_connect (TCP 建连耗时), 不依赖 ping —— 很多机器禁 ICMP 或没有 ping 权限。
# 优先测 80 端口: 北京联通节点的 443 会丢掉第一个 SYN, 每次都多出 1 秒重传
# (2026-09-15 洛杉矶实测 443 ≈ 1180ms, 80 ≈ 156ms); 80 不通再退回 443。

PROVINCES="bj tj he sx nm ln jl hl sh js zj ah fj jx sd ha hb hn gd gx hi cq sc gz yn xz sn gs qh nx xj"

lat_node() {
	local host="$1" i s out="" port=80
	positive "$(connect_time "$host" 80)" || port=443
	for i in 1 2 3 4 5; do
		s=$(connect_time "$host" "$port")
		if positive "$s"; then out="$out,$(awk -v v="$s" 'BEGIN { printf "%.1f", v * 1000 }')"; else out="$out,0"; fi
	done
	echo "${out#,}"
}

run_latency() {
	local d="$1" p c n=0
	mkdir -p "$d/lat"
	for p in $PROVINCES; do
		for c in ct cu cm; do
			(put "$d/lat" "lat_${p}_$c" "$(lat_node "$p-$c-dualstack.ip.zstaticcdn.com")") &
			n=$((n + 1))
			# 93 个节点分批并发, 同时发起太多连接会互相挤占, 测出来偏高
			[ $((n % 18)) = 0 ] && wait
		done
	done
	wait
}

# ── 三网回程线路: 用系统 ping 按 TTL 逐跳, 线路类型 (CN2 GIA / 9929 / CMIN2 …) 由报告按骨干网段判定 ──
# 不依赖 traceroute: TTL 1–30 并行各发 3 个包, 收集「TTL 超时」回包的来源 IP。
# TTL 超时的回包不带耗时, 深度模式下再对每个跳点单独 ping 取延迟 —— 不能拿并发 ping 的进程耗时凑数,
# 180 个 ping 同时起进程时第一跳内网网关都会算出 100ms 以上 (2026-09-16 洛杉矶实测)。
# Linux 的 ping 不需要 root (2026-09-15 洛杉矶机 root 与 nobody 实测结果一致)。只测 IPv4。

ROUTE_TARGETS="bj_ct:219.141.140.10 bj_cu:202.106.195.68 bj_cm:221.179.155.161 sh_ct:202.96.209.133 sh_cu:210.22.97.1 sh_cm:211.136.112.200 gd_ct:58.60.188.222 gd_cu:210.21.196.6 gd_cm:120.196.165.24"

hop_probe() {
	local ttl="$1" target="$2" ip
	if [ "$(uname -s)" = Darwin ]; then
		# macOS: -m 是 TTL, -W 单位毫秒; -t 在 macOS 上是总超时
		ip=$(ping -n -c 1 -W 1000 -m "$ttl" "$target" 2>/dev/null | grep -oE '[Ff]rom ([0-9]{1,3}\.){3}[0-9]{1,3}' | head -n1 | cut -d' ' -f2)
	else
		ip=$(ping -n -c 1 -W 1 -t "$ttl" ${IFACE:+-I "$IFACE"} "$target" 2>/dev/null | grep -oE '[Ff]rom ([0-9]{1,3}\.){3}[0-9]{1,3}' | head -n1 | cut -d' ' -f2)
	fi
	[ -n "$ip" ] && echo "$ttl:$ip"
}

# 对一个 IP 直接 ping 3 次, 输出最小耗时毫秒 (取整)
hop_rtt() {
	local w=1
	[ "$(uname -s)" = Darwin ] && w=1000
	ping -n -c 3 -i 0.2 -W "$w" ${IFACE:+-I "$IFACE"} "$1" 2>/dev/null | grep -oE 'time=[0-9.]+' | cut -d= -f2 | sort -n | head -n1 | awk '{ printf "%.0f", $1 }'
}

# 第一轮: TTL 1–30 并发各发 3 个包
route_trace() {
	local target="$1" out="$2" ttl k
	for ttl in $(seq 1 30); do
		for k in 1 2 3; do
			(hop_probe "$ttl" "$target" >>"$out") &
		done
	done
	wait
}

# 第二轮: 骨干路由器对「TTL 超时」回包按秒限速, 几十个包同时打过去会丢一部分 ——
# 少了 CN2 段的跳会把 GIA 误判成混合 (2026-09-16 洛杉矶到上海电信实测时有时无)。
# 到达目标 (或最后一个回应) 之前缺的跳, 按顺序间隔 0.3 秒各补 2 次。
route_retry() {
	local target="$1" out="$2" ttl k last
	last=$(awk -F: -v t="$target" '$2 == t { print $1; exit }' "$out" 2>/dev/null)
	[ -z "$last" ] && last=$(cut -d: -f1 "$out" 2>/dev/null | sort -n | tail -n1)
	[ -n "$last" ] || return 0
	for ttl in $(seq 2 "$last"); do
		grep -q "^$ttl:" "$out" 2>/dev/null && continue
		for k in 1 2; do
			hop_probe "$ttl" "$target" >>"$out"
			grep -q "^$ttl:" "$out" && break
			sleep 0.3
		done
	done
}

run_route() {
	local d="$1" item key hops
	command -v ping >/dev/null 2>&1 || return 0
	mkdir -p "$d/route"
	# 第一轮一个目标一个目标地扫, 几个目标同时扫会一起挤爆同一批骨干路由器的回包限速
	for item in $ROUTE_TARGETS; do
		route_trace "${item#*:}" "$d/route/${item%%:*}.hops"
	done
	# 第二轮各目标同时补, 每个目标内部按顺序
	for item in $ROUTE_TARGETS; do
		route_retry "${item#*:}" "$d/route/${item%%:*}.hops" &
	done
	wait
	for item in $ROUTE_TARGETS; do
		key="${item%%:*}"
		# 按跳数排序; 到达目标后后面的 TTL 都是目标自己回的, 同一个 IP 只留第一次
		hops=$(sort -t: -k1,1n "$d/route/$key.hops" 2>/dev/null | awk -F: '!seen[$2]++' | paste -sd, -)
		put "$d/route" "rt_$key" "${hops:-none}"
	done
	if [ "$DEEP" = 1 ]; then route_rtt "$d/route"; fi
}

# 深度模式: 给每个跳点补上直接 ping 的延迟 (每批 16 个并发), 字段变成 TTL:IP:毫秒
route_rtt() {
	local d="$1" ip n=0
	for ip in $(sed -n 's/^rt_[a-z_]*=//p' "$d/fields" | tr ',' '\n' | cut -d: -f2 | sort -u); do
		(r=$(hop_rtt "$ip") && [ -n "$r" ] && echo "$ip $r" >>"$d/rtt") &
		n=$((n + 1))
		[ $((n % 16)) = 0 ] && wait
	done
	wait
	[ -s "$d/rtt" ] || return 0
	awk 'NR == FNR { r[$1] = $2; next }
		{
			split($0, kv, "=")
			if (kv[2] == "none") { print; next }
			n = split(kv[2], hops, ","); out = kv[1] "="
			for (i = 1; i <= n; i++) { split(hops[i], h, ":"); out = out (i > 1 ? "," : "") hops[i] ((h[2] in r) ? ":" r[h[2]] : "") }
			print out
		}' "$d/rtt" "$d/fields" >"$d/fields.new" && mv "$d/fields.new" "$d/fields"
}

# ── 带宽测速: Speedtest 节点的 TCP 协议, 4 条并发取第 2–6 秒的平均速度 ──────────────
# 不下载任何测速客户端: 用 /dev/tcp 发 Speedtest 服务器的 DOWNLOAD / UPLOAD 指令, dd 计量。
# dd 在后台时 SIGINT 会被忽略, 所以用两次 SIGUSR1 各取一次累计字节数, 相减去掉 TCP 慢启动的前 2 秒。
# 依赖 GNU / busybox dd 的 SIGUSR1 统计输出, 只在 Linux 上跑。
#
# 节点清单 2026-09-16 从 speedtest.net 与 speedtest.cn 的公开节点逐个实测 (洛杉矶 + 香港):
# 国内电信、联通只有下面几个接受境外连接且速度正常; 国内移动的节点全部封境外或限速到接近 0,
# 移动改用中国移动香港 (报告里标明是香港)。国际节点统一用 GSL Networks, 各地之间才有可比性。
# 一行一个: 组|运营商|地点代码|主机:端口; 同一组按顺序测, 前一个连不上才换下一个。
SPEED_NODES='ct|ct|sh|speedtest1.online.sh.cn:8080
ct|ct|js|5gnanjing.speedtest.jsinfo.net:8080
cu|cu|sh|mobile.shunicomtest.com:8080
cu|cu|bj|beijing.unicomtest.com:8080
cm|cm|hk|speedtestbb.hk.chinamobile.com:8080
hk|intl|hk|hk1.speedtest.gslnetworks.com.prod.hosts.ooklaserver.net:8080
tyo|intl|tyo|ty8.speedtest.gslnetworks.com:8080
sgp|intl|sgp|sg3.speedtest.gslnetworks.com.prod.hosts.ooklaserver.net:8080
lax|intl|lax|la2.speedtest.gslnetworks.com.prod.hosts.ooklaserver.net:8080
fra|intl|fra|fr5.speedtest.gslnetworks.com.prod.hosts.ooklaserver.net:8080
lon|intl|lon|thn.speedtest.gslnetworks.com.prod.hosts.ooklaserver.net:8080'

# 国际延迟节点 (同为 GSL Networks): 地点代码:主机
INTL_NODES="hk:hk1.speedtest.gslnetworks.com.prod.hosts.ooklaserver.net tpe:tpe.speedtest.gslnetworks.com.prod.hosts.ooklaserver.net sel:seoul.speedtest.gslnetworks.com.prod.hosts.ooklaserver.net tyo:ty8.speedtest.gslnetworks.com sgp:sg3.speedtest.gslnetworks.com.prod.hosts.ooklaserver.net syd:sy5.test.gslnetworks.com.au lax:la2.speedtest.gslnetworks.com.prod.hosts.ooklaserver.net nyc:ny2.speedtest.gslnetworks.com.prod.hosts.ooklaserver.net fra:fr5.speedtest.gslnetworks.com.prod.hosts.ooklaserver.net ams:am5.speedtest.gslnetworks.com.prod.hosts.ooklaserver.net lon:thn.speedtest.gslnetworks.com.prod.hosts.ooklaserver.net par:par.speedtest.gslnetworks.com.prod.hosts.ooklaserver.net"

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
	sleep 4
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
	local d="$1" nodes="$SPEED_NODES" n=0 done_groups=" " group carrier place hostport down up near name total
	[ "$IS_LINUX" = 1 ] || return 0
	mkdir -p "$d/speed"
	# 就近节点: Speedtest 按来源 IP 就近排序的公开列表, 取第一个, 代表这台机器本地的带宽
	near=$(ccurl -s -m 10 https://www.speedtest.net/speedtest-servers-static.php 2>/dev/null | grep -oE '<server [^>]+>' | head -n1)
	if [ -n "$near" ]; then
		name=$(printf '%s' "$near" | sed -E 's/.* name="([^"]*)".*/\1/' | tr -d '|')
		hostport=$(printf '%s' "$near" | sed -E 's/.* host="([^"]*)".*/\1/')
		nodes="near|near|$name|$hostport
$nodes"
	fi
	total=$(printf '%s\n' "$nodes" | cut -d'|' -f1 | sort -u | wc -l | tr -d ' ')
	while IFS='|' read -r group carrier place hostport; do
		[ -n "$hostport" ] || continue
		case "$done_groups" in *" $group "*) continue ;; esac
		progress "$(t "[网络] 带宽测速 $((n + 1))/$total…" "[Network] Bandwidth $((n + 1))/$total…")"
		if ! speed_hello "$hostport" </dev/null; then
			# 同组还有备用节点就换下一个; 组里最后一个也连不上才记失败
			if printf '%s\n' "$nodes" | awk -F'|' -v g="$group" -v h="$hostport" 'f && $1 == g { found = 1 } $4 == h { f = 1 } END { exit !found }'; then continue; fi
			n=$((n + 1))
			put "$d/speed" "sp_$n" "$carrier|$place|fail|fail"
			done_groups="$done_groups$group "
			continue
		fi
		n=$((n + 1))
		mkdir -p "$d/speed/$n"
		down=$(speed_dir down "$hostport" "$d/speed/$n" </dev/null)
		up=$(speed_dir up "$hostport" "$d/speed/$n" </dev/null)
		put "$d/speed" "sp_$n" "$carrier|$place|${down:-fail}|${up:-fail}"
		done_groups="$done_groups$group "
	done <<EOF
$nodes
EOF
}

run_intl_latency() {
	local d="$1" item
	mkdir -p "$d/intl"
	for item in $INTL_NODES; do
		(
			best=""
			for i in 1 2 3 4; do
				# 前 3 次都失败才补第 4 次, 间隔 1 秒
				[ $i = 4 ] && { [ -n "$best" ] && break; sleep 1; }
				s=$(connect_time "${item#*:}" 8080)
				if positive "$s" && { [ -z "$best" ] || awk -v a="$s" -v b="$best" 'BEGIN { exit !(a < b) }'; }; then best=$s; fi
			done
			put "$d/intl" "il_${item%%:*}" "$([ -n "$best" ] && awk -v v="$best" 'BEGIN { printf "%.1f", v * 1000 }' || echo fail)"
		) &
	done
	wait
}

stage_net() {
	local d="$TMP/net"
	mkdir -p "$d"
	: >"$d/fields"
	set_net 4
	progress "$(t "[网络] 本地网络策略…" "[Network] Local network policy…")"
	net_local "$d"
	# 国际延迟放在最前面: 后面的三网延迟与回程会一次发出几千个包, 小机器上紧接着测会偏高或超时
	# (2026-09-16 香港单核机全检时香港节点测出 133ms, 单独测是 4ms)
	progress "$(t "[网络] 国际延迟…" "[Network] International latency…")"
	run_intl_latency "$d"
	if ! skipped latency; then
		progress "$(t "[网络] 三网延迟 (31 省)…" "[Network] China latency (31 provinces)…")"
		run_latency "$d"
	fi
	if ! skipped route; then
		progress "$(t "[网络] 三网回程线路…" "[Network] Return routes to China…")"
		run_route "$d"
	fi
	if ! skipped speed; then run_speed "$d"; fi
	cat "$d"/*/fields >>"$d/fields" 2>/dev/null
	[ "$DEEP" = 1 ] && put "$d" deep 1
	progress_done
}

stage_route() {
	local d="$TMP/route"
	mkdir -p "$d"
	: >"$d/fields"
	set_net 4
	progress "$(t "[网络] 逐跳回程路由…" "[Network] Hop-by-hop return routes…")"
	DEEP=1
	run_route "$d"
	cat "$d"/*/fields >>"$d/fields" 2>/dev/null
	put "$d" deep 1
	progress_done
}

# ════════════════════════════════════════════════════════════════════════
# 菜单、阶段之间的询问、提交报告
# ════════════════════════════════════════════════════════════════════════

stage_name() {
	case "$1" in
	hw) t "硬件与性能" "Hardware & performance" ;;
	ip) t "IP 质量" "IP quality" ;;
	net) t "网络质量" "Network quality" ;;
	route) t "回程路由详情" "Hop-by-hop routes" ;;
	esac
}
stage_desc() {
	case "$1" in
	hw) t "系统 · CPU · 内存 · 硬盘跑分 · 约 2 分钟" "System · CPU · memory · disk · about 2 min" ;;
	ip) t "纯净度 · 解锁 · 邮件 · 黑名单 · 约 30 秒" "Purity · unlocks · mail · blacklists · about 30 s" ;;
	net) t "BGP · 三网延迟与回程 · 测速 · 约 3 分钟" "BGP · China latency & routes · speed · about 3 min" ;;
	route) t "逐跳位置与 ASN · 约 1 分钟" "Location and ASN per hop · about 1 min" ;;
	esac
}

fmt_dur() {
	local s="$1"
	if [ "$s" -ge 60 ]; then t "$((s / 60)) 分 $((s % 60)) 秒" "$((s / 60))m $((s % 60))s"; else t "$s 秒" "${s}s"; fi
}

menu_select() {
	local choice
	if [ "$LANG_OPT" = en ]; then
		printf '\n  %s██%s  %sCleanIP server check-up%s%29s%s\n' "$C_G" "$C_0" "$C_B" "$C_0" "" "${C_K}sh.cd · v$VERSION$C_0"
		printf '      %sHardware, performance, IP purity and network routes%s\n\n' "$C_K" "$C_0"
		printf '  %s%s1%s  Full check-up    hardware → IP → network   %sabout 6 min%s\n' "$C_G" "$C_B" "$C_0" "$C_K" "$C_0"
		printf '  %s%s2%s  Hardware         CPU memory disk scores    %sabout 2 min%s\n' "$C_G" "$C_B" "$C_0" "$C_K" "$C_0"
		printf '  %s%s3%s  IP quality       purity unlocks blacklists %sabout 30 s%s\n' "$C_G" "$C_B" "$C_0" "$C_K" "$C_0"
		printf '  %s%s4%s  Network          BGP latency routes speed  %sabout 3 min%s\n' "$C_G" "$C_B" "$C_0" "$C_K" "$C_0"
		printf '  %s%s5%s  Route details    location & ASN per hop    %sabout 1 min%s\n' "$C_G" "$C_B" "$C_0" "$C_K" "$C_0"
		printf '  %s0  Exit%s\n\n  Choose [1]: ' "$C_K" "$C_0"
	else
		printf '\n  %s██%s  %sCleanIP 服务器体检%s%28s%s\n' "$C_G" "$C_0" "$C_B" "$C_0" "" "${C_K}sh.cd · v$VERSION$C_0"
		printf '      %s硬件、性能、IP 纯净度、网络线路，一次查清%s\n\n' "$C_K" "$C_0"
		printf '  %s%s1%s  一键全检      硬件 → IP → 网络      %s约 6 分钟%s\n' "$C_G" "$C_B" "$C_0" "$C_K" "$C_0"
		printf '  %s%s2%s  硬件与性能    系统 CPU 内存 硬盘    %s约 2 分钟%s\n' "$C_G" "$C_B" "$C_0" "$C_K" "$C_0"
		printf '  %s%s3%s  IP 质量       纯净度 解锁 黑名单    %s约 30 秒%s\n' "$C_G" "$C_B" "$C_0" "$C_K" "$C_0"
		printf '  %s%s4%s  网络质量      BGP 延迟 回程 测速    %s约 3 分钟%s\n' "$C_G" "$C_B" "$C_0" "$C_K" "$C_0"
		printf '  %s%s5%s  回程路由详情  逐跳位置与 ASN        %s约 1 分钟%s\n' "$C_G" "$C_B" "$C_0" "$C_K" "$C_0"
		printf '  %s0  退出%s\n\n  请选择 [1]: ' "$C_K" "$C_0"
	fi
	read -r choice </dev/tty || choice=1
	case "$choice" in
	2) STAGES=" hw" ;;
	3) STAGES=" ip" ;;
	4) STAGES=" net" ;;
	5) STAGES=" route" ;;
	0 | q | Q) exit 0 ;;
	*) STAGES=" hw ip net" ;;
	esac
	printf '\n'
}

# 阶段之间询问, 结果放在 NEXT_ACTION: go | skip | quit
ask_next() {
	local next="$1" i key filled
	NEXT_ACTION=go
	printf '  %s%s%s  %s%s%s  %s%s%s\n' "$C_K" "$(t "下一项" "Next")" "$C_0" "$C_B" "$(stage_name "$next")" "$C_0" "$C_K" "$(stage_desc "$next")" "$C_0"
	printf '  %s%sEnter%s %s    %s%ss%s %s    %s%sq%s %s\n' "$C_G" "$C_B" "$C_0" "$(t "继续" "continue")" "$C_G" "$C_B" "$C_0" "$(t "跳过这一项" "skip it")" "$C_G" "$C_B" "$C_0" "$(t "结束" "finish")"
	for i in 8 7 6 5 4 3 2 1; do
		filled=$((9 - i))
		printf '\r\033[K  %s%s %s%s' "$C_K" "$(t "$i 秒后自动继续" "continuing in $i s")" "$(printf '%*s' "$filled" '' | tr ' ' '#' | sed 's/#/▰/g')$(printf '%*s' "$i" '' | tr ' ' '#' | sed 's/#/▱/g')" "$C_0"
		if IFS= read -r -s -n 1 -t 1 key </dev/tty 2>/dev/null; then
			case "$key" in
			s | S) NEXT_ACTION=skip ;;
			q | Q) NEXT_ACTION=quit ;;
			esac
			break
		fi
	done
	printf '\r\033[K\n'
}

SEQ=1

# 提交一个阶段的本机检测结果, 服务端返回排好版的报告 (或 JSON)
post_report() {
	local stage="$1" file="$2" out="$3" fam="$4" args line code body
	# 调试: IPCHECK_DUMP=1 只打印本机检测结果, 不提交
	if [ -n "${IPCHECK_DUMP:-}" ]; then
		printf '== %s\n' "$stage"
		sort "$file"
		echo '{}' >"$out"
		return 0
	fi
	set_net "$fam"
	args=(-d "v=$VERSION" -d "lang=$LANG_OPT" -d "color=$COLOR" -d "stage=$stage" -d "seq=$SEQ" -d "stages=$STAGE_COUNT")
	[ "$JSON" = 1 ] && args+=(-d format=json)
	[ -n "$PROXY" ] && args+=(-d via=proxy)
	while IFS= read -r line; do
		[ -n "$line" ] && args+=(--data-urlencode "$line")
	done <"$file"
	progress "$(t "生成报告…" "Building report…")"
	body=$(ccurl -s -m 60 -A "$UA_SELF" -w '\n%{http_code}' "${args[@]}" "$API/ipcheck/report" 2>/dev/null)
	code=${body##*$'\n'}
	body=${body%$'\n'*}
	progress_done
	if [ "$code" != 200 ] || [ -z "$body" ]; then
		[ -n "$body" ] && printf '%s\n' "$body" >&2
		printf '  %s\n' "$(t "[$(stage_name "$stage")] 生成报告失败 (HTTP $code), 请稍后重试" "[$(stage_name "$stage")] Report failed (HTTP $code), please retry later")" >&2
		return 1
	fi
	SEQ=$((SEQ + 1))
	printf '%s\n' "$body" >"$out"
	[ "$JSON" = 1 ] || cat "$out"
}

# ── 主流程 ──────────────────────────────────────────────────────────────

if [ -z "$STAGES" ]; then
	if [ "$INTERACTIVE" = 1 ]; then menu_select; else STAGES=" ip"; fi
fi

STAGE_COUNT=$(echo $STAGES | wc -w | tr -d ' ')
ALL="$TMP/all.fields"
: >"$ALL"
JSON_PARTS=""
DONE_STAGES=0
set -- $STAGES
while [ $# -gt 0 ]; do
	stage="$1"
	shift
	start=$(date +%s)
	case "$stage" in
	hw)
		stage_hw
		put "$TMP/hw" dur $(($(date +%s) - start))
		if post_report hw "$TMP/hw/fields" "$TMP/hw/report" ""; then
			cat "$TMP/hw/fields" >>"$ALL"
			JSON_PARTS="$JSON_PARTS,\"hardware\":$(cat "$TMP/hw/report")"
			DONE_STAGES=$((DONE_STAGES + 1))
		fi
		;;
	ip)
		if [ -n "$PROXY" ]; then exits="p"; elif [ -n "$ONLY_FAMILY" ]; then exits="$ONLY_FAMILY"; else exits="4 6"; fi
		n=0
		ipjson=""
		for ex in $exits; do
			n=$((n + 1))
			stage_ip_exit "$ex" "$n" || continue
			put "$TMP/ip$ex" dur $(($(date +%s) - start))
			if post_report ip "$TMP/ip$ex/fields" "$TMP/ip$ex/report" "$([ "$ex" = p ] || echo "$ex")"; then
				[ "$ipjson" = "" ] && cat "$TMP/ip$ex/fields" >>"$ALL"
				case "$ex" in 4) key=ipv4 ;; 6) key=ipv6 ;; *) key=proxy ;; esac
				ipjson="$ipjson,\"$key\":$(cat "$TMP/ip$ex/report")"
			fi
		done
		if [ -n "$ipjson" ]; then
			JSON_PARTS="$JSON_PARTS,\"ip\":{${ipjson#,}}"
			DONE_STAGES=$((DONE_STAGES + 1))
		fi
		;;
	net | route)
		if [ -n "$PROXY" ]; then
			printf '  %s\n' "$(t "代理模式下网络质量测的是本机而不是代理出口, 已跳过" "Network checks measure this machine, not the proxy exit — skipped")" >&2
		else
			"stage_$stage"
			put "$TMP/$stage" dur $(($(date +%s) - start))
			if post_report "$stage" "$TMP/$stage/fields" "$TMP/$stage/report" 4; then
				cat "$TMP/$stage/fields" >>"$ALL"
				JSON_PARTS="$JSON_PARTS,\"$([ "$stage" = net ] && echo network || echo routes)\":$(cat "$TMP/$stage/report")"
				DONE_STAGES=$((DONE_STAGES + 1))
			fi
		fi
		;;
	esac

	if [ $# -gt 0 ] && [ "$INTERACTIVE" = 1 ] && [ "$NO_ASK" = 0 ]; then
		printf '\n  %s✓%s %s%s%s %s  %s%s%s\n' "$C_G" "$C_0" "$C_B" "$(stage_name "$stage")" "$C_0" "$(t "已完成" "done")" "$C_K" "$(t "用时" "took") $(fmt_dur $(($(date +%s) - start)))" "$C_0"
		ask_next "$1"
		case "$NEXT_ACTION" in
		skip) shift ;;
		quit) set -- ;;
		esac
	fi
done

# 跑了两项以上时出一屏总览
if [ "$DONE_STAGES" -ge 2 ] && [ "$JSON" = 0 ]; then
	post_report summary "$ALL" "$TMP/summary" 4
fi

if [ "$JSON" = 1 ]; then
	if [ -z "$JSON_PARTS" ]; then exit 1; fi
	printf '{"version":"%s"%s}\n' "$VERSION" "$JSON_PARTS"
elif [ "$DONE_STAGES" = 0 ]; then
	printf '%s\n' "$(t "没有完成任何检测, 请检查网络或代理设置。" "Nothing was checked. Please check your network or proxy settings.")" >&2
	exit 1
fi
