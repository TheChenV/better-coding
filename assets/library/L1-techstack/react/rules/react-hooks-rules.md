---
description: React Hooks使用规范 - 详见正文
trigger: glob
glob: **/*.tsx, **/*.jsx
---


# React Hooks 使用规范

## 概述

Hooks 是 React 函数组件的核心机制。正确使用 Hooks 避免常见 bug（无限循环、过期闭包、性能问题）。

## 必须遵守

- **必须** 只在组件/Hook 顶层调用 Hooks（禁止条件/循环内调用）
- **必须** 自定义 Hook 以 `use` 开头命名
- **必须** `useEffect` 依赖数组完整且正确
- **必须** 可复用逻辑提取为自定义 Hook
- **推荐** 副作用清理函数（return cleanup）防止内存泄漏
- **推荐** 仅在确认性能问题时使用 `useCallback` / `useMemo`

## 禁止事项

- **禁止** 在条件语句、循环、嵌套函数中调用 Hooks
- **禁止** 使用 `// eslint-disable-next-line react-hooks/exhaustive-deps` 跳过依赖检查
- **禁止** 在 `useEffect` 中直接写异步函数（需包装）
- **禁止** 滥用 `useMemo`/`useCallback`（无性能问题时无需使用）
- **禁止** 在自定义 Hook 中直接操作 DOM（应返回 ref 让调用方处理）

## 顶层调用规则

```tsx
// ❌ 错误：条件内调用 Hook
function UserPanel({ isAdmin }: { isAdmin: boolean }) {
  if (isAdmin) {
    const [permissions, setPermissions] = useState<string[]>([]); // 违规！
  }
  return <div />;
}

// ✅ 正确：始终在顶层调用
function UserPanel({ isAdmin }: { isAdmin: boolean }) {
  const [permissions, setPermissions] = useState<string[]>([]);

  if (!isAdmin) {
    return <AccessDenied />;
  }
  return <AdminPanel permissions={permissions} />;
}
```

## useEffect 正确使用

```tsx
// ❌ 错误：缺少依赖 / 对象依赖导致无限循环
useEffect(() => {
  fetchUser(userId);
}, []); // userId 变化时不会重新请求

// ❌ 错误：对象作为依赖（每次渲染新引用）
useEffect(() => {
  fetchData(options);
}, [options]); // options 每次渲染都是新对象 → 无限循环

// ✅ 正确：完整且稳定的依赖
useEffect(() => {
  const controller = new AbortController();

  async function load() {
    try {
      const data = await fetchUser(userId, { signal: controller.signal });
      setUser(data);
    } catch (err) {
      if (!controller.signal.aborted) setError(err);
    }
  }

  load();
  return () => controller.abort(); // 清理函数
}, [userId]); // 仅依赖原始值

// ✅ 正确：对象依赖用 useMemo 稳定化
const stableOptions = useMemo(() => ({ page, limit }), [page, limit]);
useEffect(() => {
  fetchData(stableOptions);
}, [stableOptions]);
```

## 自定义 Hook 提取

```tsx
// ❌ 错误：逻辑散落在组件中
function UserPage({ id }: { id: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/users/${id}`)
      .then(res => res.json())
      .then(setUser)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);
  // ... 每个需要用户数据的组件都要重复这段代码
}

// ✅ 正确：提取为自定义 Hook
function useUser(id: string) {
  return useQuery({
    queryKey: ['user', id],
    queryFn: () => apiClient.get<User>(`/users/${id}`),
    enabled: !!id,
  });
}

// 组件变得简洁
function UserPage({ id }: { id: string }) {
  const { data: user, isLoading, error } = useUser(id);
  if (isLoading) return <Skeleton />;
  if (error) return <ErrorBanner error={error} />;
  return <UserProfile user={user} />;
}
```

## useCallback / useMemo 使用时机

```tsx
// ❌ 不必要：简单计算无需 useMemo
const fullName = useMemo(() => `${first} ${last}`, [first, last]); // 过度优化

// ✅ 合理：昂贵计算使用 useMemo
const sortedData = useMemo(
  () => heavySortAndFilter(data, filters),
  [data, filters]
);

// ✅ 合理：传递给 memo 子组件的回调使用 useCallback
const MemoChild = React.memo(ChildComponent);

function Parent() {
  const [count, setCount] = useState(0);

  // 传递给 memo 组件 → 需要 useCallback 避免子组件重渲染
  const handleClick = useCallback(() => {
    doSomething(count);
  }, [count]);

  return <MemoChild onClick={handleClick} />;
}
```

## 常见自定义 Hook 模式

```tsx
// 防抖 Hook
function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// 本地存储 Hook
function useLocalStorage<T>(key: string, initialValue: T) {
  const [stored, setStored] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStored(prev => {
      const next = value instanceof Function ? value(prev) : value;
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [key]);

  return [stored, setValue] as const;
}
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| Hooks 仅顶层调用 | 必须 |
| useEffect 依赖完整 | 必须 |
| 副作用有清理函数 | 必须 |
| 可复用逻辑提取自定义 Hook | 必须 |
| 自定义 Hook 以 `use` 开头 | 必须 |
| 不滥用 useMemo/useCallback | 推荐 |
| eslint-plugin-react-hooks 开启 | 必须 |