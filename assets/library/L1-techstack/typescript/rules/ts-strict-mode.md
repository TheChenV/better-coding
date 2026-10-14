---
description: TypeScript严格模式规范 - 详见正文
trigger: glob
glob: **/*.ts, **/*.tsx
---


# TypeScript 严格模式规范

## 概述

TypeScript 严格模式是保证代码类型安全的基石。所有项目必须开启完整严格模式，禁止为了"快速通过编译"而关闭任何严格检查选项。

## 必须遵守

- **必须** 在 `tsconfig.json` 中设置 `"strict": true`
- **必须** 开启 `noImplicitAny`，禁止隐式 any 类型
- **必须** 开启 `strictNullChecks`，所有可能为 null/undefined 的值必须显式处理
- **必须** 开启 `strictFunctionTypes`，确保函数参数类型逆变检查
- **必须** 开启 `strictBindCallApply`，确保 bind/call/apply 参数类型正确
- **必须** 开启 `noUncheckedIndexedAccess`，索引访问返回 `T | undefined`
- **推荐** 开启 `exactOptionalPropertyTypes`，区分 `undefined` 和属性缺失

## 禁止事项

- **禁止** 使用 `// @ts-ignore` 跳过类型错误（除非附带详细注释说明原因和追踪 issue）
- **禁止** 使用 `// @ts-nocheck` 禁用整个文件的类型检查
- **禁止** 使用非空断言 `!` 替代正确的空值检查（除测试代码外）
- **禁止** 在 tsconfig 中设置 `"strict": false` 或单独关闭任何 strict 子选项
- **禁止** 使用 `as any` 绕过类型系统

## tsconfig.json 标准配置

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],

    // 严格模式 - 全部必须开启
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,

    // 额外严格检查
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,

    // 模块与输出
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## 非空断言的正确替代

```typescript
// ❌ 错误：使用非空断言
const name = user!.name;
const element = document.getElementById('app')!;

// ✅ 正确：使用条件检查
const name = user?.name ?? 'Anonymous';

const element = document.getElementById('app');
if (!element) {
  throw new Error('Element #app not found');
}
// 此处 element 类型已收窄为 HTMLElement
```

## strictNullChecks 处理模式

```typescript
// ❌ 错误：忽略可能为 undefined 的情况
function getLength(arr: string[] | undefined): number {
  return arr.length; // 编译错误
}

// ✅ 正确：显式处理
function getLength(arr: string[] | undefined): number {
  return arr?.length ?? 0;
}

// ✅ 正确：使用类型守卫
function processUser(user: User | null) {
  if (user === null) {
    return;
  }
  // 此处 user 类型已收窄为 User
  console.log(user.name);
}
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| `strict: true` | 必须 |
| `noUncheckedIndexedAccess` | 必须 |
| `@ts-ignore` 使用 | 需附注释 + issue 链接 |
| 非空断言 `!` | 仅测试代码允许 |
| CI 中 `tsc --noEmit` | 必须通过 |