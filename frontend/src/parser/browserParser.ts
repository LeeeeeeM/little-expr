// 浏览器版本的表达式解析器
export interface Token {
  type: TokenType;
  value: string;
  position: number;
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

export interface ASTNode {
  type: string;
  value?: number;
  operator?: string;
  left?: ASTNode;
  right?: ASTNode;
}

export interface ParseStep {
  step: number;
  description: string;
  ast: ASTNode | null;
  pendingNodes: ASTNode[]; // 等待插入的节点（上方新增区域）
  canvasNodes: ASTNode[]; // 画布上的节点
  currentToken: string;
  position: number;
}

export class BrowserParser {
  private input: string;
  private current: number = 0;
  private token: TokenType = TokenType.END;
  private numberVal: number = 0;
  private steps: ParseStep[] = [];
  private stepCounter: number = 0;
  private pendingNodes: ASTNode[] = []; // 等待插入的节点

  constructor(input: string) {
    this.input = input.trim();
    this.getToken();
  }

  private addStep(description: string, ast: ASTNode | null = null, canvasNodes: ASTNode[] = []): void {
    this.stepCounter++;
    this.steps.push({
      step: this.stepCounter,
      description,
      ast: ast ? JSON.parse(JSON.stringify(ast)) : null, // 深拷贝
      pendingNodes: JSON.parse(JSON.stringify(this.pendingNodes)), // 深拷贝等待节点
      canvasNodes: JSON.parse(JSON.stringify(canvasNodes)), // 深拷贝画布节点
      currentToken: this.getTokenDescription(),
      position: this.current
    });
  }

  private getTokenDescription(): string {
    switch (this.token) {
      case TokenType.NUMBER: return `数字 ${this.numberVal}`;
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

  private getToken(): void {
    // 跳过空白字符
    while (this.current < this.input.length && /\s/.test(this.input[this.current])) {
      this.current++;
    }

    if (this.current >= this.input.length) {
      this.token = TokenType.END;
      return;
    }

    const char = this.input[this.current];

    if (/\d/.test(char)) {
      let numStr = '';
      while (this.current < this.input.length && /\d/.test(this.input[this.current])) {
        numStr += this.input[this.current];
        this.current++;
      }
      this.numberVal = parseInt(numStr, 10);
      this.token = TokenType.NUMBER;
    } else {
      this.current++;
      switch (char) {
        case '+': this.token = TokenType.ADD; break;
        case '-': this.token = TokenType.SUB; break;
        case '*': 
          if (this.current < this.input.length && this.input[this.current] === '*') {
            this.current++;
            this.token = TokenType.POWER;
          } else {
            this.token = TokenType.MUL;
          }
          break;
        case '/': this.token = TokenType.DIV; break;
        case '(': this.token = TokenType.LEFTPAREN; break;
        case ')': this.token = TokenType.RIGHTPAREN; break;
        default:
          throw new Error(`意外的字符: ${char}`);
      }
    }
  }

  private getPrecedence(token: TokenType): Precedence {
    switch (token) {
      case TokenType.ADD:
      case TokenType.SUB:
        return Precedence.ADD_SUB;
      case TokenType.MUL:
      case TokenType.DIV:
        return Precedence.MUL_DIV;
      case TokenType.POWER:
        return Precedence.POWER;
      case TokenType.LEFTPAREN:
        return Precedence.PAREN;
      default:
        return Precedence.NONE;
    }
  }

  // 增量解析方法
  parseIncremental(): ParseStep[] {
    this.steps = [];
    this.stepCounter = 0;
    this.pendingNodes = [];
    let currentAST: ASTNode | null = null;
    let canvasNodes: ASTNode[] = []; // 画布上的节点
    let numberStack: ASTNode[] = []; // 数字节点栈，用于构建运算
    
    this.addStep('开始解析表达式', currentAST, canvasNodes);
    
    while (this.token !== TokenType.END) {
      if (this.token === TokenType.NUMBER) {
        // 解析数字 - 直接添加到画布
        const value = this.numberVal;
        this.addStep(`解析数字: ${value}`, currentAST, canvasNodes);
        
        const numberNode = { type: 'Number', value };
        canvasNodes.push(numberNode);
        numberStack.push(numberNode);
        
        // 如果当前AST为空，数字成为根节点
        if (!currentAST) {
          currentAST = numberNode;
          this.addStep(`数字 ${value} 成为根节点`, currentAST, canvasNodes);
        } else {
          // 数字添加到画布中（作为独立节点）
          this.addStep(`数字 ${value} 添加到画布`, currentAST, canvasNodes);
          console.log(`DEBUG: 数字 ${value} 添加到画布，canvasNodes:`, canvasNodes);
        }
        
        this.getToken();
      } else if (this.token === TokenType.ADD || this.token === TokenType.SUB || 
                 this.token === TokenType.MUL || this.token === TokenType.DIV || 
                 this.token === TokenType.POWER) {
        // 解析运算符 - 添加到等待区域
        const operator = this.getOperatorSymbol(this.token);
        const precedence = this.getPrecedence(this.token);
        
        this.addStep(`解析运算符: ${operator}，优先级: ${precedence}`, currentAST, canvasNodes);
        
        // 处理运算符优先级
        const result = this.processOperator(operator, precedence, currentAST, canvasNodes, numberStack);
        currentAST = result.ast;
        canvasNodes = result.canvasNodes;
        numberStack = result.numberStack;
        
        this.getToken();
      } else if (this.token === TokenType.LEFTPAREN) {
        this.addStep('遇到左括号', currentAST, canvasNodes);
        this.getToken();
        // 处理括号表达式
        const result = this.processParentheses(currentAST);
        currentAST = result.ast;
      } else if (this.token === TokenType.RIGHTPAREN) {
        this.addStep('遇到右括号', currentAST, canvasNodes);
        this.getToken();
      }
    }
    
    // 处理剩余的等待节点
    const finalResult = this.finalizePendingNodes(currentAST, canvasNodes, numberStack);
    currentAST = finalResult.ast;
    canvasNodes = finalResult.canvasNodes;
    
    this.addStep('解析完成', currentAST, canvasNodes);
    return this.steps;
  }
  
  private processOperator(operator: string, precedence: number, currentAST: ASTNode | null, canvasNodes: ASTNode[], numberStack: ASTNode[]): { ast: ASTNode | null; canvasNodes: ASTNode[]; numberStack: ASTNode[] } {
    const operatorNode = { type: 'BinaryOp', operator };
    
    // 检查是否需要弹出等待区域的节点
    while (this.pendingNodes.length > 0) {
      const lastNode = this.pendingNodes[this.pendingNodes.length - 1];
      if (lastNode && lastNode.type === 'BinaryOp') {
        const lastPrecedence = this.getPrecedence(this.getTokenFromOperator(lastNode.operator!));
        if (precedence <= lastPrecedence) {
          // 弹出运算符并构建AST
          this.pendingNodes.pop();
          const result = this.buildASTFromPending(currentAST, canvasNodes, numberStack);
          currentAST = result.ast;
          canvasNodes = result.canvasNodes;
          numberStack = result.numberStack;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    
    this.pendingNodes.push(operatorNode);
    this.addStep(`运算符 ${operator} 添加到等待区域`, currentAST, canvasNodes);
    console.log(`DEBUG: 运算符 ${operator} 添加到等待区域，canvasNodes:`, canvasNodes);
    
    return { ast: currentAST, canvasNodes, numberStack };
  }
  
  private processParentheses(currentAST: ASTNode | null): { ast: ASTNode | null } {
    // 简化处理：在括号内继续解析
    while (this.token !== TokenType.RIGHTPAREN && this.token !== TokenType.END) {
      if (this.token === TokenType.NUMBER) {
        const value = this.numberVal;
        this.addStep(`括号内解析数字: ${value}`, currentAST);
        this.getToken();
      } else if (this.token === TokenType.ADD || this.token === TokenType.SUB || 
                 this.token === TokenType.MUL || this.token === TokenType.DIV || 
                 this.token === TokenType.POWER) {
        const operator = this.getOperatorSymbol(this.token);
        const precedence = this.getPrecedence(this.token);
        const result = this.processOperator(operator, precedence, currentAST, [], []);
        currentAST = result.ast;
        this.getToken();
      }
    }
    
    return { ast: currentAST };
  }
  
  private buildASTFromPending(currentAST: ASTNode | null, canvasNodes: ASTNode[], numberStack: ASTNode[]): { ast: ASTNode | null; canvasNodes: ASTNode[]; numberStack: ASTNode[] } {
    if (this.pendingNodes.length >= 1) {
      const operator = this.pendingNodes.pop()!;
      
      // 从数字栈中获取最后一个数字作为右操作数
      const rightNumber = numberStack.pop();
      console.log(`DEBUG: canvasNodes 内容:`, canvasNodes);
      console.log(`DEBUG: numberStack 内容:`, numberStack);
      console.log(`DEBUG: rightNumber:`, rightNumber);
      
      // 创建新的运算节点
      const binaryNode: ASTNode = {
        type: 'BinaryOp',
        operator: operator.operator,
        left: currentAST || undefined,
        right: rightNumber || undefined
      };
      
      // 从画布中移除已使用的数字节点
      if (rightNumber) {
        const index = canvasNodes.indexOf(rightNumber);
        if (index > -1) {
          canvasNodes.splice(index, 1);
        }
      }
      
      // 将运算节点添加到画布
      canvasNodes.push(binaryNode);
      
      this.addStep(`构建运算: ${currentAST ? this.getNodeValue(currentAST) : 'null'} ${operator.operator} ${rightNumber ? this.getNodeValue(rightNumber) : 'null'}`, binaryNode, canvasNodes);
      console.log(`DEBUG: 构建运算 ${operator.operator}，左操作数:`, currentAST, '右操作数:', rightNumber, '结果:', binaryNode);
      
      return { ast: binaryNode, canvasNodes, numberStack };
    }
    
    return { ast: currentAST, canvasNodes, numberStack };
  }
  
  private finalizePendingNodes(currentAST: ASTNode | null, canvasNodes: ASTNode[], numberStack: ASTNode[]): { ast: ASTNode | null; canvasNodes: ASTNode[] } {
    while (this.pendingNodes.length >= 1) {
      const result = this.buildASTFromPending(currentAST, canvasNodes, numberStack);
      currentAST = result.ast;
      canvasNodes = result.canvasNodes;
      numberStack = result.numberStack;
    }
    
    if (currentAST) {
      this.addStep('完成AST构建', currentAST, canvasNodes);
    }
    
    return { ast: currentAST, canvasNodes };
  }
  
  private getTokenFromOperator(operator: string): TokenType {
    switch (operator) {
      case '+': return TokenType.ADD;
      case '-': return TokenType.SUB;
      case '*': return TokenType.MUL;
      case '/': return TokenType.DIV;
      case '**': return TokenType.POWER;
      default: return TokenType.END;
    }
  }

  private parseExpression(minPrecedence: Precedence): ASTNode {
    this.addStep(`开始解析表达式，最小优先级: ${minPrecedence}`, null);
    
    let left = this.parsePrimary();
    this.addStep(`解析左操作数完成: ${this.getNodeValue(left)}`, left);

    while (true) {
      const currentToken = this.token;
      const precedence = this.getPrecedence(currentToken);

      if (precedence < minPrecedence || precedence === Precedence.NONE) {
        this.addStep(`遇到优先级 ${precedence} 的操作符，低于最小优先级 ${minPrecedence}，退出循环`, left);
        break;
      }

      const operator = this.getOperatorSymbol(currentToken);
      this.addStep(`遇到运算符: ${operator}，优先级: ${precedence}，开始处理`, left);

      this.getToken();

      if (currentToken === TokenType.POWER) {
        // 右结合
        this.addStep('处理指数运算（右结合），递归解析右操作数', left);
        const right = this.parseExpression(precedence);
        const newNode = {
          type: 'BinaryOp',
          operator: '**',
          left,
          right
        };
        left = newNode;
        this.addStep(`完成指数运算: ${this.getNodeValue(left.left!)} ** ${this.getNodeValue(left.right!)}`, left);
      } else {
        // 左结合
        this.addStep(`处理${operator}运算（左结合），递归解析右操作数`, left);
        const right = this.parseExpression(precedence + 1);
        const newNode = {
          type: 'BinaryOp',
          operator: operator,
          left,
          right
        };
        left = newNode;
        this.addStep(`完成${operator}运算: ${this.getNodeValue(left.left!)} ${operator} ${this.getNodeValue(left.right!)}`, left);
      }
    }

    this.addStep(`解析完成，返回结果: ${this.getNodeValue(left)}`, left);
    return left;
  }

  private parsePrimary(): ASTNode {
    if (this.token === TokenType.NUMBER) {
      const value = this.numberVal;
      this.addStep(`解析数字: ${value}`);
      this.getToken();
      const node = { type: 'Number', value };
      this.addStep(`创建数字节点: ${value}`, node);
      return node;
    } else if (this.token === TokenType.LEFTPAREN) {
      this.addStep('遇到左括号，开始解析括号内表达式');
      this.getToken();
      const expr = this.parseExpression(Precedence.NONE);
      // 检查当前token是否为右括号
      if ((this.token as TokenType) !== TokenType.RIGHTPAREN) {
        throw new Error('期望右括号');
      }
      this.addStep('遇到右括号，完成括号表达式解析', expr);
      this.getToken();
      return expr;
    } else {
      throw new Error('期望数字或左括号');
    }
  }

  private getNodeValue(node: ASTNode | null | undefined): string {
    if (!node) return 'null';
    if (node.type === 'Number') {
      return node.value?.toString() || '0';
    } else if (node.type === 'BinaryOp') {
      return `(${this.getNodeValue(node.left)} ${node.operator} ${this.getNodeValue(node.right)})`;
    }
    return '?';
  }

  private getOperatorSymbol(token: TokenType): string {
    switch (token) {
      case TokenType.ADD: return '+';
      case TokenType.SUB: return '-';
      case TokenType.MUL: return '*';
      case TokenType.DIV: return '/';
      case TokenType.POWER: return '**';
      default: return '';
    }
  }

  public parse(): ASTNode {
    this.addStep('开始解析表达式', null);
    const ast = this.parseExpression(Precedence.NONE);
    if (this.token !== TokenType.END) {
      throw new Error('表达式解析不完整');
    }
    this.addStep('解析完成，生成最终AST树', ast);
    return ast;
  }

  public getSteps(): ParseStep[] {
    return this.steps;
  }

  public getStepCount(): number {
    return this.steps.length;
  }

  public evaluate(ast: ASTNode): number {
    if (ast.type === 'Number') {
      return ast.value || 0;
    } else if (ast.type === 'BinaryOp') {
      const left = this.evaluate(ast.left!);
      const right = this.evaluate(ast.right!);
      
      switch (ast.operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': 
          if (right === 0) throw new Error('除零错误');
          return left / right;
        case '**': return Math.pow(left, right);
        default: throw new Error(`未知运算符: ${ast.operator}`);
      }
    }
    throw new Error('未知的AST节点类型');
  }
}

// 导出解析函数
export function parseExpression(expression: string): ASTNode {
  const parser = new BrowserParser(expression);
  return parser.parse();
}

export function parseExpressionWithSteps(expression: string): { ast: ASTNode | null; steps: ParseStep[] } {
  const parser = new BrowserParser(expression);
  const steps = parser.parseIncremental();
  const ast = steps[steps.length - 1]?.ast || null;
  return { ast, steps };
}

export function evaluateExpression(expression: string): number {
  const parser = new BrowserParser(expression);
  const ast = parser.parse();
  return parser.evaluate(ast);
}
