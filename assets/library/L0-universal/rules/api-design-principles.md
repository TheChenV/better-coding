---
description: API设计原则 - RESTful规范，契约先行，统一错误格式，版本策略，幂等性设计（设计/评审/修改对外 API 或前后端契约时触发）
trigger: model_decision
---

# API 设计原则

> 来源：GitHub Spec-Kit + Harness 课程 — API 是系统间的契约，一旦发布就难以更改。

## 强制规则

1. **契约先行** — 先定义 API 契约（OpenAPI），再写实现代码
2. **RESTful 命名** — 资源用复数名词（`/users`、`/orders`），不用动词
3. **统一错误格式** — 信封的**字段形态与码值类型以本项目 SPEC-API 契约为准**（单源，本规则不复写）。SPEC-API 尚未冻结时的占位形态是字符串码 + 扁平结构 `{ "code": "ERROR_CODE", "message": "人可读描述", "details": {} }`；一旦 SPEC-API 定稿（含数字码或嵌套结构），以 SPEC-API 逐字为准，不得拿本条反驳契约
4. **版本策略** — URL 路径版本（`/api/v1/`）或 Header 版本，项目统一
5. **幂等性** — PUT/DELETE 必须幂等；POST 支持 `Idempotency-Key`（如涉及支付）

## RESTful 约定

| 操作 | HTTP 方法 | 路径 | 成功状态码 |
|------|----------|------|-----------|
| 创建 | POST | /resources | 201 |
| 查询列表 | GET | /resources | 200 |
| 查询单个 | GET | /resources/{id} | 200 |
| 全量更新 | PUT | /resources/{id} | 200 |
| 部分更新 | PATCH | /resources/{id} | 200 |
| 删除 | DELETE | /resources/{id} | 204 |

## 分页约定

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "hasMore": true
  }
}
```

## 禁止

- ❌ 在 URL 中使用动词（`/getUser` → `/users/{id}`）
- ❌ 返回裸数据（统一包裹在 `data` 字段中）
- ❌ 混用 HTTP 状态码（200 表示成功，4xx 客户端错误，5xx 服务端错误）
- ❌ 在 GET 请求中修改数据
