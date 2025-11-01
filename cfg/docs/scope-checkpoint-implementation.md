# 作用域管理方案：StartCheckPoint/EndCheckPoint

## 方案概述

通过在 AST 的 `BlockStatement` 中添加 `StartCheckPoint` 和 `EndCheckPoint` 标记节点，实现跨基本块的作用域管理。这种方法简单直接，避免了复杂的作用域状态追踪机制。

## 核心思路

### 基本策略

1. **在 AST 阶段添加标记**：在解析阶段，为每个 `BlockStatement` 的 `body` 前后插入标记节点
2. **标记随 CFG 分布**：生成 CFG 时，这些标记会自然地分布到各个基本块中
3. **代码生成时处理**：遇到 `StartCheckPoint` 时分配栈空间，遇到 `EndCheckPoint` 时释放栈空间

### 优势

- ✅ **简单直观**：标记点在 AST 中明确存在，无需额外状态管理
- ✅ **自动处理跨块拆分**：即使 `BlockStatement` 被拆分到多个基本块，每个块都能看到对应的标记
- ✅ **易于维护**：作用域边界清晰，调试方便

## 数据结构定义

### AST 节点扩展

```typescript
interface StartCheckPoint extends Statement {
  type: 'StartCheckPoint';
  scopeId: string;        // 唯一标识，用于与 EndCheckPoint 配对
  depth: number;          // 嵌套深度（可选，用于调试）
  varCount: number;       // 该作用域内直接声明的变量数
}

interface EndCheckPoint extends Statement {
  type: 'EndCheckPoint';
  scopeId: string;        // 对应 StartCheckPoint 的 scopeId
  depth: number;          // 必须与对应的 StartCheckPoint 一致
  varCount: number;       // 必须与对应的 StartCheckPoint 一致（用于验证）
}
```

### 作用域信息（用于代码生成）

```typescript
interface ScopeInfo {
  id: string;           // scopeId
  varCount: number;      // 变量数
  depth: number;        // 嵌套深度
  offset?: number;      // 栈偏移（可选，用于变量偏移计算）
}
```

## 实现步骤

### 步骤 1：AST 处理阶段 - 添加标记

在解析器或 AST 转换阶段，为每个 `BlockStatement` 添加标记：

```typescript
function addCheckPoints(ast: Statement, currentDepth: number = 0): Statement {
  if (ast.type === 'BlockStatement') {
    // 1. 先递归处理嵌套的 BlockStatement
    const processedBody = ast.body.map(stmt => 
      addCheckPoints(stmt, currentDepth + 1)
    );
    
    // 2. 统计当前层的直接变量声明
    //    只统计直接的 VariableDeclaration/LetDeclaration
    //    不包括嵌套 BlockStatement 内的变量
    let varCount = 0;
    for (const stmt of processedBody) {
      if (stmt.type === 'VariableDeclaration' || stmt.type === 'LetDeclaration') {
        varCount++;
      }
      // 注意：嵌套的 BlockStatement 已经被包裹了 StartCheckPoint/EndCheckPoint
      // 所以不需要统计它们的变量
    }
    
    // 3. 生成唯一的作用域 ID
    const scopeId = generateScopeId();
    
    // 4. 添加标记
    return {
      ...ast,
      body: [
        {
          type: 'StartCheckPoint',
          scopeId,
          depth: currentDepth,
          varCount
        },
        ...processedBody,
        {
          type: 'EndCheckPoint',
          scopeId,
          depth: currentDepth,
          varCount
        }
      ]
    };
  }
  
  // 处理其他可能包含 BlockStatement 的节点
  if (ast.type === 'IfStatement') {
    return {
      ...ast,
      thenBranch: addCheckPoints(ast.thenBranch, currentDepth),
      elseBranch: ast.elseBranch 
        ? addCheckPoints(ast.elseBranch, currentDepth)
        : undefined
    };
  }
  
  if (ast.type === 'WhileStatement' || ast.type === 'ForStatement') {
    return {
      ...ast,
      body: addCheckPoints(ast.body, currentDepth)
    };
  }
  
  // 其他语句类型直接返回
  return ast;
}

// 辅助函数：生成唯一作用域 ID
let scopeIdCounter = 0;
function generateScopeId(): string {
  return `scope_${scopeIdCounter++}`;
}
```

### 步骤 2：CFG 生成阶段 - 标记自然分布

CFG 生成时，`StartCheckPoint` 和 `EndCheckPoint` 会被当作普通语句处理，自然地分布到各个基本块中：

```typescript
// 在 CFG 生成器的语句处理逻辑中
function processStatements(statements: Statement[]): BasicBlock[] {
  // StartCheckPoint 和 EndCheckPoint 会被当作 Statement 类型
  // 它们会随同其他语句一起被分配到基本块中
  // 控制流语句（if/while/for）会自然地将它们拆分到不同块
  
  for (const stmt of statements) {
    if (stmt.type === 'StartCheckPoint') {
      // 这些标记会保留在基本块的 statements 数组中
      // 后续在代码生成时处理
    }
    // ... 其他语句处理
  }
}
```

### 步骤 3：代码生成阶段 - 处理标记

在生成汇编代码时，遍历基本块内的语句，遇到标记点即处理：

```typescript
function generateBlock(
  block: BasicBlock, 
  enteringScopeStack: ScopeInfo[] = []
): ScopeInfo[] {
  emitLabel(block.label);
  
  // 维护当前作用域栈（用于变量偏移计算）
  let scopeStack = [...enteringScopeStack];
  
  for (const stmt of block.statements) {
    if (stmt.type === 'StartCheckPoint') {
      // === 进入新作用域 ===
      
      // 分配栈空间
      if (stmt.varCount > 0) {
        emit(`sub esp, ${stmt.varCount}`);
      }
      
      // 更新作用域栈
      scopeStack.push({
        id: stmt.scopeId,
        varCount: stmt.varCount,
        depth: stmt.depth
      });
    }
    else if (stmt.type === 'EndCheckPoint') {
      // === 退出作用域 ===
      
      // 验证配对
      if (scopeStack.length === 0) {
        throw new Error(`Unmatched EndCheckPoint: ${stmt.scopeId}`);
      }
      
      const currentScope = scopeStack[scopeStack.length - 1];
      if (currentScope.id !== stmt.scopeId) {
        throw new Error(
          `Scope mismatch: expected ${currentScope.id}, got ${stmt.scopeId}`
        );
      }
      
      // 释放栈空间
      if (stmt.varCount > 0) {
        emit(`add esp, ${stmt.varCount}`);
      }
      
      // 更新作用域栈
      scopeStack.pop();
    }
    else {
      // === 普通语句 ===
      // 生成语句代码时，使用当前 scopeStack 计算变量偏移
      emitStatement(stmt, scopeStack);
    }
  }
  
  // 返回退出时的作用域栈，传递给后继块
  return scopeStack;
}
```

### 步骤 4：控制流传播作用域状态（可选优化）

如果有多个前驱块汇聚到一个块，可能需要合并作用域状态：

```typescript
function generateCFG(cfg: ControlFlowGraph): void {
  const scopeStates = new Map<string, ScopeInfo[]>();
  const worklist: BasicBlock[] = [cfg.entryBlock];
  
  // 入口块的作用域栈为空
  scopeStates.set(cfg.entryBlock.id, []);
  
  while (worklist.length > 0) {
    const block = worklist.shift()!;
    const enteringScopeStack = scopeStates.get(block.id) || [];
    
    // 生成当前块
    const exitingScopeStack = generateBlock(block, enteringScopeStack);
    
    // 传播到后继块
    for (const successor of block.successors) {
      if (!scopeStates.has(successor.id)) {
        scopeStates.set(successor.id, exitingScopeStack);
        worklist.push(successor);
      } else {
        // 多个前驱汇聚：验证作用域栈一致性
        const existingStack = scopeStates.get(successor.id)!;
        if (!areScopeStacksEqual(existingStack, exitingScopeStack)) {
          // 可能需要合并或报错
          // 通常情况下，汇聚块的作用域栈应该一致
          throw new Error(`Scope stack mismatch at ${successor.id}`);
        }
      }
    }
  }
}
```

## 处理示例

### 示例 1：简单嵌套

**源代码**：
```c
{
  int a = 1;
  {
    int b = 2;
  }
  int c = 3;
}
```

**AST（处理后）**：
```
BlockStatement {
  body: [
    StartCheckPoint { scopeId: "scope_0", varCount: 2 },  // a, c
    VariableDeclaration { name: 'a' },
    BlockStatement {
      body: [
        StartCheckPoint { scopeId: "scope_1", varCount: 1 },  // b
        VariableDeclaration { name: 'b' },
        EndCheckPoint { scopeId: "scope_1", varCount: 1 }
      ]
    },
    VariableDeclaration { name: 'c' },
    EndCheckPoint { scopeId: "scope_0", varCount: 2 }
  ]
}
```

**生成的汇编**：
```assembly
BB0:
  sub esp, 2        ; 进入 scope_0
  mov [ebp-offset_a], 1
  
  sub esp, 1        ; 进入 scope_1
  mov [ebp-offset_b], 2
  add esp, 1        ; 退出 scope_1
  
  mov [ebp-offset_c], 3
  add esp, 2        ; 退出 scope_0
```

### 示例 2：跨基本块的 BlockStatement

**源代码**：
```c
if (k) {
  int jj = 111;
  {
    int j = 1111;
    if (j > 0) {
      j = 222;
    }
    int j11 = 1231;
    {
      int xx = 1;
    }
  }
  int j111 = 123123;
}
```

**CFG 分布**（假设）：
- `block_A`: `int jj = 111;`, `StartCheckPoint` (嵌套块)
- `block_B`: `int j = 1111;`, `if (j > 0)`
- `block_C`: `j = 222;`
- `block_D`: `int j11 = 1231;`, `StartCheckPoint` (xx 的块), `int xx = 1;`, `EndCheckPoint`, `EndCheckPoint` (j 的块)
- `block_E`: `int j111 = 123123;`

**生成的汇编**（关键部分）：
```assembly
BB_A:
  ; if-then 作用域已在之前进入
  mov [ebp-offset_jj], 111
  sub esp, 2        ; 进入嵌套 BlockStatement（j 和 j11）

BB_D:
  mov [ebp-offset_j], 1111  ; 假设在 BB_D（实际可能在 BB_B）
  mov [ebp-offset_j11], 1231
  sub esp, 1        ; 进入 xx 的 BlockStatement
  mov [ebp-offset_xx], 1
  add esp, 1        ; 退出 xx 的 BlockStatement
  add esp, 2        ; 退出 j 的 BlockStatement

BB_E:
  mov [ebp-offset_j111], 123123
```

## 变量统计规则

### 关键原则

1. **只统计当前层直接声明的变量**
   - 只计算 `BlockStatement.body` 中直接的 `VariableDeclaration`/`LetDeclaration`
   - 不包括嵌套 `BlockStatement` 内的变量

2. **嵌套块递归处理**
   - 嵌套的 `BlockStatement` 会递归调用 `addCheckPoints`
   - 每个嵌套块都有自己的 `StartCheckPoint`/`EndCheckPoint` 对

3. **控制流结构内的变量**
   - `IfStatement.thenBranch`/`elseBranch` 如果是 `BlockStatement`，会有自己的标记
   - `WhileStatement`/`ForStatement.body` 如果是 `BlockStatement`，会有自己的标记

### 统计示例

```c
{
  int a = 1;        // +1 计入外层
  if (x) {
    int b = 2;       // 不计入外层（if-then 是独立块）
  }
  {
    int c = 3;       // 不计入外层（嵌套 BlockStatement）
    {
      int d = 4;     // 不计入外层（更深层嵌套）
    }
  }
  int e = 5;        // +1 计入外层
}
// 外层 varCount = 2 (a, e)
```

## 验证和错误检查

### 配对验证

```typescript
function validateCheckPoints(cfg: ControlFlowGraph): void {
  const scopeStack: string[] = [];
  
  for (const block of cfg.blocks) {
    for (const stmt of block.statements) {
      if (stmt.type === 'StartCheckPoint') {
        scopeStack.push(stmt.scopeId);
      } else if (stmt.type === 'EndCheckPoint') {
        if (scopeStack.length === 0) {
          throw new Error(`Unmatched EndCheckPoint: ${stmt.scopeId}`);
        }
        const expectedId = scopeStack.pop()!;
        if (expectedId !== stmt.scopeId) {
          throw new Error(
            `Scope mismatch: expected ${expectedId}, got ${stmt.scopeId}`
          );
        }
        // 验证 varCount 一致性
        // 这里需要保存 StartCheckPoint 的信息来验证
      }
    }
  }
  
  if (scopeStack.length > 0) {
    throw new Error(`Unclosed scopes: ${scopeStack.join(', ')}`);
  }
}
```

### 运行时检查

在代码生成时，每次遇到 `EndCheckPoint` 都验证：
- 作用域栈不为空
- `scopeId` 匹配
- `varCount` 匹配

## 注意事项

### 1. 空 BlockStatement 的处理

```c
{
  // 空的 BlockStatement
}
```

即使 `varCount = 0`，也要保留 `StartCheckPoint` 和 `EndCheckPoint`，以确保配对正确。

### 2. 变量偏移计算

生成普通语句时，需要使用当前 `scopeStack` 来计算变量的栈偏移：

```typescript
function calculateOffset(varName: string, scopeStack: ScopeInfo[]): number {
  // 从当前作用域开始查找变量
  // 需要考虑所有活跃作用域的变量总数
  // ...
}
```

### 3. 作用域栈的一致性

如果多个基本块汇聚到一个块，它们的作用域栈应该一致。如果不同，可能需要：
- 在汇聚点统一作用域状态
- 或者报错（说明 CFG 构造有问题）

### 4. 调试信息

可以保留 `depth` 信息用于调试：
- 打印作用域栈时可以看到嵌套层级
- 出错时更容易定位问题

## 扩展：支持其他作用域类型

如果后续需要支持其他作用域（如 `ForStatement` 的独立作用域），可以扩展：

```typescript
interface StartCheckPoint {
  type: 'StartCheckPoint';
  scopeId: string;
  depth: number;
  varCount: number;
  scopeType?: 'block' | 'for' | 'if-then' | 'if-else';  // 可选的作用域类型
}
```

## 总结

这个方案通过简单的标记节点，实现了跨基本块的作用域管理：

1. ✅ **AST 阶段**：添加 `StartCheckPoint`/`EndCheckPoint` 标记
2. ✅ **CFG 阶段**：标记随语句自然分布到各个基本块
3. ✅ **代码生成**：遇到标记即分配/释放栈空间
4. ✅ **自动处理**：跨块拆分由标记点自动处理

关键优势是简单、清晰、易于维护。

