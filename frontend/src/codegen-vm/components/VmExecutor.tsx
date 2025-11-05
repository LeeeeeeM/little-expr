import React, { useState, useEffect, useRef } from 'react';
import { AssemblyVM, type VMState } from '../lib/assembly-vm';

interface VmExecutorProps {
  assemblyCode: string; // 原始或合并后的汇编代码
  isMerged: boolean; // 是否为合并后的代码
}

export const VmExecutor: React.FC<VmExecutorProps> = ({ assemblyCode, isMerged }) => {
  const [vm] = useState(() => new AssemblyVM());
  const [vmState, setVmState] = useState<VMState | null>(null);
  const [currentLine, setCurrentLine] = useState<number | null>(null);
  const [isAutoExecuting, setIsAutoExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoExecuteIntervalRef = useRef<number | null>(null);
  const codeContainerRef = useRef<HTMLDivElement>(null);
  const currentLineRef = useRef<HTMLDivElement>(null);

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
  // 栈的有效范围是从 sp（栈顶，低地址）到 bp（栈底，高地址）
  // 在 x86 中，栈向下增长，所以 sp <= bp（sp 是低地址/栈顶，bp 是高地址/栈底）
  const getStackEntries = () => {
    if (!vmState) return [];
    
    const stackEntries: Array<{ address: number; value: number; isValid: boolean }> = [];
    const stackMap = vmState.stack;
    
    // 获取栈指针和基址指针
    const sp = vmState.registers.get('sp') || 0;
    const bp = vmState.registers.get('bp') || 0;
    
    // 栈的有效范围：从 sp（栈顶，低地址）到 bp（栈底，高地址）
    // add esp, x 时，sp 增加，栈收缩，有效范围缩小
    // sub esp, x 时，sp 减少，栈扩展，有效范围扩大
    const stackTop = Math.min(sp, bp); // 栈顶（低地址）
    const stackBottom = Math.max(sp, bp); // 栈底（高地址）
    
    // 获取所有已写入的栈地址
    const writtenAddresses = Array.from(stackMap.keys());
    
    if (writtenAddresses.length === 0) {
      // 如果栈为空，显示 sp 到 bp 之间的范围
      for (let addr = stackBottom; addr >= stackTop; addr--) {
        const isValid = addr >= stackTop && addr <= stackBottom;
        stackEntries.push({ address: addr, value: 0, isValid });
      }
    } else {
      // 显示所有已写入的地址，但标记哪些是当前有效的
      const allAddresses = new Set([...writtenAddresses, sp, bp]);
      const minAddr = Math.min(...Array.from(allAddresses));
      const maxAddr = Math.max(...Array.from(allAddresses));
      
      // 从高地址到低地址显示（栈底在上，栈顶在下）
      for (let addr = maxAddr; addr >= minAddr; addr--) {
        const value = stackMap.get(addr) ?? 0;
        // 有效栈范围：sp 到 bp 之间（包含边界）
        const isValid = addr >= stackTop && addr <= stackBottom;
        stackEntries.push({ address: addr, value, isValid });
      }
    }
    
    return stackEntries;
  };

  const stackEntries = getStackEntries();
  const sp = vmState?.registers.get('sp') ?? 0;
  const bp = vmState?.registers.get('bp') ?? 0;
  const ax = vmState?.registers.get('ax') ?? 0;
  const bx = vmState?.registers.get('bx') ?? 0;
  const flags = vmState?.flags ?? { greater: false, equal: false, less: false };

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
          {isMerged ? '合并代码' : '原始代码'} | 周期: {vmState?.cycles ?? 0}
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
          <div className="flex-1 overflow-auto p-4">
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

