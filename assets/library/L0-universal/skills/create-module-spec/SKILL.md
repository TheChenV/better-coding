---
name: create-module-spec
description: 模块设计文档生成。基于 ARCH 文档（含模块间依赖矩阵）和 PRD，按批次驱动模块设计：批内无依赖模块并行派发 subagent、每 subagent 聚焦单模块产出六件套；支持单模块（向后兼容）与批量两种入参。触发方式：/create-module-spec。来源：SDD Phase 3 模块设计 + AINative detailed-designer 编排。
---

# 模块设计文档生成

## 核心理念

> **模块设计是把架构拆解为可施工蓝图的关键环节。**
>
> 六个关键产出：
> 1. **SPEC-BE**（后端模块设计）— 数据模型、业务规则、异常定义
> 2. **SPEC-API**（API 契约）— OpenAPI 3 格式，前后端并行的基础
> 3. **SPEC-DDL**（数据库建表脚本）— 可直接执行的 SQL
> 4. **SPEC-FE**（前端模块设计）— 页面/组件/状态（如项目含前端）
> 5. **SPEC-TEST**（测试计划）— 正常/异常/边界三类用例
> 6. **task**（任务清单）— 开发实施计划，含优先级和依赖关系
>
> 来源：SDD Phase 3 模块设计 + Spec-Kit 契约先行理念。

## 产出契约（环节卡为单一契约源）

| 项 | 契约 |
|----|------|
| 产出物 | `docs/spec/{NNN}-{slug}/` 六件套：SPEC-BE.md、SPEC-API.yaml（OpenAPI 3）、SPEC-DDL.sql（可直接执行）、SPEC-FE.md、SPEC-TEST.md、tasks.md |
| 模板依赖 | `docs/harness-templates/` 下 SPEC-BE/SPEC-API/SPEC-DDL/SPEC-FE/SPEC-TEST/task 模板 |
| 归档位置 | `docs/spec/NNN-slug/`（NNN 三位递增编号，一功能一目录；每批次执行一次本技能，批内逐模块产出六件套并逐模块落盘） |
| 产出自检 | 每 API 含路径/方法/请求响应/错误码/示例；异常场景四类覆盖（参数非法/未授权/资源不存在/依赖失败）；测试计划含正常/异常/边界；任务含优先级与依赖 |
| 收尾 | 3 步同步 |

## 触发条件

- 用户输入 `/create-module-spec`
- ARCH 文档已产出，需要进入模块设计阶段
- 需要为特定模块生成 SPEC 文档

## 前置条件

- [ ] ARCH 文档已产出（`docs/arch/ARCH-*.md`），且含模块间依赖矩阵与共享约定归属（1.6 节）
- [ ] PRD 已产出（`docs/prd/PRD-*.md`）
- [ ] L2 API 约定已落盘（project-api-convention.md，always_on；subagent 模式下显式读入防漂移）

**入参声明**：入参：模块清单：{模块清单}（可多值，、分隔；单值 = 单模块向后兼容）；未提供时从 ARCH 1.6 依赖矩阵推导并经 AskUserQuestion 确认。

> **v8.4.0 入参优先**：提示词（骨架 3·1/3·2）已自包含输入文档、模板、落盘路径与验收线，显式给出批次划分/模块清单/评审专家角色时**以提示词为准**；批内并行与 Provider 先行的执行机制仍由本 skill 承载，但**对用户的描述统一用“同批模块互不依赖，可并行开工；提供方先交接口契约”这类用户语言**，不得把 subagent/spec-review-agent 等内部名写进用户可见提示词（Check 7f 拦）。

> 调用写法等价说明：环节 3·1 的「{模块清单}」引号式与环节 3·2 的"模块清单：{模块清单}"标签式两种调用写法等价，语义一致，取其一即可。

## 执行步骤

---

### Step 1: 读取输入文档

1. 读取 ARCH 文档，提取：
   - 系统分层架构
   - 模块划分与职责
   - 技术选型约束
   - 数据模型概要

2. 读取 PRD 文档，提取：
   - 本模块相关的用户故事
   - 验收标准
   - 非功能需求

---

### Step 1.5: 模块清单确认与批次划分（批量模式）

1. 从 ARCH 1.6 节提取：模块清单、模块间依赖矩阵、共享 DTO/枚举归属、错误码分段、事件归属
2. 按依赖矩阵拓扑分层划分批次：同批内模块无相互依赖（可并行）；有依赖 → Provider 层先批、Consumer 层后批；单批 ≤5 模块
3. **一次 AskUserQuestion 确认**模块清单、批次划分与 {NNN} 编号预分配（对齐 AINative detailed-designer Step2；单模块入参向后兼容跳过本步）
4. 跨模块依赖协议（Provider-first）：Provider 模块 SPEC-API 先产出冻结 → Consumer 模块引用冻结契约；生成期 Consumer 侧依赖接口先以占位自闭环，Provider 输出后替换
5. 批内执行纪律：无依赖模块并行派发 subagent（每个 subagent 聚焦单模块六件套，独立上下文保深度）；单模块失败仅重跑该模块；tasks.md 限定骨架级（依赖+优先级），逐模块目录落盘

---

### Step 2: 生成 SPEC-BE（后端模块设计）

**模板来源**: `docs/harness-templates/SPEC-BE-template.md`

**产出路径**: `docs/spec/NNN-slug/SPEC-BE.md`（NNN 为三位递增编号 + 功能短名，六件套同目录：SPEC-BE.md / SPEC-API.yaml / SPEC-DDL.sql / SPEC-FE.md / SPEC-TEST.md / tasks.md。旧扁平布局（docs/spec/SPEC-*.md）兼容有效，迁移自愿）

**必须包含**:
- [ ] 模块职责定义
- [ ] 数据模型（字段、类型、约束、索引）
- [ ] 业务规则（规则 ID、名称、描述、约束值）
- [ ] 异常定义（异常码、触发条件、处理方式）
- [ ] 模块间依赖关系

---

### Step 3: 生成 SPEC-API（API 契约）

**模板来源**: `docs/harness-templates/SPEC-API-contract.yaml.template`

**产出路径**: `docs/spec/NNN-slug/SPEC-API.yaml`（与 SPEC-BE 同一编号目录）

**必须包含**:
- [ ] OpenAPI 3 格式
- [ ] 每个 API：路径、方法、请求参数、响应结构、错误码
- [ ] 分页约定（如适用）
- [ ] 认证要求（如适用）
- [ ] 至少 1 个请求/响应示例

**质量门禁**:
- API 契约必须与 SPEC-BE 的数据模型一致
- 错误码必须与 SPEC-BE 的异常定义一致

---

### Step 4: 生成 SPEC-DDL（数据库建表脚本）

**模板来源**: `docs/harness-templates/SPEC-DDL-template.sql`

**产出路径**: `docs/spec/NNN-slug/SPEC-DDL.sql`（与 SPEC-BE 同一编号目录）

**必须包含**:
- [ ] 建表语句（字段、类型、约束、注释）
- [ ] 索引定义
- [ ] 外键约束（如适用）
- [ ] 初始化数据（如适用）

**质量门禁**:
- DDL 必须可直接执行（无语法错误）
- 字段必须与 SPEC-BE 的数据模型一致

---

### Step 5: 生成 SPEC-FE（前端模块设计，如适用）

**模板来源**: `docs/harness-templates/SPEC-FE-template.md`

**产出路径**: `docs/spec/NNN-slug/SPEC-FE.md`（与 SPEC-BE 同一编号目录）

**必须包含**:
- [ ] 页面清单与路由
- [ ] 组件树（公共组件 vs 页面私有组件）
- [ ] 状态管理方案
- [ ] API 调用映射（与 SPEC-API 对应）
- [ ] 四态处理（加载/成功/失败/空）

**注意**: 纯后端项目可跳过此步骤。

---

### Step 6: 生成 SPEC-TEST（测试计划）

**模板来源**: `docs/harness-templates/SPEC-TEST-template.md`

**产出路径**: `docs/spec/NNN-slug/SPEC-TEST.md`（与 SPEC-BE 同一编号目录）

**必须包含**:
- [ ] 用例清单（编号、输入、预期输出、分类）
- [ ] 三类覆盖：正常用例、异常用例、边界用例
- [ ] 每个 P0/P1 用户故事至少 2 条 Gherkin 验收标准
- [ ] 性能/精度相关用例（如适用）

---

### Step 7: 生成 task（任务清单）

**模板来源**: `docs/harness-templates/task-template.md`

**产出路径**: `docs/spec/NNN-slug/tasks.md`（与 SPEC-BE 同一编号目录）

**必须包含**:
- [ ] 任务列表（ID、描述、优先级、预估工时）
- [ ] 依赖关系（哪些任务必须串行，哪些可并行）
- [ ] 实施顺序建议（通常：DDL → BE → API → FE → TEST）
- [ ] 粒度限定：骨架级任务（依赖+优先级），细化版（Task Group+implementation-notes）由环节 5 产出

---

### Step 8: 一致性检查

生成所有文档后，执行交叉检查：

- [ ] SPEC-API 的接口与 SPEC-BE 的业务规则一致
- [ ] SPEC-DDL 的字段与 SPEC-BE 的数据模型一致
- [ ] SPEC-FE 的 API 调用与 SPEC-API 的契约一致
- [ ] SPEC-TEST 的用例覆盖 PRD 的所有用户故事
- [ ] task 的任务覆盖所有 SPEC 文档的实现工作
- [ ] （批量模式）清单级 API 对称预检：Provider 模块 SPEC-API 冻结后，Consumer 模块引用一致性预检（Provider=Consumer 对称、共享 DTO 单点、错误码无撞号、事件成对）

---

### Step 8.5: 登记接口契约（deps.yaml）

六件套齐备后按模块登记接口契约，供环节 6 的漂移检测取数（只登记不改动任何设计正文）：

- [ ] 每模块一份：复制 `docs/harness-templates/deps-template.yaml` → `server/<模块>/deps.yaml`（后端）或 `web/<模块>/deps.yaml`（前端），`metadata.module_name` 与模块名逐字一致
- [ ] `provides[].api_version` 与 `consumes[].pinned_version` 一律写 semver；`pinned_version` **逐字取** Provider 模块 `docs/spec/NNN-slug/SPEC-API.yaml` 的 `info.version`，不近似、不省略 patch
- [ ] 外部服务无本方契约时 `contract_file` 与 `pinned_version` 留 `null`（检测器判 skipped，不计漂移）
- [ ] 登记完自检一次：`node .qoder/scripts/contract-drift.mjs --all --format text` 退出码须为 0——报 `breaking_drift` 说明本批登记即自相矛盾（消费方锁的 major 与 Provider 契约不等），必须在收尾前修平，不得留给环节 6

---

### Step 9: 追加 harness-continuous-sync 同步步骤

**执行 harness-continuous-sync 步骤 1-3**（唯一规范：.qoder/commands/live-refresh.md）。

---

## 输出格式

```markdown
✅ 模块设计文档生成完成（{批次说明：单模块 / 批次 N 含 M 模块}）

逐模块产出汇总：
| 模块 | 编号目录 | 六件套 | 一致性预检 |
|------|---------|--------|-----------|
| {模块名} | docs/spec/NNN-slug/ | SPEC-BE/API/DDL/FE/TEST/tasks ✅ | ✅ |

（单模块模式输出格式不变；批次模式每模块独立目录落盘，跨模块一致性由环节 3·2 收口，判据统一引用门禁 1 模块统一一致性校验（references/sdd-gates-checklist.md））
```

## 失败处理

| 失败场景 | 处理方式 |
|----------|---------|
| ARCH 文档不存在 | 提示用户先完成架构设计（环节 2） |
| PRD 文档不存在 | 提示用户先完成需求分析（环节 1） |
| 模块范围不明确 | 追问用户本模块包含哪些功能点 |
| 批内单模块失败 | 仅重跑该模块的 subagent/生成，其余模块产出不受影响 |
| 技术选型未确定 | 提示用户先确定技术栈（影响 DDL 语法等） |

## 实战经验

1. **API 契约优先** — 先定 API，前后端才能并行开发
2. **DDL 必须可执行** — 不能只写"字段名 类型"，要写完整的 CREATE TABLE
3. **测试计划覆盖验收标准** — PRD 的每个验收标准都应有对应测试用例
4. **任务清单含依赖关系** — 标注哪些任务可并行，哪些必须串行
