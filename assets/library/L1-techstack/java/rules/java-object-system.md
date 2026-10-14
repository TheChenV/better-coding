---
description: Java对象体系规范 - 详见正文
trigger: glob
glob: **/*.java
---


# Java 对象体系规范

## 概述

简化对象模型，减少无意义的对象层次和转换代码。本项目仅使用三种对象类型：Entity、VO、Request。

## 对象类型定义

| 类型 | 用途 | 所在层 | 命名 |
|------|------|--------|------|
| **Entity** | 数据库映射实体 | Repository / Service | `Order`, `User` |
| **VO** | 返回给前端的视图对象 | Controller 返回值 | `OrderVO`, `UserVO` |
| **Request** | 接收前端请求参数 | Controller 入参 | `CreateOrderRequest`, `UpdateUserRequest` |

## 必须遵守

- **必须** 仅使用 Entity + VO + Request 三种对象
- **必须** Entity 与数据库表一一对应
- **必须** VO 用于所有 API 响应（禁止直接返回 Entity）
- **必须** Request 用于所有 API 入参（含校验注解）
- **必须** 对象转换使用静态工厂方法（`from`/`of`）
- **推荐** 使用 Java Record 定义 VO 和 Request（不可变）

## 禁止事项

- **禁止** 使用 DTO、BO、PO、Command、Query 等额外对象类型
- **禁止** 直接将 Entity 作为 API 返回值（暴露内部结构）
- **禁止** 使用 BeanUtils.copyProperties（无类型安全、性能差）
- **禁止** 使用 MapStruct 等映射框架（简单转换无需框架）
- **禁止** Entity 上添加 `@JsonIgnore` 来替代 VO

## 正确示例

```java
// ✅ Entity：数据库映射
@Entity
@Table(name = "orders")
@Getter
@Setter
@NoArgsConstructor
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String orderNo;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

// ✅ VO：返回前端（使用 Record，不可变）
public record OrderVO(
    Long id,
    String orderNo,
    Long userId,
    String userName,
    BigDecimal amount,
    String status,
    LocalDateTime createdAt
) {
    // 静态工厂：从 Entity 转换
    public static OrderVO from(Order order) {
        return new OrderVO(
            order.getId(),
            order.getOrderNo(),
            order.getUserId(),
            null, // userName 由 Service 层填充
            order.getAmount(),
            order.getStatus().name(),
            order.getCreatedAt()
        );
    }

    public static OrderVO from(Order order, User user) {
        return new OrderVO(
            order.getId(),
            order.getOrderNo(),
            order.getUserId(),
            user.getName(),
            order.getAmount(),
            order.getStatus().name(),
            order.getCreatedAt()
        );
    }
}

// ✅ Request：接收前端参数（含校验）
public record CreateOrderRequest(
    @NotNull(message = "userId is required")
    Long userId,

    @NotNull(message = "amount is required")
    @DecimalMin(value = "0.01", message = "amount must be positive")
    BigDecimal amount,

    @Size(max = 200, message = "remark too long")
    String remark
) {}

public record UpdateOrderRequest(
    @NotNull(message = "status is required")
    OrderStatus status
) {}
```

## Service 层转换

```java
@Service
@RequiredArgsConstructor
public class OrderServiceImpl implements OrderService {

    private final OrderRepository orderRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public OrderVO createOrder(CreateOrderRequest request) {
        // Request → Entity
        Order order = new Order();
        order.setOrderNo(generateOrderNo());
        order.setUserId(request.userId());
        order.setAmount(request.amount());
        order.setStatus(OrderStatus.PENDING);
        order.setCreatedAt(LocalDateTime.now());

        order = orderRepository.save(order);

        // Entity → VO
        User user = userRepository.findById(request.userId()).orElseThrow();
        return OrderVO.from(order, user);
    }
}
```

## 对比：错误做法

```java
// ❌ 错误：对象类型泛滥
OrderDTO → OrderBO → OrderPO → OrderCommand → OrderQuery → OrderVO

// ❌ 错误：BeanUtils 反射拷贝
BeanUtils.copyProperties(order, orderVO); // 无编译检查、字段改名不报错

// ❌ 错误：直接返回 Entity
@GetMapping("/{id}")
public Order get(@PathVariable Long id) {
    return orderRepository.findById(id).orElseThrow(); // 暴露所有字段！
}

// ❌ 错误：Entity 上加 @JsonIgnore
@Entity
public class User {
    @JsonIgnore  // 用 VO 替代！
    private String passwordHash;
}
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 仅 Entity + VO + Request 三种对象 | 必须 |
| API 不直接返回 Entity | 必须 |
| 转换用静态工厂方法 | 必须 |
| 禁止 BeanUtils.copyProperties | 必须 |
| Request 含 @Valid 校验注解 | 必须 |
| VO/Request 用 Record | 推荐 |