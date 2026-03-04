// 员工数据同步服务
// 功能：从supabase获取当前登录账号匹配的员工信息并存储到本地

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
 * 从Supabase获取员工数据
 * @param {Object} supabaseClient - Supabase客户端实例
 * @param {Array} projectIds - 必需，指定要获取员工数据的项目ID数组
 * @returns {Promise<Array>} 员工数据数组
 */
async function fetchEmployeesFromSupabase(supabaseClient, projectIds) {
    try {
        // 使用传入的项目ID数组，取消本地获取项目ID的逻辑
        const ongoingProjectIds = projectIds || [];
        
        // 如果没有传入项目ID数组或项目ID数组为空，返回空数组
        if (ongoingProjectIds.length === 0) {
            console.warn('⚠️ 未传入项目ID数组或项目ID数组为空，无法获取员工数据');
            return [];
        }
        
        // 获取所有员工数据，按项目ID过滤
        const { data, error } = await supabaseClient
            .from('employees')
            .select('*')
            .in('project_id', ongoingProjectIds)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('❌ 从Supabase获取员工数据失败:', error);
            throw error;
        }
        
        console.log('✅ 从Supabase获取员工数据成功，共', data.length, '名员工');
        return data;
    } catch (error) {
        console.error('❌ 获取员工数据时发生错误:', error);
        throw new Error('获取员工数据失败');
    }
}

/**
 * 将员工数据保存到本地存储
 * @param {Array} employeesData - 员工数据数组
 */
function saveEmployeesToLocalStorage(employeesData) {
    try {
        // 获取当前登录用户的手机号，如果没有则使用default
        const phone = localStorage.getItem('loggedInPhone') || 'default';
        
        // 获取当前项目ID和名称 - 与员工录入页面保持一致，使用项目名称而不是项目ID
        const currentProjectName = localStorage.getItem('currentProjectName') || '';
        const currentProjectId = localStorage.getItem('currentProjectId') || currentProjectName;
        
        // 为每个项目创建独立的员工数据存储，与员工录入页面保持一致的键名格式
        // 按项目ID分组员工数据（确保唯一性）
        const employeesByProject = {};
        
        // 遍历员工数据，按项目分组
        if (Array.isArray(employeesData)) {
            employeesData.forEach(employee => {
                // 获取项目ID和名称，确保有默认值
                const projectId = employee.project_id || employee.projectid || 'default_project';
                const projectName = employee.project_name || employee.projectname || '未命名项目';
                
                // 如果该项目尚未初始化，则创建数组
                if (!employeesByProject[projectId]) {
                    employeesByProject[projectId] = {
                        projectName: projectName,
                        projectId: projectId,
                        employees: []
                    };
                }
                
                // 将员工数据转换为简化格式，只包含英文字段
                const enhancedEmployee = {
                    // 按照要求的字段顺序：employee_id、project_id、emp_code在前
                    employee_id: employee.employee_id || '',
                    project_id: projectId,
                    emp_code: employee.emp_code || '',              // 工号
                    emp_name: employee.emp_name || '',           // 姓名
                    status: employee.status || '在职',           // 状态
                    labor_cost: employee.labor_cost || '',           // 工价
                    phone: employee.phone || '',           // 电话
                    id_card: employee.id_card || '',        // 身份证
                    hire_date: employee.hire_date || '',    // 入职日期
                    leave_date: employee.leave_date || '',    // 离职日期
                    remarks: employee.remarks || '',           // 备注
                    bank_name: employee.bank_name || '',           // 银行
                    bank_card_number: employee.bank_card_number || '',        // 卡号
                    bank_address: employee.bank_address || ''        // 开户行地址
                };
                
                // 将员工添加到对应项目的数组中
                employeesByProject[projectId].employees.push(enhancedEmployee);
            });
        }
        
        // 为每个项目保存独立的员工数据，与员工录入页面格式完全一致
        Object.keys(employeesByProject).forEach(projectId => {
            const projectData = employeesByProject[projectId];
            const projectEmployees = projectData.employees;
            
            // 确保项目ID不为空，避免生成无效的键名
            const validProjectId = projectData.projectId || projectId || 'default_project';
            
            // 使用项目ID作为键名（与员工录入页面保持一致）
            const key = `employees_${validProjectId}`;
            const dataToSave = {
                employees: projectEmployees,
                project_id: validProjectId,
                timestamp: Date.now()
            };
            
            localStorage.setItem(key, JSON.stringify(dataToSave));
            // 项目员工数据保存成功（静默）
            
            // 同时保存时间戳
            localStorage.setItem(`${key}_timestamp`, Date.now().toString());
        });
        
        // 保存当前项目的员工数据到通用键（兼容旧版本）- 与员工录入页面保持一致
        const currentProjectEmployees = employeesByProject[currentProjectId]?.employees || [];
        const cacheKey = 'employee_cache_' + phone;
        localStorage.setItem(cacheKey, JSON.stringify(currentProjectEmployees));
        
        // 员工索引存储（基于当前项目）
        const indexKey = 'employee_index_' + phone;
        localStorage.setItem(indexKey, JSON.stringify(currentProjectEmployees));
        
        // 基本的本地数据存储
        localStorage.setItem('localEmployeesData', JSON.stringify(employeesData));
        
        // 员工数据保存到本地存储成功（静默）
    } catch (error) {
        console.error('❌ 保存员工数据到本地存储失败:', error);
        throw new Error('保存员工数据失败');
    }
}

/**
 * 处理员工数据，创建便于查找的索引
 * @param {Array} employeesData - 员工数据数组
 * @returns {Object} 员工索引对象
 */
function createEmployeeIndex(employeesData) {
    try {
        const employeeIndex = {};
        
        if (Array.isArray(employeesData)) {
            employeesData.forEach(employee => {
                if (employee && employee.employee_id) {
                    employeeIndex[employee.employee_id] = employee;
                }
            });
        }
        
        // 保存索引到localStorage
        localStorage.setItem('employeesIndex', JSON.stringify(employeeIndex));
        
        // 员工索引创建成功（静默）
        return employeeIndex;
    } catch (error) {
        console.error('❌ 创建员工索引失败:', error);
        return {};
    }
}

/**
 * 格式化时间戳，移除毫秒精度并确保正确的显示格式
 * @param {string} timestamp - 时间戳字符串
 * @returns {string} 格式化后的时间字符串 (YYYY-MM-DD HH:MM:SS)
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    
    try {
        // 检查是否已经是我们生成的北京时间格式（YYYY-MM-DD HH:MM:SS或YYYY-MM-DD HH:MM:SS.mmm）
        // 这种格式的时间戳不需要再进行时区转换
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(timestamp)) {
            // 已经是标准格式，移除毫秒部分后返回
            return timestamp.split('.')[0];
        }
        
        // 如果时间戳包含毫秒精度（如.855483），则移除
        const cleanTimestamp = timestamp.split('.')[0];
        
        // 处理ISO格式时间戳（如2023-01-01T12:00:00）
        if (cleanTimestamp.includes('T')) {
            // 创建Date对象，会自动处理时区
            const date = new Date(cleanTimestamp);
            
            // 检查日期是否有效
            if (isNaN(date.getTime())) {
                // 如果无法解析，返回原始字符串（移除T）
                return cleanTimestamp.replace('T', ' ');
            }
            
            // 检查是否是UTC时间（以Z结尾）
            if (cleanTimestamp.endsWith('Z')) {
                // 如果是UTC时间，直接格式化为本地时间（不再手动加8小时）
                const localTime = new Date(date.getTime());
                
                // 格式化为YYYY-MM-DD HH:MM:SS
                const year = localTime.getFullYear();
                const month = String(localTime.getMonth() + 1).padStart(2, '0');
                const day = String(localTime.getDate()).padStart(2, '0');
                const hours = String(localTime.getHours()).padStart(2, '0');
                const minutes = String(localTime.getMinutes()).padStart(2, '0');
                const seconds = String(localTime.getSeconds()).padStart(2, '0');
                
                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            } else {
                // 如果不是UTC时间，直接格式化为北京时间格式
                // 假设已经是本地时间，不需要时区转换
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const seconds = String(date.getSeconds()).padStart(2, '0');
                
                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            }
        }
        
        // 处理其他格式的时间戳
        // 尝试直接解析
        const date = new Date(cleanTimestamp);
        
        // 检查日期是否有效
        if (isNaN(date.getTime())) {
            // 如果无法解析，返回原始字符串
            return cleanTimestamp;
        }
        
        // 检查是否是UTC时间戳（通过时间戳值判断）
        // 如果时间戳值远小于当前时间，可能是UTC时间
        const currentTime = Date.now();
        const timestampTime = date.getTime();
        
        // 如果时间戳值小于当前时间减8小时，可能是UTC时间
        if (timestampTime < currentTime - 8 * 60 * 60 * 1000) {
            // 可能是UTC时间，转换为本地时间
            const localTime = new Date(timestampTime);
            
            const year = localTime.getFullYear();
            const month = String(localTime.getMonth() + 1).padStart(2, '0');
            const day = String(localTime.getDate()).padStart(2, '0');
            const hours = String(localTime.getHours()).padStart(2, '0');
            const minutes = String(localTime.getMinutes()).padStart(2, '0');
            const seconds = String(localTime.getSeconds()).padStart(2, '0');
            
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        } else {
            // 否则直接使用原始时间
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        }
    } catch (error) {
        console.error('格式化时间戳出错:', error, '原始时间戳:', timestamp);
        // 出错时返回原始处理（移除毫秒，转换T为空格）
        const formatted = timestamp.split('.')[0];
        return formatted.includes('T') ? formatted.replace('T', ' ') : formatted;
    }
}

/**
 * 从Supabase获取用户项目权限数据
 * @param {Object} supabaseClient - Supabase客户端实例
 * @param {Array} projectIds - 项目ID数组
 * @returns {Promise<void>}
 */
async function fetchUserProjectsFromSupabase(supabaseClient, projectIds) {
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (!currentUser) return;
        
        const userId = JSON.parse(currentUser).user_id;
        if (!userId) return;

        let query = supabaseClient.from('user_projects').select('*').eq('user_id', userId);
        
        if (projectIds && projectIds.length > 0) {
            query = query.in('project_id', projectIds);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        if (data) {
             const key = `user_projects_${userId}`;
             const existingStr = localStorage.getItem(key);
             let allUserProjects = existingStr ? JSON.parse(existingStr) : [];
             
             // Update or add records
             data.forEach(record => {
                 const index = allUserProjects.findIndex(p => p.project_id === record.project_id);
                 if (index !== -1) {
                     allUserProjects[index] = record;
                 } else {
                     allUserProjects.push(record);
                 }
             });
             
             localStorage.setItem(key, JSON.stringify(allUserProjects));
             // console.log(`✅ 同步了 ${data.length} 条用户项目权限数据`);
        }
        
    } catch (error) {
        console.error('❌ 获取用户项目权限数据失败:', error);
    }
}

/**
 * 同步员工数据的主函数
 * @param {Array} [projectIds] - 可选，指定要同步的项目ID数组
 * @returns {Promise<boolean>} 是否同步成功
 */
async function syncEmployeeData(projectIds = null) {
    try {
        // 获取Supabase客户端实例（全局已初始化）
        const supabaseClient = getSupabaseClient();
        
        // 并行获取员工数据和用户项目权限数据
        const promises = [
            fetchEmployeesFromSupabase(supabaseClient, projectIds)
        ];
        
        // 添加获取用户项目权限数据的任务
        promises.push(fetchUserProjectsFromSupabase(supabaseClient, projectIds));
        
        const [employeesData] = await Promise.all(promises);
        
        // 创建员工索引
        createEmployeeIndex(employeesData);
        
        // 保存数据到本地存储
        saveEmployeesToLocalStorage(employeesData);
        
        // 不输出员工数据同步完成的日志
        return true;
    } catch (error) {
        console.error('❌ 员工数据同步失败:', error.message);
        throw error;
    }
}

/**
 * 获取本地存储的员工数据
 * @returns {Array} 员工数据数组
 */
function getLocalEmployeesData() {
    try {
        const phone = localStorage.getItem('loggedInPhone') || 'default';
        const cacheKey = 'employee_cache_' + phone;
        const cachedData = localStorage.getItem(cacheKey);
        
        if (cachedData) {
            return JSON.parse(cachedData);
        }
        
        // 尝试从基本存储获取
        const basicData = localStorage.getItem('localEmployeesData');
        return basicData ? JSON.parse(basicData) : [];
    } catch (error) {
        console.error('❌ 获取本地员工数据失败:', error);
        return [];
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
 * 初始化员工数据同步服务
 * @param {Object} options - 配置选项
 * @param {boolean} options.syncOnLoad - 页面加载时是否同步（默认：true）
 * @param {Function} options.syncCallback - 同步完成后的回调函数
 */
function initEmployeeDataSync(options = {}) {
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
                await syncEmployeeData([]);
                
                // 执行回调函数
                if (typeof syncCallback === 'function') {
                    syncCallback(true, getLocalEmployeesData());
                }
            } catch (error) {
                console.error('初始同步失败:', error);
                if (typeof syncCallback === 'function') {
                    syncCallback(false, []);
                }
            }
        }, 0); // 0ms延迟，确保其他脚本已加载
    }
}

/**
 * 导出同步服务的主要功能
 */
const EmployeeSyncService = {
    syncEmployeeData,
    getLocalEmployeesData,
    shouldSync,
    initEmployeeDataSync
};

// 将服务添加到全局作用域
window.EmployeeSyncService = EmployeeSyncService;
window.syncEmployeeData = syncEmployeeData;
window.getLocalEmployeesData = getLocalEmployeesData;