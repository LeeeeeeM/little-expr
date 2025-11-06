"""
Manim 动画：展示从源代码到 AST 的解析过程

使用示例：
    # 生成 AST 生成过程的视频
    uv run manim -pql ast_generation.py ASTGeneration
"""

from manim import *


class ASTGeneration(Scene):
    """展示从源代码到 AST 的解析过程"""
    
    def construct(self):
        # 源代码
        source_code = """int checkGrade() {
    int grade = 0;
    int score = 70;
    if (score >= 90) {
        grade = 1;
    } else {
        grade = 2;
    }
    return grade;
}"""
        
        # 步骤 1: 显示源代码
        self.show_source_code(source_code)
        self.wait(2)
        
        # 步骤 2: 词法分析（Tokenization）
        self.show_tokenization()
        self.wait(2)
        
        # 步骤 3: 语法分析（Parsing）
        self.show_parsing()
        self.wait(2)
        
        # 步骤 4: AST 构建
        self.show_ast_building()
        self.wait(3)
    
    def show_source_code(self, code: str):
        """显示源代码"""
        title = Text("步骤 1: 源代码", font_size=36, color=BLUE)
        title.to_corner(UL, buff=0.5)
        
        # 格式化代码显示，正确处理缩进
        code_lines = code.strip().split('\n')
        code_group = VGroup()
        
        # 计算最小缩进（用于统一对齐）
        min_indent = min([len(line) - len(line.lstrip()) for line in code_lines if line.strip()], default=0)
        
        # 处理每一行，确保缩进正确显示
        for line in code_lines:
            if not line.strip():  # 空行
                line_text = Text("", font_size=22, font="monospace", color=WHITE)
            else:
                # 计算相对缩进（减去最小缩进，使第一行从左边开始）
                current_indent = len(line) - len(line.lstrip())
                relative_indent = current_indent - min_indent
                # 使用 4 个空格作为一个缩进级别
                indent_spaces = "    " * (relative_indent // 4)
                # 获取去除前导空格后的内容
                line_content = line.lstrip()
                # 重新组合：缩进 + 内容
                formatted_line = indent_spaces + line_content
                
                line_text = Text(formatted_line, font_size=22, font="monospace", color=WHITE)
            code_group.add(line_text)
        
        # 使用 aligned_edge=LEFT 确保所有行左对齐
        code_group.arrange(DOWN, aligned_edge=LEFT, buff=0.25)
        code_group.scale(0.8)
        code_group.move_to(ORIGIN + DOWN * 0.3)  # 稍微下移，为标题留出空间
        
        # 添加代码框
        code_box = SurroundingRectangle(
            code_group,
            color=BLUE,
            buff=0.3,
            corner_radius=0.2,
            stroke_width=2
        )
        
        self.play(Write(title))
        self.play(Create(code_box), Write(code_group), run_time=2)
        
        self.title = title
        self.code_group = code_group
        self.code_box = code_box
    
    def show_tokenization(self):
        """展示词法分析过程"""
        new_title = Text("步骤 2: 词法分析 (Tokenization)", font_size=36, color=GREEN)
        new_title.to_corner(UL, buff=0.5)
        
        self.play(Transform(self.title, new_title))
        self.play(FadeOut(self.code_box), FadeOut(self.code_group))
        
        # 展示关键 tokens
        tokens = [
            ("int", "关键字"),
            ("checkGrade", "标识符"),
            ("(", "分隔符"),
            (")", "分隔符"),
            ("{", "分隔符"),
            ("int", "关键字"),
            ("grade", "标识符"),
            ("=", "运算符"),
            ("0", "字面量"),
            (";", "分隔符"),
            ("if", "关键字"),
            ("(", "分隔符"),
            ("score", "标识符"),
            (">=", "运算符"),
            ("90", "字面量"),
            (")", "分隔符"),
            ("{", "分隔符"),
            ("grade", "标识符"),
            ("=", "运算符"),
            ("1", "字面量"),
            (";", "分隔符"),
            ("}", "分隔符"),
            ("else", "关键字"),
            ("{", "分隔符"),
            ("grade", "标识符"),
            ("=", "运算符"),
            ("2", "字面量"),
            (";", "分隔符"),
            ("}", "分隔符"),
            ("return", "关键字"),
            ("grade", "标识符"),
            (";", "分隔符"),
            ("}", "分隔符"),
        ]
        
        # 创建 token 显示（分多行显示，增大字体和间距避免重叠）
        token_groups = []
        current_line = VGroup()
        x_start = -6
        y_pos = 2.5
        x_pos = x_start
        tokens_per_line = 6  # 每行最多 6 个 token，避免重叠
        tokens_in_line = 0
        
        for token, token_type in tokens:
            # 根据类型设置颜色
            if token_type == "关键字":
                color = YELLOW
            elif token_type == "标识符":
                color = GREEN
            elif token_type == "运算符":
                color = RED
            elif token_type == "字面量":
                color = BLUE
            else:
                color = WHITE
            
            # 增大 token 字体
            token_text = Text(
                token,
                font_size=24,
                font="monospace",
                color=color
            )
            token_text.move_to([x_pos, y_pos, 0])
            
            # 增大类型标注字体
            type_text = Text(
                token_type,
                font_size=14,
                color=GRAY
            )
            type_text.next_to(token_text, DOWN, buff=0.1)
            
            token_group = VGroup(token_text, type_text)
            current_line.add(token_group)
            
            # 增加水平间距，避免重叠
            x_pos += 2.0
            tokens_in_line += 1
            
            # 每行最多 tokens_per_line 个 token，然后换行
            if tokens_in_line >= tokens_per_line or x_pos > 6:
                x_pos = x_start
                y_pos -= 1.2  # 增加垂直间距
                tokens_in_line = 0
                token_groups.append(current_line)
                current_line = VGroup()
        
        if len(current_line) > 0:
            token_groups.append(current_line)
        
        # 动画显示 tokens（不缩放，保持原始大小）
        all_tokens = VGroup(*[item for group in token_groups for item in group])
        # 稍微缩小以适应屏幕，但保持较大尺寸
        all_tokens.scale(0.8)
        all_tokens.move_to(ORIGIN + DOWN * 0.5)  # 稍微下移，为标题留出空间
        
        # 分批显示
        for i, group in enumerate(token_groups):
            self.play(*[Write(item) for item in group], run_time=0.3)
        
        self.token_groups = token_groups
    
    def show_parsing(self):
        """展示语法分析过程"""
        new_title = Text("步骤 3: 语法分析 (Parsing)", font_size=36, color=ORANGE)
        new_title.to_corner(UL, buff=0.5)
        
        self.play(Transform(self.title, new_title))
        self.play(FadeOut(*[item for group in self.token_groups for item in group]))
        
        # 展示解析规则（增大字体）
        rules = VGroup(
            Text("解析规则：", font_size=28, color=GREEN),
            Text("1. FunctionDeclaration → int IDENTIFIER ( ) { BlockStatement }", font_size=24, color=WHITE),
            Text("2. BlockStatement → Statement*", font_size=24, color=WHITE),
            Text("3. Statement → VariableDeclaration | IfStatement | ReturnStatement", font_size=24, color=WHITE),
            Text("4. VariableDeclaration → int IDENTIFIER [= Expression];", font_size=24, color=WHITE),
            Text("5. IfStatement → if ( Expression ) Statement [else Statement]", font_size=24, color=WHITE),
            Text("6. ReturnStatement → return [Expression];", font_size=24, color=WHITE),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.4)
        
        rules.scale(0.85)  # 稍微缩小以适应屏幕，但保持较大尺寸
        rules.move_to(ORIGIN)
        
        self.play(Write(rules), run_time=3)
        
        self.rules = rules
    
    def show_ast_building(self):
        """展示 AST 构建过程"""
        new_title = Text("步骤 4: AST 构建", font_size=36, color=PURPLE)
        new_title.to_corner(UL, buff=0.5)
        
        self.play(Transform(self.title, new_title))
        self.play(FadeOut(self.rules))
        
        # 初始化连接列表
        self.connections = []
        
        # 创建 AST 节点（树形结构）
        # 根节点：Program
        program = self.create_ast_node("Program", BLUE, UP * 3.5)
        
        # FunctionDeclaration
        func_decl = self.create_ast_node("FunctionDeclaration\ncheckGrade", GREEN, UP * 2.5)
        arrow1 = self.connect_nodes(program, func_decl)
        
        # BlockStatement
        block_stmt = self.create_ast_node("BlockStatement", YELLOW, UP * 1.5)
        arrow2 = self.connect_nodes(func_decl, block_stmt)
        
        # BlockStatement 的子节点：增加水平间距避免重叠
        # VariableDeclaration: int grade = 0;
        var_decl1 = self.create_ast_node("VariableDeclaration\nint grade = 0", ORANGE, LEFT * 4.5 + DOWN * 0.5)
        arrow3 = self.connect_nodes(block_stmt, var_decl1)
        
        # VariableDeclaration: int score = 70;
        var_decl2 = self.create_ast_node("VariableDeclaration\nint score = 70", ORANGE, LEFT * 1.5 + DOWN * 0.5)
        arrow4 = self.connect_nodes(block_stmt, var_decl2)
        
        # IfStatement（放在中间偏右，避免与 var_decl2 重叠）
        if_stmt = self.create_ast_node("IfStatement", RED, RIGHT * 1.5 + DOWN * 0.5)
        arrow5 = self.connect_nodes(block_stmt, if_stmt)
        
        # ReturnStatement（放在最右边）
        return_stmt = self.create_ast_node("ReturnStatement\nreturn grade", BLUE, RIGHT * 4.5 + DOWN * 0.5)
        arrow9 = self.connect_nodes(block_stmt, return_stmt)
        
        # IfStatement 的子节点：condition 在 if_stmt 正下方，then/else 在 condition 下方左右分布
        # Condition: score >= 90（在 if_stmt 正下方）
        condition = self.create_ast_node("BinaryExpression\n>=\nscore, 90", PURPLE, RIGHT * 1.5 + DOWN * 1.8)
        arrow6 = self.connect_nodes(if_stmt, condition)
        
        # Then branch: grade = 1;（在 condition 下方左侧）
        then_branch = self.create_ast_node("AssignmentStatement\ngrade = 1", GREEN, RIGHT * 0.3 + DOWN * 3.2)
        arrow7 = self.connect_nodes(if_stmt, then_branch)
        
        # Else branch: grade = 2;（在 condition 下方右侧）
        else_branch = self.create_ast_node("AssignmentStatement\ngrade = 2", GREEN, RIGHT * 2.7 + DOWN * 3.2)
        arrow8 = self.connect_nodes(if_stmt, else_branch)
        
        # 动画显示 AST
        all_nodes = [
            program, func_decl, block_stmt,
            var_decl1, var_decl2, if_stmt,
            condition, then_branch, else_branch, return_stmt
        ]
        
        all_arrows = [arrow1, arrow2, arrow3, arrow4, arrow5, arrow6, arrow7, arrow8, arrow9]
        
        # 按层级显示
        self.play(Create(program), run_time=0.5)
        self.play(Create(func_decl), Create(arrow1), run_time=0.5)
        self.play(Create(block_stmt), Create(arrow2), run_time=0.5)
        
        # 显示 BlockStatement 的子节点
        self.play(
            Create(var_decl1), Create(arrow3),
            Create(var_decl2), Create(arrow4),
            run_time=1
        )
        
        self.play(
            Create(if_stmt), Create(arrow5),
            run_time=0.5
        )
        
        # IfStatement 的子节点
        self.play(
            Create(condition), Create(arrow6),
            Create(then_branch), Create(arrow7),
            Create(else_branch), Create(arrow8),
            run_time=1.5
        )
        
        self.play(
            Create(return_stmt), Create(arrow9),
            run_time=0.5
        )
        
        # 保存连接以便后续使用
        self.ast_nodes = all_nodes
        self.ast_arrows = all_arrows
    
    def create_ast_node(self, text: str, color: str, position: np.ndarray):
        """创建 AST 节点"""
        # 分割文本为多行
        lines = text.split('\n')
        text_group = VGroup()
        for line in lines:
            line_text = Text(line, font_size=18, color=WHITE, font="monospace")
            text_group.add(line_text)
        
        text_group.arrange(DOWN, aligned_edge=LEFT, buff=0.12)
        
        # 创建框（增加内边距使节点更大更清晰）
        box = SurroundingRectangle(
            text_group,
            color=color,
            buff=0.25,
            corner_radius=0.25,
            stroke_width=2.5
        )
        
        node = VGroup(box, text_group)
        node.move_to(position)
        node.scale(0.55)  # 稍微缩小以适应更大的布局
        
        return node
    
    def connect_nodes(self, parent, child):
        """连接两个节点（创建箭头）"""
        # 计算连接点
        parent_bottom = parent.get_bottom()
        child_top = child.get_top()
        
        # 创建箭头
        arrow = Arrow(
            parent_bottom,
            child_top,
            color=GRAY,
            buff=0.1,
            stroke_width=1.5,
            tip_length=0.15
        )
        
        return arrow

