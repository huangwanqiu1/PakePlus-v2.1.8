// 记账流水服务类
class AccountingFlowService {
    constructor() {
        this.supabase = null;
        this.initSupabase();
        this.records = [];
        // 初始化缓存属性
        this._accountingRecordsCache = null;
        this._markedEmployeesCache = null;
        this._isRefreshingMarkedEmployees = false;
    }

    // 初始化Supabase客户端
    initSupabase() {
        try {
            // 尝试使用全局supabase客户端，如果可用
            if (typeof window.supabase !== 'undefined') {
                this.supabase = window.supabase;
            } else {
                // 全局客户端不可用时，尝试直接初始化
                
                // 使用与supabase-client.js相同的配置
                const supabaseUrl = 'https://oydffrzzulsrbitrrhht.supabase.co';
                const supabaseKey = 'sb_publishable_l3-6N3-RsAmbns6JCOusHg_XPFd4jf7';
                
                // 检查supabase是否可用
                if (typeof supabase !== 'undefined') {
                    this.supabase = supabase.createClient(supabaseUrl, supabaseKey, {
                        auth: {
                            persistSession: false
                        }
                    });
                }
            }
        } catch (error) {
            console.error('AccountingFlowService: 初始化Supabase客户端失败:', error);
        }
    }

    // 获取当前记账日期
    getCurrentRecordDate() {
        // 检查是否是多选模式
        // 从workDateInput的dataset中获取多选日期
        const workDateInput = document.getElementById('workDate');
        if (workDateInput && workDateInput.dataset.displayValue) {
            // 尝试从日期显示值中解析多选日期
            return this.parseMultipleDates(workDateInput.dataset.displayValue);
        }
        
        // 单选模式：返回单个日期
        if (workDateInput && workDateInput.value) {
            return [workDateInput.value];
        }
        
        // 默认返回今天的日期
        return [new Date().toISOString().split('T')[0]];
    }
    
    // 解析多选日期显示值
    parseMultipleDates(displayValue) {
        try {
            // 检查是否是中文日期格式，如"2025年12月：18，20日"
            if (displayValue.includes('年') && displayValue.includes('月') && displayValue.includes('日')) {
                // 提取年份、月份和日期
                const yearMatch = displayValue.match(/(\d+)年/);
                const monthMatch = displayValue.match(/(\d+)月/);
                const daysMatch = displayValue.match(/：([^日]+)日/);
                
                if (yearMatch && monthMatch && daysMatch) {
                    const year = yearMatch[1];
                    const month = monthMatch[1].padStart(2, '0'); // 确保月份是两位数
                    const daysStr = daysMatch[1];
                    
                    // 解析日期列表，处理不同的分隔符
                    const dayList = daysStr.split(/[,，]/).map(day => day.trim());
                    
                    // 构建ISO格式日期数组（使用连字符分隔符）
                return dayList.map(day => {
                    const formattedDay = day.padStart(2, '0'); // 确保日期是两位数
                    return `${year}-${month}-${formattedDay}`;
                });
                }
            }
            
            // 检查是否是逗号分隔的日期列表，如"2025-12-19, 2025-12-20"
            if (displayValue.includes(',')) {
                return displayValue.split(',').map(date => date.trim());
            }
            
            // 单个日期，返回数组
            return [displayValue];
        } catch (error) {
            console.error('解析多选日期失败:', error);
            return [];
        }
    }

    // 获取当前项目ID
    getCurrentProjectId() {
        // 从localStorage获取项目ID
        const projectId = localStorage.getItem('currentProjectId');
        
        // 如果localStorage中没有项目ID，尝试从URL参数中获取
        if (!projectId) {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const projectIdFromUrl = urlParams.get('project_id');
                if (projectIdFromUrl) {
                    // 保存到localStorage
                    localStorage.setItem('currentProjectId', projectIdFromUrl);
                    return projectIdFromUrl;
                }
            } catch (error) {
                console.error('从URL获取项目ID失败:', error);
            }
        }
        
        return projectId || '';
    }
    
    // 获取当前记录类型
    getCurrentRecordType() {
        // 获取当前选中的工作类型标签
        const activeOption = document.querySelector('.work-type-option.active');
        if (activeOption) {
            const radioId = activeOption.getAttribute('for');
            if (radioId) {
                const radio = document.getElementById(radioId);
                if (radio) {
                    // 根据radio的id返回对应的记录类型
                    const recordTypeMap = {
                        'pointWork': '借支',
                        'contractWork': '扣款',
                        'quantityWork': '公司转账',
                        'settleWork': '结算'
                    };
                    return recordTypeMap[radioId] || '';
                }
            }
        }
        return '';
    }

    // 获取记账流水数据（只从本地获取）
    async fetchAccountingRecords() {
        try {
            const recordDates = this.getCurrentRecordDate();
            const projectId = this.getCurrentProjectId();
            const cacheKey = `${projectId}_${JSON.stringify(recordDates)}`;

            if (!projectId) {
                console.error('未找到项目ID，无法获取记账流水数据');
                // 尝试重新获取项目ID
                setTimeout(() => {
                    this.refreshMarkedEmployees();
                }, 1000);
                return [];
            }

            // 检查是否是编辑模式，如果是编辑模式，优先获取特定记录
            const isEditMode = this.isEditMode();
            let specificRecordId = null;
            
            if (isEditMode) {
                const urlParams = new URLSearchParams(window.location.search);
                specificRecordId = urlParams.get('settlement_id');
            }

            // 检查是否有最近的缓存结果（5秒内有效）
            const now = Date.now();
            if (this._accountingRecordsCache && this._accountingRecordsCache.cacheKey === cacheKey && now - this._accountingRecordsCache.timestamp < 5000) {
                // 如果是编辑模式，检查缓存中是否包含需要的记录
                if (!isEditMode || !specificRecordId || 
                    this._accountingRecordsCache.records.some(r => r.settlement_id === specificRecordId)) {
                    return this._accountingRecordsCache.records;
                }
            }

            let records = [];

            if (isEditMode && specificRecordId) {
                // 编辑模式：优先获取特定记录
                records = this._getSpecificRecordFromLocal(specificRecordId, projectId);
            } else {
                // 普通模式：从本地获取数据
                records = this._getLocalAccountingRecords(projectId, recordDates);
            }

            // 更新缓存
            this._accountingRecordsCache = {
                cacheKey: cacheKey,
                records: records,
                timestamp: Date.now()
            };

            return records;
        } catch (error) {
            console.error('获取记账流水数据时发生未知错误:', error);
            // 发生错误时，尝试从本地获取数据
            const recordDates = this.getCurrentRecordDate();
            const projectId = this.getCurrentProjectId();
            return this._getLocalAccountingRecords(projectId, recordDates);
        }
    }
    
    // 为编辑模式获取特定记录
    async _fetchSpecificRecordForEdit(settlementId, projectId, isOnline) {
        try {
            // 直接从本地获取记录
            return this._getSpecificRecordFromLocal(settlementId, projectId);
        } catch (error) {
            console.error('获取编辑记录时发生错误:', error);
            // 发生错误时，尝试从本地获取
            return this._getSpecificRecordFromLocal(settlementId, projectId);
        }
    }
    
    // 从本地存储获取特定记录
    _getSpecificRecordFromLocal(settlementId, projectId) {
        try {
            // 使用Map来存储记录，确保settlementRecords中的记录优先级更高
            const recordMap = new Map();
            
            // 定义存储位置优先级：settlementRecords（最高）> settlement_records_cache > offline_settlement_records
            const storageSources = ['offline_settlement_records', 'settlement_records_cache', 'settlementRecords'];
            
            // 遍历所有存储位置
            storageSources.forEach(source => {
                try {
                    const storedData = localStorage.getItem(source);
                    if (storedData) {
                        const parsedData = JSON.parse(storedData);
                        if (Array.isArray(parsedData)) {
                            parsedData.forEach(record => {
                                if (record && 
                                    record.settlement_id === settlementId && 
                                    record.project_id === projectId) {
                                    // 存储记录，后面的记录（优先级更高）会覆盖前面的记录
                                    recordMap.set(record.settlement_id, record);
                                }
                            });
                        } else if (typeof parsedData === 'object' && parsedData !== null) {
                            // 对象格式：可能按日期分组，遍历所有日期
                            for (const date in parsedData) {
                                if (parsedData.hasOwnProperty(date)) {
                                    const dateRecords = parsedData[date];
                                    if (Array.isArray(dateRecords)) {
                                        dateRecords.forEach(record => {
                                            if (record && 
                                                record.settlement_id === settlementId && 
                                                record.project_id === projectId) {
                                                recordMap.set(record.settlement_id, record);
                                            }
                                        });
                                    }
                                }
                            }
                        }
                    }
                } catch (sourceError) {
                    console.error(`从${source}获取特定记录失败:`, sourceError);
                }
            });
            
            // 检查同步队列中是否有对应的记录
            try {
                const syncQueue = localStorage.getItem('offlineSyncQueue');
                if (syncQueue) {
                    const parsedQueue = JSON.parse(syncQueue);
                    if (Array.isArray(parsedQueue)) {
                        parsedQueue.forEach(item => {
                            if (item.type === 'save_record' && 
                                item.data && 
                                item.data.record && 
                                item.data.record.settlement_id === settlementId &&
                                item.data.record.project_id === projectId) {
                                recordMap.set(settlementId, item.data.record);
                            }
                        });
                    }
                }
            } catch (queueError) {
                console.error('从同步队列获取特定记录失败:', queueError);
            }
            
            // 将Map转换为数组
            return Array.from(recordMap.values());
        } catch (error) {
            console.error('从本地获取特定记录失败:', error);
            return [];
        }
    }

    // 从本地存储获取记账流水数据
    _getLocalAccountingRecords(projectId, recordDates) {
        try {
            // 使用Map来存储记录，确保settlementRecords中的记录优先级更高
            const recordMap = new Map();
            
            // 定义存储位置优先级：settlementRecords（最高）> settlement_records_cache > offline_settlement_records
            const storageSources = ['offline_settlement_records', 'settlement_records_cache', 'settlementRecords'];
            
            // 遍历所有存储位置
            storageSources.forEach(source => {
                try {
                    const storedData = localStorage.getItem(source);
                    if (storedData) {
                        const parsedData = JSON.parse(storedData);
                        if (Array.isArray(parsedData)) {
                            parsedData.forEach(record => {
                                if (record && record.settlement_id) {
                                    // 存储记录，后面的记录（优先级更高）会覆盖前面的记录
                                    recordMap.set(record.settlement_id, record);
                                }
                            });
                        }
                    }
                } catch (sourceError) {
                    console.error(`从${source}获取数据失败:`, sourceError);
                }
            });
            
            // 将Map转换为数组
            const allRecords = Array.from(recordMap.values());
            
            // 过滤条件：项目ID和记录日期
            const filteredRecords = allRecords.filter(record => {
                // 检查项目ID是否匹配
                const isProjectMatch = record.project_id === projectId;
                
                // 检查记录日期是否匹配
                const isDateMatch = recordDates.includes(record.record_date);
                
                return isProjectMatch && isDateMatch;
            });
            
            // 按更新时间或创建时间降序排序，确保最新的记录显示在前面
            filteredRecords.sort((a, b) => {
                const dateA = new Date(a.updated_at || a.created_at || 0);
                const dateB = new Date(b.updated_at || b.created_at || 0);
                return dateB - dateA;
            });
            
            return filteredRecords;
        } catch (error) {
            console.error('从本地获取记账流水数据失败:', error);
            return [];
        }
    }
    
    // 将记录保存到本地缓存
    _saveRecordsToLocalCache(records) {
        try {
            if (Array.isArray(records) && records.length > 0) {
                // 保存到settlement_records_cache
                localStorage.setItem('settlement_records_cache', JSON.stringify(records));
            }
        } catch (error) {
            console.error('保存记录到本地缓存失败:', error);
        }
    }

    // 渲染记账流水列表
    async renderAccountingFlow() {
        // 显示记账列表
        const accountingFlowList = document.getElementById('accountingFlowList');
        accountingFlowList.style.display = 'block';

        // 显示加载状态，避免空白闪烁
        accountingFlowList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">加载中...</div>';

        // 获取记账流水数据
        const records = await this.fetchAccountingRecords();
        this.records = records;

        if (records.length === 0) {
            accountingFlowList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">没有找到记账流水记录</div>';
            return;
        }

        // 按员工分组记录，并按工号排序
        const recordsByEmployee = this.groupRecordsByEmployee(records);
        
        // 获取员工工号并排序
        const sortedEmployees = this.sortEmployeesByEmpCode(recordsByEmployee);

        // 批量生成HTML，减少DOM操作次数
        let htmlString = '';
        sortedEmployees.forEach(employeeName => {
            const employeeRecords = recordsByEmployee[employeeName];
            const recordHtml = this.renderSingleEmployeeRecords(employeeName, employeeRecords);
            htmlString += recordHtml;
        });

        // 计算合计
        const totals = this.calculateTotals(records);
        
        // 添加合计显示
        htmlString += this.renderTotals(totals);

        // 一次性更新DOM，减少重排重绘
        accountingFlowList.innerHTML = htmlString;
        
        // 绑定审核按钮的点击事件
        this.bindAuditButtonEvents();
        
        // 绑定图片图标的点击事件
        this.bindImageIconEvents();
    }
    
    // 绑定审核按钮事件 - 确保只绑定一次
    bindAuditButtonEvents() {
        // 使用事件委托，确保所有审核按钮都能被正确绑定
        const accountingFlowList = document.getElementById('accountingFlowList');
        if (accountingFlowList) {
            // 先移除可能存在的事件监听器，避免重复绑定
            accountingFlowList.removeEventListener('click', this._handleAuditClick);
            // 添加新的事件监听器
            accountingFlowList.addEventListener('click', this._handleAuditClick.bind(this));
        }
    }
    
    // 审核按钮点击事件处理函数
    async _handleAuditClick(e) {
        const auditButton = e.target.closest('.audit-button');
        if (auditButton && !auditButton.disabled) {
            // 立即禁用按钮，防止重复点击
            auditButton.disabled = true;
            auditButton.setAttribute('disabled', 'disabled');
            
            // 阻止事件冒泡，避免触发父容器的编辑跳转
            e.preventDefault();
            e.stopPropagation();
            
            const settlementId = auditButton.dataset.settlementId;
            if (settlementId) {
                await this.handleAudit(settlementId);
            }
        }
    }
    
    // 处理审核操作
    async handleAudit(settlementId) {
        try {
            // 查找对应的审核按钮
            const auditButton = document.querySelector(`.audit-button[data-settlement-id="${settlementId}"]`);
            if (!auditButton) {
                console.error('未找到对应的审核按钮');
                return;
            }
            
            // 检查网络状态
            const isOnline = navigator.onLine;
            
            // 更新本地缓存中的审核状态
            this._updateLocalSettlementRecordAuditStatus(settlementId);
            
            if (isOnline && this.supabase) {
                // 在线模式：直接调用Supabase API
                const { data, error } = await this.supabase
                    .from('settlement_records')
                    .update({ audit_status: '已审核' })
                    .eq('settlement_id', settlementId);
                
                if (error) {
                    console.error('审核失败:', error);
                    alert('审核失败，请重试！');
                    return;
                }
                

            } else {
                // 离线模式：将操作添加到同步队列
                console.log('离线模式，将审核操作添加到同步队列');
                
                // 构建审核数据
                const auditData = {
                    table: 'settlement_records',
                    settlement_id: settlementId,
                    audit_status: '已审核'
                };
                
                // 添加到同步队列
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('update_audit', auditData, settlementId, '借支审核状态');
                }
            }
            
            // 清除缓存，确保下次获取数据时从Supabase重新获取最新数据
            this._accountingRecordsCache = null;
            
            // 直接更新审核按钮的状态，而不是重新加载整个数据
            this.updateAuditButtonStatus(auditButton);
        } catch (error) {
            console.error('审核操作发生未知错误:', error);
            alert('审核失败，请重试！');
        }
    }
    
    // 更新本地缓存中的结算记录审核状态
    _updateLocalSettlementRecordAuditStatus(settlementId) {
        try {
            // 获取所有可能的缓存位置
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
                                if (record && record.settlement_id === settlementId) {
                                    return { ...record, audit_status: '已审核' };
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
                                            if (record && record.settlement_id === settlementId) {
                                                return { ...record, audit_status: '已审核' };
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
        } catch (error) {
            console.error('更新本地缓存中的审核状态失败:', error);
        }
    }
    
    // 更新审核按钮状态
    updateAuditButtonStatus(auditButton) {
        // 更新按钮样式为已审核状态
        auditButton.style.cssText = 'margin-left: 10px; cursor: not-allowed; border: none; font-size: 14px; color: white; vertical-align: middle; background: linear-gradient(135deg, #52c41a, #73d13d); padding: 6px 12px; border-radius: 16px; box-shadow: 0 2px 4px rgba(82, 196, 26, 0.3); transition: all 0.3s ease; font-weight: 500; opacity: 0.7;';
        
        // 更新按钮内容为已审核状态
        auditButton.innerHTML = '<span style="font-size: 1.5em; display: inline-block; vertical-align: middle; line-height: 1;">✓</span> 已审核';
        
        // 禁用按钮
        auditButton.disabled = true;
        auditButton.setAttribute('disabled', 'disabled');
        auditButton.setAttribute('onclick', 'event.preventDefault(); event.stopPropagation(); return false;');
        
        // 移除悬停效果
        auditButton.removeAttribute('onmouseover');
        auditButton.removeAttribute('onmouseout');
        
        // 获取工作流记录容器
        const workFlowRecord = auditButton.closest('.work-flow-record');
        
        // 更新包含员工姓名的记录行颜色
        const recordRow = workFlowRecord.querySelector('.record-row');
        if (recordRow) {
            recordRow.style.color = '#1890ff';
        }
        
        // 更新员工姓名的颜色
        const employeeNameSpan = workFlowRecord.querySelector('.record-row span');
        if (employeeNameSpan) {
            employeeNameSpan.style.color = '#1890ff';
        }
    }

    // 按员工分组记录
    groupRecordsByEmployee(records) {
        return records.reduce((groups, record) => {
            const employeeName = this.getEmployeeNameById(record.employee_id) || '未知员工';
            if (!groups[employeeName]) {
                groups[employeeName] = [];
            }
            groups[employeeName].push(record);
            return groups;
        }, {});
    }

    // 通过员工ID获取员工姓名
    getEmployeeNameById(employeeId) {
        // 从员工数据中查找员工姓名
        if (typeof window.employees !== 'undefined' && Array.isArray(window.employees)) {
            const employee = window.employees.find(emp => emp.ID === employeeId);
            return employee ? employee.姓名 : null;
        }
        
        // 从localStorage中获取员工数据
        try {
            const projectId = this.getCurrentProjectId();
            const localKey = `employees_${projectId}`;
            const savedData = localStorage.getItem(localKey);
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                if (parsedData.employees && Array.isArray(parsedData.employees)) {
                    const employee = parsedData.employees.find(emp => emp.employee_id === employeeId);
                    return employee ? employee.emp_name : null;
                }
            }
        } catch (error) {
            console.error('从localStorage获取员工数据失败:', error);
        }
        
        return null;
    }

    // 获取员工工号
    getEmployeeEmpCodeById(employeeId) {
        // 从员工数据中查找员工工号
        if (typeof window.employees !== 'undefined' && Array.isArray(window.employees)) {
            const employee = window.employees.find(emp => emp.ID === employeeId);
            return employee ? parseInt(employee.工号) || 0 : 0;
        }
        
        // 从localStorage中获取员工数据
        try {
            const projectId = this.getCurrentProjectId();
            const localKey = `employees_${projectId}`;
            const savedData = localStorage.getItem(localKey);
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                if (parsedData.employees && Array.isArray(parsedData.employees)) {
                    const employee = parsedData.employees.find(emp => emp.employee_id === employeeId);
                    return employee ? parseInt(employee.emp_code) || 0 : 0;
                }
            }
        } catch (error) {
            console.error('从localStorage获取员工工号失败:', error);
        }
        
        return 0;
    }

    // 按员工工号排序员工列表
    sortEmployeesByEmpCode(recordsByEmployee) {
        // 创建员工信息映射，包含员工姓名和工号
        const employeeInfoMap = {};
        
        // 遍历记录，获取每个员工的工号
        for (const employeeName in recordsByEmployee) {
            if (recordsByEmployee.hasOwnProperty(employeeName)) {
                const records = recordsByEmployee[employeeName];
                if (records.length > 0) {
                    const employeeId = records[0].employee_id;
                    const empCode = this.getEmployeeEmpCodeById(employeeId);
                    employeeInfoMap[employeeName] = empCode;
                }
            }
        }
        
        // 按工号排序员工姓名
        return Object.keys(employeeInfoMap).sort((a, b) => {
            return employeeInfoMap[a] - employeeInfoMap[b];
        });
    }

    // 渲染单个员工的记账记录
    renderSingleEmployeeRecords(employeeName, records) {
        // 直接为每条记录创建列表项，不再按类型分组
        let recordHtml = '';
        
        // 按记录创建时间倒序排序，确保最新的记录在上面
        const sortedRecords = records.sort((a, b) => {
            return new Date(b.created_at) - new Date(a.created_at);
        });
        
        // 为每条记录创建单独的列表项
        sortedRecords.forEach(record => {
            recordHtml += this.renderSingleRecordAsListItem(employeeName, record);
        });

        return recordHtml;
    }
    
    // 渲染单条记录为列表项
    renderSingleRecordAsListItem(employeeName, record) {
        // 获取记录类型名称
        const recordTypeName = this.getRecordTypeName(record.record_type);
        
        // 检查记录是否已审核
        const isAudited = record.audit_status === '已审核';
        const auditIcon = isAudited ? '<span style="font-size: 1.5em; display: inline-block; vertical-align: middle; line-height: 1;">✓</span>' : '<span style="font-size: 1.5em; display: inline-block; vertical-align: middle; line-height: 1;">!</span>';
        const auditText = isAudited ? '已审核' : '审核';
        
        // 按钮样式
        const buttonStyle = isAudited ? 
            'margin-left: 10px; cursor: not-allowed; border: none; font-size: 14px; color: white; vertical-align: middle; background: linear-gradient(135deg, #52c41a, #73d13d); padding: 6px 12px; border-radius: 16px; box-shadow: 0 2px 4px rgba(82, 196, 26, 0.3); transition: all 0.3s ease; font-weight: 500; opacity: 0.7;' : 
            'margin-left: 10px; cursor: pointer; border: none; font-size: 14px; color: white; vertical-align: middle; background: linear-gradient(135deg, #ff4d4f, #ff7875); padding: 6px 12px; border-radius: 16px; box-shadow: 0 2px 4px rgba(255, 77, 79, 0.3); transition: all 0.3s ease; font-weight: 500;';
        
        // 检查是否有图片
        const hasImages = Array.isArray(record.image_ids) && record.image_ids.length > 0;
        
        // 生成图片图标
        let imageIcons = '';
        if (hasImages) {
            imageIcons = record.image_ids.map((imageId, index) => {
                const imageUrl = this.getImageUrl(imageId);
                if (imageUrl) {
                    return `<span class="accounting-flow-image-icon" data-url="${imageUrl}" data-index="${index}" 
                        style="color: #1890ff; cursor: pointer; margin-left: 5px; display: inline-block;"
                        title="点击预览图片${index + 1}">🖼️</span>`;
                }
                return '';
            }).filter(icon => icon !== '').join(' ');
        }
        
        // 构建编辑模式URL
        const editUrl = '结算借支.html?edit=true'
            + '&settlement_id=' + encodeURIComponent(record.settlement_id)
            + '&project_id=' + encodeURIComponent(record.project_id)
            + '&record_date=' + encodeURIComponent(record.record_date)
            + '&record_type=' + encodeURIComponent(record.record_type)
            + '&amount=' + encodeURIComponent(record.amount)
            + '&payer=' + encodeURIComponent(record.payer || '')
            + '&remark=' + encodeURIComponent(record.remark || '')
            + '&employee_ids=' + encodeURIComponent(record.employee_id)
            + '&image_ids=' + encodeURIComponent((record.image_ids || []).join(','));
        
        let listHtml = `
            <div class="work-flow-record" style="margin-bottom: 15px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background-color: white; transition: all 0.3s ease; cursor: pointer;" onmouseover="this.style.boxShadow='0 4px 12px rgba(0, 0, 0, 0.1)'; this.style.transform='translateY(-2px)';" onmouseout="this.style.boxShadow='none'; this.style.transform='translateY(0)';" onclick="if (event.target.closest('.audit-button') === null) { window.location.href='${editUrl}'; }">
                <div class="record-row" style="margin-bottom: 8px; font-weight: bold; ${isAudited ? 'color: #1890ff;' : 'color: red;'} font-size: 18px;">
                    <div class="record-content" style="display: inline-block;">
                        <span style="${isAudited ? 'color: #1890ff;' : 'color: red;'}">${employeeName}</span>${imageIcons}
                    </div>
                    <button class="audit-button" 
                        data-settlement-id="${record.settlement_id}" 
                        style="${buttonStyle}; pointer-events: auto; position: relative; z-index: 10; margin-left: 10px;"
                        ${isAudited ? 'disabled' : ''}
                        onmouseover="${isAudited ? '' : 'this.style.transform=\'translateY(-2px)\'; this.style.boxShadow=\'0 4px 8px rgba(255, 77, 79, 0.4)\';'}"
                        onmouseout="${isAudited ? '' : 'this.style.transform=\'translateY(0)\'; this.style.boxShadow=\'0 2px 4px rgba(255, 77, 79, 0.3)\';'}">
                        ${auditIcon} ${auditText}
                </button>
                </div>
                <div class="record-row" style="margin-bottom: 8px; color: #999;">${recordTypeName}：</div>
        `;

        // 渲染记录详情
        if (record.record_type === '借支') {
            listHtml += `
                <div class="record-row" style="margin-bottom: 4px; margin-left: 10px;">
                    金额：${record.amount}元
                </div>
                <div class="record-row" style="margin-bottom: 4px; margin-left: 10px;">付款人：${record.payer || '无'}</div>
            `;
        } else if (record.record_type === '扣款') {
            listHtml += `
                <div class="record-row" style="margin-bottom: 4px; margin-left: 10px;">
                    金额：${record.amount}元
                </div>
            `;
        } else if (record.record_type === '公司转账') {
            listHtml += `
                <div class="record-row" style="margin-bottom: 4px; margin-left: 10px;">
                    金额：${record.amount}元
                </div>
            `;
        } else if (record.record_type === '结算') {
            listHtml += `
                <div class="record-row" style="margin-bottom: 4px; margin-left: 10px;">
                    金额：${record.amount}元
                </div>
                <div class="record-row" style="margin-bottom: 4px; margin-left: 10px;">付款人：${record.payer || '无'}</div>
            `;
        }

        // 添加备注
        if (record.remark) {
            listHtml += `<div class="record-row" style="margin-bottom: 4px; margin-left: 10px; font-size: 12px; color: #666;">备注：${record.remark}</div>`;
        }

        listHtml += '</div>';
        return listHtml;
    }



    // 获取记录类型名称
    getRecordTypeName(recordType) {
        const recordTypeMap = {
            '借支': '借支',
            '扣款': '扣款',
            '公司转账': '公司转账',
            '结算': '结算'
        };
        return recordTypeMap[recordType] || recordType;
    }

    // 处理当日流水标签切换
    handleDailyFlowTabChange(show) {
        const accountingFlowList = document.getElementById('accountingFlowList');
        if (show) {
            // 显示当日流水，渲染记账列表
            this.renderAccountingFlow();
        } else {
            // 隐藏当日流水
            accountingFlowList.style.display = 'none';
        }
    }

    // 从本地获取已记员工记录
    async fetchMarkedEmployees(recordType) {
        try {
            const recordDates = this.getCurrentRecordDate();
            const projectId = this.getCurrentProjectId();
            // 更新缓存键，包含记录类型
            const cacheKey = `${projectId}_${JSON.stringify(recordDates)}_${recordType}`;

            if (!projectId) {
                console.error('未找到项目ID，无法获取已记员工记录');
                // 尝试重新获取项目ID
                setTimeout(() => {
                    this.refreshMarkedEmployees();
                }, 1000);
                return [];
            }
            
            // 检查是否有最近的缓存结果（5秒内有效）
            const now = Date.now();
            if (this._markedEmployeesCache && this._markedEmployeesCache.cacheKey === cacheKey && now - this._markedEmployeesCache.timestamp < 5000) {
                
                return this._markedEmployeesCache.employeeIds;
            }
            
            // 使用Set处理唯一性，参考记工中的逻辑
            const markedEmployeeIds = new Set();
            
            // 从本地存储获取所有相关记录，包括确认记账和保存修改的数据
            try {
                // 获取所有可能存储已记员工记录的位置，优先级：settlementRecords（最高）> settlement_records_cache > offline_settlement_records
                const sources = ['settlement_records_cache', 'offline_settlement_records', 'settlementRecords'];
                
                // 遍历所有存储位置
                sources.forEach(source => {
                    try {
                        const records = localStorage.getItem(source);
                        if (records) {
                            const parsedRecords = JSON.parse(records);
                            
                            // 处理数组格式
                            if (Array.isArray(parsedRecords)) {
                                parsedRecords.forEach(record => {
                                    // 检查记录是否有效，并且匹配当前项目、日期和记录类型
                                    if (record && 
                                        record.project_id === projectId && 
                                        recordDates.includes(record.record_date) && 
                                        record.record_type === recordType &&
                                        record.employee_id) {
                                        markedEmployeeIds.add(record.employee_id);
                                    }
                                });
                            } 
                            // 处理对象格式（按日期分组）
                            else if (typeof parsedRecords === 'object' && parsedRecords !== null) {
                                for (const date in parsedRecords) {
                                    if (parsedRecords.hasOwnProperty(date)) {
                                        const dateRecords = parsedRecords[date];
                                        if (Array.isArray(dateRecords)) {
                                            dateRecords.forEach(record => {
                                                if (record && 
                                                    record.project_id === projectId && 
                                                    recordDates.includes(record.record_date) && 
                                                    record.record_type === recordType &&
                                                    record.employee_id) {
                                                    markedEmployeeIds.add(record.employee_id);
                                                }
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`从localStorage的${source}获取已记员工记录失败:`, error);
                    }
                });
                
                // 检查同步队列，获取待同步的记录
                try {
                    const syncQueue = localStorage.getItem('offlineSyncQueue');
                    if (syncQueue) {
                        const parsedQueue = JSON.parse(syncQueue);
                        if (Array.isArray(parsedQueue)) {
                            parsedQueue.forEach(item => {
                                if (item.type === 'save_record' && item.data && item.data.record) {
                                    const record = item.data.record;
                                    if (record.table === 'settlement_records' && 
                                        record.project_id === projectId && 
                                        recordDates.includes(record.record_date) && 
                                        record.record_type === recordType &&
                                        record.employee_id) {
                                        markedEmployeeIds.add(record.employee_id);
                                    }
                                }
                            });
                        }
                    }
                } catch (error) {
                    console.error('从同步队列获取已记员工记录失败:', error);
                }
            } catch (error) {
                console.error('从localStorage获取已记员工记录失败:', error);
            }

            const result = Array.from(markedEmployeeIds);
            
            // 更新缓存，包含记录类型
            this._markedEmployeesCache = {
                cacheKey: cacheKey,
                employeeIds: result,
                timestamp: Date.now()
            };
            
            return result;
        } catch (error) {
            console.error('获取已记员工记录时发生未知错误:', error);
            return [];
        }
    }
    
    // 缓存结算记录到localStorage
    _cacheSettlementRecords(records, projectId) {
        try {
            // 1. 确保records是数组
            if (!Array.isArray(records)) {
                console.error('待缓存的记录不是数组，类型：', typeof records);
                return;
            }
            
            // 2. 获取所有可能的缓存位置
            const cacheSources = ['settlement_records_cache', 'settlementRecords', 'offline_settlement_records'];
            
            // 3. 合并所有现有记录
            let allExistingRecords = [];
            cacheSources.forEach(source => {
                try {
                    const storedRecords = localStorage.getItem(source);
                    if (storedRecords) {
                        const parsedRecords = JSON.parse(storedRecords);
                        if (Array.isArray(parsedRecords)) {
                            // 数组格式，直接合并
                            allExistingRecords = [...allExistingRecords, ...parsedRecords];
                        } else if (typeof parsedRecords === 'object' && parsedRecords !== null) {
                            // 对象格式，可能按日期分组，遍历所有日期
                            for (const date in parsedRecords) {
                                if (parsedRecords.hasOwnProperty(date)) {
                                    const dateRecords = parsedRecords[date];
                                    if (Array.isArray(dateRecords)) {
                                        allExistingRecords = [...allExistingRecords, ...dateRecords];
                                    }
                                }
                            }
                        } else {
                            console.error(`${source}中的记录不是有效格式，类型：`, typeof parsedRecords);
                        }
                    }
                } catch (error) {
                    console.error(`从${source}读取现有记录失败:`, error);
                }
            });
            
            // 4. 合并新记录，避免重复
            const allRecords = [...allExistingRecords, ...records];
            
            // 5. 创建唯一记录数组，使用record_id或组合键确保唯一性
            const uniqueRecords = [];
            const recordIds = new Set();
            
            allRecords.forEach(record => {
                // 跳过无效记录
                if (!record || typeof record !== 'object') {
                    return;
                }
                
                // 使用record_id或组合键确保唯一性
                const recordKey = record.record_id || `${record.project_id}_${record.employee_id}_${record.record_date}_${record.record_type}`;
                if (!recordIds.has(recordKey)) {
                    recordIds.add(recordKey);
                    uniqueRecords.push(record);
                }
            });
            
            // 6. 按日期分组缓存记录，方便离线查询
            const recordsByDate = {};
            uniqueRecords.forEach(record => {
                const date = record.record_date;
                if (!recordsByDate[date]) {
                    recordsByDate[date] = [];
                }
                recordsByDate[date].push(record);
            });
            
            // 7. 保存到多个位置，确保数据可靠性
            cacheSources.forEach(source => {
                try {
                    // 保存所有唯一记录，避免对象格式导致的错误
                    localStorage.setItem(source, JSON.stringify(uniqueRecords));
                } catch (error) {
                    console.error(`保存到${source}失败:`, error);
                }
            });
            
        } catch (error) {
            console.error('缓存结算记录失败:', error);
        }
    }
    
    // 从localStorage获取结算记录
    getLocalSettlementRecords() {
        try {
            const records = localStorage.getItem('settlementRecords');
            if (records) {
                return JSON.parse(records);
            }
        } catch (error) {
            console.error('从localStorage获取结算记录失败:', error);
        }
        return [];
    }

    // 刷新已记标记 - 添加防重复调用机制
    async refreshMarkedEmployees() {
        // 防止短时间内重复调用
        if (this._isRefreshingMarkedEmployees) {
            return;
        }
        
        // 检查是否处于编辑模式，如果是则不执行标记操作
        if (this.isEditMode()) {
            // 在编辑模式下，确保所有员工都被取消标记并恢复可选状态
            this.unmarkAllEmployees();
            return;
        }
        
        this._isRefreshingMarkedEmployees = true;
        
        try {
            // 清除缓存，确保获取最新数据
            this._markedEmployeesCache = null;
            this._accountingRecordsCache = null;
            
            // 获取当前记录类型
            const recordType = this.getCurrentRecordType();
            // 获取已记员工列表，传入当前记录类型
            const markedEmployeeIds = await this.fetchMarkedEmployees(recordType);
            
            // 渲染已记标记
            this.renderMarkedEmployees(markedEmployeeIds);
        } finally {
            // 确保标志被重置
            this._isRefreshingMarkedEmployees = false;
        }
    }
    
    // 检查是否处于编辑模式
    isEditMode() {
        // 从URL参数检查是否处于编辑模式
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('edit') === 'true';
    }
    
    // 取消所有员工的已记标记
    unmarkAllEmployees() {
        // 获取员工列表容器
        const employeeList = document.getElementById('employeeList');
        if (!employeeList) return;
        
        // 获取所有员工项
        const employeeItems = employeeList.querySelectorAll('.employee-item');
        if (!employeeItems) return;
        
        // 遍历所有员工项，取消已记标记
        employeeItems.forEach(item => {
            this.unmarkAsRecorded(item);
        });
    }

    // 渲染已记标记
    renderMarkedEmployees(markedEmployeeIds) {
        // 获取员工列表容器
        const employeeList = document.getElementById('employeeList');
        if (!employeeList) return;
        
        // 获取所有员工项
        const employeeItems = employeeList.querySelectorAll('.employee-item');
        if (!employeeItems) return;
        
        // 遍历员工项，添加或移除已记标记
        employeeItems.forEach(item => {
            // 获取员工ID
            const employeeId = item.dataset.employeeId;
            if (!employeeId) return;
            
            // 检查员工是否已记
            const isMarked = markedEmployeeIds.includes(employeeId);
            
            if (isMarked) {
                this.markAsRecorded(item);
            } else {
                this.unmarkAsRecorded(item);
            }
        });
    }
    
    // 标记员工为已记
    markAsRecorded(employeeItem) {
        // 添加已记类
        employeeItem.classList.add('recorded-employee');
        
        // 设置员工项样式
        employeeItem.style.opacity = '1';
        employeeItem.style.cursor = 'not-allowed';
        
        // 获取工号元素
        const employeeIdElement = employeeItem.querySelector('.employee-id');
        if (employeeIdElement) {
            // 设置工号元素样式，使用与确认记账按钮相同的紫色渐变
            employeeIdElement.style.cssText = `
                background: linear-gradient(135deg, #722ed1 0%, #531dab 100%);
                color: white;
                text-align: center;
                vertical-align: top;
                padding: 3px 0 18px 0;
                position: relative;
            `;
            
            // 检查是否已经有已记标记
            let recordedLabel = employeeItem.querySelector('.recorded-label');
            if (!recordedLabel) {
                // 创建已记标记
                recordedLabel = document.createElement('div');
                recordedLabel.className = 'recorded-label';
                recordedLabel.textContent = '已记';
                
                // 设置已记标记样式
                recordedLabel.style.cssText = `
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 100%;
                    height: 40%;
                    background-color: #f0f0f0;
                    border-radius: 50% 50% 0 0 / 100% 100% 0 0;
                    box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.1);
                    display: flex;
                    align-items: flex-end;
                    justify-content: center;
                    font-size: 10px;
                    color: #531dab;
                    padding-bottom: 2px;
                `;
                
                // 将已记标记添加到工号元素中
                employeeIdElement.appendChild(recordedLabel);
            }
        }
        
        // 获取并设置复选框样式
        const checkbox = employeeItem.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.disabled = true;
            checkbox.checked = false;
            checkbox.style.opacity = '0.5';
        }
        
        // 移除之前可能存在的事件监听器
        this._removeEventListeners(employeeItem);
        
        // 阻止员工项的点击事件，确保无法被选中
        employeeItem.addEventListener('click', this._preventSelection, true);
        
        // 阻止员工项的鼠标按下事件
        employeeItem.addEventListener('mousedown', this._preventSelection, true);
        
        // 阻止员工项的触摸事件
        employeeItem.addEventListener('touchstart', this._preventSelection, true);
    }
    
    // 阻止选择的事件处理函数
    _preventSelection(e) {
        e.stopPropagation();
        e.preventDefault();
    }
    
    // 移除事件监听器
    _removeEventListeners(element) {
        // 移除所有可能的事件监听器
        element.removeEventListener('click', this._preventSelection, true);
        element.removeEventListener('mousedown', this._preventSelection, true);
        element.removeEventListener('touchstart', this._preventSelection, true);
    }
    
    // 取消员工已记标记
    unmarkAsRecorded(employeeItem) {
        // 移除已记类
        employeeItem.classList.remove('recorded-employee');
        
        // 恢复员工项样式
        employeeItem.style.opacity = '';
        employeeItem.style.cursor = '';
        
        // 获取工号元素
        const employeeIdElement = employeeItem.querySelector('.employee-id');
        if (employeeIdElement) {
            // 恢复工号元素原始样式
            employeeIdElement.style.cssText = '';
            
            // 移除已记标记
            const recordedLabel = employeeItem.querySelector('.recorded-label');
            if (recordedLabel) {
                recordedLabel.remove();
            }
        }
        
        // 获取并恢复复选框样式
        const checkbox = employeeItem.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.disabled = false;
            checkbox.style.opacity = '';
        }
        
        // 移除事件监听器，恢复员工的可点击状态
        this._removeEventListeners(employeeItem);
    }

    // 绑定日期变化事件
    bindDateChangeEvent() {
        // 防抖函数，避免短时间内多次触发
        let debounceTimer = null;
        const debouncedHandleDateChange = () => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(() => {
                this.handleDateChange();
            }, 200);
        };
        
        const workDateInput = document.getElementById('workDate');
        if (workDateInput) {
            // 只绑定change事件，避免重复触发
            workDateInput.addEventListener('change', debouncedHandleDateChange);
        }
        
        // 查找日期选择器的确认按钮，并绑定点击事件
        const confirmDatesBtn = document.getElementById('confirmDates');
        if (confirmDatesBtn) {
            confirmDatesBtn.addEventListener('click', debouncedHandleDateChange);
        }
        
        // 查找日期选择器的日历单元格，并绑定点击事件
        const calendarDays = document.getElementById('calendarDays');
        if (calendarDays) {
            calendarDays.addEventListener('click', (e) => {
                // 检查点击的是否是日期单元格
                const dayCell = e.target.closest('.day-cell');
                if (dayCell && !dayCell.classList.contains('other-month') && !dayCell.classList.contains('disabled-future')) {
                    debouncedHandleDateChange();
                }
            });
        }
    }
    
    // 处理日期变化
    handleDateChange() {
        // 获取当前日期
        const recordDates = this.getCurrentRecordDate();
        
        // 获取当前标签状态
        const tabAccounting = document.getElementById('tabAccounting');
        const tabDailyFlow = document.getElementById('tabDailyFlow');
        
        // 检查当前激活的标签
        const isDailyFlow = tabDailyFlow.checked;
        
        // 直接调用刷新已记标记，不管当前是什么标签
        this.refreshMarkedEmployees();
        
        // 如果是当日流水标签，重新渲染记账列表
        if (isDailyFlow) {
            this.renderAccountingFlow();
        }
    }

    // 处理记账标签切换
    handleAccountingTabChange(show) {
        if (show) {
            // 刷新已记标记
            this.refreshMarkedEmployees();
        }
    }

    // 绑定标签切换事件
    bindTabEvents() {
        // 绑定记账标签切换事件
        document.querySelectorAll('input[name="accountingTab"]').forEach(tab => {
            tab.addEventListener('change', () => {
                const isDailyFlow = document.getElementById('tabDailyFlow').checked;
                this.handleDailyFlowTabChange(isDailyFlow);
                this.handleAccountingTabChange(!isDailyFlow);
            });
        });

        // 初始检查当前标签
        const isDailyFlow = document.getElementById('tabDailyFlow').checked;
        this.handleDailyFlowTabChange(isDailyFlow);
        this.handleAccountingTabChange(!isDailyFlow);
    }

    // 初始化
    init() {
        // 绑定标签切换事件
        this.bindTabEvents();
        
        // 绑定日期变化事件
        this.bindDateChangeEvent();
        
        // 初始刷新已记标记已移至bindTabEvents中，避免重复调用
    }

    // 获取图片URL
    getImageUrl(imageId) {
        try {
            if (!imageId) return null;
            
            // 检查是否是完整的URL
            if (imageId.startsWith('http://') || imageId.startsWith('https://')) {
                return imageId;
            }
            
            // 从Supabase存储获取图片URL
            const supabaseUrl = 'https://oydffrzzulsrbitrrhht.supabase.co';
            const storagePath = 'construction-images';
            return `${supabaseUrl}/storage/v1/object/public/${storagePath}/${imageId}`;
        } catch (error) {
            console.error('获取图片URL失败:', error);
            return null;
        }
    }

    // 绑定图片图标点击事件
    bindImageIconEvents() {
        const imageIcons = document.querySelectorAll('.accounting-flow-image-icon');
        imageIcons.forEach(icon => {
            icon.removeEventListener('click', this._handleImageIconClick);
            icon.addEventListener('click', this._handleImageIconClick.bind(this));
        });
    }

    // 处理图片图标点击事件
    _handleImageIconClick(e) {
        e.stopPropagation();
        const url = e.target.dataset.url;
        this.showImagePreview(url);
    }

    // 显示图片预览
    showImagePreview(imageUrl) {
        let modal = document.getElementById('accountingFlowImagePreviewModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'accountingFlowImagePreviewModal';
            modal.style.display = 'none';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 2001;" 
                 onclick="if(event.target === this) document.getElementById('accountingFlowImagePreviewModal').style.display='none'">
                <img id="accountingFlowPreviewDraggableImage" 
                     style="max-width: 90%; max-height: 90%; position: absolute; cursor: move; top: 50%; left: 50%; transform: translate(-50%, -50%);"
                     ondragstart="return false;">
                <button onclick="document.getElementById('accountingFlowImagePreviewModal').style.display='none'" 
                        style="position: fixed; top: 20px; right: 20px; background: #f5222d; color: white; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 20px; cursor: pointer; z-index: 2002;">×</button>
                <div id="accountingFlowImageLoading" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 18px; z-index: 2003;">加载中...</div>
                <div id="accountingFlowImageError" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 18px; z-index: 2003; display: none;">图片加载失败</div>
            </div>
        `;
        modal.style.display = 'block';

        const img = document.getElementById('accountingFlowPreviewDraggableImage');
        const loading = document.getElementById('accountingFlowImageLoading');
        const error = document.getElementById('accountingFlowImageError');
        let isDragging = false;
        let offsetX, offsetY;
        let scale = 1;

        // 加载图片（带认证）
        this.loadImageWithAuth(imageUrl).then(blob => {
            const objectUrl = URL.createObjectURL(blob);
            img.src = objectUrl;
            loading.style.display = 'none';
            error.style.display = 'none';
        }).catch(err => {
            console.error('图片加载失败:', err);
            loading.style.display = 'none';
            error.style.display = 'block';
        });

        img.addEventListener('mousedown', function(e) {
            isDragging = true;
            offsetX = e.clientX - img.getBoundingClientRect().left;
            offsetY = e.clientY - img.getBoundingClientRect().top;
            img.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            img.style.left = (e.clientX - offsetX) + 'px';
            img.style.top = (e.clientY - offsetY) + 'px';
            img.style.transform = `scale(${scale})`;
        });

        document.addEventListener('mouseup', function() {
            isDragging = false;
            img.style.cursor = 'move';
        });

        img.addEventListener('wheel', function(e) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            scale = Math.max(0.1, Math.min(5, scale + delta));
            img.style.left = '50%';
            img.style.top = '50%';
            img.style.transform = `translate(-50%, -50%) scale(${scale})`;
        });
    }

    // 带认证加载图片
    async loadImageWithAuth(imageUrl) {
        // 检查是否是 Supabase Storage URL
        if (imageUrl.includes('supabase.co/storage/v1/object/public/')) {
            // 从URL中解析 bucketName 和 fileName
            const urlParts = imageUrl.split('supabase.co/storage/v1/object/public/');
            if (urlParts.length > 1) {
                const pathParts = urlParts[1].split('/');
                const bucketName = pathParts[0];
                const fileName = pathParts.slice(1).join('/');
                
                try {
                    // 使用 Supabase Storage API 下载图片（带认证）
                    const supabase = await window.waitForSupabase();
                    const { data, error } = await supabase
                        .storage
                        .from(bucketName)
                        .download(fileName);
                    
                    if (error) {
                        console.error('使用 Supabase API 下载图片失败:', error);
                        // 尝试使用带认证的公开 URL
                        return this.fetchWithAuth(imageUrl);
                    }
                    
                    return data;
                } catch (supabaseError) {
                    console.error('Supabase Storage 下载失败，尝试使用带认证的公开 URL:', supabaseError);
                    // 尝试使用带认证的公开 URL
                    return this.fetchWithAuth(imageUrl);
                }
            }
        }
        
        // 非 Supabase URL，直接使用带认证的 fetch
        return this.fetchWithAuth(imageUrl);
    }

    // 带认证的 fetch
    async fetchWithAuth(imageUrl) {
        // 获取认证令牌
        const getAuthToken = () => {
            try {
                const supabaseKey = 'sb_publishable_l3-6N3-RsAmbns6JCOusHg_XPFd4jf7';
                // 尝试从localStorage获取session
                const sessionStr = localStorage.getItem('sb-oydffrzzulsrbitrrhht-auth-token');
                if (sessionStr) {
                    try {
                        const session = JSON.parse(sessionStr);
                        if (session.access_token) {
                            return session.access_token;
                        }
                    } catch (e) {
                        console.warn('解析session失败:', e);
                    }
                }
                return supabaseKey;
            } catch (e) {
                console.error('获取认证令牌失败:', e);
                return 'sb_publishable_l3-6N3-RsAmbns6JCOusHg_XPFd4jf7';
            }
        };

        const authToken = getAuthToken();

        try {
            const response = await fetch(imageUrl, {
                headers: {
                    'apikey': authToken,
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (!response.ok) {
                // 检查是否是存储桶不存在的错误
                try {
                    const errorData = await response.json();
                    if (errorData.error === 'Bucket not found' || errorData.message === 'Bucket not found') {
                        console.warn('存储桶不存在:', errorData.message || 'Bucket not found');
                        // 创建一个默认的错误图片
                        return this.createErrorImageBlob();
                    }
                } catch (jsonError) {
                    // 如果响应不是JSON格式，直接创建错误图片
                    console.warn('响应不是JSON格式，创建错误图片');
                    return this.createErrorImageBlob();
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return response.blob();
        } catch (error) {
            console.error('图片加载失败:', error);
            // 创建一个默认的错误图片
            return this.createErrorImageBlob();
        }
    }

    // 创建错误图片Blob
    createErrorImageBlob() {
        // 创建一个简单的错误提示图片
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        
        // 背景
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 文字
        ctx.fillStyle = '#ff4d4f';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('图片加载失败', canvas.width / 2, canvas.height / 2 - 10);
        ctx.fillText('存储桶可能不存在', canvas.width / 2, canvas.height / 2 + 15);
        
        return new Promise((resolve) => {
            canvas.toBlob(resolve, 'image/png');
        });
    }

    // 计算各项合计
    calculateTotals(records) {
        let totalBorrowAmount = 0;
        let totalDeductionAmount = 0;
        let totalTransferAmount = 0;
        let totalSettlementAmount = 0;

        for (const record of records) {
            const amount = parseFloat(record.amount) || 0;
            
            if (record.record_type === '借支') {
                totalBorrowAmount += amount;
            } else if (record.record_type === '扣款') {
                totalDeductionAmount += amount;
            } else if (record.record_type === '公司转账') {
                totalTransferAmount += amount;
            } else if (record.record_type === '结算') {
                totalSettlementAmount += amount;
            }
        }

        return {
            totalBorrowAmount: this.formatNumber(totalBorrowAmount),
            totalDeductionAmount: this.formatNumber(totalDeductionAmount),
            totalTransferAmount: this.formatNumber(totalTransferAmount),
            totalSettlementAmount: this.formatNumber(totalSettlementAmount)
        };
    }

    // 格式化数字，如果是整数则显示整数
    formatNumber(num) {
        if (Number.isInteger(num)) {
            return num.toString();
        }
        return num.toFixed(2);
    }

    // 渲染合计显示
    renderTotals(totals) {
        let displayHtml = '';
        
        if (totals.totalBorrowAmount !== '0' && totals.totalBorrowAmount !== '0.00') {
            displayHtml += `<span style="font-size: 16px; font-weight: bold; color: #333;">借支：<span style="color: #ff4d4f; font-size: 18px;">¥${totals.totalBorrowAmount}</span><span style="color: #333;">元</span></span>`;
        }
        
        if (totals.totalDeductionAmount !== '0' && totals.totalDeductionAmount !== '0.00') {
            displayHtml += `<span style="font-size: 16px; font-weight: bold; color: #333;">扣款：<span style="color: #ff4d4f; font-size: 18px;">¥${totals.totalDeductionAmount}</span><span style="color: #333;">元</span></span>`;
        }
        
        if (totals.totalTransferAmount !== '0' && totals.totalTransferAmount !== '0.00') {
            displayHtml += `<span style="font-size: 16px; font-weight: bold; color: #333;">公司转账：<span style="color: #ff4d4f; font-size: 18px;">¥${totals.totalTransferAmount}</span><span style="color: #333;">元</span></span>`;
        }
        
        if (totals.totalSettlementAmount !== '0' && totals.totalSettlementAmount !== '0.00') {
            displayHtml += `<span style="font-size: 16px; font-weight: bold; color: #333;">结算：<span style="color: #ff4d4f; font-size: 18px;">¥${totals.totalSettlementAmount}</span><span style="color: #333;">元</span></span>`;
        }
        
        if (!displayHtml) {
            return '';
        }
        
        return `
            <div class="accounting-flow-totals" style="position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: flex-start; align-items: center; background: linear-gradient(135deg, #ffe6e6 0%, #fff0f0 100%); padding: 15px; box-shadow: 0 -2px 10px rgba(0,0,0,0.1); z-index: 999;">
                <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                    ${displayHtml}
                </div>
            </div>
            <div style="height: 70px;"></div>
        `;
    }
}

// 初始化服务
const accountingFlowService = new AccountingFlowService();

// 导出服务，以便在HTML中使用
if (typeof window !== 'undefined') {
    window.accountingFlowService = accountingFlowService;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    accountingFlowService.init();
});
