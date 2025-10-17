/* 栈式优先级爬坡实现（改进的一元负号处理）
 * 目标：消除解析阶段的 isUnaryMinus 判断，将一元负号在词法阶段处理
 * 思路：当 '-' 出现在“可一元位置”（表达式开始、左括号后、二元运算符后），
 *       并且后面紧跟数字（允许空白），则将 "-<number>" 折叠为单个 NUMBER token。
 */

enum TokenType {
    NUMBER,
    ADD, SUB, MUL, DIV, POWER,
    LEFTPAREN, RIGHTPAREN,
    END
}

enum Precedence {
    NONE = 0,
    ADD_SUB = 1,
    MUL_DIV = 2,
    POWER = 3,
    PAREN = 4
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

        const isDigit = (ch: string | undefined): boolean => {
            return !!ch && ch >= '0' && ch <= '9';
        };

        const isUnaryPosition = (prev: Token | undefined): boolean => {
            if (!prev) return true; // 表达式开头
            switch (prev.type) {
                case TokenType.ADD:
                case TokenType.SUB:
                case TokenType.MUL:
                case TokenType.DIV:
                case TokenType.POWER:
                case TokenType.LEFTPAREN:
                    return true;
                default:
                    return false;
            }
        };

        while (i < expression.length) {
            // 跳过空白字符
            while (i < expression.length && /\s/.test(expression[i] || '')) i++;
            if (i >= expression.length) break;

            const ch = expression[i]!;
            const prevToken = this.tokens.length > 0 ? this.tokens[this.tokens.length - 1] : undefined;

            switch (ch) {
                case '+': {
                    this.tokens.push({ type: TokenType.ADD, precedence: Precedence.ADD_SUB, isRightAssociative: false });
                    i++;
                    break;
                }
                case '-': {
                    // 改进点：在词法阶段识别一元负号并直接折叠成负数 NUMBER
                    if (isUnaryPosition(prevToken)) {
                        // 向前看：跳过 '-' 后的空白，若紧跟数字序列，则读取为负数
                        let j = i + 1;
                        while (j < expression.length && /\s/.test(expression[j] || '')) j++;

                        if (j < expression.length && isDigit(expression[j])) {
                            // 读取数字部分
                            let num = 0;
                            while (j < expression.length && isDigit(expression[j])) {
                                const code = expression[j]!.charCodeAt(0) - '0'.charCodeAt(0);
                                num = num * 10 + code;
                                j++;
                            }
                            this.tokens.push({
                                type: TokenType.NUMBER,
                                value: -num,
                                precedence: Precedence.NONE,
                                isRightAssociative: false
                            });
                            i = j; // 消费 "-<spaces><digits>"
                            break;
                        }
                        // 若不是数字（例如 "-(...)")，则回退为二元减号，交由语法处理
                        // 注：该实现与 separated.ts 一致，仅支持 "-<number>" 的一元负号
                    }
                    // 作为二元减号
                    this.tokens.push({ type: TokenType.SUB, precedence: Precedence.ADD_SUB, isRightAssociative: false });
                    i++;
                    break;
                }
                case '*': {
                    if (i + 1 < expression.length && expression[i + 1] === '*') {
                        this.tokens.push({ type: TokenType.POWER, precedence: Precedence.POWER, isRightAssociative: true });
                        i += 2;
                    } else {
                        this.tokens.push({ type: TokenType.MUL, precedence: Precedence.MUL_DIV, isRightAssociative: false });
                        i++;
                    }
                    break;
                }
                case '/': {
                    this.tokens.push({ type: TokenType.DIV, precedence: Precedence.MUL_DIV, isRightAssociative: false });
                    i++;
                    break;
                }
                case '(': {
                    this.tokens.push({ type: TokenType.LEFTPAREN, precedence: Precedence.PAREN, isRightAssociative: false });
                    i++;
                    break;
                }
                case ')': {
                    this.tokens.push({ type: TokenType.RIGHTPAREN, precedence: Precedence.NONE, isRightAssociative: false });
                    i++;
                    break;
                }
                default: {
                    if (isDigit(ch)) {
                        let num = 0;
                        while (i < expression.length && isDigit(expression[i])) {
                            const code = expression[i]!.charCodeAt(0) - '0'.charCodeAt(0);
                            num = num * 10 + code;
                            i++;
                        }
                        this.tokens.push({ type: TokenType.NUMBER, value: num, precedence: Precedence.NONE, isRightAssociative: false });
                    } else {
                        throw new Error(`Unknown character: ${ch}`);
                    }
                    break;
                }
            }
        }

        // 添加结束标记
        this.tokens.push({ type: TokenType.END, precedence: Precedence.NONE, isRightAssociative: false });
    }

    parse(): number {
        console.log("开始解析表达式...");
        console.log(
            "Token序列:",
            this.tokens.map(t => (t.type === TokenType.NUMBER ? t.value : TokenType[t.type]))
        );

        while (this.currentIndex < this.tokens.length) {
            const token = this.tokens[this.currentIndex];
            if (!token) throw new Error("Unexpected end of tokens");

            if (token.type === TokenType.NUMBER) {
                if (token.value === undefined) throw new Error("Number token missing value");
                this.operandStack.push(token.value);
                console.log(`操作数 ${token.value} 入栈`);
                console.log(`操作数栈: [${this.operandStack.join(', ')}]`);
                this.currentIndex++;
                continue;
            }

            if (token.type === TokenType.LEFTPAREN) {
                this.operatorStack.push(token);
                console.log(`左括号入操作符栈`);
                console.log(`操作符栈: [${this.operatorStack.map(t => TokenType[t.type]).join(', ')}]`);
                this.currentIndex++;
                continue;
            }

            if (token.type === TokenType.RIGHTPAREN) {
                console.log(`遇到右括号，开始弹出操作符...`);
                this.processOperatorsUntilLeftParen();
                this.currentIndex++;
                continue;
            }

            if (token.type === TokenType.END) {
                console.log(`表达式结束，处理剩余操作符...`);
                this.processAllOperators();
                break;
            }

            // 其余均为二元操作符
            this.processOperator(token);
            this.currentIndex++;
        }

        if (this.operandStack.length !== 1) throw new Error("解析错误：操作数栈中应该只有一个结果");
        const result = this.operandStack[0];
        if (result === undefined) throw new Error("解析错误：结果为空");
        return result;
    }

    private processOperator(currentToken: Token): void {
        console.log(`\n处理操作符: ${TokenType[currentToken.type]}`);

        while (this.operatorStack.length > 0) {
            const topOperator = this.operatorStack[this.operatorStack.length - 1]!;
            if (topOperator.type === TokenType.LEFTPAREN) break;

            const topPrecedence = topOperator.precedence + (topOperator.isRightAssociative ? 0 : 1);
            const currentPrecedence = currentToken.precedence;

            console.log(
                `比较: 栈顶操作符 ${TokenType[topOperator.type]} 优先级=${topPrecedence}, 当前操作符 ${TokenType[currentToken.type]} 优先级=${currentPrecedence}`
            );

            if (topPrecedence > currentPrecedence) {
                this.executeTopOperator();
            } else {
                break;
            }
        }

        this.operatorStack.push(currentToken);
        console.log(`操作符 ${TokenType[currentToken.type]} 入栈`);
        console.log(`操作符栈: [${this.operatorStack.map(t => TokenType[t.type]).join(', ')}]`);
    }

    private executeTopOperator(): void {
        if (this.operatorStack.length === 0) throw new Error("操作符栈为空");
        const operator = this.operatorStack.pop()!;

        if (this.operandStack.length < 2) throw new Error("操作数不足");
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
            const operator = this.operatorStack[this.operatorStack.length - 1]!;
            if (operator.type === TokenType.LEFTPAREN) {
                this.operatorStack.pop();
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
}

// 测试函数
function testStackBasedParser() {
    const testCases = [
        "1 + (-1)",
        "2 + 3 * 4",
        "2 * 3 + 4",
        "2 ** 3 ** 2",
        "(2 + 3) * 4",
        "2 + 3 * 4 - 5",
        "2 ** 3 + 4 * 5 - 6",
        "2 + 3 ** 4 ** 2 - 5 * 6",
        "2 ** 3 ** 2 + 4 * 5 - 6 / 2",
        "-1 + 2 * 3",
        "1 + -2",
        "1 - -2",
        "-   7 + 1", // 带空白的一元负号
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
