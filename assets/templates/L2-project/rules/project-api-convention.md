---
description: 项目API约定 - 定义项目API的路径规范、数据格式、认证方式、错误响应等统一约定
trigger: glob
glob: **/api/**, **/controller/**, **/controllers/**, **/router/**, **/routes/**, **/handler/**, **/handlers/**
---

# 项目 API 约定

> **使用说明**：本文件定义项目 API 的统一约定。`【__名称__】` 为必填占位，`【__名称__，可选】` 为选填，`【已预填：xx，请核对】` 为 AI 预填项。
> 🔴 **优先级口径（读第一眼就要看到）**：项目 SPEC-API 契约 > 本文件显式声明 > L0 通用原则（`api-design-principles`）。错误信封的**形态**（扁平/嵌套、字符串码/数字码）由 SPEC-API 定稿，本文件与 L0 都只提供缺省形状；三者不一致时按此序裁决，不靠"谁语气更强"。

## 1. 路径规范

### 1.1 URL 结构

```
【__协议__】://【__域名__】/【__版本前缀__】/【__资源路径__】
```

| 组成部分 | 规范 | 示例 |
|----------|------|------|
| 版本前缀 | 【__如 /api/v1__】 | `/api/v1` |
| 资源命名 | 复数名词，kebab-case | `/user-orders` |
| 层级嵌套 | 最多 2 层嵌套 | `/users/{id}/orders` |
| 操作动词 | 不使用动词（RESTful） | ✅ `/users` ❌ `/getUsers` |

### 1.2 HTTP 方法语义

| 方法 | 语义 | 幂等性 | 示例 |
|------|------|--------|------|
| GET | 查询资源 | 是 | `GET /api/v1/users/{id}` |
| POST | 创建资源 | 否 | `POST /api/v1/users` |
| PUT | 全量更新 | 是 | `PUT /api/v1/users/{id}` |
| PATCH | 部分更新 | 否 | `PATCH /api/v1/users/{id}` |
| DELETE | 删除资源 | 是 | `DELETE /api/v1/users/{id}` |

### 1.3 特殊操作路径

| 场景 | 路径模式 | 示例 |
|------|----------|------|
| 非 CRUD 操作 | `POST /资源/动作` | `POST /orders/{id}/cancel` |
| 批量操作 | `POST /资源/batch-动作` | `POST /users/batch-delete` |
| 搜索/复杂查询 | `POST /资源/search` | `POST /orders/search` |

## 2. 数据格式

### 2.1 请求/响应格式

- Content-Type: `application/json; charset=utf-8`
- 日期格式: 【__yyyy-MM-dd HH:mm:ss__】
- 金额格式: 【__字符串传输，后端用 BigDecimal 处理__】
- 空值处理: 【__字段不传 = 不修改，传 null = 清空__】

### 2.2 RESTful 响应结构（推荐）

> **原则**：使用标准 HTTP 状态码表达请求结果，响应体直接包含业务数据。

**成功响应**：
```json
{
  "data": {},
  "meta": {
    "timestamp": 1700000000000,
    "requestId": "uuid"
  }
}
```

**列表响应**：
```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 156,
    "totalPages": 8
  },
  "meta": {
    "timestamp": 1700000000000
  }
}
```

**错误响应**：
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "邮箱格式不正确",
    "details": [
      { "field": "email", "message": "必须包含@" }
    ]
  },
  "meta": {
    "timestamp": 1700000000000,
    "requestId": "uuid"
  }
}
```

### 2.3 项目可选：统一响应包装

> **注意**：若项目团队决定采用统一响应包装（code/message/data），须在此显式声明以覆盖 L0 通用原则。优先级：本文件显式声明 > L0 通用原则。

**若采用包装式响应，结构如下**：
```json
{
  "code": 【__业务状态码，如 0 表示成功__】,
  "message": "【__人类可读的描述信息__】",
  "data": {},
  "timestamp": 1700000000000
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | int/string | 是 | 业务状态码，【__0/200__】 表示成功 |
| message | string | 是 | 人类可读的描述信息 |
| data | object/array/null | 否 | 业务数据载体 |
| timestamp | long | 是 | 服务器时间戳（毫秒） |

## 3. 认证方式

| 项目 | 约定 |
|------|------|
| 认证方式 | 【__Bearer Token / OAuth2 / Session__】 |
| Token 传递 | 【__Header: Authorization: Bearer {token}__】 |
| Token 有效期 | 【__Access Token 2h / Refresh Token 7d__】 |
| 刷新机制 | 【__POST /api/v1/auth/refresh__】 |
| 公开接口 | 【__/api/v1/auth/login, /api/v1/auth/register__】 |

## 4. 分页规范

### 4.1 请求参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | int | 1 | 页码（从 1 开始） |
| size | int | 【__20__】 | 每页条数（最大 【__100__】） |
| sort | string | 【__created_at__】 | 排序字段 |
| order | string | desc | 排序方向：asc / desc |

### 4.2 响应结构

见 2.2 节列表响应。

## 5. 错误响应格式

### 5.1 错误码体系

| HTTP 状态码 | 错误码前缀 | 类别 | 示例 |
|------------|-----------|------|------|
| 200/201/204 | — | 成功 | 操作成功 |
| 400 | VALIDATION_ | 客户端错误 | 参数校验失败 |
| 401 | AUTH_ | 认证错误 | Token 过期 |
| 403 | PERMISSION_ | 权限错误 | 无权访问 |
| 404 | NOT_FOUND_ | 资源不存在 | 用户不存在 |
| 409 | CONFLICT_ | 资源冲突 | 重复创建 |
| 422 | BUSINESS_ | 业务错误 | 业务规则不通过 |
| 429 | RATE_LIMIT_ | 限流 | 请求频率超限 |
| 500 | INTERNAL_ | 服务器内部错误 | 系统异常 |

### 5.2 错误响应结构

```json
{
  "error": {
    "code": "【__VALIDATION_001__】",
    "message": "【__参数校验失败__】",
    "details": [
      {
        "field": "【__email__】",
        "message": "【__邮箱格式不正确__】",
        "value": "【__invalid-email__】"
      }
    ]
  },
  "meta": {
    "timestamp": 1700000000000,
    "requestId": "【__uuid__】"
  }
}
```

## 6. 幂等性

### 6.1 幂等性要求

| 操作类型 | 幂等性 | 实现方式 |
|----------|--------|----------|
| 查询（GET） | 天然幂等 | — |
| 创建（POST） | 【__需要保证__】 | 【__客户端生成唯一 requestId__】 |
| 更新（PUT） | 天然幂等 | — |
| 删除（DELETE） | 天然幂等 | — |
| 支付/扣款 | 【__必须保证__】 | 【__幂等键 + 状态机__】 |

### 6.2 幂等键规范

- Header: `【__X-Idempotency-Key__】: {uuid}`
- 有效期: 【__24 小时__】
- 重复请求返回: 【__首次请求的结果，不重复执行__】

## 7. 其他约定

| 项目 | 约定 |
|------|------|
| 接口限流 | 【__单用户 100 次/分钟__】 |
| 请求体大小限制 | 【__10MB__】 |
| 超时时间 | 【__网关 30s，服务间 10s__】 |
| 版本管理策略 | 【__URL 路径版本 /api/v1, /api/v2__】 |
| 废弃接口处理 | 【__响应头添加 Deprecation 标记，保留 2 个版本__】 |
