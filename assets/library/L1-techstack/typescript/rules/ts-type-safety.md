---
description: TypeScript类型安全规范 - 详见正文
trigger: glob
glob: **/*.ts, **/*.tsx
---


# TypeScript 类型安全规范

## 概述

类型安全是 TypeScript 的核心价值。本规范定义了如何最大化利用类型系统，避免运行时类型错误。

## 必须遵守

- **必须** 使用 `unknown` 替代 `any` 处理未知类型数据
- **必须** 使用类型守卫（type guard）收窄 `unknown` 类型
- **必须** 对外部数据（API 响应、用户输入）使用运行时校验（zod）
- **必须** 使用 discriminated unions 表达多态状态
- **推荐** 使用 `satisfies` 运算符进行类型验证
- **推荐** 使用 `as const` 定义常量对象/数组

## 禁止事项

- **禁止** 使用 `any` 类型（除第三方库类型缺失的临时过渡，需标注 TODO）
- **禁止** 使用 `as` 强制类型断言替代类型守卫（除 DOM API 等确定场景）
- **禁止** 对 API 响应直接信任类型，必须运行时校验
- **禁止** 使用 `enum`（推荐 `as const` 对象或联合类型）
- **禁止** 在公共 API 中使用 `object`、`{}` 等宽泛类型

## unknown + 类型守卫

```typescript
// ❌ 错误：使用 any
function parseJSON(input: string): any {
  return JSON.parse(input);
}
const data = parseJSON('{"name": "test"}');
console.log(data.anything); // 无类型检查！

// ✅ 正确：使用 unknown + 类型守卫
function parseJSON(input: string): unknown {
  return JSON.parse(input);
}

interface User {
  name: string;
  age: number;
}

function isUser(data: unknown): data is User {
  return (
    typeof data === 'object' &&
    data !== null &&
    'name' in data &&
    typeof (data as Record<string, unknown>).name === 'string' &&
    'age' in data &&
    typeof (data as Record<string, unknown>).age === 'number'
  );
}

const data = parseJSON('{"name": "Alice", "age": 30}');
if (isUser(data)) {
  console.log(data.name); // 类型安全 ✓
}
```

## Zod 运行时校验

```typescript
import { z } from 'zod';

// ✅ 必须：定义 schema 并推导类型
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
  role: z.enum(['admin', 'user', 'guest']),
  createdAt: z.string().datetime(),
});

// 从 schema 推导 TypeScript 类型（单一数据源）
type User = z.infer<typeof UserSchema>;

// ✅ 必须：校验外部数据
async function fetchUser(id: string): Promise<User> {
  const res = await fetch(`/api/users/${id}`);
  const json: unknown = await res.json();
  return UserSchema.parse(json); // 运行时校验 + 编译时类型
}

// ✅ 推荐：安全解析（不抛异常）
function safeParseUser(data: unknown) {
  const result = UserSchema.safeParse(data);
  if (!result.success) {
    return { ok: false as const, errors: result.error.flatten() };
  }
  return { ok: true as const, data: result.data };
}
```

## Discriminated Unions

```typescript
// ❌ 错误：用可选字段表达状态
interface ApiResponse {
  data?: User[];
  error?: string;
  loading?: boolean;
}

// ✅ 正确：使用 discriminated union
type ApiState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: ApiError; retryCount: number };

// 编译器确保穷举处理
function renderState(state: ApiState<User[]>): string {
  switch (state.status) {
    case 'idle':
      return 'Click to load';
    case 'loading':
      return 'Loading...';
    case 'success':
      return state.data.map(u => u.name).join(', ');
    case 'error':
      return `Error: ${state.error.message} (retry #${state.retryCount})`;
    // 如果漏掉任何 case，编译器报错（配合 never 检查）
  }
}

// ✅ 推荐：穷举检查辅助函数
function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
```

## satisfies 运算符

```typescript
// ✅ 推荐：使用 satisfies 验证类型但保留字面量推断
const routes = {
  home: '/',
  about: '/about',
  user: '/user/:id',
} satisfies Record<string, `/${string}`>;

// routes.home 类型是 '/' 而非 string（保留字面量）
type RoutePath = (typeof routes)[keyof typeof routes]; // '/' | '/about' | '/user/:id'

// ✅ 推荐：as const 定义常量
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number]; // 'GET' | 'POST' | ...
```

## 泛型约束

```typescript
// ❌ 错误：无约束的泛型
function getProperty<T, K>(obj: T, key: K) {
  return (obj as any)[key]; // 失去类型安全
}

// ✅ 正确：使用泛型约束
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user = { name: 'Alice', age: 30 };
const name = getProperty(user, 'name'); // string
const age = getProperty(user, 'age');   // number
// getProperty(user, 'email'); // 编译错误 ✓
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 禁止 `any`（ESLint `no-explicit-any`） | 必须 |
| 外部数据用 zod 校验 | 必须 |
| 多态状态用 discriminated union | 必须 |
| 类型推导优先于手动标注 | 推荐 |
| `satisfies` 验证配置对象 | 推荐 |
| 避免 `enum`，用 `as const` | 推荐 |