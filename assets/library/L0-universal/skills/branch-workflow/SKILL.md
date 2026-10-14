---
name: branch-workflow
description: Git分支工作流。标准化分支策略、提交规范、合并流程与合并冲突逐 hunk 处置。触发方式：/branch-workflow（兼容别名 /git-commit-all：一键全量提交快捷路径，原同名 command 已废弃并入本 skill；兼容别名 /merge-conflicts：merge/rebase/cherry-pick 冲突处置纪律，原同名 skill 已并入本 skill 的 Step 4a）。来源：Harness component library + mattpocock resolving-merge-conflicts。与 Qoder 内置 using-git-worktrees/finishing-a-development-branch 的差异：完整分支生命周期（建→提交→rebase→PR→squash→清理）+ 并集优先的冲突判定。
---


# Git分支工作流

## 触发条件

- 用户明确要求创建新分支或执行 Git 工作流
- 用户输入 `/branch-workflow` 命令
- 用户输入 `/git-commit-all`（兼容别名：一键全量提交，走下方 Step 3a 快捷路径，原独立命令已删除）
- 用户输入 `/merge-conflicts`（兼容别名：走下方 Step 4a 冲突处置，原同名 skill 已并入本 skill）
- git merge / rebase / pull / cherry-pick 产生冲突
- 开始新功能开发、Bug修复、热修复时
- 需要将代码合并回主干时
- **项目还没有版本库**，或需要配身份 / 决定主干名 / 生成 `.gitignore`（Step 0 建仓与前置四查）
- 需要**换远程仓库地址、加第二个远程、改主干名**（Step 9）——说"换个远程仓库""主干不叫 main"即命中

## 执行步骤

### Step 0: 建仓与前置四查（先查再干活，v9.5.0 新增）

本 skill 从 Step 1 起就假定了"仓库在、身份在、主干叫 main、能推远端"。这四件事在真实项目里经常
不成立（monorepo 把仓库建在父目录、公司内网仓库主干叫 `master`、新环境 git 身份从未配 →
首次 `git commit` 直接 fatal、只本地模式的项目根本没有远端）。所以先做四查，再决定走不走 Step 1。

**读一次现场事实**：`.qoder/harness-profile.json#git`（唯一权威源，装机时由 `phase-a-init` 探测填入）。
字段与磁盘实际不符时以磁盘为准，并提示重跑阶段 A 或 `/live-refresh` 刷新。

| 查 | 判据 | 不成立时怎么办 |
|---|---|---|
| ① 仓库在不在 | 从项目根**逐级向上**找 `.git`（目录或文件都算，worktree 的是文件） | 给三步建仓（见下），**由用户执行或用户明确要求后 AI 才执行**；用户若选了"暂不纳管"（`profile.git.mode=none`），本 skill 不适用，直接说明并停 |
| ② 身份配没配 | `git config user.name` 与 `user.email` 都要非空 | 给两条命令让用户自行执行（`git config --global user.name "…"` / `… user.email …`）。**框架不代配全局身份**——它改的是这台机器上所有仓库的默认值 |
| ③ 主干叫什么 | `git symbolic-ref --short HEAD` 或 `git remote show origin` 的 HEAD branch，**实探** | 探到的值回填 `profile.git.trunk`；下文所有 `<主干>` 都取该值，**不得写死 `main`** |
| ④ 行尾钉与忽略表 | 项目根或上层仓库根有 `.gitattributes` 且含承重两行；`.gitignore` 是否按栈就位 | 钉缺席 → 立即补（顺序见下）；`.gitignore` 缺席 → 读库内 `assets/templates/gitignore/common.gitignore` **再拼**对应栈级 `<栈>.gitignore`（现有 `node` / `python` / `java` / `go`），**不现场手搓忽略清单**。这些模板只在库内直读，不随阶段 A 落盘（免重蹈"落盘面与账本脱账"） |

**建仓三步（顺序不可反）**：

```bash
# 1) 先钉行尾（必须第一步：core.autocrlf=true 会在首次 checkout 时静默改写 LF）
#    在项目根 .gitattributes 写入这两行：
#      * -text
#      docs/PROJECT-LIVE.html -diff binary linguist-generated
# 2) 再建仓
git init
# 3) 首个提交前确认忽略表已生效（避免把 node_modules/ 或 .env 提进去）
git status --porcelain | head -20
```

> ⚠️ 为什么钉必须写在 `git init` 之前：一旦 `autocrlf` 在某次 checkout 时把 `.qoder/scripts/*.mjs`
> 的 LF 改成 CRLF，**后补 `.gitattributes` 还原不了已改写的字节**。`harness-verify` 的 `git_ready`
> 判据与 `pre-commit-lint` 门禁都在守这条顺序，违反时会被直接拦下。
>
> 🚫 三条边界（与库内既有裁定 D4"不建库、不引入凭证类变量"同源）：不代跑 `git init`、
> 不代配全局身份、不代推送到任何远端。这三件事都影响仓库之外的共享状态，只在用户明确点头后做。

### Step 1: 确定分支类型与命名

根据任务类型确定分支前缀和命名规范：

| 类型 | 前缀 | 命名格式 | 示例 |
|------|------|----------|------|
| 新功能 | `feature/` | `feature/<issue-id>-<short-desc>` | `feature/123-user-login` |
| Bug修复 | `fix/` | `fix/<issue-id>-<short-desc>` | `fix/456-null-pointer` |
| 热修复 | `hotfix/` | `hotfix/<version>-<short-desc>` | `hotfix/1.2.1-security-patch` |
| 发布 | `release/` | `release/<version>` | `release/2.0.0` |

**操作：**
```bash
# <主干> 与 <远端> 一律取 Step 0 实探到的值（profile.git.trunk / profile.git.remote），不得写死 main/origin
git checkout <主干>
git pull <远端> <主干>      # 仅 mode=remote；mode=local 无远端，跳过本行
```

### Step 2: 创建 Feature 分支

```bash
git checkout -b feature/<issue-id>-<short-desc>
```

- 分支必须从最新的 `<主干>`（Step 0 实探所得，或 `develop`）创建
- **仅 `mode=remote`** 时创建后立即推送：`git push -u <远端> <branch-name>`；`mode=local` 不外推
- 确认分支创建成功：`git branch --show-current`

### Step 3: 开发与提交

- 遵循小步提交原则，每次提交只做一件事
- 提交信息格式：`<type>(<scope>): <description>`
  - type: feat / fix / refactor / docs / test / chore / perf / style（枚举以 `rules/git-commit-message.md` 为准，本 skill 不复写清单）
  - 示例：`feat(auth): add JWT token validation`
- 每完成一个逻辑单元即提交，避免积攒大量未提交更改

```bash
git add -A
git commit -m "feat(auth): add JWT token validation"
```

### Step 3a: 一键全量提交快捷路径（/git-commit-all，原 command 已并入）

适用于收工前提交当日工作、功能完毕后阶段性提交、重构后统一提交：

```bash
# 1. 检查当前 git 状态
git status
git diff --stat

# 2. 暂存所有变更
git add -A

# 3. 生成提交信息（按 Conventional Commits 规范，可叠加 git-commit-message 规则）
#    - 分析变更内容，确定 type（枚举见 git-commit-message 规则，共 8 种，含 perf/style）
#    - 确定 scope（影响的模块）；编写 subject（不超过 50 字符）
git commit -m "<type>(<scope>): <subject>"

# 4. 确认提交成功
git log --oneline -1
```

注意：变更含多个不相关主题时，应拆分为多次原子提交而非一次全量提交。

### Step 4: Rebase 主干

在提交 PR 前，将主干最新代码 rebase 到当前分支：

```bash
git fetch origin
git rebase origin/main
```

- 若出现冲突，转 Step 4a 逐 hunk 处置，解决后执行 `git rebase --continue`
- 冲突解决后必须重新编译验证
- 若冲突过于复杂（>5 个文件），先换策略（放弃 rebase 改用 merge）；整次合并的止损线见 Step 4a 末尾

### Step 4a: 合并冲突处置（原 /merge-conflicts 全量并入）

> **冲突解决的正确答案是"双方意图的并集"，几乎从来不是"选一边"。**
> 整块选边（accept theirs/ours）是最常见的错误：它会静默丢掉另一侧的功能或修复。
> 适用于 Step 4 的 rebase 冲突、Step 7 的 merge 冲突与 cherry-pick 冲突。
> 来源：mattpocock resolving-merge-conflicts — 逐 hunk 判定，每步可验证。

**1. 冲突全景盘点**（先盘再改，不要上来就编辑）：

```bash
git status
git diff --name-only --diff-filter=U
```

输出：冲突文件 N 个 / 冲突 hunk 总数 M 处 / 合并类型 merge·rebase·cherry-pick / 初步分类（逻辑冲突 X · 格式冲突 Y · 同区域不同修改 Z）。

**2. 理解双方意图（逐文件）**：读取冲突标记区域（`<<<<<<<` / `=======` / `>>>>>>>`），**分别回答两个问题**——HEAD 侧这段改动想解决什么？来源分支侧想解决什么？如意图不明，用 `git log -p --follow {file}` 追溯两侧提交的上下文，**禁止凭猜测解决**。

**3. 逐 hunk 判定与合并**：

| 判定 | 条件 | 操作 |
|------|------|------|
| 并集 | 两侧修改不同关注点 | 合并双方代码（注意导入/变量声明同步） |
| 取 HEAD | 来源侧改动已被 HEAD 以更好方式覆盖 | 保留 HEAD，记录理由 |
| 取来源 | HEAD 侧是旧版实现 | 取来源侧，记录理由 |
| 重做 | 两侧逻辑互斥 | 基于双方意图重写该 hunk，标注"人工重做" |

**禁止**：使用 `git checkout --ours/--theirs` 整文件选边；禁止留下任何未解决的冲突标记。

**4. 每文件解决后立即验证**：按栈跑编译/类型检查 + 该文件相关测试；编译失败立即修复（通常是导入/签名不同步），不带错误进入下一文件。

**5. 全量验证收尾**：`git diff --check`（确认零残留标记）→ 全量测试 → 输出逐 hunk 判定报告（每个 hunk 的判定：并集/取哪侧/重做，及理由）。rebase 场景在 `git rebase --continue` 前确认每个冲突提交都已验证。

**止损与例外**：
- 冲突文件 >10 个 → 放弃本次合并（`git merge --abort` / `git rebase --abort`），改用更小粒度的分步合并
- 全量测试失败且与冲突无关 → 单独记录为既有问题，不与冲突解决混在同一变更
- 二进制文件冲突 → 不自动处理，交由用户决策保留哪一侧
- 无法理解某侧意图且追溯提交历史仍不明 → 暂停询问用户，禁止猜测

### Step 5: 推送并创建 Pull Request

```bash
git push origin <branch-name> --force-with-lease
```

PR 描述必须包含：
- **变更摘要**：一句话说明做了什么
- **关联Issue**：`Closes #<issue-id>`
- **变更清单**：列出主要修改的文件/模块
- **测试说明**：如何验证此变更
- **截图/录屏**（UI变更时必需）

### Step 6: Code Review

- 至少 1 人 Approve 后方可合并
- Review 意见按 P0/P1/P2 分级处理（参见 spec-aligned-review skill）
- 所有 P0 问题必须修复，P1 问题应当修复
- 修改后重新推送，等待再次 Review

### Step 7: 合并

- 使用 **Squash Merge** 保持主干历史整洁
- 合并后确认 CI 流水线通过
- 合并提交信息格式：`<type>(<scope>): <description> (#<pr-id>)`

```bash
# 在平台上执行 Squash Merge，或命令行（<主干>/<远端> 取 Step 0 实探值；mode=local 只在本地合并，不推送）：
git checkout <主干>
git merge --squash <branch-name>
git commit -m "feat(auth): add JWT token validation (#78)"
git push <远端> <主干>      # 仅 mode=remote
```

### Step 8: 清理分支

```bash
git branch -d <branch-name>
git push <远端> --delete <branch-name>      # 仅 mode=remote
```

- 确认远程和本地分支均已删除
- 关闭关联的 Issue

### Step 9: 换远程仓库 / 改主干名（v9.5.0 新增）

"以后想换个远程仓库""主干不叫 main""当初选了只本地、现在要推远端"都走这一步。

| 想改的东西 | 怎么做 | 改完必须做的收尾 |
|---|---|---|
| 远程地址换掉（搬家、从个人仓转组织仓） | `git remote set-url <远端> <新地址>`，先看现状 `git remote -v` | 回填 `profile.git.remote`，并跑一次 `node .qoder/scripts/harness-verify.mjs` 确认 `git_ready` 仍绿 |
| 加第二个远程（同时推两处） | `git remote add <名> <地址>`，**不要**改 origin 的 URL 来挪走旧地址，除非确实不再需要它 | 同上；推送门禁 `pre-push-test` 按命令里的 `<远端>` 名判定，两个远端都受守卫 |
| 从未接远端切到接远端 | `git remote add <远端> <地址>` → `git push -u <远端> <主干>` | 把 `profile.git.mode` 从 `local` 改到 `remote`——**这一步是改档，走 `/harness-assemble`**（mode 是用户决策位，AI 不代填） |
| 主干改名 | `git branch -m <旧> <新>`；有远端时同步 `git push <远端> :<新>` 与远端默认分支设置 | 回填 `profile.git.trunk`；否则本 skill 下文所有 `<主干>` 都取到旧值 |

🚫 **两条硬边界**：
1. **令牌绝不写进远程地址**。`https://用户名:令牌@仓库地址` 这种 URL 会明文躺在 `.git/config`
   里，随任何一次打包/截图/分享外流——落盘文件不得含密钥是框架边界条款第 6 条。用系统凭据管理器
   或 SSH key；确需临时认证由用户自行执行。
2. 本 skill 不代推送（`git push` 属外发操作，逐次经用户）、不代创建远端仓库（那要登录托管平台）。

## 输出物

- 规范命名的 Git 分支
- 结构化的提交历史
- 完整的 PR 记录
- 清洁的主干分支

## 适用条件

- 所有使用 Git 进行版本控制的项目
- 团队协作项目（≥2人）
- 需要代码审查流程的正式项目

## 失败处理

| 失败场景 | 处理方式 |
|----------|----------|
| Rebase 冲突过多 | 放弃 rebase（`git rebase --abort`），改用 merge 或拆分为更小分支 |
| Push 被拒绝 | 使用 `--force-with-lease` 而非 `--force`，确认无他人提交 |
| CI 合并后失败 | 立即创建 hotfix 分支修复，不得直接 push main |
| 分支命名不规范 | 重命名分支：`git branch -m <old> <new>` |
| 误删分支 | 通过 `git reflog` 找回最近提交，重建分支 |