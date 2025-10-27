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
} from './ast';

export interface BasicBlock {
  id: string;
  statements: Statement[];
  predecessors: BasicBlock[];
  successors: BasicBlock[];
  isEntry?: boolean;
  isExit?: boolean;
}

export interface ControlFlowGraph {
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

export class CFGGenerator {
  private blockCounter: number = 0;
  private currentFunctionName: string = '';
  private currentFunctionExitBlock: BasicBlock | null = null;
  private loopStack: { breakTarget: BasicBlock; continueTarget: BasicBlock }[] = [];
  private smartMerging: boolean = false; // 智能合并开关

  public generate(program: Program, smartMerging: boolean = false): ControlFlowGraph[] {
    this.smartMerging = smartMerging;
    const cfgs: ControlFlowGraph[] = [];
    for (const stmt of program.statements) {
      if (stmt.type === 'FunctionDeclaration') {
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
    return lastStatement.type === 'ReturnStatement';
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

    const allBlocks: BasicBlock[] = [entryBlock, this.currentFunctionExitBlock];
    let currentBlock = entryBlock;

    // Process function body - 按照理论：线性执行到跳转点
    const { blocks: bodyBlocks, entry: bodyEntry, exit: bodyExit } = this.generateBlockCFG(
      funcDecl.body as BlockStatement,
      currentBlock
    );
    allBlocks.push(...bodyBlocks);
    
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
      if (stmt.type === 'EmptyStatement') {
        continue;
      }
      
      if (this.isControlFlowStatement(stmt)) {
        // 控制流语句：创建新的基本块
        const { blocks: stmtBlocks, entry: stmtEntry, exit: stmtExit } = this.generateStatementCFG(
          stmt,
          exitBlock
        );
        blocks.push(...stmtBlocks);
        exitBlock = stmtExit;
      } else {
        // 简单语句：添加到当前块
        exitBlock.statements.push(stmt);
      }
    }
    return { blocks, entry: entryBlock, exit: exitBlock };
  }

  private isControlFlowStatement(stmt: Statement): boolean {
    return stmt.type === 'IfStatement' ||
           stmt.type === 'WhileStatement' ||
           stmt.type === 'ForStatement' ||
           stmt.type === 'ReturnStatement' ||
           stmt.type === 'BreakStatement' ||
           stmt.type === 'ContinueStatement' ||
           stmt.type === 'BlockStatement';
  }

  private generateStatementCFG(
    stmt: Statement,
    currentBlock: BasicBlock
  ): { blocks: BasicBlock[]; entry: BasicBlock; exit: BasicBlock } {
    const blocks: BasicBlock[] = [];
    let entryBlock = currentBlock;
    let exitBlock = currentBlock;

    switch (stmt.type) {
      case 'IfStatement':
        return this.generateIfCFG(stmt as IfStatement, currentBlock);
      case 'WhileStatement':
        return this.generateWhileCFG(stmt as WhileStatement, currentBlock);
      case 'ForStatement':
        return this.generateForCFG(stmt as ForStatement, currentBlock);
      case 'ReturnStatement':
        const returnBlock = this.newBlock([stmt]);
        blocks.push(returnBlock);
        this.connectBlocks(currentBlock, returnBlock);
        this.connectBlocks(returnBlock, this.currentFunctionExitBlock!);
        return { blocks, entry: entryBlock, exit: returnBlock };
      case 'BreakStatement':
        const breakBlock = this.newBlock([stmt]);
        blocks.push(breakBlock);
        this.connectBlocks(currentBlock, breakBlock);
        if (this.loopStack.length > 0) {
          this.connectBlocks(breakBlock, this.loopStack[this.loopStack.length - 1]!.breakTarget);
        }
        return { blocks, entry: entryBlock, exit: breakBlock };
      case 'ContinueStatement':
        const continueBlock = this.newBlock([stmt]);
        blocks.push(continueBlock);
        this.connectBlocks(currentBlock, continueBlock);
        if (this.loopStack.length > 0) {
          this.connectBlocks(continueBlock, this.loopStack[this.loopStack.length - 1]!.continueTarget);
        }
        return { blocks, entry: entryBlock, exit: continueBlock };
      case 'BlockStatement':
        return this.generateBlockCFG(stmt as BlockStatement, currentBlock);
      case 'EmptyStatement':
        // Empty statement doesn't generate a new block, just passes through
        return { blocks: [], entry: entryBlock, exit: currentBlock };
      default:
        // For simple statements, add to current block
        const simpleBlock = this.newBlock([stmt]);
        blocks.push(simpleBlock);
        this.connectBlocks(currentBlock, simpleBlock);
        return { blocks, entry: entryBlock, exit: simpleBlock };
    }
  }

  private generateIfCFG(
    ifStmt: IfStatement,
    currentBlock: BasicBlock
  ): { blocks: BasicBlock[]; entry: BasicBlock; exit: BasicBlock } {
    const blocks: BasicBlock[] = [];
    
    // 条件检查块：包含条件表达式
    const conditionBlock = this.newBlock();
    // 将条件表达式包装为ExpressionStatement
    const conditionStmt: ExpressionStatement = {
      type: 'ExpressionStatement',
      expression: ifStmt.condition
    };
    conditionBlock.statements.push(conditionStmt);
    blocks.push(conditionBlock);
    this.connectBlocks(currentBlock, conditionBlock);

    // then分支
    const thenEntryBlock = this.newBlock();
    const { blocks: thenBlocks, exit: thenExit } = this.generateBlockCFG(
      ifStmt.thenBranch as BlockStatement,
      thenEntryBlock
    );
    blocks.push(...thenBlocks);
    this.connectBlocks(conditionBlock, thenEntryBlock); // True branch

    let elseExit: BasicBlock;
    if (ifStmt.elseBranch) {
      const elseEntryBlock = this.newBlock();
      const { blocks: elseBlocks, exit: currentElseExit } = this.generateBlockCFG(
        ifStmt.elseBranch as BlockStatement,
        elseEntryBlock
      );
      blocks.push(...elseBlocks);
      this.connectBlocks(conditionBlock, elseEntryBlock); // False branch
      elseExit = currentElseExit;
    } else {
      elseExit = conditionBlock; // If no else, false branch goes to merge
    }

    // 智能合并逻辑
    if (this.smartMerging) {
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
        return { blocks, entry: currentBlock, exit: elseExit };
      } else if (!thenReturns && elseReturns) {
        // else分支返回，then分支不返回，then分支继续执行
        this.connectBlocks(elseExit, this.currentFunctionExitBlock!);
        return { blocks, entry: currentBlock, exit: thenExit };
      }
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
    const loopHeader = this.newBlock();
    // 将条件表达式包装为ExpressionStatement
    const conditionStmt: ExpressionStatement = {
      type: 'ExpressionStatement',
      expression: whileStmt.condition
    };
    loopHeader.statements.push(conditionStmt);
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
    if (this.smartMerging && this.endsWithReturn(bodyExit)) {
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
    const loopHeader = this.newBlock();
    if (forStmt.condition) {
      // 将条件表达式包装为ExpressionStatement
      const conditionStmt: ExpressionStatement = {
        type: 'ExpressionStatement',
        expression: forStmt.condition
      };
      loopHeader.statements.push(conditionStmt);
    }
    blocks.push(loopHeader);
    this.connectBlocks(initExitBlock, loopHeader);

    // 3. Loop Body
    const loopBodyEntry = this.newBlock();
    const loopExit = this.newBlock();
    const loopUpdate = this.newBlock(); // Update block
    blocks.push(loopBodyEntry, loopExit, loopUpdate);

    this.loopStack.push({ breakTarget: loopExit, continueTarget: loopUpdate });

    const { blocks: bodyBlocks, exit: bodyExit } = this.generateBlockCFG(
      forStmt.body as BlockStatement,
      loopBodyEntry
    );
    blocks.push(...bodyBlocks);

    // 智能合并逻辑：检查循环体是否总是返回
    if (this.smartMerging && this.endsWithReturn(bodyExit)) {
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
    // 1. 识别空块（除了入口块和出口块）
    const emptyBlocks = blocks.filter(block => 
      !block.isEntry && 
      !block.isExit && 
      block.statements.length === 0
    );
    
    // 2. 创建块映射表
    const blockMap = new Map<string, BasicBlock>();
    blocks.forEach(block => blockMap.set(block.id, block));
    
    // 3. 为空块找到替代块
    const replacementMap = new Map<string, string>();
    
    for (const emptyBlock of emptyBlocks) {
      // 找到空块的前驱和后继
      const predecessors = emptyBlock.predecessors;
      const successors = emptyBlock.successors;
      
      if (predecessors.length === 1 && successors.length === 1) {
        // 简单情况：一个前驱，一个后继，直接连接
        const pred = predecessors[0]!;
        const succ = successors[0]!;
        replacementMap.set(emptyBlock.id, succ.id);
        
        // 更新前驱的后继
        pred.successors = pred.successors.filter(s => s.id !== emptyBlock.id);
        if (!pred.successors.includes(succ)) {
          pred.successors.push(succ);
        }
        
        // 更新后继的前驱
        succ.predecessors = succ.predecessors.filter(p => p.id !== emptyBlock.id);
        if (!succ.predecessors.includes(pred)) {
          succ.predecessors.push(pred);
        }
      } else if (predecessors.length > 0 && successors.length === 1) {
        // 多个前驱，一个后继：所有前驱直接连接到后继
        const succ = successors[0]!;
        replacementMap.set(emptyBlock.id, succ.id);
        
        for (const pred of predecessors) {
          pred.successors = pred.successors.filter(s => s.id !== emptyBlock.id);
          if (!pred.successors.includes(succ)) {
            pred.successors.push(succ);
          }
          
          succ.predecessors = succ.predecessors.filter(p => p.id !== emptyBlock.id);
          if (!succ.predecessors.includes(pred)) {
            succ.predecessors.push(pred);
          }
        }
      } else if (predecessors.length === 1 && successors.length > 1) {
        // 一个前驱，多个后继：前驱直接连接到所有后继
        const pred = predecessors[0]!;
        replacementMap.set(emptyBlock.id, pred.id);
        
        for (const succ of successors) {
          pred.successors = pred.successors.filter(s => s.id !== emptyBlock.id);
          if (!pred.successors.includes(succ)) {
            pred.successors.push(succ);
          }
          
          succ.predecessors = succ.predecessors.filter(p => p.id !== emptyBlock.id);
          if (!succ.predecessors.includes(pred)) {
            succ.predecessors.push(pred);
          }
        }
      }
    }
    
    // 4. 过滤掉空块
    const optimizedBlocks = blocks.filter(block => 
      !emptyBlocks.includes(block)
    );
    
    // 5. 重新构建边
    const optimizedEdges: { from: string; to: string }[] = [];
    for (const block of optimizedBlocks) {
      for (const successor of block.successors) {
        optimizedEdges.push({ from: block.id, to: successor.id });
      }
    }
    
    return {
      blocks: optimizedBlocks,
      edges: optimizedEdges
    };
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
          result += `    - ${this.statementToDisplayString(stmt)}\n`;
          // result += `      AST: ${this.astToJsonString(stmt)}\n`;
        }
      }
      
      result += `  前驱块: ${block.predecessors.map(p => p.id).join(', ') || '无'}\n`;
      result += `  后继块: ${block.successors.map(s => s.id).join(', ') || '无'}\n\n`;
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
      case 'LetDeclaration':
        const letDecl = stmt as LetDeclaration;
        analysis.variables.add(letDecl.name);
        if (letDecl.initializer) {
          this.analyzeExpression(letDecl.initializer, analysis);
        }
        break;
      case 'VariableDeclaration':
        const varDecl = stmt as VariableDeclaration;
        analysis.variables.add(varDecl.name);
        if (varDecl.initializer) {
          this.analyzeExpression(varDecl.initializer, analysis);
        }
        break;
      case 'AssignmentStatement':
        const assignStmt = stmt as AssignmentStatement;
        analysis.variables.add(assignStmt.target.name);
        this.analyzeExpression(assignStmt.value, analysis);
        break;
      case 'ExpressionStatement':
        const exprStmt = stmt as ExpressionStatement;
        this.analyzeExpression(exprStmt.expression, analysis);
        break;
      case 'IfStatement':
        const ifStmt = stmt as IfStatement;
        analysis.controlFlowStructures.set('if', (analysis.controlFlowStructures.get('if') || 0) + 1);
        this.analyzeExpression(ifStmt.condition, analysis);
        break;
      case 'WhileStatement':
        const whileStmt = stmt as WhileStatement;
        analysis.controlFlowStructures.set('while', (analysis.controlFlowStructures.get('while') || 0) + 1);
        this.analyzeExpression(whileStmt.condition, analysis);
        break;
      case 'ForStatement':
        const forStmt = stmt as ForStatement;
        analysis.controlFlowStructures.set('for', (analysis.controlFlowStructures.get('for') || 0) + 1);
        if (forStmt.condition) {
          this.analyzeExpression(forStmt.condition, analysis);
        }
        break;
    }
  }

  private analyzeExpression(expr: any, analysis: CFGAnalysis): void {
    if (!expr) return;

    switch (expr.type) {
      case 'Identifier':
        analysis.variables.add(expr.name);
        break;
      case 'NumberLiteral':
        analysis.constants.add(expr.value);
        break;
      case 'BinaryExpression':
        analysis.operators.add(expr.operator);
        this.analyzeExpression(expr.left, analysis);
        this.analyzeExpression(expr.right, analysis);
        break;
      case 'UnaryExpression':
        analysis.operators.add(expr.operator);
        this.analyzeExpression(expr.argument, analysis);
        break;
      case 'FunctionCall':
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
      case 'VariableDeclaration':
        const varDecl = stmt as VariableDeclaration;
        return `声明变量 ${varDecl.name}`;
      case 'LetDeclaration':
        const letDecl = stmt as LetDeclaration;
        return `声明let变量 ${letDecl.name}`;
      case 'AssignmentStatement':
        const assignStmt = stmt as AssignmentStatement;
        return `赋值 ${assignStmt.target.name} = ${this.expressionToDisplayString(assignStmt.value)}`;
      case 'ReturnStatement':
        return `返回语句`;
      case 'IfStatement':
        return `If条件: ${this.expressionToDisplayString((stmt as IfStatement).condition)}`;
      case 'WhileStatement':
        return `While条件: ${this.expressionToDisplayString((stmt as WhileStatement).condition)}`;
      case 'ForStatement':
        return `For循环`;
      case 'ExpressionStatement':
        const exprStmt = stmt as ExpressionStatement;
        return this.expressionToDisplayString(exprStmt.expression);
      case 'BreakStatement':
        return `Break语句`;
      case 'ContinueStatement':
        return `Continue语句`;
      case 'BlockStatement':
        return `代码块`;
      case 'EmptyStatement':
        return `空语句`;
      default:
        return `未知语句类型: ${stmt.type}`;
    }
  }

  private expressionToDisplayString(expr: any): string {
    switch (expr.type) {
      case 'NumberLiteral':
        return `数字: ${expr.value}`;
      case 'Identifier':
        return `变量: ${expr.name}`;
      case 'BinaryExpression':
        return `${this.expressionToDisplayString(expr.left)} ${expr.operator} ${this.expressionToDisplayString(expr.right)}`;
      case 'UnaryExpression':
        return `${expr.operator}${this.expressionToDisplayString(expr.argument)}`;
      case 'FunctionCall':
        return `函数调用: ${expr.callee.name}(...)`;
      default:
        return `表达式`;
    }
  }

  private astToJsonString(ast: any): string {
    // 创建一个简化的AST表示，只包含关键信息
    const simplified = this.simplifyAST(ast);
    return JSON.stringify(simplified, null, 2).replace(/\n/g, ' ').replace(/\s+/g, ' ');
  }

  private simplifyAST(ast: any): any {
    if (!ast || typeof ast !== 'object') {
      return ast;
    }

    const result: any = {};
    
    // 保留关键字段
    if (ast.type) result.type = ast.type;
    if (ast.name) result.name = ast.name;
    if (ast.value !== undefined) result.value = ast.value;
    if (ast.operator) result.operator = ast.operator;
    
    // 递归处理子节点
    if (ast.left) result.left = this.simplifyAST(ast.left);
    if (ast.right) result.right = this.simplifyAST(ast.right);
    if (ast.argument) result.argument = this.simplifyAST(ast.argument);
    if (ast.condition) result.condition = this.simplifyAST(ast.condition);
    if (ast.target) result.target = this.simplifyAST(ast.target);
    if (ast.callee) result.callee = this.simplifyAST(ast.callee);
    if (ast.expression) result.expression = this.simplifyAST(ast.expression);
    if (ast.initializer) result.initializer = this.simplifyAST(ast.initializer);
    
    // 处理数组
    if (ast.statements && Array.isArray(ast.statements)) {
      result.statements = ast.statements.map((stmt: any) => this.simplifyAST(stmt));
    }
    if (ast.arguments && Array.isArray(ast.arguments)) {
      result.arguments = ast.arguments.map((arg: any) => this.simplifyAST(arg));
    }
    
    return result;
  }
}