// AST 转换器：为 BlockStatement 添加 StartCheckPoint 和 EndCheckPoint 标记
// 实现作用域管理的标记方案

import type {
  Program,
  Statement,
  BlockStatement,
  IfStatement,
  WhileStatement,
  ForStatement,
  StartCheckPoint,
  EndCheckPoint
} from './ast';
import { ASTFactory } from './ast';

/**
 * 作用域 ID 生成器
 */
class ScopeIdGenerator {
  private counter: number = 0;

  generate(): string {
    return `scope_${this.counter++}`;
  }

  reset(): void {
    this.counter = 0;
  }
}

/**
 * AST 转换器：添加作用域检查点标记
 */
export class CheckpointTransformer {
  private scopeIdGenerator: ScopeIdGenerator;

  constructor() {
    this.scopeIdGenerator = new ScopeIdGenerator();
  }

  /**
   * 转换整个程序
   */
  transform(program: Program): Program {
    this.scopeIdGenerator.reset();
    const transformedStatements = program.statements.map(stmt =>
      this.transformStatement(stmt, 0)
    );
    return {
      ...program,
      statements: transformedStatements
    };
  }

  /**
   * 转换语句（递归处理）
   */
  private transformStatement(stmt: Statement, depth: number): Statement {
    if (stmt.type === 'BlockStatement') {
      return this.transformBlockStatement(stmt, depth);
    } else if (stmt.type === 'IfStatement') {
      return this.transformIfStatement(stmt, depth);
    } else if (stmt.type === 'WhileStatement') {
      return this.transformWhileStatement(stmt, depth);
    } else if (stmt.type === 'ForStatement') {
      return this.transformForStatement(stmt, depth);
    } else if (stmt.type === 'FunctionDeclaration') {
      // 函数体的 BlockStatement 会被递归处理
      if (stmt.body && stmt.body.type === 'BlockStatement') {
        return {
          ...stmt,
          body: this.transformBlockStatement(stmt.body, depth)
        };
      }
      // 如果函数体不是 BlockStatement 或为空，直接返回
      return stmt;
    }
    // 其他语句类型直接返回
    return stmt;
  }

  /**
   * 转换 BlockStatement：添加 StartCheckPoint 和 EndCheckPoint
   */
  private transformBlockStatement(
    blockStmt: BlockStatement,
    currentDepth: number
  ): BlockStatement {
    // 确保 statements 存在
    if (!blockStmt.statements) {
      blockStmt.statements = [];
    }
    
    // 1. 先递归处理嵌套的 BlockStatement 和其他控制流语句
    const processedStatements = blockStmt.statements.map(stmt =>
      this.transformStatement(stmt, currentDepth + 1)
    );

    // 2. 收集当前层的直接变量声明名（按声明顺序）
    //    只收集直接的 VariableDeclaration/LetDeclaration
    //    不包括嵌套 BlockStatement 内的变量
    //    注意：for 循环的 init 变量会在 transformForStatement 中创建独立作用域，不在这里收集
    const variableNames: string[] = [];
    for (const stmt of processedStatements) {
      if (stmt.type === 'VariableDeclaration' || stmt.type === 'LetDeclaration') {
        const varName = (stmt as any).name;
        if (varName && !variableNames.includes(varName)) {
          // 按声明顺序添加，避免重复
          variableNames.push(varName);
        }
      }
      // 注意：嵌套的 BlockStatement 已经被包裹了 StartCheckPoint/EndCheckPoint
      // 所以不需要统计它们的变量
    }

    // 3. 生成唯一的作用域 ID
    const scopeId = this.scopeIdGenerator.generate();

    // 4. 添加标记
    return {
      ...blockStmt,
      statements: [
        ASTFactory.createStartCheckPoint(scopeId, currentDepth, variableNames),
        ...processedStatements,
        ASTFactory.createEndCheckPoint(scopeId, currentDepth, variableNames)
      ]
    };
  }

  /**
   * 转换 IfStatement
   */
  private transformIfStatement(
    ifStmt: IfStatement,
    currentDepth: number
  ): IfStatement {
    return {
      ...ifStmt,
      thenBranch: this.transformStatement(ifStmt.thenBranch, currentDepth),
      elseBranch: ifStmt.elseBranch
        ? this.transformStatement(ifStmt.elseBranch, currentDepth)
        : undefined
    };
  }

  /**
   * 转换 WhileStatement
   */
  private transformWhileStatement(
    whileStmt: WhileStatement,
    currentDepth: number
  ): WhileStatement {
    return {
      ...whileStmt,
      body: this.transformStatement(whileStmt.body, currentDepth)
    };
  }

  /**
   * 转换 ForStatement：为 for 循环创建独立的作用域
   */
  private transformForStatement(
    forStmt: ForStatement,
    currentDepth: number
  ): ForStatement {
    // 1. 收集 init 中的变量（如果是变量声明）
    const initVariableNames: string[] = [];
    if (forStmt.init) {
      if (forStmt.init.type === 'VariableDeclaration' || forStmt.init.type === 'LetDeclaration') {
        const varName = (forStmt.init as any).name;
        if (varName) {
          initVariableNames.push(varName);
        }
      }
    }
    
    // 2. 转换 body
    const transformedBody = this.transformStatement(forStmt.body, currentDepth + 1);
    
    // 3. 如果 init 中有变量声明，创建隐式 BlockStatement 包裹 body，并添加 CheckPoint
    if (initVariableNames.length > 0) {
      const scopeId = this.scopeIdGenerator.generate();
      const forLoopScopeDepth = currentDepth + 1;
      
      // 创建包裹 body 的 BlockStatement
      // 注意：如果 body 已经是 BlockStatement，我们需要将其 statements 提取出来
      let bodyStatements: Statement[];
      if (transformedBody.type === 'BlockStatement') {
        bodyStatements = (transformedBody as BlockStatement).statements;
      } else {
        // 如果 body 不是 BlockStatement，需要创建一个
        bodyStatements = [transformedBody];
      }
      
      // 创建包裹后的 BlockStatement，包含 StartCheckPoint、body 语句、EndCheckPoint
      const wrappedBody: BlockStatement = {
        type: 'BlockStatement',
        statements: [
          ASTFactory.createStartCheckPoint(scopeId, forLoopScopeDepth, initVariableNames),
          ...bodyStatements,
          ASTFactory.createEndCheckPoint(scopeId, forLoopScopeDepth, initVariableNames)
        ]
      };
      
      return {
        ...forStmt,
        body: wrappedBody
      };
    } else {
      // 如果 init 中没有变量声明，直接返回转换后的 body
      return {
        ...forStmt,
        body: transformedBody
      };
    }
  }
}

