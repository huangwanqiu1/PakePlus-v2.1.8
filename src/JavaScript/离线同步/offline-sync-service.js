/**
 * 离线数据同步服务
 * 处理网络不稳定时的数据同步问题
 */

class OfflineSyncService {
    constructor() {
        this.syncQueueKey = 'sync_queue_' + (localStorage.getItem('loggedInPhone') || 'default');
        this.conflictResolutionKey = 'conflict_resolution_' + (localStorage.getItem('loggedInPhone') || 'default');
        this.syncStatus = {
            isOnline: navigator.onLine,
            isSyncing: false,
            lastSyncTime: null,
            pendingOperations: 0
        };
        
        this.retryTimer = null; // 用于存储重试定时器
        
        this.init();
    }

    /**
     * 初始化服务
     */
    init() {
        // 监听网络状态变化
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // 页面加载时尝试同步未完成的操作（仅一次）
        if (this.syncStatus.isOnline) {
            setTimeout(() => this.processSyncQueue(), 5000);
        }
    }

    /**
     * 处理上线事件
     */
    handleOnline() {
        this.syncStatus.isOnline = true;
        this.updateSyncIndicator();
        
        // 延迟5秒后开始同步，确保网络稳定且避免重复触发
        if (!this.syncStatus.isSyncing) {
            setTimeout(() => {
                if (!this.syncStatus.isSyncing) {
                    // 先检查实时订阅是否成功，然后再同步数据
                    this.checkRealtimeSubscriptionAndSync();
                }
            }, 5000);
        }
    }

    /**
     * 检查实时订阅状态并同步数据
     */
    checkRealtimeSubscriptionAndSync() {
        console.log('🔍 正在检查实时订阅状态...');
        
        // 由于实时订阅是在首页初始化的，其他页面可能无法直接访问realtimeSyncService
        // 因此直接处理同步队列，不再依赖实时订阅状态检查
        this.processSyncQueue();
    }

    /**
     * 处理离线事件
     */
    handleOffline() {
        console.log('📵 网络已断开，进入离线模式...');
        this.syncStatus.isOnline = false;
        this.updateSyncIndicator();
    }

    /**
     * 添加同步操作到队列
     * @param {string} operation - 操作类型: 'add', 'update', 'delete'
     * @param {Object} data - 操作数据
     * @param {string} record_id - 记录ID（员工ID或项目ID）
     * @param {string} dataType - 数据类型: 'employee' 或 'project'
     */
    addToSyncQueue(operation, data, record_id, dataType = 'employee') {
        const queue = this.getSyncQueue();
        const operationData = {
            id: this.generateOperationId(),
            operation: operation,
            record_id: record_id,
            dataType: dataType,
            data: data,
            timestamp: new Date().toISOString(),
            status: 'pending',
            retryCount: 0,
            maxRetries: 3
        };

        queue.push(operationData);
        this.saveSyncQueue(queue);
        
        this.syncStatus.pendingOperations = queue.length;
        this.updateSyncIndicator();
        
        // 添加操作到同步队列的日志已移除
        
        // 不再立即同步，等待网络事件或手动触发
    }

    /**
     * 获取同步队列
     */
    getSyncQueue() {
        try {
            const queue = localStorage.getItem(this.syncQueueKey);
            return queue ? JSON.parse(queue) : [];
        } catch (error) {
            console.error('❌ 获取同步队列失败:', error);
            return [];
        }
    }

    /**
     * 保存同步队列
     */
    saveSyncQueue(queue) {
        try {
            localStorage.setItem(this.syncQueueKey, JSON.stringify(queue));
        } catch (error) {
            console.error('❌ 保存同步队列失败:', error);
        }
    }

    /**
     * 处理同步队列
     */
    async processSyncQueue() {
        if (this.syncStatus.isSyncing || !this.syncStatus.isOnline) {
            return;
        }

        const queue = this.getSyncQueue();
        const pendingOperations = queue.filter(op => op.status === 'pending');
        
        if (pendingOperations.length === 0) {
            return;
        }

        this.syncStatus.isSyncing = true;
        this.syncStatus.pendingOperations = pendingOperations.length;
        this.updateSyncIndicator();
        // 更新同步文件列表
        this.updateSyncFileList();

        // 开始处理同步队列的日志已移除

        const results = {
            success: 0,
            failed: 0,
            conflicts: 0
        };

        // 按数据类型优先级和时间顺序处理操作
        // 图片操作优先，然后是其他操作
        const sortedOperations = pendingOperations.sort((a, b) => {
            // 图片操作优先级最高
            if (a.dataType === 'image' && b.dataType !== 'image') {
                return -1;
            }
            if (a.dataType !== 'image' && b.dataType === 'image') {
                return 1;
            }
            // 相同类型按时间顺序
            return new Date(a.timestamp) - new Date(b.timestamp);
        });

        for (const operation of sortedOperations) {
            try {
                const result = await this.executeOperation(operation);
                
                if (result.success) {
                    operation.status = 'completed';
                    operation.result = result; // 保存操作结果
                    results.success++;
                } else if (result.conflict) {
                    operation.status = 'conflict';
                    operation.result = result; // 保存操作结果
                    results.conflicts++;
                    console.warn(`⚠️ 操作 ${operation.operation} 发生冲突，${operation.dataType}ID: ${operation.record_id}`);
                    
                    // 处理冲突
                    await this.handleConflict(operation, result.conflictData);
                } else {
                    operation.retryCount++;
                    operation.result = result; // 保存操作结果
                    results.failed++;
                    // 操作失败的错误日志已移除
                    
                    // 如果重试次数未达到上限，重新加入队列
                    if (operation.retryCount < operation.maxRetries) {
                        operation.status = 'pending';
                        // 重试日志已移除
                    } else {
                        // 达到最大重试次数，保持pending状态以便网络恢复后重新尝试
                        operation.status = 'pending';
                        // 达到最大重试次数的日志已移除
                    }
                }
                
                // 更新同步文件列表
                this.updateSyncFileList();
            } catch (error) {
                // 执行操作出错的日志已移除
                operation.status = 'failed';
                results.failed++;
                // 更新同步文件列表
                this.updateSyncFileList();
            }
        }

        // 更新队列状态
        this.saveSyncQueue(queue);
        
        this.syncStatus.isSyncing = false;
        this.syncStatus.lastSyncTime = new Date().toISOString();
        this.syncStatus.pendingOperations = queue.filter(op => op.status === 'pending').length;
        this.updateSyncIndicator();

        // 同步完成统计日志已移除
        
        // 显示同步结果通知
        this.showSyncResults(results);
        
        // 如果还有未完成的操作，设置10秒后重试
        if (this.syncStatus.pendingOperations > 0 && this.syncStatus.isOnline) {
            if (this.retryTimer) {
                clearTimeout(this.retryTimer);
            }
            this.retryTimer = setTimeout(() => {
                console.log('⏰ 10秒后重试同步未完成的操作...');
                this.processSyncQueue();
            }, 10000);
        } else if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }

    /**
     * 执行单个操作
     */
    async executeOperation(operation) {
        if (!window.supabase || !window.supabase.from) {
            throw new Error('Supabase客户端不可用');
        }

        const { operation: op, data, record_id, dataType } = operation;

        try {
            switch (dataType) {
                case 'employee':
                    return await this.executeEmployeeOperation(op, record_id, data);
                case 'project':
                    return await this.executeProjectOperation(op, record_id, data);
                case 'attendance':
                    return await this.executeAttendanceOperation(op, record_id, data);
                case 'image':
                    return await this.executeImageOperation(op, record_id, data);
                case 'audit':
                case '考勤审核状态':
                case '借支审核状态':
                    return await this.executeAuditOperation(op, record_id, data);
                case 'record':
                case 'settlement_records':
                case 'project_expense':
                case 'project_income':
                case 'work_record':
                case 'construction_log':
                    return await this.executeRecordOperation(op, record_id, data);
                default:
                    throw new Error(`未知的数据类型: ${dataType}`);
            }
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 执行员工相关操作
     */
    async executeEmployeeOperation(op, record_id, data) {
        switch (op) {
            case 'add':
                return await this.executeAddEmployeeOperation(data);
            case 'update':
                return await this.executeUpdateEmployeeOperation(record_id, data);
            case 'delete':
                return await this.executeDeleteEmployeeOperation(record_id);
            default:
                throw new Error(`未知的操作类型: ${op}`);
        }
    }

    /**
     * 执行项目相关操作
     */
    async executeProjectOperation(op, record_id, data) {
        switch (op) {
            case 'add':
                return await this.executeAddProjectOperation(data);
            case 'update':
                return await this.executeUpdateProjectOperation(record_id, data);
            case 'delete':
                return await this.executeDeleteProjectOperation(record_id);
            case 'delete_full':
            case '删除项目关联数据':
                return await this.executeDeleteProjectFullOperation(record_id);
            default:
                throw new Error(`未知的操作类型: ${op}`);
        }
    }

    /**
     * 执行考勤记录相关操作
     */
    async executeAttendanceOperation(op, record_id, data) {
        switch (op) {
            case 'add':
                return await this.executeAddAttendanceOperation(data);
            case 'update':
                return await this.executeUpdateAttendanceOperation(record_id, data);
            case 'delete':
                return await this.executeDeleteAttendanceOperation(record_id, data);
            default:
                throw new Error(`未知的操作类型: ${op}`);
        }
    }

    /**
     * 执行图片相关操作
     */
    async executeImageOperation(op, record_id, data) {
        switch (op) {
            case 'upload_image':
                return await this.executeUploadImageOperation(record_id, data);
            case 'delete_image':
            case '删除_图片':
                return await this.executeDeleteImageOperation(record_id, data);
            default:
                throw new Error(`未知的操作类型: ${op}`);
        }
    }

    /**
     * 执行上传图片操作
     */
    async executeUploadImageOperation(record_id, data) {
        try {
            // 从本地存储获取图片数据
            const imageId = data.localPath.replace('local://', '');
            const imageDataJson = localStorage.getItem(imageId);
            
            if (!imageDataJson) {
                return {
                    success: false,
                    error: '找不到本地图片数据'
                };
            }
            
            const imageData = JSON.parse(imageDataJson);
            
            let file;
            
            // 检查是dataURL还是普通URL
            if (imageData.dataUrl) {
                // 将dataURL转换为Blob
                const base64Data = imageData.dataUrl.split(',')[1];
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: imageData.type });
                
                // 创建File对象
                file = new File([blob], imageData.originalName, { type: imageData.type });
            } else if (imageData.url) {
                // 如果是普通URL，尝试从URL获取图片数据
                try {
                    // 从URL获取图片数据
                    const response = await fetch(imageData.url);
                    if (!response.ok) {
                        throw new Error(`从URL获取图片失败: ${response.statusText}`);
                    }
                    
                    // 将响应转换为Blob
                    const blob = await response.blob();
                    
                    // 创建File对象
                    file = new File([blob], imageData.originalName, { type: blob.type });
                } catch (fetchError) {
                    console.error('从URL获取图片数据失败:', fetchError);
                    throw new Error(`无法从URL创建文件用于上传: ${fetchError.message}`);
                }
            } else {
                // 其他情况，无法处理
                throw new Error('无效的图片数据格式');
            }
            
            // 等待Supabase客户端初始化完成
            const supabase = await window.waitForSupabase();
            
            // 获取会话信息
            const { data: { session } } = await supabase.auth.getSession();
            
            // 构建与在线时一致的完整路径
            // 清理路径，确保不包含重复部分
            let fullPath = data.fileName;
            
            // 确保fullPath是解码后的，因为data.fileName可能被编码过（导致Invalid key错误）
            if (fullPath.includes('%2F') || fullPath.includes('%2f')) {
                try {
                    fullPath = decodeURIComponent(fullPath);
                } catch (e) {
                    console.warn('文件名解码失败:', e);
                }
            }
            
            // 清理重复的路径部分
            const pathParts = fullPath.split('/');
            if (pathParts.length > 4) {
                // 路径格式应该是：projectId/attendance/dateStr/filename
                // 如果超过4个部分，说明有重复，需要清理
                // 保留前3部分（projectId, attendance, dateStr）和最后一部分（文件名）
                const projectId = pathParts[0];
                const folderName = pathParts[1];
                const dateStr = pathParts[2];
                const fileName = pathParts[pathParts.length - 1];
                fullPath = `${projectId}/${folderName}/${dateStr}/${fileName}`;
            }

            // 确保file.name不包含路径，只包含文件名
            // 防止tus-js-client将包含路径的文件名作为filename元数据发送，导致后端路径解析错误
            if (file && file.name && (file.name.includes('/') || file.name.includes('\\'))) {
                const cleanFileName = file.name.split('/').pop().split('\\').pop();
                // 重新创建File对象以修改name属性（File.name是只读的）
                const blob = file.slice(0, file.size, file.type);
                file = new File([blob], cleanFileName, { type: file.type });
            }

            // 使用tus-js-client上传图片，使用完整路径作为objectName，与在线时一致
            await this.uploadImageWithTus(data.projectId, session?.access_token, data.bucketName, fullPath, file);
            
            // 获取正确的Supabase URL
            let supabaseUrl = 'https://oydffrzzulsrbitrrhht.supabase.co';
            if (window.supabase && window.supabase.supabaseUrl) {
                supabaseUrl = window.supabase.supabaseUrl;
            } else if (window.supabase && window.supabase.rest) {
                supabaseUrl = window.supabase.rest.url.replace('/rest/v1', '');
            }
            
            // 生成图片URL，使用正确的路径，不包含重复的路径信息
            // 路径格式：${recordProjectId}/${folderName}/${dateStr}/${fileNamePart}
            const encodedFullPath = encodeURIComponent(fullPath);
            const imageUrl = `${supabaseUrl}/storage/v1/object/public/${data.bucketName}/${encodedFullPath}`;
            
            // 更新所有使用此本地图片的记录
            await this.updateRecordsWithImageUrl(data.localPath, imageUrl);
            
            // 更新本地图片数据，添加云端URL
            imageData.cloudUrl = imageUrl;
            imageData.uploaded = true; // 标记为已上传
            localStorage.setItem(imageId, JSON.stringify(imageData));
            
            // 不立即删除本地图片数据，以便在同步记工记录时能够找到云端URL
            // 图片数据将在记工记录同步成功后由清理过程删除
            
            return {
                success: true,
                imageUrl: imageUrl
            };
        } catch (error) {
            console.error('上传图片失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * 执行删除图片操作
     */
    async executeDeleteImageOperation(record_id, data) {
        try {
            // 等待Supabase客户端初始化完成
            const supabase = await window.waitForSupabase();
            
            // 使用正确的参数名称：支持驼峰和下划线两种命名方式
            const bucketName = data.bucketName || data.bucket_name;
            const filePath = data.filePath || data.file_path;
            
            if (!bucketName || !filePath) {
                return {
                    success: false,
                    error: '缺少必需的存储桶名称或文件路径'
                };
            }
            
            // 解码文件路径，将%2F转换为实际的/字符
            const decodedFilePath = decodeURIComponent(filePath);
            
            // 使用Supabase API删除图片
            const { error } = await supabase.storage
                .from(bucketName)
                .remove([decodedFilePath]);
            
            if (error) {
                console.error('删除图片失败:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
            
            return {
                success: true
            };
        } catch (error) {
            console.error('删除图片失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 执行审核操作
     */
    async executeAuditOperation(op, record_id, data) {
        switch (op) {
            case 'update_audit':
                return await this.executeUpdateAuditOperation(record_id, data);
            default:
                throw new Error(`未知的操作类型: ${op}`);
        }
    }

    /**
     * 执行更新审核状态操作
     */
    async executeUpdateAuditOperation(record_id, data) {
        try {
            // 等待Supabase客户端初始化完成
            const supabase = await window.waitForSupabase();
            
            // 更新Supabase中的审核状态
            // 获取北京时间（UTC+8）
            const now = new Date();
            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
            
            let tableName;
            let idField;
            let idValue;
            let localKey;
            
            // 根据数据类型或表名确定要操作的表
            if (data.table === 'settlement_records' || data.dataType === 'settlement_records') {
                tableName = 'settlement_records';
                idField = 'settlement_id';
                idValue = data.settlement_id || record_id;
            } else {
                tableName = 'attendance_records';
                idField = 'record_id';
                idValue = data.record_id || record_id;
            }
            
            const { error } = await supabase
                .from(tableName)
                .update({ 
                    audit_status: data.audit_status,
                    updated_at: beijingTime.toISOString()
                })
                .eq(idField, idValue);
                
            if (error) {
                console.error('更新审核状态失败:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
            
            // 更新本地记录状态
            if (tableName === 'settlement_records') {
                // 更新所有可能的本地缓存
                const cacheSources = ['settlement_records_cache', 'settlementRecords', 'offline_settlement_records'];
                cacheSources.forEach(source => {
                    try {
                        const storedRecords = localStorage.getItem(source);
                        if (storedRecords) {
                            const parsedRecords = JSON.parse(storedRecords);
                            let updatedRecords = null;
                            
                            if (Array.isArray(parsedRecords)) {
                                // 数组格式：直接更新对应记录
                                updatedRecords = parsedRecords.map(record => {
                                    if (record && record.settlement_id === idValue) {
                                        return { ...record, audit_status: data.audit_status };
                                    }
                                    return record;
                                });
                            } else if (typeof parsedRecords === 'object' && parsedRecords !== null) {
                                // 对象格式：可能按日期分组，遍历所有日期
                                updatedRecords = {};
                                for (const date in parsedRecords) {
                                    if (parsedRecords.hasOwnProperty(date)) {
                                        const dateRecords = parsedRecords[date];
                                        if (Array.isArray(dateRecords)) {
                                            updatedRecords[date] = dateRecords.map(record => {
                                                if (record && record.settlement_id === idValue) {
                                                    return { ...record, audit_status: data.audit_status };
                                                }
                                                return record;
                                            });
                                        } else {
                                            updatedRecords[date] = dateRecords;
                                        }
                                    }
                                }
                            }
                            
                            // 保存更新后的记录
                            if (updatedRecords !== null) {
                                localStorage.setItem(source, JSON.stringify(updatedRecords));
                            }
                        }
                    } catch (error) {
                        console.error(`更新本地缓存${source}中的审核状态失败:`, error);
                    }
                });
            } else {
                // 考勤记录的本地更新
                localKey = `attendance_data_${idValue}`;
                const recordData = JSON.parse(localStorage.getItem(localKey) || '{}');
                
                if (recordData) {
                    recordData.audit_status = data.audit_status;
                    localStorage.setItem(localKey, JSON.stringify(recordData));
                }
            }
            
            return {
                success: true
            };
        } catch (error) {
            console.error('执行更新审核状态操作失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 执行通用记录操作
     */
    async executeRecordOperation(op, record_id, data) {
        try {
            switch (op) {
                case 'save_record':
                    return await this.executeSaveRecordOperation(record_id, data);
                case 'update':
                    return await this.executeUpdateRecordOperation(record_id, data);
                case 'delete':
                    return await this.executeDeleteRecordOperation(record_id, data);
                case 'update_audit':
                    return await this.executeUpdateAuditOperation(record_id, data);
                default:
                    throw new Error(`未知的操作类型: ${op}`);
            }
        } catch (error) {
            console.error('执行记录操作失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * 执行更新记录操作
     */
    async executeUpdateRecordOperation(record_id, data) {
        try {
            const { table, ...recordData } = data;
            
            if (!table) {
                return {
                    success: false,
                    error: '缺少必需的表名'
                };
            }
            
            // 统一处理image_ids和images字段
            let imageIds = recordData.image_ids || recordData.images || [];
            
            // 检查并处理图片URL
            if (imageIds && Array.isArray(imageIds)) {
                const updatedImageIds = [];
                for (const imageUrl of imageIds) {
                    if (imageUrl && imageUrl.startsWith('local://')) {
                        // 查找对应的云端URL
                        let cloudUrl = await this.findCloudUrlForLocalImage(imageUrl);
                        if (cloudUrl) {
                            updatedImageIds.push(cloudUrl);
                        } else {
                            // 如果找不到云端URL，暂时保留本地URL
                            updatedImageIds.push(imageUrl);
                        }
                    } else {
                        updatedImageIds.push(imageUrl);
                    }
                }
                recordData.image_ids = updatedImageIds;
            }
            
            // 转换字段名，确保与数据库实际字段名一致
            let convertedData = {};
            
            // 使用北京时间
            const now = new Date();
            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
            
            if (table === 'project_expenses') {
                // 转换项目支出字段名
                convertedData = {
                    project_id: recordData.project_id,
                    record_date: recordData.record_date,
                    payer: recordData.payment,
                    amount: parseFloat(recordData.amount),
                    detail_description: recordData.description || '',
                    remark: recordData.remark || '',
                    image_ids: recordData.image_ids || [],
                    updated_at: beijingTime.toISOString()
                };
            } else if (table === 'project_income') {
                // 转换项目收入字段名
                convertedData = {
                    project_id: recordData.project_id,
                    record_date: recordData.record_date,
                    amount: parseFloat(recordData.amount),
                    detail_description: recordData.description || '',
                    remark: recordData.remark || '',
                    image_ids: recordData.image_ids || [],
                    updated_at: beijingTime.toISOString()
                };
            } else if (table === 'work_records') {
                // 转换点工单字段名
                convertedData = {
                    project_id: recordData.project_id,
                    record_date: recordData.record_date,
                    team_name: recordData.team_name,
                    team_leader: recordData.team_leader,
                    work_days: parseFloat(recordData.work_days),
                    worker_type: recordData.worker_type || '普工',
                    unit_price: parseFloat(recordData.unit_price) || 0,
                    amount: parseFloat(recordData.amount) || 0,
                    description: recordData.description,
                    image_ids: recordData.image_ids || [],
                    updated_at: beijingTime.toISOString()
                };
            } else if (table === 'construction_logs') {
                // 转换施工日志字段名
                convertedData = {
                    project_id: recordData.project_id,
                    user_id: recordData.user_id,
                    record_date: recordData.record_date,
                    weather_info: recordData.weather_info,
                    log_content: recordData.log_content,
                    image_ids: recordData.image_ids || [],
                    updated_at: beijingTime.toISOString()
                };
            } else {
                // 其他表直接使用原始数据
                convertedData = recordData;
            }
            
            // 等待Supabase客户端初始化完成
            const supabase = await window.waitForSupabase();
            
            // 准备更新条件
            let updateConditions = {};
            
            // 根据表类型确定更新条件
            if (table === 'project_expenses') {
                // 项目支出记录：使用expense_id作为更新条件
                if (!data.expense_id) {
                    return {
                        success: false,
                        error: '缺少必需的expense_id'
                    };
                }
                updateConditions = { expense_id: data.expense_id };
            } else if (table === 'project_income') {
                // 项目收入记录：使用income_id作为更新条件
                if (!data.income_id) {
                    return {
                        success: false,
                        error: '缺少必需的income_id'
                    };
                }
                updateConditions = { income_id: data.income_id };
            } else if (table === 'work_records') {
                // 点工单记录：使用work_record_id作为更新条件
                if (!data.work_record_id) {
                    return {
                        success: false,
                        error: '缺少必需的work_record_id'
                    };
                }
                updateConditions = { work_record_id: data.work_record_id };
            } else if (table === 'construction_logs') {
                // 施工日志记录：使用log_id作为更新条件
                if (!data.log_id) {
                    return {
                        success: false,
                        error: '缺少必需的log_id'
                    };
                }
                updateConditions = { log_id: data.log_id };
            } else {
                // 结算借支记录：使用原有条件
                if (!data.settlement_id || !data.employee_id || !data.record_date) {
                    return {
                        success: false,
                        error: '缺少必需的更新条件'
                    };
                }
                updateConditions = { 
                    settlement_id: data.settlement_id,
                    employee_id: data.employee_id,
                    record_date: data.record_date
                };
            }
            
            // 更新记录
            const { error } = await supabase
                .from(table)
                .update(convertedData)
                .match(updateConditions);
            
            if (error) {
                console.error(`更新${table}记录失败:`, error);
                return {
                    success: false,
                    error: error.message
                };
            }
            
            // 处理work_records表的图片删除
            if (table === 'work_records' && data.images_to_delete && data.images_to_delete.length > 0) {
                try {
                    const filePaths = data.images_to_delete.map(url => {
                        const urlParts = url.split('/FYKQ/');
                        if (urlParts.length > 1) {
                            return decodeURIComponent(urlParts[1]);
                        }
                        // 如果已经是路径（不包含http/https），则直接使用
                        if (url && typeof url === 'string' && !url.startsWith('http')) {
                            return url;
                        }
                        return null;
                    }).filter(path => path !== null);

                    if (filePaths.length > 0) {
                        const { error: deleteImageError } = await supabase
                            .storage
                            .from('FYKQ')
                            .remove(filePaths);

                        if (deleteImageError) {
                            console.error('删除旧图片失败:', deleteImageError);
                        } else {
                            console.log('成功删除旧图片:', filePaths.length);
                        }
                    }
                } catch (imageError) {
                    console.error('处理图片删除时出错:', imageError);
                }
            }
            
            // 处理construction_logs表的图片删除
            if (table === 'construction_logs' && data.images_to_delete && data.images_to_delete.length > 0) {
                try {
                    const filePaths = data.images_to_delete.map(url => {
                        const urlParts = url.split('/FYKQ/');
                        if (urlParts.length > 1) {
                            return decodeURIComponent(urlParts[1]);
                        }
                        // 如果已经是路径（不包含http/https），则直接使用
                        if (url && typeof url === 'string' && !url.startsWith('http')) {
                            return url;
                        }
                        return null;
                    }).filter(path => path !== null);

                    if (filePaths.length > 0) {
                        const { error: deleteImageError } = await supabase
                            .storage
                            .from('FYKQ')
                            .remove(filePaths);

                        if (deleteImageError) {
                            console.error('删除旧图片失败:', deleteImageError);
                        } else {
                            console.log('成功删除旧图片:', filePaths.length);
                        }
                    }
                } catch (imageError) {
                    console.error('处理图片删除时出错:', imageError);
                }
            }
            
            // 更新成功后，清理本地记录
            console.log(`✅ ${table}记录更新成功，开始清理本地记录`);
            if (table === 'settlement_records') {
                await this.removeSettlementRecordFromLocalStorage(record_id, data);
            } else if (table === 'project_expenses') {
                await this.removeExpenseRecordFromLocalStorage(record_id, data);
            } else if (table === 'project_income') {
                await this.removeIncomeRecordFromLocalStorage(record_id, data);
            } else if (table === 'work_records') {
                await this.removeWorkRecordFromLocalStorage(record_id, data);
            } else if (table === 'construction_logs') {
                await this.removeConstructionLogFromLocalStorage(record_id, data);
            }
            
            return { success: true };
        } catch (error) {
            console.error('更新记录失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * 执行删除记录操作
     */
    async executeDeleteRecordOperation(record_id, data) {
        try {
            const { table } = data;
            
            if (!table) {
                return {
                    success: false,
                    error: '缺少必需的表名'
                };
            }
            
            // 等待Supabase客户端初始化完成
            const supabase = await window.waitForSupabase();
            
            let error;
            
            // 根据不同的表类型使用不同的删除条件
            if (table === 'project_expenses') {
                // 项目支出记录：使用expense_id作为删除条件
                const { expense_id } = data;
                if (!expense_id) {
                    return {
                        success: false,
                        error: '缺少必需的expense_id'
                    };
                }
                
                ({ error } = await supabase
                    .from(table)
                    .delete()
                    .eq('expense_id', expense_id));
            } else if (table === 'project_income') {
                // 项目收入记录：使用income_id作为删除条件
                const { income_id } = data;
                if (!income_id) {
                    return {
                        success: false,
                        error: '缺少必需的income_id'
                    };
                }
                
                ({ error } = await supabase
                    .from(table)
                    .delete()
                    .eq('income_id', income_id));
            } else if (table === 'work_records') {
                // 点工单记录：使用work_record_id作为删除条件
                const { work_record_id, image_ids } = data;
                
                if (!work_record_id) {
                    return {
                        success: false,
                        error: '缺少必需的work_record_id'
                    };
                }
                
                // 删除关联的图片
                if (image_ids && image_ids.length > 0) {
                    try {
                        const filePaths = image_ids.map(url => {
                            const urlParts = url.split('/FYKQ/');
                            if (urlParts.length > 1) {
                                return decodeURIComponent(urlParts[1]);
                            }
                            return null;
                        }).filter(path => path !== null);

                        if (filePaths.length > 0) {
                            const { error: deleteImageError } = await supabase
                                .storage
                                .from('FYKQ')
                                .remove(filePaths);

                            if (deleteImageError) {
                                console.error('删除关联图片失败:', deleteImageError);
                            } else {
                                console.log('成功删除关联图片:', filePaths.length);
                            }
                        }
                    } catch (imageError) {
                        console.error('处理图片删除时出错:', imageError);
                    }
                }
                
                ({ error } = await supabase
                    .from(table)
                    .delete()
                    .eq('work_record_id', work_record_id));
            } else if (table === 'construction_logs') {
                // 施工日志记录：使用log_id作为删除条件
                const { log_id, image_ids } = data;
                
                if (!log_id) {
                    return {
                        success: false,
                        error: '缺少必需的log_id'
                    };
                }
                
                // 删除关联的图片
                if (image_ids && image_ids.length > 0) {
                    try {
                        const filePaths = image_ids.map(url => {
                            const urlParts = url.split('/FYKQ/');
                            if (urlParts.length > 1) {
                                return decodeURIComponent(urlParts[1]);
                            }
                            return null;
                        }).filter(path => path !== null);

                        if (filePaths.length > 0) {
                            const { error: deleteImageError } = await supabase
                                .storage
                                .from('FYKQ')
                                .remove(filePaths);

                            if (deleteImageError) {
                                console.error('删除关联图片失败:', deleteImageError);
                            } else {
                                console.log('成功删除关联图片:', filePaths.length);
                            }
                        }
                    } catch (imageError) {
                        console.error('处理图片删除时出错:', imageError);
                    }
                }
                
                ({ error } = await supabase
                    .from(table)
                    .delete()
                    .eq('log_id', log_id));
            } else {
                // 结算借支记录：使用原有的删除条件
                const { settlement_id, employee_id, record_date } = data;
                
                if (!settlement_id || !employee_id || !record_date) {
                    return {
                        success: false,
                        error: '缺少必需的删除条件'
                    };
                }
                
                ({ error } = await supabase
                    .from(table)
                    .delete()
                    .eq('settlement_id', settlement_id)
                    .eq('employee_id', employee_id)
                    .eq('record_date', record_date));
            }
            
            if (error) {
                console.error(`删除${table}记录失败:`, error);
                return {
                    success: false,
                    error: error.message
                };
            }
            
            // 删除成功后，清理本地记录
            if (table === 'settlement_records') {
                await this.removeSettlementRecordFromLocalStorage(record_id, data);
            } else if (table === 'project_expenses') {
                await this.removeExpenseRecordFromLocalStorage(record_id, data);
            } else if (table === 'project_income') {
                await this.removeIncomeRecordFromLocalStorage(record_id, data);
            } else if (table === 'work_records') {
                await this.removeWorkRecordFromLocalStorage(record_id, data);
            } else if (table === 'construction_logs') {
                await this.removeConstructionLogFromLocalStorage(record_id, data);
            }
            
            return { success: true };
        } catch (error) {
            console.error('删除记录失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 执行保存记录操作
     */
    async executeSaveRecordOperation(record_id, data) {
        try {
            // 从数据中获取表名和记录数据
            const { table, record } = data;
            
            if (!table || !record) {
                return {
                    success: false,
                    error: '缺少必需的表名或记录数据'
                };
            }
            
            // 处理settlement_records表：尝试从localStorage中获取最新的记录数据
            let latestRecord = record;
            if (table === 'settlement_records') {
                // 遍历localStorage，查找最新的记录
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (key === 'settlement_records_cache' || key === 'settlementRecords' || key === 'offline_settlement_records')) {
                        const recordJson = localStorage.getItem(key);
                        if (recordJson) {
                            try {
                                const parsedData = JSON.parse(recordJson);
                                if (Array.isArray(parsedData)) {
                                    // 数组类型：使用settlement_id查找记录
                                    const foundRecord = parsedData.find(r => r.settlement_id === record_id);
                                    if (foundRecord) {
                                        latestRecord = foundRecord;
                                        break;
                                    }
                                } else if (typeof parsedData === 'object' && parsedData !== null) {
                                    // 对象类型：可能按日期分组，遍历所有日期
                                    for (const date in parsedData) {
                                        if (parsedData.hasOwnProperty(date)) {
                                            const dateRecords = parsedData[date];
                                            if (Array.isArray(dateRecords)) {
                                                const foundRecord = dateRecords.find(r => r.settlement_id === record_id);
                                                if (foundRecord) {
                                                    latestRecord = foundRecord;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                            } catch (parseError) {
                                console.error('解析localStorage记录失败:', parseError);
                            }
                        }
                    }
                }
            } else if (table === 'work_records') {
                // 遍历localStorage，查找最新的点工单记录
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key === 'work_records') {
                        const recordJson = localStorage.getItem(key);
                        if (recordJson) {
                            try {
                                const parsedData = JSON.parse(recordJson);
                                if (Array.isArray(parsedData)) {
                                    // 数组类型：使用work_record_id查找记录
                                    const foundRecord = parsedData.find(r => r.work_record_id === record_id);
                                    if (foundRecord) {
                                        latestRecord = foundRecord;
                                        break;
                                    }
                                }
                            } catch (parseError) {
                                console.error('解析localStorage记录失败:', parseError);
                            }
                        }
                    }
                }
            } else if (table === 'construction_logs') {
                // 遍历localStorage，查找最新的施工日志记录
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key === 'construction_logs') {
                        const recordJson = localStorage.getItem(key);
                        if (recordJson) {
                            try {
                                const parsedData = JSON.parse(recordJson);
                                if (Array.isArray(parsedData)) {
                                    // 数组类型：使用log_id查找记录
                                    const foundRecord = parsedData.find(r => r.log_id === record_id);
                                    if (foundRecord) {
                                        latestRecord = foundRecord;
                                        break;
                                    }
                                }
                            } catch (parseError) {
                                console.error('解析localStorage记录失败:', parseError);
                            }
                        }
                    }
                }
            }
            
            // 移除本地存储特有的字段，根据表类型处理不同的ID字段
            let insertData;
            if (table === 'settlement_records') {
                // 对于结算借支记录，移除is_local字段，但保留settlement_id字段
                const { is_local, ...settlementData } = latestRecord;
                insertData = settlementData;
            } else if (table === 'work_records') {
                // 对于点工单记录，移除is_local字段
                const { is_local, ...workRecordData } = latestRecord;
                insertData = workRecordData;
            } else if (table === 'construction_logs') {
                // 对于施工日志记录，移除is_local字段
                const { is_local, created_at, updated_at, ...constructionLogData } = latestRecord;
                // 重新生成时间戳，确保与在线模式一致
                const now = new Date();
                const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
                constructionLogData.updated_at = beijingTime.toISOString();
                insertData = constructionLogData;
            } else {
                // 对于其他记录，移除record_id和is_local字段
                const { record_id: localRecordId, is_local, ...otherData } = latestRecord;
                insertData = otherData;
            }
            
            // 移除已删除的数据库字段
            delete insertData.has_image;
            delete insertData.image_count;
            delete insertData.old_images;
            delete insertData.images_to_delete;
            
            // 处理settlement_records表的settlement_id：如果是本地生成的格式，移除它让Supabase自动生成UUID
            if (table === 'settlement_records' && insertData.settlement_id && insertData.settlement_id.startsWith('local_')) {
                delete insertData.settlement_id;
            }
            
            // 处理project_expenses表的expense_id：如果是本地生成的格式，移除它让Supabase自动生成UUID
            if (table === 'project_expenses' && insertData.expense_id && insertData.expense_id.startsWith('local_')) {
                delete insertData.expense_id;
            }
            
            // 处理project_income表的income_id：如果是本地生成的格式，移除它让Supabase自动生成UUID
            if (table === 'project_income' && insertData.income_id && insertData.income_id.startsWith('local_')) {
                delete insertData.income_id;
            }
            
            // 处理work_records表的work_record_id：如果是本地生成的格式，移除它让Supabase自动生成UUID
            if (table === 'work_records' && insertData.work_record_id && insertData.work_record_id.startsWith('local_')) {
                delete insertData.work_record_id;
            }
            
            // 处理construction_logs表的log_id：如果是本地生成的格式，移除它让Supabase自动生成UUID
            if (table === 'construction_logs' && insertData.log_id && insertData.log_id.startsWith('local_')) {
                delete insertData.log_id;
            }
            
            // 统一处理image_ids和images字段
            let imageIds = insertData.image_ids || insertData.images || [];
            
            // 检查并处理图片URL
            if (imageIds && Array.isArray(imageIds)) {
                const updatedImageIds = [];
                for (const imageUrl of imageIds) {
                    if (imageUrl && imageUrl.startsWith('local://')) {
                        // 查找对应的云端URL
                        let cloudUrl = await this.findCloudUrlForLocalImage(imageUrl);
                        if (cloudUrl) {
                            updatedImageIds.push(cloudUrl);
                        } else {
                            // 如果找不到云端URL，尝试从localStorage中查找最新的记录，获取可能已更新的image_ids
                            console.log('找不到云端URL，尝试从localStorage中查找最新的记录');
                            // 遍历localStorage，查找包含此本地URL的最新记录
                            let foundUpdatedRecord = false;
                            for (let i = 0; i < localStorage.length; i++) {
                                const key = localStorage.key(i);
                                if (key && (key === 'settlement_records_cache' || key === 'settlementRecords' || key === 'offline_settlement_records' || key === 'work_records')) {
                                    const recordJson = localStorage.getItem(key);
                                    if (recordJson) {
                                        try {
                                            const parsedData = JSON.parse(recordJson);
                                            if (Array.isArray(parsedData)) {
                                                // 数组类型
                                                for (const record of parsedData) {
                                                    if (record.image_ids && Array.isArray(record.image_ids) && record.image_ids.includes(imageUrl)) {
                                                        // 找到包含此本地URL的记录，更新cloudUrl
                                                        for (const imgUrl of record.image_ids) {
                                                            if (imgUrl !== imageUrl && !imgUrl.startsWith('local://')) {
                                                                cloudUrl = imgUrl;
                                                                foundUpdatedRecord = true;
                                                                break;
                                                            }
                                                        }
                                                        if (foundUpdatedRecord) break;
                                                    }
                                                }
                                            } else if (typeof parsedData === 'object' && parsedData !== null) {
                                                // 对象类型：可能按日期分组，遍历所有日期
                                                for (const date in parsedData) {
                                                    if (parsedData.hasOwnProperty(date)) {
                                                        const dateRecords = parsedData[date];
                                                        if (Array.isArray(dateRecords)) {
                                                            for (const record of dateRecords) {
                                                                if (record.image_ids && Array.isArray(record.image_ids) && record.image_ids.includes(imageUrl)) {
                                                                    // 找到包含此本地URL的记录，更新cloudUrl
                                                                    for (const imgUrl of record.image_ids) {
                                                                        if (imgUrl !== imageUrl && !imgUrl.startsWith('local://')) {
                                                                            cloudUrl = imgUrl;
                                                                            foundUpdatedRecord = true;
                                                                            break;
                                                                        }
                                                                    }
                                                                    if (foundUpdatedRecord) break;
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        } catch (parseError) {
                                            console.error('解析localStorage记录失败:', parseError);
                                        }
                                    }
                                }
                                if (foundUpdatedRecord) break;
                            }
                            
                            if (cloudUrl) {
                                updatedImageIds.push(cloudUrl);
                            } else {
                                // 如果还是找不到云端URL，暂时保留本地URL
                                updatedImageIds.push(imageUrl);
                            }
                        }
                    } else {
                        updatedImageIds.push(imageUrl);
                    }
                }
                insertData.image_ids = updatedImageIds;
            }
            
            // 确保必需字段存在（根据表类型检查不同的必需字段）
            if (!insertData.project_id) {
                return {
                    success: false,
                    error: '缺少必需字段: project_id'
                };
            }
            if (!insertData.record_date) {
                return {
                    success: false,
                    error: '缺少必需字段: record_date'
                };
            }
            // 对于施工日志记录，检查user_id和log_content字段
            if (table === 'construction_logs') {
                if (!insertData.user_id) {
                    return {
                        success: false,
                        error: '缺少必需字段: user_id'
                    };
                }
                if (!insertData.log_content) {
                    return {
                        success: false,
                        error: '缺少必需字段: log_content'
                    };
                }
            }
            // 对于结算借支记录，检查employee_id
            if (table === 'settlement_records' && !insertData.employee_id) {
                return {
                    success: false,
                    error: '缺少必需字段: employee_id'
                };
            }
            // 对于项目支出记录，检查payer字段
            if (table === 'project_expenses' && !insertData.payer) {
                return {
                    success: false,
                    error: '缺少必需字段: payer'
                };
            }
            // 对于点工单记录，检查team_name和team_leader字段
            if (table === 'work_records' && !insertData.team_name) {
                return {
                    success: false,
                    error: '缺少必需字段: team_name'
                };
            }
            if (table === 'work_records' && !insertData.team_leader) {
                return {
                    success: false,
                    error: '缺少必需字段: team_leader'
                };
            }
            if (table === 'work_records' && !insertData.work_days) {
                return {
                    success: false,
                    error: '缺少必需字段: work_days'
                };
            }
            if (table === 'work_records' && !insertData.description) {
                return {
                    success: false,
                    error: '缺少必需字段: description'
                };
            }
            
            // 确保数据格式正确
            try {
                JSON.stringify(insertData);
            } catch (jsonError) {
                return {
                    success: false,
                    error: '数据序列化失败: ' + jsonError.message
                };
            }
            
            // 向指定表插入数据（使用select获取返回的记录，与在线模式保持一致）
            const { data: result, error } = await window.supabase
                .from(table)
                .insert([insertData])
                .select();

            if (error) {
                console.error(`添加${table}记录失败:`, error);
                return {
                    success: false,
                    error: error.message
                };
            }
            
            // 插入成功后，清理本地记录（使用本地record_id）
            
            
            // 根据表类型确定本地存储键和删除条件
            if (table === 'settlement_records') {
                await this.removeSettlementRecordFromLocalStorage(record_id, latestRecord);
            } else if (table === 'project_expenses') {
                await this.removeExpenseRecordFromLocalStorage(record_id, latestRecord);
            } else if (table === 'project_income') {
                await this.removeIncomeRecordFromLocalStorage(record_id, latestRecord);
            } else if (table === 'work_records') {
                await this.removeWorkRecordFromLocalStorage(record_id, latestRecord);
            } else if (table === 'construction_logs') {
                await this.removeConstructionLogFromLocalStorage(record_id, latestRecord);
            }
            
            // 清理已上传的图片数据
            if (latestRecord.image_ids && Array.isArray(latestRecord.image_ids)) {
                await this.cleanupUploadedImages(latestRecord);
            }
            
            return { success: true };
        } catch (error) {
            console.error('执行保存记录操作失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 使用tus-js-client上传图片
     */
    async uploadImageWithTus(projectId, accessToken, bucketName, fileName, file) {
        return new Promise(async (resolve, reject) => {
            // 检查tus是否可用
            if (typeof window.tus === 'undefined') {
                reject(new Error('tus-js-client未加载'));
                return;
            }
            
            // 检查tus.isSupported
            if (!window.tus.isSupported) {
                reject(new Error('当前环境不支持tus-js-client'));
                return;
            }
            
            // 获取正确的Supabase URL
            let supabaseUrl = 'https://oydffrzzulsrbitrrhht.supabase.co';
            
            // 尝试从window.supabase获取URL
            if (window.supabase && window.supabase.supabaseUrl) {
                supabaseUrl = window.supabase.supabaseUrl;
            } else if (window.supabase && window.supabase.rest) {
                supabaseUrl = window.supabase.rest.url.replace('/rest/v1', '');
            }
            
            // 创建tus上传实例
            const upload = new window.tus.Upload(file, {
                endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
                retryDelays: [0, 3000, 5000, 10000, 20000],
                headers: {
                    authorization: `Bearer ${accessToken}`,
                    'x-upsert': 'true',
                },
                uploadDataDuringCreation: true,
                removeFingerprintOnSuccess: true,
                metadata: {
                    bucketName: bucketName,
                    objectName: fileName,
                    contentType: file.type || 'image/png',
                    cacheControl: '3600',
                },
                chunkSize: 6 * 1024 * 1024,
                onError: function (error) {
                    console.error('图片上传失败:', error);
                    reject(error);
                },
                onSuccess: function () {
                    resolve();
                },
            });
            
            // 检查是否有之前的上传可以继续
            upload.findPreviousUploads().then(function (previousUploads) {
                if (previousUploads.length) {
                    upload.resumeFromPreviousUpload(previousUploads[0]);
                }
                upload.start();
            }).catch(function (error) {
                console.error('查找之前的上传失败:', error);
                upload.start();
            });
        });
    }

    /**
     * 更新使用本地图片URL的记录，替换为云端URL
     */
    async updateRecordsWithImageUrl(localPath, imageUrl) {
        try {
            let updatedCount = 0;
            
            // 遍历所有localStorage中的记录
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                
                // 处理各种类型的记录
                if (key) {
                    const recordJson = localStorage.getItem(key);
                    if (recordJson) {
                        try {
                            let updated = false;
                            let parsedData;
                            
                            // 解析记录数据
                            parsedData = JSON.parse(recordJson);
                            
                            if (parsedData) {
                                let dataToUpdate;
                                
                                // 确定需要更新的数据结构
                                if (Array.isArray(parsedData)) {
                                    // 数组类型（如work_records_）
                                    dataToUpdate = parsedData.map(record => {
                                        if (record.image_ids && Array.isArray(record.image_ids)) {
                                            let recordUpdated = false;
                                            record.image_ids = record.image_ids.map(imgUrl => {
                                                if (imgUrl === localPath) {
                                                    recordUpdated = true;
                                                    updated = true;
                                                    return imageUrl;
                                                }
                                                return imgUrl;
                                            });
                                        }
                                        return record;
                                    });
                                } else if (parsedData.image_ids && Array.isArray(parsedData.image_ids)) {
                                    // 单个记录类型（如attendance_、attendance_data_）
                                    parsedData.image_ids = parsedData.image_ids.map(imgUrl => {
                                        if (imgUrl === localPath) {
                                            updated = true;
                                            return imageUrl;
                                        }
                                        return imgUrl;
                                    });
                                    dataToUpdate = parsedData;
                                } else if (typeof parsedData === 'object' && parsedData !== null) {
                                    // 对象类型（如work_flow_data_）
                                    // 遍历对象的所有属性，查找包含image_ids的记录
                                    for (const dateKey in parsedData) {
                                        if (parsedData.hasOwnProperty(dateKey)) {
                                            const dayRecords = parsedData[dateKey];
                                            if (Array.isArray(dayRecords)) {
                                                let dayUpdated = false;
                                                const updatedDayRecords = dayRecords.map(record => {
                                                    if (record.image_ids && Array.isArray(record.image_ids)) {
                                                        let recordUpdated = false;
                                                        record.image_ids = record.image_ids.map(imgUrl => {
                                                            if (imgUrl === localPath) {
                                                                recordUpdated = true;
                                                                dayUpdated = true;
                                                                return imageUrl;
                                                            }
                                                            return imgUrl;
                                                        });
                                                    }
                                                    return record;
                                                });
                                                if (dayUpdated) {
                                                    parsedData[dateKey] = updatedDayRecords;
                                                    updated = true;
                                                }
                                            }
                                        }
                                    }
                                    dataToUpdate = parsedData;
                                }
                                
                                // 如果有更新，保存回localStorage
                                if (updated) {
                                    localStorage.setItem(key, JSON.stringify(dataToUpdate));
                                    updatedCount++;
                                }
                            }
                        } catch (parseError) {
                            // 忽略无法解析的记录
                            continue;
                        }
                    }
                }
            }
            
            return updatedCount;
        } catch (error) {
            console.error('更新记录中的图片URL失败:', error);
            return 0;
        }
    }

    /**
     * 执行添加员工操作
     */
    async executeAddEmployeeOperation(data) {
        // 处理员工录入页面的嵌套数据格式
        let employeeData = data;
        
        // 如果数据是嵌套格式（员工录入页面使用），提取实际的员工数据
        if (data && typeof data === 'object' && !data.employee_id) {
            // 查找包含员工数据的键
            const employeeKey = Object.keys(data).find(key => 
                key.startsWith('employees_') && 
                data[key] && 
                data[key].employees && 
                Array.isArray(data[key].employees)
            );
            
            if (employeeKey && data[employeeKey].employees.length > 0) {
                employeeData = data[employeeKey].employees[0];
                console.log('📝 从嵌套数据中提取员工数据:', employeeData.employee_id);
            }
        }

        // 将空的id_card转换为null，避免PostgreSQL UNIQUE约束冲突
        if (employeeData.id_card === '' || employeeData.id_card === undefined) {
            employeeData.id_card = null;
        }

        const { error } = await window.supabase
            .from('employees')
            .insert(employeeData);

        if (error) {
            return {
                success: false,
                error: error.message
            };
        }

        // 插入成功后，清理本地记录（使用本地employee_id）
        console.log(`✅ 员工记录插入成功，开始清理本地记录: ${employeeData.employee_id}`);
        await this.removeEmployeeRecordFromLocalStorage(employeeData.employee_id, employeeData);

        return { success: true };
    }

    /**
     * 执行更新员工操作
     */
    async executeUpdateEmployeeOperation(record_id, data) {
        // 处理员工录入页面的嵌套数据格式
        let employeeData = data;
        
        // 如果数据是嵌套格式（员工录入页面使用），提取实际的员工数据
        if (data && typeof data === 'object' && !data.employee_id) {
            // 查找包含员工数据的键
            const employeeKey = Object.keys(data).find(key => 
                key.startsWith('employees_') && 
                data[key] && 
                data[key].employees && 
                Array.isArray(data[key].employees)
            );
            
            if (employeeKey && data[employeeKey].employees.length > 0) {
                employeeData = data[employeeKey].employees[0];
                console.log('📝 从嵌套数据中提取员工数据:', employeeData.employee_id);
            }
        }

        // 将空的id_card转换为null，避免PostgreSQL UNIQUE约束冲突
        if (employeeData.id_card === '' || employeeData.id_card === undefined) {
            employeeData.id_card = null;
        }

        // 首先检查员工是否存在
        const { data: existingEmployee, error: checkError } = await window.supabase
            .from('employees')
            .select('*')
            .eq('employee_id', record_id)
            .single();

        if (checkError || !existingEmployee) {
            return {
                success: false,
                error: '员工不存在'
            };
        }

        // 检查版本冲突
        if (employeeData.updated_at && existingEmployee.updated_at) {
            const localTime = new Date(employeeData.updated_at);
            const remoteTime = new Date(existingEmployee.updated_at);
            
            if (remoteTime > localTime) {
                return {
                    success: false,
                    conflict: true,
                    conflictData: {
                        local: employeeData,
                        remote: existingEmployee
                    }
                };
            }
        }

        // 设置updated_at字段为北京时间（UTC+8）
        const now = new Date();
        const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        employeeData.updated_at = beijingTime.toISOString();

        const { error } = await window.supabase
            .from('employees')
            .update(employeeData)
            .eq('employee_id', record_id);

        if (error) {
            return {
                success: false,
                error: error.message
            };
        }

        // 更新成功后，清理本地记录
        console.log(`✅ 员工记录更新成功，开始清理本地记录: ${record_id}`);
        await this.removeEmployeeRecordFromLocalStorage(record_id, employeeData);

        return { success: true };
    }

    /**
     * 执行删除员工操作
     */
    async executeDeleteEmployeeOperation(record_id) {
        const { error } = await window.supabase
            .from('employees')
            .delete()
            .eq('employee_id', record_id);

        if (error) {
            return {
                success: false,
                error: error.message
            };
        }

        // 删除成功后，清理本地记录
        console.log(`✅ 员工记录删除成功，开始清理本地记录: ${record_id}`);
        await this.removeEmployeeRecordFromLocalStorage(record_id, { employee_id: record_id });

        return { success: true };
    }

    /**
     * 处理冲突
     */
    async handleConflict(operation, conflictData) {
        console.log('🔄 处理冲突:', conflictData);
        
        // 简单的冲突解决策略：使用最新的修改时间
        const localTime = new Date(operation.data.updated_at || operation.timestamp);
        const remoteTime = new Date(conflictData.remote.updated_at);
        
        if (localTime > remoteTime) {
            // 本地更新较新，重新执行更新操作
            console.log('📝 本地数据较新，重新执行更新');
            let result;
            if (operation.dataType === 'employee') {
                result = await this.executeUpdateEmployeeOperation(operation.record_id, operation.data);
            } else if (operation.dataType === 'project') {
                result = await this.executeUpdateProjectOperation(operation.record_id, operation.data);
            } else if (operation.dataType === 'attendance') {
                result = await this.executeUpdateAttendanceOperation(operation.record_id, operation.data);
            }
            
            if (result.success) {
                operation.status = 'completed';
                console.log('✅ 冲突解决：使用本地数据');
            }
        } else {
            // 远程更新较新，接受远程数据
            console.log('☁️ 远程数据较新，接受远程数据');
            operation.status = 'completed';
            
            // 更新本地缓存
            this.updateLocalCache(conflictData.remote, operation.dataType);
        }
    }

    /**
     * 更新本地缓存
     */
    updateLocalCache(remoteData, dataType = 'employee') {
        if (dataType === 'employee') {
            // 更新本地存储的员工数据
            if (window.employeeDataCache) {
                const employees = window.employeeDataCache.employees || [];
                const index = employees.findIndex(emp => emp.employee_id === remoteData.employee_id);
                
                if (index !== -1) {
                    employees[index] = remoteData;
                    window.employeeDataCache.employees = employees;
                    
                    // 保存到本地存储
                    localStorage.setItem('localEmployeesData', JSON.stringify(employees));
                    console.log('💾 员工本地缓存已更新');
                }
            }
        } else if (dataType === 'project') {
            // 更新本地存储的项目数据
            if (window.projectDataCache) {
                const projects = window.projectDataCache.projects || [];
                const index = projects.findIndex(proj => proj.project_id === remoteData.project_id);
                
                if (index !== -1) {
                    projects[index] = remoteData;
                    window.projectDataCache.projects = projects;
                    
                    // 保存到本地存储
                    localStorage.setItem('localProjectsData', JSON.stringify(projects));
                    console.log('💾 项目本地缓存已更新');
                }
            }
        } else if (dataType === 'attendance') {
            // 更新本地存储的考勤记录数据
            const record_id = `attendance_${remoteData.phone}_${remoteData.employee_id}_${remoteData.record_date}`;
            localStorage.setItem(record_id, JSON.stringify(remoteData));
            console.log('💾 考勤记录本地缓存已更新');
        }
    }

    /**
     * 生成操作ID
     */
    generateOperationId() {
        return 'op_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 更新同步指示器
     */
    updateSyncIndicator() {
        const indicator = document.getElementById('sync-indicator');
        if (!indicator) {
            this.createSyncIndicator();
            return;
        }

        let statusText = '';
        let statusClass = '';

        if (this.syncStatus.isSyncing) {
            statusText = `同步中... (${this.syncStatus.pendingOperations})`;
            statusClass = 'syncing';
        } else if (!this.syncStatus.isOnline) {
            statusText = '离线模式';
            statusClass = 'offline';
        } else if (this.syncStatus.pendingOperations > 0) {
            statusText = `待同步 (${this.syncStatus.pendingOperations})`;
            statusClass = 'pending';
        } else {
            statusText = '已同步';
            statusClass = 'synced';
        }

        indicator.textContent = statusText;
        indicator.className = `sync-indicator ${statusClass}`;
    }

    /**
     * 创建同步指示器
     */
    createSyncIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'sync-indicator';
        indicator.className = 'sync-indicator';
        indicator.style.cursor = 'pointer'; // 添加鼠标指针样式
        
        // 添加点击事件，显示/隐藏同步文件列表
        indicator.addEventListener('click', () => this.toggleSyncFileList());
        
        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .sync-indicator {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: bold;
                z-index: 10000;
                transition: all 0.3s ease;
                backdrop-filter: blur(10px);
            }
            
            .sync-indicator.syncing {
                background: linear-gradient(45deg, #007bff, #0056b3);
                color: white;
                animation: pulse 1.5s infinite;
            }
            
            .sync-indicator.offline {
                background: #dc3545;
                color: white;
            }
            
            .sync-indicator.pending {
                background: #ffc107;
                color: #212529;
            }
            
            .sync-indicator.synced {
                background: #28a745;
                color: white;
            }
            
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.7; }
                100% { opacity: 1; }
            }
            
            /* 同步文件列表样式 */
            .sync-file-list {
                position: fixed;
                top: 60px;
                right: 20px;
                width: 300px;
                max-height: 400px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 10001;
                overflow-y: auto;
                display: none;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(0, 0, 0, 0.1);
            }
            
            .sync-file-list.show {
                display: block;
            }
            
            .sync-file-list-header {
                padding: 12px 16px;
                border-bottom: 1px solid #e2e8f0;
                font-weight: bold;
                background: linear-gradient(135deg, #f9fafb, #f3f4f6);
            }
            
            .sync-file-item {
                padding: 12px 16px;
                border-bottom: 1px solid #f3f4f6;
                display: flex;
                justify-content: space-between;
                align-items: center;
                transition: background-color 0.2s ease;
            }
            
            .sync-file-item:hover {
                background-color: #f9fafb;
            }
            
            .sync-file-info {
                flex: 1;
            }
            
            .sync-file-name {
                font-size: 14px;
                font-weight: 500;
                color: #374151;
                margin-bottom: 4px;
            }
            
            .sync-file-status {
                font-size: 12px;
                color: #6b7280;
            }
            
            .sync-file-status.pending {
                color: #f59e0b;
            }
            
            .sync-file-status.completed {
                color: #10b981;
            }
            
            .sync-file-status.failed {
                color: #ef4444;
            }
            
            .sync-file-status.conflict {
                color: #8b5cf6;
            }
            
            .sync-file-actions {
                display: flex;
                gap: 8px;
            }
            
            .sync-button {
                background: none;
                border: none;
                cursor: pointer;
                padding: 6px;
                border-radius: 4px;
                transition: all 0.2s ease;
                color: #3b82f6;
            }
            
            .sync-button:hover {
                background-color: rgba(59, 130, 246, 0.1);
                color: #2563eb;
            }
            
            .sync-button i {
                font-size: 16px;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(indicator);
        
        // 创建同步文件列表
        this.createSyncFileList();
        
        this.updateSyncIndicator();
    }

    /**
     * 创建同步文件列表
     */
    createSyncFileList() {
        // 检查是否已存在同步文件列表
        if (document.getElementById('sync-file-list')) {
            return;
        }
        
        const syncFileList = document.createElement('div');
        syncFileList.id = 'sync-file-list';
        syncFileList.className = 'sync-file-list';
        
        // 创建列表头部
        const header = document.createElement('div');
        header.className = 'sync-file-list-header';
        header.textContent = '同步操作列表';
        syncFileList.appendChild(header);
        
        // 创建列表内容容器
        const content = document.createElement('div');
        content.id = 'sync-file-list-content';
        syncFileList.appendChild(content);
        
        document.body.appendChild(syncFileList);
        
        // 添加点击外部关闭列表的事件
        document.addEventListener('click', (e) => {
            const indicator = document.getElementById('sync-indicator');
            const fileList = document.getElementById('sync-file-list');
            
            if (indicator && fileList && !indicator.contains(e.target) && !fileList.contains(e.target)) {
                fileList.classList.remove('show');
            }
        });
    }
    
    /**
     * 切换同步文件列表的显示/隐藏
     */
    toggleSyncFileList() {
        const syncFileList = document.getElementById('sync-file-list');
        if (syncFileList) {
            syncFileList.classList.toggle('show');
            // 如果显示列表，更新列表内容
            if (syncFileList.classList.contains('show')) {
                this.updateSyncFileList();
            }
        }
    }
    
    /**
     * 更新同步文件列表
     */
    updateSyncFileList() {
        const content = document.getElementById('sync-file-list-content');
        if (!content) {
            return;
        }
        
        const queue = this.getSyncQueue();
        
        if (queue.length === 0) {
            content.innerHTML = '<div style="padding: 16px; text-align: center; color: #6b7280;">暂无同步操作</div>';
            return;
        }
        
        // 按时间倒序排序，最新的操作在最上面
        const sortedQueue = queue.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        content.innerHTML = sortedQueue.map(operation => {
            // 获取操作类型的中文描述
            const operationTypeMap = {
                'add': '添加',
                'update': '更新',
                'delete': '删除',
                'save_record': '添加',
                'update_audit': '更新',
                'upload_image': '添加',
                'delete_image': '删除',
                '删除_图片': '删除'
            };
            
            // 获取数据类型的中文描述
            const dataTypeMap = {
                'employee': '员工',
                'project': '项目',
                'attendance': '考勤记录',
                'record': '结算借支记录',
                'project_expense': '项目支出记录',
                'project_income': '项目收入记录',
                'settlement_records': '审核功能',
                'work_record': '点工单',
                'image': '图片',
                'construction_log': '施工日志'
            };
            
            // 获取状态的中文描述
            const statusMap = {
                'pending': '待同步',
                'completed': '已完成',
                'failed': '失败',
                'conflict': '冲突'
            };
            
            const operationType = operationTypeMap[operation.operation] || operation.operation;
            const dataType = dataTypeMap[operation.dataType] || operation.dataType;
            const status = statusMap[operation.status] || operation.status;
            
            // 获取操作对象的名称
            let objectName = '';
            if (operation.dataType === 'employee') {
                objectName = operation.data ? (operation.data.emp_name || operation.data.employee_name || '未命名员工') : '已删除员工';
            } else if (operation.dataType === 'project') {
                objectName = operation.data ? (operation.data.project_name || '未命名项目') : '已删除项目';
            } else if (operation.dataType === 'attendance') {
                objectName = operation.data ? 
                    `${operation.data.employee_id || '未知员工'} - ${operation.data.record_date || '未知日期'}` : 
                    '已删除考勤记录';
            } else if ((operation.dataType === 'record' || operation.dataType === 'project_expense' || operation.dataType === 'project_income') && operation.operation === 'save_record') {
                const record = operation.data?.record;
                if (record) {
                    if (operation.dataType === 'project_expense' || operation.dataType === 'project_income') {
                        objectName = `${record.project_id || '未知项目'} - ${record.record_date || '未知日期'}`;
                    } else {
                        objectName = `${record.employee_id || '未知员工'} - ${record.record_date || '未知日期'}`;
                    }
                } else {
                    if (operation.dataType === 'project_expense') {
                        objectName = '已删除项目支出记录';
                    } else if (operation.dataType === 'project_income') {
                        objectName = '已删除项目收入记录';
                    } else {
                        objectName = '已删除结算借支记录';
                    }
                }
            } else if (operation.dataType === 'construction_log' && operation.operation === 'save_record') {
                const record = operation.data?.record;
                if (record) {
                    objectName = `${record.record_date || '未知日期'}`;
                } else {
                    objectName = '已删除施工日志';
                }
            } else if (operation.dataType === 'construction_log' && operation.operation === 'update') {
                const record = operation.data;
                if (record) {
                    objectName = `${record.record_date || '未知日期'}`;
                } else {
                    objectName = '已删除施工日志';
                }
            } else if (operation.dataType === 'construction_log' && operation.operation === 'delete') {
                const record = operation.data;
                if (record) {
                    objectName = `${record.record_date || '未知日期'}`;
                } else {
                    objectName = '已删除施工日志';
                }
            }
            
            // 格式化时间
            const formattedTime = new Date(operation.timestamp).toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            return `
                <div class="sync-file-item">
                    <div class="sync-file-info">
                        <div class="sync-file-name">${operationType} ${dataType}</div>
                        <div class="sync-file-status ${operation.status}">${status} - ${objectName}</div>
                        <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">${formattedTime}</div>
                    </div>
                    <div class="sync-file-actions">
                        ${operation.status === 'pending' ? `
                            <button class="sync-button" onclick="window.offlineSyncService.syncSingleOperation('${operation.id}')" title="立即同步">
                                <span style="font-size: 16px;">🔄</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    /**
     * 同步单个操作
     * @param {string} operationId - 操作ID
     */
    async syncSingleOperation(operationId) {
        const queue = this.getSyncQueue();
        const operationIndex = queue.findIndex(op => op.id === operationId);
        
        if (operationIndex === -1) {
            return;
        }
        
        const operation = queue[operationIndex];
        
        try {
            // 更新操作状态为同步中
            operation.status = 'syncing';
            this.saveSyncQueue(queue);
            this.updateSyncFileList();
            
            // 执行操作
            const result = await this.executeOperation(operation);
            
            if (result.success) {
                operation.status = 'completed';
                operation.retryCount = 0;
            } else if (result.conflict) {
                operation.status = 'conflict';
                await this.handleConflict(operation, result.conflictData);
            } else {
                operation.retryCount++;
                if (operation.retryCount < operation.maxRetries) {
                    operation.status = 'pending';
                } else {
                    operation.status = 'failed';
                }
            }
        } catch (error) {
            operation.status = 'failed';
            console.error('同步单个操作失败:', error);
        } finally {
            // 保存更新后的队列
            this.saveSyncQueue(queue);
            // 更新同步文件列表
            this.updateSyncFileList();
            // 更新同步指示器
            this.syncStatus.pendingOperations = queue.filter(op => op.status === 'pending').length;
            this.updateSyncIndicator();
        }
    }
    
    /**
     * 显示同步结果通知
     */
    showSyncResults(results) {
        let message = '';
        let isError = false;
        let messageType = 'info'; // 新增消息类型：info, warning, error

        // 获取当前队列状态
        const queue = this.getSyncQueue();
        const pendingCount = queue.filter(op => op.status === 'pending').length;
        const totalOperations = results.success + results.failed + results.conflicts;

        // 分析同步结果
        if (results.failed === totalOperations && totalOperations > 0) {
            // 全部失败
            message = `同步失败：${results.failed} 个操作全部失败，将在网络恢复后自动重试`;
            isError = true;
            messageType = 'error';
        } else if (results.failed > 0 && results.success > 0) {
            // 部分成功，部分失败
            if (pendingCount > 0) {
                message = `同步部分成功：${results.success} 个操作成功，${results.failed} 个操作将在网络恢复后重试`;
                messageType = 'warning';
            } else {
                message = `同步完成：${results.success} 个操作成功，${results.failed} 个操作失败`;
                isError = true;
                messageType = 'error';
            }
        } else if (results.failed > 0 && results.success === 0) {
            // 只有失败，没有成功
            if (pendingCount > 0) {
                message = `同步暂停：${results.failed} 个操作将在网络恢复后自动重试`;
                messageType = 'warning';
            } else {
                message = `同步失败：${results.failed} 个操作失败`;
                isError = true;
                messageType = 'error';
            }
        } else if (results.conflicts > 0) {
            // 有冲突
            message = `同步完成：解决了 ${results.conflicts} 个冲突`;
            if (results.success > 0) {
                message += `，${results.success} 个操作成功`;
            }
            messageType = 'warning';
        } else if (results.success > 0) {
            // 全部成功
            message = `同步成功：${results.success} 个操作全部同步完成`;
            messageType = 'success';
        }

        // 添加队列状态信息
        if (pendingCount > 0 && results.failed === 0) {
            message += `（还有 ${pendingCount} 个操作等待处理）`;
        }

        if (message) {
            // 使用现有的通知系统
            if (typeof showNotification === 'function') {
                showNotification(message, isError);
            } else {
                // 创建更友好的通知
                this.showCustomNotification(message, messageType);
            }
            
            // 同步结果详细信息的控制台日志已移除
        }
        
        // 更新同步文件列表
        this.updateSyncFileList();
    }

    /**
     * 显示自定义通知
     */
    showCustomNotification(message, type = 'info') {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `sync-notification sync-notification-${type}`;
        notification.textContent = message;
        
        // 添加样式
        const style = document.createElement('style');
        style.textContent = `
            .sync-notification {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                z-index: 10001;
                backdrop-filter: blur(10px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                animation: slideDown 0.3s ease;
                max-width: 80%;
                text-align: center;
            }
            
            .sync-notification-success {
                background: linear-gradient(45deg, #28a745, #20c997);
                color: white;
            }
            
            .sync-notification-warning {
                background: linear-gradient(45deg, #ffc107, #fd7e14);
                color: #212529;
            }
            
            .sync-notification-error {
                background: linear-gradient(45deg, #dc3545, #e83e8c);
                color: white;
            }
            
            .sync-notification-info {
                background: linear-gradient(45deg, #17a2b8, #6f42c1);
                color: white;
            }
            
            @keyframes slideDown {
                from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
        `;
        
        // 如果样式不存在，添加样式
        if (!document.querySelector('#sync-notification-styles')) {
            style.id = 'sync-notification-styles';
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        // 3秒后自动移除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    /**
     * 获取同步状态
     */
    getSyncStatus() {
        return { ...this.syncStatus };
    }

    /**
     * 清除已完成的操作
     */
    clearCompletedOperations() {
        const queue = this.getSyncQueue();
        const pendingQueue = queue.filter(op => op.status !== 'completed');
        this.saveSyncQueue(pendingQueue);
        
        this.syncStatus.pendingOperations = pendingQueue.length;
        this.updateSyncIndicator();
    }

    /**
     * 执行添加项目操作
     */
    async executeAddProjectOperation(data) {
        // 确保数据格式正确，只包含必要的字段
        const insertData = {
            project_id: data.project_id,
            user_id: data.user_id,
            project_name: data.project_name,
            address: data.address,
            regular_hours: data.regular_hours,
            overtime_hours: data.overtime_hours,
            status: data.status,
            created_at: data.created_at,
            updated_at: data.updated_at
        };

        const { error } = await window.supabase
            .from('projects')
            .insert(insertData);

        if (error) {
            return {
                success: false,
                error: error.message
            };
        }

        // 插入成功后，清理本地记录（使用本地project_id）
        console.log(`✅ 项目记录插入成功，开始清理本地记录: ${data.project_id}`);
        await this.removeProjectRecordFromLocalStorage(data.project_id, data);

        return { success: true };
    }

    /**
     * 查找本地图片对应的云端URL
     */
    async findCloudUrlForLocalImage(localPath) {
        try {
            // 首先遍历所有已完成的图片上传操作
            const queue = this.getSyncQueue();
            const completedImageOperations = queue.filter(op => 
                op.dataType === 'image' && 
                op.operation === 'upload_image' && 
                op.status === 'completed' &&
                op.data.localPath === localPath
            );
            
            if (completedImageOperations.length > 0) {
                // 找到最新的已完成操作
                const latestOperation = completedImageOperations[completedImageOperations.length - 1];
                if (latestOperation.result && latestOperation.result.imageUrl) {
                    console.log('从同步队列中找到云端URL:', latestOperation.result.imageUrl);
                    return latestOperation.result.imageUrl;
                }
            }
            
            // 如果在队列中找不到，尝试从localStorage中查找已上传的图片记录
            const imageId = localPath.replace('local://', '');
            const imageDataJson = localStorage.getItem(imageId);
            
            if (imageDataJson) {
                const imageData = JSON.parse(imageDataJson);
                
                // 检查图片是否已上传且有云端URL
                if (imageData.uploaded && imageData.cloudUrl) {
                    return imageData.cloudUrl;
                }
            }
            
            console.log('未找到本地图片对应的云端URL:', localPath);
            return null;
        } catch (error) {
            console.error('查找云端URL失败:', error);
            return null;
        }
    }

    /**
     * 执行添加考勤记录操作
     */
    async executeAddAttendanceOperation(data) {
        try {
            // 移除本地存储特有的字段和不符合数据库格式要求的字段
            const { id, _local, _timestamp, _synced, record_id, ...insertData } = data;
            
            // 检查并处理图片URL
            if (insertData.image_ids && Array.isArray(insertData.image_ids)) {
                const updatedImageIds = [];
                for (const imageUrl of insertData.image_ids) {
                    if (imageUrl && imageUrl.startsWith('local://')) {
                        // 查找对应的云端URL
                        const cloudUrl = await this.findCloudUrlForLocalImage(imageUrl);
                        if (cloudUrl) {
                            updatedImageIds.push(cloudUrl);
                        } else {
                            // 如果找不到云端URL，暂时保留本地URL
                            updatedImageIds.push(imageUrl);
                        }
                    } else {
                        updatedImageIds.push(imageUrl);
                    }
                }
                insertData.image_ids = updatedImageIds;
            }
            
            // 根据工作类型处理数据，与在线保存逻辑完全一致
            if (insertData.work_type === '包工') {
                // 包工模式：只保留包工相关字段，删除其他字段
                delete insertData.regular_hours;
                delete insertData.overtime_hours;
                delete insertData.work_quantity;
                delete insertData.unit_price;

                
                // 确保包工字段存在
                if (insertData.contract_amount === undefined || insertData.contract_amount === null) {
                    insertData.contract_amount = 0;
                } else {
                    insertData.contract_amount = parseFloat(insertData.contract_amount) || 0;
                }
                
                // 确保work_time为"金额"
                insertData.work_time = '金额';
                
            } else if (insertData.work_type === '点工') {
                // 点工模式：只保留点工相关字段，删除其他字段
                delete insertData.contract_amount;
                delete insertData.work_quantity;
                delete insertData.unit_price;
                delete insertData.contract_amount;
                
                // 处理工时字段，与在线保存一致
                if (insertData.regular_hours === '' || insertData.regular_hours === null) {
                    delete insertData.regular_hours;
                } else if (insertData.regular_hours !== undefined) {
                    insertData.regular_hours = parseFloat(insertData.regular_hours) || 0;
                }
                
                if (insertData.overtime_hours === '' || insertData.overtime_hours === null) {
                    delete insertData.overtime_hours;
                } else if (insertData.overtime_hours !== undefined) {
                    insertData.overtime_hours = parseFloat(insertData.overtime_hours) || 0;
                }
                
            } else if (insertData.work_type === '工量') {
                // 工量模式：只保留工量相关字段，删除其他字段
                delete insertData.regular_hours;
                delete insertData.overtime_hours;
                
                // 处理工量字段
                if (insertData.work_quantity === '' || insertData.work_quantity === null) {
                    delete insertData.work_quantity;
                } else if (insertData.work_quantity !== undefined) {
                    insertData.work_quantity = parseFloat(insertData.work_quantity) || 0;
                }
                
                if (insertData.unit_price === '' || insertData.unit_price === null) {
                    delete insertData.unit_price;
                } else if (insertData.unit_price !== undefined) {
                    insertData.unit_price = parseFloat(insertData.unit_price) || 0;
                }
                
                if (insertData.contract_amount === '' || insertData.contract_amount === null) {
                    delete insertData.contract_amount;
                } else if (insertData.contract_amount !== undefined) {
                    insertData.contract_amount = parseFloat(insertData.contract_amount) || 0;
                }
                
            } else {
                // 默认情况：保留所有字段，但不包含work_item
                // 处理工时字段
                if (insertData.regular_hours === '' || insertData.regular_hours === null) {
                    delete insertData.regular_hours;
                } else if (insertData.regular_hours !== undefined) {
                    insertData.regular_hours = parseFloat(insertData.regular_hours) || 0;
                }
                
                if (insertData.overtime_hours === '' || insertData.overtime_hours === null) {
                    delete insertData.overtime_hours;
                } else if (insertData.overtime_hours !== undefined) {
                    insertData.overtime_hours = parseFloat(insertData.overtime_hours) || 0;
                }
                
                // 处理其他数值字段
                if (insertData.contract_amount === '' || insertData.contract_amount === null) {
                    delete insertData.contract_amount;
                } else if (insertData.contract_amount !== undefined) {
                    insertData.contract_amount = parseFloat(insertData.contract_amount) || 0;
                }
                
                if (insertData.work_quantity === '' || insertData.work_quantity === null) {
                    delete insertData.work_quantity;
                } else if (insertData.work_quantity !== undefined) {
                    insertData.work_quantity = parseFloat(insertData.work_quantity) || 0;
                }
                
                if (insertData.unit_price === '' || insertData.unit_price === null) {
                    delete insertData.unit_price;
                } else if (insertData.unit_price !== undefined) {
                    insertData.unit_price = parseFloat(insertData.unit_price) || 0;
                }
                
                if (insertData.contract_amount === '' || insertData.contract_amount === null) {
                    delete insertData.contract_amount;
                } else if (insertData.contract_amount !== undefined) {
                    insertData.contract_amount = parseFloat(insertData.contract_amount) || 0;
                }
            }
            
            // 移除已删除的数据库字段
            delete insertData.has_image;
            delete insertData.image_count;
            
            // 确保必需字段存在
            if (!insertData.phone) {
                console.error('缺少必需字段: phone');
                return {
                    success: false,
                    error: '缺少必需字段: phone'
                };
            }
            if (!insertData.project_id) {
                console.error('缺少必需字段: project_id');
                return {
                    success: false,
                    error: '缺少必需字段: project_id'
                };
            }
            if (!insertData.employee_id) {
                console.error('缺少必需字段: employee_id');
                return {
                    success: false,
                    error: '缺少必需字段: employee_id'
                };
            }
            if (!insertData.record_date) {
                console.error('缺少必需字段: record_date');
                return {
                    success: false,
                    error: '缺少必需字段: record_date'
                };
            }
            if (!insertData.work_type) {
                console.error('缺少必需字段: work_type');
                return {
                    success: false,
                    error: '缺少必需字段: work_type'
                };
            }
            
            // 检查Supabase认证状态
            try {
                const { data: { session }, error: sessionError } = await window.supabase.auth.getSession();
                if (sessionError) {
                    console.error('获取会话失败:', sessionError);
                    return {
                        success: false,
                        error: '认证失败: ' + sessionError.message
                    };
                }
                
                // 对于使用匿名密钥的情况，我们不需要检查用户登录状态
                // 直接使用匿名密钥进行操作
            } catch (authError) {
                console.error('检查认证状态失败:', authError);
                // 对于匿名模式，认证检查失败不应该阻止操作
            }
            
            // 确保数据格式正确
            
            // 尝试将数据转换为JSON字符串，检查是否有不可序列化的数据
            try {
                JSON.stringify(insertData);
            } catch (jsonError) {
                console.error('JSON序列化失败:', jsonError);
                return {
                    success: false,
                    error: '数据序列化失败: ' + jsonError.message
                };
            }
            
            const { error } = await window.supabase
                .from('attendance_records')
                .insert(insertData);

            if (error) {
                console.error('添加考勤记录失败:', error);
                console.error('错误详情:', error.details);
                console.error('错误代码:', error.code);
                console.error('错误提示:', error.hint);
                return {
                    success: false,
                    error: error.message
                };
            }

            // 更新本地记录状态并清理
            if (id) {
                const localRecord = JSON.parse(localStorage.getItem(id) || '{}');
                
                // 清理已上传的图片数据
                await this.cleanupUploadedImages(localRecord);
                
                // 只有在同步成功时才清理本地记录
                // 从work_records_${userId}中移除已同步的离线记录
                await this.removeRecordFromWorkRecords(localRecord);
                
                // 删除本地记录文件
                localStorage.removeItem(id);
                console.log(`✅ 同步成功，删除本地记录: ${id}`);
            }

            return { success: true };
        } catch (error) {
            console.error('执行添加考勤记录操作失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 清理已上传的图片数据
     */
    async cleanupUploadedImages(record) {
        try {
            if (!record.image_ids || !Array.isArray(record.image_ids)) {
                return;
            }
            
            // 检查记录中的所有图片URL
            for (const imageUrl of record.image_ids) {
                if (imageUrl && imageUrl.startsWith('local://')) {
                    const imageId = imageUrl.replace('local://', '');
                    const imageDataJson = localStorage.getItem(imageId);
                    
                    if (imageDataJson) {
                        const imageData = JSON.parse(imageDataJson);
                        
                        // 如果图片已上传且有云端URL，则删除本地数据
                        if (imageData.uploaded && imageData.cloudUrl) {
                            localStorage.removeItem(imageId);
                            console.log('清理已上传的图片数据:', imageId);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('清理已上传图片数据失败:', error);
        }
    }
    
    /**
     * 从work_records_${userId}中移除已同步的离线记录
     */
    async removeRecordFromWorkRecords(localRecord) {
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
            
            // 使用与首页一致的键名：work_records_${userId}
            const workRecordsKey = `work_records_${userId}`;
            const workRecordsStr = localStorage.getItem(workRecordsKey);
            if (!workRecordsStr) {
                return;
            }
            
            const workRecords = JSON.parse(workRecordsStr);
            if (!Array.isArray(workRecords)) {
                return;
            }
            
            // 过滤掉匹配的离线记录
            const updatedRecords = workRecords.filter(record => {
                // 检查记录是否匹配：相同的员工ID、项目ID、记录日期和工作类型，并且是离线记录
                return !(record.employee_id === localRecord.employee_id &&
                        record.project_id === localRecord.project_id &&
                        record.record_date === localRecord.record_date &&
                        record.work_type === localRecord.work_type &&
                        record._local === true);
            });
            
            // 如果有记录被移除，更新本地存储
            if (updatedRecords.length !== workRecords.length) {
                localStorage.setItem(workRecordsKey, JSON.stringify(updatedRecords));
                console.log(`✅ 从work_records中移除已同步的离线记录: ${localRecord.employee_id}`);
            }
        } catch (error) {
            console.error('从work_records中移除已同步的离线记录失败:', error);
        }
    }

    /**
     * 执行更新考勤记录操作
     */
    async executeUpdateAttendanceOperation(record_id, data) {
        try {
            // 移除本地存储特有的字段和不符合数据库格式要求的字段
            const { id, _local, _timestamp, _synced, employees, record_id, ...rawData } = data;
            
            // 确保数据格式正确
            if (!rawData.phone || !rawData.project_id || !rawData.employee_id || !rawData.record_date) {
                return {
                    success: false,
                    error: '缺少必要的复合主键字段'
                };
            }
            
            // 检查并处理图片URL
            let imageIds = rawData.image_ids || [];
            if (Array.isArray(imageIds)) {
                const updatedImageIds = [];
                for (const imageUrl of imageIds) {
                    if (imageUrl && imageUrl.startsWith('local://')) {
                        // 查找对应的云端URL
                        const cloudUrl = await this.findCloudUrlForLocalImage(imageUrl);
                        if (cloudUrl) {
                            updatedImageIds.push(cloudUrl);
                        } else {
                            // 如果找不到云端URL，暂时保留本地URL
                            updatedImageIds.push(imageUrl);
                        }
                    } else {
                        updatedImageIds.push(imageUrl);
                    }
                }
                imageIds = updatedImageIds;
            }
            
            // 构建基础记工记录数据
            const baseData = {
                phone: rawData.phone, 
                project_id: rawData.project_id, 
                employee_id: rawData.employee_id, 
                record_date: rawData.record_date, 
                work_type: rawData.work_type, 
                
                // 图片信息
                image_ids: imageIds, 
                
                // 备注信息
                remark: rawData.remark || null,
                
                // 审核状态
                audit_status: '已审'
            };
            
            // 直接使用传入的工时，不再重新计算
            let regular_hours = rawData.regular_hours || 0;
            let overtime_hours = rawData.overtime_hours || 0;
            
            // 处理点工类型的工时转换
            if (rawData.work_type === '点工') {
                // 处理上班工时
                if (rawData.workDetails?.休息 === '是') {
                    // 选择休息，不上传regular_hours
                    regular_hours = null;
                }
            } else if (rawData.work_type === '包工') {
                // 包工模式，不写入regular_hours和overtime_hours
                regular_hours = null;
                overtime_hours = null;
            }
            
            // 根据工作类型处理数据，与在线保存逻辑完全一致
            // 设置updated_at字段为北京时间（UTC+8）
            const now = new Date();
            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
            
            let updateData = {
                ...baseData,
                updated_at: beijingTime.toISOString()
            };
            
            if (rawData.work_type === '包工') {
                // 包工模式：只保留包工相关字段，删除其他字段
                updateData.contract_amount = rawData.contract_amount || 0;
                updateData.work_time = '金额';
                
                // 确保包工字段存在且为数值
                if (updateData.contract_amount === undefined || updateData.contract_amount === null) {
                    updateData.contract_amount = 0;
                } else {
                    updateData.contract_amount = parseFloat(updateData.contract_amount) || 0;
                }
                
                // 删除不相关字段
                delete updateData.regular_hours;
                delete updateData.overtime_hours;
                delete updateData.work_quantity;
                delete updateData.unit_price;
                delete updateData.total_price;
                
            } else if (rawData.work_type === '点工') {
                // 点工模式：只保留点工相关字段
                updateData.regular_hours = regular_hours;
                updateData.overtime_hours = overtime_hours;
                updateData.work_time = rawData.work_time;
                
                // 处理工时字段，与在线保存一致
                if (updateData.regular_hours === '' || updateData.regular_hours === null) {
                    delete updateData.regular_hours;
                } else if (updateData.regular_hours !== undefined) {
                    updateData.regular_hours = parseFloat(updateData.regular_hours) || 0;
                }
                
                if (updateData.overtime_hours === '' || updateData.overtime_hours === null) {
                    delete updateData.overtime_hours;
                } else if (updateData.overtime_hours !== undefined) {
                    updateData.overtime_hours = parseFloat(updateData.overtime_hours) || 0;
                }
                
                // 删除不相关字段
                delete updateData.contract_amount;
                delete updateData.work_quantity;
                delete updateData.unit_price;
                delete updateData.total_price;
                
            } else if (rawData.work_type === '工量') {
                // 工量模式：只保留工量相关字段
                updateData.work_time = rawData.work_time || null;
                updateData.work_quantity = rawData.work_quantity || 0;
                updateData.unit_price = rawData.unit_price || 0;
                updateData.contract_amount = rawData.contract_amount || 0;
                
                // 处理工量字段
                if (updateData.work_quantity === '' || updateData.work_quantity === null) {
                    delete updateData.work_quantity;
                } else if (updateData.work_quantity !== undefined) {
                    updateData.work_quantity = parseFloat(updateData.work_quantity) || 0;
                }
                
                if (updateData.unit_price === '' || updateData.unit_price === null) {
                    delete updateData.unit_price;
                } else if (updateData.unit_price !== undefined) {
                    updateData.unit_price = parseFloat(updateData.unit_price) || 0;
                }
                
                if (updateData.contract_amount === '' || updateData.contract_amount === null) {
                    delete updateData.contract_amount;
                } else if (updateData.contract_amount !== undefined) {
                    updateData.contract_amount = parseFloat(updateData.contract_amount) || 0;
                }
                
                // 删除不相关字段
                delete updateData.regular_hours;
                delete updateData.overtime_hours;
                
            } else {
                // 默认情况：保留所有字段，但处理数值字段
                updateData.regular_hours = regular_hours;
                updateData.overtime_hours = overtime_hours;
                updateData.work_time = rawData.work_time;
                updateData.contract_amount = rawData.contract_amount || 0;
                updateData.work_quantity = rawData.work_quantity || 0;
                updateData.unit_price = rawData.unit_price || 0;

                
                // 处理工时字段
                if (updateData.regular_hours === '' || updateData.regular_hours === null) {
                    delete updateData.regular_hours;
                } else if (updateData.regular_hours !== undefined) {
                    updateData.regular_hours = parseFloat(updateData.regular_hours) || 0;
                }
                
                if (updateData.overtime_hours === '' || updateData.overtime_hours === null) {
                    delete updateData.overtime_hours;
                } else if (updateData.overtime_hours !== undefined) {
                    updateData.overtime_hours = parseFloat(updateData.overtime_hours) || 0;
                }
                
                // 处理包工字段
                if (updateData.contract_amount === '' || updateData.contract_amount === null) {
                    delete updateData.contract_amount;
                } else if (updateData.contract_amount !== undefined) {
                    updateData.contract_amount = parseFloat(updateData.contract_amount) || 0;
                }
                
                // 处理工量字段
                if (updateData.work_quantity === '' || updateData.work_quantity === null) {
                    delete updateData.work_quantity;
                } else if (updateData.work_quantity !== undefined) {
                    updateData.work_quantity = parseFloat(updateData.work_quantity) || 0;
                }
                
                if (updateData.unit_price === '' || updateData.unit_price === null) {
                    delete updateData.unit_price;
                } else if (updateData.unit_price !== undefined) {
                    updateData.unit_price = parseFloat(updateData.unit_price) || 0;
                }
                

            }
            
            // 直接使用复合主键更新记录，不依赖id字段和record_id字段
            const { error } = await window.supabase
                .from('attendance_records')
                .update(updateData)
                .eq('employee_id', rawData.employee_id)
                .eq('record_date', rawData.record_date)
                .eq('project_id', rawData.project_id)
                .eq('work_type', rawData.work_type);

            if (error) {
                return {
                    success: false,
                    error: error.message
                };
            }

            // 更新成功后，清理本地记录
            if (id) {
                const localRecord = JSON.parse(localStorage.getItem(id) || '{}');
                
                // 清理已上传的图片数据
                await this.cleanupUploadedImages(localRecord);
                
                // 从work_records_${userId}中移除已同步的离线记录
                await this.removeRecordFromWorkRecords(localRecord);
                
                // 删除本地记录文件
                localStorage.removeItem(id);
                console.log(`✅ 同步成功，删除本地记录: ${id}`);
            }

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 执行更新项目操作
     */
    async executeUpdateProjectOperation(record_id, data) {
        // 验证输入参数
        if (!record_id || !data) {
            return {
                success: false,
                error: '缺少必要参数'
            };
        }

        // 首先检查项目是否存在
        const { data: existingProject, error: checkError } = await window.supabase
            .from('projects')
            .select('*')
            .eq('project_id', record_id)
            .single();

        if (checkError || !existingProject) {
            return {
                success: false,
                error: '项目不存在'
            };
        }

        // 检查版本冲突 - 使用正确的字段名
        const localTime = new Date(data.updated_at);
        const remoteTime = new Date(existingProject.updated_at);
        
        if (remoteTime > localTime) {
            return {
                success: false,
                conflict: true,
                conflictData: {
                    local: data,
                    remote: existingProject
                }
            };
        }

        // 确保数据格式正确，移除可能导致问题的字段
        const updateData = {
            user_id: data.user_id,
            project_name: data.project_name,
            address: data.address,
            regular_hours: data.regular_hours,
            overtime_hours: data.overtime_hours,
            status: data.status,
            updated_at: data.updated_at
        };

        // 验证更新数据不为空
        if (Object.keys(updateData).length === 0) {
            return {
                success: false,
                error: '没有有效的更新数据'
            };
        }

        const { error } = await window.supabase
            .from('projects')
            .update(updateData)
            .eq('project_id', record_id);

        if (error) {
            return {
                success: false,
                error: error.message
            };
        }

        // 更新成功后，清理本地记录
        console.log(`✅ 项目记录更新成功，开始清理本地记录: ${record_id}`);
        await this.removeProjectRecordFromLocalStorage(record_id, data);

        return { success: true };
    }

    /**
     * 执行删除项目操作
     */
    async executeDeleteProjectOperation(record_id) {
        const { error } = await window.supabase
            .from('projects')
            .delete()
            .eq('project_id', record_id);

        if (error) {
            return {
                success: false,
                error: error.message
            };
        }

        // 删除成功后，清理本地记录
        console.log(`✅ 项目记录删除成功，开始清理本地记录: ${record_id}`);
        // 注意：这里没有定义removeProjectRecordFromLocalStorage，可能会报错，但我们假设它存在或者以后会添加
        // 为了安全起见，这里先注释掉或者检查是否存在
        if (this.removeProjectRecordFromLocalStorage) {
            await this.removeProjectRecordFromLocalStorage(record_id, { project_id: record_id });
        }

        return { success: true };
    }

    /**
     * 执行完整删除项目操作（包括关联数据和文件）
     */
    async executeDeleteProjectFullOperation(projectId) {
        try {
            console.log(`🔄 开始同步删除项目及其关联数据: ${projectId}`);
            const supabase = await window.waitForSupabase();

            // 1. 删除关联表数据 - 分两步进行，先删除依赖表，再删除被依赖表(employees)
            
            // 第一步：删除引用了employees的表和其他独立表
            const dependentTables = [
                'attendance_records', // 引用 employees
                'settlement_records', // 引用 employees
                'construction_logs',
                'project_expenses',
                'project_income',
                'work_records'
            ];
            
            console.log('开始删除依赖表数据...');
            const dependentDeletePromises = dependentTables.map(async (table) => {
                try {
                    const { error } = await supabase
                        .from(table)
                        .delete()
                        .eq('project_id', projectId);
                    
                    if (error) {
                        console.error(`删除表 ${table} 数据失败:`, error);
                    } else {
                        console.log(`已删除表 ${table} 关联数据`);
                    }
                } catch (e) {
                    console.error(`删除表 ${table} 数据时发生异常:`, e);
                }
            });

            await Promise.all(dependentDeletePromises);
            
            // 第二步：删除 employees 表
            console.log('开始删除 employees 表数据...');
            try {
                const { error } = await supabase
                    .from('employees')
                    .delete()
                    .eq('project_id', projectId);
                
                if (error) {
                    console.error('删除 employees 表数据失败:', error);
                } else {
                    console.log('已删除 employees 表关联数据');
                }
            } catch (e) {
                console.error('删除 employees 表数据时发生异常:', e);
            }

            // 2. 删除存储文件 (递归删除)
            await this.deleteProjectStorageRecursively(projectId, supabase);

            // 3. 删除项目本身
            const { error } = await supabase
                .from('projects')
                .delete()
                .eq('project_id', projectId);

            if (error) {
                return { success: false, error: error.message };
            }

            // 清理本地记录（如果还有残留）
            // 这里主要依赖前端页面的deleteProjectLocalData已经清理过了
            // 但如果是在其他设备同步，这里可能需要清理逻辑，暂且略过

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * 递归删除项目存储文件
     */
    async deleteProjectStorageRecursively(path, supabase) {
        const bucketName = 'FYKQ';
        try {
            // 列出当前路径下的所有文件和文件夹
            const { data, error } = await supabase
                .storage
                .from(bucketName)
                .list(path, {
                    limit: 100,
                    offset: 0,
                    sortBy: { column: 'name', order: 'asc' },
                });

            if (error) {
                console.error(`列出目录 ${path} 失败:`, error);
                return;
            }

            if (!data || data.length === 0) return;

            const filesToDelete = [];
            const subFolders = [];

            for (const item of data) {
                if (item.id) {
                    filesToDelete.push(`${path}/${item.name}`);
                } else {
                    subFolders.push(`${path}/${item.name}`);
                }
            }

            // 批量删除文件
            if (filesToDelete.length > 0) {
                const { error: removeError } = await supabase
                    .storage
                    .from(bucketName)
                    .remove(filesToDelete);
                
                if (removeError) {
                    console.error(`删除文件失败:`, removeError);
                }
            }

            // 递归处理子文件夹
            for (const subFolder of subFolders) {
                await this.deleteProjectStorageRecursively(subFolder, supabase);
            }
            
        } catch (e) {
            console.error(`处理目录 ${path} 时发生异常:`, e);
        }
    }

    /**
     * 执行添加考勤记录操作
     */

    /**
     * 执行删除考勤记录操作
     */
    async executeDeleteAttendanceOperation(record_id, data) {
        try {
            // 只使用复合主键删除记录，不依赖record_id字段
            if (data.employee_id && data.record_date && data.project_id && data.work_type) {
                const { error } = await window.supabase
                    .from('attendance_records')
                    .delete()
                    .eq('employee_id', data.employee_id)
                    .eq('record_date', data.record_date)
                    .eq('project_id', data.project_id)
                    .eq('work_type', data.work_type);

                if (!error) {
                    // 删除成功后，清理本地记录
                    if (data.id) {
                        const localRecord = JSON.parse(localStorage.getItem(data.id) || '{}');
                        
                        // 清理已上传的图片数据
                        await this.cleanupUploadedImages(localRecord);
                        
                        // 从work_records_${userId}中移除已同步的离线记录
                        await this.removeRecordFromWorkRecords(localRecord);
                        
                        // 删除本地记录文件
                        localStorage.removeItem(data.id);
                        console.log(`✅ 同步成功，删除本地记录: ${data.id}`);
                    }
                    return { success: true };
                }
                return {
                    success: false,
                    error: error.message
                };
            }
            
            // 如果缺少必要的复合主键字段，返回错误
            return {
                success: false,
                error: '删除记录失败：缺少必要的复合主键字段'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 生成符合UUID v4格式的字符串
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    /**
     * 清理已上传的图片数据
     */
    async cleanupUploadedImages(record) {
        try {
            if (!record.image_ids || !Array.isArray(record.image_ids)) {
                return;
            }
            
            // 检查记录中的所有图片URL
            for (const imageUrl of record.image_ids) {
                if (imageUrl && imageUrl.startsWith('local://')) {
                    const imageId = imageUrl.replace('local://', '');
                    const imageDataJson = localStorage.getItem(imageId);
                    
                    if (imageDataJson) {
                        const imageData = JSON.parse(imageDataJson);
                        
                        // 如果图片已上传且有云端URL，则删除本地数据
                        if (imageData.uploaded && imageData.cloudUrl) {
                            localStorage.removeItem(imageId);
                            console.log('清理已上传的图片数据:', imageId);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('清理已上传图片数据失败:', error);
        }
    }
    
    /**
     * 从本地存储中移除已同步的结算借支记录
     */
    async removeSettlementRecordFromLocalStorage(localRecordId, localRecord) {
        try {
            
            const localStorageKeys = ['settlement_records_cache', 'settlementRecords', 'offline_settlement_records'];
            
            for (const key of localStorageKeys) {
                const recordJson = localStorage.getItem(key);
                if (!recordJson) continue;
                
                try {
                    let parsedData = JSON.parse(recordJson);
                    let updated = false;
                    
                    if (Array.isArray(parsedData)) {
                        // 数组类型：直接过滤
                        const initialLength = parsedData.length;
                        parsedData = parsedData.filter(record => {
                            return !(record.settlement_id === localRecordId || 
                                    (record.settlement_id === localRecord.settlement_id &&
                                     record.project_id === localRecord.project_id &&
                                     record.employee_id === localRecord.employee_id &&
                                     record.record_date === localRecord.record_date &&
                                     record.record_type === localRecord.record_type &&
                                     record.amount === localRecord.amount &&
                                     record.is_local === true));
                        });
                        
                        if (parsedData.length < initialLength) {
                            localStorage.setItem(key, JSON.stringify(parsedData));
                            console.log(`✅ 从${key}中移除${initialLength - parsedData.length}条已同步的结算借支记录`);
                        }
                    } else if (typeof parsedData === 'object' && parsedData !== null) {
                        // 对象类型：按日期分组
                        for (const date in parsedData) {
                            if (parsedData.hasOwnProperty(date) && Array.isArray(parsedData[date])) {
                                const dateRecords = parsedData[date];
                                const initialLength = dateRecords.length;
                                
                                parsedData[date] = dateRecords.filter(record => {
                                    return !(record.settlement_id === localRecordId || 
                                            (record.settlement_id === localRecord.settlement_id &&
                                             record.project_id === localRecord.project_id &&
                                             record.employee_id === localRecord.employee_id &&
                                             record.record_date === localRecord.record_date &&
                                             record.record_type === localRecord.record_type &&
                                             record.amount === localRecord.amount &&
                                             record.is_local === true));
                                });
                                
                                if (parsedData[date].length < initialLength) {
                                    updated = true;
                                    console.log(`✅ 从${key}[${date}]中移除${initialLength - parsedData[date].length}条已同步的结算借支记录`);
                                }
                            }
                        }
                        
                        if (updated) {
                            localStorage.setItem(key, JSON.stringify(parsedData));
                        }
                    }
                } catch (parseError) {
                    console.error(`解析${key}失败:`, parseError);
                }
            }
        } catch (error) {
            console.error('清理结算借支本地记录失败:', error);
        }
    }
    
    /**
     * 从本地存储中移除已同步的项目支出记录
     */
    async removeExpenseRecordFromLocalStorage(localRecordId, localRecord) {
        try {
            console.log(`🔍 开始清理项目支出本地记录: ${localRecordId}`);
            
            const key = 'project_expenses';
            const recordJson = localStorage.getItem(key);
            if (!recordJson) return;
            
            try {
                let parsedData = JSON.parse(recordJson);
                
                if (Array.isArray(parsedData)) {
                    const initialLength = parsedData.length;
                    parsedData = parsedData.filter(record => {
                        return !(record.record_id === localRecordId || 
                                (record.record_id === localRecord.record_id &&
                                 record.project_id === localRecord.project_id &&
                                 record.record_date === localRecord.record_date &&
                                 record.amount === localRecord.amount &&
                                 record.is_local === true));
                    });
                    
                    if (parsedData.length < initialLength) {
                        localStorage.setItem(key, JSON.stringify(parsedData));
                        console.log(`✅ 从${key}中移除${initialLength - parsedData.length}条已同步的项目支出记录`);
                    }
                }
            } catch (parseError) {
                console.error(`解析${key}失败:`, parseError);
            }
            
            console.log(`✅ 项目支出本地记录清理完成`);
        } catch (error) {
            console.error('清理项目支出本地记录失败:', error);
        }
    }
    
    /**
     * 从本地存储中移除已同步的项目收入记录
     */
    async removeIncomeRecordFromLocalStorage(localRecordId, localRecord) {
        try {
            console.log(`🔍 开始清理项目收入本地记录: ${localRecordId}`);
            
            const key = 'project_income';
            const recordJson = localStorage.getItem(key);
            if (!recordJson) return;
            
            try {
                let parsedData = JSON.parse(recordJson);
                
                if (Array.isArray(parsedData)) {
                    const initialLength = parsedData.length;
                    parsedData = parsedData.filter(record => {
                        return !(record.record_id === localRecordId || 
                                (record.record_id === localRecord.record_id &&
                                 record.project_id === localRecord.project_id &&
                                 record.record_date === localRecord.record_date &&
                                 record.amount === localRecord.amount &&
                                 record.is_local === true));
                    });
                    
                    if (parsedData.length < initialLength) {
                        localStorage.setItem(key, JSON.stringify(parsedData));
                        console.log(`✅ 从${key}中移除${initialLength - parsedData.length}条已同步的项目收入记录`);
                    }
                }
            } catch (parseError) {
                console.error(`解析${key}失败:`, parseError);
            }
            
            console.log(`✅ 项目收入本地记录清理完成`);
        } catch (error) {
            console.error('清理项目收入本地记录失败:', error);
        }
    }
    
    /**
     * 从本地存储中移除已同步的点工单记录
     */
    async removeWorkRecordFromLocalStorage(localRecordId, localRecord) {
        try {
            const key = 'work_records';
            const recordJson = localStorage.getItem(key);
            if (!recordJson) return;
            
            try {
                let parsedData = JSON.parse(recordJson);
                
                if (Array.isArray(parsedData)) {
                    const initialLength = parsedData.length;
                    parsedData = parsedData.filter(record => {
                        return !(record.work_record_id === localRecordId || 
                                (record.work_record_id === localRecord.work_record_id &&
                                 record.project_id === localRecord.project_id &&
                                 record.record_date === localRecord.record_date &&
                                 record.team_name === localRecord.team_name &&
                                 record.is_local === true));
                    });
                    
                    if (parsedData.length < initialLength) {
                        localStorage.setItem(key, JSON.stringify(parsedData));
                    }
                }
            } catch (parseError) {
                console.error(`解析${key}失败:`, parseError);
            }
        } catch (error) {
            console.error('清理点工单本地记录失败:', error);
        }
    }
    
    /**
     * 从本地存储中移除已同步的施工日志记录
     */
    async removeConstructionLogFromLocalStorage(localRecordId, localRecord) {
        try {
            const key = 'construction_logs';
            const recordJson = localStorage.getItem(key);
            if (!recordJson) return;
            
            try {
                let parsedData = JSON.parse(recordJson);
                
                if (Array.isArray(parsedData)) {
                    const initialLength = parsedData.length;
                    parsedData = parsedData.filter(record => {
                        return !(record.log_id === localRecordId || 
                                (record.log_id === localRecord.log_id &&
                                 record.project_id === localRecord.project_id &&
                                 record.record_date === localRecord.record_date &&
                                 record.is_local === true));
                    });
                    
                    if (parsedData.length < initialLength) {
                        localStorage.setItem(key, JSON.stringify(parsedData));
                    }
                }
            } catch (parseError) {
                console.error(`解析${key}失败:`, parseError);
            }
        } catch (error) {
            console.error('清理施工日志本地记录失败:', error);
        }
    }
    
    /**
     * 从本地存储中移除已同步的员工记录
     */
    async removeEmployeeRecordFromLocalStorage(localRecordId, localRecord) {
        try {
            console.log(`🔍 开始清理员工本地记录: ${localRecordId}`);
            
            // 更新employeeDataCache
            if (window.employeeDataCache && window.employeeDataCache.employees) {
                const initialLength = window.employeeDataCache.employees.length;
                window.employeeDataCache.employees = window.employeeDataCache.employees.filter(record => {
                    return !(record.employee_id === localRecordId || 
                            (record.employee_id === localRecord.employee_id &&
                             record.is_local === true));
                });
                
                if (window.employeeDataCache.employees.length < initialLength) {
                    localStorage.setItem('localEmployeesData', JSON.stringify(window.employeeDataCache.employees));
                    console.log(`✅ 从employeeDataCache中移除${initialLength - window.employeeDataCache.employees.length}条已同步的员工记录`);
                }
            }
            
            // 直接更新localStorage
            const localEmployeesData = localStorage.getItem('localEmployeesData');
            if (localEmployeesData) {
                try {
                    const employees = JSON.parse(localEmployeesData);
                    const initialLength = employees.length;
                    const updatedEmployees = employees.filter(record => {
                        return !(record.employee_id === localRecordId || 
                                (record.employee_id === localRecord.employee_id &&
                                 record.is_local === true));
                    });
                    
                    if (updatedEmployees.length < initialLength) {
                        localStorage.setItem('localEmployeesData', JSON.stringify(updatedEmployees));
                        console.log(`✅ 从localEmployeesData中移除${initialLength - updatedEmployees.length}条已同步的员工记录`);
                    }
                } catch (parseError) {
                    console.error(`解析localEmployeesData失败:`, parseError);
                }
            }
            
            console.log(`✅ 员工本地记录清理完成`);
        } catch (error) {
            console.error('清理员工本地记录失败:', error);
        }
    }
    
    /**
     * 从本地存储中移除已同步的项目记录
     */
    async removeProjectRecordFromLocalStorage(localRecordId, localRecord) {
        try {
            console.log(`🔍 开始清理项目本地记录: ${localRecordId}`);
            
            // 更新projectDataCache
            if (window.projectDataCache) {
                const initialLength = window.projectDataCache.projects.length;
                window.projectDataCache.projects = window.projectDataCache.projects.filter(record => {
                    return !(record.project_id === localRecordId || 
                            (record.project_id === localRecord.project_id &&
                             record.is_local === true));
                });
                
                if (window.projectDataCache.projects.length < initialLength) {
                    localStorage.setItem('localProjectsData', JSON.stringify(window.projectDataCache.projects));
                    console.log(`✅ 从projectDataCache中移除${initialLength - window.projectDataCache.projects.length}条已同步的项目记录`);
                }
            }
            
            // 直接更新localStorage
            const localProjectsData = localStorage.getItem('localProjectsData');
            if (localProjectsData) {
                try {
                    const projects = JSON.parse(localProjectsData);
                    const initialLength = projects.length;
                    const updatedProjects = projects.filter(record => {
                        return !(record.project_id === localRecordId || 
                                (record.project_id === localRecord.project_id &&
                                 record.is_local === true));
                    });
                    
                    if (updatedProjects.length < initialLength) {
                        localStorage.setItem('localProjectsData', JSON.stringify(updatedProjects));
                        console.log(`✅ 从localProjectsData中移除${initialLength - updatedProjects.length}条已同步的项目记录`);
                    }
                } catch (parseError) {
                    console.error(`解析localProjectsData失败:`, parseError);
                }
            }
            
            console.log(`✅ 项目本地记录清理完成`);
        } catch (error) {
            console.error('清理项目本地记录失败:', error);
        }
    }
}

// 创建全局实例
window.offlineSyncService = new OfflineSyncService();

// 导出服务
window.OfflineSyncService = OfflineSyncService;