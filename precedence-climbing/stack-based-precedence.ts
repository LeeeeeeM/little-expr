/* 栈式优先级爬坡实现 - 基于 separated.ts
 * 使用操作符栈和操作数栈实现可视化解析过程
 */

// --- AST节点类型定义 ---
interface ASTNode {
    type: string;
}

interface NumberNode extends ASTNode {
    type: 'Number';
    value: number;
}

interface BinaryOpNode extends ASTNode {
    type: 'BinaryOp';
    operator: string;
    left: ASTNode;
    right: ASTNode;
}

// --- 词法分析器 ---
enum TokenType {
    NUMBER,
    ADD, SUB, MUL, DIV, POWER,
    LEFTPAREN, RIGHTPAREN,
    END
}

// --- 优先级枚举 ---
enum Precedence {
    NONE = 0,      // 无优先级（END token）
    ADD_SUB = 1,   // 加减运算
    MUL_DIV = 2,   // 乘除运算
    POWER = 3,     // 指数运算
    PAREN = 4      // 括号优先级（最高）
}

interface Token {
    type: TokenType;
    value?: number;
    precedence: Precedence;
    isRightAssociative: boolean;
}

class StackBasedParser {
    private operatorStack: Token[] = [];
    private operandStack: number[] = [];
    private tokens: Token[] = [];
    private currentIndex = 0;

    constructor(expression: string) {
        this.tokenize(expression);
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

    parse(): number {
        console.log("开始解析表达式...");
        console.log("Token序列:", this.tokens.map(t => 
            t.type === TokenType.NUMBER ? t.value : TokenType[t.type]
        ));

        // 使用操作符栈和操作数栈进行解析
        while (this.currentIndex < this.tokens.length) {
            const token = this.tokens[this.currentIndex];
            
            if (!token) {
                throw new Error("Unexpected end of tokens");
            }
            
            if (token.type === TokenType.NUMBER) {
                this.operandStack.push(token.value!);
                console.log(`操作数 ${token.value} 入栈`);
                console.log(`操作数栈: [${this.operandStack.join(', ')}]`);
                this.currentIndex++;
                
            } else if (token.type === TokenType.SUB && this.isUnaryMinus()) {
                // 处理一元负号
                this.currentIndex++;
                const nextToken = this.tokens[this.currentIndex];
                if (!nextToken || nextToken.type !== TokenType.NUMBER) {
                    throw new Error("一元负号后必须是数字");
                }
                const negValue = -nextToken.value!;
                this.operandStack.push(negValue);
                console.log(`一元负号: -${nextToken.value} = ${negValue} 入栈`);
                console.log(`操作数栈: [${this.operandStack.join(', ')}]`);
                this.currentIndex++;
                
            } else if (token.type === TokenType.LEFTPAREN) {
                this.operatorStack.push(token);
                console.log(`左括号入操作符栈`);
                console.log(`操作符栈: [${this.operatorStack.map(t => TokenType[t.type]).join(', ')}]`);
                this.currentIndex++;
                
            } else if (token.type === TokenType.RIGHTPAREN) {
                console.log(`遇到右括号，开始弹出操作符...`);
                this.processOperatorsUntilLeftParen();
                this.currentIndex++;
                
            } else if (token.type === TokenType.END) {
                console.log(`表达式结束，处理剩余操作符...`);
                this.processAllOperators();
                break;
                
            } else {
                // 处理操作符
                this.processOperator(token);
                this.currentIndex++;
            }
        }

        if (this.operandStack.length !== 1) {
            throw new Error("解析错误：操作数栈中应该只有一个结果");
        }

        const result = this.operandStack[0];
        if (result === undefined) {
            throw new Error("解析错误：结果为空");
        }
        return result;
    }

    // 栈式解析方法
    private processOperator(currentToken: Token): void {
        console.log(`\n处理操作符: ${TokenType[currentToken.type]}`);
        
        while (this.operatorStack.length > 0) {
            const topOperator = this.operatorStack[this.operatorStack.length - 1];
            
            if (!topOperator) {
                throw new Error("Unexpected empty operator stack");
            }
            
            if (topOperator.type === TokenType.LEFTPAREN) {
                break; // 遇到左括号停止
            }
            
            // 左结合操作符优先级+1
            const topPrecedence = topOperator.precedence + (topOperator.isRightAssociative ? 0 : 1);
            const currentPrecedence = currentToken.precedence;
            
            console.log(`比较: 栈顶操作符 ${TokenType[topOperator.type]} 优先级=${topPrecedence}, 当前操作符 ${TokenType[currentToken.type]} 优先级=${currentPrecedence}`);
            
            if (topPrecedence > currentPrecedence) {
                // 栈顶操作符优先级更高，需要先计算
                this.executeTopOperator();
            } else {
                break; // 当前操作符优先级更高或相等，可以入栈
            }
        }
        
        // 新操作符入栈
        this.operatorStack.push(currentToken);
        console.log(`操作符 ${TokenType[currentToken.type]} 入栈`);
        console.log(`操作符栈: [${this.operatorStack.map(t => TokenType[t.type]).join(', ')}]`);
    }

    private executeTopOperator(): void {
        if (this.operatorStack.length === 0) {
            throw new Error("操作符栈为空");
        }
        
        const operator = this.operatorStack.pop()!;
        
        if (this.operandStack.length < 2) {
            throw new Error("操作数不足");
        }
        
        const right = this.operandStack.pop()!;
        const left = this.operandStack.pop()!;
        
        let result: number;
        switch (operator.type) {
            case TokenType.ADD:
                result = left + right;
                break;
            case TokenType.SUB:
                result = left - right;
                break;
            case TokenType.MUL:
                result = left * right;
                break;
            case TokenType.DIV:
                if (right === 0) throw new Error("除零错误");
                result = Math.floor(left / right);
                break;
            case TokenType.POWER:
                result = Math.pow(left, right);
                break;
            default:
                throw new Error(`未知操作符: ${TokenType[operator.type]}`);
        }
        
        this.operandStack.push(result);
        console.log(`执行 ${left} ${TokenType[operator.type]} ${right} = ${result}`);
        console.log(`操作数栈: [${this.operandStack.join(', ')}]`);
    }

    private processOperatorsUntilLeftParen(): void {
        while (this.operatorStack.length > 0) {
            const operator = this.operatorStack[this.operatorStack.length - 1];
            if (!operator) {
                throw new Error("Unexpected empty operator stack");
            }
            if (operator.type === TokenType.LEFTPAREN) {
                this.operatorStack.pop(); // 弹出左括号
                console.log(`左括号出栈`);
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

    private isUnaryMinus(): boolean {
        // 检查是否是一元负号：
        // 1. 操作数栈为空（表达式开头）
        // 2. 或者栈顶是左括号（括号内开头）
        return this.operandStack.length === 0 || 
               (this.operatorStack.length > 0 && 
                this.operatorStack[this.operatorStack.length - 1]?.type === TokenType.LEFTPAREN);
    }



}

// 测试函数
function testStackBasedParser() {
    const testCases = [
        "1 + 2 * 4 * 3 ** 2 ** 2 + 100",
        "1 + (-1)",
        "2 + 3 * 4",
        "2 * 3 + 4",
        "2 ** 3 ** 2",
        "(2 + 3) * 4",
        "2 + 3 * 4 - 5",
        "2 ** 3 + 4 * 5 - 6",
        "2 + 3 ** 4 ** 2 - 5 * 6",
        "2 ** 3 ** 2 + 4 * 5 - 6 / 2",
        "-1 + 2 * 3"
    ];

    testCases.forEach(expression => {
        console.log(`\n=== 测试表达式: ${expression} ===`);
        try {
            const parser = new StackBasedParser(expression);
            const result = parser.parse();
            console.log(`结果: ${result}`);
        } catch (error) {
            console.log(`错误: ${error}`);
        }
        console.log("=".repeat(50));
    });
}

// 运行测试
testStackBasedParser();
