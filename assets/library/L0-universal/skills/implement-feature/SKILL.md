---
name: implement-feature
description: SDD 环节 5 执行引擎（对应骨架 5·1-5·4，承载 Coding Loop 循环体/Gate 审计/Worker 协议细节）：路由决策（S0 应用类型）→ 后端协议（任务拆分 Task Group→Coding Loop MAX_ITERATIONS=10/STALL_THRESHOLD=2→Phase Gate 5 级审计→Gate 失败计数与 [B] blocked→对话式修正→openspec-verify-change 完成处理）/ 前端协议（6-Pre-Check→工程初始化→加载设计系统→五阶段流水线 框架/视觉/交互/数据/优化→交付审核清单→无设计稿降级）/ 全栈并行。规格验收驱动：每层先取 SPEC 已写下的验收判据，每层完成后必须有编译+测试证据（Worker 单任务逐层基线）。触发方式：/implement-feature。来源：融合 Addy Osmani build 流程 + Superpowers verification-before-completion 的证据驱动 + Harness 课程第4课逐层实现。
---

# 基于 Spec 的功能实现（环节 5 执行引擎）

## 核心理念

> **主 Agent 只编排（路由/拆分/派发/审计），subagent 执行（auto-coding subagent 写代码）。**
>
> 三条铁律：
> 1. **规格验收铁律**：每层的验收判据取自 SPEC，不写 SPEC 外功能；没有证据的完成不存在。
> 2. **证据铁律**：每层完成后必须出示编译通过 + 测试通过的证据，再进入下一层。
> 3. **Spec 铁律**：代码与 Spec 不一致时，以 Spec 为准修正代码，而非反过来。
>
> **引擎定位（骨架 5·2/5·3 显式下沉）**：骨架环节 5 = 5·1 路由决策 → 5·2 后端实现／5·3 前端实现／5·4 全栈并行；骨架已标注“Coding Loop 循环体/Gate 审计/Worker 协议细节由 implement-feature skill 内部协议承载”——本文件即该内部协议的权威承载。
>
> 来源：Superpowers verification-before-completion 的证据驱动 + Addy Osmani build 流程 + Harness 课程第 4 课的逐层实现。

## 触发条件

- 用户输入 `/implement-feature`
- SDD 环节 5 进入：5·1 路由决策 / 5·2 后端实现 / 5·3 前端实现 / 5·4 全栈并行（PROJECT-LIVE 提示词总表环节 5 入口）
- spec 主门禁已过（环节 1-3 收尾），六件套已就绪
- 用户要求按设计文档实现具体功能

## 前置条件

- [ ] docs/spec/{NNN}-{slug}/ 六件套就绪（SPEC-BE/SPEC-API/SPEC-DDL/SPEC-FE/SPEC-TEST/tasks.md）
- [ ] spec 主门禁已通过（环节 1-3 收尾）；Full-Stack 应用 SPEC-UI 已冻结（前端路径前置）
- [ ] 了解项目技术栈和分层架构（ARCH）

**如果前置条件不满足**：暂停实现，回 `/create-module-spec` 补齐模块设计；技术栈未声明先 `/harness-assemble`。

## 执行步骤

### 随手记（implementation-notes，v9.0.0）

实现过程中偏离 SPEC 的判断、临时取舍、发现的规格漏洞，当场追加到
`docs/spec/NNN-slug/implementation-notes.md`（一行一条：现象 / 当时怎么定的 / 要不要回写规格）。
收尾时逐条决定：回写规格（走变更增量）或标注理由关闭——不留未决条目。
（环节 5 引擎协议，对应骨架 5·1-5·4）

---

### Step 0: 路由决策（S0 应用类型）[对应骨架 5·1]

0. **git 方式确认（v9.5.0，本环节开工前一次）**：读 `.qoder/harness-profile.json#git`。
   - `mode = pending` → 这是全框架**第一次真正需要 git**（"一个任务一次提交"从下一步起生效）。按 SKILL「提问优先级裁决」第 ③ 类发卡问一次（三档取值域见 `<SKILL 库>/manifest.json#gitGovernance`，本文件不复述），答后回写 `mode` 并记一行 `history`。**不得设默认值、不得代选、不得因为"已经有仓库了"就推断选了 `remote`**。
   - `mode = none` → 本环节的"每次改动都有独立提交"类验收项按**不适用**处理（标 ⊘ 并在 `docs/项目交接.md` 写一句依据），不假装完成、也不因此停工。
   - `mode = local` → 照常提交，但不出现任何 `push`/PR 步骤；`pre-push-test` 若被触发会自报"档不对"。
   - `mode = remote` → 完整提交 + 分支 + 推送链；主干名与远端名取 `git.trunk` / `git.remote`，**不写死 `main`/`origin`**。
   - 仓库不存在而档是 `local`/`remote` → 交给 `/branch-workflow` Step 0（守"先钉行尾再 `git init`"顺序，且**由用户执行或明确点头**）。
1. **读取设计依据**：`{SPEC路径}`（docs/spec/{NNN}-{slug}/ 六件套）与 `profile.appType`，判定应用类型——**判定须读设计文档而非猜测**
2. **路由**：
   - 纯后端服务 → **后端路径**（Step 1 后端协议，主 Agent 编排循环）
   - 前端或全栈 → **前端路径**（Step 2 前端协议，五阶段渐进编码）
   - 全栈且前后端可解耦 → **并行派发**（Step 3 全栈并行）
   - 不确定 → 询问用户
3. **产出路由决策记录**（决策留痕在 docs/项目交接.md，无需 3 步同步）

**Red Line（主 Agent 严禁越界，整环节生效）**：
- 主 Agent 严禁自己写业务代码 / 手动创建源文件 / 直接运行 build 命令（mvn/gradle/go build/npm run build 是 subagent 职责）
- 主 Agent 只做：读文档、更新 tasks 与进度、派发 subagent、执行门禁审计

**自检 step_gate**：路由判定有依据（Backend/Full-Stack/Frontend）。

---

### Step 1: 后端协议——任务拆分 + Coding Loop + 完成处理 [对应骨架 5·2]

#### B1 任务拆分

- 从六件套产出 `docs/spec/{NNN}-{slug}/tasks.md`：**Task Group 结构**，每 task 可独立在单个上下文完成，含文件路径 + 实现要点 + 幂等/限流/降级关注点，按依赖排序
- 同步产出 `implementation-notes.md`：记录 spec 之外不得不做的决策/变更/权衡与须知
- 拆分结果可对话修正（可多次）

#### B2 Coding Loop（MAX_ITERATIONS=10 / STALL_THRESHOLD=2）

> **v8.4.0 入参优先与对外措辞约定**：上述两个常量为**默认值**；提示词显式给出重试轮数或停滞阈值时以提示词为准（如“最多重试 8 轮”）。对用户与提示词手册一律用“最多自动重试 N 轮、连续 M 轮没进展就标‘卡住’并找我”这类用户语言，**不得**把 `MAX_ITERATIONS`/`STALL_THRESHOLD`/`[B] blocked`/`auto-coding subagent`/`openspec-verify-change` 等内部名写进用户可见提示词（骨架『用户语言禁词表』与 harness-verify Check 7f 拦住）。

主 Agent 自动跑 Coding Loop，每轮循环体依次执行：

1. **Exit condition**：检查 tasks.md 是否全 [x]（ALL_DONE）或达 MAX_ITERATIONS=10
2. **Dispatch auto-coding subagent**：按 tasks.md 逐任务派发实现（六边形分层顺序 api→adapter→app→domain→start；ARCH 声明其他分层风格时以 SPEC/ARCH 为准）
3. **Phase Gate Check（5 级验证 audit）**：见下方“Gate 审计协议”
4. **Code review**：每轮对产出代码做 review，audit 失败即 reject iteration
5. **Update infrastructure readiness**：更新基础设施就绪状态
6. **Iteration summary**：本轮总结留痕

**Worker 最小上下文协议（每次 Dispatch 附带）**：task-id + contract-id + 验收标准 + 契约表片段 + spec 切片（≤1 模块/≤2 接口/≤5 DTO）+ files in scope + 验证命令。

**Worker 5 铁律**：一任务一 commit / 不读无关文件 / 不主动重构相邻代码 / 问题立刻上报 / 完成立刻退出。

**Worker 单任务实现基线**：auto-coding subagent 领取单个 task 后按文末「Worker 单任务逐层验收基线」实现（每层留证据，分层顺序以 ARCH/SPEC 声明为准）。

**progress.txt**：循环开始前初始化，逐轮记录进度与 Gate 结果。

#### Gate 审计协议（Phase Gate Check 5 级验证 audit）

| 级别 | 验证内容 | 规则 |
|------|---------|------|
| Level 1 | Build（编译/构建） | **必过，不可跳过** |
| Level 2-5 | Lint/静态检查、单元测试、契约测试（SPEC-API 0 diff）、启动与集成验证 | **前置满足时不可跳过** |

- 各级验证命令取 tasks.md 验证命令字段与 techstack-commands.json（按项目技术栈）
- audit 失败 → **reject iteration**，进入 B3 Gate 失败自动处理
- 每层验证通过再进下层；5 级审计逐级留痕

#### B3 Gate 失败自动处理

1. Log failure 到 progress.txt
2. Increment gate failure counter
3. Re-dispatch auto-coding subagent 并附错误详情
4. **Escalation**：同一 iteration 连续 Gate 失败 ≥2 次（STALL_THRESHOLD=2）→ 标 tasks.md 对应任务为 `[B] blocked` → 提示用户干预（防止反复产出可编译但无法启动的代码浪费 iteration）

#### B4 结果修正与完成处理

- **结果修正**：对话式修正实现结果（可多次，不偏离技术选型）
- **完成处理**：主 Agent 检测到 tasks.md 全 [x] 后自动调用 `openspec-verify-change` 整体验证（编译+测试+契约）
- **Leader 纪律**：Leader 收到 Worker Summary 后立刻丢弃 Worker 内部对话

**产出**：docs/spec/{NNN}-{slug}/tasks.md + implementation-notes.md + 后端工程代码 + progress.txt + 每轮 commit + 整体验证报告。

**自检 step_gate（骨架 5·2 全迁入）**：tasks.md 含 Task Group 结构且每 task 可独立完成；subagent 已派发；progress.txt 初始化；MAX_ITERATIONS=10/STALL_THRESHOLD=2 已配置；每层验证通过再进下层；Phase Gate 5 级审计留痕；连续失败≥2 次已标 [B] blocked 并请求人工介入（不无限循环）；修正不偏离技术选型；ALL_DONE+整体验证通过（编译/测试/Lint）。

---

### Step 2: 前端协议——6-Pre-Check + 工程初始化 + 设计系统 + 五阶段流水线 + 交付审核 [对应骨架 5·3]

#### F1 入口绑定与 6-Pre-Check（每任务开始前强制，违反任一项不允许提交代码）

| # | 检查项 | 验证方式 |
|---|--------|---------|
| 1 | 禁 Emoji 图标 | grep=0 |
| 2 | 禁蓝紫渐变 | grep=0 |
| 3 | 图标统一 lucide-react | strokeWidth 1.5-2.2 |
| 4 | 单页颜色 ≤3 种 | 逐页检查 |
| 5 | 按钮风格统一 | 逐页检查 |
| 6 | 占位图用 Unsplash·Pexels CDN | 禁本地占位图 |

- 可并行场景启动 N 个子 Agent 并行开发不同页面（共享组件由主 Agent 提前完成，各子 Agent 操作不同页面目录）

#### F2 工程初始化（首次执行前端任务前运行一次）

- 目标工程目录不存在 → 交互原型存在且完整则**拷贝到输出目录**，否则读 SPEC-FE 调 frontend-project-scaffolder 初始化
- 拷贝后校验 `npm install && npm run dev` 无编译错误

#### F3 加载设计系统

- 存在 SPEC-UI → frontend-ui-designer 加载 design tokens/组件规范/交互约束
- 仅参考图 → 参考图还原工具 agent 做 VL 分析提取组件树+视觉规格作为虚拟设计系统

#### F4 五阶段流水线（每任务逐阶段推进）

1. **框架**：静态页面结构（原型拷贝参照 SPEC-FE 更新 / 原型图 参考图还原工具 生成 / 原型缺失手动布局，先外层容器后内部细节）
2. **视觉**：VL 分析+像素级还原（所有 token 引用 CSS 变量/Tailwind theme，禁硬编码魔法值）+ browser-testing-with-devtools 截图验证 + 差异分析（P0-P3 分级）+ 修复至视觉相似度≥90——**最高优先级 Guardrail：用户提供设计工程时必须与设计工程完全一致，不得以任何理由偏离**
3. **交互**：页面交互逻辑（表单校验/状态切换/路由跳转/动效）+ Mock 数据 4 态（加载/空/错误/正常）+ Console 无错误
4. **数据**：关闭 Mock 替换真实 API（请求参数/响应数据映射/错误处理，错误码闭环）
5. **优化**：响应式适配+边界测试（空数据/超长文本/网络异常）+ 性能检查 + 完整测试套件 + 构建检查 + Commit（注明视觉相似度得分）+ Mark task complete [ ]→[x]

**NEVER 条款**：NEVER mark task complete if visual-gate=required and P0/P1 unresolved；NEVER skip 阶段3【交互】和阶段4【数据】——视觉通过不等于任务完成。

#### F5 交付审核清单（标记完成前全部通过）

| 类别 | 检查项 |
|------|--------|
| 架构合规 | 模块边界 / 全局 State 规范 / 技术栈合规 / 分层 Pages→Components→UI·Base→Hooks·Utils |
| 业务逻辑 | 交互与原型设计稿一致 / 异常处理覆盖关键边界 / 异步有 Loading+防抖节流 / 路由权限一致 |
| 代码质量 | 命名注释规范 / 无重复 UI 或逻辑 / 无安全漏洞 XSS·dangerouslySetInnerHTML·敏感信息 / 无 Emoji 图标 / 无蓝紫渐变 |
| 契约一致性 | 请求参数响应解析与 API 契约完全一致 / 接口联调全通过 / 无过期接口版本 / 新增字段已同步 TS 类型 |
| 交付前确认 | P0+P1 清零 / 视觉相似度≥90 / Console 无错 / TS 无类型错 / 单测通过行覆盖率≥60%（**环节 5 过程门**，只拦"没写过测试"；终门阈值以 SPEC-TEST 第 4.2 章定稿值为准，不在本处比大小） / 响应式验证通过 / 遵循 SPEC-UI / 前端构建通过无 ESLint·Prettier 报错 |

#### F6 无设计稿降级分支

- 视觉阶段以**布局正常性检查**替代像素级还原（dev server 截图确认无白屏/无布局断裂 + Console 无错），其余阶段同流水线

**产出**：前端工程代码 + 单测 + tasks.md [x] + 交付审核结论。

**自检 step_gate（骨架 5·3 全迁入）**：6-Pre-Check 6 项全过（违反任一项不允许提交代码）；工程可启动+无编译错误；设计系统就位（Tailwind theme/CSS 变量/组件库映射明确）；静态页面可渲染；P0+P1 视觉问题清零+视觉相似度≥90；Console 无错误+4 态全覆盖；接口联调全通过+错误码闭环；交付审核 4 大类 20+ 项全通过；降级分支布局正常性检查通过。

---

### Step 3: 全栈并行 [对应骨架 5·4]

- 前后端可解耦时用**两个子 Agent 并行执行**（不要串行）：子 Agent 1（后端）执行 Step 1 后端协议全流程；子 Agent 2（前端）执行 Step 2 前端协议全流程
- 两个子 Agent 同时启动、各自独立完成，最后汇报各自产出
- **注意**：子 Agent 不嵌套、独立上下文；共享契约（API schema）先冻结

**自检 step_gate**：前后端各自 step_gate 通过；契约 0 diff。

---

## Worker 单任务逐层验收基线（auto-coding subagent 执行单 task 的内部方法论）

> 以下逐层验收流程服务于 Step 1 B2 的 Worker 派发：auto-coding subagent 领取单个 task 后按本基线实现。分层顺序以 ARCH/SPEC 声明的架构风格为准（六边形架构按 api→adapter→app→domain→start；经典分层自底向上 数据库→Domain→Service→API）。🔴 本库的纪律只有两条：**每层的验收判据取自 SPEC（不自造标准）** 与 **每层完成后必须有证据**；把判据写成可执行断言的时机不作统一规定——它不是纪律，证据才是。

---

### 基线 1: 读取 Spec，制定实现计划

> **在写任何代码之前，完整理解要实现什么。**

**必须阅读：**
- 功能规格说明（Spec/Proposal）
- 架构设计文档（相关模块部分）
- 接口定义（API 契约/OpenAPI）
- 数据模型设计（ER 图/Schema）

**输出实现计划：**
```markdown
## 实现计划: <功能名>

### 分层实现顺序
1. 数据库层: <需要创建/修改的表/字段/索引>
2. Domain 层: <需要创建的实体/值对象/枚举>
3. Service 层: <需要实现的业务用例>
4. API 层: <需要暴露的接口>

### 每层测试策略
- 数据库层: 迁移脚本可正向执行 + 可回滚
- Domain 层: 单元测试（实体行为、值对象不变量）
- Service 层: 单元测试 + 集成测试（业务用例）
- API 层: 契约测试（请求/响应格式验证）

### 预计文件清单
- [ ] <文件 1>
- [ ] <文件 2>
- [ ] ...
```

---

### 基线 2: 数据库层

> **先建数据基础，再建上层建筑。**

**2.1 编写测试（验证迁移脚本）**
```bash
# 测试迁移脚本可正向执行
# 测试迁移脚本可回滚（down migration）
# 测试索引已正确创建
```

**2.2 实现 Schema 变更**
- 创建/修改表结构
- 创建必要的索引
- 编写迁移脚本（含 up 和 down）

**2.3 验证**
- 迁移脚本可正向执行 ✅
- 迁移脚本可回滚 ✅
- 索引设计合理 ✅

**证据输出：**
```
数据库层完成:
- 迁移脚本: <文件名>
- 正向执行: ✅ (附输出)
- 回滚执行: ✅ (附输出)
```

---

### 基线 3: Domain 层（模型/实体）

> **实体行为判据取自 SPEC 的领域规则（不变量、状态流转）；实现后必须出示单测通过证据。**

**3.1 编写测试**
```
测试用例:
- 实体创建: 必填字段缺失时应抛出异常
- 状态流转: 合法状态转换应成功，非法转换应失败
- 值对象: 不变量被违反时应抛出异常
- 领域行为: 业务规则计算结果正确
```

**3.2 实现实体**
- 实体类（Entity）：含业务属性和行为
- 值对象（Value Object）：不可变的领域概念
- 枚举/常量：状态、类型等
- 领域事件（如适用）

**3.3 验证**
- 编译通过 ✅
- 单元测试通过 ✅

**证据输出：**
```
Domain 层完成:
- 编译: ✅ (附输出)
- 测试: ✅ (附输出，X 个测试全部通过)
- 新增文件: <列表>
```

---

### 基线 4: Service 层（业务逻辑）

> **每个 Service 方法对应一个业务用例，用例的期望取自 SPEC 的业务规则条目。**

**4.1 编写测试**
```
测试用例:
- 正常流程: 输入合法数据，输出预期结果
- 异常流程: 输入非法数据，抛出预期异常
- 边界条件: 空值、零值、最大值等边界场景
- 并发安全: 并发操作同一资源时的行为（如适用）
```

**4.2 实现业务逻辑**
- 每个 Service 方法对应一个业务用例
- 事务边界在 Service 层控制
- 业务校验在此层完成
- 不依赖具体的 HTTP/RPC 框架

**4.3 验证**
- 编译通过 ✅
- 单元测试通过 ✅
- 集成测试通过 ✅（如涉及数据库交互）

**证据输出：**
```
Service 层完成:
- 编译: ✅ (附输出)
- 单元测试: ✅ (X 个通过)
- 集成测试: ✅ (X 个通过)
- 新增文件: <列表>
```

---

### 基线 5: API 层（接口暴露）

> **先写契约测试描述接口行为，再实现接口。**

**5.1 编写契约测试**
```
测试用例:
- 正常请求: 合法参数 -> 正确状态码 + 响应格式
- 参数校验: 必填缺失 -> 400 + 明确错误信息
- 认证检查: 无 Token -> 401
- 权限检查: 无权限 -> 403
- 资源不存在: 无效 ID -> 404
- 冲突: 重复创建 -> 409
```

**5.2 实现接口**
- 路由定义
- 请求参数校验（DTO/Schema）
- 调用 Service 层
- 统一响应格式
- 错误处理中间件

**5.3 验证**
- 编译通过 ✅
- 契约测试通过 ✅
- 接口可手动调用（curl/Postman）✅

**证据输出：**
```
API 层完成:
- 编译: ✅ (附输出)
- 契约测试: ✅ (X 个通过)
- 接口清单: <列表>
- 新增文件: <列表>
```

---

### 基线 6: 全量验证

> **所有层完成后，执行全量验证。**

```bash
# 全量编译
# <项目构建命令>

# 全量测试
# <项目测试命令>

# Lint 检查
# <项目 Lint 命令>
```

**全量验证输出：**
```
全量验证:
- 编译: ✅ (附输出)
- 测试: ✅ (X 个通过，0 个失败)
- Lint: ✅ (0 个违规)
- 覆盖率: X% (如适用)
```

---

### 基线 7: 更新清单

完成实现后更新相关文档和清单：

- [ ] 更新 API 文档（OpenAPI/Swagger）
- [ ] 更新数据库文档（如有）
- [ ] 更新 CHANGELOG
- [ ] 标记 Spec 中对应条目为已完成；新增领域术语登记入词汇本 `.qoder/rules/project-domain-glossary.md`；代码命名以词汇本英文标识为准
- [ ] 更新 AGENTS.md（如项目结构有变化）
- [ ] 增量维护 `docs/项目交接.md`：更新已完成项（附证据）、已决策表、下一步（精确到文件与操作）；任务收尾（本功能全部层完成）同步后由 3 步同步接管

## 实战经验

1. **"没有判据就没有完成"是最大的陷阱** — 验收判据来自规格，不是实现的副产品；先确认本层判据可执行，再宣称完成。

2. **不要跨层开发** — 完成一层、验证一层、再进入下一层。跨层开发会导致错误定位困难。

3. **编译失败时不要继续** — 在当前层修复编译问题后再继续。带着编译错误进入下一层 = 雪崩。

4. **Spec 不是建议，是契约** — 实现与 Spec 不一致时，修正代码而非 Spec。如果 Spec 确实需要修改，走变更流程。

5. **小步前进** — 每个基线步骤都是一个检查点。不要一口气写完所有代码再验证。

6. **主 Agent 手写代码是最常见的越界** — Red Line 不是建议：主 Agent 手写业务代码 = 上下文污染 + 无法审计；拆分/派发/审计才是主 Agent 的全部职责。

7. **blocked 升级优于无限循环** — 同一 iteration 连续 Gate 失败 ≥2 次立即标 [B] blocked 请求人工介入；反复 re-dispatch 只会浪费 iteration 配额（MAX_ITERATIONS=10 不是重试预算）。

8. **Worker 最小上下文是纪律不是优化** — spec 切片超限（>1 模块/>2 接口/>5 DTO）会让 Worker 读无关文件、越界重构；上下文裁剪不徇情。

9. **视觉通过 ≠ 任务完成** — 前端 NEVER skip 阶段3【交互】和阶段4【数据】；visual-gate=required 且 P0/P1 未清零时禁止 mark task complete。

## 失败处理

| 失败场景 | 处理方式 |
|----------|---------|
| Spec/六件套不清晰 | 暂停实现，回 `/create-module-spec` 补充 |
| 数据库迁移冲突 | 与团队协调迁移顺序，必要时合并迁移文件 |
| 某层编译/测试失败 | 在当前层修复后再继续，不可跳过；audit 失败即 reject iteration |
| 同一 iteration 连续 Gate 失败 ≥2 次 | 标 tasks.md 为 `[B] blocked`，提示用户干预，不再盲目 re-dispatch |
| 达 MAX_ITERATIONS=10 仍未 ALL_DONE | 停止循环，输出剩余任务清单与失败原因交用户裁定 |
| 前端 visual-gate=required 且 P0/P1 未清零 | NEVER mark task complete；修复后重验视觉门禁 |
| 依赖的外部服务不可用 | 使用 Mock/Stub 隔离，先完成本层逻辑 |
| 实现与架构设计不符 | 评估是否需要调整设计（创建新 ADR），或修正实现 |
| 测试覆盖率不达标 | 补充测试用例，不可降低覆盖率阈值 |
