/* 优先级爬升（Precedence Climbing）方法实现 - 分离版本
 * 使用单一函数处理所有二元操作符的优先级
 * 支持AST构建和汇编代码生成
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

// --- 优先级爬升解析器（构建AST） ---
function parseExpression(minPrecedence: Precedence = Precedence.NONE): ASTNode {
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
        
        left = createBinaryNode(currentToken, left, right);
    }
    
    return left;
}

function parsePrimary(): ASTNode {
    switch (token) {
        case TokenType.NUMBER:
            const value = numberVal;
            getToken();
            return { type: 'Number', value } as NumberNode;
            
        case TokenType.SUB:
            getToken();
            if (token as TokenType !== TokenType.NUMBER) {
                throw new Error("Negative not a number");
            }
            const negValue = -numberVal;
            getToken();
            return { type: 'Number', value: negValue } as NumberNode;
            
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

function createBinaryNode(operator: TokenType, left: ASTNode, right: ASTNode): BinaryOpNode {
    const operatorMap: Map<TokenType, string> = new Map([
        [TokenType.ADD, '+'],
        [TokenType.SUB, '-'],
        [TokenType.MUL, '*'],
        [TokenType.DIV, '/'],
        [TokenType.POWER, '**']
    ]);
    
    return {
        type: 'BinaryOp',
        operator: operatorMap.get(operator) || 'unknown',
        left,
        right
    };
}

// --- AST求值器 ---
function evaluateAST(node: ASTNode): number {
    switch (node.type) {
        case 'Number':
            return (node as NumberNode).value;
            
        case 'BinaryOp':
            const binNode = node as BinaryOpNode;
            const left = evaluateAST(binNode.left);
            const right = evaluateAST(binNode.right);
            
            switch (binNode.operator) {
                case '+': return left + right;
                case '-': return left - right;
                case '*': return left * right;
                case '/': 
                    if (right === 0) throw new Error("Divide zero");
                    return Math.floor(left / right);
                case '**': return Math.pow(left, right);
                default: throw new Error("Unknown operator");
            }
            
        default:
            throw new Error("Unknown node type");
    }
}

// --- 汇编代码生成器 ---
class AssemblyGenerator {
    private tempCounter = 0;
    private instructions: string[] = [];
    
    private newTemp(): string {
        return `t${this.tempCounter++}`;
    }
    
    generate(node: ASTNode): string {
        this.tempCounter = 0;
        this.instructions = [];
        
        this.generateNode(node);
        this.instructions.push('ret');
        
        return this.instructions.join('\n');
    }
    
    private generateNode(node: ASTNode): void {
        switch (node.type) {
            case 'Number':
                const numNode = node as NumberNode;
                this.instructions.push(`mov eax, ${numNode.value}`);
                break;
                
            case 'BinaryOp':
                const binNode = node as BinaryOpNode;
                
                // 递归生成左操作数到eax
                this.generateNode(binNode.left);
                
                // 保存左操作数结果
                const temp = this.newTemp();
                this.instructions.push(`mov ${temp}, eax`);
                
                // 生成右操作数到eax
                this.generateNode(binNode.right);
                
                // 将左操作数恢复到ebx
                this.instructions.push(`mov ebx, ${temp}`);
                
                // 执行运算
                switch (binNode.operator) {
                    case '+':
                        this.instructions.push(`add eax, ebx`);
                        break;
                    case '-':
                        this.instructions.push(`sub eax, ebx`);
                        break;
                    case '*':
                        this.instructions.push(`imul eax, ebx`);
                        break;
                    case '/':
                        this.instructions.push(`cdq`); // 符号扩展到edx
                        this.instructions.push(`idiv ebx`);
                        break;
                    case '**':
                        // 简单的幂运算实现（实际中可能需要更复杂的实现）
                        this.instructions.push(`call power_function`);
                        break;
                }
                break;
                
            default:
                throw new Error("Unknown node type");
        }
    }
}

// --- 主程序 ---
function main(): void {
    console.log("优先级爬升解析器演示 - 分离版本");
    console.log("输入表达式，将生成AST和汇编代码");
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
            // 1. 词法分析
            getToken();
            
            // 2. 语法分析 - 使用优先级爬升构建AST
            const ast = parseExpression();
            console.log("\n=== AST结构 ===");
            console.log(JSON.stringify(ast, null, 2));
            
            // 3. 验证AST - 求值
            const result = evaluateAST(ast);
            console.log(`\n=== 计算结果 ===`);
            console.log(result);
            
            // 4. 代码生成 - 生成汇编
            const generator = new AssemblyGenerator();
            const assembly = generator.generate(ast);
            console.log(`\n=== 生成的汇编代码 ===`);
            console.log(assembly);
            
        } catch (error) {
            console.log("错误:", error);
        }
        
        console.log("\n输入表达式 (或 'exit' 退出):");
    });
}

// 运行主程序
main();
