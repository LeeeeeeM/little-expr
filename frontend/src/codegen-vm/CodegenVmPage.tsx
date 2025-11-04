import React, { useState, useCallback, useRef } from 'react';
import { Menu } from '../components/Menu';
import Editor from '@monaco-editor/react';
import { CfgVisualizer } from './components/CfgVisualizer';
import { StackVisualizer } from './components/StackVisualizer';
import { AssemblyVisualizer, type AssemblyLine } from './components/AssemblyVisualizer';
import { Compiler } from './lib/compiler';
import type { ControlFlowGraph } from './lib/cfg-types';
import type { BasicBlock } from './lib/cfg-types';
import { ScopeManager, type ScopeInfo } from './lib/scope-manager';
import { AssemblyGenerator } from './lib/assembly-generator';
import { optimizeAssembly } from './lib/assembly-optimizer';

const PRESET_CODE_SAMPLES = [
  { 
    label: '成绩检查 (grade-check)', 
    value: `int checkGrade() {
    int grade = 0;
    int score = 70;
    {
      int i = 0;
      score = score + 1;
      if (i > 123) {
        return 123;
      }
    }
    
    if (score >= 90) {
        grade = 1;  // A级
        int bonusA = 10;
        {
          grade = 10;
        }
        grade = 111;
    } else if (score >= 80) {
      int bonusB = 5;
      grade = 2;
      int grade = 2;  // B级
      {
        grade = grade + 20;
        int c = 100;
      }
      int cc = 1110;
      cc = 222;
    } else if (score >= 60) {
      grade = 3; // C 级
    }
    int k = 9990;

    if (k) {
      int jj = 111;
      {
        int j = 1111;
        if (j > 0) {
          j = 222;
        }
        int j11= 1231;
        {
          int xx = 1;
        }
      }
      int j111 = 123123;
    }
    return grade;
}`
  },
  { 
    label: 'For 循环作用域 (test-for-scope-1)', 
    value: `int test1() {
  let j = 0;
  for (int i = 0; i < 2; i = i+1) {
    // i 在 for 循环作用域中
    let i = 10;
    if (i > 0) {
        j = 5;
    }
  }
  int i1 = 1;  // 应该可以，因为外部的 i 和循环内的 i 是不同的作用域
  return i1;
}`
  },
  { 
    label: '嵌套 If (nested-if-test)', 
    value: `int a() {
  let a = 1;
  if (a > 0) {
    let x = 2;
    if (x > 1) {
      let y = 3;
      a = 111;
    }
    let z = 4;
  }
  let b = 5;
  return a;
}`
  },
];

export interface StackFrame {
  blockId: string;
  steps: StackStep[]; // 每个语句处理后的状态
}

export interface StackStep {
  stepIndex: number; // 语句索引
  statement: string; // 语句描述
  scopeStack: ScopeInfo[]; // 该步骤后的作用域栈
}

// ScopeInfo 从 scope-manager.ts 导入
export type { ScopeInfo } from './lib/scope-manager';

const CodegenVmPage: React.FC = () => {
  const [code, setCode] = useState(PRESET_CODE_SAMPLES[0].value);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>();
  const [isRunning, setIsRunning] = useState(false);
  const [cfg, setCfg] = useState<ControlFlowGraph | null>(null);
  const [stackFrames, setStackFrames] = useState<StackFrame[]>([]);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  
  // 逐步执行相关状态
  const [visitedBlocks, setVisitedBlocks] = useState<Set<string>>(new Set()); // 已访问的块
  const [scopeManager, setScopeManager] = useState<ScopeManager | null>(null); // 作用域管理器
  const [currentBlock, setCurrentBlock] = useState<BasicBlock | null>(null); // 当前执行的块
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1); // 当前执行的步骤索引
  const [isStepping, setIsStepping] = useState(false); // 是否处于逐步执行模式
  const [isTraversalCompleted, setIsTraversalCompleted] = useState(false); // 是否已完成遍历
  const [isAutoExecuting, setIsAutoExecuting] = useState(false); // 是否处于自动执行模式
  const autoExecuteIntervalRef = React.useRef<number | null>(null); // 自动执行的定时器
  const [highlightedVariable, setHighlightedVariable] = useState<string | null>(null); // 需要高亮的变量名
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null); // 当前激活的块（用于高亮）
  const [blockSnapshots, setBlockSnapshots] = useState<Map<string, ScopeInfo[]>>(new Map()); // 每个块进入时的快照
  const [pendingSuccessors, setPendingSuccessors] = useState<Array<{block: BasicBlock, snapshot: ScopeInfo[]}>>([]); // 当前块的后继块队列（包含快照）
  const [dfsStack, setDfsStack] = useState<Array<{parentSnapshot: ScopeInfo[], pendingSuccessors: Array<{block: BasicBlock, snapshot: ScopeInfo[]}>}>>([]); // DFS 遍历栈：每层保存父快照和待处理的后继块
  const [assemblyLines, setAssemblyLines] = useState<AssemblyLine[]>([]); // 生成的汇编代码行
  const [currentAssemblyLineIndex, setCurrentAssemblyLineIndex] = useState<number | null>(null); // 当前执行的汇编代码行索引
  const [optimizedAssemblyLines, setOptimizedAssemblyLines] = useState<AssemblyLine[]>([]); // 优化后的汇编代码行
  const [isOptimized, setIsOptimized] = useState(false); // 是否显示优化后的代码
  const assemblyGeneratorRef = useRef<AssemblyGenerator | null>(null); // 汇编生成器实例
  
  // 根据是否有错误消息判断语法是否正确（有错误消息就是语法错误，否则默认正确）
  const isValid = !errorMessage;

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    setCfg(null);
    setStackFrames([]);
    setCurrentBlockId(null);
    setVisitedBlocks(new Set());
    setScopeManager(null);
    setCurrentBlock(null);
    setCurrentStepIndex(-1);
    setIsStepping(false);
    setActiveBlockId(null);
    setBlockSnapshots(new Map());
    setIsAutoExecuting(false);
    setAssemblyLines([]);
    setCurrentAssemblyLineIndex(null);
    setOptimizedAssemblyLines([]);
    setIsOptimized(false);
    assemblyGeneratorRef.current = null;
    if (autoExecuteIntervalRef.current) {
      clearInterval(autoExecuteIntervalRef.current);
      autoExecuteIntervalRef.current = null;
    }
  }, []);

  const handleCompile = useCallback(async () => {
    if (!code.trim()) return;
    
    setIsRunning(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    setCfg(null);
    setStackFrames([]);
    setCurrentBlockId(null);
    
    // 重置所有执行相关状态
    setVisitedBlocks(new Set());
    setScopeManager(null);
    setCurrentBlock(null);
    setCurrentStepIndex(-1);
    setIsStepping(false);
    setActiveBlockId(null);
    setBlockSnapshots(new Map());
    setPendingSuccessors([]);
    setDfsStack([]);
    setIsTraversalCompleted(false);
    setIsAutoExecuting(false);
    setAssemblyLines([]);
    setCurrentAssemblyLineIndex(null);
    setOptimizedAssemblyLines([]);
    setIsOptimized(false);
    assemblyGeneratorRef.current = null;
    setHighlightedVariable(null);
    // 清除自动执行定时器
    if (autoExecuteIntervalRef.current) {
      clearInterval(autoExecuteIntervalRef.current);
      autoExecuteIntervalRef.current = null;
    }
    
    try {
      const compiler = new Compiler();
      const compileResult = compiler.compile(code);
      
      if (!compileResult.success) {
        setIsRunning(false);
        const errorMsg = compileResult.errors.join('; ') || '编译失败';
        setErrorMessage(errorMsg);
        return;
      }
      
      if (compileResult.cfgs && compileResult.cfgs.length > 0) {
        setCfg(compileResult.cfgs[0]!);
        setIsRunning(false);
        setSuccessMessage(`编译成功！生成了 ${compileResult.cfgs.length} 个函数的 CFG`);
        // 重新聚焦到入口块
        if (compileResult.cfgs[0]!.entryBlock) {
          setActiveBlockId(compileResult.cfgs[0]!.entryBlock.id);
        }
      } else {
        setIsRunning(false);
        setErrorMessage('未找到函数定义');
      }
    } catch (error) {
      setIsRunning(false);
      setErrorMessage(error instanceof Error ? error.message : '编译错误');
    }
  }, [code]);

  // 从表达式中提取第一个标识符（变量名）
  const extractVariableFromExpression = useCallback((expr: any): string | null => {
    if (!expr) return null;
    
    const exprType = expr.type as string;
    
    if (exprType === 'Identifier') {
      return expr.name || null;
    }
    
    if (exprType === 'BinaryExpression') {
      // 对于二元表达式，优先提取左侧的变量（通常左侧是操作对象）
      const leftVar = extractVariableFromExpression(expr.left);
      if (leftVar) return leftVar;
      // 如果左侧没有变量，尝试右侧（如函数调用的结果赋给变量）
      return extractVariableFromExpression(expr.right);
    }
    
    if (exprType === 'UnaryExpression') {
      return extractVariableFromExpression(expr.operand);
    }
    
    if (exprType === 'FunctionCall') {
      // 函数调用本身也可以是一个变量
      if (expr.callee && expr.callee.type === 'Identifier') {
        return expr.callee.name || null;
      }
      // 或者从参数中提取
      if (expr.arguments && expr.arguments.length > 0) {
        for (const arg of expr.arguments) {
          const argVar = extractVariableFromExpression(arg);
          if (argVar) return argVar;
        }
      }
      return null;
    }
    
    if (exprType === 'ParenthesizedExpression') {
      return extractVariableFromExpression(expr.expression);
    }
    
    return null;
  }, []);

  // 将表达式转换为可读字符串的辅助函数
  const expressionToString = useCallback((expr: any): string => {
    if (!expr) return '';
    
    const exprType = expr.type as string;
    
    if (exprType === 'NumberLiteral') {
      return String(expr.value ?? '');
    }
    
    if (exprType === 'Identifier') {
      return expr.name || 'unknown';
    }
    
    if (exprType === 'BinaryExpression') {
      const left = expressionToString(expr.left);
      const right = expressionToString(expr.right);
      const op = expr.operator || '?';
      return `(${left} ${op} ${right})`;
    }
    
    if (exprType === 'UnaryExpression') {
      const operand = expressionToString(expr.operand);
      const op = expr.operator || '?';
      return `${op}${operand}`;
    }
    
    if (exprType === 'FunctionCall') {
      const callee = expr.callee?.name || 'unknown';
      const args = (expr.arguments || []).map((arg: any) => expressionToString(arg)).join(', ');
      return `${callee}(${args})`;
    }
    
    if (exprType === 'ParenthesizedExpression') {
      return `(${expressionToString(expr.expression)})`;
    }
    
    return '...';
  }, []);

  // 将语句转换为可读字符串的辅助函数
  const statementToString = useCallback((stmt: any): string => {
    const stmtType = stmt.type as string;
    
    if (stmtType === 'StartCheckPoint') {
      const checkpoint = stmt;
      const vars = checkpoint.variableNames || [];
      return vars.length > 0 
        ? `{ // 进入作用域 ${checkpoint.scopeId}, 变量: [${vars.join(', ')}]`
        : `{ // 进入作用域 ${checkpoint.scopeId}`;
    }
    
    if (stmtType === 'EndCheckPoint') {
      const checkpoint = stmt;
      const vars = checkpoint.variableNames || [];
      return vars.length > 0 
        ? `} // 退出作用域 ${checkpoint.scopeId}, 变量: [${vars.join(', ')}]`
        : `} // 退出作用域 ${checkpoint.scopeId}`;
    }
    
    if (stmtType === 'VariableDeclaration' || stmtType === 'LetDeclaration') {
      const varName = stmt.name || 'unknown';
      const init = stmt.initializer ? ` = ${expressionToString(stmt.initializer)}` : '';
      const prefix = stmtType === 'LetDeclaration' ? 'let' : 'int';
      return `${prefix} ${varName}${init};`;
    }
    
    if (stmtType === 'AssignmentStatement') {
      const target = stmt.target?.name || 'unknown';
      const value = expressionToString(stmt.value);
      return `${target} = ${value};`;
    }
    
    if (stmtType === 'ReturnStatement') {
      if (stmt.value) {
        const value = expressionToString(stmt.value);
        return `return ${value};`;
      }
      return 'return;';
    }
    
    if (stmtType === 'ExpressionStatement') {
      const expr = expressionToString(stmt.expression);
      return `${expr};`;
    }
    
    if (stmtType === 'BlockStatement') {
      return '{ // BlockStatement }';
    }
    
    if (stmtType === 'IfStatement') {
      const condition = expressionToString(stmt.condition);
      return `if (${condition}) ...`;
    }
    
    if (stmtType === 'WhileStatement') {
      const condition = expressionToString(stmt.condition);
      return `while (${condition}) ...`;
    }
    
    if (stmtType === 'ForStatement') {
      return 'for (...) ...';
    }
    
    if (stmtType === 'BreakStatement') {
      return 'break;';
    }
    
    if (stmtType === 'ContinueStatement') {
      return 'continue;';
    }
    
    if (stmtType === 'EmptyStatement') {
      return ';';
    }
    
    return `${stmtType} ...`;
  }, [expressionToString]);

  // 递归展开语句，将 BlockStatement 内部的语句展开出来
  const flattenStatements = useCallback((statements: any[]): any[] => {
    const result: any[] = [];
    
    for (const stmt of statements) {
      if (stmt.type === 'BlockStatement') {
        // 遇到 BlockStatement，递归展开其内部的语句
        const blockStmt = stmt as any;
        if (blockStmt.statements && Array.isArray(blockStmt.statements)) {
          const flattened = flattenStatements(blockStmt.statements);
          result.push(...flattened);
        }
      } else {
        // 普通语句直接添加
        result.push(stmt);
      }
    }
    
    return result;
  }, []);

  // 统一处理语句的作用域变化：只要遇到 StartCheckPoint 就开辟作用域，遇到 EndCheckPoint 就销毁作用域
  const processStatementScope = useCallback((stmt: any, scopeMgr: ScopeManager): void => {
    if (stmt.type === 'StartCheckPoint') {
      const checkpoint = stmt as any;
      const scopeId = checkpoint.scopeId || `scope_${scopeMgr.getScopes().length}`;
      const variableNames: string[] = checkpoint.variableNames || [];
      scopeMgr.enterScope(scopeId, variableNames);
    } else if (stmt.type === 'EndCheckPoint') {
      scopeMgr.exitScope();
    }
  }, []);

  // 为新块生成汇编标签的辅助函数
  const addBlockLabelToAssembly = useCallback((blockId: string) => {
    if (assemblyGeneratorRef.current) {
      // 更新输出回调，以便正确设置 blockId
      assemblyGeneratorRef.current.setOutputCallback((lines: string[]) => {
        setAssemblyLines(prev => {
          const newAssemblyLines: AssemblyLine[] = [];
          let nextLineIndex = prev.length > 0 ? prev[prev.length - 1]!.lineIndex + 1 : 0;
          for (const line of lines) {
            newAssemblyLines.push({
              lineIndex: nextLineIndex++,
              code: line,
              blockId: blockId,
              stepIndex: 0,
            });
          }
          return [...prev, ...newAssemblyLines];
        });
      });
      assemblyGeneratorRef.current.addLine(`${blockId}:`);
    }
  }, []);


  // 开始逐步遍历
  const handleStartStepping = useCallback(() => {
    if (!cfg || !cfg.entryBlock) {
      setErrorMessage('请先编译生成 CFG');
      return;
    }
    
    // 初始化作用域管理器
    const newScopeManager = new ScopeManager();
    newScopeManager.reset();
    
    // 初始化汇编生成器
    const newAssemblyGenerator = new AssemblyGenerator(newScopeManager);
    assemblyGeneratorRef.current = newAssemblyGenerator;
    
    // 设置汇编生成器的输出回调
    setAssemblyLines([]);
    setCurrentAssemblyLineIndex(null);
    newAssemblyGenerator.setOutputCallback((lines: string[]) => {
      setAssemblyLines(prev => {
        const newAssemblyLines: AssemblyLine[] = [];
        let nextLineIndex = prev.length > 0 ? prev[prev.length - 1]!.lineIndex + 1 : 0;
        for (const line of lines) {
          newAssemblyLines.push({
            lineIndex: nextLineIndex++,
            code: line,
            blockId: cfg.entryBlock.id,
            stepIndex: 0,
          });
        }
        return [...prev, ...newAssemblyLines];
      });
    });
    
    // 添加入口块标签
    newAssemblyGenerator.addLine(`${cfg.entryBlock.id}:`);
    
    // 初始化状态
    setIsStepping(true);
    setScopeManager(newScopeManager);
    setVisitedBlocks(new Set());
    setCurrentBlock(cfg.entryBlock);
    setCurrentStepIndex(0); // 0 表示还没执行任何语句（刚进入块）
    setActiveBlockId(cfg.entryBlock.id);
    setCurrentBlockId(cfg.entryBlock.id);
    setBlockSnapshots(new Map());
    setStackFrames([]);
    setPendingSuccessors([]);
    setDfsStack([]);
    setIsTraversalCompleted(false);
    setIsAutoExecuting(false);
    if (autoExecuteIntervalRef.current) {
      clearInterval(autoExecuteIntervalRef.current);
      autoExecuteIntervalRef.current = null;
    }
    
    // 处理第一个块的第一个步骤
    const entryBlock = cfg.entryBlock;
    
    // 重置高亮变量
    setHighlightedVariable(null);
    
    // 保存进入该块时的快照（在进入时保存，此时作用域栈是空的）
    const enteringSnapshot = newScopeManager.getSnapshot();
    setBlockSnapshots(new Map([[entryBlock.id, enteringSnapshot]]));
    
    const blockSteps: StackStep[] = [];
    
    // 第0步：进入块时的状态（还没有执行任何语句）
    blockSteps.push({
      stepIndex: 0,
      statement: `进入块 ${entryBlock.id}`,
      scopeStack: newScopeManager.getSnapshot()
    });
    
    // 进入新块时，不立即处理第一个语句，保持 currentStepIndex = 0
    // 用户点击"执行下一步"时才会处理第一个语句（在 handleNextStep 中会计算 flattenedStatements）
    
    // 显示第一个块
    setStackFrames([{
      blockId: entryBlock.id,
      steps: blockSteps
    }]);
    
    // 更新作用域管理器
    setScopeManager(newScopeManager);
  }, [cfg, statementToString, flattenStatements, processStatementScope]);

  // 执行下一步
  const handleNextStep = useCallback(() => {
    if (!isStepping || !currentBlock || !scopeManager || !cfg) {
      return;
    }
    
    // 递归展开当前块的所有语句（包括 BlockStatement 内部的语句）
    const flattenedStatements = flattenStatements(currentBlock.statements);
    
    // 如果当前块还有下一步骤
    // 注意：currentStepIndex 现在是基于 flattenedStatements 的索引
    // stepIndex 0 是"进入块"，stepIndex 1 是第一个语句，stepIndex 2 是第二个语句...
    // 所以 flattenedStatements 的索引 = currentStepIndex
    if (currentStepIndex < flattenedStatements.length) {
      const nextStmtIndex = currentStepIndex; // flattenedStatements 的索引
      const nextStmt = flattenedStatements[nextStmtIndex]!;
      
      // 提取变量名用于高亮（如果是变量声明、赋值语句、表达式语句或返回语句）
      let variableName: string | null = null;
      const stmtType = nextStmt.type as string;
      if (stmtType === 'VariableDeclaration' || stmtType === 'LetDeclaration') {
        variableName = nextStmt.name || null;
        // 标记变量为已初始化
        if (variableName) {
          scopeManager.markVariableInitialized(variableName);
        }
      } else if (stmtType === 'AssignmentStatement') {
        variableName = nextStmt.target?.name || null;
      } else if (stmtType === 'ReturnStatement') {
        // 处理 ReturnStatement，如 return grade;
        if (nextStmt.value) {
          variableName = extractVariableFromExpression(nextStmt.value);
        }
      } else if (stmtType === 'ExpressionStatement') {
        // 处理 ExpressionStatement 中的表达式，如 (score = (score + 1)); 或 (i > 123);
        const expr = nextStmt.expression;
        if (expr) {
          // 对于赋值表达式，优先提取左侧的变量
          if (expr.type === 'BinaryExpression' && expr.operator === '=') {
            if (expr.left && expr.left.type === 'Identifier') {
              variableName = expr.left.name || null;
            }
          } else {
            // 对于其他表达式，提取第一个标识符（变量）
            variableName = extractVariableFromExpression(expr);
          }
        }
      }
      setHighlightedVariable(variableName);
      
      // 使用 AssemblyGenerator 生成汇编代码（它会处理 StartCheckPoint 和 EndCheckPoint 的作用域变化）
      if (assemblyGeneratorRef.current) {
        // 更新输出回调，以便正确设置 blockId 和 stepIndex
        assemblyGeneratorRef.current.setOutputCallback((lines: string[]) => {
          setAssemblyLines(prev => {
            const newAssemblyLines: AssemblyLine[] = [];
            let nextLineIndex = prev.length > 0 ? prev[prev.length - 1]!.lineIndex + 1 : 0;
            for (const line of lines) {
              newAssemblyLines.push({
                lineIndex: nextLineIndex++,
                code: line,
                blockId: currentBlock.id,
                stepIndex: nextStmtIndex,
              });
            }
            return [...prev, ...newAssemblyLines];
          });
        });
        assemblyGeneratorRef.current.generateStatement(nextStmt);
      } else {
        // 如果没有 assemblyGenerator（理论上不应该发生），则使用 processStatementScope
      processStatementScope(nextStmt, scopeManager);
      }
      
      // 更新步骤索引（下一个 flattenedStatements 的索引）
      const nextStepIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextStepIndex);
      
      // 更新显示的步骤（stepIndex = nextStepIndex，因为 stepIndex 0 是"进入块"）
      const currentFrame = stackFrames.find(f => f.blockId === currentBlock.id);
      if (currentFrame) {
        const newSteps = [...currentFrame.steps, {
          stepIndex: nextStepIndex,
          statement: statementToString(nextStmt),
          scopeStack: scopeManager.getSnapshot()
        }];
        
        setStackFrames([{
          blockId: currentBlock.id,
          steps: newSteps
        }]);
      }
      
      // 更新作用域管理器状态
      setScopeManager(scopeManager);
    } else {
      // 当前块执行完毕，准备移动到下一个块
      // 保存当前块退出时的作用域快照（用于传递给后继块）
      const currentSnapshot = scopeManager.getSnapshot();
      
      // 使用 AssemblyGenerator 生成控制流跳转指令
      if (assemblyGeneratorRef.current) {
        // 更新输出回调，以便正确设置 blockId
        assemblyGeneratorRef.current.setOutputCallback((lines: string[]) => {
          setAssemblyLines(prev => {
            const newAssemblyLines: AssemblyLine[] = [];
            let nextLineIndex = prev.length > 0 ? prev[prev.length - 1]!.lineIndex + 1 : 0;
            for (const line of lines) {
              newAssemblyLines.push({
                lineIndex: nextLineIndex++,
                code: line,
                blockId: currentBlock.id,
              });
            }
            return [...prev, ...newAssemblyLines];
          });
        });
        assemblyGeneratorRef.current.generateControlFlow(currentBlock);
      }
      
      // 标记当前块为已访问
      const newVisited = new Set(visitedBlocks);
      newVisited.add(currentBlock.id);
      setVisitedBlocks(newVisited);
      
      // 将当前块的所有未访问的后继块加入待处理队列（深拷贝快照）
      // 注意：应该使用 newVisited（包含当前块的最新状态），而不是旧的 visitedBlocks state
      const newPendingSuccessors: Array<{block: BasicBlock, snapshot: ScopeInfo[]}> = [];
      for (const successor of currentBlock.successors) {
        const isVisited = newVisited.has(successor.id);
        if (!isVisited) {
          // 深拷贝快照（ScopeInfo[] 已经是对象数组，需要深拷贝）
          const snapshotCopy: ScopeInfo[] = currentSnapshot.map(scope => ({
            scopeId: scope.scopeId,
            variables: scope.variables.map(v => ({ ...v }))
          }));
          newPendingSuccessors.push({ block: successor, snapshot: snapshotCopy });
        }
      }
      
      // 从队列中取出下一个块
      if (newPendingSuccessors.length > 0) {
        const nextItem = newPendingSuccessors[0]!;
        const remainingSuccessors = newPendingSuccessors.slice(1);
        const nextBlock = nextItem.block;
        const nextSnapshot = nextItem.snapshot;
        
        // 在进入后续节点之前，保存当前作用域链（用于回溯）
        // 将当前层的信息压入 DFS 栈：保存当前作用域快照和剩余的后继块
        const currentDfsStack = [...dfsStack];
        if (remainingSuccessors.length > 0) {
          // 如果还有剩余的后继块，将当前层信息压栈
          currentDfsStack.push({
            parentSnapshot: currentSnapshot.map(scope => ({
              scopeId: scope.scopeId,
              variables: scope.variables.map(v => ({ ...v }))
            })),
            pendingSuccessors: remainingSuccessors
          });
          setDfsStack(currentDfsStack);
        }
        
        // 检查该块是否已经访问过（可能在其他路径中已访问）
        // 如果已访问过，跳过该块，直接处理下一个后继块（类似 assembly-generator 的逻辑）
        // 注意：使用 newVisited 而不是 visitedBlocks，因为 newVisited 包含当前块的最新状态
        if (newVisited.has(nextBlock.id)) {
          // 已访问过，跳过该块，继续处理下一个后继块
          // 如果有剩余的后继块，继续处理
          if (remainingSuccessors.length > 0) {
            const nextItem = remainingSuccessors[0]!;
            const nextRemainingSuccessors = remainingSuccessors.slice(1);
            const nextNextBlock = nextItem.block;
            const nextNextSnapshot = nextItem.snapshot;
            
            // 如果还有剩余的后继块，更新 DFS 栈
            if (nextRemainingSuccessors.length > 0) {
              const currentDfsStack = [...dfsStack];
              currentDfsStack.push({
                parentSnapshot: currentSnapshot.map(scope => ({
                  scopeId: scope.scopeId,
                  variables: scope.variables.map(v => ({ ...v }))
                })),
                pendingSuccessors: nextRemainingSuccessors
              });
              setDfsStack(currentDfsStack);
            }
            
            // 递归处理下一个块
            const savedSnapshot = blockSnapshots.get(nextNextBlock.id);
            if (savedSnapshot) {
              scopeManager.restoreSnapshot(savedSnapshot);
            } else {
              scopeManager.restoreSnapshot(nextNextSnapshot);
              const newSnapshots = new Map(blockSnapshots);
              const enteringSnapshot = scopeManager.getSnapshot();
              newSnapshots.set(nextNextBlock.id, enteringSnapshot.map(scope => ({
                scopeId: scope.scopeId,
                variables: scope.variables.map(v => ({ ...v }))
              })));
              setBlockSnapshots(newSnapshots);
            }
            
            setCurrentBlock(nextNextBlock);
            setCurrentStepIndex(0);
            setActiveBlockId(nextNextBlock.id);
            setCurrentBlockId(nextNextBlock.id);
            setPendingSuccessors([]);
            setHighlightedVariable(null);
            
            // 为新块生成汇编标签
            addBlockLabelToAssembly(nextNextBlock.id);
            
            const blockSteps: StackStep[] = [];
            blockSteps.push({
              stepIndex: 0,
              statement: `进入块 ${nextNextBlock.id}`,
              scopeStack: scopeManager.getSnapshot()
            });
            
            setStackFrames([{
              blockId: nextNextBlock.id,
              steps: blockSteps
            }]);
            
            setScopeManager(scopeManager);
          } else {
            // 没有剩余的后继块，需要回溯
            // 注意：这里使用 newVisited 而不是 visitedBlocks，因为 newVisited 包含当前块的最新状态
            if (dfsStack.length > 0) {
              const parentContext = dfsStack[dfsStack.length - 1]!;
              const newDfsStack = dfsStack.slice(0, -1);
              
              scopeManager.restoreSnapshot(parentContext.parentSnapshot);
              setScopeManager(scopeManager);
              
              if (parentContext.pendingSuccessors.length > 0) {
                const nextItem = parentContext.pendingSuccessors[0]!;
                const remainingSuccessors2 = parentContext.pendingSuccessors.slice(1);
                const nextBlock2 = nextItem.block;
                const nextSnapshot2 = nextItem.snapshot;
                
                // 检查该块是否已经访问过（可能在回溯过程中已被访问）
                // 注意：使用 newVisited 而不是 visitedBlocks，因为 newVisited 包含当前块的最新状态
                if (newVisited.has(nextBlock2.id)) {
                  // 已访问过，跳过该块，继续处理下一个后继块
                  if (remainingSuccessors2.length > 0) {
                    const nextItem3 = remainingSuccessors2[0]!;
                    const remainingSuccessors3 = remainingSuccessors2.slice(1);
                    const nextBlock3 = nextItem3.block;
                    const nextSnapshot3 = nextItem3.snapshot;
                    
                    if (remainingSuccessors3.length > 0) {
                      const currentDfsStack3 = [...newDfsStack];
                      currentDfsStack3.push({
                        parentSnapshot: parentContext.parentSnapshot,
                        pendingSuccessors: remainingSuccessors3
                      });
                      setDfsStack(currentDfsStack3);
                    } else {
                      setDfsStack(newDfsStack);
                    }
                    
                    const savedSnapshot3 = blockSnapshots.get(nextBlock3.id);
                    if (savedSnapshot3) {
                      scopeManager.restoreSnapshot(savedSnapshot3);
                    } else {
                      scopeManager.restoreSnapshot(nextSnapshot3);
                      const newSnapshots3 = new Map(blockSnapshots);
                      const enteringSnapshot3 = scopeManager.getSnapshot();
                      newSnapshots3.set(nextBlock3.id, enteringSnapshot3.map(scope => ({
                        scopeId: scope.scopeId,
                        variables: scope.variables.map(v => ({ ...v }))
                      })));
                      setBlockSnapshots(newSnapshots3);
                    }
                    
                    setCurrentBlock(nextBlock3);
                    setCurrentStepIndex(0);
                    setActiveBlockId(nextBlock3.id);
                    setCurrentBlockId(nextBlock3.id);
                    setPendingSuccessors([]);
                    setHighlightedVariable(null);
                    
                    // 为新块生成汇编标签
                    addBlockLabelToAssembly(nextBlock3.id);
                    
                    const blockSteps3: StackStep[] = [];
                    blockSteps3.push({
                      stepIndex: 0,
                      statement: `进入块 ${nextBlock3.id}`,
                      scopeStack: scopeManager.getSnapshot()
                    });
                    
                    setStackFrames([{
                      blockId: nextBlock3.id,
                      steps: blockSteps3
                    }]);
                    
                    setScopeManager(scopeManager);
                  } else {
                    // 没有剩余的后继块，继续回溯
                    setDfsStack(newDfsStack);
                    if (newDfsStack.length === 0) {
                      setSuccessMessage('所有基本块已执行完毕！');
                      setIsStepping(false);
                      setIsTraversalCompleted(true);
                      setIsAutoExecuting(false);
                      if (autoExecuteIntervalRef.current) {
                        clearInterval(autoExecuteIntervalRef.current);
                        autoExecuteIntervalRef.current = null;
                      }
                    }
                  }
                } else {
                  // 未访问过，正常处理
                  const savedSnapshot2 = blockSnapshots.get(nextBlock2.id);
                  if (savedSnapshot2) {
                    scopeManager.restoreSnapshot(savedSnapshot2);
                  } else {
                    scopeManager.restoreSnapshot(nextSnapshot2);
                    const newSnapshots2 = new Map(blockSnapshots);
                    const enteringSnapshot2 = scopeManager.getSnapshot();
                    newSnapshots2.set(nextBlock2.id, enteringSnapshot2.map(scope => ({
                      scopeId: scope.scopeId,
                      variables: scope.variables.map(v => ({ ...v }))
                    })));
                    setBlockSnapshots(newSnapshots2);
                  }
                  
                  if (remainingSuccessors2.length > 0) {
                    const currentDfsStack2 = [...newDfsStack];
                    currentDfsStack2.push({
                      parentSnapshot: parentContext.parentSnapshot,
                      pendingSuccessors: remainingSuccessors2
                    });
                    setDfsStack(currentDfsStack2);
                  } else {
                    setDfsStack(newDfsStack);
                  }
                  
                  setCurrentBlock(nextBlock2);
                  setCurrentStepIndex(0);
                  setActiveBlockId(nextBlock2.id);
                  setCurrentBlockId(nextBlock2.id);
                  setPendingSuccessors([]);
                  setHighlightedVariable(null);
                  
                  // 为新块生成汇编标签
                  addBlockLabelToAssembly(nextBlock2.id);
                  
                  const blockSteps2: StackStep[] = [];
                  blockSteps2.push({
                    stepIndex: 0,
                    statement: `进入块 ${nextBlock2.id}`,
                    scopeStack: scopeManager.getSnapshot()
                  });
                  
                  setStackFrames([{
                    blockId: nextBlock2.id,
                    steps: blockSteps2
                  }]);
                  
                  setScopeManager(scopeManager);
                }
              } else {
                setDfsStack(newDfsStack);
                // 继续回溯
                if (newDfsStack.length === 0) {
                  setSuccessMessage('所有基本块已执行完毕！');
                  setIsStepping(false);
                  setIsTraversalCompleted(true);
                  setIsAutoExecuting(false);
                  if (autoExecuteIntervalRef.current) {
                    clearInterval(autoExecuteIntervalRef.current);
                    autoExecuteIntervalRef.current = null;
                  }
                }
              }
            } else {
              // DFS 栈为空，所有块都执行完毕
              setSuccessMessage('所有基本块已执行完毕！');
              setIsStepping(false);
              setIsTraversalCompleted(true);
              setIsAutoExecuting(false);
              if (autoExecuteIntervalRef.current) {
                clearInterval(autoExecuteIntervalRef.current);
                autoExecuteIntervalRef.current = null;
              }
            }
          }
          return;
        }
        
        // 首次访问该块，恢复传入的快照（父块退出时的快照），并保存为进入快照
        scopeManager.restoreSnapshot(nextSnapshot);
        const newSnapshots = new Map(blockSnapshots);
        // 深拷贝保存进入时的快照
        const enteringSnapshot = scopeManager.getSnapshot();
        newSnapshots.set(nextBlock.id, enteringSnapshot.map(scope => ({
          scopeId: scope.scopeId,
          variables: scope.variables.map(v => ({ ...v }))
        })));
        setBlockSnapshots(newSnapshots);
        
        // 设置新的当前块（清空当前层的 pendingSuccessors，因为已经压栈）
        setCurrentBlock(nextBlock);
        setCurrentStepIndex(0);
        setActiveBlockId(nextBlock.id);
        setCurrentBlockId(nextBlock.id);
        setPendingSuccessors([]);
        setHighlightedVariable(null); // 进入新块时重置高亮变量
        
        // 为新块生成汇编标签
        addBlockLabelToAssembly(nextBlock.id);
        
        // 处理新块的第一个步骤（在恢复快照后）
        const blockSteps: StackStep[] = [];
        
        // 第0步：进入块时的状态（还没有执行任何语句）
        blockSteps.push({
          stepIndex: 0,
          statement: `进入块 ${nextBlock.id}`,
          scopeStack: scopeManager.getSnapshot()
        });
        
        // 进入新块时，不立即处理第一个语句，保持 currentStepIndex = 0
        // 用户点击"执行下一步"时才会处理第一个语句（在 handleNextStep 中会计算 flattenedStatements）
        
        // 显示新块
        setStackFrames([{
          blockId: nextBlock.id,
          steps: blockSteps
        }]);
        
        setScopeManager(scopeManager);
      } else {
        // 当前块没有后继块，需要回溯
        // 从 DFS 栈中弹出上一层信息
        // 注意：这里需要使用已访问的块集合，应该使用包含当前块的最新状态
        // 但由于 currentBlock 没有后继块，说明它可能是 exit block 或者已经执行完毕
        // 如果 currentBlock 已经执行完毕，它应该在 visitedBlocks 中
        // 但为了确保使用最新状态，我们需要创建一个包含当前块的已访问集合
        const currentVisited = new Set(visitedBlocks);
        // 如果 currentBlock 存在且不在 visitedBlocks 中，说明它刚执行完毕但还没更新 state
        // 这种情况下，我们应该将它加入 currentVisited
        if (currentBlock && !currentVisited.has(currentBlock.id)) {
          currentVisited.add(currentBlock.id);
        }
        
        if (dfsStack.length > 0) {
          const parentContext = dfsStack[dfsStack.length - 1]!;
          const newDfsStack = dfsStack.slice(0, -1);
          
          // 恢复父块的作用域状态（回溯）
          scopeManager.restoreSnapshot(parentContext.parentSnapshot);
          setScopeManager(scopeManager);
          
          // 处理父层的下一个后继块
          if (parentContext.pendingSuccessors.length > 0) {
            const nextItem = parentContext.pendingSuccessors[0]!;
            const remainingSuccessors = parentContext.pendingSuccessors.slice(1);
            const nextBlock = nextItem.block;
            const nextSnapshot = nextItem.snapshot;
            
            // 检查该块是否已经访问过（已执行完毕）
            // 如果已访问过，跳过该块，继续处理下一个后继块
            // 注意：使用 currentVisited 而不是 visitedBlocks，确保包含当前块的最新状态
            if (currentVisited.has(nextBlock.id)) {
              // 已访问过，跳过该块，继续处理下一个后继块
              if (remainingSuccessors.length > 0) {
                const nextItem2 = remainingSuccessors[0]!;
                const remainingSuccessors2 = remainingSuccessors.slice(1);
                const nextBlock2 = nextItem2.block;
                const nextSnapshot2 = nextItem2.snapshot;
                
                if (remainingSuccessors2.length > 0) {
                  newDfsStack.push({
                    parentSnapshot: parentContext.parentSnapshot,
                    pendingSuccessors: remainingSuccessors2
                  });
                }
                setDfsStack(newDfsStack);
                
                const savedSnapshot2 = blockSnapshots.get(nextBlock2.id);
                if (savedSnapshot2) {
                  scopeManager.restoreSnapshot(savedSnapshot2);
                } else {
                  scopeManager.restoreSnapshot(nextSnapshot2);
                  const newSnapshots2 = new Map(blockSnapshots);
                  const enteringSnapshot2 = scopeManager.getSnapshot();
                  newSnapshots2.set(nextBlock2.id, enteringSnapshot2.map(scope => ({
                    scopeId: scope.scopeId,
                    variables: scope.variables.map(v => ({ ...v }))
                  })));
                  setBlockSnapshots(newSnapshots2);
                }
                
                setCurrentBlock(nextBlock2);
                setCurrentStepIndex(0);
                setActiveBlockId(nextBlock2.id);
                setCurrentBlockId(nextBlock2.id);
                setPendingSuccessors([]);
                setHighlightedVariable(null);
                
                // 为新块生成汇编标签
                addBlockLabelToAssembly(nextBlock2.id);
                
                const blockSteps2: StackStep[] = [];
                blockSteps2.push({
                  stepIndex: 0,
                  statement: `进入块 ${nextBlock2.id}`,
                  scopeStack: scopeManager.getSnapshot()
                });
                
                setStackFrames([{
                  blockId: nextBlock2.id,
                  steps: blockSteps2
                }]);
                
                setScopeManager(scopeManager);
                return;
              } else {
                // 没有剩余的后继块，继续回溯
                // 注意：这里需要继续回溯到更上层，而不是直接 return
                // 因为如果直接 return，下次调用时 currentBlock 仍然是已完成的块，会再次进入"块执行完毕"逻辑
                setDfsStack(newDfsStack);
                
                if (newDfsStack.length === 0) {
                  // DFS 栈为空，所有块都执行完毕
                  setSuccessMessage('所有基本块已执行完毕！');
                  setIsStepping(false);
                  setIsTraversalCompleted(true);
                  setIsAutoExecuting(false);
                  if (autoExecuteIntervalRef.current) {
                    clearInterval(autoExecuteIntervalRef.current);
                    autoExecuteIntervalRef.current = null;
                  }
                  // 清空当前块，避免重复执行
                  setCurrentBlock(null);
                  setCurrentStepIndex(-1);
                  setCurrentBlockId(null);
                  setPendingSuccessors([]);
                  setHighlightedVariable(null);
                  return;
                } else {
                  // 继续回溯：清空当前块，让下次调用继续回溯
                  // 这样下次调用时，由于 currentBlock 为 null，会检查是否有待处理的块
                  // 但实际上，由于 currentBlock 为 null，handleNextStep 会直接 return
                  // 所以我们需要在这里手动处理继续回溯的逻辑
                  // 实际上，我们应该在这里继续回溯，而不是等待下次调用
                  // 但为了避免无限递归，我们使用一个循环来处理回溯
                  // 简化处理：直接在这里继续回溯，直到找到未访问的块或 DFS 栈为空
                  let continueBacktracking = true;
                  let currentDfsStack = newDfsStack;
                  let currentVisitedForBacktrack = new Set(currentVisited);
                  
                  while (continueBacktracking && currentDfsStack.length > 0) {
                    const parentCtx = currentDfsStack[currentDfsStack.length - 1]!;
                    const newDfsStack2 = currentDfsStack.slice(0, -1);
                    
                    if (parentCtx.pendingSuccessors.length > 0) {
                      const nextItem3 = parentCtx.pendingSuccessors[0]!;
                      const remainingSuccessors3 = parentCtx.pendingSuccessors.slice(1);
                      const nextBlock3 = nextItem3.block;
                      const nextSnapshot3 = nextItem3.snapshot;
                      
                      // 检查该块是否已访问
                      if (currentVisitedForBacktrack.has(nextBlock3.id)) {
                        // 已访问，继续处理下一个后继块
                        if (remainingSuccessors3.length > 0) {
                          // 还有剩余的后继块，更新栈并继续
                          if (remainingSuccessors3.length > 0) {
                            newDfsStack2.push({
                              parentSnapshot: parentCtx.parentSnapshot,
                              pendingSuccessors: remainingSuccessors3
                            });
                          }
                          currentDfsStack = newDfsStack2;
                          setDfsStack(currentDfsStack);
                          continue;
                        } else {
                          // 没有剩余的后继块，继续回溯
                          currentDfsStack = newDfsStack2;
                          setDfsStack(currentDfsStack);
                          continue;
                        }
                      } else {
                        // 未访问，进入该块
                        scopeManager.restoreSnapshot(nextSnapshot3);
                        const newSnapshots3 = new Map(blockSnapshots);
                        const enteringSnapshot3 = scopeManager.getSnapshot();
                        newSnapshots3.set(nextBlock3.id, enteringSnapshot3.map(scope => ({
                          scopeId: scope.scopeId,
                          variables: scope.variables.map(v => ({ ...v }))
                        })));
                        setBlockSnapshots(newSnapshots3);
                        
                        if (remainingSuccessors3.length > 0) {
                          newDfsStack2.push({
                            parentSnapshot: parentCtx.parentSnapshot,
                            pendingSuccessors: remainingSuccessors3
                          });
                        }
                        setDfsStack(newDfsStack2);
                        
                        setCurrentBlock(nextBlock3);
                        setCurrentStepIndex(0);
                        setActiveBlockId(nextBlock3.id);
                        setCurrentBlockId(nextBlock3.id);
                        setPendingSuccessors([]);
                        setHighlightedVariable(null);
                        
                        // 为新块生成汇编标签
                        addBlockLabelToAssembly(nextBlock3.id);
                        
                        const blockSteps3: StackStep[] = [];
                        blockSteps3.push({
                          stepIndex: 0,
                          statement: `进入块 ${nextBlock3.id}`,
                          scopeStack: scopeManager.getSnapshot()
                        });
                        
                        setStackFrames([{
                          blockId: nextBlock3.id,
                          steps: blockSteps3
                        }]);
                        
                        setScopeManager(scopeManager);
                        continueBacktracking = false;
                        break;
                      }
                    } else {
                      // 没有待处理的后继块，继续回溯
                      currentDfsStack = newDfsStack2;
                      setDfsStack(currentDfsStack);
                    }
                  }
                  
                  if (continueBacktracking && currentDfsStack.length === 0) {
                    // 所有块都执行完毕
                    setSuccessMessage('所有基本块已执行完毕！');
                    setIsStepping(false);
                    setIsTraversalCompleted(true);
                    setIsAutoExecuting(false);
                    if (autoExecuteIntervalRef.current) {
                      clearInterval(autoExecuteIntervalRef.current);
                      autoExecuteIntervalRef.current = null;
                    }
                    setCurrentBlock(null);
                    setCurrentStepIndex(-1);
                    setCurrentBlockId(null);
                    setPendingSuccessors([]);
                    setHighlightedVariable(null);
                  }
                  return;
                }
              }
            }
            
            // 首次访问该块
            scopeManager.restoreSnapshot(nextSnapshot);
            const newSnapshots = new Map(blockSnapshots);
            const enteringSnapshot = scopeManager.getSnapshot();
            newSnapshots.set(nextBlock.id, enteringSnapshot.map(scope => ({
              scopeId: scope.scopeId,
              variables: scope.variables.map(v => ({ ...v }))
            })));
            setBlockSnapshots(newSnapshots);
            
            // 如果还有剩余的后继块，更新栈
            if (remainingSuccessors.length > 0) {
              newDfsStack.push({
                parentSnapshot: parentContext.parentSnapshot,
                pendingSuccessors: remainingSuccessors
              });
            }
            setDfsStack(newDfsStack);
            
            // 设置新的当前块
            setCurrentBlock(nextBlock);
            setCurrentStepIndex(0);
            setActiveBlockId(nextBlock.id);
            setCurrentBlockId(nextBlock.id);
            setPendingSuccessors([]);
            setHighlightedVariable(null);
            
            // 为新块生成汇编标签
            addBlockLabelToAssembly(nextBlock.id);
            
            // 处理新块的第一个步骤
            const blockSteps: StackStep[] = [];
            
            // 第0步：进入块时的状态（还没有执行任何语句）
            blockSteps.push({
              stepIndex: 0,
              statement: `进入块 ${nextBlock.id}`,
              scopeStack: scopeManager.getSnapshot()
            });
            
            // 进入新块时，不立即处理第一个语句，保持 currentStepIndex = 0
            // 用户点击"执行下一步"时才会处理第一个语句（在 handleNextStep 中会计算 flattenedStatements）
            
            setStackFrames([{
              blockId: nextBlock.id,
              steps: blockSteps
            }]);
            
            setScopeManager(scopeManager);
          } else {
            // 父层也没有更多后继块了，继续回溯
            setDfsStack(newDfsStack);
            // 继续检查栈中是否还有待处理的块
            if (newDfsStack.length === 0) {
              setSuccessMessage('所有基本块已执行完毕！');
              setIsStepping(false);
              setIsTraversalCompleted(true);
              setIsAutoExecuting(false);
              if (autoExecuteIntervalRef.current) {
                clearInterval(autoExecuteIntervalRef.current);
                autoExecuteIntervalRef.current = null;
              }
            }
          }
        } else {
          // DFS 栈为空，所有块都执行完毕
          setSuccessMessage('所有基本块已执行完毕！');
          setIsStepping(false);
          setIsTraversalCompleted(true);
          setIsAutoExecuting(false);
          if (autoExecuteIntervalRef.current) {
            clearInterval(autoExecuteIntervalRef.current);
            autoExecuteIntervalRef.current = null;
          }
        }
      }
    }
  }, [isStepping, currentBlock, currentStepIndex, scopeManager, cfg, visitedBlocks, blockSnapshots, pendingSuccessors, dfsStack, stackFrames, statementToString, flattenStatements, processStatementScope]);

  const handleReset = useCallback(() => {
    // 重置只重置遍历的状态，不修改 cfg
    setSuccessMessage(undefined); // 清除成功消息（保留错误消息，因为那是编译相关的）
    setStackFrames([]);
    setCurrentBlockId(null);
    setVisitedBlocks(new Set());
    setScopeManager(null);
    setCurrentBlock(null);
    setCurrentStepIndex(-1);
    setIsStepping(false);
    // 重新聚焦到入口块
    if (cfg && cfg.entryBlock) {
      setActiveBlockId(cfg.entryBlock.id);
    } else {
      setActiveBlockId(null);
    }
    setBlockSnapshots(new Map());
    setPendingSuccessors([]);
    setDfsStack([]);
    setIsTraversalCompleted(false);
    setIsAutoExecuting(false);
    if (autoExecuteIntervalRef.current) {
      clearInterval(autoExecuteIntervalRef.current);
      autoExecuteIntervalRef.current = null;
    }
    // 清空汇编代码
    setAssemblyLines([]);
    setCurrentAssemblyLineIndex(null);
    setOptimizedAssemblyLines([]);
    setIsOptimized(false);
    assemblyGeneratorRef.current = null;
  }, [cfg]);

  // 切换优化代码显示
  const handleOptimizeToggle = useCallback(() => {
    if (!cfg || assemblyLines.length === 0) {
      return;
    }
    
    if (!isOptimized) {
      // 切换到优化模式：计算优化后的代码
      try {
        const optimized = optimizeAssembly(assemblyLines, cfg);
        setOptimizedAssemblyLines(optimized);
        setIsOptimized(true);
      } catch (error) {
        console.error('优化汇编代码失败:', error);
      }
    } else {
      // 切换回原始模式
      setIsOptimized(false);
    }
  }, [cfg, assemblyLines, isOptimized]);

  // 自动执行处理
  React.useEffect(() => {
    if (isAutoExecuting && isStepping && currentBlock && scopeManager && cfg) {
      // 启动自动执行定时器
      autoExecuteIntervalRef.current = setInterval(() => {
        handleNextStep();
      }, 500); // 每500ms执行一步
      
      return () => {
        if (autoExecuteIntervalRef.current) {
          clearInterval(autoExecuteIntervalRef.current);
          autoExecuteIntervalRef.current = null;
        }
      };
    } else {
      // 停止自动执行
      if (autoExecuteIntervalRef.current) {
        clearInterval(autoExecuteIntervalRef.current);
        autoExecuteIntervalRef.current = null;
      }
    }
  }, [isAutoExecuting, isStepping, currentBlock, scopeManager, cfg, handleNextStep]);


  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
      <Menu />
      
      {/* 页面标题和操作按钮 */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 pl-20 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <h1 className="text-2xl font-bold text-gray-900">代码生成与虚拟机</h1>
            
            <div className="flex items-center space-x-2">
              <label htmlFor="preset-code-select" className="text-sm font-medium text-gray-700">
                预置代码:
              </label>
              <select
                id="preset-code-select"
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[200px]"
              >
                {PRESET_CODE_SAMPLES.map((preset) => (
                  <option key={preset.label} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={handleCompile}
              disabled={isRunning || !code.trim()}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isRunning ? '编译中...' : '编译'}
            </button>
            <button
              onClick={() => {
                if (!isStepping) {
                  handleStartStepping();
                } else {
                  handleNextStep();
                }
              }}
              disabled={!cfg || (isStepping && !currentBlock) || isTraversalCompleted || isAutoExecuting}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isStepping ? '执行下一步' : '开始遍历基本块'}
            </button>
            <button
              onClick={() => {
                if (!isAutoExecuting) {
                  // 如果还没开始遍历，先开始遍历
                  if (!isStepping) {
                    handleStartStepping();
                  }
                  setIsAutoExecuting(true);
                } else {
                  // 停止自动执行
                  setIsAutoExecuting(false);
                  if (autoExecuteIntervalRef.current) {
                    clearInterval(autoExecuteIntervalRef.current);
                    autoExecuteIntervalRef.current = null;
                  }
                }
              }}
              disabled={!cfg || isTraversalCompleted}
              className={`px-4 py-2 rounded-md transition-colors ${
                isAutoExecuting
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isAutoExecuting ? '停止自动执行' : '自动执行'}
            </button>
            <button
              onClick={handleReset}
              disabled={!cfg}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              重置
            </button>
          </div>
        </div>
      </header>
      
      <main className="flex flex-1 min-h-0 overflow-hidden">
        {/* 左侧代码编辑器 - 25% */}
        <div className="w-[25%] p-6 border-r border-gray-200 flex-shrink-0 overflow-hidden flex flex-col">
          {/* 编辑器标题头 */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h2 className="text-lg font-semibold text-gray-900">源代码编辑器</h2>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${isValid ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm text-gray-600">
                {isValid ? '语法正确' : '语法错误'}
              </span>
            </div>
          </div>
          
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden min-h-0" style={{
            borderColor: isValid ? '#d1d5db' : '#ef4444',
          }}>
            <Editor
              height="100%"
              language="c"
              value={code}
              onChange={(value) => value && handleCodeChange(value)}
              theme="vs-light"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
              }}
            />
          </div>
          {/* 编译信息显示区域 */}
          <div className="mt-4 flex-shrink-0">
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-700 text-sm">
                <div className="font-semibold mb-1">❌ 编译错误</div>
                <div>{errorMessage}</div>
              </div>
            )}
            {successMessage && (
              <div className="bg-green-50 border border-green-200 rounded-md p-3 text-green-700 text-sm">
                <div className="font-semibold mb-1">✅ 编译成功</div>
                <div>{successMessage}</div>
              </div>
            )}
          </div>
        </div>
        
        {/* 中间 CFG 展示区域 - 40% */}
        <div className="w-[40%] p-6 border-r border-gray-200 flex-shrink-0 overflow-hidden">
          <div className="h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <CfgVisualizer
              cfg={cfg}
              activeBlockId={activeBlockId}
              visitedBlockIds={visitedBlocks}
            />
          </div>
        </div>
        
        {/* 右侧栈结构展示 - 15% */}
        <div className="w-[15%] p-6 border-r border-gray-200 flex-shrink-0 overflow-hidden">
          <div className="h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <StackVisualizer
                stackFrames={stackFrames}
                currentBlockId={currentBlockId}
                autoStepIndex={isStepping && currentStepIndex >= 0 ? currentStepIndex : null}
                highlightedVariable={highlightedVariable}
              />
          </div>
        </div>
        
        {/* 最右侧汇编代码展示 - 20% */}
        <div className="w-[20%] p-6 flex-shrink-0 overflow-hidden">
          <div className="h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <AssemblyVisualizer
              assemblyLines={assemblyLines}
              currentLineIndex={currentAssemblyLineIndex}
              optimizedLines={optimizedAssemblyLines}
              isOptimized={isOptimized}
              showOptimizeButton={assemblyLines.length > 0 && isTraversalCompleted}
              onOptimizeToggle={handleOptimizeToggle}
              />
          </div>
        </div>
      </main>
    </div>
  );
};

export default CodegenVmPage;

