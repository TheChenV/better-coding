---
name: ts-node-scaffold
description: Node.js后端脚手架. Manual-trigger skill. Source: Harness component library.
---


# Node.js 后端脚手架

## 概述

快速搭建生产级 Node.js + TypeScript 后端项目，包含完整的工程化配置、分层架构和部署方案。

## 前置条件

- Node.js >= 20.x
- pnpm >= 9.x
- Docker（可选，用于本地数据库和部署）

## 跨栈通用门禁

生成前确认模块信息四要素（模块名称 / 职责 / 所属层级 / 依赖模块）、先读 `AGENTS.md` 的分层与编码规范、
「骨架不是空壳」判据（最小可编译可启动）与骨架清单产出，均以 `.qoder/techstack-commands.json` 的
`_skeletonContract` 为唯一规范（跨栈单源，原 L0 skill create-module-skeleton 已下沉到那里）；
本文件只提供本栈的目录结构与代码形态，不重复通用门禁。

## 编号工作流（骨架生成的可执行协议）

本栈后端骨架不由 AI 现写脚本：目录与配置正文都在 `plans/typescript.json` 里（与上面 Step 1 的结构同源），按库根 `assets/templates/numbered-workflows`（项目级安装 = `<项目>/.qoder/skills/better-coding/assets/templates/numbered-workflows`）的
七步编号工作流执行，本栈数据取 `plans/typescript.json`；占位符变量表见 `vars.mjs`，机制与偏离见该目录的 README.md。

1. **段 A 理解目标**：读 `workflows/<编号>/workflow.md` 的「目标 / 输入变量 / 产出物 / 验证方法」
2. **段 B 拼脚本**：`node assets/templates/numbered-workflows/numbered-workflow.mjs compose --stack typescript --vars <values.json> --workflow <编号> --project <目标项目根>`
3. **段 C 执行**：跑落盘件 `<目标项目>/.scaffold/step<编号>.mjs`（`compose` 换成 `run` 可 B+C+D 一次过）
4. **段 D 验证**：以退出码为准，0 才算过；`buildCmd` 取 `.qoder/techstack-commands.json` 本栈 `build`，不在脚本里发明命令

失败即问：任一段非 0 退出就停下来问用户「重试还是跳过」——不自行继续、不改库内文件、
不覆盖项目既有文件（工作流 02/03 遇到同名不同内容会判冲突并退出 1）。
禁止修改用户已有 .qoder/：引擎按路径段拦，命中即退出码 2。
七步顺序 01-create-directories → 02-write-configs → 03-write-skeleton-code → 04-verify-paths →
05-init-repo → 06-build-verify → 07-append-module（可按需只跑到 04，但 06 的编译验证是「骨架不是空壳」的出口）。

## 执行步骤

### Step 1: 项目初始化

```bash
mkdir my-api && cd my-api
pnpm init
pnpm add -D typescript @types/node tsx vitest eslint prettier
npx tsc --init
```

**目录结构：**

```
src/
├── config/          # 配置管理
├── routes/          # 路由定义
├── controllers/     # 请求处理
├── services/        # 业务逻辑
├── repositories/    # 数据访问
├── middleware/      # 中间件
├── schemas/         # Zod 校验 schema
├── types/           # 类型定义
├── utils/           # 工具函数
└── index.ts         # 入口
```

### Step 2: 选择框架

| 框架 | 适用场景 | 特点 |
|------|----------|------|
| Express | 简单 API、快速原型 | 生态最大、中间件丰富 |
| Fastify | 高性能 API、微服务 | 性能优秀、Schema 验证内置 |
| NestJS | 大型企业应用 | 模块化、DI、装饰器 |

**Fastify 示例（推荐）：**

```bash
pnpm add fastify @fastify/cors @fastify/helmet @fastify/rate-limit
```

```typescript
// src/index.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { config } from './config';
import { registerRoutes } from './routes';

const app = Fastify({ logger: true });

async function bootstrap(): Promise<void> {
  await app.register(cors, { origin: config.corsOrigins });
  await app.register(helmet);
  await registerRoutes(app);

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

bootstrap().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
```

### Step 3: 配置 tsconfig

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 4: 定义路由与控制器

```typescript
// src/routes/index.ts
import type { FastifyInstance } from 'fastify';
import { userRoutes } from './user.routes';
import { healthRoutes } from './health.routes';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(userRoutes, { prefix: '/api/v1/users' });
}

// src/routes/user.routes.ts
import type { FastifyInstance } from 'fastify';
import { UserController } from '@/controllers/user.controller';

export async function userRoutes(app: FastifyInstance): Promise<void> {
  const controller = new UserController();

  app.get('/', { schema: { querystring: { page: { type: 'number', default: 1 } } } },
    controller.list.bind(controller));
  app.get('/:id', controller.getById.bind(controller));
  app.post('/', controller.create.bind(controller));
  app.put('/:id', controller.update.bind(controller));
  app.delete('/:id', controller.remove.bind(controller));
}
```

### Step 5: 数据库 ORM（Drizzle）

```bash
pnpm add drizzle-orm pg
pnpm add -D drizzle-kit @types/pg
```

```typescript
// src/repositories/db/schema.ts
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// src/repositories/user.repository.ts
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './db/schema';

export class UserRepository {
  async findById(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ?? null;
  }

  async create(data: { name: string; email: string }) {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }
}
```

### Step 6: Docker 配置

```dockerfile
# Dockerfile
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm tsc --project tsconfig.build.json

FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
services:
  api:
    build: .
    ports: ["3000:3000"]
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/myapi
    depends_on: [db]

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: myapi
    volumes: [pgdata:/var/lib/postgresql/data]
    ports: ["5432:5432"]

volumes:
  pgdata:
```

## 检查清单

- [ ] 项目结构完整（分层清晰）
- [ ] tsconfig strict 模式
- [ ] 路由 + 控制器 + 服务 + 仓储分层
- [ ] 数据库 schema 定义 + migration
- [ ] Docker 多阶段构建
- [ ] 健康检查端点 `/health`
- [ ] 环境变量通过 config 模块管理
- [ ] 错误处理中间件配置