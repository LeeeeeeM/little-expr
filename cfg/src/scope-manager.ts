// 作用域管理器 - 简化设计，统一处理所有作用域
export class ScopeManager {
  private scopes: Map<string, number>[] = []; // 作用域栈（不再有默认的根作用域）
  private functionParameters: string[] = []; // 函数参数列表
  private forLoopVariables: Map<string, number> = new Map(); // for循环变量
  private inForLoop = false; // 是否在for循环中
  
  /**
   * 进入新作用域
   * @param variableNames 该作用域内的变量名数组（按声明顺序）
   * @returns 返回分配的栈空间大小（变量数）
   */
  enterScope(variableNames: string[]): number {
    // 计算前面所有作用域的总变量数
    const prevScopeVarCount = this.getTotalPreviousVarCount();
    
    // 创建新作用域并分配 offset
    const newScope = new Map<string, number>();
    for (let i = 0; i < variableNames.length; i++) {
      const varName = variableNames[i]!;
      // offset = -(前面所有作用域的总变量数 + 本作用域内的顺序索引 + 1)
      const offset = -(prevScopeVarCount + i + 1);
      newScope.set(varName, offset);
    }
    
    // 压入作用域栈
    this.scopes.push(newScope);
    
    return variableNames.length;
  }
  
  /**
   * 退出当前作用域
   */
  exitScope(): void {
    if (this.scopes.length > 0) {
      this.scopes.pop();
    }
  }
  
  /**
   * 计算前面所有作用域的总变量数
   */
  private getTotalPreviousVarCount(): number {
    let total = 0;
    for (const scope of this.scopes) {
      total += scope.size;
    }
    return total;
  }
  
  /**
   * 设置函数参数
   */
  setFunctionParameters(parameters: string[]): void {
    this.functionParameters = parameters;
  }
  
  /**
   * 获取变量的 offset
   * 在生成代码时，变量应该已经在作用域中（通过 enterScope 分配）
   */
  getVariableOffset(name: string): number | null {
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
    
    // 检查是否是函数参数
    const paramIndex = this.functionParameters.indexOf(name);
    if (paramIndex !== -1) {
      return paramIndex + 2; // 参数从 ebp+2 开始（跳过返回地址）
    }
    
    return null;
  }

  
  /**
   * 查找变量（兼容旧接口）
   */
  getVariable(name: string): number | null {
    return this.getVariableOffset(name);
  }
  
  /**
   * 重置（用于新函数）
   */
  reset(): void {
    this.scopes = [];
    this.functionParameters = [];
    this.forLoopVariables.clear();
    this.inForLoop = false;
  }
  
  /**
   * 获取所有作用域的总变量数（用于释放栈空间）
   */
  getTotalVarCount(): number {
    return this.getTotalPreviousVarCount();
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
  
  /**
   * 检查是否在块作用域中
   */
  isInBlock(): boolean {
    return this.scopes.length > 0;
  }
  
  /**
   * 获取当前作用域
   */
  getCurrentScope(): Map<string, number> | null {
    return this.scopes.length > 0 ? this.scopes[this.scopes.length - 1]! : null;
  }
  
  /**
   * 查找变量（从外层到内层，用于 return 语句查找最外层变量）
   */
  getFunctionLevelVariable(name: string): number | null {
    // 从外层到内层查找
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

  /**
   * 获取所有变量信息
   */
  getAllVariables(): Map<string, { offset: number }> {
    const result = new Map<string, { offset: number }>();
    
    // 遍历所有作用域（从内层到外层，内层优先）
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

  /**
   * 从快照恢复作用域链
   * @param snapshot 之前保存的快照
   */
  restoreSnapshot(snapshot: Map<string, number>[]): void {
    // 清空当前作用域栈
    this.scopes = [];
    
    // 深拷贝快照中的每个作用域
    this.scopes = snapshot.map(scope => {
      const scopeCopy = new Map<string, number>();
      for (const [name, offset] of scope) {
        scopeCopy.set(name, offset);
      }
      return scopeCopy;
    });
  }
}