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
# BNF方法（递归下降）
bun run bnf:integrated          # BNF集成版本（解析+求值）
bun run bnf:separated           # BNF分离版本（解析+AST+代码生成）

# 优先级爬升方法
bun run precedence:integrated    # 优先级爬升集成版本（解析+求值）
bun run precedence:separated     # 优先级爬升分离版本（解析+AST+代码生成）

# 运行测试
bun run test:all                # 运行所有测试（包含所有版本）
bun run test:basic              # 基本表达式测试
bun run test:edge               # 边界情况测试
bun run test:precedence         # 运算符优先级测试
bun run test:performance        # 性能测试

# 特定版本测试
bun run test:bnf-integrated     # 测试BNF集成版本
bun run test:bnf-separated      # 测试BNF分离版本
bun run test:precedence-integrated   # 测试优先级爬升集成版本
bun run test:precedence-separated    # 测试优先级爬升分离版本
```

## 📁 项目结构

```
bnf/
├── bnf/                                  # BNF方法（递归下降）文件夹
│   ├── index.ts                          # BNF集成版本（解析+求值）
│   └── separated.ts                      # BNF分离版本（解析+AST+代码生成）
├── precedence-climbing/                  # 优先级爬升方法文件夹
│   ├── index.ts                          # 优先级爬升集成版本（解析+求值）
│   └── separated.ts                      # 优先级爬升分离版本（解析+AST+代码生成）
├── test/                                 # 测试用例文件夹
│   ├── basic-expressions.txt             # 基本表达式测试
│   ├── edge-cases.txt                    # 边界情况测试
│   ├── operator-precedence.txt           # 运算符优先级测试
│   ├── performance.txt                   # 性能测试
│   ├── error-cases.txt                   # 错误情况测试
│   └── README.md                         # 测试说明文档
├── docs/                                 # 文档文件夹
│   ├── expression-analysis.md            # 表达式执行流程分析
│   ├── operator-associativity.md         # 运算符结合性分析
│   └── precedence-climbing-analysis.md # 优先级爬升算法分析
├── runner.ts                             # 测试运行器
├── package.json                          # 项目配置
├── tsconfig.json                         # TypeScript 配置
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

### 1. BNF集成版本（`bnf/index.ts`）
- **特点**：递归下降解析 + 直接求值
- **优点**：代码简洁，适合解释器
- **缺点**：无法生成中间代码

```typescript
// 示例：1+2*3
function evalExpr(): number {
    return evalAddSubExpr();
}
```

### 2. BNF分离版本（`bnf/separated.ts`）
- **特点**：递归下降解析 + AST构建 + 汇编代码生成
- **优点**：可扩展，支持代码生成，结构清晰
- **缺点**：代码复杂度较高

```typescript
// 示例：生成 AST 和汇编代码
const ast = parseExpr();
const assembly = generator.generate(ast);
```

### 3. 优先级爬升集成版本（`precedence-climbing/index.ts`）
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

### 4. 优先级爬升分离版本（`precedence-climbing/separated.ts`）
- **特点**：while循环方式 + AST构建 + 汇编代码生成
- **优点**：结合了优先级爬升的效率和分离式的扩展性
- **缺点**：算法理解难度较高

| 实现方式 | 解析算法 | 输出类型 | 代码生成 | 递归深度 |
|----------|----------|----------|----------|----------|
| BNF集成版本 | 递归下降 | 直接求值 | ❌ | 有限制 |
| BNF分离版本 | 递归下降 | AST | ✅ | 有限制 |
| 优先级爬升集成版本 | while循环 | 直接求值 | ❌ | 无限制 |
| 优先级爬升分离版本 | while循环 | AST | ✅ | 无限制 |

## 📊 使用示例

### 基本运算
```bash
$ echo "1+2*3" | bun run bnf:integrated
7

$ echo "2**3**2" | bun run precedence:integrated
512

$ echo "(1+2)*3" | bun run bnf:separated
9
```

### BNF分离版本（递归下降）
```bash
$ echo "1+2*3" | bun run bnf:separated

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

### 优先级爬升分离版本（while循环方式）
```bash
$ echo "1+2*3" | bun run precedence:separated

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
# 运行所有测试（推荐）- 包含所有四个版本
bun run test:all

# 运行特定测试套件
bun run test:basic              # 基本表达式（20个测试）
bun run test:edge               # 边界情况（22个测试）
bun run test:precedence         # 运算符优先级（17个测试）
bun run test:performance        # 性能测试（16个测试）

# 运行特定版本测试
bun run test:bnf-integrated     # BNF集成版本测试
bun run test:bnf-separated      # BNF分离版本测试
bun run test:precedence-integrated   # 优先级爬升集成版本测试
bun run test:precedence-separated    # 优先级爬升分离版本测试
```

### 测试结果示例
```
📊 测试总结:
   总测试数: 75
   通过: 73 ✅
   失败: 2 ❌
   成功率: 97.3%
```

### 测试覆盖范围
- **基本表达式**: 100% 通过 - 所有整数运算都正确
- **运算符优先级**: 100% 通过 - 优先级和结合性都正确  
- **性能测试**: 93.8% 通过 - 深度嵌套和长表达式处理良好
- **边界情况**: 95.5% 通过 - 包含预期的设计限制（除零等）

### 预期失败说明
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

### 5. 优先级爬升与逆波兰表达式的相似性

优先级爬升解析器与逆波兰表达式（RPN）处理在算法思想上高度相似：

#### **核心思想相似**
- **优先级比较机制**: 都通过优先级表决定何时处理操作符
- **延迟处理策略**: 遇到更高优先级时才处理当前操作符
- **结合性处理**: 都正确处理左结合和右结合操作符

#### **算法流程对比**

**优先级爬升解析器**:
```typescript
function parseExpression(minPrecedence: Precedence): ASTNode {
    let left = parsePrimary();
    while (true) {
        const precedence = getPrecedence(currentToken);
        if (precedence < minPrecedence) break;
        // 处理操作符...
    }
}
```

**逆波兰表达式处理**:
```typescript
// 伪代码：处理操作符栈
while (operatorStack.length > 0 && 
       precedence(operatorStack.top()) >= precedence(currentToken)) {
    const op = operatorStack.pop();
    // 处理操作符...
}
```

#### **相似性分析表**
| 特性 | 优先级爬升 | 逆波兰处理 |
|------|------------|------------|
| **操作符优先级** | 通过 `getPrecedence()` 比较 | 通过优先级表比较 |
| **结合性处理** | `rightMinPrecedence` 参数 | 栈顶操作符优先级比较 |
| **延迟处理** | 遇到更高优先级才处理 | 遇到更高优先级才处理 |
| **栈式思维** | 递归调用栈模拟 | 显式操作符栈 |

#### **主要区别**
| 方面 | 优先级爬升 | 逆波兰 |
|------|------------|--------|
| **实现方式** | 递归函数 | 显式栈 |
| **内存使用** | 调用栈 | 操作符栈+操作数栈 |
| **代码结构** | 单一函数 | 多个函数 |
| **扩展性** | 易于添加新操作符 | 需要修改栈处理逻辑 |

**结论**: 优先级爬升解析器本质上是一个**递归版本的逆波兰表达式处理算法**，两者都遵循"优先级驱动"的核心算法思想。

### 6. AST树结构分析示例

#### **复杂表达式**: `1+2*3**2**2`

##### **AST树结构图**
```
                    BinaryOp(+)
                   /           \
            Number(1)          BinaryOp(*)
                               /           \
                        Number(2)          BinaryOp(**)
                                           /           \
                                    Number(3)          BinaryOp(**)
                                                       /           \
                                                Number(2)          Number(2)
```

##### **详细节点分析**
1. **根节点 - 加法运算**: `1 + (2*3**2**2)`
2. **右子树 - 乘法运算**: `2 * (3**2**2)`
3. **右子树的右子树 - 第一个指数运算**: `3 ** (2**2)`
4. **右子树的右子树的右子树 - 第二个指数运算**: `2 ** 2`

##### **计算过程**
```
1. 计算 2**2 = 4
2. 计算 3**4 = 81  
3. 计算 2*81 = 162
4. 计算 1+162 = 163
```

##### **优先级和结合性体现**
- **优先级**: `**` > `*` > `+`
- **右结合性**: `3**2**2` 解析为 `3**(2**2)`，不是 `(3**2)**2`
- **树结构**: 由于右结合性，指数运算形成了右倾斜的树结构

##### **完整JSON结构**
```json
{
  "type": "BinaryOp",
  "operator": "+",
  "left": {"type": "Number", "value": 1},
  "right": {
    "type": "BinaryOp",
    "operator": "*",
    "left": {"type": "Number", "value": 2},
    "right": {
      "type": "BinaryOp",
      "operator": "**",
      "left": {"type": "Number", "value": 3},
      "right": {
        "type": "BinaryOp",
        "operator": "**",
        "left": {"type": "Number", "value": 2},
        "right": {"type": "Number", "value": 2}
      }
    }
  }
}
```

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

- **[表达式执行流程分析](docs/expression-analysis.md)**：详细分析 `1 + 2 * (3 + 1) - 5` 的执行过程
- **[运算符结合性分析](docs/operator-associativity.md)**：左结合 vs 右结合的实现原理
- **[优先级爬升算法分析](docs/precedence-climbing-analysis.md)**：详细分析 `1+2*3**2**2+100` 的执行过程

## 🏗️ 项目架构设计

### 文件夹组织原则
项目采用**按解析方法分类**的组织方式：

```
bnf/                    # BNF方法（递归下降）
├── index.ts           # 集成版本：解析+求值
└── separated.ts       # 分离版本：解析+AST+代码生成

precedence-climbing/    # 优先级爬升方法
├── index.ts           # 集成版本：解析+求值  
└── separated.ts       # 分离版本：解析+AST+代码生成
```

### 设计优势
1. **清晰的方法对比**：每种解析方法都有独立的文件夹
2. **统一的命名规范**：每个文件夹都包含 `index.ts`（集成）和 `separated.ts`（分离）
3. **便于学习理解**：可以轻松对比不同解析算法的实现
4. **模块化设计**：每个版本都是独立的，便于测试和维护

### 版本选择指南
- **学习递归下降**：使用 `bnf/` 文件夹
- **学习优先级爬升**：使用 `precedence-climbing/` 文件夹
- **需要代码生成**：使用 `separated.ts` 版本
- **简单求值**：使用 `index.ts` 版本

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
