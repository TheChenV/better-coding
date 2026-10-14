# 编号工作流（scaffold-agent 模式的 Node 移植）

一句话：骨架/原型类任务不再由 AI 现写脚本，改成**按编号读工作流 → 拼脚本 → 执行 → 验证**的四段式，
每一步的正文都是库里现成的、可重放的文件。

端口来源：AINative 研发实战 `.qoder案例2/agents/scaffold-agent/`——`vars.ps1` 的占位符变量表、
`workflows/NN-name/{workflow.md,script.ps1}` 七个工作流、宿主 agent 定义里的四段式协议与
「禁止修改用户已有的 .qoder/」这条约束。语料解决的是"每次现写脚本、每次都不一样"，这个动机在本库同样成立。

## 目录里有什么

| 文件 | 一句话职责 | 谁读它 |
|------|-----------|--------|
| `vars.mjs` | 公共变量表（九个占位符 + 推导规则），跨栈只留"必须问用户"的那几项 | 引擎 `numbered-workflow.mjs` |
| `numbered-workflow.mjs` | 引擎：解析 vars 与栈计划 → 拼出落盘件 → 执行 → 按退出码判定 | 宿主 skill 的段 B/C/D |
| `plans/<stack>.json` | 每个栈的目录清单、配置与最小实现正文、必产文件、后续指引 | 引擎（栈知识只在这里，工作流正文跨栈通用） |
| `workflows/NN-name/workflow.md` | 本步的目标 / 输入变量 / 产出物 / 验证方法 | 宿主 skill 的段 A |
| `workflows/NN-name/script.mjs` | 本步的可执行正文 | 引擎拼接后进 `.scaffold/` 执行 |

工作流（编号即执行顺序，与语料同为 7 步）：

| 编号目录 | 对应语料 | 副作用 |
|----------|----------|--------|
| 01-create-directories | 01-create-directories | 建目录 |
| 02-write-configs | 02-backend-configs | 写配置 |
| 03-write-skeleton-code | 03 + 04（Java/前端基础设施合并） | 写最小实现 |
| 04-verify-paths | 05-package-rename（原版只验证不重命名，语义保留） | 只读核对 |
| 05-init-repo | 06-init（去掉自动建库） | 建 .gitignore + 指南 |
| 06-build-verify | 各 workflow.md 的「验证方法」升格为独立一步 | 跑栈 build 命令 |
| 07-append-module | 07-crud-option（只告知切换，不代跑） | 无 |

## 四段式协议（宿主必须照这个顺序做）

| 段 | 做什么 | 命令 |
|----|--------|------|
| 段 A 理解目标 | 读 `workflows/<id>/workflow.md`，弄清本步的输入、产出与验证方法 | 直接 Read |
| 段 B 拼脚本 | 解析 vars 与本栈计划，拼出落盘件 | `node <库根>/assets/templates/numbered-workflows/numbered-workflow.mjs compose --stack <栈> --vars <values.json> --workflow <id> --project <目标项目根>` |
| 段 C 执行 | 跑落盘件 | `node <项目>/.scaffold/step<id>.mjs`（或直接 `run` 子命令，B+C+D 一把过） |
| 段 D 验证 | 按 workflow.md 的「验证方法」核对，**以退出码为准** | 0 = 通过并打印 `✓ 工作流 <id> 完成`；非 0 = 见下条 |

**`values.json` 从哪来**（段 B 的入参，宿主 skill 或用户写）：键 = `vars.mjs` 变量表里的 `key` 字段全集（即模板中 `__TOKEN__` 去掉两侧下划线后的名字，**以 `vars.mjs` 为准，不要猜**），值 = 本项目的具体取值。缺哪个键，引擎会逐个点名并附语义与示例（`✗ 缺必填变量 projectName（占位符 __PROJECT_NAME__）：工程名…如 Crm。`）；出现 `vars.mjs` 里没有的键同样响亮失败（退出码 2），因为那意味着模板与调用方已经不同代。第一次上手可以只传 `{}` 跑 `compose`，照报错把必填项补齐。`tools/fixtures/` 里的样例是**开发侧夹具、不随库分发**，项目里不会自带现成文件。

**失败即问**：任一段非 0 退出，停下来问用户「重试还是跳过」。不自行继续、不自行改写落盘件、
不改库内文件、不改用户已有配置。引擎在段 D 会把这句原话打出来，靠的是退出码而不是模型的自觉。

**禁止修改用户已有 .qoder/**：这条在语料里只是 agent 正文的一句话，本库把它做成退出码——
`assertWritable()` 按路径段拦，目标项目根或落盘目录里出现 `.qoder` 即退出码 2。
同一条守卫还拦"把运行产物写进库自身"（唯一例外是开发侧自测用的 `tools/out/`）。

## 落盘与同代

- 运行产物只落在**目标项目**：`.scaffold/vars.resolved.mjs`（解析后的变量）+ `.scaffold/step<id>.mjs`（段 B 拼出的可执行件）。
  它们可删可重建，`.scaffold/` 由工作流 05 进 `.gitignore`。
- 落盘件头部带 `@generated-from <库内正文路径> sha256=<12位> version=<manifest 版本>`，
  另附 vars 与栈计划的 sha。改库内源而不重新拼，落盘件就会与库不同代——这是"声明侧 / 磁盘侧 / 执行侧
  三方同真同假"在本资产上的落法。
- 同代不是只在拼接那一刻成立：`verify-gen --workflow <编号> --project <项目根>` 拿库内**当前**源重算
  三处 sha 比对，专查"库升级了而项目里还跑旧构建"（查出来退出码 1，与段 D 同一口径）。
- **本目录整体不落盘到项目**（有意为之，与 checks/34 第⑧条同源）：宿主从 better-coding skill 目录直读，
  项目级安装路径 = `.qoder/skills/better-coding/assets/templates/numbered-workflows/`。
  理由：引擎与协议是"库托管代码"，落盘到项目就多一份装配账（复制计划 + 期望值 + 清单三侧同步），
  而它没有任何用户定制面；阶段 A 因此不复制它，`harness-verify` 也没有对应期望值。

## 端口偏离（不照抄的地方，逐条给理由）

| 编号 | 语料 | 这里 | 为什么 |
|------|------|------|--------|
| D1 | `pwsh -File step{id}.ps1` | `node .scaffold/step{id}.mjs` | 本库脚本层自 v9.0.0 只有 `.mjs` 一种载体；再产 `.ps1` 就把已消灭的孪生漂移请回来 |
| D2 | token 只在 vars.ps1 里替换，而 `02-backend-configs/script.ps1` 正文里另有 46 行占位符（含变量表里没有的那一个） | 引擎对 vars 模板、栈计划、工作流正文**统一替换**，并在落盘前做全文残留检查，残留即退出码 2 | 语料那两处机制只有一处被协议覆盖，按原文执行会把未解析的占位符写进 pom.xml |
| D3 | `vars.ps1` 头部说脚本用 dot-source 引入 vars，协议却让 Agent 拼接后执行；`05-package-rename` 打印 ✗ 后仍退 0 | 只保留"拼接落盘"一条路径；校验不过就退出码 1 | dot-source 从未出现在任何脚本里（实测 7 个 script.ps1 命中 0 次），两份说法必须择一；而退 0 会让段 D 的"失败即问"永不触发 |
| D4 | 06-init 用明文数据库密码自动建 MySQL 库 | 不建库、不引入凭证类变量 | 语料自己标注"仅课程测试演示"；把明文凭据模板化进通用库是负资产 |
| D5 | 07-crud-option 教用户把 `.qoder/` 整目录复制进新工程 | 只给切换指引，复制动作交回用户 | 与「禁止修改用户已有 .qoder/」直接冲突，禁令优先 |
| D6 | 每步产物清单硬编码在各脚本里 | 抽成 `plans/<stack>.json`，工作流正文跨栈通用 | 语料只有 Java+React 一种栈；本库有五栈 + 原型，复制七份脚本等于复制七遍逻辑 |
