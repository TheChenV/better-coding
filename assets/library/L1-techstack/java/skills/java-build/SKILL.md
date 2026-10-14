---
name: java-build
description: Maven/Gradle构建流程. Manual-trigger skill. Source: Harness component library.
---


# Maven/Gradle 构建流程

## 概述

标准化的 Java 构建流程确保代码在发布前经过编译、测试、打包和验证的完整链路。

## 前置条件

- JDK 21+（LTS）
- Maven 3.9+ 或 Gradle 8.5+
- CI 环境配置（GitHub Actions / Jenkins / GitLab CI）

## Maven 构建步骤

### Step 1: Clean（清理旧产物）

```bash
mvn clean
```

### Step 2: Compile（编译）

```bash
mvn compile

# 多模块项目编译
mvn compile -pl module-order -am
```

**失败处理：** 编译错误必须全部修复，禁止跳过。

### Step 3: Test（单元测试）

```bash
mvn test

# 运行指定测试类
mvn test -Dtest=OrderServiceTest

# 跳过测试（仅本地调试，CI 禁止）
mvn package -DskipTests  # ⚠️ 仅开发时使用
```

### Step 4: Package（打包）

```bash
# 打 JAR 包
mvn package

# 打 WAR 包（传统部署）
mvn package -P war

# Spring Boot 可执行 JAR
mvn package -DskipTests  # 产物在 target/*.jar
```

### Step 5: Verify（验证）

```bash
# 运行集成测试 + 检查
mvn verify

# 包含 Checkstyle + SpotBugs 检查
mvn verify -P quality
```

### Step 6: Install / Deploy

```bash
# 安装到本地仓库
mvn install

# 部署到远程仓库（Nexus/Artifactory）
mvn deploy -P release
```

## 完整 CI 流水线

```yaml
# .github/workflows/java-build.yml
name: Java Build
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: 'maven'

      - name: Compile
        run: mvn compile -B

      - name: Checkstyle
        run: mvn checkstyle:check -B

      - name: Unit Tests
        run: mvn test -B

      - name: Package
        run: mvn package -B -DskipTests

      - name: Integration Tests
        run: mvn verify -B -P integration-test
        env:
          SPRING_DATASOURCE_URL: jdbc:postgresql://localhost:5432/testdb

      - name: Upload Artifact
        uses: actions/upload-artifact@v4
        with:
          name: app-jar
          path: target/*.jar
```

## Gradle 构建（替代方案）

```bash
# 完整构建
./gradlew clean build

# 分步执行
./gradlew compileJava
./gradlew test
./gradlew bootJar

# 带质量检查
./gradlew build checkstyleMain spotbugsMain

# 依赖分析
./gradlew dependencies --configuration runtimeClasspath
```

## Maven 质量检查 Profile

```xml
<!-- pom.xml -->
<profiles>
  <profile>
    <id>quality</id>
    <build>
      <plugins>
        <plugin>
          <groupId>org.apache.maven.plugins</groupId>
          <artifactId>maven-checkstyle-plugin</artifactId>
          <version>3.3.1</version>
          <executions>
            <execution>
              <phase>verify</phase>
              <goals><goal>check</goal></goals>
            </execution>
          </executions>
        </plugin>
        <plugin>
          <groupId>com.github.spotbugs</groupId>
          <artifactId>spotbugs-maven-plugin</artifactId>
          <version>4.8.3.1</version>
          <executions>
            <execution>
              <phase>verify</phase>
              <goals><goal>check</goal></goals>
            </execution>
          </executions>
        </plugin>
        <plugin>
          <groupId>org.jacoco</groupId>
          <artifactId>jacoco-maven-plugin</artifactId>
          <version>0.8.11</version>
          <executions>
            <execution>
              <goals><goal>prepare-agent</goal></goals>
            </execution>
            <execution>
              <id>report</id>
              <phase>test</phase>
              <goals><goal>report</goal></goals>
            </execution>
          </executions>
        </plugin>
      </plugins>
    </build>
  </profile>
</profiles>
```

## 检查清单

- [ ] `mvn clean compile` 零错误
- [ ] `mvn test` 全部通过
- [ ] Checkstyle 检查通过
- [ ] SpotBugs 无高危问题
- [ ] `mvn package` 产物生成成功
- [ ] JaCoCo 覆盖率 >= 80%
- [ ] CI 流水线全绿