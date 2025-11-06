# CFG 编译器架构文档

## 📋 目录

1. [系统概述](#系统概述)
2. [核心模块](#核心模块)
3. [数据流](#数据流)
4. [关键设计决策](#关键设计决策)

## 系统概述

本系统是一个基于控制流图（CFG）的编译器，将高级语言源代码编译为汇编代码，并通过虚拟机执行。系统采用模块化设计，包含词法分析、语法分析、AST转换、CFG生成、作用域管理、汇编代码生成等核心模块。

### 主要功能

- **词法分析**: 将源代码转换为 Token 序列
- **语法分析**: 构建抽象语法树（AST）
- **作用域标记**: 为 BlockStatement 添加作用域检查点
- **CFG 生成**: 将 AST 转换为控制流图
- **作用域管理**: 管理变量声明、作用域嵌套和栈偏移
- **汇编生成**: 从 CFG 生成汇编代码
- **虚拟机执行**: 执行生成的汇编代码

## 核心模块

### 1. 词法分析器 (lexer.ts)

**职责**: 将源代码字符串转换为 Token 序列

**关键功能**:
- 识别关键字（if, while, for, return, int, let, function 等）
- 识别操作符（+, -, *, /, ==, !=, <, >, <=, >= 等）
- 识别标识符和数字字面量
- 处理空白字符和注释

**输出**: Token 数组

### 2. 语法分析器 (parser.ts)

**职责**: 将 Token 序列解析为抽象语法树（AST）

**关键功能**:
- 解析表达式（二元表达式、一元表达式、函数调用等）
- 解析语句（变量声明、赋值、控制流语句等）
- 解析函数声明
- 构建完整的程序 AST

**输出**: `Program` AST 节点

### 3. Checkpoint 转换器 (checkpoint-transformer.ts)

**职责**: 为 BlockStatement 添加作用域检查点标记

**关键功能**:
- 遍历 AST，识别所有 BlockStatement
- 在 BlockStatement 开始处插入 `StartCheckPoint` 节点
- 在 BlockStatement 结束处插入 `EndCheckPoint` 节点
- 为每个作用域生成唯一 ID

**设计原因**: 
- 显式标记作用域边界，便于在 CFG 遍历时管理作用域
- 支持作用域的动态创建和销毁

**输出**: 转换后的 AST（包含 StartCheckPoint/EndCheckPoint 节点）

### 4. CFG 生成器 (cfg-generator.ts)

**职责**: 将 AST 转换为控制流图（CFG）

**关键功能**:
- **识别基本块边界**: 
  - 程序/函数入口点
  - 控制流语句（if, while, for, return）
  - 跳转目标（标签）
- **构建基本块**: 
  - 为每个基本块分配唯一 ID
  - 收集块内的语句
  - 分析控制流，建立前驱/后继关系
- **处理控制流结构**:
  - `if-else`: 条件块 → true分支块 + false分支块 → 合并块
  - `while`: 条件块 → 循环体块 → 条件块（循环）
  - `for`: 初始化块 → 条件块 → 循环体块 → 更新块 → 条件块（循环）
  - `return`: 直接连接到函数出口块
- **作用域快照**: 为每个基本块保存作用域快照（用于 DFS 回溯）

**输出**: `ControlFlowGraph[]`（每个函数一个 CFG）

### 5. 作用域管理器 (scope-manager.ts)

**职责**: 管理变量作用域、栈偏移和初始化状态

**关键功能**:
- **作用域栈管理**:
  - `enterScope(variableNames)`: 进入新作用域，为变量分配栈偏移
  - `exitScope()`: 退出当前作用域
- **变量管理**:
  - `markVariableInitialized(name)`: 标记变量为已初始化（声明时调用）
  - `getVariableOffset(name)`: 获取变量的栈偏移（只返回已初始化的变量）
  - `getVariableInfo(name)`: 获取变量的完整信息（offset + init 状态）
- **快照机制**:
  - `saveSnapshot()`: 保存当前作用域链的深拷贝
  - `restoreSnapshot(snapshot)`: 从快照恢复作用域链
- **作用域遮蔽规则**: 内层作用域变量遮蔽外层同名变量

**关键设计**:
- 变量在 `enterScope` 时分配 offset，但 `init: false`
- 只有在 `int x` 或 `let x` 声明时，才调用 `markVariableInitialized`，设置 `init: true`
- 查找变量时，只返回 `init: true` 的变量，支持正确的遮蔽规则

### 6. 汇编生成器 (assembly-generator.ts)

**职责**: 从 CFG 生成汇编代码

**关键功能**:
- **DFS 遍历 CFG**: 从入口块开始深度优先遍历
- **栈管理**:
  - 进入作用域时：`sub esp, n`（分配栈空间）
  - 退出作用域时：`add esp, n`（释放栈空间）
- **语句翻译**:
  - 变量声明：`mov eax, value; si offset`（存储到栈）
  - 变量赋值：`li offset; mov eax, value; si offset`
  - 表达式求值：使用栈和寄存器（eax, ebx）
  - 条件跳转：`cmp eax, ebx; jg/jge/jle/jl/jne/je label`
  - 无条件跳转：`jmp label`
  - 函数返回：`li offset; mov ebx, 0; ret`
- **快照机制**: 在进入已访问块时恢复作用域快照

**输出**: 汇编代码字符串

### 7. 编译器 (compiler.ts)

**职责**: 整合所有模块，提供统一的编译接口

**编译流程**:
1. AST 转换：添加作用域检查点
2. CFG 生成：为每个函数生成 CFG
3. 汇编生成：为每个函数生成汇编代码

**输出**: `CompileResult`（包含 CFG、汇编代码、符号表等）

### 8. 虚拟机运行器 (vm-runner.ts)

**职责**: 执行编译后的汇编代码

**关键功能**:
- 解析汇编代码
- 模拟 CPU 执行（寄存器、栈、指令）
- 输出执行结果

## 数据流

```
源代码 (sourceCode)
    ↓
词法分析器 (lexer.ts)
    ↓
Token 序列
    ↓
语法分析器 (parser.ts)
    ↓
AST (Program)
    ↓
Checkpoint 转换器 (checkpoint-transformer.ts)
    ↓
转换后的 AST (包含 StartCheckPoint/EndCheckPoint)
    ↓
CFG 生成器 (cfg-generator.ts)
    ↓
ControlFlowGraph[]
    ↓
汇编生成器 (assembly-generator.ts) + 作用域管理器 (scope-manager.ts)
    ↓
汇编代码 (Assembly)
    ↓
虚拟机 (assembly-vm.ts)
    ↓
执行结果
```

## 关键设计决策

### 1. 作用域检查点机制

**问题**: 如何在 CFG 遍历时正确管理作用域？

**解决方案**: 
- 在 AST 转换阶段，为每个 BlockStatement 添加 `StartCheckPoint` 和 `EndCheckPoint` 标记
- 在 CFG 遍历时，遇到 `StartCheckPoint` 创建作用域，遇到 `EndCheckPoint` 销毁作用域
- 这样可以将作用域管理逻辑与 CFG 结构解耦

### 2. 变量初始化状态 (init 标志)

**问题**: 如何区分"已声明但未初始化"和"已初始化"的变量？

**解决方案**:
- 在 `VariableInfo` 中添加 `init: boolean` 标志
- 在 `enterScope` 时，所有变量 `init: false`
- 只有在 `int x` 或 `let x` 声明时，调用 `markVariableInitialized`，设置 `init: true`
- 查找变量时，只返回 `init: true` 的变量
- 支持正确的遮蔽规则：内层未初始化的变量不会遮蔽外层已初始化的同名变量

### 3. DFS 遍历与快照机制

**问题**: 在 CFG 的 DFS 遍历中，如何正确处理分支和回溯时的作用域状态？

**解决方案**:
- 在进入基本块时，保存当前作用域快照到 `block.scopeSnapshot`
- 在回溯时，如果重新访问已访问的块，从快照恢复作用域状态
- 使用深拷贝确保快照的独立性

### 4. 基本块边界识别

**问题**: 如何正确识别基本块的边界？

**解决方案**:
- **块开始条件**:
  - 程序/函数入口
  - 控制流语句的目标（if/while/for 条件）
  - 标签位置
- **块结束条件**:
  - 控制流语句（if, while, for, return, break, continue）
  - 函数返回
  - 程序结束

### 5. Return 语句处理

**问题**: Return 语句块应该有几个后继？

**解决方案**:
- Return 语句块只有一个后继：函数的出口块
- 即使 Return 语句在条件分支中，也只连接到出口块，不连接到后续的代码块
- 这确保了正确的控制流：返回后不会继续执行后续代码

## 模块依赖关系

```
compiler.ts
    ├── checkpoint-transformer.ts
    ├── cfg-generator.ts
    │   └── ast.ts, types.ts
    ├── scope-manager.ts
    └── assembly-generator.ts
        ├── cfg-generator.ts
        └── scope-manager.ts

vm-runner.ts
    ├── compiler.ts
    ├── parser.ts
    │   ├── lexer.ts
    │   └── ast.ts, types.ts
    └── assembly-vm.ts
```

## 总结

本系统采用经典编译器设计，将编译过程分解为多个清晰的阶段。关键创新点在于：
1. **Checkpoint 机制**: 显式标记作用域边界，简化作用域管理
2. **init 标志**: 精确区分变量声明和初始化状态
3. **快照机制**: 支持 DFS 遍历中的正确回溯

这种设计使得系统能够正确处理复杂的作用域嵌套、控制流结构和变量遮蔽规则。

