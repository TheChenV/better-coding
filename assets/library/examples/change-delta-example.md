# 示例 · 变更提案 + Delta（环节 9 迭代产物）

> 无模板文件：结构以 `/spec-delta` Step 1–3 的产出契约为准
> 落盘：`docs/changes/2026-07-add-partial-refund/`（proposal.md + 每个受影响 spec 一份 delta）

## 为什么这份长这样

变更文件夹是"改规范的唯一入口"：先说清 WHY 与影响面，
再把每个受影响 spec 的差异写成 ADDED / MODIFIED / REMOVED 三区块。
MODIFIED 必须贴**完整更新后的需求块**——只贴差异片段，归档合并时
就会丢细节，主 spec 悄悄退化。

## 目录骨架

```
docs/changes/{kebab-change-id}/
├── proposal.md          Why / What Changes / Affected Specs / Impact
├── delta-order.md       # Delta: SPEC-订单  → 三区块
└── delta-test.md        # Delta: SPEC-TEST  → 三区块
（实施并验证通过后）→ docs/changes/archive/2026-07-30-{change-id}/
```

## 片段 1 · proposal.md：破坏性变更要标出来

```markdown
# 变更提案：add-partial-refund（v1.0.0 → v1.1.0）

## Why
已支付订单目前只能整单退款，门店月均 40+ 单需要按行退；
现方案靠人工改金额，出错后无法追溯。

## What Changes
- 新增「按订单行部分退款」，退款金额 ≤ 该行实付金额
- **BREAKING** `POST /v1/orders/{id}/refunds` 请求体
  由 `{reason}` 改为 `{items:[{skuId, quantity}], reason}`
- 移除「退款金额人工覆盖」入口（无审计，风险高于收益）

## Affected Specs
- SPEC-订单：ADDED 1 / MODIFIED 2 / REMOVED 1
- SPEC-API：MODIFIED 1（请求体 + 新增 2 个错误码）
- SPEC-TEST：ADDED 6（含幂等重放与超额拒绝）

## Impact
代码：order 服务、refunds 端点、门店后台退款表单
数据：新增 `refund_item` 表（含 `.down.sql`）
兼容：老客户端旧请求体保留 1 个版本，网关按 `X-Api-Version` 分流
```

## 片段 2 · delta：三区块各按各的写法

```markdown
# Delta: SPEC-订单

## ADDED Requirements
### REQ-ORD-021：按订单行部分退款
用户可对已支付订单的任一行发起部分退款，数量 ≤ 该行剩余可退数量；
退款成功后累计金额写回订单，全部行退完则订单转 `REFUNDED`。
验收：Given 订单含 2 行（各 2 件），When 退 A 行 1 件，
Then 订单状态仍为 PAID，A 行剩余可退 = 1，退款单金额 = 该行单价 × 1。

## MODIFIED Requirements
### REQ-ORD-005：退款申请幂等（**贴完整更新块**）
同一 `X-Idempotency-Key` 的重放返回首次退款单，不产生第二条；
键缺失 → 400 `MP-9003`；已存在进行中退款单 → 409 `MP-4006`。

## REMOVED Requirements
### REQ-ORD-012：客服手工覆盖退款金额
- Reason：绕过金额校验且无审计留痕，风险高于收益
- Migration：改用「按行退款 + 补偿券」（见 REQ-ORD-021 与 REQ-CPN-008）
```

## 片段 3 · 归档与纪律：改完主 spec 才算闭环

```markdown
实施并验证通过后：
1. delta 合并回 `docs/spec/`（ADDED 追加 / MODIFIED 整块替换 / REMOVED 删除并留原因）
2. 变更文件夹移入 `docs/changes/archive/{YYYY-MM-DD}-{change-id}/`
3. 主 spec 修订记录追加一行（版本 / 日期 / 摘要）
4. 版本号按语义化递增：破坏性变更升主版本，只加行为升次版本
```

## 最容易走形的三处

1. MODIFIED 只贴 diff 片段 → 归档时旧内容残留，两半拼成一条不可能需求。
2. 实施阶段顺手改了 delta 未声明的文件 → 范围失控，评审无法核对。
3. 只为"加个校验"却标成 MODIFIED → 该用 ADDED，避免误覆盖原需求。
