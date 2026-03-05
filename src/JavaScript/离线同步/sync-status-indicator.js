/**
 * 同步状态指示器
 * 提供用户界面元素来显示当前的同步状态
 */
class SyncStatusIndicator {
    constructor() {
        this.container = null;
        this.statusElement = null;
        this.progressElement = null;
        this.isVisible = false;
        this.init();
    }

    init() {
        this.createIndicator();
        this.bindEvents();
    }

    createIndicator() {
        // 创建容器
        this.container = document.createElement('div');
        this.container.id = 'sync-status-container';
        this.container.className = 'sync-status-container';
        this.container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 12px 16px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            min-width: 200px;
            transition: all 0.3s ease;
            transform: translateX(100%);
            opacity: 0;
        `;

        // 创建状态图标
        const iconContainer = document.createElement('div');
        iconContainer.className = 'sync-status-icon';
        iconContainer.style.cssText = `
            display: inline-block;
            width: 16px;
            height: 16px;
            margin-right: 8px;
            vertical-align: middle;
        `;

        // 创建状态文本
        this.statusElement = document.createElement('span');
        this.statusElement.className = 'sync-status-text';
        this.statusElement.textContent = '准备同步...';

        // 创建进度条容器
        const progressContainer = document.createElement('div');
        progressContainer.style.cssText = `
            margin-top: 8px;
            height: 4px;
            background: #f0f0f0;
            border-radius: 2px;
            overflow: hidden;
        `;

        // 创建进度条
        this.progressElement = document.createElement('div');
        this.progressElement.className = 'sync-status-progress';
        this.progressElement.style.cssText = `
            height: 100%;
            background: #1890ff;
            border-radius: 2px;
            width: 0%;
            transition: width 0.3s ease;
        `;

        progressContainer.appendChild(this.progressElement);

        // 组装元素
        this.container.appendChild(iconContainer);
        this.container.appendChild(this.statusElement);
        this.container.appendChild(progressContainer);

        // 添加到页面
        document.body.appendChild(this.container);
    }

    bindEvents() {
        // 点击关闭指示器
        this.container.addEventListener('click', () => {
            this.hide();
        });
    }

    show(status, progress = 0) {
        this.updateStatus(status, progress);
        this.container.style.transform = 'translateX(0)';
        this.container.style.opacity = '1';
        this.isVisible = true;
    }

    hide() {
        this.container.style.transform = 'translateX(100%)';
        this.container.style.opacity = '0';
        this.isVisible = false;
    }

    updateStatus(status, progress = null) {
        this.statusElement.textContent = status;
        
        if (progress !== null) {
            this.progressElement.style.width = `${progress}%`;
        }

        // 更新图标和颜色
        const iconContainer = this.container.querySelector('.sync-status-icon');
        
        if (status.includes('同步中')) {
            iconContainer.innerHTML = '<div class="sync-spinner" style="width: 16px; height: 16px; border: 2px solid #f3f3f3; border-top: 2px solid #1890ff; border-radius: 50%; animation: spin 1s linear infinite;"></div>';
            this.statusElement.style.color = '#1890ff';
        } else if (status.includes('成功')) {
            iconContainer.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6 12L2.5 8.5" stroke="#52c41a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            this.statusElement.style.color = '#52c41a';
        } else if (status.includes('失败')) {
            iconContainer.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1C4.1 1 1 4.1 1 8s3.1 7 7 7 7-3.1 7-7-3.1-7-7-7zm0 12c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm-1-8h2v6H7V5zm0 8h2v-2H7v2z" fill="#ff4d4f"/></svg>';
            this.statusElement.style.color = '#ff4d4f';
        } else {
            iconContainer.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#d9d9d9" stroke-width="2"/></svg>';
            this.statusElement.style.color = '#666';
        }
    }

    updateProgress(progress) {
        this.progressElement.style.width = `${progress}%`;
    }

    // 显示同步开始
    showSyncStart() {
        this.show('正在同步数据...', 0);
    }

    // 显示同步进度
    showSyncProgress(progress, total = null) {
        let status = '正在同步数据...';
        if (total !== null) {
            status = `正在同步数据 (${progress}/${total})...`;
        }
        this.updateStatus(status, (progress / (total || 100)) * 100);
    }

    // 显示同步成功
    showSyncSuccess(message = '数据同步成功') {
        this.updateStatus(message, 100);
        setTimeout(() => {
            this.hide();
        }, 3000);
    }

    // 显示同步失败
    showSyncError(message = '数据同步失败') {
        this.updateStatus(message, 0);
        setTimeout(() => {
            this.hide();
        }, 5000);
    }

    // 显示离线状态
    showOfflineStatus() {
        this.updateStatus('离线模式 - 数据将稍后同步', 0);
        setTimeout(() => {
            if (this.isVisible) {
                this.hide();
            }
        }, 3000);
    }

    // 显示在线状态
    showOnlineStatus() {
        this.updateStatus('已连接到云端', 100);
        setTimeout(() => {
            if (this.isVisible) {
                this.hide();
            }
        }, 2000);
    }
}

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .sync-status-container:hover {
        transform: translateX(-5px) !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
    }
`;
document.head.appendChild(style);

// 创建全局实例（仅当不存在时）
function initSyncStatusIndicator() {
    if (window.syncStatusIndicator) {
        return; // 已存在，跳过创建
    }
    
    if (document.body) {
        window.syncStatusIndicator = new SyncStatusIndicator();
    } else if (document.readyState === 'loading') {
        // 如果DOM还未加载完成，等待DOMContentLoaded事件
        document.addEventListener('DOMContentLoaded', function() {
            if (!window.syncStatusIndicator) {
                window.syncStatusIndicator = new SyncStatusIndicator();
            }
        });
    } else {
        // DOM已加载，立即创建
        window.syncStatusIndicator = new SyncStatusIndicator();
    }
}

// 延迟初始化，确保DOM完全加载（仅执行一次）
if (!window.syncStatusIndicator) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSyncStatusIndicator);
    } else {
        // 使用setTimeout确保在调用栈清空后执行
        setTimeout(initSyncStatusIndicator, 0);
    }
}