---
name: start-dev
description: 同时启动前后端开发服务器
---

# 启动开发服务器

## 执行步骤

1. 启动后端服务（按项目技术栈）
```bash
# 【__已预填：后端启动命令，请核对__】
# 例如：
# - Node.js/Express: npm run dev
# - Java/Spring: mvn spring-boot:run
# - Python/FastAPI: uvicorn main:app --reload
# - Go: go run cmd/server/main.go
```

2. 启动前端服务（如有前端）
```bash
# 【__已预填：前端启动命令，请核对__】
# 例如：
# - React/Vite: npm run dev --workspace=frontend
# - Vue/Vite: npm run dev --workspace=frontend
```

3. 验证服务启动
```bash
# 检查后端健康检查
# curl http://localhost:【__端口__】/health

# 检查前端服务
# curl http://localhost:【__端口__】
```

## 适用场景

- 本地开发环境启动
- 联调前启动服务
