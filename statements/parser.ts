// 语句解析器
// 支持完整的语句解析，包括表达式、声明、控制流等

import { StatementLexer } from './lexer';
import type { Token } from './lexer';
import { TokenType, DataType } from './types';
import type { ParseResult, ParseError, ParseContext, Scope, VariableInfo, FunctionInfo } from './types';
import { 
  ASTFactory
} from './ast';
import type { 
  Program, 
  Statement, 
  Expression, 
  NumberLiteral, 
  Identifier, 
  BinaryExpression, 
  UnaryExpression, 
  FunctionCall, 
  ParenthesizedExpression,
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

export class StatementParser {
  private lexer: StatementLexer;
  private errors: ParseError[] = [];
  private warnings: ParseError[] = [];
  private context: ParseContext;

  constructor(source: string) {
    this.lexer = new StatementLexer(source);
    this.context = this.createInitialContext();
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

  private parseFunctionDeclaration(): FunctionDeclaration {
    // 支持两种语法：
    // 1. function name() { ... }
    // 2. int name() { ... }
    let returnType: DataType;
    let name: string;
    
    const currentToken = this.lexer.getCurrentToken();
    if (currentToken?.type === TokenType.FUNCTION) {
      // function name() { ... }
      this.lexer.advance();
      name = this.parseIdentifierName();
      returnType = 'void' as DataType;
    } else if (currentToken?.type === TokenType.INT) {
      // int name() { ... }
      this.lexer.advance();
      name = this.parseIdentifierName();
      returnType = 'int' as DataType;
    } else {
      throw new Error('Expected function or int keyword');
    }
    
    this.expect(TokenType.LEFTPAREN);
    const parameters = this.parseParameterList();
    this.expect(TokenType.RIGHTPAREN);
    
    const body = this.parseBlockStatement();

    // 添加到当前作用域
    this.context.currentScope.functions.set(name, {
      name,
      returnType,
      parameters,
      body: body as any
    });

    return ASTFactory.createFunctionDeclaration(name, returnType, parameters, body as any);
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
    
    let init: VariableDeclaration | AssignmentStatement | ExpressionStatement | undefined;
    if (this.lexer.getCurrentToken()?.type === TokenType.INT) {
      init = this.parseVariableDeclaration();
    } else if (this.lexer.getCurrentToken()?.type === TokenType.IDENTIFIER) {
      init = this.parseAssignmentStatement();
    } else {
      init = this.parseExpressionStatement();
    }
    
    this.expect(TokenType.SEMICOLON);
    
    let condition: Expression | undefined;
    if (this.lexer.getCurrentToken()?.type !== TokenType.SEMICOLON) {
      condition = this.parseExpression();
    }
    this.expect(TokenType.SEMICOLON);
    
    let update: ExpressionStatement | undefined;
    if (this.lexer.getCurrentToken()?.type !== TokenType.RIGHTPAREN) {
      update = this.parseExpressionStatement();
    }
    this.expect(TokenType.RIGHTPAREN);
    
    const body = this.parseStatement();
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
    return ASTFactory.createFunctionCall(callee, args);
  }

  private parseIdentifier(): Identifier {
    const token = this.lexer.getCurrentToken();
    if (token?.type !== TokenType.IDENTIFIER) {
      throw new Error(`Expected identifier, got ${token?.type || 'EOF'}`);
    }
    
    this.lexer.advance();
    return ASTFactory.createIdentifier(token.value as string);
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
}
