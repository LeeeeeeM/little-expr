import type { ControlFlowGraph } from '../lib/cfg-types';
import type { Statement } from '../lib/types';

export interface BlockHighlight {
  blockId: string;
  startLine: number;
  endLine: number;
  color: string;
}

// 预定义的颜色列表，用于区分不同的块
const BLOCK_COLORS = [
  '#fef3c7', // 浅黄色
  '#dbeafe', // 浅蓝色
  '#fce7f3', // 浅粉色
  '#d1fae5', // 浅绿色
  '#e9d5ff', // 浅紫色
  '#fed7aa', // 浅橙色
  '#ddd6fe', // 浅靛蓝色
  '#fecaca', // 浅红色
];

/**
 * 从 AST 节点递归收集所有行号
 * 逻辑：从 CFG 块中的 AST 节点开始，递归收集所有子节点的行号
 */
function collectStatementLines(node: Statement | any): number[] {
  const lines: number[] = [];
  
  // 跳过 StartCheckPoint 和 EndCheckPoint（这些是编译器生成的，没有源代码位置）
  if (node?.type === 'StartCheckPoint' || node?.type === 'EndCheckPoint') {
    return lines;
  }
  
  // 如果节点本身有行号，添加
  if (node?.line && typeof node.line === 'number' && node.line > 0) {
    lines.push(node.line);
  }
  
  // 递归收集子节点的行号
  
  // 1. BlockStatement: 递归所有子语句
  if (node?.statements && Array.isArray(node.statements)) {
    for (const subStmt of node.statements) {
      lines.push(...collectStatementLines(subStmt));
    }
  }
  
  // 2. ExpressionStatement: 递归 expression
  if (node?.expression) {
    lines.push(...collectStatementLines(node.expression));
  }
  
  // 3. VariableDeclaration/LetDeclaration: 递归 initializer
  if (node?.initializer) {
    lines.push(...collectStatementLines(node.initializer));
  }
  
  // 4. AssignmentStatement: 递归 target 和 value
  if (node?.target) {
    lines.push(...collectStatementLines(node.target));
  }
  if (node?.value) {
    lines.push(...collectStatementLines(node.value));
  }
  
  // 5. IfStatement: 递归 condition, thenBranch, elseBranch
  if (node?.condition) {
    lines.push(...collectStatementLines(node.condition));
  }
  if (node?.thenBranch) {
    lines.push(...collectStatementLines(node.thenBranch));
  }
  if (node?.elseBranch) {
    lines.push(...collectStatementLines(node.elseBranch));
  }
  
  // 6. WhileStatement/ForStatement: 递归 condition, body
  if (node?.condition) {
    lines.push(...collectStatementLines(node.condition));
  }
  if (node?.body) {
    lines.push(...collectStatementLines(node.body));
  }
  
  // 7. ForStatement: 递归 init, update
  if (node?.init) {
    lines.push(...collectStatementLines(node.init));
  }
  if (node?.update) {
    lines.push(...collectStatementLines(node.update));
  }
  
  // 8. ReturnStatement: 递归 value
  if (node?.value) {
    lines.push(...collectStatementLines(node.value));
  }
  
  // 9. BinaryExpression/UnaryExpression: 递归 left, right, operand
  if (node?.left) {
    lines.push(...collectStatementLines(node.left));
  }
  if (node?.right) {
    lines.push(...collectStatementLines(node.right));
  }
  if (node?.operand) {
    lines.push(...collectStatementLines(node.operand));
  }
  
  // 10. FunctionCall: 递归 callee 和 arguments
  if (node?.callee) {
    lines.push(...collectStatementLines(node.callee));
  }
  if (node?.arguments && Array.isArray(node.arguments)) {
    for (const arg of node.arguments) {
      lines.push(...collectStatementLines(arg));
    }
  }
  
  // 11. ParenthesizedExpression: 递归 expression
  if (node?.expression) {
    lines.push(...collectStatementLines(node.expression));
  }
  
  return lines;
}

/**
 * 计算源代码中每个基本块对应的行号范围
 * 如果 AST 节点没有行号信息，则通过源代码行数估算
 */
export function computeBlockHighlights(
  cfg: ControlFlowGraph | null,
  _sourceCode: string // 保留以备将来使用（如估算行号）
): BlockHighlight[] {
  if (!cfg) return [];
  
  const highlights: BlockHighlight[] = [];
  
  // 为每个块分配颜色
  const blockColorMap = new Map<string, string>();
  let colorIndex = 0;
  
  for (const block of cfg.blocks) {
    if (!blockColorMap.has(block.id)) {
      blockColorMap.set(block.id, BLOCK_COLORS[colorIndex % BLOCK_COLORS.length]);
      colorIndex++;
    }
  }
  
  // 遍历每个基本块，计算其行号范围
  for (const block of cfg.blocks) {
    // Entry 块和 Exit 块可能包含实际代码，也需要处理
    // 但如果块是空的，就跳过
    if (block.statements.length === 0) {
      continue;
    }
    
    // 从 CFG 块中的所有 AST 节点递归收集行号
    const lines: number[] = [];
    for (const stmt of block.statements) {
      // 递归收集该语句及其所有子节点的行号
      const stmtLines = collectStatementLines(stmt);
      lines.push(...stmtLines);
    }
    
    // 去重并排序
    const uniqueLines = Array.from(new Set(lines)).filter(line => line > 0).sort((a, b) => a - b);
    
    if (uniqueLines.length === 0) {
      // 块中只有 checkpoint 或其他语句但没有行号，跳过
      continue;
    }
    
    // 计算最小和最大行号
    const minLine = uniqueLines[0];
    const maxLine = uniqueLines[uniqueLines.length - 1];
    
    const highlight = {
      blockId: block.id,
      startLine: minLine,
      endLine: maxLine,
      color: blockColorMap.get(block.id) || '#f3f4f6',
    };
    
    highlights.push(highlight);
  }
  
  return highlights;
}
