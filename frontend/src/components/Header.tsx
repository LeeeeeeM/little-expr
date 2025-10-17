import React from 'react';

interface HeaderProps {
  selectedExpression: string;
  onExpressionChange: (expression: string) => void;
  onCompile: () => void;
  onStepByStep: () => void;
  onRunAll: () => void;
  onReset: () => void;
  isRunning: boolean;
  isExecuting: boolean;
  isStepByStepMode: boolean;
  currentStep: number;
  totalSteps: number;
  isCompiled: boolean;
}

const PRESET_EXPRESSIONS = [
  { label: '基本运算', value: '1+2*3' },
  { label: '复杂运算', value: '1+2*3**2**2+100' },
  { label: '超复杂运算', value: '1+2*4*3**2**2+100' },
  { label: '括号运算', value: '(1+2)*3' },
  { label: '嵌套括号', value: '((1+2)*3)**2' },
  { label: '除法运算', value: '10/2+3*4' },
  { label: '负数运算', value: '-1+2*3' },
  { label: '右结合指数', value: '2**3**2' },
  { label: '多运算符', value: '2+3*4-5' },
  { label: '复杂指数', value: '2+3**4**2-5*6' },
  { label: '完整测试', value: '2**3**2+4*5-6/2' },
  { label: '括号内负数', value: '1+(-1)' },
];

export const Header: React.FC<HeaderProps> = ({
  selectedExpression,
  onExpressionChange,
  onCompile,
  onStepByStep,
  onRunAll,
  onReset,
  isRunning,
  isExecuting,
  isStepByStepMode,
  currentStep,
  totalSteps,
  isCompiled,
}) => {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <h1 className="text-2xl font-bold text-gray-900">
          🎯 栈式优先级爬坡可视化
          </h1>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label htmlFor="preset-select" className="text-sm font-medium text-gray-700">
                预置表达式:
              </label>
              <select
                id="preset-select"
                value={selectedExpression}
                onChange={(e) => onExpressionChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {PRESET_EXPRESSIONS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}: {preset.value}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onCompile}
            disabled={isRunning || !selectedExpression.trim()}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? '编译中...' : '编译'}
          </button>
          <button
            onClick={onStepByStep}
            disabled={isRunning || isExecuting || !isCompiled}
            className={`px-4 py-2 rounded-md text-white transition-colors ${
              isStepByStepMode
                ? 'bg-orange-600 hover:bg-orange-700'
                : 'bg-blue-600 hover:bg-blue-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isStepByStepMode
              ? (currentStep < totalSteps ? `下一步 (${currentStep}/${totalSteps})` : '完成')
              : '按步执行'
            }
          </button>
          <button
            onClick={onRunAll}
            disabled={isRunning || isExecuting || !isCompiled}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExecuting ? '执行中...' : '一键完成'}
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            重置
          </button>
        </div>
      </div>
    </header>
  );
};
