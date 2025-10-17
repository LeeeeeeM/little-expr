// 栈式优先级爬坡解析器 - 浏览器版本
// 基于 stack-based-precedence.ts 实现，支持可视化步骤

export interface StackToken {
  type: TokenType;
  value?: number;
  precedence: Precedence;
  isRightAssociative: boolean;
}

export interface ASTNode {
  type: string;
  value?: number;
  operator?: string;
  left?: ASTNode;
  right?: ASTNode;
}

export interface StackStep {
  step: number;
  description: string;
  operatorStack: StackToken[];
  operandStack: (number | ASTNode)[]; // 操作数栈可以存储数字或AST节点
  currentToken: string;
  position: number;
  // 记录弹出的操作符和操作数，供AST生成使用
  poppedOperator?: StackToken;
  poppedOperands?: { left: number | ASTNode; right: number | ASTNode };
  // 记录生成的AST节点
  generatedAST?: ASTNode;
  // 记录最终AST（仅在最后一步）
  finalAST?: ASTNode;
}

export enum TokenType {
  NUMBER = 'NUMBER',
  ADD = 'ADD',
  SUB = 'SUB',
  MUL = 'MUL',
  DIV = 'DIV',
  POWER = 'POWER',
  LEFTPAREN = 'LEFTPAREN',
  RIGHTPAREN = 'RIGHTPAREN',
  END = 'END'
}

export enum Precedence {
  NONE = 0,
  ADD_SUB = 1,
  MUL_DIV = 2,
  POWER = 3,
  PAREN = 4
}

export class StackBasedBrowserParser {
  private operatorStack: StackToken[] = [];
  private operandStack: (number | ASTNode)[] = []; // 操作数栈可以存储数字或AST节点
  private tokens: StackToken[] = [];
  private currentIndex = 0;
  private steps: StackStep[] = [];
  private stepCounter = 0;
  private finalAST: ASTNode | null = null; // 存储最终生成的AST

  constructor(expression: string) {
    this.tokenize(expression.trim());
  }

  private addStep(description: string, poppedOperator?: StackToken, poppedOperands?: { left: number | ASTNode; right: number | ASTNode }, generatedAST?: ASTNode, finalAST?: ASTNode): void {
    this.stepCounter++;
    this.steps.push({
      step: this.stepCounter,
      description,
      operatorStack: JSON.parse(JSON.stringify(this.operatorStack)), // 深拷贝
      operandStack: JSON.parse(JSON.stringify(this.operandStack)), // 深拷贝
      currentToken: this.getCurrentTokenDescription(),
      position: this.currentIndex,
      poppedOperator,
      poppedOperands,
      generatedAST,
      finalAST
    });
  }

  private getCurrentTokenDescription(): string {
    if (this.currentIndex >= this.tokens.length) return '结束';
    const token = this.tokens[this.currentIndex];
    if (!token) return '未知';
    
    switch (token.type) {
      case TokenType.NUMBER: return `数字 ${token.value}`;
      case TokenType.ADD: return '加号 (+)';
      case TokenType.SUB: return '减号 (-)';
      case TokenType.MUL: return '乘号 (*)';
      case TokenType.DIV: return '除号 (/)';
      case TokenType.POWER: return '指数 (**)';
      case TokenType.LEFTPAREN: return '左括号 (';
      case TokenType.RIGHTPAREN: return '右括号 )';
      case TokenType.END: return '结束';
      default: return '未知';
    }
  }

  private tokenize(expression: string): void {
    let i = 0;
    while (i < expression.length) {
      // 跳过空白字符
      while (i < expression.length && /\s/.test(expression[i] || '')) {
        i++;
      }
      
      if (i >= expression.length) break;

      const char = expression[i];
      
      switch (char) {
        case '+':
          this.tokens.push({
            type: TokenType.ADD,
            precedence: Precedence.ADD_SUB,
            isRightAssociative: false
          });
          i++;
          break;
          
        case '-':
          this.tokens.push({
            type: TokenType.SUB,
            precedence: Precedence.ADD_SUB,
            isRightAssociative: false
          });
          i++;
          break;
          
        case '*':
          if (i + 1 < expression.length && expression[i + 1] === '*') {
            this.tokens.push({
              type: TokenType.POWER,
              precedence: Precedence.POWER,
              isRightAssociative: true
            });
            i += 2;
          } else {
            this.tokens.push({
              type: TokenType.MUL,
              precedence: Precedence.MUL_DIV,
              isRightAssociative: false
            });
            i++;
          }
          break;
          
        case '/':
          this.tokens.push({
            type: TokenType.DIV,
            precedence: Precedence.MUL_DIV,
            isRightAssociative: false
          });
          i++;
          break;
          
        case '(':
          this.tokens.push({
            type: TokenType.LEFTPAREN,
            precedence: Precedence.PAREN,
            isRightAssociative: false
          });
          i++;
          break;
          
        case ')':
          this.tokens.push({
            type: TokenType.RIGHTPAREN,
            precedence: Precedence.NONE,
            isRightAssociative: false
          });
          i++;
          break;
          
        default:
          if (char && char >= '0' && char <= '9') {
            let num = 0;
            while (i < expression.length) {
              const currentChar = expression[i];
              if (currentChar && currentChar >= '0' && currentChar <= '9') {
                num = num * 10 + (currentChar.charCodeAt(0) - '0'.charCodeAt(0));
                i++;
              } else {
                break;
              }
            }
            this.tokens.push({
              type: TokenType.NUMBER,
              value: num,
              precedence: Precedence.NONE,
              isRightAssociative: false
            });
          } else {
            throw new Error(`Unknown character: ${char}`);
          }
      }
    }
    
    // 添加结束标记
    this.tokens.push({
      type: TokenType.END,
      precedence: Precedence.NONE,
      isRightAssociative: false
    });
  }

  parseWithSteps(): StackStep[] {
    this.steps = [];
    this.stepCounter = 0;
    this.operatorStack = [];
    this.operandStack = [];
    this.currentIndex = 0;

    this.addStep('开始解析表达式...');

    while (this.currentIndex < this.tokens.length) {
      const token = this.tokens[this.currentIndex];
      
      if (!token) {
        throw new Error("Unexpected end of tokens");
      }
      
      if (token.type === TokenType.NUMBER) {
        // 操作数入栈
        if (token.value === undefined) {
          throw new Error("Number token missing value");
        }
        this.operandStack.push(token.value);
        this.addStep(`操作数 ${token.value} 入栈`);
        this.currentIndex++;
        
      } else if (token.type === TokenType.LEFTPAREN) {
        // 左括号入操作符栈
        this.operatorStack.push(token);
        this.addStep(`左括号入操作符栈`);
        this.currentIndex++;
        
      } else if (token.type === TokenType.RIGHTPAREN) {
        // 处理右括号：弹出操作符直到遇到左括号
        this.addStep(`遇到右括号，开始弹出操作符...`);
        this.processOperatorsUntilLeftParen();
        this.currentIndex++;
        
      } else if (token.type === TokenType.END) {
        // 处理结束：弹出所有操作符
        this.addStep(`表达式结束，处理剩余操作符...`);
        this.processAllOperators();
        break;
        
      } else {
        // 处理操作符
        this.processOperator(token);
        this.currentIndex++;
      }
    }

    // 解析完成，记录最终栈状态
    const finalAST = this.getFinalAST();
    this.addStep(`解析完成，最终AST: ${finalAST ? this.getASTDescription(finalAST) : '无'}`, undefined, undefined, undefined, finalAST || undefined);
    return this.steps;
  }

  private processOperator(currentToken: StackToken): void {
    this.addStep(`处理操作符: ${this.getTokenTypeName(currentToken.type)}`);
    
    // 用户理解的关键点1：新操作符如果遇到小于栈顶，则出栈
    while (this.operatorStack.length > 0) {
      const topOperator = this.operatorStack[this.operatorStack.length - 1];
      
      if (!topOperator) {
        throw new Error("Unexpected empty operator stack");
      }
      
      if (topOperator.type === TokenType.LEFTPAREN) {
        break; // 遇到左括号停止
      }
      
      // 用户理解的关键点2：优先级比较
      const topPrecedence = topOperator.precedence;
      const currentPrecedence = currentToken.precedence;
      
      // 对于左结合操作符，栈顶优先级需要+1来确保左结合
      const adjustedTopPrecedence = topOperator.isRightAssociative ? topPrecedence : topPrecedence + 1;
      
      this.addStep(`比较: 栈顶操作符 ${this.getTokenTypeName(topOperator.type)} 优先级=${adjustedTopPrecedence}, 当前操作符 ${this.getTokenTypeName(currentToken.type)} 优先级=${currentPrecedence}`);
      
      if (adjustedTopPrecedence > currentPrecedence) {
        // 栈顶操作符优先级更高，需要先处理
        this.executeTopOperator();
      } else if (adjustedTopPrecedence === currentPrecedence && !currentToken.isRightAssociative) {
        // 优先级相等且当前操作符是左结合，需要先处理栈顶
        this.executeTopOperator();
      } else {
        break; // 当前操作符优先级更高，或者优先级相等且当前操作符是右结合
      }
    }
    
    // 用户理解的关键点3：新操作符入栈
    this.operatorStack.push(currentToken);
    this.addStep(`操作符 ${this.getTokenTypeName(currentToken.type)} 入栈`);
  }

  private executeTopOperator(): void {
    if (this.operatorStack.length === 0) {
      throw new Error("操作符栈为空");
    }
    
    const operator = this.operatorStack.pop()!;
    
    if (this.operandStack.length < 2) {
      // 这种情况不应该发生，但为了演示，我们记录这个状态
      this.addStep(`尝试弹出操作符 ${this.getTokenTypeName(operator.type)}，但操作数不足 (栈中只有 ${this.operandStack.length} 个操作数)`);
      return;
    }
    
    const right = this.operandStack.pop()!;
    const left = this.operandStack.pop()!;
    
    // 记录弹出的操作符和操作数
    this.addStep(
      `弹出操作符 ${this.getTokenTypeName(operator.type)} 和操作数`,
      operator,
      { left, right }
    );
    
    // 生成AST节点
    const astNode = this.createASTNode(operator, left, right);
    
    // 如果操作符栈为空，说明这是最后一个操作，不需要再入栈
    if (this.operatorStack.length === 0) {
      this.finalAST = astNode; // 存储最终AST
      this.addStep(`生成最终AST节点: ${this.getASTDescription(astNode)}`, undefined, undefined, astNode);
    } else {
      // 将AST节点推回操作数栈
      this.operandStack.push(astNode);
      this.addStep(`生成AST节点并入栈: ${this.getASTDescription(astNode)}`, undefined, undefined, astNode);
    }
  }

  private createASTNode(operator: StackToken, left: number | ASTNode, right: number | ASTNode): ASTNode {
    // 将数字转换为AST节点
    const leftNode: ASTNode = typeof left === 'number' 
      ? { type: 'Number', value: left }
      : left;
    
    const rightNode: ASTNode = typeof right === 'number'
      ? { type: 'Number', value: right }
      : right;

    return {
      type: 'BinaryOp',
      operator: this.getOperatorSymbol(operator.type),
      left: leftNode,
      right: rightNode
    };
  }

  private getASTDescription(node: ASTNode): string {
    if (node.type === 'Number') {
      return node.value?.toString() || '0';
    } else if (node.type === 'BinaryOp') {
      return `(${this.getASTDescription(node.left!)} ${node.operator} ${this.getASTDescription(node.right!)})`;
    }
    return '?';
  }

  private processOperatorsUntilLeftParen(): void {
    while (this.operatorStack.length > 0) {
      const operator = this.operatorStack[this.operatorStack.length - 1];
      if (!operator) {
        throw new Error("Unexpected empty operator stack");
      }
      if (operator.type === TokenType.LEFTPAREN) {
        this.operatorStack.pop(); // 弹出左括号
        this.addStep(`左括号出栈`);
        break;
      }
      this.executeTopOperator();
    }
  }

  private processAllOperators(): void {
    while (this.operatorStack.length > 0) {
      this.executeTopOperator();
    }
  }

  private getTokenTypeName(tokenType: TokenType): string {
    switch (tokenType) {
      case TokenType.ADD: return 'ADD';
      case TokenType.SUB: return 'SUB';
      case TokenType.MUL: return 'MUL';
      case TokenType.DIV: return 'DIV';
      case TokenType.POWER: return 'POWER';
      case TokenType.LEFTPAREN: return 'LEFTPAREN';
      case TokenType.RIGHTPAREN: return 'RIGHTPAREN';
      case TokenType.NUMBER: return 'NUMBER';
      case TokenType.END: return 'END';
      default: return 'UNKNOWN';
    }
  }

  // 获取最终生成的AST
  public getFinalAST(): ASTNode | null {
    return this.finalAST;
  }

  private getOperatorSymbol(tokenType: TokenType): string {
    switch (tokenType) {
      case TokenType.ADD: return '+';
      case TokenType.SUB: return '-';
      case TokenType.MUL: return '*';
      case TokenType.DIV: return '/';
      case TokenType.POWER: return '**';
      default: return '';
    }
  }

  public parse(): StackStep[] {
    return this.parseWithSteps();
  }

  public getSteps(): StackStep[] {
    return this.steps;
  }
}

// 导出解析函数
export function parseExpressionWithStackSteps(expression: string): { steps: StackStep[]; parser: StackBasedBrowserParser; finalAST: ASTNode | null } {
  const parser = new StackBasedBrowserParser(expression);
  const steps = parser.parseWithSteps();
  const finalAST = parser.getFinalAST();
  return { steps, parser, finalAST };
}

export function parseExpressionWithStack(expression: string): { steps: StackStep[]; finalAST: ASTNode | null } {
  const parser = new StackBasedBrowserParser(expression);
  const steps = parser.parseWithSteps();
  const finalAST = parser.getFinalAST();
  return { steps, finalAST };
}
