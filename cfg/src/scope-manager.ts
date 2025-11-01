// 作用域管理器 - 基于 separated.ts 的设计
export class ScopeManager {
  private scopes: Map<string, number>[] = [new Map()]; // 作用域栈
  private functionStackOffset = 0; // 函数级变量栈偏移
  private functionParameters: string[] = []; // 函数参数列表
  private declaredVarCount = 0; // 累计已声明的块级变量数
  private totalAllocated = 0; // 累计总分配的块级空间数（所有 scope 的 sub esp 之和）
  private totalAllocatedStack: number[] = []; // 进入每个 scope 时的累计总分配数（用于 exitScope 恢复）
  private declaredCountStack: number[] = []; // 进入每个 scope 时的已声明数（用于 exitScope 恢复）
  private forLoopVariables: Map<string, number> = new Map(); // for循环变量
  private inForLoop = false; // 是否在for循环中
  
  // 进入新作用域
  // newAllocated: 当前 scope 新分配的空间数（sub esp, n 中的 n）
  enterScope(newAllocated: number = 0): void {
    this.scopes.push(new Map());
    
    // 保存进入 scope 时的状态（用于 exitScope 恢复）
    this.totalAllocatedStack.push(this.totalAllocated);
    this.declaredCountStack.push(this.declaredVarCount);
    
    // 更新累计总分配数
    this.totalAllocated += newAllocated;
  }
  
  // 退出当前作用域
  exitScope(): void {
    if (this.scopes.length > 1) {
      this.scopes.pop();
      
      // 从栈中恢复进入该 scope 前的状态
      const previousTotalAllocated = this.totalAllocatedStack.pop();
      const previousDeclared = this.declaredCountStack.pop();
      
      if (previousTotalAllocated !== undefined && previousDeclared !== undefined) {
        this.totalAllocated = previousTotalAllocated;
        this.declaredVarCount = previousDeclared;
      }
    }
  }
  
  // 设置函数参数
  setFunctionParameters(parameters: string[]): void {
    this.functionParameters = parameters;
  }
  
  // 声明函数级变量
  declareFunctionVariable(name: string): number {
    // 检查是否已经存在同名变量
    if (this.scopes[0]!.has(name)) {
      // 如果已经存在，不覆盖，直接返回现有的偏移
      const existingOffset = this.scopes[0]!.get(name)!;
      return existingOffset;
    }
    
    const offset = --this.functionStackOffset; // 负数偏移
    this.scopes[0]!.set(name, offset); // 函数级变量存储在根作用域
    return offset;
  }
  
  // 声明块级变量
  declareBlockVariable(name: string): number {
    const currentScope = this.scopes[this.scopes.length - 1]!;
    
    // 计算 offset
    // offset = -(函数级变量数 + 进入 scope 前的总分配数 + 当前 scope 中已声明的变量数 + 1)
    // totalAllocatedStack 的最后一个元素是进入当前 scope 前的总分配数
    const functionVarCount = this.getFunctionVariableCount();
    const totalAllocatedBefore = this.totalAllocatedStack.length > 0 
      ? this.totalAllocatedStack[this.totalAllocatedStack.length - 1]!
      : 0;
    const declaredBefore = this.declaredCountStack.length > 0
      ? this.declaredCountStack[this.declaredCountStack.length - 1]!
      : 0;
    const currentScopeDeclared = this.declaredVarCount - declaredBefore;
    const offset = -(functionVarCount + totalAllocatedBefore + currentScopeDeclared + 1);
    
    // 递增已声明数
    this.declaredVarCount++;
    
    currentScope.set(name, offset);
    return offset;
  }

  
  // 查找变量
  getVariable(name: string): number | null {
    // 首先检查for循环变量
    if (this.inForLoop && this.forLoopVariables.has(name)) {
      return this.forLoopVariables.get(name)!;
    }
    
    // 从内层到外层查找
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const scope = this.scopes[i];
      if (scope && scope.has(name)) {
        return scope.get(name)!;
      }
    }
    
    return null;
  }
  
  // 重置（用于新函数）
  reset(): void {
    this.scopes = [new Map()];
    this.functionStackOffset = 0;
    this.functionParameters = [];
    this.declaredVarCount = 0;
    this.totalAllocated = 0;
    this.totalAllocatedStack = [];
    this.declaredCountStack = [];
    this.forLoopVariables.clear();
    this.inForLoop = false;
  }
  
  // 获取函数级变量数量
  getFunctionVariableCount(): number {
    return Math.abs(this.functionStackOffset);
  }
  
  // 进入for循环作用域
  enterForLoop(): void {
    this.inForLoop = true;
  }
  
  // 退出for循环作用域
  exitForLoop(): void {
    this.inForLoop = false;
    this.forLoopVariables.clear();
  }
  
  // 检查是否在块作用域中
  isInBlock(): boolean {
    return this.scopes.length > 1;
  }
  
  // 获取当前作用域
  getCurrentScope(): Map<string, number> {
    return this.scopes[this.scopes.length - 1]!;
  }
  
  // 查找函数级变量（用于 return 语句）
  getFunctionLevelVariable(name: string): number | null {
    // 查找最外层的同名变量（从函数级作用域开始）
    for (let i = 0; i < this.scopes.length; i++) {
      const scope = this.scopes[i];
      if (scope && scope.has(name)) {
        return scope.get(name)!;
      }
    }
    
    // 如果都没找到，检查是否是函数参数
    const paramIndex = this.functionParameters.indexOf(name);
    if (paramIndex !== -1) {
      return paramIndex + 2; // 参数从 ebp+2 开始（跳过返回地址）
    }
    
    return null;
  }

  // 获取所有变量信息
  getAllVariables(): Map<string, { offset: number }> {
    const result = new Map<string, { offset: number }>();
    
    // 遍历所有作用域
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const scope = this.scopes[i];
      if (scope) {
        for (const [name, offset] of scope) {
          if (!result.has(name)) {
            result.set(name, { offset });
          }
        }
      }
    }
    
    return result;
  }

  /**
   * 保存当前作用域链的快照
   * 返回作用域栈（scopes）的深拷贝
   */
  saveSnapshot(): Map<string, number>[] {
    // 深拷贝 scopes 数组和每个 Map
    return this.scopes.map(scope => {
      const scopeCopy = new Map<string, number>();
      for (const [name, offset] of scope) {
        scopeCopy.set(name, offset);
      }
      return scopeCopy;
    });
  }
}