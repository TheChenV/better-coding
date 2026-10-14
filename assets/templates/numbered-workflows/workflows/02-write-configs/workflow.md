# 工作流 02：写必要配置

## 目标
写构建/运行所需配置文件（语料这步是父 pom + 子 pom + application.yml；跨栈对位为本栈配置清单）。

## 输入变量
| 变量 | 说明 |
|------|------|
| `targetDir` | 输出目录 |
| `displayName`、`port`、`year`、`date` | 出现在配置正文里的可变项，一律以占位符写在计划里 |
| `PLAN.configs` | `[{path, body}]` 配置清单 |

## 产出物
- `PLAN.configs` 每一条落到 `<项目>/<path>`

## 验证方法
- 配置文件逐条存在且非空；已存在且内容不同 → 判冲突并退出码 1（不擅自覆盖项目既有文件）。

## 执行脚本
本步正文是 `script.mjs`（与 `plans/<stack>.json` 一起由引擎拼接后落盘为项目侧 `<项目>/.scaffold/step02-write-configs.mjs`；
落盘件头部带 `@generated-from … sha256=`，用它判断落盘态与库内源是否同代。改库内正文后必须重新拼，不要手改落盘件。
端口来源：语料 `scaffold-agent/workflows/02-write-configs/` 的 `workflow.md` + `script.ps1`（语义对位，载体换 Node）。

