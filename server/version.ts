// 当前版本号: 以 check.sh 里的 VERSION 为准, 官网、示例报告、更新日志都从这里取, 发新版只改脚本一处

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

export const VERSION = /^VERSION="([\d.]+)"$/m.exec(readFileSync(resolve(import.meta.dir, "../check.sh"), "utf8"))?.[1] ?? ""
