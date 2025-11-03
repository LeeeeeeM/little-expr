// 汇编虚拟机运行器
import { AssemblyVM } from './assembly-vm';
import { Compiler } from './compiler';
import { StatementParser } from './parser';

export class VMRunner {
  private vm: AssemblyVM;
  private compiler: Compiler;

  constructor() {
    this.vm = new AssemblyVM();
    this.compiler = new Compiler();
  }

  // 运行源代码
  async runSourceCode(sourceCode: string): Promise<{
    success: boolean;
    errorType?: 'parse' | 'compile' | 'runtime' | 'unknown';
    output: string;
    errors: string[];
    assembly?: string;
    vmResult?: any;
  }> {
    try {
      // 1. 解析源代码
      console.log('🔍 解析源代码...');
      const parser = new StatementParser(sourceCode);
      const parseResult = parser.parse();
      
      if (!parseResult.ast || parseResult.errors.length > 0) {
        return {
          success: false,
          errorType: 'parse',
          output: '',
          errors: parseResult.errors.map(e => e.message),
          assembly: undefined,
          vmResult: undefined
        };
      }

      // 2. 编译为汇编
      console.log('⚙️ 编译为汇编...');
      const compileResult = this.compiler.compile(parseResult.ast as any, { optimize: true });
      
      if (!compileResult.success) {
        return {
          success: false,
          errorType: 'compile',
          output: '',
          errors: compileResult.errors,
          assembly: undefined,
          vmResult: undefined
        };
      }

      // 输出 CFG 的块和边信息
      if (compileResult.cfgs && compileResult.cfgs.length > 0) {
        console.log('\n📊 CFG 详细信息:');
        for (const cfg of compileResult.cfgs) {
          console.log(`\n函数: ${cfg.functionName}`);
          console.log(`总块数: ${cfg.blocks.length}`);
          console.log(`总边数: ${cfg.edges.length}`);
          
          console.log('\n基本块列表:');
          for (const block of cfg.blocks) {
            console.log(`  - ${block.id}${block.isEntry ? ' [入口]' : ''}${block.isExit ? ' [出口]' : ''}`);
          }
          
          console.log('\n控制流边:');
          for (const edge of cfg.edges) {
            console.log(`  ${edge.from} → ${edge.to}`);
          }
        }
      }

      // 3. 运行汇编代码
      console.log('🚀 运行汇编代码...');
      const assemblyResults = compileResult.assemblyResults || [];
      const results = [];

      for (const asmResult of assemblyResults) {
        console.log(`\n运行函数: ${asmResult.functionName}`);
        console.log('汇编代码:');
        console.log(asmResult.assembly);
        
        // 加载并运行汇编代码
        this.vm.loadAssembly(asmResult.assembly);
        const vmResult = this.vm.run();
        
        console.log(`\nVM 运行结果:`);
        console.log(`成功: ${vmResult.success}`);
        console.log(`输出: ${vmResult.output}`);
        console.log(`执行周期: ${vmResult.state.cycles}`);
        console.log(`AX 寄存器值: ${this.vm.getRegisterValue('ax')}`);
        console.log(`BX 寄存器值: ${this.vm.getRegisterValue('bx')}`);
        console.log(`SP 寄存器值: ${this.vm.getRegisterValue('sp')}`);
        console.log(`BP 寄存器值: ${this.vm.getRegisterValue('bp')}`);
        
        // 检查运行是否失败
        if (!vmResult.success) {
          return {
            success: false,
            errorType: 'runtime',
            output: '',
            errors: [vmResult.output],
            assembly: assemblyResults.map(r => r.assembly).join('\n\n'),
            vmResult: results
          };
        }
        
        results.push({
          functionName: asmResult.functionName,
          assembly: asmResult.assembly,
          vmResult
        });
      }

      return {
        success: true,
        output: results.map(r => `函数 ${r.functionName}: AX = ${r.vmResult.state.registers.get('ax')}`).join('\n'),
        errors: [],
        assembly: assemblyResults.map(r => r.assembly).join('\n\n'),
        vmResult: results
      };

    } catch (error) {
      return {
        success: false,
        errorType: 'unknown',
        output: '',
        errors: [error instanceof Error ? error.message : String(error)],
        assembly: undefined,
        vmResult: undefined
      };
    }
  }

  // 运行汇编代码
  runAssembly(assembly: string): {
    success: boolean;
    output: string;
    state: any;
  } {
    this.vm.loadAssembly(assembly);
    return this.vm.run();
  }

  // 获取 VM 状态
  getVMState() {
    return this.vm.getState();
  }
}

// 命令行运行器
export async function runVMFromFile(filePath: string): Promise<void> {
  const fs = require('fs');
  
  try {
    console.log(`📖 读取文件: ${filePath}`);
    const sourceCode = fs.readFileSync(filePath, 'utf-8');
    
    console.log(`📝 源代码:\n${sourceCode}\n`);
    
    const runner = new VMRunner();
    const result = await runner.runSourceCode(sourceCode);
    
    if (result.success) {
      console.log('\n✅ 运行成功!');
      console.log(`📊 结果: ${result.output}`);
      
      if (result.vmResult) {
        console.log('\n📋 详细结果:');
        for (const funcResult of result.vmResult) {
        console.log(`\n函数: ${funcResult.functionName}`);
        console.log(`返回值 (AX): ${funcResult.vmResult.state.registers.get('ax')}`);
        console.log(`寄存器状态:`);
        console.log(`  AX: ${funcResult.vmResult.state.registers.get('ax')}`);
        console.log(`  BX: ${funcResult.vmResult.state.registers.get('bx')}`);
        console.log(`  SP: ${funcResult.vmResult.state.registers.get('sp')}`);
        console.log(`  BP: ${funcResult.vmResult.state.registers.get('bp')}`);
        }
      }
    } else {
      // 根据错误类型显示不同的提示信息
      const errorTypeMessages: Record<string, string> = {
        'parse': '❌ 解析失败!',
        'compile': '❌ 编译失败!',
        'runtime': '❌ 运行失败!',
        'unknown': '❌ 未知错误!'
      };
      
      const errorMessage = errorTypeMessages[result.errorType || 'unknown'] || '❌ 失败!';
      console.log(`\n${errorMessage}`);
      console.log('错误:', result.errors.join('\n'));
    }
    
  } catch (error) {
    console.error('❌ 错误:', error);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('用法: bun src/assembly-vm.ts <文件路径>');
    process.exit(1);
  }
  
  runVMFromFile(args[0]!).catch(console.error);
}
