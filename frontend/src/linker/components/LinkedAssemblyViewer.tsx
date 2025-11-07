import React, { useEffect, useRef } from 'react';

interface LinkedAssemblyViewerProps {
  linkedCode: string; // 链接后的汇编代码（没有 label）
  currentAddress?: number | null; // 当前执行的地址（用于高亮）
}

export const LinkedAssemblyViewer: React.FC<LinkedAssemblyViewerProps> = ({ linkedCode, currentAddress }) => {
  const codeLines = linkedCode.split('\n');
  const containerRef = useRef<HTMLDivElement>(null);
  const currentLineRef = useRef<HTMLDivElement>(null);

  // 解析链接后的代码，找到每个地址对应的行号
  const addressToLineIndex = new Map<number, number>();
  codeLines.forEach((line, index) => {
    const addressMatch = line.match(/^\[(\d+)\]/);
    if (addressMatch) {
      const address = parseInt(addressMatch[1]!, 10);
      addressToLineIndex.set(address, index);
    }
  });

  // 只有在执行时才计算当前行（currentAddress 不为 null）
  const currentLineIndex = currentAddress !== null && currentAddress !== undefined 
    ? addressToLineIndex.get(currentAddress) ?? null 
    : null;

  // 自动滚动到当前执行的行（只在执行时）
  useEffect(() => {
    if (currentLineRef.current && containerRef.current && currentLineIndex !== null) {
      currentLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentAddress, currentLineIndex]);

  return (
    <div className="h-full overflow-auto bg-white p-4" ref={containerRef}>
      <div className="font-mono text-xs">
        {codeLines.map((line, index) => {
          const isEmpty = !line.trim() || line.trim().startsWith(';');
          const isFunctionEntry = line.includes('; 函数入口:');
          // 只有在执行时才高亮当前行
          const isCurrentLine = currentLineIndex !== null && currentLineIndex === index;
          
          return (
            <div
              key={index}
              ref={isCurrentLine ? currentLineRef : null}
              className={`px-2 py-1 ${
                isCurrentLine
                  ? 'bg-yellow-200 border-l-2 border-yellow-500'
                  : isFunctionEntry
                  ? 'bg-blue-50 border-l-2 border-blue-400'
                  : ''
              } ${isEmpty ? 'text-gray-400' : 'text-gray-900'}`}
            >
              {line || '\u00A0'}
            </div>
          );
        })}
      </div>
    </div>
  );
};

