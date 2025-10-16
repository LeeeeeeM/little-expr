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
- Node.js 18+
- Bun 运行时（推荐）或 Node.js

### 安装依赖
```bash
bun install
# 或
npm install
```

### 运行程序
```bash
# 使用 Bun（推荐）
bun run start

# 或使用 Node.js
npx tsx index.ts
```

## 📁 项目结构

```
bnf/
├── index.ts                    # 主程序（解析+求值混合版本）
├── parser-separated.ts         # 分离式解析器（AST + 代码生成）
├── index-while.ts             # 非递归版本（栈式解析）
├── package.json               # 项目配置
├── tsconfig.json              # TypeScript 配置
├── expression-analysis.md      # 表达式执行流程分析
├── operator-associativity.md   # 运算符结合性分析
└── README.md                  # 项目说明
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

## 🔧 三种实现方式

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
- **特点**：解析构建 AST，然后生成汇编代码
- **优点**：可扩展，支持代码生成
- **缺点**：代码复杂度较高

```typescript
// 示例：生成 AST 和汇编代码
const ast = parseExpr();
const assembly = generator.generate(ast);
```

### 3. 非递归解析器（`index-while.ts`）
- **特点**：使用栈和循环，避免递归
- **优点**：避免栈溢出，性能更好
- **缺点**：代码逻辑复杂

## 📊 使用示例

### 基本运算
```bash
$ echo "1+2*3" | bun run index.ts
7

$ echo "2**3**2" | bun run index.ts
512

$ echo "(1+2)*3" | bun run index.ts
9
```

### 分离式解析器
```bash
$ echo "1+2*3" | npx tsx parser-separated.ts

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

## 🧠 核心算法

### 递归下降解析
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

### 运算符结合性处理
- **左结合**：使用 while 循环累积计算
- **右结合**：使用递归调用处理

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
2. **语法分析**：递归下降解析器
3. **AST 构建**：抽象语法树设计
4. **代码生成**：汇编代码生成
5. **运算符优先级**：语法规则设计
6. **结合性处理**：左结合 vs 右结合

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
