# 函数调用栈空间分配机制

## 问题1：函数调用时如何分配空间？

### 调用者（Caller）的职责

```assembly
; 假设调用 multiply(5, 10)
mov eax, 10          ; 计算第二个参数
push eax             ; 从右到左压栈：push arg2
mov eax, 5           ; 计算第一个参数
push eax             ; push arg1
call multiply        ; 压入返回地址并跳转
add esp, 2           ; 调用者清理参数栈（2个参数）
```

**调用者的栈操作**：
1. 计算参数值（结果在 `eax`）
2. 从右到左压栈：`push eax`
3. `call` 指令自动将返回地址压栈
4. 函数返回后，使用 `add esp, N` 清理参数栈

### 被调用者（Callee）的职责

```assembly
multiply:
  push ebp              ; 保存调用者的 ebp
  mov ebp, esp           ; 建立新的栈帧（ebp 现在指向保存的 ebp 位置）
  
  ; 局部变量分配（如果有）
  sub esp, N             ; 分配局部变量空间（栈向下增长）
  
  ; ... 函数体 ...
  
  ; 函数返回
  add esp, N             ; 释放局部变量空间
  pop ebp                ; 恢复调用者的 ebp
  ret                    ; 弹出返回地址并跳回
```

**被调用者的栈操作**：
1. `push ebp`：保存调用者的 ebp（栈向下增长）
2. `mov ebp, esp`：建立新栈帧，此时 ebp 指向保存的 ebp
3. `sub esp, N`：为局部变量分配空间（栈向下增长）
4. 函数返回时反向操作

### 栈布局示例

假设调用 `multiply(5, 10)`，函数内有一个局部变量 `result`：

```
调用前（sp = 1023）:
  [1023] ... (调用者的数据)

调用者压栈后（sp = 1020）:
  [1023] ... (调用者的数据)
  [1022] 10  ← arg2 (最后压入)
  [1021] 5   ← arg1
  [1020] 14  ← 返回地址 (call 指令压入，sp = 1020)

被调用者建立栈帧后（sp = 1019）:
  [1023] ... (调用者的数据)
  [1022] 10  ← arg2 (ebp+3)
  [1021] 5   ← arg1 (ebp+2)
  [1020] 14  ← 返回地址
  [1019] 1023 ← 旧的 ebp (push ebp, sp = 1019)
  [1018] ?   ← result 局部变量 (ebp-1, sp = 1018)

ebp = 1019（指向保存的 ebp 位置）
sp = 1018（指向局部变量区域）
```

**参数访问**：
- `arg1`（第一个参数）：`ebp + 2`（跳过返回地址和旧 ebp）
- `arg2`（第二个参数）：`ebp + 3`
- `argN`（第N个参数）：`ebp + (N + 1)`

## 问题2：参数数量不匹配时的处理

### 当前实现的问题

**现状**：代码中**没有检查参数数量是否匹配**

```typescript
// allocator/src/assembly-generator.ts:869-888
// 1. 准备参数（从右向左压栈）
for (let i = call.arguments.length - 1; i >= 0; i--) {
  // 只 push 实际传入的参数数量
  lines.push('push eax');
}

// 2. 调用函数
lines.push(`call ${funcName}`);

// 3. 清理参数栈
lines.push(`add esp, ${call.arguments.length}`);  // 使用实际传入的参数数量
```

**问题场景**：函数定义2个参数，但只传入1个

```c
int multiply(int a, int b) {
    return a * b;  // 访问 b 时会读取 ebp+3 的位置
}

int main() {
    int result = multiply(5);  // 只传了1个参数
    return result;
}
```

**生成的汇编**：
```assembly
; 调用者（只 push 1个参数）
mov eax, 5
push eax           ; 只 push arg1
call multiply
add esp, 1         ; 只清理1个参数

; 被调用者
multiply:
  push ebp
  mov ebp, esp
  ; 访问 a (ebp+2): 正常，值是 5
  ; 访问 b (ebp+3): 错误！读取的是栈上的垃圾数据
```

### 参数访问机制

```typescript
// allocator/src/scope-manager.ts:96-99
const paramIndex = this.functionParameters.indexOf(name);
if (paramIndex !== -1) {
  return paramIndex + 2; // 参数从 ebp+2 开始
}
```

- 第一个参数（`paramIndex = 0`）：`ebp + 2`
- 第二个参数（`paramIndex = 1`）：`ebp + 3`
- 如果只传入1个参数，第二个参数位置（`ebp + 3`）会读取到栈上的**垃圾数据**或**未初始化数据**

### 潜在后果

1. **未定义行为**：访问未传入的参数会读取到栈上的随机值
2. **栈不平衡**：如果函数返回时清理了错误数量的参数，可能导致栈指针错乱
3. **程序崩溃**：如果访问的参数位置是无效内存，可能导致程序崩溃

### 建议的改进

应该在**解析阶段**或**编译阶段**检查参数数量：

```typescript
// 在生成函数调用代码时检查参数数量
private generateFunctionCall(call: any): string {
  const funcName = call.functionName || (call.callee && call.callee.name);
  
  // 查找函数定义
  const funcDef = this.findFunctionDefinition(funcName);
  
  if (funcDef) {
    const expectedParams = funcDef.parameters.length;
    const actualArgs = call.arguments.length;
    
    if (expectedParams !== actualArgs) {
      throw new Error(
        `Function '${funcName}' expects ${expectedParams} arguments, ` +
        `but ${actualArgs} were provided`
      );
    }
  }
  
  // ... 生成调用代码
}
```

或者在前端解析阶段添加检查：

```typescript
// 在 parser 中，解析函数调用后立即检查
private parseFunctionCall(callee: Identifier): FunctionCall {
  const funcInfo = this.findFunctionInScope(callee.name);
  const args = this.parseArgumentList();
  
  if (funcInfo && funcInfo.parameters.length !== args.length) {
    this.addError(
      `Function '${callee.name}' expects ${funcInfo.parameters.length} ` +
      `arguments, but ${args.length} were provided`
    );
  }
  
  return ASTFactory.createFunctionCall(callee, args);
}
```

