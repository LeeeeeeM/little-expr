#!/usr/bin/env bun
// 统一测试运行器
// 整合所有测试用例，支持独立语句和多语句程序测试

import { StatementInterpreter } from './src/index';
import { readFileSync } from 'fs';
import { join } from 'path';

interface TestCase {
  name: string;
  type: 'single' | 'multi';
  statements: string[];
  expectedOutput?: string[];
  shouldError?: boolean;
}

class UnifiedTestRunner {
  public runAllTests(): void {
    console.log("🚀 运行所有语句解析器测试\n");
    
    const testFiles = [
      { file: 'independent-statements.txt', type: 'single' as const },
      { file: 'multi-statement-programs.txt', type: 'multi' as const },
      { file: 'basic-statements.txt', type: 'single' as const },
      { file: 'control-flow.txt', type: 'multi' as const },
      { file: 'complex-programs.txt', type: 'multi' as const }
    ];
    
    let totalPassed = 0;
    let totalTests = 0;
    
    for (const testFile of testFiles) {
      console.log(`📁 测试文件: ${testFile.file}`);
      console.log('='.repeat(50));
      
      try {
        const result = this.runTestFile(join(process.cwd(), 'statements', 'tests', testFile.file), testFile.type);
        totalPassed += result.passed;
        totalTests += result.total;
        
        console.log(`📊 ${testFile.file}: ${result.passed}/${result.total} 通过 (${Math.round(result.passed/result.total*100)}%)\n`);
      } catch (error) {
        console.log(`❌ 无法读取测试文件 ${testFile.file}: ${error}\n`);
      }
    }
    
    console.log('🎯 总体测试结果');
    console.log('='.repeat(50));
    console.log(`📊 总计: ${totalPassed}/${totalTests} 通过 (${Math.round(totalPassed/totalTests*100)}%)`);
    
    if (totalPassed === totalTests) {
      console.log("🎉 所有测试都通过了！语句解析器工作完美！");
    } else {
      console.log("⚠️  部分测试失败，需要检查实现。");
    }
  }

  public runTestFile(filePath: string, testType: 'single' | 'multi'): { passed: number; total: number } {
    const content = readFileSync(filePath, 'utf-8');
    const testCases = this.parseTestFile(content, testType);
    
    let passed = 0;
    let total = testCases.length;
    
    // 为独立语句测试使用共享的解释器
    const sharedInterpreter = testType === 'single' ? new StatementInterpreter() : undefined;
    
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      if (!testCase) continue;
      
      console.log(`📝 测试 ${i + 1}: ${testCase.name}`);
      
      if (testCase.type === 'single') {
        const statement = testCase.statements[0];
        if (statement) {
          console.log(`代码: ${statement}`);
        }
      } else {
        console.log(`程序:`);
        testCase.statements.forEach((stmt, idx) => {
          console.log(`  ${idx + 1}. ${stmt}`);
        });
      }
      
      try {
        const result = this.runTestCase(testCase, sharedInterpreter);
        
        if (result.success) {
          console.log(`✅ 通过!`);
          if (result.output.length > 0) {
            console.log(`输出: ${result.output.join(', ')}`);
          }
          passed++;
        } else {
          console.log(`❌ 失败: ${result.error}`);
        }
      } catch (error) {
        console.log(`❌ 异常: ${error}`);
      }
      
      console.log('');
    }
    
    return { passed, total };
  }

  private parseTestFile(content: string, testType: 'single' | 'multi'): TestCase[] {
    const lines = content.split('\n');
    const testCases: TestCase[] = [];
    
    if (testType === 'single') {
      // 独立语句测试：每个非注释行都是一个测试用例
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine.startsWith('#') || trimmedLine === '') {
          continue;
        }
        
        if (trimmedLine) {
          testCases.push({
            name: `语句: ${trimmedLine}`,
            type: 'single',
            statements: [trimmedLine]
          });
        }
      }
    } else {
      // 多语句程序测试：按##分组
      let currentTestCase: TestCase | null = null;
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // 跳过单行注释和空行
        if (trimmedLine.startsWith('#') && !trimmedLine.startsWith('##') || trimmedLine === '') {
          continue;
        }
        
        // 检查是否是新的测试用例（以##开头）
        if (trimmedLine.startsWith('##')) {
          // 保存之前的测试用例
          if (currentTestCase && currentTestCase.statements.length > 0) {
            testCases.push(currentTestCase);
          }
          
          // 开始新的测试用例
          currentTestCase = {
            name: trimmedLine.substring(2).trim(),
            type: 'multi',
            statements: []
          };
        } else if (currentTestCase && trimmedLine) {
          // 添加语句
          currentTestCase.statements.push(trimmedLine);
        }
      }
      
      // 保存最后一个测试用例
      if (currentTestCase && currentTestCase.statements.length > 0) {
        testCases.push(currentTestCase);
      }
    }
    
    return testCases;
  }

  private runTestCase(testCase: TestCase, interpreter?: StatementInterpreter): { success: boolean; output: string[]; error?: string } {
    try {
      const testInterpreter = interpreter || new StatementInterpreter();
      
      let program: string;
      if (testCase.type === 'single') {
        const statement = testCase.statements[0];
        if (!statement) {
          return {
            success: false,
            output: [],
            error: '测试用例没有语句'
          };
        }
        program = statement;
      } else {
        program = testCase.statements.join(' ');
      }
      
      const result = testInterpreter.interpret(program, testCase.type === 'single' ? false : true);
      
      if (result.errors.length > 0) {
        return {
          success: false,
          output: [],
          error: `解析错误: ${result.errors.map(e => e.message).join(', ')}`
        };
      }
      
      return {
        success: true,
        output: result.output
      };
    } catch (error) {
      return {
        success: false,
        output: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  public runSpecificTest(testFile: string, testType: 'single' | 'multi'): void {
    const testDir = join(process.cwd(), 'statements', 'tests');
    const filePath = join(testDir, testFile);
    
    try {
      const result = this.runTestFile(filePath, testType);
      console.log(`📊 ${testFile}: ${result.passed}/${result.total} 通过 (${Math.round(result.passed/result.total*100)}%)`);
    } catch (error) {
      console.log(`❌ 无法读取测试文件: ${error}`);
    }
  }
}

// 主函数
function main(): void {
  const args = process.argv.slice(2);
  const testRunner = new UnifiedTestRunner();
  
  if (args.length === 0) {
    // 运行所有测试
    testRunner.runAllTests();
  } else if (args.length === 2) {
    // 运行指定的测试文件
    const testFile = args[0];
    const testType = args[1] as 'single' | 'multi';
    if (testFile && testType) {
      testRunner.runSpecificTest(testFile, testType);
    } else {
      console.log('❌ 缺少测试文件名或类型参数');
    }
  } else {
    console.log("用法:");
    console.log("  bun run test-runner.ts                    # 运行所有测试");
    console.log("  bun run test-runner.ts <文件> <类型>      # 运行指定测试");
    console.log("  类型: single (独立语句) 或 multi (多语句程序)");
    console.log("");
    console.log("示例:");
    console.log("  bun run test-runner.ts independent-statements.txt single");
    console.log("  bun run test-runner.ts multi-statement-programs.txt multi");
  }
}

// 运行测试
if (import.meta.main) {
  main();
}
