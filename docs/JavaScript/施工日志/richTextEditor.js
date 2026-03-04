/**
 * 富文本编辑器
 * 提供文字加大、减小、加粗、变色等功能
 * 点击输入框后显示工具栏
 */

class RichTextEditor {
    constructor(options) {
        this.container = typeof options.container === 'string' 
            ? document.querySelector(options.container) 
            : options.container;
        this.textarea = typeof options.textarea === 'string' 
            ? document.querySelector(options.textarea) 
            : options.textarea;
        this.maxLength = options.maxLength || 2000;
        this.onChange = options.onChange || (() => {});
        this.placeholder = options.placeholder || '请输入日志内容...';
        
        this.currentSize = 14;
        this.isToolbarVisible = false;
        
        this.init();
    }
    
    init() {
        this.createEditor();
        this.bindEvents();
    }
    
    createEditor() {
        // 创建外层包装器
        const wrapper = document.createElement('div');
        wrapper.className = 'rich-editor-wrapper';
        
        // 创建工具栏（初始隐藏）
        const toolbar = document.createElement('div');
        toolbar.className = 'rich-editor-toolbar';
        toolbar.style.display = 'none';
        toolbar.innerHTML = `
            <div class="toolbar-section">
                <span class="toolbar-label">格式</span>
                <div class="toolbar-group">
                    <button type="button" class="toolbar-btn" data-action="bold" title="加粗 (Ctrl+B)">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
                            <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
                        </svg>
                        <span class="btn-label">加粗</span>
                    </button>
                    <button type="button" class="toolbar-btn" data-action="italic" title="斜体 (Ctrl+I)">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="19" y1="4" x2="10" y2="4"></line>
                            <line x1="14" y1="20" x2="5" y2="20"></line>
                            <line x1="15" y1="4" x2="9" y2="20"></line>
                        </svg>
                        <span class="btn-label">斜体</span>
                    </button>
                    <button type="button" class="toolbar-btn" data-action="underline" title="下划线 (Ctrl+U)">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"></path>
                            <line x1="4" y1="21" x2="20" y2="21"></line>
                        </svg>
                        <span class="btn-label">下划线</span>
                    </button>
                </div>
            </div>
            
            <div class="toolbar-divider"></div>
            
            <div class="toolbar-section">
                <span class="toolbar-label">字号</span>
                <div class="toolbar-group">
                    <button type="button" class="toolbar-btn" data-action="fontSize-decrease" title="减小字号">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M21 12H9"></path>
                            <path d="M3 6h12"></path>
                            <path d="M3 18h12"></path>
                        </svg>
                        <span class="btn-label">减小</span>
                    </button>
                    <span class="font-size-display">14px</span>
                    <button type="button" class="toolbar-btn" data-action="fontSize-increase" title="增大字号">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M12 5v14"></path>
                            <path d="M5 12h14"></path>
                        </svg>
                        <span class="btn-label">增大</span>
                    </button>
                </div>
            </div>
            
            <div class="toolbar-divider"></div>
            
            <div class="toolbar-section">
                <span class="toolbar-label">对齐</span>
                <div class="toolbar-group">
                    <button type="button" class="toolbar-btn" data-action="alignLeft" title="左对齐">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="12" x2="15" y2="12"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                        <span class="btn-label">左对齐</span>
                    </button>
                    <button type="button" class="toolbar-btn" data-action="alignCenter" title="居中对齐">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="6" y1="12" x2="18" y2="12"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                        <span class="btn-label">居中</span>
                    </button>
                    <button type="button" class="toolbar-btn" data-action="alignRight" title="右对齐">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="9" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                        <span class="btn-label">右对齐</span>
                    </button>
                </div>
            </div>
            
            <div class="toolbar-divider"></div>
            
            <div class="toolbar-section">
                <span class="toolbar-label">其他</span>
                <div class="toolbar-group">
                    <button type="button" class="toolbar-btn" data-action="insertList" title="插入列表">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="8" y1="6" x2="21" y2="6"></line>
                            <line x1="8" y1="12" x2="21" y2="12"></line>
                            <line x1="8" y1="18" x2="21" y2="18"></line>
                            <line x1="3" y1="6" x2="3.01" y2="6"></line>
                            <line x1="3" y1="12" x2="3.01" y2="12"></line>
                            <line x1="3" y1="18" x2="3.01" y2="18"></line>
                        </svg>
                        <span class="btn-label">列表</span>
                    </button>
                    <button type="button" class="toolbar-btn" data-action="clearFormat" title="清除格式">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7"></path>
                            <line x1="12" y1="11" x2="12" y2="11"></line>
                            <line x1="8" y1="11" x2="8" y2="11"></line>
                            <line x1="16" y1="11" x2="16" y2="11"></line>
                        </svg>
                        <span class="btn-label">清除</span>
                    </button>
                </div>
            </div>
        `;
        
        // 创建编辑区域容器（包含调整大小手柄）
        const editorContainer = document.createElement('div');
        editorContainer.className = 'rich-editor-container';
        
        // 创建编辑区域
        const editableDiv = document.createElement('div');
        editableDiv.className = 'rich-editor-editable';
        editableDiv.contentEditable = true;
        editableDiv.setAttribute('data-placeholder', this.placeholder);
        editableDiv.innerHTML = this.parseToHtml(this.textarea.value);
        
        // 创建调整大小手柄
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'rich-editor-resize-handle';
        resizeHandle.innerHTML = `
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 18l8-8"></path>
                <path d="M12 18l4-4"></path>
                <path d="M16 18l2-2"></path>
            </svg>
        `;
        resizeHandle.title = '拖拽调整高度';
        
        editorContainer.appendChild(editableDiv);
        editorContainer.appendChild(resizeHandle);
        
        // 组装
        wrapper.appendChild(toolbar);
        wrapper.appendChild(editorContainer);
        
        // 保存引用
        this.resizeHandle = resizeHandle;
        this.editorContainer = editorContainer;
        
        // 替换原 textarea
        this.textarea.parentNode.insertBefore(wrapper, this.textarea);
        this.textarea.style.display = 'none';
        
        this.wrapper = wrapper;
        this.toolbar = toolbar;
        this.editableDiv = editableDiv;
    }
    
    bindEvents() {
        // 点击编辑区域显示工具栏
        this.editableDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showToolbar();
        });
        
        // 聚焦时也显示工具栏
        this.editableDiv.addEventListener('focus', () => {
            this.showToolbar();
        });
        
        // 点击编辑区域外部隐藏工具栏（除非点击工具栏本身）
        document.addEventListener('click', (e) => {
            if (!this.wrapper.contains(e.target)) {
                this.hideToolbar();
            }
        });
        
        // 工具栏按钮点击事件
        this.toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('.toolbar-btn');
            if (!btn) return;
            
            const action = btn.dataset.action;
            this.handleAction(action);
            e.stopPropagation();
        });
        
        // 编辑区域输入事件
        this.editableDiv.addEventListener('input', () => {
            this.syncToTextarea();
            this.onChange(this.getContent());
        });
        
        // 粘贴事件（去除格式）
        this.editableDiv.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            document.execCommand('insertText', false, text);
        });
        
        // 拖拽调整大小功能
        this.initResizeHandle();
        
        // 键盘快捷键
        this.editableDiv.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'b':
                        e.preventDefault();
                        this.handleAction('bold');
                        break;
                    case 'i':
                        e.preventDefault();
                        this.handleAction('italic');
                        break;
                    case 'u':
                        e.preventDefault();
                        this.handleAction('underline');
                        break;
                }
            }
        });
    }
    
    initResizeHandle() {
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        const minHeight = 100;
        const maxHeight = 800;
        
        this.resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = this.editableDiv.offsetHeight;
            
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
            this.resizeHandle.classList.add('resizing');
            
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const deltaY = e.clientY - startY;
            const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
            
            this.editableDiv.style.height = newHeight + 'px';
            this.editableDiv.style.minHeight = newHeight + 'px';
        });
        
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                this.resizeHandle.classList.remove('resizing');
            }
        });
    }
    
    showToolbar() {
        if (!this.isToolbarVisible) {
            this.toolbar.style.display = 'flex';
            this.wrapper.classList.add('active');
            this.isToolbarVisible = true;
            
            // 添加动画效果
            this.toolbar.style.opacity = '0';
            this.toolbar.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                this.toolbar.style.opacity = '1';
                this.toolbar.style.transform = 'translateY(0)';
            }, 10);
        }
    }
    
    hideToolbar() {
        if (this.isToolbarVisible) {
            this.toolbar.style.opacity = '0';
            this.toolbar.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                this.toolbar.style.display = 'none';
                this.wrapper.classList.remove('active');
                this.isToolbarVisible = false;
                // 隐藏颜色面板
                const colorPalette = this.toolbar.querySelector('.color-palette');
                if (colorPalette) {
                    colorPalette.classList.remove('show');
                }
            }, 200);
        }
    }
    
    handleAction(action) {
        this.editableDiv.focus();
        
        switch (action) {
            case 'bold':
                document.execCommand('bold', false, null);
                break;
            case 'italic':
                document.execCommand('italic', false, null);
                break;
            case 'underline':
                document.execCommand('underline', false, null);
                break;
            case 'fontSize-increase':
                this.changeFontSize(2);
                break;
            case 'fontSize-decrease':
                this.changeFontSize(-2);
                break;
            case 'alignLeft':
                document.execCommand('justifyLeft', false, null);
                break;
            case 'alignCenter':
                document.execCommand('justifyCenter', false, null);
                break;
            case 'alignRight':
                document.execCommand('justifyRight', false, null);
                break;
            case 'insertList':
                this.insertList();
                break;
            case 'clearFormat':
                document.execCommand('removeFormat', false, null);
                break;
        }
        
        this.syncToTextarea();
    }
    
    changeFontSize(delta) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        const selectedText = range.toString();
        
        if (!selectedText) {
            this.currentSize = Math.max(12, Math.min(32, this.currentSize + delta));
            this.updateFontSizeDisplay();
            return;
        }
        
        let parentElement = range.commonAncestorContainer;
        if (parentElement.nodeType === Node.TEXT_NODE) {
            parentElement = parentElement.parentElement;
        }
        
        const computedStyle = window.getComputedStyle(parentElement);
        let currentSize = parseInt(computedStyle.fontSize) || 14;
        let newSize = Math.max(12, Math.min(32, currentSize + delta));
        
        document.execCommand('fontSize', false, '7');
        const fontElements = this.editableDiv.querySelectorAll('font[size="7"]');
        fontElements.forEach(font => {
            font.removeAttribute('size');
            font.style.fontSize = newSize + 'px';
        });
    }
    
    insertList() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        const selectedText = range.toString();
        
        if (!selectedText) {
            document.execCommand('insertHTML', false, '<div>• </div>');
        } else {
            const lines = selectedText.split('\n');
            const listHtml = lines.map(line => `<div>• ${line}</div>`).join('');
            document.execCommand('insertHTML', false, listHtml);
        }
        
        this.syncToTextarea();
    }
    
    updateFontSizeDisplay() {
        const display = this.toolbar.querySelector('.font-size-display');
        if (display) {
            display.textContent = this.currentSize + 'px';
        }
    }
    
    syncToTextarea() {
        let html = this.editableDiv.innerHTML;
        
        // 先处理对齐属性
        html = html
            .replace(/<div\b[^>]*style="[^"]*text-align:\s*left[^"]*"[^>]*>(.*?)<\/div>/gi, '[align=left]$1[/align]')
            .replace(/<div\b[^>]*style="[^"]*text-align:\s*center[^"]*"[^>]*>(.*?)<\/div>/gi, '[align=center]$1[/align]')
            .replace(/<div\b[^>]*style="[^"]*text-align:\s*right[^"]*"[^>]*>(.*?)<\/div>/gi, '[align=right]$1[/align]')
            .replace(/<p\b[^>]*style="[^"]*text-align:\s*left[^"]*"[^>]*>(.*?)<\/p>/gi, '[align=left]$1[/align]')
            .replace(/<p\b[^>]*style="[^"]*text-align:\s*center[^"]*"[^>]*>(.*?)<\/p>/gi, '[align=center]$1[/align]')
            .replace(/<p\b[^>]*style="[^"]*text-align:\s*right[^"]*"[^>]*>(.*?)<\/p>/gi, '[align=right]$1[/align]');
        
        html = html
            .replace(/<b\b[^>]*>(.*?)<\/b>/gi, '[b]$1[/b]')
            .replace(/<strong\b[^>]*>(.*?)<\/strong>/gi, '[b]$1[/b]')
            .replace(/<i\b[^>]*>(.*?)<\/i>/gi, '[i]$1[/i]')
            .replace(/<em\b[^>]*>(.*?)<\/em>/gi, '[i]$1[/i]')
            .replace(/<u\b[^>]*>(.*?)<\/u>/gi, '[u]$1[/u]')
            .replace(/<div\b[^>]*>(.*?)<\/div>/gi, '$1\n')
            .replace(/<p\b[^>]*>(.*?)<\/p>/gi, '$1\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<font[^>]*style="[^"]*font-size:\s*([^;"]+)[^"]*"[^>]*>(.*?)<\/font>/gi, '[size=$1]$2[/size]')
            .replace(/<span[^>]*style="[^"]*font-size:\s*([^;"]+)[^"]*"[^>]*>(.*?)<\/span>/gi, '[size=$1]$2[/size]');
        
        html = html.replace(/<[^>]+>/g, '');
        
        const textarea = document.createElement('textarea');
        textarea.innerHTML = html;
        html = textarea.value;
        
        this.textarea.value = html;
    }
    
    parseToHtml(text) {
        return text
            .replace(/\[b\](.*?)\[\/b\]/g, '<b>$1</b>')
            .replace(/\[i\](.*?)\[\/i\]/g, '<i>$1</i>')
            .replace(/\[u\](.*?)\[\/u\]/g, '<u>$1</u>')
            .replace(/\[size=([^\]]+)\](.*?)\[\/size\]/g, '<span style="font-size:$1">$2</span>')
            .replace(/\[align=left\](.*?)\[\/align\]/g, '<div style="text-align:left">$1</div>')
            .replace(/\[align=center\](.*?)\[\/align\]/g, '<div style="text-align:center">$1</div>')
            .replace(/\[align=right\](.*?)\[\/align\]/g, '<div style="text-align:right">$1</div>')
            .replace(/\n/g, '<br>');
    }
    
    getContent() {
        return this.textarea.value;
    }
    
    setContent(content) {
        this.textarea.value = content;
        this.editableDiv.innerHTML = this.parseToHtml(content);
    }
    
    getHtmlContent() {
        return this.editableDiv.innerHTML;
    }
    
    destroy() {
        if (this.wrapper) {
            this.wrapper.remove();
        }
        this.textarea.style.display = '';
    }
}

// 添加默认样式（防止重复添加）
if (!document.getElementById('rich-editor-styles')) {
const style = document.createElement('style');
style.id = 'rich-editor-styles';
style.textContent = `
    .rich-editor-wrapper {
        position: relative;
        border: 1px solid #dcdfe6;
        border-radius: 4px;
        transition: all 0.3s;
        background-color: #fff;
    }
    
    .rich-editor-wrapper.active {
        border-color: #409EFF;
        box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
    }
    
    .rich-editor-toolbar {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        background: linear-gradient(135deg, #f5f7fa 0%, #e4e7ed 100%);
        border-bottom: 1px solid #dcdfe6;
        border-radius: 4px 4px 0 0;
        gap: 12px;
        flex-wrap: wrap;
        transition: all 0.2s ease;
    }
    
    .toolbar-section {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    
    .toolbar-label {
        font-size: 11px;
        color: #909399;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .toolbar-group {
        display: flex;
        align-items: center;
        gap: 4px;
    }
    
    .toolbar-divider {
        width: 1px;
        height: 24px;
        background: linear-gradient(180deg, transparent 0%, #c0c4cc 50%, transparent 100%);
        margin: 0 4px;
    }
    
    .toolbar-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        height: 44px;
        padding: 4px 8px;
        border: 1px solid transparent;
        border-radius: 6px;
        background-color: #fff;
        cursor: pointer;
        transition: all 0.2s;
        color: #606266;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    
    .toolbar-btn:hover {
        background-color: #ecf5ff;
        color: #409EFF;
        border-color: #b3d8ff;
        transform: translateY(-1px);
        box-shadow: 0 2px 6px rgba(64, 158, 255, 0.2);
    }
    
    .toolbar-btn:active {
        transform: translateY(0);
        box-shadow: 0 1px 2px rgba(64, 158, 255, 0.1);
    }
    
    .toolbar-btn.active {
        background-color: #409EFF;
        color: #fff;
        border-color: #409EFF;
    }
    
    .toolbar-btn svg {
        margin-bottom: 2px;
    }
    
    .btn-label {
        font-size: 10px;
        font-weight: 500;
        line-height: 1;
    }
    
    .font-size-display {
        font-size: 11px;
        color: #606266;
        min-width: 32px;
        text-align: center;
        font-weight: 600;
        background-color: #fff;
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid #e4e7ed;
    }
    
    .rich-editor-container {
        position: relative;
        border-radius: 0 0 4px 4px;
    }
    
    .rich-editor-editable {
        min-height: 150px;
        padding: 12px;
        padding-bottom: 20px;
        outline: none;
        font-size: 14px;
        line-height: 1.6;
        color: #606266;
        border-radius: 0 0 4px 4px;
        overflow-y: auto;
        resize: none;
    }
    
    .rich-editor-editable:empty:before {
        content: attr(data-placeholder);
        color: #c0c4cc;
        font-style: italic;
    }
    
    .rich-editor-editable:focus {
        outline: none;
    }
    
    /* 选中文字时的样式 */
    .rich-editor-editable ::selection {
        background-color: rgba(64, 158, 255, 0.2);
    }
    
    /* 调整大小手柄 */
    .rich-editor-resize-handle {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 16px;
        background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.03) 100%);
        cursor: ns-resize;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 0 0 4px 4px;
        transition: all 0.2s;
    }
    
    .rich-editor-resize-handle:hover,
    .rich-editor-resize-handle.resizing {
        background: linear-gradient(180deg, transparent 0%, rgba(64, 158, 255, 0.1) 100%);
        height: 20px;
    }
    
    .rich-editor-resize-handle svg {
        color: #c0c4cc;
        transition: all 0.2s;
    }
    
    .rich-editor-resize-handle:hover svg,
    .rich-editor-resize-handle.resizing svg {
        color: #409EFF;
        transform: scale(1.2);
    }
    
    .rich-editor-resize-handle::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 40px;
        height: 3px;
        background-color: #dcdfe6;
        border-radius: 2px;
        transition: all 0.2s;
    }
    
    .rich-editor-resize-handle:hover::before,
.rich-editor-resize-handle.resizing::before {
    background-color: #409EFF;
    width: 50px;
}
`;
document.head.appendChild(style);
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RichTextEditor;
}
