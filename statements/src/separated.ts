// 语句解析器分离版本
// 解析 + AST生成 + 代码生成

import { StatementParser } from './parser';
import type { Program, Statement, Expression, CodeGenResult } from './types';
import type { 
  NumberLiteral, 
  Identifier, 
  BinaryExpression, 
  UnaryExpression, 
  FunctionCall,
  ExpressionStatement,
  AssignmentStatement,
  VariableDeclaration,
  LetDeclaration,
  FunctionDeclaration,
  IfStatement,
  WhileStatement,
  ForStatement,
  ReturnStatement,
  BreakStatement,
  ContinueStatement,
  BlockStatement,
  EmptyStatement
} from './ast';

// 作用域管理器
class ScopeManager {
  private scopes: Map<string, number>[] = [new Map()]; // 作用域栈
  private functionStackOffset = 0; // 函数级变量栈偏移
  private currentBlockOffset = 0; // 当前块级变量偏移
  private functionParameters: string[] = []; // 函数参数列表
  private tdzVars: Set<string> = new Set(); // TDZ 变量集合
  private blockVariableCount = 0; // 当前块中的变量计数
  
  // 进入新作用域
  enterScope(): void {
    this.scopes.push(new Map());
    this.currentBlockOffset = 0; // 重置块级变量偏移
    this.blockVariableCount = 0; // 重置块级变量计数，让if/else分支可以重用栈空间
  }
  
  // 设置块级变量的起始偏移（基于函数级变量）
  setBlockVariableStartOffset(functionVarCount?: number): void {
    if (functionVarCount !== undefined) {
      this.blockVariableCount = functionVarCount; // 从函数级变量数量开始计数
    } else {
      const varCount = Math.abs(this.functionStackOffset);
      this.blockVariableCount = varCount; // 从函数级变量数量开始计数
    }
  }
  
  // 退出当前作用域
  exitScope(): void {
    if (this.scopes.length > 1) {
      this.scopes.pop();
    }
  }
  
  // 设置函数参数
  setFunctionParameters(parameters: string[]): void {
    this.functionParameters = parameters;
  }
  
  // 声明函数级变量
  declareFunctionVariable(name: string): number {
    const offset = --this.functionStackOffset; // 负数偏移
    this.scopes[0]!.set(name, offset); // 函数级变量存储在根作用域
    return offset;
  }
  
  // 声明块级变量
  declareBlockVariable(name: string): number {
    const currentScope = this.scopes[this.scopes.length - 1]!;
    
    // 检查是否已经声明过
    if (currentScope.has(name)) {
      throw new Error(`变量 '${name}' 已经在当前作用域中声明过`);
    }
    
    // 块级变量使用简单的递增计数，从当前blockVariableCount开始
    const offset = -(++this.blockVariableCount);
    currentScope.set(name, offset);
    return offset;
  }

  // 声明 let 变量（支持 TDZ）
  declareLetVariable(name: string, isInBlock: boolean = false): number {
    this.tdzVars.add(name); // 标记为 TDZ
    
    if (isInBlock) {
      const currentScope = this.scopes[this.scopes.length - 1]!;
      
      // 检查是否已经声明过
      if (currentScope.has(name)) {
        throw new Error(`变量 '${name}' 已经在当前作用域中声明过`);
      }
      
      // 块级let变量使用简单的递增计数，从当前blockVariableCount开始
      const offset = -(++this.blockVariableCount);
      currentScope.set(name, offset);
      return offset;
    } else {
      // 检查函数级作用域是否已经声明过
      if (this.scopes[0]!.has(name)) {
        throw new Error(`变量 '${name}' 已经在当前作用域中声明过`);
      }
      
      // 函数级let变量使用函数栈偏移
      const offset = --this.functionStackOffset;
      this.scopes[0]!.set(name, offset);
      return offset;
    }
  }

  // 初始化 let 变量（结束 TDZ）
  initializeLetVariable(name: string): void {
    this.tdzVars.delete(name);
  }
  
  // 查找变量
  getVariable(name: string): number | null {
    // 从内层到外层查找
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const scope = this.scopes[i];
      if (scope && scope.has(name)) {
        return scope.get(name)!;
      }
    }
    
    // 如果都没找到，检查是否是函数参数
    const paramIndex = this.functionParameters.indexOf(name);
    if (paramIndex !== -1) {
      return paramIndex + 2; // 参数从 ebp+2 开始（跳过返回地址）
    }
    
    return null;
  }
  
  // 重置（用于新函数）
  reset(): void {
    this.scopes = [new Map()];
    this.functionStackOffset = 0;
    this.currentBlockOffset = 0;
    this.functionParameters = [];
    this.tdzVars.clear();
    this.blockVariableCount = 0;
  }
  
  // 获取函数级变量数量
  getFunctionVariableCount(): number {
    return Math.abs(this.functionStackOffset);
  }
  
  // 获取块级变量数量
  getBlockVariableCount(): number {
    return Math.abs(this.currentBlockOffset);
  }
  
  // 获取总变量数量（函数级 + 块级）
  getTotalVariableCount(): number {
    return this.getFunctionVariableCount() + this.getBlockVariableCount();
  }
  
  // 检查是否在块作用域中
  isInBlock(): boolean {
    return this.scopes.length > 1;
  }
  
  // 获取当前作用域
  getCurrentScope(): Map<string, number> {
    return this.scopes[this.scopes.length - 1]!;
  }
  
  // 获取所有变量信息（包括 TDZ 状态）
  getAllVariables(): Map<string, { offset: number; isTDZ: boolean }> {
    const result = new Map<string, { offset: number; isTDZ: boolean }>();
    
    // 遍历所有作用域
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const scope = this.scopes[i];
      if (scope) {
        for (const [name, offset] of scope) {
          if (!result.has(name)) {
            result.set(name, { offset, isTDZ: this.tdzVars.has(name) });
          }
        }
      }
    }
    
    return result;
  }
}

export class StatementCodeGenerator {
  private assemblyCode: string[] = [];
  private tempVarCounter = 0;
  private labelCounter = 0;
  private variables: Map<string, string> = new Map(); // 变量名 -> 栈偏移地址（兼容旧代码）
  private functions: Map<string, FunctionDeclaration> = new Map();
  private stackOffset = 0; // 当前栈偏移
  private continueStack: string[] = []; // continue 标签栈
  private breakStack: string[] = []; // break 标签栈
  private scopeManager = new ScopeManager(); // 作用域管理器
  private parserContext: any = null; // 解析器上下文引用
  private letVariables: Set<string> = new Set(); // 跟踪 let 变量
  private currentFunctionVarCount = 0; // 当前函数的函数级变量数量

  constructor() {
    this.setupBuiltinFunctions();
  }

  // 设置解析器上下文
  setParserContext(context: any): void {
    this.parserContext = context;
  }

  // 扫描函数体中的函数级变量声明（不包括块级变量）
  private scanFunctionLevelVariables(body: BlockStatement): string[] {
    const variables: string[] = [];
    
    // 只扫描函数体顶层的变量声明，不进入嵌套块
    for (const stmt of body.statements) {
      switch (stmt.type) {
        case 'VariableDeclaration':
          const varDecl = stmt as VariableDeclaration;
          console.log(`  找到函数级变量: ${varDecl.name}`);
          variables.push(varDecl.name);
          break;
        case 'LetDeclaration':
          const letDecl = stmt as LetDeclaration;
          console.log(`  找到函数级let: ${letDecl.name}`);
          variables.push(letDecl.name);
          break;
        case 'ForStatement':
          // for 循环中的变量属于块级作用域，不在这里处理
          console.log(`  扫描ForStatement - 跳过for循环变量`);
          break;
        // 其他语句类型不处理，因为它们不包含函数级变量
      }
    }
    
    return variables;
  }

  private setupBuiltinFunctions(): void {
    // 内置print函数
    this.functions.set('print', {
      type: 'FunctionDeclaration',
      name: 'print',
      returnType: 'void' as any,
      parameters: [{ name: 'value', type: 'int' as any }],
      body: {
        type: 'BlockStatement',
        statements: []
      }
    } as FunctionDeclaration);
  }

  public generate(program: Program): CodeGenResult {
    this.reset();
    
    try {
      this.generateProgram(program);
      
      return {
        code: this.assemblyCode.join('\n'),
        errors: [],
        warnings: []
      };
    } catch (error) {
      return {
        code: '',
        errors: [{
          message: `Code generation error: ${error instanceof Error ? error.message : String(error)}`,
          position: 0,
          line: 1,
          column: 1
        }],
        warnings: []
      };
    }
  }

  private generateProgram(program: Program): void {
    this.assemblyCode.push('; Generated assembly code');
    this.assemblyCode.push('.data');
    this.assemblyCode.push('  ; Variables will be declared here');
    this.assemblyCode.push('');
    this.assemblyCode.push('.text');
    this.assemblyCode.push('.global _start');
    this.assemblyCode.push('');
    this.assemblyCode.push('_start:');
    
    // 检查是否有main函数
    const hasMainFunction = program.statements.some(stmt => 
      stmt.type === 'FunctionDeclaration' && (stmt as FunctionDeclaration).name === 'main'
    );
    
    if (hasMainFunction) {
      // 如果有main函数，先调用main函数
      this.assemblyCode.push('  call function_main     ; 调用main函数');
      this.assemblyCode.push('  exit                  ; 退出程序');
    } else {
      // 没有main函数，直接执行语句
      // 设置栈帧
      this.assemblyCode.push('  push ebp              ; 保存调用者的BP');
      this.assemblyCode.push('  mov ebp, esp          ; 设置当前栈帧');
      
      // 不再为全局变量分配栈空间，变量在函数内部分配
      
      for (const statement of program.statements) {
        this.generateStatement(statement);
      }
      
      // 清理栈帧
      this.assemblyCode.push('  mov esp, ebp          ; 恢复栈指针');
      this.assemblyCode.push('  pop ebp               ; 恢复调用者的BP');
      this.assemblyCode.push('  exit                  ; 退出程序');
    }
    
    // 生成所有函数定义
    for (const statement of program.statements) {
      if (statement.type === 'FunctionDeclaration') {
        this.generateFunctionDeclaration(statement as FunctionDeclaration);
      }
    }
  }

  private generateStatement(statement: Statement): void {
    switch (statement.type) {
      case 'ExpressionStatement':
        this.generateExpressionStatement(statement as ExpressionStatement);
        break;
      case 'AssignmentStatement':
        this.generateAssignmentStatement(statement as AssignmentStatement);
        break;
      case 'VariableDeclaration':
        this.generateVariableDeclaration(statement as VariableDeclaration);
        break;
      case 'LetDeclaration':
        this.generateLetDeclaration(statement as LetDeclaration);
        break;
      case 'FunctionDeclaration':
        this.generateFunctionDeclaration(statement as FunctionDeclaration);
        break;
      case 'IfStatement':
        this.generateIfStatement(statement as IfStatement);
        break;
      case 'WhileStatement':
        this.generateWhileStatement(statement as WhileStatement);
        break;
      case 'ForStatement':
        this.generateForStatement(statement as ForStatement);
        break;
      case 'ReturnStatement':
        this.generateReturnStatement(statement as ReturnStatement);
        break;
      case 'BreakStatement':
        this.generateBreakStatement(statement as BreakStatement);
        break;
      case 'ContinueStatement':
        this.generateContinueStatement(statement as ContinueStatement);
        break;
      case 'BlockStatement':
        this.generateBlockStatement(statement as BlockStatement, false);
        break;
      case 'EmptyStatement':
        // 空语句，什么都不做
        break;
      default:
        throw new Error(`Unknown statement type: ${(statement as any).type}`);
    }
  }

  private generateExpressionStatement(statement: ExpressionStatement): void {
    this.generateExpression(statement.expression);
    this.assemblyCode.push(`  ; Expression result in eax`);
  }

  private generateAssignmentStatement(statement: AssignmentStatement): void {
    this.generateExpression(statement.value); // Result is in eax
    const target = statement.target.name;
    
    // 使用作用域管理器查找变量
    let offset = this.scopeManager.getVariable(target);
    if (offset === null) {
      // 变量未声明，按函数级变量处理
      offset = this.scopeManager.declareFunctionVariable(target);
    }
    
    // 使用SI指令存储
    this.assemblyCode.push(`  SI ${offset}              ; 存储到 ${target}`);
  }

  private generateVariableDeclaration(statement: VariableDeclaration): void {
    const varName = statement.name;
    
    // 使用作用域管理器声明变量
    const isInBlock = this.scopeManager.isInBlock();
    let offset: number;
    if (isInBlock) {
      offset = this.scopeManager.declareBlockVariable(varName);
    } else {
      offset = this.scopeManager.declareFunctionVariable(varName);
    }
    
    // 兼容旧代码
    const stackAddr = `[ebp${offset}]`;
    this.variables.set(varName, stackAddr);
    
    if (statement.initializer) {
      this.generateExpression(statement.initializer); // Result is in eax
      this.assemblyCode.push(`  SI ${offset}              ; 初始化 ${varName}`);
    } else {
      this.assemblyCode.push(`  mov dword ${stackAddr}, 0  ; Initialize to 0`);
    }
  }

  private generateLetDeclaration(statement: LetDeclaration): void {
    const varName = statement.name;
    
    // 使用作用域管理器声明 let 变量
    const isInBlock = this.scopeManager.isInBlock();
    const offset = this.scopeManager.declareLetVariable(varName, isInBlock);
    
    // 兼容旧代码
    const stackAddr = `[ebp${offset}]`;
    this.variables.set(varName, stackAddr);
    
    // 记录这是一个 let 变量（编译时处理，不再需要）
    // this.letVariables.add(varName);
    
    // TDZ 指令不再需要（编译时处理）
    // this.assemblyCode.push(`  TDZ_ADD ${varName}`);
    
    if (statement.initializer) {
      this.generateExpression(statement.initializer); // Result is in eax
      this.assemblyCode.push(`  SI ${offset}              ; 初始化 let ${varName}`);
    } else {
      this.assemblyCode.push(`  mov dword ${stackAddr}, 0  ; Initialize let to 0`);
    }
    
    // TDZ 指令不再需要（编译时处理）
    // this.assemblyCode.push(`  TDZ_REMOVE ${varName}`);
    this.scopeManager.initializeLetVariable(varName);
  }

  private generateFunctionDeclaration(statement: FunctionDeclaration): void {
    this.functions.set(statement.name, statement);
    
    this.assemblyCode.push('');
    this.assemblyCode.push(`function_${statement.name}:`);
    this.assemblyCode.push(`  push ebp`);
    this.assemblyCode.push(`  mov ebp, esp`);
    
    // 重置作用域管理器
    this.scopeManager.reset();
    
    // 设置函数参数
    const paramNames = statement.parameters.map(p => p.name);
    this.scopeManager.setFunctionParameters(paramNames);
    
    // 扫描函数级变量（不包括块级变量）
    const functionLevelVariables = this.scanFunctionLevelVariables(statement.body);
    
    console.log(`扫描到的函数级变量: ${functionLevelVariables.join(', ')}`);
    console.log(`函数级变量数量: ${functionLevelVariables.length}`);
    
    // 记录当前函数的函数级变量数量
    this.currentFunctionVarCount = functionLevelVariables.length;
    
    // 只为函数级变量分配栈空间
    if (functionLevelVariables.length > 0) {
      this.assemblyCode.push(`  sub esp, ${functionLevelVariables.length}            ; 为${functionLevelVariables.length}个函数级变量分配栈空间`);
      console.log(`生成指令: sub esp, ${functionLevelVariables.length}`);
    }
    
    // 兼容旧代码：处理函数参数
    const prevVariables = this.variables;
    const prevStackOffset = this.stackOffset;
    this.variables = new Map();
    this.stackOffset = 0;
    
    // 处理函数参数 - 参数在栈上，从ebp+1开始
    let paramOffset = 1; // ebp+1是第一个参数
    for (const param of statement.parameters) {
      const stackAddr = `[ebp+${paramOffset}]`;
      this.variables.set(param.name, stackAddr);
      paramOffset += 1; // 每个参数1字节
    }
    
    // 生成函数体
    this.generateBlockStatement(statement.body, true);
    
    // 注意：栈空间分配现在由变量声明时处理，不需要在这里统一分配
    
    // 如果没有显式的return语句，添加默认的ret
    // 检查函数体是否包含return语句
    const hasReturnStatement = this.hasReturnStatement(statement.body);
    if (!hasReturnStatement) {
      this.assemblyCode.push(`  pop ebp`);
      this.assemblyCode.push(`  ret`);
    }

    // 恢复外层作用域（用于后续函数或全局）
    this.variables = prevVariables;
    this.stackOffset = prevStackOffset;
  }

  private generateIfStatement(statement: IfStatement): void {
    const elseLabel = this.generateLabel('else');
    const endLabel = this.generateLabel('end');
    
    // 优化：直接生成条件跳转，而不是先计算表达式再检查
    this.generateConditionalJump(statement.condition, elseLabel);
    
    // 生成then分支
    this.generateStatement(statement.thenBranch);
    
    // 只有当有else分支时才需要跳转到end
    if (statement.elseBranch) {
      this.assemblyCode.push(`  jmp ${endLabel}`);
    }
    
    // 生成else分支
    this.assemblyCode.push(`${elseLabel}:`);
    if (statement.elseBranch) {
      this.generateStatement(statement.elseBranch);
    }
    
    this.assemblyCode.push(`${endLabel}:`);
  }

  private generateWhileStatement(statement: WhileStatement): void {
    const loopLabel = this.generateLabel('loop');
    const endLabel = this.generateLabel('end');
    const continueLabel = this.generateLabel('continue');
    const breakLabel = this.generateLabel('break');
    
    // 推入当前循环的标签
    this.continueStack.push(continueLabel);
    this.breakStack.push(breakLabel);
    
    // 保存当前栈偏移
    const prevStackOffset = this.stackOffset;
    
    this.assemblyCode.push(`${loopLabel}:`);
    this.assemblyCode.push(`${continueLabel}:`);
    
    // 优化：直接生成条件跳转
    this.generateConditionalJump(statement.condition, endLabel);
    
    // 生成循环体
    this.generateStatement(statement.body);
    
    this.assemblyCode.push(`  jmp ${loopLabel}`);
    this.assemblyCode.push(`${endLabel}:`);
    this.assemblyCode.push(`${breakLabel}:`);
    
    // 恢复栈偏移
    this.stackOffset = prevStackOffset;
    
    // 弹出当前循环的标签
    this.continueStack.pop();
    this.breakStack.pop();
  }

  private generateForStatement(statement: ForStatement): void {
    const loopLabel = this.generateLabel('loop');
    const endLabel = this.generateLabel('end');
    const continueLabel = this.generateLabel('continue');
    const breakLabel = this.generateLabel('break');
    
    // 推入当前循环的标签
    this.continueStack.push(continueLabel);
    this.breakStack.push(breakLabel);
    
    // 生成初始化
    if (statement.init) {
      this.generateStatement(statement.init);
    }
    
    this.assemblyCode.push(`${loopLabel}:`);
    
    // 生成条件检查
    if (statement.condition) {
      this.generateConditionalJump(statement.condition, endLabel);
    }
    
    // 生成循环体
    if (statement.body.type === 'BlockStatement') {
      this.generateBlockStatement(statement.body as BlockStatement, false);
    } else {
      this.generateStatement(statement.body);
    }
    
    this.assemblyCode.push(`${continueLabel}:`); // 添加 continue_target 标签
    
    // 生成更新
    if (statement.update) {
      this.generateStatement(statement.update);
    }
    
    this.assemblyCode.push(`  jmp ${loopLabel}`);
    this.assemblyCode.push(`${endLabel}:`);
    this.assemblyCode.push(`${breakLabel}:`); // 添加 break_target 标签
    
    // 弹出当前循环的标签
    this.continueStack.pop();
    this.breakStack.pop();
  }

  private generateReturnStatement(statement: ReturnStatement): void {
    if (statement.value) {
      this.generateExpression(statement.value); // Result is in eax
      // 返回值已在eax中，无需额外操作
    } else {
      this.assemblyCode.push(`  mov eax, 0              ; 默认返回值0`);
    }
    this.assemblyCode.push(`  mov esp, ebp             ; 恢复栈指针`);
    this.assemblyCode.push(`  pop ebp                  ; 恢复调用者BP`);
    this.assemblyCode.push(`  ret                      ; 返回调用者`);
  }

  private hasReturnStatement(body: BlockStatement): boolean {
    for (const stmt of body.statements) {
      if (stmt.type === 'ReturnStatement') {
        return true;
      }
      if (stmt.type === 'BlockStatement') {
        if (this.hasReturnStatement(stmt as BlockStatement)) {
          return true;
        }
      }
    }
    return false;
  }

  private countLocalVariables(body: BlockStatement): number {
    let count = 0;
    const declaredVars = new Set<string>();
    
    const processStatement = (stmt: Statement): void => {
      if (stmt.type === 'VariableDeclaration') {
        const varDecl = stmt as VariableDeclaration;
        declaredVars.add(varDecl.name);
        count++;
      } else if (stmt.type === 'AssignmentStatement') {
        const assignment = stmt as AssignmentStatement;
        // 如果变量还没有被声明，则需要在栈上分配空间
        if (!declaredVars.has(assignment.target.name)) {
          declaredVars.add(assignment.target.name);
          count++;
        }
      } else if (stmt.type === 'BlockStatement') {
        const block = stmt as BlockStatement;
        for (const nestedStmt of block.statements) {
          processStatement(nestedStmt);
        }
      } else if (stmt.type === 'IfStatement') {
        const ifStmt = stmt as IfStatement;
        processStatement(ifStmt.thenBranch);
        if (ifStmt.elseBranch) {
          processStatement(ifStmt.elseBranch);
        }
      } else if (stmt.type === 'WhileStatement') {
        const whileStmt = stmt as WhileStatement;
        processStatement(whileStmt.body);
      } else if (stmt.type === 'ForStatement') {
        const forStmt = stmt as ForStatement;
        // 处理 for 循环的初始化语句（可能包含变量声明）
        // 虽然变量作用域只在循环内，后续处理
        if (forStmt.init) {
          processStatement(forStmt.init);
        }
        // 处理 for 循环体
        processStatement(forStmt.body);
      }
    };
    
    for (const stmt of body.statements) {
      processStatement(stmt);
    }
    return count;
  }

  private generateContinueStatement(statement: ContinueStatement): void {
    // continue 语句需要跳转到循环开始
    // 使用栈顶的 continue 标签
    const continueLabel = this.continueStack[this.continueStack.length - 1];
    this.assemblyCode.push(`  jmp ${continueLabel}  ; continue statement`);
  }

  private generateBreakStatement(statement: BreakStatement): void {
    // break 语句需要跳转到循环结束
    // 使用栈顶的 break 标签
    const breakLabel = this.breakStack[this.breakStack.length - 1];
    this.assemblyCode.push(`  jmp ${breakLabel}  ; break statement`);
  }

  private generateBlockStatement(statement: BlockStatement, isFunctionBody: boolean = false): void {
    // 进入新作用域
    this.scopeManager.enterScope();
    
    // 如果不是函数体，设置块级变量的起始偏移
    if (!isFunctionBody) {
      this.scopeManager.setBlockVariableStartOffset(this.currentFunctionVarCount);
    }
    
    // 如果不是函数体，计算当前作用域的直接变量声明
    let variableCount = 0;
    
    if (!isFunctionBody) {
      // 计算当前作用域的所有变量声明
      const processStatement = (stmt: Statement): void => {
        if (stmt.type === 'VariableDeclaration') {
          console.log(`    找到块级变量声明: ${(stmt as VariableDeclaration).name}`);
          variableCount++;
        } else if (stmt.type === 'LetDeclaration') {
          console.log(`    找到块级let声明: ${(stmt as LetDeclaration).name}`);
          variableCount++;
        } else if (stmt.type === 'ForStatement') {
          const forStmt = stmt as ForStatement;
          if (forStmt.init && forStmt.init.type === 'VariableDeclaration') {
            const varDecl = forStmt.init as VariableDeclaration;
            console.log(`    找到for循环变量: ${varDecl.name}`);
            variableCount++;
          }
        }
      };
      
      for (const stmt of statement.statements) {
        processStatement(stmt);
      }
      
      if (variableCount > 0) {
        this.assemblyCode.push(`  sub esp, ${variableCount}            ; 为${variableCount}个块级变量分配栈空间`);
        console.log(`生成块级指令: sub esp, ${variableCount}`);
      }
    }
    
    // 生成块内语句
    for (const stmt of statement.statements) {
      this.generateStatement(stmt);
    }
    
    // 退出作用域
    if (!isFunctionBody && variableCount > 0) {
      this.assemblyCode.push(`  add esp, ${variableCount}            ; 释放块级变量栈空间`);
      console.log(`生成块级指令: add esp, ${variableCount}`);
    }
    this.scopeManager.exitScope();
  }

  // 计算作用域内的变量个数（递归计算所有嵌套变量）
  private countVariablesInScope(block: BlockStatement): number {
    let count = 0;
    
    const processStatement = (stmt: Statement): void => {
      if (stmt.type === 'VariableDeclaration') {
        console.log(`    找到块级变量声明: ${(stmt as VariableDeclaration).name}`);
        count++;
      } else if (stmt.type === 'LetDeclaration') {
        console.log(`    找到块级let声明: ${(stmt as LetDeclaration).name}`);
        count++;
      } else if (stmt.type === 'BlockStatement') {
        const nestedBlock = stmt as BlockStatement;
        for (const nestedStmt of nestedBlock.statements) {
          processStatement(nestedStmt);
        }
      } else if (stmt.type === 'IfStatement') {
        const ifStmt = stmt as IfStatement;
        processStatement(ifStmt.thenBranch);
        if (ifStmt.elseBranch) {
          processStatement(ifStmt.elseBranch);
        }
      } else if (stmt.type === 'WhileStatement') {
        const whileStmt = stmt as WhileStatement;
        processStatement(whileStmt.body);
      } else if (stmt.type === 'ForStatement') {
        const forStmt = stmt as ForStatement;
        if (forStmt.init && forStmt.init.type === 'VariableDeclaration') {
          console.log(`    找到for循环变量: ${(forStmt.init as VariableDeclaration).name}`);
          count++;
        }
        processStatement(forStmt.body);
      }
    };
    
    for (const stmt of block.statements) {
      processStatement(stmt);
    }
    
    return count;
  }

  // 计算函数级变量个数（不包括块级变量）
  private countFunctionVariables(block: BlockStatement): number {
    let count = 0;
    
    for (const stmt of block.statements) {
      if (stmt.type === 'VariableDeclaration') {
        count++;
      }
      // 不递归处理块级语句，因为块级变量会在块语句中单独处理
    }
    
    return count;
  }

  private generateExpression(expression: Expression): string {
    switch (expression.type) {
      case 'NumberLiteral':
        return this.generateNumberLiteral(expression as NumberLiteral);
      case 'Identifier':
        return this.generateIdentifier(expression as Identifier);
      case 'BinaryExpression':
        return this.generateBinaryExpression(expression as BinaryExpression);
      case 'UnaryExpression':
        return this.generateUnaryExpression(expression as UnaryExpression);
      case 'FunctionCall':
        return this.generateFunctionCall(expression as FunctionCall);
      case 'ParenthesizedExpression':
        return this.generateExpression((expression as any).expression);
      default:
        throw new Error(`Unknown expression type: ${(expression as any).type}`);
    }
  }

  private generateNumberLiteral(expression: NumberLiteral): string {
    this.assemblyCode.push(`  mov eax, ${expression.value}         ; 加载常量 ${expression.value}`);
    return 'eax';
  }

  private generateIdentifier(expression: Identifier): string {
    const varName = expression.name;
    
    // 使用作用域管理器查找变量
    const offset = this.scopeManager.getVariable(varName);
    if (offset !== null) {
      this.assemblyCode.push(`  LI ${offset}              ; 加载变量 ${varName}`);
      return 'eax'; // LI指令将值加载到eax中
    }
    
    // 兼容旧代码
    if (this.variables.has(varName)) {
      const stackAddr = this.variables.get(varName)!;
      
      // 处理局部变量 [ebp-偏移]
      const negativeOffset = stackAddr.match(/\[ebp-(\d+)\]/)?.[1];
      if (negativeOffset) {
        this.assemblyCode.push(`  LI -${negativeOffset}              ; 加载局部变量 ${varName}`);
        return 'eax'; // LI指令将值加载到eax中
      }
      
      // 处理函数参数 [ebp+偏移]
      const positiveOffset = stackAddr.match(/\[ebp\+(\d+)\]/)?.[1];
      if (positiveOffset) {
        this.assemblyCode.push(`  LI +${positiveOffset}              ; 加载参数 ${varName}`);
        return 'eax'; // LI指令将值加载到eax中
      }
      
      return stackAddr; // 回退到原来的方式
    } else {
      // 对于未找到的变量，直接生成占位符代码（编译时已检查）
      this.assemblyCode.push(`  mov eax, 0              ; 占位符 - 未定义变量 ${varName}`);
      return 'eax';
    }
  }

  private generateBinaryExpression(expression: BinaryExpression): string {
    // 特殊处理赋值操作符
    if (expression.operator === '=') {
      // 赋值：先计算右侧，然后存储到左侧变量
      this.generateExpression(expression.right); // 结果在eax
      if (expression.left.type === 'Identifier') {
        const target = (expression.left as Identifier).name;
        if (!this.variables.has(target)) {
          throw new Error(`Undefined variable: ${target}`);
        }
        const offset = this.variables.get(target)!;
        // 提取数字部分，处理 [ebp-1] 格式
        const offsetValue = offset.match(/\[ebp-(\d+)\]/)?.[1] || offset;
        this.assemblyCode.push(`  SI -${offsetValue}             ; 存储到变量 ${target}`);
      }
      return 'eax';
    }
    
    // 生成左操作数，结果在eax
    this.generateExpression(expression.left);
    this.assemblyCode.push(`  push eax              ; 保存左操作数到栈`);
    
    // 生成右操作数，结果在eax
    this.generateExpression(expression.right);
    this.assemblyCode.push(`  mov ebx, eax          ; 右操作数到ebx`);
    
    // 从栈恢复左操作数到eax
    this.assemblyCode.push(`  pop eax               ; 从栈恢复左操作数`);
    
    switch (expression.operator) {
      case '+':
        this.assemblyCode.push(`  add eax, ebx          ; 执行加法`);
        return 'eax';
      case '-':
        this.assemblyCode.push(`  sub eax, ebx          ; 执行减法`);
        return 'eax';
      case '*':
        this.assemblyCode.push(`  imul eax, ebx         ; 执行乘法`);
        return 'eax';
      case '/':
        this.assemblyCode.push(`  mov edx, 0            ; 清零edx`);
        this.assemblyCode.push(`  idiv ebx             ; 执行除法`);
        return 'eax';
      case '%':
        // 直接使用mod指令
        this.assemblyCode.push(`  mod eax, ebx         ; eax = eax % ebx`);
        return 'eax';
      case '**':
        // 指数运算需要特殊处理
        this.assemblyCode.push(`  ; Power operation`);
        this.assemblyCode.push(`  mov eax, 1  ; result = 1`);
        return 'eax';
      case '==':
        this.assemblyCode.push(`  cmp eax, ebx          ; 比较操作数`);
        this.assemblyCode.push(`  sete                  ; 设置相等标志`);
        return 'eax';
      case '!=':
        this.assemblyCode.push(`  cmp eax, ebx          ; 比较操作数`);
        this.assemblyCode.push(`  setne                 ; 设置不等标志`);
        return 'eax';
      case '<':
        this.assemblyCode.push(`  cmp eax, ebx          ; 比较操作数`);
        this.assemblyCode.push(`  setl                  ; 设置小于标志`);
        return 'eax';
      case '<=':
        this.assemblyCode.push(`  cmp eax, ebx          ; 比较操作数`);
        this.assemblyCode.push(`  setle                 ; 设置小于等于标志`);
        return 'eax';
      case '>':
        this.assemblyCode.push(`  cmp eax, ebx          ; 比较操作数`);
        this.assemblyCode.push(`  setg                  ; 设置大于标志`);
        return 'eax';
      case '>=':
        this.assemblyCode.push(`  cmp eax, ebx          ; 比较操作数`);
        this.assemblyCode.push(`  setge                 ; 设置大于等于标志`);
        return 'eax';
      case '&&':
        // 逻辑与：如果两个操作数都不为0，结果为1，否则为0
        // 将非零值转换为1，然后相乘
        this.assemblyCode.push(`  cmp eax, 0            ; 检查左操作数`);
        this.assemblyCode.push(`  setne                 ; 设置不等于标志`);
        this.assemblyCode.push(`  push eax              ; 保存左操作数结果`);
        this.assemblyCode.push(`  mov eax, ebx          ; 恢复右操作数`);
        this.assemblyCode.push(`  cmp eax, 0            ; 检查右操作数`);
        this.assemblyCode.push(`  setne                 ; 设置不等于标志`);
        this.assemblyCode.push(`  mov ebx, eax          ; 保存右操作数结果`);
        this.assemblyCode.push(`  pop eax               ; 恢复左操作数结果`);
        this.assemblyCode.push(`  imul eax, ebx        ; 逻辑与操作（1*1=1, 1*0=0, 0*1=0, 0*0=0）`);
        return 'eax';
      case '||':
        // 逻辑或：如果至少一个操作数不为0，结果为1，否则为0
        // 将非零值转换为1，然后相加，如果结果>=1则为1，否则为0
        this.assemblyCode.push(`  cmp eax, 0            ; 检查左操作数`);
        this.assemblyCode.push(`  setne                 ; 设置不等于标志`);
        this.assemblyCode.push(`  push eax              ; 保存左操作数结果`);
        this.assemblyCode.push(`  mov eax, ebx          ; 恢复右操作数`);
        this.assemblyCode.push(`  cmp eax, 0            ; 检查右操作数`);
        this.assemblyCode.push(`  setne                 ; 设置不等于标志`);
        this.assemblyCode.push(`  mov ebx, eax          ; 保存右操作数结果`);
        this.assemblyCode.push(`  pop eax               ; 恢复左操作数结果`);
        this.assemblyCode.push(`  add eax, ebx          ; 逻辑或操作（1+1=2, 1+0=1, 0+1=1, 0+0=0）`);
        this.assemblyCode.push(`  cmp eax, 1            ; 检查结果是否>=1`);
        this.assemblyCode.push(`  setge                 ; 设置大于等于标志`);
        return 'eax';
      default:
        throw new Error(`Unknown binary operator: ${expression.operator}`);
    }
  }

  private generateUnaryExpression(expression: UnaryExpression): string {
    const operand = this.generateExpression(expression.operand);
    
    switch (expression.operator) {
      case '-':
        this.assemblyCode.push(`  mov eax, 0`);
        this.assemblyCode.push(`  mov ebx, ${operand}`);
        this.assemblyCode.push(`  sub eax, ebx`);
        return 'eax';
      case '!':
        this.assemblyCode.push(`  mov eax, ${operand}`);
        this.assemblyCode.push(`  cmp eax, 0`);
        this.assemblyCode.push(`  sete`);
        return 'eax';
      default:
        throw new Error(`Unknown unary operator: ${expression.operator}`);
    }
  }

  private generateFunctionCall(expression: FunctionCall): string {
    const functionName = expression.callee.name;
    
    if (functionName === 'print') {
      // 为每个参数生成push指令
      for (let i = expression.arguments.length - 1; i >= 0; i--) {
        this.generateExpression(expression.arguments[i]!);
        this.assemblyCode.push(`  push eax        ; 参数${i + 1}入栈`);
      }
      
      this.assemblyCode.push(`  ; print(${expression.arguments.length}个参数)`);
      this.assemblyCode.push(`  PRT             ; 系统调用print`);
      this.assemblyCode.push(`  add esp, ${expression.arguments.length}      ; 清理栈参数`);
      return '0'; // print函数返回0
    }
    
    // 处理用户定义函数
    const func = this.functions.get(functionName);
    if (!func) {
      throw new Error(`Undefined function: ${functionName}`);
    }
    
    // 生成函数调用参数 - 从右到左入栈
    for (let i = expression.arguments.length - 1; i >= 0; i--) {
      this.generateExpression(expression.arguments[i]!); // Result is in eax
      this.assemblyCode.push(`  push eax        ; 参数${i + 1}入栈`);
    }
    
    // 生成函数调用
    this.assemblyCode.push(`  call function_${functionName}`);
    
    // 清理栈参数
    if (expression.arguments.length > 0) {
      this.assemblyCode.push(`  add esp, ${expression.arguments.length}      ; 清理栈参数`);
    }
    
    // 函数返回值已经在eax中，直接返回
    return 'eax';
  }

  private generateTempVar(): string {
    return `t${this.tempVarCounter++}`;
  }

  private generateLabel(type: string = 'label'): string {
    return `${type}_${this.labelCounter++}`;
  }

  private generateConditionalJump(condition: Expression, falseLabel: string): void {
    if (condition.type === 'BinaryExpression') {
      const binaryExpr = condition as BinaryExpression;
      
      // 生成左操作数，结果在eax
      this.generateExpression(binaryExpr.left);
      this.assemblyCode.push(`  push eax              ; 保存左操作数到栈`);
      
      // 生成右操作数，结果在eax
      this.generateExpression(binaryExpr.right);
      this.assemblyCode.push(`  mov ebx, eax          ; 右操作数到ebx`);
      
      // 从栈恢复左操作数到eax
      this.assemblyCode.push(`  pop eax               ; 从栈恢复左操作数`);
      this.assemblyCode.push(`  cmp eax, ebx          ; 比较操作数`);
      
      switch (binaryExpr.operator) {
        case '>':
          this.assemblyCode.push(`  jle ${falseLabel}`);  // 如果 <= 则跳转到false分支
          break;
        case '>=':
          this.assemblyCode.push(`  jl ${falseLabel}`);   // 如果 < 则跳转到false分支
          break;
        case '<':
          this.assemblyCode.push(`  jge ${falseLabel}`); // 如果 >= 则跳转到false分支
          break;
        case '<=':
          this.assemblyCode.push(`  jg ${falseLabel}`);   // 如果 > 则跳转到false分支
          break;
        case '==':
          this.assemblyCode.push(`  jne ${falseLabel}`); // 如果 != 则跳转到false分支
          break;
        case '!=':
          this.assemblyCode.push(`  je ${falseLabel}`);   // 如果 == 则跳转到false分支
          break;
        default:
          // 对于其他操作符，回退到原来的方法
          const result = this.generateExpression(condition);
          this.assemblyCode.push(`  mov eax, ${result}`);
          this.assemblyCode.push(`  cmp eax, 0`);
          this.assemblyCode.push(`  je ${falseLabel}`);
      }
    } else {
      // 对于非二元表达式，使用原来的方法
      const result = this.generateExpression(condition);
      this.assemblyCode.push(`  mov eax, ${result}`);
      this.assemblyCode.push(`  cmp eax, 0`);
      this.assemblyCode.push(`  je ${falseLabel}`);
    }
  }

  private reset(): void {
    this.assemblyCode = [];
    this.tempVarCounter = 0;
    this.labelCounter = 0;
    this.variables.clear();
    this.functions.clear();
    this.stackOffset = 0;
    this.continueStack = [];
    this.breakStack = [];
    this.setupBuiltinFunctions();
  }

  private countVariables(program: Program): number {
    let count = 0;
    for (const statement of program.statements) {
      if (statement.type === 'VariableDeclaration') {
        count++;
      } else if (statement.type === 'AssignmentStatement') {
        const assignment = statement as AssignmentStatement;
        if (!this.variables.has(assignment.target.name)) {
          count++;
        }
      }
      // 注意：函数声明中的变量不计入全局变量计数
    }
    return count;
  }
}

// 主函数
function main(): void {
  console.log("Statement Code Generator started! Type 'exit' to quit.");
  console.log("Input your program:");
  
  process.stdin.setEncoding('utf8');
  
  process.stdin.on('data', (data) => {
    const input = data.toString().trim();
    
    // 检查是否要退出
    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      console.log("Goodbye! 👋");
      process.exit(0);
    }
    
    if (input === '') {
      console.log("Please enter a program:");
      return;
    }
    
    console.log();
    
    try {
      // 解析程序
      const parser = new StatementParser(input);
      const parseResult = parser.parse();
      
      if (parseResult.errors.length > 0) {
        console.log("Parse Errors:");
        parseResult.errors.forEach(error => {
          console.log(`  ${error.message} at line ${error.line}, column ${error.column}`);
        });
        return;
      }
      
      console.log("=== AST结构 ===");
      console.log(JSON.stringify(parseResult.ast, null, 2));
      
      // 生成代码
      const codeGen = new StatementCodeGenerator();
      const codeResult = codeGen.generate(parseResult.ast as Program);
      
      if (codeResult.errors.length > 0) {
        console.log("Code Generation Errors:");
        codeResult.errors.forEach(error => {
          console.log(`  ${error.message}`);
        });
        return;
      }
      
      console.log();
      console.log("=== 生成的汇编代码 ===");
      console.log(codeResult.code);
      
    } catch (error) {
      console.log("Error:", error);
    }
    
    console.log();
    console.log("Input your program (or 'exit' to quit):");
  });
}

// 运行主程序
if (import.meta.main) {
  main();
}
