# 🧪 测试用例说明

这个文件夹包含了各种测试用例，用于验证不同解析器的正确性和性能。

## 📁 测试文件说明

### `basic-expressions.txt`
- **简单算术运算**：基本的加减乘除运算
- **混合运算**：包含括号的复杂表达式
- **负数运算**：负数处理
- **指数运算**：幂运算测试

### `edge-cases.txt`
- **单个数字**：边界值测试
- **括号嵌套**：深度嵌套测试
- **连续运算**：相同操作符连续使用
- **零值运算**：零值处理
- **大数运算**：大数值测试

### `operator-precedence.txt`
- **加减乘除优先级**：验证运算符优先级
- **指数运算优先级**：幂运算优先级测试
- **右结合性测试**：验证右结合操作符
- **括号优先级**：括号对优先级的影响
- **复杂优先级**：多种运算符混合

### `error-cases.txt`
- **语法错误**：各种语法错误情况
- **除零错误**：除零异常处理
- **无效字符**：非法字符处理
- **空输入**：空输入处理
- **格式错误**：格式不规范的情况

### `performance.txt`
- **深度嵌套**：测试递归深度限制
- **长表达式**：测试长表达式处理
- **复杂运算**：复杂计算测试
- **大数运算**：大数值性能测试
- **重复模式**：重复模式测试

## 🚀 使用方法

### 运行单个测试文件
```bash
# 基本表达式测试
cat test/basic-expressions.txt | bun run start

# 边界情况测试
cat test/edge-cases.txt | bun run separated

# 优先级测试
cat test/operator-precedence.txt | bun run precedence-separated
```

### 运行所有测试
```bash
# 测试所有解析器
for parser in start separated precedence precedence-separated; do
    echo "=== Testing $parser ==="
    cat test/basic-expressions.txt | bun run $parser
done
```

### 错误测试
```bash
# 测试错误处理
cat test/error-cases.txt | bun run start
```

## 📊 测试结果验证

### 预期结果示例
- `1+2*3` → `7`
- `2**3**2` → `512`
- `(1+2)*3` → `9`
- `1/0` → 错误

### 性能基准
- 基本表达式：< 1ms
- 复杂表达式：< 10ms
- 深度嵌套：< 100ms

## 🔍 调试技巧

### 启用调试模式
在解析器文件中设置 `DEBUG = true` 可以看到详细的执行过程。

### 比较不同解析器
```bash
# 比较AST结构
echo "1+2*3" | bun run separated > output1.txt
echo "1+2*3" | bun run precedence-separated > output2.txt
diff output1.txt output2.txt
```

## 📝 添加新测试

1. 在相应的 `.txt` 文件中添加新的测试用例
2. 在注释中说明预期结果
3. 运行测试验证结果
4. 更新此README文档

---

**Happy Testing! 🎉**
