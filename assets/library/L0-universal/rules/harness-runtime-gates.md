---
description: Harness 运行时门禁内幕 - 装机零落盘原因码、hook 静默空转的 127 退出码陷阱、两条心跳判据与宽限期、git 档位与机器兜底（排查 harness 装机失败/hook 不生效/改 git 档位或建仓前必读）
trigger: model_decision
---

# Harness 运行时门禁内幕

> 本文件是根目录 `AGENTS.md`「运行时前置」两行的**详情面**。`AGENTS.md` 只留结论与指针，机器权威值一律存
> `.qoder/harness-profile.json`（`git` 块）与 `manifest.json#runtime`；本文不复述这些值——复述即第三份拷贝。

## Node.js：唯一执行体与零落盘门槛

- **Node.js**（主版本 ≥ `manifest.json#runtime.nodeMinMajor`）：`.qoder/scripts/` 全部脚本与所有注册 hook 的**唯一执行体**。
- 缺失或过旧 → 阶段 A **零落盘**，退出码 1 并打 `PHASE-A-COPY-FAIL:runtime-missing` / `:runtime-too-old`（门槛判定以**退出码**为准，禁止单用 `command -v`：本平台实测 `command -v python3` 命中微软商店应用执行别名，`-v` 通过而实跑退出码 49、零输出）。
- 已装项目若宿主 spawn 不到解释器，全部 hook 会**静默空转**：退出码 127，而阻断契约只认 2 ⇒ 既不阻断也不报错。
  该情形由 `harness-verify` 的 `rules_loaded_stamp` / `verify_stamp` 两条心跳判据（含装机超 24h 的宽限期）兜住。
- **本框架无 no-Node 降级路径**：不要在 Node 缺失的项目里尝试跑 harness 组件。

## Git：只探测、不代做

- 本框架对 git 只做**探测与门禁**，不代建仓、不代配身份、不代推送（「探测 ≠ 决策」）。
- 当前档位与人读结论的唯一权威源是 `.qoder/harness-profile.json#git`：`mode` 取用户选的 `none` / `local` / `remote`，
  未决策即 `pending`；`repo`、`repoRoot`、`trunk`、`identityConfigured` 由探测填入。`AGENTS.md` 不复述这些值。
- 机器兜底 = `harness-verify` 的 `git_ready`：**有仓库就必须有 `.gitattributes` 行尾钉**，缺即 FAIL。
  原因：`core.autocrlf=true` 会静默把 LF 脚本改成 CRLF，且**改写过还原不了字节**——所以顺序是「先钉后 init」。
  🔴 残余窗口（如实记不粉饰）：用户手工 `git init` 且在被拦之前发生过 `checkout` → 被改写的字节事后还原不了。
  现有一层即时机制兜着：`pre-commit-lint` 见仓库无钉即 `exit 2` 并给出可复制的修复命令。
- 改档：说「换一下 git 方式」（走 `/harness-assemble`）。建仓与换远程：`/branch-workflow`
  （Step 0 先钉后 init、Step 9 换远程与改主干）。
- 四条硬边界（`manifest#gitGovernance.neverAutomated`）：不代跑 `git init`、不代配全局身份、不代推送、
  令牌绝不写进 remote URL。

## 出问题时按这个顺序查

1. 装机失败先看阶段 A 的**主令牌**（`PHASE-A-COPY-OK` / `PHASE-A-COPY-FAIL:<原因>` / `PHASE-A-PANEL-FAIL`，
   另有前置串 `PHASE-A-NO-EXECUTOR`），原因枚举与每种人话见 `references/phase-a-checklist.md#A.5-④`。
2. 「hook 好像没生效」→ 先确认 Node 可被宿主 spawn（127 陷阱），再看 `.qoder/logs/` 的心跳与 `rules.stamp`
   （后者是「什么进了常驻上下文」的唯一可靠清点）。
3. 「规则没注入」→ 先查**文件扩展名**是否小写 `.md`、`trigger` 是否为四个合法值之一（未识别或缺失会落到
   `always_on`，而不是不注入）。一次失败的探针有两种成因：平台不支持，或探针本身写错了——用单变量对照区分。
4. git 相关红线 → `node .qoder/scripts/harness-verify.mjs` 看 `git_ready` 行的明细。
