// 扩展的词法分析器
// 支持语句解析的Token识别

import { TokenType, DataType } from './types';

export interface Token {
  type: TokenType;
  value?: string | number;
  position: number;
  line?: number;
  column?: number;
}

export class StatementLexer {
  private source: string = '';
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];
  private currentIndex: number = 0;

  // 关键字映射
  private keywords: Map<string, TokenType> = new Map([
    ['if', TokenType.IF],
    ['else', TokenType.ELSE],
    ['while', TokenType.WHILE],
    ['for', TokenType.FOR],
    ['return', TokenType.RETURN],
    ['break', TokenType.BREAK],
    ['continue', TokenType.CONTINUE],
    ['int', TokenType.INT],
    ['let', TokenType.LET],
    ['function', TokenType.FUNCTION],
    ['true', TokenType.NUMBER],  // 布尔值true用数字1表示
    ['false', TokenType.NUMBER], // 布尔值false用数字0表示
  ]);

  constructor(source: string) {
    this.source = source;
    this.tokenize();
  }

  private tokenize(): void {
    this.position = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];

    while (this.position < this.source.length) {
      this.skipWhitespace();
      
      if (this.position >= this.source.length) {
        break;
      }

      const char = this.source[this.position];
      
      if (char && this.isDigit(char)) {
        this.readNumber();
      } else if (char && (this.isLetter(char) || char === '_')) {
        this.readIdentifier();
      } else {
        this.readOperator();
      }
    }

    // 添加结束标记
    this.addToken(TokenType.END, '');
  }

  private skipWhitespace(): void {
    while (this.position < this.source.length) {
      const char = this.source[this.position];
      
      if (char === '\n') {
        this.line++;
        this.column = 1;
        this.position++;
      } else if (char === '\r') {
        this.position++;
        if (this.position < this.source.length && this.source[this.position] === '\n') {
          this.position++;
        }
        this.line++;
        this.column = 1;
      } else if (char === ' ' || char === '\t') {
        this.column++;
        this.position++;
      } else if (char === '#') {
        // 跳过 # 注释到行尾
        this.skipLineComment();
      } else if (char === '/' && this.position + 1 < this.source.length && this.source[this.position + 1] === '/') {
        // 跳过 // 注释到行尾
        this.skipLineComment();
      } else {
        break;
      }
    }
  }

  private skipLineComment(): void {
    // 跳过注释到行尾
    while (this.position < this.source.length) {
      const char = this.source[this.position];
      if (char === '\n' || char === '\r') {
        break;
      }
      this.position++;
      this.column++;
    }
  }

  private readNumber(): void {
    let value = 0;
    const startPos = this.position;

    while (this.position < this.source.length && this.source[this.position] && this.isDigit(this.source[this.position]!)) {
      const char = this.source[this.position];
      if (char) {
        value = value * 10 + (char.charCodeAt(0) - '0'.charCodeAt(0));
      }
      this.position++;
      this.column++;
    }

    this.addToken(TokenType.NUMBER, value);
  }

  private readIdentifier(): void {
    let value = '';
    const startPos = this.position;

    while (this.position < this.source.length && 
           this.source[this.position] &&
           (this.isLetter(this.source[this.position]!) || 
            this.isDigit(this.source[this.position]!) || 
            this.source[this.position] === '_')) {
      const char = this.source[this.position];
      if (char) {
        value += char;
      }
      this.position++;
      this.column++;
    }

    // 检查是否是关键字
    const keywordType = this.keywords.get(value);
    if (keywordType) {
      this.addToken(keywordType, value);
    } else {
      this.addToken(TokenType.IDENTIFIER, value);
    }
  }

  private readOperator(): void {
    const char = this.source[this.position];
    if (!char) return;
    
    const nextChar = this.position + 1 < this.source.length ? this.source[this.position + 1] : '';

    switch (char) {
      case '+':
        this.addToken(TokenType.ADD, '+');
        this.position++;
        this.column++;
        break;

      case '-':
        this.addToken(TokenType.SUB, '-');
        this.position++;
        this.column++;
        break;

      case '*':
        if (nextChar === '*') {
          this.addToken(TokenType.POWER, '**');
          this.position += 2;
          this.column += 2;
        } else {
          this.addToken(TokenType.MUL, '*');
          this.position++;
          this.column++;
        }
        break;

      case '/':
        this.addToken(TokenType.DIV, '/');
        this.position++;
        this.column++;
        break;

      case '%':
        this.addToken(TokenType.MODULO, '%');
        this.position++;
        this.column++;
        break;

      case '=':
        if (nextChar === '=') {
          this.addToken(TokenType.EQ, '==');
          this.position += 2;
          this.column += 2;
        } else {
          this.addToken(TokenType.ASSIGN, '=');
          this.position++;
          this.column++;
        }
        break;

      case '!':
        if (nextChar === '=') {
          this.addToken(TokenType.NE, '!=');
          this.position += 2;
          this.column += 2;
        } else {
          this.addToken(TokenType.NOT, '!');
          this.position++;
          this.column++;
        }
        break;

      case '<':
        if (nextChar === '=') {
          this.addToken(TokenType.LE, '<=');
          this.position += 2;
          this.column += 2;
        } else {
          this.addToken(TokenType.LT, '<');
          this.position++;
          this.column++;
        }
        break;

      case '>':
        if (nextChar === '=') {
          this.addToken(TokenType.GE, '>=');
          this.position += 2;
          this.column += 2;
        } else {
          this.addToken(TokenType.GT, '>');
          this.position++;
          this.column++;
        }
        break;

      case '&':
        if (nextChar === '&') {
          this.addToken(TokenType.AND, '&&');
          this.position += 2;
          this.column += 2;
        } else {
          // 单独的 & 是取地址操作符
          this.addToken(TokenType.ADDRESS_OF, '&');
          this.position++;
          this.column++;
        }
        break;

      case '|':
        if (nextChar === '|') {
          this.addToken(TokenType.OR, '||');
          this.position += 2;
          this.column += 2;
        } else {
          throw new Error(`Unexpected character: ${char}`);
        }
        break;

      case '(':
        this.addToken(TokenType.LEFTPAREN, '(');
        this.position++;
        this.column++;
        break;

      case ')':
        this.addToken(TokenType.RIGHTPAREN, ')');
        this.position++;
        this.column++;
        break;

      case '{':
        this.addToken(TokenType.LBRACE, '{');
        this.position++;
        this.column++;
        break;

      case '}':
        this.addToken(TokenType.RBRACE, '}');
        this.position++;
        this.column++;
        break;

      case ';':
        this.addToken(TokenType.SEMICOLON, ';');
        this.position++;
        this.column++;
        break;

      case ',':
        this.addToken(TokenType.COMMA, ',');
        this.position++;
        this.column++;
        break;

      case ':':
        this.addToken(TokenType.COLON, ':');
        this.position++;
        this.column++;
        break;

      default:
        throw new Error(`Unexpected character: ${char} at line ${this.line}, column ${this.column}`);
    }
  }

  private addToken(type: TokenType, value: string | number): void {
    this.tokens.push({
      type,
      value,
      position: this.position,
      line: this.line,
      column: this.column
    });
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isLetter(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
  }

  // 公共方法
  public getTokens(): Token[] {
    return this.tokens;
  }

  public getCurrentToken(): Token | null {
    if (this.currentIndex >= this.tokens.length) {
      return null;
    }
    return this.tokens[this.currentIndex] || null;
  }

  public getNextToken(): Token | null {
    if (this.currentIndex + 1 >= this.tokens.length) {
      return null;
    }
    return this.tokens[this.currentIndex + 1] || null;
  }

  public advance(): Token | null {
    if (this.currentIndex < this.tokens.length) {
      this.currentIndex++;
    }
    return this.getCurrentToken();
  }

  public peek(offset: number = 0): Token | null {
    const index = this.currentIndex + offset;
    if (index >= this.tokens.length) {
      return null;
    }
    return this.tokens[index] || null;
  }

  public expect(type: TokenType): Token {
    const token = this.getCurrentToken();
    if (!token || token.type !== type) {
      throw new Error(`Expected ${type}, got ${token?.type || 'EOF'}`);
    }
    this.advance();
    return token;
  }

  public isAtEnd(): boolean {
    return this.currentIndex >= this.tokens.length || 
           this.getCurrentToken()?.type === TokenType.END;
  }

  public reset(): void {
    this.currentIndex = 0;
  }

  public getCurrentPosition(): number {
    return this.currentIndex;
  }

  public setPosition(position: number): void {
    this.currentIndex = position;
  }

  // 调试方法
  public printTokens(): void {
    console.log('Tokens:');
    this.tokens.forEach((token, index) => {
      console.log(`${index}: ${token.type}(${token.value}) at ${token.line}:${token.column}`);
    });
  }
}
