import type { Statement, Expression, BinaryExpression, UnaryExpression, NumberLiteral, Identifier, AssignmentStatement, ReturnStatement, StartCheckPoint, EndCheckPoint } from './ast';
import type { BasicBlock, ControlFlowGraph } from './cfg-generator';
import type { ScopeManager } from './scope-manager';
import { StatementType } from './types';

// 作用域信息（用于验证配对）
interface ScopeInfo {
  id: string;
  variableNames: Set<string>;
  depth: number;
}

// 汇编生成器 - 基于 separated.ts 的方法
export class AssemblyGenerator {
  private scopeManager: ScopeManager;
  private scopeStack: ScopeInfo[] = [];  // 作用域栈，用于验证 StartCheckPoint/EndCheckPoint 配对

  constructor(scopeManager: ScopeManager) {
    this.scopeManager = scopeManager;
  }

  // 生成汇编代码
  generateAssembly(cfg: ControlFlowGraph): string {
    // 重置作用域管理器
    this.scopeManager.reset();
    this.scopeStack = [];  // 重置作用域栈
    
    const lines: string[] = [];
    
    lines.push(`; Function: ${cfg.functionName}`);
    lines.push(`${cfg.functionName}:`);
    lines.push('');
    
    // 先找到入口块并预先声明函数级变量
    const entryBlock = cfg.blocks.find(b => b.isEntry);
    if (entryBlock) {
      // 声明函数级变量（跳过 StartCheckPoint/EndCheckPoint）
      for (const stmt of entryBlock.statements) {
        if (stmt.type === StatementType.VARIABLE_DECLARATION || stmt.type === StatementType.LET_DECLARATION) {
          const varName = (stmt as any).name;
          this.scopeManager.declareFunctionVariable(varName);
        }
      }
    }
    
    // 按照 separated.ts 的方法处理：遍历语句并管理作用域
    this.generateStatementsWithScope(cfg.blocks, lines);
    
    return lines.join('\n');
  }

  // 辅助函数：为多行汇编代码添加缩进
  private addIndentToMultiLine(code: string, indent: string = '  '): string[] {
    return code.split('\n').map(line => line.trim() ? `${indent}${line}` : '').filter(line => line);
  }

  // 按照 separated.ts 的方法生成语句并管理作用域
  private generateStatementsWithScope(blocks: BasicBlock[], lines: string[]): void {
    // 为每个基本块计算进入时的作用域栈状态
    const blockScopeStates = new Map<string, ScopeInfo[]>();
    
    // 从入口块开始，DFS 传播作用域状态
    const processed = new Set<string>();
    const worklist: BasicBlock[] = [];
    
    // 找到入口块
    const entryBlock = blocks.find(b => b.isEntry);
    if (entryBlock) {
      blockScopeStates.set(entryBlock.id, []);
      worklist.push(entryBlock);
    }
    
    // BFS 传播作用域状态
    while (worklist.length > 0) {
      const block = worklist.shift()!;
      if (processed.has(block.id)) continue;
      
      processed.add(block.id);
      const enteringScopeStack = blockScopeStates.get(block.id) || [];
      
      // 计算退出时的作用域栈
      let exitingScopeStack = [...enteringScopeStack];
      for (const stmt of block.statements) {
        if (stmt.type === StatementType.START_CHECK_POINT) {
          const cp = stmt as StartCheckPoint;
          exitingScopeStack.push({
            id: cp.scopeId,
            variableNames: cp.variableNames,
            depth: cp.depth
          });
        } else if (stmt.type === StatementType.END_CHECK_POINT) {
          const cp = stmt as EndCheckPoint;
          // 查找匹配的作用域
          const foundIndex = exitingScopeStack.findIndex(s => s.id === cp.scopeId);
          if (foundIndex !== -1) {
            exitingScopeStack = exitingScopeStack.slice(0, foundIndex);
          } else {
            // 如果没找到，说明作用域栈可能不同步，但我们仍然继续
            console.warn(`⚠️  在块 ${block.id} 中，EndCheckPoint ${cp.scopeId} 不在作用域栈中`);
          }
        }
      }
      
      // 传播到后继块
      for (const successor of block.successors) {
        if (!blockScopeStates.has(successor.id)) {
          blockScopeStates.set(successor.id, exitingScopeStack);
          worklist.push(successor);
        } else {
          // 多个前驱汇聚：验证作用域栈是否一致
          const existingStack = blockScopeStates.get(successor.id)!;
          if (JSON.stringify(existingStack) !== JSON.stringify(exitingScopeStack)) {
            // 如果不同，取较短的栈（更保守的策略）
            if (exitingScopeStack.length < existingStack.length) {
              blockScopeStates.set(successor.id, exitingScopeStack);
            }
          }
        }
      }
    }
    
    // 生成代码
    for (const block of blocks) {
      lines.push(`${block.id}:`);
      
      // 恢复该块进入时的作用域栈状态
      const enteringScopeStack = blockScopeStates.get(block.id) || [];
      this.scopeStack = [...enteringScopeStack];
      
      // 分离不同类型的语句
      const blockVars: any[] = [];
      const checkPoints: any[] = [];
      const otherStmts: any[] = [];
      
      for (const stmt of block.statements) {
        if (stmt.type === StatementType.VARIABLE_DECLARATION || stmt.type === StatementType.LET_DECLARATION) {
          blockVars.push(stmt);
        } else if (stmt.type === StatementType.START_CHECK_POINT || stmt.type === StatementType.END_CHECK_POINT) {
          checkPoints.push(stmt);
        } else {
          otherStmts.push(stmt);
        }
      }
      
      // Entry block 中的变量是函数级变量，不需要进入新作用域
      if (block.isEntry) {
        // 为函数级变量分配栈空间
        if (blockVars.length > 0) {
          lines.push(`  sub esp, ${blockVars.length}            ; 为${blockVars.length}个函数级变量分配栈空间`);
        }
        
        // 按顺序处理所有语句（包括 CheckPoint）
        for (const stmt of block.statements) {
          this.generateStatementWithScope(stmt, lines, false, /*preallocated*/ stmt.type === StatementType.VARIABLE_DECLARATION || stmt.type === StatementType.LET_DECLARATION);
        }
      } else {
        // 非 entry block：按照原始顺序处理所有语句（包括 CheckPoint）
        // CheckPoint 会处理作用域的进入/退出
        // 注意：如果块内有 CheckPoint，就不需要手动处理 blockVars 了（CheckPoint 已处理）
        // 如果没有 CheckPoint，才需要手动处理（向后兼容旧代码）
        const hasCheckPoints = checkPoints.length > 0;
        const isConditionalBranch = block.successors.length > 1;
        const lastStmt = block.statements[block.statements.length - 1];
        const isLastStmtComparison = lastStmt && 
          lastStmt.type === StatementType.EXPRESSION_STATEMENT &&
          (lastStmt as any).expression?.type === 'BinaryExpression' &&
          ['==', '!=', '<', '<=', '>', '>='].includes((lastStmt as any).expression?.operator);

        // 如果没有 CheckPoint，使用旧逻辑（向后兼容）
        if (!hasCheckPoints && blockVars.length > 0) {
          this.scopeManager.enterScope(blockVars.length);
          lines.push(`  sub esp, ${blockVars.length}            ; 为${blockVars.length}个块级变量分配栈空间`);
        }

        for (let i = 0; i < block.statements.length; i++) {
          const stmt = block.statements[i]!;
          const isLastAndConditional = (i === block.statements.length - 1) && isConditionalBranch && isLastStmtComparison;
          
          // 如果是最后一个语句且用于条件跳转，生成时不包含 setXX 和 and
          this.generateStatementWithScope(stmt, lines, isLastAndConditional);
        }

        // 如果没有 CheckPoint，手动释放（向后兼容）
        if (!hasCheckPoints && blockVars.length > 0) {
          // 检查是否是 for 循环的初始化块（需要保留分配直到循环结束）
          const isForLoopInitBlock = block.successors.length === 1 && 
            block.successors[0]?.successors.length === 2 &&
            block.successors[0]?.predecessors.length > 1;
          
          if (!isForLoopInitBlock) {
            lines.push(`  add esp, ${blockVars.length}            ; 释放块级变量栈空间`);
            this.scopeManager.exitScope();
          }
        }
      }
      
      // 检查块是否包含 ret 语句或是否是 exit block
      const hasReturn = block.statements.some(stmt => stmt.type === StatementType.RETURN_STATEMENT);
      const isExitBlock = block.isExit;
      
      // 如果是 exit block 且没有显式的 return 语句，需要生成释放函数级变量和 ret
      if (isExitBlock && !hasReturn) {
        // 释放函数级变量的栈空间和所有未释放的块级变量栈空间
        const functionVarCount = this.scopeManager.getFunctionVariableCount();
        const totalAllocated = (this.scopeManager as any).totalAllocated || 0;
        const totalToRelease = functionVarCount + totalAllocated;
        if (totalToRelease > 0) {
          lines.push(`  add esp, ${totalToRelease}            ; 释放所有变量栈空间`);
        }
        // 清理寄存器
        lines.push(`  mov eax, 0              ; 默认返回值`);
        lines.push(`  mov ebx, 0              ; 清理 ebx`);
        lines.push(`  ret              ; 函数结束返回`);
      }
      
      // 生成跳转指令（如果块包含 ret 或已经是 exit block，则不生成跳转）
      if (!hasReturn && !isExitBlock) {
        if (block.successors.length > 1) {
          // 多个后继：条件分支（if-else, if-else if-else 等）
          const trueTarget = block.successors[0]!;
          const falseTarget = block.successors[block.successors.length - 1]!; // 最后一个后继通常是 false/else 分支
          
          // 检查最后一个语句是否是条件表达式
          const lastStmt = block.statements[block.statements.length - 1];
          if (lastStmt && lastStmt.type === StatementType.EXPRESSION_STATEMENT) {
            const exprStmt = lastStmt as any;
            if (exprStmt.expression && exprStmt.expression.type === 'BinaryExpression') {
              
              // 生成条件跳转（使用已生成的 cmp 指令）
              this.generateConditionalJump(exprStmt.expression, trueTarget.id, falseTarget.id, lines);
              lines.push('');
              continue; // 跳过下面的默认跳转
            }
          }
          
          // 如果没有识别出条件语句，默认跳转到第一个后继
          lines.push(`  jmp ${trueTarget.id}`);
        } else if (block.successors.length === 1) {
          // 单一后继：直接跳转（break, continue 等情况，但不包括 return）
          lines.push(`  jmp ${block.successors[0]!.id}`);
        }
      }
      lines.push('');
    }
  }

  // 生成条件跳转
  private generateConditionalJump(
    condition: any,
    trueLabel: string,
    falseLabel: string,
    lines: string[]
  ): void {
    if (condition.type === 'BinaryExpression') {
      const op = condition.operator;
      
      // 根据操作符生成相应的跳转指令
      switch (op) {
        case '>=':
          lines.push(`  jge ${trueLabel}     ; 如果 >= 则跳转到true分支`);
          lines.push(`  jmp ${falseLabel}    ; 否则跳转到false分支`);
          break;
        case '>':
          lines.push(`  jg ${trueLabel}     ; 如果 > 则跳转到true分支`);
          lines.push(`  jmp ${falseLabel}    ; 否则跳转到false分支`);
          break;
        case '<=':
          lines.push(`  jle ${trueLabel}     ; 如果 <= 则跳转到true分支`);
          lines.push(`  jmp ${falseLabel}    ; 否则跳转到false分支`);
          break;
        case '<':
          lines.push(`  jl ${trueLabel}     ; 如果 < 则跳转到true分支`);
          lines.push(`  jmp ${falseLabel}    ; 否则跳转到false分支`);
          break;
        case '==':
          lines.push(`  je ${trueLabel}     ; 如果 == 则跳转到true分支`);
          lines.push(`  jmp ${falseLabel}    ; 否则跳转到false分支`);
          break;
        case '!=':
          lines.push(`  jne ${trueLabel}     ; 如果 != 则跳转到true分支`);
          lines.push(`  jmp ${falseLabel}    ; 否则跳转到false分支`);
          break;
        default:
          // 默认跳转到false分支
          lines.push(`  jmp ${falseLabel}`);
      }
    }
  }

  // 生成语句并管理作用域
  // forCondition: 如果为 true，表示用于条件跳转，不生成 setXX 和 and 指令
  private generateStatementWithScope(statement: any, lines: string[], forCondition: boolean = false, preallocated: boolean = false): void {
    switch (statement.type) {
      case StatementType.START_CHECK_POINT:
        this.generateStartCheckPoint(statement as StartCheckPoint, lines);
        break;
      case StatementType.END_CHECK_POINT:
        this.generateEndCheckPoint(statement as EndCheckPoint, lines);
        break;
      case StatementType.VARIABLE_DECLARATION:
        this.generateVariableDeclarationWithScope(statement, lines, preallocated);
        break;
      case StatementType.LET_DECLARATION:
        this.generateLetDeclarationWithScope(statement, lines, preallocated);
        break;
      case StatementType.BLOCK_STATEMENT:
        this.generateBlockStatementWithScope(statement, lines);
        break;
      case StatementType.IF_STATEMENT:
        this.generateIfStatementWithScope(statement, lines);
        break;
      case StatementType.WHILE_STATEMENT:
        this.generateWhileStatementWithScope(statement, lines);
        break;
      case StatementType.FOR_STATEMENT:
        this.generateForStatementWithScope(statement, lines);
        break;
      case StatementType.RETURN_STATEMENT:
        this.generateReturnStatementWithScope(statement, lines);
        break;
      case StatementType.ASSIGNMENT_STATEMENT:
        this.generateAssignmentStatementWithScope(statement, lines);
        break;
      case StatementType.EXPRESSION_STATEMENT:
        this.generateExpressionStatementWithScope(statement, lines, forCondition);
        break;
      default:
        break;
    }
  }

  // 处理 StartCheckPoint：进入新作用域
  private generateStartCheckPoint(checkPoint: StartCheckPoint, lines: string[]): void {
    const varCount = checkPoint.variableNames.size;
    // 分配栈空间
    if (varCount > 0) {
      const varList = Array.from(checkPoint.variableNames).join(', ');
      lines.push(`  sub esp, ${varCount}            ; 进入作用域 ${checkPoint.scopeId} (depth: ${checkPoint.depth}, vars: [${varList}])`);
      this.scopeManager.enterScope(varCount);
    } else {
      lines.push(`  ; 进入作用域 ${checkPoint.scopeId} (depth: ${checkPoint.depth}, 无变量)`);
    }
    
    // 更新作用域栈
    this.scopeStack.push({
      id: checkPoint.scopeId,
      variableNames: checkPoint.variableNames,
      depth: checkPoint.depth
    });
  }

  // 处理 EndCheckPoint：退出作用域
  private generateEndCheckPoint(checkPoint: EndCheckPoint, lines: string[]): void {
    const varCount = checkPoint.variableNames.size;
    // 从作用域栈中查找匹配的作用域
    const foundIndex = this.scopeStack.findIndex(s => s.id === checkPoint.scopeId);
    
    if (foundIndex === -1) {
      // 如果没找到，可能是作用域栈状态不同步（已在传播阶段处理过）
      // 但我们仍然生成代码以继续执行
      console.warn(`⚠️  EndCheckPoint ${checkPoint.scopeId} 不在作用域栈中`);
      if (varCount > 0) {
        const varList = Array.from(checkPoint.variableNames).join(', ');
        lines.push(`  add esp, ${varCount}            ; 退出作用域 ${checkPoint.scopeId} [警告：状态可能不同步] (vars: [${varList}])`);
        try {
          this.scopeManager.exitScope();
        } catch (e) {
          // 忽略错误
        }
      }
      return;
    }
    
    // 验证 variableNames 是否一致
    const foundScope = this.scopeStack[foundIndex]!;
    const foundVarSet = foundScope.variableNames;
    const expectedVarSet = checkPoint.variableNames;
    
    // 比较两个 Set 是否相等
    if (foundVarSet.size !== expectedVarSet.size || 
        !Array.from(foundVarSet).every(v => expectedVarSet.has(v))) {
      const foundList = Array.from(foundVarSet).sort().join(', ');
      const expectedList = Array.from(expectedVarSet).sort().join(', ');
      throw new Error(
        `VariableNames mismatch for scope ${checkPoint.scopeId}: expected [${expectedList}], got [${foundList}]`
      );
    }
    
    // 释放栈空间
    if (varCount > 0) {
      const varList = Array.from(checkPoint.variableNames).join(', ');
      lines.push(`  add esp, ${varCount}            ; 退出作用域 ${checkPoint.scopeId} (depth: ${checkPoint.depth}, vars: [${varList}])`);
      // 退出从 foundIndex 到栈顶的所有作用域
      const scopesToExit = this.scopeStack.length - foundIndex;
      for (let i = 0; i < scopesToExit; i++) {
        this.scopeManager.exitScope();
      }
    } else {
      lines.push(`  ; 退出作用域 ${checkPoint.scopeId} (depth: ${checkPoint.depth}, 无变量)`);
    }
    
    // 更新作用域栈：移除从 foundIndex 开始的所有作用域
    this.scopeStack = this.scopeStack.slice(0, foundIndex);
  }

  // 生成块语句并管理作用域
  private generateBlockStatementWithScope(blockStmt: any, lines: string[]): void {
    // 计算当前作用域的变量声明数
    let variableCount = 0;
    const processStatement = (stmt: any): void => {
      if (stmt.type === StatementType.VARIABLE_DECLARATION || stmt.type === StatementType.LET_DECLARATION) {
        variableCount++;
      }
    };
    
    for (const stmt of blockStmt.statements) {
      processStatement(stmt);
    }
    
    // 进入新作用域，传入将要分配的总空间
    this.scopeManager.enterScope(variableCount);
    
    // 为块级变量分配栈空间
    if (variableCount > 0) {
      lines.push(`  sub esp, ${variableCount}            ; 为${variableCount}个块级变量分配栈空间`);
    }
    
    // 生成块内语句
    for (const stmt of blockStmt.statements) {
      this.generateStatementWithScope(stmt, lines);
    }
    
    // 退出作用域
    if (variableCount > 0) {
      lines.push(`  add esp, ${variableCount}            ; 释放块级变量栈空间`);
    }
    this.scopeManager.exitScope();
  }

  // 生成变量声明并管理作用域
  private generateVariableDeclarationWithScope(varDecl: any, lines: string[], preallocated: boolean = false): void {
    const varName = varDecl.name;
    
    // 声明变量到作用域管理器
    const isInBlock = this.scopeManager.isInBlock();
    let offset: number;
    if (isInBlock) {
      offset = this.scopeManager.declareBlockVariable(varName);
    } else {
      const before = this.scopeManager.getFunctionVariableCount();
      offset = this.scopeManager.declareFunctionVariable(varName);
      const after = this.scopeManager.getFunctionVariableCount();
      // 如果是在入口块之外首次声明新的函数级变量，则需要即时分配栈空间
      if (!preallocated && after > before) {
        lines.push(`  sub esp, 1            ; 为函数级变量 ${varName} 分配栈空间`);
      }
    }
    
    if (varDecl.initializer) {
      const valueAsm = this.generateExpressionAssembly(varDecl.initializer);
      if (valueAsm) {
        lines.push(...this.addIndentToMultiLine(valueAsm));
        lines.push(`  si ${offset}              ; 初始化 ${varName}`);
      }
    } else {
      lines.push(`  mov eax, 0`);
      lines.push(`  si ${offset}              ; 初始化 ${varName}`);
    }
  }

  // 生成let声明并管理作用域
  private generateLetDeclarationWithScope(letDecl: any, lines: string[], preallocated: boolean = false): void {
    this.generateVariableDeclarationWithScope(letDecl, lines, preallocated);
  }

  // 生成if语句并管理作用域
  private generateIfStatementWithScope(ifStmt: any, lines: string[]): void {
    // 生成条件
    const conditionAsm = this.generateExpressionAssembly(ifStmt.condition);
    if (conditionAsm) {
      lines.push(...this.addIndentToMultiLine(conditionAsm));
    }
    
    // 生成then分支
    if (ifStmt.thenBranch.type === StatementType.BLOCK_STATEMENT) {
      this.generateBlockStatementWithScope(ifStmt.thenBranch, lines);
    } else {
      this.generateStatementWithScope(ifStmt.thenBranch, lines);
    }
    
    // 生成else分支
    if (ifStmt.elseBranch) {
      if (ifStmt.elseBranch.type === StatementType.BLOCK_STATEMENT) {
        this.generateBlockStatementWithScope(ifStmt.elseBranch, lines);
      } else {
        this.generateStatementWithScope(ifStmt.elseBranch, lines);
      }
    }
  }

  // 生成while语句并管理作用域
  private generateWhileStatementWithScope(whileStmt: any, lines: string[]): void {
    // 生成循环体
    if (whileStmt.body.type === StatementType.BLOCK_STATEMENT) {
      this.generateBlockStatementWithScope(whileStmt.body, lines);
    } else {
      this.generateStatementWithScope(whileStmt.body, lines);
    }
  }

  // 生成for语句并管理作用域
  private generateForStatementWithScope(forStmt: any, lines: string[]): void {
    // 进入for循环作用域
    this.scopeManager.enterForLoop();
    
    // 生成初始化
    if (forStmt.init) {
      this.generateStatementWithScope(forStmt.init, lines);
    }
    
    // 生成循环体
    if (forStmt.body.type === StatementType.BLOCK_STATEMENT) {
      this.generateBlockStatementWithScope(forStmt.body, lines);
    } else {
      this.generateStatementWithScope(forStmt.body, lines);
    }
    
    // 生成更新
    if (forStmt.update) {
      this.generateStatementWithScope(forStmt.update, lines);
    }
    
    // 退出for循环作用域
    this.scopeManager.exitForLoop();
  }

  // 生成返回语句并管理作用域
  private generateReturnStatementWithScope(ret: any, lines: string[]): void {
    if (ret.value) {
      if (ret.value.type === 'Identifier') {
        const varName = ret.value.name;
        // 直接查找函数级作用域的变量
        const offset = this.scopeManager.getFunctionLevelVariable(varName);
        if (offset !== null) {
          lines.push(`  li ${offset}              ; 返回函数级变量 ${varName}`);
        } else {
          lines.push(`  mov eax, 0              ; 未找到变量 ${varName}`);
        }
      } else {
        const valueAsm = this.generateExpressionAssembly(ret.value);
        if (valueAsm) {
          lines.push(...this.addIndentToMultiLine(valueAsm));
        }
      }
    } else {
      lines.push(`  mov eax, 0              ; 默认返回值`);
    }
    
    // 释放函数级变量的栈空间和所有未释放的块级变量栈空间
    const functionVarCount = this.scopeManager.getFunctionVariableCount();
    // 获取所有未释放的块级变量空间（totalAllocated）
    const totalAllocated = (this.scopeManager as any).totalAllocated || 0;
    const totalToRelease = functionVarCount + totalAllocated;
    if (totalToRelease > 0) {
      lines.push(`  add esp, ${totalToRelease}            ; 释放所有变量栈空间`);
    }
    
    // 清理寄存器
    lines.push(`  mov ebx, 0              ; 清理 ebx`);
    lines.push(`  ret`);
  }

  // 生成赋值语句并管理作用域
  private generateAssignmentStatementWithScope(assignment: any, lines: string[]): void {
    const target = assignment.target.name;
    const valueAsm = this.generateExpressionAssembly(assignment.value);
    
    if (valueAsm) {
      lines.push(...this.addIndentToMultiLine(valueAsm));
    }
    
    // 查找变量
    const offset = this.scopeManager.getVariable(target);
    if (offset !== null) {
      lines.push(`  si ${offset}              ; 赋值给 ${target}`);
    } else {
      lines.push(`  ; 未找到变量 ${target}`);
    }
  }

  // 生成表达式语句并管理作用域
  private generateExpressionStatementWithScope(exprStmt: any, lines: string[], forCondition: boolean = false): void {
    const exprAsm = this.generateExpressionAssembly(exprStmt.expression, forCondition);
    if (exprAsm) {
      lines.push(...this.addIndentToMultiLine(exprAsm));
    }
  }

  // 生成表达式汇编
  // forCondition: 如果为 true，表示用于条件跳转，不生成 setXX 和 and 指令
  private generateExpressionAssembly(expression: any, forCondition: boolean = false): string | null {
    switch (expression.type) {
      case 'NumberLiteral':
        return this.generateNumberLiteralAssembly(expression);
      case 'Identifier':
        return this.generateIdentifierAssembly(expression);
      case 'BinaryExpression':
        return this.generateBinaryExpressionAssembly(expression, forCondition);
      case 'UnaryExpression':
        return this.generateUnaryExpressionAssembly(expression);
      default:
        return null;
    }
  }

  // 生成数字字面量汇编
  private generateNumberLiteralAssembly(num: NumberLiteral): string {
    return `mov eax, ${num.value}`;
  }

  // 生成标识符汇编
  private generateIdentifierAssembly(identifier: Identifier): string {
    const varName = identifier.name;
    const offset = this.scopeManager.getVariable(varName);
    
    if (offset !== null) {
      return `li ${offset}`;
    }
    
    return 'mov eax, 0';
  }

  // 生成二元表达式汇编
  // forCondition: 如果为 true，表示用于条件跳转，只生成 cmp，不生成 setXX 和 and
  private generateBinaryExpressionAssembly(binary: BinaryExpression, forCondition: boolean = false): string {
    const leftAsm = this.generateExpressionAssembly(binary.left);
    const rightAsm = this.generateExpressionAssembly(binary.right);
    
    if (!leftAsm || !rightAsm) {
      return 'mov eax, 0';
    }
    
    const cmpPart = `${leftAsm}\npush eax\n${rightAsm}\nmov ebx, eax\npop eax\ncmp eax, ebx`;
    
    switch (binary.operator) {
      case '=':
        // 赋值操作：计算右侧值，然后存储到左侧变量
        // left 应该是 Identifier，需要获取其 offset
        if (binary.left.type === 'Identifier') {
          const varName = (binary.left as Identifier).name;
          const offset = this.scopeManager.getVariable(varName);
          if (offset !== null) {
            // 生成右侧表达式，结果在 eax 中，然后存储到变量
            return `${rightAsm}\nsi ${offset}`;
          }
        }
        // 如果左侧不是标识符或找不到变量，返回默认值
        return 'mov eax, 0';
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

  // 生成一元表达式汇编
  private generateUnaryExpressionAssembly(unary: UnaryExpression): string {
    const operandAsm = this.generateExpressionAssembly(unary.operand);
    
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
}