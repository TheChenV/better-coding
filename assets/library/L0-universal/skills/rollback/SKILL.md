---
name: rollback
description: 版本回滚。触发方式：/rollback。来源：Harness component library。
---

# 版本回滚

## 触发条件

- 用户输入 `/rollback` 命令
- 生产环境发现严重问题需要回退版本
- 部署失败需要恢复到上一版本
- 用户要求回退到某个稳定版本

## 核心原则

> **回滚必须可执行、可验证、可追溯。** 任何回滚操作必须有明确的回滚方案，回滚后必须验证服务健康。

## 执行步骤

### Step 1: 确认回滚范围

- [ ] 回滚到上一个版本
- [ ] 回滚到指定版本
- [ ] 部分回滚（仅回滚特定模块/服务）

### Step 2: 获取目标版本信息

```bash
# 查看可用版本
# 容器部署：
# docker images | grep ${IMAGE_NAME}
# 或查看 Git Tag：
git tag --list 'v*'

# 确认目标版本
# 【__已预填：目标版本号，请核对__】
```

### Step 3: 执行回滚

**方式A：容器部署回滚**
```bash
# 回滚到上一版本
kubectl rollout undo deployment/${APP_NAME}

# 或回滚到指定版本
kubectl rollout undo deployment/${APP_NAME} --to-revision=${REVISION}

# 等待回滚完成
kubectl rollout status deployment/${APP_NAME} --timeout=300s
```

**方式B：传统部署回滚**
```bash
# 切换版本符号链接
ssh ${DEPLOY_USER}@${DEPLOY_HOST} "cd /opt/${APP_NAME} && ./rollback.sh ${TARGET_VERSION}"

# 或手动替换产物
# scp -r ${OLD_VERSION}/ ${DEPLOY_USER}@${DEPLOY_HOST}:/opt/${APP_NAME}/current/
```

**方式C：数据库回滚（如需要）**
```bash
# 执行数据库迁移回滚
# 【__已预填：数据库回滚命令，请核对__】
# 例如：
# - Flyway: flyway undo
# - Liquibase: liquibase rollback
# - Alembic: alembic downgrade -1
```

### Step 4: 验证回滚

```bash
# 健康检查
curl -s http://${SERVICE_HOST}/health | jq .

# 版本确认
curl -s http://${SERVICE_HOST}/version | jq .

# 关键接口验证
# 【__已预填：关键接口列表，请核对__】
```

**验证标准**：
- [ ] 服务健康检查通过
- [ ] 版本号正确回退
- [ ] 关键接口功能正常
- [ ] 监控指标恢复正常
- [ ] 无新增错误日志

### Step 5: 记录回滚

```markdown
## 回滚记录

- 回滚时间: 【__yyyy-MM-dd HH:mm__】
- 回滚原因: 【__问题描述__】
- 原版本: 【__v1.2.3__】
- 目标版本: 【__v1.2.2__】
- 执行人: 【__姓名__】
- 验证结果: ✅ 通过 / ❌ 失败

### 问题根因（待分析）
- 【__初步分析__】

### 后续行动
- [ ] 分析根因
- [ ] 修复问题
- [ ] 重新部署
```

## 输出物

- 回滚执行记录
- 验证结果报告
- 后续行动计划

## 适用条件

- 生产环境发现严重问题
- 部署失败
- 用户明确要求回退版本

## 失败处理

| 失败场景 | 处理方式 |
|----------|----------|
| 回滚后服务仍不可用 | 检查数据库状态、配置、依赖服务 |
| 无法找到目标版本产物 | 从 Git Tag 重新构建 |
| 数据库不兼容 | 执行数据库回滚脚本 |
| 回滚后数据不一致 | 评估数据修复方案，必要时人工介入 |
