# 工作流 01：创建目录结构

## 目标
按计划创建全部目录（后端多模块 / 前端分层 / 文档目录的跨栈对位），并建 `.scaffold/` 运行目录。

## 输入变量
| 变量 | 说明 |
|------|------|
| `targetDir` | 输出目录（= `--project`） |
| `PLAN.dirs` | 本栈目录清单，来自 `plans/<stack>.json` |

## 产出物
- `PLAN.dirs` 列出的全部目录
- `<项目>/.scaffold/`（运行中间产物目录）

## 验证方法
- 逐目录存在（脚本每条打 `✓ <目录>`，末行报「共 N 个目录」）。

## 执行脚本
本步正文是 `script.mjs`（与 `plans/<stack>.json` 一起由引擎拼接后落盘为项目侧 `<项目>/.scaffold/step01-create-directories.mjs`；
落盘件头部带 `@generated-from … sha256=`，用它判断落盘态与库内源是否同代。改库内正文后必须重新拼，不要手改落盘件。
端口来源：语料 `scaffold-agent/workflows/01-create-directories/` 的 `workflow.md` + `script.ps1`（语义对位，载体换 Node）。

