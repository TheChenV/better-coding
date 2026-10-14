# 示例 · SPEC-FE（前端模块设计）

> 模板：`../L0-universal/spec-templates/SPEC-FE-template.md`
> 落盘：`docs/spec/003-order-creation/SPEC-FE.md` ｜ 产出：环节 3 `/create-module-spec`
> 仅 Full-Stack 应用；Backend-Only 在本文件位置写"跳过 + 理由"。

## 为什么这份长这样

前端设计文档的价值全在**独有决策**：状态放哪一层、缓存怎么失效、
四态怎么渲染。凡是与后端共享的（字段、错误码、状态码）一律引用
SPEC-API——复制一份过来，第二次改契约就一定只改了一边。

## 章节骨架

```
关联文档追溯
1 文档概览   1.1 职责与范围 1.2 页面清单 1.3 页面-模块-US 映射 1.4 设计输入引用
2 架构约定   2.1 技术决策 2.2 状态管理分层 2.3 数据流与缓存 2.4 API 层封装
             2.5 性能策略 2.6 兼容性决策
3 通用组件规格 3.1 组件树 3.2 清单 3.3 详情（Props + 交互状态）
4 页面详设    每页：概览 / Page 层 / Container 层 / Component 列表 /
             Store 映射 / API 调用时序 / 交互状态机
5 全局交互约定  附录 A 设计资产链接  B 变更记录
```

## 片段 1 · 2.2 + 2.6：分层与四态，一次定死

```markdown
### 2.2 状态管理分层
| 层 | 放什么 | 不放什么 |
|----|-------|---------|
| 组件内 `useState` | 仅本组件的展开/输入草稿 | 任何跨页共享数据 |
| Container | 请求编排、派生视图模型 | 业务规则常量 |
| Store（zustand） | 会话、购物车、Toast、降级标记 | 后端主数据副本 |
| 内存态（不落盘） | Access Token | 见 2.1：Refresh Token 走 httpOnly Cookie |

### 2.6 四态处理规范（每个数据加载场景必须四态齐备）
| 状态 | UI 表现 | 触发条件 |
|------|--------|---------|
| Loading | 骨架屏（首屏）/ 按钮内 Spinner（追加加载） | 请求已发、响应未回 |
| Success | 正常渲染 | 请求成功且有数据 |
| Error | 降级块 + 重试按钮；写操作另加 Toast | 网络错误 / 5xx |
| Empty | 空态插图 + 引导文案 + 下一步动作入口 | 成功但集合为空 |
```

## 片段 2 · 4.x Container 表：写清 API、Store 读写与规则编号

```markdown
#### `CartContainer`  文件 `src/containers/Cart/CartContainer.tsx`
| 项 | 说明 |
|----|------|
| 调用 API | `cart.addItem()` → `POST /v1/cart/items`（带幂等键） |
| Store 读 | `cartStore.lines`、`appStore.isDegraded` |
| Store 写 | `cartStore.addItem()`、`appStore.addToast()` |
| 传给组件 | `<CartList lines onQtyChange onRemove onSelect />` |
| 内部状态 | `selection: Set<skuId>`（结算页需要，不入全局） |
| 业务规则 | BR-CRT-01 种类 ≤50；BR-CRT-02 单 SKU ≤99（后端同样校验） |
| 四态处理 | Loading→20 张骨架；Empty→引导去首页；Error→重试 + 保留本地快照 |
```

## 片段 3 · 3.3 组件详情：Props 带单位与语义

```typescript
interface PriceTagProps {
  /** 当前售价，单位：分（前端不做浮点运算，展示层 ÷100） */
  price: number;
  /** 原价，单位：分；传入则展示划线样式 */
  originalPrice?: number;
  size?: 'sm' | 'md' | 'lg';
}
```

## 最容易走形的三处

1. 把 SPEC-API 的响应字段表抄进本文档 → 双份真相，契约漂移源头。
2. 四态只写 Loading/Success，Empty 与 Error 缺失 → 环节 4 核对必返工。
3. Page / Container / Component 职责越界：Component 直连 Store
   或自己发请求，复用与测试同时失效。
