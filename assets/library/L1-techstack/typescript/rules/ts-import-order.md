---
description: TypeScript导入排序规范 - 详见正文
trigger: glob
glob: **/*.ts, **/*.tsx
---


# TypeScript 导入排序规范

## 概述

统一的导入排序提升代码可读性，减少合并冲突。所有导入必须按分组排列，组间用空行分隔。

## 必须遵守

- **必须** 按以下顺序分组排列导入：
  1. Node.js 内置模块（`node:*`）
  2. 外部依赖（npm 包）
  3. 内部模块（别名路径 `@/`、`~/`）
  4. 相对路径模块（`./`、`../`）
  5. 类型导入（`import type`）
- **必须** 每组之间用一个空行分隔
- **必须** 组内按字母顺序排列
- **必须** 使用 `import type` 导入纯类型
- **推荐** 配置 ESLint 自动排序，避免手动管理

## 禁止事项

- **禁止** 在同一文件中混合 `import` 和 `require()`
- **禁止** 使用相对路径超过三层（`../../../`），应配置路径别名
- **禁止** 导入未使用的模块
- **禁止** 使用通配符导入 `import * as` 除非确实需要命名空间
- **禁止** 在导入语句中产生循环依赖

## 标准导入顺序示例

```typescript
// 1. Node.js 内置模块
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// 2. 外部依赖（npm 包）
import express from 'express';
import { z } from 'zod';
import { Logger } from 'winston';

// 3. 内部模块（路径别名）
import { DatabaseService } from '@/services/database';
import { ConfigService } from '@/services/config';
import { authMiddleware } from '@/middleware/auth';

// 4. 相对路径模块
import { formatResponse } from './utils/format';
import { validateInput } from './validators';

// 5. 类型导入（始终放在最后）
import type { Request, Response, NextFunction } from 'express';
import type { User } from '@/types/user';
import type { ApiResponse } from './types';
```

## React 项目导入顺序

```typescript
// 1. React 核心
import { useState, useCallback, useMemo } from 'react';

// 2. 外部依赖
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';

// 3. 内部模块
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';

// 4. 相对路径
import { UserCard } from './components/user-card';
import { formatDate } from './utils';

// 5. 样式（始终在类型之前）
import styles from './dashboard.module.css';

// 6. 类型导入
import type { FC } from 'react';
import type { DashboardProps } from './types';
```

## ESLint 配置

```javascript
// eslint.config.js (flat config)
import importPlugin from 'eslint-plugin-import';

export default [
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/order': ['error', {
        groups: [
          'builtin',   // Node.js 内置
          'external',  // npm 包
          'internal',  // 路径别名 @/
          'parent',    // ../
          'sibling',   // ./
          'index',     // ./index
          'type',      // import type
        ],
        pathGroups: [
          { pattern: 'react', group: 'external', position: 'before' },
          { pattern: 'react-dom/**', group: 'external', position: 'before' },
          { pattern: '@/**', group: 'internal' },
        ],
        pathGroupsExcludedImportTypes: ['react'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      }],
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'error',
      'import/no-cycle': 'error',
      'import/no-self-import': 'error',
      'import/no-unused-modules': 'warn',
    },
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
      },
      'import/internal-regex': '^@/',
    },
  },
];
```

## 路径别名配置

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/types/*": ["./src/types/*"]
    }
  }
}
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 导入分5组排列 | 必须 |
| 组间空行分隔 | 必须 |
| 组内字母序 | 必须 |
| 纯类型用 `import type` | 必须 |
| ESLint import/order 规则 | 必须开启 |
| 相对路径不超过3层 | 必须 |
| 无循环依赖 | 必须 |