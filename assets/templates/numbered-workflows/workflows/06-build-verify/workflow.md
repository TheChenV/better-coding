# 工作流 06：编译验证

## 目标
跑本栈 build 命令验证「骨架可编译」——`_skeletonContract` 第 ④ 条的机械出口。

## 输入变量
| 变量 | 说明 |
|------|------|
| `targetDir` | 命令的 cwd |
| `buildCmd` | 取 `.qoder/techstack-commands.json` 对应栈的 build，不在脚本里发明命令 |

## 产出物
- 无副作用（执行外部命令 + 打印末 12 行）

## 验证方法
- build 退出码 0 才算过；`buildCmd` 为空 → 退出码 2；build 失败 → 退出码 1 并进段 D 提问。

## 执行脚本
本步正文是 `script.mjs`（与 `plans/<stack>.json` 一起由引擎拼接后落盘为项目侧 `<项目>/.scaffold/step06-build-verify.mjs`；
落盘件头部带 `@generated-from … sha256=`，用它判断落盘态与库内源是否同代。改库内正文后必须重新拼，不要手改落盘件。
端口来源：语料 `scaffold-agent/workflows/06-build-verify/` 的 `workflow.md` + `script.ps1`（语义对位，载体换 Node）。

