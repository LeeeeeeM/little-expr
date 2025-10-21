// 语句解析器分离版本
// 解析 + AST生成 + 代码生成

import { StatementParser } from './parser';
import { StatementLexer } from './lexer';
import type { Program, Statement, Expression, ParseResult, CodeGenResult, ParseError } from './types';
import type { 
  NumberLiteral, 
  Identifier, 
  BinaryExpression, 
  UnaryExpression, 
  FunctionCall,
  ExpressionStatement,
  AssignmentStatement,
  VariableDeclaration,
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

export class StatementCodeGenerator {
  private assemblyCode: string[] = [];
  private tempVarCounter = 0;
  private labelCounter = 0;
  private variables: Map<string, string> = new Map(); // 变量名 -> 栈偏移地址
  private functions: Map<string, FunctionDeclaration> = new Map();
  private stackOffset = 0; // 当前栈偏移

  constructor() {
    this.setupBuiltinFunctions();
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
      
      // 计算需要的栈空间
      const variableCount = this.countVariables(program);
      this.assemblyCode.push(`  sub esp, ${variableCount}            ; 为${variableCount}个局部变量分配栈空间`);
      
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
        this.generateBlockStatement(statement as BlockStatement);
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
    
    if (!this.variables.has(target)) {
      const offset = this.stackOffset + 1; // 从ebp-1开始
      const stackAddr = `[ebp-${offset}]`;
      this.variables.set(target, stackAddr);
      this.stackOffset += 1;
    }
    
    // 使用SI指令存储
    const stackAddr = this.variables.get(target)!;
    const offset = stackAddr.match(/\[ebp-(\d+)\]/)?.[1];
    if (offset) {
      this.assemblyCode.push(`  SI -${offset}              ; 存储到 ${target}`);
    } else {
      // 回退到原来的方式
      this.assemblyCode.push(`  mov ${stackAddr}, eax`);
    }
  }

  private generateVariableDeclaration(statement: VariableDeclaration): void {
    const varName = statement.name;
    const offset = this.stackOffset + 1; // 从ebp-1开始
    const stackAddr = `[ebp-${offset}]`;
    this.variables.set(varName, stackAddr);
    this.stackOffset += 1; // 每个变量占用1字节偏移
    
    if (statement.initializer) {
      this.generateExpression(statement.initializer); // Result is in eax
      this.assemblyCode.push(`  SI -${offset}              ; 初始化 ${varName}`);
    } else {
      this.assemblyCode.push(`  mov dword ${stackAddr}, 0  ; Initialize to 0`);
    }
  }

  private generateFunctionDeclaration(statement: FunctionDeclaration): void {
    this.functions.set(statement.name, statement);
    
    this.assemblyCode.push('');
    this.assemblyCode.push(`function_${statement.name}:`);
    this.assemblyCode.push(`  push ebp`);
    this.assemblyCode.push(`  mov ebp, esp`);
    // 为函数建立独立的局部作用域：局部变量应从 ebp-1 开始
    const prevVariables = this.variables;
    const prevStackOffset = this.stackOffset;
    this.variables = new Map();
    this.stackOffset = 0;
    
    // 处理函数参数 - 参数在栈上，从ebp+2开始（跳过返回地址1字节和ebp1字节）
    let paramOffset = 2; // ebp+2是第一个参数
    for (const param of statement.parameters) {
      const stackAddr = `[ebp+${paramOffset}]`;
      this.variables.set(param.name, stackAddr);
      paramOffset += 1; // 每个参数1字节
    }
    
    // 为局部变量分配栈空间
    const localVarCount = this.countLocalVariables(statement.body);
    if (localVarCount > 0) {
      this.assemblyCode.push(`  sub esp, ${localVarCount}            ; 为${localVarCount}个局部变量分配栈空间`);
    }
    
    // 生成函数体
    this.generateStatement(statement.body);
    
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
    
    // 保存当前栈偏移
    const prevStackOffset = this.stackOffset;
    
    this.assemblyCode.push(`${loopLabel}:`);
    this.assemblyCode.push(`continue_target:`);
    
    // 优化：直接生成条件跳转
    this.generateConditionalJump(statement.condition, endLabel);
    
    // 生成循环体
    this.generateStatement(statement.body);
    
    this.assemblyCode.push(`  jmp ${loopLabel}`);
    this.assemblyCode.push(`${endLabel}:`);
    this.assemblyCode.push(`break_target:`);
    
    // 恢复栈偏移
    this.stackOffset = prevStackOffset;
  }

  private generateForStatement(statement: ForStatement): void {
    const loopLabel = this.generateLabel('loop');
    const endLabel = this.generateLabel('end');
    
    // 生成初始化
    if (statement.init) {
      this.generateStatement(statement.init);
    }
    
    this.assemblyCode.push(`${loopLabel}:`);
    
    // 生成条件检查
    if (statement.condition) {
      const condition = this.generateExpression(statement.condition);
      this.assemblyCode.push(`  mov eax, ${condition}`);
      this.assemblyCode.push(`  cmp eax, 0`);
      this.assemblyCode.push(`  je ${endLabel}`);
    }
    
    // 生成循环体
    this.generateStatement(statement.body);
    
    // 生成更新
    if (statement.update) {
      this.generateStatement(statement.update);
    }
    
    this.assemblyCode.push(`  jmp ${loopLabel}`);
    this.assemblyCode.push(`${endLabel}:`);
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
      }
    };
    
    for (const stmt of body.statements) {
      processStatement(stmt);
    }
    return count;
  }

  private generateBreakStatement(statement: BreakStatement): void {
    // break 语句需要跳转到循环结束
    // 使用一个特殊的标签来表示循环结束
    this.assemblyCode.push(`  jmp break_target  ; break statement`);
  }

  private generateContinueStatement(statement: ContinueStatement): void {
    // continue 语句需要跳转到循环开始
    // 使用一个特殊的标签来表示循环开始
    this.assemblyCode.push(`  jmp continue_target  ; continue statement`);
  }

  private generateBlockStatement(statement: BlockStatement): void {
    for (const stmt of statement.statements) {
      this.generateStatement(stmt);
    }
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
      throw new Error(`Undefined variable: ${varName}`);
    }
  }

  private generateBinaryExpression(expression: BinaryExpression): string {
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
        this.assemblyCode.push(`  sete al               ; 设置相等标志`);
        return 'eax';
      case '!=':
        this.assemblyCode.push(`  cmp eax, ebx          ; 比较操作数`);
        this.assemblyCode.push(`  setne al              ; 设置不等标志`);
        return 'eax';
      case '<':
        this.assemblyCode.push(`  cmp eax, ebx          ; 比较操作数`);
        this.assemblyCode.push(`  setl al               ; 设置小于标志`);
        return 'eax';
      case '<=':
        this.assemblyCode.push(`  cmp eax, ebx          ; 比较操作数`);
        this.assemblyCode.push(`  setle al              ; 设置小于等于标志`);
        return 'eax';
      case '>':
        this.assemblyCode.push(`  cmp eax, ebx          ; 比较操作数`);
        this.assemblyCode.push(`  setg al               ; 设置大于标志`);
        return 'eax';
      case '>=':
        this.assemblyCode.push(`  cmp eax, ebx          ; 比较操作数`);
        this.assemblyCode.push(`  setge al              ; 设置大于等于标志`);
        return 'eax';
      case '&&':
        this.assemblyCode.push(`  cmp eax, 0            ; 检查左操作数`);
        this.assemblyCode.push(`  je &&_false           ; 如果为0则跳转`);
        this.assemblyCode.push(`  cmp ebx, 0            ; 检查右操作数`);
        this.assemblyCode.push(`  je &&_false           ; 如果为0则跳转`);
        this.assemblyCode.push(`  mov eax, 1            ; 都为真，结果为1`);
        this.assemblyCode.push(`  jmp &&_end            ; 跳转到结束`);
        this.assemblyCode.push(`&&_false:`);
        this.assemblyCode.push(`  mov eax, 0            ; 结果为0`);
        this.assemblyCode.push(`&&_end:`);
        return 'eax';
      case '||':
        this.assemblyCode.push(`  cmp eax, 0            ; 检查左操作数`);
        this.assemblyCode.push(`  jne ||_true           ; 如果不为0则跳转`);
        this.assemblyCode.push(`  cmp ebx, 0            ; 检查右操作数`);
        this.assemblyCode.push(`  jne ||_true           ; 如果不为0则跳转`);
        this.assemblyCode.push(`  mov eax, 0            ; 都为假，结果为0`);
        this.assemblyCode.push(`  jmp ||_end            ; 跳转到结束`);
        this.assemblyCode.push(`||_true:`);
        this.assemblyCode.push(`  mov eax, 1            ; 结果为1`);
        this.assemblyCode.push(`||_end:`);
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
        this.assemblyCode.push(`  sete al`);
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
