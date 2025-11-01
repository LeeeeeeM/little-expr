import React from 'react';
import { Link } from 'react-router-dom';

const CfgPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">CFG 路由测试页面</h1>
        <p className="text-gray-600 mb-4">
          这是一个测试路由页面，用于验证 Browser 路由是否正常工作。
        </p>
        <div className="space-y-2">
          <p className="text-sm text-gray-500">
            <strong>路由路径：</strong>/cfg
          </p>
          <p className="text-sm text-gray-500">
            <strong>功能：</strong>验证 Vercel 部署时的 Browser 路由支持
          </p>
        </div>
        <div className="mt-6 pt-6 border-t border-gray-200">
          <Link
            to="/"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            ← 返回首页
          </Link>
          <div className="mt-4">
            <p className="text-sm text-gray-400">
              💡 如果你看到这个页面，说明 Browser 路由已经成功配置！
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CfgPage;

