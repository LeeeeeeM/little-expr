import React from 'react';
import type { ASTNode } from '../parser/types';

interface ASTVisualizerProps {
  ast: ASTNode | null;
  currentStep: number;
  totalSteps: number;
  isAnimating: boolean;
  currentStepDescription?: string;
  pendingNodes?: ASTNode[]; // 等待插入的节点（上方新增区域）
  canvasNodes?: ASTNode[]; // 画布上的节点
}

// 生成节点唯一ID
const generateNodeId = (node: ASTNode, path: string = ''): string => {
  if (node.type === 'Number') {
    return `num_${node.value}_${path}`;
  }
  if (node.type === 'BinaryOp') {
    return `op_${node.operator}_${path}`;
  }
  return `node_${node.type}_${path}`;
};

const ASTNodeComponent: React.FC<{ 
  node: ASTNode; 
  isHighlighted?: boolean;
  isNew?: boolean;
  isAnimating?: boolean;
}> = ({ 
  node, 
  isHighlighted = false,
  isNew = false,
  isAnimating = false
}) => {
  const getNodeColor = () => {
    if (isAnimating) return 'bg-yellow-200 border-yellow-400 animate-pulse';
    if (isNew) return 'bg-orange-200 border-orange-400';
    if (isHighlighted) return 'bg-yellow-200 border-yellow-400';
    if (node.type === 'Number') return 'bg-blue-100 border-blue-300';
    if (node.type === 'BinaryOp') return 'bg-green-100 border-green-300';
    return 'bg-gray-100 border-gray-300';
  };

  const getNodeText = () => {
    if (node.type === 'Number') return node.value?.toString() || '';
    if (node.type === 'BinaryOp') return node.operator || '';
    return node.type;
  };

  return (
    <div className={`p-3 border-2 rounded-lg text-center font-mono text-sm font-semibold transition-all duration-500 ${getNodeColor()}`}>
      {getNodeText()}
    </div>
  );
};

const ASTTree: React.FC<{ 
  node: ASTNode; 
  level: number; 
  isHighlighted?: boolean;
  newNodes?: Set<string>;
  animatingNodes?: Set<string>;
}> = ({ 
  node, 
  level, 
  isHighlighted = false,
  newNodes = new Set(),
  animatingNodes = new Set()
}) => {
  if (!node) return null;

  const nodeId = generateNodeId(node);
  const isNew = newNodes.has(nodeId);
  const isAnimating = animatingNodes.has(nodeId);

  return (
    <div className="flex flex-col items-center">
      <ASTNodeComponent 
        node={node} 
        isHighlighted={isHighlighted}
        isNew={isNew}
        isAnimating={isAnimating}
      />
      
      {(node.left || node.right) && (
        <div className="flex items-center space-x-8 mt-4">
          {node.left && (
            <div className="flex flex-col items-center">
              <div className="w-px h-4 bg-gray-400"></div>
              <ASTTree 
                node={node.left} 
                level={level + 1}
                newNodes={newNodes}
                animatingNodes={animatingNodes}
              />
            </div>
          )}
          {node.right && (
            <div className="flex flex-col items-center">
              <div className="w-px h-4 bg-gray-400"></div>
              <ASTTree 
                node={node.right} 
                level={level + 1}
                newNodes={newNodes}
                animatingNodes={animatingNodes}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ASTVisualizer: React.FC<ASTVisualizerProps> = ({
  ast,
  currentStep,
  totalSteps,
  isAnimating,
  currentStepDescription,
  pendingNodes = [],
  canvasNodes = [],
}) => {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">AST 树可视化</h2>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-600">
            步骤: {currentStep} / {totalSteps}
          </div>
          {isAnimating && (
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-blue-600">执行中...</span>
            </div>
          )}
        </div>
      </div>

      {/* 等待插入的节点区域 */}
      {pendingNodes.length > 0 && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
          <h3 className="text-sm font-medium text-orange-800 mb-2">等待插入的节点:</h3>
          <div className="flex space-x-2">
            {pendingNodes.map((node, index) => (
              <ASTNodeComponent 
                key={index} 
                node={node} 
                isAnimating={true}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col">
        {currentStepDescription && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800 font-medium">
              当前步骤: {currentStepDescription}
            </p>
          </div>
        )}
        
        <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-lg p-6">
          {canvasNodes.length > 0 ? (
            <div className="flex flex-wrap gap-4 justify-center">
              {canvasNodes.map((node, index) => (
                <ASTNodeComponent
                  key={index}
                  node={node}
                  isAnimating={true}
                />
              ))}
            </div>
          ) : ast ? (
            <ASTTree 
              node={ast} 
              level={0}
            />
          ) : (
            <div className="text-center text-gray-500">
              <div className="text-4xl mb-4">🌳</div>
              <p>输入表达式开始解析</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 p-3 bg-gray-50 rounded-md">
        <h3 className="text-sm font-medium text-gray-700 mb-2">图例:</h3>
        <div className="flex items-center space-x-4 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded"></div>
            <span className="text-gray-600">数字</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
            <span className="text-gray-600">运算符</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-orange-200 border border-orange-400 rounded animate-pulse"></div>
            <span className="text-gray-600">等待插入</span>
          </div>
        </div>
      </div>
    </div>
  );
};
