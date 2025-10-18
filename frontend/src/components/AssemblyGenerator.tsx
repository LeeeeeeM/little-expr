import React, { useRef, useEffect } from 'react';
import type { StackStep } from '../parser/stackBasedParser';

interface AssemblyGeneratorProps {
  steps: StackStep[];
  currentStep: number;
}

// 根据栈步骤生成汇编指令
const generateAssemblyInstruction = (step: StackStep): string | null => {
  const { description, poppedOperator, poppedOperands, generatedAST } = step;
  
  // 操作数入栈
  if (description.includes('操作数') && description.includes('入栈')) {
    const match = description.match(/操作数 (-?\d+) 入栈/);
    if (match) {
      return `PUSH ${match[1]}`;
    }
  }
  
  // 操作符入栈
  if (description.includes('操作符') && description.includes('入栈')) {
    const match = description.match(/操作符 (\w+) 入栈/);
    if (match) {
      return `PUSH_OP ${match[1]}`;
    }
  }
  
  // 弹出操作符和操作数进行计算
  if (poppedOperator && poppedOperands) {
    const operator = poppedOperator.type;
    const left = poppedOperands.left;
    const right = poppedOperands.right;
    
    // 计算实际结果
    let result: number | string = '?';
    
    // 计算AST节点的数值
    const calculateASTValue = (operand: any): number | null => {
      if (typeof operand === 'number') {
        return operand;
      }
      if (operand && typeof operand === 'object') {
        if (operand.type === 'Number') {
          return operand.value;
        }
        // 检查BinaryOp类型（有left和right属性）
        if (operand.left !== undefined && operand.right !== undefined) {
          const leftVal = calculateASTValue(operand.left);
          const rightVal = calculateASTValue(operand.right);
          if (leftVal !== null && rightVal !== null) {
            switch (operand.operator) {
              case 'ADD':
              case '+': return leftVal + rightVal;
              case 'SUB':
              case '-': return leftVal - rightVal;
              case 'MUL':
              case '*': return leftVal * rightVal;
              case 'DIV':
              case '/': return rightVal !== 0 ? leftVal / rightVal : NaN;
              case 'POWER':
              case '**': return Math.pow(leftVal, rightVal);
              default: return null;
            }
          }
        }
      }
      return null;
    };
    
    // 如果是两个数字，直接计算
    if (typeof left === 'number' && typeof right === 'number') {
      switch (operator) {
        case 'ADD':
          result = left + right;
          break;
        case 'SUB':
          result = left - right;
          break;
        case 'MUL':
          result = left * right;
          break;
        case 'DIV':
          result = right !== 0 ? left / right : 'ERROR';
          break;
        case 'POWER':
          result = Math.pow(left, right);
          break;
        default:
          result = '?';
      }
    } else {
      // 尝试计算AST节点的数值
      const leftVal = calculateASTValue(left);
      const rightVal = calculateASTValue(right);
      
      if (leftVal !== null && rightVal !== null) {
        // 两个操作数都能计算出数值
        switch (operator) {
          case 'ADD':
            result = leftVal + rightVal;
            break;
          case 'SUB':
            result = leftVal - rightVal;
            break;
          case 'MUL':
            result = leftVal * rightVal;
            break;
          case 'DIV':
            result = rightVal !== 0 ? leftVal / rightVal : 'ERROR';
            break;
          case 'POWER':
            result = Math.pow(leftVal, rightVal);
            break;
          default:
            result = '?';
        }
      } else {
        // 如果包含AST节点，显示表达式形式
        const getOperandStr = (operand: any): string => {
          if (typeof operand === 'number') {
            return operand.toString();
          }
          if (operand && typeof operand === 'object') {
            if (operand.type === 'Number') {
              return operand.value?.toString() || '?';
            }
            // 检查是否有left和right属性（BinaryOp类型）
            if (operand.left !== undefined && operand.right !== undefined) {
              const leftOp = getOperandStr(operand.left);
              const rightOp = getOperandStr(operand.right);
              const opStr = operand.operator === 'ADD' ? '+' : 
                           operand.operator === 'SUB' ? '-' : 
                           operand.operator === 'MUL' ? '*' : 
                           operand.operator === 'DIV' ? '/' : 
                           operator === 'POWER' ? '**' : 
                           operand.operator || '?';
              return `(${leftOp} ${opStr} ${rightOp})`;
            }
            // 如果有operator属性但没有left/right，可能是其他类型的节点
            if (operand.operator) {
              return `${operand.operator}`;
            }
          }
          return 'AST';
        };
        
        const leftStr = getOperandStr(left);
        const rightStr = getOperandStr(right);
        const opStr = operator === 'ADD' ? '+' : 
                     operator === 'SUB' ? '-' : 
                     operator === 'MUL' ? '*' : 
                     operator === 'DIV' ? '/' : 
                     operator === 'POWER' ? '**' : operator;
        result = `(${leftStr} ${opStr} ${rightStr})`;
      }
    }
    
    switch (operator) {
      case 'ADD':
        return `POP R1\nPOP R1\nADD R1, R1\nPUSH R1\n# Result: ${result}`;
      case 'SUB':
        return `POP R1\nPOP R1\nSUB R1, R1\nPUSH R1\n# Result: ${result}`;
      case 'MUL':
        return `POP R1\nPOP R1\nMUL R1, R1\nPUSH R1\n# Result: ${result}`;
      case 'DIV':
        return `POP R1\nPOP R1\nDIV R1, R1\nPUSH R1\n# Result: ${result}`;
      case 'POWER':
        return `POP R1\nPOP R1\nPOW R1, R1\nPUSH R1\n# Result: ${result}`;
      default:
        return `POP R1\nPOP R1\n${operator} R1, R1\nPUSH R1\n# Result: ${result}`;
    }
  }
  
  // 生成AST节点
  if (generatedAST) {
    return `STORE_RESULT`;
  }
  
  // 最终AST
  if (description.includes('最终AST')) {
    // 尝试从描述中提取最终结果
    const match = description.match(/最终AST: (.+)/);
    let finalResult = match ? match[1] : '?';
    
    // 如果最终结果是表达式，尝试计算数值
    if (finalResult.includes('(') && finalResult.includes(')')) {
      try {
        // 简单的表达式计算（仅支持基本运算）
        const evalResult = eval(finalResult.replace(/\*\*/g, '**'));
        if (typeof evalResult === 'number') {
          finalResult = evalResult.toString();
        }
      } catch (e) {
        // 如果计算失败，保持原表达式
      }
    }
    
    return `POP R1\nRETURN R1\n# Final Result: ${finalResult}`;
  }
  
  return null;
};

export const AssemblyGenerator: React.FC<AssemblyGeneratorProps> = ({
  steps,
  currentStep,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // 生成当前步骤对应的汇编指令
  const currentStepData = steps[currentStep - 1];
  const currentInstruction = currentStepData ? generateAssemblyInstruction(currentStepData) : null;
  
  // 生成所有已执行步骤的汇编指令
  const assemblyInstructions = steps
    .slice(0, currentStep)
    .map((step, index) => {
      const instruction = generateAssemblyInstruction(step);
      return instruction ? `${index + 1}. ${instruction}` : null;
    })
    .filter(Boolean);

  // 自动滚动到最新指令
  useEffect(() => {
    if (scrollContainerRef.current && assemblyInstructions.length > 0) {
      const container = scrollContainerRef.current;
      container.scrollTop = container.scrollHeight;
    }
  }, [assemblyInstructions.length]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900">汇编生成</h2>
        <div className="text-sm text-gray-600">
          步骤: {currentStep} / {steps.length}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {/* 当前指令 */}
        {currentInstruction && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <h3 className="text-sm font-medium text-blue-700 mb-2">当前指令:</h3>
            <div className="font-mono text-sm text-blue-800 bg-white p-2 rounded border whitespace-pre-line">
              {currentInstruction}
            </div>
          </div>
        )}

        {/* 汇编指令列表 */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 bg-gray-50 rounded-lg p-4 overflow-y-auto scroll-smooth min-h-0"
        >
          <h3 className="text-sm font-medium text-gray-700 mb-3">汇编指令序列:</h3>
          {assemblyInstructions.length > 0 ? (
            <div className="space-y-1">
              {assemblyInstructions.map((instruction, index) => (
                <div
                  key={index}
                  className={`font-mono text-xs p-2 rounded whitespace-pre-line ${
                    index === assemblyInstructions.length - 1
                      ? 'bg-green-100 text-green-800 border border-green-200'
                      : 'bg-white text-gray-700 border border-gray-200'
                  }`}
                >
                  {instruction}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 text-sm">
              <div className="text-2xl mb-2">⚙️</div>
              <p>汇编指令区域</p>
              <p className="text-xs text-gray-400 mt-1">根据执行步骤生成汇编指令</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};