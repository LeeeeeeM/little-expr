/**
 * 链接后代码执行器（Linked Code Executor）
 * 用于执行经过 linker 处理后的代码
 * 
 * 特点：
 * - 代码已经移除了标签，使用地址跳转
 * - 每行代码有地址标注 [x]
 * - 跳转指令使用数字地址而不是标签
 */

export interface LinkedExecState {
  registers: Map<string, number>;
  memory: Map<number, number>;
  stack: Map<number, number>;
  flags: {
    greater: boolean;
    equal: boolean;
    less: boolean;
  };
  pc: number; // 程序计数器（当前执行的地址）
  halted: boolean;
  cycles: number;
}

export interface LinkedInstruction {
  address: number; // 指令地址
  opcode: string;
  operands: string[];
  originalLine: string; // 原始代码行（用于显示）
}

export class LinkedCodeExecutor {
  private state: LinkedExecState;
  private instructions: LinkedInstruction[] = [];
  private addressToIndex: Map<number, number> = new Map(); // 地址到指令索引的映射

  constructor() {
    this.state = {
      registers: new Map([
        ['ax', 0], ['bx', 0], ['sp', 1023], ['bp', 1023]
      ]),
      memory: new Map(),
      stack: new Map(),
      flags: {
        greater: false,
        equal: false,
        less: false
      },
      pc: 0,
      halted: false,
      cycles: 0
    };
  }

  /**
   * 加载链接后的代码
   * @param linkedCode 链接后的代码（包含地址标注）
   */
  loadLinkedCode(linkedCode: string): void {
    this.instructions = [];
    this.addressToIndex.clear();
    this.resetState();

    const lines = linkedCode.split('\n');
    let instructionIndex = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // 跳过空行、注释和标签映射表
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('===')) {
        continue;
      }

      // 解析带地址标注的指令：[地址] 指令
      const addressMatch = trimmed.match(/^\[(\d+)\]\s+(.+)$/);
      if (!addressMatch) {
        continue;
      }

      const address = parseInt(addressMatch[1]!, 10);
      const instructionPart = addressMatch[2]!.trim();

      // 移除行内注释
      const commentIndex = instructionPart.indexOf(';');
      const codePart = commentIndex >= 0 
        ? instructionPart.slice(0, commentIndex).trim() 
        : instructionPart;

      if (!codePart) {
        continue;
      }

      // 解析指令
      const parts = codePart.split(/\s+/);
      const opcode = parts[0]!;
      const operands = parts.slice(1).map(op => op.replace(',', '').trim()).filter(op => op);

      this.instructions.push({
        address,
        opcode,
        operands,
        originalLine: line
      });

      // 建立地址到索引的映射
      this.addressToIndex.set(address, instructionIndex);
      instructionIndex++;
    }
  }

  /**
   * 单步执行
   */
  step(): { success: boolean; output: string; state: LinkedExecState; currentAddress: number | null } {
    if (this.state.halted || this.state.pc < 0) {
      return {
        success: true,
        output: '',
        state: this.state,
        currentAddress: null
      };
    }

    // 找到当前地址对应的指令索引
    const instructionIndex = this.addressToIndex.get(this.state.pc);
    
    if (instructionIndex === undefined) {
      return {
        success: false,
        output: `找不到地址 ${this.state.pc} 的指令`,
        state: this.state,
        currentAddress: null
      };
    }

    try {
      const instruction = this.instructions[instructionIndex]!;
      const oldPc = this.state.pc;
      
      this.executeInstruction(instruction);
      this.state.cycles++;

      // 如果 pc 没有改变（没有跳转），则递增到下一个地址
      if (!this.state.halted && this.state.pc === oldPc) {
        // 找到下一个指令的地址
        const nextIndex = instructionIndex + 1;
        if (nextIndex < this.instructions.length) {
          this.state.pc = this.instructions[nextIndex]!.address;
        } else {
          this.state.halted = true;
        }
      }

      return {
        success: true,
        output: '',
        state: this.state,
        currentAddress: instruction.address
      };
    } catch (error) {
      return {
        success: false,
        output: `执行错误: ${error}`,
        state: this.state,
        currentAddress: null
      };
    }
  }

  /**
   * 完整执行
   */
  run(): { success: boolean; output: string; state: LinkedExecState } {
    const MAX_CYCLES = 1000;

    try {
      while (!this.state.halted && this.state.pc >= 0 && this.state.cycles < MAX_CYCLES) {
        const stepResult = this.step();
        if (!stepResult.success) {
          return {
            success: false,
            output: stepResult.output,
            state: this.state
          };
        }
      }

      if (this.state.cycles >= MAX_CYCLES) {
        return {
          success: false,
          output: `超过最大执行周期 (${MAX_CYCLES})，可能存在死循环`,
          state: this.state
        };
      }

      return {
        success: true,
        output: '',
        state: this.state
      };
    } catch (error) {
      return {
        success: false,
        output: `执行错误: ${error}`,
        state: this.state
      };
    }
  }

  /**
   * 执行单条指令
   */
  private executeInstruction(instruction: LinkedInstruction): void {
    const { opcode, operands } = instruction;

    switch (opcode) {
      case 'mov':
        this.mov(operands[0]!, operands[1]!);
        break;
      case 'add':
        this.add(operands[0]!, operands[1]!);
        break;
      case 'sub':
        this.sub(operands[0]!, operands[1]!);
        break;
      case 'mul':
        this.mul(operands[0]!);
        break;
      case 'div':
        this.div(operands[0]!);
        break;
      case 'cmp':
        this.cmp(operands[0]!, operands[1]!);
        break;
      case 'jmp':
        this.jmp(operands[0]!);
        break;
      case 'je':
        this.je(operands[0]!);
        break;
      case 'jne':
        this.jne(operands[0]!);
        break;
      case 'jl':
        this.jl(operands[0]!);
        break;
      case 'jle':
        this.jle(operands[0]!);
        break;
      case 'jg':
        this.jg(operands[0]!);
        break;
      case 'jge':
        this.jge(operands[0]!);
        break;
      case 'ret':
        this.ret();
        break;
      case 'setg':
        this.setg(operands[0]!);
        break;
      case 'setl':
        this.setl(operands[0]!);
        break;
      case 'sete':
        this.sete(operands[0]!);
        break;
      case 'setne':
        this.setne(operands[0]!);
        break;
      case 'setge':
        this.setge(operands[0]!);
        break;
      case 'setle':
        this.setle(operands[0]!);
        break;
      case 'si':
        this.si(operands[0]!);
        break;
      case 'li':
        this.li(operands[0]!);
        break;
      case 'and':
        this.and(operands[0]!, operands[1]!);
        break;
      case 'push':
        this.push(operands[0]!);
        break;
      case 'pop':
        this.pop(operands[0]!);
        break;
      case 'call':
        this.call(operands[0]!);
        break;
      default:
        throw new Error(`未知指令: ${opcode}`);
    }
  }

  // 指令实现（与 AssemblyVM 类似，但跳转使用地址）
  private mov(dest: string, src: string): void {
    const value = this.getValue(src);
    this.setValue(dest, value);
  }

  private add(dest: string, src: string): void {
    const destValue = this.getValue(dest);
    const srcValue = this.getValue(src);
    const result = destValue + srcValue;
    this.setValue(dest, result);
  }

  private sub(dest: string, src: string): void {
    const destValue = this.getValue(dest);
    const srcValue = this.getValue(src);
    const result = destValue - srcValue;
    this.setValue(dest, result);
  }

  private mul(operand: string): void {
    const value = this.getValue(operand);
    const ax = this.state.registers.get('ax')!;
    const result = ax * value;
    this.state.registers.set('ax', result);
  }

  private div(operand: string): void {
    const value = this.getValue(operand);
    if (value === 0) {
      throw new Error('Division by zero');
    }
    const ax = this.state.registers.get('ax')!;
    const result = Math.floor(ax / value);
    this.state.registers.set('ax', result);
  }

  private cmp(left: string, right: string): void {
    const leftValue = this.getValue(left);
    const rightValue = this.getValue(right);
    const result = leftValue - rightValue;
    this.updateFlags(result);
  }

  // 跳转指令：使用地址跳转（静态链接）
  private jmp(operand: string): void {
    // 静态链接：操作数必须是地址（数字）
    if (/^-?\d+$/.test(operand)) {
      const targetAddress = parseInt(operand, 10);
      this.state.pc = targetAddress;
    } else {
      // 调试信息：输出当前 PC 和指令信息
      const instructionIndex = this.addressToIndex.get(this.state.pc);
      const instruction = instructionIndex !== undefined ? this.instructions[instructionIndex] : null;
      const debugInfo = instruction 
        ? ` (PC: ${this.state.pc}, 指令: ${instruction.opcode} ${instruction.operands.join(' ')})`
        : ` (PC: ${this.state.pc})`;
      throw new Error(`无效的跳转地址: ${operand}${debugInfo}`);
    }
  }

  private je(operand: string): void {
    if (this.state.flags.equal) {
      this.jmp(operand);
    }
  }

  private jne(operand: string): void {
    if (!this.state.flags.equal) {
      this.jmp(operand);
    }
  }

  private jl(operand: string): void {
    if (this.state.flags.less) {
      this.jmp(operand);
    }
  }

  private jle(operand: string): void {
    if (this.state.flags.less || this.state.flags.equal) {
      this.jmp(operand);
    }
  }

  private jg(operand: string): void {
    if (this.state.flags.greater) {
      this.jmp(operand);
    }
  }

  private jge(operand: string): void {
    if (this.state.flags.greater || this.state.flags.equal) {
      this.jmp(operand);
    }
  }

  private ret(): void {
    const sp = this.state.registers.get('sp') || 1023;
    const returnAddress = this.state.stack.get(sp);
    
    if (returnAddress !== undefined) {
      // 从栈中弹出返回地址并跳转回去
      this.state.pc = returnAddress;
      this.state.registers.set('sp', sp + 1);
      this.state.stack.delete(sp);
    } else {
      // 栈为空，说明是主函数返回，程序结束
      this.state.halted = true;
    }
  }

  // call 指令：使用地址调用（静态链接）
  private call(operand: string): void {
    // 静态链接：操作数必须是地址（数字）
    if (!/^-?\d+$/.test(operand)) {
      throw new Error(`无效的函数调用地址: ${operand}`);
    }
    
    const targetAddress = parseInt(operand, 10);
    
    // 检查目标地址是否存在
    const targetIndex = this.addressToIndex.get(targetAddress);
    if (targetIndex === undefined) {
      throw new Error(`找不到地址 ${targetAddress} 的指令`);
    }
    
    // 保存返回地址到栈（当前指令执行完后，PC 会自动递增，所以返回地址是 PC + 1）
    const sp = this.state.registers.get('sp') || 1023;
    const returnAddress = this.getNextInstructionAddress();
    
    // 将返回地址压栈
    this.state.registers.set('sp', sp - 1);
    this.state.stack.set(sp - 1, returnAddress);
    
    // 跳转到目标地址
    this.state.pc = targetAddress;
  }

  // 获取下一条指令的地址
  private getNextInstructionAddress(): number {
    const currentIndex = this.addressToIndex.get(this.state.pc);
    if (currentIndex !== undefined && currentIndex + 1 < this.instructions.length) {
      return this.instructions[currentIndex + 1]!.address;
    }
    return this.state.pc + 1; // 默认返回当前地址 + 1
  }

  private setg(operand: string): void {
    const value = this.state.flags.greater ? 1 : 0;
    this.setValue(operand, value);
  }

  private setl(operand: string): void {
    const value = this.state.flags.less ? 1 : 0;
    this.setValue(operand, value);
  }

  private sete(operand: string): void {
    const value = this.state.flags.equal ? 1 : 0;
    this.setValue(operand, value);
  }

  private setne(operand: string): void {
    const value = !this.state.flags.equal ? 1 : 0;
    this.setValue(operand, value);
  }

  private setge(operand: string): void {
    const value = (this.state.flags.greater || this.state.flags.equal) ? 1 : 0;
    this.setValue(operand, value);
  }

  private setle(operand: string): void {
    const value = (this.state.flags.less || this.state.flags.equal) ? 1 : 0;
    this.setValue(operand, value);
  }

  private and(dest: string, src: string): void {
    const destValue = this.getValue(dest);
    const srcValue = this.getValue(src);
    const result = destValue & srcValue;
    this.setValue(dest, result);
  }

  private push(operand: string): void {
    const value = this.getValue(operand);
    const spValue = this.state.registers.get('sp') || 0;
    this.state.stack.set(spValue - 1, value);
    this.state.registers.set('sp', spValue - 1);
  }

  private pop(operand: string): void {
    const spValue = this.state.registers.get('sp') || 0;
    const value = this.state.stack.get(spValue) || 0;
    this.state.registers.set('sp', spValue + 1);
    this.setValue(operand, value);
  }

  private si(offset: string): void {
    const bpValue = this.state.registers.get('bp') || 0;
    const offsetValue = parseInt(offset, 10);
    const address = bpValue + offsetValue;
    const axValue = this.state.registers.get('ax') || 0;
    this.state.stack.set(address, axValue);
  }

  private li(offset: string): void {
    const bpValue = this.state.registers.get('bp') || 0;
    const offsetValue = parseInt(offset, 10);
    const address = bpValue + offsetValue;
    const value = this.state.stack.get(address) || 0;
    this.state.registers.set('ax', value);
  }

  // 辅助方法
  private getValue(operand: string): number {
    // 寄存器
    if (this.state.registers.has(operand)) {
      return this.state.registers.get(operand)!;
    }
    
    // 寄存器别名
    if (operand === 'al' || operand === 'ah' || operand === 'eax') {
      return this.state.registers.get('ax') || 0;
    }
    if (operand === 'ebx') {
      return this.state.registers.get('bx') || 0;
    }
    if (operand === 'esp') {
      return this.state.registers.get('sp') || 0;
    }
    if (operand === 'ebp') {
      return this.state.registers.get('bp') || 0;
    }

    // 栈访问 [offset]
    const stackMatch = operand.match(/^\[(\d+)\]$/);
    if (stackMatch) {
      const offset = parseInt(stackMatch[1]!, 10);
      return this.state.stack.get(offset) || 0;
    }

    // 立即数
    if (/^-?\d+$/.test(operand)) {
      return parseInt(operand, 10);
    }

    throw new Error(`无效的操作数: ${operand}`);
  }

  private setValue(operand: string, value: number): void {
    // 寄存器
    if (this.state.registers.has(operand)) {
      this.state.registers.set(operand, value);
      return;
    }
    
    // 寄存器别名
    if (operand === 'al' || operand === 'ah' || operand === 'eax') {
      this.state.registers.set('ax', value);
      return;
    }
    if (operand === 'ebx') {
      this.state.registers.set('bx', value);
      return;
    }
    if (operand === 'esp') {
      this.state.registers.set('sp', value);
      return;
    }
    if (operand === 'ebp') {
      this.state.registers.set('bp', value);
      return;
    }

    // 栈访问 [offset]
    const stackMatch = operand.match(/^\[(\d+)\]$/);
    if (stackMatch) {
      const offset = parseInt(stackMatch[1]!, 10);
      this.state.stack.set(offset, value);
      return;
    }

    throw new Error(`无效的操作数: ${operand}`);
  }

  private updateFlags(result: number): void {
    this.state.flags.equal = result === 0;
    this.state.flags.less = result < 0;
    this.state.flags.greater = result > 0;
  }

  private resetState(): void {
    this.state.registers.set('ax', 0);
    this.state.registers.set('bx', 0);
    this.state.registers.set('sp', 1023);
    this.state.registers.set('bp', 1023);
    this.state.memory.clear();
    this.state.stack.clear();
    this.state.flags = {
      greater: false,
      equal: false,
      less: false
    };
    this.state.pc = 0;
    this.state.halted = false;
    this.state.cycles = 0;
  }

  // 获取寄存器值
  getRegisterValue(register: string): number {
    return this.state.registers.get(register) || 0;
  }

  // 获取当前状态
  getState(): LinkedExecState {
    return { ...this.state };
  }

  // 获取指令地址（用于调试）
  getInstructionAddress(index: number): number | null {
    if (index >= 0 && index < this.instructions.length) {
      return this.instructions[index]!.address;
    }
    return null;
  }


  // 重置
  reset(): void {
    this.resetState();
    // 设置 PC 为第一条指令的地址
    if (this.instructions.length > 0) {
      this.state.pc = this.instructions[0]!.address;
    }
  }
}

