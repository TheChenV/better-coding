---
description: React样式规范 - 详见正文
trigger: glob
glob: **/*.tsx, **/*.jsx
---


# React 样式规范

## 概述

统一的样式方案确保 UI 一致性和可维护性。本规范定义了样式技术选型、设计 Token 使用和响应式/暗色模式标准。

## 必须遵守

- **必须** 项目统一使用一种样式方案：Tailwind CSS（推荐）或 CSS Modules
- **必须** 颜色、间距、字体等使用设计 Token（CSS 变量），禁止硬编码
- **必须** 所有交互组件支持暗色模式
- **必须** 关键布局支持响应式（mobile-first）
- **推荐** 使用 `clsx` / `cn` 工具合并条件类名
- **推荐** 组件样式与逻辑分离（CSS Modules）或原子化（Tailwind）

## 禁止事项

- **禁止** 使用内联 style 对象（除动态计算值外）
- **禁止** 使用 `!important`（除覆盖第三方库且附注释）
- **禁止** 硬编码颜色值（如 `#3b82f6`），必须使用 Token
- **禁止** 混用多种样式方案（如同时用 styled-components + Tailwind）
- **禁止** 全局 CSS 选择器影响其他组件（除 reset/normalize）

## Tailwind CSS 方案（推荐）

```tsx
// ✅ 正确：使用 Tailwind 原子类 + 设计 Token
import { cn } from '@/lib/utils';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
}

export function Button({ variant = 'primary', size = 'md', isLoading, children }: ButtonProps) {
  return (
    <button
      className={cn(
        // 基础样式
        'inline-flex items-center justify-center rounded-lg font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2',
        'disabled:pointer-events-none disabled:opacity-50',
        // 变体
        {
          'bg-primary text-primary-foreground hover:bg-primary/90': variant === 'primary',
          'bg-secondary text-secondary-foreground hover:bg-secondary/80': variant === 'secondary',
          'hover:bg-accent hover:text-accent-foreground': variant === 'ghost',
        },
        // 尺寸
        {
          'h-8 px-3 text-sm': size === 'sm',
          'h-10 px-4 text-sm': size === 'md',
          'h-12 px-6 text-base': size === 'lg',
        }
      )}
      disabled={isLoading}
    >
      {isLoading && <Spinner className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
```

## CSS Modules 方案

```tsx
// ✅ 正确：CSS Modules 组件样式隔离
import styles from './UserCard.module.css';
import { cn } from '@/lib/utils';

export function UserCard({ user, className }: UserCardProps) {
  return (
    <div className={cn(styles.card, className)}>
      <img src={user.avatar} className={styles.avatar} alt={user.name} />
      <div className={styles.info}>
        <h3 className={styles.name}>{user.name}</h3>
        <p className={styles.email}>{user.email}</p>
      </div>
    </div>
  );
}
```

```css
/* UserCard.module.css */
.card {
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
  padding: var(--spacing-4);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.avatar {
  width: var(--size-12);
  height: var(--size-12);
  border-radius: var(--radius-full);
}

.name {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}
```

## 设计 Token（CSS 变量）

```css
/* tokens.css - 全局设计 Token */
:root {
  /* 颜色 */
  --color-primary: oklch(0.55 0.22 265);
  --color-primary-foreground: oklch(0.98 0.01 265);
  --color-surface: oklch(1 0 0);
  --color-text-primary: oklch(0.15 0.01 265);
  --color-border: oklch(0.9 0.01 265);

  /* 间距 */
  --spacing-1: 0.25rem;
  --spacing-2: 0.5rem;
  --spacing-4: 1rem;
  --spacing-8: 2rem;

  /* 圆角 */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-full: 9999px;

  /* 字体 */
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
}

/* 暗色模式 Token */
[data-theme='dark'] {
  --color-surface: oklch(0.15 0.01 265);
  --color-text-primary: oklch(0.95 0.01 265);
  --color-border: oklch(0.3 0.01 265);
}
```

## 响应式设计（Mobile-First）

```tsx
// ✅ 正确：mobile-first 响应式
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>

// ✅ 正确：响应式排版
<h1 className="text-2xl font-bold sm:text-3xl lg:text-4xl">
  {title}
</h1>
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 统一使用一种样式方案 | 必须 |
| 颜色/间距使用 Token | 必须 |
| 支持暗色模式 | 必须 |
| 关键布局响应式 | 必须 |
| 无内联 style（除动态值） | 必须 |
| 无 `!important` | 必须 |
| 组件样式隔离 | 必须 |