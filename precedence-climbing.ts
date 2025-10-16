/* 优先级爬升（Precedence Climbing）方法实现
 * 基于现有工作代码，使用单一函数处理所有二元操作符的优先级
 */

// --- 复用现有的词法分析器 ---
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
    POWER = 3      // 指数运算
}

let src: string = "";
let numberVal: number = 0;
let current: number = 0;
let token: TokenType;

function getToken(): void {
    while (current < src.length && /\s/.test(src[current] || '')) {
        current++;
    }
    
    if (current >= src.length) {
        token = TokenType.END;
        return;
    }

    switch (src[current]) {
        case '+':
            token = TokenType.ADD;
            current++;
            return;
        case '-':
            token = TokenType.SUB;
            current++;
            return;
        case '*':
            if (current + 1 < src.length && src[current + 1] === '*') {
                token = TokenType.POWER;
                current += 2;
                return;
            } else {
                token = TokenType.MUL;
                current++;
                return;
            }
        case '/':
            token = TokenType.DIV;
            current++;
            return;
        case '(':
            token = TokenType.LEFTPAREN;
            current++;
            return;
        case ')':
            token = TokenType.RIGHTPAREN;
            current++;
            return;
        default:
            const currentChar = src[current];
            if (currentChar && currentChar >= '0' && currentChar <= '9') {
                numberVal = 0;
                while (current < src.length) {
                    const char = src[current];
                    if (char && char >= '0' && char <= '9') {
                        numberVal = numberVal * 10 + (char.charCodeAt(0) - '0'.charCodeAt(0));
                        current++;
                    } else {
                        break;
                    }
                }
                token = TokenType.NUMBER;
                return;
            } else {
                throw new Error("Unknown token");
            }
    }
}

// --- 优先级爬升解析器 ---
function parseExpression(minPrecedence: Precedence = Precedence.NONE): number {
    let left = parsePrimary();
    
    while (true) {
        const currentToken = token;
        const precedence = getPrecedence(currentToken);
        
        if (precedence < minPrecedence || precedence === Precedence.NONE) {
            break;
        }
        
        getToken(); // 消费操作符
        
        const rightMinPrecedence = precedence + (isRightAssociative(currentToken) ? 0 : 1);
        const right = parseExpression(rightMinPrecedence);
        
        left = executeOperation(currentToken, left, right);
    }
    
    return left;
}

function parsePrimary(): number {
    switch (token) {
        case TokenType.NUMBER:
            const value = numberVal;
            getToken();
            return value;
            
        case TokenType.SUB:
            getToken();
            if (token as TokenType !== TokenType.NUMBER) {
                throw new Error("Negative not a number");
            }
            const negValue = -numberVal;
            getToken();
            return negValue;
            
        case TokenType.LEFTPAREN:
            getToken();
            const expr = parseExpression(Precedence.NONE);
            if (token as TokenType !== TokenType.RIGHTPAREN) {
                throw new Error("Right paren loss");
            }
            getToken();
            return expr;
            
        default:
            throw new Error("Illegal primary expr");
    }
}

function getPrecedence(token: TokenType): Precedence {
    switch (token) {
        case TokenType.ADD:
        case TokenType.SUB:
            return Precedence.ADD_SUB;
        case TokenType.MUL:
        case TokenType.DIV:
            return Precedence.MUL_DIV;
        case TokenType.POWER:
            return Precedence.POWER;
        default:
            return Precedence.NONE;
    }
}

function isRightAssociative(token: TokenType): boolean {
    return token === TokenType.POWER;
}

function executeOperation(op: TokenType, left: number, right: number): number {
    switch (op) {
        case TokenType.ADD:
            return left + right;
        case TokenType.SUB:
            return left - right;
        case TokenType.MUL:
            return left * right;
        case TokenType.DIV:
            if (right === 0) throw new Error("Divide zero");
            return Math.floor(left / right);
        case TokenType.POWER:
            return Math.pow(left, right);
        default:
            throw new Error("Unknown operator");
    }
}

// --- 主程序 ---
function main(): void {
    console.log("优先级爬升解析器演示");
    console.log("输入表达式，将计算结果");
    console.log("输入 'exit' 退出");
    
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', (data) => {
        const input = data.toString().trim();
        
        if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
            console.log("Goodbye! 👋");
            process.exit(0);
        }
        
        if (input === '') {
            console.log("请输入表达式:");
            return;
        }
        
        
        src = input;
        current = 0;
        numberVal = 0;
        
        try {
            getToken();
            const result = parseExpression();
            console.log(`\n=== 计算结果 ===`);
            console.log(result);
            
        } catch (error) {
            console.log("错误:", error);
        }
        
        console.log("\n输入表达式 (或 'exit' 退出):");
    });
}

// 运行主程序
main();
