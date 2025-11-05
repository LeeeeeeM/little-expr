import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNavigation } from '../contexts/NavigationContext';

interface MenuItem {
  path: string;
  label: string;
}

// 统一定义所有菜单项
const menuItems: MenuItem[] = [
  { path: '/', label: '栈式优先级爬升可视化' },
  { path: '/ast-cfg', label: 'AST CFG 测试页面' },
  { path: '/stack-scope', label: '栈布局可视化' },
  { path: '/codegen-vm', label: '代码生成与虚拟机' },
];

export const Menu: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { setIsNavigating } = useNavigation();

  // 根据当前路径更新 document.title
  useEffect(() => {
    const currentItem = menuItems.find(item => item.path === location.pathname);
    if (currentItem) {
      document.title = currentItem.label;
    } else {
      document.title = 'BNF 编译器工具';
    }
  }, [location.pathname]);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 bg-blue-600 text-white p-2 rounded-md shadow-lg hover:bg-blue-700 transition-colors"
        aria-label="菜单"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* 遮罩层 */}
          <div
            className="fixed inset-0 bg-black bg-opacity-30 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* 菜单列表 */}
          <div className="fixed top-20 left-4 z-50 bg-white rounded-md shadow-xl border border-gray-200 min-w-[200px] overflow-hidden">
            <div className="py-2">
              {menuItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => {
                    if (item.path !== location.pathname) {
                      // 点击时立即显示 loading
                      setIsNavigating(true)
                    }
                    setIsOpen(false)
                    navigate(item.path)
                  }}
                  className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

