// AST 工厂 - 前端独立版本，支持 line/column

import type { 
  Statement, 
  Expression, 
  Program,
  NumberLiteral,
  Identifier,
  BinaryExpression,
  UnaryExpression,
  FunctionCall,
  ParenthesizedExpression,
  ExpressionStatement,
  AssignmentStatement,
  VariableDeclaration,
  LetDeclaration,
  FunctionDeclaration,
  IfStatement,
  WhileStatement,
  ForStatement,
  ReturnStatement,
  BreakStatement,
  ContinueStatement,
  BlockStatement,
  EmptyStatement,
  StartCheckPoint,
  EndCheckPoint,
  AddressOfExpression,
  DereferenceExpression,
} from './ast';
import { DataType } from './types';

export class ASTFactory {
  static createNumberLiteral(
    value: number, 
    line?: number, 
    column?: number
  ): NumberLiteral {
    return {
      type: 'NumberLiteral',
      value,
      line,
      column,
    };
  }

  static createIdentifier(
    name: string, 
    line?: number, 
    column?: number
  ): Identifier {
    return {
      type: 'Identifier',
      name,
      line,
      column,
    };
  }

  static createBinaryExpression(
    operator: string, 
    left: Expression, 
    right: Expression, 
    line?: number, 
    column?: number
  ): BinaryExpression {
    return {
      type: 'BinaryExpression',
      operator,
      left,
      right,
      line,
      column,
    };
  }

  static createUnaryExpression(
    operator: string, 
    operand: Expression, 
    line?: number, 
    column?: number
  ): UnaryExpression {
    return {
      type: 'UnaryExpression',
      operator,
      operand,
      line,
      column,
    };
  }

  static createAddressOfExpression(
    operand: Identifier,
    line?: number,
    column?: number
  ): AddressOfExpression {
    return {
      type: 'AddressOfExpression',
      operand,
      line,
      column,
    };
  }

  static createDereferenceExpression(
    operand: Expression,
    line?: number,
    column?: number
  ): DereferenceExpression {
    return {
      type: 'DereferenceExpression',
      operand,
      line,
      column,
    };
  }

  static createFunctionCall(
    callee: Identifier, 
    args: Expression[], 
    line?: number, 
    column?: number
  ): FunctionCall {
    return {
      type: 'FunctionCall',
      callee,
      arguments: args,
      line,
      column,
    };
  }

  static createParenthesizedExpression(
    expression: Expression, 
    line?: number, 
    column?: number
  ): ParenthesizedExpression {
    return {
      type: 'ParenthesizedExpression',
      expression,
      line,
      column,
    };
  }

  static createExpressionStatement(
    expression: Expression, 
    line?: number, 
    column?: number
  ): ExpressionStatement {
    return {
      type: 'ExpressionStatement',
      expression,
      line,
      column,
    };
  }

  static createAssignmentStatement(
    target: Identifier | DereferenceExpression, 
    value: Expression, 
    line?: number, 
    column?: number
  ): AssignmentStatement {
    return {
      type: 'AssignmentStatement',
      target,
      value,
      line,
      column,
    };
  }

  static createVariableDeclaration(
    name: string, 
    dataType: DataType, 
    initializer?: Expression, 
    line?: number, 
    column?: number
  ): VariableDeclaration {
    return {
      type: 'VariableDeclaration',
      name,
      dataType,
      initializer,
      line,
      column,
    };
  }

  static createLetDeclaration(
    name: string, 
    dataType: DataType, 
    initializer?: Expression, 
    line?: number, 
    column?: number
  ): LetDeclaration {
    return {
      type: 'LetDeclaration',
      name,
      dataType,
      initializer,
      line,
      column,
    };
  }

  static createFunctionDeclaration(
    name: string, 
    returnType: DataType, 
    parameters: Array<{ name: string; type: DataType }>, 
    body: BlockStatement, 
    line?: number, 
    column?: number
  ): FunctionDeclaration {
    return {
      type: 'FunctionDeclaration',
      name,
      returnType,
      parameters,
      body,
      line,
      column,
    };
  }

  static createIfStatement(
    condition: Expression, 
    thenBranch: Statement, 
    elseBranch?: Statement, 
    line?: number, 
    column?: number
  ): IfStatement {
    return {
      type: 'IfStatement',
      condition,
      thenBranch,
      elseBranch,
      line,
      column,
    };
  }

  static createWhileStatement(
    condition: Expression, 
    body: Statement, 
    line?: number, 
    column?: number
  ): WhileStatement {
    return {
      type: 'WhileStatement',
      condition,
      body,
      line,
      column,
    };
  }

  static createForStatement(
    init: VariableDeclaration | LetDeclaration | AssignmentStatement | ExpressionStatement | undefined,
    condition: Expression | undefined,
    update: ExpressionStatement | undefined,
    body: Statement,
    line?: number, 
    column?: number
  ): ForStatement {
    return {
      type: 'ForStatement',
      init,
      condition,
      update,
      body,
      line,
      column,
    };
  }

  static createReturnStatement(
    value?: Expression, 
    line?: number, 
    column?: number
  ): ReturnStatement {
    return {
      type: 'ReturnStatement',
      value,
      line,
      column,
    };
  }

  static createBreakStatement(
    line?: number, 
    column?: number
  ): BreakStatement {
    return {
      type: 'BreakStatement',
      line,
      column,
    };
  }

  static createContinueStatement(
    line?: number, 
    column?: number
  ): ContinueStatement {
    return {
      type: 'ContinueStatement',
      line,
      column,
    };
  }

  static createBlockStatement(
    statements: Statement[], 
    line?: number, 
    column?: number
  ): BlockStatement {
    return {
      type: 'BlockStatement',
      statements,
      line,
      column,
    };
  }

  static createEmptyStatement(
    line?: number, 
    column?: number
  ): EmptyStatement {
    return {
      type: 'EmptyStatement',
      line,
      column,
    };
  }

  static createStartCheckPoint(
    scopeId: string,
    depth: number,
    variableNames: string[],
    line?: number, 
    column?: number
  ): StartCheckPoint {
    return {
      type: 'StartCheckPoint',
      scopeId,
      depth,
      variableNames,
      line,
      column,
    };
  }

  static createEndCheckPoint(
    scopeId: string,
    depth: number,
    variableNames: string[],
    line?: number, 
    column?: number
  ): EndCheckPoint {
    return {
      type: 'EndCheckPoint',
      scopeId,
      depth,
      variableNames,
      line,
      column,
    };
  }

  static createProgram(
    statements: Statement[], 
    line?: number, 
    column?: number
  ): Program {
    return {
      type: 'Program',
      statements,
      line,
      column,
    };
  }
}

