---
description: React状态管理规范 - 详见正文
trigger: glob
glob: **/*.tsx, **/*.jsx
---


# React 状态管理规范

## 概述

正确的状态管理策略是 React 应用可维护性的核心。本规范定义了不同场景下的状态管理选型和使用原则。

## 必须遵守

- **必须** 优先使用组件局部 state（`useState`），仅在确实需要共享时提升
- **必须** 服务端数据使用 React Query / SWR，禁止手动管理加载/缓存状态
- **必须** 全局客户端状态使用 Zustand（推荐）或 Redux Toolkit
- **必须** 表单状态使用 React Hook Form，禁止手动管理表单字段
- **推荐** URL 状态使用 nuqs / useSearchParams

## 禁止事项

- **禁止** 超过 3 层的 prop drilling（使用 Context 或状态库）
- **禁止** 将服务端数据存入全局 store（应使用 React Query 缓存）
- **禁止** 在 Context 中存放频繁变化的值（导致全树重渲染）
- **禁止** 用 `useEffect` 同步可以用派生计算得到的状态
- **禁止** 在多个 store 中存放同一份数据的副本

## 状态分类决策树

```
需要管理的数据是什么？
│
├── 服务端数据（API 响应）
│   └── ✅ React Query / SWR（自动缓存、重试、失效）
│
├── 表单数据
│   └── ✅ React Hook Form（性能优、校验内置）
│
├── URL 状态（分页、筛选、Tab）
│   └── ✅ nuqs / useSearchParams
│
├── 局部 UI 状态（开关、输入）
│   └── ✅ useState / useReducer（组件内）
│
└── 全局客户端状态（用户信息、主题、权限）
    ├── 简单（< 5 个状态）→ ✅ Zustand
    └── 复杂（中间件、时间旅行）→ ✅ Redux Toolkit
```

## Zustand 全局状态

```typescript
// ✅ 推荐：Zustand store（简洁、无 Provider）
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user, token) => set({ user, token, isAuthenticated: true }),
      logout: () => set({ user: null, token: null, isAuthenticated: false }),
    }),
    { name: 'auth-storage', partialize: (state) => ({ token: state.token }) }
  )
);

// 组件中使用（selector 避免不必要渲染）
function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  return <button onClick={logout}>{user?.name} - Logout</button>;
}
```

## React Query 服务端状态

```typescript
// ✅ 必须：服务端数据用 React Query
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// 查询
function useUsers(page: number) {
  return useQuery({
    queryKey: ['users', { page }],
    queryFn: () => apiClient.get<User[]>(`/users?page=${page}`),
    staleTime: 5 * 60 * 1000, // 5分钟内不重新请求
  });
}

// 变更 + 缓存失效
function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserInput) => apiClient.post('/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

// 组件中使用
function UserList() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useUsers(page);

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorBanner error={error} />;
  return <Table data={data} onPageChange={setPage} />;
}
```

## 避免 Prop Drilling

```tsx
// ❌ 错误：3层以上 prop drilling
function App() {
  const [theme, setTheme] = useState('dark');
  return <Layout theme={theme} setTheme={setTheme} />;
}
function Layout({ theme, setTheme }) {
  return <Sidebar theme={theme} setTheme={setTheme} />;
}
function Sidebar({ theme, setTheme }) {
  return <ThemeToggle theme={theme} setTheme={setTheme} />;
}

// ✅ 正确：使用 Zustand（无需 Provider）
function ThemeToggle() {
  const theme = useSettingsStore((s) => s.theme);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  return <button onClick={toggleTheme}>{theme}</button>;
}
```

## 避免派生状态

```tsx
// ❌ 错误：用 useEffect 同步派生状态
function Cart({ items }: { items: CartItem[] }) {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    setTotal(items.reduce((sum, i) => sum + i.price * i.qty, 0));
  }, [items]);
  return <span>{total}</span>;
}

// ✅ 正确：直接计算（派生状态不需要 state）
function Cart({ items }: { items: CartItem[] }) {
  const total = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.qty, 0),
    [items]
  );
  return <span>{total}</span>;
}
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 服务端数据用 React Query | 必须 |
| 表单用 React Hook Form | 必须 |
| 无超过 3 层 prop drilling | 必须 |
| 全局状态用 Zustand/Redux Toolkit | 必须 |
| 无冗余派生 state | 必须 |
| selector 精确订阅 | 推荐 |