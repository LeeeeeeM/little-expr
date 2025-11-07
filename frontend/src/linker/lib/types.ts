// AST 节点类型定义（简化版，仅用于前端 CFG 生成）

export interface ASTNode {
  type: string;
  position?: number;
  line?: number;
  column?: number;
  [key: string]: any;
}

export interface Statement extends ASTNode {
  type: string;
}

export interface Program extends ASTNode {
  type: 'Program';
  statements: Statement[];
}

export interface FunctionDeclaration extends Statement {
  type: 'FunctionDeclaration';
  name: string;
  body: BlockStatement;
}

export interface BlockStatement extends Statement {
  type: 'BlockStatement';
  statements: Statement[];
}

export interface IfStatement extends Statement {
  type: 'IfStatement';
  condition: Expression;
  thenBranch: Statement;
  elseBranch?: Statement;
}

export interface WhileStatement extends Statement {
  type: 'WhileStatement';
  condition: Expression;
  body: Statement;
}

export interface ForStatement extends Statement {
  type: 'ForStatement';
  init?: Statement;
  condition?: Expression;
  update?: Statement;
  body: Statement;
}

export interface ReturnStatement extends Statement {
  type: 'ReturnStatement';
  value?: Expression;
}

export interface ExpressionStatement extends Statement {
  type: 'ExpressionStatement';
  expression: Expression;
}

export interface AssignmentStatement extends Statement {
  type: 'AssignmentStatement';
  target: Identifier;
  value: Expression;
}

export interface BreakStatement extends Statement {
  type: 'BreakStatement';
}

export interface ContinueStatement extends Statement {
  type: 'ContinueStatement';
}

export interface EmptyStatement extends Statement {
  type: 'EmptyStatement';
}

export interface Expression extends ASTNode {
  type: string;
}

export interface NumberLiteral extends Expression {
  type: 'NumberLiteral';
  value: number;
}

export interface Identifier extends Expression {
  type: 'Identifier';
  name: string;
}

export interface BinaryExpression extends Expression {
  type: 'BinaryExpression';
  operator: string;
  left: Expression;
  right: Expression;
}

export interface UnaryExpression extends Expression {
  type: 'UnaryExpression';
  operator: string;
  operand: Expression;
}

export interface FunctionCall extends Expression {
  type: 'FunctionCall';
  callee: Identifier;
  arguments: Expression[];
}

export interface ParenthesizedExpression extends Expression {
  type: 'ParenthesizedExpression';
  expression: Expression;
}

export interface VariableDeclaration extends Statement {
  type: 'VariableDeclaration';
  name: string;
  dataType?: string;
  initializer?: Expression;
}

export interface LetDeclaration extends Statement {
  type: 'LetDeclaration';
  name: string;
  dataType?: string;
  initializer?: Expression;
}

export interface FunctionDeclaration extends Statement {
  type: 'FunctionDeclaration';
  name: string;
  returnType?: string;
  parameters?: Array<{ name: string; type: string }>;
  body: BlockStatement;
  isDeclaration?: boolean; // true 表示函数声明（只有声明，没有定义），false 或 undefined 表示函数定义
}

export interface StartCheckPoint extends Statement {
  type: 'StartCheckPoint';
  scopeId: string;
  depth: number;
  variableNames: string[];
}

export interface EndCheckPoint extends Statement {
  type: 'EndCheckPoint';
  scopeId: string;
  depth: number;
  variableNames: string[];
}

export enum StatementType {
  FUNCTION_DECLARATION = 'FunctionDeclaration',
  BLOCK_STATEMENT = 'BlockStatement',
  IF_STATEMENT = 'IfStatement',
  WHILE_STATEMENT = 'WhileStatement',
  FOR_STATEMENT = 'ForStatement',
  RETURN_STATEMENT = 'ReturnStatement',
  BREAK_STATEMENT = 'BreakStatement',
  CONTINUE_STATEMENT = 'ContinueStatement',
  EXPRESSION_STATEMENT = 'ExpressionStatement',
  ASSIGNMENT_STATEMENT = 'AssignmentStatement',
  VARIABLE_DECLARATION = 'VariableDeclaration',
  LET_DECLARATION = 'LetDeclaration',
  EMPTY_STATEMENT = 'EmptyStatement',
  START_CHECK_POINT = 'StartCheckPoint',
  END_CHECK_POINT = 'EndCheckPoint',
}

