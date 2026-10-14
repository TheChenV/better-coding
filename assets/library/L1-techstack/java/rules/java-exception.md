---
description: Java异常处理规范 - 详见正文
trigger: glob
glob: **/*.java
---


# Java 异常处理规范

## 概述

统一的异常处理策略确保错误可追踪、不丢失、不泄露内部信息。本规范定义了 Java/Spring 项目的异常处理标准。

## 必须遵守

- **必须** 使用自定义业务异常类表达业务错误
- **必须** catch 块中至少记录日志或重新抛出，禁止空 catch
- **必须** Controller 层不 catch 异常，由全局 `@RestControllerAdvice` 统一处理
- **必须** 金额计算使用 `BigDecimal`，禁止 `double`/`float`
- **推荐** 异常信息包含上下文（操作、参数、原因）
- **推荐** 使用异常链（cause）保留原始错误

## 禁止事项

- **禁止** `catch (Exception e) {}` 空处理
- **禁止** `catch (Exception e) { e.printStackTrace(); }` 生产代码打印堆栈
- **禁止** 用异常控制正常业务流程（如用 NotFoundException 做 if-else）
- **禁止** 在 finally 中 return（覆盖正常返回值）
- **禁止** 向前端暴露内部堆栈信息或 SQL 错误
- **禁止** 金额使用 `double`/`float`（精度丢失）

## 自定义异常体系

```java
// ✅ 必须：业务异常基类
public class BusinessException extends RuntimeException {
    private final String code;
    private final int httpStatus;

    public BusinessException(String code, String message, int httpStatus) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
    }

    public BusinessException(String code, String message, int httpStatus, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.httpStatus = httpStatus;
    }

    public String getCode() { return code; }
    public int getHttpStatus() { return httpStatus; }
}

// ✅ 必须：具体业务异常
public class ResourceNotFoundException extends BusinessException {
    public ResourceNotFoundException(String resource, Object id) {
        super("NOT_FOUND",
              String.format("%s with id '%s' not found", resource, id),
              HttpStatus.NOT_FOUND.value());
    }
}

public class DuplicateResourceException extends BusinessException {
    public DuplicateResourceException(String resource, String field, Object value) {
        super("DUPLICATE",
              String.format("%s with %s '%s' already exists", resource, field, value),
              HttpStatus.CONFLICT.value());
    }
}

public class InsufficientBalanceException extends BusinessException {
    public InsufficientBalanceException(BigDecimal required, BigDecimal available) {
        super("INSUFFICIENT_BALANCE",
              String.format("Required %s but only %s available", required, available),
              HttpStatus.UNPROCESSABLE_ENTITY.value());
    }
}
```

## 全局异常处理

```java
// ✅ 必须：Controller 层不 catch，全局统一处理
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusiness(BusinessException ex) {
        log.warn("Business error: code={}, message={}", ex.getCode(), ex.getMessage());
        return ResponseEntity
            .status(ex.getHttpStatus())
            .body(new ErrorResponse(ex.getCode(), ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
            .map(e -> e.getField() + ": " + e.getDefaultMessage())
            .collect(Collectors.joining("; "));
        return ResponseEntity.badRequest()
            .body(new ErrorResponse("VALIDATION_ERROR", message));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception ex) {
        log.error("Unexpected error", ex); // 完整堆栈记录到日志
        return ResponseEntity
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(new ErrorResponse("INTERNAL_ERROR", "An unexpected error occurred"));
    }
}

// 统一错误响应
public record ErrorResponse(String code, String message) {}
```

## Service 层异常使用

```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepository;
    private final PaymentClient paymentClient;

    public OrderVO createOrder(CreateOrderRequest request) {
        // ✅ 业务校验抛自定义异常
        if (orderRepository.existsByOrderNo(request.getOrderNo())) {
            throw new DuplicateResourceException("Order", "orderNo", request.getOrderNo());
        }

        try {
            paymentClient.charge(request.getAmount());
        } catch (PaymentException e) {
            // ✅ 保留异常链
            throw new BusinessException("PAYMENT_FAILED",
                "Payment failed for order: " + request.getOrderNo(),
                HttpStatus.PAYMENT_REQUIRED.value(), e);
        }

        // ... 创建订单逻辑
    }
}
```

## BigDecimal 金额处理

```java
// ❌ 禁止：double 计算金额
double total = price * quantity; // 精度丢失！
double discount = total * 0.85;

// ✅ 必须：BigDecimal 计算金额
BigDecimal price = new BigDecimal("99.99");
BigDecimal quantity = BigDecimal.valueOf(3);
BigDecimal total = price.multiply(quantity);
BigDecimal discount = total.multiply(new BigDecimal("0.85"))
    .setScale(2, RoundingMode.HALF_UP);

// ✅ 必须：比较用 compareTo，不用 equals
if (balance.compareTo(required) < 0) {
    throw new InsufficientBalanceException(required, balance);
}
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 自定义业务异常体系 | 必须 |
| 全局 @RestControllerAdvice | 必须 |
| 无空 catch 块 | 必须 |
| Controller 不 catch 异常 | 必须 |
| 金额用 BigDecimal | 必须 |
| 异常链保留 cause | 推荐 |
| 不暴露内部信息给前端 | 必须 |