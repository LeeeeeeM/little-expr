import { AssemblyVM, HEAP_START } from '../src/assembly-vm';
import { Allocator } from '../src/allocator';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('🧪 Starting Allocator Tests...\n');

  const vm = new AssemblyVM();
  const allocator = new Allocator(vm, HEAP_START, 100); // Small heap for testing
  allocator.init();

  // Test 1: Basic Allocation
  console.log('Test 1: Basic Allocation');
  const ptr1 = allocator.alloc(10);
  console.log(`Allocated 10 bytes at ${ptr1}`);
  assert(ptr1 === HEAP_START + 2, 'First allocation should be at start + header');
  
  const ptr2 = allocator.alloc(20);
  console.log(`Allocated 20 bytes at ${ptr2}`);
  assert(ptr2 === ptr1 + 10 + 2, 'Second allocation should follow first');

  // Test 2: Free and Reuse
  console.log('\nTest 2: Free and Reuse');
  allocator.free(ptr1);
  console.log(`Freed ptr1 at ${ptr1}`);
  
  const ptr3 = allocator.alloc(10);
  console.log(`Allocated 10 bytes at ${ptr3}`);
  assert(ptr3 === ptr1, 'Should reuse freed block');

  // Test 3: Coalescing
  console.log('\nTest 3: Coalescing');
  // Current state: [ptr3 (10, used)] [ptr2 (20, used)] [Free]
  
  allocator.free(ptr2); // Free middle
  allocator.free(ptr3); // Free first (should merge with middle)
  
  const ptr4 = allocator.alloc(30); // Request size equal to sum of previous two (10 + 20 + header? No, just payload sum + header saved)
  // Actually: 
  // Block 1: 10 size + 2 header = 12 total
  // Block 2: 20 size + 2 header = 22 total
  // Merged: 12 + 22 = 34 total. Payload = 34 - 2 = 32.
  
  console.log(`Allocated 30 bytes at ${ptr4}`);
  assert(ptr4 === ptr1, 'Should reuse merged block');
  
  // Test 4: Struct Simulation (Point & Rectangle)
  console.log('\nTest 4: Struct Simulation');
  // struct Point { int x; int y; } -> size 2
  // struct Rectangle { int width; int height; } -> size 2
  
  const p1 = allocator.alloc(2);
  const p2 = allocator.alloc(2);
  
  // p1.x = 1, p1.y = 2
  vm.writeMemory(p1, 1);
  vm.writeMemory(p1 + 1, 2);
  
  // p2.x = 4, p2.y = 6
  vm.writeMemory(p2, 4);
  vm.writeMemory(p2 + 1, 6);
  
  // p3 = alloc(2)
  const p3 = allocator.alloc(2);
  
  // p3.x = p1.x + p2.x
  const p1x = vm.readMemory(p1);
  const p2x = vm.readMemory(p2);
  vm.writeMemory(p3, p1x + p2x);
  
  // p3.y = p1.y + p2.y
  const p1y = vm.readMemory(p1 + 1);
  const p2y = vm.readMemory(p2 + 1);
  vm.writeMemory(p3 + 1, p1y + p2y);
  
  console.log(`p3: (${vm.readMemory(p3)}, ${vm.readMemory(p3 + 1)})`);
  assert(vm.readMemory(p3) === 5, 'p3.x should be 5');
  assert(vm.readMemory(p3 + 1) === 8, 'p3.y should be 8');
  
  console.log('\n✅ All tests passed!');
}

runTests().catch(console.error);
