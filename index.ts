/* eg. 
1+5*3 
-13/5+2*7+8
(1+3)*(1024-1024)
18/(-3+9)
123/0
*/

/* EBNF Grammar
<Expr> ::= <AddSubExpr>                                     Priority |  LOW
<AddSubExpr> ::= <MulDivExpr> {('+'|'-') <MulDivExpr>}               |
<MulDivExpr> ::= <PrimaryExpr> {('*'|'/') <PrimaryExpr>}             |
<PrimaryExpr> ::= NUM | '-'NUM | '('<Expr>')'                       \|/ HIGH
*/

/* eg. 
1+5*3
<Expr> ::= <AddSubExpr>
       ::= <MulDivExpr> + <MulDivExpr>
       ::= <PrimaryExpr> + <PrimaryExpr> * <PrimaryExpr>
       ::= NUM:1 + NUM:5 * NUM:3
*/

const DEBUG = true;

// --- Helper ---
let src: string = "";    // source code
let numberVal: number = 0;  // if get number token,store its value 
let current: number = 0;    // point to char in parsing

function debug(message: string): void { // print some message
    if (DEBUG) {
        console.log(`[Debug] ${message}`);
    }
}

function error(message: string): never { // report error and throw exception
    throw new Error(message);
}

// --- Lexer ---
enum TokenType {
    NUMBER,                 // 123 -6
    ADD, SUB, MUL, DIV,        // + - * /
    POWER,                  // **
    LEFTPAREN, RIGHTPAREN,   // ( )
    END
}

let token: TokenType; // used by evaluate

function getToken(): void {
    while (current < src.length && /\s/.test(src[current] || '')) {
        current++; // skip the white
    }
    
    if (current >= src.length) {
        token = TokenType.END;
        debug("TOKEN:END");
        return; // in end
    }

    switch (src[current]) {
        case '+':
            token = TokenType.ADD;
            current++;
            debug("TOKEN:ADD");
            return;
        case '-':
            token = TokenType.SUB;
            current++;
            debug("TOKEN:SUB");
            return;
        case '*':
            if (current + 1 < src.length && src[current + 1] === '*') {
                token = TokenType.POWER;
                current += 2; // 跳过两个字符
                debug("TOKEN:POWER");
                return;
            } else {
                token = TokenType.MUL;
                current++;
                debug("TOKEN:MUL");
                return;
            }
        case '/':
            token = TokenType.DIV;
            current++;
            debug("TOKEN:DIV");
            return;
        case '(':
            token = TokenType.LEFTPAREN;
            current++;
            debug("TOKEN:LEFTPAREN");
            return;
        case ')':
            token = TokenType.RIGHTPAREN;
            current++;
            debug("TOKEN:RIGHTPAREN");
            return;

        default:
            const currentChar = src[current];
            if (currentChar && currentChar >= '0' && currentChar <= '9') { // get number
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
                debug("TOKEN:NUMBER");
                return;
            } else {
                error("Unknown token"); // other is error
            }
    }
}

// --- Parser & Interpreter --- (both in EvalXXX) 
//<Expr> ::= <AddSubExpr>
function evalExpr(): number {
    debug("EVAL:Expr");
    return evalAddSubExpr();
}

//<AddSubExpr> ::= <MulDivExpr> {('+'|'-') <MulDivExpr>}
function evalAddSubExpr(): number {
    debug("EVAL:AddSubExpr");

    let addSubExprVal = evalMulDivExpr();
    while (token === TokenType.ADD || token === TokenType.SUB) { // if have + or - go on
        const opToken = token;
        getToken();
        const tempVal = evalMulDivExpr();
        // accumulate
        if (opToken === TokenType.ADD) {
            addSubExprVal += tempVal;
        } else if (opToken === TokenType.SUB) {
            addSubExprVal -= tempVal;
        }
    }

    return addSubExprVal;
}

//<PowerExpr> ::= <PrimaryExpr> {'**' <PrimaryExpr>}
function evalPowerExpr(): number {
    debug("EVAL:PowerExpr");

    let powerExprVal = evalPrimaryExpr();
    while (token === TokenType.POWER) { // if have ** go on
        getToken();
        const tempVal = evalPowerExpr(); // 右结合性：递归调用自己
        powerExprVal = Math.pow(powerExprVal, tempVal);
    }

    return powerExprVal;
}

//<MulDivExpr> ::= <PowerExpr> {('*'|'/') <PowerExpr>}
function evalMulDivExpr(): number {
    debug("EVAL:MulDivExpr");

    let mulDivExprVal = evalPowerExpr();
    while (token === TokenType.MUL || token === TokenType.DIV) { // if have * or / go on
        const opToken = token;
        getToken();
        const tempVal = evalPowerExpr();
        // accumulate
        if (opToken === TokenType.MUL) {
            mulDivExprVal *= tempVal;
        } else if (opToken === TokenType.DIV) {
            if (tempVal === 0) {
                error("Divide zero"); // xxx/0
            } else {
                mulDivExprVal = Math.floor(mulDivExprVal / tempVal); // integer division like C++
            }
        }
    }

    return mulDivExprVal;
}

//<PrimaryExpr> ::= NUM | '-'NUM | '('<Expr>')'
function evalPrimaryExpr(): number {
    debug("EVAL:PrimaryExpr");

    let primaryExprVal = 0;

    switch (token) {
        case TokenType.NUMBER:
            primaryExprVal = numberVal;
            break;
        case TokenType.SUB: {
            getToken();
            if (token as TokenType === TokenType.NUMBER) {
                primaryExprVal = -numberVal; // negative number
            } else {
                error("Negative not a number");
            }
            break;
        }
        case TokenType.LEFTPAREN: {
            getToken();
            primaryExprVal = evalExpr(); // recursion can give us its value :)
            if (token as TokenType !== TokenType.RIGHTPAREN) {
                error("Right paren loss");
            }
            break;
        }
        default:
            error("Illegal primary expr");
    }

    getToken();
    return primaryExprVal;
}

// --- Driver ---
function main(): void {
    console.log("Calculator started! Type 'exit' to quit.");
    console.log("Input your expr:");
    
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', (data) => {
        const input = data.toString().trim();
        
        // 检查是否要退出
        if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
            console.log("Goodbye! 👋");
            process.exit(0);
        }
        
        if (input === '') {
            console.log("Please enter an expression:");
            return;
        }
        
        src = input;
        console.log();

        try {
            // 重置解析状态
            current = 0;
            numberVal = 0;
            
            getToken();
            const exprVal = evalExpr();
            console.log();
            console.log("Evaluate result :)");
            console.log(exprVal);
        } catch (error) {
            console.log("Error:", error);
        }
        
        console.log();
        console.log("Input your expr (or 'exit' to quit):");
    });
}

// 运行主程序
main();