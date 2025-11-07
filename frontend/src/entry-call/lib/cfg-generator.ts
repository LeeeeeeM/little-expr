import type {
  Program,
  Statement,
  FunctionDeclaration,
  IfStatement,
  WhileStatement,
  ForStatement,
  ReturnStatement,
  BlockStatement,
  Expression,
  ExpressionStatement,
} from './types';
import { StatementType } from './types';
import type { BasicBlock, ControlFlowGraph } from './cfg-types';

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
        cfgs.push(this.generateFunctionCFG(stmt as FunctionDeclaration));
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
    const emptyBlocks = blocks.filter(block => 
      !block.isEntry && 
      !block.isExit && 
      block.statements.length === 0
    );
    
    if (emptyBlocks.length === 0) {
      return blocks;
    }
    
    for (const emptyBlock of emptyBlocks) {
      const predecessors = emptyBlock.predecessors;
      const successors = emptyBlock.successors;
      
      if (predecessors.length === 1 && successors.length === 1) {
        this.replaceBlockConnection(predecessors[0]!, emptyBlock, successors[0]!);
      } else if (predecessors.length > 0 && successors.length === 1) {
        const succ = successors[0]!;
        for (const pred of predecessors) {
          this.replaceBlockConnection(pred, emptyBlock, succ);
        }
      } else if (predecessors.length === 1 && successors.length > 1) {
        const pred = predecessors[0]!;
        for (const succ of successors) {
          this.replaceBlockConnection(pred, emptyBlock, succ);
        }
      }
    }
    
    return blocks.filter(block => !emptyBlocks.includes(block));
  }

  private replaceBlockConnection(pred: BasicBlock, emptyBlock: BasicBlock, target: BasicBlock): void {
    const emptyBlockIndex = pred.successors.findIndex(s => s.id === emptyBlock.id);
    pred.successors = pred.successors.filter(s => s.id !== emptyBlock.id);
    
    if (!pred.successors.includes(target)) {
      if (emptyBlockIndex >= 0 && emptyBlockIndex < pred.successors.length) {
        pred.successors.splice(emptyBlockIndex, 0, target);
      } else {
        pred.successors.push(target);
      }
    }
    
    target.predecessors = target.predecessors.filter(p => p.id !== emptyBlock.id);
    if (!target.predecessors.includes(pred)) {
      target.predecessors.push(pred);
    }
  }

  private connectBlocks(from: BasicBlock, to: BasicBlock): void {
    if (!from.successors.includes(to)) {
      from.successors.push(to);
    }
    if (!to.predecessors.includes(from)) {
      to.predecessors.push(from);
    }
  }

  /**
   * 确保包含 return 语句的块只连接到出口块
   * 移除所有其他错误的连接
   */
  private ensureOnlyExitConnection(block: BasicBlock): void {
    if (!this.endsWithReturn(block)) {
      return;
    }
    
    // 如果块以 return 结束，应该只有出口块作为后继
    const exitBlock = this.currentFunctionExitBlock!;
    
    // 移除所有不是出口块的后继连接
    const wrongSuccessors = block.successors.filter(succ => succ.id !== exitBlock.id);
    for (const wrongSucc of wrongSuccessors) {
      // 从前驱列表中移除当前块
      const predIndex = wrongSucc.predecessors.findIndex(p => p.id === block.id);
      if (predIndex >= 0) {
        wrongSucc.predecessors.splice(predIndex, 1);
      }
    }
    
    // 设置后继为只有出口块
    block.successors = block.successors.filter(succ => succ.id === exitBlock.id);
    
    // 确保连接到出口块
    if (!block.successors.includes(exitBlock)) {
      this.connectBlocks(block, exitBlock);
    }
  }

  private endsWithReturn(block: BasicBlock): boolean {
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

    const { entry: bodyEntry, exit: bodyExit } = this.generateBlockCFG(
      funcDecl.body,
      currentBlock
    );
    
    if (bodyEntry !== currentBlock) {
      this.connectBlocks(currentBlock, bodyEntry);
    }
    currentBlock = bodyExit;

    if (currentBlock !== this.currentFunctionExitBlock) {
      this.connectBlocks(currentBlock, this.currentFunctionExitBlock);
    }

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

    const optimizedResult = this.optimizeCFG(Array.from(uniqueBlocks), edges, entryBlock, this.currentFunctionExitBlock!);
    
    return {
      functionName: funcDecl.name,
      entryBlock: entryBlock,
      exitBlock: this.currentFunctionExitBlock,
      blocks: optimizedResult.blocks,
      edges: optimizedResult.edges,
      parameters: funcDecl.parameters, // 保存函数参数信息
    };
  }

  private generateBlockCFG(
    blockStmt: BlockStatement,
    currentBlock: BasicBlock
  ): { blocks: BasicBlock[]; entry: BasicBlock; exit: BasicBlock } {
    const blocks: BasicBlock[] = [];
    let entryBlock = currentBlock;
    let exitBlock = currentBlock;

    for (const stmt of blockStmt.statements) {
      if (stmt.type === StatementType.EMPTY_STATEMENT) {
        continue;
      }
      
      // 如果当前 exitBlock 以 return 语句结束，不再处理后续语句
      // 因为 return 后的代码不会执行
      if (this.endsWithReturn(exitBlock)) {
        break;
      }
      
      if (isControlFlowStatement(stmt)) {
      const { blocks: stmtBlocks, exit: stmtExit } = this.generateStatementCFG(
        stmt,
        exitBlock
      );
      blocks.push(...stmtBlocks);
        
        // 关键修复：控制流语句后，创建新的基本块用于后续语句
        // 但是如果 thenExit 或 elseExit 以 return 结束，则不应该创建新的后续块
        if (stmt.type === StatementType.IF_STATEMENT || stmt.type === StatementType.WHILE_STATEMENT || stmt.type === StatementType.FOR_STATEMENT) {
          // 对于if/while/for语句，后续语句应该在新的基本块中
          // 但是如果 thenExit 或 elseExit 以 return 结束，则不应该创建新的后续块
          const nextBlock = this.newBlock();
          blocks.push(nextBlock);
          // 只有当 stmtExit 不以 return 结束时，才连接后续块
          if (!this.endsWithReturn(stmtExit)) {
          this.connectBlocks(stmtExit, nextBlock);
          exitBlock = nextBlock;
          } else {
            // 如果 stmtExit 以 return 结束，不需要连接后续块
            exitBlock = stmtExit;
          }
        } else if (stmt.type === StatementType.RETURN_STATEMENT) {
          // 对于return语句，直接使用stmtExit（已经连接到出口块）
          exitBlock = stmtExit;
          // return 后不再处理后续语句
          break;
        } else {
          // 对于break/continue语句，直接使用stmtExit
          exitBlock = stmtExit;
        }
      } else if (stmt.type === StatementType.BLOCK_STATEMENT) {
        const innerBlock = stmt as BlockStatement;
        const hasControlFlow = this.blockContainsControlFlow(innerBlock);
        if (hasControlFlow) {
          const { blocks: nestedBlocks, exit: nestedExit } = this.generateBlockCFG(innerBlock, exitBlock);
          blocks.push(...nestedBlocks);
          exitBlock = nestedExit;
        } else {
          const newBlock = this.newBlock([stmt]);
          blocks.push(newBlock);
          this.connectBlocks(exitBlock, newBlock);
          exitBlock = newBlock;
        }
      } else {
        exitBlock.statements.push(stmt);
      }
    }
    
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
        return this.generateReturnCFG(stmt as ReturnStatement, currentBlock);
      case StatementType.BLOCK_STATEMENT:
        return this.generateBlockCFG(stmt as BlockStatement, currentBlock);
      case StatementType.EMPTY_STATEMENT:
        return { blocks: [], entry: currentBlock, exit: currentBlock };
      default:
        return this.generateSimpleStatementCFG(stmt, currentBlock);
    }
  }

  private generateReturnCFG(stmt: ReturnStatement, currentBlock: BasicBlock): { blocks: BasicBlock[]; entry: BasicBlock; exit: BasicBlock } {
    const returnBlock = this.newBlock([stmt]);
    this.connectBlocks(currentBlock, returnBlock);
    this.connectBlocks(returnBlock, this.currentFunctionExitBlock!);
    return { blocks: [returnBlock], entry: currentBlock, exit: returnBlock };
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
    
    const conditionBlock = this.createConditionBlock(ifStmt.condition);
    blocks.push(conditionBlock);
    this.connectBlocks(currentBlock, conditionBlock);
    
    const thenEntryBlock = this.newBlock();
    const thenBranchIsBlock = ifStmt.thenBranch.type === StatementType.BLOCK_STATEMENT;
    let thenBlocks: BasicBlock[] = [];
    let thenExit: BasicBlock;
    if (thenBranchIsBlock) {
      const result = this.generateBlockCFG(ifStmt.thenBranch as BlockStatement, thenEntryBlock);
      thenBlocks = result.blocks;
      thenExit = result.exit;
    } else {
      thenExit = this.newBlock([ifStmt.thenBranch]);
      blocks.push(thenExit);
      this.connectBlocks(thenEntryBlock, thenExit);
    }
    blocks.push(...thenBlocks);
    this.connectBlocks(conditionBlock, thenEntryBlock);

    let elseExit: BasicBlock;
    if (ifStmt.elseBranch) {
      const elseEntryBlock = this.newBlock();
      let elseBlocks: BasicBlock[] = [];
      let currentElseExit: BasicBlock;
      
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
        const singleStmtBlock = this.newBlock();
        singleStmtBlock.statements.push(ifStmt.elseBranch);
        elseBlocks = [singleStmtBlock];
        currentElseExit = singleStmtBlock;
      }
      
      blocks.push(...elseBlocks);
      this.connectBlocks(conditionBlock, elseEntryBlock);
      elseExit = currentElseExit;
    } else {
      elseExit = conditionBlock;
    }

    const thenReturns = this.endsWithReturn(thenExit);
    const elseReturns = ifStmt.elseBranch ? this.endsWithReturn(elseExit) : false;

    if (thenReturns && elseReturns) {
      // 两个分支都返回，不需要合并块
      // 确保两个分支都连接到出口块
      if (!thenExit.successors.includes(this.currentFunctionExitBlock!)) {
        this.connectBlocks(thenExit, this.currentFunctionExitBlock!);
      }
      if (ifStmt.elseBranch && !elseExit.successors.includes(this.currentFunctionExitBlock!)) {
        this.connectBlocks(elseExit, this.currentFunctionExitBlock!);
      }
      // 返回一个虚拟的合并块，但不连接到任何地方
      const mergeBlock = this.newBlock();
      blocks.push(mergeBlock);
      return { blocks, entry: currentBlock, exit: mergeBlock };
    } else if (thenReturns && !elseReturns) {
      // then分支返回，else分支不返回，else分支继续执行
      // 确保 thenExit 只连接到出口块，移除其他错误的连接
      this.ensureOnlyExitConnection(thenExit);
      // 确保conditionBlock的后继块顺序正确：then分支在前，else分支在后
      return { blocks, entry: currentBlock, exit: elseExit };
    } else if (!thenReturns && elseReturns) {
      // else分支返回，then分支不返回，then分支继续执行
      // 确保 elseExit 只连接到出口块，移除其他错误的连接
      this.ensureOnlyExitConnection(elseExit);
      // 确保conditionBlock的后继块顺序正确：then分支在前，else分支在后
      return { blocks, entry: currentBlock, exit: thenExit };
    }

    const mergeBlock = this.newBlock();
    blocks.push(mergeBlock);
    this.connectBlocks(thenExit, mergeBlock);
    if (ifStmt.elseBranch) {
      this.connectBlocks(elseExit, mergeBlock);
    } else {
      this.connectBlocks(conditionBlock, mergeBlock);
    }

    return { blocks, entry: currentBlock, exit: mergeBlock };
  }

  private generateWhileCFG(
    whileStmt: WhileStatement,
    currentBlock: BasicBlock
  ): { blocks: BasicBlock[]; entry: BasicBlock; exit: BasicBlock } {
    const blocks: BasicBlock[] = [];
    
    const loopHeader = this.createConditionBlock(whileStmt.condition);
    blocks.push(loopHeader);
    this.connectBlocks(currentBlock, loopHeader);

    const loopBodyEntry = this.newBlock();
    const loopExit = this.newBlock();
    blocks.push(loopBodyEntry, loopExit);

    this.loopStack.push({ breakTarget: loopExit, continueTarget: loopHeader });

    const bodyIsBlock = whileStmt.body.type === StatementType.BLOCK_STATEMENT;
    let bodyBlocks: BasicBlock[] = [];
    let bodyExit: BasicBlock;
    if (bodyIsBlock) {
      const result = this.generateBlockCFG(whileStmt.body as BlockStatement, loopBodyEntry);
      bodyBlocks = result.blocks;
      bodyExit = result.exit;
    } else {
      bodyExit = this.newBlock([whileStmt.body]);
      blocks.push(bodyExit);
      this.connectBlocks(loopBodyEntry, bodyExit);
    }
    blocks.push(...bodyBlocks);
    
    if (this.endsWithReturn(bodyExit)) {
      this.connectBlocks(loopHeader, loopBodyEntry);
      this.connectBlocks(loopHeader, loopExit);
    } else {
      this.connectBlocks(loopHeader, loopBodyEntry);
      this.connectBlocks(bodyExit, loopHeader);
      this.connectBlocks(loopHeader, loopExit);
    }

    this.loopStack.pop();
    return { blocks, entry: currentBlock, exit: loopExit };
  }

  private generateForCFG(
    forStmt: ForStatement,
    currentBlock: BasicBlock
  ): { blocks: BasicBlock[]; entry: BasicBlock; exit: BasicBlock } {
    const blocks: BasicBlock[] = [];
    
    const initIsVarDecl = forStmt.init && 
      (forStmt.init.type === StatementType.VARIABLE_DECLARATION || 
       forStmt.init.type === StatementType.LET_DECLARATION);
    let forLoopStartCheckPoint: Statement | null = null;
    let forLoopEndCheckPoint: Statement | null = null;
    
    if (forStmt.body.type === StatementType.BLOCK_STATEMENT && initIsVarDecl) {
      const bodyStmts = (forStmt.body as BlockStatement).statements;
      if (bodyStmts.length > 0 && bodyStmts[0]!.type === 'StartCheckPoint') {
        forLoopStartCheckPoint = bodyStmts[0]!;
      }
      if (bodyStmts.length > 1 && bodyStmts[bodyStmts.length - 1]!.type === 'EndCheckPoint') {
        forLoopEndCheckPoint = bodyStmts[bodyStmts.length - 1]!;
      }
    }
    
    let initExitBlock = currentBlock;
    if (forStmt.init) {
      const initStatements: Statement[] = [];
      if (forLoopStartCheckPoint) {
        initStatements.push(forLoopStartCheckPoint);
      }
      initStatements.push(forStmt.init);
      
      const initBlock = this.newBlock(initStatements);
      blocks.push(initBlock);
      this.connectBlocks(currentBlock, initBlock);
      initExitBlock = initBlock;
    }
    
    const loopHeader = forStmt.condition 
      ? this.createConditionBlock(forStmt.condition)
      : this.newBlock();
    blocks.push(loopHeader);
    this.connectBlocks(initExitBlock, loopHeader);

    const loopBodyEntry = this.newBlock();
    const loopExit = this.newBlock();
    const loopUpdate = this.newBlock();
    if (forStmt.update) {
      loopUpdate.statements.push(forStmt.update);
    }
    blocks.push(loopBodyEntry, loopExit, loopUpdate);

    this.loopStack.push({ breakTarget: loopExit, continueTarget: loopUpdate });

    let bodyToProcess = forStmt.body;
    if (forLoopStartCheckPoint && forLoopEndCheckPoint && 
        forStmt.body.type === StatementType.BLOCK_STATEMENT) {
      const bodyStmts = (forStmt.body as BlockStatement).statements;
      const bodyWithoutCheckPoints = bodyStmts.slice(1, -1);
      bodyToProcess = {
        ...forStmt.body,
        statements: bodyWithoutCheckPoints
      } as BlockStatement;
    }

    const bodyIsBlock = bodyToProcess.type === StatementType.BLOCK_STATEMENT;
    let bodyBlocks: BasicBlock[] = [];
    let bodyExit: BasicBlock;
    if (bodyIsBlock) {
      const result = this.generateBlockCFG(bodyToProcess as BlockStatement, loopBodyEntry);
      bodyBlocks = result.blocks;
      bodyExit = result.exit;
    } else {
      bodyExit = this.newBlock([bodyToProcess]);
      blocks.push(bodyExit);
      this.connectBlocks(loopBodyEntry, bodyExit);
    }
    blocks.push(...bodyBlocks);
    
    if (forLoopEndCheckPoint) {
      loopExit.statements.unshift(forLoopEndCheckPoint);
    }

    if (this.endsWithReturn(bodyExit)) {
      this.connectBlocks(loopHeader, loopBodyEntry);
      this.connectBlocks(loopHeader, loopExit);
    } else {
      this.connectBlocks(loopHeader, loopBodyEntry);
      this.connectBlocks(bodyExit, loopUpdate);
      this.connectBlocks(loopUpdate, loopHeader);
      this.connectBlocks(loopHeader, loopExit);
    }

    this.loopStack.pop();
    return { blocks, entry: currentBlock, exit: loopExit };
  }

  private optimizeCFG(
    blocks: BasicBlock[], 
    _edges: { from: string; to: string }[], 
    entryBlock: BasicBlock, 
    exitBlock: BasicBlock
  ): { blocks: BasicBlock[]; edges: { from: string; to: string }[] } {
    const optimizedBlocks = this.removeEmptyBlocks(blocks);
    const mergedBlocks = this.mergeBlocks(optimizedBlocks, entryBlock, exitBlock);
    
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

  private mergeBlocks(
    blocks: BasicBlock[], 
    _entryBlock: BasicBlock, 
    _exitBlock: BasicBlock
  ): BasicBlock[] {
    let currentBlocks = [...blocks];
    let changed = true;
    
    while (changed) {
      changed = false;
      const blocksToRemove = new Set<BasicBlock>();
      
      for (const block of currentBlocks) {
        if (block.isExit || blocksToRemove.has(block)) {
          continue;
        }
        
        if (this.canMerge(block)) {
          const successor = block.successors[0]!;
          this.mergeBlockInto(block, successor);
          blocksToRemove.add(successor);
          changed = true;
        }
      }
      
      if (blocksToRemove.size > 0) {
        currentBlocks = currentBlocks.filter(block => !blocksToRemove.has(block));
      }
    }
    
    return currentBlocks;
  }

  private canMerge(block: BasicBlock): boolean {
    if (block.successors.length !== 1) {
      return false;
    }
    
    const successor = block.successors[0]!;
    return successor.predecessors.length === 1 && 
           successor.predecessors[0]!.id === block.id;
  }

  private mergeBlockInto(block: BasicBlock, successor: BasicBlock): void {
    block.statements.push(...successor.statements);
    
    if (successor.isExit) {
      block.isExit = true;
    }
    
    const oldSuccessors = [...successor.successors];
    block.successors = oldSuccessors;
    
    for (const newSucc of oldSuccessors) {
      const predIndex = newSucc.predecessors.findIndex(p => p.id === successor.id);
      if (predIndex >= 0) {
        newSucc.predecessors.splice(predIndex, 1);
      }
      if (!newSucc.predecessors.includes(block)) {
        newSucc.predecessors.push(block);
      }
    }
  }
}

