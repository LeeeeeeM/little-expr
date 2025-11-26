import { AssemblyVM } from './assembly-vm';

// Memory Block Header Layout
// ┌──────────────┬──────────────┐
// │ Size (32bit) │ Flags (32bit)│
// └──────────────┴──────────────┘
// Size: The size of the payload (excluding header)
// Flags: 0 = Free, 1 = Used

const HEADER_SIZE = 2; // 2 words (64-bit total if word is 32-bit, but here we use VM memory units)
// In our VM, memory is a Map<number, number>, so address is index.
// Let's assume 1 unit of memory = 1 word (integer).
// So Header takes 2 addresses.

export class Allocator {
  private vm: AssemblyVM;
  private heapStart: number;
  private heapSize: number;

  constructor(vm: AssemblyVM, heapStart: number = 4096, heapSize: number = 1024 * 10) {
    this.vm = vm;
    this.heapStart = heapStart;
    this.heapSize = heapSize;
  }

  // Initialize the heap with one large free block
  init(): void {
    // Block Header:
    // [Address]: Size (of payload)
    // [Address + 1]: IsUsed (0 = Free, 1 = Used)
    
    const initialPayloadSize = this.heapSize - HEADER_SIZE;
    
    // Write Header for the first block
    this.write(this.heapStart, initialPayloadSize); // Size
    this.write(this.heapStart + 1, 0);              // Free
    
    console.log(`Allocator initialized: Start=${this.heapStart}, Size=${this.heapSize}`);
  }

  // Allocate memory
  alloc(size: number): number {
    // Simple First-Fit Strategy
    let current = this.heapStart;
    
    while (current < this.heapStart + this.heapSize) {
      const blockSize = this.read(current);
      const isUsed = this.read(current + 1) === 1;
      
      if (!isUsed && blockSize >= size) {
        // Found a free block
        
        // Split if the block is significantly larger than requested
        // Minimum block size to split = requested size + header + minimum payload (e.g. 1)
        if (blockSize >= size + HEADER_SIZE + 1) {
          const newBlockSize = size;
          const remainingSize = blockSize - size - HEADER_SIZE;
          
          // Update current block header
          this.write(current, newBlockSize);
          this.write(current + 1, 1); // Mark as Used
          
          // Create new free block after this one
          const nextBlock = current + HEADER_SIZE + newBlockSize;
          this.write(nextBlock, remainingSize);
          this.write(nextBlock + 1, 0); // Mark as Free
          
          return current + HEADER_SIZE; // Return payload address
        } else {
          // Just use the whole block
          this.write(current + 1, 1); // Mark as Used
          return current + HEADER_SIZE;
        }
      }
      
      // Move to next block
      current += HEADER_SIZE + blockSize;
    }
    
    return 0; // Out of memory
  }

  // Free memory
  free(ptr: number): void {
    if (ptr < this.heapStart || ptr >= this.heapStart + this.heapSize) {
      console.error(`Invalid free pointer: ${ptr}`);
      return;
    }
    
    const blockHeader = ptr - HEADER_SIZE;
    const isUsed = this.read(blockHeader + 1) === 1;
    
    if (!isUsed) {
      console.error(`Double free detected at ${ptr}`);
      return;
    }
    
    // Mark as free
    this.write(blockHeader + 1, 0);
    
    // Coalesce (Merge free blocks)
    this.coalesce();
  }

  // Merge adjacent free blocks
  // This is a naive implementation that scans the whole heap.
  // Optimized version would only scan neighbors of the freed block.
  private coalesce(): void {
    let current = this.heapStart;
    
    while (current < this.heapStart + this.heapSize) {
      const blockSize = this.read(current);
      const isUsed = this.read(current + 1) === 1;
      
      if (!isUsed) {
        // Check next block
        const nextBlock = current + HEADER_SIZE + blockSize;
        
        if (nextBlock < this.heapStart + this.heapSize) {
          const nextSize = this.read(nextBlock);
          const nextUsed = this.read(nextBlock + 1) === 1;
          
          if (!nextUsed) {
            // Merge!
            const newSize = blockSize + HEADER_SIZE + nextSize;
            this.write(current, newSize);
            // Don't move 'current', try to merge again with the *next* next block
            continue; 
          }
        }
      }
      
      current += HEADER_SIZE + blockSize;
    }
  }

  // Helper to read from VM memory
  private read(addr: number): number {
    return this.vm.readMemory(addr);
  }

  private write(addr: number, value: number): void {
    this.vm.writeMemory(addr, value);
  }
}
