import type { ControlFlowGraph } from './cfg-types';
import { CFGGenerator } from './cfg-generator';
import { StatementParser } from './parser';
// @ts-ignore - 导入编译模块
import { CheckpointTransformer } from '@cfg/checkpoint-transformer';

export interface CompileResult {
  success: boolean;
  cfgs: ControlFlowGraph[];
  errors: string[];
}

export class Compiler {
  private cfgGenerator: CFGGenerator;

  constructor() {
    this.cfgGenerator = new CFGGenerator();
  }

  compile(sourceCode: string): CompileResult {
    try {
      // 1. 解析源代码（使用前端 parser，已包含 line/column）
      const parser = new StatementParser(sourceCode);
      const parseResult = parser.parse();
      
      if (!parseResult.ast || parseResult.errors.length > 0) {
        return {
          success: false,
          cfgs: [],
          errors: parseResult.errors.map((e) => e.message),
        };
      }

      // 2. AST 转换：为 BlockStatement 添加 StartCheckPoint/EndCheckPoint 标记
      const transformer = new CheckpointTransformer();
      const transformedProgram = transformer.transform(parseResult.ast as any);

      // 4. 生成CFG
      const cfgs = this.cfgGenerator.generate(transformedProgram as any);

      return {
        success: true,
        cfgs,
        errors: [],
      };
      
    } catch (error) {
      return {
        success: false,
        cfgs: [],
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }
}

