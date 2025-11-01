import type {
  Program,
  Statement,
  FunctionDeclaration,
  IfStatement,
  WhileStatement,
  ForStatement,
  ReturnStatement,
  BlockStatement,
  BreakStatement,
  ContinueStatement,
  ExpressionStatement,
  AssignmentStatement,
  VariableDeclaration,
  LetDeclaration,
  Identifier,
  NumberLiteral,
  BinaryExpression,
  UnaryExpression,
  FunctionCall,
  EmptyStatement,
  Expression,
  ASTNode,
} from './ast';
import { StatementType } from './types';

export interface VariableInfo {
  name: string;
  type: string;
  offset?: number;
  initializer?: Expression;
}

export interface BasicBlock {
  id: string;
  statements: Statement[];
  predecessors: BasicBlock[];
  successors: BasicBlock[];
  isEntry?: boolean;
  isExit?: boolean;
  visited?: boolean;  // 用于 DFS 遍历标记
  scopeSnapshot?: Map<string, number>[];  // 该块结束时的作用域快照
}

export interface ControlFlowGraph {
  functionName: string;
  entryBlock: BasicBlock;
  exitBlock?: BasicBlock;
  blocks: BasicBlock[];
  edges: { from: string; to: string }[];
}

export interface CFGAnalysis {
  totalBlocks: number;
  entryBlocks: number;
  exitBlocks: number;
  variables: Set<string>;
  functions: Set<string>;
  constants: Set<any>;
  operators: Set<string>;
  statements: Map<string, Map<string, number>>;
  controlFlowStructures: Map<string, number>;
  deadCodeBlocks: string[];
  complexity: number;
}

// 控制流语句类型
const CONTROL_FLOW_STATEMENT_TYPES = [
  StatementType.IF_STATEMENT,
  StatementType.WHILE_STATEMENT,
  StatementType.FOR_STATEMENT,
  StatementType.RETURN_STATEMENT,
  StatementType.BREAK_STATEMENT,
  StatementType.CONTINUE_STATEMENT
];

// 检查语句是否为控制流语句
function isControlFlowStatement(stmt: Statement): boolean {
  return CONTROL_FLOW_STATEMENT_TYPES.includes(stmt.type as StatementType);
}

export class CFGGenerator {
  private blockCounter: number = 0;
  private currentFunctionName: string = '';
  private currentFunctionExitBlock: BasicBlock | null = null;
  private loopStack: { breakTarget: BasicBlock; continueTarget: BasicBlock }[] = [];

  public generate(program: Program): ControlFlowGraph[] {
    const cfgs: ControlFlowGraph[] = [];
    for (const stmt of program.statements) {
      if (stmt.type === StatementType.FUNCTION_DECLARATION) {
        cfgs.push(this.generateFunctionCFG(stmt));
      }
    }
    return cfgs;
  }

  private newBlock(statements: Statement[] = []): BasicBlock {
    const block: BasicBlock = {
      id: `${this.currentFunctionName}_block_${this.blockCounter++}`,
      statements: statements,
      predecessors: [],
      successors: [],
    };
    return block;
  }

  /**
   * 创建包含条件表达式的基本块
   */
  private createConditionBlock(condition: Expression): BasicBlock {
    const conditionBlock = this.newBlock();
    const conditionStmt: ExpressionStatement = {
      type: StatementType.EXPRESSION_STATEMENT,
      expression: condition
    };
    conditionBlock.statements.push(conditionStmt);
    return conditionBlock;
  }

  /**
   * 移除空块并更新连接关系
   */
  private removeEmptyBlocks(blocks: BasicBlock[]): BasicBlock[] {
    // 识别空块（除了入口块和出口块）
    const emptyBlocks = blocks.filter(block => 
      !block.isEntry && 
      !block.isExit && 
      block.statements.length === 0
    );
    
    if (emptyBlocks.length === 0) {
      return blocks;
    }
    
    // 为空块更新连接关系
    for (const emptyBlock of emptyBlocks) {
      const predecessors = emptyBlock.predecessors;
      const successors = emptyBlock.successors;
      
      if (predecessors.length === 1 && successors.length === 1) {
        // 简单情况：一个前驱，一个后继，直接连接
        this.replaceBlockConnection(predecessors[0]!, emptyBlock, successors[0]!);
      } else if (predecessors.length > 0 && successors.length === 1) {
        // 多个前驱，一个后继：所有前驱直接连接到后继
        const succ = successors[0]!;
        for (const pred of predecessors) {
          this.replaceBlockConnection(pred, emptyBlock, succ);
        }
      } else if (predecessors.length === 1 && successors.length > 1) {
        // 一个前驱，多个后继：前驱直接连接到所有后继
        const pred = predecessors[0]!;
        for (const succ of successors) {
          this.replaceBlockConnection(pred, emptyBlock, succ);
        }
      }
    }
    
    // 过滤掉空块
    return blocks.filter(block => !emptyBlocks.includes(block));
  }

  /**
   * 将前驱块到空块的连接替换为前驱块到目标块的连接
   */
  private replaceBlockConnection(pred: BasicBlock, emptyBlock: BasicBlock, target: BasicBlock): void {
    // 更新前驱的后继
    const emptyBlockIndex = pred.successors.findIndex(s => s.id === emptyBlock.id);
    pred.successors = pred.successors.filter(s => s.id !== emptyBlock.id);
    
    if (!pred.successors.includes(target)) {
      // 在原来的位置插入新的后继，保持顺序
      if (emptyBlockIndex >= 0 && emptyBlockIndex < pred.successors.length) {
        pred.successors.splice(emptyBlockIndex, 0, target);
      } else {
        pred.successors.push(target);
      }
    }
    
    // 更新目标的前驱
    target.predecessors = target.predecessors.filter(p => p.id !== emptyBlock.id);
    if (!target.predecessors.includes(pred)) {
      target.predecessors.push(pred);
    }
  }

  private connectBlocks(from: BasicBlock, to: BasicBlock): void {
    // 检查是否已经存在连接，避免重复添加
    if (!from.successors.includes(to)) {
      from.successors.push(to);
    }
    if (!to.predecessors.includes(from)) {
      to.predecessors.push(from);
    }
  }

  private endsWithReturn(block: BasicBlock): boolean {
    // 检查块是否以return语句结束
    if (block.statements.length === 0) {
      return false;
    }
    
    const lastStatement = block.statements[block.statements.length - 1]!;
    return lastStatement.type === StatementType.RETURN_STATEMENT;
  }

  private generateFunctionCFG(funcDecl: FunctionDeclaration): ControlFlowGraph {
    this.blockCounter = 0;
    this.currentFunctionName = funcDecl.name;
    this.loopStack = [];

    const entryBlock = this.newBlock();
    entryBlock.id = `${funcDecl.name}_entry_block`;
    entryBlock.isEntry = true;
    this.currentFunctionExitBlock = this.newBlock();
    this.currentFunctionExitBlock.isExit = true;

    let currentBlock = entryBlock;

    // Process function body - 按照理论：线性执行到跳转点
    const { blocks: bodyBlocks, entry: bodyEntry, exit: bodyExit } = this.generateBlockCFG(
      funcDecl.body as BlockStatement,
      currentBlock
    );
    
    // 只有当bodyEntry不是currentBlock时才连接
    if (bodyEntry !== currentBlock) {
      this.connectBlocks(currentBlock, bodyEntry);
    }
    currentBlock = bodyExit;

    // Ensure all paths lead to the function exit block
    if (currentBlock !== this.currentFunctionExitBlock) {
      this.connectBlocks(currentBlock, this.currentFunctionExitBlock);
    }

    // Collect all unique blocks and edges
    const uniqueBlocks = new Set<BasicBlock>();
    const edges: { from: string; to: string }[] = [];

    const queue: BasicBlock[] = [entryBlock];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const block = queue.shift()!;
      if (visited.has(block.id)) continue;
      visited.add(block.id);
      uniqueBlocks.add(block);

      for (const successor of block.successors) {
        edges.push({ from: block.id, to: successor.id });
        queue.push(successor);
      }
    }

    // 优化CFG：移除空块并重新构建边
    const optimizedResult = this.optimizeCFG(Array.from(uniqueBlocks), edges, entryBlock, this.currentFunctionExitBlock!);
    
    return {
      functionName: funcDecl.name,
      entryBlock: entryBlock,
      exitBlock: this.currentFunctionExitBlock,
      blocks: optimizedResult.blocks,
      edges: optimizedResult.edges,
    };
  }

  private generateBlockCFG(
    blockStmt: BlockStatement,
    currentBlock: BasicBlock
  ): { blocks: BasicBlock[]; entry: BasicBlock; exit: BasicBlock } {
    const blocks: BasicBlock[] = [];
    let entryBlock = currentBlock;
    let exitBlock = currentBlock;

    // 按照理论：线性执行到跳转点，合并连续语句
    for (const stmt of blockStmt.statements) {
      // 跳过空语句
      if (stmt.type === StatementType.EMPTY_STATEMENT) {
        continue;
      }
      
      if (isControlFlowStatement(stmt)) {
        // 控制流语句：创建新的基本块
        const { blocks: stmtBlocks, entry: stmtEntry, exit: stmtExit } = this.generateStatementCFG(
          stmt,
          exitBlock
        );
        blocks.push(...stmtBlocks);
        
        // 关键修复：控制流语句后，创建新的基本块用于后续语句
        // 而不是将后续语句添加到控制流语句的出口块中
        if (stmt.type === StatementType.IF_STATEMENT || stmt.type === StatementType.WHILE_STATEMENT || stmt.type === StatementType.FOR_STATEMENT) {
          // 对于if/while/for语句，后续语句应该在新的基本块中
          const nextBlock = this.newBlock();
          blocks.push(nextBlock);
          this.connectBlocks(stmtExit, nextBlock);
          exitBlock = nextBlock;
        } else {
          // 对于return/break/continue语句，直接使用stmtExit
          exitBlock = stmtExit;
        }
      } else if (stmt.type === StatementType.BLOCK_STATEMENT) {
        const innerBlock = stmt as BlockStatement;
        const hasControlFlow = this.blockContainsControlFlow(innerBlock);
        if (hasControlFlow) {
          // 有控制流，递归分块
          const { blocks: nestedBlocks, exit: nestedExit } = this.generateBlockCFG(innerBlock, exitBlock);
          blocks.push(...nestedBlocks);
          exitBlock = nestedExit;
        } else {
          // 无控制流，作为独立整体
          const newBlock = this.newBlock([stmt]);
          blocks.push(newBlock);
          this.connectBlocks(exitBlock, newBlock);
          exitBlock = newBlock;
        }
      } else {
        // 简单语句：添加到当前块
        exitBlock.statements.push(stmt);
      }
    }
    
    // 确保至少有一个块
    if (blocks.length === 0) {
      blocks.push(exitBlock);
    }
    
    return { blocks, entry: entryBlock, exit: exitBlock };
  }

  private blockContainsControlFlow(block: BlockStatement): boolean {
    return block.statements.some(s =>
      isControlFlowStatement(s) ||
      (s.type === StatementType.BLOCK_STATEMENT && this.blockContainsControlFlow(s as BlockStatement))
    );
  }

  // 注意：BlockStatement 不再被视为控制流语句，而是作为普通语句处理
  // 直接使用全局的 isControlFlowStatement 函数

  private generateStatementCFG(
    stmt: Statement,
    currentBlock: BasicBlock
  ): { blocks: BasicBlock[]; entry: BasicBlock; exit: BasicBlock } {
    switch (stmt.type) {
      case StatementType.IF_STATEMENT:
        return this.generateIfCFG(stmt as IfStatement, currentBlock);
      case StatementType.WHILE_STATEMENT:
        return this.generateWhileCFG(stmt as WhileStatement, currentBlock);
      case StatementType.FOR_STATEMENT:
        return this.generateForCFG(stmt as ForStatement, currentBlock);
      case StatementType.RETURN_STATEMENT:
        return this.generateReturnCFG(stmt, currentBlock);
      case StatementType.BREAK_STATEMENT:
        return this.generateBreakCFG(stmt, currentBlock);
      case StatementType.CONTINUE_STATEMENT:
        return this.generateContinueCFG(stmt, currentBlock);
      case StatementType.BLOCK_STATEMENT:
        return this.generateBlockCFG(stmt as BlockStatement, currentBlock);
      case StatementType.EMPTY_STATEMENT:
        // Empty statement doesn't generate a new block, just passes through
        return { blocks: [], entry: currentBlock, exit: currentBlock };
      default:
        // For simple statements, add to current block
        return this.generateSimpleStatementCFG(stmt, currentBlock);
    }
  }

  private generateReturnCFG(stmt: ReturnStatement, currentBlock: BasicBlock): { blocks: BasicBlock[]; entry: BasicBlock; exit: BasicBlock } {
    const returnBlock = this.newBlock([stmt]);
    this.connectBlocks(currentBlock, returnBlock);
    this.connectBlocks(returnBlock, this.currentFunctionExitBlock!);
    return { blocks: [returnBlock], entry: currentBlock, exit: returnBlock };
  }

  private generateBreakCFG(stmt: BreakStatement, currentBlock: BasicBlock): { blocks: BasicBlock[]; entry: BasicBlock; exit: BasicBlock } {
    const breakBlock = this.newBlock([stmt]);
    this.connectBlocks(currentBlock, breakBlock);
    if (this.loopStack.length > 0) {
      this.connectBlocks(breakBlock, this.loopStack[this.loopStack.length - 1]!.breakTarget);
    }
    return { blocks: [breakBlock], entry: currentBlock, exit: breakBlock };
  }

  private generateContinueCFG(stmt: ContinueStatement, currentBlock: BasicBlock): { blocks: BasicBlock[]; entry: BasicBlock; exit: BasicBlock } {
    const continueBlock = this.newBlock([stmt]);
    this.connectBlocks(currentBlock, continueBlock);
    if (this.loopStack.length > 0) {
      this.connectBlocks(continueBlock, this.loopStack[this.loopStack.length - 1]!.continueTarget);
    }
    return { blocks: [continueBlock], entry: currentBlock, exit: continueBlock };
  }

  private generateSimpleStatementCFG(stmt: Statement, currentBlock: BasicBlock): { blocks: BasicBlock[]; entry: BasicBlock; exit: BasicBlock } {
    const simpleBlock = this.newBlock([stmt]);
    this.connectBlocks(currentBlock, simpleBlock);
    return { blocks: [simpleBlock], entry: currentBlock, exit: simpleBlock };
  }

  private generateIfCFG(
    ifStmt: IfStatement,
    currentBlock: BasicBlock
  ): { blocks: BasicBlock[]; entry: BasicBlock; exit: BasicBlock } {
    const blocks: BasicBlock[] = [];
    
    // 条件检查块：包含条件表达式
    const conditionBlock = this.createConditionBlock(ifStmt.condition);
    blocks.push(conditionBlock);
    this.connectBlocks(currentBlock, conditionBlock);
    
    // then分支
    const thenEntryBlock = this.newBlock();
    const { blocks: thenBlocks, exit: thenExit } = this.generateBlockCFG(
      ifStmt.thenBranch as BlockStatement,
      thenEntryBlock
    );
    blocks.push(...thenBlocks);
    this.connectBlocks(conditionBlock, thenEntryBlock);

    let elseExit: BasicBlock;
    if (ifStmt.elseBranch) {
      const elseEntryBlock = this.newBlock();
      let elseBlocks: BasicBlock[] = [];
      let currentElseExit: BasicBlock;
      
      // 处理 else if：如果 else 分支是 if 语句，需要递归处理
      if (ifStmt.elseBranch.type === StatementType.IF_STATEMENT) {
        const nestedIfResult = this.generateIfCFG(ifStmt.elseBranch as IfStatement, elseEntryBlock);
        elseBlocks = nestedIfResult.blocks;
        currentElseExit = nestedIfResult.exit;
      } else if (ifStmt.elseBranch.type === StatementType.BLOCK_STATEMENT) {
        const result = this.generateBlockCFG(
          ifStmt.elseBranch as BlockStatement,
          elseEntryBlock
        );
        elseBlocks = result.blocks;
        currentElseExit = result.exit;
      } else {
        // 单个语句
        const singleStmtBlock = this.newBlock();
        singleStmtBlock.statements.push(ifStmt.elseBranch);
        elseBlocks = [singleStmtBlock];
        currentElseExit = singleStmtBlock;
      }
      
      blocks.push(...elseBlocks);
      this.connectBlocks(conditionBlock, elseEntryBlock);
      elseExit = currentElseExit;
    } else {
      elseExit = conditionBlock; // If no else, false branch goes to merge
    }

    // 智能合并逻辑
      // 检查两个分支是否都直接返回
      const thenReturns = this.endsWithReturn(thenExit);
      const elseReturns = ifStmt.elseBranch ? this.endsWithReturn(elseExit) : false;

    if (thenReturns && elseReturns) {
        // 两个分支都返回，不需要合并块
        // 但是需要创建一个虚拟的合并块来保持死代码的独立性
        const mergeBlock = this.newBlock();
        blocks.push(mergeBlock);
        
        // 两个分支都连接到合并块（虽然不会执行到）
        this.connectBlocks(thenExit, mergeBlock);
        this.connectBlocks(elseExit, mergeBlock);
        
        // 合并块不连接到任何地方，保持死代码的独立性
        return { blocks, entry: currentBlock, exit: mergeBlock };
    } else if (thenReturns && !elseReturns) {
        // then分支返回，else分支不返回，else分支继续执行
        this.connectBlocks(thenExit, this.currentFunctionExitBlock!);
        // 确保conditionBlock的后继块顺序正确：then分支在前，else分支在后
        return { blocks, entry: currentBlock, exit: elseExit };
    } else if (!thenReturns && elseReturns) {
        // else分支返回，then分支不返回，then分支继续执行
        this.connectBlocks(elseExit, this.currentFunctionExitBlock!);
        // 确保conditionBlock的后继块顺序正确：then分支在前，else分支在后
        return { blocks, entry: currentBlock, exit: thenExit };
      }

    // 默认行为：创建合并块
    const mergeBlock = this.newBlock();
    blocks.push(mergeBlock);
    this.connectBlocks(thenExit, mergeBlock);
    if (ifStmt.elseBranch) {
      this.connectBlocks(elseExit, mergeBlock);
    } else {
      this.connectBlocks(conditionBlock, mergeBlock); // If no else, false branch goes to merge
    }

    return { blocks, entry: currentBlock, exit: mergeBlock };
  }

  private generateWhileCFG(
    whileStmt: WhileStatement,
    currentBlock: BasicBlock
  ): { blocks: BasicBlock[]; entry: BasicBlock; exit: BasicBlock } {
    const blocks: BasicBlock[] = [];
    
    // 循环头块：包含条件检查
    const loopHeader = this.createConditionBlock(whileStmt.condition);
    blocks.push(loopHeader);
    this.connectBlocks(currentBlock, loopHeader);

    const loopBodyEntry = this.newBlock();
    const loopExit = this.newBlock(); // Exit block for the loop
    blocks.push(loopBodyEntry, loopExit);

    this.loopStack.push({ breakTarget: loopExit, continueTarget: loopHeader });

    const { blocks: bodyBlocks, exit: bodyExit } = this.generateBlockCFG(
      whileStmt.body as BlockStatement,
      loopBodyEntry
    );
    blocks.push(...bodyBlocks);
    
    // 智能合并逻辑：检查循环体是否总是返回
    if (this.endsWithReturn(bodyExit)) {
      // 循环体总是返回，不需要循环回退
      this.connectBlocks(loopHeader, loopBodyEntry); // True branch to body
      this.connectBlocks(loopHeader, loopExit); // False branch to exit
      // 不连接 bodyExit 到 loopHeader，因为总是返回
    } else {
      // 正常循环逻辑
      this.connectBlocks(loopHeader, loopBodyEntry); // True branch to body
      this.connectBlocks(bodyExit, loopHeader); // Loop back to header
      this.connectBlocks(loopHeader, loopExit); // False branch to exit
    }

    this.loopStack.pop();
    return { blocks, entry: currentBlock, exit: loopExit };
  }

  private generateForCFG(
    forStmt: ForStatement,
    currentBlock: BasicBlock
  ): { blocks: BasicBlock[]; entry: BasicBlock; exit: BasicBlock } {
    const blocks: BasicBlock[] = [];
    
    // 1. Initialization
    let initExitBlock = currentBlock;
    if (forStmt.init) {
      const initBlock = this.newBlock([forStmt.init]);
      blocks.push(initBlock);
      this.connectBlocks(currentBlock, initBlock);
      initExitBlock = initBlock;
    }
    
    // 2. Condition (Loop Header)
    const loopHeader = forStmt.condition 
      ? this.createConditionBlock(forStmt.condition)
      : this.newBlock();
    blocks.push(loopHeader);
    this.connectBlocks(initExitBlock, loopHeader);

    // 3. Loop Body
    const loopBodyEntry = this.newBlock();
    const loopExit = this.newBlock();
    const loopUpdate = this.newBlock(); // Update block
    if (forStmt.update) {
      loopUpdate.statements.push(forStmt.update);
    }
    blocks.push(loopBodyEntry, loopExit, loopUpdate);

    this.loopStack.push({ breakTarget: loopExit, continueTarget: loopUpdate });

    const { blocks: bodyBlocks, exit: bodyExit } = this.generateBlockCFG(
      forStmt.body as BlockStatement,
      loopBodyEntry
    );
    blocks.push(...bodyBlocks);

    // 智能合并逻辑：检查循环体是否总是返回
    if (this.endsWithReturn(bodyExit)) {
      // 循环体总是返回，不需要循环回退
      this.connectBlocks(loopHeader, loopBodyEntry); // True branch to body
      this.connectBlocks(loopHeader, loopExit); // False branch to exit
      // 不连接 bodyExit 到 loopUpdate，因为总是返回
    } else {
      // 正常循环逻辑
      this.connectBlocks(loopHeader, loopBodyEntry); // True branch to body
      this.connectBlocks(bodyExit, loopUpdate); // Body to update
      this.connectBlocks(loopUpdate, loopHeader); // Update back to header
      this.connectBlocks(loopHeader, loopExit); // False branch to exit
    }

    this.loopStack.pop();
    return { blocks, entry: currentBlock, exit: loopExit };
  }

  private optimizeCFG(
    blocks: BasicBlock[], 
    edges: { from: string; to: string }[], 
    entryBlock: BasicBlock, 
    exitBlock: BasicBlock
  ): { blocks: BasicBlock[]; edges: { from: string; to: string }[] } {
    // 1. 移除空块
    const optimizedBlocks = this.removeEmptyBlocks(blocks);
    
    // 5. 合并可合并的基本块
    const mergedBlocks = this.mergeBlocks(optimizedBlocks, entryBlock, exitBlock);
    
    // 6. 重新构建边（去重，避免重复边）
    const optimizedEdges: { from: string; to: string }[] = [];
    const edgeSet = new Set<string>();
    for (const block of mergedBlocks) {
      for (const successor of block.successors) {
        const edgeKey = `${block.id}→${successor.id}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          optimizedEdges.push({ from: block.id, to: successor.id });
        }
      }
    }
    
    return {
      blocks: mergedBlocks,
      edges: optimizedEdges
    };
  }

  /**
   * 合并可合并的基本块
   * 合并条件：块A只有一个后继块B，且块B只有一个前驱块A
   * 
   * 合并规则：
   * - 入口块可以被合并（保持入口标记）
   * - 出口块可以被合并到其他块（继承出口标记）
   * - 出口块不作为"当前块"参与合并判断
   */
  private mergeBlocks(
    blocks: BasicBlock[], 
    entryBlock: BasicBlock, 
    exitBlock: BasicBlock
  ): BasicBlock[] {
    let currentBlocks = [...blocks];
    let changed = true;
    
    // 重复合并直到没有更多可合并的块
    while (changed) {
      changed = false;
      const blocksToRemove = new Set<BasicBlock>();
      
      for (const block of currentBlocks) {
        // 跳过出口块和已标记删除的块
        if (block.isExit || blocksToRemove.has(block)) {
          continue;
        }
        
        // 核心合并条件检查：块A只有一个后继块B，且块B只有一个前驱块A
        if (this.canMerge(block)) {
          const successor = block.successors[0]!;
          
          // 执行合并操作
          this.mergeBlockInto(block, successor);
          
          // 标记后继块为待删除
          blocksToRemove.add(successor);
          changed = true;
        }
      }
      
      // 移除已合并的块
      if (blocksToRemove.size > 0) {
        currentBlocks = currentBlocks.filter(block => !blocksToRemove.has(block));
      }
    }
    
    return currentBlocks;
  }

  /**
   * 检查块是否可以与它的后继合并
   * 条件：块A只有一个后继块B，且块B只有一个前驱块A
   */
  private canMerge(block: BasicBlock): boolean {
    // 块必须有且仅有一个后继
    if (block.successors.length !== 1) {
      return false;
    }
    
    const successor = block.successors[0]!;
    
    // 后继必须有且仅有一个前驱，且这个前驱必须是当前块
    return successor.predecessors.length === 1 && 
           successor.predecessors[0]!.id === block.id;
  }

  /**
   * 将后继块合并到当前块中
   */
  private mergeBlockInto(block: BasicBlock, successor: BasicBlock): void {
    // 1. 合并语句：将后继块的所有语句追加到当前块
    block.statements.push(...successor.statements);
    
    // 2. 继承特殊标记：如果后继是出口块，当前块成为出口块
    if (successor.isExit) {
      block.isExit = true;
    }
    
    // 3. 更新后继关系：当前块的后继更新为后继块的后继
    const oldSuccessors = [...successor.successors];
    block.successors = oldSuccessors;
    
    // 4. 更新所有新后继块的前驱关系
    for (const newSucc of oldSuccessors) {
      // 移除后继块作为前驱
      const predIndex = newSucc.predecessors.findIndex(p => p.id === successor.id);
      if (predIndex >= 0) {
        newSucc.predecessors.splice(predIndex, 1);
      }
      // 添加当前块作为前驱（如果还没有）
      if (!newSucc.predecessors.includes(block)) {
        newSucc.predecessors.push(block);
      }
    }
  }

  public visualize(cfg: ControlFlowGraph): string {
    const visualizer = new CFGVisualizer();
    return visualizer.visualize(cfg);
  }
}

export class CFGVisualizer {
  public visualize(cfg: ControlFlowGraph): string {
    let result = '';
    
    // 分析CFG信息
    // const analysis = this.analyzeCFG(cfg);
    
    // 显示CFG分析结果
    // result += this.displayCFGAnalysis(analysis);
    // result += '\n';
    
    // 显示所有基本块
    for (const block of cfg.blocks) {
      result += `基本块: ${block.id}\n`;
      if (block.isEntry) result += '  [入口块]\n';
      if (block.isExit) result += '  [出口块]\n';
      
      result += '  语句:\n';
      if (block.statements.length === 0) {
        result += '    - (空)\n';
      } else {
        for (const stmt of block.statements) {
          const displayStr = this.statementToDisplayString(stmt);
          // 处理多行内容（BlockStatement）
          const lines = displayStr.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (i === 0) {
              result += `    - ${lines[i]}\n`;
            } else {
              result += `      ${lines[i]}\n`;
            }
          }
        }
      }
      
      result += `  前驱块: ${block.predecessors.map(p => p.id).join(', ') || '无'}\n`;
      result += `  后继块: ${block.successors.map(s => s.id).join(', ') || '无'}\n`;
      
      result += `\n`;
    }
    
    // 显示控制流边
    result += `控制流边:\n`;
    for (const edge of cfg.edges) {
      result += `  ${edge.from} → ${edge.to}\n`;
    }
    
    return result;
  }

  private analyzeCFG(cfg: ControlFlowGraph): CFGAnalysis {
    const analysis: CFGAnalysis = {
      totalBlocks: cfg.blocks.length,
      entryBlocks: cfg.blocks.filter(b => b.isEntry).length,
      exitBlocks: cfg.blocks.filter(b => b.isExit).length,
      variables: new Set(),
      functions: new Set(),
      constants: new Set(),
      operators: new Set(),
      statements: new Map(),
      controlFlowStructures: new Map(),
      deadCodeBlocks: [],
      complexity: 0
    };

    // 分析每个基本块
    for (const block of cfg.blocks) {
      this.analyzeBlock(block, analysis);
    }

    // 计算圈复杂度
    analysis.complexity = cfg.edges.length - cfg.blocks.length + 2;

    return analysis;
  }

  private analyzeBlock(block: BasicBlock, analysis: CFGAnalysis): void {
    for (const stmt of block.statements) {
      this.analyzeStatement(stmt, analysis);
    }

    // 统计语句类型
    const stmtTypes = new Map<string, number>();
    for (const stmt of block.statements) {
      const count = stmtTypes.get(stmt.type) || 0;
      stmtTypes.set(stmt.type, count + 1);
    }
    analysis.statements.set(block.id, stmtTypes);
  }

  private analyzeStatement(stmt: Statement, analysis: CFGAnalysis): void {
    switch (stmt.type) {
      case StatementType.LET_DECLARATION:
        const letDecl = stmt as LetDeclaration;
        analysis.variables.add(letDecl.name);
        if (letDecl.initializer) {
          this.analyzeExpression(letDecl.initializer, analysis);
        }
        break;
      case StatementType.VARIABLE_DECLARATION:
        const varDecl = stmt as VariableDeclaration;
        analysis.variables.add(varDecl.name);
        if (varDecl.initializer) {
          this.analyzeExpression(varDecl.initializer, analysis);
        }
        break;
      case StatementType.ASSIGNMENT_STATEMENT:
        const assignStmt = stmt as AssignmentStatement;
        analysis.variables.add(assignStmt.target.name);
        this.analyzeExpression(assignStmt.value, analysis);
        break;
      case StatementType.EXPRESSION_STATEMENT:
        const exprStmt = stmt as ExpressionStatement;
        this.analyzeExpression(exprStmt.expression, analysis);
        break;
      case StatementType.IF_STATEMENT:
        const ifStmt = stmt as IfStatement;
        analysis.controlFlowStructures.set('if', (analysis.controlFlowStructures.get('if') || 0) + 1);
        this.analyzeExpression(ifStmt.condition, analysis);
        break;
      case StatementType.WHILE_STATEMENT:
        const whileStmt = stmt as WhileStatement;
        analysis.controlFlowStructures.set('while', (analysis.controlFlowStructures.get('while') || 0) + 1);
        this.analyzeExpression(whileStmt.condition, analysis);
        break;
      case StatementType.FOR_STATEMENT:
        const forStmt = stmt as ForStatement;
        analysis.controlFlowStructures.set('for', (analysis.controlFlowStructures.get('for') || 0) + 1);
        if (forStmt.condition) {
          this.analyzeExpression(forStmt.condition, analysis);
        }
        break;
    }
  }

  private analyzeExpression(expr: Expression | undefined, analysis: CFGAnalysis): void {
    if (!expr) return;

    switch (expr.type) {
      case StatementType.IDENTIFIER:
        analysis.variables.add(expr.name);
        break;
      case StatementType.NUMBER_LITERAL:
        analysis.constants.add(expr.value);
        break;
      case StatementType.BINARY_EXPRESSION:
        analysis.operators.add(expr.operator);
        this.analyzeExpression(expr.left, analysis);
        this.analyzeExpression(expr.right, analysis);
        break;
      case StatementType.UNARY_EXPRESSION:
        analysis.operators.add(expr.operator);
        this.analyzeExpression(expr.operand, analysis);
        break;
      case StatementType.FUNCTION_CALL:
        analysis.functions.add(expr.callee.name);
        for (const arg of expr.arguments) {
          this.analyzeExpression(arg, analysis);
        }
        break;
    }
  }

  private displayCFGAnalysis(analysis: CFGAnalysis): string {
    let result = '';
    result += `CFG分析结果:\n`;
    result += `==================\n`;
    result += `总基本块数: ${analysis.totalBlocks}\n`;
    result += `入口块数: ${analysis.entryBlocks}\n`;
    result += `出口块数: ${analysis.exitBlocks}\n`;
    result += `圈复杂度: ${analysis.complexity}\n\n`;
    
    result += `变量信息:\n`;
    result += `  变量总数: ${analysis.variables.size}\n`;
    result += `  变量列表: ${Array.from(analysis.variables).join(', ')}\n\n`;
    
    result += `常量信息:\n`;
    result += `  常量总数: ${analysis.constants.size}\n`;
    result += `  常量列表: ${Array.from(analysis.constants).join(', ')}\n\n`;
    
    result += `操作符信息:\n`;
    result += `  操作符总数: ${analysis.operators.size}\n`;
    result += `  操作符列表: ${Array.from(analysis.operators).join(', ')}\n\n`;
    
    result += `函数调用信息:\n`;
    result += `  函数总数: ${analysis.functions.size}\n`;
    result += `  函数列表: ${Array.from(analysis.functions).join(', ')}\n\n`;
    
    result += `控制流结构:\n`;
    for (const [type, count] of analysis.controlFlowStructures) {
      result += `  ${type}: ${count}个\n`;
    }
    result += '\n';
    
    result += `基本块语句统计:\n`;
    for (const [blockId, stmtTypes] of analysis.statements) {
      result += `  ${blockId}:\n`;
      for (const [type, count] of stmtTypes) {
        result += `    ${type}: ${count}个\n`;
      }
    }
    
    return result;
  }

  private statementToDisplayString(stmt: Statement): string {
    switch (stmt.type) {
      case StatementType.VARIABLE_DECLARATION:
        const varDecl = stmt as VariableDeclaration;
        return `声明变量 ${varDecl.name}`;
      case StatementType.LET_DECLARATION:
        const letDecl = stmt as LetDeclaration;
        return `声明let变量 ${letDecl.name}`;
      case StatementType.ASSIGNMENT_STATEMENT:
        const assignStmt = stmt as AssignmentStatement;
        return `赋值 ${assignStmt.target.name} = ${this.expressionToDisplayString(assignStmt.value)}`;
      case StatementType.RETURN_STATEMENT:
        return `返回语句`;
      case StatementType.IF_STATEMENT:
        return `If条件: ${this.expressionToDisplayString((stmt as IfStatement).condition)}`;
      case StatementType.WHILE_STATEMENT:
        return `While条件: ${this.expressionToDisplayString((stmt as WhileStatement).condition)}`;
      case StatementType.FOR_STATEMENT:
        return `For循环`;
      case StatementType.EXPRESSION_STATEMENT:
        const exprStmt = stmt as ExpressionStatement;
        return this.expressionToDisplayString(exprStmt.expression);
      case StatementType.BREAK_STATEMENT:
        return `Break语句`;
      case StatementType.CONTINUE_STATEMENT:
        return `Continue语句`;
      case StatementType.BLOCK_STATEMENT:
        const blockStmt = stmt as BlockStatement;
        if (blockStmt.statements.length === 0) {
          return `代码块 { }`;
        }
        let content = '代码块 \n{\n';
        for (const innerStmt of blockStmt.statements) {
          if (innerStmt.type === StatementType.EMPTY_STATEMENT) continue;
          content += `    - ${this.statementToDisplayString(innerStmt)}\n`;
        }
        content += '}';
        return content;
      case StatementType.EMPTY_STATEMENT:
        return `空语句`;
      default:
        return `未知语句类型: ${stmt.type}`;
    }
  }

  private expressionToDisplayString(expr: Expression): string {
    switch (expr.type) {
      case StatementType.NUMBER_LITERAL:
        return `数字: ${expr.value}`;
      case StatementType.IDENTIFIER:
        return `变量: ${expr.name}`;
      case StatementType.BINARY_EXPRESSION:
        return `${this.expressionToDisplayString(expr.left)} ${expr.operator} ${this.expressionToDisplayString(expr.right)}`;
      case StatementType.UNARY_EXPRESSION:
        return `${expr.operator}${this.expressionToDisplayString(expr.operand)}`;
      case StatementType.FUNCTION_CALL:
        return `函数调用: ${expr.callee.name}(...)`;
      default:
        return `表达式`;
    }
  }

}

