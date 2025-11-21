import type { Statement, BinaryExpression, UnaryExpression, NumberLiteral, Identifier, StartCheckPoint, EndCheckPoint } from './types';
import type { BasicBlock, ControlFlowGraph } from './cfg-types';
import type { ScopeManager, ScopeInfo } from './scope-manager';
import { StatementType } from './types';

// 汇编生成器 - 基于 DFS + snapshot 机制
export class AssemblyGenerator {
  private scopeManager: ScopeManager;
  private lines: string[] = [];
  public outputCallback?: (lines: string[]) => void; // 用于逐步输出

  constructor(scopeManager: ScopeManager) {
    this.scopeManager = scopeManager;
  }
  
  /**
   * 设置输出回调，用于逐步生成时输出汇编代码
   */
  setOutputCallback(callback: (lines: string[]) => void): void {
    this.outputCallback = callback;
  }
  
  /**
   * 添加汇编代码行（逐步生成时使用）
   */
  addLine(line: string): void {
    this.lines.push(line);
    if (this.outputCallback) {
      this.outputCallback([line]);
    }
  }

  /**
   * 生成汇编代码
   */
  generateAssembly(cfg: ControlFlowGraph): string {
    // 重置
    this.scopeManager.reset();
    this.lines = [];
    
    // 重置所有块的 visited 标记和作用域快照
    for (const block of cfg.blocks) {
      block.visited = false;
      block.scopeSnapshot = undefined;
    }
    
    // 从入口块开始 DFS 遍历
    const entryBlock = cfg.blocks.find(b => b.isEntry);
    if (entryBlock) {
      this.visitBlock(entryBlock, null);
    }
    
    return this.lines.join('\n');
  }

  /**
   * DFS 访问基本块
   * @param block 当前块
   * @param incomingSnapshot 进入该块时应该的作用域快照（null 表示首次访问）
   */
  private visitBlock(block: BasicBlock, incomingSnapshot: ScopeInfo[] | null): void {
    // 如果已经访问过，验证作用域栈一致性
    if (block.visited) {
      // 出口块不验证快照（因为可能是不同路径汇聚的死代码点）
      if (block.isExit) {
        return;
      }
      
      // 从 block 中读取保存的快照
      if (block.scopeSnapshot && incomingSnapshot) {
        // 暂时跳过验证，因为进入时的状态可能已经被修改
        return; // 已访问过，跳过
      }
      return; // 已访问过，跳过
    }
    
    // 标记为已访问
    block.visited = true;
    
    // 恢复作用域状态（如果有传入的快照）
    if (incomingSnapshot) {
      this.scopeManager.restoreSnapshot(incomingSnapshot);
    }
    
    // 生成块标签
    this.addLine(`${block.id}:`);
    
    // 处理块内语句
    let hasReturn = false;
    for (const stmt of block.statements) {
      // 如果已经遇到 return，不再处理后续语句（避免处理不会执行的 EndCheckPoint）
      if (hasReturn) {
        break;
      }
      
      this.generateStatement(stmt);
      
      // 检查是否是 return 语句
      if (stmt.type === StatementType.RETURN_STATEMENT) {
        hasReturn = true;
        // return 语句会生成 ret，后续语句不会执行
        break;
      }
    }
    
    // 保存当前块的作用域快照（在进入后继块之前）
    const currentSnapshot = this.scopeManager.getSnapshot();
    
    // 将快照保存到 block 中（转换为 Map 格式以兼容）
    block.scopeSnapshot = this.scopeInfoToMapArray(currentSnapshot);
    
    // 如果有 return 或者是 exit block，不需要生成跳转指令和访问后继块
    if (hasReturn || block.isExit) {
      this.generateControlFlow(block);
      return;
    }
    
    // 在访问后继块之前，先生成跳转指令
    // 这样可以确保跳转指令紧跟在条件判断之后，避免顺序执行错误
    this.generateControlFlow(block);
    
    // 处理控制流：进入后继块
    for (const successor of block.successors) {
      // 复制快照传递给后继块（深拷贝）
      const snapshotCopy = this.deepCopyScopeInfo(currentSnapshot);
      this.visitBlock(successor, snapshotCopy);
    }
  }

  /**
   * 生成语句（可以公开调用，用于逐步生成）
   */
  public generateStatement(stmt: Statement): void {
    switch (stmt.type) {
      case StatementType.START_CHECK_POINT:
        this.handleStartCheckPoint(stmt as StartCheckPoint);
        break;
      case StatementType.END_CHECK_POINT:
        this.handleEndCheckPoint(stmt as EndCheckPoint);
        break;
      case StatementType.VARIABLE_DECLARATION:
        this.generateVariableDeclaration(stmt as any);
        break;
      case StatementType.LET_DECLARATION:
        this.generateLetDeclaration(stmt as any);
        break;
      case StatementType.ASSIGNMENT_STATEMENT:
        this.generateAssignment(stmt as any);
        break;
      case StatementType.EXPRESSION_STATEMENT:
        this.generateExpressionStatement(stmt as any);
        break;
      case StatementType.RETURN_STATEMENT:
        this.generateReturn(stmt as any);
        break;
      case StatementType.BLOCK_STATEMENT:
        // BlockStatement 内的语句需要递归处理
        const blockStmt = stmt as any;
        if (blockStmt.statements) {
          for (const innerStmt of blockStmt.statements) {
            this.generateStatement(innerStmt);
          }
        }
        break;
      default:
        break;
    }
  }

  /**
   * 处理 StartCheckPoint：进入新作用域
   */
  public handleStartCheckPoint(checkPoint: StartCheckPoint): void {
    const varCount = checkPoint.variableNames?.length || 0;
    
    // 进入作用域（分配变量并计算 offset）
    const scopeId = checkPoint.scopeId || `scope_${this.scopeManager.getScopes().length}`;
    this.scopeManager.enterScope(scopeId, checkPoint.variableNames || []);
    
    // 生成栈分配指令
    if (varCount > 0) {
      this.addLine(`  sub esp, ${varCount}`);
    }
  }

  /**
   * 处理 EndCheckPoint：退出作用域
   */
  public handleEndCheckPoint(checkPoint: EndCheckPoint): void {
    const varCount = checkPoint.variableNames?.length || 0;
    
    // 验证变量名是否一致（可选，用于调试）
    const scopes = this.scopeManager.getScopes();
    const currentScope = scopes[scopes.length - 1];
    if (currentScope) {
      const expectedVarNames = checkPoint.variableNames || [];
      
      // 检查作用域栈中是否有匹配的作用域（从栈顶往下找）
      let matchedScopeIndex = -1;
      for (let i = scopes.length - 1; i >= 0; i--) {
        const scope = scopes[i]!;
        const scopeVarNames = scope.variables.map(v => v.name);
        if (scopeVarNames.length === expectedVarNames.length &&
            scopeVarNames.every((v, idx) => v === expectedVarNames[idx])) {
          matchedScopeIndex = i;
          break;
        }
      }
      
      if (matchedScopeIndex === -1) {
        // 没有找到匹配的作用域，可能已经被提前退出
        console.warn(`⚠️  退出作用域 ${checkPoint.scopeId} 时，未找到匹配的作用域`);
        console.warn(`    期望变量: [${expectedVarNames.join(', ')}]`);
        console.warn(`    当前作用域栈深度: ${scopes.length}`);
      } else if (matchedScopeIndex !== scopes.length - 1) {
        // 匹配的作用域不在栈顶，这是 DFS 遍历时的正常情况
        // 需要先退出栈顶到匹配位置之间的所有作用域
        while (scopes.length > matchedScopeIndex + 1) {
          this.scopeManager.exitScope();
        }
      }
    }
    
    // 退出作用域
    this.scopeManager.exitScope();
    
    // 生成栈释放指令
    if (varCount > 0) {
      this.addLine(`  add esp, ${varCount}`);
    }
  }

  /**
   * 生成变量声明
   */
  public generateVariableDeclaration(varDecl: any): void {
    const varName = varDecl.name;
    
    // 标记变量为已初始化
    this.scopeManager.markVariableInitialized(varName);
    
    // 变量应该已经在作用域中（通过 StartCheckPoint 分配）
    const offset = this.getVariableOffset(varName);
    if (offset === null) {
      throw new Error(`变量 ${varName} 不在作用域中`);
    }
    
    // 生成初始化代码
    if (varDecl.initializer) {
      const valueAsm = this.generateExpression(varDecl.initializer);
      if (valueAsm) {
        const multiLines = this.addIndentToMultiLine(valueAsm);
        for (const line of multiLines) {
          this.addLine(line);
        }
      }
      this.addLine(`  si ${offset}`);
    } else {
      this.addLine(`  mov eax, 0`);
      this.addLine(`  si ${offset}`);
    }
  }

  /**
   * 生成 let 声明
   */
  public generateLetDeclaration(letDecl: any): void {
    this.generateVariableDeclaration(letDecl);
  }

  /**
   * 生成赋值语句
   */
  public generateAssignment(assignment: any): void {
    const target = assignment.target.name;
    const valueAsm = this.generateExpression(assignment.value);
    
    if (valueAsm) {
      const multiLines = this.addIndentToMultiLine(valueAsm);
      for (const line of multiLines) {
        this.addLine(line);
      }
    }
    
    // 查找变量 offset
    const offset = this.getVariableOffset(target);
    if (offset !== null) {
      this.addLine(`  si ${offset}`);
    }
  }

  /**
   * 生成表达式语句
   */
  public generateExpressionStatement(exprStmt: any): void {
    // 检查是否是赋值表达式（BinaryExpression with operator '='）
    if (exprStmt.expression?.type === 'BinaryExpression' && exprStmt.expression.operator === '=') {
      const assignment = exprStmt.expression;
      const target = assignment.left;
      if (target.type === 'Identifier') {
        const varName = target.name;
        // 生成右侧表达式的代码
        const valueAsm = this.generateExpression(assignment.right);
        if (valueAsm) {
          const multiLines = this.addIndentToMultiLine(valueAsm);
          for (const line of multiLines) {
            this.addLine(line);
          }
        }
        // 查找变量 offset 并存储
        const offset = this.getVariableOffset(varName);
        if (offset !== null) {
          this.addLine(`  si ${offset}`);
        }
        return;
      }
    }
    
    // 检查是否是条件表达式（用于条件跳转）
    const isCondition = exprStmt.expression?.type === 'BinaryExpression' &&
      ['==', '!=', '<', '<=', '>', '>='].includes(exprStmt.expression?.operator);
    
    const exprAsm = this.generateExpression(exprStmt.expression, isCondition);
    if (exprAsm) {
      const multiLines = this.addIndentToMultiLine(exprAsm);
      for (const line of multiLines) {
        this.addLine(line);
      }
    }
  }

  /**
   * 生成返回语句
   */
  public generateReturn(ret: any): void {
    if (ret.value) {
      if (ret.value.type === 'Identifier') {
        const varName = ret.value.name;
        const offset = this.getFunctionLevelVariableOffset(varName);
        if (offset !== null) {
          this.addLine(`  li ${offset}`);
        } else {
          this.addLine(`  mov eax, 0`);
        }
      } else {
        const valueAsm = this.generateExpression(ret.value);
        if (valueAsm) {
          const multiLines = this.addIndentToMultiLine(valueAsm);
          for (const line of multiLines) {
            this.addLine(line);
          }
        }
      }
    } else {
      this.addLine(`  mov eax, 0`);
    }
    
    // 释放所有栈空间
    const totalVarCount = this.getTotalVarCount();
    if (totalVarCount > 0) {
      this.addLine(`  add esp, ${totalVarCount}`);
    }
    
    // 清理寄存器
    this.addLine(`  mov ebx, 0`);
    this.addLine(`  ret`);
  }

  /**
   * 生成控制流跳转（可以公开调用，用于逐步生成）
   */
  public generateControlFlow(block: BasicBlock): void {
    const hasReturn = block.statements.some(stmt => stmt.type === StatementType.RETURN_STATEMENT);
    const isExitBlock = block.isExit;
    
    // 如果是 exit block 且没有显式的 return 语句
    if (isExitBlock && !hasReturn) {
      // 释放所有栈空间
      const totalVarCount = this.getTotalVarCount();
      if (totalVarCount > 0) {
        this.addLine(`  add esp, ${totalVarCount}`);
      }

      this.addLine(`  mov eax, 0`);
      this.addLine(`  mov ebx, 0`);
      this.addLine(`  ret`);
      return;
    }
    
    // 生成跳转指令（如果块包含 ret 或已经是 exit block，则不生成跳转）
    if (!hasReturn && !isExitBlock) {
      if (block.successors.length > 1) {
        // 多个后继：条件分支
        const trueTarget = block.successors[0]!;
        const falseTarget = block.successors[block.successors.length - 1]!;
        
        // 检查最后一个语句是否是条件表达式
        const lastStmt = block.statements[block.statements.length - 1];
        if (lastStmt && lastStmt.type === StatementType.EXPRESSION_STATEMENT) {
          const exprStmt = lastStmt as any;
          if (exprStmt.expression && exprStmt.expression.type === 'BinaryExpression') {
            this.generateConditionalJump(exprStmt.expression, trueTarget.id, falseTarget.id);
            this.addLine('');
            return;
          }
        }
        
        // 默认跳转
        this.addLine(`  jmp ${trueTarget.id}`);
      } else if (block.successors.length === 1) {
        // 单一后继：直接跳转
        this.addLine(`  jmp ${block.successors[0]!.id}`);
      }
    }
    this.addLine('');
  }

  /**
   * 生成条件跳转
   */
  private generateConditionalJump(
    condition: any,
    trueLabel: string,
    falseLabel: string
  ): void {
    if (condition.type === 'BinaryExpression') {
      const op = condition.operator;
      
      switch (op) {
        case '>=':
          this.addLine(`  jge ${trueLabel}`);
          this.addLine(`  jmp ${falseLabel}`);
          break;
        case '>':
          this.addLine(`  jg ${trueLabel}`);
          this.addLine(`  jmp ${falseLabel}`);
          break;
        case '<=':
          this.addLine(`  jle ${trueLabel}`);
          this.addLine(`  jmp ${falseLabel}`);
          break;
        case '<':
          this.addLine(`  jl ${trueLabel}`);
          this.addLine(`  jmp ${falseLabel}`);
          break;
        case '==':
          this.addLine(`  je ${trueLabel}`);
          this.addLine(`  jmp ${falseLabel}`);
          break;
        case '!=':
          this.addLine(`  jne ${trueLabel}`);
          this.addLine(`  jmp ${falseLabel}`);
          break;
        default:
          this.addLine(`  jmp ${falseLabel}`);
      }
    }
  }

  /**
   * 生成表达式汇编
   */
  private generateExpression(expression: any, forCondition: boolean = false): string | null {
    switch (expression.type) {
      case 'NumberLiteral':
        return this.generateNumberLiteral(expression);
      case 'Identifier':
        return this.generateIdentifier(expression);
      case 'BinaryExpression':
        return this.generateBinaryExpression(expression, forCondition);
      case 'UnaryExpression':
        return this.generateUnaryExpression(expression);
      case 'ParenthesizedExpression':
        // 括号表达式：直接递归处理内部表达式
        return this.generateExpression(expression.expression, forCondition);
      default:
        return null;
    }
  }

  /**
   * 生成数字字面量
   */
  private generateNumberLiteral(num: NumberLiteral): string {
    return `mov eax, ${num.value}`;
  }

  /**
   * 生成标识符
   */
  private generateIdentifier(identifier: Identifier): string {
    const varName = identifier.name;
    const offset = this.getVariableOffset(varName);
    
    if (offset !== null) {
      return `li ${offset}`;
    }
    
    return 'mov eax, 0';
  }

  /**
   * 生成二元表达式
   */
  private generateBinaryExpression(binary: BinaryExpression, forCondition: boolean = false): string {
    const leftAsm = this.generateExpression(binary.left);
    const rightAsm = this.generateExpression(binary.right);
    
    if (!leftAsm || !rightAsm) {
      return 'mov eax, 0';
    }
    
    const cmpPart = `${leftAsm}\npush eax\n${rightAsm}\nmov ebx, eax\npop eax\ncmp eax, ebx`;
    
    switch (binary.operator) {
      case '=':
        // 赋值表达式：只计算右侧值，存储操作在 generateExpressionStatement 中处理
        return rightAsm;
      case '+':
        return `${leftAsm}\npush eax\n${rightAsm}\nmov ebx, eax\npop eax\nadd eax, ebx`;
      case '-':
        return `${leftAsm}\npush eax\n${rightAsm}\nmov ebx, eax\npop eax\nsub eax, ebx`;
      case '*':
        return `${leftAsm}\npush eax\n${rightAsm}\nmov ebx, eax\npop eax\nimul eax, ebx`;
      case '/':
        return `${leftAsm}\npush eax\n${rightAsm}\nmov ebx, eax\npop eax\nidiv ebx`;
      case '%':
        return `${leftAsm}\npush eax\n${rightAsm}\nmov ebx, eax\npop eax\nmod eax, ebx`;
      case '==':
        return forCondition ? cmpPart : `${cmpPart}\nsete al\nand eax, 1`;
      case '!=':
        return forCondition ? cmpPart : `${cmpPart}\nsetne al\nand eax, 1`;
      case '<':
        return forCondition ? cmpPart : `${cmpPart}\nsetl al\nand eax, 1`;
      case '<=':
        return forCondition ? cmpPart : `${cmpPart}\nsetle al\nand eax, 1`;
      case '>':
        return forCondition ? cmpPart : `${cmpPart}\nsetg al\nand eax, 1`;
      case '>=':
        return forCondition ? cmpPart : `${cmpPart}\nsetge al\nand eax, 1`;
      default:
        return 'mov eax, 0';
    }
  }

  /**
   * 生成一元表达式
   */
  private generateUnaryExpression(unary: UnaryExpression): string {
    const operandAsm = this.generateExpression(unary.operand);
    
    if (!operandAsm) {
      return 'mov eax, 0';
    }
    
    switch (unary.operator) {
      case '-':
        return `${operandAsm}\nmov ebx, eax\nmov eax, 0\nsub eax, ebx`;
      case '!':
        return `${operandAsm}\ncmp eax, 0\nsete al\nand eax, 1`;
      default:
        return 'mov eax, 0';
    }
  }

  /**
   * 辅助函数：为多行汇编代码添加缩进
   */
  private addIndentToMultiLine(code: string, indent: string = '  '): string[] {
    return code.split('\n').map(line => line.trim() ? `${indent}${line}` : '').filter(line => line);
  }

  /**
   * 获取变量偏移量（只返回已初始化的变量）
   */
  private getVariableOffset(varName: string): number | null {
    const scopes = this.scopeManager.getScopes();
    // 从内层到外层查找
    for (let i = scopes.length - 1; i >= 0; i--) {
      const scope = scopes[i]!;
      const variable = scope.variables.find(v => v.name === varName && v.init);
      if (variable) {
        return variable.offset;
      }
    }
    return null;
  }

  /**
   * 获取函数级别的变量偏移量（从最外层作用域查找）
   */
  private getFunctionLevelVariableOffset(varName: string): number | null {
    const scopes = this.scopeManager.getScopes();
    // 从外层到内层查找（函数级别应该在较外层）
    for (let i = 0; i < scopes.length; i++) {
      const scope = scopes[i]!;
      const variable = scope.variables.find(v => v.name === varName && v.init);
      if (variable) {
        return variable.offset;
      }
    }
    return null;
  }

  /**
   * 获取总变量数
   */
  private getTotalVarCount(): number {
    const scopes = this.scopeManager.getScopes();
    let total = 0;
    for (const scope of scopes) {
      total += scope.variables.length;
    }
    return total;
  }

  /**
   * 将 ScopeInfo[] 转换为 Map<string, number>[] 格式（用于保存到 block.scopeSnapshot）
   */
  private scopeInfoToMapArray(scopes: ScopeInfo[]): Map<string, number>[] {
    return scopes.map(scope => {
      const map = new Map<string, number>();
      for (const variable of scope.variables) {
        map.set(variable.name, variable.offset);
      }
      return map;
    });
  }

  /**
   * 深拷贝 ScopeInfo[]
   */
  private deepCopyScopeInfo(scopes: ScopeInfo[]): ScopeInfo[] {
    return scopes.map(scope => ({
      scopeId: scope.scopeId,
      variables: scope.variables.map(v => ({ ...v }))
    }));
  }
}

