// 语句解析器集成版本
// 解析 + 执行，类似原有的表达式计算器

import { StatementParser } from './parser';
import { StatementLexer } from './lexer';
import type { Program, Statement, Expression, ExecutionResult, ParseError } from './types';
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

// 在文件顶部补充导入代码生成器
import { StatementCodeGenerator } from './separated';

export class StatementInterpreter {
  private variables: Map<string, any> = new Map();
  private functions: Map<string, FunctionDeclaration> = new Map();
  private output: string[] = [];
  private errors: ParseError[] = [];
  private returnValue: any = undefined;
  private shouldBreak = false;
  private shouldContinue = false;

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

  public interpret(source: string, resetState: boolean = true): ExecutionResult {
    if (resetState) {
      this.reset();
    }
    
    try {
      const parser = new StatementParser(source);
      const parseResult = parser.parse();
      
      if (parseResult.errors.length > 0) {
        this.errors = parseResult.errors;
        return {
          value: undefined,
          errors: this.errors,
          output: this.output
        };
      }

      const program = parseResult.ast as Program;
      this.executeProgram(program);
      
      return {
        value: this.returnValue,
        errors: this.errors,
        output: this.output
      };
    } catch (error) {
      this.errors.push({
        message: `Runtime error: ${error instanceof Error ? error.message : String(error)}`,
        position: 0,
        line: 1,
        column: 1
      });
      
      return {
        value: undefined,
        errors: this.errors,
        output: this.output
      };
    }
  }

  private executeProgram(program: Program): void {
    for (const statement of program.statements) {
      this.executeStatement(statement);
      
      if (this.shouldBreak || this.shouldContinue) {
        break;
      }
    }
  }

  private executeStatement(statement: Statement): void {
    switch (statement.type) {
      case 'ExpressionStatement':
        this.executeExpressionStatement(statement as ExpressionStatement);
        break;
      case 'AssignmentStatement':
        this.executeAssignmentStatement(statement as AssignmentStatement);
        break;
      case 'VariableDeclaration':
        this.executeVariableDeclaration(statement as VariableDeclaration);
        break;
      case 'FunctionDeclaration':
        this.executeFunctionDeclaration(statement as FunctionDeclaration);
        break;
      case 'IfStatement':
        this.executeIfStatement(statement as IfStatement);
        break;
      case 'WhileStatement':
        this.executeWhileStatement(statement as WhileStatement);
        break;
      case 'ForStatement':
        this.executeForStatement(statement as ForStatement);
        break;
      case 'ReturnStatement':
        this.executeReturnStatement(statement as ReturnStatement);
        break;
      case 'BreakStatement':
        this.executeBreakStatement(statement as BreakStatement);
        break;
      case 'ContinueStatement':
        this.executeContinueStatement(statement as ContinueStatement);
        break;
      case 'BlockStatement':
        this.executeBlockStatement(statement as BlockStatement);
        break;
      case 'EmptyStatement':
        // 空语句，什么都不做
        break;
      default:
        throw new Error(`Unknown statement type: ${(statement as any).type}`);
    }
  }

  private executeExpressionStatement(statement: ExpressionStatement): void {
    this.evaluateExpression(statement.expression);
  }

  private executeAssignmentStatement(statement: AssignmentStatement): void {
    const value = this.evaluateExpression(statement.value);
    this.variables.set(statement.target.name, value);
  }

  private executeVariableDeclaration(statement: VariableDeclaration): void {
    if (statement.initializer) {
      const value = this.evaluateExpression(statement.initializer);
      this.variables.set(statement.name, value);
    } else {
      this.variables.set(statement.name, 0); // 默认值
    }
  }

  private executeFunctionDeclaration(statement: FunctionDeclaration): void {
    this.functions.set(statement.name, statement);
  }

  private executeIfStatement(statement: IfStatement): void {
    const condition = this.evaluateExpression(statement.condition);
    
    if (condition) {
      this.executeStatement(statement.thenBranch);
    } else if (statement.elseBranch) {
      this.executeStatement(statement.elseBranch);
    }
  }

  private executeWhileStatement(statement: WhileStatement): void {
    while (this.evaluateExpression(statement.condition)) {
      this.executeStatement(statement.body);
      
      if (this.shouldBreak) {
        this.shouldBreak = false;
        break;
      }
      
      if (this.shouldContinue) {
        this.shouldContinue = false;
        continue;
      }
    }
  }

  private executeForStatement(statement: ForStatement): void {
    // 执行初始化
    if (statement.init) {
      this.executeStatement(statement.init);
    }
    
    // 循环条件检查
    while (!statement.condition || this.evaluateExpression(statement.condition)) {
      this.executeStatement(statement.body);
      
      if (this.shouldBreak) {
        this.shouldBreak = false;
        break;
      }
      
      if (this.shouldContinue) {
        this.shouldContinue = false;
        // 继续执行更新语句
        if (statement.update) {
          this.executeStatement(statement.update);
        }
        continue;
      }
      
      // 执行更新语句
      if (statement.update) {
        this.executeStatement(statement.update);
      }
    }
  }

  private executeReturnStatement(statement: ReturnStatement): void {
    if (statement.value) {
      this.returnValue = this.evaluateExpression(statement.value);
    } else {
      this.returnValue = undefined;
    }
  }

  private executeBreakStatement(statement: BreakStatement): void {
    this.shouldBreak = true;
  }

  private executeContinueStatement(statement: ContinueStatement): void {
    this.shouldContinue = true;
  }

  private executeBlockStatement(statement: BlockStatement): void {
    for (const stmt of statement.statements) {
      this.executeStatement(stmt);
      
      if (this.shouldBreak || this.shouldContinue) {
        break;
      }
    }
  }

  private evaluateExpression(expression: Expression): any {
    switch (expression.type) {
      case 'NumberLiteral':
        return (expression as NumberLiteral).value;
        
      case 'Identifier':
        const varName = (expression as Identifier).name;
        if (this.variables.has(varName)) {
          return this.variables.get(varName);
        } else {
          throw new Error(`Undefined variable: ${varName}`);
        }
        
      case 'BinaryExpression':
        return this.evaluateBinaryExpression(expression as BinaryExpression);
        
      case 'UnaryExpression':
        return this.evaluateUnaryExpression(expression as UnaryExpression);
        
      case 'FunctionCall':
        return this.evaluateFunctionCall(expression as FunctionCall);
        
      case 'ParenthesizedExpression':
        return this.evaluateExpression((expression as any).expression);
        
      default:
        throw new Error(`Unknown expression type: ${(expression as any).type}`);
    }
  }

  private evaluateBinaryExpression(expression: BinaryExpression): any {
    // 特殊处理赋值操作符
    if (expression.operator === '=') {
      const right = this.evaluateExpression(expression.right);
      if (expression.left.type === 'Identifier') {
        const varName = (expression.left as Identifier).name;
        this.variables.set(varName, right);
        return right;
      } else {
        throw new Error('Assignment target must be an identifier');
      }
    }
    
    const left = this.evaluateExpression(expression.left);
    const right = this.evaluateExpression(expression.right);
    
    switch (expression.operator) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': return Math.floor(left / right);
      case '%': return left % right;
      case '**': return Math.pow(left, right);
      case '==': return left === right;
      case '!=': return left !== right;
      case '<': return left < right;
      case '<=': return left <= right;
      case '>': return left > right;
      case '>=': return left >= right;
      case '&&': return left && right;
      case '||': return left || right;
      default:
        throw new Error(`Unknown binary operator: ${expression.operator}`);
    }
  }

  private evaluateUnaryExpression(expression: UnaryExpression): any {
    const operand = this.evaluateExpression(expression.operand);
    
    switch (expression.operator) {
      case '-': return -operand;
      case '!': return !operand;
      default:
        throw new Error(`Unknown unary operator: ${expression.operator}`);
    }
  }

  private evaluateFunctionCall(expression: FunctionCall): any {
    const functionName = expression.callee.name;
    
    // 处理内置函数
    if (functionName === 'print') {
      const value = this.evaluateExpression(expression.arguments[0]!);
      this.output.push(String(value));
      return undefined;
    }
    
    // 处理用户定义函数
    const func = this.functions.get(functionName);
    if (!func) {
      throw new Error(`Undefined function: ${functionName}`);
    }
    
    // 创建新的执行环境
    const oldVariables = new Map(this.variables);
    const oldReturnValue = this.returnValue;
    const oldShouldBreak = this.shouldBreak;
    const oldShouldContinue = this.shouldContinue;
    
    try {
      // 设置参数
      for (let i = 0; i < func.parameters.length; i++) {
        const paramName = func.parameters[i]!.name;
        const argValue = this.evaluateExpression(expression.arguments[i]!);
        this.variables.set(paramName, argValue);
      }
      
      // 执行函数体
      this.executeStatement(func.body);
      
      return this.returnValue;
    } finally {
      // 恢复执行环境
      this.variables = oldVariables;
      this.returnValue = oldReturnValue;
      this.shouldBreak = oldShouldBreak;
      this.shouldContinue = oldShouldContinue;
    }
  }

  private reset(): void {
    this.variables.clear();
    this.functions.clear();
    this.output = [];
    this.errors = [];
    this.returnValue = undefined;
    this.shouldBreak = false;
    this.shouldContinue = false;
    this.setupBuiltinFunctions();
  }

  public getVariables(): Map<string, any> {
    return new Map(this.variables);
  }

  public getOutput(): string[] {
    return [...this.output];
  }
}

// 生成四个步骤的汇编文件
async function generateStepFiles(source: string): Promise<void> {
  // 过滤掉注释行（以 # 开头的行）
  const filteredSource = source.split('\n')
    .filter(line => !line.trim().startsWith('#'))
    .join('\n');
  
  // 注意：不重新写入 origin.txt，保持原文件不变
  
  // 解析得到 AST
  const parser = new StatementParser(filteredSource);
  const parseResult = parser.parse();
  if (parseResult.errors && parseResult.errors.length > 0) {
    // 解析失败则不生成后续步骤
    return;
  }
  const program = parseResult.ast as any as Program;

  // Step 1: 只包含 AST 结构
  const step0Content = `=== AST结构 ===
${JSON.stringify(program, null, 2)}`;
  await Bun.write('statements/steps/step0.txt', step0Content);

  // 代码生成
  const generator = new StatementCodeGenerator();
  const gen = generator.generate(program);
  const asm = gen.code || '';

  // Step 2: 只包含原始汇编代码
  const step1Content = `=== 生成的汇编代码 ===
${asm}`;
  await Bun.write('statements/steps/step1.txt', step1Content);

  // Step 3: 索引化 + 标签备注
  const lines = asm.split('\n');
  const isDirective = (s: string) => s.startsWith('.data') || s.startsWith('.text') || s.startsWith('.global');
  const isPureComment = (s: string) => s.trim().startsWith(';');

  const rawCode: string[] = [];
  const labelToIndex = new Map<string, number>();

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (isDirective(trimmed)) continue;
    if (isPureComment(trimmed)) continue;
    if (trimmed.endsWith(':')) {
      const label = trimmed.slice(0, -1).trim();
      labelToIndex.set(label, rawCode.length);
      continue;
    }
    rawCode.push(trimmed);
  }

  // 标签备注附加
  const indexToLabels = new Map<number, string[]>();
  for (const [label, idx] of labelToIndex.entries()) {
    if (!indexToLabels.has(idx)) indexToLabels.set(idx, []);
    indexToLabels.get(idx)!.push(label);
  }

  const step2Content = rawCode.map((instr, i) => {
    let out = instr;
    const labels = indexToLabels.get(i);
    if (labels && labels.length > 0) {
      out = `${out} ; ${labels.join(', ')}`;
    }
    return `[${i}]: ${out}`;
  }).join('\n') + '\n';
  await Bun.write('statements/steps/step2.txt', step2Content);

  // Step 4: 标签替换为数值索引
  const jmpRegex = /^(call|jmp|je|jne|jl|jle|jg|jge)\s+([^;\s]+)(.*)$/;
  const replaced = rawCode.map((instr, i) => {
    const m = instr.match(jmpRegex);
    let out = instr;
    if (m) {
      const op = m[1] ?? '';
      const targetRaw = m[2] ?? '';
      const rest = m[3] ?? '';
      if (!/^\d+$/.test(targetRaw)) {
        const idx = labelToIndex.get(targetRaw.trim());
        if (idx !== undefined) {
          out = `${op} ${idx}${rest}`.trim();
        }
      }
    }
    const labels = indexToLabels.get(i);
    if (labels && labels.length > 0) {
      out = `${out} ; ${labels.join(', ')}`;
    }
    return out;
  });

  const step3Content = replaced.map((instr, i) => `[${i}]: ${instr}`).join('\n') + '\n';
  await Bun.write('statements/steps/step3.txt', step3Content);
}

// 生成 step3 风格的汇编并写入 statements/assemble.txt
async function generateAssembleFile(source: string): Promise<void> {
  // 过滤掉注释行（以 # 开头的行）
  const filteredSource = source.split('\n')
    .filter(line => !line.trim().startsWith('#'))
    .join('\n');
  
  // 解析得到 AST
  const parser = new StatementParser(filteredSource);
  const parseResult = parser.parse();
  if (parseResult.errors && parseResult.errors.length > 0) {
    // 解析失败则不生成
    return;
  }
  const program = parseResult.ast as any as Program;

  // 代码生成
  const generator = new StatementCodeGenerator();
  const gen = generator.generate(program);
  const asm = gen.code || '';

  // 开关：ASM_OUTPUT=raw 则输出原始汇编（含段声明/标签等）；默认输出 step3 风格
  const outputMode = process.env.ASM_OUTPUT || 'step3';
  if (outputMode === 'raw') {
    await Bun.write('statements/assemble.txt', asm + '\n');
    return;
  }

  // 按 step3 规则转换：
  // 1) 收集标签 -> 索引（索引为下一条指令在数组中的位置）
  // 2) 指令行中过滤段声明/空行；
  // 3) 将跳转/调用目标中的标签替换为对应索引；
  // 4) 在首条指令末尾追加该位置对应的标签备注；

  const lines = asm.split('\n');
  const isDirective = (s: string) => s.startsWith('.data') || s.startsWith('.text') || s.startsWith('.global');
  const isPureComment = (s: string) => s.trim().startsWith(';');

  const rawCode: string[] = [];
  const labelToIndex = new Map<string, number>();

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (isDirective(trimmed)) continue;
    if (isPureComment(trimmed)) continue;
    if (trimmed.endsWith(':')) {
      const label = trimmed.slice(0, -1).trim();
      labelToIndex.set(label, rawCode.length);
      continue;
    }
    rawCode.push(trimmed);
  }

  // 标签备注附加
  const indexToLabels = new Map<number, string[]>();
  for (const [label, idx] of labelToIndex.entries()) {
    if (!indexToLabels.has(idx)) indexToLabels.set(idx, []);
    indexToLabels.get(idx)!.push(label);
  }

  // 替换目标
  const jmpRegex = /^(call|jmp|je|jne|jl|jle|jg|jge)\s+([^;\s]+)(.*)$/;
  const replaced = rawCode.map((instr, i) => {
    const m = instr.match(jmpRegex);
    let out = instr;
    if (m) {
      const op = m[1] ?? '';
      const targetRaw = m[2] ?? '';
      const rest = m[3] ?? '';
      if (!/^\d+$/.test(targetRaw)) {
        const idx = labelToIndex.get(targetRaw.trim());
        if (idx !== undefined) {
          out = `${op} ${idx}${rest}`.trim();
        }
      }
    }
    const labels = indexToLabels.get(i);
    if (labels && labels.length > 0) {
      out = `${out} ; ${labels.join(', ')}`;
    }
    return out;
  });

  const formatted = replaced.map((instr, i) => `[${i}]: ${instr}`).join('\n') + '\n';
  await Bun.write('statements/assemble.txt', formatted);
}

// 主函数
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log("Usage: bun run statements/index.ts <file_path>");
    console.log("Example: bun run statements/index.ts statements/tests/main-test.txt");
    process.exit(1);
  }
  
  const filePath = args[0]!;
  
  try {
    // 读取文件内容
    const fileContent = await Bun.file(filePath).text();
    
    // 过滤掉注释行（以 # 开头的行）
    const filteredInput = fileContent.split('\n')
      .filter(line => !line.trim().startsWith('#'))
      .join('\n');
    
    const interpreter = new StatementInterpreter();
    const result = interpreter.interpret(filteredInput);
    
    // 检查是否需要生成步骤文件
    const generateSteps = process.env.GENERATE_STEPS === 'true';
    
    if (generateSteps) {
      // 生成三个步骤文件
      await generateStepFiles(filteredInput);
      console.log("Step files written to statements/steps/");
      console.log("  - origin.txt: 原始源代码");
      console.log("  - step0.txt: AST 结构");
      console.log("  - step1.txt: 原始汇编代码");
      console.log("  - step2.txt: 索引化 + 标签备注");
      console.log("  - step3.txt: 标签替换为数值索引");
    } else {
      // 生成 assemble.txt（step3 风格）
      await generateAssembleFile(filteredInput);
      console.log("Assemble written to statements/assemble.txt");
    }
    
    if (result.errors.length > 0) {
      console.log("Errors:");
      result.errors.forEach(error => {
        console.log(`  ${error.message} at line ${error.line}, column ${error.column}`);
      });
    } else {
      console.log("Execution completed successfully!");
      
      if (result.output.length > 0) {
        console.log("Output:");
        result.output.forEach(line => console.log(line));
      }
      
      if (result.value !== undefined) {
        console.log(`Return value: ${result.value}`);
      }
      
      // 显示变量状态
      const variables = interpreter.getVariables();
      if (variables.size > 0) {
        console.log("Variables:");
        variables.forEach((value, name) => {
          console.log(`  ${name} = ${value}`);
        });
      }
    }
  } catch (error) {
    console.log("Error:", error);
    process.exit(1);
  }
}

// 运行主程序
if (import.meta.main) {
  main();
}
