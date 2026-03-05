class RealtimeSyncService {
    constructor() {
        this.supabase = null;
        // 使用单个通道订阅所有项目的变更
        this.channels = {};
        // 标记是否正在主动取消订阅，防止CLOSED事件触发自动重连
        this.isUnsubscribing = false;
        // 标记网络是否断开
        this.isNetworkOffline = false;
        this.initSupabase();
        
        // 监听网络状态变化
        this.setupNetworkEventListeners();
    }

    async initSupabase() {
        try {
            if (typeof window.supabase !== 'undefined') {
                this.supabase = window.supabase;
            } else if (typeof window.waitForSupabase === 'function') {
                this.supabase = await window.waitForSupabase();
            }
        } catch (error) {
            console.error('RealtimeSyncService: 初始化Supabase客户端失败:', error);
        }
    }

    /**
     * 设置网络状态监听
     */
    setupNetworkEventListeners() {
        // 监听网络连接事件
        window.addEventListener('online', () => this.handleNetworkOnline());
        // 监听网络断开事件
        window.addEventListener('offline', () => this.handleNetworkOffline());
    }

    /**
     * 处理网络连接事件
     */
    handleNetworkOnline() {
        console.log('🌐 网络已连接，重新初始化实时订阅...');
        // 更新网络状态标志
        this.isNetworkOffline = false;
        // 网络恢复后，重新订阅所有项目
        this.subscribeToAllProjects();
    }

    /**
     * 处理网络断开事件
     */
    handleNetworkOffline() {
        console.log('🌐 网络已断开，关闭所有实时订阅...');
        // 更新网络状态标志
        this.isNetworkOffline = true;
        // 网络断开时，取消所有订阅
        this.unsubscribeFromAllProjects();
    }

    // 获取当前登录用户ID
    getUserId() {
        try {
            const currentUserStr = localStorage.getItem('currentUser');
            if (currentUserStr) {
                const currentUser = JSON.parse(currentUserStr);
                return currentUser.user_id || 'default';
            }
        } catch (e) {
            console.error('解析currentUser失败:', e);
        }
        return 'default';
    }

    // 从本地存储获取当前用户的所有在建项目
    getCurrentUserProjects() {
        const userId = this.getUserId();
        const projectsData = localStorage.getItem('project_cache_' + userId);
        if (projectsData) {
            try {
                const projects = JSON.parse(projectsData);
                // 只返回状态为"在建"的项目
                return projects.filter(project => project.status === '在建');
            } catch (e) {
                console.error('解析项目数据失败:', e);
            }
        }
        return [];
    }

    // 使用单个通道订阅所有项目的变更
    async subscribeToAllProjects() {
        if (!this.supabase) {
            console.warn('❌ Supabase客户端未初始化，无法订阅实时更新');
            return;
        }

        const channelName = `all_projects_changes`;
        
        // 如果该通道已经存在，先取消订阅
        if (this.channels[channelName]) {
            this.unsubscribeFromAllProjects();
        }

        const channel = this.supabase.channel(channelName, {
            config: {
                broadcast: { self: true }
            }
        });

        // 单个通道订阅所有表的变更，不按项目过滤
        channel
            // 考勤记录
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'attendance_records'
            }, (payload) => {
                // 不需要传递projectId，在处理函数中从记录获取
                this.handleAttendanceRecordChange(payload);
            })
            // 结算记录
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'settlement_records'
            }, (payload) => {
                this.handleSettlementRecordChange(payload);
            })
            // 项目支出记录
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'project_expenses'
            }, (payload) => {
                this.handleProjectExpenseChange(payload);
            })
            // 员工记录
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'employees'
            }, (payload) => {
                this.handleEmployeeChange(payload);
            })
            .subscribe((status, err) => {
                if (status === 'CHANNEL_ERROR') {
                    // 网络断开时不打印错误
                    // 静默处理错误，只保留成功日志
                    if (!this.isNetworkOffline) {
                        // 不打印错误日志，只在控制台静默处理
                    }
                    // 5秒后尝试重新订阅
                    setTimeout(() => {
                        // 网络恢复后才重新订阅
                        if (!this.isNetworkOffline) {
                            console.log('🔄 尝试重新订阅所有项目的实时变更...');
                            this.unsubscribeFromAllProjects();
                            this.subscribeToAllProjects();
                        }
                    }, 5000);
                } else if (status === 'TIMED_OUT') {
                    // 网络断开时不打印超时错误
                    if (!this.isNetworkOffline) {
                        // 静默处理超时，只保留成功日志
                        // 3秒后尝试重新订阅
                        setTimeout(() => {
                            console.log('🔄 尝试重新订阅所有项目的实时变更...');
                            this.unsubscribeFromAllProjects();
                            this.subscribeToAllProjects();
                        }, 3000);
                    }
                } else if (status === 'SUBSCRIBED') {
                    console.log(`✅ 成功订阅所有项目的实时变更`);
                } else if (status === 'CLOSED') {
                    
                    // 如果是主动取消订阅或网络断开，不进行自动重连
                    if (this.isUnsubscribing || this.isNetworkOffline) {
                        return;
                    }

                    // 5秒后尝试重新订阅
                    setTimeout(() => {
                        console.log('🔄 尝试重新订阅所有项目的实时变更...');
                        this.unsubscribeFromAllProjects();
                        this.subscribeToAllProjects();
                    }, 5000);
                }
            });

        this.channels[channelName] = channel;
    }

    // 取消订阅所有项目的变更
    unsubscribeFromAllProjects() {
        const channelName = `all_projects_changes`;
        const channel = this.channels[channelName];

        if (channel && this.supabase) {
            // 标记正在主动取消订阅
            this.isUnsubscribing = true;
            try {
                // 调用removeChannel关闭WebSocket连接
                this.supabase.removeChannel(channel);
            } catch (error) {
                // 静默处理错误，只保留成功日志
                // 即使出错，也删除通道引用
            } finally {
                delete this.channels[channelName];
                // 延迟重置标记，确保CLOSED事件已被处理
                setTimeout(() => {
                    this.isUnsubscribing = false;
                }, 1000);
            }
        }
    }

    handleAttendanceRecordChange(payload) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        
        // 对于DELETE事件，需要从本地存储中获取记录的project_id
        let actualProjectId = null;
        if (eventType === 'DELETE') {
            const recordId = oldRecord?.record_id;
            if (recordId) {
                // 从本地存储中查找记录，获取其project_id
                const allRecords = this.getAllAttendanceRecords();
                const deletedRecord = allRecords.find(r => r.record_id === recordId);
                if (deletedRecord && deletedRecord.project_id) {
                    actualProjectId = deletedRecord.project_id;
                }
            }
        } else {
            // 对于INSERT和UPDATE事件，直接从记录中获取project_id
            const recordProjectId = newRecord?.project_id || oldRecord?.project_id;
            if (recordProjectId) {
                actualProjectId = recordProjectId;
            }
        }
        
        // 如果无法获取project_id，直接返回
        if (!actualProjectId) {
            console.warn('⏭️ 无法获取记录的project_id，跳过处理');
            return;
        }
        
        const projectKey = `attendance_records_${actualProjectId}`;
        console.log(`🔄 收到考勤记录变更: ${eventType}`, payload);

        try {
            // 更新所有相关的本地存储键，确保数据一致性
            const storageKeys = [projectKey, 'attendanceRecords', 'attendance_records_cache'];
            
            storageKeys.forEach(localKey => {
                let records = this.getLocalRecords(localKey);

                switch (eventType) {
                    case 'INSERT':
                        this.handleInsert(records, newRecord, localKey);
                        break;
                    case 'UPDATE':
                        this.handleUpdate(records, newRecord, oldRecord, localKey);
                        break;
                    case 'DELETE':
                        // 直接在当前方法中处理删除，确保records变量被正确更新
                        const recordId = oldRecord?.record_id;
                        if (recordId) {
                            const initialLength = records.length;
                            records = records.filter(r => r.record_id !== recordId);
                            
                            if (records.length < initialLength) {
                                this.saveLocalRecords(records, localKey);
                            }
                        }
                        break;
                }
            });

            // 同时更新记工流水使用的本地存储键
            this.updateWorkFlowData(payload);
            
            // 当收到INSERT事件时，检查并清理本地存储中可能存在的重复离线记录
            if (eventType === 'INSERT' && newRecord) {
                this.cleanupDuplicateOfflineRecords(newRecord);
            }

            // 使用记录实际所属的项目ID通知UI更新
            this.notifyUIUpdate('attendance_records', actualProjectId);
        } catch (error) {
            console.error('处理考勤记录变更失败:', error);
        }
    }

    /**
     * 清理本地存储中可能存在的重复离线记录
     * @param {Object} newRecord - 新插入的记录
     */
    cleanupDuplicateOfflineRecords(newRecord) {
        try {
            // 获取本地存储中的所有键
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                
                // 检查是否是离线记录键（格式为attendance_时间戳_随机字符串）
                if (key && key.startsWith('attendance_')) {
                    try {
                        const localRecord = JSON.parse(localStorage.getItem(key) || '{}');
                        
                        // 检查记录是否匹配：相同的员工ID、项目ID、记录日期和工作类型
                        if (localRecord.employee_id === newRecord.employee_id &&
                            localRecord.project_id === newRecord.project_id &&
                            localRecord.record_date === newRecord.record_date &&
                            localRecord.work_type === newRecord.work_type) {
                        
                            // 找到匹配的离线记录，从本地存储中删除
                            localStorage.removeItem(key);
                            console.log(`✅ 清理匹配的离线记录: ${key}`);
                            
                            // 同时从work_records_${userId}中移除可能存在的重复记录
                            this.removeDuplicateFromWorkRecords(newRecord);
                        }
                    } catch (parseError) {
                        console.error(`解析本地记录失败: ${key}`, parseError);
                    }
                }
            }
        } catch (error) {
            console.error('清理重复离线记录失败:', error);
        }
    }

    /**
     * 从work_records中移除重复记录
     * @param {Object} newRecord - 新记录
     */
    removeDuplicateFromWorkRecords(newRecord) {
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
                console.error('RealtimeSyncService: 解析currentUser失败:', e);
            }
            
            // 使用与首页一致的键名：work_records_${userId}
            const workRecordsKey = `work_records_${userId}`;
            let allRecords = [];
            const existingData = localStorage.getItem(workRecordsKey);
            if (existingData) {
                allRecords = JSON.parse(existingData);
            }
            
            // 过滤掉重复记录
            const uniqueRecords = allRecords.filter((record, index, self) => {
                // 找出所有匹配的记录
                const matches = self.filter(r => 
                    r.employee_id === record.employee_id &&
                    r.project_id === record.project_id &&
                    r.record_date === record.record_date &&
                    r.work_type === record.work_type
                );
                
                // 如果只有一条记录，保留
                if (matches.length === 1) {
                    return true;
                }
                
                // 如果有多条记录，保留没有_local字段的记录（数据库来的记录）
                // 或者保留最新的记录
                const recordIsLocal = record._local === true;
                const newRecordHasNoLocal = !newRecord._local;
                
                // 优先保留没有_local字段的记录（数据库来的记录）
                if (recordIsLocal && newRecordHasNoLocal) {
                    return false;
                }
                
                // 否则保留当前记录
                return index === self.findIndex(r => 
                    r.employee_id === record.employee_id &&
                    r.project_id === record.project_id &&
                    r.record_date === record.record_date &&
                    r.work_type === record.work_type
                );
            });
            
            // 如果有重复记录被移除，更新本地存储
            if (uniqueRecords.length !== allRecords.length) {
                localStorage.setItem(workRecordsKey, JSON.stringify(uniqueRecords));
                console.log(`✅ 从work_records中移除了${allRecords.length - uniqueRecords.length}条重复记录`);
            }
        } catch (error) {
            console.error('从work_records中移除重复记录失败:', error);
        }
    }

    /**
     * 更新记工流水数据到本地存储
     */
    updateWorkFlowData(payload) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        
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
                console.error('RealtimeSyncService: 解析currentUser失败:', e);
            }
            
            // 使用与首页一致的键名：work_records_${userId}
            const workRecordsKey = `work_records_${userId}`;
            
            // 获取当前所有考勤记录数据
            let allRecords = [];
            const existingData = localStorage.getItem(workRecordsKey);
            if (existingData) {
                allRecords = JSON.parse(existingData);
            }

            // 根据事件类型更新数据
            switch (eventType) {
                case 'INSERT':
                    if (newRecord) {
                        // 检查记录是否已存在
                        const existingIndex = allRecords.findIndex(r => r.record_id === newRecord.record_id);
                        if (existingIndex === -1) {
                            allRecords.push(newRecord);
                            localStorage.setItem(workRecordsKey, JSON.stringify(allRecords));
                        }
                    }
                    break;
                    
                case 'UPDATE':
                    if (newRecord) {
                        const existingIndex = allRecords.findIndex(r => r.record_id === newRecord.record_id);
                        if (existingIndex !== -1) {
                            allRecords[existingIndex] = newRecord;
                            localStorage.setItem(workRecordsKey, JSON.stringify(allRecords));
                        }
                    }
                    break;
                    
                case 'DELETE':
                    if (oldRecord) {
                        const initialLength = allRecords.length;
                        allRecords = allRecords.filter(r => r.record_id !== oldRecord.record_id);
                        if (allRecords.length < initialLength) {
                            localStorage.setItem(workRecordsKey, JSON.stringify(allRecords));
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('更新记工流水数据失败:', error);
        }
    }

    handleSettlementRecordChange(payload) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        
        // 对于DELETE事件，需要从本地存储中获取记录的project_id
        let actualProjectId = null;
        if (eventType === 'DELETE') {
            const recordId = oldRecord?.settlement_id;
            if (recordId) {
                // 从本地存储中查找记录，获取其project_id
                const allRecords = this.getAllSettlementRecords();
                const deletedRecord = allRecords.find(r => r.settlement_id === recordId);
                if (deletedRecord && deletedRecord.project_id) {
                    actualProjectId = deletedRecord.project_id;
                }
            }
        } else {
            // 对于INSERT和UPDATE事件，直接从记录中获取project_id
            const recordProjectId = newRecord?.project_id || oldRecord?.project_id;
            if (recordProjectId) {
                actualProjectId = recordProjectId;
            }
        }
        
        // 如果无法获取project_id，直接返回
        if (!actualProjectId) {
            console.warn('⏭️ 无法获取记录的project_id，跳过处理');
            return;
        }
        
        const projectKey = `settlement_records_${actualProjectId}`;
        console.log(`🔄 收到结算记录变更: ${eventType}`, payload);

        try {
            // 更新所有相关的本地存储键，确保数据一致性
            const storageKeys = [projectKey, 'settlementRecords', 'settlement_records_cache'];
            
            storageKeys.forEach(localKey => {
                let records = this.getLocalRecords(localKey);

                switch (eventType) {
                    case 'INSERT':
                        this.handleInsert(records, newRecord, localKey);
                        break;
                    case 'UPDATE':
                        this.handleUpdate(records, newRecord, oldRecord, localKey);
                        break;
                    case 'DELETE':
                        // 直接在当前方法中处理删除，确保records变量被正确更新
                        const recordId = oldRecord?.settlement_id;
                        if (recordId) {
                            const initialLength = records.length;
                            records = records.filter(r => r.settlement_id !== recordId);
                            
                            if (records.length < initialLength) {
                                this.saveLocalRecords(records, localKey);
                            }
                        }
                        break;
                }
            });

            // 使用记录实际所属的项目ID通知UI更新
            this.notifyUIUpdate('settlement_records', actualProjectId);
        } catch (error) {
            console.error('处理结算记录变更失败:', error);
        }
    }

    handleProjectExpenseChange(payload) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        
        // 对于DELETE事件，需要从本地存储中获取记录的project_id
        let actualProjectId = null;
        if (eventType === 'DELETE') {
            const recordId = oldRecord?.expense_id;
            if (recordId) {
                // 从本地存储中查找记录，获取其project_id
                const allRecords = this.getAllProjectExpenses();
                const deletedRecord = allRecords.find(r => r.expense_id === recordId);
                if (deletedRecord && deletedRecord.project_id) {
                    actualProjectId = deletedRecord.project_id;
                }
            }
        } else {
            // 对于INSERT和UPDATE事件，直接从记录中获取project_id
            const recordProjectId = newRecord?.project_id || oldRecord?.project_id;
            if (recordProjectId) {
                actualProjectId = recordProjectId;
            }
        }
        
        // 如果无法获取project_id，直接返回
        if (!actualProjectId) {
            console.warn('⏭️ 无法获取记录的project_id，跳过处理');
            return;
        }
        
        const projectKey = `project_expenses_${actualProjectId}`;
        console.log(`🔄 收到项目支出变更: ${eventType}`, payload);

        try {
            // 更新所有相关的本地存储键，确保数据一致性
            const storageKeys = [projectKey, 'project_expenses', 'projectExpenses', 'project_expenses_cache'];

            storageKeys.forEach(localKey => {
                let records = this.getLocalRecords(localKey);

                switch (eventType) {
                    case 'INSERT':
                        this.handleInsert(records, newRecord, localKey);
                        break;
                    case 'UPDATE':
                        this.handleUpdate(records, newRecord, oldRecord, localKey);
                        break;
                    case 'DELETE':
                        // 直接在当前方法中处理删除，确保records变量被正确更新
                        const recordId = oldRecord?.expense_id;
                        if (recordId) {
                            const initialLength = records.length;
                            records = records.filter(r => r.expense_id !== recordId);

                            if (records.length < initialLength) {
                                this.saveLocalRecords(records, localKey);
                            }
                        }
                        break;
                }
            });

            // 使用记录实际所属的项目ID通知UI更新
            this.notifyUIUpdate('project_expenses', actualProjectId);
        } catch (error) {
            console.error('处理项目支出变更失败:', error);
        }
    }

    getLocalRecords(localKey) {
        try {
            const storedData = localStorage.getItem(localKey);
            if (storedData) {
                const parsedData = JSON.parse(storedData);
                if (Array.isArray(parsedData)) {
                    return parsedData;
                } else if (parsedData.attendance_records) {
                    return parsedData.attendance_records;
                } else if (parsedData.settlement_records) {
                    return parsedData.settlement_records;
                } else if (parsedData.project_expenses) {
                    return parsedData.project_expenses;
                } else if (parsedData.employees) {
                    // 处理员工数据格式
                    return parsedData.employees;
                }
            }
        } catch (error) {
            console.error(`解析本地记录失败: ${localKey}`, error);
        }
        return [];
    }

    handleInsert(records, newRecord, localKey) {
        // 根据记录类型使用正确的唯一标识检查重复
        let existingIndex = -1;
        
        if (newRecord.expense_id) {
            // 项目支出记录：使用expense_id作为唯一标识
            existingIndex = records.findIndex(r => r.expense_id === newRecord.expense_id);
        } else if (newRecord.settlement_id) {
            // 结算记录：使用settlement_id作为唯一标识
            existingIndex = records.findIndex(r => r.settlement_id === newRecord.settlement_id);
        } else if (newRecord.record_id) {
            // 考勤记录：使用record_id作为唯一标识
            existingIndex = records.findIndex(r => r.record_id === newRecord.record_id);
        } else if (newRecord.employee_id) {
            // 员工记录：使用employee_id作为唯一标识
            existingIndex = records.findIndex(r => r.employee_id === newRecord.employee_id);
        }

        if (existingIndex === -1) {
            // 只在记录不存在时才添加，避免重复
            records.push(newRecord);
            this.saveLocalRecords(records, localKey);
        }
    }

    handleUpdate(records, newRecord, oldRecord, localKey) {
        let updated = false;

        // 根据记录类型使用正确的唯一标识
        let index = -1;
        if (newRecord.expense_id) {
            // 项目支出记录：使用expense_id作为唯一标识
            index = records.findIndex(r => r.expense_id === newRecord.expense_id);
        } else if (newRecord.settlement_id) {
            // 结算记录：使用settlement_id作为唯一标识
            index = records.findIndex(r => r.settlement_id === newRecord.settlement_id);
        } else if (newRecord.record_id) {
            // 考勤记录：使用record_id作为唯一标识
            index = records.findIndex(r => r.record_id === newRecord.record_id);
        } else if (newRecord.employee_id) {
            // 员工记录：使用employee_id作为唯一标识
            index = records.findIndex(r => r.employee_id === newRecord.employee_id);
        }

        if (index !== -1) {
            // 只在记录存在时才更新，避免创建新记录
            records[index] = newRecord;
            updated = true;
        }

        if (updated) {
            this.saveLocalRecords(records, localKey);
        }
    }

    handleDelete(records, oldRecord, localKey, idField) {
        const initialLength = records.length;
        let recordId = null;
        
        // 根据记录类型使用正确的唯一标识
        if (oldRecord.expense_id) {
            // 项目支出记录：使用expense_id作为唯一标识
            recordId = oldRecord.expense_id;
            idField = 'expense_id';
        } else if (oldRecord.settlement_id) {
            // 结算记录：使用settlement_id作为唯一标识
            recordId = oldRecord.settlement_id;
            idField = 'settlement_id';
        } else if (oldRecord.record_id) {
            // 考勤记录：使用record_id作为唯一标识
            recordId = oldRecord.record_id;
            idField = 'record_id';
        } else if (oldRecord.employee_id) {
            // 员工记录：使用employee_id作为唯一标识
            recordId = oldRecord.employee_id;
            idField = 'employee_id';
        }
        
        // 如果recordId存在，过滤掉该记录
        if (recordId) {
            records = records.filter(r => r[idField] !== recordId);
            
            if (records.length < initialLength) {
                this.saveLocalRecords(records, localKey);
            }
        }
        
        // 无论本地记录是否找到，都强制保存并触发UI更新
        this.saveLocalRecords(records, localKey);
    }

    saveLocalRecords(records, localKey) {
        try {
            localStorage.setItem(localKey, JSON.stringify(records));
        } catch (error) {
            console.error(`保存本地记录失败: ${localKey}`, error);
        }
    }

    handleEmployeeChange(payload) {
        const { eventType, new: newRecord, old: oldRecord } = payload;
        
        // 对于DELETE事件，需要特殊处理
        let actualProjectId = null;
        if (eventType === 'DELETE') {
            // 1. 首先尝试从oldRecord中直接获取project_id（如果实时事件包含的话）
            if (oldRecord?.project_id) {
                actualProjectId = oldRecord.project_id;
            } else {
                const employeeId = oldRecord?.employee_id;
                if (employeeId) {
                    // 2. 优先从删除前保存的本地存储中获取project_id
                    try {
                        const deletingProjectIdKey = `deleting_employee_project_id_${employeeId}`;
                        const deletingProjectId = localStorage.getItem(deletingProjectIdKey);
                        if (deletingProjectId) {
                            actualProjectId = deletingProjectId;
                            localStorage.removeItem(deletingProjectIdKey); // 使用后删除临时存储
                            console.log(`从本地存储获取到删除员工的project_id: ${actualProjectId}`);
                        }
                    } catch (error) {
                        console.error('从删除员工本地存储获取project_id失败:', error);
                    }
                    
                    // 3. 如果没有找到，尝试从本地存储中查找记录，获取其project_id
                    if (!actualProjectId) {
                        try {
                            // 遍历所有employees_前缀的本地存储
                            for (let i = 0; i < localStorage.length; i++) {
                                const key = localStorage.key(i);
                                if (key.startsWith('employees_')) {
                                    try {
                                        const projectData = JSON.parse(localStorage.getItem(key));
                                        if (projectData.employees && Array.isArray(projectData.employees)) {
                                            // 检查该项目中是否包含要删除的员工
                                            const empInProject = projectData.employees.find(e => e.employee_id === employeeId);
                                            if (empInProject) {
                                                // 4. 如果找到员工，使用该项目的project_id
                                                actualProjectId = projectData.project_id || key.replace('employees_', '');
                                                break;
                                            }
                                        }
                                    } catch (error) {
                                        console.error(`解析项目员工数据失败: ${key}`, error);
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('从本地存储查找员工失败:', error);
                        }
                    }
                }
            }
            
            // 对于DELETE事件，如果仍然无法获取project_id，我们可以尝试一种不同的方法
            // 因为员工要被删除，我们可以直接处理，不需要严格的project_id匹配
            if (!actualProjectId) {
                console.log('⚠️ DELETE事件无法获取project_id，尝试直接处理...');
                // 对于DELETE事件，我们可以不依赖project_id，直接从所有本地存储中删除员工
                this.handleEmployeeDeleteWithoutProjectId(oldRecord);
                return;
            }
        } else {
            // 对于INSERT和UPDATE事件，直接从记录中获取project_id
            const recordProjectId = newRecord?.project_id || oldRecord?.project_id;
            if (recordProjectId) {
                actualProjectId = recordProjectId;
            }
        }
        
        // 对于非DELETE事件，如果无法获取project_id，直接返回
        if (!actualProjectId && eventType !== 'DELETE') {
            console.warn('⏭️ 无法获取记录的project_id，跳过处理');
            return;
        }
        
        const projId = actualProjectId;
        const localKey = `employees_${projId}`;
        console.log(`🔄 收到员工记录变更: ${eventType}`, payload);

        try {
            // 获取当前项目的员工数据
            let projectData = this.getLocalRecords(localKey);
            let records = Array.isArray(projectData) ? projectData : [];

            switch (eventType) {
                case 'INSERT':
                    this.handleEmployeeInsert(records, newRecord, projId, localKey);
                    break;
                case 'UPDATE':
                    this.handleEmployeeUpdate(records, newRecord, oldRecord, projId, localKey);
                    break;
                case 'DELETE':
                    this.handleEmployeeDelete(records, oldRecord, projId, localKey);
                    break;
            }

            // 使用记录实际所属的项目ID通知UI更新
            this.notifyUIUpdate('employees', projId);
        } catch (error) {
            console.error('处理员工记录变更失败:', error);
        }
    }

    handleEmployeeInsert(records, newRecord, projectId, localKey) {
        const existingIndex = records.findIndex(r => r.employee_id === newRecord.employee_id);

        if (existingIndex === -1) {
            // 转换为与首页同步相同的格式
            const enhancedEmployee = {
                employee_id: newRecord.employee_id || '',
                project_id: projectId,
                emp_code: newRecord.emp_code || '',              // 工号
                emp_name: newRecord.emp_name || '',           // 姓名
                status: newRecord.status || '在职',           // 状态
                labor_cost: newRecord.labor_cost || '',           // 工价
                phone: newRecord.phone || '',           // 电话
                id_card: newRecord.id_card || '',        // 身份证
                hire_date: newRecord.hire_date || '',    // 入职日期
                leave_date: newRecord.leave_date || '',    // 离职日期
                remarks: newRecord.remarks || '',           // 备注
                bank_name: newRecord.bank_name || '',           // 银行
                bank_card_number: newRecord.bank_card_number || '',        // 卡号
                bank_address: newRecord.bank_address || ''        // 开户行地址
            };

            records.push(enhancedEmployee);
            this.saveEmployeeRecords(records, projectId, localKey);
        }
    }

    handleEmployeeUpdate(records, newRecord, oldRecord, projectId, localKey) {
        let updated = false;

        if (newRecord.employee_id) {
            const index = records.findIndex(r => r.employee_id === newRecord.employee_id);
            if (index !== -1) {
                // 更新为与首页同步相同的格式
                records[index] = {
                    employee_id: newRecord.employee_id || '',
                    project_id: projectId,
                    emp_code: newRecord.emp_code || '',              // 工号
                    emp_name: newRecord.emp_name || '',           // 姓名
                    status: newRecord.status || '在职',           // 状态
                    labor_cost: newRecord.labor_cost || '',           // 工价
                    phone: newRecord.phone || '',           // 电话
                    id_card: newRecord.id_card || '',        // 身份证
                    hire_date: newRecord.hire_date || '',    // 入职日期
                    leave_date: newRecord.leave_date || '',    // 离职日期
                    remarks: newRecord.remarks || '',           // 备注
                    bank_name: newRecord.bank_name || '',           // 银行
                    bank_card_number: newRecord.bank_card_number || '',        // 卡号
                    bank_address: newRecord.bank_address || ''        // 开户行地址
                };
                updated = true;
            }
        }

        if (updated) {
            this.saveEmployeeRecords(records, projectId, localKey);
        }
    }

    handleEmployeeDelete(records, oldRecord, projectId, localKey) {
        const employeeId = oldRecord?.employee_id;
        if (employeeId) {
            const initialLength = records.length;
            records = records.filter(r => r.employee_id !== employeeId);
            
            if (records.length < initialLength) {
                this.saveEmployeeRecords(records, projectId, localKey);
            }
        }
    }

    saveEmployeeRecords(records, projectId, localKey) {
        try {
            // 按照首页同步的格式保存数据
            const dataToSave = {
                employees: records,
                project_id: projectId,
                timestamp: Date.now()
            };
            
            localStorage.setItem(localKey, JSON.stringify(dataToSave));
            localStorage.setItem(`${localKey}_timestamp`, Date.now().toString());
            
            // 同时更新基本存储
            localStorage.setItem('localEmployeesData', JSON.stringify(this.getAllEmployeesFromProjects()));
        } catch (error) {
            console.error(`保存员工记录失败: ${localKey}`, error);
        }
    }
    
    /**
     * 不依赖project_id直接从所有本地存储中删除员工
     * 用于处理DELETE事件无法获取project_id的情况
     */
    handleEmployeeDeleteWithoutProjectId(oldRecord) {
        try {
            const employeeId = oldRecord?.employee_id;
            if (!employeeId) {
                console.error('删除员工失败: 缺少employee_id');
                return;
            }
            
            console.log(`🔄 直接从所有本地存储中删除员工: ${employeeId}`);
            
            // 遍历所有employees_前缀的本地存储
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('employees_')) {
                    try {
                        const projectData = JSON.parse(localStorage.getItem(key));
                        if (projectData.employees && Array.isArray(projectData.employees)) {
                            // 检查该项目中是否包含要删除的员工
                            const initialLength = projectData.employees.length;
                            projectData.employees = projectData.employees.filter(e => e.employee_id !== employeeId);
                            
                            // 如果员工被删除，更新本地存储
                            if (projectData.employees.length < initialLength) {
                                localStorage.setItem(key, JSON.stringify(projectData));
                                localStorage.setItem(`${key}_timestamp`, Date.now().toString());
                                console.log(`✅ 从 ${key} 中删除员工 ${employeeId} 成功`);
                            }
                        }
                    } catch (error) {
                        console.error(`处理项目员工数据失败: ${key}`, error);
                    }
                }
            }
            
            // 更新基本存储
            localStorage.setItem('localEmployeesData', JSON.stringify(this.getAllEmployeesFromProjects()));
            
            // 通知UI更新所有可能受影响的页面
            this.notifyUIUpdate('employees', null);
            
        } catch (error) {
            console.error('直接删除员工失败:', error);
        }
    }

    getAllEmployeesFromProjects() {
        // 获取所有项目的员工数据并合并
        const allEmployees = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('employees_')) {
                try {
                    const projectData = JSON.parse(localStorage.getItem(key));
                    if (projectData.employees && Array.isArray(projectData.employees)) {
                        allEmployees.push(...projectData.employees);
                    }
                } catch (error) {
                    console.error(`解析项目员工数据失败: ${key}`, error);
                }
            }
        }
        return allEmployees;
    }

    getAllAttendanceRecords() {
        // 获取所有项目的考勤记录并合并
        const allRecords = [];
        const attendanceStorageKeys = ['attendanceRecords', 'attendance_records_cache'];
        
        // 1. 检查所有预定义的考勤记录存储键
        attendanceStorageKeys.forEach(key => {
            try {
                const records = JSON.parse(localStorage.getItem(key));
                if (Array.isArray(records)) {
                    allRecords.push(...records);
                }
            } catch (error) {
                console.error(`解析考勤记录失败: ${key}`, error);
            }
        });
        
        // 2. 检查所有项目特定的考勤记录存储键
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('attendance_records_')) {
                try {
                    const records = JSON.parse(localStorage.getItem(key));
                    if (Array.isArray(records)) {
                        allRecords.push(...records);
                    }
                } catch (error) {
                    console.error(`解析项目考勤记录失败: ${key}`, error);
                }
            }
        }
        return allRecords;
    }

    getAllSettlementRecords() {
        // 获取所有项目的结算记录并合并
        const allRecords = [];
        const settlementStorageKeys = ['settlementRecords', 'settlement_records_cache'];
        
        // 1. 检查所有预定义的结算记录存储键
        settlementStorageKeys.forEach(key => {
            try {
                const records = JSON.parse(localStorage.getItem(key));
                if (Array.isArray(records)) {
                    allRecords.push(...records);
                }
            } catch (error) {
                console.error(`解析结算记录失败: ${key}`, error);
            }
        });
        
        // 2. 检查所有项目特定的结算记录存储键
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('settlement_records_')) {
                try {
                    const records = JSON.parse(localStorage.getItem(key));
                    if (Array.isArray(records)) {
                        allRecords.push(...records);
                    }
                } catch (error) {
                    console.error(`解析项目结算记录失败: ${key}`, error);
                }
            }
        }
        
        return allRecords;
    }

    getAllProjectExpenses() {
        // 获取所有项目的支出记录并合并
        const allRecords = [];
        const expenseStorageKeys = ['projectExpenses', 'project_expenses_cache'];
        
        // 1. 检查所有预定义的支出记录存储键
        expenseStorageKeys.forEach(key => {
            try {
                const records = JSON.parse(localStorage.getItem(key));
                if (Array.isArray(records)) {
                    allRecords.push(...records);
                }
            } catch (error) {
                console.error(`解析支出记录失败: ${key}`, error);
            }
        });
        
        // 2. 检查所有项目特定的支出记录存储键
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('project_expenses_')) {
                try {
                    const records = JSON.parse(localStorage.getItem(key));
                    if (Array.isArray(records)) {
                        allRecords.push(...records);
                    }
                } catch (error) {
                    console.error(`解析项目支出记录失败: ${key}`, error);
                }
            }
        }
        
        return allRecords;
    }

    // 修改notifyUIUpdate方法，接受projectId参数
    notifyUIUpdate(table, projectId) {
        console.log(`📢 通知UI更新: ${table}`, { projectId: projectId });
        const event = new CustomEvent('realtimeDataUpdated', {
            detail: {
                table: table,
                projectId: projectId,
                timestamp: new Date().toISOString()
            }
        });
        window.dispatchEvent(event);
    }

    unsubscribeAll() {
        this.isUnsubscribing = true;
        for (const channelName in this.channels) {
            const channel = this.channels[channelName];
            try {
                if (this.supabase && channel) {
                    console.log(`📴 正在关闭通道 ${channelName} 的实时订阅...`);
                    // 调用removeChannel关闭WebSocket连接
                    this.supabase.removeChannel(channel);
                    console.log(`✅ 通道 ${channelName} 的实时订阅已关闭`);
                }
            } catch (error) {
                // 静默处理错误，只保留成功日志
                // 忽略同步错误，继续处理其他通道
            }
        }
        this.channels = {};
        this.channelProjects = {};
        // 延迟重置标记
        setTimeout(() => {
            this.isUnsubscribing = false;
        }, 1000);
    }
}

const realtimeSyncService = new RealtimeSyncService();

if (typeof window !== 'undefined') {
    window.realtimeSyncService = realtimeSyncService;
}