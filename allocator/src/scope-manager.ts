// 变量信息
interface VariableInfo {
  offset: number;
  init: boolean; // 是否已初始化（声明过）：int 或 let 声明时设置为 true
  size: number;
}

// 作用域管理器 - 简化设计，统一处理所有作用域
export class ScopeManager {
  private scopes: Map<string, VariableInfo>[] = []; // 作用域栈（不再有默认的根作用域）
  private functionParameters: string[] = []; // 函数参数列表
  private forLoopVariables: Map<string, number> = new Map(); // for循环变量
  private inForLoop = false; // 是否在for循环中
  
  /**
   * 进入新作用域
   * @param variableNames 该作用域内的变量名数组（按声明顺序）
   * @returns 返回分配的栈空间大小（变量数）
   */
  enterScope(variableNames: string[], variableSizes?: number[]): number {
    // 计算前面所有作用域的总变量数
    const prevScopeVarCount = this.getTotalPreviousVarCount();
    let cumulativeSize = 0;

    // 创建新作用域并分配 offset
    // 变量初始状态 init: false（还未声明/初始化）
    const newScope = new Map<string, VariableInfo>();
    for (let i = 0; i < variableNames.length; i++) {
      const varName = variableNames[i]!;
      const size = Math.max(1, variableSizes?.[i] ?? 1);
      // offset = -(前面所有作用域的总变量数 + 当前累积分配 + 当前变量大小)
      const offset = -(prevScopeVarCount + cumulativeSize + size);
      newScope.set(varName, { offset, init: false, size });
      cumulativeSize += size;
    }
    
    // 压入作用域栈
    this.scopes.push(newScope);
    
    return cumulativeSize;
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
      for (const info of scope.values()) {
        total += info.size;
      }
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
   * 只返回已初始化（init: true）的变量
   */
  getVariableOffset(name: string): number | null {
    // 首先检查for循环变量
    if (this.inForLoop && this.forLoopVariables.has(name)) {
      return this.forLoopVariables.get(name)!;
    }
    
    // 从内层到外层查找，只匹配 init: true 的变量
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const scope = this.scopes[i];
      if (scope && scope.has(name)) {
        const info = scope.get(name)!;
        if (info.init) {
          return info.offset;
        }
        // 如果当前作用域的变量未初始化，继续查找外层（作用域遮蔽规则）
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
   * 获取变量的 size
   * 在生成代码时，变量应该已经在作用域中（通过 enterScope 分配）
   * 只返回已初始化（init: true）的变量
   */
  getVariableSize(name: string): number | null {
    // 首先检查for循环变量（for循环变量大小固定为1）
    if (this.inForLoop && this.forLoopVariables.has(name)) {
      return 1;
    }
    
    // 从内层到外层查找，只匹配 init: true 的变量
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const scope = this.scopes[i];
      if (scope && scope.has(name)) {
        const info = scope.get(name)!;
        if (info.init) {
          return info.size;
        }
        // 如果当前作用域的变量未初始化，继续查找外层（作用域遮蔽规则）
      }
    }
    
    // 函数参数大小固定为1
    const paramIndex = this.functionParameters.indexOf(name);
    if (paramIndex !== -1) {
      return 1;
    }
    
    return null;
  }
  
  /**
   * 标记变量为已初始化（声明过）
   * 在 int 或 let 声明时调用
   */
  markVariableInitialized(name: string): void {
    // 从内层到外层查找，标记第一个找到的变量
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const scope = this.scopes[i];
      if (scope && scope.has(name)) {
        const info = scope.get(name)!;
        info.init = true;
        return;
      }
    }
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
  getCurrentScope(): Map<string, VariableInfo> | null {
    return this.scopes.length > 0 ? this.scopes[this.scopes.length - 1]! : null;
  }
  

  /**
   * 获取所有变量信息（只返回已初始化的变量）
   */
  getAllVariables(): Map<string, { offset: number }> {
    const result = new Map<string, { offset: number }>();
    
    // 遍历所有作用域（从内层到外层，内层优先），只返回 init: true 的变量
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const scope = this.scopes[i];
      if (scope) {
        for (const [name, info] of scope) {
          if (info.init && !result.has(name)) {
            result.set(name, { offset: info.offset });
          }
        }
      }
    }
    
    return result;
  }

  /**
   * 保存当前作用域链的快照
   * 返回作用域栈（scopes）的深拷贝，包含完整的 VariableInfo（offset 和 init）
   */
  saveSnapshot(): Map<string, VariableInfo>[] {
    // 深拷贝 scopes 数组和每个 Map，保存完整的 VariableInfo
    return this.scopes.map(scope => {
      const scopeCopy = new Map<string, VariableInfo>();
      for (const [name, info] of scope) {
        scopeCopy.set(name, { offset: info.offset, init: info.init, size: info.size });
      }
      return scopeCopy;
    });
  }

  /**
   * 从快照恢复作用域链
   * @param snapshot 之前保存的快照（包含完整的 VariableInfo）
   */
  restoreSnapshot(snapshot: Map<string, VariableInfo>[]): void {
    // 清空当前作用域栈
    this.scopes = [];
    
    // 深拷贝快照中的每个作用域，恢复完整的 VariableInfo（包括 offset 和 init）
    this.scopes = snapshot.map(scope => {
      const scopeCopy = new Map<string, VariableInfo>();
      for (const [name, info] of scope) {
        scopeCopy.set(name, { offset: info.offset, init: info.init, size: info.size });
      }
      return scopeCopy;
    });
  }
}