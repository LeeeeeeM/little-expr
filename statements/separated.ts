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
  private variables: Map<string, string> = new Map(); // 变量名 -> 寄存器/内存地址
  private functions: Map<string, FunctionDeclaration> = new Map();

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
    
    for (const statement of program.statements) {
      this.generateStatement(statement);
    }
    
    this.assemblyCode.push('  mov eax, 1      ; exit system call');
    this.assemblyCode.push('  mov ebx, 0      ; exit code');
    this.assemblyCode.push('  int 0x80        ; interrupt');
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
    const tempVar = this.generateExpression(statement.expression);
    this.assemblyCode.push(`  ; Expression result stored in ${tempVar}`);
  }

  private generateAssignmentStatement(statement: AssignmentStatement): void {
    const value = this.generateExpression(statement.value);
    const target = statement.target.name;
    
    if (!this.variables.has(target)) {
      this.variables.set(target, `var_${target}`);
    }
    
    this.assemblyCode.push(`  mov eax, ${value}`);
    this.assemblyCode.push(`  mov [${this.variables.get(target)}], eax`);
  }

  private generateVariableDeclaration(statement: VariableDeclaration): void {
    const varName = statement.name;
    this.variables.set(varName, `var_${varName}`);
    
    if (statement.initializer) {
      const value = this.generateExpression(statement.initializer);
      this.assemblyCode.push(`  mov eax, ${value}`);
      this.assemblyCode.push(`  mov [var_${varName}], eax`);
    } else {
      this.assemblyCode.push(`  mov dword [var_${varName}], 0  ; Initialize to 0`);
    }
  }

  private generateFunctionDeclaration(statement: FunctionDeclaration): void {
    this.functions.set(statement.name, statement);
    
    this.assemblyCode.push('');
    this.assemblyCode.push(`function_${statement.name}:`);
    this.assemblyCode.push(`  push ebp`);
    this.assemblyCode.push(`  mov ebp, esp`);
    
    // 生成函数体
    this.generateStatement(statement.body);
    
    this.assemblyCode.push(`  pop ebp`);
    this.assemblyCode.push(`  ret`);
  }

  private generateIfStatement(statement: IfStatement): void {
    const elseLabel = this.generateLabel('else');
    const endLabel = this.generateLabel('end');
    
    // 优化：直接生成条件跳转，而不是先计算表达式再检查
    this.generateConditionalJump(statement.condition, elseLabel);
    
    // 生成then分支
    this.generateStatement(statement.thenBranch);
    this.assemblyCode.push(`  jmp ${endLabel}`);
    
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
    
    this.assemblyCode.push(`${loopLabel}:`);
    
    // 优化：直接生成条件跳转
    this.generateConditionalJump(statement.condition, endLabel);
    
    // 生成循环体
    this.generateStatement(statement.body);
    
    this.assemblyCode.push(`  jmp ${loopLabel}`);
    this.assemblyCode.push(`${endLabel}:`);
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
      const value = this.generateExpression(statement.value);
      this.assemblyCode.push(`  mov eax, ${value}`);
    }
    this.assemblyCode.push(`  ret`);
  }

  private generateBreakStatement(statement: BreakStatement): void {
    // 在实际实现中，这里需要跳转到循环结束标签
    this.assemblyCode.push(`  ; break statement`);
  }

  private generateContinueStatement(statement: ContinueStatement): void {
    // 在实际实现中，这里需要跳转到循环开始标签
    this.assemblyCode.push(`  ; continue statement`);
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
    return expression.value.toString();
  }

  private generateIdentifier(expression: Identifier): string {
    const varName = expression.name;
    if (this.variables.has(varName)) {
      return `[${this.variables.get(varName)}]`;
    } else {
      throw new Error(`Undefined variable: ${varName}`);
    }
  }

  private generateBinaryExpression(expression: BinaryExpression): string {
    const left = this.generateExpression(expression.left);
    const right = this.generateExpression(expression.right);
    const tempVar = this.generateTempVar();
    
    switch (expression.operator) {
      case '+':
        this.assemblyCode.push(`  mov eax, ${left}`);
        this.assemblyCode.push(`  add eax, ${right}`);
        this.assemblyCode.push(`  mov [${tempVar}], eax`);
        break;
      case '-':
        this.assemblyCode.push(`  mov eax, ${left}`);
        this.assemblyCode.push(`  sub eax, ${right}`);
        this.assemblyCode.push(`  mov [${tempVar}], eax`);
        break;
      case '*':
        this.assemblyCode.push(`  mov eax, ${left}`);
        this.assemblyCode.push(`  mov ebx, ${right}`);
        this.assemblyCode.push(`  imul eax, ebx`);
        this.assemblyCode.push(`  mov [${tempVar}], eax`);
        break;
      case '/':
        this.assemblyCode.push(`  mov eax, ${left}`);
        this.assemblyCode.push(`  mov ebx, ${right}`);
        this.assemblyCode.push(`  idiv ebx`);
        this.assemblyCode.push(`  mov [${tempVar}], eax`);
        break;
      case '**':
        // 指数运算需要特殊处理
        this.assemblyCode.push(`  ; Power operation: ${left} ** ${right}`);
        this.assemblyCode.push(`  mov [${tempVar}], 1  ; result = 1`);
        break;
      case '==':
        this.assemblyCode.push(`  mov eax, ${left}`);
        this.assemblyCode.push(`  cmp eax, ${right}`);
        this.assemblyCode.push(`  sete al`);
        this.assemblyCode.push(`  mov [${tempVar}], eax`);
        break;
      case '!=':
        this.assemblyCode.push(`  mov eax, ${left}`);
        this.assemblyCode.push(`  cmp eax, ${right}`);
        this.assemblyCode.push(`  setne al`);
        this.assemblyCode.push(`  mov [${tempVar}], eax`);
        break;
      case '<':
        this.assemblyCode.push(`  mov eax, ${left}`);
        this.assemblyCode.push(`  cmp eax, ${right}`);
        this.assemblyCode.push(`  setl al`);
        this.assemblyCode.push(`  mov [${tempVar}], eax`);
        break;
      case '<=':
        this.assemblyCode.push(`  mov eax, ${left}`);
        this.assemblyCode.push(`  cmp eax, ${right}`);
        this.assemblyCode.push(`  setle al`);
        this.assemblyCode.push(`  mov [${tempVar}], eax`);
        break;
      case '>':
        this.assemblyCode.push(`  mov eax, ${left}`);
        this.assemblyCode.push(`  cmp eax, ${right}`);
        this.assemblyCode.push(`  setg al`);
        this.assemblyCode.push(`  mov [${tempVar}], eax`);
        break;
      case '>=':
        this.assemblyCode.push(`  mov eax, ${left}`);
        this.assemblyCode.push(`  cmp eax, ${right}`);
        this.assemblyCode.push(`  setge al`);
        this.assemblyCode.push(`  mov [${tempVar}], eax`);
        break;
      case '&&':
        this.assemblyCode.push(`  mov eax, ${left}`);
        this.assemblyCode.push(`  cmp eax, 0`);
        this.assemblyCode.push(`  je ${tempVar}_false`);
        this.assemblyCode.push(`  mov eax, ${right}`);
        this.assemblyCode.push(`  cmp eax, 0`);
        this.assemblyCode.push(`  je ${tempVar}_false`);
        this.assemblyCode.push(`  mov [${tempVar}], 1`);
        this.assemblyCode.push(`  jmp ${tempVar}_end`);
        this.assemblyCode.push(`${tempVar}_false:`);
        this.assemblyCode.push(`  mov [${tempVar}], 0`);
        this.assemblyCode.push(`${tempVar}_end:`);
        break;
      case '||':
        this.assemblyCode.push(`  mov eax, ${left}`);
        this.assemblyCode.push(`  cmp eax, 0`);
        this.assemblyCode.push(`  jne ${tempVar}_true`);
        this.assemblyCode.push(`  mov eax, ${right}`);
        this.assemblyCode.push(`  cmp eax, 0`);
        this.assemblyCode.push(`  jne ${tempVar}_true`);
        this.assemblyCode.push(`  mov [${tempVar}], 0`);
        this.assemblyCode.push(`  jmp ${tempVar}_end`);
        this.assemblyCode.push(`${tempVar}_true:`);
        this.assemblyCode.push(`  mov [${tempVar}], 1`);
        this.assemblyCode.push(`${tempVar}_end:`);
        break;
      default:
        throw new Error(`Unknown binary operator: ${expression.operator}`);
    }
    
    return `[${tempVar}]`;
  }

  private generateUnaryExpression(expression: UnaryExpression): string {
    const operand = this.generateExpression(expression.operand);
    const tempVar = this.generateTempVar();
    
    switch (expression.operator) {
      case '-':
        this.assemblyCode.push(`  mov eax, ${operand}`);
        this.assemblyCode.push(`  neg eax`);
        this.assemblyCode.push(`  mov [${tempVar}], eax`);
        break;
      case '!':
        this.assemblyCode.push(`  mov eax, ${operand}`);
        this.assemblyCode.push(`  cmp eax, 0`);
        this.assemblyCode.push(`  sete al`);
        this.assemblyCode.push(`  mov [${tempVar}], eax`);
        break;
      default:
        throw new Error(`Unknown unary operator: ${expression.operator}`);
    }
    
    return `[${tempVar}]`;
  }

  private generateFunctionCall(expression: FunctionCall): string {
    const functionName = expression.callee.name;
    
    if (functionName === 'print') {
      const value = this.generateExpression(expression.arguments[0]!);
      this.assemblyCode.push(`  ; print(${value})`);
      this.assemblyCode.push(`  mov eax, 4      ; write system call`);
      this.assemblyCode.push(`  mov ebx, 1      ; stdout`);
      this.assemblyCode.push(`  mov ecx, ${value}`);
      this.assemblyCode.push(`  mov edx, 1      ; length`);
      this.assemblyCode.push(`  int 0x80        ; interrupt`);
      return '0'; // print函数返回0
    }
    
    // 处理用户定义函数
    const func = this.functions.get(functionName);
    if (!func) {
      throw new Error(`Undefined function: ${functionName}`);
    }
    
    // 生成函数调用
    this.assemblyCode.push(`  call function_${functionName}`);
    const tempVar = this.generateTempVar();
    this.assemblyCode.push(`  mov [${tempVar}], eax`);
    
    return `[${tempVar}]`;
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
      const left = this.generateExpression(binaryExpr.left);
      const right = this.generateExpression(binaryExpr.right);
      
      this.assemblyCode.push(`  mov eax, ${left}`);
      this.assemblyCode.push(`  cmp eax, ${right}`);
      
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
    this.setupBuiltinFunctions();
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
