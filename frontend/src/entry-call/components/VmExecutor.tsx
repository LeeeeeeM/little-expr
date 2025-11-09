import React, { useState, useEffect, useRef } from 'react';
import { AssemblyVM, type VMState } from '../lib/assembly-vm';

interface VmExecutorProps {
  assemblyCode: string; // 汇编代码
}

export const VmExecutor: React.FC<VmExecutorProps> = ({ assemblyCode }) => {
  const [vm] = useState(() => new AssemblyVM());
  const [vmState, setVmState] = useState<VMState | null>(null);
  const [currentLine, setCurrentLine] = useState<number | null>(null);
  const [isAutoExecuting, setIsAutoExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoExecuteIntervalRef = useRef<number | null>(null);
  const codeContainerRef = useRef<HTMLDivElement>(null);
  const currentLineRef = useRef<HTMLDivElement>(null);
  const stackContainerRef = useRef<HTMLDivElement | null>(null);
  const spElementRef = useRef<HTMLDivElement | null>(null);

  // 加载汇编代码
  useEffect(() => {
    if (assemblyCode) {
      try {
        vm.loadAssembly(assemblyCode);
        setVmState(vm.getState());
        setCurrentLine(null);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载汇编代码失败');
      }
    }
  }, [assemblyCode, vm]);

  // 单步执行
  const handleStep = () => {
    if (vmState?.halted) return;
    
    try {
      const result = vm.step();
      setVmState(result.state);
      setCurrentLine(result.currentLine);
      setError(result.success ? null : result.output);
    } catch (err) {
      setError(err instanceof Error ? err.message : '执行失败');
    }
  };

  // 自动执行
  const handleAutoExecute = () => {
    if (isAutoExecuting) {
      // 停止自动执行
      setIsAutoExecuting(false);
      if (autoExecuteIntervalRef.current) {
        clearInterval(autoExecuteIntervalRef.current);
        autoExecuteIntervalRef.current = null;
      }
    } else {
      // 开始自动执行
      setIsAutoExecuting(true);
      autoExecuteIntervalRef.current = window.setInterval(() => {
        const state = vm.getState();
        if (state.halted) {
          setIsAutoExecuting(false);
          if (autoExecuteIntervalRef.current) {
            clearInterval(autoExecuteIntervalRef.current);
            autoExecuteIntervalRef.current = null;
          }
          return;
        }
        const result = vm.step();
        setVmState(result.state);
        setCurrentLine(result.currentLine);
        setError(result.success ? null : result.output);
        
        // 检查是否执行完成
        if (result.state.halted || result.currentLine === null) {
          setIsAutoExecuting(false);
          if (autoExecuteIntervalRef.current) {
            clearInterval(autoExecuteIntervalRef.current);
            autoExecuteIntervalRef.current = null;
          }
        }
      }, 200); // 每 200ms 执行一步
    }
  };

  // 重置
  const handleReset = () => {
    if (autoExecuteIntervalRef.current) {
      clearInterval(autoExecuteIntervalRef.current);
      autoExecuteIntervalRef.current = null;
    }
    setIsAutoExecuting(false);
    vm.reset();
    setVmState(vm.getState());
    setCurrentLine(null);
    setError(null);
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (autoExecuteIntervalRef.current) {
        clearInterval(autoExecuteIntervalRef.current);
      }
    };
  }, []);

  // 自动滚动到当前执行的行
  useEffect(() => {
    if (currentLineRef.current && codeContainerRef.current) {
      currentLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentLine]);

  // 获取栈内容（从高地址到低地址，栈底在上，栈顶在下）
  // 在 x86 中，栈向下增长（从高地址向低地址）
  // SP 指向栈顶（当前最低的有效地址）
  // 所有地址 >= SP 的都是有效的（包括当前栈帧和调用者栈帧）
  // 所有地址 < SP 的都是已释放的（栈收缩后留下的空间）
  const getStackEntries = () => {
    if (!vmState) return [];
    
    const stackEntries: Array<{ address: number; value: number; isValid: boolean }> = [];
    const stackMap = vmState.stack;
    
    // 获取栈指针
    const sp = vmState.registers.get('sp') || 0;
    
    // 初始栈底地址
    const initialStackBottom = 1023;
    
    // 获取所有已写入的栈地址，用于确定显示范围
    const writtenAddresses = Array.from(stackMap.keys());
    
    // 确定最小地址：显示从初始栈底到最小已写入地址（或 SP，取更小的）
    // 这样即使地址 < SP（已释放），只要有数据写入过，也会显示
    let minAddr = sp;
    if (writtenAddresses.length > 0) {
      const minWrittenAddr = Math.min(...writtenAddresses);
      minAddr = Math.min(minWrittenAddr, sp);
    }
    
    // 始终显示从初始栈底（1023）到最小地址的所有地址
    // 包括已释放的地址（< SP）也会显示
    for (let addr = initialStackBottom; addr >= minAddr; addr--) {
      const value = stackMap.get(addr) ?? 0;
      // 有效判断：地址 >= SP 就是有效的（包括当前栈帧和调用者栈帧）
      // 地址 < SP 就是已释放的
      const isValid = addr >= sp;
      stackEntries.push({ address: addr, value, isValid });
    }
    
    return stackEntries;
  };

  const stackEntries = getStackEntries();
  const sp = vmState?.registers.get('sp') ?? 0;
  const bp = vmState?.registers.get('bp') ?? 0;
  const ax = vmState?.registers.get('ax') ?? 0;
  const bx = vmState?.registers.get('bx') ?? 0;
  const flags = vmState?.flags ?? { greater: false, equal: false, less: false };

  // 当 SP 变化时，滚动到 SP 位置，确保它在视图中
  useEffect(() => {
    if (spElementRef.current && stackContainerRef.current) {
      const container = stackContainerRef.current;
      const element = spElementRef.current;
      
      // 计算元素相对于容器的位置
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      
      // 计算元素在滚动容器中的偏移量
      const elementOffsetTop = elementRect.top - containerRect.top + container.scrollTop;
      const containerCenter = container.clientHeight / 2;
      const targetScrollTop = elementOffsetTop - containerCenter;
      
      // 滚动到目标位置
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });
    }
  }, [sp]);

  const codeLines = assemblyCode.split('\n');

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 控制按钮 */}
      <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleStep}
            disabled={isAutoExecuting || vmState?.halted || !vmState}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            单步执行
          </button>
          <button
            onClick={handleAutoExecute}
            disabled={vmState?.halted || !vmState}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              isAutoExecuting
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-green-600 text-white hover:bg-green-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isAutoExecuting ? '停止' : '自动执行'}
          </button>
          <button
            onClick={handleReset}
            disabled={!vmState}
            className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            重置
          </button>
        </div>
        <div className="text-sm text-gray-600">
          周期: {vmState?.cycles ?? 0}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 执行结果提示 */}
      {vmState?.halted && !error && (
        <div className="px-4 py-2 bg-green-50 border-b border-green-200 text-green-700 text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="font-semibold">✅ 执行完成</span>
            <span className="text-gray-600">返回值 (AX):</span>
            <span className="font-mono font-bold text-green-800">{ax}</span>
          </div>
          <div className="text-xs text-gray-500">
            执行周期: {vmState?.cycles ?? 0}
          </div>
        </div>
      )}

      {/* 主要内容区域 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：寄存器和栈 */}
        <div className="w-[40%] border-r border-gray-200 flex flex-col overflow-hidden">
          {/* 寄存器显示 */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="mb-2">
              <div className="text-sm font-semibold text-gray-700 mb-1">寄存器</div>
              <div className="flex items-center space-x-4 text-sm">
                <div className="flex items-center space-x-2">
                  <span className="text-gray-600">ax:</span>
                  <span className="font-mono font-semibold">{ax}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-600">bx:</span>
                  <span className="font-mono font-semibold">{bx}</span>
                </div>
              </div>
            </div>
            <div className="mb-2">
              <div className="flex items-center space-x-4 text-sm">
                <div className="flex items-center space-x-2">
                  <span className="text-gray-600">sp:</span>
                  <span className="font-mono font-semibold">{sp}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-600">bp:</span>
                  <span className="font-mono font-semibold">{bp}</span>
                </div>
              </div>
            </div>
            {/* 标志位显示 */}
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-1">标志位</div>
              <div className="flex items-center space-x-3 text-sm">
                <div className={`flex items-center space-x-1 px-2 py-1 rounded ${
                  flags.equal ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  <span className="font-semibold">EQ</span>
                  <span className="text-xs">{flags.equal ? '1' : '0'}</span>
                </div>
                <div className={`flex items-center space-x-1 px-2 py-1 rounded ${
                  flags.greater ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  <span className="font-semibold">GT</span>
                  <span className="text-xs">{flags.greater ? '1' : '0'}</span>
                </div>
                <div className={`flex items-center space-x-1 px-2 py-1 rounded ${
                  flags.less ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  <span className="font-semibold">LT</span>
                  <span className="text-xs">{flags.less ? '1' : '0'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 栈显示 */}
          <div 
            ref={stackContainerRef}
            className="flex-1 overflow-auto p-4"
          >
            <div className="text-sm font-semibold text-gray-700 mb-2">栈（从高到低）</div>
            <div className="space-y-1">
              {stackEntries.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-4">栈为空</div>
              ) : (
                stackEntries.map((entry, index) => {
                  const isSp = entry.address === sp;
                  const isBp = entry.address === bp;
                  const isValid = entry.isValid;
                  return (
                    <div
                      key={index}
                      ref={isSp ? spElementRef : undefined}
                      className={`flex items-center justify-between p-2 rounded text-xs border ${
                        isBp
                          ? 'bg-blue-100 border-blue-300'
                          : isSp
                          ? 'bg-green-100 border-green-300'
                          : isValid
                          ? 'bg-gray-50 border-gray-200'
                          : 'bg-gray-100 border-gray-300 opacity-50'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className={`font-mono ${isValid ? 'text-gray-600' : 'text-gray-400'}`}>
                          [{entry.address}]
                        </span>
                        {isBp && <span className="text-xs text-blue-600 font-semibold">BP</span>}
                        {isSp && <span className="text-xs text-green-600 font-semibold">SP</span>}
                        {!isValid && <span className="text-xs text-gray-400">(已释放)</span>}
                      </div>
                      <span className={`font-mono font-semibold ${isValid ? 'text-gray-900' : 'text-gray-400'}`}>
                        {entry.value}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 右侧：代码显示 */}
        <div className="flex-1 overflow-auto bg-white" ref={codeContainerRef}>
          <div className="p-4 font-mono text-xs">
            {codeLines.map((line, index) => {
              const isCurrentLine = currentLine === index;
              const isEmpty = !line.trim() || line.trim().startsWith(';');
              const isLabel = line.trim().endsWith(':');
              
              return (
                <div
                  key={index}
                  ref={isCurrentLine ? currentLineRef : null}
                  className={`px-2 py-1 ${
                    isCurrentLine
                      ? 'bg-yellow-200 border-l-2 border-yellow-500'
                      : isLabel
                      ? 'bg-gray-100'
                      : ''
                  } ${isEmpty ? 'text-gray-400' : ''}`}
                >
                  {line || '\u00A0'}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

