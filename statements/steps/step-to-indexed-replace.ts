// 从 statements/steps/step2.txt 读取带索引+标签备注的指令，
// 将跳转/调用目标中的标签替换为对应索引，输出到 statements/steps/step3.txt
// 运行：bun run statements/steps/step-to-indexed-replace.ts

const inputPath = 'statements/steps/step2.txt';
const outputPath = 'statements/steps/step3.txt';

const text = await Bun.file(inputPath).text();
const lines = text.split('\n').filter(Boolean);

// 解析 [idx]: 指令 ... ; labels
const indexRe = /^\[(\d+)\]:\s*(.*)$/;
const code: string[] = [];
const labelToIndex = new Map<string, number>();

for (const line of lines) {
  const m = line.match(indexRe);
  if (!m) continue;
  const idx = Number(m[1]);
  const rest = m[2];
  code[idx] = rest ?? '';
  const semis = (rest ?? '').split(';');
  if (semis.length >= 2) {
    const lastComment = semis[semis.length - 1]?.trim() ?? '';
    const labels = lastComment.split(',').map(s => s.trim()).filter(s => s.length > 0);
    for (const label of labels) {
      if (!labelToIndex.has(label)) labelToIndex.set(label, idx);
    }
  }
}

// 替换跳转/调用目标标签为索引
const jmpRegex = /^(call|jmp|je|jne|jl|jle|jg|jge)\s+([^;\s]+)(.*)$/;
const replaced = code.map((instr) => {
  if (!instr) return instr;
  const m = instr.match(jmpRegex);
  if (!m) return instr;
  const op = m[1] ?? '';
  const targetRaw = m[2] ?? '';
  const rest = m[3] ?? '';
  // 数字目标直接保留
  if (/^\d+$/.test(targetRaw)) return instr;
  const idx = labelToIndex.get(targetRaw.trim());
  if (idx !== undefined) {
    return `${op} ${idx}${rest}`.trim();
  }
  return instr;
});

const output = replaced.map((instr, i) => `[${i}]: ${instr}`).join('\n') + '\n';
await Bun.write(outputPath, output);

console.log(`已基于 ${inputPath} 生成 ${outputPath}，共 ${replaced.length} 条`);
