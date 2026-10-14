# 阶段 A：附录（脚本参数与人工核对项）

> 本文件由 SKILL.md 引用，定位是**附录**：阶段 A 的运行时入口是 `assets/templates/scripts/phase-a-init.mjs`（三平台同一条 `node` 命令；执行序见 SKILL.md「阶段 A」5 步），本文件承载落盘清单、脚本参数与默认值、对账与防覆盖口径、AI 现写脚本纪律，以及机器未覆盖的人工核对项与报告模板；正常初始化无需通读全文。

## A.1 前置检查

- 检查项目是否已有 `.qoder/` 目录：存在则逐文件比对，**跳过已存在的文件并在报告中列出**——该比对已由 `phase-a-init` 内置 SHA256 保护复制自动兑现（不同则列入 `customized_skipped`），AI 无需手工比对
- 目标环境探测由执行器的 S0 预检承担，AI 不再自行探测：**硬失败仅一项**——目标 `.qoder/` 不可写 → `PHASE-A-COPY-FAIL:not-writable`；其余为 WARN 披露不阻断：`python3`（Windows 上 `command -v` 会命中 Store 别名，故以退出码为准：0 且有输出才算真可用；macOS 另探 Xcode CLT shim）、PowerShell 版本（仅 Windows）、路径长度 >200 字符（MAX_PATH）、磁盘 ≥20MB、`docs/` 是否已被 git 跟踪
- ⚠️ **v9.4.0 S2 改写过此位**：旧版印 `node=OK`，而脚本正跑在 Node 上——恒真、射程 0，却占一个 OK 位让读者以为"运行时已核过"。现改为 `[preflight] node(self)=<版本> ≥ <manifest#runtime.nodeMinMajor> 已过门槛（此行仅自证，不计入预检通过位）`，只回答"跑本脚本的解释器够不够新"。
- 紧随其后是**真探活**：`spawn(process.execPath, [<库根>/assets/templates/scripts/harness.mjs, 'selftest'])`，要求退出码 0，否则 `PHASE-A-COPY-FAIL:runtime-missing` 且**零写入**。刻意跑库内源文件而非 staging 副本（两者字节由 SHA256 记账保证等同，而源文件在写 staging 之前就在，失败时目标项目连 `.qoder/` 都还没被创建）。装机事实记入 `profile.env`：`nodePath` / `nodeVersion` / `probedAt` / `selftestExit` / `nodeMinMajor`。
- 🔴 两条探活都**不**证明第 4 层「宿主以 `bash.exe -c` 包装执行 hook 时能否解析到解释器」。实测故障形状：解释器不可达时 spawn 退出码为 **127**，而阻断契约只认 **2** ⇒ 全部注册 hook 零拦截力、不报错、不留痕。收口判据 = `harness-verify` 的 `rules_loaded_stamp` / `verify_stamp`；v9.4.0 S3 已把两者的 SKIP 改为**有期限**（装机超 `STAMP_GRACE_HOURS = 24h` 仍无心跳即 FAIL，处置文案直接给"确认 node 在系统 PATH → 重启 Qoder"），且"有心跳却无 `verify.stamp`"由 WARNING **升为 FAIL**（心跳存在说明装机那会话的 Stop 早跑过，留痕仍缺席只能是 stop-verify 真没起来）。⚠️ v9.5.0 S9 修正这条收紧自带的一处自相矛盾：stamp 本就由本次 Stop 产生，故改为「跑校验前先落 `phase=started`、跑完补真实退出码」，`verify_stamp` 见本次 started 行即认定留痕在场——否则每台新装机首个 Stop 必判红，还附一条"重启 Qoder"的假建议（hook 能弹窗恰证 node 可达）。真故障形状（有心跳而文件从不存在）照旧 FAIL。
- **v9.5.0 S1：预检段另有一轮 git 只读探测**（打 `[git-probe]` 行）：仓库在场性与真实仓库根（**逐级上溯**，`.git` 为目录或文件都算）、git 版本、主干名、remote 名、身份是否已配、行尾钉是否覆盖本项目，结论写进 `profile.git`（唯一权威源，取值域与边界见 `manifest#gitGovernance`）。**探测 ≠ 决策**：`mode` 从没被问过就保持 `pending`，脚本与 AI 都不得代填。这一轮只 spawn `git` 读结论、**不写任何文件**；git 不在 PATH 时各字段落 null，不阻断装机。
- 清单展示不等待确认：阶段 A 属“未初始化 + 用户已明示初始化”场景，按 SKILL.md「提问优先级裁决」同一轮展示并直接执行（零提问）

## A.2 落盘清单（从 SKILL assets 复制到项目）

**⚠️ 编码要求**：`.md/.mdc/.json/.yaml/.sql` 文档类文件必须使用 **UTF-8 编码（无 BOM）**；**例外：`.ps1` 脚本必须使用 UTF-8 with BOM**（Windows PowerShell 5.1 将无 BOM 的 UTF-8 按 GBK 解析，中文字符串会破坏引号配对导致脚本解析失败）。复制一律逐字节原样复制（由 `phase-a-init.mjs` 承担，AI 不手工复制）；确需改正文时用 .NET `[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding $false))`（`.ps1` 目标改用带 BOM 的 `New-Object System.Text.UTF8Encoding $true`）；Bash 侧确保 `LANG=en_US.UTF-8`。

**L0 通用组件（复制到 .qoder/）：**

| SKILL assets 来源 | 目标位置 | 处理 |
|-------------------|----------|------|
| `assets/library/L0-universal/rules/*.{md,mdc}`（16 个，L0 核心，含 project-domain-glossary 领域词汇本 + ask-card-option-quality 选择卡选项质量 + v9.7.0 新增 harness-runtime-gates 运行时门禁内幕（trigger: model_decision，不进常驻预算）） | `.qoder/rules/` | 原样复制 |
| `assets/library/L0-universal/skills/*/`（26 个，含 harness-analyze、ui-ux-pro-max、ui-design、integrate-modules） | `.qoder/skills/` | 原样复制（保持目录结构） |
| `assets/library/L0-universal/agents/*.md`（3 个：architect / ops-agent / spec-review-agent） | `.qoder/agents/` | 原样复制。v9.0.0 起 planner / developer / test-runner / security-auditor 四个专职专家已移出 L0，模板改放 `assets/templates/L2-project/agents/` 由阶段 B 建议装配，不要从旧副本"补回"这里 |
| `assets/library/L0-universal/commands/*.md`（6 个：start-dev/check-project/harness-next/harness-assemble/harness-upgrade/live-refresh） | `.qoder/commands/` | 原样复制 |
| `assets/library/L0-universal/hooks/hook-registry.md` | `.qoder/hooks/` | 原样复制（**v9.0.0 起本目录只落这一份注册表**：库内 13 个孪生 hook 脚本已删除，全部注册 hook 经 `node .qoder/scripts/harness.mjs hook <name>` 单入口执行，拦截力不随平台分叉）。hook 数由 Check 2 按 settings.json 的注册 command 核对，不按文件数 |
| `assets/library/L0-universal/spec-templates/*`（10 个） | `docs/harness-templates/` | 原样复制 |

**无手工复制降级路径（有意为之）**：执行器或其资产缺失时 `phase-a-init.mjs` 打印 `PHASE-A-NO-EXECUTOR` 并以退出码 1 停止，此时**唯一正确动作是把令牌与缺失路径回显给用户、问明安装位置**，不是照抄一份复制命令——历史上此处的 robocopy 教程与 SKILL.md「禁止现写复制逻辑」直接互相矛盾，实测后果是 AI 在执行器缺失时自行编复制逻辑（B6）。由库维护侧（不随库分发）`tools/phase-a-equiv.mjs` 的 `guard-no-executor` 守住该行为。

**创建文档目录结构：**

| 目录 | 用途 |
|------|------|
| `docs/prd/` | 需求文档（MRD/PRD，扁平布局） |
| `docs/arch/` | 架构文档（ARCH/ADR，扁平布局） |
| `docs/spec/` | 模块设计与测试文档（**一功能一目录**：新规格产物用 `NNN-slug/` 子目录，兼容旧扁平文件 `SPEC-*.md`，迁移自愿） |

**阶段 A 明确不建（v9.4.0 S7 负清单，防被顺手加回）**

| 不建的路径 | 归属者（首写时自建父目录） | 为什么不建 |
|---|---|---|
| `docs/test/` | `/run-tests`、`/web-e2e-test`（环节 7） | 三处脱账：既不在本清单（v9.3.0 前被静默预建）、也不在 reconcile 8 维、更不在 36 项判据。用户裁定**删行为**而非补记账 |
| `references/ui/` | `/ui-design`（环节 4）、`/create-proposal` 的交互原型（环节 1·3） | 同上 |
| `.qoder/repowiki/wiki_plan.yaml` | 用户主动定制 wiki 结构时，由 AI 读库内 `assets/templates/repowiki-wiki-plan.yaml` 后创建 | 同上；且原实现直接 `copyFileSync` 到目标，**绕开了 staging + 原子换名**，是 S4 契约的一个例外。模板留库（唯一带平台约束的 wiki 样板） |

执行器有防回潮哨兵：换名后核对"本次运行是否创建了上述路径"（基线快照取在任何写入之前，所以用户在环节 7 之后已有 `docs/test/` 时重跑初始化**不会**被误判），命中即 `PHASE-A-COPY-FAIL:stray-dir-residue`。

**自维护种子（植入持续自维护机制）：**

| SKILL assets 来源 | 目标位置 | 处理 |
|-------------------|----------|------|
| `assets/templates/rules/harness-continuous-sync.md` | `.qoder/rules/` | 原样复制（always-on 规则，驱动持续同步） |
| `assets/templates/techstack-commands.json` | `.qoder/techstack-commands.json` | 原样复制（技术栈→命令映射表） |
| `assets/templates/AGENTS.md.template` | 项目根目录 `AGENTS.md`（agents.md 标准位置，单一事实源） | 原样复制 + 机械字段注入（状态化设计，自然语言提示位无占位符；token 共四名 `{{SYNC_DATE}}`/`{{INIT_DATE}}`/`{{VERIFY_*}}`/`{{NODE_MIN}}`（v9.7.0 起新增第 4 个：取 `manifest#runtime.nodeMinMajor`，兑现"阈值不在本文写死"），由 `phase-a-init` 注入；.qoder/ 下不再落盘 AGENTS.md。另含三处机器标记：`harness:agents-schema:2` 代际标记（v9.7.0 新判据据此门控，缺标记即 SKIP）+ `harness:auto:commands[Test]` 两张命令表的初态判定位，脚本代填真命令时**不消耗**该标记） |
| `assets/templates/hooks/settings.json.template` | `.qoder/settings.json` | 三平台同一份注册表：`command` 一律是 `node .qoder/scripts/harness.mjs hook <name>` 单入口；`phase-a-init` 按平台取 `settings.json.template`（Windows）或 `settings.linux.json.template`（其余），两份实测除 `_comment` 文字外逐字段相同（事件/matcher/command 全等），无需手工改写 |

**校验与面板构建脚本（植入独立校验与面板构建机制）：**

| SKILL assets 来源 | 目标位置 | 处理 |
|-------------------|----------|------|
| `assets/templates/scripts/harness-verify.mjs` | `.qoder/scripts/` | 原样复制（v9.0.0 起三平台唯一校验器；旧 `.ps1`/`.sh` 两份已删） |
| `assets/templates/scripts/build-panel.mjs` | `.qoder/scripts/` | 原样复制（v9.0.0 起三平台唯一面板构建脚本；PROJECT-LIVE.html 完整拼接 / SYNC_DATA 数据块注入双模式，内置 V1-V7 自验；旧 `.ps1`/`.sh` 两份已删） |
| `assets/templates/contract-governance/contract-drift.mjs` | `.qoder/scripts/` | 原样复制（Task 6.1 契约漂移检测器：比对 Provider 契约 `info.version` 与 Consumer `pinned_version`，分类 aligned / minor_drift / breaking_drift，**breaking_drift 退出码 1 即阻断构建**；环节 3 末登记、环节 6 联调前校验。台账上计入 `manifest#componentCounts.contract_drift_scripts` 而非 `scripts` 维度，落盘目录仍是 `.qoder/scripts/`） |
| `assets/templates/contract-governance/deps-template.yaml` | `docs/harness-templates/` | 原样复制（契约登记单模板：`metadata` + `provides` + `consumes`，版本一律 semver；计入 `manifest#componentCounts.contract_deps_templates`，语义见 `manifest#contractGovernance`） |

**指导中心文档（v7.0.0：提示词手册母本 + 可视化衍生视图；v7.4.0 可视化载体改为 Mermaid+ELK 双资产拼接）：**

| SKILL assets 来源 | 目标位置 | 处理 |
|-------------------|----------|------|
| `assets/templates/docs/PROJECT-LIVE.md` | `docs/PROJECT-LIVE.md` | 原样复制（**`tools/build-manual.mjs` （构建期工装，不随本库交付）的生成物**：3 分区 + 页脚契约，workflow 区含 9 环节 × 22 步骤子块提示词手册（标题+区块格式，环节标题（###）+ 步骤区块（####）；环节 1 进行中初态），动态分区为完整初态；机械位 `{{SYNC_DATE}}`/`{{INIT_DATE}}`/`{{VERIFY_STATUS}}` 由 `phase-a-init` 注入，未注入则 harness-verify Check 1 直接 FAIL） |
| `assets/templates/docs/PROJECT-LIVE.template.html` + `assets/templates/docs/PROJECT-LIVE.bundle.js.br` | `docs/PROJECT-LIVE.html` | **脚本构建**（v7.4.0 双资产；v8.1.2 起构建脚本化；v9.0.0 起单实现 + 压缩分发：用 `node .qoder/scripts/build-panel.mjs` 执行完整拼接（三平台同一条命令）——`--bundle` 给 `.js.br` 即可，脚本按需膨胀进用户级缓存并按 SHA256 校验复用（哈希不符即拒绝），模板内 `/*__MERMAID_BUNDLE__*/` 占位替换为明文引擎全文、`{{PROJECT_NAME}}` 替换为项目名（取值优先级见 references/panel-engine-rebuild.md §2）、UTF-8 无 BOM 写入，内置**五条真自验 V1/V3/V4/V6/V7**（V2 恒真、V5 自证已于 v9.0.0 删除）；调用命令与 SYNC_DATA 更新模式见 `references/panel-engine-rebuild.md` §2/§3）。⛔ 禁忌（详见 panel-engine-rebuild.md §4「执行禁忌」）：超大内容严禁内联进命令行（历史事故是 8.46MB bundle 走 `powershell -Command` 触发 `MissingExpressionAfterToken`）；验证严禁 ripgrep 类 Grep 工具（超长行假阴性）。自包含单文件零外部依赖，浏览器双击直接打开；内容：C4 三视图架构拓扑（Mermaid+ELK 自动布局，节点带状态徽标：待开发/进行中/已完成/存在Bug）+ 技术栈详情；SYNC_DATA 标记间数据块由同步再生成（用脚本更新模式注入，不直接编辑 3MB 级成品），初态为三张带“示意”前缀的最小示意图与“待检测”技术栈；**引擎不落盘项目，项目内只保留拼接后的单文件** |
| `assets/templates/briefing-skeletons.md` | `.qoder/briefing-skeletons.md` | 原样复制（提示词手册渲染引擎基准，用户无需阅读） |

**A.2 执行方式（v8.3.0 起：脚本化，AI 不再重抄复制逻辑）**：

阶段 A 的全部复制、机械字段注入、profile 生成、面板拼接与计数对账由库内执行器完成（v9.0.0 起单语言 Node，`phase-a-init.ps1` / `phase-a-init.sh` 孪生已删除——缺陷 B1/B2/E5/M3①/E20 全部只存在于"两份实现手工保持同语义"这个结构里）：

```
node <SKILL 库根>/assets/templates/scripts/phase-a-init.mjs --project-root <项目根>
```

参数与默认值（全部 kebab-case，无短选项）：

- `--project-root`：**必填**，除非库安装在 `<项目>/.qoder/skills/better-coding/` 形态下（此时按脚本自身位置回推三级再上溯两级推导）。显式 CWD 默认值已取消（修 M1）：不带参数从库目录运行时曾把 99 个文件写进 SKILL 自己的目录。无法确定目标项目 → `PHASE-A-COPY-FAIL:missing-project-root`，不猜
- `--project-name`：缺省取项目根目录名（面板标题）；正式项目名确定后按 `panel-engine-rebuild.md` §8 的三步程序改标题，**不可**直接重跑完整拼接（会把 SYNC_DATA 重置为占位图并触发 Check 7a FAIL）
- `--overwrite-customized`：显式以库版本覆盖用户定制文件；默认不覆盖
- `--skip-panel`：**首次初始化禁用**（跳过即无面板产物）；**复跑与升级推荐加**——面板走全量拼接，不加会把已按 ARCH 推导的 `SYNC_DATA` 退回模板占位（旧内容仅另存 `.bak`，不自动回灌）。细则见 `README.md` §七「已知未修缺陷」。⚠️ 它**不**是"仅供单测"：单测复制逻辑只是它的一个用途。
- `--repush-scripts-only`：升级场景只回刷 `.qoder/scripts/`，不碰 profile / rules / docs、不拼面板，收尾写 `.qoder/logs/init.stamp` 记录回刷清单
- **没有 `--skill-root`**：SKILL_ROOT 恒由脚本自身 `realpath` 回推（脚本位于 `<库根>/assets/templates/scripts/`），不接受参数覆盖。不用 `process.cwd()`、也不用 `argv[1]`——两者都可能被调用目录或符号链接欺骗（旧 `.sh` 用不带 `-P` 的 `pwd` 即栽在这上面）

脚本内部执行序（S0–S5 冻结契约，细则就在下面 1.-6. 各条，本清单是唯一体裁——🔴 v9.12.0 校正：此处旧版指向 `references/hook-contracts.md`，该文件从未存在过，全库仅此一处引用，是个死指针）：

1. **S0 根发现 + 预检**：`realpath` 回推 SKILL_ROOT → 四件套存在性校验（`SKILL.md`、`manifest.json`、`assets/library/L0-universal`、`assets/templates`），任一缺失立即 `PHASE-A-NO-EXECUTOR` 退出（**禁止降级为手工复制**）→ **运行时门槛两条（v9.4.0 S2，先于任何写入）**：主版本 ≥ `manifest#runtime.nodeMinMajor` 否则 `runtime-too-old`；spawn `harness.mjs selftest` 要求退出码 0 否则 `runtime-missing` → 只读预检报告（可写性 / 路径长度 / 磁盘 / docs 是否被 git 跟踪；v9.0.0 起不再有 python3 / powershell 探测行——它们只服务于已删除的 `.sh` 孪生与 PowerShell 面板腿，留着等于让校验器催人装一个本 SKILL 用不到的运行时）。⚠️ `node(self)=` 那行只证明解释器已启动，**不计入预检通过位**；宿主能否 spawn 到解释器另由心跳判据收口（见 A.1 第三条）。
2. **原子锁**：`<项目根>/.qoder-init.lock/`（mkdir 独占），`owner` 文件记 pid/时刻/skillRoot；已存在且未过 10 分钟 TTL → `PHASE-A-COPY-FAIL:locked`；过期允许抢占并落 `stale-lock-stolen` 事件。`die()` 直接 `process.exit`，因此清理钩子注册进 `cleanups[]` 由 `die` 统一执行，否则失败的运行会留下 staging 并占住锁直到 TTL 过期。
3. **目录先行**：任何复制之前先建齐目标目录树——`Copy-Item src\* dst\<name>\` 在目标目录不存在时会把首个匹配项复制成名为 `<name>` 的 1 字节文件、其余静默丢失（旧 PowerShell 病灶）。
4. **计划构建**：L0 六类 + 种子 + 脚本 + 指导中心文档，每文件 SHA256 比对（定制保护见下）。
5. **机械字段 token 注入**：`{{SYNC_DATE}}`、`{{INIT_DATE}}`、`{{INIT_STAMP}}`（v9.8.0，只喂 `profile.sync.lastSyncAt`：判据 `sync_freshness` 要比出同日内「交付物落盘 vs 最后一次同步」的先后，纯日期会让装机当天的漏记隐形；footer 与 AGENTS.md 仍用纯日期 `{{SYNC_DATE}}`）、`{{VERIFY_STATUS}}`、`{{VERIFY_DATE}}`、`{{VERIFY_DETAIL}}`、`{{NODE_MIN}}`（v9.7.0，取 manifest#runtime.nodeMinMajor） → 本地日期、门槛数字与"待执行"；注入后仍有 `{{[A-Z_]{3,}}}` 残留 → `PHASE-A-COPY-FAIL:token-residual`。
6. **`harness-profile.json` 生成**：`{{SKILL_VERSION}}` 取 `manifest.json#version`；v9.4.0 S2 起**新建分支**另注入 `env` 块五个令牌（`{{NODE_PATH}}` / `{{NODE_VERSION}}` / `{{PROBED_AT}}` 为字符串位，`{{SELFTEST_EXIT}}` / `{{NODE_MIN_MAJOR}}` 为**不带引号的数值位**——漏注入会当场炸成 `profile-invalid-json`，而不是留下未替换的占位串蒙混）。已存在的 profile 属项目状态，整体保留（`profile_preserved`），**不覆写 `env`**；因此存量项目的装机时刻由校验器按回退链取（`env.probedAt` → `history` 的 init 日期 → `settings.json` 的 mtime），回退链在 `harness-verify` 的 stamp 期限判据内。
7. **写入 staging**：全部产物先落 `.qoder/.init-staging/`，目标项目一个字节未动。
8. **对账（换名之前）**：口径与 `harness-verify` Check 2 一致，不符 → `PHASE-A-COPY-FAIL:reconcile-failed` 并弃 staging。
9. **原子换名**：staging → 目标逐文件 rename，被覆盖者先挪进 `.init-staging/_backup/`；中途失败 → 逐项还原并输出 `PHASE-A-ROLLED-BACK`（未能还原的文件逐个点名，不谎称"保持原样"）。
10. **`.gitattributes` 按需钉行尾**（v9.5.0 S3 改）：**只在**「`findGitRoot` 在项目根或各级父目录找到仓库」或「`profile.git.mode ∈ {local, remote}`」时追加 `* -text` 与 `docs/PROJECT-LIVE.html -diff binary linguist-generated` 两行（已存在的行不重复追加；祖先仓库里的钉对本子树同样生效，故视为在场、不再重复写）；两个条件都不满足 → **一个字节不写**，日志打 `[gitattributes] 跳过 —— …改由建仓那一步写入（先于 git init）`。原因：系统 `core.autocrlf=true` 会把 LF 脚本静默改成 CRLF 而损坏，这个事实没变，变的是时机——过去在无仓库的项目根凭空放一份没人核的 git 配置文件，而真有仓库的项目反而无人核。守门两层：第二个写入者 `/branch-workflow` Step 0 按「先钉后 init」顺序写；`pre-commit-lint` 见仓库无钉即 `exit 2` 阻断提交并给可复制修复；机器判据 `git_ready` 把「有仓库缺钉」判 FAIL。🔴 残余窗口如实记：用户手工 `git init` 且在上述守门生效前发生过 checkout → 被改写的字节后补钉还原不了（过去无条件写没这个窗口）。
11. **面板拼接**：只有 `node .qoder/scripts/build-panel.mjs` 一个实现（`.ps1`/`.sh` 孪生自 v9.0.0 起已从库中删除，不再"按顺序选取实现"）；`--bundle` 指向随库分发的 `PROJECT-LIVE.bundle.js.br`，由脚本按需膨胀进用户级缓存并按 SHA256 校验（哈希不符即拒绝拼接）；退出码 0 **且产物存在且非空、五条拼接自验 V1/V3/V4/V6/V7 全过（v9.3.0 起更新模式另有 V8 数据块 lint，首发警告级）**才刷新 `.qoder/logs/panel.sha256` 指纹。
12. **stubs 磁盘普查**：换名后扫描 `.qoder/hooks/*` 与 `.qoder/scripts/harness.mjs`，按 `# harness:stub` 哨兵计数并逐个点名（口径见 S3）。
13. **S3 令牌输出**：`PHASE-A-COPY-OK`（exit 0）／`PHASE-A-COPY-FAIL:<原因>`（exit 1）／`PHASE-A-PANEL-FAIL`（exit 2）。摘要必含 `customized_skipped`、`profile_preserved`、`stubs:<n>` 三项；v9.9.0 起另有一行 `[case] case_fixed=<n>`（自动纠正的文件名个数，0 也要写；它记的是"只改名不改内容"的动作，属机器口径，会话报告里须翻成人话）。必备件清单不再本地硬编码——唯一事实源是 `manifest#loadBearingFiles`，读不到即 `PHASE-A-COPY-FAIL:manifest-field-missing`。

`die()` 的原因枚举（即 `PHASE-A-COPY-FAIL:` 后缀全集）：`missing-project-root`、`self-contamination-guard`、`runtime-too-old`、`runtime-missing`（v9.4.0 S2 新增，两者都发生在**建 staging 之前** ⇒ 目标项目零写入）、`not-writable`、`locked`、`missing-asset`、`missing-template`、`token-residual`、`manifest-invalid-json`（v9.12.0 起，P2-3：manifest 裸 parse 会把 Node 堆栈甩给用户）、`profile-invalid-json`、`settings-invalid-json`、`hook-target-missing`、`reconcile-failed`、`exception`。⚠️ 新增原因**只扩这个枚举**，不新增第四个主令牌——三条主令牌同时写在 SKILL.md 与本文件两处，加第四个就是第三处脱账。另承认一个既有事实：**还有一个前置串**（四件套缺失时在任何写入之前打印并 exit 1）不属本枚举、也不属主令牌，v9.6.1 起在 SKILL.md 执行序第 1 步与 A.5-④ 各承认一次，不合并、不扩枚举（它同样要在 A.5-④ 有人话说法，漏了会被判据 report_reason_coverage 报红）。

**防静默覆盖（P0 兑现 A.1 与 SKILL.md 边界#1）**：每个目标文件复制前做 SHA256 比对——与源相同计 `identical_skipped`（幂等无写入）；与源不同则跳过并计入 `customized_skipped`（用户在项目内改过的规则/模板/文档），仅加 `--overwrite-customized` 才覆盖；`harness-profile.json` 无论何种开关都**不覆盖**（项目状态文件：成熟度 / 同步记录 / incidents / syncCount），命中即报 `profile_preserved`。此前正文里的 `Copy-Item -Force` 无条件覆盖在二次初始化时会静默改写用户定制内容，故本条为缺陷修复而非新增约束。

**对账口径**（与 `harness-verify` Check 2 完全一致；`phase-a-init.mjs` 的 `reconcile` 表逐项列出，标签即执行器 `[reconcile]` 日志前缀）：

| 标签 | source | target | 口径要点 |
|------|--------|--------|----------|
| `rules` | 库 `L0/rules` | `.qoder/rules` | 按 **basename 去重**计数（`.md`/`.mdc` 同名只算一条，Task 4.7 改名期间两侧都不虚高）；期望 = 库 L0 数 + 1（自维护规则 `harness-continuous-sync` 位于 `assets/templates/rules/`，不在 L0 计数内） |
| `skills-dirs` | 库 `L0/skills` | `.qoder/skills` | 只计含 `SKILL.md` 的一级目录，且**排除 SKILL 自身目录 `better-coding`** |
| `skills-allfiles` | 库 `L0/skills` 文件数 | `.qoder/skills` 去掉 `better-coding/` 子树 | 同上——本 SKILL 实际就安装在 `.qoder/skills/better-coding/`（库副本自带全部 assets），不排除则目标侧多出上百文件、对账必然假 FAIL；v8.2.1 及更早用"库在项目外"的空白夹具实测，因此未暴露 |
| `agents-md` / `commands-md` | 库对应目录 | `.qoder/agents` / `.qoder/commands` | 顶层 `.md` 基名集合 |
| `hooks-md` | 库 `L0/hooks` 的 `.md`（实测 1 个：`hook-registry.md`） | `.qoder/hooks` 的 `.md` | v9.0.0 起本目录只落注册表，不落 hook 脚本——库内 13 个 `.ps1`/`.sh` 孪生已删除，全部注册 hook 经 `node .qoder/scripts/harness.mjs hook <name>` 单入口执行。hook 数量改由 Check 2 按 `settings.json` 注册的 `harness.mjs hook` 子命令核对，与文件数彻底解耦 |
| `spec-templates` | 库 `L0/spec-templates` | `docs/harness-templates` | 文件数；Task 6.1 起目标侧还收 `deps-template.yaml`（来自 `assets/templates/contract-governance/`），因此目标比来源多 1 属预期，不是漏复制 |
| `scripts` | `assets/templates/scripts` 顶层 | `.qoder/scripts` 顶层 | 文件数；脚本层自 v9.0.0 起只有 `.mjs` 一种载体（实测 5 个，期望值取 `manifest#componentCounts.scripts` 单源，harness-verify V1 另把项目内 `scripts/*.ps1|*.sh` 判为"残留已删资产"FAIL）。`.qoder/scripts/` 顶层还会再多 1 个 `contract-drift.mjs`（源自 `assets/templates/contract-governance/`，计入 `contract_drift_scripts` 维度），故 V22 单独判它的在场 |

target 侧使用**换名前的虚拟视图**（磁盘现存 ∪ 本次计划写入，计划覆盖现存），因此首次初始化和幂等复跑走同一份对账。另有存在性清单 `AGENTS.md`、`docs/PROJECT-LIVE.md`、`.qoder/settings.json`、`.qoder/techstack-commands.json`、`.qoder/briefing-skeletons.md`、`.qoder/harness-profile.json`。任一不符 → `PHASE-A-COPY-FAIL:reconcile-failed` 并逐项列出 source/target 差异，staging 丢弃、目标项目未被写入。**面板产物 `docs/PROJECT-LIVE.html` 不在对账内**：面板在换名**之后**才跑得起来（需要 `.qoder/scripts/build-panel` 已落盘），而对账在换名**之前**——旧 `.ps1` 之所以能断言它，是因为把面板排在对账之前，S4 契约反过来后该断言移到面板处（改为"退出码 0 且产物存在且非空"）。

**AI 现写脚本纪律（临时件与判定，违反必踩坑）**：

1. 临时脚本只准落 `.qoder/logs/tmp/`（与 audit-log hook 写入的 `.qoder/logs/audit-*.log` 分区，避免混淆），命名 `*.tmp.ps1` / `*.tmp.sh`，任务收尾必须删除。
2. 现写 `.ps1` 必须 UTF-8 with BOM，否则 PowerShell 5.1 按 GBK 解码，脚本内的中文字面量与其比对结论双双失真（实测教训：一次无 BOM 的检查脚本对内容正确的文件报 `False`，被误判为"文件损坏"）；更稳妥的做法是现写脚本只含 ASCII 字面量，中文内容一律改用 Read 工具读回判断。
3. 结论判定只依赖退出码 + 文件读回（`[System.IO.File]::ReadAllText($p).Contains($needle)` 或 Read 工具），不得依赖控制台中文输出；需要人读时先 `chcp 65001`。
4. 严禁用 `powershell -Command` 内联承载带 `$` 变量的逻辑（变量在参数解析阶段被展开；实测三次解析错误）；带变量的逻辑一律落 `.ps1` 用 `-File` 执行。
5. 严禁用 ripgrep 类 Grep 工具校验超长行文件（压缩件与 3MB 级成品 HTML 的最长行实测 299,852 字符），见 `panel-engine-rebuild.md` §4 禁忌 2。

**跨平台口径（v9.0.0 起）**：三平台同一条命令（`node …/phase-a-init.mjs --project-root <项目根>`），不存在"平台分支执行器"。执行器内只剩**一处取值分支**且不改变语义：`.qoder/settings.json` 取 `settings.json.template`（Windows）或 `settings.linux.json.template`（其余）——两份模板已同构，`command` 一律是 `node .qoder/scripts/harness.mjs …`，注册表同源。面板实现三平台同一份 `build-panel.mjs`（旧的"Windows 走 PowerShell、其余走 bash"分派随两份孪生一并删除）。

旧段落的"Linux/Mac 仅 3 个 hook 具备拦截力、其余 7 个为 `exit 0` 占位版、旧 shell 校验器的 Check 2 只数 `.sh` 文件数故占位版同样 PASS"整块责任边界，随 bash 孪生一起失效：hook 逻辑现在只有一份（`harness.mjs` + `hook-*.mjs`），三平台同进同退，不再需要"按平台披露拦截力"。**新的单点风险**是 `node` 在宿主环境是否可达——全部 hook 静默空转的失败模式与旧版占位桩不同（旧版是"明确无拦截力"，新版是"进程起不来"），探活属 U3 未自测项。⚠️ 本轮整改只在 Windows 实测，非 Windows 侧（含 `.sh` 残留路径）一律为**未实测**结论，`tools/phase-a-equiv.mjs` 的孪生对账两例在非 Windows 下转 SKIP。

<details>
<summary>历史参考正文（v8.2.1 内嵌 PowerShell 复制正文 → phase-a-init.ps1 → phase-a-init.mjs；仅供口径追溯，禁止照抄执行）</summary>

原正文的"目录先行 → 六类 Copy-Item → 种子与脚本复制 → build-panel 调用 → 计数对账"五段逻辑先 1:1 物化进 `assets/templates/scripts/phase-a-init.ps1`（该文件已随 v9.0.0 单语言化删除），再由 `phase-a-init.mjs` 端口承接，并做两处修正：`Copy-Item -Force` 无条件覆盖 → 哈希比对受保护复制；`skills-allfiles` 对账 → 排除 `better-coding` 自身子树。此处不再保留需 AI 重抄的 80 行正文（转抄即失真源）。当时并列记录的 `robocopy` 降级方案（针对 `Copy-Item` 通配符 + 变量路径在点开头目录失败）**已随 v9.0.0 单语言化一并作废**：执行器不再经过 `Copy-Item`，该失败模式无从触发，而"手写复制命令兜底"这条路本身已被禁止（见 A.1「无手工复制降级路径（有意为之）」与 `PHASE-A-NO-EXECUTOR`）。

</details>


**不复制（保留在 SKILL assets 中，阶段 B 按需读取）：**
- `assets/library/L1-techstack/` — 技术栈组件
- `assets/library/schemas/` — artifact 依赖唯一权威源（reference-only，随 /harness-next 从 skill 目录读取，不单独落盘）
- `references/`（本目录，SKILL 根下，**不在 `assets/library/` 下**；naming-convention.md / stage-agent-skill-map.md 在此）— 库级参考（reference-only，不落盘）
- `assets/templates/L2-project/` — L2 项目模板
- `assets/templates/numbered-workflows/` — 编号工作流（Task 6.2：引擎 + 变量表 + 7 步工作流 + 6 份栈计划）。**阶段 A 与阶段 B 都不落盘**，宿主 skill 从库内直读（项目级安装路径 = `.qoder/skills/better-coding/assets/templates/numbered-workflows/`）；落项目的只有运行产物 `<项目>/.scaffold/step<id>.mjs`。因此本清单没有它的复制行，`harness-verify` 也没有对应期望值——这是有意的少一份装配账，判据在 `tools/checks/34-numbered-workflows.mjs`

## A.3 创建 .qoder/harness-profile.json

`harness-profile.json` 由 `phase-a-init` 从 **`assets/templates/harness-profile.template.json`** 生成（v8.3.0 起模板资产化——本步原先要求 AI 逐字抄写 50 行 JSON，转抄是唯一错源）：

- 注入两个 token：`{{SKILL_VERSION}}` ← `manifest.json#version`（机器读取，不手写）、`{{INIT_DATE}}` ← 本地日期（`sync.lastSyncAt` 与 `history[0].date` 两处）
- 写出后脚本立即 `ConvertFrom-Json` / `json.load` 回读校验，非法即 exit 1（结构完整性另有 harness-verify Check 3 兜底）
- **已存在 `.qoder/harness-profile.json` 时整体保留**：profile 是项目状态（成熟度 / 同步记录 / incidents / syncCount / 已装配记录），二次初始化与升级回源都不得覆盖；脚本以 `profile_preserved` 显式报告
- 改字段一律改模板（唯一事实源），不在本文件维护第二份 JSON；字段语义见下方两节说明

初态字段快照（供人工核对，实际以模板为准）：`maturity` 四项 false｜`techstack` 四列空｜`project.apps=[]`（v9.10.0：应用清单唯一权威，1·1 Step 0 之前必须为空）｜`appType=Full-Stack`｜`skipPrototype=false`｜`iterateBranch` 为 null｜`assembled.l0=true`｜`sync.syncCount=0`、`lastSyncSource=init`｜`pendingPlaceholders.agents.md` 十项 `status: empty`、`autoFillable: true`｜`history=[init]`｜`incidents=[]`。


> **字段说明（模板初态快照之外的字段）**：
>
> | 字段 | 类型 | 取值域 | 说明 |
> |------|------|--------|------|
> | `appType` | string | `"Backend-Only"` / `"Full-Stack"` | 应用类型（Step 0 确认）；v9.10.0 起为 `project.apps[0].type` 的**派生镜像**（单应用必须逐字相同，多应用不再是权威），仍是手册分支折叠依据 |
> | `project.apps` | array | 每项 `{name, type, source}` | **v9.10.0：应用清单唯一权威源**。`name` 进 `docs/prd/PRD-{应用}.md` 文件名（不得含空格与 `/ \ : * ? " < > |`、数组内唯一）；`type` 同上枚举；`source` 必须标 MRD 章号 + 日期（P4 可推导项标来源）。写入方＝1·1 Step 0（`/create-proposal`），hook 不写它；机器核对＝判据 `apps_single_source` 与 `binding_stale` |
> | `skipPrototype` | boolean | true/false | Backend-Only 时 true |
> | `iterateBranch` | string/null | `"新功能"` / `"缺陷"` / `"重构"` / null | 环节9迭代分支 |
>
> 写入时机：`appType`/`skipPrototype` 在 create-proposal Step 0；`iterateBranch` 在环节 9 变更分诊（步骤 9·1）。UI 自 v9.0.0 起单路线两步，**不再有路线字段**（原 `ui.designRoute` / `ui.evidence` 等四字段随选路一并退役，模板里也不再留 `ui` 对象）。

> **incidents 字段说明（v4.0.0，Ratchet 经验回流）**：记录调试修复/返工/审查发现等真实失败事件，每条结构：
> `{ "id": "INC-001", "date": "YYYY-MM-DD", "type": "bug|rework|review-finding|retro-item", "summary": "一句话", "rootCause": "...", "disposition": { "kind": "rule|skill|hook|memory", "target": "目标资产", "status": "proposed|applied|verified" }, "verifiedIn": "后续任务标识" }`
> 写入时机：harness-continuous-sync 步骤 1；提案落盘须经用户确认（/retrospective 驱动）。

## A.4 完成校验清单

> 机器覆盖项以 harness-verify 输出为准（**本文不写条数**——条数随版本增长，写死必然脱账；v9.6.1 起按此口径），以下只列**机器未覆盖、需人工核对**的项；成对计数类条目已折叠至文末附录。

- [ ] `.qoder/settings.json` 的 PreToolUse 数组含 `matcher: "AskUserQuestion"` 条目（ask-card-guard 已注册，配套规则 ask-card-option-quality.md）——Check 5 只校事件级键存在性，不校 matcher
- [ ] `assets/templates/harness-profile.template.json` 已作为 profile 生成源（库侧流程约束：改字段先改模板，不在文档维护第二份 JSON）
- [ ] **无静默覆盖 + 报告形状核验（v9.6.1）**：脚本侧不变——`phase-a-init` 的 stdout 仍必须如实输出 `customized_skipped`、`profile_preserved`、`stubs` 三项。会话侧按 `A.5-①/②` 六槽核对，**不再核对任何"固定文案"**（固定首屏已作废）：① 结论行的符号与措辞可由「打印串 + 校验 status + 产物 stat」三件事实推出，三件没全好不得出现 `✅`；② 结构树里**每一项都能被 `stat` 证实**，磁盘没有的不得出现；③ 「没做成的事」条数 == 校验的 SKIP+WARNING 行数 + 应落盘差集数（去重后须数得回来），且不得写成"全部通过"；④ 排版过 `A.5-⑤` 五条（树进 `text` 围栏、无导语、12 个禁用 token 命中 0 次——比对前先剔白名单字面、不给门禁道数）；⑤ `.qoder/logs/init-report.md` 已落盘且五节齐。首次初始化前两项应为 0/false、`stubs` 应为 0，属正常；**三项计数不得因"看起来正常"而从明细里省略**（不变式 K3：换形状不减披露）
- [ ] **白话覆盖判据已 PASS**：`report_reason_coverage` 一行不得是 FAIL 或 SKIP——它保证 18 种失败/未完成态每一样都有一句人话说法（`A.5-④`），漏哪条它点名哪条
- [ ] profile 包含 appType 字段（Full-Stack/Backend-Only）与 `iterateBranch`（环节 9 分支）——Check 3 只校顶层必建字段，不下钻子字段
- [ ] `docs/prd/`、`docs/arch/`、`docs/spec/` 目录已创建（docs/spec/ 采用「一功能一目录」`NNN-slug/` 约定，兼容旧扁平文件）
- [ ] 浏览器双击打开 `docs/PROJECT-LIVE.html` 能看到 C4 三视图区的三张“示意”前缀最小示意图、技术栈四列“待检测”（机器只校结构与引擎，渲染体验靠人看）
- [ ] **可读性人工抽验（v8.4.0）**：仅看手册中任意一步的提示词代码框，能在不追问 AI 的情况下答出：要准备什么（完整路径）/ 参考哪个格式 / 产物落在哪 / 几位专家各干什么（1·1）/ 什么算做完——这一项由用户判定，不得自证

<details>
<summary>机器已覆盖项（harness-verify 逐项输出，仅供口径追溯，无需人工重复核对）</summary>

- [ ] `.qoder/rules/` 有 17 个规则文件（按 basename 去重计数，过渡态 .md/.mdc 都算；改名后全为 .md（16 个 L0 核心（含领域词汇本 + ask-card-option-quality + v9.7.0 的 harness-runtime-gates）+ 1 个 harness-continuous-sync 自维护）—— Check 2
- [ ] `.qoder/skills/` 下有 26 个 L0 skill 目录（含 harness-analyze、ui-design、integrate-modules）。**排除口径**：本 SKILL 自身安装在 `.qoder/skills/better-coding/`，与 26 个 L0 skill 同层；`phase-a-init` 对账与 harness-verify Check 2 已统一排除该目录，因此两处报 `26/26` 均为预期结果（不是漏装）
- [ ] `.qoder/agents/` 有 3 个 .md（architect / ops-agent / spec-review-agent，含 skills/mcpServers 绑定）—— Check 2。阶段 B 若确认装配可选专职专家（planner / developer / test-runner / security-auditor）则按 4+ 计，Check 2 对 agents 为**下限**校验而非精确相等
- [ ] `.qoder/commands/` 有 6 个 .md（start-dev/check-project/harness-next/harness-assemble/harness-upgrade/live-refresh；harness-verify 对此目录为**精确相等**校验。v9.0.0 存量项目升级后若仍有 integrate.md / iterate.md 属残留，删除后复跑）
- [ ] `.qoder/hooks/` 只有注册表 `hook-registry.md` 一份 `.md`，不含任何 hook 脚本（v9.0.0 起库内 13 个孪生脚本已删，全部 hook 经 `node .qoder/scripts/harness.mjs hook <name>` 单入口执行，含 ask-card-guard）。hook 数 = `settings.json` 注册的 `harness.mjs hook` 子命令去重集（**口径在此，数字不钉**——钉了就必然过期，Check 2 实跑为准），由 Check 2 按注册项核对而非按文件数 —— Check 2
- [ ] **跨平台口径（v9.0.0 起）**：`.qoder/hooks/` 三平台同构，`command` 一律 `node .qoder/scripts/harness.mjs …`。**旧的"Linux/Mac 仅 3 个 `.sh` 具备拦截力、其余 7 个 exit 0 占位、旧 shell 校验器只数文件数故占位版也 PASS"三条口径一并作废**——拦截力不再随平台分叉，单点风险改为 `node` 可达性（见上文「跨平台口径」）。非 Windows 侧本轮未实测
- [ ] `.qoder/settings.json` 存在且 JSON 合法；`.qoder/scripts/` 顶层 6 个脚本全部为 `.mjs`：台账 `scripts` 维度的 5 个（`phase-a-init` / `harness` / `hook-ask-card` / `harness-verify` / `build-panel`，期望值取 `manifest#componentCounts.scripts`）+ Task 6.1 的契约漂移检测器 `contract-drift.mjs`（期望值取 `manifest#componentCounts.contract_drift_scripts`，由 V22 判在场，与 `docs/harness-templates/deps-template.yaml` 同判）；项目内若残留旧版落盘的 `.ps1`/`.sh` 脚本，V1 会判为"残留已删资产"FAIL；存在性由 Check 2 的 scripts 对账、V22 与 phase-a-init 落盘断言共同兜底
- [ ] 根目录 `AGENTS.md` 存在且无 `【__xx__】` 与未注入的 `{{TOKEN}}` 残留（单一事实源；.qoder/ 下不再落盘 AGENTS.md；两类残留均由 Check 1 拦下）
- [ ] **Check 7d `live_profile_drift` 通过**：AGENTS.md 与 PROJECT-LIVE.md 的同步日期/校验计数/校验结论与 `harness-profile.json` 权威值一致（stop-verify hook 回写后文档滞后一个周期会被此项拦下）
- [ ] `.qoder/techstack-commands.json` 与 `.qoder/harness-profile.json` 存在且 JSON 合法（profile 含 sync + pendingPlaceholders + incidents）—— Check 3
- [ ] `docs/PROJECT-LIVE.md` 存在（3 分区（另有独立交接面 docs/项目交接.md）标记（含页脚）齐全，workflow 区含 mermaid 与提示词代码）—— Check 7
- [ ] **提示词形态三项（均 FAIL 级）**：Check 7e `prompt_selfcontained`（22 个步骤提示词代码框含形状 B 八个白话标签 + 「做完之后」收尾行，且不短于 160 字）、Check 7f `prompt_plain_language`（骨架『用户语言禁词表』白名单外 0 命中）、Check 7g `expert_panel_inline`（1·1 含 6 位专家名或标『待确认』）；旧版手册无 #### 区块时三项 SKIP 不阻断
- [ ] `docs/PROJECT-LIVE.html` 存在（由 `.qoder/scripts/build-panel.mjs` 产出且自验通过（V1-V7，退出码 0）；含 SYNC_DATA:BEGIN/END 标记与 `__mermaidElk` 引擎，无 `PROJECT_NAME` 残留；成品校验**不做 `/*__MERMAID_BUNDLE__*/` 全文检测**——实测当前 bundle 内该字符串出现 0 次，是否残留由 build-panel V2 精确对账在构建期兜底，校验期依赖 `__mermaidElk` 引擎存在性 + SYNC_DATA 结构检查）—— Check 7
- [ ] `.qoder/briefing-skeletons.md` 存在；`docs/harness-templates/` 有 10 个 Spec 模板—— phase-a-init 对账项 spec-templates 与落盘断言

</details>


## A.4.5 首次同步（初始化后立即执行）

初始化完成后执行一次同步，但**分工按 `sync-scope.json` 落实**（v9.4.0 S5：确定性动作已由 `phase-a-init` 的 `firstSync()` 代做）：

1. **步骤 1**：读 `.qoder/logs/sync-scope.json` → `scriptedFirstSync` 内的项（项目结构、profile 记账）**不得重做**；`scriptedFirstSyncSkipped` 内的项由 AI 补做并在报告点名；AI 本步只做 `aiDecided` 四项（词汇本 / 交接面 / 团队规范 / 经验索引），`notDerivable` 项保持"待检测"、`derivable` 中未被代做的项才由 AI 填并标来源，禁止编造。snapshot / footer 两分区按细则再生成，`skipRender` 命中的分区不重渲。
2. **步骤 2**：同步分工的**计数明细进 A.5-③ 第 3 节**（`.qoder/logs/init-report.md`：脚本代做 N 项｜AI 判断 M 项｜不可推导保持「待检测」K 项｜`skipRender` 命中分区及 reason），会话里只留一句人话（例：「结构和状态已自动记好，规范/词汇/经验索引这三项要等你告诉我才动」）。**下一步指令建议照旧给**（提示用户直接输入 `/create-proposal` 开始环节 1）。不得因为"数字不进会话"就省掉记录——不变式 I2。
3. **步骤 3**：运行 harness-verify 并记录校验结果（`syncCount` / `lastVerify` 仍只由 stop-verify hook 回写，AI 不手填）

> **只有「阶段 A 首次同步 + 空项目」这一种组合允许步骤 1 的确定性动作由脚本代做；其余任何触发事件命中时，仍按 `live-refresh.md` 细则完整执行——`skipRender` 未覆盖的任一区必须全量重渲，`derivable` 中不在 `scriptedFirstSync` 内的项仍由 AI 填并标来源。**
> **v9.3.0 S5 的渲染范围收敛保留**：`skipRender` 内的分区（空项目上的手册 workflow 区、无 ARCH 时的面板三段图）不重渲，只写一行「无可绑定内容（依据：reason 字段）」——省的是重渲，不是判据。
> ⚠️ **已删除的旧理由**（v9.4.0 S6）：原文要求"即使初始化时无项目信息也必须完整执行 3 步同步，为了建立『同步 = 3 步全做』的执行模式"。该动机不再靠初态陪跑兑现——真正的驱动力是三处已在场的机制：`harness-continuous-sync` 的 6 类强制检查点、sync-detector 钩子的新文档提示、`live_profile_drift`（Check 7d）的机械位同源对账。用一次实测约 25 次工具调用的仪式去换本该由机制提供的可靠性，成本模型不成立；上面那句硬约束才是防"以后都能省"的承担者。

## A.4.6 首次校验（同步后验证）

首次同步完成后，立即运行校验脚本确认装配完整性：
1. 三平台同一条命令：`node .qoder/scripts/harness-verify.mjs`
2. 确认 `status: PASS`，若 FAIL 则根据明细修复后重试

## A.5 输出报告（面向用户 · v9.6.1 **按事实生成**，模板只管形状）

**这一节管形状，不管内容。** 六个槽位各有取数来源，内容一律来自当次真实运行：执行器打印的串、`harness-verify` 的 `status`、磁盘上到底有什么。**模板里不留任何一句可照抄的结论**——v9.6.0 那份固定首屏（19 行树 + 一句固定 ✅）自本批作废，理由见 A.5-⓪。全程零提问（`SKILL.md` 设计原则 P1）；口径受骨架 §三 禁词表（v9.6.0 延伸格：射程含会话汇报）与 A.5-⑤ 呈现规范约束。

### A.5-⓪ 为什么推翻固定模板（防止被改回去）

固定文案与真实结果之间没有绑定关系，只能靠"态表"去堵，而失败态有 18 种、态表永远会漏第 19 种。实测已经撞上两次：① 真实装机把 19 行树糊成一行（模板没规定排版）；② 面板拼接失败时，固定树里"可视化面板…双击即开"那行就成了假话。本批改成：**产物描述句的成立条件 = 该产物在磁盘上真实存在**，虚报在结构上不可能发生，而不是靠纪律。附带作废：v9.6.0 的"首屏 1678 字 / 37 行 / 树 19 行"三条断言——内容随事实变之后，任何"等于某个数"的断言都是新的造假压力，一律换成集合断言。

### A.5-① 六个槽与取数规则

| 槽 | 内容来源（取数） | 取不到数据时怎么写 | 禁止 |
|---|---|---|---|
| **① 结论行** | 三件事实：执行器打印串（A.2 S5 令牌）／`harness-verify` 的 `status`／产物实存数（`stat`）。取法见 A.5-② 真值表 | 三件任一取不到 → 一律 `⚠️` + 「没能确认（依据：…）」 | 三件没全好不许 `✅`；不得写 `status: PASS`、「校验通过」「复跑确认」；不得并列"成功 + 另外还有失败" |
| **② 结构树** | **`A.2 应落盘清单 ∩ 磁盘 stat`**；只到目录层，不列用户业务目录 | 交集为空（零落盘）→ 整槽不发，改一句「项目里一个文件都没动」 | 磁盘上没有的条目不得出现 |
| **③ 核心文件** | ② ∩ {`AGENTS.md`、`docs/PROJECT-LIVE.md`、`docs/PROJECT-LIVE.html`、`docs/项目交接.md`} | 缺席的那个**整条不写**（不写"（这次没生成）"这类补丁句，解释归槽④） | 不得出现"双击即开"等有产物依赖的形容 |
| **④ 没做成的事** | 应落盘差集 + 校验非 PASS 的行 + SKIP/WARNING 行 + git 现状里的未完成项 | 一条都没有时也要写：「这次没有没做成的事；但 N 项要下次会话才判得到」——**仍不得写"全部通过"** | 不得省略、不得合并计数、不得把 SKIP 说成通过、不得给门禁道数 |
| **⑤ 下一步** | ④ 为空且 `status: PASS` → 指向手册「环节 1 · 步骤 1」；④ 非空 → 给"修这一件的两条选择"；零落盘 → 按 `SKILL.md:45` 第 ④ 类发卡 | 取不到可执行建议 → 只说「告诉我你想先看哪一处，我来查」 | 失败态不得继续推销后续流程 |
| **⑥ 明细指针** | 固定路径 `.qoder/logs/init-report.md`（**模板里唯一固定的文本**） | — | 不得改放 `docs/`（交付物区不放装机台账） |

### A.5-② 结论行真值表

| 打印串 | status | 应落盘差集 | 结论行形状 |
|---|---|---|---|
| `PHASE-A-COPY-OK` | `PASS` | 空 | `✅` + 一句这套框架干什么（描述性，不含结果断言） |
| `PHASE-A-COPY-OK` | `PASS` | 非空 | `⚠️` + 「文件装好了，但有 N 处该在的没在：<点名>」 |
| `PHASE-A-PANEL-FAIL`(2) | 实测必伴两条红 | {`docs/PROJECT-LIVE.html`} | `⚠️` + 「框架文件都在，只有可视化面板没拼出来：<build-panel 第一条原因的白话>」——**必须点名面板**，不得被泛化句盖掉 |
| `PHASE-A-COPY-FAIL:<原因>`(1) | 未跑或 FAIL | 视回显 | `⚠️` + 「没装上：<A.5-④ 对应行人话>。已落盘 <N> 件／已回滚 <M> 件」（件数取 stdout，不猜） |
| `PHASE-A-NO-EXECUTOR`／第 0 步门槛未过 | 未跑 | 全缺 | 发选择卡，**不发六槽报告**（等待确实改变产出） |

叠加：多态并取时，**先看落盘（态 4/5 优先），再看差集**；标题只有一个。

### A.5-③ 明细文件（必落盘：`.qoder/logs/init-report.md`）

由 **AI 写**（脚本不产出该文件），开头一行固定写 `以下数字由脚本 stdout 原样落档，AI 不改写`，随后五节：

| 节 | 内容 | 数据出处 |
|----|------|----------|
| 1 落盘构成与计数 | rules/skills/agents/commands/hooks/scripts 各 N 件与总文件数；`docs/` 清单与面板产物的**实际状态**（存在／字节数／缺席） | `phase-a-init` stdout + A.2 落盘清单 + `stat` |
| 2 计数器与放行分支 | `customized_skipped`、`profile_preserved`、`identical_skipped`、`stubs`（为 0 也写 0）；设计上显式放行的那几道点名 | 同上 + `hook-registry.md` |
| 3 首次同步分工 | 脚本代做 N 项｜AI 判断 M 项｜不可推导保持「待检测」K 项｜免重渲分区及 reason | `.qoder/logs/sync-scope.json` |
| 4 自检逐行结果 | 全行结果与 PASS/FAIL/WARNING/SKIP 分布（**本文不写条数**，以输出为准）；每条 SKIP 写明原因 + 下一轮是否自动补判 | 校验输出 |
| 5 git 现状 | `profile.git` 全字段 + `git_ready` 等级 + 三档语义 + 首问位置 + 残余窗口一句 | profile + `[git-probe]` 日志 |

⚠️ **禁止手写**：不得为了"看起来完整"编造任何一节的数字；取不到的写「未获取（依据：…）」。第 4 节的 SKIP 项**不得改写成 PASS**——这是 v9.4.0/v9.5.0 记在案的自锁类判据的诚实出口。

### A.5-④ 失败原因 → 人话对照表（会话里怎么说"为什么没装上"）

> **唯一白话源**。取值源仍是 A.2 的 `die()` 枚举行（"新增原因只扩这个枚举"），本表负责"怎么说人话"。规则：**先扩枚举、再补本表**；任一侧漏了，判据 `report_reason_coverage` 报 FAIL 并点名缺哪条。"默认落盘预期"只是预期，**实际件数一律以 stdout 回显为准**。

| 可观测串 | 会话第一句怎么说 | 默认落盘预期 |
|---|---|---|
| `runtime-missing` | 这台机器上没有能用的 Node，装框架的脚本跑不起来 | 零落盘 |
| `runtime-too-old` | 这里的 Node 版本太旧（低于框架要求的最低版本），脚本拒绝写入 | 零落盘 |
| `missing-project-root` | 没能确定要装到哪个目录，我先没动任何文件 | 零落盘 |
| `self-contamination-guard` | 目标目录就是框架自己的目录，为避免自我覆盖已停止 | 零落盘 |
| `not-writable` | 目标目录不能写（权限或被占用），一个字节都没落 | 零落盘 |
| `locked` | 有另一次初始化正在同一个目录上跑，本次直接退出以免互相踩 | 零落盘 |
| `missing-asset` | 框架安装副本缺了一份应当分发的组件文件，缺哪个我点名给你 | 零落盘或已回滚 |
| `missing-template` | 框架安装副本缺了一份模板文件，缺哪个我点名给你 | 零落盘或已回滚 |
| `token-residual` | 有模板里的占位符没被替换成真实值，我按不完整处理，不落半成品 | 已回滚 |
| `manifest-invalid-json` | 框架自身的版本台账文件（`manifest.json`）不是合法 JSON，我连该装哪个版本都确定不了，先停下 | 零落盘（保留原文件） |
| `profile-invalid-json` | 现有项目状态文件不是合法 JSON，我不会覆盖它，先停下 | 零落盘（保留原文件） |
| `settings-invalid-json` | 现有 hook 配置文件不是合法 JSON，同上先停下 | 零落盘（保留原文件） |
| `hook-target-missing` | 有门禁要执行的入口文件不在，装上等于零拦截力，所以不装半套 | 已回滚 |
| `reconcile-failed` | 落盘前对账没过（该写的和准备写的不一致），已停止 | 零落盘 |
| `exception` | 脚本遇到没预料到的错误，原始报错在明细里，我按已回滚处理 | 已回滚（逐项点名） |
| `PHASE-A-NO-EXECUTOR` | 框架的执行脚本本身找不到，我不能手写复制命令代替它（会漏步骤），请确认安装位置 | 零落盘 |
| `PHASE-A-PANEL-FAIL` | 框架文件都装好了，只有可视化面板这次没拼出来（手册与门禁不受影响） | 半落盘：仅缺 html |
| `PHASE-A-ROLLED-BACK` | 中途失败，已把动过的文件逐项还原；没能还原的我逐个点名 | 部分还原，逐件点名 |
| 第 0 步门槛未过（发卡） | 不发报告；三条选择：你自己装 LTS（推荐）／我装免安装版只救这一次／先不装 | 零落盘 |

### A.5-⑤ 呈现规范（发之前先过这五条，与内容无关）

1. 目录树**整块放进 `text` 代码围栏**，逐字符照抄取数结果（含 `├─` 与对齐空格），一行不许并、不许改表格；
2. 各段标题用 `**加粗**`；要点行保留行首 `- `；段与段之间留一个空行；
3. `{一句话想法}` 这类花括号占位、路径、命令一律原样（白名单），**不得**替用户填值；
4. **第一条输出就是结论行（槽①）**，前面不得有任何导语。点名禁止：「以下是装机首屏」「初始化完成，校验通过（status: PASS…）」「复跑确认」。机器口径不得进会话，这 13 个 token 为硬禁：`customized_skipped`、`profile_preserved`、`stubs`、`case_fixed`、`identical_skipped`、`skipRender`、`scriptedFirstSync`、`aiDecided`、`notDerivable`、`harness-verify`、`git_ready`、`mode =`、`PHASE-A-`。**扫描前必须先剔白名单字面**（路径、模板文件名、命令、构建命令），否则目录树里合法的文件名会因子串命中而假阳性；
5. **不给门禁道数**：同一事实有三种口径（可阻断的 4 道／恒 `exit 0` 的 5 道／平台支持 `exit 2` 的事件 7 类），现场推算必错；只说「能拦的当场拦，只记录/提示的那几道见明细」。

### A.5-⑥ 复跑与升级场景

- 二次初始化 / 升级回刷：槽①②③ 全部按磁盘实况重新取数（复跑时树通常与首装一致）；`profile_preserved = true` 或 `customized_skipped > 0` 时，槽④ 必须用白话说「你有 N 处自己改过的内容没被动过」。⚠️ **不得把已知自填形态说成用户定制**：任何项目的二次跑都会稳定出现 `customized_skipped=1`，成因是脚本自己回填过 `AGENTS.md` 的项目结构节（v9.4.0 起执行器已识别该假阳性并单独回显，见 `agentsSelfFilled` 分支）——此时按回显原话讲清「其中 1 处是框架自己填的项目结构，不是你改的」。
- `--repush-scripts-only`：只回刷脚本，不发结构树；结论行按当次回显写「脚本层已按库回刷 N 个，项目状态与你改过的内容未动」。

### A.5-⑦ 渲染示例（**只示意形状，禁止照抄内容**）

面板拼接失败那一跑的报告应当长这样（换成别的态时，每一句都得跟着磁盘事实变）：

````
⚠️ 框架文件都装好了，只有可视化面板这次没拼出来

**装到哪了（只列这次真落在磁盘上的）**

```text
项目根
├─ AGENTS.md
├─ .qoder/   rules / skills / agents / commands / hooks+settings.json / scripts / logs
└─ docs/     PROJECT-LIVE.md、项目交接.md、harness-templates/、prd arch spec/
```

**没做成的这一件**
- 面板需要 Mermaid 引擎，本次解压后哈希不符（原始报告在明细）→ 现在没有 docs/PROJECT-LIVE.html。这一件没成，不算已通过。
- 另有 3 项这轮判不了：面板观感与"提示词能否照着一次做完"要你来判；门禁运行痕迹要等下次会话和一次收工才出现，下次自动补判。

**你挑一条**
1. 我现在按同一份数据重拼一次面板（推荐，几十秒）；2. 先开工，面板等你有空再补，手册和门禁都不受影响。

完整明细在 .qoder/logs/init-report.md
````

> 示例里的树**比正常装机短**，正是因为那一跑磁盘上确实少一个文件——这就是"按事实生成"和"照抄模板"的区别。

