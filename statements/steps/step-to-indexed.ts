// 从 steps/step1.txt 提取汇编指令，生成 steps/step2.txt（[index]: 指令 ; 标签）
// 使用 Bun 运行：bun run statements/steps/step-to-indexed.ts

const inputPath = 'statements/steps/step1.txt';
const outputPath = 'statements/steps/step2.txt';

const content = await Bun.file(inputPath).text();

// 找到汇编代码开始的位置
const assemblyStart = content.indexOf('=== 生成的汇编代码 ===');
if (assemblyStart === -1) {
  console.log('未找到汇编代码部分');
  process.exit(1);
}

const assemblySection = content.substring(assemblyStart);
const lines = assemblySection.split('\n');

function isInstruction(trimmed: string): boolean {
  if (
    trimmed === '' ||
    trimmed === '=== 生成的汇编代码 ===' ||
    trimmed.startsWith('.data') ||
    trimmed.startsWith('.text') ||
    trimmed.startsWith('.global') ||
    trimmed.startsWith(';') ||
    trimmed.includes('Input your program')
  ) {
    return false;
  }
  // 标签不是指令
  if (trimmed.endsWith(':')) return false;
  return true;
}

// 构建原始指令数组与标签到索引映射（标签索引为下一条指令的索引）
const rawCode: string[] = [];
const labelToIndex = new Map<string, number>();
for (const raw of lines) {
  const trimmed = raw.trim();
  if (trimmed.endsWith(':')) {
    const label = trimmed.slice(0, -1).trim();
    labelToIndex.set(label, rawCode.length);
    continue;
  }
  if (isInstruction(trimmed)) {
    rawCode.push(trimmed);
  }
}

// 将标签注释附加到对应首条指令末尾
const indexToLabels = new Map<number, string[]>();
for (const [label, idx] of labelToIndex.entries()) {
  if (!indexToLabels.has(idx)) indexToLabels.set(idx, []);
  indexToLabels.get(idx)!.push(label);
}

const annotated = rawCode.map((instr, i) => {
  const labels = indexToLabels.get(i);
  if (!labels || labels.length === 0) return instr;
  return instr + ` ; ${labels.join(', ')}`;
});

const output = annotated.map((instr, i) => `[${i}]: ${instr}`).join('\n') + '\n';
await Bun.write(outputPath, output);

console.log(`已从 ${inputPath} 生成 ${outputPath}，共 ${annotated.length} 条指令。`);
