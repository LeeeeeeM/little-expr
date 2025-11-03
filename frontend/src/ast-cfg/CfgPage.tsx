import React, { useState, useCallback, useMemo } from 'react';
import { Menu } from '../components/Menu';
import { CodeEditorWithBlockHighlight } from './components/CodeEditorWithBlockHighlight';
import { CfgVisualizer } from './components/CfgVisualizer';
import { AstVisualizer } from './components/AstVisualizer';
import { Compiler } from './lib/compiler';
import type { ControlFlowGraph } from './lib/cfg-types';
import type { Program } from './lib/types';
import { computeBlockHighlights } from './utils/blockHighlight';

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
    label: 'For 循环测试 (for-loop-test)', 
    value: `int loopTest() {
  int a = 1;
  int i = 1;
  for (let i = 0; i < 10; i = i + 1) {
    let b = 2;
    a = b + a;
  }
  return a;
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
  { 
    label: '作用域测试 (test-scope)', 
    value: `int test() {
  let i = 0;
  let j = 10;
  i = i + 1;
  if (j > 0) {
    j = 2;
  }
  let i = 100;
  return i;
}`
  },
  { 
    label: 'While 循环 (while-loop-test)', 
    value: `int whileTest() {
  int a = 1;
  while (a < 10) {
    int b = 1;
    a = a + b;
  }
  return a;
}`
  },
  { 
    label: 'For 循环作用域 2 (test-for-scope-2)', 
    value: `int test2() {
  for (let i = 0; i < 5; i = i+1) {
    // i 在 for 循环作用域中
  }
  return i;  // 应该报错，因为 i 不在当前作用域
}`
  },
  { 
    label: '复杂测试 (1.txt)', 
    value: `int checkGrade() {
    let grade = 0;
    let score = 70;
    {
      let i = 0;
      score = score + 1;
    }

    let xxx = 222;
    
    if (score >= 80) {
      let bonusB = 5;
      grade = 2;
      let grade = 2;
      {
        grade = grade + 20;
        let c = 100;
        if (c > 90) {
          c = 80;
        }
      }
      let cc = 1110;
      cc = 222;
    }
    let k = 9990;
    {
      let k1 = 99;
      k = 10;
      grade = 2;
    }
    if (k > 88) {
      let jj = 111;
    }
    return grade;
}`
  },
];

const CfgPage: React.FC = () => {
  const [code, setCode] = useState(PRESET_CODE_SAMPLES[0].value);
  const [isValid, setIsValid] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>();
  const [isRunning, setIsRunning] = useState(false);
  const [cfg, setCfg] = useState<ControlFlowGraph | null>(null);
  const [ast, setAst] = useState<Program | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cfg' | 'ast'>('cfg');

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    setIsValid(true);
    // 切换代码时清除之前的高亮和选中状态
    setCfg(null);
    setAst(null);
    setSelectedBlockId(null);
  }, []);

  const handleCompile = useCallback(async () => {
    if (!code.trim()) return;
    
    setIsRunning(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    setCfg(null);
    setAst(null);
    
    try {
      // 编译生成 CFG 和 AST
      const compiler = new Compiler();
      const compileResult = compiler.compile(code);
      
      if (!compileResult.success) {
        setIsRunning(false);
        const errorMsg = compileResult.errors.join('; ') || '编译失败';
        setErrorMessage(errorMsg);
        setIsValid(false);
        return;
      }
      
      // 设置 AST（原始 AST，用于可视化）
      setAst(compileResult.ast);
      
      // 获取第一个函数的 CFG
      if (compileResult.cfgs && compileResult.cfgs.length > 0) {
        setCfg(compileResult.cfgs[0]);
        setSelectedBlockId(null); // 编译新代码时清除选中状态
        setIsRunning(false);
        setSuccessMessage(`编译成功！生成了 ${compileResult.cfgs.length} 个函数的 CFG`);
        setIsValid(true);
      } else {
        setIsRunning(false);
        setErrorMessage('未找到函数定义');
        setIsValid(false);
      }
    } catch (error) {
      setIsRunning(false);
      setErrorMessage(error instanceof Error ? error.message : '编译错误');
      setIsValid(false);
    }
  }, [code]);

  const handleReset = useCallback(() => {
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    setCfg(null);
    setAst(null);
    setSelectedBlockId(null);
  }, []);

  const handleBlockSelect = useCallback((blockId: string | null) => {
    setSelectedBlockId(blockId);
  }, []);

  // 计算块高亮信息
  const blockHighlights = useMemo(() => {
    return computeBlockHighlights(cfg, code);
  }, [cfg, code]);

  return (
    <div className="min-h-screen bg-gray-100">
      <Menu />
      
      {/* 页面标题和操作按钮 */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 pl-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <h1 className="text-2xl font-bold text-gray-900">从 ast 到 cfg</h1>
            
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
              onClick={handleReset}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              重置
            </button>
          </div>
        </div>
      </header>
      
      <main className="flex h-[calc(100vh-80px)]">
        {/* 左侧代码编辑器 - 30% */}
        <div className="w-[30%] p-6 border-r border-gray-200">
          <CodeEditorWithBlockHighlight
            value={code}
            onChange={handleCodeChange}
            blockHighlights={blockHighlights}
            selectedBlockId={selectedBlockId}
            isValid={isValid}
            errorMessage={errorMessage}
            successMessage={successMessage}
          />
        </div>
        
        {/* 右侧展示区域 - 70% */}
        <div className="w-[70%] p-6">
          <div className="h-full bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
            {/* Tab 导航 */}
            <div className="flex border-b border-gray-200 flex-shrink-0">
              <button
                onClick={() => {
                  setActiveTab('cfg');
                  // 切换到 CFG 时清除选中状态，恢复所有块的颜色
                  setSelectedBlockId(null);
                }}
                className={`px-6 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'cfg'
                    ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                CFG
              </button>
              <button
                onClick={() => {
                  setActiveTab('ast');
                  // 切换到 AST 时清除选中状态，恢复所有块的颜色
                  setSelectedBlockId(null);
                }}
                className={`px-6 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'ast'
                    ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                AST
              </button>
            </div>
            
            {/* Tab 内容 */}
            <div className="flex-1 min-h-0">
              {activeTab === 'cfg' ? (
                <CfgVisualizer cfg={cfg} onBlockSelect={handleBlockSelect} />
              ) : (
                <AstVisualizer ast={ast} />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CfgPage;

