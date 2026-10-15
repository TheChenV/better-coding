# 维护者指南（CONTRIBUTING）

> 本文件面向**要修改 better-coding 库本身**的人。只用框架的项目不需要读它。
> 项目侧的日常维护由框架自己完成，见 `.qoder/rules/` 与 `references/phase-a-checklist.md`。

---

## 七、库维护约定（仅改库时需要看）

> **交付面不含开发侧工装**：本库的回归闸门、判据基线与手册构建器（`tools/`）属开发侧，不随本库交付。
> 文档中凡点到 `tools/...` 的闸门或夹具，都指这套工装；本交付**不附带版本库**，所以历史里的工装无法在本副本内取回：需要改这个库时，请另行获取带完整历史的仓库副本，否则任何改动都没有自动回归可跑（本节末尾那条升级路径遗留缺陷即在此前提下记录）。
>
> **与 Qoder 官方 better-harness 评审器的关系**：Qoder 自带官方 harness 评审器，其 references/agent-customize/agents-md-review.md:57-66 给的是**分带而非分数**（≤80 健康 / 81-120 多栈可接受 / 121-180 须给拆分理由 / >180 默认过载 / 200+ 即 finding），本库根 AGENTS.md 的长度由同口径的落盘判据 agents_context_budget 自证（v9.7.0 起）。**定位是 SDD 流程的编排者，不是该评审器的竞争者**：评审器判「这个项目的 agent 指令文件写得好不好」，本库判「SDD 九环节有没有按规格走完并留下证据」。

> **已知未修缺陷（升级路径）**：阶段 A 整份重建会把项目里**已按 ARCH 推导过**的面板 `SYNC_DATA` 换成模板占位
> （实测 3,851B/10 连线/0 占位 → 3,216B/9 连线/21 占位，`panel_topo_lag` 由 PASS 转 FAIL，同一病灶复现两次）。
> 规避：升级只走 `--skip-panel`（拓扑实测完好）+ 脚本层用 `--repush-scripts-only`；根治方向是升级改走 `build-panel` 的数据块注入模式（v8.1.2 起即支持），或重建前判定旧块无占位标记则保留。

- **`hooks/` 与 `scripts/` 的分工（已裁定，勿再议）**：`.qoder/hooks/` 只放文档（`hook-registry.md`），`.qoder/scripts/` 放全部可执行件。新版无 hooks 目录自动发现，脚本放哪儿都能跑（settings.json 里路径是自由写的），所以这只是可读性取舍：`scripts/` 里 6 个文件有 4 个本就不是 hook 代码（校验器 / 面板拼接 / 契约比对 / 安装器），把它们搬进"事件目录"会制造四处新错位；而只搬 `harness.mjs` + `hook-ask-card.mjs` 两个真事件脚本，实测要改 97 处引用 + `settings.json` 的 12 条命令 + 三处计数口径，零功能收益。**裁定 = 不搬**，可读性由 `hook-registry.md` 首行的目录职责声明兑现（成本账与实测引用数见 `migration-map.json` 的 `_of: 9.2.1` 条目）。
- **三条 v9.4.0 裁定（已量过，勿再议）**：① **不把执行体换成 shell / perl**——能力其实够（Git-Bash 自带 `brotli.exe`，解压与 Node 逐字节同 SHA256；`perl 5.38.2` 带 `JSON::PP`/`Digest::SHA`），否决是方向性的：换底座不解决"宿主 spawn 得到吗"，只是把赌注从"用户装的 node"挪到"宿主内部怎么起进程"；且该结构 v9.0.0 已试删过一次（删前 bash 腿是"3 个有拦截力 + 7 个 exit 0 占位，而旧 shell 校验器只数文件数故占位版照样 PASS"）。② **不在阶段 A 自动装 Node**——App 不提供可独立调用的 `node.exe`，安装器改的 PATH 也不被已运行的进程读到，装了本会话仍零拦截力；"AI 代装"只可作为用户选定次选且卡片须写"只救阶段 A"。③ **stop-verify 不写项目文档**——footer 的镜像义务归同步，破例会让文档出现第二个写入者；已知成本（每轮多一次同步闭合滞后）按现状接受，v9.2.1 的"恰为 `{live_profile_drift}` 时不唤醒"已把打断降到零。三条的实测账目见 `migration-map.json` 的 `_of: 9.4.0` 条目。
- **唯一编辑源**：本目录 `better-coding/`（SKILL 源库）。项目内 `.qoder/skills/better-coding/` 是它的**安装副本**，不直接编辑；改完由 `/harness-upgrade`（升级回源）或整目录复制回刷新。
- **双副本一致性校验**（怀疑两副本漂移时跑，差集应为空）：

```
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compare-Object (Get-ChildItem <库根> -Recurse -File | ForEach-Object { $_.FullName.Substring(<库根>.Length) + '|' + (Get-FileHash $_.FullName).Hash }) (Get-ChildItem <项目>\.qoder\skills\better-coding -Recurse -File | ForEach-Object { $_.FullName.Substring((<项目> + '\.qoder\skills\better-coding').Length) + '|' + (Get-FileHash $_.FullName).Hash })"
```

- **计数台账单源**：组件数量只写 `manifest.json#componentCounts` 与 `migration-map.json#finalCounts` 两处（必须一致）+ 各自 Note 字段说明口径差；SKILL.md/README 不再复制具体数字。
- **排障：非本项目来源的 hook 报错甄别**。若会话中出现指向其他项目路径的报错（典型：某条 `[Hook] Err: ...` 的路径不在当前工作区、或报 `missing end match` 而本仓库内 `grep` 不到该函数名），则它来自用户级/IDE 侧残留的 hook 注册，与本项目 Harness 无关：先核 `\.qoder\settings.json` 与用户级 `~/.qoder/`、`~/.qoder-cn/` 配置里是否引用了已删除或他项目的脚本，清理该注册即可；不要试图通过改本库代码“修好”它，也不要因此判定初始化失败（本库组件是否正常以 `harness-verify` 退出码与输出为准）。
- **改脚本的编码与换行口径**（v9.0.0 单语言化后重写）：库内脚本一律 `.mjs`（UTF-8 无 BOM + LF）。旧的双实现同代维护负担已随 Task 3.4 删除孪生而消失；`L1-techstack/*/hooks/` 下最后 3 个从未注册的栈级占位脚本也已随 Task 5.6 删除，库内 `.ps1` / `.sh` 自此归零。两条仍然承重的事实：① 若将来因宿主适配需要新增 `.ps1`，必须 UTF-8 with BOM（PS 5.1 无 BOM 会按 GBK 解码中文，实测导致比对假阴性）；② `.gitattributes` 的 `* -text` 不许动（本机 `core.autocrlf=true` 会把 LF 文件在 checkout 时改成 CRLF，Node 脚本与逐字比对基准的行尾同样会被破坏）——v9.5.0 S3 起这份钉改为**按需写**（无仓库且 git 方式未定时装机不再落这个文件），但"有仓库就一定得有它"改由双层守：判据 `git_ready`（缺即 FAIL）+ `pre-commit-lint`（提交前见仓库无钉即 `exit 2`）。同一批新增四条 git 边界裁定：**不代跑 `git init`、不代配全局身份、不代推送、不把令牌写进 remote URL**，全集与取值域只在 `manifest#gitGovernance`（本文只指不抄）。
- **大资产事实**：面板相关的两处体积现在是——分发侧引擎 `assets/templates/docs/PROJECT-LIVE.bundle.js.br`（brotli 压缩 **545,624B**；明文 2,916,204B 不再随库分发，首次拼接时按需膨胀进 `~/.qoder-cn/cache/better-coding/` 并按 SHA256 校验复用）与项目内成品 `docs/PROJECT-LIVE.html`（实测 **2,963,399B ≈ 2.96MB**）。引擎不注入项目，但随 SKILL 安装副本入仓，所以同时存在编辑源库副本与 `.qoder/skills/better-coding` 安装副本的工作区会有两份库内容。`.gitattributes` 已把面板产物按二进制处理（`-diff binary linguist-generated`），重建面板不再产生 3MB 级文本 diff。
---

## 退役指令名对照（旧项目升级时才用得到）

> 从 9.0.0 之前的版本升上来的项目会撞见这些旧名字。新用户不需要这张表，故不放在 README。

| 旧名（已失效） | 现行指令／入口 | 说明 |
|---------|---------|------|
| `/arch-check` | `/architecture-governance` | 架构治理与合规检查 |
| `/run-test` | `/run-tests` | 测试执行与报告 |
| `/create-test` | `/run-tests` | 测试计划与用例构造（判据在其 Step 1a） |
| `/contract-test` | `/integrate-modules` | 契约测试判据（其 Step 6a 可单跑） |
| `/git-commit-all` | `/branch-workflow` | 一键全量提交（快捷路径） |
| `/merge-conflicts` | `/branch-workflow` | 合并冲突逐 hunk 处置（其 Step 4a） |
| `/security-review` | `/spec-aligned-review` | 安全需求逐条对齐 + 三层边界；OWASP 逐项/密钥/依赖 CVE 交内置 `security-scan` |
| `/integrate` | `/integrate-modules` | 环节 6 联调（直接调该 skill；含归档合并与破坏性操作确认清单） |
| `/iterate` | 手册 9·1 分诊提示词 | 环节 9 迭代三路分诊（新功能 `/spec-delta` / 缺陷走手册 9·3 先写复现测试 / 重构 `/code-simplification`），收尾 `/retrospective` |
| `/hc-tdd-cycle` | 已退役（本库不再教学/派发 TDD） | 垂直切片红-绿-重构循环整件退役：逐层实现的判据改由 `/implement-feature` 的「逐层验收基线」承载（判据取自 SPEC、每层留证据）；缺陷修复的复现纪律仍在手册 9·3（先写复现测试、确认它失败、再改代码）。新版无别名层，敲旧名直接 `Skill "..." not found` |

---

## 历史与台账文件（为什么不放在 README）

本仓库把"给人读的产品说明"和"给机器读的变更台账"分开放：

| 文件 | 谁在读 | 能不能删 |
|---|---|---|
| `migration-map.json` | 🔴 **机器在读**：`harness-verify` 的 `literal_single_source` 拿它的 `finalCounts` 与 `manifest.componentCounts` 做 7 维互比；`/harness-upgrade` 的 U.2 遍历 `migrations[]._of` 算升级动作 | ❌ 不能删——实测删掉后 `status: FAIL` |
| `CHANGELOG.md` | 只有人读，**没有任何判据依赖它**（实测删掉仍 `status: PASS`） | 可以不在仓库里。本库已把它转为**维护者本地档案**，不随发布分发 |
| README 的逐版本变更史 | 只有人读 | 已移出 README（它曾占全文 54.4%），需要时看 `migration-map.json` |

完整逐版变更史的唯一事实源是 `migration-map.json` 的 `migrations` 数组；本文件不复制它。
