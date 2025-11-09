import type { Statement, BinaryExpression, UnaryExpression, NumberLiteral, Identifier, StartCheckPoint, EndCheckPoint } from './types';
import type { BasicBlock, ControlFlowGraph } from './cfg-types';
import type { ScopeManager, ScopeInfo } from './scope-manager';
import { StatementType } from './types';

// 汇编生成器 - 基于 DFS + snapshot 机制
export class AssemblyGenerator {
  private scopeManager: ScopeManager;
  private lines: string[] = [];
  public outputCallback?: (lines: string[]) => void; // 用于逐步输出
  private currentCfg: ControlFlowGraph | null = null; // 当前处理的 CFG
  public highlightCallback?: (variableName: string | null) => void; // 用于高亮变量

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
   * 设置高亮回调，用于高亮变量
   */
  setHighlightCallback(callback: (variableName: string | null) => void): void {
    this.highlightCallback = callback;
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
    this.currentCfg = cfg;
    
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
    // 对于入口块，使用函数名作为标签（用于函数调用）
    if (block.isEntry && this.currentCfg) {
      this.addLine(`${this.currentCfg.functionName}:`);
    } else {
    this.addLine(`${block.id}:`);
    }
    
    // 如果是入口块，处理函数参数和函数序言（push ebp, mov ebp, esp）
    // 注意：即使没有参数，也需要调用以生成函数序言（非 main 函数）
    if (block.isEntry && this.currentCfg) {
      const parameters = this.currentCfg.parameters || [];
      this.handleFunctionParameters(parameters);
    }
    
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
   * 处理函数参数：将参数注册到 scope-manager，不创建单独的作用域
   * 参数通过 ebp + offset 访问，应该和局部变量在同一个函数作用域中
   */
  public handleFunctionParameters(parameters: Array<{ name: string; type: string }>): void {
    // 将参数注册到 scope-manager（不创建单独的作用域）
    const paramNames = parameters.map(p => p.name);
    this.scopeManager.setFunctionParameters(paramNames);
    
    // 函数入口：保存旧的 ebp，设置新的 ebp = esp（只有非 main 函数才需要）
    if (this.currentCfg?.functionName !== 'main') {
      this.addLine(`  push ebp`);
      this.addLine(`  mov ebp, esp`);
    }
  }

  /**
   * 处理 StartCheckPoint：进入新作用域
   */
  public handleStartCheckPoint(checkPoint: StartCheckPoint): void {
    const varCount = checkPoint.variableNames?.length || 0;
    
    // 进入作用域（分配变量并计算 offset）
    const scopeId = checkPoint.scopeId || `scope_${this.scopeManager.getScopes().length}`;
    
    // 如果是函数的第一个作用域（根作用域），将函数参数也添加到该作用域中
    const isRootScope = this.scopeManager.getScopes().length === 0;
    let variableNames = checkPoint.variableNames || [];
    
    if (isRootScope && this.currentCfg?.parameters && this.currentCfg.parameters.length > 0) {
      // 将函数参数添加到根作用域（参数在前，局部变量在后）
      // 参数按照声明顺序添加：第一个参数在 ebp+2，第二个参数在 ebp+3
      const paramNames = this.currentCfg.parameters.map(p => p.name);
      variableNames = [...paramNames, ...variableNames];
      
      // 标记函数参数为已初始化（它们已经在栈中，通过 ebp 访问）
      // 参数不需要在作用域中分配空间，因为它们通过 ebp 访问
      // 但我们需要在作用域信息中记录它们，以便在栈布局中显示
    }
    
    this.scopeManager.enterScope(scopeId, variableNames);
    
    // 如果是根作用域且有函数参数，标记参数为已初始化
    if (isRootScope && this.currentCfg?.parameters && this.currentCfg.parameters.length > 0) {
      for (const param of this.currentCfg.parameters) {
        this.scopeManager.markVariableInitialized(param.name);
      }
    }
    
    // 生成栈分配指令（只分配局部变量的空间，不包括函数参数）
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
      // 使用 si 指令（支持正数 offset 用于函数参数，负数 offset 用于局部变量）
      // si 指令会将值存储到 bp + offset，所以对于函数参数（offset > 0），会存储到 ebp+2, ebp+3 等
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
          // 使用 si 指令（支持正数 offset 用于函数参数，负数 offset 用于局部变量）
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
          // 使用 li 指令（支持正数 offset 用于函数参数，负数 offset 用于局部变量）
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
    
    // 释放所有栈空间（局部变量）
    const totalVarCount = this.getTotalVarCount();
    if (totalVarCount > 0) {
      this.addLine(`  add esp, ${totalVarCount}`);
    }
    
    // 恢复 ebp（如果是非 main 函数）
    if (this.currentCfg?.functionName !== 'main') {
      // 恢复旧的 ebp（此时 esp 应该已经等于 ebp，因为局部变量已释放）
      this.addLine(`  pop ebp`);
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
      // 释放所有栈空间（局部变量）
      const totalVarCount = this.getTotalVarCount();
      if (totalVarCount > 0) {
        this.addLine(`  add esp, ${totalVarCount}`);
      }
      
      // 恢复 ebp（如果是非 main 函数）
      if (this.currentCfg?.functionName !== 'main') {
        // 恢复旧的 ebp（此时 esp 应该已经等于 ebp，因为局部变量已释放）
        this.addLine(`  pop ebp`);
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
      case 'FunctionCall':
        return this.generateFunctionCall(expression);
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
    
    // 触发高亮回调
    if (this.highlightCallback) {
      this.highlightCallback(varName);
    }
    
    if (offset !== null) {
      // 使用 li 指令（支持正数 offset 用于函数参数，负数 offset 用于局部变量）
      // li 指令会从 bp + offset 读取值，所以对于函数参数（offset > 0），会从 ebp+2, ebp+3 等读取
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
        return `${leftAsm}\npush eax\n${rightAsm}\nmov ebx, eax\npop eax\nmul eax, ebx`;
      case '/':
        return `${leftAsm}\npush eax\n${rightAsm}\nmov ebx, eax\npop eax\ndiv eax, ebx`;
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
   * 生成函数调用
   * 按照 C 调用约定：参数从右到左压栈，调用者清理栈
   */
  private generateFunctionCall(funcCall: any): string {
    const funcName = funcCall.callee.name;
    const args = funcCall.arguments || [];
    
    // 如果没有参数，直接调用
    if (args.length === 0) {
      return `call ${funcName}`;
    }
    
    // 生成参数压栈代码（从右到左）
    const pushInstructions: string[] = [];
    for (let i = args.length - 1; i >= 0; i--) {
      const argAsm = this.generateExpression(args[i]);
      if (argAsm) {
        pushInstructions.push(argAsm);
        pushInstructions.push('push eax');
      }
    }
    
    // 生成调用和栈清理代码
    const callInstruction = `call ${funcName}`;
    const cleanupInstruction = `add esp, ${args.length}`;
    
    // 组合所有指令
    return pushInstructions.join('\n') + '\n' + callInstruction + '\n' + cleanupInstruction;
  }

  /**
   * 辅助函数：为多行汇编代码添加缩进
   */
  private addIndentToMultiLine(code: string, indent: string = '  '): string[] {
    return code.split('\n').map(line => line.trim() ? `${indent}${line}` : '').filter(line => line);
  }

  /**
   * 获取变量偏移量（只返回已初始化的变量）
   * 如果是函数参数，返回 ebp offset；否则返回局部变量的 offset
   */
  private getVariableOffset(varName: string): number | null {
    // 首先检查是否是函数参数
    const paramOffset = this.scopeManager.getFunctionParameterOffset(varName);
    if (paramOffset !== null) {
      return paramOffset; // 返回 ebp offset（正数）
    }
    
    // 检查局部变量
    const scopes = this.scopeManager.getScopes();
    // 从内层到外层查找
    for (let i = scopes.length - 1; i >= 0; i--) {
      const scope = scopes[i]!;
      const variable = scope.variables.find(v => v.name === varName && v.init);
      if (variable) {
        return variable.offset; // 返回局部变量的 offset（负数）
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
   * 获取总变量数（只计算局部变量，不包括函数参数）
   */
  private getTotalVarCount(): number {
    const scopes = this.scopeManager.getScopes();
    let total = 0;
    for (const scope of scopes) {
      // 只计算局部变量（offset < 0），不包括函数参数（offset >= 0）
      const localVarCount = scope.variables.filter(v => v.offset < 0).length;
      total += localVarCount;
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

