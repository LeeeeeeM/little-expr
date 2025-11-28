// 语句解析器
// 支持完整的语句解析，包括表达式、声明、控制流等

import { StatementLexer } from './lexer';
import type { Token } from './lexer';
import { TokenType, DataType } from './types';
import type { ParseResult, ParseError, ParseContext, Scope, VariableInfo, FunctionInfo } from './types';
import { 
  ASTFactory,
  type LetDeclaration,
  type VariableDeclaration,
  type ExpressionStatement,
  type AssignmentStatement,
  type IfStatement,
  type WhileStatement,
  type ForStatement,
  type ReturnStatement,
  type BlockStatement,
  type Identifier,
  type BinaryExpression,
  type UnaryExpression,
  type FunctionCall,
  type Program, 
  type Statement, 
  type Expression, 
  type NumberLiteral, 
  type ParenthesizedExpression,
  type BreakStatement,
  type ContinueStatement,
  type EmptyStatement,
  type FunctionDeclaration
} from './ast';

// TDZ 检查器类
class TDZChecker {
  private currentFunctionLetVars = new Set<string>();
  public inForLoopCondition: boolean = false;
  public inForLoopBody: boolean = false;
  
  // 开始检查新函数
  startFunction(): void {
    this.currentFunctionLetVars.clear();
  }
  
  // 检查变量访问
  checkVariableAccess(varName: string, accessPosition: number): void {
    // 如果是 let 变量但还未声明，报错
    // 但是在 for 循环中，变量可以在条件部分和循环体中被访问
    if (this.currentFunctionLetVars.has(varName) && !this.inForLoopCondition && !this.inForLoopBody) {
      throw new Error(`Cannot access '${varName}' before initialization`);
    }
  }
  
  // 标记 let 变量声明
  markLetVariable(varName: string): void {
    this.currentFunctionLetVars.add(varName);
  }
  
  // 移除 let 变量标记
  removeLetVariable(varName: string): void {
    this.currentFunctionLetVars.delete(varName);
  }
  
  // 标记变量为已初始化（从 TDZ 中移除）
  markVariableInitialized(varName: string): void {
    this.currentFunctionLetVars.delete(varName);
  }
}

export class StatementParser {
  private lexer: StatementLexer;
  private errors: ParseError[] = [];
  private warnings: ParseError[] = [];
  private context: ParseContext;
  private tdzChecker: TDZChecker; // 添加 TDZ 检查器

  constructor(source: string) {
    this.lexer = new StatementLexer(source);
    this.context = this.createInitialContext();
    this.tdzChecker = new TDZChecker(); // 初始化 TDZ 检查器
  }

  // 获取解析器上下文
  public getContext(): ParseContext {
    return this.context;
  }

  private createInitialContext(): ParseContext {
    const globalScope: Scope = {
      variables: new Map(),
      functions: new Map()
    };

    return {
      currentScope: globalScope,
      globalScope: globalScope
    };
  }

  public parse(): ParseResult {
    this.errors = [];
    this.warnings = [];
    this.lexer.reset();

    try {
      const statements: Statement[] = [];
      
      while (!this.lexer.isAtEnd()) {
        const statement = this.parseStatement();
        if (statement) {
          statements.push(statement);
        }
      }

      const program: Program = ASTFactory.createProgram(statements);
      
      return {
        ast: program as any,
        errors: this.errors,
        warnings: this.warnings
      };
    } catch (error) {
      this.addError(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        ast: ASTFactory.createProgram([]) as any,
        errors: this.errors,
        warnings: this.warnings
      };
    }
  }

  private parseStatement(): Statement | null {
    const token = this.lexer.getCurrentToken();
    if (!token) return null;

    switch (token.type) {
      case TokenType.INT:
        // 检查是否是函数定义 (int main() { ... })
        const intNextToken = this.lexer.getNextToken();
        if (intNextToken?.type === TokenType.IDENTIFIER) {
          const thirdToken = this.lexer.peek(2);
          if (thirdToken?.type === TokenType.LEFTPAREN) {
            return this.parseFunctionDeclaration();
          }
        }
        return this.parseVariableDeclaration();
      case TokenType.LET:
        return this.parseLetDeclaration();
      case TokenType.FUNCTION:
        return this.parseFunctionDeclaration();
      case TokenType.IF:
        return this.parseIfStatement();
      case TokenType.WHILE:
        return this.parseWhileStatement();
      case TokenType.FOR:
        return this.parseForStatement();
      case TokenType.RETURN:
        return this.parseReturnStatement();
      case TokenType.BREAK:
        return this.parseBreakStatement();
      case TokenType.CONTINUE:
        return this.parseContinueStatement();
      case TokenType.LBRACE:
        return this.parseBlockStatement();
      case TokenType.SEMICOLON:
        this.lexer.advance();
        return ASTFactory.createEmptyStatement();
      case TokenType.IDENTIFIER:
        // 检查是否是赋值语句
        const nextToken = this.lexer.getNextToken();
        if (nextToken?.type === TokenType.ASSIGN) {
          return this.parseAssignmentStatement();
        }
        return this.parseExpressionStatement();
      default:
        return this.parseExpressionStatement();
    }
  }

  private parseExpressionStatement(): ExpressionStatement {
    const expression = this.parseExpression();
    this.expectSemicolon();
    return ASTFactory.createExpressionStatement(expression);
  }

  private parseAssignmentStatement(): AssignmentStatement {
    const target = this.parseIdentifier();
    this.expect(TokenType.ASSIGN);
    const value = this.parseExpression();
    return ASTFactory.createAssignmentStatement(target, value);
  }

  private parseVariableDeclaration(): VariableDeclaration {
    const dataType = this.parseDataType();
    const name = this.parseIdentifierName();
    
    let initializer: Expression | undefined;
    if (this.lexer.getCurrentToken()?.type === TokenType.ASSIGN) {
      this.lexer.advance();
      initializer = this.parseExpression();
    }

    this.expectSemicolon();

    // 添加到当前作用域
    this.context.currentScope.variables.set(name, {
      name,
      type: dataType,
      value: initializer ? this.evaluateExpression(initializer) : undefined,
      isInitialized: !!initializer
    });

    return ASTFactory.createVariableDeclaration(name, dataType, initializer);
  }

  private parseLetDeclaration(): LetDeclaration {
    this.lexer.advance(); // 跳过 'let'
    const name = this.parseIdentifierName(); // let 后直接跟标识符
    
    // 立即将变量添加到作用域，标记为 TDZ
    this.context.currentScope.variables.set(name, {
      name,
      type: DataType.INT,
      value: 0,
      isInitialized: false,
      isTDZ: true
    });
    
    let initializer: Expression | undefined;
    if (this.lexer.getCurrentToken()?.type === TokenType.ASSIGN) {
      this.lexer.advance();
      initializer = this.parseExpression();
      
      // 如果有初始化表达式，更新变量状态
      this.context.currentScope.variables.set(name, {
        name,
        type: DataType.INT,
        value: this.evaluateExpression(initializer),
        isInitialized: true,
        isTDZ: false
      });
      
      // 有初始化表达式，从 TDZ 中移除
      this.tdzChecker.markVariableInitialized(name);
    } else {
      // 没有初始化表达式，但内存会被初始化为0，因此也算已初始化
      this.context.currentScope.variables.set(name, {
        name,
        type: DataType.INT,
        value: 0,
        isInitialized: true,
        isTDZ: false
      });
      // 从 TDZ 中移除（因为内存会被初始化为0）
      this.tdzChecker.markVariableInitialized(name);
    }

    this.expectSemicolon();

    return ASTFactory.createLetDeclaration(name, DataType.INT, initializer);
  }

  private parseFunctionDeclaration(): FunctionDeclaration {
    // 支持两种语法：
    // 1. function name() { ... }
    // 2. int name() { ... }
    // 3. int name(); (函数声明，没有函数体)
    let returnType: DataType;
    let name: string;
    
    const currentToken = this.lexer.getCurrentToken();
    if (currentToken?.type === TokenType.FUNCTION) {
      // function name() { ... }
      this.lexer.advance();
      name = this.parseIdentifierName();
      returnType = 'void' as DataType;
    } else if (currentToken?.type === TokenType.INT) {
      // int name() { ... } 或 int name();
      this.lexer.advance();
      name = this.parseIdentifierName();
      returnType = 'int' as DataType;
    } else {
      throw new Error('Expected function or int keyword');
    }
    
    this.expect(TokenType.LEFTPAREN);
    const parameters = this.parseParameterList();
    this.expect(TokenType.RIGHTPAREN);
    
    // 检查下一个 token 是否是分号（函数声明）还是左大括号（函数定义）
    const nextToken = this.lexer.getCurrentToken();
    if (nextToken?.type === TokenType.SEMICOLON) {
      // 函数声明：int name();
      this.lexer.advance(); // 跳过分号
      
      // 创建一个空的函数体
      const emptyBody = ASTFactory.createBlockStatement([]) as any;
      
      // 添加到当前作用域（函数声明也需要注册到作用域中）
      this.context.currentScope.functions.set(name, {
        name,
        returnType,
        parameters,
        body: emptyBody
      });

      return ASTFactory.createFunctionDeclaration(name, returnType, parameters, emptyBody, undefined, true);
    } else if (nextToken?.type === TokenType.LBRACE) {
      // 函数定义：int name() { ... }
      // 开始新函数的 TDZ 检查
      this.tdzChecker.startFunction();
      
      // 先扫描函数体中的所有 let 声明（不解析）
      const savedPosition = this.lexer.getCurrentPosition();
      this.expect(TokenType.LBRACE);
      
      // 扫描函数体中的 let 声明
      let depth = 1;
      while (depth > 0) {
        const token = this.lexer.getCurrentToken();
        if (!token) break;
        
        if (token.type === TokenType.LBRACE) {
          depth++;
        } else if (token.type === TokenType.RBRACE) {
          depth--;
          if (depth === 0) break;
        } else if (token.type === TokenType.LET) {
          this.lexer.advance(); // 跳过 let
          const varName = this.parseIdentifierName();
          
          // 所有 let 变量都加入 TDZ（不管是否有初始化表达式）
          this.tdzChecker.markLetVariable(varName);
          
          // 跳过初始化部分
          if (this.lexer.getCurrentToken()?.type === TokenType.ASSIGN) {
            this.lexer.advance(); // 跳过 =
            this.skipExpression(); // 跳过表达式
          }
          
          // 跳过分号
          if (this.lexer.getCurrentToken()?.type === TokenType.SEMICOLON) {
            this.lexer.advance();
          }
          continue;
        }
        
        this.lexer.advance();
      }
      
      // 恢复位置
      this.lexer.setPosition(savedPosition);
      
      // 创建函数作用域（函数体的作用域）
      const functionScope: Scope = {
        variables: new Map(),
        functions: new Map(),
        parent: this.context.currentScope
      };
      
      // 将函数参数注册到函数作用域（作为已初始化的变量）
      // 参数通过栈访问，不需要在作用域中分配空间，但需要标记为已定义
      for (const param of parameters) {
        functionScope.variables.set(param.name, {
          name: param.name,
          type: param.type,
          value: 0,
          isInitialized: true // 参数被视为已初始化
        });
      }
      
      // 切换到函数作用域
      const oldScope = this.context.currentScope;
      this.context.currentScope = functionScope;
      
      // 解析函数体（此时参数已经在作用域中）
      const body = this.parseBlockStatement();
      
      // 恢复原作用域
      this.context.currentScope = oldScope;

      // 添加到当前作用域
      this.context.currentScope.functions.set(name, {
        name,
        returnType,
        parameters,
        body: body as any
      });

      return ASTFactory.createFunctionDeclaration(name, returnType, parameters, body as any);
    } else {
      throw new Error(`Expected ';' or '{' after function declaration, got ${nextToken?.type || 'EOF'}`);
    }
  }

  private parseIfStatement(): IfStatement {
    this.expect(TokenType.IF);
    this.expect(TokenType.LEFTPAREN);
    const condition = this.parseExpression();
    this.expect(TokenType.RIGHTPAREN);
    
    const thenBranch = this.parseStatement();
    let elseBranch: Statement | undefined;
    
    if (this.lexer.getCurrentToken()?.type === TokenType.ELSE) {
      this.lexer.advance();
      elseBranch = this.parseStatement() || undefined;
    }

    return ASTFactory.createIfStatement(condition, thenBranch!, elseBranch);
  }

  private parseWhileStatement(): WhileStatement {
    this.expect(TokenType.WHILE);
    this.expect(TokenType.LEFTPAREN);
    const condition = this.parseExpression();
    this.expect(TokenType.RIGHTPAREN);
    
    const body = this.parseStatement();
    return ASTFactory.createWhileStatement(condition, body!);
  }

  private parseForStatement(): ForStatement {
    this.expect(TokenType.FOR);
    this.expect(TokenType.LEFTPAREN);
    
    // 为 for 循环创建独立的作用域
    const forLoopScope: Scope = {
      variables: new Map(),
      functions: new Map(),
      parent: this.context.currentScope
    };
    
    const oldScope = this.context.currentScope;
    this.context.currentScope = forLoopScope;
    
    // 先解析初始化部分，但不立即解析表达式
    let init: VariableDeclaration | LetDeclaration | AssignmentStatement | ExpressionStatement | undefined;
    let initName: string | undefined;
    
    // 检查 init 部分是否为空（直接是分号）
    if (this.lexer.getCurrentToken()?.type === TokenType.SEMICOLON) {
      // init 部分为空，不解析任何内容
      init = undefined;
    } else if (this.lexer.getCurrentToken()?.type === TokenType.INT) {
      const dataType = this.parseDataType();
      initName = this.parseIdentifierName();
      
      // 先声明变量，不设置初始值（添加到 for 循环作用域）
      this.context.currentScope.variables.set(initName, {
        name: initName,
        type: dataType,
        value: 0,
        isInitialized: false
      });
      
      let initializer: Expression | undefined;
      if (this.lexer.getCurrentToken()?.type === TokenType.ASSIGN) {
        this.lexer.advance();
        initializer = this.parseExpression();
        // 更新初始化状态
        this.context.currentScope.variables.get(initName)!.isInitialized = true;
      }

      init = ASTFactory.createVariableDeclaration(initName, dataType, initializer);
    } else if (this.lexer.getCurrentToken()?.type === TokenType.LET) {
      // 支持 let 关键字
      this.lexer.advance(); // 跳过 'let'
      initName = this.parseIdentifierName();
      
      // 先声明变量，不设置初始值（添加到 for 循环作用域）
      this.context.currentScope.variables.set(initName, {
        name: initName,
        type: DataType.INT,
        value: 0,
        isInitialized: false
      });
      
      // 移除 TDZ 标记，因为 for 循环的变量可以在条件和循环体中使用
      this.tdzChecker.removeLetVariable(initName);
      
      let initializer: Expression | undefined;
      if (this.lexer.getCurrentToken()?.type === TokenType.ASSIGN) {
        this.lexer.advance();
        initializer = this.parseExpression();
        // 更新初始化状态
        this.context.currentScope.variables.get(initName)!.isInitialized = true;
      }

      init = ASTFactory.createLetDeclaration(initName, DataType.INT, initializer);
    } else if (this.lexer.getCurrentToken()?.type === TokenType.IDENTIFIER) {
      init = this.parseAssignmentStatement();
    } else {
      init = this.parseExpressionStatement();
    }
    
    this.expect(TokenType.SEMICOLON);
    
    // 现在解析条件部分，此时变量已经在作用域中
    let condition: Expression | undefined;
    if (this.lexer.getCurrentToken()?.type !== TokenType.SEMICOLON) {
      this.tdzChecker.inForLoopCondition = true;
      condition = this.parseExpression();
      this.tdzChecker.inForLoopCondition = false;
    }
    this.expect(TokenType.SEMICOLON);
    
    // 解析更新部分
    let update: ExpressionStatement | undefined;
    if (this.lexer.getCurrentToken()?.type !== TokenType.RIGHTPAREN) {
      this.tdzChecker.inForLoopCondition = true;
      const expression = this.parseExpression();
      this.tdzChecker.inForLoopCondition = false;
      update = ASTFactory.createExpressionStatement(expression);
    }
    this.expect(TokenType.RIGHTPAREN);
    
    this.tdzChecker.inForLoopBody = true;
    const body = this.parseStatement();
    this.tdzChecker.inForLoopBody = false;
    
    // 恢复原作用域（退出 for 循环作用域）
    this.context.currentScope = oldScope;
    
    return ASTFactory.createForStatement(init, condition, update, body!);
  }

  private parseReturnStatement(): ReturnStatement {
    this.expect(TokenType.RETURN);
    
    let value: Expression | undefined;
    if (this.lexer.getCurrentToken()?.type !== TokenType.SEMICOLON) {
      value = this.parseExpression();
    }
    
    this.expectSemicolon();
    return ASTFactory.createReturnStatement(value);
  }

  private parseBreakStatement(): BreakStatement {
    this.expect(TokenType.BREAK);
    this.expectSemicolon();
    return ASTFactory.createBreakStatement();
  }

  private parseContinueStatement(): ContinueStatement {
    this.expect(TokenType.CONTINUE);
    this.expectSemicolon();
    return ASTFactory.createContinueStatement();
  }

  private parseBlockStatement(): BlockStatement {
    this.expect(TokenType.LBRACE);
    
    // 创建新的作用域
    const newScope: Scope = {
      variables: new Map(),
      functions: new Map(),
      parent: this.context.currentScope
    };
    
    const oldScope = this.context.currentScope;
    this.context.currentScope = newScope;
    
    const statements: Statement[] = [];
    while (this.lexer.getCurrentToken()?.type !== TokenType.RBRACE && !this.lexer.isAtEnd()) {
      const statement = this.parseStatement();
      if (statement) {
        statements.push(statement);
      }
    }
    
    this.expect(TokenType.RBRACE);
    
    // 恢复原作用域
    this.context.currentScope = oldScope;
    
    return ASTFactory.createBlockStatement(statements) as any;
  }

  private parseExpression(): Expression {
    return this.parseAssignmentExpression();
  }

  private parseAssignmentExpression(): Expression {
    const left = this.parseLogicalOrExpression();
    
    if (this.lexer.getCurrentToken()?.type === TokenType.ASSIGN) {
      this.lexer.advance();
      const right = this.parseAssignmentExpression();
      return ASTFactory.createBinaryExpression('=', left, right);
    }
    
    return left;
  }

  private parseLogicalOrExpression(): Expression {
    let left = this.parseLogicalAndExpression();
    
    while (this.lexer.getCurrentToken()?.type === TokenType.OR) {
      const operator = this.lexer.getCurrentToken()!.value as string;
      this.lexer.advance();
      const right = this.parseLogicalAndExpression();
      left = ASTFactory.createBinaryExpression(operator, left, right);
    }
    
    return left;
  }

  private parseLogicalAndExpression(): Expression {
    let left = this.parseEqualityExpression();
    
    while (this.lexer.getCurrentToken()?.type === TokenType.AND) {
      const operator = this.lexer.getCurrentToken()!.value as string;
      this.lexer.advance();
      const right = this.parseEqualityExpression();
      left = ASTFactory.createBinaryExpression(operator, left, right);
    }
    
    return left;
  }

  private parseEqualityExpression(): Expression {
    let left = this.parseRelationalExpression();
    
    while (this.lexer.getCurrentToken()?.type === TokenType.EQ || 
           this.lexer.getCurrentToken()?.type === TokenType.NE) {
      const operator = this.lexer.getCurrentToken()!.value as string;
      this.lexer.advance();
      const right = this.parseRelationalExpression();
      left = ASTFactory.createBinaryExpression(operator, left, right);
    }
    
    return left;
  }

  private parseRelationalExpression(): Expression {
    let left = this.parseAdditiveExpression();
    
    while (this.lexer.getCurrentToken()?.type === TokenType.LT ||
           this.lexer.getCurrentToken()?.type === TokenType.LE ||
           this.lexer.getCurrentToken()?.type === TokenType.GT ||
           this.lexer.getCurrentToken()?.type === TokenType.GE) {
      const operator = this.lexer.getCurrentToken()!.value as string;
      this.lexer.advance();
      const right = this.parseAdditiveExpression();
      left = ASTFactory.createBinaryExpression(operator, left, right);
    }
    
    return left;
  }

  private parseAdditiveExpression(): Expression {
    let left = this.parseMultiplicativeExpression();
    
    while (this.lexer.getCurrentToken()?.type === TokenType.ADD ||
           this.lexer.getCurrentToken()?.type === TokenType.SUB) {
      const operator = this.lexer.getCurrentToken()!.value as string;
      this.lexer.advance();
      const right = this.parseMultiplicativeExpression();
      left = ASTFactory.createBinaryExpression(operator, left, right);
    }
    
    return left;
  }

  private parseMultiplicativeExpression(): Expression {
    let left = this.parsePowerExpression();
    
    while (this.lexer.getCurrentToken()?.type === TokenType.MUL ||
           this.lexer.getCurrentToken()?.type === TokenType.DIV ||
           this.lexer.getCurrentToken()?.type === TokenType.MODULO) {
      const operator = this.lexer.getCurrentToken()!.value as string;
      this.lexer.advance();
      const right = this.parsePowerExpression();
      left = ASTFactory.createBinaryExpression(operator, left, right);
    }
    
    return left;
  }

  private parsePowerExpression(): Expression {
    let left = this.parseUnaryExpression();
    
    while (this.lexer.getCurrentToken()?.type === TokenType.POWER) {
      const operator = this.lexer.getCurrentToken()!.value as string;
      this.lexer.advance();
      const right = this.parsePowerExpression(); // 右结合
      left = ASTFactory.createBinaryExpression(operator, left, right);
    }
    
    return left;
  }

  private parseUnaryExpression(): Expression {
    const token = this.lexer.getCurrentToken();
    
    if (token?.type === TokenType.SUB || token?.type === TokenType.NOT) {
      const operator = token.value as string;
      this.lexer.advance();
      const operand = this.parseUnaryExpression();
      return ASTFactory.createUnaryExpression(operator, operand);
    }
    
    return this.parsePrimaryExpression();
  }

  private parsePrimaryExpression(): Expression {
    const token = this.lexer.getCurrentToken();
    
    if (!token) {
      throw new Error('Unexpected end of input');
    }
    
    switch (token.type) {
      case TokenType.NUMBER:
        this.lexer.advance();
        return ASTFactory.createNumberLiteral(token.value as number);
        
      case TokenType.IDENTIFIER:
        const identifier = this.parseIdentifier();
        
        // 检查是否是函数调用
        if (this.lexer.getCurrentToken()?.type === TokenType.LEFTPAREN) {
          return this.parseFunctionCall(identifier);
        }
        
        return identifier;
        
      case TokenType.LEFTPAREN:
        this.lexer.advance();
        const expression = this.parseExpression();
        this.expect(TokenType.RIGHTPAREN);
        return ASTFactory.createParenthesizedExpression(expression);
        
      default:
        throw new Error(`Unexpected token: ${token.type}`);
    }
  }

  private parseFunctionCall(callee: Identifier): FunctionCall {
    // 检查函数是否已声明
    const funcName = callee.name;
    const functionInfo = this.findFunctionInScope(funcName);
    
    if (!functionInfo) {
      const token = this.lexer.getCurrentToken();
      this.errors.push({
        message: `Function '${funcName}' is not declared`,
        position: token?.position || 0,
        line: token?.line || 1,
        column: token?.column || 1
      });
    }
    
    this.expect(TokenType.LEFTPAREN);
    const args: Expression[] = [];
    
    if (this.lexer.getCurrentToken()?.type !== TokenType.RIGHTPAREN) {
      args.push(this.parseExpression());
      
      while (this.lexer.getCurrentToken()?.type === TokenType.COMMA) {
        this.lexer.advance();
        args.push(this.parseExpression());
      }
    }
    
    this.expect(TokenType.RIGHTPAREN);
    
    // 检查参数数量是否匹配
    if (functionInfo) {
      const expectedParams = functionInfo.parameters.length;
      const actualArgs = args.length;
      if (expectedParams !== actualArgs) {
        const token = this.lexer.getCurrentToken();
        this.errors.push({
          message: `Function '${funcName}' expects ${expectedParams} argument(s), but ${actualArgs} were provided`,
          position: token?.position || 0,
          line: token?.line || 1,
          column: token?.column || 1
        });
      }
    }
    
    return ASTFactory.createFunctionCall(callee, args);
  }

  // 在作用域链中查找变量
  private findVariableInScope(varName: string): VariableInfo | null {
    let currentScope: Scope | null = this.context.currentScope;
    while (currentScope) {
      const variable = currentScope.variables.get(varName);
      if (variable) {
        return variable;
      }
      currentScope = currentScope.parent || null;
    }
    return null;
  }

  // 在作用域链中查找函数
  private findFunctionInScope(funcName: string): FunctionInfo | null {
    let currentScope: Scope | null = this.context.currentScope;
    while (currentScope) {
      const func = currentScope.functions.get(funcName);
      if (func) {
        return func;
      }
      currentScope = currentScope.parent || null;
    }
    return null;
  }

  private parseIdentifier(): Identifier {
    const token = this.lexer.getCurrentToken();
    if (token?.type !== TokenType.IDENTIFIER) {
      throw new Error(`Expected identifier, got ${token?.type || 'EOF'}`);
    }
    
    const varName = token.value as string;
    
    // 检查下一个 token 是否是 '('，如果是，说明是函数调用，跳过变量检查
    const nextToken = this.lexer.getNextToken();
    const isFunctionCall = nextToken?.type === TokenType.LEFTPAREN;
    
    // 如果不是函数调用，检查变量是否在作用域链中存在
    if (!isFunctionCall) {
      const variable = this.findVariableInScope(varName);
      if (!variable) {
        // 检查是否是函数（可能在作用域中）
        let currentScope: Scope | null = this.context.currentScope;
        let isFunction = false;
        while (currentScope && !isFunction) {
          if (currentScope.functions.has(varName)) {
            isFunction = true;
            break;
          }
          currentScope = currentScope.parent || null;
        }
        
        if (!isFunction) {
          this.errors.push({
            message: `Variable '${varName}' is not defined`,
            position: token.position || 0,
            line: token.line || 1,
            column: token.column || 1
          });
        }
      } else {
        // 编译时 TDZ 检查（仅对变量进行）
        try {
          this.tdzChecker.checkVariableAccess(varName, token.position || 0);
        } catch (error) {
          this.errors.push({
            message: (error as Error).message,
            position: token.position || 0,
            line: token.line || 1,
            column: token.column || 1
          });
        }
      }
    }
    
    this.lexer.advance();
    return ASTFactory.createIdentifier(varName);
  }

  private parseIdentifierName(): string {
    const token = this.lexer.getCurrentToken();
    if (token?.type !== TokenType.IDENTIFIER) {
      throw new Error(`Expected identifier, got ${token?.type || 'EOF'}`);
    }
    
    this.lexer.advance();
    return token.value as string;
  }

  private parseDataType(): DataType {
    const token = this.lexer.getCurrentToken();
    if (token?.type !== TokenType.INT) {
      throw new Error(`Expected data type, got ${token?.type || 'EOF'}`);
    }
    
    this.lexer.advance();
    return DataType.INT; // 目前只支持int类型
  }

  private parseParameterList(): Array<{ name: string; type: DataType }> {
    const parameters: Array<{ name: string; type: DataType }> = [];
    
    if (this.lexer.getCurrentToken()?.type !== TokenType.RIGHTPAREN) {
      const type = this.parseDataType();
      const name = this.parseIdentifierName();
      parameters.push({ name, type });
      
      while (this.lexer.getCurrentToken()?.type === TokenType.COMMA) {
        this.lexer.advance();
        const paramType = this.parseDataType();
        const paramName = this.parseIdentifierName();
        parameters.push({ name: paramName, type: paramType });
      }
    }
    
    return parameters;
  }

  private expect(type: TokenType): Token {
    return this.lexer.expect(type);
  }

  private expectSemicolon(): void {
    this.expect(TokenType.SEMICOLON);
  }

  private addError(message: string): void {
    const token = this.lexer.getCurrentToken();
    this.errors.push({
      message,
      position: token?.position || 0,
      line: token?.line || 1,
      column: token?.column || 1
    });
  }

  private addWarning(message: string): void {
    const token = this.lexer.getCurrentToken();
    this.warnings.push({
      message,
      position: token?.position || 0,
      line: token?.line || 1,
      column: token?.column || 1
    });
  }

  private evaluateExpression(expression: Expression): any {
    switch (expression.type) {
      case 'NumberLiteral':
        return (expression as NumberLiteral).value;
      case 'Identifier':
        const varName = (expression as Identifier).name;
        const variable = this.context.currentScope.variables.get(varName);
        return variable?.value;
      case 'BinaryExpression':
        const binExpr = expression as BinaryExpression;
        const left = this.evaluateExpression(binExpr.left);
        const right = this.evaluateExpression(binExpr.right);
        
        switch (binExpr.operator) {
          case '+': return left + right;
          case '-': return left - right;
          case '*': return left * right;
          case '/': return Math.floor(left / right);
          case '**': return Math.pow(left, right);
          case '==': return left === right;
          case '!=': return left !== right;
          case '<': return left < right;
          case '<=': return left <= right;
          case '>': return left > right;
          case '>=': return left >= right;
          case '&&': return left && right;
          case '||': return left || right;
          default: return 0;
        }
      case 'UnaryExpression':
        const unaryExpr = expression as UnaryExpression;
        const operand = this.evaluateExpression(unaryExpr.operand);
        
        switch (unaryExpr.operator) {
          case '-': return -operand;
          case '!': return !operand;
          default: return operand;
        }
      default:
        return 0;
    }
  }

  // 跳过表达式（用于扫描时）
  private skipExpression(): void {
    const token = this.lexer.getCurrentToken();
    if (!token) return;
    
    switch (token.type) {
      case TokenType.NUMBER:
      case TokenType.IDENTIFIER:
        this.lexer.advance();
        break;
      case TokenType.LEFTPAREN:
        this.lexer.advance();
        this.skipExpression();
        this.expect(TokenType.RIGHTPAREN);
        break;
      default:
        this.lexer.advance();
        break;
    }
  }
}
