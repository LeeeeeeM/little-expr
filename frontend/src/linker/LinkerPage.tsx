import React, { useState, useCallback, useMemo } from 'react';
import { message } from 'antd';
import { Menu } from '../components/Menu';
import { MultiFileEditor, type FileContent } from './components/MultiFileEditor';
import { LinkedVmExecutor } from './components/LinkedVmExecutor';
import { LinkedAssemblyViewer } from './components/LinkedAssemblyViewer';
import { DynamicLinkedVmExecutor } from './components/DynamicLinkedVmExecutor';
import { DynamicLinkedSegmentVisualizer, type CodeSegment } from './components/DynamicLinkedSegmentVisualizer';
import { Compiler } from './lib/compiler';
import { SimpleLinker } from './lib/linker';
import { StatementParser } from './lib/parser';
import { ScopeManager } from './lib/scope-manager';
import { AssemblyGenerator } from './lib/assembly-generator';
import type { ControlFlowGraph } from './lib/cfg-types';
// import type { Program } from './lib/types'; // 暂时未使用，保留用于未来动态链接功能

// 默认文件内容
const DEFAULT_FILES: FileContent[] = [
  {
    name: 'main.c',
    content: `int malloc(int a, int b);
int free(int a, int b);
int print(int a, int b);

int add(int a, int b) {
  return a + b;
}

int main() {
    int result = 0;
    result = free(10, 20);
    result = malloc(5, 15) + result;
    if (result > 0) {
      free(30, 40);
    }
    result = result + print(100, 200);
    result = result + add(1000, 2000) + add(1, 21);
    return result;
}`,
  },
  {
    name: 'lib/free.txt',
    content: `int free(int a, int b) {
  int result = a + b;
  if (result > 0) {
    result = result - 1;
  } else {
    result = result + 1;
  }
  return result;
}`,
  },
  {
    name: 'lib/malloc.txt',
    content: `int malloc(int a, int b) {
  int result = a * b;
  if (result > 0) {
    result = result - 1;
  } else {
    result = result + 1;
  }
  return result;
}`,
  },
  {
    name: 'lib/print.txt',
    content: `int malloc(int a, int b);

int print(int a, int b) {
  int result = a + b;
  result = 10000 + malloc(result, b);
  if (result > 0) {
    result = result + 1;
    if (result < 0) return -1;
  };
  return result;
}`,
  },
];


const LinkerPage: React.FC = () => {
  const [files, setFiles] = useState<FileContent[]>(DEFAULT_FILES);
  const [isValid, setIsValid] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>();
  const [isRunning, setIsRunning] = useState(false);
  // const [ast, setAst] = useState<Program | null>(null); // 暂时未使用，保留用于未来动态链接功能
  const [activeTab, setActiveTab] = useState<'static' | 'dynamic'>('static');
  const [isCompiled, setIsCompiled] = useState(false); // 是否编译成功
  const [linkedCode, setLinkedCode] = useState<string>(''); // 链接后的汇编代码
  const [mainEntryAddress, setMainEntryAddress] = useState<number | undefined>(undefined); // main 函数的入口地址
  const [currentAddress, setCurrentAddress] = useState<number | null>(null); // 当前执行的地址（用于高亮汇编代码）
  
  // 动态链接相关状态
  const [dynamicSegments, setDynamicSegments] = useState<CodeSegment[]>([]); // 动态链接的代码段
  const [loadedSegmentIndices, setLoadedSegmentIndices] = useState<Set<number>>(new Set([0])); // 已加载的段索引（初始只加载主程序段0）
  const [currentDynamicSegment, setCurrentDynamicSegment] = useState<number | undefined>(undefined); // 当前执行的段索引
  const [currentDynamicAddress, setCurrentDynamicAddress] = useState<number | null>(null); // 当前执行的地址
  const [hasRenderedDynamic, setHasRenderedDynamic] = useState(false); // 是否已经渲染过动态链接组件

  // 合并所有文件内容为单个代码字符串（用于编译）
  const mergedCode = useMemo(() => {
    return files.map(file => file.content).join('\n\n');
  }, [files]);

  const handleCompile = useCallback(async () => {
    if (!mergedCode.trim()) {
      return;
    }
    
    // 先清空之前静态链接和动态链接的状态（类似于重置功能）
    setLinkedCode('');
    setMainEntryAddress(undefined);
    setCurrentAddress(null);
    // 重置动态链接相关状态
    setDynamicSegments([]);
    setLoadedSegmentIndices(new Set([0])); // 重置为只加载主程序段
    setCurrentDynamicSegment(undefined);
    setCurrentDynamicAddress(null);
    setHasRenderedDynamic(false); // 重置渲染标记，下次点击动态链接 tab 时重新渲染
    setIsCompiled(false);
    // 切换到静态链接 tab
    setActiveTab('static');
    
    setIsRunning(true);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    // setAst(null); // 暂时未使用
    
    try {
      // 先单独检查每个库文件的函数声明（与后端保持一致）
      const libraryFiles = files.filter(f => f.name.startsWith('lib/'));
      if (libraryFiles.length > 0) {
        for (const libFile of libraryFiles) {
          const libParser = new StatementParser(libFile.content);
          const libParseResult = libParser.parse();
          
          if (!libParseResult.ast || libParseResult.errors.length > 0) {
            setIsRunning(false);
            const errorMsg = libParseResult.errors.map(e => e.message).join('; ');
            setErrorMessage(`库文件 ${libFile.name} 解析失败: ${errorMsg}`);
            setIsValid(false);
            setIsCompiled(false);
            return;
          }
        }
      }
      
      // 编译生成 CFG 和 AST（合并所有文件内容）
      const compiler = new Compiler();
      const compileResult = compiler.compile(mergedCode);
      
      if (!compileResult.success) {
        setIsRunning(false);
        const errorMsg = compileResult.errors.join('; ') || '编译失败';
        setErrorMessage(errorMsg);
        setIsValid(false);
        setIsCompiled(false);
        return;
      }
      
      // 设置 AST（原始 AST，用于可视化）
      // setAst(compileResult.ast); // 暂时未使用，保留用于未来动态链接功能
      
      // 收集被调用的函数（从 main 开始，递归收集所有被调用的函数）
      if (compileResult.cfgs && compileResult.cfgs.length > 0) {
        const calledFunctions = new Set<string>(['main']); // main 总是被包含
        const functionMap = new Map<string, ControlFlowGraph>();
        
        // 建立函数名到 CFG 的映射
        for (const cfg of compileResult.cfgs) {
          functionMap.set(cfg.functionName, cfg);
        }
        
        // 递归遍历表达式，查找函数调用
        const findFunctionCallsInExpression = (expr: any): string[] => {
          const calls: string[] = [];
          if (!expr) return calls;
          
          if (expr.type === 'FunctionCall' && expr.callee?.name) {
            calls.push(expr.callee.name);
            // 递归查找参数中的函数调用
            if (expr.arguments && Array.isArray(expr.arguments)) {
              for (const arg of expr.arguments) {
                calls.push(...findFunctionCallsInExpression(arg));
              }
            }
          } else if (expr.type === 'BinaryExpression') {
            calls.push(...findFunctionCallsInExpression(expr.left));
            calls.push(...findFunctionCallsInExpression(expr.right));
          } else if (expr.type === 'UnaryExpression') {
            calls.push(...findFunctionCallsInExpression(expr.operand));
          } else if (expr.type === 'ParenthesizedExpression') {
            calls.push(...findFunctionCallsInExpression(expr.expression));
          }
          
          return calls;
        };
        
        // 递归收集被调用的函数
        const collectCalledFunctions = (functionName: string) => {
          const cfg = functionMap.get(functionName);
          if (!cfg) return;
          
          // 遍历 CFG 的所有块，查找函数调用
          for (const block of cfg.blocks) {
            for (const stmt of block.statements) {
              // 在 ExpressionStatement 中查找
              if (stmt.type === 'ExpressionStatement') {
                const calls = findFunctionCallsInExpression((stmt as any).expression);
                for (const calledFuncName of calls) {
                  if (!calledFunctions.has(calledFuncName)) {
                    calledFunctions.add(calledFuncName);
                    collectCalledFunctions(calledFuncName);
                  }
                }
              }
              // 在 ReturnStatement 中查找
              else if (stmt.type === 'ReturnStatement' && (stmt as any).value) {
                const calls = findFunctionCallsInExpression((stmt as any).value);
                for (const calledFuncName of calls) {
                  if (!calledFunctions.has(calledFuncName)) {
                    calledFunctions.add(calledFuncName);
                    collectCalledFunctions(calledFuncName);
                  }
                }
              }
              // 在 AssignmentStatement 中查找
              else if (stmt.type === 'AssignmentStatement') {
                const calls = findFunctionCallsInExpression((stmt as any).value);
                for (const calledFuncName of calls) {
                  if (!calledFunctions.has(calledFuncName)) {
                    calledFunctions.add(calledFuncName);
                    collectCalledFunctions(calledFuncName);
                  }
                }
              }
              // 在 VariableDeclaration 中查找（检查 initializer）
              else if (stmt.type === 'VariableDeclaration' && (stmt as any).initializer) {
                const calls = findFunctionCallsInExpression((stmt as any).initializer);
                for (const calledFuncName of calls) {
                  if (!calledFunctions.has(calledFuncName)) {
                    calledFunctions.add(calledFuncName);
                    collectCalledFunctions(calledFuncName);
                  }
                }
              }
              // 在 LetDeclaration 中查找（检查 initializer）
              else if (stmt.type === 'LetDeclaration' && (stmt as any).initializer) {
                const calls = findFunctionCallsInExpression((stmt as any).initializer);
                for (const calledFuncName of calls) {
                  if (!calledFunctions.has(calledFuncName)) {
                    calledFunctions.add(calledFuncName);
                    collectCalledFunctions(calledFuncName);
                  }
                }
              }
            }
          }
        };
        
        // 从 main 开始收集
        collectCalledFunctions('main');
        
        // 检查所有被调用的函数是否都有定义
        const missingFunctions: string[] = [];
        for (const funcName of calledFunctions) {
          if (!functionMap.has(funcName)) {
            missingFunctions.push(funcName);
          }
        }
        
        if (missingFunctions.length > 0) {
          setIsRunning(false);
          setErrorMessage(`以下函数被调用但未定义: ${missingFunctions.join(', ')}`);
          setIsValid(false);
          setIsCompiled(false);
          return;
        }
        
        // 只生成被调用的函数的汇编代码
        const scopeManager = new ScopeManager();
        const assemblyGenerator = new AssemblyGenerator(scopeManager);
        const allAssemblyCode: string[] = [];
        
        for (const cfg of compileResult.cfgs) {
          if (calledFunctions.has(cfg.functionName)) {
            const assemblyCode = assemblyGenerator.generateAssembly(cfg);
            allAssemblyCode.push(assemblyCode);
          }
        }
        
        // 记录被链接的函数信息
        const linkedFunctionNames = Array.from(calledFunctions).sort();
        
        // 合并所有汇编代码
        const mergedAssembly = allAssemblyCode.join('\n\n');
        
        // 静态链接：使用 SimpleLinker 链接汇编代码
        const linker = new SimpleLinker();
        const linkResult = linker.link(mergedAssembly);
        
        if (linkResult.errors.length > 0) {
          setIsRunning(false);
          const linkErrorMsg = linkResult.errors.join('; ');
          setErrorMessage(`链接失败: ${linkErrorMsg}`);
          setIsValid(false);
          setIsCompiled(false);
          return;
        }
        
        // 保存链接后的代码和 main 函数的入口地址
        setLinkedCode(linkResult.linkedCode);
        const mainAddr = linkResult.labelMap.get('main');
        setMainEntryAddress(mainAddr);
        
        setIsRunning(false);
        const totalFunctions = compileResult.cfgs.length;
        const linkedCount = calledFunctions.size;
        const skippedCount = totalFunctions - linkedCount;
        let message = `编译成功！生成了 ${totalFunctions} 个函数，链接了 ${linkedCount} 个被调用的函数`;
        if (skippedCount > 0) {
          message += `（跳过了 ${skippedCount} 个未使用的函数）`;
        }
        message += `：${linkedFunctionNames.join(', ')}`;
        setSuccessMessage(message);
        setIsValid(true);
        setIsCompiled(true);
        
        // 从编译结果中提取代码段信息（用于动态链接可视化）
        // 为每个文件单独编译，生成独立的汇编代码段
        const segments: CodeSegment[] = [];
        
        // 编译主程序文件（段0）
        const mainFile = files.find(f => f.name === 'main.c');
        if (mainFile) {
          const mainCompiler = new Compiler();
          const mainCompileResult = mainCompiler.compile(mainFile.content);
          
          if (mainCompileResult.success && mainCompileResult.cfgs.length > 0) {
            const mainAssemblyCodes: string[] = [];
            for (const cfg of mainCompileResult.cfgs) {
              const assemblyCode = assemblyGenerator.generateAssembly(cfg);
              mainAssemblyCodes.push(assemblyCode);
            }
            
            // 链接主程序的汇编代码
            const mainLinker = new SimpleLinker();
            const mainLinkResult = mainLinker.link(mainAssemblyCodes.join('\n\n'));
            
            if (mainLinkResult.linkedCode) {
              // 提取链接后的汇编代码行（包含地址标注）
              const assemblyLines = mainLinkResult.linkedCode
                .split('\n')
                .filter(line => line.trim() && !line.trim().startsWith(';') && !line.trim().startsWith('==='));
              
              // 计算地址范围
              let startAddress = 0;
              let endAddress = 0;
              for (const line of assemblyLines) {
                const addressMatch = line.match(/^\[(\d+)\]/);
                if (addressMatch) {
                  const addr = parseInt(addressMatch[1]!, 10);
                  if (startAddress === 0 || addr < startAddress) startAddress = addr;
                  if (addr > endAddress) endAddress = addr;
                }
              }
              
              segments.push({
                segmentIndex: 0,
                name: '主程序',
                codes: assemblyLines,
                startAddress,
                endAddress: endAddress || startAddress + 100,
                labelMap: mainLinkResult.labelMap, // 保存标签映射，用于查找 main 入口地址
              });
            }
          }
        }
        
        // 编译每个库文件（段1, 2, 3...）
        const libraryFiles = files.filter(f => f.name.startsWith('lib/')).sort();
        libraryFiles.forEach((libFile, index) => {
          const libCompiler = new Compiler();
          const libCompileResult = libCompiler.compile(libFile.content);
          
          if (libCompileResult.success && libCompileResult.cfgs.length > 0) {
            const libAssemblyCodes: string[] = [];
            for (const cfg of libCompileResult.cfgs) {
              const assemblyCode = assemblyGenerator.generateAssembly(cfg);
              libAssemblyCodes.push(assemblyCode);
            }
            
            // 链接库文件的汇编代码
            const libLinker = new SimpleLinker();
            const libLinkResult = libLinker.link(libAssemblyCodes.join('\n\n'));
            
            if (libLinkResult.linkedCode) {
              // 提取链接后的汇编代码行（保留相对地址，后续在执行器中转换为绝对地址）
              const assemblyLines = libLinkResult.linkedCode
                .split('\n')
                .filter(line => line.trim() && !line.trim().startsWith(';') && !line.trim().startsWith('==='));
              
              // 计算地址范围（库文件段地址 = (index + 1) * 1000）
              const segmentBaseAddress = (index + 1) * 1000;
              let startAddress = segmentBaseAddress;
              let endAddress = segmentBaseAddress;
              
              for (const line of assemblyLines) {
                const addressMatch = line.match(/^\[(\d+)\]/);
                if (addressMatch) {
                  const relativeAddr = parseInt(addressMatch[1]!, 10);
                  const absoluteAddr = segmentBaseAddress + relativeAddr;
                  if (startAddress === segmentBaseAddress || absoluteAddr < startAddress) {
                    startAddress = absoluteAddr;
                  }
                  if (absoluteAddr > endAddress) {
                    endAddress = absoluteAddr;
                  }
                }
              }
              
              segments.push({
                segmentIndex: index + 1,
                name: libFile.name,
                codes: assemblyLines, // 保留相对地址
                startAddress,
                endAddress: endAddress || startAddress + 100,
                labelMap: libLinkResult.labelMap, // 保存标签映射，用于注册库函数
              });
            }
          }
        });
        
        setDynamicSegments(segments);
        setLoadedSegmentIndices(new Set([0])); // 重置为只加载主程序段
      } else {
        setIsRunning(false);
        setErrorMessage('未找到函数定义');
        setIsValid(false);
        setIsCompiled(false);
        setDynamicSegments([]);
      }
    } catch (error) {
      setIsRunning(false);
      setErrorMessage(error instanceof Error ? error.message : '编译错误');
      setIsValid(false);
      setIsCompiled(false);
    } finally {
      setIsRunning(false);
    }
  }, [mergedCode, files]);

  const handleFilesChange = useCallback((newFiles: FileContent[]) => {
    setFiles(newFiles);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    setIsValid(true);
    // 切换代码时清除之前的状态
    // setAst(null); // 暂时未使用
    // 不再自动切换 tab，允许用户在任何 tab 中编辑代码
  }, []);

  const handleReset = useCallback(() => {
    setFiles(DEFAULT_FILES);
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    // setAst(null); // 暂时未使用
    setLinkedCode('');
    setMainEntryAddress(undefined);
    setCurrentAddress(null);
    // 重置动态链接相关状态
    setDynamicSegments([]);
    setLoadedSegmentIndices(new Set([0])); // 重置为只加载主程序段
    setCurrentDynamicSegment(undefined);
    setCurrentDynamicAddress(null);
    setHasRenderedDynamic(false); // 重置渲染标记，下次点击动态链接 tab 时重新渲染
    // 切换到静态链接 tab 并禁用 tab 切换
    setActiveTab('static');
    setIsCompiled(false);
  }, []);



  return (
    <div className="min-h-screen bg-gray-100">
      <Menu />
      
      {/* 页面标题和操作按钮 */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 pl-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <h1 className="text-2xl font-bold text-gray-900">链接器</h1>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={handleCompile}
              disabled={isRunning || !mergedCode.trim()}
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
        {/* 左侧代码编辑器 - 40% */}
        <div className="w-[40%] p-6 border-r border-gray-200">
          <MultiFileEditor
            files={files}
            onFilesChange={handleFilesChange}
            isValid={isValid}
            errorMessage={errorMessage}
            successMessage={successMessage}
          />
        </div>
        
        {/* 右侧展示区域 - 60% */}
        <div className="w-[60%] p-6">
          <div className="h-full bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col overflow-hidden">
            {/* Tab 切换栏 */}
            <div className="flex border-b border-gray-200 bg-gray-50">
              <button
                onClick={() => isCompiled && setActiveTab('static')}
                disabled={!isCompiled}
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'static'
                    ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                静态链接
              </button>
              <button
                onClick={() => {
                  if (isCompiled) {
                    setActiveTab('dynamic');
                    setHasRenderedDynamic(true); // 标记已渲染过
                  }
                }}
                disabled={!isCompiled}
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'dynamic'
                    ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                动态链接
              </button>
            </div>
            
            {/* Tab 内容区域 */}
            <div className="flex-1 overflow-hidden relative">
              {/* 静态链接 Tab 内容 - 保持挂载，只切换显示 */}
              <div className={`absolute inset-0 flex ${activeTab === 'static' ? '' : 'hidden'}`}>
                {/* 左侧：VM 执行器 */}
                <div className="w-1/2">
                  {linkedCode ? (
                    <LinkedVmExecutor 
                      linkedCode={linkedCode} 
                      entryAddress={mainEntryAddress}
                      onStateChange={setCurrentAddress}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center bg-gray-50">
                      <div className="text-center text-gray-500">
                        <div className="text-4xl mb-4">🚀</div>
                        <p className="text-lg">VM 执行功能</p>
                        <p className="text-sm text-gray-400 mt-2">
                          {!isCompiled
                            ? '请先编译代码'
                            : '暂无可执行的链接代码'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* 右侧：链接后的汇编代码 */}
                <div className="w-1/2">
                  {linkedCode ? (
                    <LinkedAssemblyViewer linkedCode={linkedCode} currentAddress={currentAddress} />
                  ) : (
                    <div className="h-full flex items-center justify-center bg-gray-50">
                      <div className="text-center text-gray-500">
                        <div className="text-4xl mb-4">📄</div>
                        <p className="text-lg">链接后的汇编代码</p>
                        <p className="text-sm text-gray-400 mt-2">
                          {!isCompiled
                            ? '请先编译代码'
                            : '暂无可显示的链接代码'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* 动态链接 Tab 内容 - 首次点击后渲染，之后保留状态 */}
              {hasRenderedDynamic && (
                <div className={`absolute inset-0 flex ${activeTab === 'dynamic' ? '' : 'hidden'}`}>
                  {/* 左侧：VM 执行器 (40%) */}
                  <div className="w-[40%] border-r border-gray-200">
                    <DynamicLinkedVmExecutor 
                      segments={dynamicSegments}
                      onStateChange={(state) => {
                        setCurrentDynamicSegment(state.currentSegment);
                        setCurrentDynamicAddress(state.currentAddress);
                      }}
                      onSegmentLoaded={(segmentIndex) => {
                        setLoadedSegmentIndices(prev => new Set([...prev, segmentIndex]));
                        // 显示动态加载段的提示
                        const segment = dynamicSegments.find(s => s.segmentIndex === segmentIndex);
                        if (segment) {
                          message.success(`动态加载段: ${segment.name} (段 ${segmentIndex})`);
                        }
                      }}
                    />
                  </div>
                  
                  {/* 右侧：代码段可视化 (60%) */}
                  <div className="w-[60%]">
                    {dynamicSegments.length > 0 ? (
                      <DynamicLinkedSegmentVisualizer
                        segments={dynamicSegments.filter(s => loadedSegmentIndices.has(s.segmentIndex))}
                        currentSegment={currentDynamicSegment}
                        currentAddress={currentDynamicAddress}
                        onSegmentClick={(_segmentIndex) => {
                          // 段点击处理（暂未使用）
                        }}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center bg-gray-50">
                        <div className="text-center text-gray-500">
                          <div className="text-4xl mb-4">🔗</div>
                          <p className="text-lg">动态链接代码段可视化</p>
                          <p className="text-sm text-gray-400 mt-2">
                            {!isCompiled
                              ? '请先编译代码'
                              : '暂无可显示的代码段'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LinkerPage;

