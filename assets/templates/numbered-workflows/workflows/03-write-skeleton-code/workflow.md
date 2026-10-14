# 工作流 03：写最小实现代码

## 目标
写入口与骨架代码，做到「最小可编译可启动」——语料的 03（Java 基础设施）与 04（前端基础设施）在此合并为一步，跨栈不再分两套。

## 输入变量
| 变量 | 说明 |
|------|------|
| `targetDir` | 输出目录 |
| `projectName`、`modulePath` | 命名与包/模块标识 |
| `PLAN.codeFiles` | `[{path, body}]` 代码清单 |

## 产出物
- `PLAN.codeFiles` 每一条落到 `<项目>/<path>`

## 验证方法
- 逐文件存在且 body 非空（空 body = 空壳，直接退出码 1，违 `_skeletonContract` 第 ③ 条）。

## 执行脚本
本步正文是 `script.mjs`（与 `plans/<stack>.json` 一起由引擎拼接后落盘为项目侧 `<项目>/.scaffold/step03-write-skeleton-code.mjs`；
落盘件头部带 `@generated-from … sha256=`，用它判断落盘态与库内源是否同代。改库内正文后必须重新拼，不要手改落盘件。
端口来源：语料 `scaffold-agent/workflows/03-write-skeleton-code/` 的 `workflow.md` + `script.ps1`（语义对位，载体换 Node）。

