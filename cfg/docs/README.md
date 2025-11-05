# CFG 编译器文档

## 📋 文档导航

本目录包含 CFG 编译器的完整技术文档，帮助理解系统架构、实现流程和各个模块的详细说明。

### 📚 文档列表

1. **[架构文档 (ARCHITECTURE.md)](./ARCHITECTURE.md)**
   - 系统概述
   - 核心模块介绍
   - 数据流图
   - 关键设计决策
   - 模块依赖关系

2. **[实现流程文档 (IMPLEMENTATION_FLOW.md)](./IMPLEMENTATION_FLOW.md)**
   - 编译流程概览
   - 各阶段详细说明：
     - 词法分析
     - 语法分析
     - AST 转换
     - CFG 生成
     - 汇编生成
     - 虚拟机执行

3. **[模块详细说明 (MODULES.md)](./MODULES.md)**
   - 每个模块的功能说明
   - 主要方法和数据结构
   - 使用示例
   - API 接口

4. **[基本块理论 (BASIC_BLOCK_THEORY.md)](./BASIC_BLOCK_THEORY.md)**
   - 基本块定义和特征
   - 控制流结构分解
   - 块中块处理
   - 基本块数据结构

## 🚀 快速开始

### 运行示例

```bash
# 进入 cfg 目录
cd cfg

# 运行测试文件
bun run src/vm-runner.ts tests/grade-check.txt
```

### 基本使用

```typescript
import { VMRunner } from './src/vm-runner';

const runner = new VMRunner();
const result = await runner.runSourceCode(`
function checkGrade(int score) {
  int grade = 0;
  if (score > 89) {
    grade = 1;
  }
  return grade;
}
`);

if (result.success) {
  console.log('执行成功:', result.output);
  console.log('汇编代码:', result.assembly);
} else {
  console.error('执行失败:', result.errors);
}
```

## 📖 阅读建议

### 对于初学者

1. 先阅读 **[基本块理论](./BASIC_BLOCK_THEORY.md)**，了解基本块的概念
2. 然后阅读 **[架构文档](./ARCHITECTURE.md)**，了解整体设计
3. 最后阅读 **[实现流程文档](./IMPLEMENTATION_FLOW.md)**，了解编译过程

### 对于开发者

1. 阅读 **[架构文档](./ARCHITECTURE.md)**，了解系统设计
2. 阅读 **[模块详细说明](./MODULES.md)**，了解各模块的 API
3. 参考 **[实现流程文档](./IMPLEMENTATION_FLOW.md)**，理解具体实现

### 对于维护者

1. 阅读所有文档，全面了解系统
2. 重点关注 **[架构文档](./ARCHITECTURE.md)** 中的设计决策
3. 参考 **[模块详细说明](./MODULES.md)** 进行代码维护

## 🔍 关键概念

### 基本块 (Basic Block)

基本块是控制流图的核心单元，具有以下特征：
- **单一入口点**: 只有一个入口
- **单一出口点**: 只有一个出口
- **线性执行**: 块内语句顺序执行，无跳转
- **原子性**: 要么全部执行，要么全部不执行

### 控制流图 (CFG)

控制流图是程序控制流的图形表示：
- 节点：基本块
- 边：控制流转移（条件跳转、无条件跳转）

### 作用域检查点 (Checkpoint)

显式标记作用域边界的 AST 节点：
- `StartCheckPoint`: 作用域开始
- `EndCheckPoint`: 作用域结束

### 作用域快照 (Scope Snapshot)

保存作用域链状态的深拷贝，用于 DFS 遍历中的回溯。

## 🛠️ 技术栈

- **语言**: TypeScript
- **运行时**: Bun
- **数据结构**: AST, CFG
- **算法**: DFS（深度优先搜索）

## 📝 测试文件

测试文件位于 `tests/` 目录：

- `grade-check.txt`: 成绩等级判断示例
- `for-loop-test.txt`: For 循环示例
- `while-loop-test.txt`: While 循环示例
- `nested-if-test.txt`: 嵌套 If 示例
- `test-for-scope-1.txt`: 作用域测试 1
- `test-for-scope-2.txt`: 作用域测试 2
- `test-scope.txt`: 作用域测试

## 🤝 贡献指南

1. 阅读相关文档，理解系统设计
2. 编写测试用例
3. 实现功能或修复 Bug
4. 更新相关文档

## 📄 许可证

（根据项目实际情况填写）

## 📞 联系方式

（根据项目实际情况填写）

---

**最后更新**: 2024年

**文档版本**: 1.0

