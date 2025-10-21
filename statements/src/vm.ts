// 虚拟机实现 - 执行step3.txt格式的汇编代码
// 支持指令：LI, SI, PRT, add, call, cmp, exit, imul, jg, jl, jle, jmp, mov, pop, push, ret, sub

interface VMState {
  // 寄存器
  eax: number;
  ebx: number;
  ebp: number;  // 基指针
  esp: number;  // 栈指针
  pc: number;   // 程序计数器
  
  // 栈
  stack: Int32Array;
  
  // 标志位
  flags: {
    greater: boolean;
    equal: boolean;
    less: boolean;
  };
  
  // 运行状态
  running: boolean;
}

export class VirtualMachine {
  private state: VMState;
  private instructions: string[];
  private maxSteps: number = 10000; // 防止无限循环

  constructor(instructions: string[]) {
    this.instructions = instructions;
    this.state = {
      eax: 0,
      ebx: 0,
      ebp: 0,
      esp: 0,
      pc: 0,
      stack: new Int32Array(256), // 1KB 栈 (256 * 4 bytes)
      flags: {
        greater: false,
        equal: false,
        less: false
      },
      running: true
    };
    
    // 初始化栈指针和基指针到栈底
    this.state.esp = this.state.stack.length - 1;
    this.state.ebp = this.state.stack.length - 1;
  }

  public run(): string[] {
    const output: string[] = [];
    let stepCount = 0;

    
    while (this.state.running && this.state.pc < this.instructions.length && stepCount < this.maxSteps) {
      const instruction = this.instructions[this.state.pc];
      if (!instruction) break;

      // 解析指令
      const parts = instruction.split(/[\s,]+/).filter(part => part.length > 0);
      if (parts.length === 0) {
        this.state.pc++;
        continue;
      }

      const opcode = parts[0]?.toLowerCase() || '';
      
      
      try {
        this.executeInstruction(opcode, parts);
      } catch (error) {
        console.error(`执行指令错误: ${instruction}`, error);
        break;
      }

      // 如果程序已经退出，不要继续执行
      if (!this.state.running) {
        break;
      }

      this.state.pc++;
      stepCount++;
    }

    if (stepCount >= this.maxSteps) {
      console.log(`达到最大步数限制 (${this.maxSteps})，停止执行`);
    }
    return output;
  }

  private executeInstruction(opcode: string, parts: string[]): void {
    switch (opcode) {
      case 'mov':
        this.executeMov(parts);
        break;
      case 'push':
        this.executePush(parts);
        break;
      case 'pop':
        this.executePop(parts);
        break;
      case 'add':
        this.executeAdd(parts);
        break;
      case 'sub':
        this.executeSub(parts);
        break;
      case 'imul':
        this.executeImul(parts);
        break;
      case 'cmp':
        this.executeCmp(parts);
        break;
      case 'jmp':
        this.executeJmp(parts);
        break;
      case 'jl':
        this.executeJl(parts);
        break;
      case 'jle':
        this.executeJle(parts);
        break;
      case 'jg':
        this.executeJg(parts);
        break;
      case 'call':
        this.executeCall(parts);
        break;
      case 'ret':
        this.executeRet(parts);
        break;
      case 'li':
        this.executeLI(parts);
        break;
      case 'si':
        this.executeSI(parts);
        break;
      case 'prt':
        this.executePRT(parts);
        break;
      case 'exit':
        this.executeExit(parts);
        break;
      default:
        console.warn(`未知指令: ${opcode}`);
    }
  }

  // mov eax, <value> 或 mov ebx, eax
  private executeMov(parts: string[]): void {
    const dest = parts[1] || '';
    const src = parts[2] || '';
    
    if (dest === 'eax') {
      if (src === 'ebx') {
        this.state.eax = this.state.ebx;
      } else if (src === 'eax') {
        // mov eax, eax 是空操作
      } else {
        this.state.eax = parseInt(src) || 0;
      }
    } else if (dest === 'ebx') {
      if (src === 'eax') {
        this.state.ebx = this.state.eax;
      } else {
        this.state.ebx = parseInt(src) || 0;
      }
    } else if (dest === 'ebp') {
      if (src === 'esp') {
        this.state.ebp = this.state.esp;
      } else {
        this.state.ebp = parseInt(src) || 0;
      }
    } else if (dest === 'esp') {
      if (src === 'ebp') {
        this.state.esp = this.state.ebp;
      } else {
        this.state.esp = parseInt(src) || 0;
      }
    }
  }

  // push eax 或 push ebp
  private executePush(parts: string[]): void {
    const reg = parts[1] || '';
    let value: number;
    
    if (reg === 'eax') {
      value = this.state.eax;
    } else if (reg === 'ebp') {
      value = this.state.ebp;
    } else {
      value = parseInt(reg) || 0;
    }
    
    // 将值压入栈 - 1字节步进
    this.state.esp -= 1;
    this.writeStack32(this.state.esp, value);
  }

  // pop eax 或 pop ebp
  private executePop(parts: string[]): void {
    const reg = parts[1] || '';
    const value = this.readStack32(this.state.esp);
    this.state.esp += 1; // 1字节步进
    
    if (reg === 'eax') {
      this.state.eax = value;
    } else if (reg === 'ebp') {
      this.state.ebp = value;
    }
  }

  // add eax, ebx 或 add esp, <number>
  private executeAdd(parts: string[]): void {
    const dest = parts[1] || '';
    const src = parts[2] || '';
    
    if (dest === 'eax' && src === 'ebx') {
      this.state.eax += this.state.ebx;
    } else if (dest === 'esp') {
      // add esp, <number> - 清理栈
      const offset = parseInt(src) || 0;
      this.state.esp += offset;
    }
  }

  // sub eax, ebx 或 sub esp, <number>
  private executeSub(parts: string[]): void {
    const dest = parts[1] || '';
    const src = parts[2] || '';
    
    if (dest === 'eax' && src === 'ebx') {
      this.state.eax -= this.state.ebx;
    } else if (dest === 'esp') {
      // sub esp, <number> - 分配栈空间
      const offset = parseInt(src) || 0;
      this.state.esp -= offset;
    }
  }

  // imul eax, ebx
  private executeImul(parts: string[]): void {
    const dest = parts[1] || '';
    const src = parts[2] || '';
    
    if (dest === 'eax' && src === 'ebx') {
      this.state.eax *= this.state.ebx;
    }
  }

  // cmp eax, ebx
  private executeCmp(parts: string[]): void {
    const left = parts[1] || '';
    const right = parts[2] || '';
    
    let leftVal: number;
    let rightVal: number;
    
    if (left === 'eax') {
      leftVal = this.state.eax;
    } else {
      leftVal = parseInt(left) || 0;
    }
    
    if (right === 'ebx') {
      rightVal = this.state.ebx;
    } else {
      rightVal = parseInt(right) || 0;
    }
    
    // 设置标志位
    this.state.flags.greater = leftVal > rightVal;
    this.state.flags.equal = leftVal === rightVal;
    this.state.flags.less = leftVal < rightVal;
  }

  // jmp <addr>
  private executeJmp(parts: string[]): void {
    this.state.pc = (parseInt(parts[1] || '0') || 0) - 1; // -1 因为后面会 +1
  }

  // jl <addr> - Jump if Less
  private executeJl(parts: string[]): void {
    if (this.state.flags.less) {
      this.state.pc = (parseInt(parts[1] || '0') || 0) - 1;
    }
  }

  // jle <addr> - Jump if Less or Equal
  private executeJle(parts: string[]): void {
    if (this.state.flags.less || this.state.flags.equal) {
      this.state.pc = (parseInt(parts[1] || '0') || 0) - 1;
    }
  }

  // jg <addr> - Jump if Greater
  private executeJg(parts: string[]): void {
    if (this.state.flags.greater) {
      this.state.pc = (parseInt(parts[1] || '0') || 0) - 1;
    }
  }

  // call <addr>
  private executeCall(parts: string[]): void {
    // 保存返回地址 - 1字节步进
    this.state.esp -= 1;
    this.writeStack32(this.state.esp, this.state.pc + 1);
    
    // 跳转到目标地址
    this.state.pc = (parseInt(parts[1] || '0') || 0) - 1;
  }

  // ret
  private executeRet(parts: string[]): void {
    // 恢复返回地址 - 1字节步进
    const returnAddr = this.readStack32(this.state.esp);
    this.state.esp += 1;
    this.state.pc = returnAddr - 1;
  }

  // LI <offset> - Load from Index
  private executeLI(parts: string[]): void {
    const offsetStr = parts[1] || '0';
    const offset = parseInt(offsetStr) || 0;
    // 负偏移表示局部变量，正偏移表示函数参数
    const addr = this.state.ebp + offset;
    this.state.eax = this.readStack32(addr);
  }

  // SI <offset> - Store to Index
  private executeSI(parts: string[]): void {
    const offsetStr = parts[1] || '0';
    const offset = parseInt(offsetStr) || 0;
    // 负偏移表示局部变量，正偏移表示函数参数
    const addr = this.state.ebp + offset;
    this.writeStack32(addr, this.state.eax);
  }

  // PRT - Print
  private executePRT(parts: string[]): void {
    // 从栈顶读取参数（push eax 后，参数在 esp 位置）
    const value = this.readStack32(this.state.esp);
    console.log(value);
    // 注意：栈清理由后续的 add esp, 1 指令处理
  }

  // exit
  private executeExit(parts: string[]): void {
    this.state.running = false;
  }

  // 栈操作辅助函数 - 简化版本，每个地址存储一个值
  private writeStack32(addr: number, value: number): void {
    // 边界检查
    if (addr < 0 || addr >= this.state.stack.length) {
      console.error(`Stack write out of bounds: addr=${addr}, stack size=${this.state.stack.length}`);
      return;
    }
    
    // 直接存储值到栈地址
    this.state.stack[addr] = value;
  }

  private readStack32(addr: number): number {
    // 边界检查
    if (addr < 0 || addr >= this.state.stack.length) {
      console.error(`Stack read out of bounds: addr=${addr}, stack size=${this.state.stack.length}`);
      return 0;
    }
    
    // 直接从栈地址读取值
    return this.state.stack[addr] ?? 0;
  }

  // 获取虚拟机状态（用于调试）
  public getState(): VMState {
    return { ...this.state };
  }
}
