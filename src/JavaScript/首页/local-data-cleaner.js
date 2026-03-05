/**
 * 本地数据清理工具
 * 用于清除localStorage和sessionStorage中除用户登录数据外的所有数据
 */

/**
 * 清除除用户登录数据外的所有本地数据
 * 保留localStorage中的用户登录数据（currentUser和loggedInPhone），清除其他所有数据
 * @returns {number} 清除的数据项数量
 */
function clearLocalProjectData() {
    try {
        // 不输出开始清理的日志
        
        // 定义需要保留的用户登录数据键名
        const preservedKeys = ['currentUser', 'loggedInPhone'];
        
        // 清除localStorage中除保留键外的所有数据
        let clearedItems = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && !preservedKeys.includes(key)) {
                localStorage.removeItem(key);
                clearedItems++;
                // 调整索引，因为我们移除了一个项目
                i--;
            }
        }
        
        // 清除sessionStorage中的所有数据
        while (sessionStorage.length > 0) {
            const key = sessionStorage.key(0);
            sessionStorage.removeItem(key);
            console.log(`[本地数据清理] 已清除sessionStorage数据: ${key}`);
            clearedItems++;
        }
        
        console.log(`✅ 2.[本地数据清理] 本地数据清理完成（保留用户登录数据），共清除 ${clearedItems} 项`);
        return clearedItems;
    } catch (error) {
        console.error('[本地数据清理] 清除本地数据时发生错误:', error);
        return 0;
    }
}

/**
 * 初始化本地数据清理
 * 在页面加载时自动执行清理操作
 */
function initLocalDataCleanup() {
    // 在页面加载完成后自动清除本地项目数据
    window.addEventListener('load', function() {
        // 短暂延迟执行，确保其他初始化操作完成
        setTimeout(function() {
            clearLocalProjectData();
        }, 100);
    });
}

// 导出函数，使其可以在其他文件中使用
window.clearLocalProjectData = clearLocalProjectData;
window.initLocalDataCleanup = initLocalDataCleanup;

