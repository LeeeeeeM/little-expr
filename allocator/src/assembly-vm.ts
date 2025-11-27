// 汇编虚拟机 - 运行 x86-64 汇编代码
// 这是一个简化的虚拟机，支持基本的 x86-64 指令

import { Allocator } from './allocator';

export interface VMState {
  registers: Map<string, number>;
  memory: Map<number, number>;
  stack: Map<number, number>; // 改为 Map 以支持任意偏移
  flags: {
    greater: boolean;
    equal: boolean;
    less: boolean;
  };
  pc: number; // 程序计数器
  halted: boolean;
  cycles: number; // 执行周期计数
}

export interface VMInstruction {
  opcode: string;
  operands: string[];
  line: number;
}

export class AssemblyVM {
  private state: VMState;
  private instructions: VMInstruction[] = [];
  private labels: Map<string, number> = new Map();
  private output: string[] = [];
  private allocator: Allocator;

  constructor() {
    this.state = {
      registers: new Map([
        ['ax', 0], ['bx', 0], ['sp', 1023], ['bp', 1023]
      ]),
      memory: new Map(),
      stack: new Map(), // 改为 Map
      flags: {
        greater: false,
        equal: false,
        less: false
      },
      pc: 0,
      halted: false,
      cycles: 0
    };
    
    // 初始化分配器
    this.allocator = new Allocator(this, HEAP_START);
    this.allocator.init();
  }

  // 加载汇编代码
  loadAssembly(assembly: string): void {
    this.instructions = [];
    this.labels.clear();
    this.output = [];
    this.resetState();

    const lines = assembly.split('\n');
    let instructionIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line || line.startsWith(';')) continue;

      // 检查是否是标签
      if (line.endsWith(':')) {
        const labelName = line.slice(0, -1).trim();
        // 标签指向下一个指令（标签本身不占用指令索引）
        this.labels.set(labelName, instructionIndex);
        continue;
      }

      // 解析指令
      const parts = line.split(/\s+/);
      const opcode = parts[0]!;
      const operands = parts.slice(1).map(op => op.replace(',', ''));

      this.instructions.push({
        opcode,
        operands,
        line: i + 1
      });

      instructionIndex++;
    }
    
    // 设置程序入口点为 main 函数（如果存在）
    // 优先查找 main_entry_block，如果没有则查找 main
    const mainEntryBlock = this.labels.get('main_entry_block');
    if (mainEntryBlock !== undefined) {
      this.state.pc = mainEntryBlock;
    } else {
      const mainLabel = this.labels.get('main');
      if (mainLabel !== undefined) {
        this.state.pc = mainLabel;
      } else {
        // 默认从第一条指令开始
        this.state.pc = 0;
      }
    }
  }

  // 运行虚拟机
  run(): { success: boolean; output: string; state: VMState } {
    const MAX_CYCLES = 5000; // 最大执行周期
    
    try {
      while (!this.state.halted && this.state.pc < this.instructions.length && this.state.cycles < MAX_CYCLES) {
        const instruction = this.instructions[this.state.pc]!;
        const oldPc = this.state.pc;
        this.executeInstruction(instruction);
        
        // 增加执行周期计数
        this.state.cycles++;
        
        // 只有在 pc 没有改变的情况下才递增（避免跳转指令后重复递增）
        if (!this.state.halted && this.state.pc === oldPc) {
          this.state.pc++;
        }
      }

      // 检查是否因为周期限制而停止
      if (this.state.cycles >= MAX_CYCLES) {
        return {
          success: false,
          output: `VM Error: Maximum cycles (${MAX_CYCLES}) exceeded. Possible infinite loop.`,
          state: this.state
        };
      }

      return {
        success: true,
        output: this.output.join('\n'),
        state: this.state
      };
    } catch (error) {
      return {
        success: false,
        output: `VM Error: ${error}`,
        state: this.state
      };
    }
  }

  // 执行单条指令
  private executeInstruction(instruction: VMInstruction): void {
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
      case 'power':
        if (operands.length === 2) {
          this.power(operands[0]!, operands[1]!);
        } else {
          throw new Error('power instruction requires 2 operands');
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
      case 'lir':
        this.lir(operands[0]!);
        break;
      case 'sir':
        this.sir(operands[0]!);
        break;
      case 'lea':
        this.lea(operands[0]!);
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
      case 'alloc':
        this.alloc();
        break;
      case 'free':
        this.free();
        break;
      default:
        throw new Error(`Unknown instruction: ${opcode}`);
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
    this.updateFlags(result);
  }

  private sub(dest: string, src: string): void {
    const destValue = this.getValue(dest);
    const srcValue = this.getValue(src);
    const result = destValue - srcValue;
    this.setValue(dest, result);
    this.updateFlags(result);
  }

  private mul(dest: string, src: string): void {
    const destValue = this.getValue(dest);
    const srcValue = this.getValue(src);
    const result = destValue * srcValue;
    this.setValue(dest, result);
    this.updateFlags(result);
  }

  private div(dest: string, src: string): void {
    const destValue = this.getValue(dest);
    const srcValue = this.getValue(src);
    if (srcValue === 0) {
      throw new Error('Division by zero');
    }
    const result = Math.floor(destValue / srcValue);
    this.setValue(dest, result);
    this.updateFlags(result);
  }

  private power(dest: string, src: string): void {
    const base = this.getValue(dest);
    const exponent = this.getValue(src);
    // 计算 base ** exponent
    const result = Math.pow(base, exponent);
    this.setValue(dest, result);
    this.updateFlags(result);
  }

  private cmp(left: string, right: string): void {
    const leftValue = this.getValue(left);
    const rightValue = this.getValue(right);
    const result = leftValue - rightValue;
    this.updateFlags(result);
  }

  private jmp(label: string): void {
    const target = this.labels.get(label);
    if (target === undefined) {
      throw new Error(`Label not found: ${label}`);
    }
    this.state.pc = target;
  }

  private je(label: string): void {
    if (this.state.flags.equal) {
      this.jmp(label);
    }
  }

  private jne(label: string): void {
    if (!this.state.flags.equal) {
      this.jmp(label);
    }
  }

  private jl(label: string): void {
    if (this.state.flags.less) {
      this.jmp(label);
    }
  }

  private jle(label: string): void {
    if (this.state.flags.less || this.state.flags.equal) {
      this.jmp(label);
    }
  }

  private jg(label: string): void {
    if (this.state.flags.greater) {
      this.jmp(label);
    }
  }

  private jge(label: string): void {
    if (this.state.flags.greater || this.state.flags.equal) {
      this.jmp(label);
    }
  }

  private ret(): void {
    // 如果调用栈不为空，从栈恢复返回地址
    // 注意：如果函数返回前执行了 pop ebp，bp 已经被恢复
    // 返回地址存储在 sp 位置（因为 pop ebp 后，sp 指向返回地址）
    const sp = this.state.registers.get('sp') || 1023;
    const returnAddress = this.state.stack.get(sp);
    
    console.log(`DEBUG: ret - sp: ${sp}, returnAddress from stack[${sp}]: ${returnAddress}, current PC: ${this.state.pc}`);
    
    if (returnAddress !== undefined) {
      // 恢复返回地址
      console.log(`DEBUG: ret - returning to address ${returnAddress}, current PC: ${this.state.pc}`);
      this.state.pc = returnAddress;
      // 弹出返回地址
      this.state.registers.set('sp', sp + 1);
      this.state.stack.delete(sp);
      console.log(`DEBUG: ret - restored PC to ${returnAddress}, sp to ${sp + 1}`);
    } else {
      // 没有调用栈，说明是 main 函数返回，结束程序
      console.log(`DEBUG: ret - main function returning, halting`);
      this.state.halted = true;
    }
  }
  
  private call(label: string): void {
    // 获取目标地址
    const target = this.labels.get(label);
    if (target === undefined) {
      throw new Error(`Label not found: ${label}`);
    }
    
    // 保存返回地址到栈（当前指令执行完后，PC 会自动递增，所以返回地址是 PC + 1）
    // 但由于 call 会立即跳转，我们需要考虑 PC 的递增逻辑
    const sp = this.state.registers.get('sp') || 1023;
    // 返回地址：当前 PC + 1（因为 call 执行后，如果没有跳转，PC 会递增到下一指令）
    // 但由于我们会立即跳转，所以返回地址就是下一指令的索引
    const returnAddress = this.state.pc + 1;
    
    console.log(`DEBUG: call ${label} - current PC: ${this.state.pc}, return address: ${returnAddress}, target: ${target}`);
    
    // 将返回地址压栈
    this.state.registers.set('sp', sp - 1);
    this.state.stack.set(sp - 1, returnAddress);
    
    // 跳转到目标函数（不递增 PC，因为我们已经跳转了）
    this.state.pc = target;
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
    this.updateFlags(result);
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

  // si offset: 将 ax 的值存储到 bp + offset 位置
  private si(offset: string): void {
    const bpValue = this.state.registers.get('bp') || 0;
    const offsetValue = parseInt(offset, 10);
    const address = bpValue + offsetValue;
    const axValue = this.state.registers.get('ax') || 0;
    
    console.log(`DEBUG: si ${offset} - storing ax(${axValue}) to bp(${bpValue}) + ${offsetValue} = ${address}`);
    this.state.stack.set(address, axValue);
  }

  // li offset: 从 bp + offset 位置加载值到 ax
  private li(offset: string): void {
    const bpValue = this.state.registers.get('bp') || 0;
    const offsetValue = parseInt(offset, 10);
    const address = bpValue + offsetValue;
    const value = this.state.stack.get(address) || 0;
    
    console.log(`DEBUG: li ${offset} - loading from bp(${bpValue}) + ${offsetValue} = ${address}, value = ${value}`);
    this.state.registers.set('ax', value);
  }

  // lir reg: 从 reg 寄存器中存储的地址读取值到 ax（间接寻址）
  private lir(reg: string): void {
    // 使用 getValue 支持寄存器别名（如 ebx -> bx）
    const address = this.getValue(reg);
    const value = this.state.stack.get(address) || 0;
    console.log(`DEBUG: lir ${reg} - loading from address ${address}, value = ${value}`);
    this.state.registers.set('ax', value);
  }

  // sir reg: 将 ax 的值写入 reg 寄存器中存储的地址（间接寻址）
  private sir(reg: string): void {
    // 使用 getValue 支持寄存器别名（如 ebx -> bx）
    const address = this.getValue(reg);
    const axValue = this.state.registers.get('ax') || 0;
    console.log(`DEBUG: sir ${reg} - storing ax(${axValue}) to address ${address}`);
    this.state.stack.set(address, axValue);
  }

  // lea offset: 计算 bp + offset 的地址值，存储到 ax（不读取内容）
  private lea(offset: string): void {
    const bpValue = this.state.registers.get('bp') || 0;
    const offsetValue = parseInt(offset, 10);
    const address = bpValue + offsetValue;
    this.state.registers.set('ax', address);
  }

  // alloc: 分配堆内存，从 eax 读取 size，返回地址到 eax
  private alloc(): void {
    const size = this.state.registers.get('ax') || 0;
    const ptr = this.allocator.alloc(size);
    console.log(`DEBUG: alloc(${size}) -> ${ptr}`);
    this.state.registers.set('ax', ptr);
  }

  // free: 释放堆内存，从 eax 读取 ptr
  private free(): void {
    const ptr = this.state.registers.get('ax') || 0;
    console.log(`DEBUG: free(${ptr})`);
    this.allocator.free(ptr);
  }

  // 辅助方法
  private getValue(operand: string): number {
    // 寄存器（包括 al, eax 等）
    if (this.state.registers.has(operand)) {
      return this.state.registers.get(operand)!;
    }
    
    // 支持寄存器别名：al/ah/eax -> ax, ebx -> bx, esp -> sp, ebp -> bp
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

    throw new Error(`Invalid operand: ${operand}`);
  }

  private setValue(operand: string, value: number): void {
    // 寄存器（包括 al, eax 等）
    if (this.state.registers.has(operand)) {
      this.state.registers.set(operand, value);
      return;
    }
    
    // 支持寄存器别名：al/ah/eax -> ax, ebx -> bx, esp -> sp, ebp -> bp
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

    throw new Error(`Invalid operand: ${operand}`);
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
    this.state.stack.clear(); // 改为 clear() 而不是重新赋值
    this.state.flags = {
      greater: false,
      equal: false,
      less: false
    };
    this.state.pc = 0;
    this.state.halted = false;
    this.state.cycles = 0;
    
    // Re-initialize allocator after clearing memory
    this.allocator.init();
  }

  // 获取寄存器值（用于调试）
  getRegisterValue(register: string): number {
    return this.state.registers.get(register) || 0;
  }

  // 获取内存值（用于调试）
  getMemoryValue(address: number): number {
    return this.state.memory.get(address) || 0;
  }

  // 获取当前状态（用于调试）
  getState(): VMState {
    return { ...this.state };
  }

  // 暴露给 Allocator 使用的内存访问接口
  // 注意：在实际硬件中，内存是通过总线访问的，这里直接暴露方法模拟
  public writeMemory(address: number, value: number): void {
    this.state.memory.set(address, value);
  }

  public readMemory(address: number): number {
    return this.state.memory.get(address) || 0;
  }
}

export const HEAP_START = 4096;
