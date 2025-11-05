import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'

// 懒加载页面组件
const App = lazy(() => import('./priority-climbing/App.tsx'))
const CfgPage = lazy(() => import('./ast-cfg/CfgPage.tsx'))
const StackScopePage = lazy(() => import('./stack-scope/StackScopePage.tsx'))
const CodegenVmPage = lazy(() => import('./codegen-vm/CodegenVmPage.tsx'))

// 加载中的占位组件
const LoadingFallback = () => (
  <div className="h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p className="text-gray-600">加载中...</p>
    </div>
  </div>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/ast-cfg" element={<CfgPage />} />
          <Route path="/stack-scope" element={<StackScopePage />} />
          <Route path="/codegen-vm" element={<CodegenVmPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
