// 虚拟机测试脚本
import { VirtualMachine } from './src/vm';

async function main() {
  try {
    // 读取 assemble.txt 文件
    const step3Content = await Bun.file('statements/assemble.txt').text();
    
    // 解析指令
    const lines = step3Content.split('\n').filter(line => line.trim());
    const instructions: string[] = [];
    
    for (const line of lines) {
      // 提取指令部分，去掉 [index]: 前缀和注释
      const match = line.match(/^\[\d+\]:\s*(.+?)(?:\s*;.*)?$/);
      if (match) {
        instructions.push(match[1]?.trim() || '');
      }
    }
    
    console.log(`加载了 ${instructions.length} 条指令`);
    console.log('前5条指令:');
    instructions.slice(0, 5).forEach((inst, i) => {
      console.log(`  ${i}: ${inst}`);
    });
    
    // 创建并运行虚拟机
    const vm = new VirtualMachine(instructions);
    console.log('\n开始执行虚拟机...');
    
    const output = vm.run();
    
    console.log('\n执行完成！');
    
    // 显示最终状态
    const state = vm.getState();
    console.log('\n虚拟机最终状态:');
    console.log(`  eax: ${state.eax}`);
    console.log(`  ebx: ${state.ebx}`);
    console.log(`  ebp: ${state.ebp}`);
    console.log(`  esp: ${state.esp}`);
    console.log(`  pc: ${state.pc}`);
    console.log(`  running: ${state.running}`);
    
  } catch (error) {
    console.error('错误:', error);
  }
}

if (import.meta.main) {
  main();
}
