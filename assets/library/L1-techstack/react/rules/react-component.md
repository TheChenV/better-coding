---
description: React组件设计规范 - 详见正文
trigger: glob
glob: **/*.tsx, **/*.jsx
---


# React 组件设计规范

## 概述

组件是 React 应用的基本构建单元。本规范定义了组件设计、拆分和优化的标准实践。

## 必须遵守

- **必须** 使用函数组件 + Hooks，禁止新建 class 组件
- **必须** 为所有 Props 定义 TypeScript 接口
- **必须** 遵循单一职责原则，一个组件只做一件事
- **必须** 组件文件使用 PascalCase 命名（`UserCard.tsx`）
- **推荐** 组件超过 150 行时考虑拆分
- **推荐** 使用 `React.memo` 优化纯展示组件

## 禁止事项

- **禁止** 在组件内部定义子组件（导致每次渲染重新创建）
- **禁止** Props 超过 7 个（应拆分组件或使用组合模式）
- **禁止** 直接修改 props 或 state
- **禁止** 在 JSX 中编写复杂逻辑（超过一行的表达式应提取）
- **禁止** 使用 `index` 作为列表 key（当列表可增删排序时）

## Props 类型定义

```tsx
// ✅ 必须：完整的 Props 接口定义
interface UserCardProps {
  /** 用户数据 */
  user: User;
  /** 是否显示头像 */
  showAvatar?: boolean;
  /** 尺寸变体 */
  size?: 'sm' | 'md' | 'lg';
  /** 删除回调 */
  onDelete?: (userId: string) => void;
  /** 子元素（扩展插槽） */
  children?: React.ReactNode;
}

export function UserCard({
  user,
  showAvatar = true,
  size = 'md',
  onDelete,
  children,
}: UserCardProps) {
  return (
    <div className={cn('user-card', `user-card--${size}`)}>
      {showAvatar && <Avatar src={user.avatarUrl} name={user.name} />}
      <div className="user-card__info">
        <h3>{user.name}</h3>
        <p>{user.email}</p>
      </div>
      {onDelete && (
        <button onClick={() => onDelete(user.id)} aria-label={`Delete ${user.name}`}>
          <TrashIcon />
        </button>
      )}
      {children}
    </div>
  );
}
```

## 组件拆分原则

```tsx
// ❌ 错误：一个组件承担过多职责
function Dashboard() {
  // 200+ 行：数据获取 + 过滤逻辑 + 图表渲染 + 表格渲染 + 导出功能
}

// ✅ 正确：按职责拆分
function DashboardPage() {
  return (
    <DashboardProvider>
      <DashboardHeader />
      <DashboardFilters />
      <DashboardCharts />
      <DashboardTable />
    </DashboardProvider>
  );
}
```

## 组合模式优于 Props 传递

```tsx
// ❌ 错误：通过大量 props 控制渲染
<Card
  title="User"
  subtitle="Admin"
  imageUrl="/avatar.png"
  actions={[{ label: 'Edit', onClick: handleEdit }]}
  footer={<span>Created 2024-01-01</span>}
  badge="Active"
/>

// ✅ 正确：使用组合模式
<Card>
  <Card.Header>
    <Avatar src="/avatar.png" />
    <Card.Title>User</Card.Title>
    <Badge variant="success">Active</Badge>
  </Card.Header>
  <Card.Body>
    <p>Admin</p>
  </Card.Body>
  <Card.Footer>
    <Button onClick={handleEdit}>Edit</Button>
    <span>Created 2024-01-01</span>
  </Card.Footer>
</Card>
```

## memo 优化

```tsx
// ✅ 推荐：纯展示组件使用 memo
interface StatCardProps {
  title: string;
  value: number;
  trend: 'up' | 'down';
}

export const StatCard = React.memo(function StatCard({ title, value, trend }: StatCardProps) {
  return (
    <div className="stat-card">
      <span className="stat-card__title">{title}</span>
      <span className="stat-card__value">{value.toLocaleString()}</span>
      <TrendIcon direction={trend} />
    </div>
  );
});
```

## 组件文件结构

```
src/components/user-card/
├── index.ts              # 统一导出
├── UserCard.tsx          # 组件实现
├── UserCard.test.tsx     # 测试
├── UserCard.stories.tsx  # Storybook（可选）
└── types.ts              # 组件相关类型
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 函数组件 + Hooks | 必须 |
| Props 有完整类型定义 | 必须 |
| 单一职责（< 150 行） | 推荐 |
| 无内联组件定义 | 必须 |
| 列表 key 使用唯一 ID | 必须 |
| 纯展示组件 memo 优化 | 推荐 |