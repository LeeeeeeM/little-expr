// AST 可视化组件（使用 React Flow）

import React, { useMemo, useEffect } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import type { Program } from '../lib/types';

interface AstVisualizerProps {
  ast: Program | null;
}

// 获取 AST 节点的显示标签
function getNodeLabel(node: any): string {
  if (!node) return 'unknown';
  
  switch (node.type) {
    case 'Program':
      return 'Program';
    case 'FunctionDeclaration':
      return `function ${node.name || 'unknown'}()`;
    case 'VariableDeclaration':
      return `int ${node.name}${node.initializer ? ' = ...' : ''}`;
    case 'LetDeclaration':
      return `let ${node.name}${node.initializer ? ' = ...' : ''}`;
    case 'ReturnStatement':
      return node.value ? 'return ...' : 'return';
    case 'IfStatement':
      return 'if (...)';
    case 'WhileStatement':
      return 'while (...)';
    case 'ForStatement':
      return 'for (...)';
    case 'BlockStatement':
      return '{ ... }';
    case 'ExpressionStatement':
      return 'expr;';
    case 'AssignmentStatement':
      return `${node.target?.name || 'x'} = ...`;
    case 'BinaryExpression':
      return `${node.operator || '?'}`;
    case 'UnaryExpression':
      return `${node.operator || '?'}`;
    case 'Identifier':
      return node.name || 'id';
    case 'NumberLiteral':
      return String(node.value ?? '0');
    case 'FunctionCall':
      return `${node.callee?.name || 'func'}()`;
    case 'ParenthesizedExpression':
      return '( ... )';
    case 'BreakStatement':
      return 'break';
    case 'ContinueStatement':
      return 'continue';
    case 'StartCheckPoint':
      return '{ // checkpoint';
    case 'EndCheckPoint':
      return '} // checkpoint';
    default:
      return node.type || 'unknown';
  }
}

// 将 AST 转换为 React Flow 节点和边
function astToFlowElements(ast: Program | null): { nodes: Node[]; edges: Edge[] } {
  if (!ast) {
    return { nodes: [], edges: [] };
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let nodeIdCounter = 0;

  // 递归遍历 AST 节点
  function traverseNode(node: any, parentId: string | null = null): string {
    if (!node) return '';
    
    // 跳过空节点
    if (typeof node !== 'object') return '';

    const nodeId = `ast_node_${nodeIdCounter++}`;
    const label = getNodeLabel(node);
    
    nodes.push({
      id: nodeId,
      type: 'default',
      position: { x: 0, y: 0 }, // 初始位置，会被 Dagre 计算
      data: {
        label: (
          <div className="px-3 py-2 text-xs font-mono text-center">
            <div className="font-semibold text-gray-800">{label}</div>
            <div className="text-[9px] text-gray-500 mt-1">{node.type}</div>
          </div>
        ),
      },
      style: {
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        width: 150,
        minHeight: 60,
        height: 'auto',
      },
    });

    // 如果有父节点，添加边
    if (parentId) {
      edges.push({
        id: `edge_${parentId}_${nodeId}`,
        source: parentId,
        target: nodeId,
        type: 'default',
        markerEnd: {
          type: 'arrowclosed',
          color: '#64748b',
        },
      });
    }

    // 递归处理子节点
    if (node.statements && Array.isArray(node.statements)) {
      for (const stmt of node.statements) {
        traverseNode(stmt, nodeId);
      }
    }
    
    if (node.expression) {
      traverseNode(node.expression, nodeId);
    }
    
    if (node.condition) {
      traverseNode(node.condition, nodeId);
    }
    
    if (node.thenBranch) {
      traverseNode(node.thenBranch, nodeId);
    }
    
    if (node.elseBranch) {
      traverseNode(node.elseBranch, nodeId);
    }
    
    if (node.body) {
      traverseNode(node.body, nodeId);
    }
    
    if (node.init) {
      traverseNode(node.init, nodeId);
    }
    
    if (node.update) {
      traverseNode(node.update, nodeId);
    }
    
    if (node.value) {
      traverseNode(node.value, nodeId);
    }
    
    if (node.target) {
      traverseNode(node.target, nodeId);
    }
    
    if (node.left) {
      traverseNode(node.left, nodeId);
    }
    
    if (node.right) {
      traverseNode(node.right, nodeId);
    }
    
    if (node.operand) {
      traverseNode(node.operand, nodeId);
    }
    
    if (node.callee) {
      traverseNode(node.callee, nodeId);
    }
    
    if (node.arguments && Array.isArray(node.arguments)) {
      for (const arg of node.arguments) {
        traverseNode(arg, nodeId);
      }
    }
    
    if (node.initializer) {
      traverseNode(node.initializer, nodeId);
    }

    return nodeId;
  }

  // 从根节点开始遍历
  traverseNode(ast);

  return { nodes, edges };
}

// 使用 Dagre 进行自动布局
function getLayoutedNodes(nodes: Node[], edges: Edge[], direction: 'TB' | 'LR' = 'TB'): Node[] {
  const dagreGraph = new dagre.graphlib.Graph();
  (dagreGraph as any).setDefaultEdgeLabel(() => ({}));
  
  dagreGraph.setGraph({ 
    rankdir: direction,
    nodesep: 50,
    ranksep: 100,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { 
      width: (node.style?.width as number) || 150,
      height: (node.style?.minHeight as number) || 60
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id) as any;
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - ((node.style?.width as number || 150) / 2),
        y: nodeWithPosition.y - ((node.style?.minHeight as number || 60) / 2),
      },
    };
  });
}

const AstVisualizerInner: React.FC<AstVisualizerProps> = ({ ast }) => {
  // 用于跟踪是否已经初始化过视图
  const hasInitializedViewRef = React.useRef<string | null>(null);
  
  // 将 AST 转换为 React Flow 节点和边
  const { nodes: astNodes, edges: astEdges } = useMemo(() => {
    return astToFlowElements(ast);
  }, [ast]);

  // 应用 Dagre 布局
  const layoutedNodes = useMemo(() => {
    if (astNodes.length === 0) {
      return [];
    }
    return getLayoutedNodes(astNodes, astEdges, 'TB');
  }, [astNodes, astEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(astEdges);
  const { setViewport } = useReactFlow();

  // 当 AST 改变时，更新节点和边
  React.useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(astEdges);
  }, [layoutedNodes, astEdges, setNodes, setEdges]);

  // 自动适应视图
  useEffect(() => {
    if (!ast || layoutedNodes.length === 0) {
      if (!ast) {
        hasInitializedViewRef.current = null;
      }
      return;
    }
    
    const astId = JSON.stringify(ast);
    if (hasInitializedViewRef.current === astId) {
      return;
    }
    
    const timer = setTimeout(() => {
      const container = document.querySelector('.react-flow') as HTMLElement;
      if (!container) return;
      
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      
      layoutedNodes.forEach(node => {
        const nodeWidth = (node.style?.width as number) || 150;
        const nodeHeight = (node.style?.minHeight as number) || 60;
        const x = node.position.x;
        const y = node.position.y;
        
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + nodeWidth);
        maxY = Math.max(maxY, y + nodeHeight);
      });
      
      const graphWidth = maxX - minX;
      const graphHeight = maxY - minY;
      
      if (graphWidth > 0 && graphHeight > 0) {
        const padding = 50;
        const viewWidth = container.offsetWidth - (padding * 2);
        const viewHeight = container.offsetHeight - (padding * 2);
        
        const scaleX = viewWidth / graphWidth;
        const scaleY = viewHeight / graphHeight;
        const targetZoom = Math.min(scaleX, scaleY);
        
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        setViewport(
          {
            x: (container.offsetWidth / 2) - (centerX * targetZoom),
            y: (container.offsetHeight / 2) - (centerY * targetZoom),
            zoom: targetZoom,
          },
          { duration: 400 }
        );
        
        hasInitializedViewRef.current = astId;
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [ast, layoutedNodes, setViewport]);

  if (!ast) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-4">🌲</div>
          <p className="text-lg">等待编译生成 AST</p>
          <p className="text-sm text-gray-400 mt-2">点击"编译"按钮生成抽象语法树</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <style>{`
        .react-flow__handle {
          background: transparent !important;
          border: 2px solid #64748b !important;
          width: 10px !important;
          height: 10px !important;
          border-radius: 50% !important;
        }
        .react-flow__handle-top {
          top: -5px;
        }
        .react-flow__handle-bottom {
          bottom: -5px;
        }
        .react-flow__handle-left {
          left: -5px;
        }
        .react-flow__handle-right {
          right: -5px;
        }
        .react-flow__handle:hover {
          border-color: #3b82f6 !important;
          border-width: 3px !important;
        }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView={false}
        minZoom={0.05}
        maxZoom={2}
        nodesDraggable={true}
        nodesConnectable={false}
        defaultEdgeOptions={{
          type: 'default',
          markerEnd: {
            type: 'arrowclosed',
            color: '#64748b',
          },
        }}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
};

export const AstVisualizer: React.FC<AstVisualizerProps> = (props) => {
  return (
    <ReactFlowProvider>
      <AstVisualizerInner {...props} />
    </ReactFlowProvider>
  );
};

