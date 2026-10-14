---
name: project-feature-dev
description: 项目特定功能开发流程。按 Spec 文档逐层实现功能，遵循项目分层架构。触发方式：/project-feature-dev。来源：L2 project template。
---

# 项目特定功能开发流程

> **使用说明**：根据项目实际开发流程定制各步骤内容。`【__名称__】` 为必填占位，`【__名称__，可选】` 为选填，`【已预填：xx，请核对】` 为 AI 预填项。

## 触发条件

当需要开发项目特有的业务功能（非通用 CRUD）时手动触发。

## 前置条件

- [ ] 需求文档/Spec 已确认
- [ ] 相关模块的架构设计已完成
- [ ] 开发分支已创建（`feature/【__功能名__】`）

## 执行步骤

### Step 1: 需求确认与影响分析

- 阅读相关 Spec 文档：`【__docs/spec/spec-xxx.md__】`
- 确认功能涉及的模块和层级：
  - 接入层：【__需要新增/修改的 Controller__】
  - 应用层：【__需要新增/修改的 Service__】
  - 领域层：【__需要新增/修改的 Domain 对象__】
  - 基础设施层：【__需要新增/修改的 Repository/外部调用__】
- 确认依赖的其他模块接口
- 输出：影响分析清单

### Step 2: 数据模型设计

- 设计数据库表结构（遵循项目数据库规范）：
  ```sql
  -- 【__表名__】: 【__表说明__】
  CREATE TABLE 【__table_name__】 (
      id BIGINT PRIMARY KEY COMMENT '【__主键说明__】',
      -- 【__业务字段__】
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_by BIGINT COMMENT '创建人',
      deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除'
  ) COMMENT '【__表说明__】';
  ```
- 确认索引设计
- 确认与现有表的关联关系
- 输出：DDL 脚本 + Entity 类

### Step 3: 领域层实现

- 创建/修改领域对象（Entity、ValueObject、AggregateRoot）
- 实现核心业务规则（领域服务）
- 定义 Repository 接口
- 定义领域事件（如需要）
- 约束：
  - 领域层不依赖任何框架注解
  - 业务规则必须在领域层实现，不可泄漏到应用层
- 输出：领域层代码

### Step 4: 基础设施层实现

- 实现 Repository 接口（数据访问）
- 实现外部服务调用（如需要）
- 配置数据源/连接（如需要）
- 约束：
  - 仅在此层使用 ORM 框架注解
  - 异常需转换为业务异常
- 输出：基础设施层代码

### Step 5: 应用层实现

- 实现应用服务（业务编排）
- 实现 DTO 转换
- 处理事务边界
- 协调多个领域对象/外部服务
- 约束：
  - 应用层不包含核心业务逻辑
  - 一个方法对应一个用例
- 输出：应用层代码

### Step 6: 接入层实现

- 实现 Controller（REST API）
- 实现参数校验（Request 对象 + 校验注解）
- 实现 VO 转换
- 添加接口文档注解
- 约束：
  - Controller 不包含业务逻辑
  - 必须遵循项目 API 约定（路径、响应格式）
- 输出：接入层代码

### Step 7: 单元测试

- 领域层：核心业务逻辑测试（覆盖率 ≥ 【__90%__】）
- 应用层：Service 层 Mock 测试
- 接入层：接口集成测试（MockMvc）
- 输出：测试代码

### Step 8: 自验与提交

- [ ] 编译通过（零 Error）
- [ ] 所有测试通过
- [ ] Lint 检查通过
- [ ] 接口文档已更新
- [ ] 数据库变更脚本已准备
- [ ] 代码自审（对照 Rules 检查）
- 提交代码，触发 Code Review

## 输出物

- 功能代码（各层）
- 数据库变更脚本
- 单元测试
- 接口文档更新

## 注意事项

- 【__项目特殊注意事项1：如"涉及金额计算必须用 BigDecimal"__】
- 【__项目特殊注意事项2：如"多租户场景必须带 tenant_id 过滤"__】
- 【__项目特殊注意事项3：如"所有写操作必须记录操作日志"__】
