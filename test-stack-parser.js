// 简单测试栈式解析器
const { StackBasedBrowserParser } = require('./frontend/src/parser/stackBasedParser.ts');

try {
  console.log('Testing expression: 1+2*3');
  const parser = new StackBasedBrowserParser('1+2*3');
  const steps = parser.parseWithSteps();
  
  console.log(`Success: ${steps.length} steps`);
  steps.forEach((step, i) => {
    console.log(`Step ${i+1}: ${step.description}`);
    console.log(`  操作数栈: [${step.operandStack.join(', ')}]`);
    console.log(`  操作符栈: [${step.operatorStack.map(t => t.type).join(', ')}]`);
    if (step.poppedOperator) {
      console.log(`  弹出的操作符: ${step.poppedOperator.type}`);
    }
    if (step.poppedOperands) {
      console.log(`  弹出的操作数: ${step.poppedOperands.left}, ${step.poppedOperands.right}`);
    }
    console.log('');
  });
} catch (error) {
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
}
