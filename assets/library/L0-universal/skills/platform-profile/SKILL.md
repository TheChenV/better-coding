---
name: platform-profile
description: 当前运行环境（Qoder CN 桌面 App 0.1.x，product=qodercn）能力事实的唯一事实源。全库任何"平台能不能做 X"的判断都以本文件为准，其余 skill/agent/rule 只允许引用不允许复述。承载：只有 Coding/General 两种模式（无专家团、无 Quest，那是 IDE 端能力）、rules 只加载小写 .md 且 trigger 仅四值双向降级、无常驻字符上限、hooks 无目录自动发现、skill 按目录名解析且用户级遮蔽项目级、frontmatter 键白名单、AskUserQuestion 选择卡真实渲染契约、subagent 可并行但不可嵌套且不能向用户发卡、custom agent 的 tools 白名单不做别名归一、AGENTS.md 唯一指令文件名、加载时机不对称、小队/Squad 与 QODER_AGENT_TEAMS 的证据级别。触发方式：/platform-profile（怀疑某个平台能力不存在、或需要确认某条平台事实时读它）。
---

# 平台能力档案（新版 App 唯一事实源）

## 为什么需要这个文件

平台事实散在全库 200+ 处时，"平台升级"就得改 200 个地方，而且必然改漏——改漏的后果是文档教模型去做一件运行时不存在的事，表现为静默失效（不报错、不降级，只是什么都没发生）。所以：**能力事实只写在这里，别处只写"见 `/platform-profile`"**。

每条事实标注证据级别：
**[源码]** = 在 Qoder 自带运行时里读到实现；**[实测]** = 在本机跑过并看到结果；**[文档]** = 只有官方/第三方文档支撑；**[产物]** = 只看到安装包里的产物级证据，没跑过。

---

## 一、运行模式与协作形态 [源码+实测]

- 本机 `~/.qoder-cn/.qoder-app-status.json` → `product: "qodercn"`，`version: "0.1.8"`。
- 可用模式只有 **Coding / General**。
- 🔴 **没有「专家团」，也没有「Quest 模式」**。二者属于 Qoder **IDE**（文档命名空间 `docs.qoder.com/user-guide/*`），新版 App 的文档命名空间是 `docs.qoder.com/qoder/*`，两个命名空间不重叠。
- 官方继任者是**小队 / Squad**（设置 → 小队：Leader + N 个本地 agent 成员，`sdkSubagent` / `appOrchestrated` 两种编排），但见 §九 的证据级别——**本库不把它当可用能力来编排**。

### 并行专家的正确做法（替代「专家团」）

主会话用 `Agent` 工具**在同一轮内并行派生多个 subagent**，角色设定由提示词内联给出（不依赖任何平台面板）。两条边界必须同时成立：

1. **subagent 无 `Agent` 工具** → 不能再嵌套派生。需要"派 N 个、每个再派 M 个"时，只能由主会话平铺成 N×M 次派生，或改为两阶段（先并行产出依赖，主会话汇总，再并行消费）。
2. **subagent 没有 `AskUserQuestion` 工具** → 不能向用户发卡。任何"需要用户拍板"的环节必须回到主会话执行；派给 subagent 的任务只能是只读产出草稿或明确可自动裁决的工作。

结论：**"派发子任务"与"向用户确认"这两类动作永远发生在主会话**。

## 二、Rules 契约 [源码]

真实运行时在 `resources/app.asar.unpacked/node_modules/@qoder-ai/qoder-cn-agent-sdk/dist/_worker/qoder-worker-runtime.obf.mjs`（日志前缀 `[MemoryDiscovery]`）。⚠️ Electron `app.asar` 里 grep 不到 `always_on`/`.qoder/rules` **不代表不支持**，只代表你读错了文件。

- 路径：项目 `<root>/.qoder/rules/`、用户 `~/.qoder-cn/rules/`；项目配置目录名恒为 `.qoder`（CN 也一样），只有用户级目录名是 `.qoder-cn`；从 cwd 向上递归扫到家目录，含子目录。
- 🔴 **扩展名必须是小写 `.md`**。遍历器的唯一过滤条件是 `name.endsWith(".md")`，且该判断**大小写敏感**：`.mdc` 与被写成 `RULE.MD` 的文件都被**静默丢弃**——无报错、无警告、无日志。
- `trigger` 枚举恰好四个：`always_on` | `manual` | `glob` | `model_decision`（trim 后大小写敏感）。`file_glob` 在任何 Qoder 包里 **0 命中**，教程里出现它是错的。
- **双向降级语义**（决定"写错了会怎样"）：
  - `trigger` 缺失或不认识 → 落 `alwaysApply` → 落 `paths` → **默认 `always_on`**（意外全时注入）。完全没有 frontmatter 的文件也是 `always_on`。
  - `trigger` 合法但必需的键缺失 → **降级为 `manual` = 永不注入**（`glob` 没写 `glob:`/`paths:`；`model_decision` 没写非空 `description:`）。
- `glob` 规则的键是 **`glob:` 或 `paths:`，不是 `globs:`**；值可以是字符串或缩进列表；**逗号分隔多模式同样可用**——🔬 2026-10-14 探针实测：`glob: **/*.qbeta, **/*.qgamma` 由 `.qgamma` 触发了 `InstructionsLoaded`（宿主在 `rules.stamp` 里记 `trigger=t-qgamma.qgamma`），说明逗号串被逐个拆开匹配、不是当成一个整串。按项目相对正斜杠路径用 gitignore 风格匹配（win32/darwin 大小写不敏感）；旧版 `alwaysApply: true|false` 等价于 always_on|manual。
- 注入形态：与 `AGENTS.md` 共用同一条层次化记忆通道（不是互相竞争优先级）；frontmatter 被剥掉，正文包成 `--- Context from: <path> --- … --- End of Context from: <path> ---`；会话中途命中的规则以 `<system-reminder> Memory: <path>: …` 追加在工具结果后。
- 🔴 **平台不设常驻规则字符上限**。所谓"100,000 字符激活上限"在本 App 的两个包里都 grep 不到；只有单文件 **>40,000 字符**的 `largeFiles` UI 报告（`MAX_MEMORY_CHARACTER_COUNT = 4e4`，单位是**字符**不是字节），且该报告只喂给 `emitMemoryChanged`，**不截断、不拒绝加载**。→ 上下文预算由我们自己负责，平台不会替你把关。
- **装载的机器证据**：`InstructionsLoaded` hook 每条指令文件触发一次，载荷键为 `file_path` / `memory_type`（`global→User`、`project→Project`、`plugin→Managed`、`local→Local`）/ `load_reason`（观测值：`session_start`、`nested_traversal`、`include`、`path_glob_match`），可选 `globs`、`trigger_file_path`。用"磁盘规则清单 − 已装载清单"的集合差即可判出 `.mdc`、键名写错这类失败。⚠️ 陷阱：该事件按 `hookFiredPaths` 去重，且**没注册该 hook 时整个跳过** → "印章文件不存在"≠"规则没装载"，先验 hook 存活。

## 三、Hooks 契约 [源码+实测]

- **没有 `.qoder/hooks/` 自动发现**，必须在 `.qoder/settings.json` 的 `hooks` 下显式注册（项目级 settings.json 实测可用）。
- 事件全集 **27** 个（`PreToolUse`/`PostToolUse`/`PostToolUseFailure`/`SubagentStart`/`SubagentStop`/`SessionStart`/`SessionEnd`/`Setup`/`PreCompact`/`PostCompact`/`Stop`/`StopFailure`/`UserPromptSubmit`/`Notification`/`ConfigChange`/`TeammateIdle`/`InstructionsLoaded`/`CwdChanged`/`FileChanged`/`WorktreeCreate`/`WorktreeRemove`/`Elicitation`/`ElicitationResult`/`TaskCreated`/`TaskCompleted`/`PermissionRequest`/`PermissionDenied`）；handler 类型 `command`/`http`/`prompt`/`agent`。
- **支持 `exit 2` 阻断的事件只有 7 个** [源码+实测]：`PreToolUse` / `UserPromptSubmit` / `Stop` / `SubagentStop` / `PreCompact` / `ConfigChange` / `Elicitation`。其余事件写 `exit 2` **不会**中止调用，只能靠 stdout / `decision` 表达结论。这条集合差是门禁型 hook 的地基，`assets/templates/hooks/HOOKS-ASSEMBLY.md` 只允许引用本节、不得复述清单。
- 载荷实测含 `session_id`/`transcript_path`/`cwd`/`hook_event_name`/`tool_use_id`/`tool_name`/`tool_input`，`PostToolUse` 另加 `tool_response.{stdout,stderr,exitCode,signal,interrupted,isImage}`；载荷还含 `model` 与 `permission_mode` → **任何 hook 日志都是明敏文内容**，外发前先过滤。
- 本库策略：**单语言 Node**——所有 hook 走 `harness.mjs` 一个入口（`assets/templates/scripts/`），因为 Windows 上直接执行 `.ps1` 未获证、而 `.ps1`+`.sh` 双实现会产生真值漂移（本库曾因此出现 SIGPIPE 假 FAIL、PowerShell 注入与 GBK 崩三类缺陷）。
- `tee -a` 追加时**不补换行**，连续 hook 记录会挤成一行、`.jsonl` 变成非法 JSON Lines → 用 tee 作 sink 时要显式 `printf '\n'`。
- **配置合并有三处**（官方文档）：`~/.qoder/settings.json`（用户级）、`<项目>/.qoder/settings.json`（项目共享）、`<项目>/.qoder/settings.local.json`（**仅本机**，本库未用到第三种）。→ 排查"hook 没生效"时三处都要看，别只查项目级。设置页那个 Hooks 面板读的是**用户级**文件，**列出来不等于执行过**，一律以真跑一次为准。
- **matcher 与 `if` 的成文规则**（官方 `cli/hooks-reference`，与本库实测一致）：matcher 留空或 `*` = 全部工具；精确名 = 单工具；`|` = 多工具；支持正则。更细的 `if` 写作 `"ToolName"` 或 `"ToolName(arg_glob)"`，其中 `arg_glob` 用 **glob 匹配工具参数** → `if: "Bash(git commit*)"` 是合法写法（此前只在实测里确认，现升为 [文档+实测]）。
- **退出码契约（成文）**：`0` 放行，stdout 可回 JSON 细控 `continue`/`stopReason`/`suppressOutput`/`systemMessage`/`decision`/`reason`/`hookSpecificOutput`；`2` 阻断且 stderr 回给模型（**仅支持阻断的事件生效**，见上条 7 事件集合差）；**其它非零码 = 记录但不打断主流程**。→ 推论：hook 自身异常必须显式 `exit 0`，否则故障会变成"门禁静默失效"或"门禁把用户怼死"，两头都错。
- **官方文档没有、但实测可用**（勿按文档去"修正"）：`asyncRewake: true` + `rewakeMessage`（Stop 失败后唤醒会话）、以及 stdout 里的 `hookSpecificOutput.additionalContext` 注入。二者都是本库在用的能力，证据级别 [实测]，属文档缺口而非未定义行为。

## 四、Skills 契约 [源码+实测]

- **调用名 = 目录名，不是 frontmatter `name`**。`Skill("<目录名>")`；按 `name` 调会 `Skill "..." not found`。目录名必须写成 `/xxx` 命令引用的形式。
- **插件带来的 skill 不在此列：调用名 = `插件名:目录名`**（如 `architecture-visualization:c4model`），写裸目录名不解析。[实测：本会话技能注册表里插件 skill 一律以限定名登记] 本库三个架构 skill（`create-architecture`/`architecture-governance`/`migrate-legacy`）引用内置架构能力时**一律写限定名**，理由与分工见各自正文的「与内置架构能力的分工（编排层）」。
- 位置：`~/.qoder-cn/skills/` 与 `.qoder/skills/`；🔴 **用户级遮蔽项目级**（与直觉相反）。遮蔽时会有告警，但两处的东西不会合并。
- frontmatter **只有 `name` + `description` 是必需**。键白名单（超出即被**静默忽略**，不报错）：`name`、`description`、`argument-hint`/`argumentHint`、`model`、`context`、`allowed-tools`/`allowedTools`、`arguments`、`when-to-use`/`when_to_use`/`whenToUse`、`effort`、`disable-model-invocation`/`disableModelInvocation`、`user-invocable`/`userInvocable`、`agent`。→ **`trigger` 与 `tools` 不在其中**，写了等于没写。
- `user-invocable` 与 `disable-model-invocation` 的确切门限语义：**已源码取证（Task 5.1，2026-09-08，见下条）**。
- 🔴 **两个开关不等价，别混用**（证据：运行时 `_worker/qoder-worker-runtime.obf.mjs` 的消费点，非文档转述）：
  - `disable-model-invocation: true` → **真生效，且是唯一能把 skill 从"模型可见集合"里摘掉的 frontmatter 键**。判定点 `getModelVisibleSkills()`：`A.disabled || A.disableModelInvocation || !isConditionallyVisible(A)` 任一为真即排除。
  - `user-invocable: false` → 也生效，但**只作用于用户可见面**：消费点是 `getDisplayableSkills()`（`!1 !== A.userInvocable`）与插件斜杠命令列表。`getModelVisibleSkills()` **不看这个键** → **它一个常驻名额都省不下来**，模型照样在系统提示里看见这个 skill。
  - ⚠️ 两处判据都是 `!1 !== x` = **严格 false 才排除** → 必须写 YAML 布尔 `false`，写成 `"false"` 字符串等价于没写。
- **常驻清单的三条真杠杆**（都不是 frontmatter，因此装配期可机读维护）：
  1. `skillOverrides`（settings 顶层对象，`shallow_merge`，`requiresRestart:false`），值域 `on` / `off` / `user-invocable-only`，后两值都会把 skill 从模型可见集合移除。**读取源含 projectSettings = `.qoder/settings.json`**（合并链 user→project→local）。🔴 例外：workspace 就是家目录时 project 档被跳过。
  2. `skillListingMaxDescChars` 与 `skillListingBudgetFraction`（同 settings 顶层，默认 `undefined`）→ 直接控住 skill 清单在提示词里的体积，比逐个标开关稳。
  3. `paths` 条件激活（`isConditionallyVisible` + gitignore 式匹配 + `activateConditionalSkillsForPaths`）：运行时**确实实现了按被改文件路径懒激活**。🔴 **但 SKILL.md 的 frontmatter 不解析 `paths`**（不在上面的键白名单里）→ 该字段只能由宿主或内置定义注入，**skill 作者写了不会被读到**。不许把"按路径懒加载"当可用设计。
- **版本适用域**：以上结论在 **0.1.6 / 0.1.8 / 0.2.1** 三份运行时逐一命中同一组符号（键白名单、`getModelVisibleSkills`、`skillListingBudgetFraction`、字段全集 Set 里的 `"paths"`），**跨版本同构**，不随 0.2.x 变更。
- ⚠️ **未验证的半边（U3）**：源码只证明"代码会读这个键"，不证明"宿主真的按预期渲染"。活体三项（重开会话看技能列表、`Skill("probe-a")` 显式调用是否被拒、模型自动触发是否消失）仍待用户实测。取到实测前，依赖 `disable-model-invocation` 的设计**只能作为可回退项**。
- **长度上限未证 → 不许断言**。官方自带 skill 里存在 945 / 826 / 696 / 631 字符的 description 且都正常加载，所以"≤1024""≤512"一类的说法都是猜的。
- 判断一个 skill 能做什么**别看 `description`**，看它的 `data/` 与 `scripts/`。

## 五、Custom Agents [文档+实测]

- `.qoder/agents/<name>.md`，按 **agent 文件名**调用。字段集 `name/description/tools/model/skills/mcpServers` 来自官方文档示例，**未在代码里找到对应 schema**，按"文档说可行"对待而非已验契约。
- 🔴 实测行为：`tools:` 白名单**不做任何别名归一**——不认识的名字被**静默丢弃、不报错**。例：声明 `Read, Grep, SearchReplace` 实际只拿到 `Read, Grep`，写能力全丢且无告警。→ 白名单里用 **`Edit`**，不要用 `SearchReplace`。
- `app.asar` 里确有一张归一表（`SearchReplace→Edit`、`Task→Agent`，并认 `SearchCodebase`/`SearchSymbol`/`GetProblems`/`DeleteFile`），但它作用于**模型的 tool_use 调用路径**，不作用于白名单。

## 六、选择卡（AskUserQuestion）真实渲染契约 [源码]

- `options[].label` **会渲染**，是行内唯一主色字段（13px/medium）；`description` 与它**同一行**但弱色、单行 truncate + hover Tooltip。`question` 最多 3 行后截断 → 追加在 question 末尾的内容最先被吃掉。
- 选项行首徽标是**数字 1/2/3/4**（键盘数字键直选，按 `options.length+1` 落到自由输入）→ 任何 `A/B/C` 字母锚点都与 UI 冲突。
- **"推荐"徽标 = 硬编码第一个选项**，与 label 里手写的「（推荐）」无关。推荐项不置首会出现"徽标在 1、文字说推荐在 3"的双信号矛盾（比重复更危险）。
- `header` 不进可见 DOM（只做 section 的 `aria-label`）；`options[].preview` 在该组件区 **0 引用 → 不渲染**，尽管 schema 里有这个字段。
- **回传给模型的只有 label**（多选取中项用逗号拼），`description` 永不回传 → label 的语义自足性决定下游能否还原决策记录。跳过态是字面量 `[No preference]`。
- 一次调用**只展示一题**（`1/N` 分页 + 上/下一题）。硬约束：1–4 问 / 每问 2–4 选项 / 自动追加「其他」。`autoResolutionMs` 不在 worker schema 里 → 模型设不了自动跳过。
- 实务结论：以下四种封装一律禁止——把候选值再抄一份进 description 的【】前缀、在 question 末尾附选项清单、在 label 里手写（推荐）、在 label 前加 `A · ` 式字母编号锚点（它们都在拿被截断的显示预算换冗余）；保留"候选值进 label、量化影响与理由进 description、推荐项置首、同批风格一致"。

## 七、指令文件与配置目录 [源码]

- 指令文件名只有 **`AGENTS.md`**（外加 `AGENTS.local.md`）；**不存在 `QODER.md` / `CLAUDE.md`**。支持 `@` 导入与 `agentsMdExcludes`。
- 项目配置目录 `.qoder/`（`QODERCN_CONFIG_DIR_NAME` 可同时覆盖项目与用户目录名）。

## 八、加载时机不对称 [实测]

- **热加载**：rules、skills、commands，**以及 hook 配置**（`settings.json` 的 `hooks`）。
- **只在会话启动时加载**：custom agents（`agents/`）。→ 新增 agent 后必须重开会话。
- 🔴 **hook 配置不需要重开**（实测撤回旧断言）：`phase-a-init` 在会话中途写入 `.qoder/settings.json` 后，写入**当轮**的 Edit 没有任何日志，从**下一轮**起 `UserPromptSubmit`/`PostToolUse`/`PreToolUse` 连续触发，且 `PreToolUse` 的 `block-dangerous` 真返回 exit 2 拦下命令——即激活有 **≥1 轮延迟**，不是"必须重开会话"。旧版这里写着"改 hook 注册必须重开会话"，是拿一个同轮探针的假阴性立的律，已作废。
- 由此两条纪律：① **永远不要在写入 hook 配置的同一轮判定"hook 坏了"**，下一轮复测再说；② `SessionStart` / `InstructionsLoaded` 这两个事件确实只在**新会话**里出现（实测由 `heartbeat.jsonl` / `rules.stamp` 落戳自证），所以"本会话没有这两条日志"不能用来证明注册失败。

## 九、小队 / Squad 与 Agent Teams 的证据级别 [产物]

- 设置 → 小队可创建**本地小队**（Leader + N 成员，成员来自本地 agent），可指派到 Issue，两种编排模式 `sdkSubagent` / `appOrchestrated`。
- 🔴 **证据级仅到"安装包里读得到"**：渲染层 i18n 文案 + 主进程若干接线，**没有人真正创建并跑通过一次**。
- 隐藏环境变量 `QODER_AGENT_TEAMS=1` 是 Agent Teams 的后门，级别更低。
- 因此：**本库所有编排只走"主会话 + `Agent` 工具并行 subagent"**（§一），小队只作为"用户可以自己去 UI 里试试"的提示出现，skill 不得依赖它，也不得为了它改全局环境变量。

## 十、RepoWiki / 知识 [文档+实测]

- 配置在 `.qoder/repowiki/wiki_plan.yaml`（`version: 1` 必填；`repowiki.template` ∈ `architecture`|`product_requirement`；`repowiki.documents` ≤50 且顶层 ≤12、每父 ≤8；`note.text` ≤10000、notes ≤50）。🔴 **`scope.include` / `scope.exclude` 平台尚未实现**：写了会被解析→告警→**忽略**，等于留一份看着生效、其实什么都不改的配置——要限制文件范围请如实告诉用户"这版不支持"，不要写 `scope` 块。（v9.12.0 校正：本行旧版把 `scope` 当可用能力陈述，与官方 `qoder-context-knowledge-plan` skill 本体的 "Not supported yet: `scope`" 直接矛盾。）
- 由内置 `qoder-context-knowledge-plan` skill 撰写；**改完必须重跑 wiki/knowledge 构建才生效**，没有定时再生成。
- 运行时通过 `SearchKnowledge` 工具检索。

## 十一、本机环境陷阱（跨平台口径） [实测]

- 系统 `core.autocrlf=true` 会把 LF 脚本检出成 CRLF → `.gitattributes` 的 `* -text` 是承重的，别删。
- `.ps1` 的 UTF-8 **BOM 是承重的**（PowerShell 5.1 靠它读中文字面量）。
- Windows 上 `python3` 是微软商店别名：`command -v` 能过、实跑退出码 49/9009 且零输出。
- **macOS / Linux 侧本库未做实测**：涉及跨平台的结论一律标注"未验证"，不许用"Node 跨平台所以应该没问题"替代实测。
- **文件执行位（`chmod +x` / mode 对账）在本库不适用** [实测]：Windows 文件系统没有 `+x` 语义，且本库所有脚本一律经 `node <file>` 调用（`harness.mjs` / `harness-verify.mjs` / `build-panel.mjs` / `phase-a-init.mjs` / `contract-drift.mjs`），没有一个文件靠 mode 被直接执行。因此方案 M/N 项里的"chmod/mode 对账"就此结案——**不是漏做，是这条平台上不存在该问题**；若将来落到非 Windows 且改为直接执行，需要重新立项。
- **长路径只软提示、不判 FAIL（处置决定，非遗漏）** [实测]：`phase-a-init` 有 `path-length ≤200` 的 `report('path-length', …)` 软提示。不升 FAIL 的理由是实测口径下的假阳性代价：Windows 260 字符上限并非一律生效（视 manifest/组策略而定），而 `node` 走的是自己的路径处理，深路径项目往往**完全能跑**——把它判死会让一个本可工作的项目在初始化第一步就被拒。真出问题的处置：把项目根放浅，或用 `subst` 映射成盘符根，再重跑阶段 A。⚠️ 未做 `\\?\` 前缀改造并**未验证**它能解决本库的实际路径深度分布，故不写成方案。

## 引用方式

其它文件需要平台事实时，写「平台依据见 `skills/platform-profile/SKILL.md` §N」，不要在正文复述——复述就是第二事实源，平台再升级时它必然腐烂。版本历史类文本（`migration-map.json`、README 版本史、manifest 的 description）属于账本，按账本纪律原样保留旧词。
