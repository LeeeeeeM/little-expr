import { readFileSync } from 'fs';
import { StatementParser } from './src/parser';
import { CFGGenerator } from './src/cfg-generator';
import type { Program } from './src/ast';
import type { 
  Statement, 
  VariableDeclaration, 
  LetDeclaration, 
  AssignmentStatement,
  IfStatement,
  WhileStatement,
  ForStatement,
  ExpressionStatement,
  BlockStatement,
  Expression
} from './src/ast';
import { StatementType } from './src/types';

const filePath = process.argv[2] || 'cfg/tests/grade-check.txt';

// 辅助函数：格式化表达式显示
function expressionToString(expr: Expression): string {
  switch (expr.type) {
    case StatementType.NUMBER_LITERAL:
      return `${expr.value}`;
    case StatementType.IDENTIFIER:
      return `${expr.name}`;
    case StatementType.BINARY_EXPRESSION:
      return `${expressionToString(expr.left)} ${expr.operator} ${expressionToString(expr.right)}`;
    case StatementType.UNARY_EXPRESSION:
      return `${expr.operator}${expressionToString(expr.operand)}`;
    case StatementType.FUNCTION_CALL:
      return `${expr.callee.name}(${expr.arguments.map(arg => expressionToString(arg)).join(', ')})`;
    default:
      return `${expr.type}`;
  }
}

// 辅助函数：格式化语句显示
function statementToString(stmt: Statement): string {
  switch (stmt.type) {
    case StatementType.VARIABLE_DECLARATION:
      const varDecl = stmt as VariableDeclaration;
      return `声明变量 ${varDecl.name}`;
    case StatementType.LET_DECLARATION:
      const letDecl = stmt as LetDeclaration;
      return `声明let变量 ${letDecl.name}`;
    case StatementType.ASSIGNMENT_STATEMENT:
      const assignStmt = stmt as AssignmentStatement;
      return `赋值 ${assignStmt.target.name} = ${expressionToString(assignStmt.value)}`;
    case StatementType.RETURN_STATEMENT:
      return `返回语句`;
    case StatementType.IF_STATEMENT:
      const ifStmt = stmt as IfStatement;
      return `If条件: ${expressionToString(ifStmt.condition)}`;
    case StatementType.WHILE_STATEMENT:
      const whileStmt = stmt as WhileStatement;
      return `While条件: ${expressionToString(whileStmt.condition)}`;
    case StatementType.FOR_STATEMENT:
      return `For循环`;
    case StatementType.EXPRESSION_STATEMENT:
      const exprStmt = stmt as ExpressionStatement;
      return expressionToString(exprStmt.expression);
    case StatementType.BREAK_STATEMENT:
      return `Break语句`;
    case StatementType.CONTINUE_STATEMENT:
      return `Continue语句`;
    case StatementType.BLOCK_STATEMENT:
      const blockStmt = stmt as BlockStatement;
      if (blockStmt.statements.length === 0) {
        return `代码块 { }`;
      }
      let content = '代码块 \n{\n';
      for (const innerStmt of blockStmt.statements) {
        if (innerStmt.type === StatementType.EMPTY_STATEMENT) continue;
        content += `    - ${statementToString(innerStmt)}\n`;
      }
      content += '}';
      return content;
    case StatementType.EMPTY_STATEMENT:
      return `空语句`;
    default:
      return `${stmt.type}`;
  }
}

console.log(`📖 读取文件: ${filePath}`);
const sourceCode = readFileSync(filePath, 'utf-8');

console.log(`📝 解析源代码...`);
const parser = new StatementParser(sourceCode);
const parseResult = parser.parse();

if (!parseResult.ast || parseResult.errors.length > 0) {
  console.error('❌ 解析失败:', parseResult.errors);
  process.exit(1);
}

console.log(`🔧 生成CFG...`);
const cfgGenerator = new CFGGenerator();
const cfgs = cfgGenerator.generate(parseResult.ast as Program);

  console.log(`\n📊 CFG 统计:`);
  console.log(`=${'='.repeat(60)}`);
  for (const cfg of cfgs) {
    console.log(`\n函数: ${cfg.functionName}`);
    console.log(`总基本块数: ${cfg.blocks.length}`);
    console.log(`总边数: ${cfg.edges.length}`);
    
    // 显示所有边
    console.log(`\n控制流边列表:`);
    for (const edge of cfg.edges) {
      console.log(`  ${edge.from} → ${edge.to}`);
    }
    
    console.log(`\n基本块列表:`);
  for (const block of cfg.blocks) {
    const markers = [];
    if (block.isEntry) markers.push('[入口]');
    if (block.isExit) markers.push('[出口]');
    const markerStr = markers.length > 0 ? ` ${markers.join(' ')}` : '';
    console.log(`  - ${block.id}${markerStr}`);
    console.log(`    前驱: ${block.predecessors.map(p => p.id).join(', ') || '无'}`);
    console.log(`    后继: ${block.successors.map(s => s.id).join(', ') || '无'}`);
    console.log(`    语句数: ${block.statements.length}`);
    if (block.statements.length > 0) {
      console.log(`    语句:`);
      for (const stmt of block.statements) {
        const stmtStr = statementToString(stmt);
        // 处理多行语句
        const lines = stmtStr.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (i === 0) {
            console.log(`      - ${lines[i]}`);
          } else {
            console.log(`        ${lines[i]}`);
          }
        }
      }
    }
  }
}

