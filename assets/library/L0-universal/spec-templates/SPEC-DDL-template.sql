-- ============================================================================
-- SPEC-DDL 数据库设计脚本
-- 文档编号: SPEC-DDL-[项目编号]-[序号]
-- 版本: v0.1
-- 状态: 草稿 | 评审中 | 已批准（三值由该步自检清单驱动：清单全过即写"已批准"，由产出方落盘时直接写，不等用户口令）
-- 作者: [姓名]
-- 上游文档: ARCH-[编号], SPEC-BE-[编号]
-- 创建日期: [YYYY-MM-DD]
-- 最后更新: [YYYY-MM-DD]
-- ============================================================================

-- ============================================================================
-- 1. 通用约定
-- ============================================================================

-- 字符集: UTF-8 (utf8mb4 for MySQL)
-- 主键策略: [雪花算法 / 自增ID / UUID]
-- 时间字段: DATETIME / TIMESTAMP WITH TIME ZONE
-- 逻辑删除: deleted TINYINT NOT NULL DEFAULT 0 (0=正常, 1=已删除)
-- 审计字段: created_at, updated_at, created_by, updated_by

-- 索引策略约定:
-- 1. 所有表必须建立主键索引（默认）
-- 2. 外键列必须建立索引（避免全表扫描）
-- 3. 高频查询条件列建立 B-Tree 索引
-- 4. JSON 字段查询使用 GIN 索引（PostgreSQL）
-- 5. 唯一约束自动建立唯一索引
-- 6. 组合索引遵循最左前缀原则，列顺序 = 等值列 > 排序列 > 范围列
-- 7. 索引命名规范: idx_[table]_[column] / uk_[table]_[column]

-- ============================================================================
-- 2. 表结构定义
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 表名: [table_name]
-- 说明: [表用途描述]
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS [table_name] (
    -- 主键
    id BIGINT PRIMARY KEY [AUTO_INCREMENT],
    
    -- 业务字段
    -- [field_name] [TYPE] [CONSTRAINTS] COMMENT '[字段说明]',
    
    -- 状态字段（如有）
    -- status VARCHAR(20) NOT NULL DEFAULT '[default_status]' COMMENT '状态: [状态枚举说明]',
    
    -- 逻辑删除
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除: 0=正常, 1=已删除',
    
    -- 审计字段
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    created_by BIGINT COMMENT '创建人ID',
    updated_by BIGINT COMMENT '更新人ID'
) COMMENT '[表说明]';

-- 索引
-- CREATE INDEX idx_[table]_[field] ON [table_name]([field_name]);
-- CREATE UNIQUE INDEX uk_[table]_[field] ON [table_name]([field_name]);

-- ============================================================================
-- 3. 数据迁移与版本管理
-- ============================================================================

-- 迁移工具: [Alembic (Python) / Flyway (Java) / golang-migrate (Go)]
-- 迁移目录: migrations/
-- 命名规范: {version}_{description}.{ext}
-- 回滚策略: 每个迁移必须提供 down 脚本，支持版本回滚

-- 示例迁移文件结构:
-- migrations/
--   0001_create_user_table.up.sql
--   0001_create_user_table.down.sql
--   0002_add_user_status_column.up.sql
--   0002_add_user_status_column.down.sql

-- ============================================================================
-- 4. 示例表（用户表）
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 表名: user
-- 说明: 用户基本信息表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    
    -- 业务字段
    username VARCHAR(50) NOT NULL COMMENT '用户名',
    email VARCHAR(100) NOT NULL COMMENT '邮箱',
    password_hash VARCHAR(128) NOT NULL COMMENT '密码哈希',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '状态: ACTIVE/INACTIVE/LOCKED',
    
    -- 逻辑删除
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除: 0=正常, 1=已删除',
    
    -- 审计字段
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    created_by BIGINT COMMENT '创建人ID',
    updated_by BIGINT COMMENT '更新人ID'
) COMMENT '用户基本信息表';

-- 索引
CREATE UNIQUE INDEX uk_user_username ON user(username);
CREATE UNIQUE INDEX uk_user_email ON user(email);
CREATE INDEX idx_user_status ON user(status);
CREATE INDEX idx_user_created_at ON user(created_at);

-- ============================================================================
-- 5. 索引清单与验证
-- ============================================================================

-- 索引验证 SQL:
-- PostgreSQL:
--   SELECT tablename, indexname, indexdef FROM pg_indexes WHERE tablename = '[table_name]';
-- MySQL:
--   SHOW INDEX FROM [table_name];

-- 索引使用分析:
-- PostgreSQL: EXPLAIN ANALYZE SELECT ... WHERE [indexed_column] = ...;
-- MySQL: EXPLAIN SELECT ... WHERE [indexed_column] = ...;

-- ============================================================================
-- 6. 变更日志
-- ============================================================================

-- 版本 | 日期 | 变更内容 | 作者
-- v0.1 | [YYYY-MM-DD] | 初始版本 | [姓名]

