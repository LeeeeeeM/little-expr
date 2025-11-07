import React, { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import './index.css'
import { NavigationProvider, useNavigation } from './contexts/NavigationContext'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { Analytics } from '@vercel/analytics/react'

// 配置 monaco-editor 从本地加载，而不是从 CDN
loader.config({ monaco })

// 懒加载页面组件
const App = lazy(() => import('./priority-climbing/App.tsx'))
const CfgPage = lazy(() => import('./ast-cfg/CfgPage.tsx'))
const StackScopePage = lazy(() => import('./stack-scope/StackScopePage.tsx'))
const CodegenVmPage = lazy(() => import('./codegen-vm/CodegenVmPage.tsx'))
const EntryCallPage = lazy(() => import('./entry-call/EntryCallPage.tsx'))
const LinkerPage = lazy(() => import('./linker/LinkerPage.tsx'))

// 加载中的占位组件
const LoadingFallback = () => (
  <div className="h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p className="text-gray-600">加载中...</p>
    </div>
  </div>
)

// 包装组件，为每个路由提供独立的 Suspense
const LazyRoute = ({ component: Component }: { component: React.LazyExoticComponent<React.ComponentType<any>> }) => (
  <Suspense fallback={<LoadingFallback />}>
    <Component />
  </Suspense>
)

// 路由容器组件，监听路由变化并管理 loading 状态
const RouterContent = () => {
  const location = useLocation()
  const { isNavigating, setIsNavigating } = useNavigation()
  const prevPathnameRef = React.useRef(location.pathname)

  // 监听路由变化，当路由变化时隐藏 loading（让 Suspense fallback 接管）
  React.useLayoutEffect(() => {
    if (location.pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = location.pathname
      // 路由已经变化，让 Suspense fallback 接管显示
      // 如果组件已缓存，Suspense 不会显示 fallback，需要手动隐藏
      const id = requestAnimationFrame(() => {
        setIsNavigating(false)
      })
      return () => cancelAnimationFrame(id)
    }
  }, [location.pathname, setIsNavigating])

  return (
    <>
      {isNavigating && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white bg-opacity-70">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">加载中...</p>
          </div>
        </div>
      )}
      <Routes>
        <Route path="/" element={<LazyRoute component={App} />} />
        <Route path="/ast-cfg" element={<LazyRoute component={CfgPage} />} />
        <Route path="/stack-scope" element={<LazyRoute component={StackScopePage} />} />
        <Route path="/codegen-vm" element={<LazyRoute component={CodegenVmPage} />} />
        <Route path="/entry-call" element={<LazyRoute component={EntryCallPage} />} />
        <Route path="/linker" element={<LazyRoute component={LinkerPage} />} />
      </Routes>
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <NavigationProvider>
        <RouterContent />
        <Analytics />
      </NavigationProvider>
    </BrowserRouter>
  </StrictMode>,
)
