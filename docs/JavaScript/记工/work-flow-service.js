/**
 * 记工流水服务 - 负责处理记工流水的显示和管理
 */
class WorkFlowService {
    constructor() {
        this.employees = []; // 所有员工数据
        this.workFlowData = []; // 记工流水数据
        this.refreshDebounceTimer = null; // 防抖定时器
        this.minDebounceDelay = 50; // 最小防抖延迟
    }

    /**
     * 初始化记工流水服务
     */
    init() {
        this.loadEmployees();
        this.setupEventListeners();
    }

    /**
     * 加载员工数据
     */
    loadEmployees() {
        try {
            // 从localStorage加载员工数据
            const phone = localStorage.getItem('loggedInPhone') || 'default';
            const projectId = localStorage.getItem('currentProjectId') || '';
            const localKey = `employees_${projectId}`;
            const savedData = localStorage.getItem(localKey);
            
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                if (parsedData.employees && Array.isArray(parsedData.employees)) {
                    this.employees = parsedData.employees;
                }
            }
        } catch (error) {
            console.error('加载员工数据失败:', error);
        }
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 监听确认记工事件
        document.addEventListener('workRecordConfirmed', async () => {
            await this.immediateRefreshWorkFlow();
        });

        // 监听记工流水标签页切换事件
        const tabWorkFlow = document.getElementById('tabWorkFlow');
        if (tabWorkFlow) {
            tabWorkFlow.addEventListener('change', async () => {
                if (tabWorkFlow.checked) {
                    // 立即隐藏编辑模式下的底部按钮，不等待数据刷新
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
                    
                    // 然后刷新记工流水数据
                    await this.refreshWorkFlow();
                    // 检查已记工员工，恢复已记标记和标记不可选状态
                    if (window.checkMarkedEmployees) {
                        window.checkMarkedEmployees();
                    }
                }
            });
        }
        
        // 添加 MutationObserver 监听日期输入框的值变化
        this.setupDateChangeObserver();
        
        // 监听日期显示容器的变化
        this.setupDateDisplayObserver();
        
        // 监听记工日期变更事件
        const workDateInput = document.getElementById('workDate');
        if (workDateInput) {
            workDateInput.addEventListener('change', () => {
                // 只有当记工流水标签页被选中时，才刷新记工流水
                const tabWorkFlow = document.getElementById('tabWorkFlow');
                if (tabWorkFlow && tabWorkFlow.checked) {
                    this.debounceRefreshWorkFlow(100);
                }
            });
        }
        
        // 监听全局日期变化自定义事件
        document.addEventListener('dateChanged', () => {
            // 检查是否在记工流水标签页
            const tabWorkFlow = document.getElementById('tabWorkFlow');
            if (tabWorkFlow && tabWorkFlow.checked) {
                this.debounceRefreshWorkFlow(100);
            }
        });
        
        // 监听页面加载完成事件，确保初始状态正确
        document.addEventListener('DOMContentLoaded', async () => {
            // 延迟执行，确保所有组件都已完成初始化
            setTimeout(async () => {
                const tabWorkFlow = document.getElementById('tabWorkFlow');
                if (tabWorkFlow && tabWorkFlow.checked) {
                    await this.immediateRefreshWorkFlow();
                }
            }, 500);
        });
        
        // 监听日期选择器确认按钮点击事件
        const confirmDatesBtn = document.getElementById('confirmDates');
        if (confirmDatesBtn) {
            confirmDatesBtn.addEventListener('click', () => {
                // 延迟执行，确保workDateInput的值已经更新
                setTimeout(() => {
                    // 只有当记工流水标签页被选中时，才刷新记工流水
                    const tabWorkFlow = document.getElementById('tabWorkFlow');
                    if (tabWorkFlow && tabWorkFlow.checked) {
                        this.debounceRefreshWorkFlow(50);
                    }
                }, 100);
            });
        }
        
        // 监听日期选择器的日期点击事件（单选模式下直接选择日期）
        document.addEventListener('click', async (e) => {
            // 检查点击的是否是日期选择器中的日期单元格
            if (e.target.classList.contains('day-cell') && !e.target.classList.contains('other-month') && !e.target.classList.contains('disabled-future')) {
                // 延迟执行，确保workDateInput的值已经更新
                setTimeout(() => {
                    // 只有当记工流水标签页被选中时，才刷新记工流水
                    const tabWorkFlow = document.getElementById('tabWorkFlow');
                    if (tabWorkFlow && tabWorkFlow.checked) {
                        this.debounceRefreshWorkFlow(50);
                    }
                }, 100);
                return;
            }
            
            // 检查点击的是否是记工流水记录项
            const recordItem = e.target.closest('.clickable-record');
            if (recordItem) {
                const recordId = recordItem.dataset.recordId;
                const workType = recordItem.dataset.workType;
                
                // 获取当前记录的完整数据
                // 从当前渲染的记录中查找对应的数据
                let currentRecord = null;
                for (const dayData of this.workFlowData) {
                    currentRecord = dayData.records.find(r => 
                        (r.id || r.record_id) === recordId
                    );
                    if (currentRecord) break;
                }
                
                if (recordId && currentRecord) {
                    // 构建完整的URL参数
                    const params = new URLSearchParams();
                    params.append('record_id', recordId);
                    params.append('workType', workType);
                    params.append('projectId', currentRecord.project_id || '');
                    params.append('workDate', currentRecord.record_date || currentRecord.date || '');
                    params.append('employeeId', currentRecord.employee_id || '');
                    
                    // 跳转到记工页面的编辑模式
                    const currentUrl = window.location.href.split('?')[0];
                    window.location.href = `${currentUrl}?${params.toString()}`;
                }
                return;
            }
            
            // 检查点击的是否是审核按钮
            const auditButton = e.target.closest('.audit-button');
            if (auditButton) {
                // 检查按钮是否已禁用（已审核状态）
                if (auditButton.disabled) {
                    return;
                }
                
                const recordId = auditButton.dataset.recordId;
                if (recordId) {
                    await this.handleAudit(recordId);
                }
                return;
            }
        });
    }

    /**
     * 防抖刷新记工流水
     */
    debounceRefreshWorkFlow(delay = 150) {
        // 清除之前的定时器
        if (this.refreshDebounceTimer) {
            clearTimeout(this.refreshDebounceTimer);
        }
        
        // 使用较短的延迟，提高响应性
        const actualDelay = Math.max(this.minDebounceDelay, Math.min(delay, 120));
        
        // 设置新的定时器
        this.refreshDebounceTimer = setTimeout(async () => {
            await this.refreshWorkFlow();
        }, actualDelay);
    }
    
    /**
     * 立即刷新记工流水（不使用防抖）
     */
    async immediateRefreshWorkFlow() {
        // 清除任何待执行的防抖定时器
        if (this.refreshDebounceTimer) {
            clearTimeout(this.refreshDebounceTimer);
            this.refreshDebounceTimer = null;
        }
        
        // 立即刷新
        await this.refreshWorkFlow();
    }

    /**
     * 刷新记工流水
     */
    async refreshWorkFlow() {
        // 重新加载员工数据，确保员工姓名正确
        this.loadEmployees();
        
        // 直接从localStorage获取当前项目ID
        const projectId = localStorage.getItem('currentProjectId') || '';
        
        // 获取记工页面中的记工日期
        const workDateInput = document.getElementById('workDate');
        let workDate = new Date().toISOString().split('T')[0]; // 默认今天
        
        if (workDateInput) {
            // 优先使用value值
            if (workDateInput.value) {
                workDate = workDateInput.value;
            }
            // 如果value为空，检查data-today属性
            else if (workDateInput.dataset.today) {
                workDate = workDateInput.dataset.today;
            }
        }

        // 处理多日期情况
        let selectedDates = [workDate];
        if (workDateInput && workDateInput.dataset.displayValue) {
            // 如果有多个日期，解析日期范围
            selectedDates = this._parseMultipleDates(workDateInput.dataset.displayValue);
        }
        
        await this.loadWorkFlowData(projectId, selectedDates);
        this.renderWorkFlow();
    }

    // 用于跟踪网络状态日志的输出情况
    networkStatusLogOutput = false;
    
    /**
     * 等待网络恢复
     */
    async waitForNetwork() {
        // 如果已经在线，直接返回
        if (navigator.onLine) {
            return true;
        }
        
        // 等待网络恢复
        return new Promise((resolve) => {
            const handleOnline = () => {
                window.removeEventListener('online', handleOnline);
                // 网络恢复后，重置日志输出标志
                this.networkStatusLogOutput = false;
                resolve(true);
            };
            
            window.addEventListener('online', handleOnline);
        });
    }
    
    /**
     * 加载记工流水数据
     */
    async loadWorkFlowData(projectId, dates) {
        // 如果传入的是单个日期字符串，转换为数组
        if (typeof dates === 'string') {
            dates = [dates];
        }
        
        try {
            // 直接从本地存储加载数据
            await this.loadWorkFlowDataFromLocal(projectId, dates);
        } catch (error) {
            console.error('获取记工流水数据失败:', error);
            // 错误时返回空数据
            this.workFlowData = [{ dates: dates, records: [] }];
        }
    }
    
    /**
     * 从本地存储加载记工流水数据
     */
    async loadWorkFlowDataFromLocal(projectId, dates) {
        try {
            // 如果传入的是单个日期字符串，转换为数组
            if (typeof dates === 'string') {
                dates = [dates];
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
            
            // 使用与首页一致的键名：work_records_${userId}
            const localStorageKey = `work_records_${userId}`;
            
            // 从本地存储获取数据
            const localWorkFlowDataStr = localStorage.getItem(localStorageKey);
            if (localWorkFlowDataStr) {
                const allRecords = JSON.parse(localWorkFlowDataStr);
                
                // 过滤出指定日期和项目的记录
                const filteredRecords = allRecords.filter(record => 
                    dates.includes(record.record_date) && 
                    (!projectId || record.project_id === projectId)
                );
                
                this.workFlowData = [{
                    dates: dates,
                    records: filteredRecords
                }];
                return;
            }
        } catch (error) {
            console.error('从本地存储加载记工流水数据失败:', error);
        }
        
        // 如果本地存储也没有数据，返回空数组
        this.workFlowData = [{ dates: dates, records: [] }];
    }

    /**
     * 渲染记工流水
     */
    renderWorkFlow() {
        const workFlowContent = document.getElementById('workFlowTabContent');
        if (!workFlowContent) {
            return;
        }

        if (this.workFlowData.length === 0 || this.workFlowData[0].records.length === 0) {
            workFlowContent.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无记工流水数据</div>';
            return;
        }

        let html = '';

        // 获取所有日期的记工记录
        const dayData = this.workFlowData[0];
        let records = dayData.records;
        
        // 按日期升序排序，然后按员工工号(emp_code)升序排序
        records.sort((record1, record2) => {
            // 先按日期升序排序
            const date1 = record1.record_date || '';
            const date2 = record2.record_date || '';
            if (date1 !== date2) {
                return date1.localeCompare(date2);
            }
            
            // 日期相同，按员工工号升序排序
            const emp1 = this.employees.find(emp => emp.employee_id === record1.employee_id);
            const emp2 = this.employees.find(emp => emp.employee_id === record2.employee_id);
            
            const code1 = emp1 ? parseInt(emp1.emp_code || '0') : 0;
            const code2 = emp2 ? parseInt(emp2.emp_code || '0') : 0;
            
            return code1 - code2;
        });

        html += '<div class="work-flow-records">';

        // 遍历所有记录，每条记录单独渲染
        for (const record of records) {
            html += this.renderSingleWorkRecord(record);
        }

        html += '</div>';

        // 计算合计
        const totals = this.calculateTotals(records);
        
        // 添加合计显示
        html += this.renderTotals(totals);

        workFlowContent.innerHTML = html;

        // 绑定图片图标点击事件
        this.bindImageIconEvents();
    }

    /**
     * 计算各项合计
     */
    calculateTotals(records) {
        let totalPieceWorkHours = 0;
        let totalContractWorkAmount = 0;
        let totalWorkQuantityAmount = 0;
        let totalOvertimeHours = 0;

        for (const record of records) {
            if (record.work_type === '点工') {
                const hours = parseFloat(record.regular_hours) || 0;
                totalPieceWorkHours += hours;
                
                const overtimeHours = parseFloat(record.overtime_hours) || 0;
                totalOvertimeHours += overtimeHours;
            } else if (record.work_type === '包工') {
                const amount = parseFloat(record.contract_amount) || 0;
                totalContractWorkAmount += amount;
            } else if (record.work_type === '工量') {
                const amount = parseFloat(record.contract_amount) || 0;
                totalWorkQuantityAmount += amount;
            }
        }

        return {
            totalPieceWorkHours: this.formatNumber(totalPieceWorkHours),
            totalContractWorkAmount: this.formatNumber(totalContractWorkAmount),
            totalWorkQuantityAmount: this.formatNumber(totalWorkQuantityAmount),
            totalOvertimeHours: this.formatNumber(totalOvertimeHours)
        };
    }

    /**
     * 格式化数字，如果是整数则显示整数
     */
    formatNumber(num) {
        if (Number.isInteger(num)) {
            return num.toString();
        }
        return num.toFixed(2);
    }

    /**
     * 渲染合计显示
     */
    renderTotals(totals) {
        let displayHtml = '';
        
        if (totals.totalPieceWorkHours !== '0' && totals.totalPieceWorkHours !== '0.00') {
            displayHtml += `<span style="font-size: 16px; font-weight: bold; color: #333;">点工：<span style="color: #ff4d4f; font-size: 18px;">${totals.totalPieceWorkHours}</span><span style="color: #333;">小时</span></span>`;
        }
        
        if (totals.totalOvertimeHours !== '0' && totals.totalOvertimeHours !== '0.00') {
            displayHtml += `<span style="font-size: 16px; font-weight: bold; color: #333;">加班：<span style="color: #ff4d4f; font-size: 18px;">${totals.totalOvertimeHours}</span><span style="color: #333;">小时</span></span>`;
        }
        
        if (totals.totalContractWorkAmount !== '0' && totals.totalContractWorkAmount !== '0.00') {
            displayHtml += `<span style="font-size: 16px; font-weight: bold; color: #333;">包工：<span style="color: #ff4d4f; font-size: 18px;">¥${totals.totalContractWorkAmount}</span><span style="color: #333;">元</span></span>`;
        }
        
        if (totals.totalWorkQuantityAmount !== '0' && totals.totalWorkQuantityAmount !== '0.00') {
            displayHtml += `<span style="font-size: 16px; font-weight: bold; color: #333;">工量：<span style="color: #ff4d4f; font-size: 18px;">¥${totals.totalWorkQuantityAmount}</span><span style="color: #333;">元</span></span>`;
        }
        
        if (!displayHtml) {
            return '';
        }
        
        return `
            <div class="work-flow-totals" style="position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: flex-start; align-items: center; background: linear-gradient(135deg, #ffe6e6 0%, #fff0f0 100%); padding: 15px; box-shadow: 0 -2px 10px rgba(0,0,0,0.1); z-index: 999;">
                <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                    ${displayHtml}
                </div>
            </div>
            <div style="height: 70px;"></div>
        `;
    }

    /**
     * 渲染单个记工记录
     */
    renderSingleWorkRecord(record) {
        // 获取员工信息
        const employee = this.employees.find(emp => emp.employee_id === record.employee_id);
        const empName = employee ? employee.emp_name : '未知员工';
        
        // 根据审核状态确定图标和样式
        const isAudited = record.audit_status === '已审';
        // 将!图标设为1.5em，✓图标也设为1.5em
        const auditIcon = isAudited ? '<span style="font-size: 1.5em; display: inline-block; vertical-align: middle; line-height: 1;">✓</span>' : '<span style="font-size: 1.5em; display: inline-block; vertical-align: middle; line-height: 1;">!</span>';
        const auditText = isAudited ? '已审核' : '审核';
        // 调换颜色：未审核为红色，已审核为蓝色
        const nameStyle = isAudited ? 'style="color: #1890ff;"' : 'style="color: red;"';
        // 已审核按钮文字为绿色，未审核按钮文字为红色
        const buttonStyle = isAudited ? 
            'margin-left: 10px; cursor: not-allowed; border: none; font-size: 14px; color: white; vertical-align: middle; background: linear-gradient(135deg, #52c41a, #73d13d); padding: 6px 12px; border-radius: 16px; box-shadow: 0 2px 4px rgba(82, 196, 26, 0.3); transition: all 0.3s ease; font-weight: 500; opacity: 0.7;' : 
            'margin-left: 10px; cursor: pointer; border: none; font-size: 14px; color: white; vertical-align: middle; background: linear-gradient(135deg, #ff4d4f, #ff7875); padding: 6px 12px; border-radius: 16px; box-shadow: 0 2px 4px rgba(255, 77, 79, 0.3); transition: all 0.3s ease; font-weight: 500;';
        
        // 检查是否是多日期模式
        const isMultiDate = this.workFlowData[0].dates && this.workFlowData[0].dates.length > 1;
        
        // 渲染单条记工记录
        return `
            <div class="work-flow-record" style="margin-bottom: 15px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background-color: white;">
                ${isMultiDate ? `<div style="margin-bottom: 8px; font-size: 14px; color: #666;">📅 ${record.record_date}</div>` : ''}
                <div class="record-row" style="margin-bottom: 8px; font-weight: bold; ${isAudited ? 'color: #1890ff;' : 'color: red;'} font-size: 18px;">
                    <span ${nameStyle}>${empName}</span> ${this.renderImages(record)}
                    <button class="audit-button" data-record-id="${record.id || record.record_id}" 
                        style="${buttonStyle}"
                        ${isAudited ? 'disabled onclick="event.preventDefault(); event.stopPropagation(); return false;"' : ''}
                        onmouseover="${isAudited ? '' : 'this.style.transform=\'translateY(-2px)\'; this.style.boxShadow=\'0 4px 8px rgba(255, 77, 79, 0.4)\';'}"
                        onmouseout="${isAudited ? '' : 'this.style.transform=\'translateY(0)\'; this.style.boxShadow=\'0 2px 4px rgba(255, 77, 79, 0.3)\';'}">
                        ${auditIcon} ${auditText}
                    </button>
                </div>
                ${this.renderSingleWorkTypeData(record)}
            </div>
        `;
    }
    
    /**
     * 根据work_type渲染单条记录对应的数据
     */
    renderSingleWorkTypeData(record) {
        let html = '';
        
        const recordId = record.id || record.record_id;
        let recordHtml = '';
        
        // 根据work_type渲染对应数据，确保完全基于work_type字段
        if (record.work_type === '点工') {
            recordHtml = this.renderPieceWorkData(record);
        } else if (record.work_type === '包工') {
            recordHtml = this.renderContractWorkData(record);
        } else if (record.work_type === '工量') {
            recordHtml = this.renderWorkQuantityData(record);
        }
        
        // 为每条记录添加点击事件和数据属性
        html += `<div class="work-flow-record-item clickable-record" style="margin-bottom: 8px; cursor: pointer; transition: background-color 0.2s;" data-record-id="${recordId}" data-work-type="${record.work_type}">
            ${recordHtml}
        </div>`;
        
        return html;
    }
    
    /**
     * 渲染点工数据
     */
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
    
    /**
     * 渲染包工数据
     */
    renderContractWorkData(record) {
        return `<div class="record-row" style="margin-bottom: 8px;"><span style="color: #999;">包工：</span>${record.contract_amount || '无'}元</div>`;
    }
    
    /**
     * 渲染工量数据
     */
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
    
    /**
     * 设置日期变化观察器
     */
    setupDateChangeObserver() {
        const workDateInput = document.getElementById('workDate');
        if (!workDateInput) return;
        
        // 创建 MutationObserver 监听输入框属性变化
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'value') {
                    // 检查是否在记工流水标签页
                    const tabWorkFlow = document.getElementById('tabWorkFlow');
                    if (tabWorkFlow && tabWorkFlow.checked) {
                        // 使用防抖刷新，避免与其他事件冲突
                        this.debounceRefreshWorkFlow(200);
                    }
                }
            });
        });
        
        // 开始观察
        observer.observe(workDateInput, {
            attributes: true,
            attributeFilter: ['value']
        });
        
        // 保存observer引用，防止被垃圾回收
        this.dateObserver = observer;
    }
    
    /**
     * 设置日期显示观察器
     */
    setupDateDisplayObserver() {
        const dateDisplay = document.getElementById('dateDisplay');
        if (!dateDisplay) return;
        
        // 创建 MutationObserver 监听日期显示容器的文本内容变化
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                    // 检查是否在记工流水标签页
                    const tabWorkFlow = document.getElementById('tabWorkFlow');
                    if (tabWorkFlow && tabWorkFlow.checked) {
                        // 使用较短的防抖延迟，提高响应速度
                        this.debounceRefreshWorkFlow(120);
                    }
                }
            });
        });
        
        // 开始观察
        observer.observe(dateDisplay, {
            childList: true,
            characterData: true,
            subtree: true
        });
        
        // 保存observer引用，防止被垃圾回收
        this.dateDisplayObserver = observer;
    }

    /**
     * 处理审核操作
     */
    async handleAudit(recordId) {
        try {
            // 更新本地记录
            const localKey = `attendance_data_${recordId}`;
            const recordData = JSON.parse(localStorage.getItem(localKey) || '{}');
            
            if (!recordData) {
                console.error('找不到记录数据:', recordId);
                return;
            }
            
            // 更新审核状态
            recordData.audit_status = '已审';
            localStorage.setItem(localKey, JSON.stringify(recordData));
            
            // 同时更新记工流水数据中的对应记录 (work_records_{userId})
            try {
                const currentUserStr = localStorage.getItem('currentUser');
                if (currentUserStr) {
                    const currentUser = JSON.parse(currentUserStr);
                    const userId = currentUser.user_id || 'default';
                    const workRecordsKey = `work_records_${userId}`;
                    const workRecords = JSON.parse(localStorage.getItem(workRecordsKey) || '[]');
                    
                    if (Array.isArray(workRecords)) {
                        const recordIndex = workRecords.findIndex(r => (r.id || r.record_id) === recordId);
                        if (recordIndex !== -1) {
                            workRecords[recordIndex].audit_status = '已审';
                            localStorage.setItem(workRecordsKey, JSON.stringify(workRecords));
                        }
                    }
                }
            } catch (e) {
                console.error('更新work_records失败:', e);
            }
            
            // 检查网络状态
            const isOnline = navigator.onLine;
            
            if (!isOnline) {
                console.log('离线模式：审核操作已保存到本地，将在网络恢复后同步');
                
                // 添加到同步队列
                if (window.offlineSyncService) {
                    const auditData = {
                        record_id: recordId,
                        audit_status: '已审',
                        phone: localStorage.getItem('loggedInPhone') || 'default'
                    };
                    
                    window.offlineSyncService.addToSyncQueue('update_audit', auditData, `audit_${recordId}`, '考勤审核状态');
                }
                
                // 立即更新UI中的按钮状态
                const auditButton = document.querySelector(`.audit-button[data-record-id="${recordId}"]`);
                if (auditButton) {
                    // 更新按钮为已审核状态
                    auditButton.disabled = true;
                    auditButton.style.cursor = 'not-allowed';
                    auditButton.style.opacity = '0.7';
                    auditButton.style.background = 'linear-gradient(135deg, #52c41a, #73d13d)';
                    
                    // 更新按钮内容
                    auditButton.innerHTML = '<span style="font-size: 1.5em; display: inline-block; vertical-align: middle; line-height: 1;">✓</span> 已审核';
                    
                    // 更新员工姓名颜色
                    const recordRow = auditButton.closest('.record-row');
                    if (recordRow) {
                        const nameSpan = recordRow.querySelector('span');
                        if (nameSpan) {
                            nameSpan.style.color = '#1890ff';
                        }
                    }
                }
                
                // 刷新记工流水显示 - 离线模式下不刷新整个列表，避免覆盖手动更新的DOM状态
                // await this.immediateRefreshWorkFlow();
                return;
            }
            
            // 在线模式：直接更新Supabase中的记录
            // 获取北京时间（UTC+8）
            const now = new Date();
            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
            
            const { error } = await supabase
                .from('attendance_records')
                .update({ 
                    audit_status: '已审',
                    updated_at: beijingTime.toISOString()
                })
                .eq('record_id', recordId);
                
            if (error) {
                console.error('更新审核状态失败:', error);
                // 如果Supabase更新失败，回滚本地状态
                recordData.audit_status = '未审核';
                localStorage.setItem(localKey, JSON.stringify(recordData));
                return;
            }
            
            // 刷新记工流水显示
            await this.immediateRefreshWorkFlow();
        } catch (error) {
            console.error('处理审核操作失败:', error);
        }
    }
    
    /**
     * 渲染图像图标
     */
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

        return imageIcons.join(' ');
    }

    /**
     * 绑定图片图标点击事件
     */
    bindImageIconEvents() {
        const imageIcons = document.querySelectorAll('.work-flow-image-icon');
        imageIcons.forEach(icon => {
            icon.removeEventListener('click', this._handleImageIconClick);
            icon.addEventListener('click', this._handleImageIconClick.bind(this));
        });
    }

    /**
     * 处理图片图标点击事件
     */
    _handleImageIconClick(e) {
        const url = e.target.dataset.url;
        this.showImagePreview(url);
    }

    /**
     * 显示图片预览
     */
    showImagePreview(imageUrl) {
        let modal = document.getElementById('workFlowImagePreviewModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'workFlowImagePreviewModal';
            modal.style.display = 'none';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 2001;" 
                 onclick="if(event.target === this) document.getElementById('workFlowImagePreviewModal').style.display='none'">
                <img id="workFlowPreviewDraggableImage" src="${imageUrl}" 
                     style="max-width: 90%; max-height: 90%; position: absolute; cursor: move; top: 50%; left: 50%; transform: translate(-50%, -50%);"
                     ondragstart="return false;">
                <button onclick="document.getElementById('workFlowImagePreviewModal').style.display='none'" 
                        style="position: fixed; top: 20px; right: 20px; background: #f5222d; color: white; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 20px; cursor: pointer; z-index: 2002;">×</button>
            </div>
        `;
        modal.style.display = 'block';

        const img = document.getElementById('workFlowPreviewDraggableImage');
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

    /**
     * 解析多日期字符串，返回日期数组
     */
    _parseMultipleDates(dateString) {
        const dates = [];
        
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
        
        return dates;
    }
}

// 导出服务实例
const workFlowService = new WorkFlowService();

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    workFlowService.init();
});