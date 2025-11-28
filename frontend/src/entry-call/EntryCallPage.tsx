import React, { useState, useCallback, useRef } from 'react';
import { Menu } from '../components/Menu';
import Editor from '@monaco-editor/react';
import { CfgVisualizer } from './components/CfgVisualizer';
import { StackVisualizer } from './components/StackVisualizer';
import { AssemblyVisualizer, type AssemblyLine } from './components/AssemblyVisualizer';
import { VmExecutor } from './components/VmExecutor';
import { Compiler } from './lib/compiler';
import type { ControlFlowGraph } from './lib/cfg-types';
import type { BasicBlock } from './lib/cfg-types';
import { ScopeManager, type ScopeInfo } from './lib/scope-manager';
import { AssemblyGenerator } from './lib/assembly-generator';

const PRESET_CODE_SAMPLES = [
  { 
    label: 'Main 函数示例', 
    value: `int main() {
  int result = 42;
  int switch = 0;
  int a = 10;
  int b =20;
  int c = 5;
  result = add_or_dec(a, b);

  if (switch == 0) {
    result = mul_or_div(result, b);
  } else {
    result = mul_or_div(result, a);
  }

  return result;
}

int add_or_dec(int a, int b) {
  int c = 13;
  int result = 0;
  if (c > 0) {
    result = a + b;
  } else {
    result = a - b;
  }
  return result;
}

int mul_or_div(int a, int b) {
  int result = 0;
  int c = 10;
  if (c > 0) {
    result = a * b;
  } else {
    result = a / b;
  }
  return result;
}
`
  },
  { 
    label: '简单 Main 函数', 
    value: `int main() {
  int result = 42;
  int switch = 0;
  if (switch == 0) {
    result = result + 1;
  } else {
  }
  return result;
}
`
  },
  { 
    label: '函数调用示例 (main/add/dec)', 
    value: `int add() {
  int a = 13;
  a  = a + dec();
  return a;
}

int dec() {
  int a = 313;
  return a;
}

int main() {
  int result = 42;
  result = add();
  return result;
}
`
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

const EntryCallPage: React.FC = () => {
  const [code, setCode] = useState(PRESET_CODE_SAMPLES[0].value);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>();
  const [isRunning, setIsRunning] = useState(false);
  const [cfg, setCfg] = useState<ControlFlowGraph | null>(null);
  const [allCfgs, setAllCfgs] = useState<ControlFlowGraph[]>([]); // 存储所有CFG
  const [activeCfgIndex, setActiveCfgIndex] = useState<number>(0); // 当前活动的CFG索引
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
  const [highlightedVariables, setHighlightedVariables] = useState<Set<string>>(new Set()); // 需要高亮的变量名集合
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null); // 当前激活的块（用于高亮）
  const [blockSnapshots, setBlockSnapshots] = useState<Map<string, ScopeInfo[]>>(new Map()); // 每个块进入时的快照
  const [pendingSuccessors, setPendingSuccessors] = useState<Array<{block: BasicBlock, snapshot: ScopeInfo[]}>>([]); // 当前块的后继块队列（包含快照）
  const [dfsStack, setDfsStack] = useState<Array<{parentSnapshot: ScopeInfo[], pendingSuccessors: Array<{block: BasicBlock, snapshot: ScopeInfo[]}>}>>([]); // DFS 遍历栈：每层保存父快照和待处理的后继块
  const [assemblyLines, setAssemblyLines] = useState<AssemblyLine[]>([]); // 生成的汇编代码行
  const [currentAssemblyLineIndex, setCurrentAssemblyLineIndex] = useState<number | null>(null); // 当前执行的汇编代码行索引
  const assemblyGeneratorRef = useRef<AssemblyGenerator | null>(null); // 汇编生成器实例
  const handleNextStepRef = useRef<(() => void) | null>(null); // 存储 handleNextStep 的引用
  const [activeTab, setActiveTab] = useState<'cfg' | 'vm'>('cfg'); // Tab 切换状态
  const [originalAssemblyCode, setOriginalAssemblyCode] = useState<string>(''); // 原始汇编代码字符串
  
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
    setPendingSuccessors([]);
    setDfsStack([]);
    setIsAutoExecuting(false);
    setIsTraversalCompleted(false);
    setAssemblyLines([]);
    setCurrentAssemblyLineIndex(null);
    assemblyGeneratorRef.current = null;
    setOriginalAssemblyCode('');
    setHighlightedVariables(new Set());
    setActiveTab('cfg'); // 切换到 CFG tab
    // 清除自动执行定时器
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
    setActiveCfgIndex(0); // 重置为第一个 CFG
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
    assemblyGeneratorRef.current = null;
    setOriginalAssemblyCode('');
    setHighlightedVariables(new Set());
    setActiveTab('cfg'); // 切换到 CFG tab
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
        // 保存所有CFG
        setAllCfgs(compileResult.cfgs);
        
        // 编译时使用第一个 CFG 作为默认显示（不查找 main）
        // 执行时会从 main 开始（通过 VM 查找 main 标签）
        setActiveCfgIndex(0);
        setCfg(compileResult.cfgs[0]!);
        
        // 为所有 CFG 生成汇编代码并合并
        // 按照 CFG 数组的顺序生成（保持函数定义的顺序）
        const scopeManager = new ScopeManager();
        const assemblyGenerator = new AssemblyGenerator(scopeManager);
        const allAssemblyCode: string[] = [];
        
        // 按照 CFG 数组的顺序生成汇编代码
        for (const cfg of compileResult.cfgs) {
          const assemblyCode = assemblyGenerator.generateAssembly(cfg);
          allAssemblyCode.push(assemblyCode);
        }
        
        // 合并所有函数的汇编代码（按照 CFG 数组的顺序）
        const mergedAssemblyCode = allAssemblyCode.join('\n\n');
        setOriginalAssemblyCode(mergedAssemblyCode);
        
        setIsRunning(false);
        setSuccessMessage(`编译成功！生成了 ${compileResult.cfgs.length} 个函数的 CFG`);
      } else {
        setIsRunning(false);
        setErrorMessage('未找到函数定义');
      }
    } catch (error) {
      setIsRunning(false);
      setErrorMessage(error instanceof Error ? error.message : '编译错误');
    }
  }, [code]);

  // 从表达式中提取所有标识符（变量名）
  const extractAllVariablesFromExpression = useCallback((expr: any): string[] => {
    if (!expr) return [];
    
    const exprType = expr.type as string;
    const result: string[] = [];
    
    if (exprType === 'Identifier') {
      if (expr.name) {
        result.push(expr.name);
      }
    } else if (exprType === 'BinaryExpression') {
      // 递归提取左右两侧的所有变量
      result.push(...extractAllVariablesFromExpression(expr.left));
      result.push(...extractAllVariablesFromExpression(expr.right));
    } else if (exprType === 'UnaryExpression') {
      result.push(...extractAllVariablesFromExpression(expr.operand));
    } else if (exprType === 'FunctionCall') {
      // 提取函数名和参数中的变量
      if (expr.callee && expr.callee.type === 'Identifier' && expr.callee.name) {
        result.push(expr.callee.name);
      }
      if (expr.arguments) {
        for (const arg of expr.arguments) {
          result.push(...extractAllVariablesFromExpression(arg));
        }
      }
    } else if (exprType === 'ParenthesizedExpression') {
      result.push(...extractAllVariablesFromExpression(expr.expression));
    }
    
    return result;
  }, []);

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
    if (assemblyGeneratorRef.current && cfg) {
      // 检查是否是入口块
      const block = cfg.blocks.find(b => b.id === blockId);
      const isEntryBlock = block?.isEntry || cfg.entryBlock?.id === blockId;
      
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
      
      // 对于入口块，使用函数名作为标签（用于函数调用）
      if (isEntryBlock) {
        assemblyGeneratorRef.current.addLine(`${cfg.functionName}:`);
      } else {
        assemblyGeneratorRef.current.addLine(`${blockId}:`);
      }
    }
  }, [cfg]);


  // 初始化CFG执行状态的辅助函数
  const initializeCfgExecution = useCallback((targetCfg: ControlFlowGraph, preserveAutoExecuting: boolean = false) => {
    if (!targetCfg || !targetCfg.entryBlock) {
      return;
    }
    
    // 初始化作用域管理器
    const newScopeManager = new ScopeManager();
    newScopeManager.reset();
    
    // 初始化汇编生成器
    const newAssemblyGenerator = new AssemblyGenerator(newScopeManager);
    assemblyGeneratorRef.current = newAssemblyGenerator;
    
    // 设置汇编生成器的输出回调
    // 注意：不清空 assemblyLines，而是追加到现有代码后面
    newAssemblyGenerator.setOutputCallback((lines: string[]) => {
      setAssemblyLines(prev => {
        const newAssemblyLines: AssemblyLine[] = [];
        let nextLineIndex = prev.length > 0 ? prev[prev.length - 1]!.lineIndex + 1 : 0;
        for (const line of lines) {
          newAssemblyLines.push({
            lineIndex: nextLineIndex++,
            code: line,
            blockId: targetCfg.entryBlock.id,
            stepIndex: 0,
          });
        }
        return [...prev, ...newAssemblyLines];
      });
    });
    
    // 添加入口块标签（使用函数名，用于函数调用）
    newAssemblyGenerator.addLine(`${targetCfg.functionName}:`);
    
    // 如果是函数入口，处理函数参数和函数序言（push ebp, mov ebp, esp）
    // 注意：即使没有参数，也需要调用以生成函数序言（非 main 函数）
    // 设置当前 CFG（用于 handleFunctionParameters）
    (newAssemblyGenerator as any).currentCfg = targetCfg;
    const parameters = targetCfg.parameters || [];
    newAssemblyGenerator.handleFunctionParameters(parameters);
    
    // 初始化状态
    setIsStepping(true); // 保持 isStepping 为 true
    setScopeManager(newScopeManager);
    setCfg(targetCfg); // 确保 cfg 使用正确的 targetCfg
    setVisitedBlocks(new Set());
    setCurrentBlock(targetCfg.entryBlock);
    setCurrentStepIndex(0); // 0 表示还没执行任何语句（刚进入块）
    setActiveBlockId(targetCfg.entryBlock.id);
    setCurrentBlockId(targetCfg.entryBlock.id);
    setBlockSnapshots(new Map());
    setStackFrames([]);
    setPendingSuccessors([]);
    setDfsStack([]);
    setIsTraversalCompleted(false);
    // 如果 preserveAutoExecuting 为 true，保持 isAutoExecuting 状态；否则设置为 false
    if (!preserveAutoExecuting) {
      setIsAutoExecuting(false);
      if (autoExecuteIntervalRef.current) {
        clearInterval(autoExecuteIntervalRef.current);
        autoExecuteIntervalRef.current = null;
      }
    } else {
      // 如果保持自动执行，确保 isAutoExecuting 为 true（使用函数式更新确保使用最新状态）
      setIsAutoExecuting(prev => {
        if (!prev) {
          return true;
        }
        return prev;
      });
    }
    
    // 处理第一个块的第一个步骤
    const entryBlock = targetCfg.entryBlock;
    
    // 重置高亮变量
    setHighlightedVariables(new Set());
    
    // 保存进入该块时的快照（在进入时保存，此时作用域栈可能包含函数参数）
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
  }, []);

  // 开始逐步遍历
  const handleStartStepping = useCallback((preserveAutoExecuting: boolean = false) => {
    // 使用当前显示的 CFG 开始执行（不强制跳转到 main）
    if (!cfg || !cfg.entryBlock) {
      setErrorMessage('请先编译生成 CFG');
      return;
    }
    
    // 清空汇编代码（因为这是重新开始）
    setAssemblyLines([]);
    setCurrentAssemblyLineIndex(null);
    
    // 使用辅助函数初始化
    initializeCfgExecution(cfg, preserveAutoExecuting);
  }, [cfg, initializeCfgExecution]);

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
      // 对于赋值语句，需要高亮左侧变量和右侧表达式中的所有变量
      const varsToHighlight = new Set<string>();
      if (variableName) {
        varsToHighlight.add(variableName);
        // 如果是赋值语句，还需要提取右侧表达式中的变量
        if (stmtType === 'AssignmentStatement' && nextStmt.value) {
          const rightVars = extractAllVariablesFromExpression(nextStmt.value);
          rightVars.forEach((v: string) => varsToHighlight.add(v));
        } else if (stmtType === 'ExpressionStatement' && nextStmt.expression) {
          // 对于 ExpressionStatement 中的赋值表达式，也需要提取右侧的变量
          const expr = nextStmt.expression;
          if (expr.type === 'BinaryExpression' && expr.operator === '=' && expr.right) {
            const rightVars = extractAllVariablesFromExpression(expr.right);
            rightVars.forEach((v: string) => varsToHighlight.add(v));
          } else {
            // 对于其他表达式，提取所有变量
            const exprVars = extractAllVariablesFromExpression(expr);
            exprVars.forEach((v: string) => varsToHighlight.add(v));
          }
        }
      }
      
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
        // 设置高亮回调，让 AssemblyGenerator 在生成标识符时触发高亮
        // 将 AssemblyGenerator 发现的变量添加到已有的高亮集合中
        assemblyGeneratorRef.current.setHighlightCallback((varName: string | null) => {
          if (varName) {
            varsToHighlight.add(varName);
            // 立即更新高亮状态
            setHighlightedVariables(new Set(varsToHighlight));
          }
        });
        assemblyGeneratorRef.current.generateStatement(nextStmt);
        // 生成完汇编代码后，设置最终的高亮状态（包含所有收集到的变量）
        setHighlightedVariables(new Set(varsToHighlight));
      } else {
        // 如果没有 assemblyGenerator（理论上不应该发生），则使用 processStatementScope
        processStatementScope(nextStmt, scopeManager);
        // 设置高亮状态
        setHighlightedVariables(varsToHighlight.size > 0 ? new Set(varsToHighlight) : new Set());
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
            setHighlightedVariables(new Set());
            
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
                    setHighlightedVariables(new Set());
                    
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
                  setHighlightedVariables(new Set());
                  
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
        setHighlightedVariables(new Set()); // 进入新块时重置高亮变量
        
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
                setHighlightedVariables(new Set());
                
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
                  // DFS 栈为空，当前CFG的所有块都执行完毕
                  // 注意：逐步执行只执行 main 函数，其他函数通过函数调用执行，不是独立的执行单元
                  // 所以当 main 执行完毕后，就结束了
                  // 所有执行完毕（只执行 main）
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
                  setHighlightedVariables(new Set());
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
                        setHighlightedVariables(new Set());
                        
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
                    setHighlightedVariables(new Set());
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
            setHighlightedVariables(new Set());
            
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
              // 当前CFG的所有块都执行完毕
              // 检查是否还有下一个CFG需要执行
              if (activeCfgIndex < allCfgs.length - 1) {
                // 还有下一个CFG，切换到下一个CFG
                const nextCfgIndex = activeCfgIndex + 1;
                const nextCfg = allCfgs[nextCfgIndex]!;
                setActiveCfgIndex(nextCfgIndex);
                setCfg(nextCfg);
                
                // 保持自动执行状态
                const shouldPreserveAutoExecuting = isAutoExecuting;
                
                // 使用辅助函数初始化下一个CFG的执行状态
                initializeCfgExecution(nextCfg, shouldPreserveAutoExecuting);
                
                setSuccessMessage(`已切换到函数 ${nextCfg.functionName}`);
              } else {
                // 所有CFG都执行完毕
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
        } else {
          // DFS 栈为空，当前CFG的所有块都执行完毕
          // 检查是否还有下一个CFG需要执行
          if (activeCfgIndex < allCfgs.length - 1) {
            // 还有下一个CFG，切换到下一个CFG
            const nextCfgIndex = activeCfgIndex + 1;
            const nextCfg = allCfgs[nextCfgIndex]!;
            setActiveCfgIndex(nextCfgIndex);
            setCfg(nextCfg);
            
            // 保持自动执行状态
            const shouldPreserveAutoExecuting = isAutoExecuting;
            
            // 使用辅助函数初始化下一个CFG的执行状态
            initializeCfgExecution(nextCfg, shouldPreserveAutoExecuting);
            
            setSuccessMessage(`已切换到函数 ${nextCfg.functionName}`);
          } else {
            // 所有CFG都执行完毕
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
    }
  }, [isStepping, currentBlock, currentStepIndex, scopeManager, cfg, visitedBlocks, blockSnapshots, pendingSuccessors, dfsStack, stackFrames, statementToString, flattenStatements, processStatementScope, isAutoExecuting, allCfgs, activeCfgIndex, initializeCfgExecution, addBlockLabelToAssembly, extractVariableFromExpression]);
  
  // 更新 handleNextStep 的 ref
  React.useEffect(() => {
    handleNextStepRef.current = handleNextStep;
  }, [handleNextStep]);

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
    
    // 重置到第一个 CFG
    setActiveCfgIndex(0);
    if (allCfgs.length > 0) {
      const firstCfg = allCfgs[0]!;
      setCfg(firstCfg);
      // 重新聚焦到第一个 CFG 的入口块
      if (firstCfg.entryBlock) {
        setActiveBlockId(firstCfg.entryBlock.id);
      } else {
        setActiveBlockId(null);
      }
    } else {
      // 如果没有 CFG，清空相关状态
      setCfg(null);
      setActiveBlockId(null);
    }
    
    setBlockSnapshots(new Map());
    setPendingSuccessors([]);
    setDfsStack([]);
    setIsTraversalCompleted(false);
    setIsAutoExecuting(false);
    setOriginalAssemblyCode('');
    setActiveTab('cfg'); // 切换到 CFG tab
    if (autoExecuteIntervalRef.current) {
      clearInterval(autoExecuteIntervalRef.current);
      autoExecuteIntervalRef.current = null;
    }
    // 清空汇编代码
    setAssemblyLines([]);
    setCurrentAssemblyLineIndex(null);
    assemblyGeneratorRef.current = null;
    setHighlightedVariables(new Set());
  }, [allCfgs]);


  // 生成汇编代码字符串的辅助函数
  const generateAssemblyCodeStrings = useCallback((lines: AssemblyLine[]) => {
    // 生成原始代码字符串
    const originalCode = lines.map(line => line.code).join('\n');
    return originalCode;
  }, []);

  // 当遍历完成时，生成并保存汇编代码字符串
  React.useEffect(() => {
    if (isTraversalCompleted && assemblyLines.length > 0) {
      const originalCode = generateAssemblyCodeStrings(assemblyLines);
      setOriginalAssemblyCode(originalCode);
    }
  }, [isTraversalCompleted, assemblyLines, generateAssemblyCodeStrings]);

  // 如果当前在 VM tab 但代码生成未完成，自动切换回 CFG tab
  React.useEffect(() => {
    if (activeTab === 'vm' && !isTraversalCompleted) {
      setActiveTab('cfg');
    }
  }, [activeTab, isTraversalCompleted]);

  // 自动执行处理
  React.useEffect(() => {
    if (isAutoExecuting && isStepping && currentBlock && scopeManager && cfg && activeCfgIndex < allCfgs.length) {
      // 如果已经有定时器在运行，先清除
      if (autoExecuteIntervalRef.current) {
        clearInterval(autoExecuteIntervalRef.current);
        autoExecuteIntervalRef.current = null;
      }
      
      // 启动自动执行定时器
      // 使用 ref 来调用 handleNextStep，避免依赖项变化导致 useEffect 重新运行
      autoExecuteIntervalRef.current = setInterval(() => {
        if (handleNextStepRef.current) {
          handleNextStepRef.current();
        }
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
  }, [isAutoExecuting, isStepping, currentBlock, scopeManager, cfg, activeCfgIndex, allCfgs.length]);


  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
      <Menu />
      
      {/* 页面标题和操作按钮 */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 pl-20 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <h1 className="text-2xl font-bold text-gray-900">程序入口和函数调用</h1>
            
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
              disabled={!cfg || (isStepping && !currentBlock) || isTraversalCompleted || isAutoExecuting || activeCfgIndex >= allCfgs.length}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isStepping ? '执行下一步' : '开始单步生成代码'}
            </button>
            <button
              onClick={() => {
                if (!isAutoExecuting) {
                  // 如果还没开始遍历，先开始遍历
                  // 注意：先设置 isAutoExecuting=true，然后调用 handleStartStepping(true) 来保持自动执行状态
                  setIsAutoExecuting(true);
                  if (!isStepping) {
                    // 使用 setTimeout 确保状态更新后再调用 handleStartStepping
                    setTimeout(() => {
                      handleStartStepping(true);
                    }, 0);
                  }
                } else {
                  // 停止自动执行
                  setIsAutoExecuting(false);
                  if (autoExecuteIntervalRef.current) {
                    clearInterval(autoExecuteIntervalRef.current);
                    autoExecuteIntervalRef.current = null;
                  }
                }
              }}
              disabled={!cfg || isTraversalCompleted || activeCfgIndex >= allCfgs.length}
              className={`px-4 py-2 rounded-md transition-colors ${
                isAutoExecuting
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isAutoExecuting ? '停止代码生成' : '自动执行代码生成'}
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
        {/* 左侧代码编辑器 - 20% */}
        <div className="w-[20%] px-3 py-6 border-r border-gray-200 flex-shrink-0 overflow-hidden flex flex-col">
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
                lineNumbersMinChars: 3,
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
        <div className="w-[40%] px-3 py-6 border-r border-gray-200 flex-shrink-0 overflow-hidden flex flex-col">
          <div className="h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            {/* Tab 切换栏 */}
            <div className="flex border-b border-gray-200 bg-gray-50">
              <button
                onClick={() => setActiveTab('cfg')}
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'cfg'
                    ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                CFG
              </button>
              <button
                onClick={() => {
                  if (isTraversalCompleted) {
                    setActiveTab('vm');
                  }
                }}
                disabled={!isTraversalCompleted}
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'vm'
                    ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                VM 执行
              </button>
            </div>
            
            {/* Tab 内容区域 */}
            <div className="flex-1 overflow-hidden relative">
              {/* CFG Tab 内容 - 保持挂载，只切换显示 */}
              <div className={`absolute inset-0 ${activeTab === 'cfg' ? '' : 'hidden'}`}>
            <CfgVisualizer
              cfg={cfg}
              activeBlockId={activeBlockId}
              visitedBlockIds={visitedBlocks}
            />
              </div>
              
              {/* VM 执行 Tab 内容 - 保持挂载，只切换显示 */}
              <div className={`absolute inset-0 ${activeTab === 'vm' ? '' : 'hidden'}`}>
                {isTraversalCompleted && originalAssemblyCode ? (
                  <div className="h-full flex flex-col">
                    {/* VM 执行器 */}
                    <div className="flex-1 overflow-hidden">
                      <VmExecutor
                        assemblyCode={originalAssemblyCode}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center bg-gray-50">
                    <div className="text-center text-gray-500">
                      <div className="text-4xl mb-4">🚀</div>
                      <p className="text-lg">VM 执行功能</p>
                      <p className="text-sm text-gray-400 mt-2">
                        {!isTraversalCompleted
                          ? '请先完成代码生成'
                          : '暂无可执行的汇编代码'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* 右侧栈结构展示 - 20% */}
        <div className="w-[20%] px-3 py-6 border-r border-gray-200 flex-shrink-0 overflow-hidden">
          <div className="h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <StackVisualizer
                stackFrames={stackFrames}
                currentBlockId={currentBlockId}
                autoStepIndex={isStepping && currentStepIndex >= 0 ? currentStepIndex : null}
                highlightedVariables={highlightedVariables}
              />
          </div>
        </div>
        
        {/* 最右侧汇编代码展示 - 20% */}
        <div className="w-[20%] px-3 py-6 flex-shrink-0 overflow-hidden">
          <div className="h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <AssemblyVisualizer
              assemblyLines={assemblyLines}
              currentLineIndex={currentAssemblyLineIndex}
              />
          </div>
        </div>
      </main>
    </div>
  );
};

export default EntryCallPage;

