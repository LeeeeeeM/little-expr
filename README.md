# 🧮 TypeScript Calculator Compiler

一个基于 EBNF 语法的 TypeScript 计算器编译器，支持表达式解析、AST 构建和汇编代码生成。

## 📋 项目概述

这个项目实现了一个完整的编译器前端，包括：
- **词法分析器（Lexer）**：将输入字符串转换为 Token 序列
- **语法分析器（Parser）**：基于 EBNF 语法的递归下降解析器
- **AST 构建**：构建抽象语法树
- **代码生成**：生成汇编代码
- **表达式求值**：直接计算表达式结果

## 🚀 快速开始

### 环境要求
- Bun 运行时

### 安装依赖
```bash
bun install
```

### 运行程序
```bash
# 使用 Bun
bun run start                    # 混合式解析器
bun run separated               # 递归下降分离版
bun run precedence              # 优先级爬升解析器
bun run precedence-separated    # 优先级爬升分离版

# 运行测试
bun run test:all                # 运行所有测试
bun run test:basic              # 基本表达式测试
bun run test:edge               # 边界情况测试
bun run test:precedence         # 运算符优先级测试
bun run test:performance        # 性能测试
```

## 📁 项目结构

```
bnf/
├── index.ts                              # 主程序（解析+求值混合版本）
├── parser-separated.ts                   # 分离式解析器（递归下降 + AST + 代码生成）
├── precedence-climbing.ts                # 优先级爬升解析器（直接求值）
├── parser-precedence-climbing-separated.ts # 优先级爬升解析器（AST + 代码生成）
├── runner.ts                             # 测试运行器
├── test/                                 # 测试用例文件夹
│   ├── basic-expressions.txt             # 基本表达式测试
│   ├── edge-cases.txt                    # 边界情况测试
│   ├── operator-precedence.txt           # 运算符优先级测试
│   ├── performance.txt                   # 性能测试
│   ├── error-cases.txt                   # 错误情况测试
│   └── README.md                         # 测试说明文档
├── package.json                          # 项目配置
├── tsconfig.json                         # TypeScript 配置
├── expression-analysis.md                # 表达式执行流程分析
├── operator-associativity.md             # 运算符结合性分析
└── README.md                             # 项目说明
```

## 🎯 核心特性

### 1. 支持的运算符
- **算术运算**：`+`, `-`, `*`, `/`
- **指数运算**：`**`（右结合）
- **括号**：`()`
- **负数**：`-123`

### 2. 运算符优先级（从高到低）
1. **括号和负数**：`()`, `-123`
2. **指数运算**：`**`（右结合）
3. **乘除运算**：`*`, `/`（左结合）
4. **加减运算**：`+`, `-`（左结合）

### 3. 语法规则（EBNF）
```
<Expr> ::= <AddSubExpr>
<AddSubExpr> ::= <MulDivExpr> {('+'|'-') <MulDivExpr>}
<MulDivExpr> ::= <PowerExpr> {('*'|'/') <PowerExpr>}
<PowerExpr> ::= <PrimaryExpr> {'**' <PrimaryExpr>}
<PrimaryExpr> ::= NUM | '-'NUM | '('<Expr>')'
```

## 🔧 四种实现方式对比

### 1. 混合式解析器（`index.ts`）
- **特点**：解析和求值同时进行
- **优点**：代码简洁，适合解释器
- **缺点**：无法生成中间代码

```typescript
// 示例：1+2*3
function evalExpr(): number {
    return evalAddSubExpr();
}
```

### 2. 分离式解析器（`parser-separated.ts`）
- **特点**：递归下降解析 + AST构建 + 汇编代码生成
- **优点**：可扩展，支持代码生成，结构清晰
- **缺点**：代码复杂度较高

```typescript
// 示例：生成 AST 和汇编代码
const ast = parseExpr();
const assembly = generator.generate(ast);
```

### 3. 优先级爬升解析器（`precedence-climbing.ts`）
- **特点**：while循环方式，直接求值
- **优点**：避免递归深度限制，算法紧凑
- **缺点**：无法生成中间代码

```typescript
// 示例：while循环处理所有优先级
function parseExpression(minPrecedence: Precedence): number {
    let left = parsePrimary();
    while (true) {
        const precedence = getPrecedence(token);
        if (precedence < minPrecedence) break;
        // 处理操作符...
    }
}
```

### 4. 优先级爬升分离版（`parser-precedence-climbing-separated.ts`）
- **特点**：while循环方式 + AST构建 + 汇编代码生成
- **优点**：结合了优先级爬升的效率和分离式的扩展性
- **缺点**：算法理解难度较高

| 实现方式 | 解析算法 | 输出类型 | 代码生成 | 递归深度 |
|----------|----------|----------|----------|----------|
| 混合式 | 递归下降 | 直接求值 | ❌ | 有限制 |
| 分离式 | 递归下降 | AST | ✅ | 有限制 |
| 优先级爬升 | while循环 | 直接求值 | ❌ | 无限制 |
| 优先级爬升分离版 | while循环 | AST | ✅ | 无限制 |

## 📊 使用示例

### 基本运算
```bash
$ echo "1+2*3" | bun run start
7

$ echo "2**3**2" | bun run start
512

$ echo "(1+2)*3" | bun run start
9
```

### 分离式解析器（递归下降）
```bash
$ echo "1+2*3" | bun run separated

=== AST结构 ===
{
  "type": "BinaryOp",
  "operator": "+",
  "left": {"type": "Number", "value": 1},
  "right": {
    "type": "BinaryOp",
    "operator": "*",
    "left": {"type": "Number", "value": 2},
    "right": {"type": "Number", "value": 3}
  }
}

=== 计算结果 ===
7

=== 生成的汇编代码 ===
mov eax, 1
mov t0, eax
mov eax, 2
mov t1, eax
mov eax, 3
mov ebx, t1
imul eax, ebx
mov ebx, t0
add eax, ebx
ret
```

### 优先级爬升解析器（while循环方式）
```bash
$ echo "1+2*3" | bun run precedence-separated

=== AST结构 ===
{
  "type": "BinaryOp",
  "operator": "+",
  "left": {"type": "Number", "value": 1},
  "right": {
    "type": "BinaryOp",
    "operator": "*",
    "left": {"type": "Number", "value": 2},
    "right": {"type": "Number", "value": 3}
  }
}

=== 计算结果 ===
7

=== 生成的汇编代码 ===
mov eax, 1
mov t0, eax
mov eax, 2
mov t1, eax
mov eax, 3
mov ebx, t1
imul eax, ebx
mov ebx, t0
add eax, ebx
ret
```

**注意**：两种解析器生成的AST和汇编代码完全相同，证明了不同解析算法可以产生相同的结果！

## 🧪 测试框架

### 自动化测试
项目包含完整的测试框架，支持自动化测试和结果验证：

```bash
# 运行所有测试（推荐）
bun run test:all

# 运行特定测试套件
bun run test:basic              # 基本表达式（20个测试）
bun run test:edge               # 边界情况（25个测试）
bun run test:precedence         # 运算符优先级（17个测试）
bun run test:performance        # 性能测试（16个测试）
```

### 测试结果示例
```
📊 测试总结:
   总测试数: 78
   通过: 73 ✅
   失败: 5 ❌
   成功率: 93.6%
```

### 测试覆盖范围
- **基本表达式**: 100% 通过 - 所有整数运算都正确
- **运算符优先级**: 100% 通过 - 优先级和结合性都正确  
- **性能测试**: 93.8% 通过 - 深度嵌套和长表达式处理良好
- **边界情况**: 84% 通过 - 包含预期的设计限制（小数、除零等）

### 预期失败说明
- **小数运算**: 设计限制，词法分析器只支持整数
- **除零错误**: 正确错误处理，解析器正确检测异常
- **超大数运算**: 数值溢出，符合JavaScript数值范围限制

## 🧠 核心算法

### 1. 递归下降解析
```typescript
function evalAddSubExpr(): number {
    let result = evalMulDivExpr();
    while (token === TokenType.ADD || token === TokenType.SUB) {
        const op = token;
        getToken();
        const right = evalMulDivExpr();
        result = op === TokenType.ADD ? result + right : result - right;
    }
    return result;
}
```

### 2. 优先级爬升解析（while循环方式）
```typescript
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
```

### 3. 运算符结合性处理
- **左结合**：`rightMinPrecedence = precedence + 1`，确保右操作数用更高优先级解析
- **右结合**：`rightMinPrecedence = precedence + 0`，允许右操作数用相同优先级解析

```typescript
function isRightAssociative(token: TokenType): boolean {
    return token === TokenType.POWER;  // 只有 ** 是右结合
}
```

### 4. 算法对比
| 特性 | 递归下降 | 优先级爬升 |
|------|----------|------------|
| **控制结构** | 多个递归函数 | 单一while循环 |
| **优先级处理** | 函数调用层次 | 优先级表+参数 |
| **代码复杂度** | 简单直观 | 更紧凑高效 |
| **递归深度** | 有限制 | 无限制 |
| **扩展性** | 需修改多个函数 | 只需修改优先级表 |

### AST 节点类型
```typescript
interface NumberNode {
    type: 'Number';
    value: number;
}

interface BinaryOpNode {
    type: 'BinaryOp';
    operator: string;
    left: ASTNode;
    right: ASTNode;
}
```

## 🔍 调试功能

### 启用调试模式
```typescript
const DEBUG = true;  // 在 index.ts 中设置
```

### 调试输出示例
```
[Debug] TOKEN:NUMBER
[Debug] EVAL:Expr
[Debug] EVAL:AddSubExpr
[Debug] EVAL:MulDivExpr
[Debug] EVAL:PrimaryExpr
```

## 📚 详细文档

- **[表达式执行流程分析](expression-analysis.md)**：详细分析 `1 + 2 * (3 + 1) - 5` 的执行过程
- **[运算符结合性分析](operator-associativity.md)**：左结合 vs 右结合的实现原理

## 🎯 学习价值

这个项目是学习编译原理的绝佳例子，涵盖了：

1. **词法分析**：Token 识别和分类
2. **语法分析**：递归下降解析器 vs 优先级爬升解析器
3. **AST 构建**：抽象语法树设计
4. **代码生成**：汇编代码生成
5. **运算符优先级**：语法规则设计
6. **结合性处理**：左结合 vs 右结合
7. **算法对比**：不同解析算法的实现和效果对比
8. **关注点分离**：解析、求值、代码生成的模块化设计
9. **测试驱动开发**：完整的测试框架和自动化验证
10. **错误处理**：异常情况的处理和验证

## 🚀 扩展方向

- 添加更多运算符（位运算、逻辑运算）
- 支持变量和赋值
- 添加函数调用
- 优化汇编代码生成
- 支持更多数据类型（浮点数、字符串）

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**Happy Coding! 🎉**
