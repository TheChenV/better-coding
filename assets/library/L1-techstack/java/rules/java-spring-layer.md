---
description: Spring分层规范 - 详见正文
trigger: glob
glob: **/*.java
---


# Spring 分层规范

## 概述

清晰的分层架构是 Spring 应用可维护性的基础。本规范定义了各层职责、依赖方向和事务边界。

## 架构分层

```
┌─────────────────────────────────────────┐
│           Controller 层                  │  ← 接收请求、参数校验、返回响应
├─────────────────────────────────────────┤
│           Service 层                     │  ← 业务逻辑、事务边界
├─────────────────────────────────────────┤
│           Repository 层                  │  ← 数据访问、SQL/ORM
├─────────────────────────────────────────┤
│           Infrastructure                 │  ← 外部服务、消息、缓存
└─────────────────────────────────────────┘

依赖方向：Controller → Service → Repository（单向，禁止反向）
```

## 必须遵守

- **必须** 遵循 Controller → Service → Repository 单向依赖
- **必须** 事务注解 `@Transactional` 只加在 Service 层
- **必须** Controller 只做参数接收、校验和响应封装
- **必须** Service 层包含所有业务逻辑（本条是 **Controller→Service→Repository 三层**口径；项目若在 SPEC-BE 定稿为 DDD/六边形等其它分层，"业务逻辑"归属其领域层，本条让位于项目自订分层规则，不跨口径套用）
- **必须** Repository 层只负责数据访问，无业务逻辑
- **推荐** Service 接口 + 实现分离（便于测试和替换）

## 禁止事项

- **禁止** Controller 直接调用 Repository（跨层调用）
- **禁止** Repository 调用 Service（反向依赖）
- **禁止** Controller 中包含业务逻辑（if-else 判断业务规则）
- **禁止** Service 之间循环依赖
- **禁止** 在 Controller/Repository 上加 `@Transactional`
- **禁止** Service 层直接操作 HttpServletRequest/Response

## Controller 层

```java
// ✅ 正确：Controller 只做请求转发和响应封装
@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
@Validated
public class OrderController {

    private final OrderService orderService;

    @GetMapping("/{id}")
    public ResponseEntity<OrderVO> getById(@PathVariable Long id) {
        return ResponseEntity.ok(orderService.getById(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrderVO create(@Valid @RequestBody CreateOrderRequest request) {
        return orderService.createOrder(request);
    }

    @GetMapping
    public PageResult<OrderVO> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status) {
        return orderService.listOrders(page, size, status);
    }
}
```

## Service 层

```java
// ✅ 正确：Service 包含业务逻辑 + 事务
@Service
@RequiredArgsConstructor
@Slf4j
public class OrderServiceImpl implements OrderService {

    private final OrderRepository orderRepository;
    private final UserRepository userRepository;
    private final PaymentService paymentService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public OrderVO createOrder(CreateOrderRequest request) {
        // 业务校验
        User user = userRepository.findById(request.getUserId())
            .orElseThrow(() -> new ResourceNotFoundException("User", request.getUserId()));

        if (!user.isActive()) {
            throw new BusinessException("USER_INACTIVE", "User is not active", 403);
        }

        // 业务逻辑
        Order order = Order.from(request);
        order = orderRepository.save(order);

        // 调用外部服务
        paymentService.createPayment(order.getId(), order.getAmount());

        log.info("Order created: id={}, userId={}", order.getId(), user.getId());
        return OrderVO.from(order);
    }

    @Override
    @Transactional(readOnly = true)
    public OrderVO getById(Long id) {
        Order order = orderRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Order", id));
        return OrderVO.from(order);
    }
}
```

## Repository 层

```java
// ✅ 正确：Repository 只做数据访问
@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    Optional<Order> findByOrderNo(String orderNo);

    boolean existsByOrderNo(String orderNo);

    @Query("SELECT o FROM Order o WHERE o.userId = :userId AND o.status = :status")
    Page<Order> findByUserIdAndStatus(Long userId, OrderStatus status, Pageable pageable);
}
```

## 常见违规示例

```java
// ❌ 错误：Controller 直接调用 Repository
@RestController
public class BadController {
    @Autowired
    private OrderRepository orderRepository; // 跨层！

    @GetMapping("/orders/{id}")
    public Order get(@PathVariable Long id) {
        return orderRepository.findById(id).orElse(null); // 无业务逻辑、无异常处理
    }
}

// ❌ 错误：Controller 包含业务逻辑
@PostMapping("/orders")
public Order create(@RequestBody Order order) {
    if (order.getAmount().compareTo(BigDecimal.ZERO) <= 0) { // 业务规则不应在此
        throw new RuntimeException("Invalid amount");
    }
    // ... 更多业务逻辑
}

// ❌ 错误：事务加在 Controller 上
@Transactional // 不应在此层！
@GetMapping("/orders")
public List<Order> list() { ... }
```

## 检查清单

| 检查项 | 要求 |
|--------|------|
| 单向依赖 Controller→Service→Repository | 必须 |
| @Transactional 仅在 Service 层 | 必须 |
| Controller 无业务逻辑 | 必须 |
| 无跨层调用 | 必须 |
| 无循环依赖 | 必须 |
| Service 接口+实现 | 推荐 |