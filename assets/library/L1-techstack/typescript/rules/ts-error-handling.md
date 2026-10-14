---
description: TypeScript错误处理规范 - 详见正文
trigger: glob
glob: **/*.ts, **/*.tsx
---


# TypeScript 错误处理规范

## 概述

统一的错误处理策略确保错误可追踪、可恢复、可观测。本规范定义了 TypeScript 项目中错误处理的标准模式。

## 必须遵守

- **必须** 使用自定义 Error 类表达业务错误，携带结构化上下文
- **必须** 在应用边界（API handler、事件处理器）捕获所有错误
- **必须** 错误信息包含足够上下文（操作、参数、原因）
- **必须** 区分可恢复错误与不可恢复错误
- **推荐** 在核心业务逻辑中使用 Result 模式替代 try/catch
- **推荐** 使用 `cause` 属性保留错误链

## 禁止事项

- **禁止** `throw` 字符串或普通对象（必须 throw Error 实例）
- **禁止** 空 `catch` 块（至少记录日志）
- **禁止** 在库/模块内部吞掉错误而不向上传播
- **禁止** 使用 `catch (e) { throw e }` 无意义重抛
- **禁止** 在 `finally` 中返回值覆盖正常返回

## 自定义 Error 类体系

```typescript
// ✅ 必须：定义应用级错误基类
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly isOperational: boolean;

  constructor(options: {
    message: string;
    code: string;
    statusCode?: number;
    cause?: unknown;
    isOperational?: boolean;
  }) {
    super(options.message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.isOperational = options.isOperational ?? true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ✅ 必须：定义具体业务错误
export class ValidationError extends AppError {
  readonly fields: Record<string, string[]>;

  constructor(fields: Record<string, string[]>, message = 'Validation failed') {
    super({ message, code: 'VALIDATION_ERROR', statusCode: 400 });
    this.fields = fields;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super({
      message: `${resource} with id '${id}' not found`,
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super({ message, code: 'CONFLICT', statusCode: 409 });
  }
}
```

## 禁止 throw 字符串

```typescript
// ❌ 错误：throw 字符串
if (!user) {
  throw 'User not found'; // 无堆栈、无类型、无法结构化处理
}

// ❌ 错误：throw 普通对象
throw { message: 'Something failed', code: 500 };

// ✅ 正确：throw Error 实例
if (!user) {
  throw new NotFoundError('User', userId);
}
```

## Result 模式

```typescript
// ✅ 推荐：核心业务逻辑使用 Result 模式
type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// 使用示例
function divide(a: number, b: number): Result<number, AppError> {
  if (b === 0) {
    return err(new AppError({
      message: 'Division by zero',
      code: 'MATH_ERROR',
      statusCode: 400,
    }));
  }
  return ok(a / b);
}

// 调用方处理
const result = divide(10, 0);
if (!result.ok) {
  logger.warn(result.error.message, { code: result.error.code });
  return;
}
console.log(result.value); // 类型安全：number
```

## 全局错误边界

```typescript
// ✅ 必须：Express 全局错误处理中间件
import type { Request, Response, NextFunction } from 'express';

export function globalErrorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 结构化日志
  const errorInfo = {
    method: req.method,
    path: req.path,
    requestId: req.id,
    timestamp: new Date().toISOString(),
  };

  if (error instanceof AppError) {
    logger.warn('Operational error', { ...errorInfo, code: error.code, message: error.message });
    res.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  // 未预期的编程错误
  logger.error('Unexpected error', { ...errorInfo, error });
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}

// ✅ 必须：包装 async handler 避免未捕获 rejection
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
```

## 错误链（cause）

```typescript
// ✅ 推荐：保留原始错误上下文
async function fetchUserFromDB(id: string): Promise<User> {
  try {
    const row = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    if (!row) {
      throw new NotFoundError('User', id);
    }
    return mapRowToUser(row);
  } catch (error) {
    if (error instanceof AppError) throw error;
    // 包装底层错误，保留 cause
    throw new AppError({
      message: `Failed to fetch user ${id} from database`,
      code: 'DB_ERROR',
      cause: error, // 保留原始错误链
    });
  }
}
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 只 throw Error 实例 | 必须 |
| 自定义 Error 类体系 | 必须 |
| 全局错误处理中间件 | 必须 |
| 空 catch 块 | 禁止 |
| 核心逻辑用 Result 模式 | 推荐 |
| 错误链保留 cause | 推荐 |
| 错误日志结构化 | 必须 |