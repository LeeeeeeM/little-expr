# 指针操作实现说明

## 测试文件
`tests/test-pointer.txt` - 指针操作测试用例

## 需要实现的功能

### 1. 词法分析器（Lexer）扩展

#### 1.1 支持取地址操作符 `&`
- 当前状态：`&` 只被识别为 `&&` 的一部分，单独的 `&` 会报错
- 需要修改：在 `lexer.ts` 的 `readOperator()` 方法中，添加对单独 `&` 的支持
- 建议：添加新的 TokenType `ADDRESS_OF = 'ADDRESS_OF'`

#### 1.2 支持指针声明和解引用操作符 `*`
- 当前状态：`*` 被识别为 `MUL`（乘法操作符）
- 需要修改：需要区分 `*` 的两种用法：
  - 在类型声明中：`int *p;` - 作为类型修饰符
  - 在表达式中：`*p` - 作为解引用操作符
- 建议：添加新的 TokenType `DEREFERENCE = 'DEREFERENCE'` 或 `POINTER = 'POINTER'`

### 2. 语法分析器（Parser）扩展

#### 2.1 类型系统扩展
- 需要支持指针类型：`int*` 表示指向 `int` 的指针
- 类型定义扩展：
  ```typescript
  type Type = 
    | { kind: 'int' }
    | { kind: 'pointer', baseType: Type }  // int* -> { kind: 'pointer', baseType: { kind: 'int' } }
  ```

#### 2.2 声明解析
- 解析指针声明：`int *p;`
  - 需要识别 `*` 是类型的一部分，不是变量名的一部分
  - 解析结果：`{ type: { kind: 'pointer', baseType: 'int' }, name: 'p' }`

#### 2.3 表达式解析
- 取地址表达式：`&a`
  - 操作符优先级：`&` 是前缀一元操作符
  - AST 节点：`{ kind: 'AddressOf', operand: identifier('a') }`
  
- 解引用表达式：`*p`
  - 操作符优先级：`*` 是前缀一元操作符（在表达式中）
  - AST 节点：`{ kind: 'Dereference', operand: identifier('p') }`

#### 2.4 赋值解析
- 解引用赋值：`*p = 123;`
  - 左值（L-value）处理：`*p` 作为赋值目标
  - 需要识别这是"写入指针指向的地址"，而不是"给指针变量赋值"

### 3. 代码生成（Code Generator）扩展

#### 3.1 变量存储
- 普通变量：在栈上分配空间，用地址访问
- 指针变量：也在栈上分配空间，但存储的是地址值

#### 3.2 取地址操作 `&a`
```assembly
; 假设 a 在栈上的地址是 [bp-1]（每个变量占 1 个地址单位）
; 需要将地址值（bp-1）加载到寄存器或栈上
mov ax, bp
sub ax, 1    ; ax 现在存储 a 的地址
```

#### 3.3 解引用读取 `*p`
```assembly
; 假设 p 在栈上的地址是 [bp-2]，p 的值是某个地址
; 1. 先从 [bp-2] 读取 p 的值（地址）
mov ax, [bp-2]   ; ax = p 的值（地址）
; 2. 再从该地址读取值
mov bx, [ax]     ; bx = *p 的值
```

#### 3.4 解引用赋值 `*p = 123`
```assembly
; 1. 读取 p 的值（地址）
mov ax, [bp-2]   ; ax = p 的值（地址）
; 2. 将 123 写入该地址
mov [ax], 123    ; *p = 123
```

### 4. 类型检查（Type Checker）

#### 4.1 指针类型匹配
- `p = &a;` 需要检查：
  - `p` 的类型是 `int*`
  - `&a` 的类型也是 `int*`（如果 `a` 是 `int` 类型）
  
- `*p = 123;` 需要检查：
  - `*p` 的类型是 `int`（如果 `p` 是 `int*`）
  - `123` 的类型也是 `int`

#### 4.2 类型推断
- 从声明推断指针类型
- 从取地址操作推断指针类型

## 实现顺序建议

1. **第一步**：扩展 Lexer 支持 `&` 和 `*` 操作符
   - 添加 `ADDRESS_OF` TokenType
   - 添加 `DEREFERENCE` TokenType
   - 修改 `readOperator()` 方法

2. **第二步**：扩展 Parser 支持指针类型声明
   - 扩展类型系统支持指针类型
   - 修改变量声明解析

3. **第三步**：扩展 Parser 支持取地址和解引用表达式
   - 添加 `AddressOf` 和 `Dereference` AST 节点
   - 修改表达式解析

4. **第四步**：扩展 VM 支持间接寻址指令
   - 添加间接寻址支持：`[寄存器]` 格式
   - 扩展 `mov` 指令支持间接寻址
   - 或者添加专门的间接寻址指令

5. **第五步**：扩展 Code Generator 生成指针操作汇编代码
   - 实现取地址操作代码生成
   - 实现解引用读取代码生成
   - 实现解引用赋值代码生成

6. **第六步**：添加类型检查
   - 指针类型匹配检查
   - 类型推断

## 测试用例说明

`tests/test-pointer.txt` 包含以下测试场景：

```c
int main() {
    int a = 1;      // 声明并初始化变量 a = 1
    int *p;         // 声明指针变量 p（指向 int）
    p = &a;         // 将 a 的地址赋值给 p
    *p = 123;       // 通过指针 p 修改 a 的值为 123
    return a;       // 返回 a 的值，应该是 123
}
```

**预期结果**：
- 编译成功
- 执行成功
- 返回值（AX 寄存器）应该是 123

## 当前状态

- ❌ Lexer 不支持单独的 `&` 操作符
- ❌ Lexer 不支持指针声明中的 `*`
- ❌ Parser 不支持指针类型
- ❌ Parser 不支持取地址表达式
- ❌ Parser 不支持解引用表达式
- ❌ VM 不支持间接寻址 `[寄存器]` 格式
- ❌ VM 不支持 `lea` 指令（地址计算）
- ❌ Code Generator 不支持指针操作代码生成
- ❌ 类型系统不支持指针类型

## VM 设计说明：变量大小和地址对齐

### 当前设计：每个变量占 1 个地址单位

**重要设计选择**：在当前 VM 实现中，每个变量（包括 `int` 类型）只占 **1 个地址单位**，而不是像真实 x86 架构那样占 4 个字节。

**示例**：
```c
int a = 1;    // 变量 a 在 [bp-1]，占 1 个地址单位
int b = 2;    // 变量 b 在 [bp-2]，占 1 个地址单位
int *p;       // 指针变量 p 在 [bp-3]，也占 1 个地址单位（存储地址值）
```

**对比真实 x86**：
- 真实 x86：`int` 占 4 字节，变量地址通常是 4 的倍数（对齐）
- 当前 VM：`int` 占 1 个地址单位，变量地址连续（-1, -2, -3...）

### 这个设计的影响

#### 优点
1. **简单**：地址计算简单，每个变量占 1 个单位
2. **一致**：所有变量（包括指针）都占 1 个单位
3. **足够**：对于教学和演示目的，这个设计已经足够

#### 缺点
1. **不真实**：与真实 x86 架构不同
2. **限制**：如果将来需要支持更大的数据类型（如 `long`、`double`），需要修改

#### 对指针操作的影响
**好消息**：只要设计一致，指针操作仍然可以正常工作！

**示例**（假设 `bp = 1020`）：
- 变量 `a` 在地址 `[bp-1] = 1019`（占 1 个单位）
- 变量 `p` 在地址 `[bp-2] = 1018`（占 1 个单位）
- 指针 `p` 存储地址值 `1019`（a 的地址）
- `*p` 通过地址 `1019` 访问变量 `a`

只要地址系统一致，指针操作就能正常工作。

### 如果需要改为 4 字节对齐

如果将来需要更真实的实现，需要修改：

1. **ScopeManager**：变量 offset 需要乘以 4
   ```typescript
   // 当前：offset = -(prevScopeVarCount + i + 1)
   // 改为：offset = -(prevScopeVarCount + i + 1) * 4
   ```

2. **AssemblyGenerator**：栈分配需要乘以 4
   ```assembly
   // 当前：sub esp, 1
   // 改为：sub esp, 4
   ```

3. **地址计算**：所有地址计算需要考虑 4 字节对齐

**但当前设计已经足够支持指针操作！**

---

## VM 需要添加的汇编指令支持

### 当前状态分析

现有的 VM 支持以下内存访问方式：
- `[数字]` - 绝对地址访问（例如 `[1020]`）
- `si offset` - 存储到 `bp + offset`
- `li offset` - 从 `bp + offset` 加载
- `mov` 指令支持寄存器、立即数和 `[数字]` 格式

**关键缺失**：**间接寻址（Indirect Addressing）**

### 需要添加的指令支持

#### 方案 1：使用 `[]` 语法（标准 x86 风格）

需要支持寄存器间接寻址，例如：
- `mov ax, [bx]` - 从 bx 寄存器中存储的地址读取值到 ax
- `mov [bx], 123` - 将 123 写入 bx 寄存器中存储的地址

**实现方式**：
- 扩展 `getValue()` 方法，支持 `[ax]`、`[bx]` 等格式
- 扩展 `setValue()` 方法，支持 `[ax]`、`[bx]` 等格式

**示例代码**：
```typescript
// 在 getValue() 中添加
const indirectMatch = operand.match(/^\[(ax|bx|sp|bp)\]$/);
if (indirectMatch) {
  const regName = indirectMatch[1]!;
  const address = this.state.registers.get(regName) || 0;
  return this.state.stack.get(address) || 0;
}

// 在 setValue() 中添加
const indirectMatch = operand.match(/^\[(ax|bx|sp|bp)\]$/);
if (indirectMatch) {
  const regName = indirectMatch[1]!;
  const address = this.state.registers.get(regName) || 0;
  this.state.stack.set(address, value);
  return;
}
```

#### 方案 2：不使用 `[]` 语法（推荐，与现有指令风格一致）

参考现有的 `si` 和 `li` 指令风格，添加类似的间接寻址指令：

**新增指令**：

1. **`lir reg`** - Load Indirect from Register（从寄存器间接加载）
   - 功能：从 `reg` 寄存器中存储的地址读取值到 `ax`
   - 格式：`lir ax` 或 `lir bx`
   - 示例：
     ```assembly
     li -2             ; ax = p 的值（地址，例如 1019）
     lir ax            ; ax = *p（从地址 1019 读取值）
     ```

2. **`sir reg`** - Store Indirect to Register（间接存储到寄存器指向的地址）
   - 功能：将 `ax` 的值写入 `reg` 寄存器中存储的地址
   - 格式：`sir ax` 或 `sir bx`
   - 示例：
     ```assembly
     li -2             ; ax = p 的值（地址，例如 1019）
     mov bx, ax        ; bx = p 的值（保存地址到 bx）
     mov ax, 123       ; ax = 123
     sir bx            ; *p = 123（写入地址 1019）
     ```

**实现方式**：
```typescript
case 'lir':
  this.lir(operands[0]!);
  break;

case 'sir':
  this.sir(operands[0]!);
  break;

// 从寄存器间接加载
private lir(reg: string): void {
  const address = this.state.registers.get(reg) || 0;
  const value = this.state.stack.get(address) || 0;
  this.state.registers.set('ax', value);
}

// 间接存储到寄存器指向的地址
private sir(reg: string): void {
  const address = this.state.registers.get(reg) || 0;
  const axValue = this.state.registers.get('ax') || 0;
  this.state.stack.set(address, axValue);
}
```

**对比现有指令**：
- `li offset` - 从 `bp + offset` 加载到 `ax`（直接寻址）
- `lir reg` - 从 `reg` 中的地址加载到 `ax`（间接寻址）
- `si offset` - 将 `ax` 存储到 `bp + offset`（直接寻址）
- `sir reg` - 将 `ax` 存储到 `reg` 中的地址（间接寻址）

**优势**：
- 与现有 `si`/`li` 指令风格一致
- 不需要解析 `[]` 语法
- 指令语义清晰
- 实现简单

#### 2. 地址计算指令（可选，但推荐）

为了更方便地计算变量地址，可以添加：

**`lea dest, [bp+offset]`** - Load Effective Address（加载有效地址）
- 功能：计算地址值（不读取该地址的内容），存储到寄存器
- 用途：实现 `&a` 操作
- 示例：
  ```assembly
  lea ax, [bp-1]    ; ax = bp - 1（a 的地址，每个变量占 1 个单位）
  mov bx, ax        ; bx = a 的地址
  ```

**实现方式**：
```typescript
case 'lea':
  this.lea(operands[0]!, operands[1]!);
  break;

private lea(dest: string, src: string): void {
  // 解析 [bp+offset] 或 [bp-offset] 格式
  // 注意：在当前设计中，每个变量占 1 个地址单位，所以 offset 通常是 -1, -2, -3...
  const addrMatch = src.match(/^\[bp([+-]\d+)\]$/);
  if (addrMatch) {
    const bpValue = this.state.registers.get('bp') || 0;
    const offset = parseInt(addrMatch[1]!, 10);
    const address = bpValue + offset;
    this.setValue(dest, address);
  } else {
    throw new Error(`Invalid lea operand: ${src}`);
  }
}
```

#### 3. 指针操作的汇编代码生成示例

有了间接寻址支持后，指针操作的代码生成：

**取地址 `p = &a;`**（使用 `lea` 指令）：
```assembly
; 假设 a 在 [bp-1]，p 在 [bp-2]（每个变量占 1 个地址单位）
lea ax, [bp-1]      ; ax = a 的地址
si -2               ; p = a 的地址
```

**或者不使用 `lea`，手动计算地址**：
```assembly
; 假设 a 在 [bp-1]，p 在 [bp-2]
mov ax, bp          ; ax = bp
sub ax, 1           ; ax = bp - 1（a 的地址）
si -2               ; p = a 的地址
```

**解引用读取 `int x = *p;`**（使用方案 2：`lir` 指令）：
```assembly
; 假设 p 在 [bp-2]，x 在 [bp-3]（每个变量占 1 个地址单位）
li -2               ; ax = p 的值（地址，例如 1019）
lir ax              ; ax = *p（从地址 1019 读取值，间接寻址）
si -3               ; x = *p
```

**解引用赋值 `*p = 123;`**（使用方案 2：`sir` 指令）：
```assembly
; 假设 p 在 [bp-2]（每个变量占 1 个地址单位）
li -2               ; ax = p 的值（地址，例如 1019）
mov bx, ax          ; bx = p 的值（保存地址到 bx）
mov ax, 123         ; ax = 123
sir bx              ; *p = 123（将 123 写入 bx 中的地址，间接寻址）
```

**或者使用方案 1（`[]` 语法）**：
```assembly
; 解引用读取
li -2               ; ax = p 的值（地址）
mov ax, [ax]        ; ax = *p（使用 [] 语法间接寻址）
si -3               ; x = *p

; 解引用赋值
li -2               ; ax = p 的值（地址）
mov [ax], 123       ; *p = 123（使用 [] 语法间接寻址）
```

### 总结：VM 需要添加的功能

#### 方案选择

**方案 1：使用 `[]` 语法（标准 x86 风格）**
- 必须添加：间接寻址支持 `[寄存器]`
  - 扩展 `getValue()` 支持 `[ax]`、`[bx]` 等
  - 扩展 `setValue()` 支持 `[ax]`、`[bx]` 等
- 优点：符合标准 x86 汇编语法
- 缺点：需要解析 `[]` 语法

**方案 2：使用专用指令（推荐，与现有风格一致）**
- 必须添加：`lir reg` 和 `sir reg` 指令
  - `lir reg` - 从寄存器中的地址读取值到 `ax`
  - `sir reg` - 将 `ax` 的值写入寄存器中的地址
- 优点：
  - 与现有 `si`/`li` 指令风格一致
  - 不需要解析 `[]` 语法
  - 指令语义清晰
  - 实现简单
- 缺点：不是标准 x86 语法

#### 其他需要添加的功能

1. **推荐添加**：`lea` 指令（Load Effective Address）
   - 方便计算变量地址
   - 简化 `&a` 操作的代码生成
   - 或者使用 `mov ax, bp` + `sub ax, offset` 组合

2. **可选优化**：支持更复杂的间接寻址格式
   - `[bx+offset]` - 基址+偏移
   - `[bx+ax]` - 基址+索引
   - 这些对于更复杂的指针操作有用，但不是必需的

### 修改的文件

- `src/assembly-vm.ts` - 添加间接寻址和 `lea` 指令支持
- `src/linked-code-executor.ts` - 同样需要添加（如果使用）
- `src/dynamic-linked-code-executor.ts` - 同样需要添加（如果使用）

## 相关文件

- `src/lexer.ts` - 词法分析器
- `src/parser.ts` - 语法分析器
- `src/types.ts` - 类型定义
- `src/compiler.ts` - 编译器
- `src/assembly-generator.ts` - 汇编代码生成器
- `src/assembly-vm.ts` - **需要修改：添加间接寻址支持**

