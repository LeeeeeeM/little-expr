# CFG 编译器实现流程文档

## 📋 目录

1. [编译流程概览](#编译流程概览)
2. [阶段 1: 词法分析](#阶段-1-词法分析)
3. [阶段 2: 语法分析](#阶段-2-语法分析)
4. [阶段 3: AST 转换](#阶段-3-ast-转换)
5. [阶段 4: CFG 生成](#阶段-4-cfg-生成)
6. [阶段 5: 汇编生成](#阶段-5-汇编生成)
7. [阶段 6: 虚拟机执行](#阶段-6-虚拟机执行)

## 编译流程概览

```
源代码 → 词法分析 → Token序列 → 语法分析 → AST → AST转换 → CFG → 汇编生成 → 虚拟机执行
```

## 阶段 1: 词法分析

### 输入
- 源代码字符串

### 处理过程

1. **初始化词法分析器**
   - 创建字符流
   - 初始化位置指针

2. **逐个字符扫描**
   - 跳过空白字符（空格、制表符、换行）
   - 跳过注释（单行注释 `//` 和多行注释 `/* */`）

3. **识别 Token**
   - **关键字**: `if`, `else`, `while`, `for`, `return`, `break`, `continue`, `int`, `let`, `function`
   - **操作符**: 
     - 算术: `+`, `-`, `*`, `/`, `%`, `**`
     - 比较: `==`, `!=`, `<`, `>`, `<=`, `>=`
     - 逻辑: `&&`, `||`, `!`
     - 赋值: `=`
   - **分隔符**: `;`, `{`, `}`, `(`, `)`, `,`, `:`
   - **字面量**: 
     - 数字: `123`, `-45`, `3.14`
     - 标识符: `variableName`, `functionName`
   - **特殊**: `EOF`（文件结束）

4. **处理边界情况**
   - 多字符操作符（`==`, `!=`, `<=`, `>=`, `&&`, `||`）
   - 负数识别（区分减号和负数）
   - 标识符与关键字区分

### 输出
- Token 数组，每个 Token 包含：
  - `type`: Token 类型
  - `value`: Token 值（如果是字面量）
  - `position`: 位置信息（可选）

### 示例

```c
int x = 10;
```

**输出 Token 序列**:
```
[INT, IDENTIFIER("x"), ASSIGN, NUMBER(10), SEMICOLON, EOF]
```

## 阶段 2: 语法分析

### 输入
- Token 序列

### 处理过程

1. **解析程序**
   - 解析多个语句（函数声明、全局变量等）
   - 构建 `Program` 节点

2. **解析函数声明**
   ```typescript
   function functionName(param1, param2) {
     // 函数体
   }
   ```
   - 解析函数名、参数列表
   - 解析函数体（BlockStatement）

3. **解析语句**
   - **变量声明**: `int x = 10;` 或 `let y;`
   - **赋值语句**: `x = 20;`
   - **表达式语句**: `(x + 1);`
   - **控制流语句**:
     - `if (condition) { ... } else { ... }`
     - `while (condition) { ... }`
     - `for (init; condition; update) { ... }`
     - `return expression;`
     - `break;` / `continue;`
   - **复合语句**: `{ ... }`

4. **解析表达式**
   - 优先级处理（使用 Pratt Parser 或递归下降）
   - 支持括号、函数调用、一元操作符

5. **错误处理**
   - 语法错误检测
   - 错误恢复（跳过错误 Token，继续解析）

### 输出
- `Program` AST 节点，包含：
  - `statements`: 语句数组（主要是函数声明）

### 示例

```c
function checkGrade(int score) {
  int grade = 0;
  if (score > 89) {
    grade = 1;
  }
  return grade;
}
```

**输出 AST**:
```typescript
{
  type: 'Program',
  statements: [{
    type: 'FunctionDeclaration',
    name: 'checkGrade',
    parameters: [{ name: 'score', type: 'int' }],
    body: {
      type: 'BlockStatement',
      statements: [
        { type: 'VariableDeclaration', name: 'grade', initializer: { type: 'NumberLiteral', value: 0 } },
        { type: 'IfStatement', condition: { ... }, thenBranch: { ... } },
        { type: 'ReturnStatement', value: { type: 'Identifier', name: 'grade' } }
      ]
    }
  }]
}
```

## 阶段 3: AST 转换

### 输入
- 原始 AST（Program）

### 处理过程

1. **遍历 AST**
   - 深度优先遍历所有节点
   - 识别所有 `BlockStatement` 节点

2. **插入检查点**
   - 对于每个 `BlockStatement`:
     - 在 `statements` 数组开头插入 `StartCheckPoint` 节点
     - 在 `statements` 数组结尾插入 `EndCheckPoint` 节点
     - 为每个作用域生成唯一 ID（`scope_0`, `scope_1`, ...）

3. **处理嵌套作用域**
   - 递归处理嵌套的 `BlockStatement`
   - 每个作用域都有独立的 ID

4. **处理控制流结构**
   - `IfStatement` 的 `thenBranch` 和 `elseBranch` 如果是 `BlockStatement`，需要添加检查点
   - `WhileStatement` 和 `ForStatement` 的 `body` 如果是 `BlockStatement`，需要添加检查点
   - 函数体的 `BlockStatement` 也需要添加检查点

### 输出
- 转换后的 AST（包含 `StartCheckPoint` 和 `EndCheckPoint` 节点）

### 示例

**转换前**:
```typescript
{
  type: 'BlockStatement',
  statements: [
    { type: 'VariableDeclaration', name: 'x', ... },
    { type: 'VariableDeclaration', name: 'y', ... }
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
    { type: 'VariableDeclaration', name: 'y', ... },
    { type: 'EndCheckPoint', scopeId: 'scope_0' }
  ]
}
```

## 阶段 4: CFG 生成

### 输入
- 转换后的 AST（包含检查点）

### 处理过程

#### 4.1 识别基本块边界

遍历 AST，识别基本块的开始和结束点：

**块开始条件**:
- 程序/函数入口
- 控制流语句的目标（if/while/for 条件）
- 标签位置（如果有）

**块结束条件**:
- 控制流语句（if, while, for, return, break, continue）
- 函数返回
- 程序结束

#### 4.2 构建基本块

1. **创建新块**
   ```typescript
   newBlock(statements: Statement[]): BasicBlock {
     return {
       id: `${functionName}_block_${counter++}`,
       statements: statements,
       predecessors: [],
       successors: [],
       isEntry: false,
       isExit: false
     };
   }
   ```

2. **收集块内语句**
   - 线性收集语句，直到遇到控制流语句
   - 控制流语句本身也属于当前块

3. **标记入口/出口块**
   - 函数的第一个块标记为 `isEntry: true`
   - 函数返回块标记为 `isExit: true`

#### 4.3 建立控制流关系

1. **If 语句处理**
   ```
   条件块 → [true分支块, false分支块] → 合并块
   ```

2. **While 语句处理**
   ```
   条件块 → [循环体块, 退出块]
   循环体块 → 条件块（循环）
   ```

3. **For 语句处理**
   ```
   初始化块 → 条件块 → [循环体块, 退出块]
   更新块 → 条件块（循环）
   ```

4. **Return 语句处理**
   ```
   Return 块 → 出口块（唯一后继）
   ```

5. **Break/Continue 处理**
   - `break`: 跳转到循环的退出块
   - `continue`: 跳转到循环的条件块（while）或更新块（for）

#### 4.4 作用域快照

在生成 CFG 时，为每个基本块保存作用域快照：

1. **遍历块内语句**
   - 遇到 `StartCheckPoint`: 创建作用域
   - 遇到 `VariableDeclaration`/`LetDeclaration`: 标记变量初始化
   - 遇到 `EndCheckPoint`: 销毁作用域

2. **保存快照**
   - 在块结束时，调用 `scopeManager.saveSnapshot()`
   - 保存到 `block.scopeSnapshot`

### 输出
- `ControlFlowGraph[]`，每个 CFG 包含：
  - `functionName`: 函数名
  - `entryBlock`: 入口块
  - `exitBlock`: 出口块
  - `blocks`: 所有基本块数组
  - `edges`: 控制流边数组

### 示例

```c
function test(int x) {
  int y = 0;
  if (x > 0) {
    y = 1;
  }
  return y;
}
```

**生成的 CFG**:
```
entry_block:
  int y = 0;
  if (x > 0) → block_3 (true) / block_5 (false)

block_3:
  y = 1;
  → block_5

block_5:
  return y;
  → exit_block

exit_block:
  (函数出口)
```

## 阶段 5: 汇编生成

### 输入
- `ControlFlowGraph`
- `ScopeManager`

### 处理过程

#### 5.1 初始化

1. 重置 `ScopeManager`
2. 重置汇编代码行数组
3. 重置所有块的 `visited` 标记

#### 5.2 DFS 遍历 CFG

1. **从入口块开始**
   ```typescript
   visitBlock(entryBlock, null);
   ```

2. **访问块**
   - 如果块已访问过，检查作用域快照是否一致，然后跳过
   - 标记块为已访问
   - 恢复作用域快照（如果有）
   - 生成块标签：`${blockId}:`

3. **处理块内语句**
   遍历 `block.statements`，处理每条语句：

   **StartCheckPoint**:
   ```asm
   ; 进入作用域 scope_X
   sub esp, n  ; n 是该作用域内的变量数
   ```

   **EndCheckPoint**:
   ```asm
   ; 退出作用域 scope_X
   add esp, n  ; n 是该作用域内的变量数
   ```

   **VariableDeclaration**:
   ```asm
   mov eax, value    ; 加载初始值
   si offset         ; 存储到栈（store immediate）
   ```

   **AssignmentStatement**:
   ```asm
   li offset         ; 加载变量地址（load immediate）
   mov eax, value    ; 加载新值
   si offset         ; 存储到栈
   ```

   **IfStatement**:
   ```asm
   ; 条件表达式已在块中处理
   cmp eax, ebx      ; 比较结果
   jg trueLabel      ; 条件跳转
   jmp falseLabel    ; 无条件跳转
   ```

   **ReturnStatement**:
   ```asm
   li offset         ; 加载返回值变量
   mov ebx, 0        ; 清理标志
   ret               ; 返回
   ```

4. **处理后继块**
   - 收集所有未访问的后继块
   - 保存当前作用域快照
   - 递归访问每个后继块
   - 回溯时恢复作用域快照

#### 5.3 表达式求值

表达式求值使用栈和寄存器：

1. **二元表达式**:
   ```asm
   ; 计算 left + right
   ; 假设 left 和 right 的值已经在栈上
   pop eax           ; 弹出 right
   pop ebx           ; 弹出 left
   add eax, ebx      ; eax = left + right
   push eax          ; 结果入栈
   ```

2. **变量访问**:
   ```asm
   li offset         ; 加载变量地址
   push eax          ; 值入栈
   ```

3. **数字字面量**:
   ```asm
   mov eax, 123      ; 加载字面量
   push eax          ; 值入栈
   ```

### 输出
- 汇编代码字符串

### 示例

```c
function test(int x) {
  int y = 10;
  return y;
}
```

**生成的汇编**:
```asm
; Function: test
test:
test_entry_block:
  sub esp, 1        ; 进入作用域，分配 y 的空间
  mov eax, 10       ; 加载初始值
  si -1             ; 存储 y
  li -1             ; 加载 y
  mov ebx, 0        ; 清理标志
  ret               ; 返回
  add esp, 1        ; 退出作用域
```

## 阶段 6: 虚拟机执行

### 输入
- 汇编代码字符串

### 处理过程

1. **解析汇编代码**
   - 识别标签（`label:`）
   - 识别指令（`mov`, `add`, `sub`, `cmp`, `jmp`, `jg`, `ret` 等）
   - 识别操作数（寄存器、立即数、内存地址）

2. **初始化虚拟机状态**
   - 寄存器：`eax`, `ebx`, `ecx`, `edx`, `esp`, `ebp`, `pc`
   - 栈：数组模拟栈内存
   - 指令指针：`pc = 0`

3. **执行指令**
   - 根据 `pc` 获取下一条指令
   - 执行指令：
     - **mov**: 移动数据
     - **add/sub/mul/div**: 算术运算
     - **cmp**: 比较，设置标志位
     - **jmp/jg/jge/jl/jle/jne/je**: 跳转指令
     - **push/pop**: 栈操作
     - **li/si**: 加载/存储立即数
     - **ret**: 返回
   - 更新 `pc`（或跳转到目标地址）
   - 更新寄存器状态
   - 更新栈状态

4. **执行循环**
   - 重复执行直到遇到 `ret` 或程序结束
   - 记录执行周期数

### 输出
- 执行结果：
  - `success`: 是否成功
  - `output`: 输出信息
  - `state`: 虚拟机状态（寄存器、栈、执行周期）

### 示例

**输入汇编**:
```asm
test:
  sub esp, 1
  mov eax, 10
  si -1
  li -1
  mov ebx, 0
  ret
```

**执行过程**:
1. `sub esp, 1`: `esp = esp - 1`（分配栈空间）
2. `mov eax, 10`: `eax = 10`
3. `si -1`: 将 `eax` 的值存储到 `esp - 1` 位置
4. `li -1`: 从 `esp - 1` 加载值到 `eax`
5. `mov ebx, 0`: `ebx = 0`
6. `ret`: 返回，`eax` 为返回值

**输出**:
```json
{
  "success": true,
  "output": "函数 test: AX = 10",
  "state": {
    "registers": { "ax": 10, "bx": 0, "sp": -1, "bp": 0 },
    "cycles": 6
  }
}
```

## 总结

整个编译流程分为 6 个阶段，每个阶段都有明确的输入、处理和输出。关键的设计点包括：

1. **模块化**: 每个阶段独立，便于测试和维护
2. **AST 转换**: 通过 Checkpoint 机制显式标记作用域
3. **快照机制**: 支持 DFS 遍历中的正确回溯
4. **作用域管理**: 通过 `init` 标志精确区分变量状态

这种设计使得系统能够正确处理复杂的作用域嵌套、控制流结构和变量遮蔽规则。

