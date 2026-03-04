// 员工记录卡片点击功能封装
class WorkerCardClickHandler {
    constructor(workerStatistic) {
        this.workerStatistic = workerStatistic;
        this.init();
    }

    init() {
        // 绑定工人卡片点击事件
        this.bindWorkerCardClickEvents();
        // 创建流水展示模态框
        this.createFlowModal();
    }

    // 绑定工人卡片点击事件
    bindWorkerCardClickEvents() {
        // 使用更通用的事件委托，监听整个文档
        document.addEventListener('click', (e) => {
            const workerCard = e.target.closest('.worker-card');
            if (workerCard) {
                // 确保事件没有被阻止冒泡
                e.stopPropagation();
                this.handleWorkerCardClick(workerCard);
            }
        });
    }

    // 处理工人卡片点击事件
    handleWorkerCardClick(workerCard) {
        const empId = workerCard.dataset.employeeId;
        const empName = workerCard.dataset.empName;
        const empCode = workerCard.dataset.empCode;

        // 确保获取到有效的员工ID
        if (!empId || empId === 'undefined') {
            console.error('无效的员工ID:', empId);
            return;
        }

        // 先清空统计容器并显示加载提示（工人界面容器）
        const statisticResults = document.getElementById('statisticResults');
        if (statisticResults) {
            statisticResults.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">正在加载数据...</div>';
        }

        // 设置当前员工到localStorage
        const selectedEmployee = [{ id: empId, name: empName, empCode: empCode }];
        localStorage.setItem('selectedEmployees', JSON.stringify(selectedEmployee));

        // 更新员工选择按钮显示
        this.updateEmployeeButtonDisplay(selectedEmployee);

        // 显示明细标签
        const detailOption = document.getElementById('detailOption');
        if (detailOption) {
            detailOption.style.display = 'block';

            // 移除所有标签的active类
            const workTypeOptions = document.querySelectorAll('.work-type-option');
            workTypeOptions.forEach(opt => {
                opt.classList.remove('active');
            });

            // 为明细标签添加active类
            detailOption.classList.add('active');
        }

        // 设置筛选条件为折叠状态
        const filterToggleBtn = document.getElementById('filterToggleBtn');
        const filterStickyContainer = document.querySelector('.filter-sticky-container');
        if (filterToggleBtn && filterStickyContainer) {
            // 添加折叠状态
            filterStickyContainer.classList.add('filter-collapsed');
            // 移除旋转状态(默认▼朝下,表示折叠)
            filterToggleBtn.classList.remove('rotated');
        }

        // 更新父窗口标题为流水明细
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'updateTitle',
                page: '流水明细'
            }, window.location.origin);
        }

        // 查询并展示详细流水记录
        this.showEmployeeFlowRecords(empId, empName, empCode);
    }

    // 更新员工选择按钮显示
    updateEmployeeButtonDisplay(selectedEmployees) {
        const employeeListBtn = document.getElementById('employeeListBtn');
        const employeeClearBtn = document.getElementById('employeeClearBtn');
        
        if (employeeListBtn) {
            if (selectedEmployees.length === 0) {
                employeeListBtn.textContent = '全部员工 ▼';
                employeeClearBtn.style.display = 'none';
            } else {
                const employeeNames = selectedEmployees.map(emp => emp.name);
                employeeListBtn.textContent = `${employeeNames[0]} (共${selectedEmployees.length}人)`;
                employeeClearBtn.style.display = 'inline-block';
            }
        }
    }
    
    // 创建流水展示模态框
    createFlowModal() {
        // 检查模态框是否已存在
        if (document.getElementById('employeeFlowModal')) {
            return;
        }
        
        const modalHtml = `
        <div id="employeeFlowModal" class="modal" style="display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.4);">
            <div class="modal-content" style="background-color: #fefefe; margin: 15% auto; padding: 20px; border: 1px solid #888; width: 80%; max-width: 900px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
                    <h2 id="flowModalTitle" style="margin: 0; font-size: 20px; color: #333;">员工流水记录</h2>
                    <button class="close" style="color: #aaa; font-size: 28px; font-weight: bold; background: none; border: none; cursor: pointer;">&times;</button>
                </div>
                <div class="modal-body" style="max-height: 500px; overflow-y: auto;">
                    <div id="flowRecordsContainer" style="display: flex; flex-direction: column; gap: 20px;"></div>
                </div>
                <div class="modal-footer" style="margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee; text-align: right;">
                    <button class="close-modal-btn" style="background-color: #f44336; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">关闭</button>
                </div>
            </div>
        </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // 绑定关闭事件
        const modal = document.getElementById('employeeFlowModal');
        const closeBtn = modal.querySelector('.close');
        const closeModalBtn = modal.querySelector('.close-modal-btn');
        
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        closeModalBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
    
    // 查询并展示员工流水记录
    async showEmployeeFlowRecords(empId, empName, empCode) {
        try {
            const projectId = localStorage.getItem('currentProjectId') || '';
            const workDateInput = document.getElementById('workDate');
            let dateFilter = {
                isAll: false,
                singleDate: null,
                dateRange: null
            };

            // 获取当前日期过滤条件
            if (workDateInput) {
                const displayValue = workDateInput.dataset.displayValue || workDateInput.value;
                if (displayValue === '全部') {
                    dateFilter.isAll = true;
                } else if (displayValue.includes('~')) {
                    const range = displayValue.split(/\s*~\s*/);
                    dateFilter.dateRange = range;
                    dateFilter.isAll = false;
                } else if (displayValue && displayValue !== '请选择日期') {
                    dateFilter.singleDate = displayValue;
                    dateFilter.isAll = false;
                } else {
                    dateFilter.isAll = true;
                }
            }

            // 获取选中的类型
            let selectedTypes = [];
            try {
                if (window.selectedTypes && Array.isArray(window.selectedTypes)) {
                    selectedTypes = window.selectedTypes;
                } else {
                    const savedTypes = localStorage.getItem('selectedTypes');
                    if (savedTypes) {
                        selectedTypes = JSON.parse(savedTypes);
                    }
                }
            } catch (error) {
                console.error('读取选中类型失败:', error);
            }

            // 定义类型分类
            const workTypes = ['点工', '包工', '工量']; // 记工类型
            const accountingTypes = ['借支', '扣款', '公司转账', '结算']; // 记账类型

            // 判断是否选择了记工类型
            const selectedWorkTypes = selectedTypes.filter(type => workTypes.includes(type));

            // 判断是否选择了记账类型
            const selectedAccountingTypes = selectedTypes.filter(type => accountingTypes.includes(type));

            let attendanceRecords = [];
            let settlementRecords = [];

            // 如果选择了记工类型,查询考勤记录
            if (selectedWorkTypes.length > 0 || selectedTypes.length === 0) {
                attendanceRecords = await this.queryAttendanceRecords(projectId, empId, dateFilter, selectedWorkTypes);
            }

            // 如果选择了记账类型,查询结算记录
            if (selectedAccountingTypes.length > 0 || selectedTypes.length === 0) {
                settlementRecords = await this.querySettlementRecords(projectId, empId, dateFilter, selectedAccountingTypes);
            }

            // 在明细视图中渲染流水记录
            this.renderFlowRecordsInDetailView(empName, empCode, attendanceRecords, settlementRecords);
        } catch (error) {
            console.error('查询员工流水记录失败:', error);
        }
    }
    
    // 查询并展示多名员工流水记录
    async showMultipleEmployeesFlowRecords(employees) {
        try {
            const projectId = localStorage.getItem('currentProjectId') || '';
            const workDateInput = document.getElementById('workDate');
            let dateFilter = {
                isAll: false,
                singleDate: null,
                dateRange: null
            };

            // 获取当前日期过滤条件
            if (workDateInput) {
                const displayValue = workDateInput.dataset.displayValue || workDateInput.value;
                if (displayValue === '全部') {
                    dateFilter.isAll = true;
                } else if (displayValue.includes('~')) {
                    const range = displayValue.split(/\s*~\s*/);
                    dateFilter.dateRange = range;
                    dateFilter.isAll = false;
                } else if (displayValue && displayValue !== '请选择日期') {
                    dateFilter.singleDate = displayValue;
                    dateFilter.isAll = false;
                } else {
                    dateFilter.isAll = true;
                }
            }

            // 获取选中的类型
            let selectedTypes = [];
            try {
                if (window.selectedTypes && Array.isArray(window.selectedTypes)) {
                    selectedTypes = window.selectedTypes;
                } else {
                    const savedTypes = localStorage.getItem('selectedTypes');
                    if (savedTypes) {
                        selectedTypes = JSON.parse(savedTypes);
                    }
                }
            } catch (error) {
                console.error('读取选中类型失败:', error);
            }

            // 定义类型分类
            const workTypes = ['点工', '包工', '工量']; // 记工类型
            const accountingTypes = ['借支', '扣款', '公司转账', '结算']; // 记账类型

            // 判断是否选择了记工类型
            const selectedWorkTypes = selectedTypes.filter(type => workTypes.includes(type));

            // 判断是否选择了记账类型
            const selectedAccountingTypes = selectedTypes.filter(type => accountingTypes.includes(type));

            let allAttendanceRecords = [];
            let allSettlementRecords = [];

            // 遍历所有选中的员工，查询他们的流水记录
            for (const employee of employees) {
                const empId = employee.id;
                
                // 如果选择了记工类型,查询考勤记录
                if (selectedWorkTypes.length > 0 || selectedTypes.length === 0) {
                    const attendanceRecords = await this.queryAttendanceRecords(projectId, empId, dateFilter, selectedWorkTypes);
                    allAttendanceRecords = allAttendanceRecords.concat(attendanceRecords);
                }

                // 如果选择了记账类型,查询结算记录
                if (selectedAccountingTypes.length > 0 || selectedTypes.length === 0) {
                    const settlementRecords = await this.querySettlementRecords(projectId, empId, dateFilter, selectedAccountingTypes);
                    allSettlementRecords = allSettlementRecords.concat(settlementRecords);
                }
            }

            // 在明细视图中渲染流水记录
            this.renderMultipleEmployeesFlowRecords(employees, allAttendanceRecords, allSettlementRecords);
        } catch (error) {
            console.error('查询多名员工流水记录失败:', error);
        }
    }
    
    // 查询并展示所有员工流水记录
    async showAllEmployeesFlowRecords() {
        try {
            const projectId = localStorage.getItem('currentProjectId') || '';
            
            // 获取所有员工
            const employees = await this.getAllEmployees(projectId);
            if (employees.length === 0) {
                // 如果没有员工，显示提示
                const container = document.getElementById('statisticResults');
                if (container) {
                    container.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">暂无员工数据</div>';
                }
                return;
            }
            
            // 调用已有的方法查询多名员工的流水记录
            await this.showMultipleEmployeesFlowRecords(employees);
        } catch (error) {
            console.error('查询所有员工流水记录失败:', error);
        }
    }
    
    // 获取所有员工
    async getAllEmployees(projectId) {
        try {
            if (!projectId) {
                return [];
            }
            
            // 从本地存储获取员工数据
            let employees = [];
            
            // 从新的存储位置employeesIndex获取
            const indexKey = 'employeesIndex';
            const indexData = localStorage.getItem(indexKey);
            if (indexData) {
                const employeeIndex = JSON.parse(indexData);
                // 将索引对象转换为数组并过滤出指定项目的员工
                employees = Object.values(employeeIndex).filter(emp => emp.project_id === projectId);
            }
            
            // 转换为需要的格式
            return employees.map(emp => ({
                id: emp.employee_id,
                name: emp.emp_name,
                empCode: emp.emp_code
            }));
        } catch (error) {
            console.error('获取所有员工失败:', error);
            return [];
        }
    }
    
    // 查询考勤记录
    async queryAttendanceRecords(projectId, empId, dateFilter, workTypes) {
        try {
            // 从本地存储获取考勤记录数据
            let attendanceData = [];
            if (window.ProjectSyncService && window.ProjectSyncService.getLocalAttendanceRecordsData) {
                attendanceData = window.ProjectSyncService.getLocalAttendanceRecordsData();
            } else {
                // 尝试直接从localStorage获取
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
                    attendanceData = JSON.parse(cachedData);
                }
            }
            
            // 从本地存储获取员工数据
            let employeesData = [];
            if (projectId) {
                // 从新的存储位置employeesIndex获取
                const indexKey = 'employeesIndex';
                const indexData = localStorage.getItem(indexKey);
                if (indexData) {
                    const employeeIndex = JSON.parse(indexData);
                    // 将索引对象转换为数组并过滤出指定项目的员工
                    employeesData = Object.values(employeeIndex).filter(emp => emp.project_id === projectId);
                }
            }
            
            // 创建员工的映射
            const employeeMap = {};
            employeesData.forEach(emp => {
                employeeMap[emp.employee_id] = emp;
            });
            
            // 合并数据并应用筛选条件
            let filteredData = attendanceData.filter(record => {
                // 员工过滤
                if (record.employee_id !== empId) {
                    return false;
                }
                
                // 项目过滤
                if (record.project_id !== projectId) {
                    return false;
                }
                
                // 类型过滤
                if (workTypes && workTypes.length > 0 && !workTypes.includes(record.work_type)) {
                    return false;
                }
                
                // 日期过滤
                if (!dateFilter.isAll) {
                    if (dateFilter.dateRange) {
                        const [startDate, endDate] = dateFilter.dateRange;
                        if (record.record_date < startDate || record.record_date > endDate) {
                            return false;
                        }
                    } else if (dateFilter.singleDate) {
                        if (record.record_date !== dateFilter.singleDate) {
                            return false;
                        }
                    }
                }
                
                return true;
            });
            
            // 合并员工数据
            filteredData = filteredData.map(record => {
                const employee = employeeMap[record.employee_id] || {};
                return {
                    ...record,
                    employees: employee
                };
            });
            
            // 按日期降序排序
            filteredData.sort((a, b) => {
                const dateA = new Date(a.record_date);
                const dateB = new Date(b.record_date);
                return dateB.getTime() - dateA.getTime();
            });
            
            // 获取数据后保存到本地存储
            if (filteredData.length > 0) {
                this._saveAttendanceRecordsToLocal(filteredData);
            }

            return filteredData;
        } catch (error) {
            console.error('查询考勤记录异常:', error);
            return [];
        }
    }

    // 保存考勤记录到本地存储
    _saveAttendanceRecordsToLocal(records) {
        try {
            const userId = JSON.parse(localStorage.getItem('currentUser'))?.user_id || 'default';
            const phone = localStorage.getItem('loggedInPhone') || 'default';

            // 1. 保存每条记录到attendance_data_${record_id}键
            for (const record of records) {
                const recordId = record.id || record.record_id;
                if (recordId) {
                    localStorage.setItem(`attendance_data_${recordId}`, JSON.stringify(record));
                }
            }

            // 2. 保存到work_records_${userId}键
            const key = `work_records_${userId}`;
            let workRecords = JSON.parse(localStorage.getItem(key) || '[]');

            // 使用Map去重,确保记录唯一
            const recordMap = new Map(workRecords.map(r => [r.id || r.record_id, r]));
            
            for (const record of records) {
                const recordId = record.id || record.record_id;
                if (recordId) {
                    recordMap.set(recordId, record);
                }
            }

            workRecords = Array.from(recordMap.values());
            localStorage.setItem(key, JSON.stringify(workRecords));

            // 3. 保存到work_flow_data_${phone}键
            const flowKey = `work_flow_data_${phone}`;
            let flowData = {};
            try {
                const existingData = localStorage.getItem(flowKey);
                if (existingData) {
                    flowData = JSON.parse(existingData);
                }
            } catch (parseError) {
                console.error('解析work_flow_data失败:', parseError);
                flowData = {};
            }

            // 按日期分组存储
            for (const record of records) {
                const date = record.record_date;
                if (date) {
                    if (!flowData[date]) {
                        flowData[date] = [];
                    }
                    // 检查是否已存在,避免重复
                    const recordId = record.id || record.record_id;
                    const exists = flowData[date].some(r => (r.id || r.record_id) === recordId);
                    if (!exists) {
                        flowData[date].push(record);
                    }
                }
            }

            localStorage.setItem(flowKey, JSON.stringify(flowData));
        } catch (error) {
            console.error('保存考勤记录到本地存储失败:', error);
        }
    }
    
    // 查询结算记录
    async querySettlementRecords(projectId, empId, dateFilter, recordTypes) {
        try {
            // 从本地存储获取结算记录数据
            let settlementData = [];
            if (window.ProjectSyncService && window.ProjectSyncService.getLocalSettlementRecordsData) {
                settlementData = window.ProjectSyncService.getLocalSettlementRecordsData();
            } else {
                // 尝试直接从localStorage获取
                // 从新的存储位置获取结算数据
                const settlementRecordsKey = 'settlementRecords';
                const cachedData = localStorage.getItem(settlementRecordsKey);
                if (cachedData) {
                    settlementData = JSON.parse(cachedData);
                }
            }
            
            // 从本地存储获取员工数据
            let employeesData = [];
            if (projectId) {
                // 从新的存储位置employeesIndex获取
                const indexKey = 'employeesIndex';
                const indexData = localStorage.getItem(indexKey);
                if (indexData) {
                    const employeeIndex = JSON.parse(indexData);
                    // 将索引对象转换为数组并过滤出指定项目的员工
                    employeesData = Object.values(employeeIndex).filter(emp => emp.project_id === projectId);
                }
            }
            
            // 创建员工的映射
            const employeeMap = {};
            employeesData.forEach(emp => {
                employeeMap[emp.employee_id] = emp;
            });
            
            // 合并数据并应用筛选条件
            let filteredData = settlementData.filter(record => {
                // 员工过滤
                if (record.employee_id !== empId) {
                    return false;
                }
                
                // 项目过滤
                if (record.project_id !== projectId) {
                    return false;
                }
                
                // 类型过滤
                if (recordTypes && recordTypes.length > 0 && !recordTypes.includes(record.record_type)) {
                    return false;
                }
                
                // 日期过滤
                if (!dateFilter.isAll) {
                    if (dateFilter.dateRange) {
                        const [startDate, endDate] = dateFilter.dateRange;
                        if (record.record_date < startDate || record.record_date > endDate) {
                            return false;
                        }
                    } else if (dateFilter.singleDate) {
                        if (record.record_date !== dateFilter.singleDate) {
                            return false;
                        }
                    }
                }
                
                return true;
            });
            
            // 合并员工数据
            filteredData = filteredData.map(record => {
                const employee = employeeMap[record.employee_id] || {};
                return {
                    ...record,
                    employees: employee
                };
            });
            
            // 按日期降序排序
            filteredData.sort((a, b) => {
                const dateA = new Date(a.record_date);
                const dateB = new Date(b.record_date);
                return dateB.getTime() - dateA.getTime();
            });
            
            // 获取数据后保存到本地存储
            if (filteredData.length > 0) {
                this._saveSettlementRecordsToLocal(filteredData);
            }

            return filteredData;
        } catch (error) {
            console.error('查询结算记录异常:', error);
            return [];
        }
    }

    // 保存结算记录到本地存储
    _saveSettlementRecordsToLocal(records) {
        try {
            // 1. 保存每条记录到settlement_data_${record_id}键
            for (const record of records) {
                const recordId = record.id || record.settlement_id;
                if (recordId) {
                    localStorage.setItem(`settlement_data_${recordId}`, JSON.stringify(record));
                }
            }

            // 2. 保存到settlement_records_cache键
            const cacheKey = 'settlement_records_cache';
            let cachedRecords = JSON.parse(localStorage.getItem(cacheKey) || '[]');

            // 使用Map去重,确保记录唯一
            const recordMap = new Map(cachedRecords.map(r => [r.id || r.settlement_id, r]));
            
            for (const record of records) {
                const recordId = record.id || record.settlement_id;
                if (recordId) {
                    recordMap.set(recordId, record);
                }
            }

            cachedRecords = Array.from(recordMap.values());
            localStorage.setItem(cacheKey, JSON.stringify(cachedRecords));

            // 3. 保存到settlementRecords键
            const settlementKey = 'settlementRecords';
            let settlementRecords = JSON.parse(localStorage.getItem(settlementKey) || '[]');

            const settlementRecordMap = new Map(settlementRecords.map(r => [r.id || r.settlement_id, r]));
            
            for (const record of records) {
                const recordId = record.id || record.settlement_id;
                if (recordId) {
                    settlementRecordMap.set(recordId, record);
                }
            }

            settlementRecords = Array.from(settlementRecordMap.values());
            localStorage.setItem(settlementKey, JSON.stringify(settlementRecords));
        } catch (error) {
            console.error('保存结算记录到本地存储失败:', error);
        }
    }
    
    // 在明细视图中渲染流水记录
    renderFlowRecordsInDetailView(empName, empCode, attendanceRecords, settlementRecords) {
        // 确保明细视图的容器存在
        let detailContainer = document.getElementById('detailViewContainer');
        if (!detailContainer) {
            // 如果明细视图容器不存在，先创建它
            const statisticContainer = document.getElementById('statisticResults');
            if (!statisticContainer) {
                console.error('统计结果容器未找到');
                return;
            }

            detailContainer = document.createElement('div');
            detailContainer.id = 'detailViewContainer';
            detailContainer.className = 'detail-view-container';
            statisticContainer.innerHTML = '';
            statisticContainer.appendChild(detailContainer);
        }

        // 将流水记录保存到本地存储，方便点击卡片时获取
        attendanceRecords.forEach(record => {
            if (record.record_id) {
                const key = `attendance_data_${record.record_id}`;
                localStorage.setItem(key, JSON.stringify(record));
            }
        });

        // 将结算记录也保存到本地存储
        settlementRecords.forEach(record => {
            if (record.settlement_id) {
                const key = `settlement_data_${record.settlement_id}`;
                localStorage.setItem(key, JSON.stringify(record));
            }
        });

        let html = '';
        
        // 定义排序顺序：点工，包工，工量，借支，扣款，公司转账，结算
        const typeOrder = ['点工', '包工', '工量', '借支', '扣款', '公司转账', '结算'];
        
        // 合并所有记录并标记类型
        const allRecords = [];
        
        // 考勤记录
        attendanceRecords.forEach(record => {
            allRecords.push({
                ...record,
                recordCategory: 'attendance',
                sortType: record.work_type
            });
        });
        
        // 结算记录
        settlementRecords.forEach(record => {
            allRecords.push({
                ...record,
                recordCategory: 'settlement',
                sortType: record.record_type
            });
        });
        
        // 按日期升序和类型顺序排序
        allRecords.sort((a, b) => {
            // 先按日期升序排序
            const dateA = new Date(a.record_date || 0);
            const dateB = new Date(b.record_date || 0);
            if (dateA.getTime() !== dateB.getTime()) {
                return dateA.getTime() - dateB.getTime();
            }

            // 同日期按类型顺序排序
            const indexA = typeOrder.indexOf(a.sortType);
            const indexB = typeOrder.indexOf(b.sortType);

            // 如果类型不在预定义顺序中，放到最后
            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;

            return indexA - indexB;
        });
        
        // 渲染所有记录
        allRecords.forEach(record => {
            if (record.recordCategory === 'attendance') {
                html += this.renderSingleAttendanceRecord(record);
            } else {
                html += this.renderSingleSettlementRecord(record);
            }
        });
        
        // 无记录提示
        if (allRecords.length === 0) {
            html += `<div style="text-align: center; color: #999; padding: 40px;">暂无流水记录</div>`;
        }

        detailContainer.innerHTML = html;

        // 绑定图片图标点击事件
        this.bindImageIconEvents();
    }
    
    // 在明细视图中渲染多名员工的流水记录
    renderMultipleEmployeesFlowRecords(employees, attendanceRecords, settlementRecords) {
        // 确保明细视图的容器存在
        let detailContainer = document.getElementById('detailViewContainer');
        if (!detailContainer) {
            // 如果明细视图容器不存在，先创建它
            const statisticContainer = document.getElementById('statisticResults');
            if (!statisticContainer) {
                console.error('统计结果容器未找到');
                return;
            }

            detailContainer = document.createElement('div');
            detailContainer.id = 'detailViewContainer';
            detailContainer.className = 'detail-view-container';
            statisticContainer.innerHTML = '';
            statisticContainer.appendChild(detailContainer);
        }

        // 将流水记录保存到本地存储，方便点击卡片时获取
        attendanceRecords.forEach(record => {
            if (record.record_id) {
                const key = `attendance_data_${record.record_id}`;
                localStorage.setItem(key, JSON.stringify(record));
            }
        });

        // 将结算记录也保存到本地存储
        settlementRecords.forEach(record => {
            if (record.settlement_id) {
                const key = `settlement_data_${record.settlement_id}`;
                localStorage.setItem(key, JSON.stringify(record));
            }
        });

        let html = '';
        
        // 定义排序顺序：点工，包工，工量，借支，扣款，公司转账，结算
        const typeOrder = ['点工', '包工', '工量', '借支', '扣款', '公司转账', '结算'];
        
        // 合并所有记录并标记类型
        const allRecords = [];
        
        // 考勤记录
        attendanceRecords.forEach(record => {
            allRecords.push({
                ...record,
                recordCategory: 'attendance',
                sortType: record.work_type
            });
        });
        
        // 结算记录
        settlementRecords.forEach(record => {
            allRecords.push({
                ...record,
                recordCategory: 'settlement',
                sortType: record.record_type
            });
        });
        
        // 按日期升序和员工工号排序
        allRecords.sort((a, b) => {
            // 先按日期升序排序
            const dateA = new Date(a.record_date || 0);
            const dateB = new Date(b.record_date || 0);
            if (dateA.getTime() !== dateB.getTime()) {
                return dateA.getTime() - dateB.getTime();
            }

            // 同日期按员工工号升序排序
            const empCodeA = a.employees ? a.employees.emp_code : '';
            const empCodeB = b.employees ? b.employees.emp_code : '';
            const codeA = parseInt(empCodeA) || 0;
            const codeB = parseInt(empCodeB) || 0;
            if (codeA !== codeB) {
                return codeA - codeB;
            }

            // 同工号按类型顺序排序
            const indexA = typeOrder.indexOf(a.sortType);
            const indexB = typeOrder.indexOf(b.sortType);

            // 如果类型不在预定义顺序中，放到最后
            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;

            return indexA - indexB;
        });
        
        // 渲染所有记录
        allRecords.forEach(record => {
            if (record.recordCategory === 'attendance') {
                html += this.renderSingleAttendanceRecord(record);
            } else {
                html += this.renderSingleSettlementRecord(record);
            }
        });
        
        // 无记录提示
        if (allRecords.length === 0) {
            html += `<div style="text-align: center; color: #999; padding: 40px;">暂无流水记录</div>`;
        }

        detailContainer.innerHTML = html;

        // 绑定图片图标点击事件
        this.bindImageIconEvents();
    }
    
    // 获取所有员工
    async getAllEmployees() {
        try {
            const projectId = localStorage.getItem('currentProjectId');
            if (!projectId) {
                console.error('项目ID未找到');
                return [];
            }
            
            // 从本地存储获取员工数据
            let employees = [];
            
            // 从新的存储位置employeesIndex获取
            const indexKey = 'employeesIndex';
            const indexData = localStorage.getItem(indexKey);
            if (indexData) {
                const employeeIndex = JSON.parse(indexData);
                // 将索引对象转换为数组并过滤出指定项目的员工
                employees = Object.values(employeeIndex).filter(emp => emp.project_id === projectId);
            }
            
            // 按工号升序排序
            employees.sort((a, b) => {
                const codeA = parseInt(a.emp_code) || 0;
                const codeB = parseInt(b.emp_code) || 0;
                return codeA - codeB;
            });
            
            return employees;
        } catch (error) {
            console.error('获取员工列表异常:', error);
            return [];
        }
    }
    
    // 显示所有员工的流水记录
    async showAllEmployeesFlowRecords() {
        try {
            // 获取所有员工
            const allEmployees = await this.getAllEmployees();
            
            if (allEmployees.length === 0) {
                // 如果没有员工，显示无记录提示
                const detailContainer = document.getElementById('detailViewContainer');
                if (detailContainer) {
                    detailContainer.innerHTML = `<div style="text-align: center; color: #999; padding: 40px;">暂无员工数据</div>`;
                }
                return;
            }
            
            // 构建员工ID列表
            const employeeIds = allEmployees.map(emp => emp.employee_id);
            
            // 获取考勤记录
            const attendanceRecords = await this.getAttendanceRecordsForMultipleEmployees(employeeIds);
            
            // 获取结算记录
            const settlementRecords = await this.getSettlementRecordsForMultipleEmployees(employeeIds);
            
            // 渲染所有员工的流水记录
            this.renderMultipleEmployeesFlowRecords(allEmployees, attendanceRecords, settlementRecords);
        } catch (error) {
            console.error('显示所有员工流水记录失败:', error);
            
            // 显示错误提示
            const detailContainer = document.getElementById('detailViewContainer');
            if (detailContainer) {
                detailContainer.innerHTML = `<div style="text-align: center; color: #999; padding: 40px;">加载失败，请重试</div>`;
            }
        }
    }
    
    // 获取多名员工的考勤记录
    async getAttendanceRecordsForMultipleEmployees(employeeIds) {
        if (!employeeIds || employeeIds.length === 0) {
            return [];
        }

        try {
            const projectId = localStorage.getItem('currentProjectId');
            const workDateInput = document.getElementById('workDate');
            
            // 获取日期过滤条件
            let dateFilter = { isAll: true };
            if (workDateInput) {
                const displayValue = workDateInput.dataset.displayValue || workDateInput.value;
                if (displayValue === '全部') {
                    dateFilter.isAll = true;
                } else if (displayValue.includes('~')) {
                    const range = displayValue.split(/\s*~\s*/);
                    dateFilter.dateRange = range;
                    dateFilter.isAll = false;
                } else if (displayValue && displayValue !== '请选择日期') {
                    dateFilter.singleDate = displayValue;
                    dateFilter.isAll = false;
                }
            }
            
            // 获取类型过滤条件
            let selectedTypes = [];
            try {
                if (window.selectedTypes && Array.isArray(window.selectedTypes)) {
                    selectedTypes = window.selectedTypes;
                } else {
                    const savedTypes = localStorage.getItem('selectedTypes');
                    if (savedTypes) {
                        selectedTypes = JSON.parse(savedTypes);
                    }
                }
            } catch (error) {
                console.error('读取选中类型失败:', error);
            }
            
            // 从本地存储获取考勤记录数据
            let attendanceData = [];
            if (window.ProjectSyncService && window.ProjectSyncService.getLocalAttendanceRecordsData) {
                attendanceData = window.ProjectSyncService.getLocalAttendanceRecordsData();
            } else {
                // 尝试直接从localStorage获取
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
                    attendanceData = JSON.parse(cachedData);
                }
            }
            
            // 从本地存储获取员工数据
            let employeesData = [];
            if (projectId) {
                // 从新的存储位置employeesIndex获取
                const indexKey = 'employeesIndex';
                const indexData = localStorage.getItem(indexKey);
                if (indexData) {
                    const employeeIndex = JSON.parse(indexData);
                    // 将索引对象转换为数组并过滤出指定项目的员工
                    employeesData = Object.values(employeeIndex).filter(emp => emp.project_id === projectId);
                }
            }
            
            // 创建员工的映射
            const employeeMap = {};
            employeesData.forEach(emp => {
                employeeMap[emp.employee_id] = emp;
            });
            
            // 合并数据并应用筛选条件
            let filteredData = attendanceData.filter(record => {
                // 员工过滤
                if (!employeeIds.includes(record.employee_id)) {
                    return false;
                }
                
                // 项目过滤
                if (projectId && record.project_id !== projectId) {
                    return false;
                }
                
                // 日期过滤
                if (!dateFilter.isAll) {
                    if (dateFilter.dateRange) {
                        const [startDate, endDate] = dateFilter.dateRange;
                        if (record.record_date < startDate || record.record_date > endDate) {
                            return false;
                        }
                    } else if (dateFilter.singleDate) {
                        if (record.record_date !== dateFilter.singleDate) {
                            return false;
                        }
                    }
                }
                
                // 类型过滤
                if (selectedTypes && selectedTypes.length > 0 && !selectedTypes.includes(record.work_type)) {
                    return false;
                }
                
                return true;
            });
            
            // 合并员工数据
            filteredData = filteredData.map(record => {
                const employee = employeeMap[record.employee_id] || {};
                return {
                    ...record,
                    employees: employee
                };
            });
            
            // 按日期升序排序
            filteredData.sort((a, b) => {
                const dateA = new Date(a.record_date);
                const dateB = new Date(b.record_date);
                return dateA.getTime() - dateB.getTime();
            });
            
            return filteredData;
        } catch (error) {
            console.error('获取考勤记录异常:', error);
            return [];
        }
    }
    
    // 获取多名员工的结算记录
    async getSettlementRecordsForMultipleEmployees(employeeIds) {
        if (!employeeIds || employeeIds.length === 0) {
            return [];
        }

        try {
            const projectId = localStorage.getItem('currentProjectId');
            const workDateInput = document.getElementById('workDate');
            
            // 获取日期过滤条件
            let dateFilter = { isAll: true };
            if (workDateInput) {
                const displayValue = workDateInput.dataset.displayValue || workDateInput.value;
                if (displayValue === '全部') {
                    dateFilter.isAll = true;
                } else if (displayValue.includes('~')) {
                    const range = displayValue.split(/\s*~\s*/);
                    dateFilter.dateRange = range;
                    dateFilter.isAll = false;
                } else if (displayValue && displayValue !== '请选择日期') {
                    dateFilter.singleDate = displayValue;
                    dateFilter.isAll = false;
                }
            }
            
            // 获取类型过滤条件
            let selectedTypes = [];
            try {
                if (window.selectedTypes && Array.isArray(window.selectedTypes)) {
                    selectedTypes = window.selectedTypes;
                } else {
                    const savedTypes = localStorage.getItem('selectedTypes');
                    if (savedTypes) {
                        selectedTypes = JSON.parse(savedTypes);
                    }
                }
            } catch (error) {
                console.error('读取选中类型失败:', error);
            }
            
            // 从本地存储获取结算记录数据
            let settlementData = [];
            if (window.ProjectSyncService && window.ProjectSyncService.getLocalSettlementRecordsData) {
                settlementData = window.ProjectSyncService.getLocalSettlementRecordsData();
            } else {
                // 尝试直接从localStorage获取
                // 从新的存储位置获取结算数据
                const settlementRecordsKey = 'settlementRecords';
                const cachedData = localStorage.getItem(settlementRecordsKey);
                if (cachedData) {
                    settlementData = JSON.parse(cachedData);
                }
            }
            
            // 从本地存储获取员工数据
            let employeesData = [];
            if (projectId) {
                // 从新的存储位置employeesIndex获取
                const indexKey = 'employeesIndex';
                const indexData = localStorage.getItem(indexKey);
                if (indexData) {
                    const employeeIndex = JSON.parse(indexData);
                    // 将索引对象转换为数组并过滤出指定项目的员工
                    employeesData = Object.values(employeeIndex).filter(emp => emp.project_id === projectId);
                }
            }
            
            // 创建员工的映射
            const employeeMap = {};
            employeesData.forEach(emp => {
                employeeMap[emp.employee_id] = emp;
            });
            
            // 合并数据并应用筛选条件
            let filteredData = settlementData.filter(record => {
                // 员工过滤
                if (!employeeIds.includes(record.employee_id)) {
                    return false;
                }
                
                // 项目过滤
                if (projectId && record.project_id !== projectId) {
                    return false;
                }
                
                // 日期过滤
                if (!dateFilter.isAll) {
                    if (dateFilter.dateRange) {
                        const [startDate, endDate] = dateFilter.dateRange;
                        if (record.record_date < startDate || record.record_date > endDate) {
                            return false;
                        }
                    } else if (dateFilter.singleDate) {
                        if (record.record_date !== dateFilter.singleDate) {
                            return false;
                        }
                    }
                }
                
                // 类型过滤
                if (selectedTypes && selectedTypes.length > 0 && !selectedTypes.includes(record.record_type)) {
                    return false;
                }
                
                return true;
            });
            
            // 合并员工数据
            filteredData = filteredData.map(record => {
                const employee = employeeMap[record.employee_id] || {};
                return {
                    ...record,
                    employees: employee
                };
            });
            
            // 按日期升序排序
            filteredData.sort((a, b) => {
                const dateA = new Date(a.record_date);
                const dateB = new Date(b.record_date);
                return dateA.getTime() - dateB.getTime();
            });
            
            return filteredData;
        } catch (error) {
            console.error('获取结算记录异常:', error);
            return [];
        }
    }
    
    // 显示多名员工的流水记录
    async showMultipleEmployeesFlowRecords(selectedEmployees) {
        try {
            if (!selectedEmployees || selectedEmployees.length === 0) {
                // 如果没有选中员工，显示所有员工的记录
                await this.showAllEmployeesFlowRecords();
                return;
            }
            
            // 构建员工ID列表
            const employeeIds = selectedEmployees.map(emp => emp.id);
            
            // 获取考勤记录
            const attendanceRecords = await this.getAttendanceRecordsForMultipleEmployees(employeeIds);
            
            // 获取结算记录
            const settlementRecords = await this.getSettlementRecordsForMultipleEmployees(employeeIds);
            
            // 渲染多名员工的流水记录
            this.renderMultipleEmployeesFlowRecords(selectedEmployees, attendanceRecords, settlementRecords);
        } catch (error) {
            console.error('显示多名员工流水记录失败:', error);
            
            // 显示错误提示
            const detailContainer = document.getElementById('detailViewContainer');
            if (detailContainer) {
                detailContainer.innerHTML = `<div style="text-align: center; color: #999; padding: 40px;">加载失败，请重试</div>`;
            }
        }
    }

    // 绑定图片图标点击事件
    bindImageIconEvents() {
        // 考勤记录图片图标
        const workFlowImageIcons = document.querySelectorAll('.work-flow-image-icon');
        workFlowImageIcons.forEach(icon => {
            icon.removeEventListener('click', this._handleWorkFlowImageIconClick);
            icon.addEventListener('click', this._handleWorkFlowImageIconClick.bind(this));
        });

        // 结算记录图片图标
        const accountingFlowImageIcons = document.querySelectorAll('.accounting-flow-image-icon');
        accountingFlowImageIcons.forEach(icon => {
            icon.removeEventListener('click', this._handleAccountingFlowImageIconClick);
            icon.addEventListener('click', this._handleAccountingFlowImageIconClick.bind(this));
        });

        // 考勤记录卡片点击事件
        const attendanceRecordCards = document.querySelectorAll('.attendance-record-card');
        attendanceRecordCards.forEach(card => {
            card.removeEventListener('click', this._handleAttendanceRecordCardClick);
            card.addEventListener('click', this._handleAttendanceRecordCardClick.bind(this));
        });

        // 结算记录卡片点击事件
        const settlementRecordCards = document.querySelectorAll('.settlement-record-card');
        settlementRecordCards.forEach(card => {
            card.removeEventListener('click', this._handleSettlementRecordCardClick);
            card.addEventListener('click', this._handleSettlementRecordCardClick.bind(this));
        });
    }

    // 处理考勤记录卡片点击事件
    _handleAttendanceRecordCardClick(e) {
        // 如果点击的是图片图标，不触发卡片点击
        if (e.target.closest('.work-flow-image-icon')) {
            return;
        }

        const card = e.target.closest('.attendance-record-card');
        const recordId = card.dataset.recordId;
        const workType = card.dataset.workType;

        if (recordId) {
            // 从卡片中获取记录数据
            const projectId = localStorage.getItem('currentProjectId') || '';
            const recordDate = card.querySelector('div[style*="font-size: 14px"]')?.textContent.replace('📅 ', '') || '';

            // 从本地存储获取记录数据
            const record = this._getRecordFromLocalStorage(recordId);

            if (record) {
                // 保存当前筛选条件到localStorage,用于返回时恢复
                const currentFilter = {
                    projectId: localStorage.getItem('currentProjectId') || '',
                    projectName: localStorage.getItem('currentProjectName') || '',
                    workDate: document.getElementById('workDate')?.value || '',
                    workDateDisplay: document.getElementById('workDate')?.dataset.displayValue || '',
                    workDateSelectAll: document.getElementById('workDate')?.dataset.selectAll || '',
                    selectedEmployees: localStorage.getItem('selectedEmployees') || '',
                    selectedTypes: localStorage.getItem('selectedTypes') || '',
                    activeTab: 'detail',
                    filterCollapsed: true // 保存折叠状态为true(▼表示折叠)
                };
                localStorage.setItem('statisticFilter', JSON.stringify(currentFilter));

                // 构建跳转URL到记工页面的编辑模式
                const params = new URLSearchParams();
                params.append('record_id', recordId);
                params.append('workType', workType);
                params.append('project_id', projectId); // 使用正确的参数名：project_id（下划线）
                params.append('project_name', localStorage.getItem('currentProjectName') || ''); // 添加项目名称
                params.append('workDate', recordDate);
                params.append('from', 'statistic');

                // 优先从employees数组中获取employee_id
                const employeeId = record.employee_id || (record.employees && record.employees[0]?.empid);
                params.append('employeeId', employeeId || '');

                // 跳转到记工页面
                window.location.href = `记工.html?${params.toString()}`;
            } else {
                console.error('本地存储中未找到记录:', recordId);
            }
        }
    }

    // 处理结算记录卡片点击事件
    _handleSettlementRecordCardClick(e) {
        // 如果点击的是图片图标，不触发卡片点击
        if (e.target.closest('.accounting-flow-image-icon')) {
            return;
        }

        const card = e.target.closest('.settlement-record-card');
        const recordId = card.dataset.recordId;
        const recordType = card.dataset.recordType;

        if (recordId) {
            // 从本地存储获取结算记录数据
            const record = this._getSettlementRecordFromLocalStorage(recordId);

            if (record) {
                // 保存当前筛选条件到localStorage,用于返回时恢复
                const currentFilter = {
                    projectId: localStorage.getItem('currentProjectId') || '',
                    projectName: localStorage.getItem('currentProjectName') || '',
                    workDate: document.getElementById('workDate')?.value || '',
                    workDateDisplay: document.getElementById('workDate')?.dataset.displayValue || '',
                    workDateSelectAll: document.getElementById('workDate')?.dataset.selectAll || '',
                    selectedEmployees: localStorage.getItem('selectedEmployees') || '',
                    selectedTypes: localStorage.getItem('selectedTypes') || '',
                    activeTab: 'detail',
                    filterCollapsed: true // 保存折叠状态为true(▼表示折叠)
                };
                localStorage.setItem('statisticFilter', JSON.stringify(currentFilter));

                // 构建跳转URL到结算借支页面的编辑模式
                const params = new URLSearchParams();
                params.append('edit', 'true');
                params.append('settlement_id', recordId);
                params.append('project_id', record.project_id || '');
                params.append('project_name', localStorage.getItem('currentProjectName') || ''); // 添加项目名称
                params.append('record_date', record.record_date || '');
                params.append('record_type', record.record_type || '');
                params.append('amount', record.amount || '');
                params.append('payer', record.payer || '');
                params.append('remark', record.remark || '');
                params.append('employee_ids', record.employee_id || '');
                params.append('image_ids', (record.image_ids || []).join(','));
                params.append('from', 'statistic');

                // 跳转到结算借支页面
                window.location.href = `结算借支.html?${params.toString()}`;
            } else {
                console.error('本地存储中未找到结算记录:', recordId);
            }
        }
    }

    // 从本地存储获取结算记录
    _getSettlementRecordFromLocalStorage(recordId) {
        try {
            // 优先从settlement_data_${recordId}键获取
            const settlementDataKey = `settlement_data_${recordId}`;
            const recordStr = localStorage.getItem(settlementDataKey);

            if (recordStr) {
                const record = JSON.parse(recordStr);
                return record;
            }

            // 如果没有找到，尝试从settlement_records_cache获取
            const cacheKey = 'settlement_records_cache';
            const cacheStr = localStorage.getItem(cacheKey);

            if (cacheStr) {
                const cacheRecords = JSON.parse(cacheStr);
                const record = cacheRecords.find(r => (r.id || r.settlement_id) === recordId);

                if (record) {
                    return record;
                }
            }

            return null;
        } catch (error) {
            console.error('从本地存储获取结算记录失败:', error);
            return null;
        }
    }

    // 保存记录到本地存储
    _saveRecordToLocalStorage(recordId, record) {
        try {
            // 保存到attendance_data_前缀的键
            const attendanceDataKey = `attendance_data_${recordId}`;
            localStorage.setItem(attendanceDataKey, JSON.stringify(record));

            // 同时保存到work_records_${userId}键
            const userId = JSON.parse(localStorage.getItem('currentUser'))?.user_id || 'default';
            const key = `work_records_${userId}`;
            let workRecords = JSON.parse(localStorage.getItem(key) || '[]');

            // 检查记录是否已存在
            const index = workRecords.findIndex(r => r.record_id === recordId);
            if (index !== -1) {
                // 更新现有记录
                workRecords[index] = record;
            } else {
                // 添加新记录
                workRecords.push(record);
            }

            localStorage.setItem(key, JSON.stringify(workRecords));
        } catch (error) {
            console.error('保存记录到本地存储失败:', error);
        }
    }

    // 从本地存储获取记录
    _getRecordFromLocalStorage(recordId) {
        try {
            // 优先从attendance_data_${recordId}键获取
            const attendanceDataKey = `attendance_data_${recordId}`;
            const recordStr = localStorage.getItem(attendanceDataKey);

            if (recordStr) {
                const record = JSON.parse(recordStr);
                return record;
            }

            // 如果没有找到，尝试从work_records_${userId}获取
            const userId = JSON.parse(localStorage.getItem('currentUser'))?.user_id || 'default';
            const key = `work_records_${userId}`;
            const workRecordsStr = localStorage.getItem(key);

            if (workRecordsStr) {
                const workRecords = JSON.parse(workRecordsStr);
                const record = workRecords.find(r => (r.id || r.record_id) === recordId);

                if (record) {
                    return record;
                }
            }

            return null;
        } catch (error) {
            console.error('从本地存储获取记录失败:', error);
            return null;
        }
    }

    // 从数据库获取记录
    async _getRecordFromDatabase(recordId) {
        if (!window.supabase) {
            console.error('Supabase客户端未初始化');
            return null;
        }

        if (!recordId || recordId === 'undefined') {
            console.error('记录ID无效:', recordId);
            return null;
        }

        try {
            const { data, error } = await window.supabase
                .from('attendance_records')
                .select(`
                    *,
                    employees!inner (emp_name, emp_code, labor_cost, project_id)
                `)
                .eq('record_id', recordId);

            if (error) {
                console.error('查询记录失败:', error);
                return null;
            }

            console.log('从数据库获取到的记录:', data);

            // 如果返回的是数组,取第一个元素
            const record = Array.isArray(data) && data.length > 0 ? data[0] : data;

            if (!record) {
                console.error('未找到记录:', recordId);
                return null;
            }

            // 将employees对象转换为数组格式,以便loadRecordForEditing函数能够正确处理
            if (record && record.employees) {
                console.log('原始record.employee_id:', record.employee_id);
                console.log('原始employees对象:', record.employees);

                // 保留原始的employees对象
                const originalEmployees = record.employees;
                // 将employees转换为数组格式
                record.employees = [{
                    empid: record.employee_id, // 使用原始的employee_id (UUID)
                    employee_id: record.employee_id, // 使用原始的employee_id (UUID)
                    emp_name: originalEmployees.emp_name,
                    labor_cost: originalEmployees.labor_cost,
                    project_id: originalEmployees.project_id,
                    emp_code: originalEmployees.emp_code // 保留工号信息
                }];

                // 不要覆盖record.employee_id,保持原始的UUID值
                console.log('转换后的employees数组:', record.employees);
                console.log('最终的record.employee_id:', record.employee_id);
            }

            return record;
        } catch (error) {
            console.error('从数据库获取记录异常:', error);
            return null;
        }
    }

    // 处理考勤记录图片图标点击事件
    _handleWorkFlowImageIconClick(e) {
        const url = e.target.dataset.url;
        this.showImagePreview(url);
    }

    // 处理结算记录图片图标点击事件
    _handleAccountingFlowImageIconClick(e) {
        const url = e.target.dataset.url;
        this.showImagePreview(url);
    }

    // 显示图片预览
    showImagePreview(imageUrl) {
        let modal = document.getElementById('detailViewImagePreviewModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'detailViewImagePreviewModal';
            modal.style.display = 'none';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 2001;"
                 onclick="if(event.target === this) document.getElementById('detailViewImagePreviewModal').style.display='none'">
                <img id="detailViewPreviewDraggableImage" src="${imageUrl}"
                     style="max-width: 90%; max-height: 90%; position: absolute; cursor: move; top: 50%; left: 50%; transform: translate(-50%, -50%);"
                     ondragstart="return false;">
                <button onclick="document.getElementById('detailViewImagePreviewModal').style.display='none'"
                        style="position: fixed; top: 20px; right: 20px; background: #f5222d; color: white; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 20px; cursor: pointer; z-index: 2002;">×</button>
            </div>
        `;
        modal.style.display = 'block';

        const img = document.getElementById('detailViewPreviewDraggableImage');
        let isDragging = false;
        let offsetX, offsetY;
        let scale = 1;

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
    
    // 渲染流水记录（兼容旧方法，不再使用）
    renderFlowRecords(empName, empCode, attendanceRecords, settlementRecords) {
        // 现在不再使用模态框显示，而是调用新的方法
        this.renderFlowRecordsInDetailView(empName, empCode, attendanceRecords, settlementRecords);
    }
    
    // 渲染考勤记录
    renderAttendanceRecords(records) {
        let html = `
            <div style="">
                <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 8px;">考勤记录</h3>
        `;

        records.forEach(record => {
            html += this.renderSingleAttendanceRecord(record);
        });

        html += `</div>`;
        return html;
    }

    // 渲染单条考勤记录
    renderSingleAttendanceRecord(record) {
        // 格式化记录数据，根据work_type渲染不同内容
        let workContent = '';
        if (record.work_type === '点工') {
            workContent = this.renderPieceWorkData(record);
        } else if (record.work_type === '包工') {
            workContent = `<div class="record-row" style="margin-bottom: 8px;"><span style="color: #999;">包工：</span>${record.contract_amount || '无'}元</div>`;
        } else if (record.work_type === '工量') {
            workContent = this.renderWorkQuantityData(record);
        }

        return `
            <div class="work-flow-record attendance-record-card" data-record-id="${record.record_id}" data-work-type="${record.work_type}"
                 style="margin-bottom: 15px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background-color: white; cursor: pointer; transition: all 0.3s ease;"
                 onmouseover="this.style.boxShadow='0 4px 12px rgba(0, 0, 0, 0.1)'; this.style.transform='translateY(-2px)'; this.style.borderColor='#FFD700';"
                 onmouseout="this.style.boxShadow='none'; this.style.transform='translateY(0)'; this.style.borderColor='#ddd';">
                <div style="margin-bottom: 8px; font-size: 14px; color: #666;">📅 ${record.record_date}</div>
                <div class="record-row" style="margin-bottom: 8px; font-weight: bold; color: #1890ff; font-size: 18px;">
                    <span>${record.employees ? record.employees.emp_name : '未知员工'}</span> ${this.renderImages(record)}
                </div>
                <div class="work-flow-record-item" style="margin-bottom: 8px;">
                    ${workContent}
                </div>
            </div>
        `;
    }

    // 渲染图片图标（与记工流水保持一致）
    renderImages(record) {
        if (!Array.isArray(record.image_ids) || record.image_ids.length === 0) {
            return '';
        }

        const imageIcons = record.image_ids.map((imgUrl, index) => {
            let displayUrl = imgUrl;
            let isLocal = false;

            if (imgUrl && imgUrl.startsWith('local://')) {
                const imageId = imgUrl.replace('local://', '');
                const imageDataJson = localStorage.getItem(imageId);
                if (imageDataJson) {
                    const imageData = JSON.parse(imageDataJson);
                    if (imageData.uploaded && imageData.cloudUrl) {
                        displayUrl = imageData.cloudUrl;
                    } else if (imageData.dataUrl) {
                        displayUrl = imageData.dataUrl;
                        isLocal = true;
                    }
                }
            }

            if (displayUrl) {
                return `<span class="work-flow-image-icon" data-url="${displayUrl}" data-index="${index}"
                    style="color: #1890ff; cursor: pointer; margin-left: 5px; display: inline-block;"
                    title="点击预览图片${index + 1}">🖼️</span>`;
            }
            return '';
        }).filter(icon => icon !== '');

        return imageIcons.join('');
    }

    // 渲染工量数据（与记工流水保持一致）
    renderWorkQuantityData(record) {
        // 从work_time中拆分工作内容和单位
        let workContent = '';
        let unit = '';

        if (record.work_time) {
            const workTime = record.work_time;
            // 检查是否包含"/"，如果包含则拆分
            if (workTime.includes('/')) {
                const parts = workTime.split('/');
                workContent = parts[0];
                unit = parts[1];
            } else {
                workContent = workTime;
            }
        }

        return `<div class="record-row" style="margin-bottom: 8px;"><span style="color: #999;">工量：</span>${workContent}  ${record.work_quantity || '0'}${unit}  ${record.contract_amount || '0'}元</div>`;
    }

    // 渲染点工数据（与记工流水保持一致）
    renderPieceWorkData(record) {
        // 拆分点工数据，分离点工和加班
        let pieceWork = '无';
        let overtime = '';

        if (record.work_time) {
            const workTime = record.work_time;
            // 检查是否包含"/"，如果包含则拆分
            if (workTime.includes('/')) {
                const parts = workTime.split('/');
                pieceWork = parts[0];
                // 如果第二部分包含"加班"，则提取加班时间
                if (parts[1].includes('加班')) {
                    overtime = parts[1].replace('加班', '');
                } else {
                    overtime = parts[1];
                }
            } else {
                pieceWork = workTime;
            }
        }

        let html = `<div class="record-row" style="margin-bottom: 8px; color: #999;">点工：</div>`;

        // 检查上班时间是否包含"上午"和"下午"
        if (pieceWork.includes('上午') && pieceWork.includes('下午')) {
            // 处理不同的分隔符：- 或 / 或 空格
            let morningAfternoonParts;
            if (pieceWork.includes('-')) {
                morningAfternoonParts = pieceWork.split('-');
            } else if (pieceWork.includes('/')) {
                morningAfternoonParts = pieceWork.split('/');
            } else {
                // 尝试使用正则表达式拆分
                morningAfternoonParts = pieceWork.split(/(上午|下午)/).filter(Boolean);
                // 重组数组，确保格式正确
                if (morningAfternoonParts.length === 3) {
                    morningAfternoonParts = [morningAfternoonParts[0] + morningAfternoonParts[1], morningAfternoonParts[2]];
                }
            }

            if (morningAfternoonParts.length >= 2) {
                // 提取上午时间
                let morningTime = '';
                let afternoonTime = '';

                // 遍历所有部分，找到上午和下午的数据
                morningAfternoonParts.forEach(part => {
                    if (part.includes('上午')) {
                        morningTime = part.replace('上午', '');
                    } else if (part.includes('下午')) {
                        afternoonTime = part.replace('下午', '');
                    }
                });

                // 显示上午和下午的数据
                if (morningTime) {
                    html += `<div class="record-row" style="margin-bottom: 8px; margin-left: 20px;">上午：${morningTime || '无'}</div>`;
                }
                if (afternoonTime) {
                    html += `<div class="record-row" style="margin-bottom: 8px; margin-left: 20px;">下午：${afternoonTime || '无'}</div>`;
                }
            } else {
                html += `<div class="record-row" style="margin-bottom: 8px; margin-left: 20px;">上班：${pieceWork || '无'}</div>`;
            }
        } else {
            html += `<div class="record-row" style="margin-bottom: 8px; margin-left: 20px;">上班：${pieceWork || '无'}</div>`;
        }

        if (overtime) {
            html += `<div class="record-row" style="margin-bottom: 8px; margin-left: 20px;">加班：${overtime}</div>`;
        }

        return html;
    }
    
    // 渲染结算记录（与结算借支页面记账列表保持一致）
    // 渲染结算记录
    renderSettlementRecords(records) {
        let html = `
            <div style="">
                <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #ff4d4f; border-bottom: 1px solid #eee; padding-bottom: 8px;">结算记录</h3>
        `;

        records.forEach(record => {
            html += this.renderSingleSettlementRecord(record);
        });

        html += `</div>`;
        return html;
    }

    // 渲染单条结算记录
    renderSingleSettlementRecord(record) {
        // 获取记录类型名称
        const recordTypeName = this.getRecordTypeName(record.record_type);

        // 获取员工姓名
        const employeeName = record.employees ? record.employees.emp_name : '未知员工';

        // 获取记录ID
        const recordId = record.id || record.settlement_id;

        // 检查是否有图片
        const hasImages = Array.isArray(record.image_ids) && record.image_ids.length > 0;
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

        let html = `
            <div class="work-flow-record settlement-record-card" data-record-id="${recordId}" data-record-type="${record.record_type}"
                style="margin-bottom: 15px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background-color: white; cursor: pointer; transition: all 0.3s ease;"
                onmouseover="this.style.boxShadow='0 4px 12px rgba(0, 0, 0, 0.1)'; this.style.transform='translateY(-2px)'; this.style.borderColor='#FFD700';"
                onmouseout="this.style.boxShadow='none'; this.style.transform='translateY(0)'; this.style.borderColor='#ddd';">
                <div style="margin-bottom: 8px; font-size: 14px; color: #666;">📅 ${record.record_date || '未知日期'}</div>
                <div class="record-row" style="margin-bottom: 8px; font-weight: bold; color: #1890ff; font-size: 18px;">
                    <div class="record-content" style="display: inline-block;">
                        <span style="color: #ff4d4f;">${employeeName}</span>${imageIcons}
                    </div>
                </div>
                <div class="record-row" style="margin-bottom: 8px; color: #999;">${recordTypeName}：</div>
        `;

        // 渲染记录详情
        if (record.record_type === '借支') {
            html += `
                <div class="record-row" style="margin-bottom: 4px; margin-left: 10px;">
                    金额：${record.amount}元
                </div>
                <div class="record-row" style="margin-bottom: 4px; margin-left: 10px;">付款人：${record.payer || '无'}</div>
            `;
        } else if (record.record_type === '扣款') {
            html += `
                <div class="record-row" style="margin-bottom: 4px; margin-left: 10px;">
                    金额：${record.amount}元
                </div>
            `;
        } else if (record.record_type === '公司转账') {
            html += `
                <div class="record-row" style="margin-bottom: 4px; margin-left: 10px;">
                    金额：${record.amount}元
                </div>
            `;
        } else if (record.record_type === '结算') {
            html += `
                <div class="record-row" style="margin-bottom: 4px; margin-left: 10px;">
                    金额：${record.amount}元
                </div>
                <div class="record-row" style="margin-bottom: 4px; margin-left: 10px;">付款人：${record.payer || '无'}</div>
            `;
        }

        // 添加备注
        if (record.remark) {
            html += `<div class="record-row" style="margin-bottom: 4px; margin-left: 10px; font-size: 12px; color: #666;">备注：${record.remark}</div>`;
        }

        html += `</div>`;
        return html;
    }

    // 获取记录类型名称
    getRecordTypeName(recordType) {
        const typeMap = {
            '借支': '借支',
            '扣款': '扣款',
            '公司转账': '公司转账',
            '结算': '结算'
        };
        return typeMap[recordType] || recordType;
    }

    // 获取图片URL
    getImageUrl(imageId) {
        let displayUrl = imageId;

        if (imageId && imageId.startsWith('local://')) {
            const id = imageId.replace('local://', '');
            const imageDataJson = localStorage.getItem(id);
            if (imageDataJson) {
                const imageData = JSON.parse(imageDataJson);
                if (imageData.uploaded && imageData.cloudUrl) {
                    displayUrl = imageData.cloudUrl;
                } else if (imageData.dataUrl) {
                    displayUrl = imageData.dataUrl;
                }
            }
        }

        return displayUrl;
    }
}

// 暴露给全局使用
window.WorkerCardClickHandler = WorkerCardClickHandler;