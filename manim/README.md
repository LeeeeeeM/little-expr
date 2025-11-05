# CFG 生成过程动画

使用 Manim 生成展示从源代码到控制流图（CFG）生成过程的动画视频。

## 安装 Manim（使用 uv）

```bash
# 使用 uv 安装 manim
uv pip install manim
```

## 使用方法

### 1. 预览模式（低质量，快速预览）

```bash
cd manim

# 使用 uv 运行 manim
uv run manim -pql cfg_animation.py CFGGeneration

# 或者如果已经激活了 uv 环境
manim -pql cfg_animation.py CFGGeneration
```

参数说明：
- `-p`: 渲染完成后自动播放
- `-ql`: 低质量（480p，快速预览）
- `cfg_animation.py`: 脚本文件
- `CFGGeneration`: 场景类名

### 2. 高质量渲染

```bash
# 高质量渲染（1080p）
uv run manim -qh cfg_animation.py CFGGeneration

# 4K 质量渲染
uv run manim -qk cfg_animation.py CFGGeneration
```

### 3. 只渲染不播放

```bash
# 移除 -p 参数
uv run manim -ql cfg_animation.py CFGGeneration
```

### 4. 使用 uv 的虚拟环境

如果 uv 创建了虚拟环境，可以这样激活：

```bash
# 激活虚拟环境（如果 uv 创建了）
source .venv/bin/activate  # 或 uv venv 创建的路径

# 然后直接运行
manim -pql cfg_animation.py CFGGeneration
```

## 动画内容

动画展示了以下 6 个步骤：

1. **源代码展示**: 显示示例函数代码
2. **AST 解析**: 展示源代码如何被解析为抽象语法树
3. **基本块边界识别**: 说明如何识别基本块的边界（入口、控制流语句、出口）
4. **构建基本块**: 逐步创建每个基本块
5. **建立控制流连接**: 展示如何连接基本块（前驱/后继关系）
6. **最终 CFG**: 展示完整的控制流图

## 自定义示例代码

要修改示例代码，编辑 `cfg_animation.py` 中的 `source_code` 变量：

```python
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
```

## 输出位置

渲染完成后，视频文件会保存在：

```
manim/media/videos/cfg_animation/分辨率/CFGGeneration.mp4
```

例如：
```
manim/media/videos/cfg_animation/480p15/CFGGeneration.mp4
```

## 依赖项

如果遇到问题，可能需要安装系统依赖：

```bash
# macOS 上安装系统依赖
brew install ffmpeg
brew install --cask mactex  # 可选，用于 LaTeX 渲染
```

## 常见问题

### 1. 找不到 manim 命令

如果 `manim` 命令找不到，使用：
```bash
uv run manim -pql cfg_animation.py CFGGeneration
```

### 2. 检查 manim 是否安装成功

```bash
uv run python -c "import manim; print(manim.__version__)"
```

### 3. 使用 uv 的虚拟环境

如果 uv 自动管理虚拟环境，可以直接运行：
```bash
uv run manim -pql cfg_animation.py CFGGeneration
```

## 生成静态图片

如果需要生成静态图片（PNG）而不是视频，可以使用 `-s` 参数：

```bash
# 生成"识别基本块边界"步骤的图片
uv run manim -s cfg_static_images.py IdentifyBasicBlocks

# 生成"构建基本块"步骤的图片
uv run manim -s cfg_static_images.py BuildBasicBlocks

# 生成"最终 CFG"的图片
uv run manim -s cfg_static_images.py FinalCFG
```

生成的图片会保存在：
```
manim/media/images/cfg_static_images/分辨率/场景名.png
```

例如：
```
manim/media/images/cfg_static_images/1080p60/IdentifyBasicBlocks.png
```

## 扩展建议

可以进一步扩展动画，添加：

- 更复杂的控制流结构（while 循环、for 循环）
- 嵌套作用域的可视化
- 基本块合并优化过程
- 代码高亮与块的对应关系


使用 Manim 生成展示从源代码到控制流图（CFG）生成过程的动画视频。

## 安装 Manim（使用 uv）

```bash
# 使用 uv 安装 manim
uv pip install manim
```

## 使用方法

### 1. 预览模式（低质量，快速预览）

```bash
cd manim

# 使用 uv 运行 manim
uv run manim -pql cfg_animation.py CFGGeneration

# 或者如果已经激活了 uv 环境
manim -pql cfg_animation.py CFGGeneration
```

参数说明：
- `-p`: 渲染完成后自动播放
- `-ql`: 低质量（480p，快速预览）
- `cfg_animation.py`: 脚本文件
- `CFGGeneration`: 场景类名

### 2. 高质量渲染

```bash
# 高质量渲染（1080p）
uv run manim -qh cfg_animation.py CFGGeneration

# 4K 质量渲染
uv run manim -qk cfg_animation.py CFGGeneration
```

### 3. 只渲染不播放

```bash
# 移除 -p 参数
uv run manim -ql cfg_animation.py CFGGeneration
```

### 4. 使用 uv 的虚拟环境

如果 uv 创建了虚拟环境，可以这样激活：

```bash
# 激活虚拟环境（如果 uv 创建了）
source .venv/bin/activate  # 或 uv venv 创建的路径

# 然后直接运行
manim -pql cfg_animation.py CFGGeneration
```

## 动画内容

动画展示了以下 6 个步骤：

1. **源代码展示**: 显示示例函数代码
2. **AST 解析**: 展示源代码如何被解析为抽象语法树
3. **基本块边界识别**: 说明如何识别基本块的边界（入口、控制流语句、出口）
4. **构建基本块**: 逐步创建每个基本块
5. **建立控制流连接**: 展示如何连接基本块（前驱/后继关系）
6. **最终 CFG**: 展示完整的控制流图

## 自定义示例代码

要修改示例代码，编辑 `cfg_animation.py` 中的 `source_code` 变量：

```python
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
```

## 输出位置

渲染完成后，视频文件会保存在：

```
manim/media/videos/cfg_animation/分辨率/CFGGeneration.mp4
```

例如：
```
manim/media/videos/cfg_animation/480p15/CFGGeneration.mp4
```

## 依赖项

如果遇到问题，可能需要安装系统依赖：

```bash
# macOS 上安装系统依赖
brew install ffmpeg
brew install --cask mactex  # 可选，用于 LaTeX 渲染
```

## 常见问题

### 1. 找不到 manim 命令

如果 `manim` 命令找不到，使用：
```bash
uv run manim -pql cfg_animation.py CFGGeneration
```

### 2. 检查 manim 是否安装成功

```bash
uv run python -c "import manim; print(manim.__version__)"
```

### 3. 使用 uv 的虚拟环境

如果 uv 自动管理虚拟环境，可以直接运行：
```bash
uv run manim -pql cfg_animation.py CFGGeneration
```

## 生成静态图片

如果需要生成静态图片（PNG）而不是视频，可以使用 `-s` 参数：

```bash
# 生成"识别基本块边界"步骤的图片
uv run manim -s cfg_static_images.py IdentifyBasicBlocks

# 生成"构建基本块"步骤的图片
uv run manim -s cfg_static_images.py BuildBasicBlocks

# 生成"最终 CFG"的图片
uv run manim -s cfg_static_images.py FinalCFG
```

生成的图片会保存在：
```
manim/media/images/cfg_static_images/分辨率/场景名.png
```

例如：
```
manim/media/images/cfg_static_images/1080p60/IdentifyBasicBlocks.png
```

## 扩展建议

可以进一步扩展动画，添加：

- 更复杂的控制流结构（while 循环、for 循环）
- 嵌套作用域的可视化
- 基本块合并优化过程
- 代码高亮与块的对应关系

