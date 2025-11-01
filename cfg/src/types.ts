// 语句类型定义
// 扩展原有的表达式类型，支持完整的语句解析

export interface ASTNode {
  type: string;
  value?: number | string;
  operator?: string;
  left?: ASTNode;
  right?: ASTNode;
  // 语句特有属性
  statements?: ASTNode[];        // 复合语句的语句列表
  condition?: ASTNode;           // 条件语句的条件
  thenBranch?: ASTNode;         // if语句的then分支
  elseBranch?: ASTNode;         // if语句的else分支
  init?: ASTNode;               // for循环的初始化
  update?: ASTNode;             // for循环的更新
  body?: ASTNode;               // 循环体
  identifier?: string;          // 标识符名称
  dataType?: string;           // 数据类型
  parameters?: ASTNode[];      // 函数参数
  arguments?: ASTNode[];       // 函数调用参数
}

// 语句类型枚举
export enum StatementType {
  // 表达式语句
  EXPRESSION_STATEMENT = 'ExpressionStatement',
  ASSIGNMENT_STATEMENT = 'AssignmentStatement',
  
  // 声明语句
  VARIABLE_DECLARATION = 'VariableDeclaration',
  LET_DECLARATION = 'LetDeclaration',
  FUNCTION_DECLARATION = 'FunctionDeclaration',
  
  // 控制流语句
  IF_STATEMENT = 'IfStatement',
  WHILE_STATEMENT = 'WhileStatement',
  FOR_STATEMENT = 'ForStatement',
  RETURN_STATEMENT = 'ReturnStatement',
  BREAK_STATEMENT = 'BreakStatement',
  CONTINUE_STATEMENT = 'ContinueStatement',
  
  // 复合语句
  BLOCK_STATEMENT = 'BlockStatement',
  
  // 空语句
  EMPTY_STATEMENT = 'EmptyStatement',
  
  // 作用域检查点
  START_CHECK_POINT = 'StartCheckPoint',
  END_CHECK_POINT = 'EndCheckPoint',
  
  // 表达式节点（继承自原有）
  NUMBER_LITERAL = 'NumberLiteral',
  IDENTIFIER = 'Identifier',
  BINARY_EXPRESSION = 'BinaryExpression',
  UNARY_EXPRESSION = 'UnaryExpression',
  FUNCTION_CALL = 'FunctionCall',
  PARENTHESIZED_EXPRESSION = 'ParenthesizedExpression'
}

// Token类型扩展
export enum TokenType {
  // 原有Token类型
  NUMBER = 'NUMBER',
  ADD = 'ADD',
  SUB = 'SUB',
  MUL = 'MUL',
  DIV = 'DIV',
  MODULO = 'MODULO',              // %
  POWER = 'POWER',
  LEFTPAREN = 'LEFTPAREN',
  RIGHTPAREN = 'RIGHTPAREN',
  END = 'END',
  
  // 新增Token类型
  IDENTIFIER = 'IDENTIFIER',           // 标识符
  ASSIGN = 'ASSIGN',                   // =
  SEMICOLON = 'SEMICOLON',            // ;
  LBRACE = 'LBRACE',                  // {
  RBRACE = 'RBRACE',                  // }
  
  // 关键字
  IF = 'IF',                          // if
  ELSE = 'ELSE',                      // else
  WHILE = 'WHILE',                    // while
  FOR = 'FOR',                        // for
  RETURN = 'RETURN',                  // return
  BREAK = 'BREAK',                    // break
  CONTINUE = 'CONTINUE',              // continue
  INT = 'INT',                        // int
  LET = 'LET',                        // let
  FUNCTION = 'FUNCTION',              // function
  
  // 比较操作符
  EQ = 'EQ',                          // ==
  NE = 'NE',                          // !=
  LT = 'LT',                          // <
  LE = 'LE',                          // <=
  GT = 'GT',                          // >
  GE = 'GE',                          // >=
  
  // 逻辑操作符
  AND = 'AND',                        // &&
  OR = 'OR',                          // ||
  NOT = 'NOT',                        // !
  
  // 其他
  COMMA = 'COMMA',                    // ,
  COLON = 'COLON',                    // :
}

// 数据类型枚举
export enum DataType {
  INT = 'int',
  FLOAT = 'float',
  STRING = 'string',
  BOOLEAN = 'boolean',
  VOID = 'void'
}

// 变量信息
export interface VariableInfo {
  name: string;
  type: DataType;
  value?: any;
  isInitialized: boolean;
  isTDZ?: boolean; // TDZ 标记
}

// 函数信息
export interface FunctionInfo {
  name: string;
  returnType: DataType;
  parameters: Array<{ name: string; type: DataType }>;
  body: ASTNode;
}

// 作用域信息
export interface Scope {
  variables: Map<string, VariableInfo>;
  functions: Map<string, FunctionInfo>;
  parent?: Scope;
}

// 解析上下文
export interface ParseContext {
  currentScope: Scope;
  globalScope: Scope;
  currentFunction?: FunctionInfo;
}

// 错误类型
export interface ParseError {
  message: string;
  position: number;
  line?: number;
  column?: number;
}

// 解析结果
export interface ParseResult {
  ast: ASTNode;
  errors: ParseError[];
  warnings: ParseError[];
}

// 执行结果
export interface ExecutionResult {
  value?: any;
  errors: ParseError[];
  output: string[];
}

// 代码生成结果
export interface CodeGenResult {
  code: string;
  errors: ParseError[];
  warnings: ParseError[];
}

// 重新导出AST类型（为了兼容性）
export type { 
  Program, 
  Statement, 
  Expression,
  NumberLiteral,
  Identifier,
  BinaryExpression,
  UnaryExpression,
  FunctionCall,
  ParenthesizedExpression,
  ExpressionStatement,
  AssignmentStatement,
  VariableDeclaration,
  FunctionDeclaration,
  IfStatement,
  WhileStatement,
  ForStatement,
  ReturnStatement,
  BreakStatement,
  ContinueStatement,
  BlockStatement,
  EmptyStatement
} from './ast';
