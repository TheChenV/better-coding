---
description: TypeScript异步模式规范 - 详见正文
trigger: glob
glob: **/*.ts, **/*.tsx
---


# TypeScript 异步模式规范

## 概述

统一的异步编程模式是保证代码可读性和可维护性的关键。本规范定义了 TypeScript 项目中异步操作的标准写法。

## 必须遵守

- **必须** 优先使用 `async/await` 语法，而非 `.then()` 链式调用
- **必须** 对所有 `await` 表达式进行错误处理（try/catch 或调用方处理）
- **必须** 使用 `Promise.all` / `Promise.allSettled` 处理并行异步操作
- **必须** 为所有返回 Promise 的函数标注返回类型 `Promise<T>`
- **推荐** 使用 `Promise.allSettled` 当需要所有结果（含失败）时
- **推荐** 对长时间操作设置超时（AbortController）

## 禁止事项

- **禁止** 产生 floating promises（未 await 也未 catch 的 Promise）
- **禁止** 在循环中串行 await 可并行的操作
- **禁止** 在 `.then()` 中嵌套 `.then()`（Promise 嵌套）
- **禁止** 使用 `void asyncFunction()` 而不处理可能的错误
- **禁止** 在 `finally` 中抛出异常覆盖原始错误

## async/await 优先

```typescript
// ❌ 错误：使用 .then() 链
function fetchUser(id: string): Promise<User> {
  return fetch(`/api/users/${id}`)
    .then(res => res.json())
    .then(data => transformUser(data))
    .catch(err => handleError(err));
}

// ✅ 正确：使用 async/await
async function fetchUser(id: string): Promise<User> {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) {
    throw new ApiError(`Failed to fetch user: ${res.status}`);
  }
  const data: unknown = await res.json();
  return transformUser(data);
}
```

## 并行执行

```typescript
// ❌ 错误：串行执行独立请求
async function loadDashboard(): Promise<DashboardData> {
  const user = await fetchUser();       // 等待完成
  const orders = await fetchOrders();   // 再等待
  const stats = await fetchStats();     // 再等待
  return { user, orders, stats };
}

// ✅ 正确：并行执行独立请求
async function loadDashboard(): Promise<DashboardData> {
  const [user, orders, stats] = await Promise.all([
    fetchUser(),
    fetchOrders(),
    fetchStats(),
  ]);
  return { user, orders, stats };
}

// ✅ 正确：需要容错时使用 allSettled
async function syncAll(items: SyncItem[]): Promise<SyncResult[]> {
  const results = await Promise.allSettled(
    items.map(item => syncItem(item))
  );
  return results.map((result, i) => ({
    item: items[i],
    success: result.status === 'fulfilled',
    data: result.status === 'fulfilled' ? result.value : undefined,
    error: result.status === 'rejected' ? result.reason : undefined,
  }));
}
```

## 错误处理

```typescript
// ❌ 错误：floating promise
function handleWebhook(payload: WebhookPayload): void {
  processWebhook(payload); // 返回 Promise 但未处理！
}

// ✅ 正确：显式处理
async function handleWebhook(payload: WebhookPayload): Promise<void> {
  try {
    await processWebhook(payload);
  } catch (error) {
    logger.error('Webhook processing failed', { payload, error });
    throw error; // 或降级处理
  }
}

// ✅ 正确：如果确实不需要等待结果
function handleWebhookFireAndForget(payload: WebhookPayload): void {
  processWebhook(payload).catch(error => {
    logger.error('Webhook processing failed', { payload, error });
  });
}
```

## 超时控制

```typescript
// ✅ 推荐：使用 AbortController 设置超时
async function fetchWithTimeout(
  url: string,
  timeoutMs = 5000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TimeoutError(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

## 循环中的异步

```typescript
// ❌ 错误：循环中串行 await
async function processItems(items: Item[]): Promise<void> {
  for (const item of items) {
    await processItem(item); // 逐个等待，性能差
  }
}

// ✅ 正确：并行处理（注意并发限制）
import pLimit from 'p-limit';

async function processItems(items: Item[]): Promise<void> {
  const limit = pLimit(5); // 最大并发数 5
  await Promise.all(
    items.map(item => limit(() => processItem(item)))
  );
}

// ✅ 正确：确实需要串行时（有顺序依赖）
async function processPipeline(steps: Step[]): Promise<void> {
  for (const step of steps) {
    await executeStep(step); // 步骤间有依赖，必须串行
  }
}
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 使用 async/await 而非 .then() | 必须 |
| 所有 Promise 有错误处理 | 必须 |
| 无 floating promises | 必须 |
| 独立异步操作并行执行 | 推荐 |
| 外部调用设置超时 | 推荐 |
| ESLint `no-floating-promises` 规则 | 必须开启 |