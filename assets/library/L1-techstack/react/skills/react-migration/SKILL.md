---
name: react-migration
description: React版本迁移. Manual-trigger skill. Source: Harness component library.
---


# React 版本迁移

## 概述

React 大版本升级（如 17→18、18→19）涉及 Breaking Changes、API 废弃和行为变更。本流程确保迁移安全、可回滚。

## 前置条件

- 当前版本测试全部通过（基线）
- Git 分支隔离：`feat/react-{version}-migration`
- 完整的 CI 流水线（lint + test + build）
- 阅读官方 Upgrade Guide 和 Changelog

## 执行步骤

### Step 1: 分析 Breaking Changes

```bash
# 查看当前 React 版本
npx react --version

# 使用 react-codemod 检查可自动迁移的模式
npx react-codemod --help

# 检查已废弃 API 使用情况
npx eslint . --rule '{"react/no-deprecated": "error"}'
```

**分析清单：**

| 变更项 | 影响范围 | 迁移方式 |
|--------|----------|----------|
| `ReactDOM.render` → `createRoot` | 入口文件 | 手动 |
| 自动批处理行为变更 | 异步状态更新 | 审查 |
| `useEffect` 严格模式双调用 | 所有 useEffect | 审查副作用幂等性 |
| 废弃生命周期（componentWillMount等） | Class 组件 | codemod + 手动 |
| 新 Hooks（use、useActionState） | 可选采用 | 渐进式 |

### Step 2: 更新依赖

```bash
# 更新 React 核心
pnpm add react@latest react-dom@latest

# 更新类型定义
pnpm add -D @types/react@latest @types/react-dom@latest

# 更新相关生态库（确保兼容）
pnpm add @tanstack/react-query@latest
pnpm add react-router-dom@latest
pnpm add zustand@latest

# 检查 peer dependency 冲突
pnpm ls react --depth=0
```

### Step 3: 逐文件迁移

```tsx
// ❌ React 17 入口
import ReactDOM from 'react-dom';
ReactDOM.render(<App />, document.getElementById('root'));

// ✅ React 18+ 入口
import { createRoot } from 'react-dom/client';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

```tsx
// ❌ React 17：异步中不自动批处理
setTimeout(() => {
  setCount(c => c + 1);  // 触发一次渲染
  setFlag(f => !f);      // 又触发一次渲染
}, 100);

// ✅ React 18+：自动批处理（无需修改代码，但需验证行为）
// 上述代码现在只触发一次渲染
// 如果确实需要分开渲染：
import { flushSync } from 'react-dom';
setTimeout(() => {
  flushSync(() => setCount(c => c + 1));
  flushSync(() => setFlag(f => !f));
}, 100);
```

### Step 4: 运行 Codemod

```bash
# React 官方 codemod
npx react-codemod rename-unsafe-lifecycles src/
npx react-codemod update-react-imports src/

# 自定义 codemod（jscodeshift）
npx jscodeshift -t ./codemods/migrate-to-create-root.ts src/ --extensions=tsx

# 验证 codemod 结果
npx tsc --noEmit
npx eslint . --max-warnings=0
```

### Step 5: 测试验证

```bash
# 运行全量测试
pnpm vitest run --coverage

# 运行 E2E 测试（关键路径）
pnpm playwright test

# 严格模式下检查副作用
# 确保 useEffect 双调用不产生问题
pnpm dev  # 手动验证关键流程
```

**重点验证项：**
- 数据获取逻辑（useEffect 双调用不重复请求）
- 订阅/取消订阅（cleanup 正确）
- 定时器（不重复创建）
- 第三方库兼容性（图表、编辑器等）

### Step 6: 性能对比

```bash
# 迁移前基准（在旧分支）
npx lighthouse http://localhost:3000 --output=json --output-path=./baseline.json

# 迁移后对比
npx lighthouse http://localhost:3000 --output=json --output-path=./after.json

# 对比关键指标
# FCP、LCP、TTI、Bundle Size
```

| 指标 | 迁移前 | 迁移后 | 变化 |
|------|--------|--------|------|
| FCP | - | - | 应持平或改善 |
| LCP | - | - | 应持平或改善 |
| Bundle Size | - | - | 不应增加 > 5% |
| 测试覆盖率 | - | - | 不应下降 |

## 回滚策略

```bash
# 如果迁移出现严重问题，立即回滚
git checkout main
git branch -D feat/react-18-migration

# 如果是部分问题，revert 特定 commit
git revert <commit-hash>
```

## 检查清单

- [ ] Breaking Changes 清单已分析
- [ ] 依赖版本已更新且无冲突
- [ ] 入口文件已迁移（createRoot）
- [ ] Codemod 已运行并验证
- [ ] 全量测试通过
- [ ] E2E 关键路径通过
- [ ] 严格模式副作用验证
- [ ] 性能指标无退化
- [ ] 第三方库兼容性确认