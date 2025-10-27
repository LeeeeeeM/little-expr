# CFG与作用域分析

## 概述

本文档总结了CFG（控制流图）与作用域分析的关系，以及如何在编译器中正确处理这两者的职责分工。

## CFG的职责

### 核心作用
CFG主要负责**控制流管理**，即程序执行的路径和跳转指令。

### 具体职责
- **跳转指令生成**：`jmp`, `je`, `jne`, `jle` 等
- **控制流路径**：程序执行的路径
- **基本块划分**：确定跳转的边界
- **死代码识别**：识别永远不会执行的代码

### CFG不负责的内容
- **变量声明**：`let x = 10`
- **作用域管理**：变量的生命周期
- **类型信息**：变量的类型
- **栈帧管理**：`sub esp, 4` 等

## 作用域信息的职责

### 核心作用
作用域信息主要负责**变量管理**，即变量的声明、生命周期和作用域。

### 具体职责
- **变量声明**：`let x = 10`
- **作用域嵌套**：`{ let y = 20; }`
- **变量生命周期**：变量的作用域范围
- **栈帧管理**：`sub esp, 4` 等

### 作用域信息不负责的内容
- **跳转指令**：`jmp`, `je` 等
- **控制流路径**：程序执行的路径

## CFG与作用域的关系

### 职责分工
```
CFG = 跳转指令（jmp）
作用域信息 = 变量管理
```

### 实际例子
```javascript
function test() {
    let x = 10;        // 作用域信息
    if (x > 5) {      // CFG: 条件跳转
        let y = 20;    // 作用域信息: 嵌套作用域
        return y;      // CFG: 跳转到函数出口
    }
    return x;          // CFG: 跳转到函数出口
}
```

**CFG负责的部分**：
```assembly
; 控制流部分
cmp eax, 5
jg label1          ; CFG: 条件跳转
jmp label2         ; CFG: 无条件跳转

label1:
    jmp exit       ; CFG: 跳转到函数出口

label2:
    jmp exit       ; CFG: 跳转到函数出口
```

**作用域信息负责的部分**：
```assembly
; 变量管理部分
sub esp, 8         ; 作用域: 为x和y分配栈空间
mov [esp+4], 10    ; 作用域: 初始化x
mov [esp], 20      ; 作用域: 初始化y (嵌套作用域)
add esp, 8         ; 作用域: 释放栈空间
```

## 智能合并

### 原理
智能合并基于一个关键洞察：**如果某个控制流路径总是会终止（如return），那么后续的合并块就是不必要的**。

### 检测机制
```typescript
private endsWithReturn(block: BasicBlock): boolean {
  if (block.statements.length === 0) {
    return false;
  }
  
  const lastStatement = block.statements[block.statements.length - 1]!;
  return lastStatement.type === 'ReturnStatement';
}
```

### 三种智能合并场景

#### 1. if语句智能合并
```typescript
if (this.smartMerging) {
  const thenReturns = this.endsWithReturn(thenExit);
  const elseReturns = ifStmt.elseBranch ? this.endsWithReturn(elseExit) : false;

  if (thenReturns && elseReturns) {
    // 两个分支都返回，不需要合并块
    // 创建虚拟合并块保持死代码独立性
    const mergeBlock = this.newBlock();
    this.connectBlocks(thenExit, mergeBlock);
    this.connectBlocks(elseExit, mergeBlock);
    return { blocks, entry: currentBlock, exit: mergeBlock };
  }
}
```

#### 2. while循环智能合并
```typescript
if (this.smartMerging && this.endsWithReturn(bodyExit)) {
  // 循环体总是返回，不需要循环回退
  this.connectBlocks(loopHeader, loopBodyEntry);
  this.connectBlocks(loopHeader, loopExit);
  // 不连接 bodyExit 到 loopHeader，因为总是返回
} else {
  // 正常循环逻辑
  this.connectBlocks(bodyExit, loopHeader); // 循环回退
}
```

#### 3. for循环智能合并
```typescript
if (this.smartMerging && this.endsWithReturn(bodyExit)) {
  // 循环体总是返回，不需要循环回退
  this.connectBlocks(loopHeader, loopBodyEntry);
  this.connectBlocks(loopHeader, loopExit);
  // 不连接 bodyExit 到 loopUpdate，因为总是返回
} else {
  // 正常循环逻辑
  this.connectBlocks(bodyExit, loopUpdate);
  this.connectBlocks(loopUpdate, loopHeader);
}
```

### 优化效果
- **减少基本块数量**：从6个减少到5个
- **简化控制流**：消除不必要的合并路径
- **优化结构**：相关语句合并到同一块
- **提高效率**：为后续优化提供更好的基础

## 子块信息处理

### 问题
CFG合并会丢失子块信息，但动态栈管理需要子块信息。

### 解决方案：保留子块信息

#### 1. CFG扩展
```typescript
export interface BasicBlock {
  id: string;
  statements: Statement[];
  predecessors: BasicBlock[];
  successors: BasicBlock[];
  isEntry?: boolean;
  isExit?: boolean;
  
  // 子块信息
  subBlocks: SubBlockInfo[];
}

export interface SubBlockInfo {
  startStatement: number;
  endStatement: number;
  variables: VariableInfo[];
  scopeLevel: number;
}
```

#### 2. 优势
- **设计清晰**：职责分离，信息完整
- **性能优秀**：O(1)访问，无需重复计算
- **扩展性好**：易于添加新功能
- **维护性强**：调试和维护更方便
- **内存效率高**：避免重复创建对象

#### 3. 实现
```typescript
export class CFGGenerator {
  generateFunctionCFG(funcDecl: FunctionDeclaration): ControlFlowGraph {
    const cfg = new ControlFlowGraph();
    
    // 生成基本块
    const blocks = this.generateBlocks(funcDecl);
    
    // 为每个块注入子块信息
    for (const block of blocks) {
      block.subBlocks = this.analyzeSubBlocks(block);
    }
    
    return cfg;
  }
  
  private analyzeSubBlocks(block: BasicBlock): SubBlockInfo[] {
    const subBlocks: SubBlockInfo[] = [];
    
    for (let i = 0; i < block.statements.length; i++) {
      const stmt = block.statements[i]!;
      
      if (stmt.type === 'BlockStatement') {
        const subBlock: SubBlockInfo = {
          startStatement: i,
          endStatement: i,
          variables: this.collectVariables(stmt as BlockStatement),
          scopeLevel: 1
        };
        subBlocks.push(subBlock);
      }
    }
    
    return subBlocks;
  }
}
```

## 动态栈管理

### 原理
动态栈管理基于子块信息，在进入新块时分配栈空间，退出块时释放栈空间。

### 实现
```typescript
export class DynamicStackGenerator {
  generateStackManagement(block: BasicBlock): AssemblyInstruction[] {
    const instructions: AssemblyInstruction[] = [];
    
    // 分析块中的子块
    const subBlocks = block.subBlocks;
    
    // 为每个子块生成栈管理代码
    for (const subBlock of subBlocks) {
      const totalSize = subBlock.variables.reduce((sum, var) => sum + var.size, 0);
      
      if (totalSize > 0) {
        // 子块开始：分配栈空间
        instructions.push({
          opcode: 'sub',
          operands: ['esp', totalSize.toString()],
          comment: `allocate space for sub-block variables: ${subBlock.variables.map(v => v.name).join(', ')}`
        });
        
        // 初始化变量
        for (const variable of subBlock.variables) {
          if (variable.initializer) {
            instructions.push({
              opcode: 'mov',
              operands: [`[esp+${variable.offset}]`, variable.initializer],
              comment: `initialize ${variable.name}`
            });
          }
        }
      }
    }
    
    return instructions;
  }
}
```

### 具体例子
```javascript
function test() {
    let x = 10;
    {                  // 子块1开始
        let y = 20;
        {              // 子块2开始
            let z = 30;
        }              // 子块2结束
    }                  // 子块1结束
    return x;
}
```

**生成的汇编代码**：
```assembly
; 函数入口
push ebp
mov ebp, esp
sub esp, 4          ; 为x分配空间

; 初始化x
mov [esp], 10

; 子块1开始
sub esp, 8          ; 为y和z分配空间

; 初始化y
mov [esp+4], 20

; 子块2开始
sub esp, 4          ; 为z分配空间

; 初始化z
mov [esp], 30

; 子块2结束
add esp, 4          ; 释放z的空间

; 子块1结束
add esp, 8          ; 释放y和z的空间

; 函数出口
mov eax, [esp+8]    ; 返回x
mov esp, ebp
pop ebp
ret
```

## 编译流程

### 完整流程
```
AST → 语义分析 → 作用域信息
  ↓
AST → CFG生成 → CFG（包含子块信息）
  ↓
CFG + 作用域信息 → 代码生成 → 汇编代码
```

### 各阶段职责
1. **AST分析**：提取语义信息（变量、作用域、类型）
2. **CFG生成**：生成控制流图（包含子块信息）
3. **代码生成**：结合CFG和作用域信息生成汇编代码

### 关键点
- **语义信息从AST获取**：作用域、变量、类型等信息
- **CFG提供控制流骨架**：程序执行的路径
- **子块信息保留在CFG中**：支持动态栈管理
- **编译时分析**：子块信息在编译时分析一次即可

## 总结

### 核心观点
1. **CFG = 跳转指令（jmp）**：负责控制流管理
2. **作用域信息 = 变量管理**：负责变量声明和生命周期
3. **智能合并优化CFG结构**：减少不必要的合并块
4. **子块信息保留在CFG中**：支持动态栈管理
5. **编译时分析**：语义信息从AST获取，CFG提供控制流骨架

### 设计原则
- **职责分离**：CFG专注控制流，作用域专注变量管理
- **信息完整**：保留必要的子块信息
- **性能优化**：编译时分析，运行时执行
- **扩展性**：易于添加新功能和优化

### 实际应用
- **跳转指令生成**：基于CFG生成jump指令
- **动态栈管理**：基于子块信息管理栈空间
- **死代码消除**：基于CFG识别死代码
- **控制流优化**：基于CFG进行跳转优化

这种设计既保持了CFG的简洁性，又能支持复杂的作用域管理和动态栈管理，为后续的优化和代码生成提供了完整的信息基础。
