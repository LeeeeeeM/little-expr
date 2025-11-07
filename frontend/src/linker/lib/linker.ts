/**
 * 简化的链接器（Linker）
 * 功能：
 * 1. 收集标签到地址的映射（假设每条指令占1个地址单位）
 * 2. 将跳转指令中的标签替换为地址
 * 3. 移除标签行
 * 4. 输出格式化的链接后代码
 */

export interface LinkResult {
  linkedCode: string;
  labelMap: Map<string, number>;
  errors: string[];
}

export class SimpleLinker {
  private labels: Map<string, number> = new Map();
  private instructions: Array<{
    line: string;
    originalLine: string;
    opcode: string | null;
    operands: string[];
    address: number;
    labelReferences: string[];
  }> = [];
  private errors: string[] = [];

  /**
   * 链接汇编代码
   * @param assembly 输入的汇编代码（包含标签）
   * @returns 链接后的代码和相关信息
   */
  link(assembly: string): LinkResult {
    this.labels.clear();
    this.instructions = [];
    this.errors = [];

    const lines = assembly.split('\n');
    let address = 0;

    // 第一遍扫描：收集标签和计算指令地址
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();

      // 跳过空行和注释
      if (!trimmed || trimmed.startsWith(';')) {
        continue;
      }

      // 检查是否是标签
      if (trimmed.endsWith(':')) {
        const labelName = trimmed.slice(0, -1).trim();
        if (labelName) {
          this.labels.set(labelName, address);
        }
        continue;
      }

      // 解析指令（移除行内注释）
      const commentIndex = trimmed.indexOf(';');
      const codePart = commentIndex >= 0 ? trimmed.slice(0, commentIndex).trim() : trimmed;
      
      if (!codePart) {
        // 整行都是注释，跳过
        continue;
      }
      
      const parts = codePart.split(/\s+/);
      const opcode = parts[0]!;
      const operands = parts.slice(1).map(op => op.replace(',', '').trim()).filter(op => op);

      // 检查操作数中是否有标签引用
      const labelReferences: string[] = [];
      
      for (const operand of operands) {
        if (this.isLabelReference(operand)) {
          labelReferences.push(operand);
        }
      }

      this.instructions.push({
        line: trimmed,
        originalLine: line,
        opcode,
        operands,
        address,
        labelReferences,
      });

      // 每条指令占1个地址单位
      address++;
    }

    // 检查未定义的标签
    for (const inst of this.instructions) {
      for (const label of inst.labelReferences) {
        if (!this.labels.has(label)) {
          this.errors.push(`未定义的标签: ${label} (在地址 ${inst.address} 处)`);
        }
      }
    }

    // 生成链接后的代码
    const linkedCode = this.generateLinkedCode();

    return {
      linkedCode,
      labelMap: new Map(this.labels),
      errors: this.errors,
    };
  }

  /**
   * 生成链接后的代码（在每个函数入口添加注释）
   */
  private generateLinkedCode(): string {
    const lines: string[] = [];

    // 输出链接后的指令
    for (const inst of this.instructions) {
      let linkedLine = inst.line;

      // 替换标签引用为地址
      for (const label of inst.labelReferences) {
          const targetAddress = this.labels.get(label);
          if (targetAddress !== undefined) {
            const labelRegex = new RegExp(`\\b${this.escapeRegex(label)}\\b`, 'g');
            linkedLine = linkedLine.replace(labelRegex, targetAddress.toString());
          } else {
            // 未定义的标签：如果是 call 指令，保留原始函数名（可能是函数声明）
            // 否则替换为 ?
            if (inst.opcode === 'call') {
            // call 指令中的未定义标签保留为原始函数名（可能是函数声明）
              // 不进行替换，保持原样
            } else {
              // 其他指令中的未定义标签替换为 ?
              const labelRegex = new RegExp(`\\b${this.escapeRegex(label)}\\b`, 'g');
              linkedLine = linkedLine.replace(labelRegex, '?');
          }
        }
      }

      // 格式化输出：[地址] 指令
      const addressStr = `[${inst.address}]`;
      let outputLine = `${addressStr}   ${linkedLine}`;

      // 检查是否是函数入口（如果该地址在 labelMap 中，且是函数名）
      // 注意：只在函数入口地址添加注释，不在 call 指令上添加
      const functionName = this.getFunctionNameAtAddress(inst.address);
      if (functionName && inst.opcode !== 'call') {
        // 这是函数入口的第一条指令，添加注释
        outputLine += `          ; 函数入口: ${functionName}`;
      }

      lines.push(outputLine);
    }

    return lines.join('\n');
  }

  /**
   * 获取指定地址对应的函数名（如果有）
   * 只识别纯函数名，不识别 block 标签（如 main_block_3, main_entry_block 等）
   */
  private getFunctionNameAtAddress(address: number): string | null {
    for (const [labelName, labelAddress] of this.labels.entries()) {
      if (labelAddress === address) {
        // 检查是否是函数名：
        // 1. 排除所有包含 _block, _entry, _exit 的标签
        // 2. 排除 main_block_3 这种格式（下划线+数字结尾）
        // 3. 排除 main_entry_block 这种格式
        if (
          !labelName.includes('_block') && 
          !labelName.includes('_entry') && 
          !labelName.includes('_exit') &&
          !labelName.match(/_\d+$/) && // 排除 main_block_3 这种格式
          !labelName.match(/^[a-zA-Z_]+_block_\d+$/) // 排除 main_block_3 这种完整格式
        ) {
          return labelName;
        }
      }
    }
    return null;
  }

  /**
   * 检查操作数是否是标签引用
   */
  private isLabelReference(operand: string): boolean {
    // 不是立即数
    if (/^-?\d+$/.test(operand)) {
      return false;
    }

    // 不是寄存器
    const registers = [
      'eax', 'ebx', 'ecx', 'edx',
      'ax', 'bx', 'cx', 'dx',
      'al', 'ah', 'bl', 'bh', 'cl', 'ch', 'dl', 'dh',
      'sp', 'bp', 'esp', 'ebp',
      'si', 'di', 'esi', 'edi',
    ];
    if (registers.includes(operand.toLowerCase())) {
      return false;
    }

    // 不是栈访问格式 [offset]
    if (/^\[-?\d+\]$/.test(operand)) {
      return false;
    }

    // 包含特殊字符（如括号、冒号、分号、逗号、空格等）的不是标签
    if (/[\[\]():;,\s]/.test(operand)) {
      return false;
    }

    // 其他情况认为是标签引用（只包含字母、数字、下划线）
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(operand);
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

