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
import type { ControlFlowGraph } from '../lib/cfg-types';
import { StatementType, type Statement, type Expression } from '../lib/types';

interface CfgVisualizerProps {
  cfg: ControlFlowGraph | null;
  activeBlockId?: string | null; // 当前激活的块ID（用于高亮显示，仅程序控制）
  visitedBlockIds?: Set<string>; // 已访问的块ID集合（用于显示为紫色）
}

// 将表达式转换为源代码字符串
function expressionToSourceCode(expr: Expression): string {
  if (!expr) return '';
  
  switch (expr.type) {
    case 'NumberLiteral':
      return String((expr as any).value);
    case 'Identifier':
      return (expr as any).name;
    case 'BinaryExpression':
      const binExpr = expr as any;
      const left = expressionToSourceCode(binExpr.left);
      const right = expressionToSourceCode(binExpr.right);
      const op = binExpr.operator;
      return `(${left} ${op} ${right})`;
    case 'UnaryExpression':
      const unaryExpr = expr as any;
      return `${unaryExpr.operator}${expressionToSourceCode(unaryExpr.operand)}`;
    case 'FunctionCall':
      const funcCall = expr as any;
      const args = funcCall.arguments?.map((arg: Expression) => expressionToSourceCode(arg)).join(', ') || '';
      return `${funcCall.callee?.name || 'unknown'}(${args})`;
    default:
      return '...';
  }
}

// 将语句转换为源代码字符串
function statementToSourceCode(stmt: Statement): string {
  const stmtType = stmt.type as string;
  
  // StartCheckPoint 代表代码块的开始，应该显示为 {
  if (stmtType === 'StartCheckPoint') {
    return '{';
  }
  
  // EndCheckPoint 代表代码块的结束，应该显示为 }
  if (stmtType === 'EndCheckPoint') {
    return '}';
  }
  
  switch (stmtType) {
    case StatementType.VARIABLE_DECLARATION: {
      const varDecl = stmt as any;
      const init = varDecl.initializer ? ` = ${expressionToSourceCode(varDecl.initializer)}` : '';
      return `int ${varDecl.name}${init};`;
    }
    case StatementType.LET_DECLARATION: {
      const letDecl = stmt as any;
      const init = letDecl.initializer ? ` = ${expressionToSourceCode(letDecl.initializer)}` : '';
      return `let ${letDecl.name}${init};`;
    }
    case StatementType.ASSIGNMENT_STATEMENT: {
      const assignStmt = stmt as any;
      return `${assignStmt.target?.name || 'unknown'} = ${expressionToSourceCode(assignStmt.value)};`;
    }
    case StatementType.RETURN_STATEMENT: {
      const retStmt = stmt as any;
      const value = retStmt.value ? ` ${expressionToSourceCode(retStmt.value)}` : '';
      return `return${value};`;
    }
    case StatementType.IF_STATEMENT: {
      const ifStmt = stmt as any;
      const condition = expressionToSourceCode(ifStmt.condition);
      const thenCode = statementToSourceCode(ifStmt.thenBranch);
      const elseCode = ifStmt.elseBranch ? ` else ${statementToSourceCode(ifStmt.elseBranch)}` : '';
      return `if (${condition}) ${thenCode}${elseCode}`;
    }
    case StatementType.WHILE_STATEMENT: {
      const whileStmt = stmt as any;
      const condition = expressionToSourceCode(whileStmt.condition);
      const bodyCode = statementToSourceCode(whileStmt.body);
      return `while (${condition}) ${bodyCode}`;
    }
    case StatementType.FOR_STATEMENT: {
      const forStmt = stmt as any;
      const init = forStmt.init ? statementToSourceCode(forStmt.init).replace(';', '') : '';
      const condition = forStmt.condition ? expressionToSourceCode(forStmt.condition) : '';
      const update = forStmt.update ? statementToSourceCode(forStmt.update).replace(';', '') : '';
      const bodyCode = statementToSourceCode(forStmt.body);
      return `for (${init}; ${condition}; ${update}) ${bodyCode}`;
    }
    case StatementType.EXPRESSION_STATEMENT: {
      const exprStmt = stmt as any;
      return `${expressionToSourceCode(exprStmt.expression)};`;
    }
    case StatementType.BLOCK_STATEMENT: {
      const blockStmt = stmt as any;
      // 跳过 StartCheckPoint 和 EndCheckPoint，因为它们只是编译器生成的标记
      // 实际的 { } 应该由 BlockStatement 本身来显示
      const statements = blockStmt.statements
        ?.filter((s: Statement) => s.type !== 'StartCheckPoint' && s.type !== 'EndCheckPoint')
        ?.map((s: Statement) => statementToSourceCode(s))
        .filter((code: string) => code.length > 0)
        .join('\n') || '';
      return `{\n${statements.split('\n').map((line: string) => `  ${line}`).join('\n')}\n}`;
    }
    case StatementType.BREAK_STATEMENT:
      return 'break;';
    case StatementType.CONTINUE_STATEMENT:
      return 'continue;';
    default:
      return '';
  }
}

// 使用 Dagre 进行自动布局
function getLayoutedNodes(nodes: Node[], edges: Edge[], direction: 'TB' | 'LR' = 'TB'): Node[] {
  // 如果节点或边为空，直接返回
  if (nodes.length === 0) {
    return nodes;
  }

  const dagreGraph = new dagre.graphlib.Graph();
  (dagreGraph as any).setDefaultEdgeLabel(() => ({}));
  
  // 设置布局方向：TB = 从上到下，LR = 从左到右
  dagreGraph.setGraph({ 
    rankdir: direction,
    nodesep: 80,  // 节点之间的最小间距（水平）
    ranksep: 120, // 层级之间的最小间距（垂直）
  });

  // 添加节点（需要提供宽度和高度）
  nodes.forEach((node) => {
    const width = (node.style?.width as number) || 200;
    const height = (node.style?.minHeight as number) || 150;
    // 确保宽度和高度是有效数字
    dagreGraph.setNode(node.id, { 
      width: isNaN(width) || width <= 0 ? 200 : width,
      height: isNaN(height) || height <= 0 ? 150 : height
    });
  });

  // 添加边
  edges.forEach((edge) => {
    // 确保源节点和目标节点都存在
    if (edge.source && edge.target) {
    dagreGraph.setEdge(edge.source, edge.target);
    }
  });

  // 执行布局计算
  try {
  dagre.layout(dagreGraph);
  } catch (error) {
    console.error('Dagre layout calculation failed:', error);
    // 如果布局计算失败，返回带默认位置的节点
    return nodes.map((node) => ({
      ...node,
      position: {
        x: 0,
        y: 0,
      },
    }));
  }

  // 更新节点位置，添加防御性检查避免 NaN
  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id) as any;
    const nodeWidth = (node.style?.width as number) || 200;
    const nodeHeight = (node.style?.minHeight as number) || 150;
    
    // 检查 nodeWithPosition 是否存在，以及 x 和 y 是否为有效数字
    const x = nodeWithPosition?.x ?? 0;
    const y = nodeWithPosition?.y ?? 0;
    
    // 确保 x 和 y 是有效数字，不是 NaN 或 Infinity
    const finalX = (typeof x === 'number' && !isNaN(x) && isFinite(x))
      ? x - nodeWidth / 2
      : 0;
    const finalY = (typeof y === 'number' && !isNaN(y) && isFinite(y))
      ? y - nodeHeight / 2
      : 0;
    
    return {
      ...node,
      position: {
        x: finalX,
        y: finalY,
      },
    };
  });
}

const CfgVisualizerInner: React.FC<CfgVisualizerProps> = ({ cfg, activeBlockId, visitedBlockIds }) => {
  // 用于跟踪是否已经初始化过视图（只在首次加载或 CFG 改变时重置视图）
  const hasInitializedViewRef = React.useRef<string | null>(null);
  
  // 初始化节点和边的数据
  const initialNodes = useMemo(() => {
    if (!cfg) {
      return [];
    }

    const flowNodes: Node[] = [];
    
    // 布局参数
    const nodeWidth = 200;
    const nodeHeight = 150;
    
    // 遍历所有块创建节点（位置会被 Dagre 自动计算）
    for (const block of cfg.blocks) {
      // 生成源代码显示
      const sourceCodeLines: string[] = [];
      let indentLevel = 0;
      
      for (const stmt of block.statements) {
          const code = statementToSourceCode(stmt);
          if (code && code.trim().length > 0) {
            // 处理 StartCheckPoint 和 EndCheckPoint 的缩进
            if (code === '{') {
              sourceCodeLines.push(code);
              indentLevel++;
            } else if (code === '}') {
              indentLevel = Math.max(0, indentLevel - 1);
              sourceCodeLines.push(code);
            } else {
              // 如果代码是多行的（比如 BlockStatement），需要拆分行
              const lines = code.split('\n');
              const indentedLines = lines.map(line => {
                // 对于多行代码块，需要保持适当的缩进
                if (line.trim().length > 0) {
                  return '  '.repeat(indentLevel) + line.trim();
                }
                return line;
              });
              sourceCodeLines.push(...indentedLines);
            }
          }
        }
        
        // 完整展示所有代码
        const label = sourceCodeLines.length > 0
          ? sourceCodeLines.join('\n')
          : block.isEntry 
          ? 'ENTRY'
          : block.isExit
          ? 'EXIT'
          : 'empty';
        
        // 确定节点颜色（选中状态会在 useEffect 中动态更新，这里只设置默认样式）
        let nodeColor = '#f3f4f6'; // 默认灰色
        let borderColor = '#d1d5db';
        let borderWidth = 1;
        
        if (block.isEntry) {
          nodeColor = '#dbeafe'; // 蓝色
          borderColor = '#3b82f6';
          borderWidth = 2;
        } else if (block.isExit) {
          nodeColor = '#fee2e2'; // 红色
          borderColor = '#ef4444';
          borderWidth = 2;
        }
        
        flowNodes.push({
          id: block.id,
          type: 'default',
          position: { x: 0, y: 0 }, // 初始位置，会被 Dagre 自动计算
          draggable: true, // 确保节点可拖动
          data: {
            label: (
              <div className="px-3 py-2 text-xs font-mono">
                <div className="font-semibold mb-1 text-gray-800">{block.id}</div>
                <pre className="whitespace-pre-wrap text-gray-700 leading-relaxed text-[10px]">{label}</pre>
                {block.isEntry && <div className="text-blue-600 mt-1 text-[9px]">[ENTRY]</div>}
                {block.isExit && <div className="text-red-600 mt-1 text-[9px]">[EXIT]</div>}
              </div>
            ),
          },
          style: {
            background: nodeColor,
            border: `${borderWidth}px solid ${borderColor}`,
            borderRadius: '8px',
            width: nodeWidth,
            minHeight: nodeHeight,
            height: 'auto', // 根据内容自动调整高度
          },
        });
    }
    
    return flowNodes;
  }, [cfg]);

  const initialEdges = useMemo(() => {
    if (!cfg) {
      return [];
    }
    
    const flowEdges: Edge[] = [];
    
    // 创建边（带方向箭头）
    for (const edge of cfg.edges) {
      flowEdges.push({
        id: `${edge.from}->${edge.to}`,
        source: edge.from,
        target: edge.to,
        type: 'default', // 使用默认的贝塞尔曲线，更灵活
        animated: false,
        markerEnd: {
          type: 'arrowclosed',
          color: '#64748b',
        },
        style: { stroke: '#64748b', strokeWidth: 2 },
      });
    }
    
    return flowEdges;
  }, [cfg]);

  // 使用 Dagre 自动布局避免节点重叠
  const layoutedNodes = useMemo(() => {
    if (initialNodes.length === 0 || initialEdges.length === 0) {
      return initialNodes;
    }
    return getLayoutedNodes(initialNodes, initialEdges, 'TB');
  }, [initialNodes, initialEdges]);

  // 使用 React Flow 的状态管理 hooks，使节点可拖动
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { setViewport, getNode, setCenter } = useReactFlow();
  
  // 当激活块改变时，更新节点样式（只有程序控制的高亮）
  React.useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const isActive = activeBlockId === node.id; // 当前激活的块（逐步执行时）
        const isVisited = visitedBlockIds?.has(node.id) ?? false; // 已访问的块
        const block = cfg?.blocks.find((b) => b.id === node.id);
        
        let nodeColor = '#ffffff';
        let borderColor = '#e2e8f0';
        let borderWidth = 2;
        
        if (isActive) {
          // 激活的块使用绿色高亮（仅程序控制）
          nodeColor = '#dcfce7'; // 绿色背景
          borderColor = '#22c55e'; // 绿色边框
          borderWidth = 3;
        } else if (isVisited) {
          // 已访问的块使用紫色高亮
          nodeColor = '#f3e8ff'; // 紫色背景
          borderColor = '#a855f7'; // 紫色边框
          borderWidth = 2;
        } else if (block?.isEntry) {
          nodeColor = '#dbeafe'; // 蓝色
          borderColor = '#3b82f6';
          borderWidth = 2;
        } else if (block?.isExit) {
          nodeColor = '#fee2e2'; // 红色
          borderColor = '#ef4444';
          borderWidth = 2;
        } else {
          nodeColor = '#f3f4f6'; // 灰色
          borderColor = '#d1d5db';
          borderWidth = 1;
        }
        
        return {
          ...node,
          selected: false, // 禁用选中状态
          style: {
            ...node.style,
            background: nodeColor,
            border: `${borderWidth}px solid ${borderColor}`,
          },
        };
      })
    );
  }, [activeBlockId, visitedBlockIds, cfg, setNodes]);

  // 当 activeBlockId 或 cfg 改变时，自动聚焦到对应的节点
  React.useEffect(() => {
    if (!activeBlockId || !getNode || !setCenter || !cfg) {
      return;
    }

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let animationFrameId: number | null = null;

    // 使用 requestAnimationFrame 确保在下一帧渲染后再聚焦
    // 当 cfg 改变时，节点需要重新布局和渲染，需要等待更长时间
    const timer = setTimeout(() => {
      // 使用 requestAnimationFrame 确保 DOM 已经更新
      animationFrameId = requestAnimationFrame(() => {
        // 再等待一帧，确保节点位置已经计算完成
        requestAnimationFrame(() => {
    const targetNode = getNode(activeBlockId);
    if (!targetNode) {
            // 如果节点还没有渲染，再等待一段时间
            retryTimer = setTimeout(() => {
              const retryNode = getNode(activeBlockId);
              if (retryNode) {
                const nodeWidth = (retryNode.width as number) || 200;
                const nodeHeight = (retryNode.height as number) || 150;
                const centerX = retryNode.position.x + nodeWidth / 2;
                const centerY = retryNode.position.y + nodeHeight / 2;
                setCenter(centerX, centerY, { zoom: 1, duration: 400 });
              }
            }, 300);
      return;
    }

      // 计算节点的中心位置
      const nodeWidth = (targetNode.width as number) || 200;
      const nodeHeight = (targetNode.height as number) || 150;
      const centerX = targetNode.position.x + nodeWidth / 2;
      const centerY = targetNode.position.y + nodeHeight / 2;

      // 聚焦到节点中心，并设置适当的缩放
      setCenter(centerX, centerY, { zoom: 1, duration: 400 });
        });
      });
    }, 200); // 增加延迟时间，确保节点已经渲染和布局

    return () => {
      clearTimeout(timer);
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [activeBlockId, cfg, getNode, setCenter]);

  // 当 cfg 改变时，更新节点和边
  React.useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(initialEdges);
  }, [layoutedNodes, initialEdges, setNodes, setEdges]);

  // 当 CFG 改变时，自动适应视图以显示所有节点，让边界贴合画布
  // 只在 CFG 首次加载或改变时执行，而不是在节点选中状态改变时执行
  useEffect(() => {
    if (!cfg || layoutedNodes.length === 0) {
      if (!cfg) {
        hasInitializedViewRef.current = null;
      }
      return;
    }
    
    // 如果有 activeBlockId，优先使用聚焦逻辑，跳过自动适应视图
    if (activeBlockId) {
      return;
    }
    
    // 检查是否是新的 CFG（通过 functionName 来识别）
    const cfgId = cfg.functionName;
    if (hasInitializedViewRef.current === cfgId) {
      // 已经初始化过这个 CFG 的视图，不再重置
      return;
    }
    
    // 延迟执行，确保 DOM 已渲染，特别是节点高度需要渲染后才能准确计算
    const timer = setTimeout(() => {
      const container = document.querySelector('.react-flow') as HTMLElement;
      if (!container) return;
      
      // 使用 layoutedNodes 中的位置数据计算边界（这些是 Dagre 计算后的最终位置）
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      
      layoutedNodes.forEach(node => {
        const nodeWidth = (node.style?.width as number) || 200;
        const nodeHeight = (node.style?.minHeight as number) || 150;
        const x = node.position?.x ?? 0;
        const y = node.position?.y ?? 0;
        
        // 确保 x 和 y 是有效数字
        if (typeof x === 'number' && !isNaN(x) && isFinite(x) &&
            typeof y === 'number' && !isNaN(y) && isFinite(y)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + nodeWidth);
        maxY = Math.max(maxY, y + nodeHeight);
        }
      });
      
      // 确保边界值是有效数字
      if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
        return;
      }
      
      const graphWidth = maxX - minX;
      const graphHeight = maxY - minY;
      
      // 确保宽度和高度是有效数字
      if (graphWidth > 0 && graphHeight > 0 && isFinite(graphWidth) && isFinite(graphHeight)) {
        const padding = 50;
        const viewWidth = container.offsetWidth - (padding * 2);
        const viewHeight = container.offsetHeight - (padding * 2);
        
        // 计算合适的缩放比例，使图能够填满画布（不留空白）
        const scaleX = viewWidth / graphWidth;
        const scaleY = viewHeight / graphHeight;
        // 使用较小的比例，确保两个方向都能完整显示
        const targetZoom = Math.min(scaleX, scaleY);
        
        // 计算中心点
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        // 设置视口，使用计算出的缩放比例，确保边界贴合
        setViewport(
          {
            x: (container.offsetWidth / 2) - (centerX * targetZoom),
            y: (container.offsetHeight / 2) - (centerY * targetZoom),
            zoom: targetZoom,
          },
          { duration: 400 }
        );
        
        // 标记已经初始化过这个 CFG 的视图
        hasInitializedViewRef.current = cfgId;
      }
    }, 300); // 延迟执行，确保 DOM 完全渲染
    
    return () => clearTimeout(timer);
  }, [cfg, layoutedNodes, setViewport, activeBlockId]);

  if (!cfg) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-4">📊</div>
          <p className="text-lg">等待编译生成 CFG</p>
          <p className="text-sm text-gray-400 mt-2">点击"编译"按钮生成控制流图</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      {/* 自定义样式：将连接点改为空心圆 */}
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
      {/* SVG 箭头标记定义 */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3, 0 6"
              fill="#64748b"
            />
          </marker>
        </defs>
      </svg>
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
        elementsSelectable={false}
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

export const CfgVisualizer: React.FC<CfgVisualizerProps> = (props) => {
  return (
    <ReactFlowProvider>
      <CfgVisualizerInner {...props} />
    </ReactFlowProvider>
  );
};

