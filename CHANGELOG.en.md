# Changelog

New features and fixes in each release, newest first. Versions match the script's `-v` output.

## v1.2.0 · 2026-09-17

### Added

- All checks: menu option 2 or `-A -d` runs the full check-up plus the ATTO disk table, latency for every route hop, and hop-by-hop route details
- IP addresses in reports show only the first two parts (e.g. `203.0.*.*`); matching ranges, NAT exit, reverse DNS and route hops are masked too, so screenshots are safe to share. JSON from `-j` keeps full data
- The summary ends with the command `bash <(curl -Ls https://sh.cd)`
- The summary now leads with the overall score next to the purity score, matching cleanip.io
- Mail handshakes distinguish success / refused / unreachable; refusals usually mean the provider rejects the IP's reputation
- On an IPv6 exit, sites without IPv6 (TikTok, Prime Video, Reddit) are marked "No IPv6"
- Changelog page on the website

### Fixed

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

## v1.1.0 · 2026-09-17

### Added

- sh.cd is now a standalone service; the script, reports and website all live at https://sh.cd
- New website: Ioskeley Mono typeface, a sample report in four tabs (summary / hardware / IP / network), a check list and copyable commands
- CLEAN IP banner at the start of the script
- Copyright notice in the website footer

### Fixed

- The full check-up no longer pauses between sections; missing sysbench / fio is asked about once before starting and installs by default after 15 s
- Speed test switches to the next server in the group when one is unreachable, idle or throttled in one direction; the nearby server is chosen from the closest three
- Backup server for Tokyo speed and latency
- Uptime, memory size and Apple silicon extensions on macOS
- Errors when detecting virtualization as non-root or on macOS
- The mirror entry cleanip.io/ipcheck is removed; use https://sh.cd

## v1.0.0 · 2026-09-16

### Added

- Hardware & performance: OS and virtualization, CPU model and extensions, sysbench CPU / memory, fio 4K random and sequential disk I/O, ATTO table in deep mode
- Network quality: NAT type and TCP settings, BGP upstreams and peers, latency to 31 Chinese provinces, return route detection for Beijing / Shanghai / Guangzhou, bandwidth tests, latency to 12 international sites
- Hop-by-hop route details with location, ASN and latency
- Menu: full check-up or hardware / IP / network alone, ending with a one-screen summary
- macOS and ARM support

## v0.2.0 · 2026-09-15

### Added

- First release: IP purity and risk scores, multi-source checks, blacklists
- Unlock checks for Netflix, Disney+, YouTube Premium, TikTok, Prime Video, Reddit, ChatGPT, Claude and Gemini
- Outbound port 25 and handshakes with 12 mail providers
- DNS egress check
- An info page when sh.cd is opened in a browser
