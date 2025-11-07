import React from 'react';
import type { StackFrame, ScopeInfo } from '../CodegenVmPage';

interface StackVisualizerProps {
  stackFrames: StackFrame[];
  currentBlockId: string | null;
  autoStepIndex?: number | null; // 自动设置的步骤索引（逐步执行时使用）
  highlightedVariables?: Set<string>; // 需要高亮的变量名集合
}

export const StackVisualizer: React.FC<StackVisualizerProps> = ({
  stackFrames,
  currentBlockId,
  autoStepIndex,
  highlightedVariables = new Set(),
}) => {
  const [selectedStepIndex, setSelectedStepIndex] = React.useState<number>(0);
  const stepsContainerRef = React.useRef<HTMLDivElement>(null);
  const stepButtonRefs = React.useRef<Map<number, HTMLButtonElement>>(new Map());
  
  // 获取当前块的栈帧（优先显示选中的块，否则显示最后一个）
  const currentFrame = React.useMemo(() => {
    if (currentBlockId) {
      // 查找选中块的栈帧
      const frame = stackFrames.find(f => f.blockId === currentBlockId);
      if (frame) return frame;
    }
    // 默认显示最后一个
    return stackFrames.length > 0 ? stackFrames[stackFrames.length - 1]! : null;
  }, [stackFrames, currentBlockId]);
  
  // 当切换块时，重置步骤索引
  React.useEffect(() => {
    if (currentFrame && currentFrame.steps.length > 0) {
      // 如果提供了 autoStepIndex，使用它；否则使用最后一个
      if (autoStepIndex !== null && autoStepIndex !== undefined) {
        setSelectedStepIndex(Math.min(autoStepIndex, currentFrame.steps.length - 1));
      } else {
        setSelectedStepIndex(currentFrame.steps.length - 1);
      }
    }
    // 清空按钮引用，因为切换块时步骤列表会变化
    stepButtonRefs.current.clear();
  }, [currentFrame, autoStepIndex]);

  // 当选中步骤更新时，自动滚动到对应的按钮
  React.useEffect(() => {
    // 使用 setTimeout 确保 DOM 已更新
    const timeoutId = setTimeout(() => {
      if (selectedStepIndex >= 0 && stepButtonRefs.current.has(selectedStepIndex)) {
        const button = stepButtonRefs.current.get(selectedStepIndex);
        const container = stepsContainerRef.current;
        
        if (button && container) {
          // 计算按钮相对于容器的位置
          const scrollLeft = container.scrollLeft;
          const buttonOffsetLeft = button.offsetLeft;
          const buttonWidth = button.offsetWidth;
          const containerWidth = container.clientWidth;
          
          // 如果按钮不在可视区域内，滚动到它
          if (buttonOffsetLeft < scrollLeft) {
            // 按钮在左侧，滚动到按钮左边缘
            container.scrollTo({
              left: buttonOffsetLeft - 10, // 留出一点边距
              behavior: 'smooth'
            });
          } else if (buttonOffsetLeft + buttonWidth > scrollLeft + containerWidth) {
            // 按钮在右侧，滚动到按钮右边缘可见
            container.scrollTo({
              left: buttonOffsetLeft + buttonWidth - containerWidth + 10, // 留出一点边距
              behavior: 'smooth'
            });
          }
        }
      }
    }, 0);
    
    return () => clearTimeout(timeoutId);
  }, [selectedStepIndex, currentFrame]);
  
  // 获取当前选中的步骤
  const currentStep = React.useMemo(() => {
    if (!currentFrame || currentFrame.steps.length === 0) {
      return null;
    }
    const step = currentFrame.steps[selectedStepIndex];
    return step || currentFrame.steps[currentFrame.steps.length - 1]!;
  }, [currentFrame, selectedStepIndex]);

  // 根据作用域解析规则查找所有需要高亮的变量：从栈顶（最内层）向栈底（最外层）查找
  // 只匹配 init: true 的变量（已初始化的变量）
  // 返回一个 Map，key 是 "scopeIndex-variableIndex"，value 是变量信息
  const findHighlightedVariables = React.useMemo(() => {
    if (!highlightedVariables || highlightedVariables.size === 0 || !currentStep) {
      return new Map<string, { scopeIndex: number; variableIndex: number }>();
    }
    
    const highlightedMap = new Map<string, { scopeIndex: number; variableIndex: number }>();
    
    // 对于每个需要高亮的变量，从栈顶（最内层）向栈底（最外层）查找第一个匹配的变量
    for (const varName of highlightedVariables) {
    for (let i = currentStep.scopeStack.length - 1; i >= 0; i--) {
      const scope = currentStep.scopeStack[i]!;
      // 只匹配 init: true 的变量
        const foundVarIndex = scope.variables.findIndex((v: { name: string; offset: number; init: boolean }) => v.name === varName && v.init);
      if (foundVarIndex !== -1) {
          // 找到第一个匹配的变量，记录其位置
          const key = `${i}-${foundVarIndex}`;
          highlightedMap.set(key, { scopeIndex: i, variableIndex: foundVarIndex });
          break; // 找到后跳出，只高亮最内层的匹配
        }
      }
    }
    
    return highlightedMap;
  }, [highlightedVariables, currentStep]);

  if (!currentFrame || !currentStep) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-4">📚</div>
          <p className="text-lg">等待遍历 CFG</p>
          <p className="text-sm text-gray-400 mt-2">点击"遍历 cfg 查看栈布局"按钮</p>
        </div>
      </div>
    );
  }

  // 计算栈的总深度（变量总数）
  const totalDepth = currentStep.scopeStack.reduce(
    (sum: number, scope: ScopeInfo) => sum + scope.variables.length,
    0
  );

  // 从栈底到栈顶渲染（栈底在上面，栈顶在下方）
  const renderStack = () => {
    const elements: React.ReactNode[] = [];

      // 从上到下遍历作用域栈（栈底在上，栈顶在下）
      // scopeStack[0] 是最外层（栈底），scopeStack[length-1] 是最内层（栈顶）
      for (let i = 0; i < currentStep.scopeStack.length; i++) {
        const scope = currentStep.scopeStack[i]!;
        const isInnerMost = i === currentStep.scopeStack.length - 1;
        
        elements.push(
          <div key={`scope-${i}`} className="mb-3">
            <div className={`${isInnerMost ? 'bg-indigo-50 border-indigo-500' : 'bg-blue-50 border-blue-500'} border-l-4 px-3 py-2 mb-1 rounded-r`}>
              <div className={`text-xs font-semibold ${isInnerMost ? 'text-indigo-700' : 'text-blue-700'}`}>
                {scope.scopeId}
              </div>
              {scope.variables.length > 0 && (
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {scope.variables.length} 个变量
                </div>
              )}
            </div>
            
            {/* 变量列表 */}
            {scope.variables.length > 0 ? (
              <div className="space-y-1 ml-2">
                {/* 按照 offset 从大到小排序：ebp+3, ebp+2, ebp+1, ebp-1, ebp-2... */}
                {scope.variables
                  .map((variable: { name: string; offset: number; init: boolean }, originalIndex: number) => ({
                    variable,
                    originalIndex
                  }))
                  .sort((a, b) => b.variable.offset - a.variable.offset)
                  .map(({ variable, originalIndex }) => {
                  // 根据 offset 的正负决定显示 ebp+ 还是 ebp-
                  // 正数 offset 表示函数参数（ebp+2, ebp+3），负数 offset 表示局部变量（ebp-1, ebp-2）
                  const offsetDisplay = variable.offset >= 0 
                    ? `[ebp+${variable.offset}]` 
                    : `[ebp${variable.offset}]`; // 负数已经包含负号，直接显示
                  // 检查变量是否需要高亮
                  const highlightKey = `${i}-${originalIndex}`;
                  const isHighlighted = findHighlightedVariables.has(highlightKey);
                  return (
                    <div
                      key={`var-${i}-${originalIndex}`}
                      className={`rounded px-2 py-1.5 text-xs transition-all ${
                        isHighlighted
                          ? 'bg-yellow-200 border-2 border-yellow-500 shadow-md animate-pulse'
                          : variable.init
                          ? 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                          : 'bg-gray-50 border border-gray-200 border-dashed opacity-60 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                        <span className={`font-mono font-medium ${
                            isHighlighted ? 'text-yellow-900 font-bold' : variable.init ? 'text-gray-700' : 'text-gray-500'
                        }`}>
                          {variable.name}
                        </span>
                          <span className={`text-[10px] ${
                            variable.init ? 'text-green-600' : 'text-gray-400'
                          }`} title={variable.init ? '已初始化' : '未初始化'}>
                            {variable.init ? '✓' : '○'}
                          </span>
                        </div>
                        <span className={`font-mono text-[10px] ${
                          isHighlighted ? 'text-yellow-700' : 'text-gray-600'
                        }`}>
                          {offsetDisplay}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-gray-400 italic px-2 ml-2">（无变量分配）</div>
            )}
          </div>
        );
      }

    return elements;
  };

  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      {/* 标题 */}
      <div className="mb-4 border-b border-gray-200 pb-2 flex-shrink-0">
        <h2 className="text-lg font-bold text-gray-900">栈布局</h2>
        <div className="text-xs text-gray-500 mt-1">
          块: <span className="font-mono">{currentFrame.blockId}</span>
        </div>
        
        {/* 步骤选择器 */}
        {currentFrame.steps.length > 0 && (
          <div className="mt-2">
            <div className="text-xs text-gray-600 mb-1">
              执行步骤 {autoStepIndex !== null && autoStepIndex !== undefined ? '(自动执行模式)' : ''}:
            </div>
            <div 
              ref={stepsContainerRef}
              className="flex space-x-1 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
            >
              {currentFrame.steps.map((step: { stepIndex: number; statement: string; scopeStack: ScopeInfo[] }, idx: number) => {
                // 在自动执行模式下，只允许点击已经执行过的步骤（回看功能）
                // idx 对应 stepIndex：0 = 进入块，1 = 执行第一个语句后，2 = 执行第二个语句后...
                const isAutoMode = autoStepIndex !== null && autoStepIndex !== undefined;
                const isExecuted = isAutoMode ? idx <= autoStepIndex : true;
                const isDisabled = isAutoMode && !isExecuted;
                
                return (
                  <button
                    key={idx}
                    ref={(el) => {
                      if (el) {
                        stepButtonRefs.current.set(idx, el);
                      } else {
                        stepButtonRefs.current.delete(idx);
                      }
                    }}
                    onClick={() => {
                      // 允许点击已执行的步骤（在自动模式下）或所有步骤（非自动模式）
                      if (!isDisabled) {
                        setSelectedStepIndex(idx);
                      }
                    }}
                    disabled={isDisabled}
                    className={`px-2 py-1 text-[10px] rounded transition-colors flex-shrink-0 ${
                      selectedStepIndex === idx
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-200 cursor-pointer'}`}
                    title={step.statement}
                  >
                    {idx}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        
        {/* 当前步骤信息 */}
        <div className="mt-2 bg-gray-50 rounded px-2 py-1.5 text-xs">
          <div className="font-mono text-gray-700 break-words">
            {currentStep.statement}
          </div>
        </div>
        
        {totalDepth > 0 && (
          <div className="text-xs text-gray-500 mt-2">
            总栈深度: <span className="font-mono">{totalDepth}</span> 个变量
          </div>
        )}
        {currentBlockId && (
          <div className="text-xs text-blue-600 mt-1 font-semibold">
            ✓ 当前选中块
          </div>
        )}
      </div>

      {/* 栈内容区域 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {currentStep.scopeStack.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <div className="text-2xl mb-2">📭</div>
            <p className="text-sm">作用域栈为空</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 栈底指示 */}
            <div className="text-xs font-semibold text-gray-700 text-center pb-2 border-b-2 border-gray-300 bg-gradient-to-b from-gray-50 to-transparent py-2 rounded-t">
              栈底（ebp）
            </div>
            
            {/* 作用域栈 */}
            <div className="space-y-2">
              {renderStack()}
            </div>
            
            {/* 栈顶指示 */}
            <div className="text-xs font-semibold text-gray-700 text-center pt-2 border-t-2 border-gray-300 bg-gradient-to-t from-gray-50 to-transparent py-2 rounded-b">
              ↓ 栈顶 
            </div>
          </div>
        )}
      </div>

      {/* 底部信息 */}
      {stackFrames.length > 0 && (
        <div className="mt-4 pt-2 border-t border-gray-200 text-xs text-gray-500">
          共 {stackFrames.length} 个块已遍历
        </div>
      )}
    </div>
  );
};

