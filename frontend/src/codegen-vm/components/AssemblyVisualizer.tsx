import React, { useEffect, useRef } from 'react';

export interface AssemblyLine {
  lineIndex: number;
  code: string;
  blockId?: string;
  stepIndex?: number;
  isActive?: boolean;
}

interface AssemblyVisualizerProps {
  assemblyLines: AssemblyLine[];
  currentLineIndex?: number | null;
  optimizedLines?: AssemblyLine[];
  isOptimized?: boolean;
  onOptimizeToggle?: () => void;
  showOptimizeButton?: boolean;
}

export const AssemblyVisualizer: React.FC<AssemblyVisualizerProps> = ({
  assemblyLines,
  currentLineIndex,
  optimizedLines,
  isOptimized = false,
  onOptimizeToggle,
  showOptimizeButton = false,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastLineRef = useRef<HTMLDivElement>(null);

  // 自动滚动到最新生成的内容
  useEffect(() => {
    if (lastLineRef.current && scrollContainerRef.current) {
      lastLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [assemblyLines.length]);

  // 决定显示哪些行（优化后的或原始的）
  const displayLines = isOptimized && optimizedLines ? optimizedLines : assemblyLines;

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">生成代码</h2>
        {showOptimizeButton && (
          <button
            onClick={onOptimizeToggle}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              isOptimized
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            title={isOptimized ? '显示原始代码' : '合并代码'}
          >
            {isOptimized ? '原始代码' : '合并代码'}
          </button>
        )}
      </div>
      
      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4 font-mono text-xs">
        {displayLines.length === 0 ? (
          <div className="text-gray-400 text-center mt-8">
            编译并开始遍历以生成汇编代码
          </div>
        ) : (
          <div className="space-y-0">
            {displayLines.map((line, idx) => {
              // 跳过空行
              if (!line.code.trim()) {
                return (
                  <div
                    key={idx}
                    ref={idx === displayLines.length - 1 ? lastLineRef : null}
                    className="px-2 py-0.5 h-2"
                  />
                );
              }
              // 判断是否是 label（以冒号结尾且没有前导空格）
              const isLabel = line.code.trim().endsWith(':') && !line.code.startsWith(' ');
              // 判断是否是合并块信息注释（; [entry,5,10] 格式）
              const isMergedBlockComment = line.code.trim().startsWith(';') && line.code.includes('[') && line.code.includes(']');
              const isActive = currentLineIndex !== null && currentLineIndex === line.lineIndex;
              
              return (
                <div
                  key={idx}
                  ref={idx === displayLines.length - 1 ? lastLineRef : null}
                  className={`px-2 py-0.5 whitespace-pre ${
                    isActive
                      ? 'bg-yellow-100 border-l-4 border-yellow-500'
                      : isMergedBlockComment
                      ? 'bg-blue-100 border-l-4 border-blue-500'
                      : isLabel
                      ? 'bg-gray-100'
                      : ''
                  }`}
                >
                  <span className={
                    isActive 
                      ? 'font-semibold text-yellow-800' 
                      : isMergedBlockComment
                      ? 'font-semibold text-blue-800'
                      : isLabel 
                      ? 'font-semibold text-gray-900' 
                      : 'text-gray-800'
                  }>
                    {line.code}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
