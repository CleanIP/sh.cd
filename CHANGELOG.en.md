# Changelog

New features and fixes in each release, newest first. Versions match the script's `-v` output.

## v1.3.3 · 2026-09-19

### Added

- Color scales for latency: domestic green <100, yellow 200–300, red >300; international <50 / 200–400 tiers; each trend bar is colored by its own value so one retransmit shows as a yellow bar instead of being averaged away
- Latency notes document the color scale; city and international tables share it

### Fixed

- English latency table label column 16→15: rows were 63 columns wide and only passed the width test via trimmed trailing spaces
- Removed the never-submitted IP-page latency parser, unreferenced copy and functions; unused variables now fail typecheck

## v1.3.2 · 2026-09-19

### Added

- Loss now measured over 10 samples (same as mtr's default): 10 TCP handshakes per node for China, city and education networks, 10% loss granularity and steadier medians
- International latency takes the median of 10 per point plus a loss count, flagged yellow on loss; previously median of 3 with no loss signal

### Fixed

- Education-network latency accepts both 5-sample (old scripts) and 10-sample (new scripts) formats

## v1.3.1 · 2026-09-19

### Added

- CPU line shows steal and iowait: oversold VMs are visible at a glance, steal ≥10% in red
- Clock offset from NTP (chrony) in system info: yellow at 1 s or more, check the clock first for cert / DNSSEC issues
- Mail check: when port 25 fails, port 587 (submission) is tried; reachable means only port 25 is blocked, mail can still go out via 587
- CI runs checks on push: `.github/workflows/check.yml` (script syntax, tests, typecheck)
- Security headers on web responses (nosniff, referrer policy, content security policy); result pages cannot be embedded by third parties
- International latency now takes the median of 3 per point, same as domestic latency; previously the fastest was taken
- DNS lookup time in local policy: latency stats exclude name resolution, so it is reported separately, with a warning over 1 s
- Hop-by-hop detail flags same-TTL multiple replies as suspected ECMP multipath instead of treating stitched hops as a clean path
- Speed table notes the method (4 conns × 2 s warm-up + 4 s window; upload counts written bytes)
- fio gains 4K random p99 latency: Q1 for app feel, Q32 for queue build-up; p99 is matched by percentile name, not column position, across fio versions
- TLS handshake time in local policy (to sh.cd itself): tells slow connections apart from slow handshakes
- Probe node check `bun run probes:check`: liveness and ASN of EDU / intl latency / provincial / speed nodes, read-only
- Unavailable IPv6 in local policy is now red (was gray); missing IPv6 is a clear gap, untested boxes still omit the row

### Fixed

- The "all checks" menu now says it includes Geekbench with public upload; previously only `-h` and the README did
- `X-Real-IP` is only trusted from loopback connections, so direct connections can no longer spoof the exit IP with a forged header
- IPv6 rate-limit keys are normalized (leading zeros stripped), so `2001:0db8…` and `2001:db8…` share one key; the rate-limit table and BGP cache have size caps against memory exhaustion
- Single form fields are truncated at 4 KB, so malformed oversized values no longer bloat result pages
- Missing `CLEANIP_API` and DNS probe env vars warn at boot; upstream failures and disk write failures are logged instead of swallowed
- Hit counter persists asynchronously without blocking requests; deploy uses `bun run typecheck`
- `check.sh`: `-S` can be repeated and accumulates; cleanup no longer runs bare `kill` with no jobs; `STAGE_COUNT` quoted; IPv6 reachability probes in route and local checks honor interface settings; `ROUTE_REUSED` initialized
- Escaping covers single quotes; duplicate classes in ANSI-to-HTML output removed
- Result page color rules unified with terminal reports (HTTPie / xh get colors, `?color=no` and friends accepted); dropped sections and oversize results are logged instead of silent

## v1.3.0 · 2026-09-18

### Added

- Bare metal: disk SMART health, power-on time, temperature, wear and total writes, with a warning when sectors are reallocated
- Bare metal: memory slots, maximum capacity, ECC, and size, type, speed and part number of each module
- CPU, disk and board temperatures when the system exposes them
- Geekbench 6 with `-g` (included in all checks); results are uploaded publicly as Geekbench requires and the report links to them; skipped with a reason when memory, disk space or download speed is too low
- NAT type now distinguishes open internet, firewall, full cone (NAT1), restricted (NAT2), port-restricted (NAT3) and symmetric (NAT4), with notes on gaming and P2P
- With IPv6, latency and return routes to the three Chinese carriers are also measured over IPv6; route details show IPv4 and IPv6 separately and the summary adds the IPv6 average
- Speed tests to Chinese provinces with `-p` (included in all checks): three carriers in Beijing, Tianjin, Shanghai, Jiangsu, Zhejiang, Fujian, Hubei, Hunan and Sichuan; unreachable servers are marked
- On bare metal, smartmontools and dmidecode are offered for install together with sysbench and fio
- Results page: every run ends with a link like `https://sh.cd/results/…` (10-character id) showing the summary, hardware, IP, network and routes on separate tabs, with key facts for hardware, IP, routes to China and bandwidth at the top
- One-click copy link, copy Markdown and download .md, plus copying a single section; `curl -s` on the same link prints the report in a terminal
- IPs on the results page are masked to the first two parts like the terminal report; pages are not indexed and are kept for 365 days. `-P` skips the results page, and `-j` JSON output never creates one
- International latency grows from 12 to 31 sites, grouped by continent: Asia 11 (new: Kuala Lumpur, Bangkok, Jakarta, Manila, Ho Chi Minh City, Mumbai), Middle East 3 (Dubai, Riyadh, Tel Aviv), Europe 6 (new: Madrid, Warsaw), Africa 3 (Johannesburg, Cairo, Casablanca), North America 4 (new: Dallas, Toronto), South America 2 (São Paulo, Santiago), Oceania 2 (new: Auckland)
- International latency falls back to a backup server in the same city when the first one is unreachable
- 5 more international latency sites, 36 in total: Helsinki, Moscow and Istanbul in Europe; San Jose and Seattle in North America
- Return routes for all provinces: menu option 7 or `-R` (included in all checks) identifies all 93 routes (31 provinces x Telecom / Unicom / Mobile), showing line, median latency and loss per cell; the previous three-city test stays as the quick option (menu 6)
- Large-packet routes: the same targets are probed again with 1400-byte packets; a different line means large packets detour or get throttled
- With IPv6, return routes over IPv6 also cover all 31 provinces; deep mode shows every hop with location, latency and ASN
- CERNET return routes, measured together with the provincial routes: one university per province, IPv4 over CERNET and IPv6 over CERNET2, showing the last backbone before CERNET plus latency and loss; from servers abroad it also recognises transits such as HKIX, Lumen, Tata and PCCW
- Menu option 8 runs bandwidth tests only — nearby, Chinese carriers, six regions abroad and provincial servers — without waiting for latency and routes
- City latency: `-c` (included in all checks) measures 223 city-level nodes and lists median latency and loss per city, grouped by province

### Fixed

- Long latency lines in the summary wrap by display width instead of overflowing the report
- Route details no longer re-probe: routes measured during the network stage are reused and only per-hop latency is added, saving minutes in menu 7 and all checks
- With the bash that ships with macOS, some terminals showed the CLEAN IP banner as garbled, uncolored characters; the ATTO and speed test progress lines had the same problem
- Provincial speed table shows "-" where a province has no server for a carrier instead of a blank cell
- China and international latency exclude DNS lookup time and measure only the TCP handshake; on machines without a DNS cache a lookup takes from a fraction of a second to over two seconds, which inflated latency and could be mistaken for a retransmit

## v1.2.0 · 2026-09-17

### Added

- sh.cd is now a standalone service; the script, reports and website all live at https://sh.cd
- New website: Ioskeley Mono typeface, a sample report in four tabs (summary / hardware / IP / network), a check list and copyable commands
- CLEAN IP banner at the start of the script
- Copyright notice in the website footer
- All checks: menu option 2 or `-A -d` runs the full check-up plus the ATTO disk table, latency for every route hop, and hop-by-hop route details
- IP addresses in reports show only the first two parts (e.g. `203.0.*.*`); matching ranges, NAT exit, reverse DNS and route hops are masked too, so screenshots are safe to share. JSON from `-j` keeps full data
- The summary ends with the command `bash <(curl -Ls https://sh.cd)`
- The summary now leads with the overall score next to the purity score, matching cleanip.io
- Mail handshakes distinguish success / refused / unreachable; refusals usually mean the provider rejects the IP's reputation
- On an IPv6 exit, sites without IPv6 (TikTok, Prime Video, Reddit) are marked "No IPv6"
- Changelog page on the website
- CleanIP on the website is shown as the official logo

### Fixed

- The full check-up no longer pauses between sections; missing sysbench / fio is asked about once before starting and installs by default after 15 s
- Speed test switches to the next server in the group when one is unreachable, idle or throttled in one direction; the nearby server is chosen from the closest three
- Backup server for Tokyo speed and latency
- Uptime, memory size and Apple silicon extensions on macOS
- Errors when detecting virtualization as non-root or on macOS
- The mirror entry cleanip.io/ipcheck is removed; use https://sh.cd
- China latency: handshakes that needed a retransmit (about 1 s extra) have the retransmit wait removed and count as loss, instead of showing latency over a second
- Speed test: a direction below one tenth of the other is grayed out as throttled by the test server; the summary picks an overseas server when the nearby one is throttled in one direction
- Mail handshakes wait up to 10 s and retry once, fixing false failures under concurrency
- Stray `Killed: 9` lines on macOS during the mail check
- TikTok blocked by the local network now shows unavailable instead of check failed; YouTube Premium no longer shows a wrong US region when unavailable
- CPU cache is shown per core (it was the total of all cores)
- Disk usage percentage matches `df`
- "Overcommit" is replaced by a neutral memory balloon note; the KSM item, which a VM cannot judge, is removed
- Memory throughput is no longer shown when sysbench is missing, as the fallback was inaccurate
- Reverse DNS no longer repeats the IP when empty; BGP upstream names drop registry handles and quotes
- Summary IP type is localized
## v1.0.0 · 2026-09-16

### Added

- First release: IP purity and risk scores, multi-source checks, blacklists
- Unlock checks for Netflix, Disney+, YouTube Premium, TikTok, Prime Video, Reddit, ChatGPT, Claude and Gemini
- Outbound port 25 and handshakes with 12 mail providers
- DNS egress check
- An info page when sh.cd is opened in a browser
- Hardware & performance: OS and virtualization, CPU model and extensions, sysbench CPU / memory, fio 4K random and sequential disk I/O, ATTO table in deep mode
- Network quality: NAT type and TCP settings, BGP upstreams and peers, latency to 31 Chinese provinces, return route detection for Beijing / Shanghai / Guangzhou, bandwidth tests, latency to 12 international sites
- Hop-by-hop route details with location, ASN and latency
- Menu: full check-up or hardware / IP / network alone, ending with a one-screen summary
- macOS and ARM support
