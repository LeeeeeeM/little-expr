import React, { useRef, useEffect, useState } from 'react';
import type { StackStep } from '../parser/stackBasedParser';

interface AssemblyGeneratorProps {
  steps: StackStep[];
  currentStep: number;
}

// 安全的表达式计算器（完全避免 eval 和 Function）
const safeEvaluateExpression = (expr: string): number | null => {
  try {
    // 移除所有空格
    expr = expr.replace(/\s/g, '');
    
    // 验证表达式只包含数字、运算符和括号
    if (!/^[0-9+\-*/().]+$/.test(expr.replace(/\*\*/g, ''))) {
      return null;
    }
    
    // 简单的递归下降解析器
    const tokens: string[] = [];
    let i = 0;
    
    // 词法分析：将表达式转换为 token 列表
    while (i < expr.length) {
      if (expr[i] === '*') {
        if (i + 1 < expr.length && expr[i + 1] === '*') {
          tokens.push('**');
          i += 2;
        } else {
          tokens.push('*');
          i++;
        }
      } else if (['+', '-', '*', '/', '(', ')'].includes(expr[i])) {
        tokens.push(expr[i]);
        i++;
      } else {
        // 读取数字
        let num = '';
        while (i < expr.length && /[0-9.]/.test(expr[i])) {
          num += expr[i];
          i++;
        }
        if (num) {
          tokens.push(num);
        } else {
          return null; // 无效字符
        }
      }
    }
    
    // 表达式求值（处理运算符优先级）
    const evaluate = (start: number, end: number): number | null => {
      // 处理括号
      if (tokens[start] === '(' && tokens[end - 1] === ')') {
        // 检查括号是否匹配
        let depth = 0;
        let matched = true;
        for (let j = start; j < end; j++) {
          if (tokens[j] === '(') depth++;
          if (tokens[j] === ')') depth--;
          if (depth === 0 && j < end - 1) {
            matched = false;
            break;
          }
        }
        if (matched) {
          return evaluate(start + 1, end - 1);
        }
      }
      
      // 处理 **（幂运算，右结合）
      for (let i = end - 2; i >= start; i--) {
        if (tokens[i] === '**') {
          const left = evaluate(start, i);
          const right = evaluate(i + 1, end);
          if (left === null || right === null) return null;
          return Math.pow(left, right);
        }
      }
      
      // 处理 * 和 /
      for (let i = start + 1; i < end; i++) {
        if (tokens[i] === '*') {
          const left = evaluate(start, i);
          const right = evaluate(i + 1, end);
          if (left === null || right === null) return null;
          return left * right;
        }
        if (tokens[i] === '/') {
          const left = evaluate(start, i);
          const right = evaluate(i + 1, end);
          if (left === null || right === null) return null;
          if (right === 0) return null; // 除零
          return left / right;
        }
      }
      
      // 处理 + 和 -
      for (let i = start + 1; i < end; i++) {
        if (tokens[i] === '+') {
          const left = evaluate(start, i);
          const right = evaluate(i + 1, end);
          if (left === null || right === null) return null;
          return left + right;
        }
        if (tokens[i] === '-') {
          const left = evaluate(start, i);
          const right = evaluate(i + 1, end);
          if (left === null || right === null) return null;
          return left - right;
        }
      }
      
      // 单个数字
      if (start === end - 1) {
        const num = parseFloat(tokens[start]);
        return isNaN(num) ? null : num;
      }
      
      return null;
    };
    
    const result = evaluate(0, tokens.length);
    return result !== null && isFinite(result) ? result : null;
  } catch (e) {
    return null;
  }
};

// 生成完整的汇编指令（不包含步骤和结果信息）
const generateCompleteAssembly = (steps: StackStep[]): string => {
  const instructions: string[] = [];
  
  steps.forEach(step => {
    const instruction = generateAssemblyInstruction(step);
    if (instruction) {
      // 移除步骤号和结果信息，只保留纯汇编指令
      const cleanInstruction = instruction
        .split('\n')
        .filter(line => !line.includes('# Result:') && !line.includes('# Final Result:'))
        .join('\n');
      instructions.push(cleanInstruction);
    }
  });
  
  return instructions.join('\n');
};

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
  
  // 操作符入栈 - 在实际汇编中不需要，跳过
  if (description.includes('操作符') && description.includes('入栈')) {
    return null; // 不生成汇编指令
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
        return `POP R1\nPOP R2\nADD R1, R2\nPUSH R1\n# Result: ${result}`;
      case 'SUB':
        return `POP R1\nPOP R2\nSUB R1, R2\nPUSH R1\n# Result: ${result}`;
      case 'MUL':
        return `POP R1\nPOP R2\nMUL R1, R2\nPUSH R1\n# Result: ${result}`;
      case 'DIV':
        return `POP R1\nPOP R2\nDIV R1, R2\nPUSH R1\n# Result: ${result}`;
      case 'POWER':
        return `POP R1\nPOP R2\nPOW R1, R2\nPUSH R1\n# Result: ${result}`;
      default:
        return `POP R1\nPOP R2\n${operator} R1, R2\nPUSH R1\n# Result: ${result}`;
    }
  }
  
  // 生成AST节点 - 在实际汇编中不需要，跳过
  if (generatedAST) {
    return null; // 不生成汇编指令
  }
  
  // 最终AST
  if (description.includes('最终AST')) {
    // 尝试从描述中提取最终结果
    const match = description.match(/最终AST: (.+)/);
    let finalResult = match ? match[1] : '?';
    
    // 如果最终结果是表达式，尝试计算数值
    if (finalResult.includes('(') && finalResult.includes(')')) {
      try {
        // 安全的表达式计算（仅支持基本运算）
        const evalResult = safeEvaluateExpression(finalResult);
        if (evalResult !== null) {
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
  const [showModal, setShowModal] = useState(false);
  
  // 生成当前步骤对应的汇编指令
  const currentStepData = steps[currentStep - 1];
  let currentInstruction = null;
  let currentDescription = '';
  
  if (currentStepData) {
    currentInstruction = generateAssemblyInstruction(currentStepData);
    currentDescription = currentStepData.description;
  }
  
  // 生成所有已执行步骤的汇编指令
  const assemblyInstructions = steps
    .slice(0, currentStep)
    .map((step, index) => {
      const instruction = generateAssemblyInstruction(step);
      return instruction ? { stepNumber: index + 1, instruction } : null;
    })
    .filter(Boolean);

  // 生成完整的汇编指令（用于悬浮提示）
  const completeAssembly = generateCompleteAssembly(steps);

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
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">汇编生成</h2>
          {steps.length > 0 && (
            <div className="relative group">
              <button
                className="text-gray-400 hover:text-gray-600 transition-colors"
                onClick={() => setShowModal(true)}
              >
                📋
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                点击查看完整汇编指令
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          )}
        </div>
        <div className="text-sm text-gray-600">
          步骤: {currentStep} / {steps.length}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {/* 当前步骤 - 只在执行过程中显示 */}
        {currentStepData && currentStep < steps.length && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <h3 className="text-sm font-medium text-blue-700 mb-2">当前步骤:</h3>
            <div className="text-sm text-blue-800 mb-2">
              {currentDescription}
            </div>
            {currentInstruction && (
              <>
                <h3 className="text-sm font-medium text-blue-700 mb-2">汇编指令:</h3>
                <div className="font-mono text-sm text-blue-800 bg-white p-2 rounded border whitespace-pre-line">
                  {currentInstruction}
                </div>
              </>
            )}
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
              {assemblyInstructions.map((item, index) => item && (
                <div
                  key={index}
                  className={`text-xs p-2 rounded ${
                    index === assemblyInstructions.length - 1
                      ? 'bg-green-100 text-green-800 border border-green-200'
                      : 'bg-white text-gray-700 border border-gray-200'
                  }`}
                >
                  <div className="text-xs font-semibold mb-1">步骤 {item.stepNumber}:</div>
                  <div className="font-mono whitespace-pre-line">
                    {item.instruction.split('\n').filter(line => !line.includes('# Result:')).join('\n')}
                  </div>
                  {item.instruction.includes('# Result:') && (
                    <div className="text-xs text-green-700 mt-2 font-mono font-semibold">
                      {item.instruction.split('\n').find(line => line.includes('# Result:'))}
                    </div>
                  )}
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

      {/* 弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">完整汇编指令</h3>
              <button
                className="text-gray-400 hover:text-gray-600 transition-colors"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-sm font-mono whitespace-pre-wrap bg-gray-50 p-4 rounded border">
                {completeAssembly}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};