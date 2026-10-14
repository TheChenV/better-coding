# 阶段 B：演进式装配协议

> 本文件由 SKILL.md 引用，包含阶段 B 的完整装配流程、重配与升级协议。

## B.1 信息收集（不问用户，从产物推导）

1. 读取 `.qoder/harness-profile.json`
2. 扫描信号文件，更新成熟度：

| 信号文件 / 迹象 | 推断 | 动作 |
|-----------------|------|------|
| `requirements.txt` / `pyproject.toml` | Python 后端 | 建议装配 L1 python |
| `package.json` 含 react | React 前端 | 建议装配 L1 react |
| `package.json` 含 typescript / `tsconfig.json` | TypeScript | 建议装配 L1 typescript |
| `pom.xml` / `build.gradle` | Java | 建议装配 L1 java |
| `go.mod` | Go | 建议装配 L1 go |
| `docs/prd/` 下出现 MRD*/PRD* | M1 需求明确 | maturity.prd=true |
| `docs/arch/` 下出现 ARCH* | M3 架构确定 | maturity.arch=true |
| `docs/spec/` 下出现 SPEC-BE*/SPEC-FE*（兼容两种布局：旧扁平文件或新「一功能一目录」`NNN-slug/` 目录内的同名文件） | M3 模块设计 | 从 SPEC 提取 API 约定 |
| 用户在对话中声明技术栈 | M2 | 等价于脚手架信号 |

3. 未识别的前端框架（vue/angular 等）：提示"库中暂无对应 L1 栈，建议装配 typescript 通用规则"

## B.2 生成装配建议清单（P5：建议而非提问）

```
📋 检测到信息成熟度【__M级别__】，建议装配：
| # | 组件 | 来源依据 | 动作 |
|---|------|----------|------|
| 1 | python-exception 等 6 条规则 | requirements.txt 检测到 Python | 新增 |
| 2 | python-build/test/deploy/fastapi-scaffold 4 个 skill | 同上 | 新增 |
| 3 | 领域术语表(L2 扩展，可选) | 项目有术语定制需求（L0 词汇本已阶段 A 落盘，日常词条写入 L0 词汇本即可） | 可选装配 |
| 4 | hooks 升级为真实逻辑（ruff） | 技术栈确定 | 更新 |
| 5 | ui-ux-pro-max 设计风格库（可选） | 检测到 react/vue 前端信号 | 可选安装 |
| 6 | planner / developer / test-runner / security-auditor 四个专职专家 agent | 中大型项目（多模块并行、专职测试与安全审查确有分工）；模板在 `assets/templates/L2-project/agents/` | 可选装配 |
回复：全部确认 / 调整【编号】 / 跳过
```

> **可选装配项说明（v4.0.0）**：检测到 react/vue 信号时，建议清单追加 ui-ux-pro-max（67 风格/161 配色/57 字体配对的设计知识库，官方支持 `uipro init --ai qoder`）。仅在用户确认后执行安装，并记入 profile `assembled.l1`。UI 设计的编排能力由 L0 `ui-design` skill 承担（优先调用 Qoder 内置设计类 skill）。

**禁止**：清单中出现"请告诉我你的技术栈"这类开放问题。

## B.3 执行装配（用户确认后）

1. **L1 复制**：从 `SKILL assets/library/L1-techstack/{stack}/` 读取 → 复制到 `.qoder/rules/`、`.qoder/skills/` 等
2. **L2 填写**：从 `SKILL assets/templates/L2-project/` 读取模板 → 按 B.4 规则填写 → 落盘 `.qoder/rules/` 等
3. **Hooks 激活（只注册 L0，宁缺毋假）**：
   1. L0 的 11 个 hook（v9.8.0 起含 `auto-finalize`）与技术栈无关，按 `assets/templates/hooks/HOOKS-ASSEMBLY.md` 的注册口径整批写入 `.qoder/settings.json`；
   2. **阶段 B 不为技术栈注册任何 hook**：栈级 lint 门禁由已注册的 `pre-commit-lint` 承担——它在 `harness.mjs` 内自行探测项目栈并直接运行对应 linter，探测不到即显式打印「跳过（不阻断）」，因此不存在「按栈再挂一个 lint hook」这件事；
   3. `.qoder/techstack-commands.json` 各栈的 `lint` 字段只用于指令集与 `/harness-next` 速查的命令预填，与 hook 装配无关；
   4. 任一 hook 的注册口径不完整时**不注册**，并在装配报告标注待补充项（禁止注册不可工作的占位 hook）。

   > **Hooks 激活表（v9.0.0）**：L0 hooks 为 **10 个**（post-edit-format、pre-commit-lint、pre-merge-review、pre-push-test、session-start-context、block-dangerous、audit-log、sync-detector、stop-verify、ask-card-guard），事件绑定与 `settings.json` 注册口径见 `assets/templates/hooks/HOOKS-ASSEMBLY.md` 与 `hook-registry.md`（唯一对照表）。v8.1.1 新增 ask-card-guard（PreToolUse / matcher=AskUserQuestion，选择卡 option.label 质量守卫，配套规则 ask-card-option-quality.md）。v9.0.0 起栈级 lint 占位 hook 已删除，门禁单源归 `pre-commit-lint`；仅当项目 `settings.json` 缺注册或注册口径不完整时，才重新执行上述子步。环节 6 联调能力以 **skill（integrate-modules，含《Mock 开关约定》一节）** 形态提供（v9.0.0 起命令外壳已退役，不再有 command 一层），不以 hook 形态提供（联调需人工/命令触发，不适合事件钩子）。
4. **profile 更新**：assembled.l1/l2 记录组件 id；history 追加记录

## B.4 L2 填充规则（P4 边界）

| L2 模板 | 预填（仅来自真实产物） | 挖空（绝不编造） |
|---------|------------------------|------------------|
| project-layer-dependency | ARCH 中的层级与依赖方向 | 模块命名细节、特殊豁免 |
| project-api-convention | SPEC-BE 中的 RESTful 约定、真实错误码 | 认证方案细节、资源前缀 |
| ~~project-domain-glossary~~ | **v8.5.0 起不再是 L2 组件**：词汇本唯一事实源是 L0 的 `project-domain-glossary`（阶段 A 即落盘，含纪律 + 空台账 + 通用命名缩写约定）。此前 L0/L2 两份同名不同结构的表 = 双事实源，且改名后会互相覆盖同一目标路径 | — |
| project-coding-standards | 从 package.json/Makefile 等读取的**真实命令** | 覆盖率阈值、团队约定 |

## B.5 指导中心同步协议（装配后强制执行）

1. 收集本次新增/变更的组件清单（rules/skills/agents/commands/hooks）
2. 执行 3 步同步再生成 `docs/PROJECT-LIVE.md` 的 managed-dynamic 分区（workflow/snapshot/footer 三分区：提示词手册按推导规则刷新含参数回填）与 `docs/PROJECT-LIVE.html` 的 SYNC_DATA 标记间数据块（DIAGRAMS 拓扑 + 节点状态徽标 + 技术栈；装配实况以 `.qoder/` 目录扫描为准；同步中确认的新术语写入 `.qoder/rules/project-domain-glossary.md`）
3. 为新增组件补录一句话说明（从 frontmatter 提取 description，禁止编造）
4. **内置能力检测（可执行动作）**：列出当前会话实际可见的 Qoder 内置 skills/子代理/MCP 清单（以环境实际检测为准，不臆测），与 AGENTS.md 可用能力段登记比对：新增项补录、消失项标注「当前环境不可用」，差异写入装配报告建议项（**不阻断**）
5. 更新 `.qoder/harness-profile.json`（assembled/maturity/techstack/sync 字段）
6. 输出同步报告：新增组件 W 条

## B.6 可发现性覆盖检查（强制，组件计数一致才算完成）

1. 列出 `.qoder/` 下全部组件（rules/skills/agents/commands/hooks/scripts）并统计，逐项对照 manifest 期望计数（v9.0.0 口径）：

   | 组件类 | 期望计数 | 校验方式 |
   |---------|---------|---------|
   | rules | **17**（= 库 L0 16 + 1 条自维护 `/live-refresh`；🔴 v9.12.0 全局 review 修：旧值 16 沿用了 v9.7.0 抬维前的「15 + 1」，与本表上方 README §三 与 harness-verify 现算式三处打架） | 下限校验（装配 L1/L2 后可多于 17） |
   | skills | **26**（库 L0；v9.0.0 吸收上游 ui-ux-pro-max 为 28；v9.0.0 起 5.3 五组聚类合并后为 27，v8.0.0 的 ui-design、integrate-modules 仍在册） | 下限校验 |
   | agents | **3**（库 L0：architect、ops-agent、spec-review-agent；planner、developer、test-runner、security-auditor 自 v9.0.0 起为阶段 B 可选装配，装配后按 4+ 计） | 下限校验 |
   | **commands** | **6**（start-dev、check-project、harness-next、harness-assemble、harness-upgrade、live-refresh） | **精确相等**（不得多也不得少） |
   | hooks | **11**（v8.1.1 新增 ask-card-guard，v9.8.0 新增 auto-finalize；v9.0.0 起数 `settings.json` 注册的 `harness.mjs hook` 子命令，不是 `.qoder/hooks/` 文件数） | 下限校验（宁缺毋假：未注入真实命令的 hook 不注册，可少于期望值但须在报告标注） |
   | scripts | **5**（`.qoder/scripts/` 顶层全部为 `.mjs`：`phase-a-init` / `harness` / `hook-ask-card` / `harness-verify` / `build-panel`） | **精确相等**（V1 同时把项目内残留的 `scripts/*.ps1|*.sh` 判为"残留已删资产"FAIL） |
   | spec 模板 | **11**（落于 `docs/harness-templates/`，不在 `.qoder/`。🔴 别与库维度的「spec 模板数」混读：库 L0 `spec-templates/` 现为 **10**（v9.12.0 删宪法模板），落盘侧另收 1 份来自 `assets/templates/contract-governance/` 的 `deps-template.yaml` ⇒ **落盘 11 = 库 10 + 1**，与阶段 A 对账行 `spec-templates: source 10 <= target 11` 同口径。本行钉的是落盘下限，不要改成 10） | 下限校验 |
   | schemas | **1**（`sdd-artifacts.yaml`） | **不计入落盘校验**：reference-only、库级不落盘，只确认 SKILL 库内可读 |

2. 检查 `docs/PROJECT-LIVE.md` 3 分区标记成对完整（workflow/snapshot/footer）+ 独立交接面 docs/项目交接.md，且 **workflow 区提示词手册为 v9.0.0 结构**：标题+区块格式（环节级核心使命/本环节产出目录 + 步骤区块的扫读字段：你要做的事/你会拿到/建议怎么用/提示词）、**环节标题数 == 9**（横切 Hooks 不占编号环节）、每环节下挂步骤区块（`#### N·k`），且步骤 token 只出现于标题前缀、未泄漏入提示词代码框内；**每个提示词代码框为形状 B 八个白话标签 + 「做完之后」收尾行，且未命中骨架『用户语言禁词表』（Check 7e/7f/7g 拦住）**；`docs/PROJECT-LIVE.html` 含 SYNC_DATA 标记与 Mermaid+ELK 引擎（无拼接占位残留、无 DASH_DATA 旧契约回潮）；`.qoder/briefing-skeletons.md` 存在且为 **9 环节 × 22 步骤子块**骨架（与手册结构同代，否则 Check 7c 按旧骨架误判；登记核对由组件计数承担）
3. 组件缺失/多出时在报告中显式提示（装配遗漏 → 补装配；多余 → 提示停用；**commands 不等于 6 一律视为装配不完整**，v9.0.0 存量项目最常见残留为已退役的 `integrate.md` 与 `iterate.md`，删除后复跑校验）
4. **装配完成后校验**：运行 `harness-verify` 脚本确认装配完整性（Check 2 组件计数 + Check 7/7a/7b/7c/7d/7e/7f/7g），`status: PASS` 才算装配完成

## B.7 输出装配报告

```
✅ 装配完成：新增 X / 更新 Y / 跳过 Z；指导中心已同步 W 条；覆盖率 N/N
⚠️ 待核对的预填项：（逐项列出文件与预填位置）
```

---

## 重配与升级协议

### 重配（"技术栈变了"）

1. 重新执行 B.1 信号扫描；对不再匹配的已装配组件：停用其组件并在装配报告与 AGENTS.md 可用能力段标注 `📌 已停用`（v6.0.0：注册表分区已移除）
2. 装配新匹配组件（走 B.2-B.6）

### 升级（“升级 Harness 组件”）

> 完整升级流程见 [references/upgrade-protocol.md](upgrade-protocol.md)，此处仅列简要步骤。

1. 对比 manifest.json 版本与 profile.skillVersion
2. 若不一致，生成变更清单并经用户确认
3. 按升级回源协议逐类回刷/合并（L0 整体回刷、AGENTS.md/教程双向合并、L1/L2 提示升级、profile 字段迁移）
4. 更新 profile.skillVersion 与 history
5. 运行 `harness-verify` 校验，`status: PASS` 才算升级完成

---

## Spec 模板使用方式

Spec 模板（MRD/PRD/ARCH/SPEC-BE/SPEC-FE/SPEC-TEST/SPEC-API/SPEC-DDL/task/SPEC-UI 共 **10 个**）在阶段 A 复制到 `docs/harness-templates/`。

> **v8.0.0 模板口径**：MRD 含 8 章节结构与多专家并行追问留痕位；PRD 为「按应用一份统一 PRD」含 Section4 交互流程（交互原型唯一输入）；SPEC-BE/SPEC-FE 含 Mock 台账与契约测试证据位（对齐 `integrate-modules` 的《Mock 开关约定》与环节 6 联调）；SPEC-UI 含输入引用与保真度定位、还原核对（视觉 diff P0-P3）验收位。

**使用方式**：当用户需要某个模板时，AI 从 SKILL assets 读取模板内容 → 复制到 `docs/` 对应目录 → 用户填写。

示例：用户说"帮我创建 PRD"→ AI 从 SKILL assets 读取 `PRD-template.md` → 复制到 `docs/prd/PRD-xxx.md` → 引导用户填写。
