# 指令集总结

本文档总结了在 `pointer` 模块中实现的汇编指令集。

## 寄存器

虚拟机支持以下寄存器：
- `ax` / `eax` / `al` / `ah` - 累加寄存器（用于计算结果）
- `bx` / `ebx` - 基址寄存器（用于辅助计算）
- `sp` / `esp` - 栈指针寄存器
- `bp` / `ebp` - 基址指针寄存器（用于栈帧）

## 指令分类

### 1. 数据移动指令

#### `mov dest, src`
- **功能**：将源操作数的值移动到目标操作数
- **示例**：`mov eax, 5` - 将立即数 5 加载到 eax 寄存器

### 2. 算术运算指令

#### `add dest, src`
- **功能**：将源操作数加到目标操作数，结果存储在目标中
- **示例**：`add eax, ebx` - eax = eax + ebx

#### `sub dest, src`
- **功能**：从目标操作数减去源操作数，结果存储在目标中
- **示例**：`sub eax, ebx` - eax = eax - ebx

#### `mul dest, src`
- **功能**：将目标操作数与源操作数相乘，结果存储在目标中
- **示例**：`mul eax, ebx` - eax = eax * ebx

#### `div dest, src`
- **功能**：将目标操作数除以源操作数（整数除法），结果存储在目标中
- **示例**：`div eax, ebx` - eax = eax / ebx（向下取整）

#### `power dest, src`
- **功能**：计算目标操作数的源操作数次方，结果存储在目标中
- **示例**：`power eax, ebx` - eax = eax ** ebx

#### `mod dest, src`
- **功能**：计算目标操作数对源操作数取模，结果存储在目标中
- **状态**：在 `assembly-generator.ts` 中生成，但 **未在 VM 中实现**（需要添加实现）
- **示例**：`mod eax, ebx` - eax = eax % ebx

### 3. 比较指令

#### `cmp left, right`
- **功能**：比较两个操作数，设置标志位（greater, equal, less）
- **示例**：`cmp eax, ebx` - 比较 eax 和 ebx，设置标志位

### 4. 条件跳转指令

#### `jmp label`
- **功能**：无条件跳转到指定标签
- **示例**：`jmp loop_start`

#### `je label`
- **功能**：如果相等标志位为真，则跳转
- **示例**：`je equal_branch`

#### `jne label`
- **功能**：如果相等标志位为假，则跳转
- **示例**：`jne not_equal_branch`

#### `jl label`
- **功能**：如果小于标志位为真，则跳转
- **示例**：`jl less_branch`

#### `jle label`
- **功能**：如果小于或等于（less 或 equal），则跳转
- **示例**：`jle less_or_equal_branch`

#### `jg label`
- **功能**：如果大于标志位为真，则跳转
- **示例**：`jg greater_branch`

#### `jge label`
- **功能**：如果大于或等于（greater 或 equal），则跳转
- **示例**：`jge greater_or_equal_branch`

### 5. 标志位设置指令

这些指令根据比较结果设置寄存器的值（0 或 1）：

#### `sete dest`
- **功能**：如果相等，设置目标为 1，否则为 0
- **示例**：`sete al` - 如果相等，al = 1，否则 al = 0

#### `setne dest`
- **功能**：如果不相等，设置目标为 1，否则为 0

#### `setl dest`
- **功能**：如果小于，设置目标为 1，否则为 0

#### `setle dest`
- **功能**：如果小于或等于，设置目标为 1，否则为 0

#### `setg dest`
- **功能**：如果大于，设置目标为 1，否则为 0

#### `setge dest`
- **功能**：如果大于或等于，设置目标为 1，否则为 0

### 6. 栈操作指令

#### `push src`
- **功能**：将源操作数的值压入栈
- **示例**：`push eax` - 将 eax 的值压入栈

#### `pop dest`
- **功能**：从栈顶弹出值到目标操作数
- **示例**：`pop ebx` - 从栈顶弹出值到 ebx

### 7. 栈索引操作指令（自定义指令）

这些指令用于访问基于 `bp`（基址指针）的栈帧变量：

#### `si offset`
- **功能**：将 `ax` 寄存器的值存储到 `bp + offset` 位置
- **用途**：用于变量赋值（Store Index）
- **示例**：`si -4` - 将 ax 的值存储到 bp - 4 的位置

#### `li offset`
- **功能**：从 `bp + offset` 位置加载值到 `ax` 寄存器
- **用途**：用于读取变量值（Load Index）
- **示例**：`li -4` - 从 bp - 4 的位置加载值到 ax

### 8. 指针操作指令（自定义指令）

#### `lea offset`
- **功能**：计算 `bp + offset` 的地址值，存储到 `ax` 寄存器（不读取内容）
- **用途**：用于取地址操作 `&variable`
- **示例**：`lea -4` - 计算 bp - 4 的地址，存储到 ax

#### `lir reg`
- **功能**：从 `reg` 寄存器中存储的地址读取值到 `ax`（间接寻址加载）
- **用途**：用于解引用操作 `*pointer`
- **示例**：`lir ebx` - 从 ebx 中存储的地址读取值到 ax
- **支持多级指针**：可以连续使用多次进行多级解引用

#### `sir reg`
- **功能**：将 `ax` 寄存器的值写入 `reg` 寄存器中存储的地址（间接寻址存储）
- **用途**：用于解引用赋值 `*pointer = value`
- **示例**：`sir ebx` - 将 ax 的值写入 ebx 中存储的地址
- **支持多级指针**：可以配合 `lir` 实现多级指针的赋值

### 9. 逻辑运算指令

#### `and dest, src`
- **功能**：对两个操作数进行按位与运算，结果存储在目标中
- **示例**：`and eax, 1` - eax = eax & 1

### 10. 函数调用指令

#### `call label`
- **功能**：调用指定标签处的函数
- **机制**：
  - 将返回地址（当前 PC + 1）压入栈
  - 跳转到目标函数标签
- **示例**：`call my_function`

#### `ret`
- **功能**：从函数返回
- **机制**：
  - 从栈中恢复返回地址
  - 跳转到返回地址
  - 如果栈为空（main 函数返回），则终止程序
- **示例**：`ret`

## 指令使用示例

### 变量操作
```assembly
; 声明变量 a，初始化为 5
mov eax, 5
si -4              ; 存储到 bp - 4（变量 a 的位置）

; 读取变量 a
li -4               ; 从 bp - 4 加载到 ax
```

### 指针操作
```assembly
; 获取变量 a 的地址
lea -4              ; 计算 bp - 4 的地址，存储到 ax
push eax            ; 保存地址到栈

; 通过指针读取值
pop ebx             ; 恢复地址到 ebx
lir ebx             ; 从 ebx 中的地址读取值到 ax

; 通过指针赋值
mov eax, 10
sir ebx             ; 将 10 写入 ebx 中的地址
```

### 多级指针操作
```assembly
; **pp = value（二级指针）
lea -4              ; 获取 pp 的地址
lir eax             ; 解引用第一级，获取 p 的地址
push eax            ; 保存 p 的地址
mov eax, 20         ; 要赋值的值
pop ebx             ; 恢复 p 的地址
sir ebx             ; 通过二级指针赋值
```

### 条件分支
```assembly
; if (a > b)
li -4               ; 加载 a
push eax
li -8               ; 加载 b
mov ebx, eax
pop eax
cmp eax, ebx        ; 比较 a 和 b
jg true_branch      ; 如果 a > b，跳转到 true_branch
jmp false_branch    ; 否则跳转到 false_branch
```

### 函数调用
```assembly
; 调用函数 foo(5, 10)
mov eax, 10         ; 第二个参数（从右到左）
push eax
mov eax, 5          ; 第一个参数
push eax
call foo            ; 调用函数
add esp, 2          ; 清理 2 个参数
```

## 标志位

虚拟机维护三个标志位：
- `greater`：大于标志（比较结果 > 0）
- `equal`：相等标志（比较结果 == 0）
- `less`：小于标志（比较结果 < 0）

这些标志位由 `cmp`、`add`、`sub`、`mul`、`div`、`power`、`and` 等指令自动更新。

## 栈管理

- 栈从高地址向低地址增长（`sp` 递减）
- 初始 `sp` 和 `bp` 都设置为 1023
- 函数调用时：
  - `call` 指令将返回地址压栈
  - 函数入口保存 `ebp`，设置新的 `ebp = esp`
  - 函数退出时恢复 `ebp`，`ret` 指令恢复返回地址

## 总结

本指令集共实现了 **30+ 条指令**，包括：
- 基础算术运算（5 条）
- 数据移动（1 条）
- 比较和条件跳转（7 条）
- 标志位设置（6 条）
- 栈操作（2 条）
- 栈索引操作（2 条）
- 指针操作（3 条）
- 逻辑运算（1 条）
- 函数调用（2 条）

这些指令足以支持完整的 C 语言子集，包括变量、指针、函数调用等特性。

