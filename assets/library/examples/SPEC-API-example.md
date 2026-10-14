# 示例 · SPEC-API（OpenAPI 契约，前后端共用同一份）

> 模板：`SPEC-API-contract.yaml.template`（spec-templates/）
> 落盘：`docs/spec/003-order-creation/SPEC-API.yaml`
> 产出：环节 3 `/create-module-spec`

## 为什么这份长这样

它是**唯一权威源**：Provider 实现它，Consumer 消费它，契约测试拿它
做 0 diff 基准。所以每个端点必须把状态码矩阵、错误码、DTO 引用
写全——写不全的那一格，就是联调时两边各猜一次的地方。

## 章节骨架（YAML 内的注释分节）

```
1 概述      1.1 API purpose（openapi / info / servers） 1.2 认证方式
2 通用约定   2.1 请求头 2.2 通用错误响应 2.3 分页约定
3 版本策略   3.1 管理方式 3.2 兼容规则 3.3 发布流程
4 接口定义   每资源：方法 / operationId / 参数 / requestBody / responses 全状态码
5 数据模型   components/schemas（DTO 只在这里定义，paths 用 $ref）
6 错误码定义 7 变更日志
```

## 片段 1 · 头部与通用组件：信封先定，再谈端点

```yaml
openapi: "3.1.0"
info:
  title: shop-web 后端网关 API 契约
  version: "1.0.0"
  description: |
    面向 SPA 的对外开放 API，前缀 /api/v1，HTTPS + JSON + JWT Bearer。
servers:
  - url: "https://api.mp01.example.com/api/v1"
    description: 生产
  - url: "http://localhost:8080/api/v1"
    description: 本地
components:
  headers:
    IdempotencyKey:
      name: X-Idempotency-Key
      description: 幂等键，UUID v4，去重窗口 ≥24h
      schema: { type: string, format: uuid }
  schemas:
    ApiError:                       # 统一错误信封，全端点复用
      type: object
      required: [code, message, traceId]
      properties:
        code:    { type: string, example: "MP-2004" }
        message: { type: string, example: "库存不足" }
        traceId: { type: string }
```

## 片段 2 · 端点：状态码矩阵不留空格

```yaml
paths:
  /v1/orders:
    post:
      operationId: createOrder
      tags: [orders]
      summary: 创建订单
      parameters:
        - $ref: '#/components/headers/IdempotencyKey'
        - $ref: '#/components/parameters/BearerAuth'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateOrderRequest'
      responses:
        '201':
          description: 创建成功
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OrderCreatedResponse'
        '400':
          description: 参数校验失败 / 缺幂等键（MP-9002 MP-9003）
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ApiError' }
        '401':
          description: 未登录
        '404':
          description: 收货地址不存在（MP-4001）
        '409':
          $ref: '#/components/responses/Conflict'
          # 库存不足 MP-2004 / 券不可用 MP-4003
          # 状态不允许 MP-4005 / 幂等重放 MP-9004
        '503':
          description: 下游中台不可用，降级响应（MP-9001）
```

## 片段 3 · DTO：金额单位与命名口径写进 description

```yaml
    OrderCreatedResponse:
      type: object
      required: [orderId, status, payableAmount, paymentDeadlineAt]
      properties:
        orderNo:
          type: string
          description: 展示用订单号
        status:
          type: string
          enum: [PENDING_PAYMENT]
        payableAmount:
          type: integer
          format: int64
          description: 实付金额，单位「分」，全链路禁用浮点
        paymentDeadlineAt:
          type: string
          format: date-time
          description: ISO-8601，UTC
```

字段命名风格（snake_case 还是 camelCase）在第 2 章一次性定死，
并在 SPEC-DDL 与 SPEC-FE 里引用同一结论；契约测试按它判 0 diff。

## 最容易走形的三处

1. DTO 直接写在 `paths` 里内联展开 → Provider/Consumer 各改一处。
2. 只写 200 与 401，不写 400/409/503 → 异常分支无法生成用例。
3. `operationId` 缺失 → 客户端代码生成与契约测试都挂不上。
