"""
Manim 静态图片生成：生成 CFG 生成过程中的关键步骤图片

使用示例：
    # 生成"识别基本块边界"图片
    uv run manim -s cfg_static_images.py IdentifyBasicBlocks
    
    # 生成所有步骤的图片
    uv run manim -s cfg_static_images.py AllSteps
"""

from manim import *


class IdentifyBasicBlocks(Scene):
    """识别基本块边界"""
    def construct(self):
        title = Text("步骤 3: 识别基本块边界", font_size=36, color=BLUE)
        title.to_edge(UP)
        
        # 显示基本块边界识别规则
        block_boundaries = VGroup(
            Text("基本块边界识别规则：", font_size=24, color=GREEN),
            Text("• 函数入口 → 新块开始", font_size=20, color=WHITE),
            Text("• 控制流语句 (if/while/for/return) → 块结束", font_size=20, color=WHITE),
            Text("• 控制流目标 → 新块开始", font_size=20, color=WHITE),
            Text("• 函数出口 → 块结束", font_size=20, color=WHITE),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.4)
        block_boundaries.scale(0.8)
        block_boundaries.move_to(UP * 1.5)
        
        # 显示标记后的代码
        marked_code = VGroup(
            Text("【块 0 开始】", font_size=18, color=GREEN),
            Text("int grade = 0;", font_size=18, color=WHITE),
            Text("int score = 70;", font_size=18, color=WHITE),
            Text("【块 1 开始】if (score >= 90) {", font_size=18, color=ORANGE),
            Text("【块 2 开始】    grade = 1;", font_size=18, color=WHITE),
            Text("【块 1 结束】} else {", font_size=18, color=ORANGE),
            Text("【块 3 开始】    grade = 2;", font_size=18, color=WHITE),
            Text("【块 1 结束】}", font_size=18, color=ORANGE),
            Text("【块 4 开始】return grade;", font_size=18, color=PURPLE),
            Text("【块 4 结束】", font_size=18, color=PURPLE),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.2)
        marked_code.scale(0.6)
        marked_code.move_to(DOWN * 0.5)
        
        self.add(title, block_boundaries, marked_code)


class BuildBasicBlocks(Scene):
    """构建基本块"""
    def construct(self):
        title = Text("步骤 4: 构建基本块", font_size=36, color=BLUE)
        title.to_edge(UP)
        
        # 创建基本块的可视化
        blocks = VGroup()
        
        # 块 0: entry (在顶部中间)
        block0 = self.create_block_box("entry_block", [
            "int grade = 0;",
            "int score = 70;"
        ], GREEN)
        block0.move_to(UP * 2.5)
        blocks.add(block0)
        
        # 块 1: condition (在 entry 下方)
        block1 = self.create_block_box("block_1", [
            "if (score >= 90)"
        ], ORANGE)
        block1.move_to(UP * 0.8)
        blocks.add(block1)
        
        # 块 2: then (左侧)
        block2 = self.create_block_box("block_2", [
            "grade = 1;"
        ], YELLOW)
        block2.move_to(LEFT * 2.5 + DOWN * 0.5)
        blocks.add(block2)
        
        # 块 3: else (右侧)
        block3 = self.create_block_box("block_3", [
            "grade = 2;"
        ], YELLOW)
        block3.move_to(RIGHT * 2.5 + DOWN * 0.5)
        blocks.add(block3)
        
        # 块 4: return (在底部中间)
        block4 = self.create_block_box("block_4", [
            "return grade;"
        ], PURPLE)
        block4.move_to(DOWN * 1.8)
        blocks.add(block4)
        
        # 块 5: exit (在最底部)
        block5 = self.create_block_box("exit_block", [], RED)
        block5.move_to(DOWN * 3.2)
        blocks.add(block5)
        
        blocks.scale(0.6)
        
        self.add(title, *blocks)
    
    def create_block_box(self, block_id: str, statements: list, color: str):
        """创建基本块的可视化框"""
        # 块标题（移到块外面）
        title = Text(block_id, font_size=24, color=color, weight=BOLD)
        
        # 语句列表
        stmt_group = VGroup()
        if statements:
            for stmt in statements:
                stmt_text = Text(stmt, font_size=20, color=WHITE)
                stmt_group.add(stmt_text)
            stmt_group.arrange(DOWN, aligned_edge=LEFT, buff=0.15)
        else:
            stmt_text = Text("(empty)", font_size=20, color=GRAY)
            stmt_group.add(stmt_text)
        
        # 只包含语句内容（不包含标题）
        content = stmt_group
        
        # 创建框（更大的 buff 使块更大）
        box = SurroundingRectangle(
            content,
            color=color,
            buff=0.3,
            corner_radius=0.3,
            stroke_width=3
        )
        
        # 将标题放在框的上方
        title.next_to(box, UP, buff=0.2)
        
        # 组合所有元素：标题在上，框和内容在下
        block = VGroup(title, box, content)
        
        return block


class FinalCFG(Scene):
    """最终 CFG"""
    def construct(self):
        # 创建基本块，调整位置避免重叠
        blocks = VGroup()
        
        block0 = self.create_block_box("entry_block", [
            "int grade = 0;",
            "int score = 70;"
        ], GREEN)
        block0.move_to(UP * 2.8)
        blocks.add(block0)
        
        block1 = self.create_block_box("block_1", [
            "if (score >= 90)"
        ], ORANGE)
        block1.move_to(UP * 1.0)
        blocks.add(block1)
        
        block2 = self.create_block_box("block_2", [
            "grade = 1;"
        ], YELLOW)
        block2.move_to(LEFT * 3.0 + DOWN * 0.3)
        blocks.add(block2)
        
        block3 = self.create_block_box("block_3", [
            "grade = 2;"
        ], YELLOW)
        block3.move_to(RIGHT * 3.0 + DOWN * 0.3)
        blocks.add(block3)
        
        block4 = self.create_block_box("block_4", [
            "return grade;"
        ], PURPLE)
        block4.move_to(DOWN * 1.6)
        blocks.add(block4)
        
        block5 = self.create_block_box("exit_block", [], RED)
        block5.move_to(DOWN * 3.0)
        blocks.add(block5)
        
        blocks.scale(0.65)
        
        # 统一的连线样式配置
        ARROW_COLOR = BLUE  # 统一使用蓝色
        ARROW_STROKE_WIDTH = 3  # 统一线宽
        ARROW_BUFF = 0.2  # 统一缓冲距离
        ARROW_OPACITY = 1.0  # 统一透明度
        ARROW_TIP_LENGTH = 0.25  # 固定箭头头部长度（绝对值，不是比例）
        LABEL_FONT_SIZE = 16  # 统一标签字体大小
        OFFSET_DISTANCE = 0.15  # 统一的偏移距离
        
        # 创建连接，使用统一的样式
        connections = [
            (0, 1, None),      # entry -> condition
            (1, 2, "true"),   # condition -> then
            (1, 3, "false"),  # condition -> else
            (2, 4, None),     # then -> return
            (3, 4, None),     # else -> return
            (4, 5, None),     # return -> exit
        ]
        
        arrows = VGroup()
        for from_idx, to_idx, label_text in connections:
            from_block = blocks[from_idx]
            to_block = blocks[to_idx]
            
            # 计算箭头起点，使用统一的偏移量
            if from_idx == 0:  # entry
                start = from_block.get_bottom() + DOWN * OFFSET_DISTANCE
            elif from_idx == 1:  # condition
                if to_idx == 2:  # to then (left)
                    start = from_block.get_left() + LEFT * OFFSET_DISTANCE
                else:  # to else (right)
                    start = from_block.get_right() + RIGHT * OFFSET_DISTANCE
            elif from_idx in [2, 3]:  # then/else
                start = from_block.get_bottom() + DOWN * OFFSET_DISTANCE
            else:  # return
                start = from_block.get_bottom() + DOWN * OFFSET_DISTANCE
            
            # 计算箭头终点，使用统一的偏移量
            if to_idx == 1:  # to condition
                end = to_block.get_top() + UP * OFFSET_DISTANCE
            elif to_idx in [2, 3]:  # to then/else
                end = to_block.get_top() + UP * OFFSET_DISTANCE
            elif to_idx == 4:  # to return
                end = to_block.get_top() + UP * OFFSET_DISTANCE
            else:  # to exit
                end = to_block.get_top() + UP * OFFSET_DISTANCE
            
            # 创建箭头，使用完全统一的样式
            # 使用固定长度的箭头头部，而不是比例
            arrow = Arrow(
                start, 
                end, 
                color=ARROW_COLOR, 
                buff=ARROW_BUFF, 
                stroke_width=ARROW_STROKE_WIDTH,
                tip_length=ARROW_TIP_LENGTH,  # 固定箭头头部长度，不使用比例
            )
            # 强制设置统一的样式属性，覆盖任何默认值
            arrow.set_stroke(width=ARROW_STROKE_WIDTH, opacity=ARROW_OPACITY)
            arrow.set_color(ARROW_COLOR)
            
            # 确保箭头头部也使用统一的样式
            if hasattr(arrow, 'tip') and arrow.tip is not None:
                arrow.tip.set_stroke(width=ARROW_STROKE_WIDTH, opacity=ARROW_OPACITY)
                arrow.tip.set_fill(color=ARROW_COLOR, opacity=ARROW_OPACITY)
            
            # 添加标签（对于条件分支）
            if label_text:
                label = Text(
                    label_text, 
                    font_size=LABEL_FONT_SIZE, 
                    color=ARROW_COLOR, 
                    weight=BOLD
                )
                label.set_opacity(ARROW_OPACITY)
                # 将标签放在箭头中间，稍微偏移避免重叠
                label.move_to(arrow.get_center())
                if to_idx == 2:  # true 分支
                    label.shift(LEFT * 0.3)
                else:  # false 分支
                    label.shift(RIGHT * 0.3)
                arrow_group = VGroup(arrow, label)
            else:
                arrow_group = arrow
            
            arrows.add(arrow_group)
        
        # 不添加标题和图例，只显示 CFG
        self.add(*blocks, *arrows)
    
    def create_block_box(self, block_id: str, statements: list, color: str):
        """创建基本块的可视化框"""
        # 块标题（移到块外面）
        title = Text(block_id, font_size=24, color=color, weight=BOLD)
        
        stmt_group = VGroup()
        if statements:
            for stmt in statements:
                stmt_text = Text(stmt, font_size=20, color=WHITE)
                stmt_group.add(stmt_text)
            stmt_group.arrange(DOWN, aligned_edge=LEFT, buff=0.15)
        else:
            stmt_text = Text("(empty)", font_size=20, color=GRAY)
            stmt_group.add(stmt_text)
        
        # 只包含语句内容（不包含标题）
        content = stmt_group
        
        # 创建框（更大的 buff 使块更大）
        box = SurroundingRectangle(
            content,
            color=color,
            buff=0.3,
            corner_radius=0.3,
            stroke_width=3
        )
        
        # 将标题放在框的上方
        title.next_to(box, UP, buff=0.2)
        
        # 组合所有元素：标题在上，框和内容在下
        block = VGroup(title, box, content)
        return block


class BlockMerging(Scene):
    """基本块合并过程演示"""
    def construct(self):
        # 步骤 1: 显示初始基本块
        self.show_initial_blocks()
        self.wait(2)
        
        # 步骤 2: 识别可合并的块
        self.identify_mergeable_blocks()
        self.wait(2)
        
        # 步骤 3: 执行合并
        self.perform_merging()
        self.wait(2)
        
        # 步骤 4: 显示最终合并后的图
        self.show_final_merged_cfg()
        self.wait(3)
    
    def show_initial_blocks(self):
        """显示初始的基本块"""
        title = Text("步骤 1: 初始基本块", font_size=36, color=BLUE)
        title.to_corner(UL, buff=0.5)  # 左上角
        
        # 创建初始块结构
        # entry -> block_1 -> block_2 -> block_3 -> condition -> then/else -> merge -> exit
        blocks = VGroup()
        
        # Entry block
        entry = self.create_block_box("entry_block", ["int x = 0;", "int y = 1;"], GREEN)
        entry.move_to(UP * 3.0 + LEFT * 4.0)
        blocks.add(entry)
        
        # Linear chain blocks (可合并)
        block1 = self.create_block_box("block_1", ["x = x + 1;"], YELLOW)
        block1.move_to(UP * 3.0 + LEFT * 1.5)
        blocks.add(block1)
        
        block2 = self.create_block_box("block_2", ["y = y * 2;"], YELLOW)
        block2.move_to(UP * 3.0 + RIGHT * 1.0)
        blocks.add(block2)
        
        block3 = self.create_block_box("block_3", ["int z = x + y;"], YELLOW)
        block3.move_to(UP * 3.0 + RIGHT * 3.5)
        blocks.add(block3)
        
        # Condition block
        condition = self.create_block_box("block_4", ["if (z > 10)"], ORANGE)
        condition.move_to(UP * 0.5)
        blocks.add(condition)
        
        # Then branch
        then_block = self.create_block_box("block_5", ["x = 100;"], YELLOW)
        then_block.move_to(LEFT * 2.5 + DOWN * 1.5)
        blocks.add(then_block)
        
        # Else branch
        else_block = self.create_block_box("block_6", ["x = 200;"], YELLOW)
        else_block.move_to(RIGHT * 2.5 + DOWN * 1.5)
        blocks.add(else_block)
        
        # Merge block
        merge = self.create_block_box("block_7", ["return x;"], PURPLE)
        merge.move_to(DOWN * 3.0)
        blocks.add(merge)
        
        # Exit block
        exit_block = self.create_block_box("exit_block", [], RED)
        exit_block.move_to(DOWN * 4.5)
        blocks.add(exit_block)
        
        blocks.scale(0.5)
        
        # 创建初始连接
        arrows = VGroup()
        connections = [
            (0, 1, None),      # entry -> block_1
            (1, 2, None),      # block_1 -> block_2
            (2, 3, None),      # block_2 -> block_3
            (3, 4, None),      # block_3 -> condition
            (4, 5, "true"),    # condition -> then
            (4, 6, "false"),  # condition -> else
            (5, 7, None),     # then -> merge
            (6, 7, None),     # else -> merge
            (7, 8, None),     # merge -> exit
        ]
        
        for from_idx, to_idx, label in connections:
            arrow = self.create_arrow(blocks[from_idx], blocks[to_idx], label, from_idx, to_idx)
            arrows.add(arrow)
        
        self.play(Write(title))
        self.play(*[Create(block) for block in blocks], run_time=2)
        self.play(*[Create(arrow) for arrow in arrows], run_time=2)
        
        self.title = title
        self.blocks = blocks
        self.arrows = arrows
    
    def identify_mergeable_blocks(self):
        """识别可合并的块"""
        new_title = Text("步骤 2: 识别可合并的块", font_size=36, color=BLUE)
        new_title.to_corner(UL, buff=0.5)  # 左上角
        
        # 高亮可合并的块：block_1, block_2, block_3 (入度=1, 出度=1)
        mergeable_blocks = [self.blocks[1], self.blocks[2], self.blocks[3]]
        
        # 显示合并规则 - 放到右侧
        rule_text = VGroup(
            Text("合并规则：", font_size=24, color=GREEN),
            Text("• 块A只有一个后继块B", font_size=20, color=WHITE),
            Text("• 块B只有一个前驱块A", font_size=20, color=WHITE),
            Text("• 满足条件即可合并", font_size=20, color=WHITE),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.3)
        rule_text.scale(0.7)
        rule_text.to_edge(RIGHT, buff=0.5)  # 右侧
        
        self.play(Transform(self.title, new_title))
        self.play(Write(rule_text))
        
        # 高亮可合并的块
        highlight_boxes = VGroup()
        for block in mergeable_blocks:
            highlight = SurroundingRectangle(
                block, 
                color=YELLOW, 
                stroke_width=4,
                buff=0.1
            )
            highlight_boxes.add(highlight)
        
        self.play(*[Create(highlight) for highlight in highlight_boxes], run_time=1.5)
        
        # 添加文字标注
        annotations = VGroup()
        for i, block in enumerate(mergeable_blocks):
            annotation = Text(f"可合并", font_size=16, color=YELLOW, weight=BOLD)
            annotation.next_to(block, DOWN, buff=0.3)
            annotations.add(annotation)
        
        self.play(Write(annotations))
        
        self.rule_text = rule_text
        self.highlight_boxes = highlight_boxes
        self.annotations = annotations
    
    def perform_merging(self):
        """执行合并操作"""
        new_title = Text("步骤 3: 执行块合并", font_size=36, color=BLUE)
        new_title.to_corner(UL, buff=0.5)  # 左上角
        
        self.play(Transform(self.title, new_title))
        self.play(FadeOut(self.rule_text), FadeOut(self.highlight_boxes), FadeOut(self.annotations))
        
        # 合并 block_1, block_2, block_3 成一个块
        # 创建合并后的块
        merged_block = self.create_block_box(
            "merged_block", 
            [
                "x = x + 1;",
                "y = y * 2;",
                "int z = x + y;"
            ],
            GREEN
        )
        merged_block.move_to(UP * 3.0)
        merged_block.scale(0.5)
        
        # 动画：先移除旧块和箭头
        blocks_to_remove = [self.blocks[1], self.blocks[2], self.blocks[3]]
        # 需要移除的箭头：entry->1, 1->2, 2->3, 3->condition (原来的 arrows[3])
        arrows_to_remove = [self.arrows[0], self.arrows[1], self.arrows[2], self.arrows[3]]
        
        self.play(
            *[FadeOut(block) for block in blocks_to_remove],
            *[FadeOut(arrow) for arrow in arrows_to_remove],
            run_time=1
        )
        
        # 创建合并后的块
        self.play(Create(merged_block), run_time=1)
        
        # 创建新的连接：entry -> merged -> condition
        new_arrow1 = self.create_arrow(self.blocks[0], merged_block, None, 0, -1)
        new_arrow2 = self.create_arrow(merged_block, self.blocks[4], None, -1, 4)
        
        self.play(Create(new_arrow1), Create(new_arrow2), run_time=1)
        
        # 更新 blocks 和 arrows
        # 保留 entry (0), 添加 merged, 保留 condition (4), then (5), else (6), merge (7), exit (8)
        self.blocks = VGroup(
            self.blocks[0],  # entry
            merged_block,    # merged
            self.blocks[4],  # condition
            self.blocks[5],  # then
            self.blocks[6],  # else
            self.blocks[7],  # merge
            self.blocks[8],  # exit
        )
        
        # 更新 arrows: 添加新的 entry->merged->condition，保留 condition 之后的箭头
        # 注意：原来的 arrows[3] 是 block_3->condition，已经被移除了
        # 所以从 arrows[4] 开始才是 condition 之后的箭头
        self.arrows = VGroup(
            new_arrow1,      # entry -> merged
            new_arrow2,      # merged -> condition
            self.arrows[4],  # condition -> then (原来的 arrows[4]，但索引因为移除了 arrows[3] 需要调整)
            self.arrows[5],  # condition -> else (原来的 arrows[5])
            self.arrows[6],  # then -> merge (原来的 arrows[6])
            self.arrows[7],  # else -> merge (原来的 arrows[7])
            self.arrows[8],  # merge -> exit (原来的 arrows[8])
        )
        
        self.merged_block = merged_block
    
    def show_final_merged_cfg(self):
        """显示最终合并后的 CFG"""
        new_title = Text("步骤 4: 合并后的 CFG", font_size=36, color=BLUE)
        new_title.to_corner(UL, buff=0.5)  # 左上角
        
        self.play(Transform(self.title, new_title))
        
        # 高亮显示最终结构
        self.play(
            *[block.animate.set_opacity(1.0) for block in self.blocks],
            *[arrow.animate.set_opacity(1.0) for arrow in self.arrows],
            run_time=1.5
        )
        
        # 添加合并说明 - 放到右侧，使用多个独立的 Text 对象以控制行间距
        note_lines = VGroup(
            Text("合并完成：", font_size=20, color=GREEN),
            Text("block_1, block_2, block_3", font_size=20, color=GREEN),
            Text("已合并为一个块", font_size=20, color=GREEN),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.4)  # 使用 buff=0.4 增加行间距
        note_lines.to_edge(RIGHT, buff=0.5)  # 右侧
        self.play(Write(note_lines))
        
        self.note = note_lines
    
    def create_block_box(self, block_id: str, statements: list, color: str):
        """创建基本块的可视化框"""
        # 块标题（移到块外面）
        title = Text(block_id, font_size=24, color=color, weight=BOLD)
        
        stmt_group = VGroup()
        if statements:
            for stmt in statements:
                stmt_text = Text(stmt, font_size=20, color=WHITE)
                stmt_group.add(stmt_text)
            stmt_group.arrange(DOWN, aligned_edge=LEFT, buff=0.15)
        else:
            stmt_text = Text("(empty)", font_size=20, color=GRAY)
            stmt_group.add(stmt_text)
        
        # 只包含语句内容（不包含标题）
        content = stmt_group
        
        # 创建框（更大的 buff 使块更大）
        box = SurroundingRectangle(
            content,
            color=color,
            buff=0.3,
            corner_radius=0.3,
            stroke_width=3
        )
        
        # 将标题放在框的上方
        title.next_to(box, UP, buff=0.2)
        
        # 组合所有元素：标题在上，框和内容在下
        block = VGroup(title, box, content)
        return block
    
    def create_arrow(self, from_block, to_block, label_text, from_idx, to_idx):
        """创建箭头连接"""
        ARROW_COLOR = BLUE
        ARROW_STROKE_WIDTH = 2.5
        ARROW_BUFF = 0.15
        ARROW_OPACITY = 1.0
        ARROW_TIP_LENGTH = 0.2
        OFFSET_DISTANCE = 0.1
        
        # 计算起点
        if from_idx == 0:  # entry
            start = from_block.get_bottom() + DOWN * OFFSET_DISTANCE
        elif from_idx == 1 or from_idx == -1:  # merged block or original block_1
            start = from_block.get_bottom() + DOWN * OFFSET_DISTANCE
        elif from_idx == 4:  # condition
            if to_idx == 5:  # to then
                start = from_block.get_left() + LEFT * OFFSET_DISTANCE
            else:  # to else
                start = from_block.get_right() + RIGHT * OFFSET_DISTANCE
        elif from_idx in [5, 6]:  # then/else
            start = from_block.get_bottom() + DOWN * OFFSET_DISTANCE
        else:  # merge
            start = from_block.get_bottom() + DOWN * OFFSET_DISTANCE
        
        # 计算终点
        if to_idx == 4:  # to condition
            end = to_block.get_top() + UP * OFFSET_DISTANCE
        elif to_idx in [5, 6]:  # to then/else
            end = to_block.get_top() + UP * OFFSET_DISTANCE
        elif to_idx == 7:  # to merge
            end = to_block.get_top() + UP * OFFSET_DISTANCE
        elif to_idx == 8:  # to exit
            end = to_block.get_top() + UP * OFFSET_DISTANCE
        else:  # to merged block
            end = to_block.get_top() + UP * OFFSET_DISTANCE
        
        arrow = Arrow(
            start,
            end,
            color=ARROW_COLOR,
            buff=ARROW_BUFF,
            stroke_width=ARROW_STROKE_WIDTH,
            tip_length=ARROW_TIP_LENGTH,
        )
        arrow.set_stroke(width=ARROW_STROKE_WIDTH, opacity=ARROW_OPACITY)
        arrow.set_color(ARROW_COLOR)
        
        if label_text:
            label = Text(
                label_text,
                font_size=14,
                color=ARROW_COLOR,
                weight=BOLD
            )
            label.set_opacity(ARROW_OPACITY)
            label.move_to(arrow.get_center())
            if to_idx == 5:  # true branch
                label.shift(LEFT * 0.25)
            else:  # false branch
                label.shift(RIGHT * 0.25)
            return VGroup(arrow, label)
        else:
            return arrow


# 生成所有步骤的场景
class AllSteps(Scene):
    """生成所有步骤的图片"""
    def construct(self):
        # 这个场景可以用于批量生成所有步骤
        # 实际使用时，分别运行各个场景类
        pass




