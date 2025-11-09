import type { Program } from './ast';
import { ScopeManager } from './scope-manager';
import { CFGGenerator, CFGVisualizer } from './cfg-generator';
import { AssemblyGenerator } from './assembly-generator';
import { CheckpointTransformer } from './checkpoint-transformer';

// 编译器主类
export class Compiler {
  private scopeManager: ScopeManager;
  private cfgGenerator: CFGGenerator;
  private assemblyGenerator: AssemblyGenerator | null = null;

  constructor() {
    this.scopeManager = new ScopeManager();
    this.cfgGenerator = new CFGGenerator();
  }

  // 编译程序
  compile(program: Program, options: CompileOptions = {}): CompileResult {
    try {
      // 0. AST 转换：为 BlockStatement 添加 StartCheckPoint/EndCheckPoint 标记
      console.log('🔧 转换 AST（添加作用域标记）...');
      const transformer = new CheckpointTransformer();
      const transformedProgram = transformer.transform(program);
      
      // 1. 生成CFG（作用域信息会在CFG生成过程中获取）
      console.log('📊 生成控制流图...');
      const cfgs = this.cfgGenerator.generate(transformedProgram);
      // 打印每个函数的 CFG 可视化
      const viz = new CFGVisualizer();
      for (const cfg of cfgs) {
        try {
          const text = viz.visualize(cfg as any);
          console.log('\n📋 控制流图 (CFG):');
          console.log(text);
        } catch (e) {
          console.log('\n⚠️ CFG 可视化失败:', (e as Error).message);
        }
      }
      
      // 3. 生成汇编代码
      console.log('⚙️ 生成汇编代码...');
      const assemblyResults: AssemblyResult[] = [];
      
      for (const cfg of cfgs) {
        this.assemblyGenerator = new AssemblyGenerator(this.scopeManager);
        const assembly = this.assemblyGenerator.generateAssembly(cfg);
        
        assemblyResults.push({
          functionName: cfg.functionName,
          assembly,
          cfg
        });
      }
      
      return {
        success: true,
        symbolTable: this.scopeManager,
        cfgs,
        assemblyResults,
        errors: []
      };
      
    } catch (error) {
      return {
        success: false,
        symbolTable: null,
        cfgs: [],
        assemblyResults: [],
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  // 获取符号表
  getSymbolTable() {
    return this.scopeManager;
  }

  // 查找符号
  lookupSymbol(name: string) {
    return this.scopeManager.getVariable(name);
  }

  // 获取当前作用域符号
  getCurrentScopeSymbols() {
    return this.scopeManager.getCurrentScope();
  }

  // 获取函数作用域符号
  getFunctionScopeSymbols() {
    return this.scopeManager.getAllVariables();
  }
}

// 编译选项
export interface CompileOptions {
  smartMerging?: boolean;
  optimize?: boolean;
  targetArchitecture?: string;
}

// 汇编结果
export interface AssemblyResult {
  functionName: string;
  assembly: string;
  cfg: any; // ControlFlowGraph
}

// 编译结果
export interface CompileResult {
  success: boolean;
  symbolTable: any | null; // SymbolTable
  cfgs: any[]; // ControlFlowGraph[]
  assemblyResults: AssemblyResult[];
  errors: string[];
}

// 编译器工具函数
export class CompilerUtils {
  // 打印符号表信息
  static printSymbolTable(symbolTable: any): void {
    console.log('\n📋 符号表信息:');
    console.log('=====================================');
    
    const allVariables = symbolTable.getAllVariables();
    for (const [name, info] of allVariables) {
      console.log(`\n变量: ${name}`);
      console.log(`  - 偏移: ${info.offset}`);
      console.log(`  - TDZ状态: ${info.isTDZ ? '是' : '否'}`);
    }
  }

  // 打印CFG信息
  static printCFG(cfg: any): void {
    console.log(`\n📊 函数: ${cfg.functionName}`);
    console.log('=====================================');
    
    for (const block of cfg.blocks) {
      console.log(`\n基本块: ${block.id}`);
      if (block.isEntry) console.log('  [入口块]');
      if (block.isExit) console.log('  [出口块]');
      
      console.log('  语句:');
      for (const stmt of block.statements) {
        console.log(`    - ${stmt.type}`);
      }
      
      console.log(`  前驱块: ${block.predecessors.join(', ') || '无'}`);
      console.log(`  后继块: ${block.successors.join(', ') || '无'}`);
    }
  }

  // 保存编译结果到文件
  static saveCompileResult(result: CompileResult, basePath: string): void {
    if (!result.success) {
      console.error('❌ 编译失败:', result.errors);
      return;
    }

    // 保存符号表
    if (result.symbolTable) {
      const symbolTableInfo = this.symbolTableToString(result.symbolTable);
      require('fs').writeFileSync(`${basePath}-symbol-table.txt`, symbolTableInfo);
    }

    // 保存CFG
    for (const cfg of result.cfgs) {
      const cfgInfo = this.cfgToString(cfg);
      require('fs').writeFileSync(`${basePath}-cfg.txt`, cfgInfo);
    }

    // 保存汇编代码
    for (const assemblyResult of result.assemblyResults) {
      require('fs').writeFileSync(`${basePath}-assembly.txt`, assemblyResult.assembly);
    }

    console.log('✅ 编译结果已保存');
  }

  // 符号表转字符串
  private static symbolTableToString(symbolTable: any): string {
    const lines: string[] = [];
    lines.push('符号表信息');
    lines.push('=====================================');
    
    const allVariables = symbolTable.getAllVariables();
    for (const [name, info] of allVariables) {
      lines.push(`\n变量: ${name}`);
      lines.push(`  - 偏移: ${info.offset}`);
      lines.push(`  - TDZ状态: ${info.isTDZ ? '是' : '否'}`);
    }
    
    return lines.join('\n');
  }

  // CFG转字符串
  private static cfgToString(cfg: any): string {
    const lines: string[] = [];
    lines.push(`函数: ${cfg.functionName}`);
    lines.push('=====================================');
    
    for (const block of cfg.blocks) {
      lines.push(`\n基本块: ${block.id}`);
      if (block.isEntry) lines.push('  [入口块]');
      if (block.isExit) lines.push('  [出口块]');
      
      lines.push('  语句:');
      for (const stmt of block.statements) {
        lines.push(`    - ${stmt.type}`);
      }
      
      lines.push(`  前驱块: ${block.predecessors.join(', ') || '无'}`);
      lines.push(`  后继块: ${block.successors.join(', ') || '无'}`);
    }
    
    return lines.join('\n');
  }
}
