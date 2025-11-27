// 语句解析器
// 支持完整的语句解析，包括表达式、声明、控制流等

import { StatementLexer } from './lexer';
import type { Token } from './lexer';
import { TokenType, DataType, type TypeInfo, type StructDefinition } from './types';
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
  type FunctionDeclaration,
  type AddressOfExpression,
  type DereferenceExpression,
  type MemberExpression,
  type StructDeclaration
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
  private structDefinitions: Map<string, StructDefinition>;

  constructor(source: string) {
    this.lexer = new StatementLexer(source);
    this.context = this.createInitialContext();
    this.tdzChecker = new TDZChecker(); // 初始化 TDZ 检查器
    this.structDefinitions = new Map();
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

    // 注册内置函数
    // alloc(size) -> int
    globalScope.functions.set('alloc', {
      name: 'alloc',
      returnType: DataType.INT, // 返回地址（整数）
      parameters: [{ name: 'size', type: DataType.INT }],
      body: ASTFactory.createBlockStatement([]) as any
    });

    // free(ptr) -> void
    globalScope.functions.set('free', {
      name: 'free',
      returnType: DataType.VOID,
      parameters: [{ name: 'ptr', type: DataType.INT }],
      body: ASTFactory.createBlockStatement([]) as any
    });

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
      case TokenType.STRUCT:
        if (this.isStructDeclaration()) {
          return this.parseStructDeclaration();
        }
        // 检查是否是函数声明 (struct Node *createNode() { ... })
        // 需要向前查看：struct <name> <*...> <identifier> (
        const structNextToken = this.lexer.getNextToken();
        if (structNextToken?.type === TokenType.IDENTIFIER) {
          // 跳过可能的指针符号 (* 或 **)
          let lookahead = 2;
          let foundParen = false;
          while (lookahead < 10) {  // 最多向前看10个token
            const token = this.lexer.peek(lookahead);
            if (!token) break;
            if (token.type === TokenType.LEFTPAREN) {
              foundParen = true;
              break;
            }
            if (token.type === TokenType.MUL || token.type === TokenType.POWER) {
              lookahead++;
              continue;
            }
            if (token.type === TokenType.IDENTIFIER) {
              lookahead++;
              continue;
            }
            break;
          }
          if (foundParen) {
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
        // 检查是否是赋值语句：p = ... 或 p->x = ... 或 p.x = ...
        if (nextToken?.type === TokenType.ASSIGN) {
          return this.parseAssignmentStatement();
        }
        // 如果是 DOT 或 ARROW，可能是成员访问，需要进一步检查
        if (nextToken?.type === TokenType.DOT || nextToken?.type === TokenType.ARROW) {
          const thirdToken = this.lexer.peek(2);
          // 如果是 p->x = ... 或 p.x = ...，需要检查第四个 token 是否是 ASSIGN
          if (thirdToken?.type === TokenType.IDENTIFIER) {
            const fourthToken = this.lexer.peek(3);
            if (fourthToken?.type === TokenType.ASSIGN) {
              return this.parseAssignmentStatement();
            }
          }
          // 否则是表达式中的成员访问，如 p->x 或 p.x
          return this.parseExpressionStatement();
        }
        return this.parseExpressionStatement();
      case TokenType.MUL:
      case TokenType.POWER:
        // 检查是否是解引用赋值 *p = ..., **pp = ..., ***ppp = ...（支持任意级别）
        // 向前查看，找到标识符和赋值符号
        let lookahead = 0;
        let foundIdentifier = false;
        let foundAssign = false;
        
        // 跳过所有的 * 和 **
        while (true) {
          const currentToken = this.lexer.peek(lookahead);
          if (!currentToken) break;
          
          if (currentToken.type === TokenType.MUL) {
            lookahead++;
          } else if (currentToken.type === TokenType.POWER) {
            lookahead++;
          } else if (currentToken.type === TokenType.IDENTIFIER) {
            foundIdentifier = true;
            lookahead++;
            // 检查下一个 token 是否是 =
            const nextToken = this.lexer.peek(lookahead);
            if (nextToken?.type === TokenType.ASSIGN) {
              foundAssign = true;
            }
            break;
          } else {
            break;
          }
        }
        
        if (foundIdentifier && foundAssign) {
          return this.parseAssignmentStatement();
        }
        return this.parseExpressionStatement();
      default:
        return this.parseExpressionStatement();
    }
  }

  private isStructDeclaration(): boolean {
    const nextToken = this.lexer.getNextToken();
    const thirdToken = this.lexer.peek(2);
    return nextToken?.type === TokenType.IDENTIFIER && thirdToken?.type === TokenType.LBRACE;
  }

  private parseExpressionStatement(): ExpressionStatement {
    const expression = this.parseExpression();
    this.expectSemicolon();
    return ASTFactory.createExpressionStatement(expression);
  }

  private parseAssignmentStatement(): AssignmentStatement {
    // 检查是否是解引用赋值 *p = ..., **pp = ..., ***ppp = ...（支持任意级别）
    const token = this.lexer.getCurrentToken();
    let target: Identifier | DereferenceExpression | MemberExpression;
    
    console.log('[parseAssignmentStatement] 开始解析赋值语句，当前 token:', token?.type);
    
    if (token?.type === TokenType.MUL) {
      // 解引用赋值：*p = ..., **pp = ..., ***ppp = ...
      // 计算解引用的级数
      let derefLevel = 0;
      console.log('[parseAssignmentStatement] 遇到 MUL，开始计算解引用级数');
      while (this.lexer.getCurrentToken()?.type === TokenType.MUL) {
        console.log('[parseAssignmentStatement] 处理 MUL，derefLevel++');
        this.lexer.advance(); // 跳过 *
        derefLevel++;
      }
      
      // 如果遇到 **（被识别为 POWER token），也处理
      const currentToken = this.lexer.getCurrentToken();
      console.log('[parseAssignmentStatement] MUL 处理完成，当前 token:', currentToken?.type, 'derefLevel:', derefLevel);
      if (currentToken?.type === TokenType.POWER) {
        console.log('[parseAssignmentStatement] 遇到 POWER，derefLevel += 2');
        this.lexer.advance(); // 跳过 **
        derefLevel += 2;
        console.log('[parseAssignmentStatement] POWER 处理完成，当前 token:', this.lexer.getCurrentToken()?.type, 'derefLevel:', derefLevel);
      }
      
      // 解析操作数（标识符）
      console.log('[parseAssignmentStatement] 准备解析标识符，当前 token:', this.lexer.getCurrentToken()?.type);
      const operand = this.parseIdentifier();
      console.log('[parseAssignmentStatement] 解析到标识符:', operand.name);
      
      // 递归构建嵌套的解引用表达式：***ppp = *(*(*ppp))
      let result: Expression = operand;
      for (let i = 0; i < derefLevel; i++) {
        result = ASTFactory.createDereferenceExpression(result);
      }
      target = result as DereferenceExpression;
    } else if (token?.type === TokenType.POWER) {
      // **pp = ..., ***ppp = ..., ****pppp = ... 的情况（在赋值语句开头，lexer 将 ** 识别为 POWER）
      console.log('[parseAssignmentStatement] 遇到 POWER（在开头）');
      let derefLevel = 0;
      
      // 循环处理所有连续的 POWER 和 MUL token
      while (true) {
        const currentToken = this.lexer.getCurrentToken();
        if (!currentToken) break;
        
        if (currentToken.type === TokenType.POWER) {
          console.log('[parseAssignmentStatement] 遇到 POWER，derefLevel += 2');
          this.lexer.advance(); // 跳过 **
          derefLevel += 2;
        } else if (currentToken.type === TokenType.MUL) {
          console.log('[parseAssignmentStatement] 遇到 MUL，derefLevel++');
          this.lexer.advance(); // 跳过 *
          derefLevel++;
        } else {
          // 遇到非指针符号（如 IDENTIFIER），停止解析
          break;
        }
      }
      
      const operand = this.parseIdentifier(); // 后面必须是标识符
      console.log('[parseAssignmentStatement] 解析到标识符:', operand.name, 'derefLevel:', derefLevel);
      
      // 递归构建嵌套的解引用表达式：****pppp = *(*(*(*pppp)))
      let result: Expression = operand;
      for (let i = 0; i < derefLevel; i++) {
        result = ASTFactory.createDereferenceExpression(result);
      }
      target = result as DereferenceExpression;
    } else {
      // 普通赋值：p = ...
      target = this.parseIdentifier();
      const nextToken = this.lexer.getCurrentToken();
      if (nextToken?.type === TokenType.DOT) {
        target = this.parseMemberExpressionFromIdentifier(target, false);
      } else if (nextToken?.type === TokenType.ARROW) {
        target = this.parseMemberExpressionFromIdentifier(target, true);
      }
    }
    
    this.expect(TokenType.ASSIGN);
    const value = this.parseExpression();
    return ASTFactory.createAssignmentStatement(target, value);
  }

  private parseVariableDeclaration(): VariableDeclaration {
    console.log('[parseVariableDeclaration] 开始解析变量声明，当前 token:', this.lexer.getCurrentToken()?.type);
    const typeInfo = this.parseTypeInfo(); // 解析类型信息（支持指针）
    console.log('[parseVariableDeclaration] parseTypeInfo 完成，准备解析标识符，当前 token:', this.lexer.getCurrentToken()?.type);
    const name = this.parseIdentifierName();
    console.log('[parseVariableDeclaration] 解析到标识符:', name);
    
    let initializer: Expression | undefined;
    if (this.lexer.getCurrentToken()?.type === TokenType.ASSIGN) {
      this.lexer.advance();
      initializer = this.parseExpression();
    }

    let structSize: number | undefined;
    if (typeInfo.baseType === DataType.STRUCT) {
      if (!typeInfo.structName) {
        this.addError('Struct type requires a name');
      }

      // 允许结构体指针声明
      if (typeInfo.isPointer) {
        // 结构体指针的大小是 1（指针本身）
        structSize = 1;
      } else {
        // 结构体变量的大小是结构体定义的大小
        if (!typeInfo.structDefinition) {
          this.addError(`Struct '${typeInfo.structName || 'unknown'}' is not declared`);
        } else {
          structSize = typeInfo.structDefinition.size;
        }
      }

      // 只有非指针的结构体才不允许初始化
      // struct Point p1 = {...}; // 不允许
      // struct Point* p1 = &p2;  // 允许（指针初始化）
      if (initializer && !typeInfo.isPointer) {
        this.addError('Struct value initialization is not supported yet. Use separate assignment statements.');
        initializer = undefined;
      }
    }

    this.expectSemicolon();

    const variableValue = initializer && typeInfo.baseType !== DataType.STRUCT
      ? this.evaluateExpression(initializer)
      : undefined;

    this.context.currentScope.variables.set(name, {
      name,
      type: typeInfo.baseType,
      typeInfo,
      structName: typeInfo.structName,
      structDefinition: typeInfo.structDefinition,
      value: variableValue,
      isInitialized: typeInfo.baseType === DataType.STRUCT ? true : !!initializer
    });

    return ASTFactory.createVariableDeclaration(
      name,
      typeInfo.baseType,
      initializer,
      undefined,
      {
        structName: typeInfo.structName,
        structSize
      }
    );
  }

  private parseStructDeclaration(): StructDeclaration {
    this.expect(TokenType.STRUCT);
    const structName = this.parseIdentifierName();
    this.expect(TokenType.LBRACE);

    const fieldsForAst: Array<{ name: string; type: DataType; typeInfo?: TypeInfo }> = [];
    const structFields: StructDefinition['fields'] = [];
    const fieldNames = new Set<string>();
    let offset = 0;

    while (this.lexer.getCurrentToken()?.type !== TokenType.RBRACE && !this.lexer.isAtEnd()) {
      // 使用 parseTypeInfo 解析字段类型（支持 int, int*, int**, struct Foo, struct Foo*, 等）
      const fieldTypeInfo = this.parseTypeInfo();
      const fieldName = this.parseIdentifierName();
      
      if (fieldNames.has(fieldName)) {
        this.addError(`Duplicate field '${fieldName}' in struct '${structName}'`);
      } else {
        fieldNames.add(fieldName);
        
        // 计算字段大小
        let fieldSize = 1; // 默认大小为 1
        
        if (fieldTypeInfo.isPointer) {
          // 所有指针类型（int*, int**, struct Foo*, 等）大小都是 1
          fieldSize = 1;
        } else if (fieldTypeInfo.baseType === DataType.STRUCT) {
          // 非指针的结构体类型，大小为结构体定义的大小
          if (fieldTypeInfo.structDefinition) {
            fieldSize = fieldTypeInfo.structDefinition.size;
          } else {
            this.addError(`Struct '${fieldTypeInfo.structName || 'unknown'}' is not declared`);
            fieldSize = 1; // 默认为 1 以避免错误传播
          }
        } else {
          // 基础类型（int, float, 等）大小为 1
          fieldSize = 1;
        }
        
        // 添加到 AST 字段列表
        fieldsForAst.push({ 
          name: fieldName, 
          type: fieldTypeInfo.baseType,
          typeInfo: fieldTypeInfo
        });
        
        // 添加到结构体定义字段列表
        structFields.push({ 
          name: fieldName, 
          type: fieldTypeInfo.baseType, 
          offset,
          typeInfo: fieldTypeInfo
        });
        
        offset += fieldSize; // 累加偏移量
      }

      this.expectSemicolon();
    }

    this.expect(TokenType.RBRACE);
    this.expectSemicolon();  // C 标准要求结构体定义后必须加分号

    const structDef: StructDefinition = {
      name: structName,
      fields: structFields,
      size: offset
    };

    if (this.structDefinitions.has(structName)) {
      this.addWarning(`Struct '${structName}' redefined, previous definition will be overwritten`);
    }

    this.structDefinitions.set(structName, structDef);
    return ASTFactory.createStructDeclaration(structName, fieldsForAst);
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
    // 支持多种语法：
    // 1. function name() { ... }
    // 2. int name() { ... }
    // 3. int *name() { ... }
    // 4. struct Node *name() { ... }
    // 5. int name(); (函数声明，没有函数体)
    let returnType: DataType;
    let name: string;
    
    const currentToken = this.lexer.getCurrentToken();
    if (currentToken?.type === TokenType.FUNCTION) {
      // function name() { ... }
      this.lexer.advance();
      name = this.parseIdentifierName();
      returnType = 'void' as DataType;
    } else if (currentToken?.type === TokenType.INT || currentToken?.type === TokenType.STRUCT) {
      // int name() { ... } 或 struct Node *name() { ... }
      // 使用 parseTypeInfo 解析返回类型（支持指针）
      const typeInfo = this.parseTypeInfo();
      returnType = typeInfo.baseType;
      
      // 现在解析函数名
      name = this.parseIdentifierName();
    } else {
      throw new Error('Expected function, int, or struct keyword');
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
    
    // 支持取地址操作符 &
    if (token?.type === TokenType.ADDRESS_OF) {
      this.lexer.advance();
      const operand = this.parseIdentifier(); // & 后面必须是标识符
      return ASTFactory.createAddressOfExpression(operand);
    }
    
    // 支持解引用操作符 *（在表达式中）
    // 支持多级解引用：*p, **pp, ***ppp, ...（任意级别）
    if (token?.type === TokenType.MUL) {
      // 计算解引用的级数
      let derefLevel = 0;
      while (this.lexer.getCurrentToken()?.type === TokenType.MUL) {
        this.lexer.advance(); // 跳过 *
        derefLevel++;
      }
      
      // 如果遇到 **（被识别为 POWER token），也处理
      if (this.lexer.getCurrentToken()?.type === TokenType.POWER) {
        this.lexer.advance(); // 跳过 **
        derefLevel += 2;
      }
      
      // 解析操作数（可能是标识符或其他表达式）
      const operand = this.parseUnaryExpression();
      
      // 递归构建嵌套的解引用表达式：***ppp = *(*(*ppp))
      let result: Expression = operand;
      for (let i = 0; i < derefLevel; i++) {
        result = ASTFactory.createDereferenceExpression(result);
      }
      return result;
    }
    
    // 支持 ** 作为两个解引用操作（**pp = *(*pp)）
    // 注意：如果前面已经处理了 MUL，这里不会执行
    if (token?.type === TokenType.POWER) {
      this.lexer.advance();
      const operand = this.parseUnaryExpression(); // ** 后面可以是表达式
      // **pp 等价于 *(*pp)，即先解引用一次，再解引用一次
      const firstDeref = ASTFactory.createDereferenceExpression(operand);
      return ASTFactory.createDereferenceExpression(firstDeref);
    }
    
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

        if (this.lexer.getCurrentToken()?.type === TokenType.DOT) {
          return this.parseMemberExpressionFromIdentifier(identifier, false);
        }
        
        if (this.lexer.getCurrentToken()?.type === TokenType.ARROW) {
          return this.parseMemberExpressionFromIdentifier(identifier, true);
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
    // 同时也检查是否是 ARROW 或 DOT，用于成员访问
    const nextToken = this.lexer.getNextToken();
    const isFunctionCall = nextToken?.type === TokenType.LEFTPAREN;
    const isMemberAccess = nextToken?.type === TokenType.DOT || nextToken?.type === TokenType.ARROW;
    
    // 如果不是函数调用且不是成员访问，检查变量是否在作用域链中存在
    if (!isFunctionCall && !isMemberAccess) {
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
    
    this.lexer.advance(); // 消耗 identifier token
    return ASTFactory.createIdentifier(varName);
  }

  private parseMemberExpressionFromIdentifier(identifier: Identifier, isPointerAccess: boolean): MemberExpression {
    if (isPointerAccess) {
      this.expect(TokenType.ARROW);
    } else {
      this.expect(TokenType.DOT);
    }
    const fieldName = this.parseIdentifierName();
    const { structName, offset, structSize } = this.resolveStructField(identifier.name, fieldName, isPointerAccess);
    return ASTFactory.createMemberExpression(
      identifier,
      fieldName,
      offset,
      structName || identifier.name,
      identifier.position,
      isPointerAccess,
      structSize
    );
  }

  private resolveStructField(varName: string, fieldName: string, isPointerAccess: boolean): { structName: string; offset: number; structSize: number } {
    const variable = this.findVariableInScope(varName);
    
    if (isPointerAccess) {
      // 通过指针访问，变量应该是指针类型
      if (!variable || !variable.typeInfo?.isPointer) {
        this.addError(`Variable '${varName}' is not a pointer`);
        return { structName: varName, offset: 0, structSize: 0 };
      }
      
      // 检查指针指向的是结构体类型
      if (variable.typeInfo.baseType !== DataType.STRUCT || !variable.typeInfo.structDefinition) {
        this.addError(`Pointer '${varName}' does not point to a struct`);
        return { structName: varName, offset: 0, structSize: 0 };
      }
      
      const field = variable.typeInfo.structDefinition.fields.find(f => f.name === fieldName);
      if (!field) {
        this.addError(`Struct '${variable.typeInfo.structDefinition.name}' does not have field '${fieldName}'`);
        return { structName: variable.typeInfo.structDefinition.name, offset: 0, structSize: 0 };
      }
      
      return { 
        structName: variable.typeInfo.structDefinition.name, 
        offset: field.offset,
        structSize: variable.typeInfo.structDefinition.size
      };
    } else {
      // 直接访问，变量应该是结构体类型
      if (!variable || variable.type !== DataType.STRUCT || !variable.structDefinition) {
        this.addError(`Variable '${varName}' is not a struct`);
        return { structName: varName, offset: 0, structSize: 0 };
      }

      const field = variable.structDefinition.fields.find(f => f.name === fieldName);
      if (!field) {
        this.addError(`Struct '${variable.structDefinition.name}' does not have field '${fieldName}'`);
        return { structName: variable.structDefinition.name, offset: 0, structSize: 0 };
      }

      return { 
        structName: variable.structDefinition.name, 
        offset: field.offset,
        structSize: variable.structDefinition.size
      };
    }
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

  // 解析类型信息（支持指针类型，包括多级指针）
  private parseTypeInfo(): TypeInfo {
    let baseType: DataType;
    let structName: string | undefined;
    let structDefinition: StructDefinition | undefined;

    const token = this.lexer.getCurrentToken();
    if (token?.type === TokenType.STRUCT) {
      this.lexer.advance(); // 跳过 struct
      const nameToken = this.lexer.getCurrentToken();
      if (nameToken?.type !== TokenType.IDENTIFIER) {
        throw new Error(`Expected struct name, got ${nameToken?.type || 'EOF'}`);
      }
      structName = nameToken.value as string;
      this.lexer.advance();
      baseType = DataType.STRUCT;
      // 先尝试获取结构体定义，但不立即报错（可能是前向引用）
      structDefinition = this.structDefinitions.get(structName);
    } else {
      baseType = this.parseDataType();
    }

    let pointerLevel = 0;
    
    // 检查是否有 *（指针类型），支持多级指针如 int *, int **, int ***, ...（任意级别）
    // 注意：lexer 会将 ** 识别为 POWER token，我们需要特殊处理
    // 对于 ***，lexer 会识别为：POWER（前两个 *），MUL（第三个 *）
    // 对于 ****，lexer 会识别为：POWER, POWER（两个 **）
    // 循环处理所有连续的 * 和 ** token
    console.log('[parseTypeInfo] 开始解析类型信息，baseType:', baseType);
    while (true) {
      const nextToken = this.lexer.getCurrentToken();
      if (!nextToken) {
        console.log('[parseTypeInfo] token 为空，退出循环');
        break;
      }
      
      console.log('[parseTypeInfo] 当前 token:', nextToken.type, nextToken.value, 'pointerLevel:', pointerLevel);
      
      // 只处理 MUL 和 POWER token，其他 token（如 IDENTIFIER）表示指针声明结束
      if (nextToken.type === TokenType.MUL) {
        console.log('[parseTypeInfo] 遇到 MUL，pointerLevel++');
        this.lexer.advance(); // 跳过 *
        pointerLevel++;
        // 继续循环，可能还有更多的 * 或 **
      } else if (nextToken.type === TokenType.POWER) {
        console.log('[parseTypeInfo] 遇到 POWER，pointerLevel += 2');
        this.lexer.advance(); // 跳过 **
        pointerLevel += 2;
        console.log('[parseTypeInfo] 处理 POWER 后，pointerLevel:', pointerLevel, '下一个 token:', this.lexer.getCurrentToken()?.type);
      } else {
        console.log('[parseTypeInfo] 遇到非指针符号:', nextToken.type, '停止解析，pointerLevel:', pointerLevel);
        break;
      }
    }
    
    // 只有在非指针的结构体类型时才验证结构体是否存在
    // 对于指针类型（struct Foo *），允许前向引用，因为指针大小固定为 1
    if (baseType === DataType.STRUCT && pointerLevel === 0 && !structDefinition) {
      this.addError(`Struct '${structName}' is not declared`);
    }
    
    console.log('[parseTypeInfo] 解析完成，pointerLevel:', pointerLevel, '下一个 token:', this.lexer.getCurrentToken()?.type);
    return { 
      baseType, 
      isPointer: pointerLevel > 0, 
      pointerLevel: pointerLevel > 0 ? pointerLevel : undefined,
      structName,
      structDefinition
    };
  }

  private parseParameterList(): Array<{ name: string; type: DataType }> {
    const parameters: Array<{ name: string; type: DataType }> = [];
    
    if (this.lexer.getCurrentToken()?.type !== TokenType.RIGHTPAREN) {
      const typeInfo = this.parseTypeInfo(); // 支持指针类型参数
      const name = this.parseIdentifierName();
      // 只有非指针的结构体参数不支持（值传递太复杂）
      // 结构体指针参数是允许的
      if (typeInfo.baseType === DataType.STRUCT && !typeInfo.isPointer) {
        this.addError('Struct value parameters are not supported, use struct pointers instead');
      }
      parameters.push({ name, type: typeInfo.baseType });
      
      while (this.lexer.getCurrentToken()?.type === TokenType.COMMA) {
        this.lexer.advance();
        const paramTypeInfo = this.parseTypeInfo(); // 支持指针类型参数
        const paramName = this.parseIdentifierName();
        // 只有非指针的结构体参数不支持
        if (paramTypeInfo.baseType === DataType.STRUCT && !paramTypeInfo.isPointer) {
          this.addError('Struct value parameters are not supported, use struct pointers instead');
        }
        parameters.push({ name: paramName, type: paramTypeInfo.baseType });
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
      case 'AddressOfExpression':
      case 'DereferenceExpression':
      case 'MemberExpression':
        return 0;
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
