# CFG 编译器模块详细说明

## 📋 目录

1. [词法分析器 (lexer.ts)](#词法分析器-lexerts)
2. [语法分析器 (parser.ts)](#语法分析器-parserts)
3. [AST 类型定义 (ast.ts)](#ast-类型定义-astts)
4. [类型定义 (types.ts)](#类型定义-typests)
5. [Checkpoint 转换器 (checkpoint-transformer.ts)](#checkpoint-转换器-checkpoint-transformerts)
6. [CFG 生成器 (cfg-generator.ts)](#cfg-生成器-cfg-generatorts)
7. [作用域管理器 (scope-manager.ts)](#作用域管理器-scope-managerts)
8. [汇编生成器 (assembly-generator.ts)](#汇编生成器-assembly-generatorts)
9. [编译器 (compiler.ts)](#编译器-compilerts)
10. [虚拟机运行器 (vm-runner.ts)](#虚拟机运行器-vm-runnerts)

## 词法分析器 (lexer.ts)

### 功能
将源代码字符串转换为 Token 序列。

### 主要方法

#### `tokenize(sourceCode: string): Token[]`
扫描源代码，返回 Token 数组。

### 支持的 Token 类型

- **关键字**: `if`, `else`, `while`, `for`, `return`, `break`, `continue`, `int`, `let`, `function`
- **操作符**: 
  - 算术: `+`, `-`, `*`, `/`, `%`, `**`
  - 比较: `==`, `!=`, `<`, `>`, `<=`, `>=`
  - 逻辑: `&&`, `||`, `!`
  - 赋值: `=`
- **分隔符**: `;`, `{`, `}`, `(`, `)`, `,`, `:`
- **字面量**: 数字、标识符

### 使用示例

```typescript
const lexer = new Lexer();
const tokens = lexer.tokenize('int x = 10;');
// 返回: [INT, IDENTIFIER("x"), ASSIGN, NUMBER(10), SEMICOLON, EOF]
```

## 语法分析器 (parser.ts)

### 功能
将 Token 序列解析为抽象语法树（AST）。

### 主要类

#### `StatementParser`
解析语句级别的语法结构。

### 主要方法

#### `parse(): ParseResult`
解析 Token 序列，返回 AST 和错误信息。

### 支持的语法结构

- **程序**: 多个语句（函数声明、全局变量等）
- **函数声明**: `function name(params) { body }`
- **语句**:
  - 变量声明: `int x = 10;` / `let y;`
  - 赋值: `x = 20;`
  - 表达式语句: `(x + 1);`
  - 控制流: `if`, `while`, `for`, `return`, `break`, `continue`
  - 复合语句: `{ ... }`
- **表达式**:
  - 二元表达式: `a + b`, `a > b`
  - 一元表达式: `-x`, `!flag`
  - 函数调用: `func(args)`
  - 括号表达式: `(expr)`

### 使用示例

```typescript
const parser = new StatementParser(sourceCode);
const result = parser.parse();
if (result.ast) {
  // 使用 AST
}
```

## AST 类型定义 (ast.ts)

### 功能
定义所有 AST 节点的类型。

### 主要类型

#### `Program`
```typescript
interface Program {
  type: 'Program';
  statements: Statement[];
}
```

#### `FunctionDeclaration`
```typescript
interface FunctionDeclaration {
  type: 'FunctionDeclaration';
  name: string;
  parameters: Parameter[];
  returnType?: string;
  body: BlockStatement;
}
```

#### `BlockStatement`
```typescript
interface BlockStatement {
  type: 'BlockStatement';
  statements: Statement[];
}
```

#### `VariableDeclaration`
```typescript
interface VariableDeclaration {
  type: 'VariableDeclaration';
  name: string;
  dataType: string;
  initializer?: Expression;
}
```

#### `IfStatement`
```typescript
interface IfStatement {
  type: 'IfStatement';
  condition: Expression;
  thenBranch: Statement;
  elseBranch?: Statement;
}
```

#### `StartCheckPoint` / `EndCheckPoint`
```typescript
interface StartCheckPoint {
  type: 'StartCheckPoint';
  scopeId: string;
}

interface EndCheckPoint {
  type: 'EndCheckPoint';
  scopeId: string;
}
```

### 使用示例

```typescript
import type { Program, FunctionDeclaration } from './ast';

function processProgram(program: Program) {
  for (const stmt of program.statements) {
    if (stmt.type === 'FunctionDeclaration') {
      const func = stmt as FunctionDeclaration;
      // 处理函数
    }
  }
}
```

## 类型定义 (types.ts)

### 功能
定义系统使用的枚举和接口类型。

### 主要枚举

#### `StatementType`
所有语句类型的枚举。

#### `TokenType`
所有 Token 类型的枚举。

#### `DataType`
数据类型枚举：`INT`, `FLOAT`, `STRING`, `BOOLEAN`, `VOID`。

### 主要接口

#### `VariableInfo`
```typescript
interface VariableInfo {
  name: string;
  type: DataType;
  value?: any;
  isInitialized: boolean;
  isTDZ?: boolean;
}
```

#### `ParseResult`
```typescript
interface ParseResult {
  ast: ASTNode;
  errors: ParseError[];
  warnings: ParseError[];
}
```

## Checkpoint 转换器 (checkpoint-transformer.ts)

### 功能
为 BlockStatement 添加作用域检查点标记。

### 主要类

#### `CheckpointTransformer`
转换 AST，添加 StartCheckPoint 和 EndCheckPoint 节点。

### 主要方法

#### `transform(program: Program): Program`
转换整个程序，返回包含检查点的 AST。

#### `transformStatement(stmt: Statement, depth: number): Statement`
递归转换语句，处理嵌套的 BlockStatement。

### 转换规则

1. 对于每个 `BlockStatement`:
   - 在 `statements` 数组开头插入 `StartCheckPoint`
   - 在 `statements` 数组结尾插入 `EndCheckPoint`
   - 为每个作用域生成唯一 ID

2. 处理嵌套作用域:
   - 递归处理所有嵌套的 `BlockStatement`
   - 每个作用域都有独立的 ID

### 使用示例

```typescript
const transformer = new CheckpointTransformer();
const transformedProgram = transformer.transform(originalProgram);
```

### 转换前后对比

**转换前**:
```typescript
{
  type: 'BlockStatement',
  statements: [
    { type: 'VariableDeclaration', name: 'x', ... }
  ]
}
```

**转换后**:
```typescript
{
  type: 'BlockStatement',
  statements: [
    { type: 'StartCheckPoint', scopeId: 'scope_0' },
    { type: 'VariableDeclaration', name: 'x', ... },
    { type: 'EndCheckPoint', scopeId: 'scope_0' }
  ]
}
```

## CFG 生成器 (cfg-generator.ts)

### 功能
将 AST 转换为控制流图（CFG）。

### 主要类

#### `CFGGenerator`
生成函数的 CFG。

#### `CFGVisualizer`
可视化 CFG（文本格式）。

### 主要方法

#### `generate(program: Program): ControlFlowGraph[]`
为程序中的每个函数生成 CFG。

#### `generateFunctionCFG(func: FunctionDeclaration): ControlFlowGraph`
为单个函数生成 CFG。

#### `processStatements(statements: Statement[], currentBlock: BasicBlock): BasicBlock`
处理语句序列，构建基本块。

### 数据结构

#### `BasicBlock`
```typescript
interface BasicBlock {
  id: string;                    // 块标识符
  statements: Statement[];        // 块内语句
  predecessors: BasicBlock[];    // 前驱块
  successors: BasicBlock[];      // 后继块
  isEntry?: boolean;             // 是否为入口块
  isExit?: boolean;              // 是否为出口块
  visited?: boolean;             // DFS 遍历标记
  scopeSnapshot?: Map<string, { offset: number; init: boolean }>[];  // 作用域快照
}
```

#### `ControlFlowGraph`
```typescript
interface ControlFlowGraph {
  functionName: string;
  entryBlock: BasicBlock;
  exitBlock?: BasicBlock;
  blocks: BasicBlock[];
  edges: { from: string; to: string }[];
}
```

### 控制流处理

#### If 语句
```
条件块 → [true分支块, false分支块] → 合并块
```

#### While 语句
```
条件块 → [循环体块, 退出块]
循环体块 → 条件块（循环）
```

#### For 语句
```
初始化块 → 条件块 → [循环体块, 退出块]
更新块 → 条件块（循环）
```

#### Return 语句
```
Return 块 → 出口块（唯一后继）
```

### 使用示例

```typescript
const generator = new CFGGenerator();
const cfgs = generator.generate(program);
for (const cfg of cfgs) {
  console.log(`函数 ${cfg.functionName} 有 ${cfg.blocks.length} 个基本块`);
}
```

## 作用域管理器 (scope-manager.ts)

### 功能
管理变量作用域、栈偏移和初始化状态。

### 主要类

#### `ScopeManager`
管理作用域栈和变量信息。

### 主要方法

#### `enterScope(variableNames: string[]): number`
进入新作用域，为变量分配栈偏移。
- 返回分配的栈空间大小（变量数）

#### `exitScope(): void`
退出当前作用域。

#### `markVariableInitialized(name: string): void`
标记变量为已初始化（在 `int x` 或 `let x` 声明时调用）。

#### `getVariableOffset(name: string): number | null`
获取变量的栈偏移（只返回已初始化的变量）。

#### `getVariableInfo(name: string): { offset: number; init: boolean } | null`
获取变量的完整信息（offset + init 状态）。

#### `saveSnapshot(): Map<string, VariableInfo>[]`
保存当前作用域链的深拷贝。

#### `restoreSnapshot(snapshot: Map<string, VariableInfo>[]): void`
从快照恢复作用域链。

### 数据结构

#### `VariableInfo`
```typescript
interface VariableInfo {
  offset: number;    // 栈偏移（负数，从 -1 开始）
  init: boolean;     // 是否已初始化
}
```

### 作用域栈结构

```typescript
scopes: Map<string, VariableInfo>[]  // 作用域栈（数组）
```

- 每个元素是一个 `Map<string, VariableInfo>`，表示一个作用域
- 数组索引越大，作用域越内层
- 变量 offset 计算：`-(前面所有作用域的总变量数 + 本作用域内的顺序索引 + 1)`

### 使用示例

```typescript
const scopeManager = new ScopeManager();

// 进入作用域，声明变量
scopeManager.enterScope(['x', 'y']);  // 分配 x 和 y 的空间，offset = -1, -2

// 标记变量初始化
scopeManager.markVariableInitialized('x');  // x.init = true

// 获取变量偏移
const offset = scopeManager.getVariableOffset('x');  // 返回 -1

// 保存快照
const snapshot = scopeManager.saveSnapshot();

// 退出作用域
scopeManager.exitScope();

// 恢复快照
scopeManager.restoreSnapshot(snapshot);
```

## 汇编生成器 (assembly-generator.ts)

### 功能
从 CFG 生成汇编代码。

### 主要类

#### `AssemblyGenerator`
生成汇编代码。

### 主要方法

#### `generateAssembly(cfg: ControlFlowGraph): string`
为 CFG 生成汇编代码。

#### `visitBlock(block: BasicBlock, incomingSnapshot: Map<string, { offset: number; init: boolean }>[] | null): void`
DFS 访问基本块，生成汇编代码。

#### `processStatement(stmt: Statement): void`
处理单个语句，生成对应的汇编指令。

#### `processExpression(expr: Expression): void`
处理表达式，生成求值汇编指令。

### 汇编指令

#### 栈管理
- `sub esp, n`: 分配栈空间（进入作用域）
- `add esp, n`: 释放栈空间（退出作用域）

#### 变量操作
- `li offset`: 加载变量地址（load immediate）
- `si offset`: 存储到栈（store immediate）

#### 数据移动
- `mov eax, value`: 移动立即数到寄存器
- `mov eax, ebx`: 移动寄存器值

#### 算术运算
- `add eax, ebx`: 加法
- `sub eax, ebx`: 减法
- `mul eax, ebx`: 乘法
- `div eax, ebx`: 除法

#### 比较和跳转
- `cmp eax, ebx`: 比较，设置标志位
- `jg label`: 大于则跳转
- `jge label`: 大于等于则跳转
- `jl label`: 小于则跳转
- `jle label`: 小于等于则跳转
- `jne label`: 不等于则跳转
- `je label`: 等于则跳转
- `jmp label`: 无条件跳转

#### 栈操作
- `push eax`: 将寄存器值压入栈
- `pop eax`: 从栈弹出值到寄存器

#### 函数返回
- `ret`: 返回

### 使用示例

```typescript
const generator = new AssemblyGenerator(scopeManager);
const assembly = generator.generateAssembly(cfg);
console.log(assembly);
```

### 生成的汇编代码示例

```asm
; Function: test
test:
test_entry_block:
  sub esp, 1        ; 进入作用域
  mov eax, 10       ; 加载初始值
  si -1             ; 存储变量
  li -1             ; 加载变量
  mov ebx, 0        ; 清理标志
  ret               ; 返回
  add esp, 1        ; 退出作用域
```

## 编译器 (compiler.ts)

### 功能
整合所有模块，提供统一的编译接口。

### 主要类

#### `Compiler`
编译器主类。

#### `CompilerUtils`
编译器工具函数。

### 主要方法

#### `compile(program: Program, options?: CompileOptions): CompileResult`
编译程序，返回编译结果。

#### `getSymbolTable(): ScopeManager`
获取符号表。

#### `lookupSymbol(name: string): number | null`
查找符号。

### 编译选项

```typescript
interface CompileOptions {
  smartMerging?: boolean;      // 智能合并
  optimize?: boolean;          // 优化
  targetArchitecture?: string; // 目标架构
}
```

### 编译结果

```typescript
interface CompileResult {
  success: boolean;
  symbolTable: ScopeManager | null;
  cfgs: ControlFlowGraph[];
  assemblyResults: AssemblyResult[];
  errors: string[];
}
```

### 编译流程

1. **AST 转换**: 添加作用域检查点
2. **CFG 生成**: 为每个函数生成 CFG
3. **汇编生成**: 为每个函数生成汇编代码

### 使用示例

```typescript
const compiler = new Compiler();
const result = compiler.compile(program);
if (result.success) {
  for (const cfg of result.cfgs) {
    console.log(`函数 ${cfg.functionName} 的 CFG`);
  }
  for (const asm of result.assemblyResults) {
    console.log(asm.assembly);
  }
}
```

## 虚拟机运行器 (vm-runner.ts)

### 功能
执行编译后的汇编代码。

### 主要类

#### `VMRunner`
虚拟机运行器。

### 主要方法

#### `runSourceCode(sourceCode: string): Promise<RunResult>`
运行源代码（解析 → 编译 → 执行）。

#### `runAssembly(assembly: string): RunResult`
直接运行汇编代码。

#### `getVMState(): VMState`
获取虚拟机状态。

### 运行结果

```typescript
interface RunResult {
  success: boolean;
  errorType?: 'parse' | 'compile' | 'runtime' | 'unknown';
  output: string;
  errors: string[];
  assembly?: string;
  vmResult?: any;
}
```

### 使用示例

```typescript
const runner = new VMRunner();
const result = await runner.runSourceCode(sourceCode);
if (result.success) {
  console.log(result.output);
} else {
  console.error(result.errors);
}
```

### 命令行使用

```bash
bun run src/vm-runner.ts tests/grade-check.txt
```

## 总结

本系统采用模块化设计，每个模块都有明确的职责和接口。关键模块包括：

1. **词法分析器**: 源代码 → Token
2. **语法分析器**: Token → AST
3. **Checkpoint 转换器**: AST → 转换后的 AST（添加检查点）
4. **CFG 生成器**: AST → CFG
5. **作用域管理器**: 管理作用域和变量
6. **汇编生成器**: CFG → 汇编代码
7. **编译器**: 整合所有模块
8. **虚拟机运行器**: 执行汇编代码

每个模块都可以独立测试和维护，提高了系统的可维护性和可扩展性。

