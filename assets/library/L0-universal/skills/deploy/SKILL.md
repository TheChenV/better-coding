---
name: deploy
description: 标准化部署。触发方式：/deploy。来源：Harness component library。
---


# 标准化部署

## 产出契约（环节卡为单一契约源）

| 项 | 契约 |
|----|------|
| 产出物 | 目标环境部署完成 + 健康检查通过 + `docs/spec/上线记录-{日期}.md`（含回滚命令） |
| 模板依赖 | 无 |
| 归档位置 | `docs/spec/` |
| 产出自检 | 先出上线检查清单并经用户确认；清单逐项通过（配置/密钥/迁移/回滚预案）；关键接口健康检查通过；回滚命令已记录并验证可行；无实验性配置与调试代码；敏感值一律环境变量 |
| 收尾 | 3 步同步；版本发布另走 `/release` |

## 触发条件

- 用户输入 `/deploy` 命令
- 代码通过所有验证后需要部署到目标环境
- 用户要求将应用发布到测试/预发/生产环境
- CI/CD 流水线中的部署阶段

## 核心原则

> **部署必须是可重复、可回滚、可验证的。** 任何部署操作都必须有明确的回滚方案，且部署后必须验证服务健康。

## 执行步骤

### Step 1: 环境检查

部署前确认目标环境就绪：

**1.1 确认部署目标**
```bash
# 确认目标环境
echo "部署目标: ${DEPLOY_ENV}"  # dev / staging / production

# 确认当前分支/版本
git log --oneline -1
git describe --tags --always
```

**1.2 环境依赖检查**
```bash
# 检查运行时版本
node --version    # 或 java -version / go version / python --version

# 检查必要服务可达性
# 数据库
pg_isready -h $DB_HOST -p $DB_PORT
# Redis
redis-cli -h $REDIS_HOST ping
# 其他依赖服务
curl -s -o /dev/null -w "%{http_code}" http://$DEPENDENCY_SERVICE/health
```

**1.3 配置检查**
- [ ] 环境变量已正确设置
- [ ] 密钥/证书已就位
- [ ] 数据库连接串正确
- [ ] 第三方服务 API Key 有效

**检查清单：**
```markdown
## 部署前检查 - <环境名> - <日期>
- [ ] 代码已通过 CI（编译+测试+Lint）
- [ ] 数据库迁移已准备
- [ ] 环境变量已配置
- [ ] 依赖服务正常
- [ ] 磁盘空间充足（>20%剩余）
- [ ] 回滚方案已确认
```

### Step 2: 编译打包

构建部署产物：

```bash
# 清理旧产物
rm -rf dist/ build/ target/

# 编译构建（按项目技术栈执行）
# 【__已预填：构建命令，请核对__】
# 例如：
# - Node.js: npm ci && npm run build
# - Java: mvn clean package -DskipTests -q
# - Go: CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o app ./cmd/server
# - Python: python -m build
# - Docker: docker build -t ${IMAGE_NAME}:${VERSION} .
```

**验证产物：**
```bash
# 确认产物存在且完整
ls -la dist/
# 确认版本号正确
cat dist/version.txt
# Docker 镜像确认
docker images | grep ${IMAGE_NAME}
```

### Step 3: 上传部署

将产物部署到目标环境：

**方式A：容器部署（推荐）**
```bash
# 推送镜像
docker push ${REGISTRY}/${IMAGE_NAME}:${VERSION}

# 更新部署
kubectl set image deployment/${APP_NAME} app=${REGISTRY}/${IMAGE_NAME}:${VERSION}
kubectl rollout status deployment/${APP_NAME} --timeout=300s
```

**方式B：传统部署**
```bash
# 上传产物
scp -r dist/ ${DEPLOY_USER}@${DEPLOY_HOST}:/opt/${APP_NAME}/

# 执行远程部署脚本
ssh ${DEPLOY_USER}@${DEPLOY_HOST} "cd /opt/${APP_NAME} && ./deploy.sh ${VERSION}"
```

**方式C：云平台部署**
```bash
# 示例：使用云平台 CLI
# vercel deploy --prod
# flyctl deploy
# railway up
```

### Step 4: 启动验证

确认应用成功启动：

```bash
# 检查进程状态
kubectl get pods -l app=${APP_NAME}
# 或
systemctl status ${APP_NAME}
# 或
docker ps | grep ${APP_NAME}

# 查看启动日志（确认无异常）
kubectl logs -l app=${APP_NAME} --tail=50
# 或
journalctl -u ${APP_NAME} --since "5 minutes ago"
```

**确认要点：**
- 进程/容器状态为 Running
- 启动日志无 ERROR/FATAL
- 端口已监听
- 启动时间在预期范围内

### Step 5: 健康检查

执行全面的健康验证：

```bash
# 基础健康端点
curl -f http://${APP_HOST}:${APP_PORT}/health
# 期望: {"status":"healthy","version":"1.2.3"}

# 就绪检查（Readiness）
curl -f http://${APP_HOST}:${APP_PORT}/ready

# 核心功能冒烟测试
curl -f http://${APP_HOST}:${APP_PORT}/api/v1/ping
curl -f -X POST http://${APP_HOST}:${APP_PORT}/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"smoke_test","password":"test"}'
```

**健康检查清单：**
- [ ] /health 返回 200 + healthy
- [ ] /ready 返回 200
- [ ] 数据库连接正常
- [ ] 缓存连接正常
- [ ] 核心 API 可响应
- [ ] 响应时间在 SLA 内（<500ms）

### Step 6: 记录日志

记录本次部署的完整信息：

```markdown
## 部署记录

- **时间**: 2024-01-15 14:30:00
- **环境**: production
- **版本**: v1.2.3 (commit: abc123)
- **操作人**: <name>
- **变更内容**: <简述本次部署包含的变更>
- **部署方式**: 容器滚动更新
- **回滚版本**: v1.2.2
- **健康检查**: ✅ 全部通过
- **备注**: <特殊情况说明>
```

**回滚方案（必须预先准备）：**
```bash
# 如需回滚
kubectl rollout undo deployment/${APP_NAME}
# 或
kubectl set image deployment/${APP_NAME} app=${REGISTRY}/${IMAGE_NAME}:${PREVIOUS_VERSION}
```

## 输出物

- 部署产物（镜像/包）
- 部署记录日志
- 健康检查报告
- 回滚方案

## 适用条件

- 所有需要部署到服务器/云平台的项目
- 生产环境部署（必须严格执行所有步骤）
- 测试/预发环境部署（可适当简化）

## 失败处理

| 失败场景 | 处理方式 |
|----------|----------|
| 编译失败 | 中止部署，返回修复编译问题 |
| 上传/推送失败 | 检查网络/权限，重试；连续3次失败则中止 |
| 启动失败 | 立即回滚到上一版本，分析启动日志 |
| 健康检查不通过 | 回滚，排查原因后重新部署 |
| 数据库迁移失败 | 执行回滚迁移，中止部署 |
| 部署后发现Bug | 评估影响：紧急则回滚，非紧急则hotfix后重新部署 |