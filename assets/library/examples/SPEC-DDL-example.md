# 示例 · SPEC-DDL（可直接执行的建表脚本）

> 模板：`../L0-universal/spec-templates/SPEC-DDL-template.sql`
> 落盘：`docs/spec/003-order-creation/SPEC-DDL.sql`
> 产出：环节 3 `/create-module-spec`

## 为什么这份长这样

它要能**原样贴进数据库跑**，所以头部约定、drop-if-exists、
注释、索引理由一个都不能省。每个字段注释和每个索引都写着"为什么"，
半年后接手的人才敢删。

## 文件骨架

```
0 初始化：库/字符集/排序规则/时区；本应用持有哪些数据、为什么不持有主数据
1 表结构：每表前一段「设计说明」注释 + DROP TABLE IF EXISTS + CREATE TABLE
2 索引清单与验证：表/索引/类型/命中查询/预计选择率
3 数据迁移与版本管理：NNNN_动作.up.sql / .down.sql 成对
4 变更日志：版本 / 日期 / 变更 / 责任人 / 是否需 DBA 审核
```

## 片段 1 · 头部约定：先划清"这张库不存什么"

```sql
-- ==================================================
-- spec-003 订单创建 · 数据库设计  v1.0  状态：初稿待评审
-- 服务   : shop-gw（薄网关，Consumer 应用）
-- 数据库 : MySQL 8.0+  utf8mb4 / _unicode_ci  时区 UTC
-- --------------------------------------------------
-- 边界说明：用户 / 商品 / 订单 / 支付主数据由 mall-core 中台持久化，
-- 本库仅落三类本地数据：
--   1. shopping_cart    — 登录用户购物车（Redis 热数据 + DB 冷备份）
--   2. user_address     — 收货地址（用户个人数据）
--   3. idempotency_key  — 幂等键去重（防重复下单/支付/领券）
-- Redis 缓存方案见 ARCH §5.3，本文件不含缓存结构定义。
-- ==================================================
```

## 片段 2 · 表：索引带理由，时间用整型毫秒戳

```sql
-- 设计说明：
--   • 主存为 Redis Hash（key: cart:{userId}，TTL 7 天），本表是冷备份；
--   • 登录时 POST /v1/cart/merge 把游客车写入本表；
--   • BR-CRT-01 单用户 ≤50 种 SKU，BR-CRT-02 单 SKU ≤99（应用层同校验）；
--   • 联合唯一键 (user_id, sku_id) 保证同人同 SKU 只有一行。
DROP TABLE IF EXISTS `shopping_cart`;
CREATE TABLE `shopping_cart` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT
      COMMENT '内部主键，不对外暴露',
  `user_id` VARCHAR(64) NOT NULL
      COMMENT '用户 ID（mall-core 用户服务签发）',
  `sku_id` VARCHAR(64) NOT NULL COMMENT 'SKU ID',
  `quantity` SMALLINT UNSIGNED NOT NULL DEFAULT 1
      COMMENT '数量，范围 [1,99]',
  `price_snapshot` BIGINT UNSIGNED NOT NULL
      COMMENT '加购时价格快照，单位分，用于变价提示',
  `selected` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=参与结算',
  `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
      COMMENT 'ACTIVE / INVALID（下架或售罄）',
  `created_at` BIGINT UNSIGNED NOT NULL
      COMMENT '创建时间，Unix 毫秒（UTC）',
  `updated_at` BIGINT UNSIGNED NOT NULL
      COMMENT '更新时间，Unix 毫秒（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cart_user_sku` (`user_id`, `sku_id`),
  KEY `idx_cart_user_status` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='购物车冷备份表（已登录用户）';
```

## 片段 3 · 索引清单：为每个索引写命中的那条查询

```sql
-- 索引清单（写明命中查询，将来才敢删）
--   uk_cart_user_sku       唯一  加购/改数量：user_id + sku_id
--   idx_cart_user_status   组合  一键清理失效：user_id + status
--   选择率：前者极高，后者高（每用户最多 50 行 ACTIVE）
-- 组合索引按最左前缀排列：等值列 → 排序列 → 范围列。
-- 注：uk_cart_user_sku 已覆盖 user_id 前缀，故不再单建 idx_user_id。
```

## 最容易走形的三处

1. 没有 `DROP TABLE IF EXISTS` 或注释与字段不一致 → 不可重复执行。
2. 外键列不建索引；`updated_at` 用 DATETIME 而应用层约定毫秒整型 → 两套口径。
3. 破坏性变更（删列/改类型）没有 `.down.sql` 与迁移步骤 → 无法回滚。
