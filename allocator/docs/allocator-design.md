# 内存分配器设计说明

本文档概述本项目自研内存分配器的定位、核心数据结构、典型工作流程以及伪代码示意，便于在后续实现与测试阶段保持统一认知。

## 1. 范围与目标

- **职责**：管理一块连续的堆内存区域，提供 `alloc`、`free`、`realloc` 等 API。
- **不做的事情**：不负责垃圾回收（GC）、不追踪引用计数、默认不处理线程同步（视需求可加锁封装）。
- **设计目标**：低碎片、稳定的分配/释放延迟、调试友好（可插入统计信息或守卫字节）。

## 2. 内存布局与元数据

每个已管理的块都会在数据区前放置一个头部（必要时还可追加尾部），记录块大小和状态。空闲块则通过链表或伙伴索引组织。

```
┌─────────────┬────────────┬────────────┐
│   Header    │  Payload   │  (Guard)   │
│ size|flags  │  对外可用  │  可选填充  │
└─────────────┴────────────┴────────────┘
```

空闲块结构（以内嵌双向链表为例）：

```
┌─────────────┬─────────────┬────────────┬────────────┐
│  Header     │  prev ptr   │  next ptr  │  Padding   │
│ size|free   │             │            │  (对齐)    │
└─────────────┴─────────────┴────────────┴────────────┘
```

## 3. 初始化流程

1. 向操作系统申请一块大内存（`mmap`/`VirtualAlloc`/嵌入式静态数组）。
2. 创建一个覆盖整个区域的“空闲块”，写入头部，并将其挂到空闲链表或伙伴树。
3. 准备全局状态：链表哨兵节点、统计计数器、可选的锁。

示意伪代码：

```
func allocator_init(total_size):
    base = os_reserve(total_size)
    first_block = Block(header(size=total_size - header_size, free=true))
    free_list = doubly_linked_list()
    free_list.push(first_block)
```

## 4. 分配流程（alloc）

### 4.1 查找策略

- **首次适配 (First-fit)**：从头遍历空闲链表，找到第一块足够大的空闲块。
- **最佳适配 (Best-fit)**：遍历全部空闲块，取最小但满足需求的块，碎片少但成本高。
- **分级空闲链表 / 伙伴系统**：按块大小分桶，查找时间更稳定，适合高频分配。

本文档默认使用 **分级空闲链表 + 首次适配** 作为起点。

### 4.2 分配伪代码

```
func alloc(size):
    aligned = align_up(size, ALIGNMENT)
    block = free_list.find_first(aligned)
    if block == null:
        block = grow_heap(max(aligned, DEFAULT_CHUNK))
        if block == null:
            return null

    if block.size - aligned >= MIN_SPLIT:
        split_block = block.split(aligned)
        free_list.insert(split_block)

    block.mark_used()
    free_list.remove(block)
    return block.payload_ptr()
```

关键点：

- `align_up` 保证返回指针对齐（例如 16 字节）。
- 剩余空间足够大时进行拆分，避免浪费。
- 若没有合适空闲块，则向 OS 扩容。

## 5. 释放与合并（free）

释放时需要从指针回溯得到头部，并尝试与前/后相邻空闲块合并，以降低外部碎片。

```
func free(ptr):
    if ptr == null:
        return

    block = block_from_payload(ptr)
    block.mark_free()

    left = block.prev_physical()
    right = block.next_physical()

    if left != null and left.is_free():
        block = merge(left, block)
        free_list.remove(left)

    if right != null and right.is_free():
        block = merge(block, right)
        free_list.remove(right)

    free_list.insert(block)
```

若使用伙伴系统，`merge` 的条件是伙伴索引匹配；若是边界标记法，则依赖前后块的尾/头部标志位。

## 6. 其他 API

- **`realloc(ptr, new_size)`**：若就地扩容失败需申请新块并复制数据；支持 shrink in place。
- **`calloc(count, size)`**：`alloc(count * size)` 后 `memset` 为零。
- **`aligned_alloc(alignment, size)`**：可通过“前向溢出 + 调整头部”实现。

## 7. 诊断与扩展

- **统计**：记录当前已用字节数、峰值、碎片率、调用次数，便于调试。
- **填充模式**：分配时用固定字节填充，释放时改写为另一模式，以提前暴露越界写。
- **线程安全**：在公共 API 入口加自旋锁/互斥锁；高阶方案可做 per-thread arena。
- **系统回收**：当空闲块位于堆末端且超过阈值时，调用 `os_release` 归还内存。

通过以上结构与流程，后续实现可以按模块逐步落地：先完成单线程、单 arena 的基本功能，再视需要添加对齐、统计、调试等附加能力。

