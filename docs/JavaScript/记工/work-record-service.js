/**
 * 记工记录服务 - 负责处理记工数据的收集、验证和保存
 */
class WorkRecordService {
    constructor() {
        // 全局变量引用
        this.selectedEmployeeIds = new Set();
        this.employees = [];
        this.activeEmployees = [];
        this.inactiveEmployees = [];
    }    

    /**
     * 检查权限
     * @param {string} permissionName - 权限字段名
     * @returns {boolean} 是否有权限
     */
    checkPermission(permissionName) {
        try {
            // 获取当前登录用户ID
            const currentUserStr = localStorage.getItem('currentUser');
            if (!currentUserStr) return false;
            
            const currentUser = JSON.parse(currentUserStr);
            const userId = currentUser.user_id;
            if (!userId) return false;
            
            // 获取当前项目ID
            const projectId = localStorage.getItem('currentProjectId');
            if (!projectId) return false;
            
            // 检查是否是项目所有者
            const projectsCache = localStorage.getItem(`project_cache_${userId}`);
            if (projectsCache) {
                const projects = JSON.parse(projectsCache);
                const project = projects.find(p => p.project_id === projectId);
                if (project && project.user_id === userId) {
                    return true; // 拥有者有所有权限
                }
            }

            // 获取用户项目权限列表
            const userProjectsStr = localStorage.getItem(`user_projects_${userId}`);
            if (!userProjectsStr) {
                return false; // 既无权限记录也不是拥有者
            }
            
            const userProjects = JSON.parse(userProjectsStr);
            const permissionRecord = userProjects.find(p => p.project_id === projectId);
            
            if (!permissionRecord) {
                return false;
            }
            
            return permissionRecord[permissionName] === true;
        } catch (e) {
            console.error('检查权限失败:', e);
            return false;
        }
    }


    
    /**
     * 确认删除记工 - 核心功能
     * @param {string} record_id - 要删除的记录ID
     */
    confirmDeleteWorkRecord(record_id) {
        // 权限检查
        if (!this.checkPermission('perm_delete_work_record')) {
            this.showNotification('你无删除记工权限！', true);
            return;
        }

        // 显示确认删除模态框
        this.showConfirmModal('删除记工', '确定要删除这条记工记录吗？此操作不可撤销。', () => {
            this.deleteWorkRecord(record_id);
        });
    }
    
    /**
     * 删除记工记录
     * @param {string} record_id - 要删除的记录ID
     */
    async deleteWorkRecord(record_id) {
        try {
            // 重置标志位，确保每次调用都可以输出日志
            this.getRecordLogOutput = false;
            
            // 获取当前记录数据，以便获取image_ids
            const record = this._getRecordById(record_id);
            if (!record) {
                this.showNotification('未找到要删除的记录', true);
                return;
            }
            
            // 提取图片数据，以便后续删除
            let imagesToDelete = [];
            if (record.image_ids && Array.isArray(record.image_ids) && record.image_ids.length > 0) {
                imagesToDelete = record.image_ids;
            } else if (record.image_ids && typeof record.image_ids === 'string') {
                // 处理image_ids是字符串的情况
                const imageIdsArray = JSON.parse(record.image_ids);
                if (Array.isArray(imageIdsArray) && imageIdsArray.length > 0) {
                    imagesToDelete = imageIdsArray;
                }
            }
            
            // 检查网络状态
            const isOnline = navigator.onLine;
            
            // 先删除本地存储中的记录，这样后续检查图片引用时不会检测到当前记录
            await this._deleteRecordFromLocal(record_id);
            
            // 处理Supabase删除
            if (isOnline) {
                // 在线模式：直接删除Supabase中的记录
                await this._deleteRecordFromSupabase(record_id);
            } else {
                // 离线模式：添加到同步队列
                if (window.offlineSyncService) {
                    // 构建包含完整复合主键的删除数据
                    const deleteData = {
                        record_id: record_id,
                        employee_id: record.employee_id || (record.employees && record.employees[0]?.employee_id),
                        record_date: record.record_date || record.date,
                        project_id: record.project_id,
                        work_type: record.work_type,
                        phone: localStorage.getItem('loggedInPhone') || 'default'
                    };
                    
                    window.offlineSyncService.addToSyncQueue('delete', deleteData, `delete_${record_id}`, 'attendance');
                }
            }
            
            // 现在记录已删除，再检查图片引用并删除图片
            if (imagesToDelete.length > 0) {
                await this._deleteRecordImages(imagesToDelete, record_id);
            }
            
            this.showNotification('记工记录已成功删除', false);
            
            // 检查是否从统计页面进入
            const urlParams = new URLSearchParams(window.location.search);
            const from = urlParams.get('from');
            
            if (from === 'statistic') {
                    // 从统计页面进入,返回统计页面
                    const statisticFilter = JSON.parse(localStorage.getItem('statisticFilter') || '{}');
                    
                    // 构建统计页面URL
                    const baseUrl = window.location.href.split('?')[0];
                    const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
                    const statisticUrl = new URL(basePath + '统计.html');
                    if (statisticFilter.projectId) {
                        statisticUrl.searchParams.append('project_id', statisticFilter.projectId);
                    }
                    
                    // 跳转到统计页面
                    window.location.href = statisticUrl.href;
                    return;
                }
            
            // 获取删除记录的日期
            const recordDate = record.record_date || record.date;
            
            // 重置表单
            this.resetForm();
            
            // 刷新员工列表
            const currentProjectName = document.getElementById('projectName').value;
            await this.loadEmployeeData(currentProjectName);
            
            // 恢复标签页导航显示
            const tabNavigation = document.querySelector('.work-type.tab-navigation');
            if (tabNavigation) {
                tabNavigation.parentElement.style.display = 'block';
            }
            
            // 切换到新建模式
            if (typeof window.setEditMode === 'function') {
                window.setEditMode(false);
            }
            
            // 隐藏底部的保存修改和删除按钮
            const bottomButtonsContainer = document.querySelector('.bottom-buttons');
            if (bottomButtonsContainer) {
                // 隐藏保存修改按钮
                const confirmButton = document.getElementById('confirmBtn');
                if (confirmButton) {
                    confirmButton.style.display = 'none';
                }
                
                // 隐藏删除按钮
                const deleteButton = document.getElementById('deleteBtn');
                if (deleteButton) {
                    deleteButton.style.display = 'none';
                }
            }
            
            // 从URL中移除record_id参数，确保页面重新加载或切换标签页时不会再次进入编辑模式
            const url = new URL(window.location.href);
            url.searchParams.delete('record_id');
            window.history.replaceState({}, '', url);
            
            // 先进入记工的新建模式，确保所有新建模式的状态都被正确恢复
            if (typeof window.loadNormalMode === 'function') {
                window.loadNormalMode();
            }
            
            // 切换到记工流水标签页
            const tabWorkFlow = document.getElementById('tabWorkFlow');
            if (tabWorkFlow) {
                tabWorkFlow.checked = true;
                // 触发change事件，确保标签页内容切换
                tabWorkFlow.dispatchEvent(new Event('change'));
            }
            
            // 设置日期选择器的日期为删除记录的日期
            const workDateInput = document.getElementById('workDate');
            if (workDateInput && recordDate) {
                workDateInput.value = recordDate;
                // 触发change事件，确保日期选择器更新
                workDateInput.dispatchEvent(new Event('change'));
            }
            
            // 触发记工确认事件，用于刷新记工流水
            const event = new Event('workRecordConfirmed');
            document.dispatchEvent(event);
            

        } catch (error) {
            console.error('删除记工记录失败:', error);
            console.error('错误堆栈:', error.stack);
            this.showNotification('删除记录失败: ' + error.message, true);
        }
    }
    
    /**
     * 根据record_id获取记录
     * @param {string} record_id - 记录ID
     * @returns {Object} 记录对象
     */
    _getRecordById(record_id) {
        try {
            // 调试信息：打印获取记录的参数

            
            // 检查记录是否直接存储在根键下
            const directRecord = localStorage.getItem(record_id);
            if (directRecord) {
                // 只有当标志位为false时才输出日志
                if (!this.getRecordLogOutput) {

                    // 设置标志位为true，防止重复输出
                    this.getRecordLogOutput = true;
                }
                const recordData = JSON.parse(directRecord);
                return recordData.data || recordData;
            }
            
            // 检查workRecords键（旧格式）
            const workRecordsOld = JSON.parse(localStorage.getItem('workRecords') || '[]');
            const recordFromOld = workRecordsOld.find(record => record.record_id === record_id);
            if (recordFromOld) {
                // 只有当标志位为false时才输出日志
                if (!this.getRecordLogOutput) {

                    // 设置标志位为true，防止重复输出
                    this.getRecordLogOutput = true;
                }
                return recordFromOld;
            }
            
            // 检查work_records_${userId}键（新格式）
            const userId = JSON.parse(localStorage.getItem('currentUser'))?.user_id || 'default';
            const key = `work_records_${userId}`;
            const workRecords = JSON.parse(localStorage.getItem(key) || '[]');
            const recordFromNew = workRecords.find(record => record.record_id === record_id);
            if (recordFromNew) {
                // 只有当标志位为false时才输出日志
                if (!this.getRecordLogOutput) {

                    // 设置标志位为true，防止重复输出
                    this.getRecordLogOutput = true;
                }
                return recordFromNew;
            }
            
            // 检查attendance_records相关键
            const attendanceKey = `attendance_records_${userId}`;
            const attendanceRecords = JSON.parse(localStorage.getItem(attendanceKey) || '[]');
            const recordFromAttendance = attendanceRecords.find(record => record.record_id === record_id);
            if (recordFromAttendance) {
                // 只有当标志位为false时才输出日志
                if (!this.getRecordLogOutput) {

                    // 设置标志位为true，防止重复输出
                    this.getRecordLogOutput = true;
                }
                return recordFromAttendance;
            }
            
            // 检查attendance_data_前缀的键
            const attendanceDataKey = `attendance_data_${record_id}`;
            const attendanceData = localStorage.getItem(attendanceDataKey);
            if (attendanceData) {
                return JSON.parse(attendanceData);
            }
            
            return null;
        } catch (error) {
            console.error('获取记录失败:', error);
            return null;
        }
    }
    
    // 用于跟踪获取记录日志的输出情况
    getRecordLogOutput = false;
    
    /**
     * 获取考勤记录 - 公共方法，供外部函数调用
     * @param {string} record_id - 记录ID
     * @returns {Object} 记录对象
     */
    getAttendanceRecord(record_id) {
        // 重置标志位，确保每次调用都可以输出日志
        this.getRecordLogOutput = false;
        return this._getRecordById(record_id);
    }
    
    /**
     * 保存考勤记录 - 公共方法，供外部函数调用
     * @param {string} record_id - 记录ID
     * @param {Object} record - 记录对象
     */
    saveAttendanceRecord(record_id, record) {
        try {
            // 保存记录到attendance_data_前缀的键
            const attendanceDataKey = `attendance_data_${record_id}`;
            localStorage.setItem(attendanceDataKey, JSON.stringify(record));
            
            // 同时保存到work_records_${userId}键（新格式）
            const userId = JSON.parse(localStorage.getItem('currentUser'))?.user_id || 'default';
            const key = `work_records_${userId}`;
            let workRecords = JSON.parse(localStorage.getItem(key) || '[]');
            
            // 检查记录是否已存在
            const index = workRecords.findIndex(r => r.record_id === record_id);
            if (index !== -1) {
                // 更新现有记录
                workRecords[index] = record;
            } else {
                // 添加新记录
                workRecords.push(record);
            }
            
            localStorage.setItem(key, JSON.stringify(workRecords));
            
            return true;
        } catch (error) {
            console.error('保存记录失败:', error);
            return false;
        }
    }
    
    /**
     * 检查图片引用 - 检查所有本地存储位置的记录
     * @private
     */
    async _checkImageReferences(image_ids, record_id) {
        try {
            // 在线模式下，优先检查Supabase数据库
            const isOnline = navigator.onLine;
            if (isOnline && window.supabase) {
                try {
                    // 等待Supabase客户端初始化完成
                    const supabase = await window.waitForSupabase();
                    // 构建OR条件，检查图片数组中是否包含任何要删除的图片
                    const orConditions = image_ids.map(img => `image_ids.cs.{"${img}"}`).join(',');
                    const { data, error } = await supabase
                        .from('attendance_records')
                        .select('image_ids')
                        .not('record_id', 'eq', record_id)
                        .or(orConditions);
                    
                    if (data && data.length > 0) {
                        // 检查查询结果中是否有实际引用
                        for (const record of data) {
                            if (record.image_ids) {
                                let recordImageIds = record.image_ids;
                                // 处理字符串类型的image_ids
                                if (typeof recordImageIds === 'string') {
                                    try {
                                        recordImageIds = JSON.parse(recordImageIds);
                                    } catch (e) {
                                        continue;
                                    }
                                }
                                
                                if (Array.isArray(recordImageIds)) {
                                    for (const img of recordImageIds) {
                                        if (image_ids.includes(img)) {
                                            return true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('查询Supabase图片引用失败:', error);
                    // 继续检查本地存储，不中断流程
                }
            }
            
            // 获取当前用户信息
            const userId = JSON.parse(localStorage.getItem('currentUser'))?.user_id || 'default';
            const phone = localStorage.getItem('loggedInPhone') || 'default';
            
            // 检查所有可能的本地存储位置
            const storageSources = [
                `work_flow_data_${phone}`,
                'workRecords',
                `work_records_${userId}`,
                `attendance_records_${userId}`,
                `work_records_cache`,
                `attendance_records_cache`,
                'offline_work_records',
                'offline_sync_queue'
            ];
            
            for (const source of storageSources) {
                try {
                    const storedData = localStorage.getItem(source);
                    if (storedData) {
                        const parsedData = JSON.parse(storedData);
                        
                        if (source === `work_flow_data_${phone}`) {
                            // 记工流水数据，格式为 { date: [records] }
                            for (const [date, dayRecords] of Object.entries(parsedData)) {
                                if (Array.isArray(dayRecords)) {
                                    for (const record of dayRecords) {
                                        // 排除当前要删除的记录
                                        if (record.record_id === record_id || record.id === record_id) {
                                            continue;
                                        }
                                        
                                        // 检查当前记录是否引用了要删除的图片
                                        if (record.image_ids) {
                                            let recordImageIds = record.image_ids;
                                            if (typeof recordImageIds === 'string') {
                                                try {
                                                    recordImageIds = JSON.parse(recordImageIds);
                                                } catch (e) {
                                                    continue;
                                                }
                                            }
                                            
                                            if (Array.isArray(recordImageIds)) {
                                                for (const img of recordImageIds) {
                                                    if (image_ids.includes(img)) {
                                                        return true;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        } else if (source === 'offline_sync_queue') {
                            // 检查离线同步队列中的数据
                            if (Array.isArray(parsedData)) {
                                for (const queueItem of parsedData) {
                                    // 跳过删除操作，只检查保存和更新操作
                                    if (queueItem.operation === 'delete') {
                                        continue;
                                    }
                                    
                                    // 获取记录数据
                                    const recordData = queueItem.data;
                                    if (recordData && recordData.image_ids) {
                                        let recordImageIds = recordData.image_ids;
                                        if (typeof recordImageIds === 'string') {
                                            try {
                                                recordImageIds = JSON.parse(recordImageIds);
                                            } catch (e) {
                                                continue;
                                            }
                                        }
                                        
                                        if (Array.isArray(recordImageIds)) {
                                            for (const img of recordImageIds) {
                                                if (image_ids.includes(img)) {
                                                    return true;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        } else if (Array.isArray(parsedData)) {
                            // 其他存储位置，格式为 [records]
                            for (const record of parsedData) {
                                // 排除当前要删除的记录
                                if (record.record_id === record_id || record.id === record_id) {
                                    continue;
                                }
                                
                                // 检查当前记录是否引用了要删除的图片
                                if (record.image_ids) {
                                    let recordImageIds = record.image_ids;
                                    if (typeof recordImageIds === 'string') {
                                        try {
                                            recordImageIds = JSON.parse(recordImageIds);
                                        } catch (e) {
                                            continue;
                                        }
                                    }
                                    
                                    if (Array.isArray(recordImageIds)) {
                                        for (const img of recordImageIds) {
                                            if (image_ids.includes(img)) {
                                                return true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error(`从${source}检查图片引用失败:`, e);
                    // 继续检查下一个存储位置，不中断流程
                }
            }
            
            // 没有其他引用，返回false
            return false;
        } catch (error) {
            console.error('检查图片引用失败:', error);
            // 出错时默认返回false，避免影响删除流程
            return false;
        }
    }

    /**
     * 删除记录的图片
     * @param {Array} image_ids - 图片ID数组
     */
    /**
     * 检查图片是否变更
     * @param {Array} currentImages - 当前图片选择器中的图片
     * @param {Array} oldImages - 旧图片URL数组
     * @returns {boolean} - 图片是否变更
     */
    _checkIfImagesChanged(currentImages, oldImages) {
        // 如果没有旧图片，但当前有图片，说明是新增图片
        if (!oldImages || oldImages.length === 0) {
            return currentImages.length > 0;
        }
        
        // 如果有旧图片但没有当前图片，说明图片被删除了
        if (!currentImages || currentImages.length === 0) {
            return true;
        }
        
        // 如果图片数量不同，说明有变更
        if (currentImages.length !== oldImages.length) {
            return true;
        }
        
        // 检查每个图片是否都有 originalUrl 属性
        // 如果所有图片都有 originalUrl，说明是从旧图片下载的，需要进一步检查
        const allHaveOriginalUrl = currentImages.every(img => img.originalUrl);
        
        if (allHaveOriginalUrl) {
            // 检查 originalUrl 是否与 oldImages 完全匹配
            const currentUrls = currentImages.map(img => img.originalUrl);
            const urlsMatch = currentUrls.every((url, index) => url === oldImages[index]);
            
            return !urlsMatch;
        } else {
            // 如果有图片没有 originalUrl，说明是新上传的图片
            return true;
        }
    }
    
    /**
     * 删除记录的图片
     * @param {Array} image_ids - 图片ID数组
     * @param {string} record_id - 记录ID
     */
    async _deleteRecordImages(image_ids, record_id) {
        try {
            // 检查image_ids是否有效
            if (!Array.isArray(image_ids) || image_ids.length === 0) {
                return;
            }
            
            // 检查是否还有其他记录在使用这些图片
            const hasOtherReferences = await this._checkImageReferences(image_ids, record_id);
            if (hasOtherReferences) {
                // 有其他记录引用，只删除本地引用，不删除云端图片
                // 但仍然删除本地缓存，避免占用本地空间
                // 删除本地存储中的图片数据（仅删除特定的图片缓存，避免误删其他数据）
                image_ids.forEach(imageUrl => {
                    // 只删除特定的图片缓存键，避免误删其他数据
                    if (typeof imageUrl === 'string' && imageUrl.startsWith('https://')) {
                        // 提取文件名作为可能的本地存储键
                        const urlParts = imageUrl.split('/');
                        const fileName = urlParts.pop();
                        if (fileName) {
                            // 只删除明确的图片缓存键，不进行模糊匹配
                            const possibleKeys = [
                                `image_cache_${fileName}`,
                                `temp_image_${fileName}`,
                                `upload_${fileName}`
                            ];
                            possibleKeys.forEach(key => {
                                if (localStorage.getItem(key)) {
                                    localStorage.removeItem(key);
                                }
                            });
                        }
                    } else if (typeof imageUrl === 'string') {
                        // 对于非URL，只删除明确是图片缓存的键
                        if (imageUrl.startsWith('image_') || imageUrl.startsWith('temp_')) {
                            localStorage.removeItem(imageUrl);
                        }
                    }
                });
                return;
            }
            
            // 检查网络状态
            const isOnline = navigator.onLine;
            
            // 构建图片删除数据，用于添加到同步队列
            const imageDeleteOperations = [];
            
            // 如果在线，尝试删除Supabase存储中的图片
            if (isOnline && window.supabase) {
                try {
                    // 等待Supabase客户端初始化完成
                    const supabase = await window.waitForSupabase();
                    const bucketName = 'FYKQ';
                    
                    for (const imageUrl of image_ids) {
                        try {
                            // 从URL中提取完整的文件路径
                            const urlParts = imageUrl.split('/');
                            // 找到包含bucketName的索引
                            const bucketIndex = urlParts.indexOf('FYKQ');
                            if (bucketIndex !== -1 && bucketIndex + 1 < urlParts.length) {
                                // 从bucketName后面的部分开始构建完整的文件路径
                                const encodedFilePath = urlParts.slice(bucketIndex + 1).join('/');
                                // 解码文件路径
                                const filePath = decodeURIComponent(encodedFilePath);
                                
                                // 使用Supabase API删除图片
                                await supabase.storage
                                    .from(bucketName)
                                    .remove([filePath]);
                            }
                        } catch (imageError) {
                            // 继续删除其他图片
                        }
                    }
                } catch (error) {
                    // 忽略删除Supabase图片时的错误
                }
            } else {
                // 离线模式：将图片删除操作添加到同步队列
                if (window.offlineSyncService) {
                    for (const imageUrl of image_ids) {
                        // 从URL中提取完整的文件路径
                        const urlParts = imageUrl.split('/');
                        // 找到包含bucketName的索引
                        const bucketIndex = urlParts.indexOf('FYKQ');
                        if (bucketIndex !== -1 && bucketIndex + 1 < urlParts.length) {
                            // 从bucketName后面的部分开始构建完整的文件路径
                            const encodedFilePath = urlParts.slice(bucketIndex + 1).join('/');
                            // 解码文件路径
                            const filePath = decodeURIComponent(encodedFilePath);
                            
                            // 添加到同步队列
                            window.offlineSyncService.addToSyncQueue('delete_image', {
                                filePath: filePath,
                                bucketName: 'FYKQ',
                                projectId: 'oydffrzzulsrbitrrhht'
                            }, `del_img_${filePath}_${Date.now()}`, 'image');
                        }
                    }
                }
            }
            
            // 删除本地存储中的图片数据（仅删除特定的图片缓存，避免误删其他数据）
            image_ids.forEach(imageUrl => {
                // 只删除特定的图片缓存键，避免误删其他数据
                if (typeof imageUrl === 'string' && imageUrl.startsWith('https://')) {
                    // 提取文件名作为可能的本地存储键
                    const urlParts = imageUrl.split('/');
                    const fileName = urlParts.pop();
                    if (fileName) {
                        // 只删除明确的图片缓存键，不进行模糊匹配
                        const possibleKeys = [
                            `image_cache_${fileName}`,
                            `temp_image_${fileName}`,
                            `upload_${fileName}`
                        ];
                        possibleKeys.forEach(key => {
                            if (localStorage.getItem(key)) {
                                localStorage.removeItem(key);
                            }
                        });
                    }
                } else if (typeof imageUrl === 'string') {
                    // 对于非URL，只删除明确是图片缓存的键
                    if (imageUrl.startsWith('image_') || imageUrl.startsWith('temp_')) {
                        localStorage.removeItem(imageUrl);
                    }
                }
            });
            
        } catch (error) {
            console.error('删除图片失败:', error);
            // 继续执行，不中断删除流程
        }
    }
    
    /**
     * 从本地存储删除记录
     * @param {string} record_id - 记录ID
     */
    async _deleteRecordFromLocal(record_id) {
        try {
            // 获取记录信息，以便从记工流水中删除
            const record = this._getRecordById(record_id);
            if (!record) {
                console.error('未找到要删除的记录:', record_id);
                return;
            }
            
            const recordDate = record.record_date || record.date;
            const phone = localStorage.getItem('loggedInPhone') || 'default';
            
            // 检查记录是否直接存储在根键下，如果是，直接删除
            if (localStorage.getItem(record_id)) {
                localStorage.removeItem(record_id);
            }
            
            // 检查并删除attendance_data_前缀的键
            const attendanceDataKey = `attendance_data_${record_id}`;
            if (localStorage.getItem(attendanceDataKey)) {
                localStorage.removeItem(attendanceDataKey);
            }
            
            // 检查并删除workRecords键（旧格式）
            const workRecordsOld = JSON.parse(localStorage.getItem('workRecords') || '[]');
            const updatedOldRecords = workRecordsOld.filter(r => r.record_id !== record_id);
            if (updatedOldRecords.length !== workRecordsOld.length) {
                localStorage.setItem('workRecords', JSON.stringify(updatedOldRecords));
            }
            
            // 获取user_id，与首页保持一致
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
            
            // 检查并删除work_records_${userId}键（与首页一致的格式）
            const workRecordsKey = `work_records_${userId}`;
            const workRecords = JSON.parse(localStorage.getItem(workRecordsKey) || '[]');
            const updatedRecords = workRecords.filter(r => r.record_id !== record_id);
            if (updatedRecords.length !== workRecords.length) {
                localStorage.setItem(workRecordsKey, JSON.stringify(updatedRecords));
            }
            
            // 同时更新记工流水的本地数据，确保离线模式下删除记工后记工流水能显示最新数据
            if (recordDate) {
                await this.deleteRecordFromWorkFlowData(record_id, recordDate, phone);
            }
        } catch (error) {
            console.error('从本地存储删除记录失败:', error);
        }
    }
    
    /**
     * 从记工流水的本地数据中删除记录 - 确保离线模式下删除记工后记工流水能显示最新数据
     * @param {string} record_id - 记录ID
     * @param {string} recordDate - 记录日期
     * @param {string} phone - 用户手机号
     */
    async deleteRecordFromWorkFlowData(record_id, recordDate, phone) {
        try {
            // 获取user_id，与首页保持一致
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
            
            // 更新work_records_${userId}，确保记录已被删除
            const workRecordsKey = `work_records_${userId}`;
            const workRecords = JSON.parse(localStorage.getItem(workRecordsKey) || '[]');
            const updatedRecords = workRecords.filter(record => 
                record.record_id !== record_id && record.id !== record_id
            );
            if (updatedRecords.length !== workRecords.length) {
                localStorage.setItem(workRecordsKey, JSON.stringify(updatedRecords));
            }
            
            // 移除旧的work_flow_data_${phone}键，因为我们不再使用它了
            const oldWorkFlowKey = `work_flow_data_${phone}`;
            if (localStorage.getItem(oldWorkFlowKey)) {
                localStorage.removeItem(oldWorkFlowKey);
            }
            
            // 同时删除attendance_data中的相关记录
            const keysToDelete = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(`attendance_data_${record_id}`)) {
                    keysToDelete.push(key);
                }
            }
            
            keysToDelete.forEach(key => {
                localStorage.removeItem(key);
            });
        } catch (error) {
            console.error('从记工流水数据中删除记录失败:', error);
        }
    }
    
    /**
     * 从Supabase删除记录
     * @param {string} record_id - 记录ID
     */
    async _deleteRecordFromSupabase(record_id) {
        try {
            // 等待Supabase客户端初始化完成
            const supabase = await window.waitForSupabase();
            
            // 使用Supabase API删除记录
            const { error } = await supabase
                .from('attendance_records')
                .delete()
                .eq('record_id', record_id);
            
            if (error) {
                throw error;
            }
        } catch (error) {
            console.error('从Supabase删除记录失败:', error);
            // 继续执行，不中断删除流程
        }
    }
    
    /**
     * 确认修改记工 - 核心功能
     * @param {string} record_id - 要更新的记录ID
     */
    confirmUpdateWorkRecord(record_id) {
        // 权限检查
        if (!this.checkPermission('perm_edit_work_record')) {
            this.showNotification('你无修改记工权限！', true);
            return;
        }

        // 获取表单数据
        const workTypeRadio = document.querySelector('input[name="workType"]:checked');
        
        // 验证工作类型是否已选择
        if (!workTypeRadio) {
            this.showNotification('请选择工作类型（点工/包工/工量）', true);
            return;
        }
        
        const workType = workTypeRadio.value;
        const projectName = document.getElementById('projectName').value;
        const workDateInput = document.getElementById('workDate');
        const workDate = workDateInput.value;
        const remark = document.getElementById('remark').value;
        
        // 获取项目ID
        const projectId = localStorage.getItem('currentProjectId') || '';

        // 验证必填项 - 增强的数据验证逻辑
        if (!projectName) {
            this.showNotification('请选择项目名称', true);
            return;
        }
        if (!projectId) {
            this.showNotification('未找到项目ID，请重新选择项目', true);
            return;
        }
        if (!workDate) {
            this.showNotification('请选择记工日期', true);
            return;
        }
        if (this.selectedEmployeeIds.size === 0) {
            this.showNotification('请选择员工', true);
            return;
        }
        
        // 处理多日期情况
        let selectedDates = [workDate];
        if (workDateInput.dataset.displayValue) {
            // 如果有多个日期，解析日期范围
            selectedDates = this._parseMultipleDates(workDateInput.dataset.displayValue);
        }

        // 调试：打印选中的日期数组


        // 构建基础记工数据 - 与系统其他部分保持一致的数据结构
        // 处理选中的员工数据

        
        const selectedEmployees = Array.from(this.selectedEmployeeIds).map(employeeId => {
            // 查找员工信息 - 使用统一的employee_id字段名
            const employee = this.employees.find(emp => emp.employee_id === employeeId) || 
                           this.activeEmployees.find(emp => emp.employee_id === employeeId);
            if (employee) {
                return {
                    employee_id: employee.employee_id, // 使用与数据库一致的字段名（UUID类型）
                    emp_name: employee.姓名, // 使用与数据库一致的字段名（员工姓名）
                    labor_cost: employee.工价 || 0 // 使用与数据库一致的字段名（工价）
                };
            }
            console.warn('未找到员工信息，员工ID:', employeeId);
            return null;
        }).filter(emp => emp !== null);



        // 调试：打印选中的员工数据


        // 获取当前登录账号
        let loggedInPhone = localStorage.getItem('loggedInPhone');
        if (!loggedInPhone && window.location.hostname === 'localhost') {
            loggedInPhone = '13800138000';
        }

        // 构建基础记工数据模板 - 使用与数据库一致的字段名
        const baseWorkRecord = {
            project_id: projectId,
            project_name: projectName,
            work_type: workType,
            employees: selectedEmployees,
            remark: remark,
            // 添加登录账号信息
            phone: loggedInPhone
        }

        // 处理图片信息，获取图片文件对象
        const images = this._processImageData();
        
        // 为每个日期创建记工记录
        const workRecords = selectedDates.map(date => {
            // 创建当前日期的记工记录
            const workRecord = {
                ...baseWorkRecord,
                record_date: date,
                images: images
            };
            

            // 调试：打印当前处理的日期和基础记录

            
            // 根据工作类型处理字段
            try {
                if (workType === '点工') {
                    this._processPieceWorkData(workRecord, remark);
                } else if (workType === '包工') {
                    this._processContractWorkData(workRecord, remark);
                } else if (workType === '工量') {
                    this._processWorkQuantityData(workRecord, remark);
                }
                // 调试：打印处理后的记录

            } catch (dataError) {
                this.showNotification('数据处理错误，请检查输入', true);
                return null;
            }
            
            return workRecord;
        }).filter(record => record !== null);

        // 调试：打印创建的记工记录数组


        // 检查workRecords数组是否为空
        if (workRecords.length === 0) {
            this.showNotification('无法创建记工记录，请检查输入数据', true);
            return;
        }

        // 显示确认模态框 - 增强用户体验
        this.showConfirmModal('确认记工', this._getConfirmationMessage(workRecords[0]), async () => {
            try {
                // 保存记工记录 - 增强的错误处理
                this.showNotification('正在保存记工记录...', false);
                
                let allSuccess = true;
                // 为每个日期保存记工记录
                for (const workRecord of workRecords) {
                    const success = await this.updateWorkRecord(workRecord, record_id);
                    if (!success) {
                        allSuccess = false;
                        break;
                    }
                }
                
                if (allSuccess) {
                    this.showNotification('修改记工成功', false);
                    
                    // 检查是否从统计页面进入
                    const urlParams = new URLSearchParams(window.location.search);
                    const from = urlParams.get('from');
                    
                    if (from === 'statistic') {
                        // 从统计页面进入,返回统计页面
                        const statisticFilter = JSON.parse(localStorage.getItem('statisticFilter') || '{}');
                        
                        // 构建统计页面URL
                        const baseUrl = window.location.href.split('?')[0];
                        const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
                        const statisticUrl = new URL(basePath + '统计.html');
                        if (statisticFilter.projectId) {
                            statisticUrl.searchParams.append('project_id', statisticFilter.projectId);
                        }
                        
                        // 跳转到统计页面
                        window.location.href = statisticUrl.href;
                        return;
                    }
                    
                    // 重置表单
                    this.resetForm();
                    
                    // 刷新员工列表
                    const currentProjectName = document.getElementById('projectName').value;
                    await this.loadEmployeeData(currentProjectName);
                    
                    // 获取修改的日期
                    const recordDate = workRecords[0].record_date || workRecords[0].date;
                    
                    // 恢复标签页导航显示
                    const tabNavigation = document.querySelector('.work-type.tab-navigation');
                    if (tabNavigation) {
                        tabNavigation.parentElement.style.display = 'block';
                    }
                    
                    // 切换到新建模式
                    if (typeof window.setEditMode === 'function') {
                        window.setEditMode(false);
                    }
                    
                    // 隐藏底部的保存修改和删除按钮
                    const bottomButtonsContainer = document.querySelector('.bottom-buttons');
                    if (bottomButtonsContainer) {
                        // 隐藏保存修改按钮
                        const confirmButton = document.getElementById('confirmBtn');
                        if (confirmButton) {
                            confirmButton.style.display = 'none';
                        }
                        
                        // 隐藏删除按钮
                        const deleteButton = document.getElementById('deleteBtn');
                        if (deleteButton) {
                            deleteButton.style.display = 'none';
                        }
                    }
                    
                    // 从URL中移除record_id参数，确保页面重新加载或切换标签页时不会再次进入编辑模式
                    const url = new URL(window.location.href);
                    url.searchParams.delete('record_id');
                    window.history.replaceState({}, '', url);
                    
                    // 先进入记工的新建模式，确保所有新建模式的状态都被正确恢复
                    if (typeof window.loadNormalMode === 'function') {
                        window.loadNormalMode();
                    }
                    
                    // 切换到记工流水标签页
                    const tabWorkFlow = document.getElementById('tabWorkFlow');
                    if (tabWorkFlow) {
                        tabWorkFlow.checked = true;
                        // 触发change事件，确保标签页内容切换
                        tabWorkFlow.dispatchEvent(new Event('change'));
                    }
                    
                    // 设置日期选择器的日期为修改的日期
                    const workDateInput = document.getElementById('workDate');
                    if (workDateInput && recordDate) {
                        workDateInput.value = recordDate;
                        // 触发change事件，确保日期选择器更新
                        workDateInput.dispatchEvent(new Event('change'));
                    }
                    
                    // 触发记工确认事件，用于刷新记工流水
                    const event = new Event('workRecordConfirmed');
                    document.dispatchEvent(event);
                    

                } else {
                    this.showNotification('修改记工失败，请重试', true);
                }
            } catch (saveError) {
                console.error('保存记工记录时出现异常:', saveError);
                this.showNotification(`修改记工失败: ${saveError.message || '未知错误'}`, true);
            }
        });
    }
    
    /**
     * 更新记工记录
     * @param {Object} workRecord - 记工记录数据
     * @param {string} record_id - 记录ID
     * @returns {Promise<boolean>} - 更新是否成功
     */
    async updateWorkRecord(workRecord, record_id) {
        try {
            // 确保images数组存在
            workRecord.images = workRecord.images || [];
            
            // 检查网络状态
            const isOnline = navigator.onLine;
            
            // 获取用户信息
            let phone = localStorage.getItem('loggedInPhone');
            if (!phone && window.location.hostname === 'localhost') {
                phone = '13800138000';
            }
            
            if (!phone) {
                throw new Error('未找到用户信息');
            }
            
            // 获取原始记录，以便比较图片URL
            let originalRecord = null;
            
            // 从所有本地存储位置查找记录
            const storageSources = ['workRecords', `work_records_${JSON.parse(localStorage.getItem('currentUser'))?.user_id || 'default'}`, `attendance_records_${JSON.parse(localStorage.getItem('currentUser'))?.user_id || 'default'}`];
            for (const source of storageSources) {
                try {
                    const storedData = localStorage.getItem(source);
                    if (storedData) {
                        const parsedData = JSON.parse(storedData);
                        if (Array.isArray(parsedData)) {
                            originalRecord = parsedData.find(r => r.record_id === record_id);
                            if (originalRecord) break;
                        }
                    }
                } catch (e) {
                    console.error(`从${source}获取原始记录失败:`, e);
                }
            }
            
            // 在线模式下也尝试从Supabase获取原始记录
            if (!originalRecord && isOnline && window.supabase) {
                try {
                    const supabase = await window.waitForSupabase();
                    // 查询任何匹配record_id的记录
                    const { data, error } = await supabase
                        .from('attendance_records')
                        .select('image_ids')
                        .eq('record_id', record_id)
                        .limit(1);
                    
                    if (data && data.length > 0) {
                        originalRecord = data[0];
                    }
                } catch (error) {
                    console.error('从Supabase获取原始记录失败:', error);
                }
            }
            
            // 获取原始记录中的图片URL（旧图片）
            let oldImages = [];
            if (originalRecord && originalRecord.image_ids) {
                oldImages = Array.isArray(originalRecord.image_ids) ? originalRecord.image_ids : JSON.parse(originalRecord.image_ids);
                oldImages = oldImages.filter(img => img && typeof img === 'string');
            }
            
            // 检查图片选择器中是否有图片
            const imageContainer = document.getElementById('imageUploadContainer');
            const imagePreviews = imageContainer ? imageContainer.querySelectorAll('.image-preview-item') : [];
            const hasImagesInSelector = imagePreviews.length > 0;
            
            // 获取图片选择器中的图片（从window.selectedImages）
            const images = [];
            if (window.selectedImages && window.selectedImages.length > 0) {
                window.selectedImages.forEach(img => {
                    if (img instanceof File || img instanceof Blob) {
                        images.push(img);
                    }
                });
            }
            
            // 处理图片 - 无论是在线还是离线，都先准备好图片
            let imageUrls = [];
            let oldImagesDeleted = false; // 标记是否已经删除过旧图片
            
            if (!hasImagesInSelector) {
                // 情况1：图片选择器中没有图片 - 删除记录中的旧图片
                imageUrls = [];
                console.log('图片选择器中没有图片，将删除记录中的旧图片');
                
                // 明确删除所有旧图片
                if (oldImages.length > 0) {
                    await this._deleteRecordImages(oldImages, record_id);
                    oldImagesDeleted = true;
                }
            } else if (images.length > 0) {
                // 情况2：图片选择器中有图片
                // 检查图片是否变更
                const hasImageChanged = this._checkIfImagesChanged(images, oldImages);
                
                if (hasImageChanged) {
                    // 图片有变更：删除旧图片，上传新图片
                    console.log('图片有变更，将删除旧图片并上传新图片');
                    
                    // 先删除旧图片
                    if (oldImages.length > 0) {
                        await this._deleteRecordImages(oldImages, record_id);
                        oldImagesDeleted = true;
                    }
                } else {
                    // 图片未变更：也上传此图片
                    console.log('图片未变更，重新上传图片');
                }
                
                // 上传图片（无论是否变更都上传）
                if (isOnline) {
                    const recordDate = workRecord.record_date || workRecord.date;
                    imageUrls = await this._uploadImagesToSupabase(images, workRecord.project_id, recordDate);
                } else {
                    const recordDate = workRecord.record_date || workRecord.date;
                    let dateStr;
                    if (recordDate) {
                        const recordDateObj = new Date(recordDate);
                        const year = recordDateObj.getFullYear();
                        const month = String(recordDateObj.getMonth() + 1).padStart(2, '0');
                        const day = String(recordDateObj.getDate()).padStart(2, '0');
                        dateStr = `${year}-${month}-${day}`;
                    } else {
                        const currentDate = new Date();
                        const year = currentDate.getFullYear();
                        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                        const day = String(currentDate.getDate()).padStart(2, '0');
                        dateStr = `${year}-${month}-${day}`;
                    }
                    const projectId = workRecord.project_id;
                    
                    for (let i = 0; i < images.length; i++) {
                        const image = images[i];
                        let fileExtension = 'jpg';
                        if (image.name) {
                            fileExtension = image.name.split('.').pop();
                        }
                        let originalName = 'image';
                        if (image.name) {
                            originalName = image.name.replace(`.${fileExtension}`, '');
                        }
                        let englishName = originalName;
                        if (!englishName || englishName === '_') {
                            englishName = `image_${i + 1}`;
                        }
                        const fileName = `${projectId}/attendance/${dateStr}/${englishName}.${fileExtension}`;
                        const localImageUrl = await this._saveSingleImageToLocal(image, fileName);
                        imageUrls.push(localImageUrl);
                        
                        if (window.offlineSyncService) {
                            window.offlineSyncService.addToSyncQueue('upload_image', {
                                fileName: fileName,
                                localPath: localImageUrl,
                                bucketName: 'FYKQ',
                                projectId: 'oydffrzzulsrbitrrhht'
                            }, `img_${fileName}_${Date.now()}_${i}`, 'image');
                        }
                    }
                }
            }
            
            // 更新workRecord的图片信息
            workRecord.image_ids = imageUrls;
            
            // 比较新旧图片，删除不再使用的旧图片（仅在未删除过旧图片时执行）
            if (!oldImagesDeleted && hasImagesInSelector && oldImages && oldImages.length > 0) {
                const deletedImages = oldImages.filter(oldImg => !imageUrls.includes(oldImg));
                
                if (deletedImages.length > 0) {
                    await this._deleteRecordImages(deletedImages, record_id);
                }
            }
            
            // 保存记录到本地存储的通用逻辑
            const saveToLocal = async () => {
                try {
                    const userId = JSON.parse(localStorage.getItem('currentUser'))?.user_id || 'default';
                    const phone = localStorage.getItem('loggedInPhone') || 'default';
                    const key = `work_records_${userId}`;
                    let workRecords = [];
                    
                    // 从本地存储获取现有记录
                    const existingData = localStorage.getItem(key);
                    if (existingData) {
                        workRecords = JSON.parse(existingData);
                    }
                    
                    // 更新现有记录
                    const index = workRecords.findIndex(record => record.record_id === record_id);
                    if (index !== -1) {
                        // 更新记录 - 使用北京时间
                        const now = new Date();
                        const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
                        // 创建更新后的记录，确保只包含record_id字段，不包含id字段
                        const updatedRecord = {
                            ...workRecords[index],
                            ...workRecord,
                            record_id: record_id,
                            updated_at: beijingTime.toISOString()
                        };
                        // 删除id字段，只保留record_id
                        delete updatedRecord.id;
                        workRecords[index] = updatedRecord;
                    } else {
                        // 如果找不到记录，添加新记录
                        const now = new Date();
                        const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
                        // 创建新记录，确保只包含record_id字段，不包含id字段
                        const newRecord = {
                            ...workRecord,
                            record_id: record_id,
                            created_at: beijingTime.toISOString(),
                            updated_at: beijingTime.toISOString()
                        };
                        // 删除id字段，只保留record_id
                        delete newRecord.id;
                        workRecords.push(newRecord);
                    }
                    
                    // 保存更新后的记录到本地存储
                    localStorage.setItem(key, JSON.stringify(workRecords));

                    // 同时更新 attendance_records 键的数据，确保与新增记工时使用的数据源一致
                    const attendanceKey = `attendance_records_${userId}`;
                    let attendanceRecords = [];
                    
                    try {
                        const existingAttendanceData = localStorage.getItem(attendanceKey);
                        if (existingAttendanceData) {
                            attendanceRecords = JSON.parse(existingAttendanceData);
                        }
                    } catch (parseError) {
                        console.error('解析attendance_records数据失败:', parseError);
                        attendanceRecords = [];
                    }
                    
                    // 删除所有匹配 record_id 的旧记录（注意：可能匹配多条记录）
                    const originalAttendanceLength = attendanceRecords.length;
                    
                    // 修复：同时匹配 record_id 和 id 字段
                    attendanceRecords = attendanceRecords.filter(record => 
                        record.record_id !== record_id && record.id !== record_id
                    );

                    
                    // 为每个员工创建新记录，与新增记工时的逻辑保持一致
                    if (workRecord.employees && Array.isArray(workRecord.employees)) {
                        for (const employee of workRecord.employees) {
                            // 生成新的唯一ID，与新增记工时的逻辑保持一致
                            const newId = `attendance_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                            
                            // 构建基础数据
                            const now = new Date();
                            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
                            
                            let attendanceData = {
                                id: newId, // 生成新的唯一ID
                                record_id: record_id, // 逻辑记录ID
                                phone: phone,
                                project_id: workRecord.project_id,
                                employee_id: employee.employee_id,
                                record_date: workRecord.record_date || workRecord.date || new Date().toISOString().split('T')[0],
                                work_type: workRecord.work_type,
                                image_ids: workRecord.image_ids || [],
                                remark: workRecord.remark || workRecord.workDetails?.备注 || null,
                                audit_status: '已审', // 修改后标记为已审
                                created_at: beijingTime.toISOString(),
                                updated_at: beijingTime.toISOString()
                            };
                            
                            // 根据工作类型添加特定字段
                            if (workRecord.work_type === '点工') {
                                attendanceData.regular_hours = workRecord.workDetails?.休息 === '是' ? null : (workRecord.regular_hours || 0);
                                attendanceData.overtime_hours = workRecord.overtime_hours || 0;
                                attendanceData.work_time = workRecord.work_time;
                            } else if (workRecord.work_type === '包工') {
                                attendanceData.contract_amount = workRecord.contract_amount || 0;
                                attendanceData.work_time = '金额';
                                attendanceData.regular_hours = null;
                                attendanceData.overtime_hours = null;
                            } else if (workRecord.work_type === '工量') {
                                attendanceData.work_time = workRecord.work_time || null;
                                attendanceData.work_quantity = workRecord.work_quantity || 0;
                                attendanceData.unit_price = workRecord.unit_price || 0;
                                attendanceData.contract_amount = workRecord.contract_amount || 0;
                            }
                            
                            attendanceRecords.push(attendanceData);
                        }
                    }
                    
                    // 保存 attendance_records 数据
            localStorage.setItem(attendanceKey, JSON.stringify(attendanceRecords));

            // 同时保存到attendance_data_前缀的键，确保编辑模式下能获取到最新数据
            const attendanceDataKey = `attendance_data_${record_id}`;
            localStorage.setItem(attendanceDataKey, JSON.stringify(workRecord));

            // 同时保存到直接以record_id为键的存储，确保编辑模式下能获取到最新数据
            localStorage.setItem(record_id, JSON.stringify(workRecord));

            // 同时更新记工流水数据，确保离线模式下修改后记工流水能显示最新数据
            await this.updateWorkFlowDataInLocal(workRecord, record_id, phone);
            
            return true;
                } catch (error) {
                    console.error('保存记工记录到本地存储失败:', error);
                    throw new Error('保存记工记录到本地存储失败: ' + error.message);
                }
            };
            
            // 在线模式：直接更新到Supabase
            if (isOnline) {
                try {
                    // 等待Supabase客户端初始化完成
                    const supabase = await window.waitForSupabase();
                    
                    // 图片已经在前面统一处理过了，这里直接使用imageUrls变量
                    
                    // 为每个员工更新记工记录
                    let allSuccess = true;
                    
                    for (const employee of workRecord.employees) {
                        // 获取当前项目的配置信息
                        let regularHoursPerDay;
                        let overtimeHoursPerDay;
                        
                        try {
                            // 从localStorage获取项目数据
                            const userId = JSON.parse(localStorage.getItem('currentUser'))?.user_id || 'default';
                            const projectsData = localStorage.getItem('project_cache_' + userId);
                            if (projectsData) {
                                const projects = JSON.parse(projectsData);
                                const currentProject = projects.find(p => p.project_id === workRecord.project_id);
                                if (currentProject) {
                                    // 只使用项目配置中的值，不使用默认值
                                    regularHoursPerDay = parseFloat(currentProject.regular_hours);
                                    overtimeHoursPerDay = parseFloat(currentProject.overtime_hours);
                                }
                            }
                        } catch (error) {
                            console.error('获取项目配置失败:', error);
                        }
                        
                        // 直接使用workRecord中已经计算好的工时，不再重新计算
                        let regular_hours = workRecord.regular_hours || 0;
                        let overtime_hours = workRecord.overtime_hours || 0;
                        
                        // 处理点工类型的工时转换
                        if (workRecord.work_type === '点工') {
                            // 处理上班工时
                            if (workRecord.workDetails?.休息 === '是') {
                                // 选择休息，不上传regular_hours
                                regular_hours = null;
                            }
                        } else if (workRecord.work_type === '包工') {
                            // 包工模式，不写入regular_hours和overtime_hours
                            regular_hours = null;
                            overtime_hours = null;
                        }
                        
                        // 构建基础记工记录数据
                        const baseData = {
                            phone: phone, 
                            project_id: workRecord.project_id, 
                            employee_id: employee.employee_id, 
                            record_date: workRecord.record_date || workRecord.date || new Date().toISOString().split('T')[0], 
                            work_type: workRecord.work_type, 
                            
                            // 图片信息
                            image_ids: imageUrls, 
                            
                            // 备注信息
                            remark: workRecord.remark || workRecord.workDetails?.备注 || null,
                            
                            // 审核状态
                            audit_status: '已审'
                        };
                        
                        // 根据工作类型构建不同的updateData
                        let updateData = {};
                        
                        // 获取北京时间
                        const now = new Date();
                        const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
                        
                        if (workRecord.work_type === '包工') {
                            // 包工模式：只包含包工相关字段
                            updateData = {
                                ...baseData,
                                contract_amount: workRecord.contract_amount || 0,
                                work_time: '金额',
                                updated_at: beijingTime.toISOString()
                            };
                        } else if (workRecord.work_type === '点工') {
                            // 点工模式：只包含点工相关字段
                            updateData = {
                                ...baseData,
                                regular_hours: regular_hours,
                                overtime_hours: overtime_hours,
                                work_time: workRecord.work_time,
                                updated_at: beijingTime.toISOString()
                            };
                        } else if (workRecord.work_type === '工量') {
                            // 工量模式：只包含工量相关字段，使用work_time字段
                            updateData = {
                                ...baseData,
                                work_time: workRecord.work_time || null,
                                work_quantity: workRecord.work_quantity || 0,
                                unit_price: workRecord.unit_price || 0,
                                contract_amount: workRecord.contract_amount || 0,
                                updated_at: beijingTime.toISOString()
                            };
                        } else {
                            // 默认情况：包含所有字段，但不包含work_item
                            updateData = {
                                ...baseData,
                                regular_hours: regular_hours,
                                overtime_hours: overtime_hours,
                                work_time: workRecord.work_time,
                                contract_amount: workRecord.contract_amount || 0,
                                work_quantity: workRecord.work_quantity || 0,
                                unit_price: workRecord.unit_price || 0,
                                contract_amount: workRecord.contract_amount || 0,
                                updated_at: beijingTime.toISOString()
                            };
                        }
                        
                        // 更新记录到Supabase - 使用复合主键：record_id, employee_id, record_date
                        const { error } = await supabase
                            .from('attendance_records')
                            .update(updateData)
                            .eq('record_id', record_id)
                            .eq('employee_id', employee.employee_id)
                            .eq('record_date', workRecord.record_date);
                        
                        if (error) {
                            console.error('Supabase更新失败:', error);
                            allSuccess = false;
                            break;
                        }
                        

                    }
                    
                    if (!allSuccess) {
                        throw new Error('更新记工记录失败');
                    }
                    
                    // 同时更新本地存储，保持数据一致
                    await saveToLocal();
                    
                    return true;
                } catch (error) {
                    console.error('在线更新过程中发生错误:', error);
                    
                    // 在线更新失败，保存到本地并添加到同步队列
                    await saveToLocal();
                    
                    // 为每个员工添加到同步队列
                    if (window.offlineSyncService) {
                        for (const employee of workRecord.employees) {
                            // 构建单个员工的updateData
                            // 获取北京时间
                            const now = new Date();
                            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
                            
                            const singleUpdateData = {
                                record_id: record_id,
                                phone: phone,
                                project_id: workRecord.project_id,
                                employee_id: employee.employee_id,
                                record_date: workRecord.record_date,
                                work_type: workRecord.work_type,
                                image_ids: imageUrls,
                                remark: workRecord.remark || workRecord.workDetails?.备注 || null,
                                audit_status: '已审',
                                regular_hours: workRecord.regular_hours || 0,
                                overtime_hours: workRecord.overtime_hours || 0,
                                work_time: workRecord.work_time,
                                contract_amount: workRecord.contract_amount || 0,
                                work_quantity: workRecord.work_quantity || 0,
                                unit_price: workRecord.unit_price || 0,
                                updated_at: beijingTime.toISOString()
                            };
                            
                            // 处理点工类型的工时转换
                            if (workRecord.work_type === '点工') {
                                if (workRecord.workDetails?.休息 === '是') {
                                    singleUpdateData.regular_hours = null;
                                }
                            } else if (workRecord.work_type === '包工') {
                                singleUpdateData.regular_hours = null;
                                singleUpdateData.overtime_hours = null;
                                singleUpdateData.work_time = '金额';
                            }
                            
                            window.offlineSyncService.addToSyncQueue('update', singleUpdateData, `${record_id}_${employee.employee_id}_${workRecord.record_date}`, 'attendance');
                        }
                    }
                    
                    return false;
                }
            } 
            // 离线模式：保存到本地并添加到同步队列
            else {
                // 保存到本地存储
                await saveToLocal();
                
                // 为每个员工添加到同步队列
                if (window.offlineSyncService) {
                    for (const employee of workRecord.employees) {
                        // 构建单个员工的updateData
                    // 获取北京时间
                    const now = new Date();
                    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
                    
                    const singleUpdateData = {
                        record_id: record_id,
                        phone: phone,
                        project_id: workRecord.project_id,
                        employee_id: employee.employee_id,
                        record_date: workRecord.record_date,
                        work_type: workRecord.work_type,
                        image_ids: imageUrls,
                        remark: workRecord.remark || workRecord.workDetails?.备注 || null,
                        audit_status: '已审',
                        regular_hours: workRecord.regular_hours || 0,
                        overtime_hours: workRecord.overtime_hours || 0,
                        work_time: workRecord.work_time,
                        contract_amount: workRecord.contract_amount || 0,
                        work_quantity: workRecord.work_quantity || 0,
                        unit_price: workRecord.unit_price || 0,
                        updated_at: beijingTime.toISOString()
                    };
                        
                        // 处理点工类型的工时转换
                        if (workRecord.work_type === '点工') {
                            if (workRecord.workDetails?.休息 === '是') {
                                singleUpdateData.regular_hours = null;
                            }
                        } else if (workRecord.work_type === '包工') {
                            singleUpdateData.regular_hours = null;
                            singleUpdateData.overtime_hours = null;
                            singleUpdateData.work_time = '金额';
                        }
                        
                        window.offlineSyncService.addToSyncQueue('update', singleUpdateData, `${record_id}_${employee.employee_id}_${workRecord.record_date}`, 'attendance');
                    }
                }
                
                return true;
            }
        } catch (error) {
            console.error('更新记工记录时出现异常:', error);
            this.showNotification(`更新记工记录失败: ${error.message || '未知错误'}`, true);
            return false;
        }
    }

    /**
     * 更新记工流水的本地数据 - 确保离线模式下修改记工后记工流水能显示最新数据
     * @param {Object} workRecord - 记工记录数据
     * @param {string} record_id - 记录ID
     * @param {string} phone - 用户手机号
     */
    async updateWorkFlowDataInLocal(workRecord, record_id, phone) {
        try {
            // 获取user_id，与首页保持一致
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
            
            // 获取记录日期
            const recordDate = workRecord.record_date || workRecord.date;
            
            // 更新work_records_${userId}，与首页保持一致
            const workRecordsKey = `work_records_${userId}`;
            let allRecords = [];
            try {
                const existingData = localStorage.getItem(workRecordsKey);
                if (existingData) {
                    allRecords = JSON.parse(existingData);
                }
            } catch (parseError) {
                console.error('解析本地记工记录数据失败:', parseError);
                allRecords = [];
            }
            
            // 首先删除所有匹配 record_id 的旧记录，避免重复显示
            allRecords = allRecords.filter(record => 
                record.record_id !== record_id && record.id !== record_id
            );
            
            // 更新每个员工的记录
            if (workRecord.employees && Array.isArray(workRecord.employees)) {
                for (const employee of workRecord.employees) {
                    // 构建更新后的记录数据
                    const now = new Date();
                    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
                    
                    let updateData = {
                        record_id: record_id,
                        phone: phone,
                        project_id: workRecord.project_id,
                        employee_id: employee.employee_id,
                        record_date: recordDate,
                        work_type: workRecord.work_type,
                        image_ids: workRecord.image_ids || [],
                        remark: workRecord.remark || workRecord.workDetails?.备注 || null,
                        audit_status: '已审', // 修改后标记为已审
                        updated_at: beijingTime.toISOString()
                    };
                    
                    // 根据工作类型添加特定字段
                    if (workRecord.work_type === '点工') {
                        updateData.regular_hours = workRecord.workDetails?.休息 === '是' ? null : (workRecord.regular_hours || 0);
                        updateData.overtime_hours = workRecord.overtime_hours || 0;
                        updateData.work_time = workRecord.work_time;
                    } else if (workRecord.work_type === '包工') {
                        updateData.contract_amount = workRecord.contract_amount || 0;
                        updateData.work_time = '金额';
                        updateData.regular_hours = null;
                        updateData.overtime_hours = null;
                    } else if (workRecord.work_type === '工量') {
                        updateData.work_time = workRecord.work_time || null;
                        updateData.work_quantity = workRecord.work_quantity || 0;
                        updateData.unit_price = workRecord.unit_price || 0;
                        updateData.contract_amount = workRecord.contract_amount || 0;
                    }
                    
                    // 添加新记录（不是更新，因为我们已经删除了所有旧记录）
                    updateData.created_at = beijingTime.toISOString();
                    allRecords.push(updateData);
                    
                    // 同时更新attendance_data中的单个记录数据
                    localStorage.setItem(`attendance_data_${record_id}_${employee.employee_id}_${recordDate}`, JSON.stringify(updateData));
                }
            }
            
            // 保存回localStorage
            localStorage.setItem(workRecordsKey, JSON.stringify(allRecords));
            
        } catch (error) {
            console.error('更新记工记录本地数据失败:', error);
        }
    }

    /**
     * 设置全局变量引用
     * @param {Object} globals - 包含全局变量的对象
     */
    setGlobalReferences(globals) {
        this.selectedEmployeeIds = globals.selectedEmployeeIds || new Set();
        this.employees = globals.employees || [];
        this.activeEmployees = globals.activeEmployees || [];
        this.inactiveEmployees = globals.inactiveEmployees || [];
    }

    /**
     * 确认记工 - 核心功能
     */
    confirmWorkRecord() {
        // 权限检查
        if (!this.checkPermission('perm_add_work_record')) {
            this.showNotification('你无记工权限！', true);
            return;
        }

        // 获取表单数据
        const workTypeRadio = document.querySelector('input[name="workType"]:checked');
        
        // 验证工作类型是否已选择
        if (!workTypeRadio) {
            this.showNotification('请选择工作类型（点工/包工/工量）', true);
            return;
        }
        
        const workType = workTypeRadio.value;
        const projectName = document.getElementById('projectName').value;
        const workDateInput = document.getElementById('workDate');
        const workDate = workDateInput.value;
        const remark = document.getElementById('remark').value;
        
        // 获取项目ID
        const projectId = localStorage.getItem('currentProjectId') || '';

        // 验证必填项 - 增强的数据验证逻辑
        if (!projectName) {
            this.showNotification('请选择项目名称', true);
            return;
        }
        if (!projectId) {
            this.showNotification('未找到项目ID，请重新选择项目', true);
            return;
        }
        if (!workDate) {
            this.showNotification('请选择记工日期', true);
            return;
        }
        if (this.selectedEmployeeIds.size === 0) {
            this.showNotification('请选择员工', true);
            return;
        }
        
        // 处理多日期情况
        let selectedDates = [workDate];
        if (workDateInput.dataset.displayValue) {
            // 如果有多个日期，解析日期范围
            selectedDates = this._parseMultipleDates(workDateInput.dataset.displayValue);
        }

        // 调试：打印选中的日期数组


        // 构建基础记工数据 - 与系统其他部分保持一致的数据结构
        // 处理选中的员工数据
        const selectedEmployees = Array.from(this.selectedEmployeeIds).map(employeeId => {
            // 查找员工信息 - 使用统一的employee_id字段名
            const employee = this.employees.find(emp => emp.employee_id === employeeId) || 
                           this.activeEmployees.find(emp => emp.employee_id === employeeId);
            if (employee) {
                return {
                    employee_id: employee.employee_id, // 使用与数据库一致的字段名（UUID类型）
                    emp_name: employee.姓名, // 使用与数据库一致的字段名（员工姓名）
                    labor_cost: employee.工价 || 0 // 使用与数据库一致的字段名（工价）
                };
            }
            console.warn('未找到员工信息，员工ID:', employeeId);
            return null;
        }).filter(emp => emp !== null);

        // 调试：打印选中的员工数据


        // 获取当前登录账号
        let loggedInPhone = localStorage.getItem('loggedInPhone');
        if (!loggedInPhone && window.location.hostname === 'localhost') {
            loggedInPhone = '13800138000';
        }

        // 构建基础记工数据模板 - 使用与数据库一致的字段名
        const baseWorkRecord = {
            project_id: projectId,
            project_name: projectName,
            work_type: workType,
            employees: selectedEmployees,
            remark: remark,
            // 添加登录账号信息
            phone: loggedInPhone
        }

        // 处理图片信息，获取图片文件对象
        const images = this._processImageData();
        
        // 为每个日期创建记工记录
        const workRecords = selectedDates.map(date => {
            // 创建当前日期的记工记录
            const workRecord = {
                ...baseWorkRecord,
                record_date: date,
                images: images
            };
            

            // 调试：打印当前处理的日期和基础记录

            
            // 根据工作类型处理字段
            try {
                if (workType === '点工') {
                    this._processPieceWorkData(workRecord, remark);
                } else if (workType === '包工') {
                    this._processContractWorkData(workRecord, remark);
                } else if (workType === '工量') {
                    this._processWorkQuantityData(workRecord, remark);
                }
                // 调试：打印处理后的记录

            } catch (dataError) {
                this.showNotification('数据处理错误，请检查输入', true);
                return null;
            }
            
            return workRecord;
        }).filter(record => record !== null);

        // 调试：打印创建的记工记录数组


        // 检查workRecords数组是否为空
        if (workRecords.length === 0) {
            this.showNotification('无法创建记工记录，请检查输入数据', true);
            return;
        }

        // 显示确认模态框 - 增强用户体验
        this.showConfirmModal('确认记工', this._getConfirmationMessage(workRecords[0]), async () => {
            try {
                // 保存记工记录 - 增强的错误处理
                this.showNotification('正在保存记工记录...', false);
                
                let allSuccess = true;
                // 为每个日期保存记工记录
                for (const workRecord of workRecords) {
                    const success = await this.saveWorkRecord(workRecord);
                    if (!success) {
                        allSuccess = false;
                        break;
                    }
                }
                
                if (allSuccess) {
                    this.showNotification('记工成功', false);
                    // 重置表单
                    this.resetForm();
                    
                    // 刷新员工列表
                    const currentProjectName = document.getElementById('projectName').value;
                    await this.loadEmployeeData(currentProjectName);
                    
                    // 触发记工确认事件，用于刷新记工流水
                    const event = new Event('workRecordConfirmed');
                    document.dispatchEvent(event);
                    

                } else {
                    this.showNotification('记工失败，请重试', true);
                }
            } catch (saveError) {
                console.error('保存记工记录时出现异常:', saveError);
                this.showNotification(`记工失败: ${saveError.message || '未知错误'}`, true);
            }
        });
    }

    /**
     * 处理点工数据
     * @private
     */
    _processPieceWorkData(workRecord, remark) {
        // 点工模式 - 处理上班和加班
        // 优先检查按钮状态，而不是隐藏的单选按钮
        let dayWorkOption = null;
        
        // 首先检查1个工按钮是否被选中
        const dayWork1Btn = document.getElementById('dayWork1');
        const morningAfternoonBtn = document.getElementById('morningAfternoonBtn');
        
        // 检查上下午按钮是否被激活（从记工列表进入编辑模式时会激活）
        if (morningAfternoonBtn && morningAfternoonBtn.classList.contains('active')) {
            dayWorkOption = 'period';
        }
        // 检查1个工按钮是否被选中
        else if (dayWork1Btn && dayWork1Btn.classList.contains('active')) {
            // 获取1个工按钮的实际值（可能是修改后的值）
            // 优先从editable-number获取值，而不是从data-value
            const editableNumber = dayWork1Btn.querySelector('.editable-number');
            if (editableNumber) {
                const textValue = editableNumber.textContent.trim();
                const numValue = parseFloat(textValue) || 1;
                dayWorkOption = numValue.toString();
            } else {
                // 如果没有editable-number，则从data-value获取
                const actualValue = dayWork1Btn.getAttribute('data-value');
                if (actualValue) {
                    dayWorkOption = actualValue;
                }
            }
        }
        // 如果1个工按钮未被选中，检查其他按钮
        else {
            const dayWorkChecked = document.querySelector('input[name="dayWork"]:checked');
            dayWorkOption = dayWorkChecked ? dayWorkChecked.value : null;
        }
        

        
        // 优先从localStorage中获取项目工时配置，这是在页面加载时就已经保存好的
        let regularHoursPerDay = parseFloat(localStorage.getItem('currentProjectRegularHours'));
        let overtimeHoursPerDay = parseFloat(localStorage.getItem('currentProjectOvertimeHours'));
        
        // 如果localStorage中没有或值无效，从project_cache中读取
        if (isNaN(regularHoursPerDay) || regularHoursPerDay <= 0 || isNaN(overtimeHoursPerDay) || overtimeHoursPerDay < 0) {
            const projectId = workRecord.project_id;
            try {
                // 从project_cache中读取项目配置
                const userId = JSON.parse(localStorage.getItem('currentUser'))?.user_id || 'default';
                const projectsData = localStorage.getItem(`project_cache_${userId}`);
                if (projectsData) {
                    const projects = JSON.parse(projectsData);
                    const currentProject = projects.find(p => p.project_id === projectId);
                    if (currentProject) {
                        // 使用项目配置中的值，默认值作为备选
                        regularHoursPerDay = parseFloat(currentProject.regular_hours) || 8;
                        overtimeHoursPerDay = parseFloat(currentProject.overtime_hours) || 7;
                        // 保存到localStorage，方便后续使用
                        localStorage.setItem('currentProjectRegularHours', regularHoursPerDay);
                        localStorage.setItem('currentProjectOvertimeHours', overtimeHoursPerDay);
                    } else {
                        // 未找到项目，使用默认值
                        regularHoursPerDay = 8;
                        overtimeHoursPerDay = 7;
                    }
                } else {
                    // 未找到项目缓存，使用默认值
                    regularHoursPerDay = 8;
                    overtimeHoursPerDay = 7;
                }
            } catch (e) {
                console.warn('读取项目小时设置失败，使用默认值', e);
                // 使用默认值
                regularHoursPerDay = 8;
                overtimeHoursPerDay = 7;
            }
        }
        
        // 记录点工选项卡页面中的上班时间，仅记录被选中的按钮值
        workRecord.workDetails = {
            workType: '点工',
            上班时间: {}
        };
        
        // 调试：打印dayWorkOption和window.morningAfternoonData


        
        // 若未选择"1个工/半个工/选小时"，但"上下午"设置了有效值，则以"上下午"作为上班依据
        if (!dayWorkOption || dayWorkOption === 'period') {
            try {
                // 优先从按钮文本获取上下午数据，解决从记工列表进入编辑模式时无法读取数据的问题
                const morningAfternoonBtn = document.getElementById('morningAfternoonBtn');
                const btnText = morningAfternoonBtn ? morningAfternoonBtn.textContent.trim() : '';
                
                // 确保regularHoursPerDay有值，默认为8小时
                const actualRegularHoursPerDay = regularHoursPerDay || 8;
                
                if (btnText === '上下午') {
                    // 上下午按钮显示为"上下午"，按休息处理
                    dayWorkOption = 'rest';
                    workRecord.dayWorkOption = dayWorkOption;
                    workRecord.regular_hours = 0;
                    workRecord.workDetails.上班时间.休息 = '是';
                    workRecord.periodText = '上下午';
                } else if (btnText && btnText.includes('上午') && btnText.includes('下午')) {
                    // 按钮文本包含具体的上下午信息（如"上午半个工-下午1.5小时"）
                    // 直接使用按钮文本作为上下午数据
                    dayWorkOption = 'period';
                    workRecord.dayWorkOption = dayWorkOption;
                    workRecord.periodText = btnText;
                    workRecord.workDetails.上班时间.上下午 = btnText;
                    
                    // 尝试解析按钮文本中的工时信息
                    try {
                        // 简单解析：假设格式为"上午X-下午Y"，其中X和Y包含工时信息
                        const parts = btnText.split('-');
                        if (parts.length === 2) {
                            const morningPart = parts[0].replace('上午', '').trim();
                            const afternoonPart = parts[1].replace('下午', '').trim();
                            
                            // 解析上午工时
                            let morningHours = 0;
                            if (morningPart.includes('个工')) {
                                let workDays = 0;
                                // 处理"半个工"特殊情况
                                if (morningPart.includes('半个工')) {
                                    workDays = 0.5;
                                } else {
                                    // 处理数字+个工的情况
                                    const match = morningPart.match(/(\d+(?:\.\d+)?)\s*个工/);
                                    if (match) {
                                        workDays = parseFloat(match[1]);
                                    }
                                }
                                morningHours = workDays * actualRegularHoursPerDay;
                            } else if (morningPart.includes('小时')) {
                                // 处理数字+小时的情况
                                const match = morningPart.match(/(\d+(?:\.\d+)?)\s*小时/);
                                if (match) {
                                    morningHours = parseFloat(match[1]);
                                }
                            } else if (morningPart !== '休息') {
                                // 其他情况（如直接显示"1"或"0.5"）
                                const numValue = parseFloat(morningPart);
                                if (!isNaN(numValue)) {
                                    morningHours = numValue;
                                }
                            }
                            
                            // 解析下午工时
                            let afternoonHours = 0;
                            if (afternoonPart.includes('个工')) {
                                let workDays = 0;
                                // 处理"半个工"特殊情况
                                if (afternoonPart.includes('半个工')) {
                                    workDays = 0.5;
                                } else {
                                    // 处理数字+个工的情况
                                    const match = afternoonPart.match(/(\d+(?:\.\d+)?)\s*个工/);
                                    if (match) {
                                        workDays = parseFloat(match[1]);
                                    }
                                }
                                afternoonHours = workDays * actualRegularHoursPerDay;
                            } else if (afternoonPart.includes('小时')) {
                                // 处理数字+小时的情况
                                const match = afternoonPart.match(/(\d+(?:\.\d+)?)\s*小时/);
                                if (match) {
                                    afternoonHours = parseFloat(match[1]);
                                }
                            } else if (afternoonPart !== '休息') {
                                // 其他情况（如直接显示"1"或"0.5"）
                                const numValue = parseFloat(afternoonPart);
                                if (!isNaN(numValue)) {
                                    afternoonHours = numValue;
                                }
                            }
                            
                            // 计算总工时
                            const totalHours = morningHours + afternoonHours;
                            if (totalHours > 0) {
                                workRecord.regular_hours = totalHours;
                            } else {
                                // 无法解析工时，按1个工处理
                                workRecord.regular_hours = actualRegularHoursPerDay;
                            }
                        } else {
                            // 格式不符合预期，按1个工处理
                            workRecord.regular_hours = actualRegularHoursPerDay;
                        }
                    } catch (parseError) {
                        // 解析失败，按1个工处理
                        workRecord.regular_hours = actualRegularHoursPerDay;
                    }
                } else if (window.morningAfternoonData) {
                    // 传统方式：从window.morningAfternoonData获取数据
                    const m = window.morningAfternoonData.morning || { type: 'rest', value: '' };
                    const a = window.morningAfternoonData.afternoon || { type: 'rest', value: '' };
                    
                    // 分开计算上午和下午的工时
                    let morningTotalHours = 0;
                    let afternoonTotalHours = 0;
                    
                    // 计算上午工时
                    if (m.type === 'work' && m.value) {
                        const mDays = parseFloat(m.value) || 0;
                        morningTotalHours = mDays * actualRegularHoursPerDay;
                    } else if (m.type === 'hours' && m.value) {
                        morningTotalHours = parseFloat(m.value) || 0;
                    }
                    
                    // 计算下午工时
                    if (a.type === 'work' && a.value) {
                        const aDays = parseFloat(a.value) || 0;
                        afternoonTotalHours = aDays * actualRegularHoursPerDay;
                    } else if (a.type === 'hours' && a.value) {
                        afternoonTotalHours = parseFloat(a.value) || 0;
                    }
                    
                    // 总工时 = 上午工时 + 下午工时
                    const totalHours = morningTotalHours + afternoonTotalHours;
                    
                    if (totalHours > 0) {
                        // 采用"上下午"结果作为 dayWorkOption 与工时
                        dayWorkOption = 'period';
                        workRecord.dayWorkOption = dayWorkOption;
                        workRecord.regular_hours = totalHours;
                        // 保存上下午的显示文本
                        const formatText = (pd) => {
                            if (pd.type === 'rest') return '休息';
                            if (pd.type === 'work') return pd.value ? ((pd.value === '0.5' ? '半' : pd.value) + '个工') : '输入工';
                            if (pd.type === 'hours') return pd.value ? (pd.value + '小时') : '选小时';
                            return '';
                        };
                        const morningText = formatText(window.morningAfternoonData.morning);
                        const afternoonText = formatText(window.morningAfternoonData.afternoon);
                        const periodTextFromData = `上午${morningText}-下午${afternoonText}`;
                        workRecord.periodText = periodTextFromData;
                    } else {
                        // 上下午都没有工时，按休息处理
                        dayWorkOption = 'rest';
                        workRecord.dayWorkOption = dayWorkOption;
                        workRecord.regular_hours = 0;
                        workRecord.workDetails.上班时间.休息 = '是';
                    }
                }
            } catch (e) {
                console.error('上下午数据处理失败:', e);
            }
        }
        
        // 通用处理：如果为数字（包含'1'、'0.5'以及可编辑的'3'等），按"X个工；Y小时"记录
        const numericOption = parseFloat(dayWorkOption);
        if (dayWorkOption === 'period') {
            // 上下午数据已经在前面处理过了，这里不需要重新计算
            // 只需要确保显示文本正确设置
            const btnEl = document.getElementById('morningAfternoonBtn');
            if (btnEl) {
                const btnText = (btnEl.textContent || '').trim();
                if (btnText && btnText !== '上下午') {
                    workRecord.workDetails.上班时间.上下午 = btnText;
                    if (!workRecord.periodText) {
                        workRecord.periodText = btnText;
                    }
                }
            }
        } else if (!isNaN(numericOption) && numericOption > 0 && !document.getElementById('hiddenRadioHours').checked) {
            // 只有在不是选小时模式时，才将数字作为工数处理
            const isHalf = numericOption === 0.5;
            const workText = isHalf ? '半个工' : `${numericOption}个工`;
            workRecord.workDetails.上班时间.工数 = workText;
            workRecord.regular_hours = numericOption * regularHoursPerDay; // Y = X * 点工 小时/天
            workRecord.periodText = workText;
        } else if (dayWorkOption === 'hours' || (!isNaN(parseFloat(dayWorkOption)) && parseFloat(dayWorkOption) > 0 && document.getElementById('hiddenRadioHours') && document.getElementById('hiddenRadioHours').checked)) {
            // 选小时：处理小时数
            let hoursValue;
            
            // 如果dayWorkOption是数字，直接使用这个值
            const numericOption = parseFloat(dayWorkOption);
            if (!isNaN(numericOption) && numericOption > 0) {
                hoursValue = numericOption;
            } else {
                // 否则从上班小时输入框读取
                const hoursInputEl = document.querySelector('#dayWorkHours .hours-input');
                let hoursText = hoursInputEl ? hoursInputEl.value : '';
                const match = hoursText && hoursText.match(/^(\d+(?:\.\d+)?)小时$/);
                if (match) {
                    hoursValue = parseFloat(match[1]);
                    if (hoursValue <= 0 || hoursValue > 24) {
                        this.showNotification('上班小时数必须在0-24之间', true);
                        throw new Error('上班小时数必须在0-24之间');
                    }
                } else {
                    // 此处若"上下午"已经提供小时数，则允许通过
                    try {
                        if (window.morningAfternoonData) {
                            const m = window.morningAfternoonData.morning || { type: 'rest', value: '' };
                            const a = window.morningAfternoonData.afternoon || { type: 'rest', value: '' };
                            const mHours = m.type === 'hours' && m.value ? parseFloat(m.value) : 0;
                            const aHours = a.type === 'hours' && a.value ? parseFloat(a.value) : 0;
                            const totalHoursFromHours = (isNaN(mHours) ? 0 : mHours) + (isNaN(aHours) ? 0 : aHours);
                            const totalDaysFromWork = 0; // 仅针对 hours 分支
                            if (totalHoursFromHours > 0) {
                                hoursValue = totalHoursFromHours;
                            } else {
                                this.showNotification('请选择上班方式或设置上/下班时长', true);
                                throw new Error('请选择上班方式或设置上/下班时长');
                            }
                        } else {
                            this.showNotification('请选择上班方式或设置上/下班时长', true);
                            throw new Error('请选择上班方式或设置上/下班时长');
                        }
                    } catch (e) {
                        this.showNotification('请选择上班方式或设置上/下班时长', true);
                        throw e;
                    }
                }
            }
            
            // 设置记工记录
            workRecord.workDetails.上班时间.小时数 = `${hoursValue}小时`;
            // 当用户选择"选小时"时，直接使用小时数，不转换为工数
            workRecord.work_days = 0; // 不使用工数概念
            workRecord.regular_hours = hoursValue;
        } else if (dayWorkOption === 'rest') {
            // 休息
            workRecord.workDetails.上班时间.休息 = '是';
            workRecord.work_days = 0;
            workRecord.regular_hours = 0;
        }
        
        // 上下午：如果用户实际选择了上/下午具体值，则记录；否则不写入该字段
        try {
            // 只有当dayWorkOption是period或未选择时，才处理上下午数据
            // 避免覆盖用户已经选择的1个工、半个工、选小时等设置
            if ((dayWorkOption === 'period' || !dayWorkOption)) {
                // 先检查是否已经从按钮文本获取到了有效的periodText
                if (workRecord.periodText && workRecord.periodText !== '上下午' && workRecord.periodText.includes('上午') && workRecord.periodText.includes('下午')) {
                    // 已经有有效的periodText，不需要再处理
                    // 直接跳过后续处理，继续执行后面的代码
                } else {
                    if (window.morningAfternoonData) {
                        const hasRealMorning = (window.morningAfternoonData.morning.type === 'work' && window.morningAfternoonData.morning.value) ||
                                            (window.morningAfternoonData.morning.type === 'hours' && window.morningAfternoonData.morning.value) ||
                                            (window.morningAfternoonData.morning.type === 'rest');
                        const hasRealAfternoon = (window.morningAfternoonData.afternoon.type === 'work' && window.morningAfternoonData.afternoon.value) ||
                                            (window.morningAfternoonData.afternoon.type === 'hours' && window.morningAfternoonData.afternoon.value) ||
                                            (window.morningAfternoonData.afternoon.type === 'rest');
                        if (hasRealMorning || hasRealAfternoon) {
                            const formatText = (pd) => {
                                if (pd.type === 'rest') return '休息';
                                if (pd.type === 'work') return pd.value ? ((pd.value === '0.5' ? '半' : pd.value) + '个工') : '输入工';
                                if (pd.type === 'hours') return pd.value ? (pd.value + '小时') : '选小时';
                                return '';
                            };
                            const morningText = formatText(window.morningAfternoonData.morning);
                            const afternoonText = formatText(window.morningAfternoonData.afternoon);
                            const periodTextFromData = `上午${morningText}-下午${afternoonText}`;
                            workRecord.workDetails.上班时间.上下午 = periodTextFromData;
                            workRecord.periodText = periodTextFromData;
                        } else {
                            // 兜底：直接读取已更新的按钮显示文本
                            const btnEl = document.getElementById('morningAfternoonBtn');
                            if (btnEl) {
                                const btnText = (btnEl.textContent || '').trim();
                                if (btnText && btnText !== '上下午') {
                                    workRecord.workDetails.上班时间.上下午 = btnText;
                                    workRecord.periodText = btnText;
                                }
                            }
                        }
                    } else {
                        // 兜底：直接读取已更新的按钮显示文本
                        const btnEl = document.getElementById('morningAfternoonBtn');
                        if (btnEl) {
                            const btnText = (btnEl.textContent || '').trim();
                            if (btnText && btnText !== '上下午') {
                                workRecord.workDetails.上班时间.上下午 = btnText;
                                workRecord.periodText = btnText;
                            }
                        }
                    }
                }
            }
        } catch (e) {
            // 忽略上下午未初始化等情况
        }
        
        // 加班处理：仅在非"无加班"时记录
        if (window.overtimeData && window.overtimeData.type && window.overtimeData.type !== 'none') {
            let otHoursValue = 0;
            if (window.overtimeData.type === 'hours') {
                otHoursValue = parseFloat(window.overtimeData.value);
                if (isNaN(otHoursValue) || otHoursValue <= 0 || otHoursValue > 12) {
                    this.showNotification('加班小时数必须在0-12之间', true);
                    throw new Error('加班小时数必须在0-12之间');
                }
            } else if (window.overtimeData.type === 'work') {
                // 将加班工数换算为加班小时：Y = X × 加班 小时/天
                const otDays = parseFloat(window.overtimeData.value);
                if (isNaN(otDays) || otDays <= 0 || otDays > 10) {
                    this.showNotification('加班工数必须在0-10之间', true);
                    throw new Error('加班工数必须在0-10之间');
                }
                // 使用项目配置的加班小时/天，不使用兜底值
                otHoursValue = otDays * overtimeHoursPerDay;
            } else {
                // 其他类型（如金额）在点工模式不记录加班小时
                otHoursValue = 0;
            }
            if (otHoursValue > 0) {
                workRecord.overtime = true;
                workRecord.overtime_hours = otHoursValue;
                // 记录加班工数（若来源为工）以便提示展示
                if (window.overtimeData.type === 'work') {
                    const otDays = parseFloat(window.overtimeData.value);
                    const daysText = (otDays === 0.5) ? '半个工' : `${otDays}个工`;
                    workRecord.workDetails.加班 = `${daysText}；${otHoursValue}小时`;
                } else {
                    // 来源为小时
                    workRecord.workDetails.加班 = `${otHoursValue}小时`;
                }
            } else {
                workRecord.overtime = false;
            }
        } else {
            // 无加班：不记录加班字段
            workRecord.overtime = false;
            // 不写入 workRecord.overtimeHours/工作详情的加班
        }
        
        // 备注
        workRecord.workDetails.备注 = remark;
        
        // 设置work_time字段
        let workTimeText = '';
        // 优先检查是否为休息状态
        if (workRecord.dayWorkOption === 'rest' || workRecord.workDetails.上班时间.休息 === '是') {
            workTimeText = '休息';
        } else if (workRecord.periodText) {
            workTimeText = workRecord.periodText;
        } else if (workRecord.workDetails.上班时间.工数) {
            workTimeText = workRecord.workDetails.上班时间.工数;
        } else if (workRecord.workDetails.上班时间.小时数) {
            workTimeText = workRecord.workDetails.上班时间.小时数;
        } else if (workRecord.workDetails.上班时间.上下午) {
            workTimeText = workRecord.workDetails.上班时间.上下午;
        }
        
        // 如果有加班，添加加班信息
        let overtimeText = '';
        if (workRecord.overtime) {
            if (workRecord.workDetails.加班) {
                // 从加班文本中提取主要信息，去除小时数
                const otText = workRecord.workDetails.加班;
                if (otText.includes('个工')) {
                    // 提取工数部分
                    overtimeText = otText.split('；')[0];
                } else {
                    // 直接使用小时数
                    overtimeText = otText;
                }
            }
        }
        
        // 最终格式化work_time
        if (overtimeText) {
            workRecord.work_time = `${workTimeText}/${overtimeText}`;
        } else {
            workRecord.work_time = workTimeText;
        }
        
        // 图片信息
        if (workRecord.image_ids && workRecord.image_ids.length > 0) {
            workRecord.workDetails.图片数量 = workRecord.image_ids.length;
            workRecord.workDetails.图片IDs = workRecord.image_ids;
        }
    }

    /**
     * 处理包工数据
     * @private
     */
    _processContractWorkData(workRecord, remark) {
        // 包工模式 - 处理金额
        const amountInput = document.getElementById('amountInput');
        if (!amountInput) {
            this.showNotification('未找到金额输入框', true);
            throw new Error('未找到金额输入框');
        }
        
        const amount = amountInput.value;
        if (!amount || isNaN(parseFloat(amount))) {
            this.showNotification('请输入有效的金额', true);
            throw new Error('请输入有效的金额');
        }
        const amountValue = parseFloat(amount);
        if (amountValue <= 0) {
            this.showNotification('金额必须大于0', true);
            throw new Error('金额必须大于0');
        }
        workRecord.contract_amount = amountValue;
        // 包工模式不设置regular_hours
        
        // 记录包工选项卡页面信息
        workRecord.workDetails = {
            workType: '包工',
            金额: amountValue,
            备注: remark,
            图片数量: 0
        };
        
        // 图片信息
        if (workRecord.image_ids && workRecord.image_ids.length > 0) {
            workRecord.workDetails.图片数量 = workRecord.image_ids.length;
            workRecord.workDetails.图片IDs = workRecord.image_ids;
        }
    }

    /**
     * 处理工量数据
     * @private
     */
    _processWorkQuantityData(workRecord, remark) {
        // 工量模式 - 处理分项、工量、单价、工钱
        const currentSubProject = document.getElementById('currentSubProject');
        const workQuantityInput = document.getElementById('workAmountInput');
        const unitPriceInput = document.getElementById('unitPriceInput');
        const totalPriceInput = document.getElementById('totalPriceInput');
        
        if (!currentSubProject || !workQuantityInput || !unitPriceInput || !totalPriceInput) {
            this.showNotification('未找到工量相关输入框', true);
            throw new Error('未找到工量相关输入框');
        }
        
        const workItem = currentSubProject.textContent;
        const workQuantity = workQuantityInput.value;
        const unitPrice = unitPriceInput.value;
        const totalPrice = totalPriceInput.value;
        
        // 获取工量单位
        let workAmountUnit = '';
        const workAmountUnitElement = document.getElementById('workAmountUnit');
        if (workAmountUnitElement) {
            workAmountUnit = workAmountUnitElement.textContent;
        }
        
        if (workItem === '请选择分项') {
            this.showNotification('请选择分项', true);
            throw new Error('请选择分项');
        }
        if (!workQuantity || isNaN(parseFloat(workQuantity))) {
            this.showNotification('请输入有效的工量', true);
            throw new Error('请输入有效的工量');
        }
        if (!unitPrice || isNaN(parseFloat(unitPrice))) {
            this.showNotification('请输入有效的单价', true);
            throw new Error('请输入有效的单价');
        }
        if (!totalPrice || isNaN(parseFloat(totalPrice))) {
            this.showNotification('请输入有效的工钱', true);
            throw new Error('请输入有效的工钱');
        }
        
        const quantityValue = parseFloat(workQuantity);
        const priceValue = parseFloat(unitPrice);
        const totalValue = parseFloat(totalPrice);
        
        if (quantityValue <= 0 || priceValue <= 0 || totalValue <= 0) {
            this.showNotification('工量、单价和工钱必须大于0', true);
            throw new Error('工量、单价和工钱必须大于0');
        }
        
        // 验证工钱计算的准确性
        const calculatedTotal = parseFloat((quantityValue * priceValue).toFixed(2));
        if (Math.abs(calculatedTotal - totalValue) > 0.01) {
            this.showNotification('工钱计算不正确，请重新计算', true);
            throw new Error('工钱计算不正确，请重新计算');
        }
        
        // 设置work_time字段为"分项名称/单位"格式，不再使用work_item
        workRecord.work_time = `${workItem}/${workAmountUnit}`;
        workRecord.work_quantity = quantityValue;
        workRecord.unit_price = priceValue;
        workRecord.contract_amount = totalValue;
        workRecord.regular_hours = 8; // 工量默认8小时
        
        // 记录工量选项卡页面信息
        workRecord.workDetails = {
            workType: '工量',
            分项: workItem,
            工量: quantityValue,
            单价: priceValue,
            工钱: totalValue,
            备注: remark,
            图片数量: 0
        };
        
        // 图片信息
        if (workRecord.image_ids && workRecord.image_ids.length > 0) {
            workRecord.workDetails.图片数量 = workRecord.image_ids.length;
            workRecord.workDetails.图片IDs = workRecord.image_ids;
        }
    }

    /**
     * 处理图片数据，获取图片ID
     * @private
     */
    _processImageData() {
        // 首先检查图片上传控件中的原始图片
        const imageUpload = document.getElementById('imageUpload');
        if (imageUpload && imageUpload.files.length > 0) {
            return Array.from(imageUpload.files);
        }
        
        // 如果没有原始图片，检查处理后的图片数组
        // 这是因为图片被处理后会清空imageUpload.value，所以需要从全局数组获取
        if (window.selectedImages && window.selectedImages.length > 0) {
            return window.selectedImages;
        }

        return [];
    }
    
    /**
     * 解析多日期字符串，返回日期数组
     * @private
     */
    _parseMultipleDates(dateString) {
        const dates = [];
        
        // 调试：打印输入的日期字符串
        
        // 简单处理：如果是单个日期，直接返回
        if (dateString.includes('年') && dateString.includes('月') && dateString.includes('日')) {
            // 检查是否是多个日期格式
            if (dateString.includes('：')) {
                // 处理多日期格式，如：2025年11月：11，12，28日
                const match = dateString.match(/(\d{4})年(\d{1,2})月[：:]\s*([\d，,\s]+)日/);
                if (match) {
                    const [, year, month, daysStr] = match;
                    // 支持中文逗号和英文逗号，以及空格
                    const days = daysStr.split(/[,，\s]+/).map(day => day.trim()).filter(day => day);
                    

                    
                    days.forEach(day => {
                        if (day && !isNaN(day)) {
                            dates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
                        }
                    });
                } else {
                    // 尝试匹配其他多日期格式

                    // 作为单个日期处理
                    const match = dateString.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
                    if (match) {
                        const [, year, month, day] = match;
                        dates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
                    }
                }
            } else {
                // 单个日期格式
                const match = dateString.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
                if (match) {
                    const [, year, month, day] = match;
                    dates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
                }
            }
        } else if (dateString.includes('-')) {
            // 处理YYYY-MM-DD格式的日期
            dates.push(dateString);
        } else {
            // 默认情况，尝试直接使用原日期
            dates.push(dateString);
        }
        
        // 调试：打印解析出的日期数组
        
        return dates;
    }
    
    /**
     * 生成确认消息
     * @private
     */
    _getConfirmationMessage(record) {
        // 防御性检查：确保record参数不为undefined或null
        if (!record) {
            console.error('调用_getConfirmationMessage时record参数为undefined或null');
            return '无法生成确认消息，记录数据无效';
        }
        
        // 获取记工日期输入框的显示文本 - 直接显示日期输入框显示的内容
        let dateDisplayText = record.record_date;
        const workDateInput = document.getElementById('workDate');
        if (workDateInput) {
            const dateDisplay = document.getElementById('dateDisplay');
            if (dateDisplay) {
                // 直接使用日期显示区域的innerHTML作为显示文本，不进行任何额外处理
                dateDisplayText = dateDisplay.innerHTML;
            } else {
                // 如果没有显示区域，使用输入框的显示值或直接使用日期
                dateDisplayText = workDateInput.dataset.displayValue || this.formatDateForDisplay(record.record_date);
            }
        } else {
            // 默认使用日期
            dateDisplayText = record.record_date;
        }
        
        let message = `项目名称: ${record.project_name}\n记工日期: ${dateDisplayText}\n员工数量: ${record.employees.length}\n类型: ${record.work_type}`;
        
        // 根据工作类型显示上班和加班信息
        if (record.work_type === '点工') {
            // 获取当前项目的工时配置
            let regularHoursPerDay;
            let overtimeHoursPerDay;
            
            try {
                // 从localStorage获取项目数据
                const userId = JSON.parse(localStorage.getItem('currentUser'))?.user_id || 'default';
                const projectsData = localStorage.getItem('project_cache_' + userId);
                if (projectsData) {
                    const projects = JSON.parse(projectsData);
                    const currentProject = projects.find(p => p.project_id === record.project_id);
                    if (currentProject) {
                        // 只使用项目配置中的值，不使用默认值
                        regularHoursPerDay = parseFloat(currentProject.regular_hours);
                        overtimeHoursPerDay = parseFloat(currentProject.overtime_hours);
                    }
                }
            } catch (error) {
                console.error('获取项目配置失败:', error);
            }
            
            // 优先使用记录中的"上班时间"细节，避免 undefined
            const workTime = record.workDetails && record.workDetails.上班时间 ? record.workDetails.上班时间 : null;
            const periodText = (record.periodText) || (workTime && workTime.上下午) || (record.workDetails && record.workDetails.上下午) || '';
            const isRest = workTime && workTime.休息 === '是';
            const hasGongShu = workTime && workTime.工数; // 如 '半个工'、'3个工'
            const hasHourText = workTime && workTime.小时数; // 如 '6小时'
            
            if (periodText) {
                if (periodText === '上下午') {
                    // 上下午按钮显示为"上下午"，按休息处理
                    message += `\n上班: 休息`;
                } else if (periodText.includes('个工') && !periodText.includes('上午') && !periodText.includes('下午')) {
                    // 计算转换后的小时数
                    let convertedHours = 0;
                    if (periodText.includes('半个工')) {
                        convertedHours = 0.5 * regularHoursPerDay;
                    } else {
                        const daysValue = parseFloat(periodText.replace('个工', '')) || 1;
                        convertedHours = daysValue * regularHoursPerDay;
                    }
                    message += `\n上班: ${periodText}；${convertedHours}小时`;
                } else {
                    message += `\n上班: ${periodText}`;
                }
            } else if (isRest) {
                message += `\n上班: 休息`;
            } else if (hasGongShu) {
                // 计算转换后的小时数
                let convertedHours = 0;
                if (workTime.工数.includes('半个工')) {
                    convertedHours = 0.5 * regularHoursPerDay;
                } else {
                    const daysValue = parseFloat(workTime.工数.replace('个工', '')) || 1;
                    convertedHours = daysValue * regularHoursPerDay;
                }
                message += `\n上班: ${workTime.工数}；${convertedHours}小时`;
            } else if (hasHourText) {
                message += `\n上班: ${workTime.小时数}`;
            } else {
                // 直接使用记录中的工时信息
                message += `\n上班: 未设置`;
            }
            if (record.overtime) {
                // 根据加班按钮的实际显示状态来决定提示信息的显示方式
                if (record.workDetails && record.workDetails.加班) {
                    const overtimeText = record.workDetails.加班;
                    if (overtimeText.includes('个工')) {
                        // 提取加班工数，重新计算正确的小时数
                        let overtimeDays = 0;
                        if (overtimeText.includes('半个工')) {
                            overtimeDays = 0.5;
                        } else {
                            // 提取工数，忽略已有的小时数
                            const daysMatch = overtimeText.match(/([0-9.]+)个工/);
                            if (daysMatch && daysMatch[1]) {
                                overtimeDays = parseFloat(daysMatch[1]) || 0;
                            }
                        }
                        
                        // 计算转换后的加班小时数
                        let convertedOvertimeHours = overtimeDays * overtimeHoursPerDay;
                        
                        // 构建正确的加班文本
                        const daysText = (overtimeDays === 0.5) ? '半个工' : `${overtimeDays}个工`;
                        message += `\n加班: ${daysText}；${convertedOvertimeHours}小时`;
                    } else {
                        message += `\n加班: ${overtimeText}`;
                    }
                } else if (window.overtimeData) {
                    // 根据window.overtimeData.type来判断显示方式
                    if (window.overtimeData.type === 'work') {
                        // 显示为"？个工"时，提示信息显示为："？个工；？小时"
                        const daysValue = parseFloat(window.overtimeData.value);
                        const daysText = (daysValue === 0.5) ? '半个工' : `${daysValue}个工`;
                        // 计算转换后的加班小时数
                        const convertedOvertimeHours = daysValue * overtimeHoursPerDay;
                        message += `\n加班: ${daysText}；${convertedOvertimeHours}小时`;
                    } else if (window.overtimeData.type === 'hours') {
                        // 显示为"？小时"时，提示信息只显示为："？小时"
                        const hoursValue = parseFloat(window.overtimeData.value);
                        message += `\n加班: ${hoursValue}小时`;
                    } else {
                        if (typeof record.overtime_hours === 'number' && record.overtime_hours > 0 && !isNaN(record.overtime_hours)) {
                            message += `\n加班: ${record.overtime_hours}小时`;
                        }
                    }
                } else {
                    if (typeof record.overtime_hours === 'number' && record.overtime_hours > 0 && !isNaN(record.overtime_hours)) {
                        message += `\n加班: ${record.overtime_hours}小时`;
                    }
                }
            }
        } else if (record.work_type === '包工') {
            message += `\n金额: ${record.contract_amount}元`;
        } else if (record.work_type === '工量') {
            // 工量模式下显示详细信息
            // 从work_time中提取分项名称（去掉单位部分）
            const workItem = record.work_time ? record.work_time.split('/')[0] : '';
            message += `\n分项: ${workItem}`;
            
            // 获取工量单位
            let workAmountUnit = '';
            const workAmountUnitElement = document.getElementById('workAmountUnit');
            if (workAmountUnitElement) {
                workAmountUnit = workAmountUnitElement.textContent;
            }
            message += `\n工量: ${record.work_quantity} ${workAmountUnit}`;
            
            // 获取单价单位
            let unitPriceUnit = '元';
            const unitPriceUnitElement = document.getElementById('unitPriceUnit');
            if (unitPriceUnitElement) {
                unitPriceUnit = unitPriceUnitElement.textContent || '元';
            }
            message += `\n单价: ${record.unit_price} ${unitPriceUnit}`;
            
            message += `\n工钱: ${record.contract_amount}元`;
        }
        
        if (record.remark) {
            message += `\n备注: ${record.remark}`;
        }
        
        // 检查是否有图片
        const hasImages = record.image_ids && record.image_ids.length > 0;
        if (hasImages) {
            message += `\n图片: ${record.image_ids.length}张`;
        }
        
        message += '\n\n确认保存此记工记录吗？';
        return message;
    }

    /**
     * 保存记工记录
     */
    async saveWorkRecord(workRecord) {
        try {
            // 获取用户信息
            let phone = localStorage.getItem('loggedInPhone');
            if (!phone && window.location.hostname === 'localhost') {
                phone = '13800138000';

            }
            
            if (!phone) {
                throw new Error('未找到用户信息');
            }
            
            // 检查网络状态
            const isOnline = navigator.onLine;
            
            if (!isOnline) {

                return await this._saveWorkRecordToLocal(workRecord, phone);
            }
            
            // 等待Supabase客户端初始化完成
            const supabase = await window.waitForSupabase();
            
            // 上传图片到Supabase存储
            let imageUrls = [];
            if (workRecord.images && workRecord.images.length > 0) {
                const recordDate = workRecord.record_date || workRecord.date;
                imageUrls = await this._uploadImagesToSupabase(workRecord.images, workRecord.project_id, recordDate);
            } else {
            }
            
            // 为每个员工创建记工记录
            let allSuccess = true;
            
            for (const employee of workRecord.employees) {
                // 获取当前项目的配置信息
                let regularHoursPerDay;
                let overtimeHoursPerDay;
                
                try {
                    // 从localStorage获取项目数据
                    const userId = JSON.parse(localStorage.getItem('currentUser'))?.user_id || 'default';
                    const projectsData = localStorage.getItem('project_cache_' + userId);
                    if (projectsData) {
                        const projects = JSON.parse(projectsData);
                        const currentProject = projects.find(p => p.project_id === workRecord.project_id);
                        if (currentProject) {
                            // 只使用项目配置中的值，不使用默认值
                            regularHoursPerDay = parseFloat(currentProject.regular_hours);
                            overtimeHoursPerDay = parseFloat(currentProject.overtime_hours);
                        }
                    }
                } catch (error) {
                    console.error('获取项目配置失败:', error);
                }
                
                // 直接使用workRecord中已经计算好的工时，不再重新计算
                let regular_hours = workRecord.regular_hours || 0;
                let overtime_hours = workRecord.overtime_hours || 0;
                
                // 处理点工类型的工时转换
                if (workRecord.work_type === '点工') {
                    // 处理上班工时
                    if (workRecord.workDetails?.休息 === '是') {
                        // 选择休息，不上传regular_hours
                        regular_hours = null;
                    }
                } else if (workRecord.work_type === '包工') {
                    // 包工模式，不写入regular_hours和overtime_hours
                    regular_hours = null;
                    overtime_hours = null;
                }
                
                // 构建基础记工记录数据
                const baseData = {
                    phone: phone, 
                    project_id: workRecord.project_id, 
                    employee_id: employee.employee_id, 
                    record_date: workRecord.record_date || workRecord.date || new Date().toISOString().split('T')[0], 
                    work_type: workRecord.work_type, 
                    
                    // 图片信息
                    image_ids: imageUrls, 
                    
                    // 备注信息
                    remark: workRecord.remark || workRecord.workDetails?.备注 || null,
                    
                    // 审核状态
                    audit_status: '未审核'
                };
                
                // 根据工作类型构建不同的attendanceData
                let attendanceData = {};
                
                if (workRecord.work_type === '包工') {
                    // 包工模式：只包含包工相关字段
                    attendanceData = {
                        ...baseData,
                        contract_amount: workRecord.contract_amount || 0,
                        work_time: '金额'
                    };
                } else if (workRecord.work_type === '点工') {
                    // 点工模式：只包含点工相关字段
                    attendanceData = {
                        ...baseData,
                        regular_hours: regular_hours,
                        overtime_hours: overtime_hours,
                        work_time: workRecord.work_time
                    };
                } else if (workRecord.work_type === '工量') {
                    // 工量模式：只包含工量相关字段，使用work_time字段
                    attendanceData = {
                        ...baseData,
                        work_time: workRecord.work_time || null,
                        work_quantity: workRecord.work_quantity || 0,
                        unit_price: workRecord.unit_price || 0,
                        contract_amount: workRecord.contract_amount || 0
                    };
                } else {
                    // 默认情况：包含所有字段，但不包含work_item
                    attendanceData = {
                        ...baseData,
                        regular_hours: regular_hours,
                        overtime_hours: overtime_hours,
                        work_time: workRecord.work_time,
                        contract_amount: workRecord.contract_amount || 0,
                        work_quantity: workRecord.work_quantity || 0,
                        unit_price: workRecord.unit_price || 0,
                        contract_amount: workRecord.contract_amount || 0
                    };
                }
                
                // 使用Supabase客户端保存数据，明确指定返回的列，不包含work_days和work_item
                const { data, error } = await supabase
                    .from('attendance_records')
                    .insert([attendanceData])
                    .select('phone, project_id, employee_id, record_date, work_type, regular_hours, overtime_hours, work_time, contract_amount, work_quantity, unit_price, image_ids, remark');
                
                if (error) {
                    console.error('保存记工记录失败:', error);
                    // 检查是否是网络错误
                    if (error.message && error.message.includes('Failed to fetch')) {

                        return await this._saveWorkRecordToLocal(workRecord, phone);
                    }
                    allSuccess = false;
                    break;
                }
            }
            
            if (!allSuccess) {
                throw new Error('保存记工记录失败');
            }
            
            // 保存记工备注历史（如果有）
            if (workRecord.workDetails?.备注) {
                await this._saveRemarkHistory(workRecord.workDetails.备注, phone);
            }
            
            // 记录操作日志
            await this._logDatabaseOperation({
                operation: 'CREATE_ATTENDANCE',
                table: 'attendance_records',
                recordCount: workRecord.employees.length,
                projectId: workRecord.project_id,
                phone: phone,
                timestamp: new Date().toISOString()
            });
            
            return true;
            
        } catch (error) {
            console.error('保存记工记录失败:', error);
            // 检查是否是网络错误
            if (error.message && error.message.includes('Failed to fetch')) {

                return await this._saveWorkRecordToLocal(workRecord, phone);
            }
            throw error;
        }
    }

    /**
     * 保存记工记录到本地存储（离线模式）
     */
    async _saveWorkRecordToLocal(workRecord, phone) {
        try {
            // 处理图片 - 保存到本地存储并获取本地URL
            let localImageUrls = [];
            if (workRecord.images && workRecord.images.length > 0) {
                const recordDate = workRecord.record_date || workRecord.date;
                let dateStr;
                if (recordDate) {
                    // 使用记工日期
                    const recordDateObj = new Date(recordDate);
                    const year = recordDateObj.getFullYear();
                    const month = String(recordDateObj.getMonth() + 1).padStart(2, '0');
                    const day = String(recordDateObj.getDate()).padStart(2, '0');
                    dateStr = `${year}-${month}-${day}`;
                } else {
                    // 兼容处理：如果没有记工日期，使用当前日期
                    const currentDate = new Date();
                    const year = currentDate.getFullYear();
                    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                    const day = String(currentDate.getDate()).padStart(2, '0');
                    dateStr = `${year}-${month}-${day}`;
                }
                // 获取项目ID
                const projectId = workRecord.project_id;
                
                for (let i = 0; i < workRecord.images.length; i++) {
                    const image = workRecord.images[i];
                    // 获取文件扩展名
                    let fileExtension = 'jpg'; // 默认扩展名
                    if (image.name) {
                        fileExtension = image.name.split('.').pop();
                    } else if (typeof image === 'string') {
                        // 如果是字符串URL，从URL中提取扩展名
                        const urlParts = image.split('.');
                        if (urlParts.length > 1) {
                            fileExtension = urlParts.pop().split('?')[0].split('#')[0];
                        }
                    }
                    // 使用原始图片名称，中文转换为英文
                    let originalName = 'image';
                    if (image.name) {
                        originalName = image.name.replace(`.${fileExtension}`, '');
                    } else if (typeof image === 'string') {
                        // 如果是字符串URL，从URL中提取文件名
                        originalName = image.split('/').pop().split('?')[0].split('#')[0];
                        if (originalName.includes('.')) {
                            originalName = originalName.split('.').slice(0, -1).join('.');
                        }
                    }
                    let englishName = this._convertChineseToEnglish(originalName);
                    // 确保文件名不为空
                    if (!englishName || englishName === '_') {
                        englishName = `image_${i + 1}`;
                    }
                    const fileName = `${projectId}/attendance/${dateStr}/${englishName}.${fileExtension}`;
                    
                    // 保存单个图片到本地
                    const localImageUrl = await this._saveSingleImageToLocal(image, fileName);
                    localImageUrls.push(localImageUrl);
                    
                    // 添加图片上传任务到同步队列
                    if (window.offlineSyncService) {
                        window.offlineSyncService.addToSyncQueue('upload_image', {
                            fileName: fileName,
                            localPath: localImageUrl,
                            bucketName: 'FYKQ',
                            projectId: 'oydffrzzulsrbitrrhht'
                        }, `img_${fileName}_${Date.now()}_${i}`, 'image');
                    }
                }
            }
            
            // 更新workRecord的图片信息
            workRecord.image_ids = localImageUrls;
            
            // 为每个员工创建记工记录
            const savedRecords = [];
            const attendanceRecords = [];
            
            for (const employee of workRecord.employees) {
                // 生成唯一ID
                const recordId = `attendance_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                
                // 处理点工类型的工时转换，与在线保存保持一致
                let regular_hours = workRecord.regular_hours || 0;
                let overtime_hours = workRecord.overtime_hours || 0;
                
                if (workRecord.work_type === '点工') {
                    // 处理上班工时
                    if (workRecord.workDetails?.休息 === '是') {
                        // 选择休息，不上传regular_hours
                        regular_hours = null;
                    }
                } else if (workRecord.work_type === '包工') {
                    // 包工模式，不写入regular_hours和overtime_hours
                    regular_hours = null;
                    overtime_hours = null;
                }
                
                // 构建基础记工记录数据，与在线保存完全一致
                const baseData = {
                    id: recordId,
                    record_id: recordId, // 同时设置 record_id 字段，确保修改时能正确匹配
                    phone: phone, 
                    project_id: workRecord.project_id, 
                    employee_id: employee.employee_id, 
                    record_date: workRecord.record_date || workRecord.date || new Date().toISOString().split('T')[0], 
                    work_type: workRecord.work_type, 
                    
                    // 图片信息
                    image_ids: workRecord.image_ids || [], 
                    
                    // 备注信息
                    remark: workRecord.remark || workRecord.workDetails?.备注 || null,
                    
                    // 审核状态
                    audit_status: '未审核',
                    
                    // 本地存储特有字段
                    _local: true,
                    _timestamp: new Date().toISOString(),
                    _synced: false
                };
                
                // 根据工作类型构建不同的attendanceData，与在线保存完全一致
                let attendanceData = {};
                
                if (workRecord.work_type === '包工') {
                    // 包工模式：只包含包工相关字段
                    attendanceData = {
                        ...baseData,
                        contract_amount: workRecord.contract_amount || 0,
                        work_time: '金额'
                    };
                } else if (workRecord.work_type === '点工') {
                    // 点工模式：只包含点工相关字段
                    attendanceData = {
                        ...baseData,
                        regular_hours: regular_hours,
                        overtime_hours: overtime_hours,
                        work_time: workRecord.work_time
                    };
                } else if (workRecord.work_type === '工量') {
                    // 工量模式：只包含工量相关字段，使用work_time字段
                    attendanceData = {
                        ...baseData,
                        work_time: workRecord.work_time || null,
                        work_quantity: workRecord.work_quantity || 0,
                        unit_price: workRecord.unit_price || 0,
                        contract_amount: workRecord.contract_amount || 0
                    };
                } else {
                    // 默认情况：包含所有字段，但不包含work_item
                    attendanceData = {
                        ...baseData,
                        regular_hours: regular_hours,
                        overtime_hours: overtime_hours,
                        work_time: workRecord.work_time,
                        contract_amount: workRecord.contract_amount || 0,
                        work_quantity: workRecord.work_quantity || 0,
                        unit_price: workRecord.unit_price || 0,
                        contract_amount: workRecord.contract_amount || 0
                    };
                }
                
                // 保存到localStorage
                localStorage.setItem(recordId, JSON.stringify(attendanceData));
                savedRecords.push(recordId);
                attendanceRecords.push(attendanceData);
                
                // 添加到同步队列
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('add', attendanceData, recordId, 'attendance');
                }
            }
            
            // 获取user_id，与首页保持一致
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
            
            // 更新work_records_${userId}，与首页保持一致
            const workRecordsKey = `work_records_${userId}`;
            let allRecords = [];
            try {
                const existingData = localStorage.getItem(workRecordsKey);
                if (existingData) {
                    allRecords = JSON.parse(existingData);
                }
            } catch (parseError) {
                console.error('解析本地记工记录数据失败:', parseError);
                allRecords = [];
            }
            
            // 将新记录添加到所有记录中
            allRecords = [...allRecords, ...attendanceRecords];
            
            // 保存回localStorage
            localStorage.setItem(workRecordsKey, JSON.stringify(allRecords));
            
            // 保存记工备注历史（如果有）
            if (workRecord.workDetails?.备注) {
                await this._saveRemarkHistory(workRecord.workDetails.备注, phone);
            }
            
            return true;
            
        } catch (error) {
            console.error('保存记工记录到本地存储失败:', error);
            throw new Error('保存记工记录到本地存储失败: ' + error.message);
        }
    }

    // 辅助方法
    formatDateForDisplay(dateStr) {
        const [year, month, day] = dateStr.split('-');
        return `${year}年${parseInt(month)}月${parseInt(day)}日`;
    }

    showNotification(message, isError = false) {
        const notification = document.getElementById('notification');
        if (notification) {
            notification.textContent = message;
            notification.className = isError ? 'notification error' : 'notification';
            notification.style.display = 'block';

            setTimeout(() => {
                notification.style.display = 'none';
            }, 3000);
        } else {

        }
        
        if (message === '记工成功') {
            this.playSuccessSound();
        }
    }
    
    playSuccessSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            function playTone(frequency, startTime, duration, type = 'sine') {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.frequency.value = frequency;
                oscillator.type = type;

                gainNode.gain.setValueAtTime(0, startTime);
                gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

                oscillator.start(startTime);
                oscillator.stop(startTime + duration);
            }

            const now = audioContext.currentTime;
            playTone(523.25, now, 0.15);
            playTone(659.25, now + 0.15, 0.15);
            playTone(783.99, now + 0.3, 0.25);
            
            console.log('成功提示音已播放');
        } catch (e) {
            console.log('音频播放失败:', e);
        }
    }

    showConfirmModal(title, message, confirmCallback) {
        // 移除所有现有的确认模态框，防止叠加
        document.querySelectorAll('.confirm-modal').forEach(existingModal => {
            existingModal.remove();
        });
        
        const modal = document.createElement('div');
        modal.className = 'modal confirm-modal';
        modal.style.display = 'flex';
        // 创建带有蓝色数据颜色的确认消息
        const formattedMessage = this._formatConfirmationMessage(message);
        
        // 根据编辑模式调整标题和按钮文本
        let displayTitle = title;
        let confirmButtonText = '确认';
        
        // 检查是否处于编辑模式：确认按钮的文本是否为"保存修改"
        if (document.getElementById('confirmBtn') && document.getElementById('confirmBtn').textContent === '保存修改') {
            // 如果是删除操作，优先使用删除相关文本
            if (title === '删除记工') {
                displayTitle = '删除记工';
                confirmButtonText = '删除';
            } else {
                displayTitle = '修改记工';
                confirmButtonText = '修改';
            }
        }
        
        modal.innerHTML = `
            <div class="modal-content">
                <h3 style="color: #ED7D31;">${displayTitle}</h3>
                <p id="confirmMessageContent">${formattedMessage}</p>
                <div class="form-buttons" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-top: 20px;">
                    <button id="confirmAction" style="background-color: #52c41a; margin-left: 0;">${confirmButtonText}</button>
                    <button id="cancelAction" style="background-color: #f5222d; margin-right: 0;">取消</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 确保DOM已渲染完成后再添加事件监听器
        setTimeout(() => {
            // 从modal元素内部查找按钮，而不是全局查找
            const confirmButton = modal.querySelector('#confirmAction');
            const cancelButton = modal.querySelector('#cancelAction');
            
            if (confirmButton) {
                confirmButton.addEventListener('click', () => {
                    // 清空提示消息
                    const messageElement = modal.querySelector('#confirmMessageContent');
                    if (messageElement) {
                        messageElement.innerHTML = '';
                    }
                    // 执行确认回调
                    confirmCallback();
                    // 移除模态框
                    modal.remove();
                });
            }
            
            if (cancelButton) {
                cancelButton.addEventListener('click', () => {
                    modal.remove();
                });
            }
        }, 0);
    }

    resetForm() {
        // 重置记工类型为点工
        document.querySelector('input[name="workType"][value="点工"]').checked = true;
        
        // 重置上下午按钮状态
        const morningAfternoonBtn = document.getElementById('morningAfternoonBtn');
        if (morningAfternoonBtn) {
            morningAfternoonBtn.textContent = '上下午';
        }
        
        // 重置上下午数据
        if (window.morningAfternoonData) {
            window.morningAfternoonData = {
                morning: { type: 'rest', value: '' },
                afternoon: { type: 'rest', value: '' }
            };
        }
        
        // 重置dayWork选项为默认值（无选择状态）
        document.querySelectorAll('input[name="dayWork"]').forEach(radio => {
            radio.checked = false;
        });
        
        // 重置加班数据
        if (window.overtimeData) {
            window.overtimeData = { type: 'none', value: '' };
        }
        
        // 触发change事件以显示相应的选项
        const workTypeEvent = new Event('change', { bubbles: true });
        document.querySelector('input[name="workType"]').dispatchEvent(workTypeEvent);
    }

    loadEmployeeData(projectName) {
        // 调用全局的loadEmployeeData函数
        if (typeof window.loadEmployeeData === 'function') {
            return window.loadEmployeeData(projectName);
        }
        return Promise.resolve();
    }

    // 私有辅助方法
    _formatConfirmationMessage(message) {
        // 将消息按行分割
        const lines = message.split('\n');
        const formattedLines = lines.map(line => {
            // 检查是否包含冒号，且不是最后一行（确认提示）
            if (line.includes(':') && !line.includes('确认保存此记工记录吗')) {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const label = parts[0] + ':';
                    const data = parts.slice(1).join(':');
                    // 将数据部分设置为蓝色
                    return `${label}<span style="color: blue;">${data}</span>`;
                }
            }
            return line;
        });
        return formattedLines.join('<br>');
    }



    _getWorkTime(workRecord) {
        if (workRecord.work_type === '点工') {
            // 优先根据实际选择的工作类型返回
            const workTime = workRecord.workDetails && workRecord.workDetails.上班时间 ? workRecord.workDetails.上班时间 : null;
            if (workTime?.工数) {
                return workTime.工数;
            } else if (workTime?.小时数) {
                return workTime.小时数;
            } else if (workRecord.periodText) {
                return workRecord.periodText;
            } else if (workRecord.dayWorkOption === 'hours' && typeof workRecord.regular_hours === 'number' && !isNaN(workRecord.regular_hours)) {
                return `${workRecord.regular_hours}小时`;
            } else if (typeof workRecord.regular_hours === 'number' && !isNaN(workRecord.regular_hours)) {
                return `${workRecord.regular_hours}小时`;
            } else {
                return '0小时';
            }
        } else {
            return workRecord.workDetails?.工量 || workRecord.work_quantity || '0';
        }
    }



    async _saveRemarkHistory(remark, phone) {
        try {
            if (!remark || remark.trim().length === 0) return;
            
            const historyKey = `remark_history_${phone}`;
            let historyList = [];
            
            if (window.dataStorage && typeof window.dataStorage.getData === 'function') {
                historyList = await window.dataStorage.getData(historyKey) || [];
            }
            
            // 去重并限制数量
            if (!historyList.includes(remark)) {
                historyList.unshift(remark); // 添加到开头
                // 只保留最近20条
                if (historyList.length > 20) {
                    historyList = historyList.slice(0, 20);
                }
                
                if (window.database && typeof window.database.create === 'function') {
                    await window.database.create('attendance_history', { key: historyKey, data: historyList });
                }
            }
            
            return true;
        } catch (error) {
            console.error('保存备注历史失败:', error);
            return false;
        }
    }

    async _logDatabaseOperation(logData) {
        try {
            // 使用record_id字段而不是id字段
            const logRecord = {
                record_id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                ...logData,
                createTime: new Date().toISOString()
            };
            
            if (window.database && typeof window.database.create === 'function') {
                await window.database.create('logs', logRecord);
            }
        } catch (error) {
            console.warn('记录数据库操作日志失败:', error);
        }
    }
    
    // 中文转英文的辅助函数 - 使用pinyin-pro库将中文转为拼音
    _convertChineseToEnglish(str) {
        if (!str) {
            return 'image';
        }
        
        // 检查字符串是否包含中文汉字
        const hasChinese = /[\u4e00-\u9fa5]/.test(str);
        
        // 如果没有中文，直接返回处理后的原始字符串
        if (!hasChinese) {
            // 只处理特殊字符
            let result = str;
            // 只移除真正的特殊字符，保留字母、数字、下划线、连字符、点和空格
            result = result.replace(/[^a-zA-Z0-9_.-\s]/g, '_');
            // 去除多余的下划线，将连续多个下划线替换为单个下划线
            result = result.replace(/_+/g, '_');
            // 去除首尾的下划线
            result = result.trim().replace(/^_|_$/g, '');
            // 确保文件名不为空
            return result || 'image';
        }
        
        let result = '';
        
        try {
            // 更可靠的方法：将字符串分割为中文和非中文部分
            // 使用正则表达式将字符串分割为中文和非中文部分的数组
            const parts = str.split(/([\u4e00-\u9fa5]+)/);
            
            // 检查pinyin-pro库是否可用
            if (typeof window.pinyinPro !== 'undefined' && typeof window.pinyinPro.pinyin === 'function') {
                // 遍历所有部分
                for (const part of parts) {
                    if (/[\u4e00-\u9fa5]/.test(part)) {
                        // 是中文，转换为拼音
                        let pinyin = window.pinyinPro.pinyin(part, {
                            tone: false,  // 不带声调
                            type: 'string',  // 返回字符串
                            separator: ''  // 空分隔符，生成连续的拼音
                        });
                        // 确保去除所有下划线，无论pinyin库返回什么
                        pinyin = pinyin.replace(/_/g, '');
                        result += pinyin;
                    } else {
                        // 不是中文，直接添加
                        result += part;
                    }
                }
            } else if (typeof window.pinyin !== 'undefined') {
                // 使用旧版pinyin库
                // 遍历所有部分
                for (const part of parts) {
                    if (/[\u4e00-\u9fa5]/.test(part)) {
                        // 是中文，转换为拼音
                        let pinyin = window.pinyin(part, {
                            tone: false,  // 不带声调
                            type: 'string',  // 返回字符串
                            separator: ''  // 空分隔符，生成连续的拼音
                        });
                        // 确保去除所有下划线，无论pinyin库返回什么
                        pinyin = pinyin.replace(/_/g, '');
                        result += pinyin;
                    } else {
                        // 不是中文，直接添加
                        result += part;
                    }
                }
            } else {
                // 如果pinyin-pro库不可用，使用简单的映射
                const pinyinMap = {
                    '一': 'yi', '二': 'er', '三': 'san', '四': 'si', '五': 'wu',
                    '六': 'liu', '七': 'qi', '八': 'ba', '九': 'jiu', '十': 'shi',
                    '图片': 'image', '照片': 'photo', '截图': 'jietu',
                    '考勤': 'attendance', '记工': 'work_record'
                };
                
                // 只替换常见中文词汇，不影响英文和数字
                result = str;
                for (const [chinese, english] of Object.entries(pinyinMap)) {
                    result = result.replace(new RegExp(chinese, 'g'), english);
                }
            }
        } catch (error) {
            console.error('中文转拼音失败:', error);
            // 发生错误时，返回原始字符串，确保不会导致文件名完全损坏
            result = str;
        }
        
        // 只移除真正的特殊字符，保留字母、数字、下划线、连字符、点和空格
        result = result.replace(/[^a-zA-Z0-9_.-\s]/g, '_');
        
        // 去除多余的下划线，将连续多个下划线替换为单个下划线
        result = result.replace(/_+/g, '_');
        
        // 去除首尾的下划线
        result = result.trim().replace(/^_|_$/g, '');
        
        // 确保文件名不为空
        if (!result) {
            result = 'image';
        }
        
        return result;
    }
    
    // 上传图片到Supabase存储 - 使用tus-js-client
    async _uploadImagesToSupabase(images, recordProjectId = '', recordDate = '') {
        try {
            // 检查网络状态
            const isOnline = navigator.onLine;
            
            if (!isOnline) {
                return await this._saveImagesToLocal(images, recordProjectId, recordDate);
            }
            
            // 等待Supabase客户端初始化完成
            const supabase = await window.waitForSupabase();
            const bucketName = 'FYKQ';
            const folderName = 'attendance'
            const uploadedUrls = [];
            
            // 获取Supabase项目ID
            const supabaseProjectId = 'oydffrzzulsrbitrrhht';
            
            // 获取会话信息
            const { data: { session } } = await supabase.auth.getSession();
            
            // 使用tus-js-client上传图片
            for (let i = 0; i < images.length; i++) {
                let image = images[i];
                // 生成记工日期格式的文件名
                let dateStr;
                if (recordDate) {
                    // 使用传入的记工日期
                    const recordDateObj = new Date(recordDate);
                    const year = recordDateObj.getFullYear();
                    const month = String(recordDateObj.getMonth() + 1).padStart(2, '0');
                    const day = String(recordDateObj.getDate()).padStart(2, '0');
                    dateStr = `${year}-${month}-${day}`;
                } else {
                    // 兼容处理：如果没有传入日期，使用当前日期
                    const currentDate = new Date();
                    const year = currentDate.getFullYear();
                    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                    const day = String(currentDate.getDate()).padStart(2, '0');
                    dateStr = `${year}-${month}-${day}`;
                }
                
                // 获取文件扩展名
                let fileExtension = 'jpg'; // 默认扩展名
                let originalName = 'image';
                let finalName = 'image';
                
                if (image.name) {
                    // 原始File对象，有name属性
                    // 提取文件名（如果name包含路径，只取最后一个/后面的部分）
                    let imageName = image.name;
                    // 确保只取文件名，移除可能存在的路径
                    if (imageName.includes('/')) {
                        imageName = imageName.split('/').pop();
                    }
                    if (imageName.includes('\\')) {
                        imageName = imageName.split('\\').pop();
                    }
                    
                    fileExtension = imageName.split('.').pop();
                    originalName = imageName.replace(`.${fileExtension}`, '');
                    // 直接使用图片对象的name属性，不再次转换
                    // 因为图片对象的name属性可能已经是处理过的拼音名称
                    finalName = originalName;
                } else if (typeof image === 'string') {
                    // 字符串URL，从URL中提取文件名和扩展名
                    let url = image;
                    // 如果是URL编码的字符串，先解码
                    try {
                        url = decodeURIComponent(image);
                    } catch (e) {
                        // 如果解码失败，使用原始字符串
                    }
                    
                    // 提取文件名（最后一个/后面的部分）
                    let fileNamePart = url.split('/').pop().split('?')[0].split('#')[0];
                    
                    // 提取扩展名
                    const dotIndex = fileNamePart.lastIndexOf('.');
                    if (dotIndex > 0) {
                        fileExtension = fileNamePart.substring(dotIndex + 1);
                        originalName = fileNamePart.substring(0, dotIndex);
                        // 转换中文文件名
                        finalName = this._convertChineseToEnglish(originalName);
                    }
                } else if (image instanceof Blob) {
                    // Blob对象，尝试从type属性获取扩展名
                    if (image.type && image.type.includes('/')) {
                        fileExtension = image.type.split('/')[1];
                    }
                    // 检查是否有name属性（有些Blob对象可能被赋予了name属性）
                    if (image.name) {
                        // 提取文件名（如果name包含路径，只取最后一个/后面的部分）
                        let blobName = image.name;
                        // 确保只取文件名，移除可能存在的路径
                        if (blobName.includes('/')) {
                            blobName = blobName.split('/').pop();
                        }
                        if (blobName.includes('\\')) {
                            blobName = blobName.split('\\').pop();
                        }
                        
                        originalName = blobName.replace(`.${fileExtension}`, '');
                        // 直接使用图片对象的name属性，不再次转换
                        finalName = originalName;
                    } else {
                        // 检查是否是从URL创建的Blob，尝试从URL中获取文件名
                        if (image.webkitRelativePath) {
                            // 对于从input[type="file"]获取的Blob，可能有webkitRelativePath
                            originalName = image.webkitRelativePath.split('/').pop().replace(`.${fileExtension}`, '');
                            finalName = this._convertChineseToEnglish(originalName);
                        } else {
                            // 否则使用默认名称
                            finalName = `image_${i + 1}`;
                        }
                    }
                }
                
                // 确保文件名不为空
                if (!finalName || finalName === '_') {
                    finalName = `image_${i + 1}`;
                }
                
                // 确保finalName不包含路径信息（只保留文件名）
                if (finalName.includes('/')) {
                    finalName = finalName.split('/').pop();
                }
                if (finalName.includes('\\')) {
                    finalName = finalName.split('\\').pop();
                }
                // 处理URL编码的路径分隔符
                if (finalName.includes('%2F')) {
                    finalName = finalName.split('%2F').pop();
                }
                if (finalName.includes('%5C')) {
                    finalName = finalName.split('%5C').pop();
                }
                
                // 生成新的文件名：项目ID/attendance/当前日期/原始名称.后缀
                const fileName = `${recordProjectId}/${folderName}/${dateStr}/${finalName}.${fileExtension}`;
                
                try {
                    // 使用tus-js-client上传图片
                    await this._uploadFileWithTus(supabaseProjectId, session?.access_token, bucketName, fileName, image);
                    
                    // 生成图片URL
                    const encodedFileName = encodeURIComponent(fileName);
                    const imageUrl = `https://${supabaseProjectId}.supabase.co/storage/v1/object/public/${bucketName}/${encodedFileName}`;
                    uploadedUrls.push(imageUrl);
                } catch (uploadError) {
                    console.error('上传过程中发生异常:', uploadError);
                    console.error('异常堆栈:', uploadError.stack);
                    
                    // 上传失败，将图片保存到本地并添加到同步队列

                    const localImageUrl = await this._saveSingleImageToLocal(image, fileName);
                    uploadedUrls.push(localImageUrl);
                    
                    // 添加图片上传任务到同步队列
                    if (window.offlineSyncService) {
                        window.offlineSyncService.addToSyncQueue('upload_image', {
                        fileName: fileName,
                        localPath: localImageUrl,
                        bucketName: bucketName,
                        projectId: supabaseProjectId
                    }, `img_${fileName}_${Date.now()}`, 'image');
                    }
                }
            }
            
            return uploadedUrls;
        } catch (error) {
            console.error('上传图片到Supabase失败:', error);
            console.error('错误堆栈:', error.stack);
            // 发生错误时，将图片保存到本地

            return await this._saveImagesToLocal(images, recordProjectId);
        }
    }
    
    // 保存图片到本地存储
    async _saveImagesToLocal(images, projectId = '', recordDate = '') {
        const localUrls = [];
        let dateStr;
        if (recordDate) {
            // 使用传入的记工日期
            const recordDateObj = new Date(recordDate);
            const year = recordDateObj.getFullYear();
            const month = String(recordDateObj.getMonth() + 1).padStart(2, '0');
            const day = String(recordDateObj.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;
        } else {
            // 兼容处理：如果没有传入日期，使用当前日期
            const currentDate = new Date();
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;
        }
        
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            // 获取文件扩展名
            let fileExtension = 'jpg'; // 默认扩展名
            let imageName = '';
            
            if (image.name) {
                // 提取文件名（如果name包含路径，只取最后一个/后面的部分）
                imageName = image.name;
                // 确保只取文件名，移除可能存在的路径
                if (imageName.includes('/')) {
                    imageName = imageName.split('/').pop();
                }
                if (imageName.includes('\\')) {
                    imageName = imageName.split('\\').pop();
                }
                fileExtension = imageName.split('.').pop();
            } else if (typeof image === 'string') {
                // 如果是字符串URL，从URL中提取扩展名
                const urlParts = image.split('.');
                if (urlParts.length > 1) {
                    fileExtension = urlParts.pop().split('?')[0].split('#')[0];
                }
            }
            // 使用原始图片名称，中文转换为英文
            let originalName = 'image';
            if (imageName) {
                originalName = imageName.replace(`.${fileExtension}`, '');
            } else if (typeof image === 'string') {
                // 如果是字符串URL，从URL中提取文件名
                originalName = image.split('/').pop().split('?')[0].split('#')[0];
                if (originalName.includes('.')) {
                    originalName = originalName.split('.').slice(0, -1).join('.');
                }
            }
            let englishName = this._convertChineseToEnglish(originalName);
            // 确保文件名不为空
            if (!englishName || englishName === '_') {
                englishName = `image_${i + 1}`;
            }
            
            const fileName = `${projectId}/attendance/${dateStr}/${englishName}.${fileExtension}`;
            
            // 保存单个图片到本地
            const localImageUrl = await this._saveSingleImageToLocal(image, fileName);
            localUrls.push(localImageUrl);
            
            // 添加图片上传任务到同步队列
            if (window.offlineSyncService) {
                window.offlineSyncService.addToSyncQueue('upload_image', {
                    fileName: fileName,
                    localPath: localImageUrl,
                    bucketName: 'FYKQ',
                    projectId: 'oydffrzzulsrbitrrhht'
                }, `img_${fileName}_${Date.now()}`, 'image');
            }
        }
        
        return localUrls;
    }
    
    // 保存单个图片到本地存储
    async _saveImageToLocal(image, fileName) {
        return new Promise((resolve, reject) => {
            // 检查是否为File或Blob对象
            if (image instanceof File || image instanceof Blob) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    // 生成唯一ID
                    const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                    
                    // 保存图片数据到localStorage
                    const imageData = {
                        id: imageId,
                        fileName: fileName,
                        dataUrl: e.target.result,
                        originalName: image.name,
                        size: image.size,
                        type: image.type,
                        timestamp: new Date().toISOString()
                    };
                    
                    localStorage.setItem(imageId, JSON.stringify(imageData));
                    
                    // 返回本地URL格式
                    const localUrl = `local://${imageId}`;
                    resolve(localUrl);
                };
                reader.onerror = (error) => {
                    console.error('读取图片失败:', error);
                    reject(error);
                };
                reader.readAsDataURL(image);
            } else {
                // 如果不是File或Blob对象，直接使用_saveSingleImageToLocal处理
                this._saveSingleImageToLocal(image, fileName)
                    .then(resolve)
                    .catch(reject);
            }
        });
    }

    async _saveSingleImageToLocal(image, fileName) {
        return new Promise((resolve, reject) => {
            // 检查是否为File或Blob对象
            if (image instanceof File || image instanceof Blob) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    // 生成唯一ID
                    const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                    
                    // 保存图片数据到localStorage
                    const imageData = {
                        id: imageId,
                        fileName: fileName,
                        dataUrl: e.target.result,
                        originalName: image.name,
                        size: image.size,
                        type: image.type,
                        timestamp: new Date().toISOString()
                    };
                    
                    localStorage.setItem(imageId, JSON.stringify(imageData));
                    
                    // 返回本地URL格式
                    const localUrl = `local://${imageId}`;
                    resolve(localUrl);
                };
                reader.onerror = (error) => {
                    console.error('读取图片失败:', error);
                    reject(error);
                };
                reader.readAsDataURL(image);
            } else if (typeof image === 'string') {
                // 如果是字符串URL，直接保存URL信息
                const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                
                // 保存URL信息到localStorage
                const imageData = {
                    id: imageId,
                    fileName: fileName,
                    url: image,
                    originalName: fileName,
                    size: 0,
                    type: 'image/jpeg',
                    timestamp: new Date().toISOString()
                };
                
                localStorage.setItem(imageId, JSON.stringify(imageData));
                
                // 返回本地URL格式
                const localUrl = `local://${imageId}`;
                resolve(localUrl);
            } else {
                // 其他类型，无法处理
                console.error('无法保存图片到本地，未知类型:', image);
                reject(new Error('Failed to execute \'readAsDataURL\' on \'FileReader\': parameter 1 is not of type \'Blob\'.'));
            }
        });
    }
    
    // 使用tus-js-client上传单个文件
    async _uploadFileWithTus(projectId, accessToken, bucketName, fileName, file) {
        let uploadFile = file;
        
        // 检查文件类型，如果是base64字符串，转换为Blob对象
        if (typeof file === 'string' && file.startsWith('data:image/')) {
            try {
                // 转换base64字符串为Blob
                const response = await fetch(file);
                uploadFile = await response.blob();
            } catch (error) {
                console.error('转换base64图片失败:', error);
                throw new Error('Failed to convert base64 string to Blob');
            }
        } else if (!(file instanceof File || file instanceof Blob)) {
            throw new Error('source object may only be an instance of File, Blob, or Reader in this environment');
        }
        
        return new Promise((resolve, reject) => {
            // 检查tus是否可用
            if (typeof window.tus === 'undefined') {
                console.error('tus-js-client未加载');
                reject(new Error('tus-js-client未加载'));
                return;
            }
            
            // 检查tus.isSupported
            if (!window.tus.isSupported) {
                console.error('当前环境不支持tus-js-client');
                reject(new Error('当前环境不支持tus-js-client'));
                return;
            }
            
            // 创建tus上传实例
            const upload = new window.tus.Upload(uploadFile, {
                // Supabase TUS endpoint (正确的URL格式，不带.storage子域名)
                endpoint: `https://${projectId}.supabase.co/storage/v1/upload/resumable`,
                retryDelays: [0, 3000, 5000, 10000, 20000],
                headers: {
                    // 使用正确的API密钥进行认证
                    authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95ZGZmcnp6dWxzcmJpdHJyaGh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MjcxNDEsImV4cCI6MjA3OTAwMzE0MX0.LFMDgx8eNyE3pVjVYgHqhtvaC--vP4-MtXL8fY3_v-s`,
                    'x-upsert': 'true', // optionally set upsert to true to overwrite existing files
                },
                uploadDataDuringCreation: true,
                removeFingerprintOnSuccess: true, // Important if you want to allow re-uploading the same file
                metadata: {
                    bucketName: bucketName,
                    objectName: fileName,
                    contentType: file.type || 'image/png',
                    cacheControl: '3600',
                    metadata: JSON.stringify({ // custom metadata passed to the user_metadata column
                        yourCustomMetadata: true,
                    }),
                },
                chunkSize: 6 * 1024 * 1024, // NOTE: it must be set to 6MB (for now) do not change it
                onError: function (error) {
                    console.error('Failed because: ' + error);
                    reject(error);
                },
                onProgress: function (bytesUploaded, bytesTotal) {
                    const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
                },
                onSuccess: function () {
                    resolve(upload.url);
                },
            });
            
            // 检查是否有之前的上传可以继续
            upload.findPreviousUploads().then(function (previousUploads) {
                // 如果有之前的上传，选择第一个继续
                if (previousUploads.length) {
                    upload.resumeFromPreviousUpload(previousUploads[0]);
                }
                
                // 开始上传
                upload.start();
            }).catch(function (error) {
                console.error('查找之前的上传失败:', error);
                // 直接开始新的上传
                upload.start();
            });
        });
    }
}

// 创建全局实例
window.workRecordService = new WorkRecordService();