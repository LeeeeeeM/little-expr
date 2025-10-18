import React from 'react';

interface ExpressionEditorProps {
  expression: string;
  onExpressionChange: (expression: string) => void;
  isValid: boolean;
  errorMessage?: string;
  successMessage?: string;
}

export const ExpressionEditor: React.FC<ExpressionEditorProps> = ({
  expression,
  onExpressionChange,
  isValid,
  errorMessage,
  successMessage,
}) => {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">表达式编辑器</h2>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${isValid ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-sm text-gray-600">
            {isValid ? '语法正确' : '语法错误'}
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <textarea
          value={expression}
          onChange={(e) => onExpressionChange(e.target.value)}
          placeholder="请输入数学表达式，例如: 1+2*3"
          className={`flex-1 p-4 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-lg ${
            isValid 
              ? 'border-gray-300 focus:border-blue-500' 
              : 'border-red-300 focus:border-red-500'
          }`}
        />
        
        {errorMessage && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{errorMessage}</p>
          </div>
        )}

        {successMessage && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-600">{successMessage}</p>
          </div>
        )}

        <div className="mt-4 p-3 bg-gray-50 rounded-md">
          <h3 className="text-sm font-medium text-gray-700 mb-2">支持的运算符:</h3>
          <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
            <div>+ (加法)</div>
            <div>- (减法)</div>
            <div>* (乘法)</div>
            <div>/ (除法)</div>
            <div>** (指数)</div>
            <div>() (括号)</div>
          </div>
        </div>
      </div>
    </div>
  );
};
