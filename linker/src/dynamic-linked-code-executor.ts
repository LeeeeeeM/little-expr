/**
 * 动态链接代码执行器（Dynamic Linked Code Executor）
 * 支持多段代码和动态链接
 * 
 * 特点：
 * - 支持多个代码段（每个库文件一个段）
 * - 段地址：1000 * N（N >= 1）
 * - 主程序段：段0（地址 0-999）
 * - 动态加载函数到 libMap
 * - 支持跨段调用和返回
 */

import type { LinkedExecState, LinkedInstruction } from './linked-code-executor';

export interface LibraryInfo {
  segmentIndex: number; // 段地址（1000 * N）
  codes: string[];      // 解析后的代码（链接后的代码）
  labelMap: Map<string, number>; // 标签到地址的映射（相对于段起始地址）
}

export interface DynamicLinkedExecState extends LinkedExecState {
  currentSegment: number; // 当前执行的段索引（0 = 主程序，1+ = 库函数段）
}

export class DynamicLinkedCodeExecutor {
  private state: DynamicLinkedExecState;
  private segments: Map<number, LinkedInstruction[]> = new Map(); // 段索引 -> 指令列表
  private segmentAddressToIndex: Map<number, Map<number, number>> = new Map(); // 段索引 -> (地址 -> 指令索引)
  private libMap: Map<string, LibraryInfo> = new Map(); // 函数名 -> 库信息
  private nextSegmentIndex: number = 1; // 下一个可用的段索引（从1开始，对应段地址1000）

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
      cycles: 0,
      currentSegment: 0 // 初始在主程序段
    };
  }

  /**
   * 加载主程序代码（段0）
   * @param linkedCode 链接后的代码（地址是相对地址，从0开始）
   * @param mainEntryAddress main 函数的入口地址（可选，如果提供则从该地址开始执行）
   */
  loadMainProgram(linkedCode: string, mainEntryAddress?: number): void {
    this.loadSegment(0, linkedCode, false); // 主程序地址是相对地址
    this.state.currentSegment = 0;
    // 如果提供了 main 入口地址，使用它；否则从地址 0 开始
    this.state.pc = mainEntryAddress !== undefined ? mainEntryAddress : 0;
  }

  /**
   * 加载代码到指定段
   * @param segmentIndex 段索引（0 = 主程序，1+ = 库函数）
   * @param linkedCode 链接后的代码（地址可以是相对地址或绝对地址）
   * @param addressesAreAbsolute 地址是否已经是绝对地址（默认 false，表示相对地址）
   */
  loadSegment(segmentIndex: number, linkedCode: string, addressesAreAbsolute: boolean = false): void {
    const instructions: LinkedInstruction[] = [];
    const addressToIndex = new Map<number, number>();

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

      const addressInCode = parseInt(addressMatch[1]!, 10);
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

      // 计算绝对地址
      // 如果地址已经是绝对地址，直接使用；否则加上段地址
      const absoluteAddress = addressesAreAbsolute 
        ? addressInCode 
        : segmentIndex * 1000 + addressInCode;

      instructions.push({
        address: absoluteAddress,
        opcode,
        operands,
        originalLine: line
      });

      // 建立地址到索引的映射
      addressToIndex.set(absoluteAddress, instructionIndex);
      
      instructionIndex++;
    }

    this.segments.set(segmentIndex, instructions);
    this.segmentAddressToIndex.set(segmentIndex, addressToIndex);
  }

  /**
   * 注册库函数到 libMap
   */
  registerLibraryFunction(functionName: string, info: LibraryInfo): void {
    this.libMap.set(functionName, info);
  }

  /**
   * 获取库函数信息
   */
  getLibraryFunction(functionName: string): LibraryInfo | undefined {
    return this.libMap.get(functionName);
  }

  /**
   * 获取下一个可用的段索引
   */
  getNextSegmentIndex(): number {
    return this.nextSegmentIndex++;
  }

  /**
   * 单步执行
   */
  step(): { success: boolean; output: string; state: DynamicLinkedExecState; currentAddress: number | null } {
    if (this.state.halted || this.state.pc < 0) {
      return {
        success: true,
        output: '',
        state: this.state,
        currentAddress: null
      };
    }

    // 计算当前段索引
    const segmentIndex = Math.floor(this.state.pc / 1000);
    const relativeAddress = this.state.pc % 1000;

    // 获取当前段的指令列表
    const instructions = this.segments.get(segmentIndex);
    if (!instructions) {
      return {
        success: false,
        output: `找不到段 ${segmentIndex} 的代码`,
        state: this.state,
        currentAddress: null
      };
    }

    // 获取地址到索引的映射
    const addressToIndex = this.segmentAddressToIndex.get(segmentIndex);
    if (!addressToIndex) {
      return {
        success: false,
        output: `找不到段 ${segmentIndex} 的地址映射`,
        state: this.state,
        currentAddress: null
      };
    }

    // 找到当前地址对应的指令索引
    const instructionIndex = addressToIndex.get(this.state.pc);
    
    if (instructionIndex === undefined) {
      return {
        success: false,
        output: `找不到地址 ${this.state.pc} (段 ${segmentIndex}, 偏移 ${relativeAddress}) 的指令`,
        state: this.state,
        currentAddress: null
      };
    }

    try {
      const instruction = instructions[instructionIndex]!;
      const oldPc = this.state.pc;
      const oldSegment = this.state.currentSegment;
      
      
      this.executeInstruction(instruction);
      this.state.cycles++;

      // 更新当前段（如果指令改变了 PC）
      this.state.currentSegment = Math.floor(this.state.pc / 1000);

      // 如果 pc 没有改变（没有跳转），则递增到下一个地址
      if (!this.state.halted && this.state.pc === oldPc && this.state.currentSegment === oldSegment) {
        // 找到下一个指令的地址
        const nextIndex = instructionIndex + 1;
        if (nextIndex < instructions.length) {
          const nextAddress = instructions[nextIndex]!.address;
          this.state.pc = nextAddress;
          this.state.currentSegment = Math.floor(this.state.pc / 1000);
        } else {
          // 没有下一条指令，程序应该结束
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
  run(): { success: boolean; output: string; state: DynamicLinkedExecState } {
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
        if (operands.length === 2) {
          this.mul(operands[0]!, operands[1]!);
        } else {
          // 向后兼容：单个操作数的情况
          this.mul('eax', operands[0]!);
        }
        break;
      case 'div':
        if (operands.length === 2) {
          this.div(operands[0]!, operands[1]!);
        } else {
          // 向后兼容：单个操作数的情况
          this.div('eax', operands[0]!);
        }
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
        // call 指令需要特殊处理，因为可能是动态链接
        // 这里先尝试调用，如果失败会抛出异常，由外部处理
        this.call(operands[0]!);
        break;
      default:
        throw new Error(`未知指令: ${opcode}`);
    }
  }

  // 指令实现
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

  private mul(dest: string, src: string): void {
    const destValue = this.getValue(dest);
    const srcValue = this.getValue(src);
    const result = destValue * srcValue;
    this.setValue(dest, result);
  }

  private div(dest: string, src: string): void {
    const destValue = this.getValue(dest);
    const srcValue = this.getValue(src);
    if (srcValue === 0) {
      throw new Error('Division by zero');
    }
    const result = Math.floor(destValue / srcValue);
    this.setValue(dest, result);
  }

  private cmp(left: string, right: string): void {
    const leftValue = this.getValue(left);
    const rightValue = this.getValue(right);
    const result = leftValue - rightValue;
    this.updateFlags(result);
  }

  // 跳转指令：支持地址或符号名（动态链接）
  private jmp(operand: string): void {
    // 如果是数字，可能是相对地址或绝对地址
    if (/^-?\d+$/.test(operand)) {
      let targetAddress = parseInt(operand, 10);
      
      // 如果目标地址小于 1000，可能是相对地址，需要转换为当前段的绝对地址
      const currentSegmentIndex = this.state.currentSegment;
      if (targetAddress < 1000 && currentSegmentIndex > 0) {
        // 这是相对地址，需要转换为绝对地址
        targetAddress = currentSegmentIndex * 1000 + targetAddress;
      }
      
      this.state.pc = targetAddress;
      this.state.currentSegment = Math.floor(targetAddress / 1000);
    } else {
      // 符号名不支持在 jmp 中使用（应该是 call）
      throw new Error(`无效的跳转地址: ${operand}`);
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
    const currentSegment = this.state.currentSegment;
    
    if (returnAddress !== undefined && returnAddress !== null) {
      // 先弹出栈（恢复 sp）
      this.state.registers.set('sp', sp + 1);
      this.state.stack.delete(sp);
      
      // 从栈中弹出返回地址并跳转回去
      // 返回地址是绝对地址，需要计算段索引和偏移
      const segmentIndex = Math.floor(returnAddress / 1000);
      
      // 验证段是否存在
      if (!this.segments.has(segmentIndex)) {
        throw new Error(`返回地址 ${returnAddress} 指向不存在的段 ${segmentIndex}`);
      }
      
      // 验证返回地址是否有效
      const addressToIndex = this.segmentAddressToIndex.get(segmentIndex);
      if (!addressToIndex || addressToIndex.get(returnAddress) === undefined) {
        throw new Error(`返回地址 ${returnAddress} 在段 ${segmentIndex} 中不存在`);
      }
      
      // 日志：跨段返回
      if (currentSegment !== segmentIndex) {
        console.log(`↩️  [段 ${currentSegment} → 段 ${segmentIndex}] 返回，地址: ${returnAddress}`);
      }
      
      this.state.pc = returnAddress;
      this.state.currentSegment = segmentIndex;
    } else {
      // 栈为空或者返回地址无效，说明是主函数返回，程序结束
      this.state.halted = true;
    }
  }

  // call 指令：支持地址或符号名（动态链接）
  // 注意：如果是符号名，需要外部先调用 loadLibraryFunction 加载到 libMap
  call(operand: string): void {
    // 先获取返回地址（在跳转之前）
    const sp = this.state.registers.get('sp') || 1023;
    const returnAddress = this.getNextInstructionAddress();
    const currentSegment = this.state.currentSegment;
    
    let targetAddress: number;
    let targetSegment: number;
    let isFromLibMap = false;
    
    // 如果是数字，直接使用地址（静态链接或同段调用）
    if (/^-?\d+$/.test(operand)) {
      targetAddress = parseInt(operand, 10);
      targetSegment = Math.floor(targetAddress / 1000);
      
      // 验证段是否存在
      if (!this.segments.has(targetSegment)) {
        throw new Error(`调用地址 ${targetAddress} 指向不存在的段 ${targetSegment}`);
      }
    } else {
      // 如果是符号名，从 libMap 查找（动态链接）
      const libInfo = this.libMap.get(operand);
      if (!libInfo) {
        throw new Error(`未找到函数 ${operand}，需要先加载到 libMap`);
      }
      
      isFromLibMap = true;
      
      // 获取函数入口地址（绝对地址）
      const functionEntryAddress = libInfo.labelMap.get(operand);
      if (functionEntryAddress === undefined) {
        throw new Error(`函数 ${operand} 在 libMap 中没有入口地址`);
      }
      
      targetAddress = functionEntryAddress;
      targetSegment = libInfo.segmentIndex / 1000; // segmentIndex 是段地址，需要除以1000得到段索引
    }
    
    // 检查目标地址是否存在
    const addressToIndex = this.segmentAddressToIndex.get(targetSegment);
    if (!addressToIndex || addressToIndex.get(targetAddress) === undefined) {
      throw new Error(`找不到地址 ${targetAddress} 的指令`);
    }
    
    // 日志：跨段调用
    if (currentSegment !== targetSegment) {
      if (isFromLibMap) {
        console.log(`🔗 [段 ${currentSegment} → 段 ${targetSegment}] 调用库函数: ${operand} (从 libMap 获取，地址: ${targetAddress})`);
      } else {
        console.log(`🔗 [段 ${currentSegment} → 段 ${targetSegment}] 跨段调用: 地址 ${targetAddress}`);
      }
    } else if (isFromLibMap) {
      console.log(`🔗 [段 ${currentSegment}] 调用库函数: ${operand} (从 libMap 获取，地址: ${targetAddress})`);
    }
    
    // 将返回地址压栈
    this.state.registers.set('sp', sp - 1);
    this.state.stack.set(sp - 1, returnAddress);
    
    // 跳转到目标地址
    this.state.pc = targetAddress;
    this.state.currentSegment = targetSegment;
  }

  // 获取下一条指令的地址
  private getNextInstructionAddress(): number {
    const segmentIndex = this.state.currentSegment;
    const addressToIndex = this.segmentAddressToIndex.get(segmentIndex);
    if (!addressToIndex) {
      return this.state.pc + 1; // 默认返回当前地址 + 1
    }
    
    const currentIndex = addressToIndex.get(this.state.pc);
    if (currentIndex !== undefined) {
      const instructions = this.segments.get(segmentIndex);
      if (instructions && currentIndex + 1 < instructions.length) {
        return instructions[currentIndex + 1]!.address;
      }
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
    this.state.currentSegment = 0;
    this.state.halted = false;
    this.state.cycles = 0;
  }

  // 获取寄存器值
  getRegisterValue(register: string): number {
    return this.state.registers.get(register) || 0;
  }

  // 获取当前状态
  getState(): DynamicLinkedExecState {
    return { ...this.state };
  }

  // 获取 libMap
  getLibMap(): Map<string, LibraryInfo> {
    return new Map(this.libMap);
  }
}

