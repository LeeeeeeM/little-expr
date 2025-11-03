import type { ControlFlowGraph } from './cfg-types';
import type { Program } from './types';
import { CFGGenerator } from './cfg-generator';
import { StatementParser } from './parser';
// @ts-ignore - 导入编译模块
import { CheckpointTransformer } from '@cfg/checkpoint-transformer';

export interface CompileResult {
  success: boolean;
  cfgs: ControlFlowGraph[];
  ast: Program | null; // 原始 AST（未转换）
  transformedAst: Program | null; // 转换后的 AST（包含 checkpoint）
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
          ast: null,
          transformedAst: null,
          errors: parseResult.errors.map((e) => e.message),
        };
      }

      // 保存原始 AST（用于可视化）
      const originalAst = parseResult.ast as Program;

      // 2. AST 转换：为 BlockStatement 添加 StartCheckPoint/EndCheckPoint 标记
      const transformer = new CheckpointTransformer();
      const transformedProgram = transformer.transform(parseResult.ast as any);

      // 3. 生成CFG
      const cfgs = this.cfgGenerator.generate(transformedProgram as any);

      return {
        success: true,
        cfgs,
        ast: originalAst, // 返回原始 AST
        transformedAst: transformedProgram as Program, // 返回转换后的 AST
        errors: [],
      };
      
    } catch (error) {
      return {
        success: false,
        cfgs: [],
        ast: null,
        transformedAst: null,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }
}

