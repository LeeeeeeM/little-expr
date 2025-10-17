// 解析器类型定义
export interface ASTNode {
  type: string;
  value?: number;
  operator?: string;
  left?: ASTNode;
  right?: ASTNode;
}

export interface ParseStep {
  step: number;
  description: string;
  ast: ASTNode | null;
  pendingNodes: ASTNode[]; // 等待插入的节点（上方新增区域）
  canvasNodes: ASTNode[]; // 画布上的节点
  currentToken: string;
  position: number;
}
