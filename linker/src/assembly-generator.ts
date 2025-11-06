import type { Statement, Expression, BinaryExpression, UnaryExpression, NumberLiteral, Identifier, AssignmentStatement, ReturnStatement, StartCheckPoint, EndCheckPoint } from './ast';
import type { BasicBlock, ControlFlowGraph } from './cfg-generator';
import type { ScopeManager } from './scope-manager';
import { StatementType } from './types';

// 汇编生成器 - 基于 DFS + snapshot 机制
export class AssemblyGenerator {
  private scopeManager: ScopeManager;
  private lines: string[] = [];
  private currentFunctionName: string = '';

  constructor(scopeManager: ScopeManager) {
    this.scopeManager = scopeManager;
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
    
    this.currentFunctionName = cfg.functionName;
    this.lines.push(`; Function: ${cfg.functionName}`);
    this.lines.push(`${cfg.functionName}:`);
    
    // 函数入口：保存旧的 ebp，设置新的 ebp = esp
    // 注意：只有非 main 函数才需要保存 ebp（main 函数是入口点）
    if (cfg.functionName !== 'main') {
      this.lines.push(`  push ebp              ; 保存旧的 ebp`);
      this.lines.push(`  mov ebp, esp           ; 设置新的 ebp = esp`);
    }
    this.lines.push('');
    
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
  private visitBlock(block: BasicBlock, incomingSnapshot: Map<string, { offset: number; init: boolean }>[] | null): void {
    // 如果已经访问过，验证作用域栈一致性
    if (block.visited) {
      // 出口块不验证快照（因为可能是不同路径汇聚的死代码点）
      if (block.isExit) {
        return;
      }
      
      // 从 block 中读取保存的快照
      if (block.scopeSnapshot && incomingSnapshot) {
        // 验证快照是否一致（比较进入时的快照）
        // 注意：incomingSnapshot 是进入该块时的快照，我们需要与进入时保存的快照比较
        // 但实际上应该比较的是：该块结束时的快照 vs 传入的快照
        
        // 重新思考：如果 block 已经访问过，说明已经处理过该块的语句
        // incomingSnapshot 应该是进入该块时的作用域状态
        // 我们需要验证：进入时的状态应该与之前进入时的状态一致
        
        // 暂时跳过验证，因为进入时的状态可能已经被修改
        // 后续如果需要，可以在 block 中保存 enteringSnapshot
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
    this.lines.push(`${block.id}:`);
    
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
        // 但为了保持作用域栈一致性，我们仍然需要处理 return 之前的作用域
        break;
      }
    }
    
    // 保存当前块的作用域快照（在进入后继块之前）
    // 注意：如果有 return，作用域栈状态可能是 return 前的状态
    const currentSnapshot = this.scopeManager.saveSnapshot();
    
    // 将快照保存到 block 中
    block.scopeSnapshot = currentSnapshot;
    
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
      // 注意：每个后继块都会接收这个快照，并在 visitBlock 开始时恢复它
      // 所以即使 scopeManager 在前一个后继块中被修改了，下一个后继块访问时会自动恢复
      const snapshotCopy = currentSnapshot.map(scope => {
        const scopeCopy = new Map<string, { offset: number; init: boolean }>();
        for (const [name, info] of scope) {
          scopeCopy.set(name, { offset: info.offset, init: info.init });
        }
        return scopeCopy;
      });
      this.visitBlock(successor, snapshotCopy);
      
      // 不需要在返回后恢复快照，因为：
      // 1. 如果后继块已访问过，visitBlock 直接返回，不会修改 scopeManager
      // 2. 如果后继块未访问过，visitBlock 会恢复传入的快照，处理完后可能修改 scopeManager
      //    但下一个后继块访问时，会再次恢复传入的快照（snapshotCopy），所以不需要显式恢复
    }
  }

  /**
   * 生成语句
   */
  private generateStatement(stmt: Statement): void {
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
  private handleStartCheckPoint(checkPoint: StartCheckPoint): void {
    const varCount = checkPoint.variableNames.length;
    
    // 进入作用域（分配变量并计算 offset）
    const allocatedSize = this.scopeManager.enterScope(checkPoint.variableNames);
    
    // 生成栈分配指令
    if (varCount > 0) {
      const varList = checkPoint.variableNames.join(', ');
      this.lines.push(`  sub esp, ${varCount}            ; 进入作用域 ${checkPoint.scopeId} (depth: ${checkPoint.depth}, vars: [${varList}])`);
    } else {
      this.lines.push(`  ; 进入作用域 ${checkPoint.scopeId} (depth: ${checkPoint.depth}, 无变量)`);
    }
  }

  /**
   * 处理 EndCheckPoint：退出作用域
   */
  private handleEndCheckPoint(checkPoint: EndCheckPoint): void {
    const varCount = checkPoint.variableNames.length;
    
    // 验证变量名是否一致（可选，用于调试）
    // 注意：由于 DFS 遍历可能在不同路径访问同一个块，作用域栈的状态可能不匹配
    // 所以这个验证可能不够准确，仅用于调试
    const scopes = (this.scopeManager as any).scopes as Map<string, { offset: number; init: boolean }>[];
    const currentScope = this.scopeManager.getCurrentScope();
    if (currentScope) {
      const currentVarNames = Array.from(currentScope.keys());
      const expectedVarNames = checkPoint.variableNames;
      
      // 检查作用域栈中是否有匹配的作用域（从栈顶往下找）
      let matchedScopeIndex = -1;
      for (let i = scopes.length - 1; i >= 0; i--) {
        const scope = scopes[i];
        if (scope) {
          const scopeVarNames = Array.from(scope.keys());
          if (scopeVarNames.length === expectedVarNames.length &&
              scopeVarNames.every((v, idx) => v === expectedVarNames[idx])) {
            matchedScopeIndex = i;
            break;
          }
        }
      }
      
      if (matchedScopeIndex === -1) {
        // 没有找到匹配的作用域，可能已经被提前退出
        console.warn(`⚠️  退出作用域 ${checkPoint.scopeId} 时，未找到匹配的作用域`);
        console.warn(`    期望变量: [${expectedVarNames.join(', ')}]`);
        console.warn(`    当前作用域栈深度: ${scopes.length}`);
        console.warn(`    栈中所有作用域:`);
        for (let i = 0; i < scopes.length; i++) {
          const scope = scopes[i];
          if (scope) {
            const vars = Array.from(scope.keys());
            console.warn(`      [${i}]: [${vars.join(', ')}]`);
    }
        }
      } else if (matchedScopeIndex !== scopes.length - 1) {
        // 匹配的作用域不在栈顶，这是 DFS 遍历时的正常情况
        // 需要先退出栈顶到匹配位置之间的所有作用域
        // 这是为了处理不同控制流路径导致的作用域栈顺序不一致
        while (scopes.length > matchedScopeIndex + 1) {
          this.scopeManager.exitScope();
        }
      }
    } else {
      console.warn(`⚠️  退出作用域 ${checkPoint.scopeId} 时，当前作用域为空`);
    }
    
    // 退出作用域
    this.scopeManager.exitScope();
    
    // 生成栈释放指令
    if (varCount > 0) {
      const varList = checkPoint.variableNames.join(', ');
      this.lines.push(`  add esp, ${varCount}            ; 退出作用域 ${checkPoint.scopeId} (depth: ${checkPoint.depth}, vars: [${varList}])`);
    } else {
      this.lines.push(`  ; 退出作用域 ${checkPoint.scopeId} (depth: ${checkPoint.depth}, 无变量)`);
    }
  }

  /**
   * 生成变量声明
   */
  private generateVariableDeclaration(varDecl: any): void {
    const varName = varDecl.name;
    
    // 标记变量为已初始化
    this.scopeManager.markVariableInitialized(varName);
    
    // 变量应该已经在作用域中（通过 StartCheckPoint 分配）
    const offset = this.scopeManager.getVariableOffset(varName);
    if (offset === null) {
      throw new Error(`变量 ${varName} 不在作用域中`);
      }
    
    // 生成初始化代码
    if (varDecl.initializer) {
      const valueAsm = this.generateExpression(varDecl.initializer);
      if (valueAsm) {
        this.lines.push(...this.addIndentToMultiLine(valueAsm));
      }
      this.lines.push(`  si ${offset}              ; 初始化 ${varName}`);
    } else {
      this.lines.push(`  mov eax, 0`);
      this.lines.push(`  si ${offset}              ; 初始化 ${varName}`);
    }
  }

  /**
   * 生成 let 声明
   */
  private generateLetDeclaration(letDecl: any): void {
    this.generateVariableDeclaration(letDecl);
  }

  /**
   * 生成赋值语句
   */
  private generateAssignment(assignment: any): void {
    const target = assignment.target.name;
    const valueAsm = this.generateExpression(assignment.value);
    
    if (valueAsm) {
      this.lines.push(...this.addIndentToMultiLine(valueAsm));
    }
    
    // 查找变量 offset，如果变量在当前作用域但还没有声明，则查找外层作用域
    const offset = this.getVariableOffsetForAssignment(target);
    if (offset !== null) {
      this.lines.push(`  si ${offset}              ; 赋值给 ${target}`);
    } else {
      this.lines.push(`  ; 未找到变量 ${target}`);
    }
  }
  
  /**
   * 为赋值语句查找变量 offset
   * 使用 scopeManager 的 getVariableOffset，它已经实现了正确的变量查找逻辑（只匹配 init: true 的变量）
   */
  private getVariableOffsetForAssignment(varName: string): number | null {
    // 使用 scopeManager 的查找逻辑，它会自动跳过未初始化的变量
    return this.scopeManager.getVariableOffset(varName);
  }

  /**
   * 生成表达式语句
   */
  private generateExpressionStatement(exprStmt: any): void {
    // 检查是否是赋值表达式（BinaryExpression with operator '='）
    if (exprStmt.expression?.type === 'BinaryExpression' && exprStmt.expression.operator === '=') {
      const assignment = exprStmt.expression;
      const target = assignment.left;
      if (target.type === 'Identifier') {
        const varName = target.name;
        // 生成右侧表达式的代码
        const valueAsm = this.generateExpression(assignment.right);
        if (valueAsm) {
          this.lines.push(...this.addIndentToMultiLine(valueAsm));
        }
        // 查找变量 offset 并存储
        const offset = this.getVariableOffsetForAssignment(varName);
        if (offset !== null) {
          this.lines.push(`  si ${offset}              ; 赋值给 ${varName}`);
    } else {
          this.lines.push(`  ; 未找到变量 ${varName}`);
        }
        return;
      }
    }
    
    // 检查是否是条件表达式（用于条件跳转）
    const isCondition = exprStmt.expression?.type === 'BinaryExpression' &&
      ['==', '!=', '<', '<=', '>', '>='].includes(exprStmt.expression?.operator);
    
    const exprAsm = this.generateExpression(exprStmt.expression, isCondition);
    if (exprAsm) {
      this.lines.push(...this.addIndentToMultiLine(exprAsm));
    }
  }

  /**
   * 生成返回语句
   */
  private generateReturn(ret: any): void {
    if (ret.value) {
      if (ret.value.type === 'Identifier') {
        const varName = ret.value.name;
        const offset = this.scopeManager.getFunctionLevelVariable(varName);
        if (offset !== null) {
          this.lines.push(`  li ${offset}              ; 返回变量 ${varName}`);
        } else {
          this.lines.push(`  mov eax, 0              ; 未找到变量 ${varName}`);
        }
      } else {
        const valueAsm = this.generateExpression(ret.value);
        if (valueAsm) {
          this.lines.push(...this.addIndentToMultiLine(valueAsm));
        }
      }
    } else {
      this.lines.push(`  mov eax, 0              ; 默认返回值`);
    }
    
    // 释放所有栈空间
    const totalVarCount = this.scopeManager.getTotalVarCount();
    if (totalVarCount > 0) {
      this.lines.push(`  add esp, ${totalVarCount}            ; 释放所有变量栈空间`);
    }
    
    // 函数退出：恢复旧的 ebp（只有非 main 函数才需要）
    if (this.currentFunctionName !== 'main') {
      this.lines.push(`  pop ebp               ; 恢复旧的 ebp`);
    }
    
    // 清理寄存器
    this.lines.push(`  mov ebx, 0              ; 清理 ebx`);
    this.lines.push(`  ret              ; 函数结束返回`);
  }

  /**
   * 生成控制流跳转
   */
  private generateControlFlow(block: BasicBlock): void {
    const hasReturn = block.statements.some(stmt => stmt.type === StatementType.RETURN_STATEMENT);
    const isExitBlock = block.isExit;
    
    // 如果是 exit block 且没有显式的 return 语句
    if (isExitBlock && !hasReturn) {
      // 释放所有栈空间
      const totalVarCount = this.scopeManager.getTotalVarCount();
      if (totalVarCount > 0) {
        this.lines.push(`  add esp, ${totalVarCount}            ; 释放所有变量栈空间`);
      }
      this.lines.push(`  mov eax, 0              ; 默认返回值`);
      this.lines.push(`  mov ebx, 0              ; 清理 ebx`);
      this.lines.push(`  ret              ; 函数结束返回`);
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
            this.lines.push('');
            return;
          }
        }
        
        // 默认跳转
        this.lines.push(`  jmp ${trueTarget.id}`);
      } else if (block.successors.length === 1) {
        // 单一后继：直接跳转
        this.lines.push(`  jmp ${block.successors[0]!.id}`);
    }
    }
    this.lines.push('');
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
          this.lines.push(`  jge ${trueLabel}     ; 如果 >= 则跳转到true分支`);
          this.lines.push(`  jmp ${falseLabel}    ; 否则跳转到false分支`);
          break;
        case '>':
          this.lines.push(`  jg ${trueLabel}     ; 如果 > 则跳转到true分支`);
          this.lines.push(`  jmp ${falseLabel}    ; 否则跳转到false分支`);
          break;
        case '<=':
          this.lines.push(`  jle ${trueLabel}     ; 如果 <= 则跳转到true分支`);
          this.lines.push(`  jmp ${falseLabel}    ; 否则跳转到false分支`);
          break;
        case '<':
          this.lines.push(`  jl ${trueLabel}     ; 如果 < 则跳转到true分支`);
          this.lines.push(`  jmp ${falseLabel}    ; 否则跳转到false分支`);
          break;
        case '==':
          this.lines.push(`  je ${trueLabel}     ; 如果 == 则跳转到true分支`);
          this.lines.push(`  jmp ${falseLabel}    ; 否则跳转到false分支`);
          break;
        case '!=':
          this.lines.push(`  jne ${trueLabel}     ; 如果 != 则跳转到true分支`);
          this.lines.push(`  jmp ${falseLabel}    ; 否则跳转到false分支`);
          break;
        default:
          this.lines.push(`  jmp ${falseLabel}`);
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
    const offset = this.scopeManager.getVariableOffset(varName);
    
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
        // 返回右侧表达式的值（在 eax 中）
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
   * 生成函数调用
   */
  private generateFunctionCall(funcCall: any): string {
    const funcName = funcCall.callee.name;
    // 生成 call 指令，函数名会在链接时解析
    return `call ${funcName}`;
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
   * 比较两个快照是否相等
   */
  private snapshotsEqual(
    snapshot1: Map<string, { offset: number; init: boolean }>[],
    snapshot2: Map<string, { offset: number; init: boolean }>[]
  ): boolean {
    if (snapshot1.length !== snapshot2.length) {
      return false;
    }
    
    for (let i = 0; i < snapshot1.length; i++) {
      const scope1 = snapshot1[i]!;
      const scope2 = snapshot2[i]!;
      
      if (scope1.size !== scope2.size) {
        return false;
      }
      
      for (const [name, info1] of scope1) {
        const info2 = scope2.get(name);
        if (!info2 || info1.offset !== info2.offset || info1.init !== info2.init) {
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * 快照转字符串（用于调试）
   */
  private snapshotToString(snapshot: Map<string, { offset: number; init: boolean }>[]): string {
    return snapshot.map((scope, idx) => {
      const vars = Array.from(scope.entries()).map(([name, info]) => `${name}:${info.offset}${info.init ? '*' : ''}`).join(', ');
      return `scope[${idx}]: {${vars}}`;
    }).join(' | ');
  }
}
