# 示例 · tasks.md（可执行任务清单）

> 模板：`../L0-universal/spec-templates/task-template.md`
> 落盘：`docs/spec/003-order-creation/tasks.md` ｜ 产出：环节 3 `/create-module-spec`
> 环节 5 的执行入口：逐条勾 `[x]`，阻塞就停下问，不自扩范围。

## 为什么这份长这样

任务清单的粒度标准只有一条：**一条任务能独立实现并独立验证**。
每条都带落点文件与验证命令，接手的人不用回头再翻一遍 SPEC 六件套；
顺序按依赖层排，同应用串行、跨应用并行。

## 章节骨架

```
1 任务概览   （任务总数 / 预估工作量 / 依赖的 SPEC 版本）
2 任务详情   每条：标题 · 层级 · 落点文件 · 依赖 · 实现要点 · 验证 · 完成判据
3 执行顺序   数据层 → 业务层 → API 层 → 验证（标注可并行项）
4 风险评估   4.1 技术风险 4.2 进度风险 4.3 回滚方案
附录 A 变更记录
```

## 片段 1 · 一张合格的任务卡

```markdown
### Task 12：订单创建幂等键去重（业务层）
- 落点：`server/shop-gw/src/main/java/.../order/IdempotencyService.java`
- 依赖：Task 8（SPEC-DDL 的 `idempotency_key` 表已建）
- 要点：
  - 键取自 `X-Idempotency-Key`，缺失 → 抛 `MP-9003`（不自动补生成）
  - 首次响应序列化后整体存 `first_response`，重放按原样回放
  - 窗口 24h：`created_at < now-24h` 由定时任务清理，批删 500 条/次
  - 并发：`INSERT ... ON CONFLICT DO NOTHING` 判重，不加分布式锁
- 验证：
  - `mvn -pl shop-gw test -Dtest=IdempotencyServiceTest`（含重放用例 19/20）
  - 手工：同键连发 2 次 `POST /v1/orders`，断言两次 orderId 相同且只 1 单
- 完成判据：SPEC-BE 5.4 表格中 orders 行逐条可核对；覆盖率 ≥80%
```

## 片段 2 · 3 执行顺序：把并行面写出来

```markdown
### 第 1 步：数据层（可并行，无相互依赖）
- [ ] Task 1 建表 SPEC-DDL
- [ ] Task 2 实体与 Mapper
### 第 2 步：业务层（依赖第 1 步）
- [ ] Task 8 库存锁定客户端   [ ] Task 12 幂等去重   （二者可并行）
### 第 3 步：API 层（依赖第 2 步）
- [ ] Task 15 Controller 与 DTO 映射（按 SPEC-API 生成，不手写）
### 第 4 步：验证（依赖第 3 步）
- [ ] Task 20 契约测试对齐 0 diff   [ ] Task 21 E2E P0 场景
```

## 片段 3 · 4.3 回滚方案：每条破坏性任务配一句

```markdown
| 任务 | 若上线后发现缺陷 | 回滚动作 | 数据影响 |
|------|----------------|---------|---------|
| Task 1 | 表结构缺陷 | 执行 `0003_create_order_table.down.sql` | 仅新表，无生产数据 |
| Task 15 | 契约字段改名 | 网关开关 `resp.compatible=true` 回旧字段 | 无 |
```

## 最容易走形的三处

1. 一条任务 = "实现订单模块"：粒度粗到无法验证，也无法并行。
2. 没有验证命令 → 勾了 `[x]` 但没人能证明它真的能跑。
3. 实现要点里顺手写"顺便重构一下 X 服务"→ 范围外改动，评审时单拆一条。
