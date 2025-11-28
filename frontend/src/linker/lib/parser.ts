// 语句解析器 - 前端独立版本（简化版，包含 line/column）

import { StatementLexer, TokenType, DataType } from './lexer';
import type { Token } from './lexer';
import { ASTFactory } from './ast-factory';
import type { 
  Statement, 
  Expression, 
  Program,
  VariableDeclaration,
  LetDeclaration,
  ExpressionStatement,
  AssignmentStatement,
  IfStatement,
  WhileStatement,
  ForStatement,
  ReturnStatement,
  BlockStatement,
  Identifier,
} from './types';

export interface ParseError {
  message: string;
  position: number;
  line?: number;
  column?: number;
}

export interface ParseResult {
  ast: Program;
  errors: ParseError[];
}

export class StatementParser {
  private lexer: StatementLexer;
  private errors: ParseError[] = [];
  private declaredFunctions: Set<string> = new Set(); // 跟踪已声明的函数
  private scopeStack: Array<Set<string>> = [];

  constructor(source: string) {
    this.lexer = new StatementLexer(source);
  }

  public parse(): ParseResult {
    this.errors = [];
    this.declaredFunctions.clear();
    this.lexer.reset();
    this.scopeStack = [];
    this.enterScope(); // 全局作用域

    try {
      const statements: Statement[] = [];
      
      // 第一遍：收集所有函数声明
      const savedPosition = this.lexer.getCurrentPosition();
      while (!this.lexer.isAtEnd()) {
        const token = this.lexer.getCurrentToken();
        if (token?.type === TokenType.INT || token?.type === TokenType.FUNCTION) {
          const nextToken = this.lexer.getNextToken();
          if (nextToken?.type === TokenType.IDENTIFIER) {
            const thirdToken = this.lexer.peek(2);
            if (thirdToken?.type === TokenType.LEFTPAREN) {
              const funcName = nextToken.value as string;
              // 检查是否是函数声明（分号）还是函数定义（大括号）
              const fourthToken = this.lexer.peek(3);
              if (fourthToken?.type === TokenType.SEMICOLON) {
                this.declaredFunctions.add(funcName);
              } else if (fourthToken?.type === TokenType.LBRACE) {
                // 函数定义也算作声明
                this.declaredFunctions.add(funcName);
              }
            }
          }
        }
        this.lexer.advance();
      }
      
      // 重置到开始位置
      this.lexer.setPosition(savedPosition);
      
      // 第二遍：解析并检查函数调用
      while (!this.lexer.isAtEnd()) {
        const statement = this.parseStatement();
        if (statement) {
          statements.push(statement);
        }
      }

      const program = ASTFactory.createProgram(statements);
      
      return {
        ast: program,
        errors: this.errors,
      };
    } catch (error) {
      this.addError(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        ast: ASTFactory.createProgram([]),
        errors: this.errors,
      };
    } finally {
      this.scopeStack = [];
    }
  }

  private parseStatement(): Statement | null {
    const token = this.lexer.getCurrentToken();
    if (!token) return null;

    const line = token.line;
    const column = token.column;

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
        this.lexer.advance();
        this.expectSemicolon();
        return ASTFactory.createBreakStatement(line, column);
      case TokenType.CONTINUE:
        this.lexer.advance();
        this.expectSemicolon();
        return ASTFactory.createContinueStatement(line, column);
      case TokenType.LBRACE:
        return this.parseBlockStatement();
      case TokenType.SEMICOLON:
        this.lexer.advance();
        return ASTFactory.createEmptyStatement(line, column);
      default:
        // 尝试解析为表达式语句
        const expr = this.parseExpression();
        if (expr) {
          this.expectSemicolon();
          return ASTFactory.createExpressionStatement(expr, line, column);
        }
        return null;
    }
  }

  private parseVariableDeclaration(): VariableDeclaration {
    const token = this.lexer.getCurrentToken();
    const line = token?.line;
    const column = token?.column;

    this.expect(TokenType.INT);
    const dataType = DataType.INT;
    const name = this.parseIdentifierName();
    this.declareIdentifier(name);
    
    let initializer: Expression | undefined;
    if (this.lexer.getCurrentToken()?.type === TokenType.ASSIGN) {
      this.lexer.advance();
      initializer = this.parseExpression();
    }

    this.expectSemicolon();
    return ASTFactory.createVariableDeclaration(name, dataType, initializer, line, column);
  }

  private parseLetDeclaration(): LetDeclaration {
    const token = this.lexer.getCurrentToken();
    const line = token?.line;
    const column = token?.column;

    this.lexer.advance(); // 跳过 'let'
    const name = this.parseIdentifierName();
    this.declareIdentifier(name);
    
    let initializer: Expression | undefined;
    if (this.lexer.getCurrentToken()?.type === TokenType.ASSIGN) {
      this.lexer.advance();
      initializer = this.parseExpression();
    }

    this.expectSemicolon();
    return ASTFactory.createLetDeclaration(name, DataType.INT, initializer, line, column);
  }

  private parseFunctionDeclaration() {
    const token = this.lexer.getCurrentToken();
    const line = token?.line;
    const column = token?.column;

    // 支持两种语法：function name() { ... } 或 int name() { ... }
    let returnType: DataType;
    let name: string;
    
    if (token?.type === TokenType.FUNCTION) {
      this.lexer.advance();
      name = this.parseIdentifierName();
      returnType = DataType.VOID;
    } else if (token?.type === TokenType.INT) {
      this.lexer.advance();
      name = this.parseIdentifierName();
      returnType = DataType.INT;
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
      const emptyBody = ASTFactory.createBlockStatement([]);
      
      // 注册函数声明
      this.declaredFunctions.add(name);
      
      // 函数声明（只有声明，没有定义）
      return ASTFactory.createFunctionDeclaration(name, returnType, parameters, emptyBody, line, column, true);
    } else {
      // 函数定义：int name() { ... }
      // 注册函数定义（也算作声明）
      this.declaredFunctions.add(name);
      
      const paramNames = parameters.map(p => p.name);
      const body = this.parseBlockStatement(paramNames);
      return ASTFactory.createFunctionDeclaration(name, returnType, parameters, body, line, column, false);
    }
  }

  private parseIfStatement(): IfStatement {
    const token = this.lexer.getCurrentToken();
    const line = token?.line;
    const column = token?.column;

    this.expect(TokenType.IF);
    this.expect(TokenType.LEFTPAREN);
    const condition = this.parseExpression();
    this.expect(TokenType.RIGHTPAREN);
    
    const thenBranch = this.parseStatement()!;
    let elseBranch: Statement | undefined;
    
    if (this.lexer.getCurrentToken()?.type === TokenType.ELSE) {
      this.lexer.advance();
      elseBranch = this.parseStatement() || undefined;
    }

    return ASTFactory.createIfStatement(condition, thenBranch, elseBranch, line, column);
  }

  private parseWhileStatement(): WhileStatement {
    const token = this.lexer.getCurrentToken();
    const line = token?.line;
    const column = token?.column;

    this.expect(TokenType.WHILE);
    this.expect(TokenType.LEFTPAREN);
    const condition = this.parseExpression();
    this.expect(TokenType.RIGHTPAREN);
    
    const body = this.parseStatement()!;
    return ASTFactory.createWhileStatement(condition, body, line, column);
  }

  private parseForStatement(): ForStatement {
    const token = this.lexer.getCurrentToken();
    const line = token?.line;
    const column = token?.column;

    this.expect(TokenType.FOR);
    this.expect(TokenType.LEFTPAREN);
    this.enterScope();
    
    let init: VariableDeclaration | LetDeclaration | AssignmentStatement | ExpressionStatement | undefined;
    
    if (this.lexer.getCurrentToken()?.type === TokenType.SEMICOLON) {
      // init 部分为空
      this.lexer.advance();
    } else if (this.lexer.getCurrentToken()?.type === TokenType.INT) {
      init = this.parseVariableDeclaration();
      // parseVariableDeclaration 已经消耗了分号，所以不需要再 expect
    } else if (this.lexer.getCurrentToken()?.type === TokenType.LET) {
      init = this.parseLetDeclaration();
    } else {
      const expr = this.parseExpression();
      this.expectSemicolon();
      if (expr && expr.type === 'BinaryExpression' && (expr as any).operator === '=') {
        const binExpr = expr as any;
        init = ASTFactory.createAssignmentStatement(
          binExpr.left,
          binExpr.right,
          binExpr.line,
          binExpr.column
        );
      } else {
        init = ASTFactory.createExpressionStatement(expr, expr?.line, expr?.column);
      }
    }
    
    let condition: Expression | undefined;
    if (this.lexer.getCurrentToken()?.type !== TokenType.SEMICOLON) {
      condition = this.parseExpression();
    }
    this.expectSemicolon();
    
    let update: ExpressionStatement | undefined;
    if (this.lexer.getCurrentToken()?.type !== TokenType.RIGHTPAREN) {
      const expr = this.parseExpression();
      const updateToken = this.lexer.getCurrentToken();
      update = ASTFactory.createExpressionStatement(
        expr,
        updateToken?.line,
        updateToken?.column
      );
    }
    
    this.expect(TokenType.RIGHTPAREN);
    
    const body = this.parseStatement()!;
    this.exitScope();
    return ASTFactory.createForStatement(init, condition, update, body, line, column);
  }

  private parseReturnStatement(): ReturnStatement {
    const token = this.lexer.getCurrentToken();
    const line = token?.line;
    const column = token?.column;

    this.expect(TokenType.RETURN);
    
    let value: Expression | undefined;
    if (this.lexer.getCurrentToken()?.type !== TokenType.SEMICOLON) {
      value = this.parseExpression();
    }
    
    this.expectSemicolon();
    return ASTFactory.createReturnStatement(value, line, column);
  }

  private parseBlockStatement(preDeclaredNames: string[] = []): BlockStatement {
    const token = this.lexer.getCurrentToken();
    const line = token?.line;
    const column = token?.column;

    this.expect(TokenType.LBRACE);
    
    const statements: Statement[] = [];
    this.enterScope(preDeclaredNames);
    try {
      while (this.lexer.getCurrentToken()?.type !== TokenType.RBRACE && !this.lexer.isAtEnd()) {
        const statement = this.parseStatement();
        if (statement) {
          statements.push(statement);
        }
      }
      
      this.expect(TokenType.RBRACE);
      return ASTFactory.createBlockStatement(statements, line, column);
    } finally {
      this.exitScope();
    }
  }

  private parseExpression(): Expression {
    return this.parseAssignmentExpression();
  }

  private parseAssignmentExpression(): Expression {
    let left = this.parseLogicalOrExpression();
    
    if (this.lexer.getCurrentToken()?.type === TokenType.ASSIGN) {
      const token = this.lexer.getCurrentToken();
      const line = token?.line;
      const column = token?.column;
      this.lexer.advance();
      const right = this.parseAssignmentExpression();
      return ASTFactory.createBinaryExpression('=', left, right, line, column);
    }
    
    return left;
  }

  private parseLogicalOrExpression(): Expression {
    let left = this.parseLogicalAndExpression();
    
    while (this.lexer.getCurrentToken()?.type === TokenType.OR) {
      const token = this.lexer.getCurrentToken();
      const line = token?.line;
      const column = token?.column;
      const operator = token!.value as string;
      this.lexer.advance();
      const right = this.parseLogicalAndExpression();
      left = ASTFactory.createBinaryExpression(operator, left, right, line, column);
    }
    
    return left;
  }

  private parseLogicalAndExpression(): Expression {
    let left = this.parseEqualityExpression();
    
    while (this.lexer.getCurrentToken()?.type === TokenType.AND) {
      const token = this.lexer.getCurrentToken();
      const line = token?.line;
      const column = token?.column;
      const operator = token!.value as string;
      this.lexer.advance();
      const right = this.parseEqualityExpression();
      left = ASTFactory.createBinaryExpression(operator, left, right, line, column);
    }
    
    return left;
  }

  private parseEqualityExpression(): Expression {
    let left = this.parseRelationalExpression();
    
    while (this.lexer.getCurrentToken()?.type === TokenType.EQ || 
           this.lexer.getCurrentToken()?.type === TokenType.NE) {
      const token = this.lexer.getCurrentToken();
      const line = token?.line;
      const column = token?.column;
      const operator = token!.value as string;
      this.lexer.advance();
      const right = this.parseRelationalExpression();
      left = ASTFactory.createBinaryExpression(operator, left, right, line, column);
    }
    
    return left;
  }

  private parseRelationalExpression(): Expression {
    let left = this.parseAdditiveExpression();
    
    while (this.lexer.getCurrentToken()?.type === TokenType.LT ||
           this.lexer.getCurrentToken()?.type === TokenType.LE ||
           this.lexer.getCurrentToken()?.type === TokenType.GT ||
           this.lexer.getCurrentToken()?.type === TokenType.GE) {
      const token = this.lexer.getCurrentToken();
      const line = token?.line;
      const column = token?.column;
      const operator = token!.value as string;
      this.lexer.advance();
      const right = this.parseAdditiveExpression();
      left = ASTFactory.createBinaryExpression(operator, left, right, line, column);
    }
    
    return left;
  }

  private parseAdditiveExpression(): Expression {
    let left = this.parseMultiplicativeExpression();
    
    while (this.lexer.getCurrentToken()?.type === TokenType.ADD ||
           this.lexer.getCurrentToken()?.type === TokenType.SUB) {
      const token = this.lexer.getCurrentToken();
      const line = token?.line;
      const column = token?.column;
      const operator = token!.value as string;
      this.lexer.advance();
      const right = this.parseMultiplicativeExpression();
      left = ASTFactory.createBinaryExpression(operator, left, right, line, column);
    }
    
    return left;
  }

  private parseMultiplicativeExpression(): Expression {
    let left = this.parsePowerExpression();
    
    while (this.lexer.getCurrentToken()?.type === TokenType.MUL ||
           this.lexer.getCurrentToken()?.type === TokenType.DIV ||
           this.lexer.getCurrentToken()?.type === TokenType.MODULO) {
      const token = this.lexer.getCurrentToken();
      const line = token?.line;
      const column = token?.column;
      const operator = token!.value as string;
      this.lexer.advance();
      const right = this.parsePowerExpression();
      left = ASTFactory.createBinaryExpression(operator, left, right, line, column);
    }
    
    return left;
  }

  private parsePowerExpression(): Expression {
    let left = this.parseUnaryExpression();
    
    while (this.lexer.getCurrentToken()?.type === TokenType.POWER) {
      const token = this.lexer.getCurrentToken();
      const line = token?.line;
      const column = token?.column;
      const operator = token!.value as string;
      this.lexer.advance();
      const right = this.parsePowerExpression(); // 右结合
      left = ASTFactory.createBinaryExpression(operator, left, right, line, column);
    }
    
    return left;
  }

  private parseUnaryExpression(): Expression {
    const token = this.lexer.getCurrentToken();
    
    if (token?.type === TokenType.SUB || token?.type === TokenType.NOT) {
      const operator = token.value as string;
      const line = token.line;
      const column = token.column;
      this.lexer.advance();
      const operand = this.parseUnaryExpression();
      return ASTFactory.createUnaryExpression(operator, operand, line, column);
    }
    
    return this.parsePrimaryExpression();
  }

  private parsePrimaryExpression(): Expression {
    const token = this.lexer.getCurrentToken();
    
    if (!token) {
      throw new Error('Unexpected end of input');
    }
    
    const line = token.line;
    const column = token.column;
    
    switch (token.type) {
      case TokenType.NUMBER:
        this.lexer.advance();
        return ASTFactory.createNumberLiteral(token.value as number, line, column);
        
      case TokenType.IDENTIFIER:
        const identifier = this.parseIdentifier();
        
        // 检查是否是函数调用
        if (this.lexer.getCurrentToken()?.type === TokenType.LEFTPAREN) {
          return this.parseFunctionCall(identifier);
        }
        
        this.ensureIdentifierDeclared(identifier.name, identifier.line, identifier.column);
        
        return identifier;
        
      case TokenType.LEFTPAREN:
        this.lexer.advance();
        const expression = this.parseExpression();
        this.expect(TokenType.RIGHTPAREN);
        return ASTFactory.createParenthesizedExpression(expression, line, column);
        
      default:
        throw new Error(`Unexpected token: ${token.type}`);
    }
  }

  private parseFunctionCall(callee: Identifier): Expression {
    const token = this.lexer.getCurrentToken();
    const line = token?.line;
    const column = token?.column;

    // 检查函数是否已声明
    const funcName = callee.name;
    if (!this.declaredFunctions.has(funcName)) {
      this.addErrorAt(`Function '${funcName}' is not declared`, line, column);
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
    return ASTFactory.createFunctionCall(callee, args, line, column);
  }

  private parseIdentifier(): Identifier {
    const token = this.lexer.getCurrentToken();
    if (token?.type !== TokenType.IDENTIFIER) {
      throw new Error(`Expected identifier, got ${token?.type || 'EOF'}`);
    }
    
    const varName = token.value as string;
    const line = token.line;
    const column = token.column;
    
    this.lexer.advance();
    return ASTFactory.createIdentifier(varName, line, column);
  }

  private parseIdentifierName(): string {
    const token = this.lexer.getCurrentToken();
    if (token?.type !== TokenType.IDENTIFIER) {
      throw new Error(`Expected identifier, got ${token?.type || 'EOF'}`);
    }
    
    this.lexer.advance();
    return token.value as string;
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

  private parseDataType(): DataType {
    const token = this.lexer.getCurrentToken();
    if (token?.type !== TokenType.INT) {
      throw new Error(`Expected data type, got ${token?.type || 'EOF'}`);
    }
    
    this.lexer.advance();
    return DataType.INT; // 目前只支持int类型
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
      line: token?.line,
      column: token?.column,
    });
  }

  private addErrorAt(message: string, line?: number, column?: number): void {
    this.errors.push({
      message,
      position: 0,
      line,
      column,
    });
  }

  private enterScope(preDeclaredNames: string[] = []): void {
    const scope = new Set<string>();
    for (const name of preDeclaredNames) {
      scope.add(name);
    }
    this.scopeStack.push(scope);
  }

  private exitScope(): void {
    if (this.scopeStack.length > 0) {
      this.scopeStack.pop();
    }
  }

  private declareIdentifier(name: string): void {
    if (this.scopeStack.length === 0) {
      this.enterScope();
    }
    const currentScope = this.scopeStack[this.scopeStack.length - 1]!;
    currentScope.add(name);
  }

  private isIdentifierDeclared(name: string): boolean {
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      if (this.scopeStack[i]!.has(name)) {
        return true;
      }
    }
    return false;
  }

  private ensureIdentifierDeclared(name: string, line?: number, column?: number): void {
    if (!this.isIdentifierDeclared(name)) {
      this.addErrorAt(`Undefined identifier: ${name}`, line, column);
    }
  }
}

