import type { ControlFlowGraph } from './cfg-types';
import type { AssemblyLine } from '../components/AssemblyVisualizer';

/**
 * 合并块的数据结构
 */
interface MergeBlock {
  blockId: string;
  code: string[]; // 该块的所有代码行（不包括标签行和最后的jmp）
  jumpLine: AssemblyLine | null; // 该块最后的 jmp 指令（如果有）
  next: MergeBlock | null; // 下一个可以合并的块
  label: string; // 该块的标签（用于生成）
}

// 预编译正则表达式，提高性能
const JMP_PATTERN = /jmp\s+(\w+)/;
const ALL_JUMP_PATTERN = /\b(jmp|je|jne|jg|jge|jl|jle|ja|jae|jb|jbe|jz|jnz)\s+(\w+)/g;

/**
 * 提取跳转指令中的目标块ID
 */
function extractJumpTarget(line: AssemblyLine): string | null {
  const match = line.code.match(JMP_PATTERN);
  return match?.[1] || null;
}

/**
 * 检查是否是 jmp 指令
 */
function isJmpInstruction(line: AssemblyLine): boolean {
  return JMP_PATTERN.test(line.code);
}

/**
 * 检查是否是标签行
 */
function isLabelLine(line: AssemblyLine): boolean {
  return line.code.trim().endsWith(':') && !line.code.startsWith(' ');
}

/**
 * 优化汇编代码：合并线性块，更新标签，移除不必要的跳转
 */
export function optimizeAssembly(
  assemblyLines: AssemblyLine[],
  cfg: ControlFlowGraph
): AssemblyLine[] {
  if (assemblyLines.length === 0 || !cfg) {
    return assemblyLines;
  }
  
  // 1. 按 blockId 收集每个块的代码
  const blockCodeMap = new Map<string, AssemblyLine[]>();
  for (const line of assemblyLines) {
    if (line.blockId) {
      if (!blockCodeMap.has(line.blockId)) {
        blockCodeMap.set(line.blockId, []);
      }
      blockCodeMap.get(line.blockId)!.push(line);
    }
  }
  
  // 2. 统计每个块ID被跳转的次数（通过分析所有汇编代码中的跳转指令）
  const jumpTargetCount = new Map<string, number>();
  const jumpTargets = new Set<string>(); // 所有被跳转指令指向的块（包括条件跳转）
  
  // 统一提取所有跳转指令中的目标块ID（包括条件跳转和无条件跳转）
  for (const line of assemblyLines) {
    // 重置正则表达式的 lastIndex（全局正则需要重置）
    ALL_JUMP_PATTERN.lastIndex = 0;
    let match;
    while ((match = ALL_JUMP_PATTERN.exec(line.code)) !== null) {
      const targetBlockId = match[2];
      if (targetBlockId) {
        jumpTargets.add(targetBlockId);
        // 如果是 jmp 指令，统计跳转次数（用于判断是否可以合并）
        if (match[1] === 'jmp') {
          jumpTargetCount.set(targetBlockId, (jumpTargetCount.get(targetBlockId) || 0) + 1);
        }
      }
    }
  }
  
  // 3. 构建 MergeBlock 列表
  const mergeBlocks: MergeBlock[] = [];
  const processedBlocks = new Set<string>();
  
  const processBlock = (blockId: string): MergeBlock | null => {
    if (processedBlocks.has(blockId)) {
      // 如果已经处理过，返回已存在的 MergeBlock
      return mergeBlocks.find(mb => mb.blockId === blockId) || null;
    }
    
    processedBlocks.add(blockId);
    
    // 获取该块的所有代码行
    const blockLines = blockCodeMap.get(blockId) || [];
    
    // 一次遍历完成：分离代码、标签和最后的 jmp
    const codeLines: string[] = [];
    let jumpLine: AssemblyLine | null = null;
    let labelLine: AssemblyLine | null = null;
    
    // 从前向后遍历，收集代码行和标签，同时从后往前找最后一个 jmp
    for (let i = 0; i < blockLines.length; i++) {
      const line = blockLines[i]!;
      
      // 处理标签行
      if (isLabelLine(line)) {
        labelLine = line;
        continue;
      }
      
      // 收集所有非标签行（包括 jmp 和条件跳转）
      codeLines.push(line.code);
      
      // 如果是 jmp 指令，记录为 jumpLine（后面遇到的会覆盖前面的，最终保留最后一个）
      if (isJmpInstruction(line)) {
        jumpLine = line;
      }
    }
    
    // 创建 MergeBlock
    const mergeBlock: MergeBlock = {
      blockId,
      code: codeLines,
      jumpLine,
      next: null,
      label: labelLine ? labelLine.code.trim() : (blockId === cfg.entryBlock?.id ? `${cfg.functionName}:` : `${blockId}:`),
    };
    
    // 分析 jump 指令，看是否可以合并下一个块
    if (jumpLine) {
      const targetBlockId = extractJumpTarget(jumpLine);
      
      if (targetBlockId) {
        // 检查目标块是否只有这一个 jmp 跳转过去
        const jumpCount = jumpTargetCount.get(targetBlockId) || 0;
        
        if (jumpCount === 1) {
          // 只有当前块跳转过去，可以合并
          const nextMergeBlock = processBlock(targetBlockId);
          if (nextMergeBlock) {
            mergeBlock.next = nextMergeBlock;
          }
        }
      }
    }
    
    mergeBlocks.push(mergeBlock);
    return mergeBlock;
  };
  
  // 从入口块开始处理
  if (cfg.entryBlock) {
    processBlock(cfg.entryBlock.id);
  }
  
  // 处理其他未处理的块（可能有些块没有从入口块可达）
  const allBlockIds = new Set(blockCodeMap.keys());
  for (const blockId of allBlockIds) {
    if (!processedBlocks.has(blockId)) {
      processBlock(blockId);
    }
  }
  
  // 移除那些已经被其他块的 next 指向的块（避免重复）
  // 递归收集所有在 next 链中的块
  const blocksPointedTo = new Set<string>();
  const collectNextChain = (mergeBlock: MergeBlock): void => {
    let current: MergeBlock | null = mergeBlock.next;
    while (current) {
      blocksPointedTo.add(current.blockId);
      current = current.next;
    }
  };
  
  for (const mergeBlock of mergeBlocks) {
    collectNextChain(mergeBlock);
  }
  
  // 只保留那些：
  // 1. 没有被 next 指向的块（避免重复）
  // 2. 并且是被跳转指令指向的块，或者是入口块（避免孤立块）
  const isEntryBlock = (blockId: string) => blockId === cfg.entryBlock?.id;
  const filteredMergeBlocks = mergeBlocks.filter(mb => 
    !blocksPointedTo.has(mb.blockId) && 
    (isEntryBlock(mb.blockId) || jumpTargets.has(mb.blockId))
  );
  
  // 4. 合并代码：将 next 链中的代码合并到一起
  const mergeBlockCode = (mergeBlock: MergeBlock): { code: string[]; mergedBlocks: string[] } => {
    const collectedCode: string[] = [...mergeBlock.code];
    const mergedBlocks: string[] = [mergeBlock.blockId];
    let current: MergeBlock | null = mergeBlock;
    
    // 沿着 next 链合并代码，移除中间的 jmp 指令
    while (current?.jumpLine && current.next) {
      const jumpLineCode = current.jumpLine.code.trim();
      const jumpIndex = collectedCode.findIndex(line => line.trim() === jumpLineCode);
      if (jumpIndex !== -1) {
        collectedCode.splice(jumpIndex, 1);
      }
      collectedCode.push(...current.next.code);
      mergedBlocks.push(current.next.blockId);
      current = current.next;
    }
    
    // 过滤掉空字符串
    const filteredCode = collectedCode.filter(line => line.trim() !== '');
    return { code: filteredCode, mergedBlocks };
  };
  
  const mergedBlocksOutput: Array<{ blockId: string; code: string[]; mergedBlocks: string[] }> = [];
  for (const mergeBlock of filteredMergeBlocks) {
    const { code, mergedBlocks } = mergeBlockCode(mergeBlock);
    if (code.length > 0) {
      mergedBlocksOutput.push({
        blockId: mergeBlock.blockId,
        code,
        mergedBlocks
      });
    }
  }
  
  // 5. 分配共享标签
  let labelCounter = 1;
  const blockToLabel = new Map<string, string>();
  const isEntry = (blockId: string) => blockId === cfg.entryBlock?.id;
  
  for (const item of mergedBlocksOutput) {
    if (!blockToLabel.has(item.blockId)) {
      const label = isEntry(item.blockId) 
        ? `${cfg.functionName}:`
        : `.L${labelCounter++}:`;
      blockToLabel.set(item.blockId, label);
    }
  }
  
  // 6. 更新所有代码中的跳转目标标签（包括条件跳转）
  const updateJumpTargetsInCode = (code: string): string => {
    // 重置正则表达式的 lastIndex
    ALL_JUMP_PATTERN.lastIndex = 0;
    return code.replace(ALL_JUMP_PATTERN, (match, instruction, targetBlockId) => {
      const targetLabel = blockToLabel.get(targetBlockId);
      if (targetLabel) {
        const labelWithoutColon = targetLabel.endsWith(':') 
          ? targetLabel.slice(0, -1) 
          : targetLabel;
        return `${instruction} ${labelWithoutColon}`;
      }
      return match; // 如果找不到标签，保持原样
    });
  };
  
  // 7. 生成优化后的汇编代码
  const optimized: AssemblyLine[] = [];
  let lineIndex = 0;
  
  // 辅助函数：将 blockId 转换为简短的标识
  const getBlockShortId = (blockId: string): string => {
    if (isEntry(blockId)) {
      return 'entry';
    }
    const match = blockId.match(/_block_(\d+)$/);
    return match?.[1] || blockId;
  };
  
  for (const item of mergedBlocksOutput) {
    // 生成合并块信息注释（在 label 前面）
    const mergedBlockIds = item.mergedBlocks.map(getBlockShortId);
    optimized.push({
      lineIndex: lineIndex++,
      code: `; [${mergedBlockIds.join(',')}]`,
      blockId: item.blockId,
    });
    
    // 生成标签
    const label = blockToLabel.get(item.blockId);
    if (label) {
      optimized.push({
        lineIndex: lineIndex++,
        code: label,
        blockId: item.blockId,
      });
    }
    
    // 生成代码（更新其中的跳转目标标签）
    for (const codeLine of item.code) {
      optimized.push({
        lineIndex: lineIndex++,
        code: updateJumpTargetsInCode(codeLine),
        blockId: item.blockId,
      });
    }
  }
  
  return optimized;
}
