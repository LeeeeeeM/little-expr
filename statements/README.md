# 📝 Statement Parser

这个文件夹专门处理编程语言中的**语句（Statement）**解析，扩展了原有的表达式解析功能。

## 🎯 支持的语句类型

### 1. 表达式语句（Expression Statement）
```javascript
x = 5;           // 赋值语句
x++;             // 自增语句
print(x);        // 函数调用语句
```

### 2. 声明语句（Declaration Statement）
```javascript
int x;           // 变量声明
int x = 5;       // 带初始化的变量声明
function foo() { // 函数声明
    return x;
}
```

### 3. 控制流语句（Control Flow Statement）
```javascript
// 条件语句
if (x > 0) {
    print("positive");
} else {
    print("negative");
}

// 循环语句
while (x > 0) {
    x--;
}

for (int i = 0; i < 10; i++) {
    print(i);
}
```

### 4. 复合语句（Compound Statement）
```javascript
{
    int x = 5;
    int y = 10;
    print(x + y);
}
```

## 📁 文件结构

```
statements/
├── README.md                    # 说明文档
├── types.ts                     # 语句类型定义
├── lexer.ts                     # 词法分析器（扩展版）
├── parser.ts                    # 语句解析器
├── ast.ts                       # AST节点定义
├── interpreter.ts               # 语句解释器
├── codegen.ts                   # 代码生成器
├── index.ts                     # 集成版本（解析+执行）
├── separated.ts                 # 分离版本（解析+AST+代码生成）
└── tests/                       # 测试用例
    ├── basic-statements.txt     # 基本语句测试
    ├── control-flow.txt          # 控制流测试
    └── complex-programs.txt      # 复杂程序测试
```

## 🚀 使用示例

### 基本语句解析
```bash
# 解析并执行语句
echo "int x = 5; x = x + 1;" | bun run statements:integrated

# 生成AST和代码
echo "if (x > 0) { print(x); }" | bun run statements:separated
```

### 复杂程序解析
```bash
# 解析完整的程序
echo "
int x = 10;
while (x > 0) {
    print(x);
    x = x - 1;
}
" | bun run statements:integrated
```

## 🔧 实现特点

1. **模块化设计**：每种语句类型都有独立的解析函数
2. **错误处理**：完善的语法错误检测和报告
3. **AST生成**：为每种语句类型生成对应的AST节点
4. **代码生成**：支持生成汇编代码或JavaScript代码
5. **测试覆盖**：完整的测试用例覆盖各种语句类型

## 📚 学习价值

这个模块展示了如何从简单的表达式解析扩展到完整的语句解析：

1. **语法扩展**：从表达式到语句的语法规则设计
2. **解析器扩展**：递归下降解析器的扩展方法
3. **AST设计**：复杂语法结构的AST节点设计
4. **语义分析**：变量作用域、类型检查等
5. **代码生成**：控制流语句的代码生成策略

## 🎯 扩展方向

- 支持更多数据类型（浮点数、字符串、数组）
- 添加函数调用和定义
- 实现面向对象特性（类、继承）
- 优化代码生成（寄存器分配、指令选择）
- 添加静态类型检查

