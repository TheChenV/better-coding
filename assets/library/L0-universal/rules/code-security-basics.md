---
description: 代码安全基础 - OWASP Top 10逐项检查，禁止硬编码密钥/密码/Token，所有输入必须校验和转义，禁止已知漏洞依赖（涉及输入校验/认证授权/支付/密钥处理/新增依赖等安全敏感变更时触发）
trigger: model_decision
---

# 代码安全基础规范

> 来源：Addy Osmani security-and-hardening + OWASP Top 10 + Harness 课程第 2 课。
> **本规则为 final: true，不可覆盖。**

## 绝对禁止（任何场景、任何语言）

1. **禁止硬编码密钥/密码/Token/API Key** — 用环境变量或密钥管理服务
2. **禁止将 .env/credentials 提交到版本控制** — 加入 .gitignore
3. **禁止在日志中输出敏感信息** — 密码、身份证号、银行卡号
4. **禁止使用已知有 CVE 漏洞的依赖版本** — 定期运行 `npm audit` / `pip-audit`
5. **禁止拼接 SQL** — 一律用参数化查询/ORM
6. **禁止信任客户端输入** — 所有输入必须服务端校验和转义

## OWASP Top 10 快速检查

| 风险 | 必须做到 |
|------|---------|
| 注入 | 参数化查询、输出编码 |
| 失效的认证 | 密码安全哈希（bcrypt/argon2）、会话管理 |
| 敏感数据暴露 | 传输加密（TLS）、存储加密、最小权限 |
| XML 外部实体 | 禁用 DTD、使用安全解析器 |
| 失效的访问控制 | 服务端权限检查、CORS 配置 |
| 安全配置错误 | 关闭调试模式、移除默认凭证 |
| XSS | 输出编码、CSP 头 |
| 不安全的反序列化 | 使用白名单、不反序列化不可信数据 |
| 已知漏洞组件 | 定期更新依赖、运行安全扫描 |
| 日志不足 | 记录安全事件、不记录敏感数据 |

## 文件上传安全

- 校验文件类型（MIME + 扩展名双重校验）
- 限制文件大小
- 存储路径不可由用户控制
- 上传目录禁止执行权限

## 密钥管理细则（v4.0.0 并入自 no-hardcoded-secrets）

以下信息**任何情况、任何语言**都不得出现在代码中：密码、Token（JWT Secret/OAuth/Session Secret）、API Key、私钥（SSH/TLS/签名）、含密码的连接字符串。

### 正确做法

| 场景 | 正确方式 |
|------|---------|
| 开发环境 | 环境变量（.env 文件，加入 .gitignore） |
| 生产环境 | 密钥管理服务（Vault / AWS Secrets Manager / 阿里云 KMS） |
| CI/CD | Secret 变量（GitHub Secrets / GitLab CI Variables） |
| 配置文件 | 环境变量引用（`${DB_PASSWORD}`），不写实际值 |

### 硬编码密钥扫描

```bash
grep -rn "password\s*=\s*['\"]" --include="*.py" --include="*.ts" --include="*.java"
grep -rn "api[_-]?key\s*=\s*['\"]" --include="*.py" --include="*.ts" --include="*.java"
grep -rn "secret\s*=\s*['\"]" --include="*.py" --include="*.ts" --include="*.java"
grep -rn "BEGIN.*PRIVATE KEY" --include="*.pem" --include="*.key"
```

### .gitignore 必须包含

```
.env
.env.local
.env.*.local
*.pem
*.key
credentials.json
```

### 密钥违规处理

- 代码中发现硬编码密钥 → P0 问题，立即修复
- Git 历史中泄露的密钥 → 必须轮换（rotate），不仅仅是删除代码
