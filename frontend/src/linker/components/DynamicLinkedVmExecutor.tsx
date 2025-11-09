import React, { useState, useEffect, useRef } from 'react';
import { DynamicLinkedCodeExecutor, type DynamicLinkedExecState } from '../lib/dynamic-linked-code-executor';
import type { CodeSegment } from './DynamicLinkedSegmentVisualizer';

interface DynamicLinkedVmExecutorProps {
  segments?: CodeSegment[]; // 代码段信息
  onStateChange?: (state: { currentSegment: number; currentAddress: number | null }) => void; // 状态变化回调
  onSegmentLoaded?: (segmentIndex: number) => void; // 段加载回调
}

export const DynamicLinkedVmExecutor: React.FC<DynamicLinkedVmExecutorProps> = ({ segments, onStateChange, onSegmentLoaded }) => {
  const [executor] = useState(() => new DynamicLinkedCodeExecutor());
  const [vmState, setVmState] = useState<DynamicLinkedExecState | null>(null);
  const [isAutoExecuting, setIsAutoExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoExecuteIntervalRef = useRef<number | null>(null);
  const stackContainerRef = useRef<HTMLDivElement | null>(null);
  const spElementRef = useRef<HTMLDivElement | null>(null);

  // 当代码段加载时，初始化执行器
  useEffect(() => {
    if (segments && segments.length > 0) {
      try {
        // 加载主程序（段0）
        // 参考 dynamic-link-runner.ts 的实现：使用 labelMap.get('main') 获取入口地址
        const mainSegment = segments.find(s => s.segmentIndex === 0);
        if (mainSegment) {
          const mainCode = mainSegment.codes.join('\n');
          // 从链接后的标签映射中获取 main 函数的入口地址（相对地址）
          let mainEntryAddress: number | undefined;
          if (mainSegment.labelMap) {
            mainEntryAddress = mainSegment.labelMap.get('main');
          }
          // 如果没有找到，尝试从代码中查找函数入口注释
          if (mainEntryAddress === undefined) {
            for (const line of mainSegment.codes) {
              if (line.includes('; 函数入口: main')) {
                const addressMatch = line.match(/^\[(\d+)\]/);
                if (addressMatch) {
                  mainEntryAddress = parseInt(addressMatch[1]!, 10);
                  break;
                }
              }
            }
          }
          
          executor.loadMainProgram(mainCode, mainEntryAddress);
        }

        // 设置段加载回调
        executor.setOnSegmentLoaded((segmentIndex) => {
          onSegmentLoaded?.(segmentIndex);
        });

        // 不立即加载库文件段，只注册函数信息（等待动态加载）
        // 注册库函数到 libMap（使用已链接的标签映射）
        segments.forEach(segment => {
          if (segment.labelMap) {
            // 使用已链接的标签映射
            segment.labelMap.forEach((relativeAddress, label) => {
              // 只注册函数名（不包含 block 标签）
              if (!label.includes('_block_') && !label.includes('_entry_')) {
                const absoluteAddress = segment.segmentIndex * 1000 + relativeAddress;
                const labelMap = new Map<string, number>();
                labelMap.set(label, absoluteAddress);
                
                executor.registerLibraryFunction(label, {
                  segmentIndex: segment.segmentIndex * 1000,
                  codes: segment.codes,
                  labelMap,
                  isLoaded: false // 标记为未加载，等待动态加载
                });
              }
            });
          }
        });

        setVmState(executor.getState());
        onStateChange?.({ currentSegment: executor.getState().currentSegment, currentAddress: null });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载代码段失败');
      }
    } else {
      // 如果 segments 为空，重置执行器状态
      executor.reset();
      setVmState(null);
      setIsAutoExecuting(false);
      if (autoExecuteIntervalRef.current) {
        clearInterval(autoExecuteIntervalRef.current);
        autoExecuteIntervalRef.current = null;
      }
      onStateChange?.({ currentSegment: 0, currentAddress: null });
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]); // 只在 segments 变化时执行，executor 和 onStateChange 是稳定的引用

  // 单步执行
  const handleStep = () => {
    if (vmState?.halted) return;
    
    try {
      const result = executor.step();
      setVmState(result.state);
      onStateChange?.({
        currentSegment: result.state.currentSegment,
        currentAddress: result.currentAddress
      });
      setError(result.success ? null : result.output);
    } catch (err) {
      setError(err instanceof Error ? err.message : '执行失败');
    }
  };

  // 自动执行
  const handleAutoExecute = () => {
    if (isAutoExecuting) {
      setIsAutoExecuting(false);
      if (autoExecuteIntervalRef.current) {
        clearInterval(autoExecuteIntervalRef.current);
        autoExecuteIntervalRef.current = null;
      }
    } else {
      setIsAutoExecuting(true);
      autoExecuteIntervalRef.current = window.setInterval(() => {
        const state = executor.getState();
        if (state.halted) {
          setIsAutoExecuting(false);
          if (autoExecuteIntervalRef.current) {
            clearInterval(autoExecuteIntervalRef.current);
            autoExecuteIntervalRef.current = null;
          }
          return;
        }
        const result = executor.step();
        setVmState(result.state);
        onStateChange?.({
          currentSegment: result.state.currentSegment,
          currentAddress: result.currentAddress
        });
        setError(result.success ? null : result.output);
        
        if (result.state.halted || result.currentAddress === null) {
          setIsAutoExecuting(false);
          if (autoExecuteIntervalRef.current) {
            clearInterval(autoExecuteIntervalRef.current);
            autoExecuteIntervalRef.current = null;
          }
        }
      }, 200);
    }
  };

  // 重置
  const handleReset = () => {
    if (autoExecuteIntervalRef.current) {
      clearInterval(autoExecuteIntervalRef.current);
      autoExecuteIntervalRef.current = null;
    }
    setIsAutoExecuting(false);
    // 重置执行器，然后重新加载代码段以使用正确的入口地址
    executor.reset();
    if (segments && segments.length > 0) {
      // 重新加载主程序（使用 main 入口地址）
      const mainSegment = segments.find(s => s.segmentIndex === 0);
      if (mainSegment) {
        const mainCode = mainSegment.codes.join('\n');
        let mainEntryAddress: number | undefined;
        if (mainSegment.labelMap) {
          mainEntryAddress = mainSegment.labelMap.get('main');
        }
        if (mainEntryAddress === undefined) {
          // 尝试从代码注释中查找
          for (const line of mainSegment.codes) {
            if (line.includes('; 函数入口: main')) {
              const addressMatch = line.match(/^\[(\d+)\]/);
              if (addressMatch) {
                mainEntryAddress = parseInt(addressMatch[1]!, 10);
                break;
              }
            }
          }
        }
        executor.loadMainProgram(mainCode, mainEntryAddress);
      }
    }
    setVmState(executor.getState());
    onStateChange?.({
      currentSegment: executor.getState().currentSegment,
      currentAddress: null
    });
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

  // 获取栈内容
  const getStackEntries = () => {
    if (!vmState) return [];
    
    const stackEntries: Array<{ address: number; value: number; isValid: boolean }> = [];
    const stackMap = vmState.stack;
    const sp = vmState.registers.get('sp') || 0;
    const initialStackBottom = 1023;
    
    const writtenAddresses = Array.from(stackMap.keys());
    let minAddr = sp;
    if (writtenAddresses.length > 0) {
      const minWrittenAddr = Math.min(...writtenAddresses);
      minAddr = Math.min(minWrittenAddr, sp);
    }
    
    for (let addr = initialStackBottom; addr >= minAddr; addr--) {
      const value = stackMap.get(addr) ?? 0;
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
  const currentSegment = vmState?.currentSegment ?? 0;

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

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 控制按钮 */}
      <div className="px-4 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-2 mb-2">
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
          周期: {vmState?.cycles ?? 0} | PC: {vmState?.pc ?? 0} | 段: {currentSegment}
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
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 寄存器和栈 */}
        <div className="flex-1 flex flex-col overflow-hidden">
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
            {/* 当前段显示 */}
            <div className="mb-2">
              <div className="text-sm font-semibold text-gray-700 mb-1">当前段</div>
              <div className="text-sm">
                <span className="text-gray-600">段索引: </span>
                <span className="font-mono font-semibold">{currentSegment}</span>
                <span className="text-gray-500 ml-2">
                  ({currentSegment === 0 ? '主程序' : `库函数段 ${currentSegment}`})
                </span>
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
      </div>
    </div>
  );
};

