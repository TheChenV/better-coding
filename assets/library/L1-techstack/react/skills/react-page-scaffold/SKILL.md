---
name: react-page-scaffold
description: React页面脚手架生成. Manual-trigger skill. Source: Harness component library.
---


# React 页面脚手架生成

## 概述

标准化页面创建流程，确保每个新页面包含完整的路由、组件、数据层和样式结构。

## 前置条件

- React 18+ 项目（Vite / Next.js）
- React Router v6+（SPA）或文件系统路由（Next.js）
- React Query 已配置
- 路径别名 `@/` 已配置

## 跨栈通用门禁

生成前确认模块信息四要素（模块名称 / 职责 / 所属层级 / 依赖模块）、先读 `AGENTS.md` 的分层与编码规范、
「骨架不是空壳」判据（最小可编译可启动）与骨架清单产出，均以 `.qoder/techstack-commands.json` 的
`_skeletonContract` 为唯一规范（跨栈单源，原 L0 skill create-module-skeleton 已下沉到那里）；
本文件只提供本栈的目录结构与代码形态，不重复通用门禁。

## 编号工作流（骨架生成的可执行协议）

本栈页面骨架不由 AI 现写脚手架脚本：页面目录、路由与入口 HTML 正文都在 `plans/react.json` 里（与上面 Step 1-4 的分层同源），按库根 `assets/templates/numbered-workflows`（项目级安装 = `<项目>/.qoder/skills/better-coding/assets/templates/numbered-workflows`）的
七步编号工作流执行，本栈数据取 `plans/react.json`；占位符变量表见 `vars.mjs`，机制与偏离见该目录的 README.md。

1. **段 A 理解目标**：读 `workflows/<编号>/workflow.md` 的「目标 / 输入变量 / 产出物 / 验证方法」
2. **段 B 拼脚本**：`node assets/templates/numbered-workflows/numbered-workflow.mjs compose --stack react --vars <values.json> --workflow <编号> --project <目标项目根>`
3. **段 C 执行**：跑落盘件 `<目标项目>/.scaffold/step<编号>.mjs`（`compose` 换成 `run` 可 B+C+D 一次过）
4. **段 D 验证**：以退出码为准，0 才算过；`buildCmd` 取 `.qoder/techstack-commands.json` 本栈 `build`，不在脚本里发明命令

失败即问：任一段非 0 退出就停下来问用户「重试还是跳过」——不自行继续、不改库内文件、
不覆盖项目既有文件（工作流 02/03 遇到同名不同内容会判冲突并退出 1）。
禁止修改用户已有 .qoder/：引擎按路径段拦，命中即退出码 2。
七步顺序 01-create-directories → 02-write-configs → 03-write-skeleton-code → 04-verify-paths →
05-init-repo → 06-build-verify → 07-append-module（可按需只跑到 04，但 06 的编译验证是「骨架不是空壳」的出口）。

## 执行步骤

### Step 1: 定义路由

```tsx
// src/routes/index.tsx
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const UserListPage = lazy(() => import('@/pages/user-list/UserListPage'));
const UserDetailPage = lazy(() => import('@/pages/user-detail/UserDetailPage'));

export const routes: RouteObject[] = [
  {
    path: '/users',
    element: <UserListPage />,
  },
  {
    path: '/users/:id',
    element: <UserDetailPage />,
  },
];
```

### Step 2: 创建 Page 组件（入口）

```tsx
// src/pages/user-list/UserListPage.tsx
import { Suspense } from 'react';
import { UserListContainer } from './UserListContainer';
import { PageSkeleton } from '@/components/skeletons';

export default function UserListPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <UserListContainer />
    </Suspense>
  );
}
```

### Step 3: 创建 Container（数据逻辑层）

```tsx
// src/pages/user-list/UserListContainer.tsx
import { useState } from 'react';
import { useUsers } from './hooks/useUsers';
import { useDeleteUser } from './hooks/useDeleteUser';
import { UserListView } from './UserListView';

export function UserListContainer() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useUsers({ page, search });
  const deleteUser = useDeleteUser();

  if (error) return <ErrorBanner error={error} onRetry={() => {}} />;

  return (
    <UserListView
      users={data?.items ?? []}
      total={data?.total ?? 0}
      page={page}
      isLoading={isLoading}
      search={search}
      onSearchChange={setSearch}
      onPageChange={setPage}
      onDelete={(id) => deleteUser.mutate(id)}
    />
  );
}
```

### Step 4: 创建子组件（展示层）

```tsx
// src/pages/user-list/UserListView.tsx
import { UserTable } from './components/UserTable';
import { SearchBar } from './components/SearchBar';
import { Pagination } from '@/components/pagination';

interface UserListViewProps {
  users: User[];
  total: number;
  page: number;
  isLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onDelete: (id: string) => void;
}

export function UserListView({
  users, total, page, isLoading, search,
  onSearchChange, onPageChange, onDelete,
}: UserListViewProps) {
  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <SearchBar value={search} onChange={onSearchChange} />
      </div>
      <UserTable users={users} isLoading={isLoading} onDelete={onDelete} />
      <Pagination page={page} total={total} onChange={onPageChange} />
    </div>
  );
}
```

### Step 5: API 层

```tsx
// src/pages/user-list/api.ts
import { apiClient } from '@/lib/api-client';
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
  createdAt: z.string().datetime(),
});

const UserListResponse = z.object({
  items: z.array(UserSchema),
  total: z.number(),
});

export type User = z.infer<typeof UserSchema>;

export async function fetchUsers(params: { page: number; search: string }) {
  const res = await apiClient.get('/users', { params });
  return UserListResponse.parse(res.data);
}

export async function deleteUser(id: string) {
  await apiClient.delete(`/users/${id}`);
}
```

### Step 6: 状态（Hooks）

```tsx
// src/pages/user-list/hooks/useUsers.ts
import { useQuery } from '@tanstack/react-query';
import { fetchUsers } from '../api';

export function useUsers(params: { page: number; search: string }) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => fetchUsers(params),
    placeholderData: (prev) => prev, // 翻页时保持旧数据
  });
}

// src/pages/user-list/hooks/useDeleteUser.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteUser } from '../api';

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}
```

### Step 7: 样式与文件结构

```
src/pages/user-list/
├── UserListPage.tsx          # 页面入口（路由组件）
├── UserListContainer.tsx     # 数据逻辑容器
├── UserListView.tsx          # 展示层
├── api.ts                    # API 请求
├── types.ts                  # 页面级类型
├── hooks/
│   ├── useUsers.ts
│   └── useDeleteUser.ts
└── components/
    ├── UserTable.tsx
    ├── UserRow.tsx
    └── SearchBar.tsx
```

## 检查清单

- [ ] 路由已注册且支持懒加载
- [ ] Page → Container → View 分层
- [ ] API 层有 zod 校验
- [ ] 数据获取使用 React Query
- [ ] 加载/错误/空状态处理
- [ ] 组件文件结构完整