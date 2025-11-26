// AST节点定义
// 为各种语句类型定义对应的AST节点

import { StatementType, DataType } from './types';

// 基础AST节点接口
export interface ASTNode {
  type: string;
  position?: number;
  line?: number;
  column?: number;
}

// 表达式节点
export interface NumberLiteral extends ASTNode {
  type: 'NumberLiteral';
  value: number;
}

export interface Identifier extends ASTNode {
  type: 'Identifier';
  name: string;
}

export interface BinaryExpression extends ASTNode {
  type: 'BinaryExpression';
  operator: string;
  left: Expression;
  right: Expression;
}

export interface UnaryExpression extends ASTNode {
  type: 'UnaryExpression';
  operator: string;
  operand: Expression;
}

// 指针相关表达式
export interface AddressOfExpression extends ASTNode {
  type: 'AddressOfExpression';
  operand: Identifier;
}

export interface DereferenceExpression extends ASTNode {
  type: 'DereferenceExpression';
  operand: Expression;
}

export interface MemberExpression extends ASTNode {
  type: 'MemberExpression';
  object: Identifier;
  field: string;
  fieldOffset: number;
  structName: string;
  isPointerAccess?: boolean;  // true 表示通过指针访问 (->)，false 表示直接访问 (.)
  structSize?: number;  // 结构体大小，用于指针访问时计算字段地址
}

export interface FunctionCall extends ASTNode {
  type: 'FunctionCall';
  callee: Identifier;
  arguments: Expression[];
}

export interface ParenthesizedExpression extends ASTNode {
  type: 'ParenthesizedExpression';
  expression: Expression;
}

// 表达式联合类型
export type Expression = 
  | NumberLiteral 
  | Identifier 
  | BinaryExpression 
  | UnaryExpression 
  | FunctionCall 
  | ParenthesizedExpression
  | AddressOfExpression
  | DereferenceExpression
  | MemberExpression;

// 语句节点
export interface ExpressionStatement extends ASTNode {
  type: 'ExpressionStatement';
  expression: Expression;
}

export interface AssignmentStatement extends ASTNode {
  type: 'AssignmentStatement';
  target: Identifier | DereferenceExpression | MemberExpression;  // 支持 *p = 123 或结构体字段赋值
  value: Expression;
}

export interface VariableDeclaration extends ASTNode {
  type: 'VariableDeclaration';
  name: string;
  dataType: DataType;
  initializer?: Expression;
  structName?: string;
  structSize?: number;
}

export interface LetDeclaration extends ASTNode {
  type: 'LetDeclaration';
  name: string;
  dataType: DataType;
  initializer?: Expression;
}

export interface FunctionDeclaration extends ASTNode {
  type: 'FunctionDeclaration';
  name: string;
  returnType: DataType;
  parameters: Array<{ name: string; type: DataType }>;
  body: BlockStatement;
  isDeclaration?: boolean; // true 表示函数声明（只有声明，没有定义），false 或 undefined 表示函数定义
}

export interface StructDeclaration extends ASTNode {
  type: 'StructDeclaration';
  name: string;
  fields: Array<{ name: string; type: DataType }>;
}

export interface IfStatement extends ASTNode {
  type: 'IfStatement';
  condition: Expression;
  thenBranch: Statement;
  elseBranch?: Statement;
}

export interface WhileStatement extends ASTNode {
  type: 'WhileStatement';
  condition: Expression;
  body: Statement;
}

export interface ForStatement extends ASTNode {
  type: 'ForStatement';
  init?: VariableDeclaration | LetDeclaration | AssignmentStatement | ExpressionStatement;
  condition?: Expression;
  update?: ExpressionStatement;
  body: Statement;
}

export interface ReturnStatement extends ASTNode {
  type: 'ReturnStatement';
  value?: Expression;
}

export interface BreakStatement extends ASTNode {
  type: 'BreakStatement';
}

export interface ContinueStatement extends ASTNode {
  type: 'ContinueStatement';
}

export interface BlockStatement extends ASTNode {
  type: 'BlockStatement';
  statements: Statement[];
}

export interface EmptyStatement extends ASTNode {
  type: 'EmptyStatement';
}

// 作用域检查点标记
export interface StartCheckPoint extends ASTNode {
  type: 'StartCheckPoint';
  scopeId: string;        // 唯一标识，用于与 EndCheckPoint 配对
  depth: number;          // 嵌套深度（可选，用于调试）
  variableNames: string[];  // 该作用域内直接声明的变量名数组（按声明顺序）
  variableSizes: number[];
}

export interface EndCheckPoint extends ASTNode {
  type: 'EndCheckPoint';
  scopeId: string;        // 对应 StartCheckPoint 的 scopeId
  depth: number;          // 必须与对应的 StartCheckPoint 一致
  variableNames: string[];  // 必须与对应的 StartCheckPoint 一致（用于验证）
  variableSizes: number[];
}

// 语句联合类型
export type Statement = 
  | ExpressionStatement
  | AssignmentStatement
  | StructDeclaration
  | VariableDeclaration
  | LetDeclaration
  | FunctionDeclaration
  | IfStatement
  | WhileStatement
  | ForStatement
  | ReturnStatement
  | BreakStatement
  | ContinueStatement
  | BlockStatement
  | EmptyStatement
  | StartCheckPoint
  | EndCheckPoint;

// 程序根节点
export interface Program extends ASTNode {
  type: 'Program';
  statements: Statement[];
}

// AST节点创建工厂函数
export class ASTFactory {
  static createNumberLiteral(value: number, position?: number): NumberLiteral {
    return {
      type: 'NumberLiteral',
      value,
      position
    };
  }

  static createIdentifier(name: string, position?: number): Identifier {
    return {
      type: 'Identifier',
      name,
      position
    };
  }

  static createBinaryExpression(
    operator: string, 
    left: Expression, 
    right: Expression, 
    position?: number
  ): BinaryExpression {
    return {
      type: 'BinaryExpression',
      operator,
      left,
      right,
      position
    };
  }

  static createUnaryExpression(
    operator: string, 
    operand: Expression, 
    position?: number
  ): UnaryExpression {
    return {
      type: 'UnaryExpression',
      operator,
      operand,
      position
    };
  }

  static createAddressOfExpression(
    operand: Identifier,
    position?: number
  ): AddressOfExpression {
    return {
      type: 'AddressOfExpression',
      operand,
      position
    };
  }

  static createDereferenceExpression(
    operand: Expression,
    position?: number
  ): DereferenceExpression {
    return {
      type: 'DereferenceExpression',
      operand,
      position
    };
  }

  static createFunctionCall(
    callee: Identifier, 
    args: Expression[], 
    position?: number
  ): FunctionCall {
    return {
      type: 'FunctionCall',
      callee,
      arguments: args,
      position
    };
  }

  static createParenthesizedExpression(
    expression: Expression, 
    position?: number
  ): ParenthesizedExpression {
    return {
      type: 'ParenthesizedExpression',
      expression,
      position
    };
  }

  static createExpressionStatement(
    expression: Expression, 
    position?: number
  ): ExpressionStatement {
    return {
      type: 'ExpressionStatement',
      expression,
      position
    };
  }

  static createAssignmentStatement(
    target: Identifier | DereferenceExpression | MemberExpression, 
    value: Expression, 
    position?: number
  ): AssignmentStatement {
    return {
      type: 'AssignmentStatement',
      target,
      value,
      position
    };
  }

  static createVariableDeclaration(
    name: string, 
    dataType: DataType, 
    initializer?: Expression, 
    position?: number,
    options?: { structName?: string; structSize?: number }
  ): VariableDeclaration {
    return {
      type: 'VariableDeclaration',
      name,
      dataType,
      initializer,
      position,
      structName: options?.structName,
      structSize: options?.structSize
    };
  }

  static createLetDeclaration(
    name: string, 
    dataType: DataType, 
    initializer?: Expression, 
    position?: number
  ): LetDeclaration {
    return {
      type: 'LetDeclaration',
      name,
      dataType,
      initializer,
      position
    };
  }

  static createMemberExpression(
    object: Identifier,
    field: string,
    fieldOffset: number,
    structName: string,
    position?: number,
    isPointerAccess?: boolean,
    structSize?: number
  ): MemberExpression {
    return {
      type: 'MemberExpression',
      object,
      field,
      fieldOffset,
      structName,
      position,
      isPointerAccess: isPointerAccess || false,
      structSize
    };
  }

  static createFunctionDeclaration(
    name: string, 
    returnType: DataType, 
    parameters: Array<{ name: string; type: DataType }>, 
    body: BlockStatement, 
    position?: number,
    isDeclaration?: boolean
  ): FunctionDeclaration {
    return {
      type: 'FunctionDeclaration',
      name,
      returnType,
      parameters,
      body,
      position,
      isDeclaration
    };
  }

  static createStructDeclaration(
    name: string,
    fields: Array<{ name: string; type: DataType }>,
    position?: number
  ): StructDeclaration {
    return {
      type: 'StructDeclaration',
      name,
      fields,
      position
    };
  }

  static createIfStatement(
    condition: Expression, 
    thenBranch: Statement, 
    elseBranch?: Statement, 
    position?: number
  ): IfStatement {
    return {
      type: 'IfStatement',
      condition,
      thenBranch,
      elseBranch,
      position
    };
  }

  static createWhileStatement(
    condition: Expression, 
    body: Statement, 
    position?: number
  ): WhileStatement {
    return {
      type: 'WhileStatement',
      condition,
      body,
      position
    };
  }

  static createForStatement(
    init: VariableDeclaration | LetDeclaration | AssignmentStatement | ExpressionStatement | undefined,
    condition: Expression | undefined,
    update: ExpressionStatement | undefined,
    body: Statement,
    position?: number
  ): ForStatement {
    return {
      type: 'ForStatement',
      init,
      condition,
      update,
      body,
      position
    };
  }

  static createReturnStatement(
    value?: Expression, 
    position?: number
  ): ReturnStatement {
    return {
      type: 'ReturnStatement',
      value,
      position
    };
  }

  static createBreakStatement(position?: number): BreakStatement {
    return {
      type: 'BreakStatement',
      position
    };
  }

  static createContinueStatement(position?: number): ContinueStatement {
    return {
      type: 'ContinueStatement',
      position
    };
  }

  static createBlockStatement(
    statements: Statement[], 
    position?: number
  ): BlockStatement {
    return {
      type: 'BlockStatement',
      statements,
      position
    };
  }

  static createEmptyStatement(position?: number): EmptyStatement {
    return {
      type: 'EmptyStatement',
      position
    };
  }

  static createStartCheckPoint(
    scopeId: string,
    depth: number,
    variableNames: string[],
    position?: number,
    variableSizes?: number[]
  ): StartCheckPoint {
    return {
      type: 'StartCheckPoint',
      scopeId,
      depth,
      variableNames,
      variableSizes: variableSizes || variableNames.map(() => 1),
      position
    };
  }

  static createEndCheckPoint(
    scopeId: string,
    depth: number,
    variableNames: string[],
    position?: number,
    variableSizes?: number[]
  ): EndCheckPoint {
    return {
      type: 'EndCheckPoint',
      scopeId,
      depth,
      variableNames,
      variableSizes: variableSizes || variableNames.map(() => 1),
      position
    };
  }

  static createProgram(statements: Statement[], position?: number): Program {
    return {
      type: 'Program',
      statements,
      position
    };
  }
}

// AST访问者模式接口
export interface ASTVisitor<T> {
  visitProgram(node: Program): T;
  visitStatement(node: Statement): T;
  visitExpression(node: Expression): T;
  
  // 具体节点访问方法
  visitNumberLiteral(node: NumberLiteral): T;
  visitIdentifier(node: Identifier): T;
  visitBinaryExpression(node: BinaryExpression): T;
  visitUnaryExpression(node: UnaryExpression): T;
  visitFunctionCall(node: FunctionCall): T;
  visitParenthesizedExpression(node: ParenthesizedExpression): T;
  
  visitExpressionStatement(node: ExpressionStatement): T;
  visitAssignmentStatement(node: AssignmentStatement): T;
  visitVariableDeclaration(node: VariableDeclaration): T;
  visitLetDeclaration(node: LetDeclaration): T;
  visitFunctionDeclaration(node: FunctionDeclaration): T;
  visitIfStatement(node: IfStatement): T;
  visitWhileStatement(node: WhileStatement): T;
  visitForStatement(node: ForStatement): T;
  visitReturnStatement(node: ReturnStatement): T;
  visitBreakStatement(node: BreakStatement): T;
  visitContinueStatement(node: ContinueStatement): T;
  visitBlockStatement(node: BlockStatement): T;
  visitEmptyStatement(node: EmptyStatement): T;
  visitStartCheckPoint(node: StartCheckPoint): T;
  visitEndCheckPoint(node: EndCheckPoint): T;
}
