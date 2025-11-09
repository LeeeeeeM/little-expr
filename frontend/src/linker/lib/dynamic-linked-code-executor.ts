/**
 * 动态链接代码执行器（Dynamic Linked Code Executor）
 * 支持多段代码和动态链接
 * 
 * 特点：
 * - 支持多个代码段（每个库文件一个段）
 * - 段地址：1000 * N（N >= 1）
 * - 主程序段：段0（地址 0-999）
 * - 支持跨段调用和返回
 */

import type { LinkedExecState, LinkedInstruction } from './linked-code-executor';

export interface DynamicLinkedExecState extends LinkedExecState {
  currentSegment: number; // 当前执行的段索引（0 = 主程序，1+ = 库函数段）
}

export interface LibraryInfo {
  segmentIndex: number; // 段地址（1000 * N）
  codes: string[];      // 解析后的代码（链接后的代码）
  labelMap: Map<string, number>; // 标签到地址的映射（绝对地址）
  isLoaded: boolean;    // 段是否已加载到内存
}

export class DynamicLinkedCodeExecutor {
  private state: DynamicLinkedExecState;
  private segments: Map<number, LinkedInstruction[]> = new Map(); // 段索引 -> 指令列表
  private segmentAddressToIndex: Map<number, Map<number, number>> = new Map(); // 段索引 -> (地址 -> 指令索引)
  private libMap: Map<string, LibraryInfo> = new Map(); // 函数名 -> 库信息
  private nextSegmentIndex: number = 1; // 下一个可用的段索引（从1开始，对应段地址1000）
  private onSegmentLoaded?: (segmentIndex: number) => void; // 段加载回调

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
   * 参考后端 dynamic-link-runner.ts 的实现
   * @param linkedCode 链接后的代码（地址是相对地址，从0开始）
   * @param mainEntryAddress main 函数的入口地址（可选，如果提供则从该地址开始执行）
   */
  loadMainProgram(linkedCode: string, mainEntryAddress?: number): void {
    this.loadSegment(0, linkedCode, false); // 主程序地址是相对地址
    this.state.currentSegment = 0;
    
    // 如果提供了 main 入口地址，验证它是否存在；否则使用第一条指令的地址
    if (mainEntryAddress !== undefined) {
      // mainEntryAddress 是相对地址（从链接器输出的）
      // 验证该地址是否存在
      const addressToIndex = this.segmentAddressToIndex.get(0);
      if (addressToIndex && addressToIndex.has(mainEntryAddress)) {
        this.state.pc = mainEntryAddress;
      } else {
        // main 入口地址不存在，使用第一条指令的地址
        const instructions = this.segments.get(0);
        if (instructions && instructions.length > 0) {
          this.state.pc = instructions[0]!.address;
        } else {
          this.state.pc = 0;
        }
      }
    } else {
      // 如果没有提供入口地址，使用第一条指令的地址
      const instructions = this.segments.get(0);
      if (instructions && instructions.length > 0) {
        this.state.pc = instructions[0]!.address;
      } else {
        this.state.pc = 0;
      }
    }
  }

  /**
   * 加载代码到指定段
   */
  loadSegment(segmentIndex: number, linkedCode: string, addressesAreAbsolute: boolean = false): void {
    const instructions: LinkedInstruction[] = [];
    const addressToIndex = new Map<number, number>();

    const lines = linkedCode.split('\n');
    let instructionIndex = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('===')) {
        continue;
      }

      const addressMatch = trimmed.match(/^\[(\d+)\]\s+(.+)$/);
      if (!addressMatch) {
        continue;
      }

      const addressInCode = parseInt(addressMatch[1]!, 10);
      const instructionPart = addressMatch[2]!.trim();

      const commentIndex = instructionPart.indexOf(';');
      const codePart = commentIndex >= 0 
        ? instructionPart.slice(0, commentIndex).trim() 
        : instructionPart;

      if (!codePart) {
        continue;
      }

      const parts = codePart.split(/\s+/);
      const opcode = parts[0]!;
      const operands = parts.slice(1).map(op => op.replace(',', '').trim()).filter(op => op);

      // 计算绝对地址
      // 对于段0（主程序），绝对地址就是相对地址本身（0 * 1000 + addressInCode = addressInCode）
      // 对于段1+（库文件），绝对地址是段地址 + 相对地址
      const absoluteAddress = addressesAreAbsolute 
        ? addressInCode 
        : segmentIndex * 1000 + addressInCode;

      instructions.push({
        address: absoluteAddress,
        opcode,
        operands,
        originalLine: line
      });

      // 存储绝对地址到索引的映射
      addressToIndex.set(absoluteAddress, instructionIndex);
      instructionIndex++;
    }

    this.segments.set(segmentIndex, instructions);
    this.segmentAddressToIndex.set(segmentIndex, addressToIndex);
  }

  /**
   * 注册库函数到 libMap
   */
  registerLibraryFunction(functionName: string, libraryInfo: LibraryInfo): void {
    // 确保 isLoaded 字段存在
    this.libMap.set(functionName, {
      ...libraryInfo,
      isLoaded: libraryInfo.isLoaded ?? false
    });
  }

  /**
   * 获取下一个可用的段索引
   */
  getNextSegmentIndex(): number {
    return this.nextSegmentIndex++;
  }

  /**
   * 设置段加载回调
   */
  setOnSegmentLoaded(callback: (segmentIndex: number) => void): void {
    this.onSegmentLoaded = callback;
  }

  /**
   * 动态加载段（如果尚未加载）
   */
  private ensureSegmentLoaded(segmentIndex: number, linkedCode: string): void {
    if (this.segments.has(segmentIndex)) {
      return; // 段已加载
    }

    // 加载段
    this.loadSegment(segmentIndex, linkedCode, true);
    
    // 通知段已加载
    if (this.onSegmentLoaded) {
      this.onSegmentLoaded(segmentIndex);
    }
  }

  /**
   * 单步执行
   */
  step(): { success: boolean; output: string; state: DynamicLinkedExecState; currentAddress: number | null } {
    if (this.state.halted || this.state.pc < 0) {
      return {
        success: true,
        output: '',
        state: this.getState(),
        currentAddress: null
      };
    }

    const segmentIndex = Math.floor(this.state.pc / 1000);
    const instructions = this.segments.get(segmentIndex);
    if (!instructions) {
      return {
        success: false,
        output: `找不到段 ${segmentIndex} 的代码`,
        state: this.getState(),
        currentAddress: null
      };
    }

    const addressToIndex = this.segmentAddressToIndex.get(segmentIndex);
    if (!addressToIndex) {
      return {
        success: false,
        output: `找不到段 ${segmentIndex} 的地址映射`,
        state: this.getState(),
        currentAddress: null
      };
    }

    const instructionIndex = addressToIndex.get(this.state.pc);
    if (instructionIndex === undefined) {
      return {
        success: false,
        output: `找不到地址 ${this.state.pc} 的指令`,
        state: this.getState(),
        currentAddress: null
      };
    }

    try {
      const instruction = instructions[instructionIndex]!;
      const oldPc = this.state.pc;
      const oldSegment = this.state.currentSegment;
      
      // 执行指令（可能会修改 PC，比如跳转、call、ret）
      this.executeInstruction(instruction);
      this.state.cycles++;

      // 更新当前段（如果指令改变了 PC）
      this.state.currentSegment = Math.floor(this.state.pc / 1000);

      // 如果 PC 没有改变（没有跳转、call、ret），则递增到下一个地址
      if (!this.state.halted && this.state.pc === oldPc && this.state.currentSegment === oldSegment) {
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
        state: this.getState(),
        currentAddress: instruction.address
      };
    } catch (error) {
      return {
        success: false,
        output: `执行错误: ${error}`,
        state: this.getState(),
        currentAddress: null
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
          this.mul('eax', operands[0]!);
        }
        break;
      case 'div':
        if (operands.length === 2) {
          this.div(operands[0]!, operands[1]!);
        } else {
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
        this.call(operands[0]!);
        break;
      default:
        throw new Error(`未知指令: ${opcode}`);
    }
  }

  // 指令实现（复用 LinkedCodeExecutor 的逻辑）
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

  private jmp(operand: string): void {
    if (/^-?\d+$/.test(operand)) {
      let targetAddress = parseInt(operand, 10);
      const currentSegmentIndex = this.state.currentSegment;
      if (targetAddress < 1000 && currentSegmentIndex > 0) {
        targetAddress = currentSegmentIndex * 1000 + targetAddress;
      }
      this.state.pc = targetAddress;
      this.state.currentSegment = Math.floor(targetAddress / 1000);
    } else {
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
    
    if (returnAddress !== undefined) {
      const segmentIndex = Math.floor(returnAddress / 1000);
      if (!this.segments.has(segmentIndex)) {
        throw new Error(`返回地址 ${returnAddress} 指向不存在的段 ${segmentIndex}`);
      }
      this.state.pc = returnAddress;
      this.state.currentSegment = segmentIndex;
      this.state.registers.set('sp', sp + 1);
      this.state.stack.delete(sp);
    } else {
      this.state.halted = true;
    }
  }

  private call(operand: string): void {
    let targetAddress: number;
    let targetSegment: number;
    let libInfo: LibraryInfo | undefined;
    
    if (/^-?\d+$/.test(operand)) {
      targetAddress = parseInt(operand, 10);
      targetSegment = Math.floor(targetAddress / 1000);
      
      if (!this.segments.has(targetSegment)) {
        throw new Error(`调用地址 ${targetAddress} 指向不存在的段 ${targetSegment}`);
      }
    } else {
      // 动态链接：从 libMap 查找
      libInfo = this.libMap.get(operand);
      if (!libInfo) {
        throw new Error(`未找到函数 ${operand}，需要先加载到 libMap`);
      }
      
      const functionEntryAddress = libInfo.labelMap.get(operand);
      if (functionEntryAddress === undefined) {
        throw new Error(`函数 ${operand} 在 libMap 中没有入口地址`);
      }
      
      targetAddress = functionEntryAddress;
      targetSegment = libInfo.segmentIndex / 1000;
      
      // 如果段尚未加载，动态加载它
      if (!libInfo.isLoaded) {
        // 将相对地址转换为绝对地址
        const lines = libInfo.codes;
        const convertedLines = lines.map(line => {
          const addressMatch = line.match(/^\[(\d+)\]/);
          if (addressMatch) {
            const relativeAddr = parseInt(addressMatch[1]!, 10);
            const absoluteAddr = targetSegment * 1000 + relativeAddr;
            return line.replace(/^\[\d+\]/, `[${absoluteAddr}]`);
          }
          return line;
        });
        const convertedCode = convertedLines.join('\n');
        
        this.ensureSegmentLoaded(targetSegment, convertedCode);
        
        // 标记为已加载
        libInfo.isLoaded = true;
      }
    }
    
    const addressToIndex = this.segmentAddressToIndex.get(targetSegment);
    if (!addressToIndex || addressToIndex.get(targetAddress) === undefined) {
      throw new Error(`找不到地址 ${targetAddress} 的指令`);
    }
    
    const sp = this.state.registers.get('sp') || 1023;
    const returnAddress = this.getNextInstructionAddress();
    
    this.state.registers.set('sp', sp - 1);
    this.state.stack.set(sp - 1, returnAddress);
    
    this.state.pc = targetAddress;
    this.state.currentSegment = targetSegment;
  }

  private getNextInstructionAddress(): number {
    const segmentIndex = this.state.currentSegment;
    const instructions = this.segments.get(segmentIndex);
    const addressToIndex = this.segmentAddressToIndex.get(segmentIndex);
    
    if (instructions && addressToIndex) {
      const currentIndex = addressToIndex.get(this.state.pc);
      if (currentIndex !== undefined && currentIndex + 1 < instructions.length) {
        return instructions[currentIndex + 1]!.address;
      }
    }
    return this.state.pc + 1;
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

  private getValue(operand: string): number {
    if (this.state.registers.has(operand)) {
      return this.state.registers.get(operand)!;
    }
    
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

    const stackMatch = operand.match(/^\[(\d+)\]$/);
    if (stackMatch) {
      const offset = parseInt(stackMatch[1]!, 10);
      return this.state.stack.get(offset) || 0;
    }

    if (/^-?\d+$/.test(operand)) {
      return parseInt(operand, 10);
    }

    throw new Error(`无效的操作数: ${operand}`);
  }

  private setValue(operand: string, value: number): void {
    if (this.state.registers.has(operand)) {
      this.state.registers.set(operand, value);
      return;
    }
    
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

  getState(): DynamicLinkedExecState {
    // 深拷贝状态，确保 Map 对象也被复制
    return {
      registers: new Map(this.state.registers),
      memory: new Map(this.state.memory),
      stack: new Map(this.state.stack),
      flags: { ...this.state.flags },
      pc: this.state.pc,
      halted: this.state.halted,
      cycles: this.state.cycles,
      currentSegment: this.state.currentSegment,
    };
  }

  reset(): void {
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
    this.state.currentSegment = 0;
    
    // 重置到第一条指令
    const mainInstructions = this.segments.get(0);
    if (mainInstructions && mainInstructions.length > 0) {
      this.state.pc = mainInstructions[0]!.address;
    }
  }
}

