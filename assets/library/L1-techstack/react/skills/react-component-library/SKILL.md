---
name: react-component-library
description: React组件库开发流程. Manual-trigger skill. Source: Harness component library.
---


# React 组件库开发流程

## 概述

从设计到发布的完整组件库开发流程，确保组件质量、文档完备和可维护性。

## 前置条件

- React 18+ / TypeScript 5+
- 构建工具：tsup（推荐）/ Rollup
- 文档：Storybook 8+
- 测试：Vitest + Testing Library
- 包管理：pnpm workspace（monorepo）

## 执行步骤

### Step 1: 组件设计

```markdown
## 组件设计文档：Button

### 用途
通用操作触发器

### Props 设计
| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| variant | 'primary' \| 'secondary' \| 'ghost' \| 'danger' | 'primary' | 视觉变体 |
| size | 'sm' \| 'md' \| 'lg' | 'md' | 尺寸 |
| isLoading | boolean | false | 加载状态 |
| isDisabled | boolean | false | 禁用状态 |
| leftIcon | ReactNode | - | 左侧图标 |
| onClick | () => void | - | 点击回调 |

### 交互状态
- Default / Hover / Active / Focus / Disabled / Loading

### 无障碍
- 渲染为 <button> 元素
- Loading 时 aria-busy="true"
- 支持键盘 Enter/Space 触发
```

### Step 2: Props 定义与类型

```tsx
// src/components/button/types.ts
import type { ReactNode, ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 视觉变体 */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 加载状态 */
  isLoading?: boolean;
  /** 左侧图标 */
  leftIcon?: ReactNode;
  /** 右侧图标 */
  rightIcon?: ReactNode;
}
```

### Step 3: 组件实现

```tsx
// src/components/button/Button.tsx
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from '../spinner';
import type { ButtonProps } from './types';

const variantStyles = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
} as const;

const sizeStyles = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
} as const;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, leftIcon, rightIcon, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading && <Spinner className="h-4 w-4 animate-spin" />}
        {!isLoading && leftIcon}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
```

### Step 4: Storybook 文档

```tsx
// src/components/button/Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { children: 'Button', variant: 'primary' },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex gap-4">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
    </div>
  ),
};

export const Loading: Story = {
  args: { children: 'Saving...', isLoading: true },
};
```

### Step 5: 单元测试

```tsx
// src/components/button/Button.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled when isLoading', () => {
    render(<Button isLoading>Submit</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('applies variant classes', () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-destructive');
  });
});
```

### Step 6: 构建与发布

```json
// package.json
{
  "name": "@myorg/ui",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "storybook": "storybook dev -p 6006",
    "test": "vitest run",
    "prepublishOnly": "pnpm build"
  }
}
```

## 检查清单

- [ ] 组件设计文档完成（Props、状态、无障碍）
- [ ] TypeScript 类型完整导出
- [ ] 组件实现 + forwardRef
- [ ] Storybook stories 覆盖所有变体
- [ ] 单元测试覆盖交互和状态
- [ ] 构建产物包含 ESM + CJS + 类型声明
- [ ] 无障碍属性（aria-*）正确