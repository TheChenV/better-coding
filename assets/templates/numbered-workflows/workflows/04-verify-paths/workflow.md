# 工作流 04：路径与声明核对

## 目标
验证所有生成文件在正确路径下、关键声明与模块标识一致（语料这步只做验证、不做重命名，本步同样）。

## 输入变量
| 变量 | 说明 |
|------|------|
| `targetDir`、`modulePath` | 核对基准 |
| `PLAN.verifyPaths` | 必产文件清单 |
| `PLAN.declChecks` | `[{path, mustContain}]`，可选 |

## 产出物
- 无副作用（只读核对 + 报告）

## 验证方法
- 缺文件或声明不符 → 退出码 1。语料此处只打印警告仍退 0，导致段 D 的「失败即问」永不触发，本步已改为真失败（见 README 的 D3）。

## 执行脚本
本步正文是 `script.mjs`（与 `plans/<stack>.json` 一起由引擎拼接后落盘为项目侧 `<项目>/.scaffold/step04-verify-paths.mjs`；
落盘件头部带 `@generated-from … sha256=`，用它判断落盘态与库内源是否同代。改库内正文后必须重新拼，不要手改落盘件。
端口来源：语料 `scaffold-agent/workflows/04-verify-paths/` 的 `workflow.md` + `script.ps1`（语义对位，载体换 Node）。

