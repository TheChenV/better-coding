---
name: python-deploy
description: Python部署流程. Manual-trigger skill. Source: Harness component library.
---


# Python 部署流程

## 概述

本技能定义了 Python 应用从构建到生产部署的完整流程，支持 Docker 容器化部署和传统部署两种方式。

## 前置条件

- 构建流程（python-build）已成功完成
- 制品（wheel/docker image）已生成
- 部署目标环境配置已就绪
- 回滚方案已确认

## 执行步骤

### Step 1: 构建部署制品

```bash
# 方案 A：Docker 镜像（推荐）
docker build -t my-project:${VERSION} -f deploy/Dockerfile .
docker tag my-project:${VERSION} registry.example.com/my-project:${VERSION}
docker push registry.example.com/my-project:${VERSION}

# 方案 B：Wheel 包
python -m build
twine upload dist/* --repository production  # 私有 PyPI
```

**Dockerfile 最佳实践**：

```dockerfile
# deploy/Dockerfile
FROM python:3.11-slim AS base

# 安全：创建非 root 用户
RUN useradd --create-home --shell /bin/bash appuser

WORKDIR /app

# 利用 Docker 层缓存
COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync --frozen --no-dev

COPY src/ ./src/

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health')"

CMD ["uvicorn", "my_project.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Step 2: 环境配置

```bash
# ✅ 必须：通过环境变量注入配置（12-Factor App）
# .env.production（不提交到 VCS）
DATABASE_URL=postgresql://user:pass@db-host:5432/prod
REDIS_URL=redis://redis-host:6379/0
SECRET_KEY=<generated-secret>
LOG_LEVEL=info
ALLOWED_HOSTS=api.example.com

# ✅ 使用 pydantic-settings 验证配置
# src/my_project/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    redis_url: str
    secret_key: str
    log_level: str = "info"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}
```

### Step 3: 部署执行

```bash
# 方案 A：Docker Compose 部署
docker compose -f deploy/docker-compose.prod.yml pull
docker compose -f deploy/docker-compose.prod.yml up -d --remove-orphans

# 方案 B：Kubernetes 部署
kubectl apply -f deploy/k8s/deployment.yaml
kubectl apply -f deploy/k8s/service.yaml
kubectl rollout status deployment/my-project --timeout=120s

# 方案 C：传统部署（systemd）
scp dist/my_project-${VERSION}-py3-none-any.whl server:/opt/app/
ssh server "cd /opt/app && pip install my_project-${VERSION}-py3-none-any.whl"
ssh server "sudo systemctl restart my-project"
```

### Step 4: 健康检查

```bash
# ✅ 必须：部署后立即验证
# 等待服务启动
sleep 10

# 基础健康检查
curl -f http://localhost:8000/health || exit 1

# 深度健康检查（含依赖）
curl -f http://localhost:8000/health/deep || exit 1
# 预期响应：{"status": "healthy", "database": "ok", "redis": "ok"}

# 验证版本
curl -s http://localhost:8000/version | jq .
# 预期：{"version": "1.2.3", "commit": "abc123"}

# 验证关键 API
curl -f http://localhost:8000/api/v1/ping || exit 1
```

### Step 5: 回滚方案

```bash
# ✅ 必须：部署前记录当前版本
CURRENT_VERSION=$(curl -s http://localhost:8000/version | jq -r .version)
echo "当前版本: ${CURRENT_VERSION}"

# 回滚触发条件：
# - 健康检查失败
# - 错误率 > 5%
# - P99 延迟 > 2s

# Docker Compose 回滚
docker compose -f deploy/docker-compose.prod.yml pull
docker tag registry.example.com/my-project:${CURRENT_VERSION} my-project:latest
docker compose -f deploy/docker-compose.prod.yml up -d

# Kubernetes 回滚
kubectl rollout undo deployment/my-project
kubectl rollout status deployment/my-project

# 回滚后验证
curl -f http://localhost:8000/health || echo "ROLLBACK FAILED"
```

## 部署检查清单

| 阶段 | 检查项 | 状态 |
|------|--------|------|
| 部署前 | 测试全部通过 | ☐ |
| 部署前 | 制品已构建并推送 | ☐ |
| 部署前 | 环境变量已配置 | ☐ |
| 部署前 | 回滚方案已确认 | ☐ |
| 部署中 | 数据库迁移已执行 | ☐ |
| 部署中 | 零停机/蓝绿切换 | ☐ |
| 部署后 | 健康检查通过 | ☐ |
| 部署后 | 错误率正常 | ☐ |
| 部署后 | 日志无异常 | ☐ |