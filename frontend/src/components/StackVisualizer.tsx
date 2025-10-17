import React, { useRef, useEffect } from 'react';
import type { StackStep, StackToken, ASTNode as StackASTNode } from '../parser/stackBasedParser';
import type { ASTNode } from '../parser/types';
import { ASTTreeVisualizer } from './ASTTreeVisualizer';

interface StackVisualizerProps {
  steps: StackStep[];
  currentStep: number;
  isAnimating: boolean;
  currentStepDescription?: string;
}

const StackTokenComponent: React.FC<{ 
  token: StackToken; 
  isHighlighted?: boolean;
  isAnimating?: boolean;
}> = ({ 
  token, 
  isHighlighted = false,
  isAnimating = false
}) => {
  const getTokenColor = () => {
    if (isAnimating) return 'bg-yellow-200 border-yellow-400 animate-pulse';
    if (isHighlighted) return 'bg-yellow-200 border-yellow-400';
    if (token.type === 'NUMBER') return 'bg-blue-100 border-blue-300';
    if (token.type === 'POWER') return 'bg-red-100 border-red-300';
    if (token.type === 'MUL' || token.type === 'DIV') return 'bg-green-100 border-green-300';
    if (token.type === 'ADD' || token.type === 'SUB') return 'bg-purple-100 border-purple-300';
    if (token.type === 'LEFTPAREN' || token.type === 'RIGHTPAREN') return 'bg-gray-100 border-gray-300';
    return 'bg-gray-100 border-gray-300';
  };

  const getTokenText = () => {
    if (token.type === 'NUMBER') return token.value?.toString() || '';
    if (token.type === 'ADD') return '+';
    if (token.type === 'SUB') return '-';
    if (token.type === 'MUL') return '*';
    if (token.type === 'DIV') return '/';
    if (token.type === 'POWER') return '**';
    if (token.type === 'LEFTPAREN') return '(';
    if (token.type === 'RIGHTPAREN') return ')';
    if (token.type === 'END') return 'END';
    return token.type;
  };

  const getTokenInfo = () => {
    if (token.type === 'NUMBER') return `数字: ${token.value}`;
    return `优先级: ${token.precedence}${token.isRightAssociative ? ' (右结合)' : ' (左结合)'}`;
  };

  return (
    <div className={`p-1 border-2 rounded text-center font-mono text-sm font-semibold transition-all duration-500 min-w-[50px] ${getTokenColor()}`}>
      <div className="text-sm">{getTokenText()}</div>
      <div className="text-xs text-gray-600">{getTokenInfo()}</div>
    </div>
  );
};

const StackComponent: React.FC<{
  title: string;
  items: (StackToken | number | StackASTNode)[];
  isOperatorStack?: boolean;
  isHighlighted?: boolean;
}> = ({ title, items, isOperatorStack = false, isHighlighted = false }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // 自动滚动到最新元素
  useEffect(() => {
    if (scrollContainerRef.current && items.length > 0) {
      const container = scrollContainerRef.current;
      container.scrollLeft = container.scrollWidth;
    }
  }, [items]);
  
  const renderOperandItem = (item: number | StackASTNode) => {
    if (typeof item === 'number') {
      // 数字
      return (
        <div className="p-2 border-2 rounded text-center font-mono text-sm font-semibold bg-blue-100 border-blue-300 min-w-[50px]">
          <div className="text-sm">{item}</div>
        </div>
      );
    } else {
      // AST节点
      return (
        <div className="p-2 border-2 rounded text-center font-mono text-sm font-semibold bg-green-100 border-green-300 min-w-[80px]">
          <div className="text-xs">{getASTDescription(item)}</div>
        </div>
      );
    }
  };

  const getASTDescription = (node: StackASTNode): string => {
    if (node.type === 'Number') {
      return node.value?.toString() || '0';
    } else if (node.type === 'BinaryOp') {
      return `${getASTDescription(node.left!)} ${node.operator} ${getASTDescription(node.right!)}`;
    }
    return '?';
  };

  return (
    <div className={`border-2 border-gray-300 rounded-lg bg-white shadow-sm ${isHighlighted ? 'ring-2 ring-yellow-400' : ''}`}>
      {/* 标题行 */}
      <div className="text-sm font-semibold text-gray-800 bg-gray-100 py-2 px-3 rounded-t-lg">
        {title}
      </div>
      {/* 栈内容行 - 可滚动 */}
      <div 
        ref={scrollContainerRef}
        className="flex items-center space-x-2 p-3 bg-gray-50 rounded-b-lg min-h-[80px] max-h-[120px] overflow-x-auto overflow-y-hidden scroll-smooth"
      >
        {items.length === 0 ? (
          <div className="text-gray-400 text-sm">空栈</div>
        ) : (
          items.map((item, index) => (
            <div key={index} className="flex-shrink-0">
              {isOperatorStack ? (
                <StackTokenComponent token={item as StackToken} />
              ) : (
                renderOperandItem(item as number | StackASTNode)
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const StackVisualizer: React.FC<StackVisualizerProps> = ({
  steps,
  currentStep,
  isAnimating,
  currentStepDescription,
}) => {
  const currentStepData = steps[currentStep - 1];
  
  // 根据当前步骤生成AST树状结构
  const generateASTFromStack = (stepData: StackStep | undefined): ASTNode | null => {
    if (!stepData) return null;
    
    // 优先使用最终AST（解析完成时）
    if (stepData.finalAST) {
      return stepData.finalAST;
    }
    
    // 如果当前步骤有生成的AST节点，直接使用
    if (stepData.generatedAST) {
      return stepData.generatedAST;
    }
    
    // 如果操作数栈中有AST节点，使用最后一个
    const astNodes = stepData.operandStack.filter(item => typeof item === 'object' && item.type);
    if (astNodes.length > 0) {
      return astNodes[astNodes.length - 1] as ASTNode;
    }
    
    return null;
  };
  
  const currentAST = generateASTFromStack(currentStepData);
  
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">🎯 栈式优先级爬坡可视化</h2>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-600">
            步骤: {currentStep} / {steps.length}
          </div>
          {isAnimating && (
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-blue-600">执行中...</span>
            </div>
          )}
        </div>
      </div>

      {/* 当前步骤描述 */}
      {currentStepDescription && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-800 font-medium">
            当前步骤: {currentStepDescription}
          </p>
        </div>
      )}

      {/* 双栈可视化区域 */}
      <div className="flex flex-col space-y-4">
        {/* 操作符栈（单调递增栈） */}
        <div className="w-full">
          <StackComponent
            title="操作符栈（单调递增栈）"
            items={currentStepData?.operatorStack || []}
            isOperatorStack={true}
            isHighlighted={currentStepData?.description.includes('操作符')}
          />
        </div>

        {/* 操作数栈 */}
        <div className="w-full">
          <StackComponent
            title="操作数栈"
            items={currentStepData?.operandStack || []}
            isOperatorStack={false}
            isHighlighted={currentStepData?.description.includes('操作数')}
          />
        </div>
      </div>

      {/* 画布区域 */}
      <div className="mt-4 flex-1 bg-white border-2 border-gray-300 rounded-lg p-4 min-h-0 overflow-hidden">
        {/* G6 树状图显示区域 */}
        {currentAST ? (
          <div className="h-full flex flex-col">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex-shrink-0">AST 树状结构</h3>
            <div className="flex-1 min-h-0 border border-gray-200 rounded-lg">
              <ASTTreeVisualizer
                ast={currentAST}
                pendingNodes={[]}
                canvasNodes={[]}
                isAnimating={isAnimating}
              />
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-500 h-full flex items-center justify-center">
            <div>
              <div className="text-2xl mb-2">🎨</div>
              <p className="text-sm">画布区域</p>
              <p className="text-xs text-gray-400 mt-1">根据栈状态生成 AST 树状结构</p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
