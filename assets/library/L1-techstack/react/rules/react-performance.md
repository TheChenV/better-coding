---
description: React性能规范 - 详见正文
trigger: glob
glob: **/*.tsx, **/*.jsx
---


# React 性能规范

## 概述

性能是用户体验的核心指标。本规范定义了 React 应用在加载速度、渲染效率和资源优化方面的标准。

## 必须遵守

- **必须** 路由级代码分割（`React.lazy` + `Suspense`）
- **必须** 图片使用现代格式（WebP/AVIF）+ 响应式尺寸 + lazy loading
- **必须** 长列表（> 100 项）使用虚拟滚动
- **必须** 首屏 LCP < 2.5s，FID < 100ms，CLS < 0.1（Core Web Vitals）
- **推荐** 第三方脚本延迟加载（analytics、chat widget）
- **推荐** 使用 `React.Profiler` 定位渲染瓶颈

## 禁止事项

- **禁止** 首屏加载超过 200KB JS（gzipped）
- **禁止** 在渲染路径中执行昂贵计算（未 memo 的排序/过滤）
- **禁止** 在列表渲染中创建内联对象/函数（导致子组件全部重渲染）
- **禁止** 未设置 `width`/`height` 的图片（导致 CLS）
- **禁止** 同步导入大型第三方库（如 moment.js、lodash 全量）

## 代码分割

```tsx
// ✅ 必须：路由级懒加载
import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';

const DashboardPage = lazy(() => import('./pages/Dashboard'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const AdminPage = lazy(() => import('./pages/Admin'));

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <DashboardPage />
          </Suspense>
        ),
      },
      {
        path: 'settings',
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <SettingsPage />
          </Suspense>
        ),
      },
    ],
  },
]);

// ✅ 推荐：大型组件按需加载
const HeavyChart = lazy(() => import('./components/HeavyChart'));

function AnalyticsSection() {
  const [showChart, setShowChart] = useState(false);
  return (
    <>
      <button onClick={() => setShowChart(true)}>Show Chart</button>
      {showChart && (
        <Suspense fallback={<ChartSkeleton />}>
          <HeavyChart />
        </Suspense>
      )}
    </>
  );
}
```

## 虚拟列表

```tsx
// ✅ 必须：长列表使用虚拟滚动
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // 每行预估高度
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={items[virtualRow.index].id}
            style={{
              position: 'absolute',
              top: 0,
              transform: `translateY(${virtualRow.start}px)`,
              height: `${virtualRow.size}px`,
            }}
            className="w-full"
          >
            <ItemRow item={items[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

## 图片优化

```tsx
// ✅ 必须：响应式图片 + 现代格式 + lazy loading
function OptimizedImage({ src, alt, width, height }: ImageProps) {
  return (
    <picture>
      <source srcSet={`${src}.avif`} type="image/avif" />
      <source srcSet={`${src}.webp`} type="image/webp" />
      <img
        src={`${src}.jpg`}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className="object-cover"
      />
    </picture>
  );
}

// ✅ 推荐：Next.js / Vite 图片组件
// next/image 自动处理格式转换、尺寸优化、占位符
```

## Bundle 分析与优化

```typescript
// vite.config.ts - Bundle 优化配置
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({ open: true, gzipSize: true }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
});
```

## 渲染优化

```tsx
// ❌ 错误：内联对象导致子组件重渲染
function Parent({ items }: { items: Item[] }) {
  return items.map(item => (
    <Child key={item.id} style={{ padding: 8 }} onSelect={() => handle(item.id)} />
  ));
}

// ✅ 正确：稳定引用
const childStyle = { padding: 8 } as const;

function Parent({ items }: { items: Item[] }) {
  const handleSelect = useCallback((id: string) => { /* ... */ }, []);
  return items.map(item => (
    <MemoChild key={item.id} style={childStyle} onSelect={handleSelect} item={item} />
  ));
}

const MemoChild = React.memo(Child);
```

## 性能预算

| 指标 | 预算 | 测量工具 |
|------|------|----------|
| FCP (First Contentful Paint) | < 1.8s | Lighthouse |
| LCP (Largest Contentful Paint) | < 2.5s | Lighthouse |
| CLS (Cumulative Layout Shift) | < 0.1 | Lighthouse |
| TTI (Time to Interactive) | < 3.5s | Lighthouse |
| 首屏 JS (gzipped) | < 200KB | bundlesize |
| 单 chunk (raw) | < 500KB | Vite warning |

## 检查清单

- [ ] 路由级代码分割
- [ ] 图片优化（WebP + lazy + 尺寸）
- [ ] 长列表虚拟滚动
- [ ] Core Web Vitals 达标
- [ ] Bundle 分析无异常大 chunk
- [ ] 无渲染路径中的昂贵计算
- [ ] 第三方脚本延迟加载