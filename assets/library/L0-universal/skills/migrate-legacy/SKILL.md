---
name: migrate-legacy
description: 遗留代码迁移（编排层）。接触即迁移、新老并存配置、逐模块小步迁移、特征测试先行、每步可回滚；遗留系统测绘与依赖影响面分析调内置 architecture-visualization:legacy-system-visualizer / dependency-impact-analyzer，本 skill 不复刻这两份清单。触发方式：/migrate-legacy。来源：Harness component library。
---


# 遗留代码迁移

## 触发条件

- 用户输入 `/migrate-legacy` 命令
- 需要修改遗留代码中的某个功能（接触即迁移）
- 用户要求将旧模块迁移到新架构/新框架
- 技术债务清理计划中的迁移任务
- 依赖升级导致必须迁移

## 核心原则

> **接触即迁移（Boy Scout Rule）：** 每次接触遗留代码时，让它比你来时更好。不要求一次性全部重写，而是通过持续的小步迁移逐步现代化。

> **永远不要在没有测试保护的情况下重构遗留代码。**

## 与内置架构能力的分工（编排层）

本 skill 是**编排层**：遗留系统的**测绘与影响面分析**交给 Qoder 内置插件（用 Skill 工具按限定名触发），本 skill 只保留迁移特有的纪律——并存配置、逐模块小步迁移、特征测试先行、每步可回滚。

| 环节 | 交给内置（插件全名:目录名） | 本 skill 判什么 |
|------|--------------------------|----------------|
| 遗留系统理解与建模（证据稀疏时的所有权、隐藏依赖、批处理、数据耦合测绘） | `architecture-visualization:legacy-system-visualizer`（目录名 `legacy-system-visualizer`） | 迁移触发原因与范围边界（Step 1.1/1.2）与"单次 ≤500 行、每次可独立回滚"的范围控制 |
| 依赖与变更影响面（耦合了谁、哪些模块/服务/数据存储/部署被牵连、环与分层违例） | `architecture-visualization:dependency-impact-analyzer`（目录名 `dependency-impact-analyzer`） | Step 1.3 的风险等级判定与 Step 2 新老并存开关怎么配 |

🔴 **这些是内置能力，不要复刻**：Step 1.2 的 `find`/`grep` 只是内置测绘不可用时的**兜底**；能调内置就不要手写一遍影响面清单，也不要把内置输出的依赖图誊进迁移方案。内置插件未安装时才走兜底命令，并在范围评估块标注"未用内置测绘能力"。

## 执行步骤

### Step 1: 识别迁移范围

明确本次迁移的边界和目标：

**1.1 确定触发原因**
- 为什么现在要迁移这段代码？（Bug修复/新功能/技术债）
- 迁移的紧迫程度？（阻塞性/计划性）

**1.2 划定范围**（优先调内置 `architecture-visualization:dependency-impact-analyzer`；下面的命令是它不可用时的兜底）
```bash
# 识别目标文件/模块（按项目技术栈调整命令）
# 【__已预填：文件查找命令，请核对__】
# 例如：
# - find . -path "*/legacy/*" -name "*.ts"
# - grep -r "require.*legacy-module" src/ --include="*.ts" -l
# - 或根据导入关系追踪影响范围
```

**1.3 评估影响**
```markdown
## 迁移范围评估
- 目标模块: <模块名/路径>
- 代码行数: ~N 行
- 被引用次数: M 处
- 依赖方: <列出依赖此模块的其他模块>
- 测试覆盖: 有/无（覆盖率 X%）
- 风险等级: 高/中/低
```

**范围控制原则：**
- 单次迁移不超过 500 行变更
- 如果模块过大，拆分为多次迁移
- 每次迁移有独立的验证和回滚能力

### Step 2: 新老并存配置

设计迁移期间的共存方案：

**2.1 特性开关（Feature Flag）**
```typescript
// 示例（以项目技术栈为准）
// 通过配置控制使用新/旧实现
import { useNewOrderService } from '@/config/feature-flags';

const orderService = useNewOrderService
  ? new NewOrderService()    // 新实现
  : new LegacyOrderService(); // 旧实现
```

**2.2 适配器模式（Adapter）**
```typescript
// 示例（以项目技术栈为准）
// 新实现适配旧接口，确保调用方无感知
export class OrderServiceAdapter implements ILegacyOrderService {
  private newService: NewOrderService;

  constructor() {
    this.newService = new NewOrderService();
  }

  // 旧接口方法 → 委托给新实现
  async getOrder(id: string): Promise<LegacyOrderFormat> {
    const newOrder = await this.newService.findById(id);
    return this.convertToLegacyFormat(newOrder);
  }
}
```

**2.3 路由切换（渐进式流量迁移）**
```typescript
// 示例（以项目技术栈为准）
// 按百分比切换流量
router.use('/orders', (req, res, next) => {
  if (Math.random() < migrationProgress) {  // 0.0 → 1.0
    return newOrderHandler(req, res, next);
  }
  return legacyOrderHandler(req, res, next);
});
```

### Step 3: 逐模块迁移

按照依赖顺序逐模块实施迁移：

**3.1 迁移顺序（由内向外）**
1. 先迁移无外部依赖的核心逻辑
2. 再迁移有内部依赖的中间层
3. 最后迁移对外接口层

**3.2 每个模块的迁移步骤**
```
对每个模块:
  1. 补充特征测试（Characterization Test）→ 记录当前行为
  2. 创建新实现（新文件/新目录）
  3. 运行特征测试验证新实现行为一致
  4. 切换引用（通过 Feature Flag 或 Adapter）
  5. 验证通过后标记旧代码为 deprecated
```

**3.3 特征测试（关键！）**
```typescript
// 示例（以项目技术栈为准）
// 在修改前，先为旧代码编写测试记录其行为
describe('LegacyOrderService (characterization)', () => {
  it('计算折扣：满100减10', () => {
    const result = legacyService.calculateDiscount(150);
    expect(result).toBe(10);  // 记录当前行为，不管对错
  });

  it('计算折扣：不满100无折扣', () => {
    const result = legacyService.calculateDiscount(80);
    expect(result).toBe(0);
  });
});
```

### Step 4: 编译验证

每次迁移后立即验证：

```bash
# 按项目技术栈执行（以下命令需根据项目实际配置）
# 【__已预填：构建命令，请核对__】
# 例如：
# - Node.js: npm run build
# - Java: mvn clean compile
# - Go: go build ./...
# - Python: python -m py_compile src/**/*.py

# 【__已预填：测试命令，请核对__】
# 运行全量测试（包括特征测试）
# 例如：
# - Node.js: npm test
# - Java: mvn test
# - Go: go test ./...
# - Python: pytest

# 【__已预填：Lint 命令，请核对__】
# Lint 检查
# 例如：
# - Node.js: npm run lint
# - Java: mvn checkstyle:check
# - Go: golangci-lint run
# - Python: ruff check .

# 如果有集成测试
# 【__已预填：集成测试命令，请核对__】
```

**验证标准：**
- 编译零错误
- 所有特征测试通过（行为一致）
- 无新增 Warning
- 性能无显著退化

### Step 5: 标记已迁移

对已完成迁移的代码进行标记：

**5.1 标记旧代码**
```typescript
// 示例（以项目技术栈为准）
/**
 * @deprecated 已迁移至 NewOrderService，将在 v2.0 移除
 * @see src/services/order/new-order.service.ts
 * @migration-date 2024-01-15
 */
export class LegacyOrderService {
  // ...
}
```

**5.2 更新迁移追踪表**
```markdown
## 迁移进度追踪

| 模块 | 状态 | 迁移日期 | 新位置 | 旧代码删除日期 |
|------|------|----------|--------|----------------|
| OrderService | ✅ 已迁移 | 2024-01-15 | src/services/order/ | 计划 v2.0 |
| UserService | 🔄 进行中 | - | - | - |
| PaymentService | ⏳ 待迁移 | - | - | - |
```

**5.3 设置清理提醒**
- 创建 Issue 跟踪旧代码删除时间
- 在 CI 中添加 deprecated 代码检测
- 设定最终清理 deadline

### Step 6: 更新 AGENTS.md

更新项目文档以反映架构变化：

```markdown
## 项目结构变更

### 已迁移模块
- `src/services/order/` → 新订单服务（替代 `src/legacy/order/`）
- 使用新的 `OrderService` 而非 `LegacyOrderService`

### 迁移中模块
- `src/legacy/user/` → 正在迁移，修改时请遵循新规范

### 编码规范（新代码）
- 使用依赖注入
- 所有方法必须有类型注解
- 错误处理使用 AppError 体系
```

## 输出物

- 迁移后的新代码（符合当前规范）
- 特征测试（保护行为一致性）
- 适配器/Feature Flag（并存方案）
- 迁移进度追踪表
- 更新后的项目文档

## 适用条件

- 存在技术债务的长期维护项目
- 框架/语言版本升级（如 Angular JS → Angular）
- 架构演进（单体 → 微服务）
- 编码规范升级后的存量代码改造
- 任何"需要修改旧代码"的场景

## 失败处理

| 失败场景 | 处理方式 |
|----------|----------|
| 旧代码无文档、逻辑不清 | 先通过调试/日志理解行为，编写特征测试固化理解 |
| 迁移后行为不一致 | 以特征测试为准，分析差异原因（旧Bug还是理解偏差） |
| 影响范围超出预期 | 缩小本次迁移范围，只迁移必须修改的部分 |
| 新旧并存导致复杂度爆炸 | 设定明确的并存期限，到期强制切换 |
| 迁移中途需求变更 | 完成当前模块迁移后再处理新需求，避免半成品 |
| 性能退化 | 对比新旧实现的 Benchmark，必要时优化新实现 |