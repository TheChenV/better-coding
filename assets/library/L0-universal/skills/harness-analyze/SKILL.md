---
name: harness-analyze
description: 跨产物一致性检查（对齐 spec-kit /speckit.analyze）。检查 PRD↔ARCH↔SPEC↔代码覆盖度、Gherkin 验收标准↔测试用例对应、SPEC↔API 契约一致性、术语一致性，输出结构化报告（一致项/不一致项/缺失项分级），只读不阻断流程；可作为 spec 门禁（文档间一致性）与 implement 门禁（SPEC↔代码↔测试对齐）的辅助检查。触发词：/harness-analyze、一致性检查、跨产物对齐。
---

# 跨产物一致性检查（harness-analyze）

> 对齐 spec-kit `/speckit.analyze`：在门禁/评审前对产物链做一次只读交叉核对，把不一致暴露出来。
> 本 skill 只输出报告，**不修改任何文件、不阻断流程**；门禁是否放行由门禁清单（references/sdd-gates-checklist.md）决定，本检查仅作为辅助输入。

## 触发条件

- 用户输入 `/harness-analyze`（可附范围参数，如"只查订单模块"）
- spec 门禁前核对文档间一致性、implement 门禁前核对 SPEC↔代码↔测试对齐
- /precode-alignment 或 /spec-aligned-review 前置的一致性摸底

## 输入与范围

- 默认范围：`docs/prd/`、`docs/arch/`、`docs/spec/`、`docs/changes/`（未归档变更）+ 对应实现代码与测试目录
- 用户可指定子集（如仅 docs/spec/ + 对应代码）；文档缺失时对应检查维度标记"缺失项"，不中断其余检查

## 执行步骤

### Step 1: 收集产物清单

扫描范围内的 MRD/PRD/ARCH/SPEC/SPEC-API 契约/SPEC-TEST/代码/测试文件，建立产物索引（名称→路径→版本/修订记录）。

### Step 2: 四维核对

1. **需求覆盖度（PRD↔ARCH↔SPEC↔代码）**：每条需求（REQ/用户故事）是否有对应架构决策、模块 SPEC 与实现落点；反向检查代码中无规格依据的模块
2. **验收标准↔测试用例**：SPEC 的 Gherkin 验收标准（Given/When/Then）与测试用例（SPEC-TEST/测试代码）逐条对应，找未覆盖场景与无来源用例
3. **SPEC↔API 契约**：SPEC 中的接口定义与 SPEC-API-contract（OpenAPI）的路径、方法、参数、状态码比对；有条件时与实际代码路由/签名抽查比对
4. **术语一致性**：以**领域词汇本**（`.qoder/rules/project-domain-glossary.md`，阶段 A 即落盘）为基准源，跨文档核对关键术语/实体名拼写与定义；发现未登记术语、同物多名、定义冲突 → 列入报告并引导写入/裁定（修订需用户确认，不自动改文档）

### Step 3: 分级输出结构化报告

```
# 一致性检查报告（/harness-analyze）

范围：[检查的产物清单]

## ✅ 一致项（N）
- [维度] 结论摘要

## ⚠️ 不一致项（N，按严重度 high/medium/low 分级）
- [维度][严重度] 位置：具体矛盾描述 → 建议处置（/spec-delta 修订 / /run-tests 补用例 / ...）

## ❌ 缺失项（N）
- [维度] 应有未有：缺失内容 → 建议补齐指令
```

## 输出物

- 结构化一致性报告（对话输出；用户要求时可写入 `docs/` 指定位置）
- 不一致/缺失项的处置建议均挂接现有指令（/spec-delta、/run-tests、/quick-spec 等），不另造流程

## 边界

- 只读检查：不修改文件、不阻断流程、不新增门禁（门禁清单已定稿，本检查仅为 spec/implement 门禁的辅助检查）
- 不确定的对应关系标"待确认"，禁止臆断；产物缺失只记缺失项，不推断内容
