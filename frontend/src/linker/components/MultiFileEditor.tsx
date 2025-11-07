import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';

export interface FileContent {
  name: string;
  content: string;
}

interface MultiFileEditorProps {
  files: FileContent[];
  onFilesChange: (files: FileContent[]) => void;
  isValid?: boolean;
  errorMessage?: string;
  successMessage?: string;
}

/**
 * 支持多文件编辑的代码编辑器（带文件树）
 */
interface FileTreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: FileTreeNode[];
  fileIndex?: number; // 如果是文件，记录在 files 数组中的索引
}

export const MultiFileEditor: React.FC<MultiFileEditorProps> = ({
  files,
  onFilesChange,
  isValid = true,
  errorMessage,
  successMessage,
}) => {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  // 默认展开所有文件夹
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    const expanded = new Set<string>();
    files.forEach(file => {
      const parts = file.name.split('/');
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i]!;
        expanded.add(currentPath);
      }
    });
    return expanded;
  });
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  // 构建文件树结构
  const buildFileTree = (): FileTreeNode[] => {
    const root: FileTreeNode = { name: '', path: '', isFolder: true, children: [] };
    const pathToNode = new Map<string, FileTreeNode>();
    pathToNode.set('', root);

    files.forEach((file, index) => {
      const parts = file.name.split('/');
      let currentPath = '';
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        const isLast = i === parts.length - 1;
        const newPath = currentPath ? `${currentPath}/${part}` : part;
        
        if (!pathToNode.has(newPath)) {
          const node: FileTreeNode = {
            name: part,
            path: newPath,
            isFolder: !isLast,
            children: [],
            fileIndex: isLast ? index : undefined,
          };
          pathToNode.set(newPath, node);
          
          const parent = pathToNode.get(currentPath);
          if (parent) {
            parent.children.push(node);
          }
        }
        
        currentPath = newPath;
      }
    });

    // 对每个节点的子节点排序：文件夹在前，文件在后，然后按名称排序
    const sortNode = (node: FileTreeNode) => {
      node.children.sort((a, b) => {
        if (a.isFolder !== b.isFolder) {
          return a.isFolder ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortNode);
    };
    sortNode(root);

    return root.children;
  };

  const fileTree = buildFileTree();

  // 当文件列表变化时，自动展开所有文件夹
  useEffect(() => {
    const expanded = new Set<string>();
    files.forEach(file => {
      const parts = file.name.split('/');
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i]!;
        expanded.add(currentPath);
      }
    });
    setExpandedFolders(expanded);
  }, [files]);

  // 切换文件夹展开/折叠
  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  // 渲染文件树节点
  const renderTreeNode = (node: FileTreeNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(node.path);
    const isActive = node.fileIndex === activeFileIndex;

    if (node.isFolder) {
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleFolder(node.path)}
            className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center space-x-1 ${
              'text-gray-700 hover:bg-gray-100'
            }`}
            style={{ paddingLeft: `${12 + level * 16}px` }}
          >
            <svg
              className={`w-4 h-4 flex-shrink-0 ${isExpanded ? 'text-blue-600' : 'text-gray-500'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            <span>{node.name}</span>
          </button>
          {isExpanded && node.children.map(child => renderTreeNode(child, level + 1))}
        </div>
      );
    } else {
      return (
        <button
          key={node.path}
          onClick={() => node.fileIndex !== undefined && handleFileSelect(node.fileIndex)}
          className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center space-x-1 ${
            isActive
              ? 'bg-blue-100 text-blue-700 font-medium'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          style={{ paddingLeft: `${12 + level * 16}px` }}
        >
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span>{node.name}</span>
        </button>
      );
    }
  };

  // 处理编辑器挂载
  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  // 处理文件内容变化
  const handleFileContentChange = (newValue: string | undefined) => {
    if (activeFileIndex >= 0 && activeFileIndex < files.length) {
      const newFiles = [...files];
      newFiles[activeFileIndex] = {
        ...newFiles[activeFileIndex],
        content: newValue || '',
      };
      onFilesChange(newFiles);
    }
  };

  // 切换文件
  const handleFileSelect = (index: number) => {
    setActiveFileIndex(index);
  };

  const activeFile = files[activeFileIndex] || files[0];

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

      <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
        {/* 文件树 */}
        <div className="w-[120px] bg-gray-50 border border-gray-200 rounded-lg overflow-hidden flex flex-col">
          <div className="px-3 py-2 bg-gray-100 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700">文件</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {fileTree.map(node => renderTreeNode(node))}
          </div>
        </div>

        {/* 编辑器区域 */}
        <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 border rounded-lg overflow-hidden" style={{
            borderColor: isValid ? '#d1d5db' : '#ef4444',
          }}>
            <Editor
              height="100%"
              defaultLanguage="c"
              value={activeFile?.content || ''}
              onChange={handleFileContentChange}
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
    </div>
  );
};

