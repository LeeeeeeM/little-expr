// 作用域管理器 - 用于栈布局可视化
export interface ScopeInfo {
  scopeId: string;
  variables: Array<{ name: string; offset: number; init: boolean }>;
}

export class ScopeManager {
  private scopes: ScopeInfo[] = []; // 作用域栈

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
        // offset = -(前面所有作用域的总变量数 + 本作用域内的顺序索引 + 1)
        const offset = -(previousVarCount + index + 1);
        return { name, offset, init: false };
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
   * 计算前面所有作用域的总变量数
   */
  private getTotalPreviousVarCount(): number {
    let total = 0;
    for (const scope of this.scopes) {
      total += scope.variables.length;
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
  }
}

