---
name: java-module-skeleton
description: Spring Boot模块骨架生成. Manual-trigger skill. Source: Harness component library.
---


# Spring Boot 模块骨架生成

## 概述

快速生成符合分层规范的 Spring Boot 业务模块骨架，包含完整的 Entity、Repository、Service、Controller 和配置。

## 前置条件

- Spring Boot 3.2+
- JDK 21+
- Maven / Gradle
- 数据库：PostgreSQL / MySQL

## 跨栈通用门禁

生成前确认模块信息四要素（模块名称 / 职责 / 所属层级 / 依赖模块）、先读 `AGENTS.md` 的分层与编码规范、
「骨架不是空壳」判据（最小可编译可启动）与骨架清单产出，均以 `.qoder/techstack-commands.json` 的
`_skeletonContract` 为唯一规范（跨栈单源，原 L0 skill create-module-skeleton 已下沉到那里）；
本文件只提供本栈的目录结构与代码形态，不重复通用门禁。

## 编号工作流（骨架生成的可执行协议）

本栈模块骨架不由 AI 现写脚本：包路径、pom 与 application.yml 正文都在 `plans/java.json` 里（与上面 Step 1 的结构同源），按库根 `assets/templates/numbered-workflows`（项目级安装 = `<项目>/.qoder/skills/better-coding/assets/templates/numbered-workflows`）的
七步编号工作流执行，本栈数据取 `plans/java.json`；占位符变量表见 `vars.mjs`，机制与偏离见该目录的 README.md。

1. **段 A 理解目标**：读 `workflows/<编号>/workflow.md` 的「目标 / 输入变量 / 产出物 / 验证方法」
2. **段 B 拼脚本**：`node assets/templates/numbered-workflows/numbered-workflow.mjs compose --stack java --vars <values.json> --workflow <编号> --project <目标项目根>`
3. **段 C 执行**：跑落盘件 `<目标项目>/.scaffold/step<编号>.mjs`（`compose` 换成 `run` 可 B+C+D 一次过）
4. **段 D 验证**：以退出码为准，0 才算过；`buildCmd` 取 `.qoder/techstack-commands.json` 本栈 `build`，不在脚本里发明命令

失败即问：任一段非 0 退出就停下来问用户「重试还是跳过」——不自行继续、不改库内文件、
不覆盖项目既有文件（工作流 02/03 遇到同名不同内容会判冲突并退出 1）。
禁止修改用户已有 .qoder/：引擎按路径段拦，命中即退出码 2。
七步顺序 01-create-directories → 02-write-configs → 03-write-skeleton-code → 04-verify-paths →
05-init-repo → 06-build-verify → 07-append-module（可按需只跑到 04，但 06 的编译验证是「骨架不是空壳」的出口）。

## 执行步骤

### Step 1: 创建模块目录结构

```
src/main/java/com/company/order/
├── controller/
│   └── OrderController.java
├── service/
│   ├── OrderService.java          # 接口
│   └── OrderServiceImpl.java      # 实现
├── repository/
│   └── OrderRepository.java
├── entity/
│   └── Order.java
├── vo/
│   └── OrderVO.java
├── request/
│   ├── CreateOrderRequest.java
│   └── UpdateOrderRequest.java
├── enums/
│   └── OrderStatus.java
└── exception/
    └── OrderNotFoundException.java

src/main/resources/
├── application.yml
└── db/migration/
    └── V1__create_order_table.sql

src/test/java/com/company/order/
├── service/
│   └── OrderServiceTest.java
└── controller/
    └── OrderControllerIT.java
```

### Step 2: 定义 Entity

```java
package com.company.order.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "orders", indexes = {
    @Index(name = "idx_order_user_id", columnList = "userId"),
    @Index(name = "idx_order_status", columnList = "status")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 32)
    private String orderNo;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OrderStatus status;

    @Column(length = 500)
    private String remark;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
```

### Step 3: 定义 Repository

```java
package com.company.order.repository;

import com.company.order.entity.Order;
import com.company.order.enums.OrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    Optional<Order> findByOrderNo(String orderNo);

    boolean existsByOrderNo(String orderNo);

    Page<Order> findByUserId(Long userId, Pageable pageable);

    Page<Order> findByUserIdAndStatus(Long userId, OrderStatus status, Pageable pageable);

    @Query("SELECT COUNT(o) FROM Order o WHERE o.userId = :userId AND o.status = :status")
    long countByUserIdAndStatus(Long userId, OrderStatus status);
}
```

### Step 4: 定义 Service 接口 + 实现

```java
// 接口
package com.company.order.service;

public interface OrderService {
    OrderVO createOrder(CreateOrderRequest request);
    OrderVO getById(Long id);
    PageResult<OrderVO> listByUser(Long userId, int page, int size);
    OrderVO updateStatus(Long id, UpdateOrderRequest request);
    void delete(Long id);
}

// 实现
package com.company.order.service;

@Service
@RequiredArgsConstructor
@Slf4j
public class OrderServiceImpl implements OrderService {

    private final OrderRepository orderRepository;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public OrderVO createOrder(CreateOrderRequest request) {
        if (orderRepository.existsByOrderNo(request.orderNo())) {
            throw new DuplicateResourceException("Order", "orderNo", request.orderNo());
        }

        Order order = Order.builder()
            .orderNo(request.orderNo())
            .userId(request.userId())
            .amount(request.amount())
            .status(OrderStatus.PENDING)
            .remark(request.remark())
            .build();

        order = orderRepository.save(order);
        log.info("Order created: id={}, orderNo={}", order.getId(), order.getOrderNo());
        return OrderVO.from(order);
    }

    @Override
    @Transactional(readOnly = true)
    public OrderVO getById(Long id) {
        Order order = orderRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Order", id));
        return OrderVO.from(order);
    }

    @Override
    @Transactional(readOnly = true)
    public PageResult<OrderVO> listByUser(Long userId, int page, int size) {
        Page<Order> orders = orderRepository.findByUserId(
            userId, PageRequest.of(page - 1, size, Sort.by("createdAt").descending()));
        return PageResult.from(orders.map(OrderVO::from));
    }
}
```

### Step 5: 定义 Controller

```java
package com.company.order.controller;

@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
@Validated
public class OrderController {

    private final OrderService orderService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrderVO create(@Valid @RequestBody CreateOrderRequest request) {
        return orderService.createOrder(request);
    }

    @GetMapping("/{id}")
    public OrderVO getById(@PathVariable Long id) {
        return orderService.getById(id);
    }

    @GetMapping
    public PageResult<OrderVO> list(
            @RequestParam Long userId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return orderService.listByUser(userId, page, size);
    }

    @PutMapping("/{id}")
    public OrderVO update(@PathVariable Long id, @Valid @RequestBody UpdateOrderRequest request) {
        return orderService.updateStatus(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        orderService.delete(id);
    }
}
```

### Step 6: 数据库 Migration

```sql
-- src/main/resources/db/migration/V1__create_order_table.sql
CREATE TABLE orders (
    id          BIGSERIAL PRIMARY KEY,
    order_no    VARCHAR(32) NOT NULL UNIQUE,
    user_id     BIGINT NOT NULL,
    amount      DECIMAL(12, 2) NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    remark      VARCHAR(500),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP
);

CREATE INDEX idx_order_user_id ON orders(user_id);
CREATE INDEX idx_order_status ON orders(status);
CREATE INDEX idx_order_created_at ON orders(created_at DESC);
```

### Step 7: 编译验证

```bash
# 编译检查
mvn compile

# 运行测试
mvn test

# 启动验证
mvn spring-boot:run

# 验证 API
curl -X POST http://localhost:8080/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{"userId": 1, "amount": 99.99, "remark": "test"}'
```

## 检查清单

- [ ] 目录结构完整（controller/service/repository/entity/vo/request）
- [ ] Entity 有 JPA 注解 + 索引
- [ ] Repository 继承 JpaRepository
- [ ] Service 接口 + 实现分离
- [ ] Controller 有 @Valid 校验
- [ ] 数据库 Migration 脚本
- [ ] 编译通过 + 启动成功
- [ ] CRUD API 可正常调用