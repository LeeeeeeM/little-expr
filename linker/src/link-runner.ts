/**
 * 链接运行器 (Link Runner)
 * 用于演示静态链接
 * 
 * 功能：
 * 1. 编译源代码生成汇编代码
 * 2. 静态链接：所有标签替换为地址
 * 3. 执行链接后的代码
 */

import { Compiler } from './compiler';
import { StatementParser } from './parser';
import { SimpleLinker } from './linker';
import { LinkedCodeExecutor } from './linked-code-executor';
import * as fs from 'fs';
import * as path from 'path';

export class DLLRunner {
  private compiler: Compiler;
  private linker: SimpleLinker;
  private linkedExecutor: LinkedCodeExecutor;
  
  // 转义正则表达式特殊字符
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  constructor() {
    this.compiler = new Compiler();
    this.linker = new SimpleLinker();
    this.linkedExecutor = new LinkedCodeExecutor();
  }

  /**
   * 编译源代码并生成汇编文件
   */
  async compileToAssembly(sourceCode: string, outputPath: string): Promise<{
    success: boolean;
    errors: string[];
    assemblyResults?: Array<{ functionName: string; assembly: string }>;
  }> {
    try {
      const parser = new StatementParser(sourceCode);
      const parseResult = parser.parse();
      
      if (!parseResult.ast || parseResult.errors.length > 0) {
        return {
          success: false,
          errors: parseResult.errors.map(e => e.message),
        };
      }

      const compileResult = this.compiler.compile(parseResult.ast as any);
      
      if (!compileResult.success) {
        return {
          success: false,
          errors: compileResult.errors || [],
        };
      }

      const assemblyResults = compileResult.assemblyResults || [];
      
      // 合并所有函数的汇编代码
      const allAssembly = assemblyResults.map(r => r.assembly).join('\n\n');
      
      // 写入文件
      fs.writeFileSync(outputPath, allAssembly, 'utf-8');
      
      return {
        success: true,
        errors: [],
        assemblyResults: assemblyResults.map(r => ({ functionName: r.functionName, assembly: r.assembly })),
      };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * 编译库文件并提取函数信息
   */
  async compileLibrary(librarySourceCode: string): Promise<{
    success: boolean;
    errors: string[];
    functions?: Array<{ name: string; assembly: string; address: number }>;
    allAssembly?: string;
  }> {
    try {
      const parser = new StatementParser(librarySourceCode);
      const parseResult = parser.parse();
      
      if (!parseResult.ast || parseResult.errors.length > 0) {
        return {
          success: false,
          errors: parseResult.errors.map(e => e.message),
        };
      }

      const compileResult = this.compiler.compile(parseResult.ast as any);
      
      if (!compileResult.success) {
        return {
          success: false,
          errors: compileResult.errors || [],
        };
      }

      const assemblyResults = compileResult.assemblyResults || [];
      const functions: Array<{ name: string; assembly: string; address: number }> = [];
      let currentAddress = 0;
      const allAssemblyLines: string[] = [];

      // 为每个函数生成汇编代码并计算地址
      for (const asmResult of assemblyResults) {
        const functionAssembly = asmResult.assembly;
        const functionLines = functionAssembly.split('\n');
        
        // 找到函数标签的地址
        let functionAddress = currentAddress;
        
        for (const line of functionLines) {
          const trimmed = line.trim();
          
          // 跳过注释和空行
          if (!trimmed || trimmed.startsWith(';')) {
            continue;
          }
          
          // 如果是函数标签，记录地址
          if (trimmed.endsWith(':')) {
            const functionName = trimmed.slice(0, -1).trim();
            if (functionName === asmResult.functionName) {
              functionAddress = currentAddress;
            }
            // 标签不占用地址
            continue;
          }
          
          // 指令占用地址
          currentAddress++;
        }
        
        functions.push({
          name: asmResult.functionName,
          assembly: functionAssembly,
          address: functionAddress,
        });
        
        allAssemblyLines.push(functionAssembly);
      }

      return {
        success: true,
        errors: [],
        functions,
        allAssembly: allAssemblyLines.join('\n\n'),
      };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * 运行源代码（静态链接）
   */
  async runSourceCode(mainSourceCode: string, libraryFunctions?: Map<string, { assembly: string; address: number }>): Promise<{
    success: boolean;
    errorType?: 'parse' | 'compile' | 'runtime' | 'link';
    output: string;
    errors: string[];
    assembly?: string;
    linkedAssembly?: string;
    labelMap?: Map<string, number>;
    linkedVmResult?: any;
  }> {
    try {
      // 1. 解析源代码
      console.log('📝 解析源代码...');
      const parser = new StatementParser(mainSourceCode);
      
      // 如果提供了库函数，将它们注册到解析器的上下文中（作为已定义的函数）
      if (libraryFunctions && libraryFunctions.size > 0) {
        const context = parser.getContext();
        // 将库函数添加到全局作用域的函数表中
        for (const funcName of libraryFunctions.keys()) {
          if (!context.globalScope.functions.has(funcName)) {
            // 创建一个空的函数体作为函数声明
            const emptyBody = { type: 'BlockStatement', statements: [] } as any;
            context.globalScope.functions.set(funcName, {
              name: funcName,
              returnType: 'int' as any, // 假设返回 int
              parameters: [],
              body: emptyBody
            });
          }
        }
      }
      
      const parseResult = parser.parse();
      
      if (!parseResult.ast || parseResult.errors.length > 0) {
        return {
          success: false,
          errorType: 'parse',
          output: '解析失败',
          errors: parseResult.errors.map(e => e.message),
        };
      }

      // 2. 编译生成汇编代码
      console.log('🔨 编译生成汇编代码...');
      const compileResult = this.compiler.compile(parseResult.ast as any);
      
      if (!compileResult.success) {
        return {
          success: false,
          errorType: 'compile',
          output: compileResult.errors && compileResult.errors.length > 0 
            ? compileResult.errors.join('; ') 
            : '编译失败',
          errors: compileResult.errors || [],
        };
      }

      const assemblyResults = compileResult.assemblyResults || [];
      if (assemblyResults.length === 0) {
        return {
          success: false,
          errorType: 'compile',
          output: '没有生成汇编代码',
          errors: [],
        };
      }

      // 查找 main 函数
      const mainFunction = assemblyResults.find(r => r.functionName === 'main');
      if (!mainFunction) {
        return {
          success: false,
          errorType: 'compile',
          output: '未找到 main 函数',
          errors: ['程序必须包含 main 函数作为入口点'],
        };
      }

      // 合并所有函数的汇编代码（不只是 main，包含所有主程序中的函数）
      console.log(`\n主函数: ${mainFunction.functionName}`);
      console.log('\n原始汇编代码:');
      console.log(mainFunction.assembly);

      // 3. 处理库函数（静态链接）
      // 合并所有主程序函数的汇编代码
      let mergedAssembly = assemblyResults.map(r => r.assembly).join('\n\n');
      
      // 静态链接：直接合并库函数代码到主程序汇编中
      if (libraryFunctions && libraryFunctions.size > 0) {
        console.log('\n📚 合并库函数代码（静态链接）...');
        mergedAssembly += '\n\n; === 库函数代码 ===\n';
        for (const [funcName, funcInfo] of libraryFunctions.entries()) {
          mergedAssembly += funcInfo.assembly + '\n\n';
          console.log(`  ✅ ${funcName}`);
        }
      }

      // 4. 链接汇编代码（静态链接：所有符号在链接时确定）
      console.log('\n🔗 链接汇编代码（静态链接）...');
      const linkResult = this.linker.link(mergedAssembly);
      
      if (linkResult.errors.length > 0) {
        console.log('⚠️ 链接警告:');
        for (const error of linkResult.errors) {
          console.log(`  - ${error}`);
        }
      }

      console.log('\n链接后的代码:');
      console.log(linkResult.linkedCode);

      // 5. 显示链接信息
      if (linkResult.errors.length > 0) {
        console.log('\n⚠️ 链接错误:');
        for (const error of linkResult.errors) {
          console.log(`  - ${error}`);
        }
      } else {
        console.log('\n✅ 静态链接完成：所有符号都已解析');
      }

      // 6. 查找 main 函数的入口地址
      const mainEntryAddress = linkResult.labelMap.get('main');
      if (mainEntryAddress === undefined) {
        return {
          success: false,
          errorType: 'link',
          output: '链接后未找到 main 函数的入口地址',
          errors: ['链接后未找到 main 函数的入口地址'],
          assembly: mergedAssembly,
          linkedAssembly: linkResult.linkedCode,
          labelMap: linkResult.labelMap,
        };
      }

      // 7. 加载链接后的代码（静态链接：所有代码已经合并并链接完成）
      console.log('\n💾 加载链接后的代码...');
      this.linkedExecutor.loadLinkedCode(linkResult.linkedCode, mainEntryAddress);

      // 8. 执行链接后的代码
      console.log('\n▶️  执行链接后的代码...');
      const linkedVmResult = this.linkedExecutor.run();

      if (!linkedVmResult.success) {
        return {
          success: false,
          errorType: 'runtime',
          output: linkedVmResult.output,
          errors: [linkedVmResult.output],
          assembly: mergedAssembly,
          linkedAssembly: linkResult.linkedCode,
          labelMap: linkResult.labelMap,
        };
      }

      // 8. 显示执行结果
      console.log('\n📊 执行结果:');
      console.log(`  ✅ 执行成功`);
      console.log(`  返回值 (AX): ${linkedVmResult.state.registers.get('ax')}`);
      console.log(`  执行周期: ${linkedVmResult.state.cycles}`);
      console.log(`  寄存器状态:`);
      console.log(`    AX: ${linkedVmResult.state.registers.get('ax')}`);
      console.log(`    BX: ${linkedVmResult.state.registers.get('bx')}`);
      console.log(`    SP: ${linkedVmResult.state.registers.get('sp')}`);
      console.log(`    BP: ${linkedVmResult.state.registers.get('bp')}`);

      return {
        success: true,
        output: `返回值: ${linkedVmResult.state.registers.get('ax')}`,
        errors: [],
        assembly: mergedAssembly,
        linkedAssembly: linkResult.linkedCode,
        labelMap: linkResult.labelMap,
        linkedVmResult,
      };
    } catch (error) {
      return {
        success: false,
        errorType: 'runtime',
        output: `错误: ${error instanceof Error ? error.message : String(error)}`,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * 从文件运行（主程序和库文件都是源码）
   * @param mainFilePath 主程序源码文件路径
   * @param libraryPath 库文件路径（可以是单个文件或目录）
   */
  async runFromFiles(mainFilePath: string, libraryPath: string): Promise<void> {
    const mainFullPath = path.resolve(mainFilePath);
    const libraryFullPath = path.resolve(libraryPath);
    
    if (!fs.existsSync(mainFullPath)) {
      console.error(`❌ 主程序文件不存在: ${mainFullPath}`);
      process.exit(1);
    }
    
    if (!fs.existsSync(libraryFullPath)) {
      console.error(`❌ 库文件/目录不存在: ${libraryFullPath}`);
      process.exit(1);
    }

    const mainSourceCode = fs.readFileSync(mainFullPath, 'utf-8');
    
    console.log(`📄 读取主程序: ${mainFullPath}\n`);
    console.log('主程序源代码:');
    console.log('─'.repeat(50));
    console.log(mainSourceCode);
    console.log('─'.repeat(50));
    console.log();
    
    // 判断是文件还是目录
    const libraryStats = fs.statSync(libraryFullPath);
    let librarySourceCode: string;
    
    if (libraryStats.isDirectory()) {
      // 如果是目录，读取目录下所有 .txt 文件并合并
      console.log(`📂 读取库目录: ${libraryFullPath}\n`);
      const files = fs.readdirSync(libraryFullPath)
        .filter(file => file.endsWith('.txt'))
        .sort(); // 按文件名排序
      
      if (files.length === 0) {
        console.error(`❌ 库目录中没有找到 .txt 文件: ${libraryFullPath}`);
        process.exit(1);
      }
      
      console.log(`找到 ${files.length} 个库文件:`);
      const libraryFiles: string[] = [];
      for (const file of files) {
        const filePath = path.join(libraryFullPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        libraryFiles.push(content);
        console.log(`  - ${file}`);
      }
      console.log();
      
      // 合并所有库文件内容
      librarySourceCode = libraryFiles.join('\n\n');
      
      console.log('库文件源代码（合并后）:');
      console.log('─'.repeat(50));
      console.log(librarySourceCode);
      console.log('─'.repeat(50));
      console.log();
    } else {
      // 如果是文件，直接读取
      console.log(`📄 读取库文件: ${libraryFullPath}\n`);
      librarySourceCode = fs.readFileSync(libraryFullPath, 'utf-8');
      console.log('库文件源代码:');
      console.log('─'.repeat(50));
      console.log(librarySourceCode);
      console.log('─'.repeat(50));
      console.log();
    }

    // 1. 先编译库文件
    console.log('📚 编译库文件...\n');
    const libraryResult = await this.compileLibrary(librarySourceCode);
    
    if (!libraryResult.success) {
      console.error(`❌ 库文件编译失败:`);
      for (const error of libraryResult.errors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }

    if (!libraryResult.functions || libraryResult.functions.length === 0) {
      console.error(`❌ 库文件中没有找到函数`);
      process.exit(1);
    }

    console.log(`✅ 库文件编译成功，包含 ${libraryResult.functions.length} 个函数:`);
    for (const func of libraryResult.functions) {
      console.log(`  - ${func.name}`);
    }
    console.log();

    // 2. 将库函数信息转换为 Map
    const libraryFunctions = new Map<string, { assembly: string; address: number }>();
    for (const func of libraryResult.functions) {
      libraryFunctions.set(func.name, {
        assembly: func.assembly,
        address: func.address,
      });
    }

    // 3. 编译并运行主程序
    console.log('📝 编译主程序...\n');
    const result = await this.runSourceCode(mainSourceCode, libraryFunctions);

    if (!result.success) {
      console.error(`\n❌ 执行失败: ${result.output}`);
      if (result.errors.length > 0) {
        console.error('错误详情:');
        for (const error of result.errors) {
          console.error(`  - ${error}`);
        }
      }
      process.exit(1);
    } else {
      console.log(`\n✅ 执行成功!`);
    }
  }

}

// 命令行入口
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('用法: bun run src/dll-runner.ts <主程序源码> <库文件路径>');
    console.log('示例: bun run src/dll-runner.ts tests/dynamic-link-test.txt tests/lib');
    console.log('示例: bun run src/dll-runner.ts tests/dynamic-link-test.txt tests/dll-lib.txt');
    console.log('\n说明:');
    console.log('  - 主程序源码: 包含 main 函数的源代码');
    console.log('  - 库文件路径: 可以是单个文件或目录');
    console.log('    * 如果是目录: 会读取目录下所有 .txt 文件并合并编译');
    console.log('    * 如果是文件: 直接读取该文件');
    console.log('  - 库函数会自动编译并静态链接到主程序');
    process.exit(1);
  }

  if (args.length < 2) {
    console.error('❌ 需要提供两个参数: <主程序源码> <库文件路径>');
    console.error('示例: bun run src/dll-runner.ts tests/dynamic-link-test.txt tests/lib');
    console.error('示例: bun run src/dll-runner.ts tests/dynamic-link-test.txt tests/dll-lib.txt');
    process.exit(1);
  }

  const mainFilePath = args[0]!;
  const libraryPath = args[1]!;

  const runner = new DLLRunner();
  runner.runFromFiles(mainFilePath, libraryPath).catch((error) => {
    console.error('❌ 运行失败:', error);
    process.exit(1);
  });
}

