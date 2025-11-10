// 作用域管理器 - 用于栈布局可视化
export interface ScopeInfo {
  scopeId: string;
  variables: Array<{ name: string; offset: number; init: boolean }>;
}

export class ScopeManager {
  private scopes: ScopeInfo[] = []; // 作用域栈
  private functionParameters: string[] = []; // 函数参数列表

  /**
   * 设置函数参数
   */
  setFunctionParameters(parameters: string[]): void {
    this.functionParameters = parameters;
  }

  /**
   * 进入新作用域
   * @param scopeId 作用域 ID
   * @param variableNames 该作用域内的变量名数组（按声明顺序）
   */
  enterScope(scopeId: string, variableNames: string[]): void {
    // 计算前面所有作用域的变量总数
    const previousVarCount = this.getTotalPreviousVarCount();

    // 创建新作用域并分配 offset
    // 变量初始状态 init: false（还未声明/初始化）
    const scopeInfo: ScopeInfo = {
      scopeId: scopeId,
      variables: variableNames.map((name, index) => {
        // 如果是函数参数，使用正数 offset（ebp + offset）
        if (this.functionParameters.includes(name)) {
          const paramIndex = this.functionParameters.indexOf(name);
          // 参数从右到左压栈，但在函数内部访问时：
          // 第一个参数（paramIndex = 0）在 ebp+2（最后压入，在栈顶附近）
          // 第二个参数（paramIndex = 1）在 ebp+3
          // 公式：offset = paramIndex + 2
          const offset = paramIndex + 2;
          return { name, offset, init: true }; // 函数参数视为已初始化
        } else {
          // 局部变量，使用负数 offset
          // 计算局部变量在当前作用域中的索引（排除函数参数）
          const localVarIndex = variableNames.slice(0, index).filter(n => !this.functionParameters.includes(n)).length;
          const offset = -(previousVarCount + localVarIndex + 1);
        return { name, offset, init: false };
        }
      })
    };

    // 压入作用域栈
    this.scopes.push(scopeInfo);
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
   * 计算前面所有作用域的总变量数（不包括函数参数）
   */
  private getTotalPreviousVarCount(): number {
    let total = 0;
    for (const scope of this.scopes) {
      // 只计算局部变量（offset < 0），不包括函数参数（offset > 0）
      total += scope.variables.filter(v => v.offset < 0).length;
    }
    return total;
  }

  /**
   * 获取当前作用域栈的快照（深拷贝）
   */
  getSnapshot(): ScopeInfo[] {
    return this.scopes.map(scope => ({
      scopeId: scope.scopeId,
      variables: scope.variables.map(v => ({ ...v }))
    }));
  }

  /**
   * 从快照恢复作用域栈
   */
  restoreSnapshot(snapshot: ScopeInfo[]): void {
    this.scopes = snapshot.map(scope => ({
      scopeId: scope.scopeId,
      variables: scope.variables.map(v => ({ ...v }))
    }));
  }

  /**
   * 获取当前作用域栈
   */
  getScopes(): ScopeInfo[] {
    return this.scopes.map(scope => ({
      scopeId: scope.scopeId,
      variables: scope.variables.map(v => ({ ...v }))
    }));
  }

  /**
   * 标记变量为已初始化（声明过）
   * 在 int 或 let 声明时调用
   */
  markVariableInitialized(name: string): void {
    // 从内层到外层查找，标记第一个找到的变量
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const scope = this.scopes[i]!;
      const varIndex = scope.variables.findIndex(v => v.name === name);
      if (varIndex !== -1) {
        scope.variables[varIndex]!.init = true;
        return;
      }
    }
  }

  /**
   * 重置作用域栈
   */
  reset(): void {
    this.scopes = [];
    this.functionParameters = [];
  }

  /**
   * 检查是否是函数参数
   */
  isFunctionParameter(name: string): boolean {
    return this.functionParameters.includes(name);
  }

  /**
   * 获取函数参数的 offset（ebp + offset）
   * 参数从右到左压栈，但在函数内部访问时：
   * 第一个参数（paramIndex = 0）在 ebp+2
   * 第二个参数（paramIndex = 1）在 ebp+3
   */
  getFunctionParameterOffset(name: string): number | null {
    const paramIndex = this.functionParameters.indexOf(name);
    if (paramIndex !== -1) {
      // 公式：offset = paramIndex + 2
      return paramIndex + 2;
    }
    return null;
  }

  /**
   * 获取变量的 offset
   * 在生成代码时，变量应该已经在作用域中（通过 enterScope 分配）
   * 只返回已初始化（init: true）的变量
   */
  getVariableOffset(name: string): number | null {
    // 首先检查是否是函数参数
    const paramOffset = this.getFunctionParameterOffset(name);
    if (paramOffset !== null) {
      return paramOffset;
    }
    
    // 从内层到外层查找，只匹配 init: true 的变量
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const scope = this.scopes[i]!;
      const variable = scope.variables.find(v => v.name === name);
      if (variable && variable.init) {
        return variable.offset;
      }
      // 如果当前作用域的变量未初始化，继续查找外层（作用域遮蔽规则）
    }
    
    return null;
  }

  /**
   * 获取当前作用域（用于兼容性）
   */
  getCurrentScope(): ScopeInfo | null {
    return this.scopes.length > 0 ? this.scopes[this.scopes.length - 1]! : null;
  }

  /**
   * 获取所有作用域的总变量数（用于释放栈空间）
   * 只计算局部变量（offset < 0），不包括函数参数（offset > 0）
   */
  getTotalVarCount(): number {
    return this.getTotalPreviousVarCount();
  }
}

