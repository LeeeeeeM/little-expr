import React, { useEffect, useRef } from 'react';
import { TreeGraph } from '@antv/g6';
import type { ASTNode } from '../parser/browserParser';

interface ASTTreeVisualizerProps {
  ast: ASTNode | null;
  pendingNodes?: ASTNode[];
  canvasNodes?: ASTNode[];
  isAnimating?: boolean;
}

// 将 AST 节点转换为 G6 v4 树数据格式
const convertASTToTreeData = (ast: ASTNode | null): any => {
  if (!ast) {
    return null;
  }

  const convertNode = (node: ASTNode): any => {
    const label = node.type === 'Number' ? node.value?.toString() : node.operator || node.type;
    
    const treeNode: any = {
      id: `node_${Math.random().toString(36).substr(2, 9)}`,
      label: label,
      type: node.type,
      style: {
        fill: node.type === 'Number' ? '#52c41a' : '#1890ff',
        stroke: node.type === 'Number' ? '#389e0d' : '#096dd9',
        lineWidth: 2,
        radius: 15,
      },
      labelCfg: {
        style: {
          fill: '#fff',
          fontSize: 10,
          fontWeight: 'bold',
        },
      },
    };

    const children: any[] = [];
    if (node.left) {
      children.push(convertNode(node.left));
    }
    if (node.right) {
      children.push(convertNode(node.right));
    }

    if (children.length > 0) {
      treeNode.children = children;
    }

    return treeNode;
  };

  return convertNode(ast);
};

export const ASTTreeVisualizer: React.FC<ASTTreeVisualizerProps> = ({
  ast,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<TreeGraph | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 销毁之前的图实例
    if (graphRef.current) {
      graphRef.current.destroy();
    }

    const treeData = convertASTToTreeData(ast);
    if (!treeData) return;

    // 创建新的图实例 - G6 v4 API
    const graph = new TreeGraph({
      container: containerRef.current,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        type: 'compactBox',
        direction: 'TB', // 从上到下
        getId: (d: any) => d.id,
        getHeight: () => 30,
        getWidth: () => 30,
        getVGap: () => 15,
        getHGap: () => 30,
        radial: false,
      },
      modes: {
        default: ['zoom-canvas', 'drag-canvas'],
      },
      defaultNode: {
        type: 'circle',
        size: 30,
        style: {
          fill: '#1890ff',
          stroke: '#096dd9',
          lineWidth: 2,
        },
        labelCfg: {
          style: {
            fill: '#fff',
            fontSize: 10,
            fontWeight: 'bold',
          },
        },
      },
      defaultEdge: {
        type: 'line',
        style: {
          stroke: '#d9d9d9',
          lineWidth: 2,
        },
      },
    });

    graphRef.current = graph;

    // 渲染图 - G6 v4 API
    graph.data(treeData);
    graph.render();

    // 自适应画布
    graph.fitView();

    // 清理函数
    return () => {
      if (graphRef.current) {
        graphRef.current.destroy();
        graphRef.current = null;
      }
    };
  }, [ast]);

  // 当容器大小变化时重新渲染
  useEffect(() => {
    const handleResize = () => {
      if (graphRef.current && containerRef.current) {
        graphRef.current.changeSize(
          containerRef.current.clientWidth,
          containerRef.current.clientHeight
        );
        graphRef.current.fitView();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="h-full w-full overflow-hidden">
      <div className="h-full w-full" ref={containerRef} />
    </div>
  );
};
