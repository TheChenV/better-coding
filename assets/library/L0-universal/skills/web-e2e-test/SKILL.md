---
name: web-e2e-test
description: Web E2E 测试执行。SDD Phase 7 执行引擎：读 SPEC-TEST → 生成 Playwright 用例（核心流程优先）→ 执行并截图取证 → 输出 E2E 报告。触发方式：/web-e2e-test。来源：anthropics webapp-testing（Playwright 纪律）。
---

# Web E2E 测试执行（SDD Phase 7）

## 核心理念

> **E2E 只测核心用户流程，不追求页面全覆盖。**
> 没有证据的"测试通过"无效：每个用例必须有执行输出与关键步骤截图。
> 来源：anthropics webapp-testing — Playwright 驱动、截图取证、失败即调试。

## 触发条件

- 用户输入 `/web-e2e-test`
- SDD 流程进入 Phase 7（集成测试），SPEC-TEST 已产出
- 核心流程开发完毕需要端到端验证

## 前置条件

- [ ] SPEC-TEST 已产出（`docs/spec/SPEC-TEST-*.md`）
- [ ] 应用可在本地/测试环境启动（/start-dev 或部署产物）
- [ ] Node.js 环境可用（Playwright 依赖）

## 执行步骤

### Step 1: 读取测试计划

1. 读取 SPEC-TEST：E2E 用例清单、核心流程定义、Mock 策略
2. 按优先级筛选：**P0 核心流程全覆盖，P1 抽样，P2 不纳入 E2E**（下沉到单元/集成层）

### Step 2: 准备测试环境

```bash
# 项目未安装 Playwright 时初始化
npm init -y 2>/dev/null
npm install -D @playwright/test
npx playwright install chromium
```

- 确认被测应用启动方式与基础 URL
- 准备测试数据策略（独立测试数据/清理脚本，禁止污染共享数据）

### Step 3: 生成用例（核心流程优先）

每个用例遵守：
- 一个用例验证一条完整用户流程（登录→下单→支付 类全链路）
- 使用语义定位器（role/label/text），避免脆弱的 CSS 选择器
- 关键步骤断言 + 关键节点截图（`page.screenshot()`）
- 三类覆盖：正常流程 ✅ / 异常流程 ❌（错误提示可见）/ 边界 ⚠️（空态/超长输入）

### Step 4: 执行与取证

```bash
npx playwright test --reporter=list
```

- 全量执行，收集通过/失败数与耗时
- 失败用例保留 trace 与截图证据（`--trace on`）

### Step 5: 输出 E2E 报告

```markdown
## E2E Test Report
- 用例: N 个（P0: X / P1: Y）
- 通过: X | 失败: Y | 跳过: Z
- 耗时: T
- 关键截图: tests/e2e/screenshots/（列出）
- 失败用例清单:
  | # | 用例 | 失败步骤 | 证据(trace/截图) | 初步判断 |
```

### Step 6: 失败处置

失败用例 → 进入 Qoder 内置 systematic-debugging 流程（可叠加 references/debugging-supplement.md 反锚定补丁）：
- 判定是用例问题还是应用缺陷
- 应用缺陷 → 建缺陷记录并修复后重跑
- 用例问题（定位器/时序）→ 修用例，禁止用 `waitForTimeout` 硬等掩盖时序问题

## 输出物

- Playwright 用例代码（tests/e2e/）
- E2E 执行报告（含截图证据）
- 失败用例调试记录（如有）

## 失败处理

| 失败场景 | 处理方式 |
|----------|----------|
| SPEC-TEST 缺失 | 暂停，回到 /create-module-spec 补充测试计划 |
| 应用无法启动 | 先修复启动问题（/debug），不生成空跑用例 |
| 环境不稳定导致 Flaky | 重试 1 次；仍不稳定则标记 flaky 并创建 Issue，不计入通过率 |
| 核心流程全部失败 | 阻断交付，回退到 implement 阶段排查 |
