/**
 * 动态链接运行器 (Dynamic Link Runner)
 * 实现运行时动态链接
 * 
 * 功能：
 * 1. 编译主程序代码，保留动态链接的 call 指令（函数名）
 * 2. 库文件独立编译，每个库文件映射到独立的代码段（1000*N）
 * 3. 运行时动态加载函数到 libMap
 * 4. 支持跨段调用和返回
 */

import { Compiler } from './compiler';
import { StatementParser } from './parser';
import { SimpleLinker } from './linker';
import { DynamicLinkedCodeExecutor } from './dynamic-linked-code-executor';
import type { LibraryInfo } from './dynamic-linked-code-executor';
import * as fs from 'fs';
import * as path from 'path';

export class DynamicLinkRunner {
  private compiler: Compiler;
  private linker: SimpleLinker;
  private executor: DynamicLinkedCodeExecutor;
  
  // 库文件映射：文件路径 -> 编译后的函数列表
  private libraryCache: Map<string, Array<{ name: string; assembly: string; sourceCode: string }>> = new Map();

  constructor() {
    this.compiler = new Compiler();
    this.linker = new SimpleLinker();
    this.executor = new DynamicLinkedCodeExecutor();
  }

  /**
   * 编译单个库文件并提取函数信息
   */
  async compileLibraryFile(libraryFilePath: string): Promise<{
    success: boolean;
    errors: string[];
    functions?: Array<{ name: string; assembly: string; sourceCode: string }>;
  }> {
    try {
      const sourceCode = fs.readFileSync(libraryFilePath, 'utf-8');
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
      const functions: Array<{ name: string; assembly: string; sourceCode: string }> = [];

      for (const asmResult of assemblyResults) {
        functions.push({
          name: asmResult.functionName,
          assembly: asmResult.assembly,
          sourceCode: sourceCode,
        });
      }

      return {
        success: true,
        errors: [],
        functions,
      };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * 从库文件中查找函数并动态加载
   */
  async loadLibraryFunction(functionName: string, libraryDirectory: string): Promise<LibraryInfo | null> {
    // 检查缓存
    if (this.libraryCache.size === 0) {
      // 首次加载：扫描所有库文件
      await this.scanLibraryFiles(libraryDirectory);
    }

    // 在所有库文件中查找函数
    for (const [filePath, functions] of this.libraryCache.entries()) {
      const func = functions.find(f => f.name === functionName);
      if (func) {
        // 找到函数，编译并加载到段
        return await this.compileAndLoadFunctionToSegment(func, filePath);
      }
    }

    return null;
  }

  /**
   * 扫描库目录，编译所有库文件并缓存
   */
  private async scanLibraryFiles(libraryDirectory: string): Promise<void> {
    const libraryFullPath = path.resolve(libraryDirectory);
    
    if (!fs.existsSync(libraryFullPath)) {
      throw new Error(`库目录不存在: ${libraryFullPath}`);
    }

    const stats = fs.statSync(libraryFullPath);
    if (!stats.isDirectory()) {
      throw new Error(`库路径不是目录: ${libraryFullPath}`);
    }

    const files = fs.readdirSync(libraryFullPath)
      .filter(file => file.endsWith('.txt'))
      .sort();

    console.log(`📚 扫描库目录: ${libraryFullPath}`);
    console.log(`找到 ${files.length} 个库文件:`);

    for (const file of files) {
      const filePath = path.join(libraryFullPath, file);
      const result = await this.compileLibraryFile(filePath);
      
      if (result.success && result.functions) {
        this.libraryCache.set(filePath, result.functions);
        console.log(`  ✅ ${file}: ${result.functions.map(f => f.name).join(', ')}`);
      } else {
        console.log(`  ⚠️ ${file}: 编译失败`);
      }
    }
    console.log();
  }

  /**
   * 编译函数并加载到新的代码段
   */
  private async compileAndLoadFunctionToSegment(
    func: { name: string; assembly: string; sourceCode: string },
    filePath: string
  ): Promise<LibraryInfo> {
    // 获取下一个段索引
    const segmentIndex = this.executor.getNextSegmentIndex();
    const segmentAddress = segmentIndex * 1000;

    // 合并该库文件的所有函数（因为一个文件可能有多个函数）
    const allFunctionsInFile = this.libraryCache.get(filePath) || [];
    let allAssembly = '';
    for (const f of allFunctionsInFile) {
      allAssembly += f.assembly + '\n\n';
    }

    // 链接汇编代码（获取标签映射）
    const linkResult = this.linker.link(allAssembly);
    
    if (linkResult.errors.length > 0) {
      console.log(`⚠️ 库文件 ${path.basename(filePath)} 链接警告:`);
      for (const error of linkResult.errors) {
        console.log(`  - ${error}`);
      }
    }
    

    // 将链接后的代码加载到段（需要将相对地址转换为绝对地址）
    // 注意：linkResult.linkedCode 中的地址是相对地址（从0开始）
    // 我们需要将它们转换为段地址 + 相对地址
    const linkedCodeWithAbsoluteAddresses = this.convertToAbsoluteAddresses(
      linkResult.linkedCode,
      segmentAddress
    );

    // 加载到段（地址已经是绝对地址）
    this.executor.loadSegment(segmentIndex, linkedCodeWithAbsoluteAddresses, true);

    // 转换标签映射为绝对地址
    const absoluteLabelMap = new Map<string, number>();
    for (const [label, relativeAddress] of linkResult.labelMap.entries()) {
      absoluteLabelMap.set(label, segmentAddress + relativeAddress);
    }

    // 创建库信息
    const libraryInfo: LibraryInfo = {
      segmentIndex: segmentAddress,
      codes: linkedCodeWithAbsoluteAddresses.split('\n'),
      labelMap: absoluteLabelMap,
    };

    // 注册到 libMap（注册函数名）
    // 函数标签名就是函数名（从 assembly-generator.ts 可以看到：`${cfg.functionName}:`）
    const functionEntryLabel = func.name;
    const functionEntryOffset = linkResult.labelMap.get(functionEntryLabel);
    
    if (functionEntryOffset === undefined) {
      throw new Error(`函数 ${func.name} 在链接后的代码中没有找到入口标签`);
    }
    
    // 创建函数名到库信息的映射（标签映射使用绝对地址）
    const funcLabelMap = new Map<string, number>();
    funcLabelMap.set(func.name, segmentAddress + functionEntryOffset);
    
    const funcLibraryInfo: LibraryInfo = {
      segmentIndex: segmentAddress,
      codes: libraryInfo.codes,
      labelMap: funcLabelMap,
    };
    
    this.executor.registerLibraryFunction(func.name, funcLibraryInfo);
    
    return funcLibraryInfo;
  }

  /**
   * 将链接后的代码中的相对地址转换为绝对地址（段地址 + 相对地址）
   */
  private convertToAbsoluteAddresses(linkedCode: string, baseAddress: number): string {
    const lines = linkedCode.split('\n');
    const result: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // 跳过空行和注释
      if (!trimmed || trimmed.startsWith(';')) {
        result.push(line);
        continue;
      }

      // 匹配 [相对地址] 指令
      const addressMatch = trimmed.match(/^\[(\d+)\](.+)$/);
      if (addressMatch) {
        const relativeAddress = parseInt(addressMatch[1]!, 10);
        const rest = addressMatch[2]!;
        const absoluteAddress = baseAddress + relativeAddress;
        result.push(`[${absoluteAddress}]${rest}`);
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * 运行主程序（动态链接）
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

    // 1. 编译主程序
    console.log('📝 编译主程序...');
    const parser = new StatementParser(mainSourceCode);
    const parseResult = parser.parse();
    
    if (!parseResult.ast || parseResult.errors.length > 0) {
      console.error(`❌ 解析失败:`);
      for (const error of parseResult.errors) {
        console.error(`  - ${error.message}`);
      }
      process.exit(1);
    }

    const compileResult = this.compiler.compile(parseResult.ast as any);
    
    if (!compileResult.success) {
      console.error(`❌ 编译失败:`);
      for (const error of compileResult.errors || []) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }

    const assemblyResults = compileResult.assemblyResults || [];
    const mainFunction = assemblyResults.find(r => r.functionName === 'main');
    
    if (!mainFunction) {
      console.error(`❌ 未找到 main 函数`);
      process.exit(1);
    }

    // 合并所有函数的汇编代码（主程序中的函数）
    const allAssembly = assemblyResults.map(r => r.assembly).join('\n\n');
    
    console.log('\n主程序汇编代码:');
    console.log(allAssembly);

    // 2. 链接主程序代码（保留未定义的函数调用为函数名）
    console.log('\n🔗 链接主程序汇编代码...');
    const linkResult = this.linker.link(allAssembly);
    
    if (linkResult.errors.length > 0) {
      console.log('⚠️ 链接警告（未定义的函数将在运行时动态链接）:');
      for (const error of linkResult.errors) {
        console.log(`  - ${error}`);
      }
    }

    console.log('\n链接后的代码:');
    console.log(linkResult.linkedCode);

    // 3. 加载主程序到段0（地址是相对地址，从0开始）
    console.log('\n💾 加载主程序到段0...');
    // 从链接后的标签映射中获取 main 函数的入口地址
    const mainEntryAddress = linkResult.labelMap.get('main');
    this.executor.loadMainProgram(linkResult.linkedCode, mainEntryAddress);

    // 4. 执行主程序（动态链接）
    console.log('\n▶️  执行主程序（动态链接）...');
    
    // 自定义执行循环，支持动态加载
    const MAX_CYCLES = 1000;
    let cycles = 0;

    try {
      while (!this.executor.getState().halted && this.executor.getState().pc >= 0 && cycles < MAX_CYCLES) {
        const stepResult = this.executor.step();
        
        if (!stepResult.success) {
          // 检查是否是未找到函数的错误
          if (stepResult.output.includes('未找到函数') && stepResult.output.includes('需要先加载到 libMap')) {
            // 提取函数名
            const funcNameMatch = stepResult.output.match(/未找到函数 (\w+)/);
            if (funcNameMatch) {
              const funcName = funcNameMatch[1]!;
              
              // 动态加载函数
              const currentState = this.executor.getState();
              console.log(`\n🔌 [段 ${currentState.currentSegment}] 动态加载函数: ${funcName} (首次调用，需要从库文件加载)`);
              const libInfo = await this.loadLibraryFunction(funcName, libraryFullPath);
              
              if (!libInfo) {
                console.error(`❌ 未找到函数 ${funcName} 在库文件中`);
                process.exit(1);
              }
              
              const segmentIndex = libInfo.segmentIndex / 1000; // 段地址转换为段索引
              console.log(`  ✅ ${funcName} 已加载到段 ${segmentIndex} (地址: ${libInfo.segmentIndex})`);
              
              // 重新执行这一步（现在函数已经加载）
              continue;
            }
          }
          
          // 其他错误
          console.error(`\n❌ 执行失败: ${stepResult.output}`);
          process.exit(1);
        }
        
        cycles++;
      }

      if (cycles >= MAX_CYCLES) {
        const state = this.executor.getState();
        console.error(`❌ 超过最大执行周期 (${MAX_CYCLES})，可能存在死循环`);
        console.error(`  当前 PC: ${state.pc}, 段: ${state.currentSegment}`);
        console.error(`  当前指令地址: ${this.executor.getState().pc}`);
        console.error(`  栈指针 SP: ${state.registers.get('sp')}`);
        console.error(`  寄存器 AX: ${state.registers.get('ax')}, BX: ${state.registers.get('bx')}`);
        process.exit(1);
      }

      // 5. 显示执行结果
      const finalState = this.executor.getState();
      console.log('\n📊 执行结果:');
      console.log(`  ✅ 执行成功`);
      console.log(`  返回值 (AX): ${finalState.registers.get('ax')}`);
      console.log(`  执行周期: ${finalState.cycles}`);
      console.log(`  当前段: ${finalState.currentSegment}`);
      console.log(`  寄存器状态:`);
      console.log(`    AX: ${finalState.registers.get('ax')}`);
      console.log(`    BX: ${finalState.registers.get('bx')}`);
      console.log(`    SP: ${finalState.registers.get('sp')}`);
      console.log(`    BP: ${finalState.registers.get('bp')}`);

      // 显示 libMap
      const libMap = this.executor.getLibMap();
      if (libMap.size > 0) {
        console.log(`\n📋 动态加载的函数 (libMap):`);
        for (const [name, info] of libMap.entries()) {
          console.log(`  ${name}: 段 ${info.segmentIndex}`);
        }
      }

      console.log(`\n✅ 执行成功!`);
    } catch (error) {
      console.error(`\n❌ 执行错误: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }
}

// 命令行入口
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('用法: bun run src/dynamic-link-runner.ts <主程序源码> <库目录>');
    console.log('示例: bun run src/dynamic-link-runner.ts tests/dynamic-link-test.txt tests/lib');
    console.log('\n说明:');
    console.log('  - 主程序源码: 包含 main 函数的源代码');
    console.log('  - 库目录: 包含库文件的目录');
    console.log('  - 函数调用时动态加载库函数');
    console.log('  - 每个库文件映射到独立的代码段（1000*N）');
    process.exit(1);
  }

  if (args.length < 2) {
    console.error('❌ 需要提供两个参数: <主程序源码> <库目录>');
    console.error('示例: bun run src/dynamic-link-runner.ts tests/dynamic-link-test.txt tests/lib');
    process.exit(1);
  }

  const mainFilePath = args[0]!;
  const libraryPath = args[1]!;

  const runner = new DynamicLinkRunner();
  runner.runFromFiles(mainFilePath, libraryPath).catch((error) => {
    console.error('❌ 运行失败:', error);
    process.exit(1);
  });
}

