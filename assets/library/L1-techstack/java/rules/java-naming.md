---
description: Java命名规范 - 详见正文
trigger: glob
glob: **/*.java
---


# Java 命名规范

## 概述

统一的命名规范提升代码可读性和团队协作效率。所有命名必须自解释，禁止无意义缩写。

## 必须遵守

- **必须** 包名全小写，使用反向域名 + 模块名
- **必须** 类名 PascalCase，名词或名词短语
- **必须** 方法名 camelCase，动词开头
- **必须** 常量 UPPER_SNAKE_CASE
- **必须** 布尔变量/方法使用 `is`/`has`/`can`/`should` 前缀
- **必须** 各层类使用标准后缀（Controller/Service/Repository）

## 禁止事项

- **禁止** 单字母变量（除循环 `i`/`j`/`k` 和 lambda 参数）
- **禁止** 拼音命名（如 `dingdan`、`yonghu`）
- **禁止** 无意义缩写（如 `abs` 代替 `abstract`，`cnt` 代替 `count`）
- **禁止** 类名使用 `I` 前缀表示接口（如 `IUserService`）
- **禁止** 方法名使用下划线（除测试方法 `should_xxx_when_xxx`）

## 包名规范

```java
// ✅ 正确：反向域名 + 模块
com.company.project.module
com.company.order.controller
com.company.order.service
com.company.order.repository
com.company.order.entity
com.company.common.exception
com.company.common.util

// ❌ 错误
com.company.Project  // 大写
com.company.order_module  // 下划线
```

## 类名规范

| 类型 | 后缀 | 示例 |
|------|------|------|
| Controller | `Controller` | `OrderController` |
| Service 接口 | `Service` | `OrderService` |
| Service 实现 | `ServiceImpl` | `OrderServiceImpl` |
| Repository | `Repository` | `OrderRepository` |
| Entity | 无后缀 | `Order`, `User` |
| VO | `VO` | `OrderVO`, `UserVO` |
| Request | `Request` | `CreateOrderRequest` |
| 异常 | `Exception` | `BusinessException` |
| 配置 | `Config` / `Properties` | `ThreadPoolConfig` |
| 工具类 | `Utils` / `Helper` | `DateUtils`, `JsonHelper` |
| 枚举 | 无后缀 | `OrderStatus`, `UserRole` |

## 方法名规范

```java
// ✅ 正确：动词开头，表达行为
public OrderVO createOrder(CreateOrderRequest request) { }
public OrderVO getById(Long id) { }
public PageResult<OrderVO> listByUser(Long userId, int page) { }
public void cancelOrder(Long orderId) { }
public boolean existsByOrderNo(String orderNo) { }

// ✅ 正确：布尔方法用 is/has/can/should
public boolean isActive(Long userId) { }
public boolean hasPermission(Long userId, String permission) { }
public boolean canRefund(Order order) { }
public boolean shouldNotify(User user) { }

// ❌ 错误
public OrderVO order(CreateOrderRequest request) { }  // 无动词
public OrderVO Get(Long id) { }  // 大写开头
public void doProcess() { }  // 无意义
```

## 变量与常量

```java
// ✅ 常量：UPPER_SNAKE_CASE
public static final int MAX_RETRY_COUNT = 3;
public static final String DEFAULT_CHARSET = "UTF-8";
public static final BigDecimal TAX_RATE = new BigDecimal("0.13");

// ✅ 变量：camelCase，自解释
int retryCount = 0;
String orderNo = generateOrderNo();
BigDecimal totalAmount = calculateTotal(items);
LocalDateTime expirationTime = now.plusHours(24);

// ❌ 错误
int a = 0;           // 无意义
String str = "";     // 无意义
Object obj = null;   // 无意义
int cnt = 0;         // 不规范缩写
```

## 枚举命名

```java
// ✅ 正确：枚举类 PascalCase，枚举值 UPPER_SNAKE_CASE
public enum OrderStatus {
    PENDING,
    PAID,
    SHIPPED,
    DELIVERED,
    CANCELLED;

    public boolean isTerminal() {
        return this == DELIVERED || this == CANCELLED;
    }
}

public enum PaymentMethod {
    CREDIT_CARD,
    DEBIT_CARD,
    ALIPAY,
    WECHAT_PAY;
}
```

## 测试方法命名

```java
// ✅ 推荐：should_期望结果_when_条件
@Test
void should_create_order_when_valid_request() { }

@Test
void should_throw_exception_when_user_not_found() { }

@Test
void should_return_empty_list_when_no_orders() { }

// ✅ 也可以：方法名描述场景
@Test
void createOrderWithValidRequest() { }

@Test
void createOrderWithInvalidAmountThrowsException() { }
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 包名全小写反向域名 | 必须 |
| 类名 PascalCase + 标准后缀 | 必须 |
| 方法名 camelCase 动词开头 | 必须 |
| 常量 UPPER_SNAKE_CASE | 必须 |
| 布尔用 is/has/can/should | 必须 |
| 无拼音、无单字母变量 | 必须 |
| 命名自解释无歧义 | 必须 |