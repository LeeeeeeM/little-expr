import React, { useMemo, useEffect, useCallback, useRef } from 'react';
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

export interface CodeSegment {
  segmentIndex: number; // 段索引（0 = 主程序，1+ = 库函数）
  name: string; // 段名称（如 "主程序" 或 "lib/free.txt"）
  codes: string[]; // 代码行
  startAddress: number; // 起始地址
  endAddress: number; // 结束地址
  labelMap?: Map<string, number>; // 标签映射（可选，用于注册库函数）
}

interface DynamicLinkedSegmentVisualizerProps {
  segments: CodeSegment[]; // 所有代码段
  currentSegment?: number; // 当前执行的段索引
  currentAddress?: number | null; // 当前执行的地址
  onSegmentClick?: (segmentIndex: number) => void; // 点击段时的回调
}

interface NodeData extends Record<string, unknown> {
  segmentIndex?: number;
  segmentName?: string;
  codes?: string[];
  codeText?: string;
  startAddress?: number;
  endAddress?: number;
  isActive?: boolean;
  codeLinesWithHighlight?: Array<{ line: string; highlight: boolean }>;
  label?: React.ReactNode;
}

const DynamicLinkedSegmentVisualizerInner: React.FC<DynamicLinkedSegmentVisualizerProps> = ({
  segments,
  currentSegment,
  currentAddress,
  onSegmentClick,
}) => {
  const { getNode, setCenter } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const highlightedLineRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map()); // 段索引 -> 滚动容器
  const isInitializedRef = useRef<boolean>(false); // 跟踪是否已经初始化过节点

  // 只在 segments 变化时重新计算布局（不包含高亮信息）
  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(() => {
    if (segments.length === 0) {
      return { nodes: [], edges: [] };
    }

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // 使用网格布局：每行2个段
    const colsPerRow = 2;
    const nodeWidth = 400;
    const nodeHeight = 300;
    const horizontalSpacing = 450;
    const verticalSpacing = 350;

    segments.forEach((segment, index) => {
      const row = Math.floor(index / colsPerRow);
      const col = index % colsPerRow;
      const x = col * horizontalSpacing + 100;
      const y = row * verticalSpacing + 100;

      // 显示所有代码内容
      const codeText = segment.codes.join('\n');

      const node: Node<NodeData> = {
        id: `segment-${segment.segmentIndex}`,
        type: 'default',
        position: { x, y },
        data: {
          segmentIndex: segment.segmentIndex,
          segmentName: segment.name,
          codes: segment.codes,
          codeText,
          startAddress: segment.startAddress,
          endAddress: segment.endAddress,
        },
        style: {
          width: nodeWidth,
          height: nodeHeight,
          border: '2px solid #e5e7eb',
          borderRadius: '8px',
          backgroundColor: '#ffffff',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        },
      };

      nodes.push(node);
    });

    return { nodes, edges };
  }, [segments]); // 只在 segments 变化时重新计算

  // 只在 segments 变化时更新节点和边（保持用户拖动的位置）
  useEffect(() => {
    // 如果 segments 为空，清空节点
    if (layoutNodes.length === 0) {
      setNodes([]);
      setEdges([]);
      isInitializedRef.current = false;
      return;
    }

    // 如果节点已经存在且数量相同，只更新内容，不重置位置
    if (isInitializedRef.current) {
      setNodes((currentNodes) => {
        // 如果节点数量不同，使用新布局
        if (currentNodes.length !== layoutNodes.length) {
          isInitializedRef.current = true;
          return layoutNodes;
        }
        
        // 节点数量相同，保留位置
        const updatedNodes: Node<NodeData>[] = layoutNodes.map((newNode, index) => {
          const existingNode = currentNodes[index];
          if (existingNode) {
            const updatedNode: Node<NodeData> = {
              ...newNode,
              position: existingNode.position, // 保留用户拖动的位置
              data: {
                ...newNode.data,
                // 保留当前的高亮状态
                codeLinesWithHighlight: existingNode.data?.codeLinesWithHighlight,
              },
            };
            // 如果存在 positionAbsolute，也保留它（这是 react-flow 的内部属性）
            if ('positionAbsolute' in existingNode && existingNode.positionAbsolute) {
              (updatedNode as any).positionAbsolute = existingNode.positionAbsolute;
            }
            return updatedNode;
          }
          return newNode;
        });
        return updatedNodes;
      });
    } else {
      // 首次加载时，使用新的布局
      setNodes(layoutNodes);
      isInitializedRef.current = true;
    }
    setEdges(layoutEdges);
  }, [layoutNodes, layoutEdges, setNodes, setEdges]);

  // 当 currentSegment 或 currentAddress 变化时，只更新节点样式和内容（不替换整个节点数组）
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node): Node<NodeData> => {
        const segmentIndex = node.data?.segmentIndex;
        if (segmentIndex === undefined) return node;

        const isActive = currentSegment !== undefined && segmentIndex === currentSegment;
        const segment = segments.find(s => s.segmentIndex === segmentIndex);
        if (!segment) return node;

        // 准备代码行用于显示（高亮当前执行的地址行）
        const codeText = node.data?.codeText || '';
        const codeLinesWithHighlight = codeText.split('\n').map((line: string) => {
          const addressMatch = line.match(/^\[(\d+)\]/);
          if (addressMatch && currentAddress !== null && currentAddress !== undefined && isActive) {
            const lineAddress = parseInt(addressMatch[1]!, 10);
            const absoluteLineAddress = segmentIndex === 0
              ? lineAddress
              : segmentIndex * 1000 + lineAddress;
            if (absoluteLineAddress === currentAddress) {
              return { line, highlight: true };
            }
          }
          return { line, highlight: false };
        });

        return {
          ...node,
          data: {
            ...node.data,
            isActive,
            codeLinesWithHighlight,
          },
          style: {
            ...node.style,
            border: isActive ? '3px solid #3b82f6' : '2px solid #e5e7eb',
            backgroundColor: isActive ? '#eff6ff' : '#ffffff',
            boxShadow: isActive 
              ? '0 4px 6px -1px rgba(59, 130, 246, 0.3)' 
              : '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          },
        };
      })
    );
  }, [currentSegment, currentAddress, segments, setNodes]);

  // 滚动到高亮的代码行（使用 requestAnimationFrame 快速响应）
  const scrollToHighlightedLine = useCallback(() => {
    if (currentSegment === undefined || currentAddress === null || currentAddress === undefined) {
      return;
    }

    const key = `segment-${currentSegment}-address-${currentAddress}`;
    
    // 使用 requestAnimationFrame 确保 DOM 已更新，然后立即滚动
    const tryScroll = (retryCount = 0) => {
      requestAnimationFrame(() => {
        const lineElement = highlightedLineRefs.current.get(key);
        const scrollContainer = scrollContainerRefs.current.get(currentSegment);
        
        if (lineElement && scrollContainer) {
          // 计算元素相对于滚动容器的位置
          const containerRect = scrollContainer.getBoundingClientRect();
          const elementRect = lineElement.getBoundingClientRect();
          
          // 计算元素在滚动容器中的偏移量
          const elementOffsetTop = elementRect.top - containerRect.top + scrollContainer.scrollTop;
          const containerCenter = scrollContainer.clientHeight / 2;
          const targetScrollTop = elementOffsetTop - containerCenter;
          
          // 立即滚动到目标位置（使用 smooth 但减少延迟）
          scrollContainer.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
          });
        } else if (retryCount < 3) {
          // 如果 ref 还没设置好，快速重试（最多重试3次，每次只等一帧）
          requestAnimationFrame(() => tryScroll(retryCount + 1));
        }
      });
    };
    
    tryScroll();
  }, [currentSegment, currentAddress]);

  // 当 currentSegment 或 currentAddress 变化时，先聚焦段，再滚动代码行
  useEffect(() => {
    if (currentSegment === undefined || !getNode || !setCenter) {
      return;
    }

    const nodeId = `segment-${currentSegment}`;
    let rafId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    
    // 先聚焦到段节点
    const focusSegment = () => {
      const targetNode = getNode(nodeId);
      if (!targetNode) {
        return false;
      }

      // 计算节点的中心位置
      const nodeWidth = (targetNode.width as number) || 400;
      const nodeHeight = (targetNode.height as number) || 300;
      const centerX = targetNode.position.x + nodeWidth / 2;
      const centerY = targetNode.position.y + nodeHeight / 2;

      // 聚焦到节点中心（使用较短的动画时间）
      setCenter(centerX, centerY, { zoom: 1, duration: 200 });
      return true;
    };

    // 尝试立即聚焦
    if (focusSegment()) {
      // 聚焦成功后，立即尝试滚动（不等待动画完成，让滚动和聚焦同时进行）
      if (currentAddress !== null && currentAddress !== undefined) {
        // 使用 requestAnimationFrame 确保在下一帧执行，但几乎无延迟
        rafId = requestAnimationFrame(() => {
          scrollToHighlightedLine();
        });
      }
    } else {
      // 节点还没渲染，快速重试
      rafId = requestAnimationFrame(() => {
        if (focusSegment()) {
          if (currentAddress !== null && currentAddress !== undefined) {
            requestAnimationFrame(() => {
              scrollToHighlightedLine();
            });
          }
        } else {
          // 如果还是找不到，延迟一点再试（但时间很短）
          timer = setTimeout(() => {
            if (focusSegment() && currentAddress !== null && currentAddress !== undefined) {
              requestAnimationFrame(() => {
                scrollToHighlightedLine();
              });
            }
          }, 50);
        }
      });
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (timer) clearTimeout(timer);
    };
  }, [currentSegment, currentAddress, getNode, setCenter, scrollToHighlightedLine]);


  // 处理节点点击
  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node<NodeData>) => {
    const segmentIndex = parseInt(node.id.replace('segment-', ''), 10);
    onSegmentClick?.(segmentIndex);
  }, [onSegmentClick]);

  // 渲染节点内容
  const renderNodeContent = (node: Node<NodeData>) => {
    const segmentIndex = node.data?.segmentIndex;
    const segmentName = node.data?.segmentName || '';
    const startAddress = node.data?.startAddress || 0;
    const endAddress = node.data?.endAddress || 0;
    const codeLinesWithHighlight = node.data?.codeLinesWithHighlight || [];
    const isActive = node.data?.isActive || false;

    return (
      <div 
        className="w-full h-full flex flex-col"
        onWheelCapture={(e) => {
          // 在捕获阶段阻止滚轮事件，防止触发画布缩放
          e.stopPropagation();
        }}
      >
        <div className={`px-3 py-2 border-b font-semibold ${
          isActive 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-100 text-gray-700'
        }`}>
          <div className="flex items-center justify-between">
            <span>{segmentName}</span>
            {segmentIndex !== undefined && (
              <span className="text-xs font-normal opacity-75">
                段 {segmentIndex}
              </span>
            )}
          </div>
        </div>
        <div className="px-2 py-1 text-xs text-gray-500 bg-gray-50 border-b">
          地址: {startAddress} - {endAddress}
        </div>
        <div 
          ref={(el) => {
            if (el && segmentIndex !== undefined) {
              scrollContainerRefs.current.set(segmentIndex, el);
            }
          }}
          className="flex-1 overflow-auto p-2 bg-white"
          onWheelCapture={(e) => {
            // 在捕获阶段阻止滚轮事件冒泡到 ReactFlow 画布
            e.stopPropagation();
            
            const container = e.currentTarget;
            const isScrollable = container.scrollHeight > container.clientHeight;
            const isAtTop = container.scrollTop === 0;
            const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1;
            
            // 如果内容可以滚动，且滚动未到达边界，允许正常滚动
            if (isScrollable && !(isAtTop && e.deltaY < 0) && !(isAtBottom && e.deltaY > 0)) {
              return; // 允许正常滚动
            } else {
              // 内容不可滚动或已到达边界，阻止默认行为
              e.preventDefault();
            }
          }}
          onTouchMove={(e) => {
            e.stopPropagation();
          }}
          style={{ 
            maxHeight: '100%',
            overflowY: 'auto',
            overflowX: 'hidden'
          }}
        >
          <div className="font-mono text-xs text-left">
            {codeLinesWithHighlight.map((item: { line: string; highlight: boolean }, idx: number) => {
              const isEmpty = !item.line.trim() || item.line.trim().startsWith(';');
              // 提取地址用于创建 ref key
              const addressMatch = item.line.match(/^\[(\d+)\]/);
              const lineAddress = addressMatch ? parseInt(addressMatch[1]!, 10) : null;
              const absoluteAddress = lineAddress !== null && segmentIndex !== undefined
                ? (segmentIndex === 0 ? lineAddress : segmentIndex * 1000 + lineAddress)
                : null;
              const refKey = absoluteAddress !== null && item.highlight && segmentIndex !== undefined
                ? `segment-${segmentIndex}-address-${absoluteAddress}`
                : null;
              
              return (
                <div
                  key={idx}
                  ref={refKey ? (el) => {
                    if (el) {
                      highlightedLineRefs.current.set(refKey, el);
                    } else {
                      highlightedLineRefs.current.delete(refKey);
                    }
                  } : undefined}
                  className={`px-2 py-0.5 text-left whitespace-pre ${
                    item.highlight
                      ? 'bg-yellow-200 border-l-2 border-yellow-500'
                      : isEmpty
                      ? 'text-gray-400'
                      : 'text-gray-900'
                  }`}
                >
                  {item.line || '\u00A0'}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div 
      className="h-full w-full"
      onKeyDown={(e) => {
        // 阻止键盘事件冒泡，避免影响编辑器
        // 只有当事件来自 React Flow 内部时才处理
        if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.react-flow')) {
          // 允许 React Flow 处理自己的键盘事件
          return;
        }
        // 否则阻止冒泡
        e.stopPropagation();
      }}
    >
      <ReactFlow
        nodes={nodes.map((node): Node<NodeData> => ({
          ...node,
          data: {
            ...node.data,
            label: renderNodeContent(node),
          },
        }))}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView={false}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        deleteKeyCode={null}
        multiSelectionKeyCode={null}
        selectionKeyCode={null}
        panOnDrag={true}
        panOnScroll={false}
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

export const DynamicLinkedSegmentVisualizer: React.FC<DynamicLinkedSegmentVisualizerProps> = (props) => {
  return (
    <ReactFlowProvider>
      <DynamicLinkedSegmentVisualizerInner {...props} />
    </ReactFlowProvider>
  );
};
