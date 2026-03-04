// 项目数据同步服务
// 功能：从supabase获取最新数据并存储到本地

/**
 * 获取全局Supabase客户端实例
 * @returns {Object} Supabase客户端实例
 */
function getSupabaseClient() {
    // 直接返回全局实例，不打印初始化日志
    if (typeof window.supabase === 'undefined' || window.supabase === null) {
        throw new Error('Supabase客户端未在全局作用域初始化');
    }
    return window.supabase;
}

/**
 * 从Supabase获取项目数据
 * @param {Object} supabaseClient - Supabase客户端实例
 * @returns {Promise<Array>} 项目数据数组
 */
async function fetchProjectsFromSupabase(supabaseClient) {
    try {
        
        // 从currentUser获取user_id和phone
        let userId = 'default';
        let phone = '';
        try {
            const currentUserStr = localStorage.getItem('currentUser');
            if (currentUserStr) {
                const currentUser = JSON.parse(currentUserStr);
                userId = currentUser.user_id || 'default';
                phone = currentUser.phone || '';
            }
        } catch (e) {
            console.error('解析currentUser失败:', e);
        }
        
        if (!userId || userId === 'default') {
            console.warn('⚠️ 未找到登录用户信息或user_id无效，无法获取项目数据');
            return [];
        }
        
        // 1. 获取自己创建的项目
        const { data: ownedProjects, error: ownedError } = await supabaseClient
            .from('projects')
            .select('project_id, user_id, project_name, address, regular_hours, overtime_hours, status, created_at, updated_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        
        if (ownedError) {
            console.error('❌ 从Supabase获取项目数据失败:', ownedError);
            throw ownedError;
        }

        // 2. 获取作为带班参与的项目
        let foremanProjects = [];
        if (userId && userId !== 'default') {
            // 查找该用户作为带班的所有项目ID (通过user_projects表)
            const { data: foremanRoles, error: foremanError } = await supabaseClient
                .from('user_projects')
                .select('project_id')
                .eq('user_id', userId);

            if (!foremanError && foremanRoles && foremanRoles.length > 0) {
                const projectIds = foremanRoles.map(r => r.project_id);
                // 获取这些项目的详细信息
                const { data: projects, error: projectsError } = await supabaseClient
                    .from('projects')
                    .select('project_id, user_id, project_name, address, regular_hours, overtime_hours, status, created_at, updated_at')
                    .in('project_id', projectIds)
                    .order('created_at', { ascending: false });
                
                if (!projectsError && projects) {
                    foremanProjects = projects;
                    // console.log(`✅ 获取到 ${foremanProjects.length} 个带班项目`);
                }
            }
        }

        // 3. 合并项目列表并去重
        const allProjects = [...(ownedProjects || []), ...foremanProjects];
        // 使用Map按project_id去重
        const uniqueProjects = Array.from(new Map(allProjects.map(item => [item.project_id, item])).values());
        
        // 处理项目数据，确保字段格式一致（按指定顺序）
        const processedProjects = uniqueProjects.map(project => ({
            project_id: project.project_id,
            user_id: project.user_id,
            project_name: project.project_name || '未命名项目',
            address: project.address || '',
            regular_hours: project.regular_hours || 0,
            overtime_hours: project.overtime_hours || 0,
            status: project.status || '在建',
            created_at: project.created_at || new Date().toISOString(),
            updated_at: project.updated_at || project.created_at || new Date().toISOString(),
            is_foreman_project: project.user_id !== userId // 标记是否为带班项目（非自己创建）
        }));
        
        console.log('✅ 4.从Supabase获取项目数据成功，共', processedProjects.length, '个项目');
        return processedProjects;
    } catch (error) {
        console.error('❌ 获取项目数据时发生错误:', error);
        throw new Error('获取项目数据失败');
    }
}

/**
 * 从Supabase获取考勤记录数据
 * @param {Object} supabaseClient - Supabase客户端实例
 * @param {Array} projects - 项目数据数组
 * @returns {Promise<Array>} 考勤记录数据数组
 */
async function fetchAttendanceRecordsFromSupabase(supabaseClient, projects) {
    try {
        
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
        
        if (!userId || userId === 'default') {
            console.warn('⚠️ 未找到登录用户信息或user_id无效，无法获取考勤记录数据');
            return [];
        }
        
        // 获取所有项目ID
        const projectIds = projects.map(project => project.project_id);
        
        if (projectIds.length === 0) {
            console.warn('⚠️ 没有项目数据，无法获取考勤记录');
            return [];
        }
        
        // 从Supabase获取考勤记录
        const { data, error } = await supabaseClient
            .from('attendance_records')
            .select('*')
            .in('project_id', projectIds);
        
        if (error) {
            console.error('❌ 从Supabase获取考勤记录数据失败:', error);
            throw error;
        }
        
        console.log('✅ 从Supabase获取考勤记录数据成功，共', data.length, '条记录');
        return data;
    } catch (error) {
        console.error('❌ 获取考勤记录数据时发生错误:', error);
        return [];
    }
}

/**
 * 从Supabase获取结算记录数据
 * @param {Object} supabaseClient - Supabase客户端实例
 * @param {Array} projects - 项目数据数组
 * @returns {Promise<Array>} 结算记录数据数组
 */
async function fetchSettlementRecordsFromSupabase(supabaseClient, projects) {
    try {
        
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
        
        if (!userId || userId === 'default') {
            console.warn('⚠️ 未找到登录用户信息或user_id无效，无法获取结算记录数据');
            return [];
        }
        
        // 获取所有项目ID
        const projectIds = projects.map(project => project.project_id);
        
        if (projectIds.length === 0) {
            console.warn('⚠️ 没有项目数据，无法获取结算记录');
            return [];
        }
        
        // 从Supabase获取结算记录
        const { data, error } = await supabaseClient
            .from('settlement_records')
            .select('*')
            .in('project_id', projectIds);
        
        if (error) {
            console.error('❌ 从Supabase获取结算记录数据失败:', error);
            throw error;
        }
        
        console.log('✅ 从Supabase获取结算记录数据成功，共', data.length, '条记录');
        return data;
    } catch (error) {
        console.error('❌ 获取结算记录数据时发生错误:', error);
        return [];
    }
}

/**
 * 将项目数据保存到本地存储
 * @param {Array} projectsData - 项目数据数组
 */
function saveProjectsToLocalStorage(projectsData) {
    try {
        
        // 获取当前登录用户的手机号，如果没有则使用default
        const phone = localStorage.getItem('loggedInPhone') || 'default';
        
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
        
        // 只保留数组格式的project_cache_${userId}，移除其他重复格式
        const cacheKey = 'project_cache_' + userId;
        localStorage.setItem(cacheKey, JSON.stringify(projectsData));
        
        // 项目数据保存成功（静默）
    } catch (error) {
        console.error('❌ 保存项目数据到本地存储失败:', error);
        throw new Error('保存项目数据失败');
    }
}

/**
 * 将考勤记录数据保存到本地存储
 * @param {Array} attendanceData - 考勤记录数据数组
 */
function saveAttendanceRecordsToLocalStorage(attendanceData) {
    try {
        
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
        
        // 保存到work_records_${userId}键（与记工页面保持一致）
        const workRecordsKey = 'work_records_' + userId;
        localStorage.setItem(workRecordsKey, JSON.stringify(attendanceData));
        
        // 同时为每条记录保存到attendance_data_${record_id}键（与记工页面保持一致）
        attendanceData.forEach(record => {
            const recordId = record.record_id || record.id;
            if (recordId) {
                const attendanceDataKey = 'attendance_data_' + recordId;
                localStorage.setItem(attendanceDataKey, JSON.stringify(record));
            }
        });
        
        // 考勤记录数据保存成功（静默）
    } catch (error) {
        console.error('❌ 保存考勤记录数据到本地存储失败:', error);
    }
}

/**
 * 将结算记录数据保存到本地存储
 * @param {Array} settlementData - 结算记录数据数组
 */
function saveSettlementRecordsToLocalStorage(settlementData) {
    try {
        
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
        
        // 保存到settlementRecords键（与结算借支页面保持一致）
        localStorage.setItem('settlementRecords', JSON.stringify(settlementData));
        
        // 结算记录数据保存成功（静默）
    } catch (error) {
        console.error('❌ 保存结算记录数据到本地存储失败:', error);
    }
}


/**
 * 处理项目数据，创建便于查找的索引（仅在内存中，不保存到localStorage）
 * @param {Array} projectsData - 项目数据数组
 * @returns {Object} 项目索引对象
 */
function createProjectIndex(projectsData) {
    try {
        
        const projectIndex = {};
        
        if (Array.isArray(projectsData)) {
            projectsData.forEach(project => {
                if (project && project.projectid) {
                    projectIndex[project.projectid] = project;
                }
            });
        }
        
        // 项目索引创建成功（静默）
        return projectIndex;
    } catch (error) {
        console.error('❌ 创建项目索引失败:', error);
        return {};
    }
}

/**
 * 同步项目数据的主函数
 * @returns {Promise<Array>} 获取到的项目数据数组
 */
async function syncProjectData() {
    try {
        // 获取Supabase客户端实例（全局已初始化）
        const supabaseClient = getSupabaseClient();
        
        
        // 从Supabase获取最新项目数据
        const projectsData = await fetchProjectsFromSupabase(supabaseClient);
        
        // 创建项目索引
        createProjectIndex(projectsData);
        
        // 保存项目数据到本地存储
        saveProjectsToLocalStorage(projectsData);
        
        // 异步获取考勤记录数据，不阻塞主流程
        setTimeout(async () => {
            try {
                const attendanceData = await fetchAttendanceRecordsFromSupabase(supabaseClient, projectsData);
                saveAttendanceRecordsToLocalStorage(attendanceData);
                
                // 触发数据更新事件
                if (window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('dataUpdated', {
                        detail: {
                            type: 'attendance',
                            count: attendanceData.length
                        }
                    }));
                }
            } catch (error) {
                console.error('❌ 异步获取考勤记录数据失败:', error);
            }
        }, 0);
        
        // 异步获取结算记录数据，不阻塞主流程
        setTimeout(async () => {
            try {
                const settlementData = await fetchSettlementRecordsFromSupabase(supabaseClient, projectsData);
                saveSettlementRecordsToLocalStorage(settlementData);
                
                // 触发数据更新事件
                if (window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('dataUpdated', {
                        detail: {
                            type: 'settlement',
                            count: settlementData.length
                        }
                    }));
                }
            } catch (error) {
                console.error('❌ 异步获取结算记录数据失败:', error);
            }
        }, 0);
        
        // 立即返回项目数据，不等待考勤和结算记录数据获取完成
        return projectsData;
    } catch (error) {
        console.error('❌ 项目数据同步失败:', error.message);
        throw error;
    }
}



/**
 * 检查是否需要同步
 * 简化实现：始终返回true，表示每次都执行同步
 * @returns {boolean} 是否需要同步
 */
function shouldSync() {
    return true;
}

/**
 * 初始化项目数据同步服务
 * @param {Object} options - 配置选项
 * @param {boolean} options.syncOnLoad - 页面加载时是否同步（默认：true）
 * @param {Function} options.syncCallback - 同步完成后的回调函数
 */
function initProjectDataSync(options = {}) {
    const {
        syncOnLoad = true,
        syncCallback = null
    } = options;
    
    // 页面加载时执行同步
    if (syncOnLoad) {
        // 添加延迟，确保DOM和其他依赖已加载
        setTimeout(async () => {
            try {
                // 每次都执行同步
                await syncProjectData();
                
                // 执行回调函数
                if (typeof syncCallback === 'function') {
                    syncCallback(true, []); // 移除getLocalProjectsData调用
                }
            } catch (error) {
                console.error('初始同步失败:', error);
                if (typeof syncCallback === 'function') {
                    syncCallback(false, []); // 移除getLocalProjectsData调用
                }
            }
        }, 0); // 0ms延迟，确保其他脚本已加载
    }
}

/**
 * 从本地存储获取项目数据
 * @returns {Array} 项目数据数组
 */
function getLocalProjectsData() {
    try {
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
        
        const cacheKey = 'project_cache_' + userId;
        const cachedData = localStorage.getItem(cacheKey);
        
        if (cachedData) {
            return JSON.parse(cachedData);
        }
        
        return [];
    } catch (error) {
        console.error('❌ 从本地存储获取项目数据失败:', error);
        return [];
    }
}

/**
 * 从本地存储获取考勤记录数据
 * @returns {Array} 考勤记录数据数组
 */
function getLocalAttendanceRecordsData() {
    try {
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
        
        // 从新的存储位置获取考勤数据
        const workRecordsKey = 'work_records_' + userId;
        const cachedData = localStorage.getItem(workRecordsKey);
        
        if (cachedData) {
            return JSON.parse(cachedData);
        }
        
        return [];
    } catch (error) {
        console.error('❌ 从本地存储获取考勤记录数据失败:', error);
        return [];
    }
}

/**
 * 从本地存储获取结算记录数据
 * @returns {Array} 结算记录数据数组
 */
function getLocalSettlementRecordsData() {
    try {
        // 从新的存储位置获取结算数据
        const cachedData = localStorage.getItem('settlementRecords');
        
        if (cachedData) {
            return JSON.parse(cachedData);
        }
        
        return [];
    } catch (error) {
        console.error('❌ 从本地存储获取结算记录数据失败:', error);
        return [];
    }
}

/**
 * 导出同步服务的主要功能
 */
const ProjectSyncService = {
    syncProjectData,
    shouldSync,
    initProjectDataSync,
    getLocalProjectsData,
    getLocalAttendanceRecordsData,
    getLocalSettlementRecordsData
};


// 导出到全局作用域
window.ProjectSyncService = ProjectSyncService;