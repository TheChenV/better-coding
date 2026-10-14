# Hook 注册表（子命令 ↔ 事件 ↔ matcher 的唯一对照表）

> 本表是 hook 绑定的**唯一事实源**。`HOOKS-ASSEMBLY.md` 原先用三张表分别抄一遍（统一 trigger 映射表 / 阶段 B 行为表 / settings.json 绑定说明），改一处漏两处，实测已出现表与模板不一致（旧表把 `session-start-context` 写成 `UserPromptSubmit` + `once: true`，而模板早已挂在 `SessionStart`）。三张表现已全部删除，其唯一还有一节语义的「技术栈填充点」已收进本表；`HOOKS-ASSEMBLY.md` 只保留宿主契约、装配纪律与 ask-card-guard 专项说明。

所有 hook 只有一个可执行入口：`node .qoder/scripts/harness.mjs hook <子命令>`（两份 settings 模板同构，Windows/Linux 不再分别用 `powershell.exe` / `bash` 拉起孪生脚本 —— 这是 M3① 的正解）。

> ⚠️ **本目录（`.qoder/hooks/`）只放文档，不放可执行件。** 新版无 hooks 目录自动发现（事实源见 `/platform-profile` §三），把 `.mjs`/`.ps1`/`.sh` 放进这里**永远不会被执行**——它既不是注册点也不是加载路径。hook 的判定逻辑唯一住在 `.qoder/scripts/harness.mjs` 的 `hook <子命令>` 分支；真正的注册点是 `.qoder/settings.json` 的 `hooks` 字段。本文件只回答"哪个子命令挂在哪个事件上、读哪些字段、能不能阻断"。

## 主表

| 子命令 | 事件 | matcher | if / 附加 | 超时 | 阻断 | 读取的输入键 | stdout / stderr |
|---|---|---|---|---|---|---|---|
| `hook block-dangerous` | PreToolUse | `Bash` | — | 10 | 是（exit 2） | `tool_input.command` | stderr 一条拦截理由（含命中的模式与命令前 200 字） |
| `hook pre-commit-lint` | PreToolUse | `Bash` | `if: "Bash(git commit*)"` | 60 | 是（**钉缺席**或 lint 失败 → exit 2） | `tool_input.command`，另读 `profile.git` | 仓库判定自 v9.5.0 S2 起**逐级上溯**（父目录有 `.git` 也算在场，并回报仓库根）；`mode=none` 或未找到仓库 → stdout 按档一行（none 说"按你的选择"、未决策说"git 方式未定 + 零拦截力"）并 exit 0；**v9.5.0 S3 新增阻断出口**：仓库在场而 `.gitattributes` 承重两行缺席 → stderr 给可复制的两行修复并 exit 2（装机不再无条件写钉，这里是唯一还来得及的时点）；其余走技术栈 lint，stderr 失败摘要（末 2000 字） |
| `hook pre-push-test` | PreToolUse | `Bash` | `if: "Bash(git push*)"` | 60 | 是（测试失败 exit 2） | 同上 | 同上按档分话术并点名仓库根与当前分支；`mode=local` 却发生推送时 stdout 提示档不对，但**测试照跑不跳过**（不借模式之名放松门禁） |
| `hook pre-merge-review` | PreToolUse | `Bash` | `if: "Bash(git merge*)"`，`async: true` | 30 | 否（恒 exit 0，仅提示） | `tool_input.command`，另读 git 状态与 `profile.git` | 按档放行话术同上（`none`/未找到仓库时 stdout 一行说明并 return 0，避免逐条 git 命令空跑输出空字段）；否则 stdout 合并前检查清单 |
| `hook ask-card-guard` | PreToolUse | `AskUserQuestion` | — | 10 | 默认否；`ASK_CARD_GUARD_BLOCK=1` 时 exit 2 | `tool_name`、`tool_input.questions[].{question,header,options[].{label,description}}` | 警告模式 stdout 一个 `hookSpecificOutput.additionalContext` JSON；阻断模式 stderr 同一段文本 |
| `hook post-edit-format` | PostToolUse | `Write\|Edit\|NotebookEdit` | — | 30 | 否（恒 exit 0） | `tool_input.file_path`（不存在即静默放行） | 四种非成功形状各有一行回显，**都不等于"已格式化"**：① 无格式化器→"未找到 x 的格式化工具"；② 路径越出项目根→跳过；③ 路径含 shell 元字符（引号/反引号/$/&/|/;/括号/%/反斜杠，含 `it's.tsx` 这类合法但危险的文件名）→跳过；④ **找到格式化器但退出码非 0**→逐腿报退出码 + 末行"尝试过但没成功"（v9.12.0 review 修：旧写法丢弃退出码就计入成功，把④伪装成已格式化，还会跳过后续兜底腿） |
| `hook audit-log` | PostToolUse / Stop / UserPromptSubmit | 同上 / — / — | — | 10 | 否 | `hook_event_name`、`tool_name`、`tool_input.file_path` | 无输出；落 `.qoder/logs/audit-<date>.log` 一行（UTF-8 无 BOM、自带换行） |
| `hook sync-detector` | **PostToolUse** | `Write\|Edit\|NotebookEdit` | — | 10 | 否 | `tool_input.file_path` + `.qoder/harness-profile.json#knownDocs` | stdout 同步提醒（新文档未登记 / 规格漂移） |
| `hook auto-finalize` | **PostToolUse** | `Write\|Edit\|NotebookEdit` | — | 10 | 否（恒 exit 0） | `tool_input.file_path` + `.qoder/harness-profile.json#maturity` | 仅当路径命中 `docs/prd/MRD*.md` 或 `docs/prd/PRD*.md`：文本级**定点**回写 `maturity.mrd/prd=true` 并前插一行 `history`（回读校验不过就整段放弃，profile 保持原样；`JSON.parse` 前先剥 BOM）；stdout 一句定稿宣告。**刻意不写**：`maturity.arch`（有前向消费者 `panel_topo_lag`，一写就自造 FAIL）、`knownDocs`（写了等于自己按掉 `sync-detector` 的提醒）、`sync.lastSyncAt` 与 footer（那是「同步真跑过」的凭证）、手册步骤状态 emoji 与 AGENTS.md 语义段（属该步清单的语义判断，撞「脚本不猜语义」）。已同步过一次时幂等跳过、不重复记 `history` |
| `hook session-start-context` | **SessionStart** | — | — | 10 | 否 | `cwd`（回退 `QODER_PROJECT_DIR` / `QODER_PROJECT_ROOT`） | stdout `hookSpecificOutput.additionalContext`，正文 ≤1KB |
| `hook stop-verify` | Stop | — | `asyncRewake: true` + `rewakeMessage` | 120 | 是（FAIL 唤醒；**例外见下方「唤醒例外清单」**：FAIL 集合恰为 `{live_profile_drift}`，或只有 `sync_freshness` 且同一指纹此前已唤醒过一次时，改 stdout 说明 + exit 0，不再唤醒） | 不读 stdin | 定点回写 profile 后 stdout 一行；FAIL 时 stderr 摘要 + exit 2；另写 `.qoder/logs/verify.stamp`（记的是**校验器**的退出码，与 hook 是否唤醒是两件事） |
| `heartbeat` | SessionStart | — | — | 5 | 否 | 整条事件 | 无输出；落 `.qoder/logs/heartbeat.jsonl`——它是"SessionStart 到底有没有真触发"的唯一自证戳（旧版 `session-start-context` 被挪去 `UserPromptSubmit` 就是因为当年没有它证不了），不是噪声哨兵，勿删 |
| `rules-stamp` | InstructionsLoaded | — | — | 5 | 否 | `file_path`、`memory_type`、`load_reason`、`globs`、`trigger_file_path` | 无输出；落 `.qoder/logs/rules.stamp`（E11 集合差的证据源）。**它同时是"什么真进了常驻上下文"的唯一可靠清点**：一行 = 一个被加载的文件，`load_reason` 区分 `compact`/会话开场/按需触发，比人工数规则清单准 |

## 与技术栈相关的填充点（阶段 B）

`block-dangerous` / `audit-log` / `stop-verify` / `sync-detector` / `ask-card-guard` / `auto-finalize` 与技术栈无关，默认启用。
`post-edit-format`（ts/js/json/css/html→prettier、py→black 否则 ruff、go→gofmt、java→不动）、
`pre-commit-lint`（Node 需 `package.json` + 本地 eslint；Python 需 `pyproject.toml` 或 `requirements.txt` + ruff；Go 需 `go.mod` + golangci-lint；Java 需 `pom.xml` + mvn，**首个命中即止**）、
`pre-push-test`（Node `npm test`、Python pytest、Go `go test ./...`、Java mvn）由入口自行探测项目栈，**探测不到即显式打印"跳过（不阻断）"**，不静默放行。

栈级 lint hook 已按「注册表里没有的就不存在」于 Task 5.6 收口：曾有三个从未注册的栈级占位脚本（各栈一个，正文只打印一行提示、无任何执行器运行它们），现已全部删除。lint 门禁的唯一承担者是本表已注册的 `pre-commit-lint`——它在 `harness.mjs` 内按项目栈探测并直接运行该栈的 linter，所以装配技术栈时**不再**为栈注册第二个 lint hook（同一 `git commit` 上挂两个门禁，谁先失败取决于注册顺序）。`assets/templates/techstack-commands.json` 的 `lint` 字段自此只服务指令集与速查的命令预填。

## 本次换轨纠正的两处事件绑定

- **`sync-detector`：`UserPromptSubmit` → `PostToolUse` + `tool_input.file_path`**（§7.6 第 2 行）。旧绑定每轮用户输入都要 `git status` 猜一次"是否有代码变更未同步"，是非确定性判定且与用户输入无因果；改挂写文件事件后按路径直接判定。
- **`session-start-context`：回到 `SessionStart`**（E12）。旧版为绕开"SessionStart 不触发"的老平台缺陷，被塞进 `UserPromptSubmit` 并用 `once: true` 去重；新版 `SessionStart` 正常触发（由 `heartbeat` 落戳自证），`once` workaround 随之废除。

## 兜底纪律

入口层：子命令自身任何异常一律 `exit 0`（守卫坏了不能阻断用户交互）；写日志必须自带换行（否则 JSONL 粘连成一行、按行解析全废）。
`ask-card-guard` 的判定口径（H1–H7 三级 + 边际带护栅、H10–H13 契约 v10）：**项目内**读常驻规则 `.qoder/rules/ask-card-option-quality.md`；**全文宿主契约与装配纪律**在 `HOOKS-ASSEMBLY.md`，它不随阶段 A 落盘、只存在于 SKILL 包内，路径为 `<skillRoot>/assets/templates/hooks/HOOKS-ASSEMBLY.md`（项目级安装即 `.qoder/skills/better-coding/…`，用户级即 `~/.qoder-cn/skills/better-coding/…`）。不要写成裸文件名——裸名在项目里解析不到（实测全库 find 只命中库内两份）。本表不复述判定细则。

**`stop-verify` 只认一个校验器**：`.qoder/scripts/harness-verify.mjs --fast`（v9.0.0 起校验器单语言 Node，旧 `.ps1`/`.sh` 两份实现已删除，不再有跨平台回退次序）。⚠️ **`--fast` 不是"少判几条"的快档**：带与不带跑的是**同一套判据、同一组输出行**（实测行集合完全相同），它只是 stop-verify 的调用标记，回显在 `verify_duration` 行里；用它换取跳过检查项 = 把每次 Stop 的自动门禁静默变窄。找不到时打印一行 `[stop-verify] 未找到 …` 并 `exit 0`（宁缺毋假，不拿"没跑成"冒充"校验通过"）。

**唤醒例外清单（v9.8.0 起两条；只降"打断"不降"判据"）—— 第 1 条**：hook 会把 `lastVerify` 定点回写进 profile，但它按设计**从不写文档**（见 `live-refresh.md`「hook 回写后的文档跟进」），于是回写成功的**下一次 Stop 必然**被自己的产物判 `live_profile_drift` FAIL——实测每个新装项目第二轮 Stop 都会复现（v9.2.1 前）。因此当 FAIL 集合**恰好只有一条 `live_profile_drift`** 时，hook 改在 stdout 说明成因与补救动作并 `exit 0`，不再唤醒会话；出现任何其它 FAIL 仍 `exit 2` 唤醒。校验器本身一字未改：`harness-verify` 照样 `status: FAIL`、`verify.stamp` 照样记 `exit=1`、AI 手动跑校验照样看到那条红。补刷职责仍在同步侧，勿把这条例外理解成"footer 可以不刷"。


**第 2 条（v9.8.0 S6）**：FAIL 集合只有 `sync_freshness` 时，按该行的 `fp=<文件名>@<epoch秒>` 指纹查 `.qoder/logs/rewake.stamp`——**同一指纹第一次**照常 `exit 2` 唤醒并记戳，**第二次起**改 stdout 说明 + `exit 0`。限次是防死循环：补不上同步的原因可能是缺信息，每次收工都唤醒会让会话永远结束不了。判据不降级（`harness-verify` 照样 FAIL、`verify.stamp` 照样记 `exit=1`、AI 手跑照样看到红）。另设降级开关 `HARNESS_SYNC_REWAKE=0`：该判据完全不参与唤醒，只留红字（沿用 `ask-card-guard` 的 `ASK_CARD_GUARD_BLOCK=1` 开关形状，默认开启拦截）。
