---
name: ts-test
description: TypeScript测试流程. Manual-trigger skill. Source: Harness component library.
---


# TypeScript 测试流程

## 概述

分层测试策略确保代码质量：单元测试验证逻辑正确性，组件测试验证 UI 行为，E2E 测试验证用户流程。

## 前置条件

- 测试框架：Vitest（推荐）/ Jest
- 组件测试：@testing-library/react
- E2E 测试：Playwright
- 覆盖率目标：语句 >= 80%，分支 >= 75%

## 执行步骤

### Step 1: 单元测试（Vitest）

```bash
# 运行所有单元测试
npx vitest run

# 监听模式（开发时使用）
npx vitest

# 运行特定文件
npx vitest run src/utils/format.test.ts

# 生成覆盖率报告
npx vitest run --coverage
```

**单元测试编写规范：**

```typescript
// src/utils/format.test.ts
import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate } from './format';

describe('formatCurrency', () => {
  it('should format positive numbers with currency symbol', () => {
    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50');
  });

  it('should handle zero', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
  });

  it('should handle negative numbers', () => {
    expect(formatCurrency(-99.9, 'EUR')).toBe('-€99.90');
  });

  it('should throw on invalid currency code', () => {
    expect(() => formatCurrency(100, 'INVALID')).toThrow('Invalid currency');
  });
});
```

### Step 2: 组件测试（Testing Library）

```bash
# 运行组件测试
npx vitest run --project=components
```

**组件测试编写规范：**

```typescript
// src/components/UserCard.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { UserCard } from './UserCard';

describe('UserCard', () => {
  const mockUser = { id: '1', name: 'Alice', email: 'alice@example.com' };

  it('should render user name and email', () => {
    render(<UserCard user={mockUser} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('should call onDelete when delete button clicked', async () => {
    const onDelete = vi.fn();
    render(<UserCard user={mockUser} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(onDelete).toHaveBeenCalledWith('1');
  });

  it('should show loading state', () => {
    render(<UserCard user={mockUser} isLoading />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
```

### Step 3: E2E 测试（Playwright）

```bash
# 运行 E2E 测试
npx playwright test

# 带 UI 模式调试
npx playwright test --ui

# 生成测试报告
npx playwright test --reporter=html
```

**E2E 测试编写规范：**

```typescript
// e2e/login.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should login successfully with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText('Welcome back')).toBeVisible();
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toContainText('Invalid credentials');
  });
});
```

### Step 4: 覆盖率检查

```bash
# 生成覆盖率并检查阈值
npx vitest run --coverage

# 查看 HTML 报告
npx vitest run --coverage --coverage.reporter=html
open coverage/index.html
```

**覆盖率配置（vitest.config.ts）：**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types/**',
      ],
    },
  },
});
```

## 测试命名规范

```
describe('<模块/组件名>', () => {
  describe('<方法名/场景>', () => {
    it('should <期望行为> when <条件>', () => {});
  });
});
```

## 检查清单

- [ ] 单元测试全部通过
- [ ] 组件测试全部通过
- [ ] E2E 关键路径通过
- [ ] 覆盖率达标（>= 80%）
- [ ] 无跳过的测试（`.skip`）
- [ ] 测试无随机失败（flaky test）