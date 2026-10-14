# 工作流 05：工程初始化

## 目标
建 `.gitignore`（覆盖 `.scaffold/`）并打印后续操作指南。语料同步还会用明文凭证自动建 MySQL 库，不移植（见 README 的 D3）。

## 输入变量
| 变量 | 说明 |
|------|------|
| `targetDir`、`buildCmd` | 指南里要告诉用户下一步跑什么 |
| `PLAN.nextSteps` | 本栈后续动作清单 |

## 产出物
- `<项目>/.gitignore`（仅当不存在时新建）
- 控制台指南

## 验证方法
- `.gitignore` 在场且覆盖 `.scaffold/`；若项目已有 `.gitignore` 且不含该行 → 退出码 2 交回用户拍板，不自动改写。

## 执行脚本
本步正文是 `script.mjs`（与 `plans/<stack>.json` 一起由引擎拼接后落盘为项目侧 `<项目>/.scaffold/step05-init-repo.mjs`；
落盘件头部带 `@generated-from … sha256=`，用它判断落盘态与库内源是否同代。改库内正文后必须重新拼，不要手改落盘件。
端口来源：语料 `scaffold-agent/workflows/05-init-repo/` 的 `workflow.md` + `script.ps1`（语义对位，载体换 Node）。

