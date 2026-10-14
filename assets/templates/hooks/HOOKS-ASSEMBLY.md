# Hooks 装配说明（AI 执行参考，不落盘到项目）

> **本文只管"宿主契约与装配纪律"，不管绑定关系。** 子命令 ↔ 事件 ↔ matcher 的对照表只有一个事实源：`assets/library/L0-universal/hooks/hook-registry.md`。
> 本文原先另有三张表（统一 trigger 映射表 / 阶段 B 行为表 / settings.json 绑定说明）各自抄一遍同一份绑定，改一处漏两处，实测已出现表与模板不一致（旧表把 `session-start-context` 写成 `UserPromptSubmit` + `once: true`，而两份模板早已挂在 `SessionStart`）。三张表已删除。

## 单一执行入口

全部 hook 只有一个可执行入口：`node .qoder/scripts/harness.mjs`（子命令清单见注册表）。两份 settings 模板同构，Windows/Linux 不再分别用 `powershell.exe` / `bash` 拉起孪生脚本 —— 这是 M3① 的正解：写死 `powershell.exe` 会让非 Windows 项目拿到 0 个生效 hook，反之 `.sh` 侧 7/10 是 `exit 0` 空壳（E5）。

`.hook.ps1` / `.hook.sh` 孪生已随 Task 3.4 从库中删除（L0 13 个文件清零）；`assets/library/L1-techstack/*/hooks/` 下最后 3 个从未注册的栈级 lint 占位脚本也已随 Task 5.6 删除，库内 shell 脚本自此归零。删除前旧实现的行为真值已冻结进 `tools/fixtures/`（`hook-baseline/`、`ask-card-baseline.json`、`stop-verify-baseline.json`），此后任何"跟旧实现不一样"的主张一律由三条闸门比对那份历史事实：`node tools/hook-equiv.mjs`、`node tools/ask-card-cases.mjs`、`node tools/stop-verify-cases.mjs`。

> ⚠️ **库外持有者注意**（v9.12.0 补）：上述 `tools/` 三条闸门属**开发侧构建期工装，不随本库交付**（v9.1.2 起移出交付面；本副本无 `.git`，不可回取）。库外只能以本段文字记载的行为真值为参照——"一律由三条闸门比对"这条程序只在带完整历史的仓库副本内可跑。同批引 `tools/` 的 `examples/README.md` 早已带此标注，本文件是漏标的那一处。

## Qoder 原生事件与 hook 契约（装配视角；平台事实以 `/platform-profile` §三 为准）

> 本节只讲**怎么装配**（注册形状、根解析、退出码用法），**不复述平台事实清单**。事件全集、`exit 2` 阻断事件子集、载荷键名这三条平台事实的唯一记录在 `/platform-profile` §三（其取证出处为 docs.qoder.com/cli/hooks + 运行时日志实证 `C:\<u>\AppData\Roaming\QoderCN\logs\*\questWindow\hooks.log`）。本节取代早期文档中「宿主仅支持 4 个事件（PreToolUse/PostToolUse/Stop/UserPromptSubmit）」与「宿主无 SessionStart」的过时表述。

### 事件清单（**非穷举**，只列本库用到的与已实证存在的）

| 分组 | 事件 |
|------|------|
| 会话生命周期 | `SessionStart`、`SessionEnd`、`Stop`、`StopFailure` |
| 用户输入 | `UserPromptSubmit`、`Notification` |
| 工具调用 | `PreToolUse`、`PostToolUse`、`PostToolUseFailure` |
| 权限与征询 | `PermissionRequest`、`PermissionDenied`、`Elicitation`、`ElicitationResult` |
| 子 Agent | `SubagentStart`、`SubagentStop` |
| 上下文压缩 | `PreCompact`、`PostCompact` |
| 配置与指令 | `InstructionsLoaded`、`ConfigChange` |
| 文件系统 | `CwdChanged`、`FileChanged` |
| Worktree | `WorktreeCreate`、`WorktreeRemove` |

⚠️ **不得把本表当枚举全集使用**。宿主源码里在同一模块还直接可见 `Setup`、`TeammateIdle` 等本表未列的事件名，故任何防回潮断言只能写「本库使用的事件集合 ⊆ 本表」，不能写「等于本表条数」——写死条数会随宿主版本自己烂掉。

### matcher 语法

| 写法 | 语义 | 示例 |
|------|------|------|
| 省略 或 `"*"` | 全匹配（该事件下所有工具） | `"matcher": "*"` |
| 精确值 | 只匹配单个工具名 | `"matcher": "Bash"`、`"matcher": "AskUserQuestion"` |
| `\|` 多值 | 匹配列表中任一工具 | `"matcher": "Write\|Edit\|NotebookEdit"` |
| 正则 | 按正则匹配工具名 | `"matcher": "mcp__.*"` |

> matcher 里只能出现**宿主真实工具名**（`Bash`/`Write`/`Edit`/`NotebookEdit`/`AskUserQuestion`/…）。曾写过宿主里根本不存在的工具名 → 该 hook 永不触发且无任何报错，属最难发现的一类静默失效。断言 `hook-matchers-real-tools` 守这条（清单见 `tools/checks/03-tool-names.mjs` 的 `KNOWN_TOOLS`）。

### 输入契约：stdin JSON（不是环境变量）

- 宿主把事件以 **JSON 从 stdin 传入**；环境变量**不含** `tool_input`，故任何需要入参的 hook **必须读 stdin**。
- 公共字段：`session_id` / `transcript_path` / `cwd` / `hook_event_name` / `permission_mode` / `agent_id` / `agent_type`
- `PreToolUse` 追加：`tool_name` / `tool_input` / `tool_use_id`
- 环境变量仅 3 个：`QODER_PROJECT_DIR` / `QODER_PLUGIN_ROOT` / `QODER_PLUGIN_DATA`
- 会话级事件（如 `UserPromptSubmit`）可能不携带 `tool_input`，hook 只做探测、不得强依赖字段。
- **项目根解析有两级优先序，不可合并**：上下文/审计型走 ① stdin `cwd` ② `QODER_PROJECT_DIR`（兼容 `QODER_PROJECT_ROOT`）③ 当前目录；`stop-verify` 沿用旧 `.ps1` 口径走 `QODER_PROJECT_ROOT`→当前目录。`harness.mjs` 里对应 `rootFromEvent()` / `rootFromEnv()` 两个函数。

### 退出码与阻断

- **exit 0 = 放行**：stdout 内容**注入会话上下文**（上下文/审计型 hook 的常规出口）
- **exit 2 = 阻断**：中止当前调用，**stderr 内容回传给 Agent**（门禁型 hook 的常规出口）
- 支持 `exit 2` 阻断的**事件子集**见 `/platform-profile` §三（唯一事实源，本文件不复述清单）。装配后果：不在该子集里的事件，把 hook 写成"门禁"是**无效的**——它不会中止调用，只能靠 stdout/`decision` 表达结论。
- 其他非零退出码 = hook 自身异常，一律不得阻断用户工作流

### JSON 精细控制（stdout 输出，语义优于退出码）

| 字段 | 作用 |
|------|------|
| `decision: "deny"` | 等价 exit 2 阻断 |
| `hookSpecificOutput.permissionDecision` | `allow` / `deny` / `ask`，直接决定权限（PreToolUse） |
| `hookSpecificOutput.updatedInput` | **直接改写入参**后再放行 |
| `hookSpecificOutput.additionalContext` | 注入上下文提醒（exit 0 时使用；`session-start-context` 用它把引导压到 ≤1KB） |

### hook 类型（4 种）

| type | 说明 | 高频交互路径 |
|------|------|--------------|
| `command` | 本地进程执行（本库全部 hook 用此类型） | ✅ 允许 |
| `http` | 调用远端 HTTP 端点 | ⚠️ 视延迟而定 |
| `prompt` | 隔离的单轮 LLM 调用 | ❌ **严禁**（超时风险） |
| `agent` | 起子 agent 做验证 | ❌ **严禁**（超时风险） |

> 运行时日志已有 `hook command timed out after 3s` 记录；`PreToolUse` 位于每次工具调用的关键路径上，**必须是廉价确定性脚本**（无 LLM、无网络，文件 IO 尽可能少）。

### 平台约束（换轨后剩下的三条）

- **Windows 上 bash 命令会 `exitCode=127` 并静默退化为 no-op**。平台事实（hooks.log 实证）：Qoder 经 `bash.exe -c` 包装执行 hook 命令。旧结论「因此 Windows hook 必须写 `powershell.exe`」已被单语言入口取代——正解是**改成 `node`**，两侧同一条命令。
- ⚠️ **前提是 `node` 在该 bash 包装的 PATH 里可达**。这是单入口方案唯一未被实测的外部依赖（U2 同批验证：新开一个会话后看 `.qoder/logs/heartbeat.jsonl` 是否落行；不落行即说明 `node` 不可达，回退方案是 `.cmd` 包装或写死 Node 绝对路径）。**在心跳实测通过之前，不要把"Node 跨平台所以没问题"当成已完成。**
- **编码**：Node 侧 stdout 固定 UTF-8，不再需要 `.ps1` 的 UTF-8 BOM 约定（BOM 只对含中文字面量的 `.ps1` 承重，随孪生删除一起失效）。历史教训保留：PowerShell 写出编码**不可预测**，同一脚本不同调用点会分裂，故任何"PS 输出一定是 UTF-8"的假设都不成立——`tools/hook-equiv.mjs` 因此按流探测码页。

## 装配流程（阶段 A / 阶段 B）

- **阶段 A**：`harness.mjs`（及其 `hook-ask-card.mjs` 依赖）与两份 settings 模板、profile 等一起落盘；`.qoder/settings.json` 由平台对应模板生成，两侧 command 已同构，无需手工改写。落盘清单与顺序见 `references/phase-a-checklist.md`。
  - **守卫**：settings 里引用的每个文件必须真实落盘，否则 `PHASE-A-COPY-FAIL:hook-target-missing:<file>` 并 `exit 1` 指名缺哪个（M3①）。此守卫由 `phase-a-init.mjs` 承担（Task 3.2）。
- **阶段 B**：技术栈确定后，把 lint/format/test 三类 hook 的实际命令填进入口——各栈探测规则与"探测不到即显式打印跳过（不阻断）"的口径见注册表「与技术栈相关的填充点」一节，本文不复述。
  - 升级 Hook 前必须展示"将要写入的命令"并经用户确认（P5 原则）。
  - 不覆盖用户已手工修改过的 Hook 文件。

## ask-card-guard 专项说明（选择卡 option.label 质量守卫）

**来源 Bug（首轮）**：MRD 生成的 grill-me 追问中，`AskUserQuestion` 选择卡的 `option.label` 被写成评价/权衡长句而非具体答案值，用户面对 3 个选项却看不出各自代表什么方案，只能盲选。此前防线为零：17 条规则 0 相关、harness-verify 的 15 个 Check 块原理上不可能检出（选择卡不落盘）、原有 9 个 hook 中 0 个 matcher 覆盖 `AskUserQuestion`。

**二轮故障（v1.1.0 补丁）**：「产品分发与运营路线怎么走？」再犯——3 个选项 label 仍是权衡长句且全部缺路线名，但标签内含 `Star ≥1,500`/`Memos` 等拉丁 token：H4 锚点判定为 false（有 token 即不判缺锚），与 H1/H2/H3 风格命中叠加仅构成 `h6_bad` 而非 `violated`；3 选项全劣化时 `clean=0` → H6 不成立、`violated=0` → 单项违规不成立，两路判定双落空被放行。教训：「有拉丁 token」不等于「有值锚点」——值 = 可区分的具体方案名。H7 补上此盲区。

- **用途**：作为全局规则的**机械强制力兜底**，检出劣质选择卡并回传可自我修复的改写要求
- **配套规则**：`.qoder/rules/ask-card-option-quality.md`（`trigger: always_on`）——规则负责「教」，本 hook 负责「拦」
- **核心契约**：`label` = 具体答案值（≤16 CJK 字）+ 可选「（推荐）」标记；`description` = 理由/权衡/量化影响；超长时**截评价不截值**
- **事件 / matcher**：`PreToolUse` / `AskUserQuestion`
- **实现**：`harness.mjs hook ask-card-guard` → `hook-ask-card.mjs`（单语言，两侧同一条命令；曾有 `.ps1`+`.sh` 孪生，Node 化后判据逐字等值由 `tools/hook-equiv.mjs` 守住）
- **成本**：纯确定性启发式，无 LLM / 无网络 / 无文件 IO / 无 git 调用；注册 `timeout: 10`

### 双模式

| 模式 | 触发方式 | 行为 | 适用 |
|------|----------|------|------|
| **警告模式**（默认） | 无需配置 | `exit 0` + stdout 输出 `hookSpecificOutput.additionalContext` 注入提醒，卡片照常渲染 | 先观测误报率；符合本库「阻断策略由用户显式开启」约束 |
| **硬阻断模式** | 环境变量 `ASK_CARD_GUARD_BLOCK=1`（亦接受 `true`/`yes`/`on`） | stderr 回传改写要求 + `exit 2`，劣质卡片**根本不渲染** | 误报率确认可接受后开启 |

**启用硬阻断**：在启动 Qoder 的 shell 中 `export ASK_CARD_GUARD_BLOCK=1`（Windows PowerShell：`$env:ASK_CARD_GUARD_BLOCK='1'`），或在 `.qoder/settings.json` 对应 hook 条目上配置环境变量。

### 启发式摘要（H1-H7）

| 编号 | 检测 | 判据 |
|---|---|---|
| H1 | 长度超限 | 显示长度 > 16（CJK/全角/假名/韩文/中文标点计 1.0，ASCII 等半角计 0.5；尾部「（推荐）」剥离后不计） |
| H2 | 句读成句 | label 含 `，、。；！？,;` **≥2 处**（值是名词短语不是句子） |
| H3 | 评价词命中 | label 含 `最快/最接近/门槛高/工程量/灵活/性价比…` 等评价形容词（确定性字典） |
| H4 | 值锚点缺失 | 既无拉丁/数字 token（`Express 4.x`/`blog`/`Docker`），也无与 `question`/`header` 主题名词的 CJK 二元组重叠。**单独使用会误报合法中文短值（如「滚动过期」），只与 H1/H2/H3 联合使用** |
| H5 | 长度倒挂 | label 显示长度 > description 显示长度（抓字段写反；description 为空不判） |
| **H6** | **跨选项一致性（最有价值）** | 同一 `question` 内**部分**选项干净、**部分**实质劣化 → 非均匀劣化。非均匀劣化几乎必然是生成缺陷 → **误报率最低**；均匀劣化可能只是风格问题，不触发 H6 |
| **H7** | **均匀实质劣化（二轮故障补丁）** | 同一 `question` 内坏选项 ≥2、清洁项 =0、单项违规 =0 → 全选项盲选。二轮故障：3 选项全权衡长句且含 `Star/Memos` 拉丁 token 使 H4 判定 false，`h6_bad` 成立但 `violated` 不成立，H6 与单项违规双落空 → 旧逻辑漏检放行；「有拉丁 token」不等于「有值锚点」 |

### 判定口径（三级 + 误报护栅）

```
weak     = H1 | H2 | H3 | H5                      # 启发式命中（弱信号）
violated = ((H1|H2|H3) AND H4) | H5               # 确认违规
h6_bad   = violated OR （H1/H2/H3 命中数 ≥ 2）     # H6 违规侧
h7       = bad ≥2 且 clean =0 且 violated =0      # H7 均匀实质劣化（全盲选）
阻断     = 任一 violated  或  任一 H6（clean ≥1 且 h6_bad ≥1）  或  任一 H7
```

> **「边际带」护栅（实测驱动）**：仅命中 1 项风格启发式、且有值锚点、且无 H5 的选项，**既不计合规也不计违规**，不参与 H6/H7 统计。原因：实测中「`React SPA + FastAPI 前后端分离架构`（17.0 单位）vs `Express 4.x + EJS 服务端渲染架构`（16.0 单位）」这类长度微差会单独触发 H6 硬阻断，属误报。加护栅后故障样本仍被精准检出，均匀劣化样本不再误报。

### 反馈文案（stderr / additionalContext 同源）

点名到 `question` 与 `option#N`，标注命中的启发式编号与锚点状态（无值锚点 / 锚点存疑 / 长度倒挂 description），并给出：① 本次违规项的 ❌/✅ 改写模板；② 真实故障的参考改写样本；③ 规则文件指引。目的是让 Agent 能**自我修复后重新调用** `AskUserQuestion`，而非仅仅被拒绝。

### 兜底

全文 `try/catch`，任何自身异常 → `exit 0` 放行；空输入 / 非 JSON / 截断 JSON / 缺 `questions` / 非 `AskUserQuestion` 工具 → `exit 0`。旧 `.sh` 侧「缺 `python3` 即降级放行」的分支随单语言入口消失。

## 降级路径

- **pre-commit-lint / pre-push-test**：Qoder Hooks 在 Agent 运行时触发，如需 git 级别拦截（如 `git commit` 时），建议配合 git hooks（`.git/hooks/pre-commit`）或 CI pipeline 实现
- **pre-merge-review**：建议通过 PR 审查流程 + spec-review-agent agent 实现
- **ask-card-guard**：单语言入口后无平台依赖降级路径；宿主不支持 Hook 时（Cursor/Windsurf）**仅剩全局规则 `ask-card-option-quality.md` 的提示作用（无机械强制力）**
- **Cursor/Windsurf 等无原生 Hook 的工具**：降级为 git hooks + husky/lint-staged 或 CI pipeline

## 约束

- Hook 脚本执行失败不得阻断用户工作流：入口层任何自身异常一律 `exit 0`；真实版失败时输出原因并 `exit 0`（阻断策略由用户显式开启，如 block-dangerous 除外——它默认阻断危险命令）
- **不覆盖用户已手工修改过的 Hook 文件**：阶段 A 按 SHA256 逐文件比对，与库版本不同即跳过（须显式 `--overwrite-customized` 才回刷）。占位桩以 `# harness:stub` 哨兵标记，唯一作用是让阶段 A 摘要的 `stubs:<n>` 显式披露"有 N 个门禁未生效"（三平台同口径，由换名后磁盘普查得出）——哨兵**不**构成覆盖例外。
- **高频路径成本约束**：`PreToolUse` / `PostToolUse` / `UserPromptSubmit` 等每次交互都走的事件，hook 必须是**廉价确定性脚本**，严禁 `prompt` / `agent` 类型（含 LLM 调用），严禁网络与大文件 IO
- **写日志必须自带换行**：`appendFileSync` 写 JSONL 若漏 `\n` 会让整份日志粘连成一行、按行解析全废（N1 的另一半；前一半是 PS `Add-Content -Encoding UTF8` 建文件带 BOM）
- **注册表里没有的就不存在**：栈级 lint hook 已按此原则于 Task 5.6 收口（三个从未注册的占位脚本 → 0），lint 门禁由已注册的 `pre-commit-lint` 单源承担。今后新增 hook 必须先进注册表且有执行器，禁止再放"待填充"的占位脚本——占位文件会让装配摘要看起来门禁数够了，而其中几个不拦截任何东西

## 多宿主适配语义（提炼自被删 IR 定义的 adapters 节）

| 宿主/适配器 | 适配方式 |
|-------------|----------|
| qoder | 原生支持：按注册表在 settings.json 注册，stdin JSON + exit 2 契约 |
| cursor 等无原生 Hook 的工具 | 降级为 git hooks + husky/lint-staged 或 CI pipeline |
| ci（ci-fallback） | CI 流水线执行等效检查（lint/test/审计）；无 hook 宿主时由同步规则步骤提示 AI 手动运行（存在自证偏差风险，优先补 CI） |

**未来接入非 Qoder 宿主时，可按注册表 + 本文契约重建适配层**：hook 主体逻辑已在 `harness.mjs` 中实现且与宿主无关，适配层只需处理三件事——① 事件映射（宿主事件 → 本文事件清单，至少覆盖注册表用到的那几个）；② 输入适配（宿主载荷 → stdin JSON）；③ 退出码解释（2=阻断、0=放行/注入）。无需重写 hook 本体。
