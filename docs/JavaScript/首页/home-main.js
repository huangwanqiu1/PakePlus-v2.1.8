// 首页主JavaScript文件
// 包含首页特有的功能和逻辑

// 全局变量，避免在异步操作中丢失引用
let contentFrame = null;

/**
 * initializeHomePage函数 - 作为initHomePage的别名，确保首页初始化流程正常工作
 */
async function initializeHomePage() {
    // 调用现有的initHomePage函数
    return initHomePage();
}

/**
 * 初始化首页功能
 */
function initHomePage() {
    
    // 检查登录状态
    checkLoginStatus();
    
    // 设置页面标题
    setProjectTitle('');
    
    // 添加窗口关闭事件监听
    setupCloseEventListeners();
    
    // 获取contentFrame引用并存储为全局变量
    contentFrame = document.getElementById('contentFrame');
    if (contentFrame) {
        // 使用once选项确保事件只触发一次，避免重复绑定
        contentFrame.addEventListener('load', handleIframeLoad, { once: true });
    }
    
    // 绑定侧边栏点击事件
    bindSidebarEvents();
    
    // 已删除云端数据下载相关逻辑
}

/**
 * 清除本地数据并获取云端项目数据
 */
async function clearLocalDataAndFetchProjects() {
    try {
        // 获取当前登录用户信息
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            // 静默处理，不输出日志
            return;
        }
        
        // 使用统一的数据存储服务清除本地数据
        if (typeof dataStorage !== 'undefined' && typeof dataStorage.clearLocalDataExceptAuth === 'function') {
            await dataStorage.clearLocalDataExceptAuth();
        } else {
            // 静默处理，不输出日志
        }
        
        // 从云端获取项目数据
        await fetchProjectsFromCloud();
    } catch (error) {
        // 静默处理，不输出日志
    }
}

/**
 * 绑定侧边栏点击事件
 */
function bindSidebarEvents() {
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    sidebarItems.forEach(item => {
        item.addEventListener('click', function() {
            // 移除所有项的active类
            sidebarItems.forEach(i => i.classList.remove('active'));
            // 为当前项添加active类
            this.classList.add('active');
        });
    });
}

/**
 * 处理iframe加载事件
 */
function handleIframeLoad() {
    // 使用全局contentFrame变量，避免重复查询DOM
    if (!contentFrame) return;
    
    try {
        // 不使用setTimeout，直接处理，避免异步响应问题
        // 不再尝试访问contentWindow.location，避免潜在的跨域问题和异步响应错误
        // 根据iframe的src属性直接判断，而不是尝试读取contentWindow.location
        const frameSrc = contentFrame.src;
        if (frameSrc.includes('记工.html')) {
            // 如果iframe加载的是记工.html，将标题设置为"记工"
            updateHeaderTitle('记工.html');
        } else if (frameSrc.includes('员工录入.html')) {
            // 如果iframe加载的是员工录入.html，将标题设置为"员工录入"
            updateHeaderTitle('员工录入.html');
        }
    } catch (e) {
        // 捕获可能的错误
        console.error('iframe加载事件处理失败:', e);
    }
}

/**
 * 更新页面标题
 * @param {string} page - 页面名称
 */
function updateHeaderTitle(page) {
    const headerTitle = document.querySelector('.header-title');
    if (!headerTitle) return;
    
    let title = '飞鱼记工';
    if (page === '记工.html') {
        title = '记工';
    } else if (page === '员工录入.html') {
        title = '员工录入';
    }
    
    headerTitle.textContent = title;
    headerTitle.setAttribute('title', title);
}

/**
 * 设置项目标题
 * @param {string|object} projectName - 项目名称或项目对象
 */
function setProjectTitle(projectName) {
    const headerTitle = document.querySelector('.header-title');
    // 支持传入项目对象或直接传入名称字符串，只使用新字段
    const name = typeof projectName === 'object' 
        ? (projectName.projectname || '') 
        : (projectName || '');
    const title = (name && name.trim()) ? name.trim() : '飞鱼记工';
    if (headerTitle) {
        headerTitle.textContent = title;
        headerTitle.setAttribute('title', title);
    }
    if (name && name.trim()) {
        localStorage.setItem('currentProjectName', title);
    } else {
        localStorage.removeItem('currentProjectName');
    }
}

/**
 * 检查登录状态并加载用户信息
 */
function checkLoginStatus() {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
        try {
            const userData = JSON.parse(currentUser);
            // 更新用户信息显示
            const userNameElement = document.getElementById('currentUserName');
            const userAvatarElement = document.getElementById('userAvatar');
            
            // 使用login_name字段（本地存储中的显示名称）
            const displayName = userData.login_name || '未命名';
            
            if (userNameElement) {
                userNameElement.textContent = displayName;
            }
            
            if (userAvatarElement) {
                userAvatarElement.textContent = displayName.charAt(0) || '?';
            }
        } catch (error) {
            console.error('解析用户数据失败:', error);
            redirectToLogin();
        }
    } else {
        redirectToLogin();
    }
}

/**
 * 重定向到登录页面
 */
function redirectToLogin() {
    window.location.href = '登录注册.html';
}

/**
 * 设置关闭事件监听器
 */
function setupCloseEventListeners() {
    // 监听页面可见性变化（用户切换标签页或最小化窗口）
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            // 不再清空用户注册数据库文件
            // 静默处理，不输出日志
        }
    });
    
    // 监听窗口关闭事件
    window.addEventListener('beforeunload', function() {
        // 不再清空用户注册数据库文件
        // 静默处理，不输出日志
        // 注意：beforeunload事件中不应该有异步操作，因为浏览器可能不会等待它们完成
    });
}

/**
 * 从云端获取项目数据并更新到数据库
 */
async function fetchProjectsFromCloud() {
    try {
        // 获取当前登录用户信息
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            return;
        }
        
        // 使用统一的数据存储服务进行云端同步，不执行清除操作（因为已经在前面执行过了）
        if (typeof dataStorage !== 'undefined' && typeof dataStorage.syncProjectsFromCloud === 'function') {
            const projects = await dataStorage.syncProjectsFromCloud(false); // 传递false表示不执行清除操作
            
            // 设置数据同步完成状态标志（使用正确的JSON格式）
            const syncStatus = {
                records: {},
                lastSyncTime: new Date().toISOString(),
                syncHistory: [{
                    time: new Date().toISOString(),
                    status: 'completed',
                    message: '数据同步完成'
                }]
            };
            localStorage.setItem('db_sync_status', JSON.stringify(syncStatus));
            
            // 避免使用postMessage，防止消息通道关闭错误
            // 替代方案：通过localStorage标志来通知iframe刷新
            if (contentFrame && contentFrame.src.includes('项目列表.html')) {
                // 设置刷新标志
                localStorage.setItem('needRefreshProjects', 'true');
                // 不使用postMessage
            }
        }
        
    } catch (error) {
        console.error('从云端获取项目数据失败:', error);
    }
}

// 移除自动初始化，首页功能将由首页.html中的初始化流程手动调用
// 这样可以确保初始化按正确的顺序执行，避免重复初始化
// document.addEventListener('DOMContentLoaded', function() {
//     initHomePage();
// });

// 导出为全局函数
window.initHomePage = initHomePage;
window.initializeHomePage = initializeHomePage;
window.updateHeaderTitle = updateHeaderTitle;
window.setProjectTitle = setProjectTitle;
window.checkLoginStatus = checkLoginStatus;
window.redirectToLogin = redirectToLogin;
window.setupCloseEventListeners = setupCloseEventListeners;
window.fetchProjectsFromCloud = fetchProjectsFromCloud;

/**
 * 从云端下载并解密员工数据
 */
async function downloadAndDecryptEmployeeData() {
    try {
        // 获取当前登录用户信息
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            return;
        }
        
        // 使用统一的数据存储服务下载并解密员工数据
        if (typeof dataStorage !== 'undefined' && typeof dataStorage.downloadAndDecryptEmployeeData === 'function') {
            await dataStorage.downloadAndDecryptEmployeeData();
            console.log('员工数据下载和解密完成');
            
            // 可以在这里设置同步状态或通知相关组件刷新
            const syncStatus = {
                employeeData: {
                    lastSyncTime: new Date().toISOString(),
                    status: 'completed'
                }
            };
            localStorage.setItem('employee_data_sync_status', JSON.stringify(syncStatus));
        }
    } catch (error) {
        console.error('下载并解密员工数据失败:', error);
    }
}

// 导出为全局函数
window.downloadAndDecryptEmployeeData = downloadAndDecryptEmployeeData;

/**
 * 显示通知消息
 * @param {string} message - 通知消息
 * @param {boolean} isError - 是否为错误消息
 */
function showNotification(message, isError = false) {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 16px 24px;
        border-radius: 8px;
        color: white;
        font-size: 16px;
        font-weight: 500;
        z-index: 10000;
        max-width: 400px;
        word-wrap: break-word;
        text-align: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: opacity 0.3s ease;
        ${isError ? 'background: linear-gradient(135deg, #ef4444, #dc2626);' : 'background: linear-gradient(135deg, #10b981, #059669);'}
    `;
    notification.textContent = message;
    
    // 添加到页面
    document.body.appendChild(notification);
    
    // 3秒后自动移除
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

/**
 * 全局项目列表加载函数
 * 用于从本地存储加载项目数据并导航到项目列表页面
 * @param {string} targetProjectName - 可选的目标项目名称，用于自动选择项目
 */
async function loadProjectList(targetProjectName = null) {
    try {
        // 获取当前用户信息
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            console.warn('用户未登录，无法加载项目列表');
            redirectToLogin();
            return;
        }
        
        const userData = JSON.parse(currentUser);
        const phone = userData.phone || userData.login_name;
        
        if (!phone) {
            console.error('无法获取用户手机号');
            showNotification('获取用户信息失败', true);
            return;
        }
        
        // 从本地存储加载项目数据
        // 从currentUser获取user_id
        let userId = 'default';
        try {
            const currentUserStr = localStorage.getItem('currentUser');
            if (currentUserStr) {
                const currentUser = JSON.parse(currentUserStr);
                userId = currentUser.user_id || 'default';
            }
        } catch (e) {
            console.error('解析currentUser失败:', e);
        }
        
        const projectsData = localStorage.getItem('project_cache_' + userId);
        let projects = [];
        
        if (projectsData) {
            try {
                projects = JSON.parse(projectsData);
                console.log('✅ 5.从本地加载项目数据成功，项目数量:', projects.length);
            } catch (error) {
                console.error('解析项目数据失败:', error);
                projects = [];
            }
        } else {
            console.log('本地未找到项目数据');
        }
        
        // 如果指定了目标项目名称，尝试在数据中查找
        if (targetProjectName && projects.length > 0) {
            const targetProject = projects.find(p => 
                p.projectname === targetProjectName || 
                p.name === targetProjectName
            );
            
            if (targetProject) {
                // 找到目标项目，设置当前项目
                localStorage.setItem('currentProject', JSON.stringify(targetProject));
                localStorage.setItem('currentProjectName', targetProject.projectname || targetProject.name);
                console.log('已设置目标项目:', targetProjectName);
            } else {
                console.log('未找到目标项目:', targetProjectName);
            }
        }
        
        // 导航到项目列表页面
        navigateTo('项目列表.html');
        
    } catch (error) {
        console.error('加载项目列表失败:', error);
        showNotification('加载项目列表失败: ' + error.message, true);
        
        // 如果加载失败，仍然导航到项目列表页面
        navigateTo('项目列表.html');
    }
}

// 导出为全局函数
window.loadProjectList = loadProjectList;