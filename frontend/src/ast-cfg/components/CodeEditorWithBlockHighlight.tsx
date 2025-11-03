import React, { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import type { BlockHighlight } from '../utils/blockHighlight';

interface CodeEditorWithBlockHighlightProps {
  value: string;
  onChange: (value: string) => void;
  blockHighlights: BlockHighlight[];
  selectedBlockId?: string | null;
  isValid?: boolean;
  errorMessage?: string;
  successMessage?: string;
}

/**
 * 支持 CFG 块背景高亮的代码编辑器（基于 Monaco Editor）
 */
export const CodeEditorWithBlockHighlight: React.FC<CodeEditorWithBlockHighlightProps> = ({
  value,
  onChange,
  blockHighlights,
  selectedBlockId,
  isValid = true,
  errorMessage,
  successMessage,
}) => {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);

  // 处理编辑器挂载
  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    // 应用初始高亮
    updateDecorations(editor, monaco, blockHighlights, selectedBlockId);
  };

  // 更新装饰（行背景高亮）
  const updateDecorations = (
    editor: any,
    monaco: any,
    highlights: BlockHighlight[],
    selectedId?: string | null
  ) => {
    if (!editor || !monaco) {
      return;
    }

    const decorations: any[] = [];
    const model = editor.getModel();
    if (!model) {
      return;
    }

    const lineCount = model.getLineCount();

    // 始终应用所有块的 decoration，因为同一行可能被多个块覆盖
    // 实际的背景色显示由 CSS 控制（选中时其他块透明，未选中时显示所有块的颜色）
    for (const highlight of highlights) {
      // Monaco Editor 的行号从 1 开始
      const startLine = Math.max(1, Math.min(highlight.startLine, lineCount));
      const endLine = Math.max(1, Math.min(highlight.endLine, lineCount));

      if (startLine > lineCount || endLine > lineCount) {
        console.warn(`[MonacoDecoration] Line range out of bounds:`, {
          blockId: highlight.blockId,
          startLine,
          endLine,
          lineCount,
        });
        continue;
      }

      const safeClassName = `cfg-block-highlight-${highlight.blockId.replace(/[^a-zA-Z0-9]/g, '-')}`;
      const isSelected = selectedId === highlight.blockId;

      decorations.push({
        range: new monaco.Range(
          startLine,
          1,
          endLine,
          Number.MAX_SAFE_INTEGER
        ),
        options: {
          className: safeClassName,
          isWholeLine: true,
          glyphMarginClassName: safeClassName,
          inlineClassName: isSelected ? `${safeClassName}-selected` : safeClassName, // 选中时使用特殊类名
          minimap: {
            color: isSelected ? '#000000' : highlight.color, // 选中时使用黑色
            position: monaco.editor.MinimapPosition.Inline,
          },
          overviewRuler: {
            color: isSelected ? '#000000' : highlight.color,
            position: monaco.editor.OverviewRulerLane.Full,
          },
        },
      });
    }

    // 移除旧的装饰并添加新的
    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      decorations
    );
  };

  // 当 blockHighlights 或 selectedBlockId 改变时更新装饰
  // 注意：即使有选中块，我们也需要应用所有块的 decoration，因为同一行可能被多个块覆盖
  // 实际的显示由 CSS 控制（选中时其他块透明，未选中时显示所有块的颜色）
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      // 始终应用所有块的 decoration，显示由 CSS 控制
      updateDecorations(editorRef.current, monacoRef.current, blockHighlights, selectedBlockId);
    }
  }, [blockHighlights, selectedBlockId]);

  // 当选中块改变时，滚动编辑器到对应位置并居中显示
  useEffect(() => {
    if (!selectedBlockId || !editorRef.current || blockHighlights.length === 0) {
      return;
    }

    // 找到选中的块的高亮信息
    const selectedHighlight = blockHighlights.find(h => h.blockId === selectedBlockId);
    if (!selectedHighlight) {
      return;
    }

    // 计算中心行号（取起始行和结束行的中间值）
    const centerLine = Math.floor((selectedHighlight.startLine + selectedHighlight.endLine) / 2);
    
    // 滚动到该行并居中显示
    editorRef.current.revealLineInCenter(centerLine);
  }, [selectedBlockId, blockHighlights]);

  // 动态注入 CSS 样式来设置每个块的行背景颜色
  useEffect(() => {
    const styleId = 'monaco-cfg-highlight-styles';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement;

    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    // 为每个块生成 CSS 规则
           let css = '';
           
           // 如果有选中的块，需要清除所有其他块的背景色
           if (selectedBlockId) {
             // 只保留选中块的样式
             const selectedHighlight = blockHighlights.find(h => h.blockId === selectedBlockId);
             if (selectedHighlight) {
               const safeClassName = `cfg-block-highlight-${selectedHighlight.blockId.replace(/[^a-zA-Z0-9]/g, '-')}`;
               const backgroundColor = '#000000';
               const textColor = '#ffffff';
               
               css += `
                 .monaco-editor .view-overlays .${safeClassName} {
                   background-color: ${backgroundColor} !important;
                 }
                 .monaco-editor .view-line .${safeClassName} {
                   background-color: ${backgroundColor} !important;
                 }
                 .monaco-editor .view-zones .${safeClassName} {
                   background-color: ${backgroundColor} !important;
                 }
                 .monaco-editor .current-line .${safeClassName} {
                   background-color: ${backgroundColor} !important;
                 }
                 .monaco-editor .${safeClassName}-selected {
                   color: ${textColor} !important;
                 }
                 .monaco-editor .view-line .${safeClassName}-selected {
                   color: ${textColor} !important;
                 }
                 .monaco-editor .view-line .${safeClassName}-selected .mtk1,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk2,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk3,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk4,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk5,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk6,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk7,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk8,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk9,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk10,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk11,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk12,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk13,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk14,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk15,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk16,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk17,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk18,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk19,
                 .monaco-editor .view-line .${safeClassName}-selected .mtk20 {
                   color: ${textColor} !important;
                 }
               `;
             }
             
             // 清除所有其他块的背景色
             for (const highlight of blockHighlights) {
               if (highlight.blockId !== selectedBlockId) {
                 const safeClassName = `cfg-block-highlight-${highlight.blockId.replace(/[^a-zA-Z0-9]/g, '-')}`;
                 css += `
                   .monaco-editor .view-overlays .${safeClassName} {
                     background-color: transparent !important;
                   }
                   .monaco-editor .view-line .${safeClassName} {
                     background-color: transparent !important;
                   }
                   .monaco-editor .view-zones .${safeClassName} {
                     background-color: transparent !important;
                   }
                   .monaco-editor .current-line .${safeClassName} {
                     background-color: transparent !important;
                   }
                 `;
               }
             }
           } else {
             // 没有选中块时，显示所有块的颜色
             for (const highlight of blockHighlights) {
               const safeClassName = `cfg-block-highlight-${highlight.blockId.replace(/[^a-zA-Z0-9]/g, '-')}`;
               const backgroundColor = highlight.color;
               
               css += `
                 .monaco-editor .view-overlays .${safeClassName} {
                   background-color: ${backgroundColor} !important;
                 }
                 .monaco-editor .view-line .${safeClassName} {
                   background-color: ${backgroundColor} !important;
                 }
                 .monaco-editor .view-zones .${safeClassName} {
                   background-color: ${backgroundColor} !important;
                 }
                 .monaco-editor .current-line .${safeClassName} {
                   background-color: ${backgroundColor} !important;
                 }
               `;
             }
           }

           styleElement.textContent = css;
         }, [blockHighlights, selectedBlockId]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900">源代码编辑器</h2>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${isValid ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-sm text-gray-600">
            {isValid ? '语法正确' : '语法错误'}
          </span>
        </div>
      </div>

      <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
        {/* Monaco Editor */}
        <div className="flex-1 border rounded-lg overflow-hidden" style={{
          borderColor: isValid ? '#d1d5db' : '#ef4444',
        }}>
          <Editor
            height="100%"
            defaultLanguage="c"
            value={value}
            onChange={(newValue) => onChange(newValue || '')}
            onMount={handleEditorDidMount}
            theme="vs"
            options={{
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              fontSize: 14,
              lineNumbers: 'on',
              wordWrap: 'on',
              automaticLayout: true,
              readOnly: false,
              renderLineHighlight: 'line',
            }}
          />
        </div>

        {/* 错误/成功消息 */}
        {errorMessage && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md flex-shrink-0">
            <p className="text-sm text-red-600">{errorMessage}</p>
          </div>
        )}

        {successMessage && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md flex-shrink-0">
            <p className="text-sm text-green-600">{successMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
};
