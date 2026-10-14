---
name: java-test
description: Java测试流程. Manual-trigger skill. Source: Harness component library.
---


# Java 测试流程

## 概述

分层测试策略：单元测试验证业务逻辑，服务测试验证 Spring 集成，集成测试验证端到端流程。

## 前置条件

- JUnit 5 (Jupiter)
- Mockito 5+
- Spring Boot Test
- Testcontainers（集成测试）
- JaCoCo（覆盖率）
- 覆盖率目标：行覆盖 >= 80%，分支覆盖 >= 75%

## 执行步骤

### Step 1: 单元测试（JUnit + Mockito）

```bash
mvn test -Dtest="*Test"
```

**单元测试编写规范：**

```java
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private OrderServiceImpl orderService;

    @Test
    void should_create_order_when_valid_request() {
        // Given
        var request = new CreateOrderRequest(1L, new BigDecimal("99.99"), "test");
        var user = new User();
        user.setId(1L);
        user.setActive(true);

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(orderRepository.save(any(Order.class))).thenAnswer(inv -> {
            Order order = inv.getArgument(0);
            order.setId(100L);
            return order;
        });

        // When
        OrderVO result = orderService.createOrder(request);

        // Then
        assertThat(result).isNotNull();
        assertThat(result.id()).isEqualTo(100L);
        assertThat(result.amount()).isEqualByComparingTo("99.99");
        verify(orderRepository).save(any(Order.class));
    }

    @Test
    void should_throw_exception_when_user_not_found() {
        // Given
        var request = new CreateOrderRequest(999L, BigDecimal.TEN, null);
        when(userRepository.findById(999L)).thenReturn(Optional.empty());

        // When & Then
        assertThatThrownBy(() -> orderService.createOrder(request))
            .isInstanceOf(ResourceNotFoundException.class)
            .hasMessageContaining("User");
    }

    @Test
    void should_throw_exception_when_user_inactive() {
        // Given
        var request = new CreateOrderRequest(1L, BigDecimal.TEN, null);
        var user = new User();
        user.setId(1L);
        user.setActive(false);
        when(userRepository.findById(1L)).thenReturn(Optional.of(user));

        // When & Then
        assertThatThrownBy(() -> orderService.createOrder(request))
            .isInstanceOf(BusinessException.class)
            .hasFieldOrPropertyWithValue("code", "USER_INACTIVE");
    }
}
```

### Step 2: 服务层测试（SpringBootTest）

```bash
mvn test -Dtest="*ServiceIT"
```

```java
@SpringBootTest
@Transactional // 测试后自动回滚
class OrderServiceIT {

    @Autowired
    private OrderService orderService;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    void should_persist_order_and_return_vo() {
        // Given：准备测试数据
        User user = new User();
        user.setName("Test User");
        user.setActive(true);
        user = userRepository.save(user);

        var request = new CreateOrderRequest(user.getId(), new BigDecimal("199.00"), null);

        // When
        OrderVO result = orderService.createOrder(request);

        // Then：验证数据库
        assertThat(result.orderNo()).isNotBlank();
        assertThat(orderRepository.findByOrderNo(result.orderNo())).isPresent();
    }
}
```

### Step 3: 集成测试（Testcontainers）

```bash
mvn verify -P integration-test
```

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class OrderControllerIT {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
        .withDatabaseName("testdb")
        .withUsername("test")
        .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    void should_create_and_get_order() {
        // Create
        var request = new CreateOrderRequest(1L, new BigDecimal("50.00"), "integration test");
        var createResponse = restTemplate.postForEntity("/api/v1/orders", request, OrderVO.class);
        assertThat(createResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);

        // Get
        Long orderId = createResponse.getBody().id();
        var getResponse = restTemplate.getForEntity("/api/v1/orders/" + orderId, OrderVO.class);
        assertThat(getResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(getResponse.getBody().amount()).isEqualByComparingTo("50.00");
    }

    @Test
    void should_return_404_when_order_not_exists() {
        var response = restTemplate.getForEntity("/api/v1/orders/99999", String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}
```

### Step 4: 覆盖率报告（JaCoCo）

```bash
# 生成覆盖率报告
mvn test jacoco:report

# 查看报告
open target/site/jacoco/index.html
```

**覆盖率配置（pom.xml）：**

```xml
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <configuration>
        <rules>
            <rule>
                <limits>
                    <limit>
                        <counter>LINE</counter>
                        <value>COVEREDRATIO</value>
                        <minimum>0.80</minimum>
                    </limit>
                    <limit>
                        <counter>BRANCH</counter>
                        <value>COVEREDRATIO</value>
                        <minimum>0.75</minimum>
                    </limit>
                </limits>
            </rule>
        </rules>
    </configuration>
</plugin>
```

## 测试命名规范

```
should_<期望结果>_when_<条件>
```

## 检查清单

- [ ] 单元测试全部通过
- [ ] 服务层测试通过
- [ ] 集成测试通过（Testcontainers）
- [ ] 行覆盖率 >= 80%
- [ ] 分支覆盖率 >= 75%
- [ ] 无跳过的测试（@Disabled）
- [ ] 测试间无依赖（可独立运行）