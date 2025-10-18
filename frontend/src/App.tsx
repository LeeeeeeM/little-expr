import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { ExpressionEditor } from './components/ExpressionEditor';
import { StackVisualizer } from './components/StackVisualizer';
import { type ParseStep } from './parser/types';
import { parseExpressionWithStackSteps, type StackStep } from './parser/stackBasedParser';

const App: React.FC = () => {
  const [expression, setExpression] = useState('1+2*3');
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isValid, setIsValid] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [steps, setSteps] = useState<ParseStep[]>([]);
  const [stackSteps, setStackSteps] = useState<StackStep[]>([]);
  const [isStepByStepMode, setIsStepByStepMode] = useState(false);
  const [animationId, setAnimationId] = useState<number | null>(null);
  const [isCompiled, setIsCompiled] = useState(false);

  const handleExpressionChange = useCallback(async (newExpression: string) => {
    // 停止正在进行的动画
    if (animationId) {
      clearTimeout(animationId);
      setAnimationId(null);
    }
    
    setExpression(newExpression);
    setCurrentStep(0);
    setTotalSteps(0);
    setIsRunning(false);
    setIsExecuting(false); // 停止执行状态
    setErrorMessage(undefined);
    setSteps([]);
    setStackSteps([]);
    setIsStepByStepMode(false);
    setIsCompiled(false);

    // 重置验证状态，不进行自动编译
    setIsValid(true);
    setErrorMessage(undefined);
  }, [animationId]);

  const handleCompile = useCallback(async () => {
    if (!expression.trim()) return;
    
    // 停止正在进行的动画
    if (animationId) {
      clearTimeout(animationId);
      setAnimationId(null);
    }
    
    setIsRunning(true);
    setIsExecuting(false); // 停止执行状态
    setErrorMessage(undefined);
    
    try {
      
      // 使用栈式解析器获取栈步骤和解析器实例
      const { steps: stackParseSteps } = parseExpressionWithStackSteps(expression);
      setStackSteps(stackParseSteps);
      
      setTotalSteps(stackParseSteps.length);
      setCurrentStep(0);
      setIsCompiled(true);
      setIsStepByStepMode(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '编译错误');
      setIsCompiled(false);
    } finally {
      setIsRunning(false);
    }
  }, [expression, animationId]);

  const handleStepByStep = useCallback(async () => {
    if (!isCompiled) return;
    
    if (!isStepByStepMode) {
      // 第一次点击：进入按步执行模式，直接显示第一步
      setIsStepByStepMode(true);
      setCurrentStep(1);
    } else {
      // 后续点击：执行下一步
      if (currentStep < totalSteps) {
        const nextStep = currentStep + 1;
        setCurrentStep(nextStep);
      } else {
        // 所有步骤完成
        setIsStepByStepMode(false);
        setCurrentStep(0);
      }
    }
  }, [isCompiled, isStepByStepMode, currentStep, totalSteps, steps]);

  const handleRunAll = useCallback(async () => {
    if (!isCompiled) return;
    
    setIsExecuting(true);
    setIsStepByStepMode(false);
    
    try {
      // 如果已经完成所有步骤，重新开始
      let currentIndex = currentStep >= totalSteps ? 0 : currentStep;
      
      const playNextStep = () => {
        if (currentIndex < stackSteps.length) {
          const nextStep = currentIndex + 1;
          setCurrentStep(nextStep);
          
          
          currentIndex++;
          
          const timeoutId = setTimeout(playNextStep, 1000);
          setAnimationId(timeoutId);
        } else {
          // 显示最终结果
          setIsExecuting(false);
          setAnimationId(null);
        }
      };
      
      playNextStep();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '执行错误');
      setIsExecuting(false);
      setAnimationId(null);
    }
  }, [isCompiled, currentStep, totalSteps, stackSteps]);


  const handleReset = useCallback(() => {
    // 停止正在进行的动画
    if (animationId) {
      clearTimeout(animationId);
      setAnimationId(null);
    }
    
    setCurrentStep(0);
    setIsRunning(false);
    setIsExecuting(false);
    setErrorMessage(undefined);
    setIsStepByStepMode(false);
    // 注意：不重置 steps, totalSteps, isCompiled，保持编译状态
  }, [animationId]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (animationId) {
        clearTimeout(animationId);
      }
    };
  }, [animationId]);

  return (
    <div className="min-h-screen bg-gray-100">
      <Header
        selectedExpression={expression}
        onExpressionChange={handleExpressionChange}
        onCompile={handleCompile}
        onStepByStep={handleStepByStep}
        onRunAll={handleRunAll}
        onReset={handleReset}
        isRunning={isRunning}
        isExecuting={isExecuting}
        isStepByStepMode={isStepByStepMode}
        currentStep={currentStep}
        totalSteps={totalSteps}
        isCompiled={isCompiled}
      />
      
      <main className="flex h-[calc(100vh-80px)]">
        <div className="w-1/3 p-6">
          <ExpressionEditor
            expression={expression}
            onExpressionChange={handleExpressionChange}
            isValid={isValid}
            errorMessage={errorMessage}
          />
        </div>
        
        <div className="w-2/3 p-6">
          <StackVisualizer
            steps={stackSteps}
            currentStep={currentStep}
            isAnimating={isExecuting}
            currentStepDescription={stackSteps[currentStep - 1]?.description}
          />
        </div>
      </main>
    </div>
  );
};

export default App;