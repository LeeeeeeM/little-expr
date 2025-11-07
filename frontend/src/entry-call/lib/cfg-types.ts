import type { Statement } from './types';

export interface BasicBlock {
  id: string;
  statements: Statement[];
  predecessors: BasicBlock[];
  successors: BasicBlock[];
  isEntry?: boolean;
  isExit?: boolean;
  visited?: boolean;
  scopeSnapshot?: Map<string, number>[] | Map<string, { offset: number; init: boolean }>[];
}

export interface ControlFlowGraph {
  functionName: string;
  entryBlock: BasicBlock;
  exitBlock?: BasicBlock;
  blocks: BasicBlock[];
  edges: { from: string; to: string }[];
  parameters?: Array<{ name: string; type: string }>; // 函数参数列表
}

