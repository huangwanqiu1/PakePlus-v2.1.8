// 项目记账明细数据获取和显示
class ProjectFinanceDetail {
    constructor() {
        this.supabase = window.supabase;
        this.offlineSync = window.offlineSync;
        this.currentProjectId = localStorage.getItem('currentProjectId') || '';
        this.currentRecordDate = '';
        this.currentType = ''; // 'expense' or 'income'
        this.cachedExpenses = [];
        this.cachedIncomes = [];
        this.editingRecordId = null; // 当前编辑的记录ID
        this.init();
    }

    init() {
        this.bindEvents();
        this.bindFilterEvents();
    }

    bindEvents() {
        const workDateInput = document.getElementById('workDate');
        if (workDateInput) {
            workDateInput.addEventListener('change', () => {
                if (this.currentType) {
                    this.currentRecordDate = workDateInput.value;
                    this.loadDetailData();
                } else {
                    // 当前类型为空，不加载明细数据
                }
            });
        }

        const projectDetailLabel = document.querySelector('label[for="projectDetail"]');

        const checkAndLoad = () => {
            const isExpense = document.getElementById('projectExpense').checked;
            const isIncome = document.getElementById('projectIncome').checked;
            const dateInputSection = document.getElementById('dateInputSection');
            const totalAmountDisplay = document.getElementById('totalAmountDisplay');

            if (totalAmountDisplay) {
                totalAmountDisplay.style.setProperty('display', 'none', 'important');
            }

            if (isExpense) {
                this.currentType = 'expense';
                if (dateInputSection) {
                    dateInputSection.style.display = 'block';
                }
                this.loadDetailData();
            } else if (isIncome) {
                this.currentType = 'income';
                if (dateInputSection) {
                    dateInputSection.style.display = 'none';
                }
                this.loadDetailData();
            }
        };

        if (projectDetailLabel) {
            projectDetailLabel.addEventListener('click', () => {
                // 切换明细checkbox状态
                const projectDetail = document.getElementById('projectDetail');
                if (projectDetail) {
                    // 切换checkbox状态
                    projectDetail.checked = !projectDetail.checked;
                    
                    // 更新标签的active类
                    if (projectDetail.checked) {
                        projectDetailLabel.classList.add('active');
                    } else {
                        projectDetailLabel.classList.remove('active');
                    }
                    
                    // 保存状态到localStorage
                    localStorage.setItem('projectDetailSelected', projectDetail.checked);
                    
                    // 更新页面显示状态
                    window.updateInputSectionsDisplay();
                    
                    // 重置表单和更新输入框背景色
                    window.resetForm();
                    window.setupInputBackgroundChange();
                }
                setTimeout(checkAndLoad, 100);
            });
        }
    }

    async loadDetailData() {
        // 尝试从DOM获取当前类型，如果未设置
        if (!this.currentType) {
            const isExpense = document.getElementById('projectExpense')?.checked;
            const isIncome = document.getElementById('projectIncome')?.checked;
            if (isExpense) {
                this.currentType = 'expense';
            } else if (isIncome) {
                this.currentType = 'income';
            }
        }

        const workDateInput = document.getElementById('workDate');
        
        if (workDateInput) {
            // 检查日期输入框状态
            if (workDateInput.dataset.selectAll === 'true') {
                // 情况1：全部状态
                this.currentRecordDate = 'all'; // 特殊标记，表示全部
                this.dateRange = null;
            }
            // 情况2：多日期状态
            else if (workDateInput.dataset.displayValue && workDateInput.dataset.displayValue.includes('~')) {
                const dates = workDateInput.dataset.displayValue.split(' ~ ');
                if (dates.length === 2) {
                    this.currentRecordDate = dates[0]; // 使用开始日期作为查询条件
                    this.dateRange = {
                        start: dates[0],
                        end: dates[1]
                    };
                }
            }
            // 情况3：单日期状态（按原逻辑不变）
            else {
                this.currentRecordDate = workDateInput.value;
                this.dateRange = null;
            }
        }

        if (!this.currentProjectId || !this.currentType) {
            return;
        }

        this.clearTable();

        if (this.currentType === 'expense') {
            await this.loadExpenseData();
        } else if (this.currentType === 'income') {
            await this.loadIncomeData();
        } else {
            console.log('未知类型，不加载数据:', this.currentType);
        }
        
        // 数据加载完成后，调整表格容器高度
        setTimeout(() => {
            if (typeof window.adjustTableContainerHeight === 'function') {
                window.adjustTableContainerHeight();
            }
        }, 100);
    }

    clearTable() {
        const tableBody = document.querySelector('#detailTableSection tbody');
        const emptyDataMsg = document.getElementById('emptyDataMsg');
        const tableScroll = document.querySelector('.table-scroll');
        const totalAmountDisplay = document.getElementById('totalAmountDisplay');
        
        if (tableBody) {
            tableBody.innerHTML = '';
        }
        if (tableScroll) {
            tableScroll.style.display = 'none';
        }
        if (emptyDataMsg) {
            emptyDataMsg.style.display = 'block';
        }
        if (totalAmountDisplay) {
            totalAmountDisplay.style.display = 'none';
        }
    }

    async loadExpenseData() {
        try {
            // 1. 首先从本地获取项目支出数据（无论是否在线）
            // 需求：明细界面获取项目支出数据和变更日期获取项目支出数据时取消云端获取，改为本地获取
            let expenses = this.getLocalExpenses();

            // 对数据按record_date升序排列，record_date相同则按created_at升序排列
            expenses.sort((a, b) => {
                const dateA = new Date(a.record_date || 0).getTime();
                const dateB = new Date(b.record_date || 0).getTime();
                if (dateA !== dateB) {
                    return dateA - dateB;
                }
                // 如果日期相同，按created_at排序
                const createdAtA = new Date(a.created_at || 0).getTime();
                const createdAtB = new Date(b.created_at || 0).getTime();
                return createdAtA - createdAtB;
            });

            this.cachedExpenses = expenses;
            this.updatePayerFilter(expenses);
            this.renderExpenseTable(expenses);
        } catch (error) {
            console.error('加载项目支出数据失败:', error);
        }
    }
    
    async loadIncomeData() {
        try {
            let incomes = [];

            const isOnline = navigator.onLine;

            if (isOnline) {
                // 始终获取当前项目ID的所有收入数据，不根据日期过滤
                const { data, error } = await this.supabase
                    .from('project_income')
                    .select('*')
                    .eq('project_id', this.currentProjectId)
                    .order('created_at', { ascending: true });

                if (error) {
                    console.error('获取项目收入数据失败:', error);
                } else {
                    incomes = data || [];
                    
                    // 直接将云端数据同步到本地
                    await this.syncIncomesToLocal(incomes);
                }
            } else {
                // 离线模式：直接从本地获取数据，不合并在线数据
                const localIncomes = this.getLocalIncomes();
                incomes = localIncomes;
            }

            incomes.sort((a, b) => {
                const timeA = new Date(a.created_at || 0).getTime();
                const timeB = new Date(b.created_at || 0).getTime();
                return timeA - timeB;
            });

            // 保存收入数据到缓存中，用于删除操作
            this.cachedIncomes = incomes;
            
            this.renderIncomeTable(incomes);
        } catch (error) {
            console.error('加载项目收入数据失败:', error);
        }
    }

    getLocalExpenses() {
        try {
            // 1. 获取项目支出记录
            const expensesJson = localStorage.getItem('project_expenses');
            let expenses = expensesJson ? JSON.parse(expensesJson) : [];
            
            // 2. 获取本地结算记录（借支/结算）
            const settlementRecords = this.getLocalSettlementRecords();
            
            // 3. 合并数据
            expenses = [...expenses, ...settlementRecords];

            // 根据日期状态过滤数据
            let filtered;
            if (this.currentRecordDate === 'all') {
                // 情况1：全部状态 - 获取当前项目ID的所有支出数据
                filtered = expenses.filter(expense => expense.project_id === this.currentProjectId);
            } else if (this.dateRange) {
                // 情况2：多日期状态 - 获取日期范围内的支出数据
                filtered = expenses.filter(expense => 
                    expense.project_id === this.currentProjectId &&
                    expense.record_date >= this.dateRange.start &&
                    expense.record_date <= this.dateRange.end
                );
            } else {
                // 情况3：单日期状态 - 按原逻辑处理
                filtered = expenses.filter(expense => 
                    expense.project_id === this.currentProjectId &&
                    expense.record_date === this.currentRecordDate
                );
            }
            
            // 排序：先按记录类型（项目支出在前，结算借支在后），再按日期升序排列
            filtered.sort((a, b) => {
                // 判断记录类型
                const isAProjectExpense = !(a.expense_id && a.expense_id.startsWith('settlement_'));
                const isBProjectExpense = !(b.expense_id && b.expense_id.startsWith('settlement_'));
                
                // 项目支出在前，结算借支在后
                if (isAProjectExpense && !isBProjectExpense) return -1;
                if (!isAProjectExpense && isBProjectExpense) return 1;
                
                // 如果记录类型相同，按日期升序排列
                const dateA = new Date(a.record_date || 0).getTime();
                const dateB = new Date(b.record_date || 0).getTime();
                if (dateA !== dateB) {
                    return dateA - dateB;
                }
                // 如果日期相同，按created_at排序
                const createdAtA = new Date(a.created_at || 0).getTime();
                const createdAtB = new Date(b.created_at || 0).getTime();
                return createdAtA - createdAtB;
            });
            
            return filtered;
        } catch (error) {
            console.error('获取本地项目支出数据失败:', error);
            return [];
        }
    }

    // 获取本地结算记录并转换为expense格式
    getLocalSettlementRecords() {
        try {
            const recordMap = new Map();
            // 定义存储位置优先级：settlementRecords（最高）> settlement_records_cache > offline_settlement_records
            // 注意：这里我们参考 accounting-flow-service.js 的逻辑
            const storageSources = ['offline_settlement_records', 'settlement_records_cache', 'settlementRecords'];
            
            storageSources.forEach(source => {
                try {
                    const storedData = localStorage.getItem(source);
                    if (storedData) {
                        const parsedData = JSON.parse(storedData);
                        if (Array.isArray(parsedData)) {
                            parsedData.forEach(record => {
                                if (record && record.settlement_id && record.project_id === this.currentProjectId) {
                                    // 仅处理 借支 和 结算 类型
                                    if (['借支', '结算'].includes(record.record_type)) {
                                        recordMap.set(record.settlement_id, record);
                                    }
                                }
                            });
                        } else if (typeof parsedData === 'object' && parsedData !== null) {
                            // 对象格式：可能按日期分组
                            for (const date in parsedData) {
                                if (parsedData.hasOwnProperty(date)) {
                                    const dateRecords = parsedData[date];
                                    if (Array.isArray(dateRecords)) {
                                        dateRecords.forEach(record => {
                                            if (record && record.settlement_id && record.project_id === this.currentProjectId) {
                                                if (['借支', '结算'].includes(record.record_type)) {
                                                    recordMap.set(record.settlement_id, record);
                                                }
                                            }
                                        });
                                    }
                                }
                            }
                        }
                    }
                } catch (sourceError) {
                    console.error(`从${source}获取结算记录失败:`, sourceError);
                }
            });

            // 转换数据格式
            const records = Array.from(recordMap.values());
            return records.map(record => {
                const employeeName = this.getEmployeeNameById(record.employee_id) || '';
                const empCode = this.getEmployeeEmpCodeById(record.employee_id);
                const empCodeStr = empCode ? `${empCode} ` : '';
                
                return {
                    ...record,
                    expense_id: `settlement_${record.settlement_id}`,
                    detail_description: `${empCodeStr}${employeeName} ${record.record_type}`,
                    created_at: record.created_at || new Date().toISOString()
                };
            });
        } catch (error) {
            console.error('获取本地结算记录失败:', error);
            return [];
        }
    }

    // 通过员工ID获取员工姓名 (参考 AccountingFlowService)
    getEmployeeNameById(employeeId) {
        // 1. 尝试从 window.employees 获取
        if (typeof window.employees !== 'undefined' && Array.isArray(window.employees)) {
            const employee = window.employees.find(emp => emp.ID === employeeId);
            if (employee) return employee.姓名;
        }
        
        // 2. 尝试从本地存储获取
        try {
            const localKey = `employees_${this.currentProjectId}`;
            const savedData = localStorage.getItem(localKey);
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                if (parsedData.employees && Array.isArray(parsedData.employees)) {
                    const employee = parsedData.employees.find(emp => emp.employee_id === employeeId);
                    if (employee) return employee.emp_name;
                }
            }
        } catch (error) {
            // 忽略错误
        }
        
        return null;
    }

    // 获取员工工号 (参考 AccountingFlowService)
    getEmployeeEmpCodeById(employeeId) {
        // 1. 尝试从 window.employees 获取
        if (typeof window.employees !== 'undefined' && Array.isArray(window.employees)) {
            const employee = window.employees.find(emp => emp.ID === employeeId);
            if (employee) return parseInt(employee.工号) || 0;
        }
        
        // 2. 尝试从本地存储获取
        try {
            const localKey = `employees_${this.currentProjectId}`;
            const savedData = localStorage.getItem(localKey);
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                if (parsedData.employees && Array.isArray(parsedData.employees)) {
                    const employee = parsedData.employees.find(emp => emp.employee_id === employeeId);
                    if (employee) return parseInt(employee.emp_code) || 0;
                }
            }
        } catch (error) {
            // 忽略错误
        }
        
        return 0;
    }

    // 同步云端支出数据到本地
    async syncExpensesToLocal(expenses) {
        try {
            // 获取当前本地存储的所有支出数据
            const existingExpensesJson = localStorage.getItem('project_expenses') || '[]';
            const existingExpenses = JSON.parse(existingExpensesJson);
            
            // 保留非当前项目的数据
            const otherProjectExpenses = existingExpenses.filter(expense => expense.project_id !== this.currentProjectId);
            
            // 获取当前项目的所有云端数据，无论当前获取的是全部还是部分数据
            let allCurrentProjectCloudExpenses = [];
            const isOnline = navigator.onLine;
            
            if (isOnline && window.projectFinanceAPI) {
                // 在线状态下，尝试获取当前项目的所有支出数据，确保本地存储完整
                try {
                    const { data: allExpensesData, error: allExpensesError } = await window.projectFinanceAPI.supabase
                        .from('project_expenses')
                        .select('*')
                        .eq('project_id', this.currentProjectId)
                        .order('created_at', { ascending: true });
                    
                    if (!allExpensesError && allExpensesData) {
                        allCurrentProjectCloudExpenses = allExpensesData;
                    }
                } catch (syncError) {
                    console.error('获取当前项目所有支出数据失败，使用已有数据:', syncError);
                    // 如果获取所有数据失败，回退到使用传入的数据
                    allCurrentProjectCloudExpenses = expenses;
                }
            } else {
                // 离线状态下，直接使用传入的数据
                allCurrentProjectCloudExpenses = expenses;
            }
            
            // 合并数据：非当前项目数据 + 当前项目云端数据
            const finalExpenses = [...otherProjectExpenses, ...allCurrentProjectCloudExpenses];
            
            // 保存到本地存储
            localStorage.setItem('project_expenses', JSON.stringify(finalExpenses));
        } catch (error) {
            console.error('同步云端支出数据到本地失败:', error);
        }
    }
    
    getLocalIncomes() {
        try {
            const incomesJson = localStorage.getItem('project_income');
            if (!incomesJson) return [];

            const incomes = JSON.parse(incomesJson);
            // 始终返回当前项目ID的所有收入数据，不根据日期过滤
            return incomes.filter(income => income.project_id === this.currentProjectId);
        } catch (error) {
            console.error('获取本地项目收入数据失败:', error);
            return [];
        }
    }
    
    // 同步云端收入数据到本地
    async syncIncomesToLocal(incomes) {
        try {
            // 获取当前本地存储的所有收入数据
            const existingIncomesJson = localStorage.getItem('project_income') || '[]';
            const existingIncomes = JSON.parse(existingIncomesJson);
            
            // 保留非当前项目的数据
            const otherProjectIncomes = existingIncomes.filter(income => income.project_id !== this.currentProjectId);
            
            // 合并数据：非当前项目数据 + 当前项目云端数据
            const finalIncomes = [...otherProjectIncomes, ...incomes];
            
            // 保存到本地存储
            localStorage.setItem('project_income', JSON.stringify(finalIncomes));
        } catch (error) {
            console.error('同步云端收入数据到本地失败:', error);
        }
    }

    renderExpenseTable(expenses) {
        const tableBody = document.querySelector('#detailTableSection tbody');
        const emptyDataMsg = document.getElementById('emptyDataMsg');
        const tableScroll = document.querySelector('.table-scroll');
        const payerFilter = document.getElementById('payerFilter');
        const totalAmountDisplay = document.getElementById('totalAmountDisplay');
        
        if (!tableBody) {
            console.error('找不到表格tbody元素');
            return;
        }

        tableBody.innerHTML = '';

        if (expenses.length === 0) {
            if (tableScroll) tableScroll.style.display = 'none';
            if (emptyDataMsg) emptyDataMsg.style.display = 'block';
            if (totalAmountDisplay) totalAmountDisplay.style.display = 'none';
            return;
        }

        if (tableScroll) tableScroll.style.display = 'block';
        if (emptyDataMsg) emptyDataMsg.style.display = 'none';

        // 获取筛选条件
        const selectedPayer = payerFilter ? payerFilter.value : '';
        const recordTypeFilter = document.getElementById('recordTypeFilter');
        const selectedRecordType = recordTypeFilter ? recordTypeFilter.value : '';
        
        // 过滤数据
        let filteredExpenses = expenses;
        
        // 按付款人过滤
        if (selectedPayer) {
            filteredExpenses = filteredExpenses.filter(expense => expense.payer === selectedPayer);
        }
        
        // 按记录类型过滤
        if (selectedRecordType === 'project_expenses') {
            filteredExpenses = filteredExpenses.filter(expense => {
                return !(expense.expense_id && expense.expense_id.startsWith('settlement_'));
            });
        } else if (selectedRecordType === 'settlement_records') {
            filteredExpenses = filteredExpenses.filter(expense => {
                return expense.expense_id && expense.expense_id.startsWith('settlement_');
            });
        }
        
        // 排序：先按记录类型（项目支出在前，结算借支在后），再按日期升序排列
        filteredExpenses.sort((a, b) => {
            // 判断记录类型
            const isAProjectExpense = !(a.expense_id && a.expense_id.startsWith('settlement_'));
            const isBProjectExpense = !(b.expense_id && b.expense_id.startsWith('settlement_'));
            
            // 项目支出在前，结算借支在后
            if (isAProjectExpense && !isBProjectExpense) return -1;
            if (!isAProjectExpense && isBProjectExpense) return 1;
            
            // 如果记录类型相同，按日期升序排列
            const dateA = new Date(a.record_date || 0).getTime();
            const dateB = new Date(b.record_date || 0).getTime();
            if (dateA !== dateB) {
                return dateA - dateB;
            }
            
            // 如果日期相同，按created_at排序
            const createdAtA = new Date(a.created_at || 0).getTime();
            const createdAtB = new Date(b.created_at || 0).getTime();
            return createdAtA - createdAtB;
        });
        
        // 更新筛选框
        this.updateRecordTypeFilter(expenses);

        filteredExpenses.forEach((expense, index) => {
            const row = document.createElement('tr');
            
            // 检查是否是settlement_records记录
            const isSettlementRecord = expense.expense_id && expense.expense_id.startsWith('settlement_');
            
            // 为settlement_records记录设置蓝色字体和标记
            if (isSettlementRecord) {
                // 使用更具体的样式设置，确保优先级更高
                row.style.color = '#1890ff';
                row.style.fontWeight = '500';
                row.style.setProperty('color', '#1890ff', 'important');
                row.style.setProperty('font-weight', '500', 'important');
                
                // 添加class和data属性，方便PDF生成器识别
                row.classList.add('settlement-record');
                row.dataset.recordType = 'settlement';
            }
            
            // 只为project_expenses记录添加双击事件
            if (!isSettlementRecord) {
                row.addEventListener('dblclick', () => {
                    this.openEditForm('expense', expense);
                });
            }
            
            const imageHtml = this.renderImageCell(expense.image_ids);
            
            // 构建行内容，只为project_expenses记录添加删除图标
            let rowContent = '';
            
            // 为settlement_records记录的每个单元格添加内联样式
            if (isSettlementRecord) {
                rowContent = `
                    <td style="color: #1890ff !important; font-weight: 500 !important;">${index + 1}</td>
                    <td style="color: #1890ff !important; font-weight: 500 !important;">${expense.record_date || ''}</td>
                    <td style="color: #1890ff !important; font-weight: 500 !important;">${expense.payer || ''}</td>
                    <td style="color: #1890ff !important; font-weight: 500 !important;">¥${expense.amount || 0}</td>
                    <td style="color: #1890ff !important; font-weight: 500 !important;">${expense.detail_description || ''}</td>
                    <td style="color: #1890ff !important; font-weight: 500 !important;">${expense.remark || ''}</td>
                    <td style="color: #1890ff !important; font-weight: 500 !important;">${imageHtml}</td>
                `;
            } else {
                // 普通project_expenses记录，使用默认样式
                rowContent = `
                    <td>${index + 1}</td>
                    <td>${expense.record_date || ''}</td>
                    <td>${expense.payer || ''}</td>
                    <td class="expense-amount">¥${expense.amount || 0}</td>
                    <td>${expense.detail_description || ''}</td>
                    <td>${expense.remark || ''}</td>
                    <td>${imageHtml}</td>
                `;
                // 添加删除图标
                rowContent += '<span class="delete-icon">🗑️</span>';
            }
            
            row.innerHTML = rowContent;
            
            tableBody.appendChild(row);
        });

        this.updateTotalAmount(filteredExpenses, 'expense');
        this.bindImageIconEvents();
    }

    renderIncomeTable(incomes) {
        const tableBody = document.querySelector('#detailTableSection tbody');
        const emptyDataMsg = document.getElementById('emptyDataMsg');
        const tableScroll = document.querySelector('.table-scroll');
        const totalAmountDisplay = document.getElementById('totalAmountDisplay');
        
        if (!tableBody) {
            console.error('找不到表格tbody元素');
            return;
        }

        tableBody.innerHTML = '';

        if (incomes.length === 0) {
            console.log('没有收入数据，显示空数据提示');
            if (tableScroll) tableScroll.style.display = 'none';
            if (emptyDataMsg) emptyDataMsg.style.display = 'block';
            if (totalAmountDisplay) totalAmountDisplay.style.display = 'none';
            return;
        }

        if (tableScroll) tableScroll.style.display = 'block';
        if (emptyDataMsg) emptyDataMsg.style.display = 'none';

        incomes.forEach((income, index) => {
            const row = document.createElement('tr');
            
            // 添加双击事件
            row.addEventListener('dblclick', () => {
                this.openEditForm('income', income);
            });
            
            const imageHtml = this.renderImageCell(income.image_ids);
            
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${income.record_date || ''}</td>
                <td class="income-amount">¥${income.amount || 0}</td>
                <td>${income.detail_description || ''}</td>
                <td>${income.remark || ''}</td>
                <td>${imageHtml}</td>
                <span class="delete-icon">🗑️</span>
            `;
            
            tableBody.appendChild(row);
        });

        this.updateTotalAmount(incomes, 'income');
        this.bindImageIconEvents();
    }

    renderImageCell(imageIds) {
        if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
            return '';
        }

        const imageIcons = imageIds.map((imgUrl, index) => {
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
            return `<span class="image-icon" data-url="${displayUrl}" data-index="${index}" 
                title="点击预览图片${index + 1}">🖼️</span>`;
            }
            return '';
        }).filter(icon => icon !== '');

        return imageIcons.join(' ');
    }

    bindImageIconEvents() {
        const imageIcons = document.querySelectorAll('.image-icon');
        imageIcons.forEach(icon => {
            icon.removeEventListener('click', this._handleImageIconClick);
            icon.addEventListener('click', this._handleImageIconClick.bind(this));
        });
        
        // 绑定删除图标事件
        this.bindDeleteIconEvents();
    }
    
    // 绑定删除图标事件
    bindDeleteIconEvents() {
        const deleteIcons = document.querySelectorAll('.delete-icon');
        deleteIcons.forEach(icon => {
            icon.removeEventListener('click', this._handleDeleteIconClick);
            icon.addEventListener('click', this._handleDeleteIconClick.bind(this));
        });
    }

    _handleImageIconClick(e) {
        const url = e.target.dataset.url;
        this.showImagePreview(url);
    }

    _handleDeleteIconClick(e) {
        e.stopPropagation();

        const row = e.target.closest('tr');
        if (!row) return;

        const rowIndex = Array.from(row.parentNode.children).indexOf(row);

        let record;
        if (this.currentType === 'expense') {
            record = this.cachedExpenses[rowIndex];
        } else if (this.currentType === 'income') {
            record = this.cachedIncomes[rowIndex];
        }

        if (!record) return;

        const permissionName = this.currentType === 'expense' ? 'perm_delete_expense' : 'perm_delete_income';
        if (!this.checkPermission(permissionName)) {
            const message = this.currentType === 'expense' ? '你无删除项目支出权限！' : '你无删除项目收入权限！';
            this.showNotification(message, true);
            return;
        }

        this.showDeleteModal(record);
    }

    checkPermission(permissionName) {
        try {
            const currentUserStr = localStorage.getItem('currentUser');
            if (!currentUserStr) return false;

            const currentUser = JSON.parse(currentUserStr);
            const userId = currentUser.user_id;
            if (!userId) return false;

            const projectId = localStorage.getItem('currentProjectId');
            if (!projectId) return false;

            const projectsCache = localStorage.getItem(`project_cache_${userId}`);
            if (projectsCache) {
                const projects = JSON.parse(projectsCache);
                const project = projects.find(p => p.project_id === projectId);
                if (project && project.user_id === userId) {
                    return true;
                }
            }

            const userProjectsStr = localStorage.getItem(`user_projects_${userId}`);
            if (!userProjectsStr) return false;

            const userProjects = JSON.parse(userProjectsStr);
            const permissionRecord = userProjects.find(up => up.project_id === projectId);

            if (!permissionRecord) return false;

            return permissionRecord[permissionName] === true;
        } catch (e) {
            console.error('检查权限失败:', e);
            return false;
        }
    }

    showNotification(message, isError = false) {
        const existingNotifications = document.querySelectorAll('div[style*="position: fixed"][style*="top: 50%"][style*="left: 50%"]');
        existingNotifications.forEach(notification => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });

        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 9999;
            max-width: 300px;
            word-wrap: break-word;
            animation: fadeIn 0.3s ease-out;
        `;

        notification.style.backgroundColor = isError ? '#ff4d4f' : '#52c41a';
        notification.textContent = message;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from {
                    opacity: 0;
                    transform: translate(-50%, -50%) scale(0.9);
                }
                to {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(1);
                }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'fadeIn 0.3s ease-in reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
    
    // 显示删除确认模态框
    showDeleteModal(record) {
        // 检查模态框是否已存在
        let modal = document.getElementById('deleteConfirmModal');
        if (!modal) {
            // 创建模态框
            modal = document.createElement('div');
            modal.id = 'deleteConfirmModal';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            `;
            
            // 模态框内容
            modal.innerHTML = `
                <div style="
                    background-color: white;
                    border-radius: 8px;
                    padding: 20px;
                    width: 90%;
                    max-width: 400px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                ">
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                    ">
                        <h3 style="margin: 0; color: #333;">确认删除</h3>
                        <button id="closeDeleteModalBtn" style="
                            background: none;
                            border: none;
                            font-size: 20px;
                            cursor: pointer;
                            color: #999;
                        ">×</button>
                    </div>
                    <p style="color: #666; margin-bottom: 20px;">
                        确定要删除这条记录吗？此操作不可恢复。
                    </p>
                    <div style="margin-bottom: 20px;">
                        <label style="
                            display: block;
                            margin-bottom: 8px;
                            color: #333;
                            font-weight: bold;
                        ">请输入密码确认删除：</label>
                        <input type="password" id="deletePasswordInput" style="
                            width: 100%;
                            padding: 10px;
                            border: 1px solid #d9d9d9;
                            border-radius: 4px;
                            font-size: 14px;
                            box-sizing: border-box;
                        ">
                        <div id="passwordErrorMsg" style="
                            color: #ff4d4f;
                            font-size: 12px;
                            margin-top: 5px;
                            display: none;
                        ">密码错误，请重试</div>
                    </div>
                    <div style="
                        display: flex;
                        justify-content: flex-end;
                        gap: 10px;
                    ">
                        <button id="cancelDeleteBtn" style="
                            padding: 8px 16px;
                            border: 1px solid #d9d9d9;
                            border-radius: 4px;
                            background-color: white;
                            color: #333;
                            cursor: pointer;
                            font-size: 14px;
                        ">取消</button>
                        <button id="confirmDeleteBtn" style="
                            padding: 8px 16px;
                            border: 1px solid #ff4d4f;
                            border-radius: 4px;
                            background-color: #ff4d4f;
                            color: white;
                            cursor: pointer;
                            font-size: 14px;
                        ">确认删除</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // 绑定事件
            this.bindDeleteModalEvents();
        }
        
        // 显示模态框
        modal.style.display = 'flex';
        
        // 保存当前要删除的记录
        modal.recordToDelete = record;
    }
    
    // 绑定删除模态框事件
    bindDeleteModalEvents() {
        const modal = document.getElementById('deleteConfirmModal');
        const closeBtn = document.getElementById('closeDeleteModalBtn');
        const cancelBtn = document.getElementById('cancelDeleteBtn');
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        const passwordInput = document.getElementById('deletePasswordInput');
        const errorMsg = document.getElementById('passwordErrorMsg');
        
        // 关闭模态框
        const closeModal = () => {
            if (modal) {
                modal.style.display = 'none';
                // 清空密码输入
                if (passwordInput) {
                    passwordInput.value = '';
                }
                // 隐藏错误信息
                if (errorMsg) {
                    errorMsg.style.display = 'none';
                }
            }
        };
        
        // 关闭按钮事件
        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }
        
        // 取消按钮事件
        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeModal);
        }
        
        // 点击模态框外部关闭
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal();
                }
            });
        }
        
        // 确认删除事件
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                // 检查网络状态
                const isOnline = navigator.onLine;
                if (!isOnline) {
                    // 先关闭密码输入框
                    closeModal();
                    // 然后弹出提示
                    this.showNotification('请联网后再删除', true);
                    return;
                }
                
                // 获取输入的密码
                const password = passwordInput?.value || '';
                
                // 验证密码
                if (await this.verifyPassword(password)) {
                    // 密码正确，执行删除
                    if (modal && modal.recordToDelete) {
                        await this.deleteRecord(modal.recordToDelete);
                        closeModal();
                    }
                } else {
                    // 密码错误，显示错误信息
                    if (errorMsg) {
                        errorMsg.style.display = 'block';
                    }
                    // 清空密码输入
                    if (passwordInput) {
                        passwordInput.value = '';
                        passwordInput.focus();
                    }
                }
            });
        }
        
        // 回车键触发确认删除
        if (passwordInput) {
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    confirmBtn?.click();
                }
            });
        }
    }
    
    // 验证密码 - 使用与首页修改密码相同的逻辑
    async verifyPassword(password) {
        try {
            console.log('[密码验证] 开始密码验证流程');
            
            // 获取当前登录用户信息
            const currentUserStr = localStorage.getItem('currentUser');
            if (!currentUserStr) {
                console.error('[密码验证] 未找到当前登录用户信息');
                return false;
            }
            
            const userData = JSON.parse(currentUserStr);
            
            // 从用户数据中获取邮箱
            const userEmail = userData.email;
            
            if (!userEmail) {
                console.error('[密码验证] 用户信息中缺少email');
                return false;
            }
            
            // 检查Supabase客户端是否可用
            if (!this.supabase) {
                console.error('[密码验证] Supabase客户端未初始化');
                return false;
            }
            
            // 使用当前密码尝试登录以验证（与首页修改密码相同的逻辑）
            console.log('[密码验证] 使用Supabase Auth验证密码');
            const { data: authData, error: authError } = await this.supabase.auth.signInWithPassword({
                email: userEmail,
                password: password
            });
            
            if (authError) {
                console.log('[密码验证] 密码验证失败:', authError);
                return false;
            }
            
            console.log('[密码验证] 密码验证成功');
            return true;
        } catch (error) {
            console.error('[密码验证] 密码验证失败:', error);
            return false;
        }
    }
    
    // 离线验证密码
    verifyOfflinePassword(phone, password) {
        try {
            // 从本地存储获取登录信息
            // 检查是否有登录成功保存的信息
            const loginInfoStr = localStorage.getItem('loginInfo');
            if (loginInfoStr) {
                const loginInfo = JSON.parse(loginInfoStr);
                // 验证phone和password是否匹配
                if (loginInfo.phone === phone && loginInfo.password === password) {
                    return true;
                }
            }
            
            // 尝试从其他可能的存储位置获取
            const currentUserStr = localStorage.getItem('currentUser');
            if (currentUserStr) {
                const currentUser = JSON.parse(currentUserStr);
                // 有些情况下，currentUser中可能直接包含password
                if (currentUser.password && currentUser.password === password) {
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            console.error('离线密码验证失败:', error);
            return false;
        }
    }
    
    // 删除记录
    async deleteRecord(record) {
        try {
            // 获取记录ID
            const recordId = this.currentType === 'expense' ? record.expense_id : record.income_id;
            if (!recordId) {
                showNotification('记录ID不存在，删除失败', true);
                return;
            }
            
            // 先执行后台删除任务，确保云端数据被删除
            await this.deleteRecordBackgroundTasks(record);
            
            // 然后删除本地数据，确保本地数据与云端一致
            this.deleteRecordFromLocal(recordId);
            
            // 重新加载数据，更新UI
            this.loadDetailData();
            
            // 显示成功提示
            showNotification('记录删除成功');
        } catch (error) {
            console.error('删除记录失败:', error);
            // 重新加载数据，确保UI显示正确
            this.loadDetailData();
            showNotification('删除记录失败，请重试', true);
        }
    }
    
    // 后台执行的删除相关任务
    async deleteRecordBackgroundTasks(record) {
        try {
            // 获取记录ID
            let recordId = this.currentType === 'expense' ? record.expense_id : record.income_id;
            
            // 异步删除图片（本地和云端，检测引用）
            if (record.image_ids && Array.isArray(record.image_ids) && record.image_ids.length > 0) {
                await this.deleteRecordImages(record.image_ids);
            }
            
            // 异步删除云端数据
            const isOnline = navigator.onLine;
            if (isOnline && window.projectFinanceAPI) {
                if (this.currentType === 'expense') {
                    // 检查是否是settlement_records记录
                    if (recordId.startsWith('settlement_')) {
                        // 从settlement_records表删除
                        const settlementId = recordId.replace('settlement_', '');
                        // 直接使用supabase API删除，因为projectFinanceAPI可能没有提供相应方法
                        await this.supabase
                            .from('settlement_records')
                            .delete()
                            .eq('settlement_id', settlementId);
                    } else {
                        // 从project_expenses表删除
                        await window.projectFinanceAPI.deleteProjectExpense(recordId);
                    }
                } else if (this.currentType === 'income') {
                    await window.projectFinanceAPI.deleteProjectIncome(recordId);
                }
            } else {
                // 离线模式：添加删除任务到同步队列
                if (window.offlineSyncService) {
                    if (this.currentType === 'expense' && recordId.startsWith('settlement_')) {
                        // settlement_records记录
                        const settlementId = recordId.replace('settlement_', '');
                        window.offlineSyncService.addToSyncQueue('delete', {
                            table: 'settlement_records',
                            settlement_id: settlementId
                        }, settlementId, 'settlement_record');
                    } else {
                        // 普通expense或income记录
                        window.offlineSyncService.addToSyncQueue('delete', {
                            table: this.currentType === 'expense' ? 'project_expenses' : 'project_income',
                            [this.currentType === 'expense' ? 'expense_id' : 'income_id']: recordId
                        }, recordId, this.currentType === 'expense' ? 'project_expense' : 'project_income');
                    }
                    console.log('离线删除任务已添加到同步队列');
                }
            }
            
            console.log('删除任务完成');
            
            // 任务完成后不再需要延迟刷新，因为现在是同步执行，会在deleteRecord方法中统一刷新
        } catch (error) {
            console.error('后台删除任务失败:', error);
            // 后台任务失败不影响用户体验，只记录日志
        }
    }
    
    // 删除记录图片
    async deleteRecordImages(imageUrls) {
        try {
            for (const imageUrl of imageUrls) {
                // 检测图片是否还有其他引用
                const hasOtherReferences = await this.checkImageReferences(imageUrl);
                
                if (!hasOtherReferences) {
                    // 没有其他引用，删除图片
                    if (imageUrl.startsWith('local://')) {
                        // 删除本地图片
                        await this.deleteLocalImage(imageUrl);
                    } else {
                        // 检查网络状态
                        const isOnline = navigator.onLine;
                        
                        if (isOnline) {
                            // 在线模式：直接删除云端图片
                            await this.deleteCloudImage(imageUrl);
                        } else {
                            // 离线模式：将图片删除任务添加到同步队列
                            if (window.offlineSyncService) {
                                // 从URL中提取存储桶和文件路径信息
                                // URL格式：https://oydffrzzulsrbitrrhht.supabase.co/storage/v1/object/public/FYKQ/PRO_eoesb81mqn_t76d7%2Fincome%2F2025-12-27%2FQQjietu20251022201517.png
                                
                                // 查找"public/"的位置
                                const publicIndex = imageUrl.indexOf('public/');
                                if (publicIndex !== -1) {
                                    // 提取完整的文件路径部分
                                    const fullPath = imageUrl.substring(publicIndex + 'public/'.length);
                                    
                                    // 使用decodeURIComponent完全解码文件路径
                                    const decodedPath = decodeURIComponent(fullPath);
                                    
                                    // 提取存储桶名称和文件路径
                                    const pathParts = decodedPath.split('/');
                                    const bucketName = pathParts[0];
                                    const filePath = pathParts.slice(1).join('/');
                                    
                                    // 添加图片删除任务到同步队列
                                    window.offlineSyncService.addToSyncQueue('删除_图片', {
                                        bucket_name: bucketName,
                                        file_path: filePath,
                                        image_url: imageUrl
                                    }, `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, 'image');
                                    

                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('删除记录图片失败:', error);
            // 继续执行，不中断删除流程
        }
    }
    
    // 检测图片是否还有其他引用
    async checkImageReferences(imageUrl) {
        try {
            const isOnline = navigator.onLine;
            
            // 在线模式：从Supabase检查引用
            if (isOnline && window.projectFinanceAPI && window.projectFinanceAPI.supabase) {
                const { data: expenseReferences, error: expenseError } = await window.projectFinanceAPI.supabase
                    .from('project_expenses')
                    .select('expense_id') // 使用正确的字段名
                    .contains('image_ids', [imageUrl]);
                
                const { data: incomeReferences, error: incomeError } = await window.projectFinanceAPI.supabase
                    .from('project_income')
                    .select('income_id') // 使用正确的字段名
                    .contains('image_ids', [imageUrl]);
                
                if (expenseError || incomeError) {
                    console.error('检查图片引用失败:', expenseError || incomeError);
                    // 出错时默认返回false，允许删除图片
                    return false;
                }
                
                // 检查是否有其他引用
                const totalReferences = (expenseReferences && expenseReferences.length) + (incomeReferences && incomeReferences.length);
                return totalReferences > 1;
            } else {
                // 离线模式：从本地存储检查引用
                return this.checkLocalImageReferences(imageUrl);
            }
        } catch (error) {
            console.error('检查图片引用失败:', error);
            // 出错时默认返回false，允许删除图片
            return false;
        }
    }
    
    // 检查本地图片引用
    checkLocalImageReferences(imageUrl) {
        try {
            let totalReferences = 0;
            
            // 检查本地项目支出数据
            const expenseStorageKey = 'project_expenses';
            const expensesJson = localStorage.getItem(expenseStorageKey);
            if (expensesJson) {
                const expenses = JSON.parse(expensesJson);
                totalReferences += expenses.filter(expense => 
                    expense.image_ids && Array.isArray(expense.image_ids) && expense.image_ids.includes(imageUrl)
                ).length;
            }
            
            // 检查本地项目收入数据
            const incomeStorageKey = 'project_income';
            const incomesJson = localStorage.getItem(incomeStorageKey);
            if (incomesJson) {
                const incomes = JSON.parse(incomesJson);
                totalReferences += incomes.filter(income => 
                    income.image_ids && Array.isArray(income.image_ids) && income.image_ids.includes(imageUrl)
                ).length;
            }
            
            // 如果totalReferences > 1，说明图片还有其他引用，不应该删除
            // 只有当totalReferences <= 1时，说明图片没有其他引用，可以删除
            return totalReferences > 1;
        } catch (error) {
            console.error('检查本地图片引用失败:', error);
            return true; // 出错时默认返回true，不删除图片
        }
    }
    
    // 删除本地图片
    async deleteLocalImage(imageUrl) {
        try {
            if (imageUrl.startsWith('local://')) {
                const imageId = imageUrl.replace('local://', '');
                localStorage.removeItem(imageId);
            }
        } catch (error) {
            console.error('删除本地图片失败:', error);
        }
    }
    
    // 删除云端图片
    async deleteCloudImage(imageUrl) {
        try {
            // 实现云端图片删除逻辑，根据URL提取文件名等信息
            if (window.projectFinanceAPI && window.projectFinanceAPI.supabase) {
                // 直接从URL中提取文件路径部分，不依赖URL解码
                // URL格式：https://oydffrzzulsrbitrrhht.supabase.co/storage/v1/object/public/FYKQ/PRO_eoesb81mqn_t76d7%2Fexpenditure%2F2025-12-27%2FQQjietu20251022201517.png
                // 我们需要提取的是：PRO_eoesb81mqn_t76d7/expenditure/2025-12-27/QQjietu20251022201517.png
                
                // 查找"public/FYKQ/"的位置
                const publicFykqIndex = imageUrl.indexOf('public/FYKQ/');
                if (publicFykqIndex === -1) {
                    console.error('无法从URL中找到public/FYKQ/关键字:', imageUrl);
                    return;
                }
                
                // 提取完整的文件路径部分，包括URL编码的斜杠
                const fullFilePath = imageUrl.substring(publicFykqIndex + 'public/FYKQ/'.length);
                
                // 使用decodeURIComponent完全解码所有URL编码字符，包括斜杠
                const decodedFilePath = decodeURIComponent(fullFilePath);
                
                // 存储桶名称始终是FYKQ
                const bucketName = 'FYKQ';
                
                if (bucketName && decodedFilePath) {
                    // 使用Supabase Storage API删除图片
                    const { error } = await window.projectFinanceAPI.supabase
                        .storage
                        .from(bucketName)
                        .remove([decodedFilePath]);
                    
                    if (error) {
                        console.error('从Supabase Storage删除图片失败:', error);
                    }
                } else {
                    console.error('无法提取有效的文件路径:', imageUrl);
                }
            }
        } catch (error) {
            console.error('删除云端图片失败:', error);
        }
    }
    
    // 删除本地数据
    deleteRecordFromLocal(recordId) {
        try {
            let storageKey;
            let idField;
            
            if (this.currentType === 'expense') {
                if (recordId.startsWith('settlement_')) {
                    // settlement_records记录
                    storageKey = 'settlement_records';
                    idField = 'settlement_id';
                    // 转换recordId为settlement_id
                    recordId = recordId.replace('settlement_', '');
                } else {
                    // project_expenses记录
                    storageKey = 'project_expenses';
                    idField = 'expense_id';
                }
            } else if (this.currentType === 'income') {
                storageKey = 'project_income';
                idField = 'income_id';
            }
            
            // 获取本地存储的所有数据
            const existingDataJson = localStorage.getItem(storageKey) || '[]';
            const existingData = JSON.parse(existingDataJson);
            
            // 过滤出非当前项目的数据和当前项目中未被删除的数据
            const updatedData = existingData.filter(item => {
                // 如果是当前项目的数据，检查ID是否匹配
                if (item.project_id === this.currentProjectId) {
                    return item[idField] !== recordId;
                }
                // 如果是其他项目的数据，保留
                return true;
            });
            
            // 更新缓存数据
            if (this.currentType === 'expense') {
                // 从缓存中删除相应的记录
                if (recordId.startsWith('settlement_')) {
                    // settlement_records记录
                    this.cachedExpenses = this.cachedExpenses.filter(item => 
                        !(item.expense_id && item.expense_id.startsWith('settlement_'))
                    );
                } else {
                    // project_expenses记录
                    this.cachedExpenses = this.cachedExpenses.filter(item => 
                        !(item.project_id === this.currentProjectId && item.expense_id === recordId)
                    );
                }
            } else if (this.currentType === 'income') {
                this.cachedIncomes = this.cachedIncomes.filter(item => 
                    item.project_id === this.currentProjectId && item.income_id !== recordId
                );
            }
            
            // 保存到本地存储
            localStorage.setItem(storageKey, JSON.stringify(updatedData));
        } catch (error) {
            console.error('删除本地数据失败:', error);
        }
    }
    
    async showImagePreview(imageUrl) {
        let modal = document.getElementById('imagePreviewModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'imagePreviewModal';
            modal.style.display = 'none';
            document.body.appendChild(modal);
        }

        let displayUrl = imageUrl;
        
        try {
            if (imageUrl.includes('supabase.co/storage/v1/object/public/')) {
                const urlParts = imageUrl.split('supabase.co/storage/v1/object/public/');
                if (urlParts.length > 1) {
                    const pathParts = urlParts[1].split('/');
                    const bucketName = pathParts[0];
                    const fileName = pathParts.slice(1).join('/');
                    
                    if (this.supabase) {
                        const { data, error } = await this.supabase
                            .storage
                            .from(bucketName)
                            .download(fileName);
                        
                        if (!error && data) {
                            displayUrl = URL.createObjectURL(data);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('下载图片失败，直接使用原始URL:', error);
        }

        modal.innerHTML = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 2001;" 
                 onclick="if(event.target === this) document.getElementById('imagePreviewModal').style.display='none'">
                <img id="previewDraggableImage" src="${displayUrl}" 
                     style="max-width: 90%; max-height: 90%; position: absolute; cursor: move; top: 50%; left: 50%; transform: translate(-50%, -50%);"
                     ondragstart="return false;">
                <button onclick="document.getElementById('imagePreviewModal').style.display='none'" 
                        style="position: fixed; top: 20px; right: 20px; background: #f5222d; color: white; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 20px; cursor: pointer; z-index: 2002;">×</button>
            </div>
        `;
        modal.style.display = 'block';

        const img = document.getElementById('previewDraggableImage');
        let isDragging = false;
        let offsetX, offsetY;
        let scale = 1;
        let isMoved = false;

        img.addEventListener('mousedown', function(e) {
            isDragging = true;
            isMoved = true;
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
            
            if (!isMoved) {
                img.style.left = '50%';
                img.style.top = '50%';
            }
            img.style.transform = `translate(-50%, -50%) scale(${scale})`;
        });
    }

    updatePayerFilter(expenses) {
        const payerFilter = document.getElementById('payerFilter');
        if (!payerFilter) return;

        const payers = [...new Set(expenses.map(expense => expense.payer).filter(payer => payer))];
        payers.sort();

        const currentValue = payerFilter.value;
        payerFilter.innerHTML = '<option value="">全部</option>';
        
        payers.forEach(payer => {
            const option = document.createElement('option');
            option.value = payer;
            option.textContent = payer;
            payerFilter.appendChild(option);
        });

        if (payers.includes(currentValue)) {
            payerFilter.value = currentValue;
        }
    }

    bindFilterEvents() {
        const payerFilter = document.getElementById('payerFilter');
        const payerFilterArrow = document.getElementById('payerFilterArrow');
        
        if (!payerFilter) return;

        payerFilter.addEventListener('change', () => {
            if (this.currentType === 'expense') {
                this.renderExpenseTable(this.cachedExpenses);
            }
        });

        if (payerFilterArrow) {
            payerFilterArrow.addEventListener('click', () => {
                payerFilter.style.opacity = '1';
                payerFilter.style.pointerEvents = 'auto';
                payerFilter.focus();
                if (typeof payerFilter.showPicker === 'function') {
                    payerFilter.showPicker();
                } else {
                    payerFilter.click();
                }
            });
        }

        payerFilter.addEventListener('blur', () => {
            payerFilter.style.opacity = '0';
            payerFilter.style.pointerEvents = 'none';
        });
    }
    
    // 更新记录类型筛选框
    updateRecordTypeFilter(expenses) {
        const expenseTableHeader = document.getElementById('expenseTableHeader');
        if (!expenseTableHeader) return;
        
        // 检查是否已存在筛选框
        let recordTypeFilter = document.getElementById('recordTypeFilter');
        if (!recordTypeFilter) {
            // 获取序号表头
            const serialNumberTh = expenseTableHeader.querySelector('th:first-child');
            if (!serialNumberTh) return;
            
            // 修改序号表头，添加筛选框
            serialNumberTh.innerHTML = `
                <span id="recordTypeFilterArrow" style="cursor: pointer; margin-right: 4px; position: relative;">▼</span>序号
                <select id="recordTypeFilter" style="padding: 2px 5px; font-size: 12px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.5); background: rgba(255,255,255,0.9); color: #333; opacity: 0; position: absolute; left: 0; top: 100%; margin-top: 4px; pointer-events: none; transition: all 0.3s ease; z-index: 1001;">
                    <option value="">全部</option>
                    <option value="project_expenses">项目支出</option>
                    <option value="settlement_records">结算借支</option>
                </select>
            `;
            
            // 获取新创建的筛选框
            recordTypeFilter = document.getElementById('recordTypeFilter');
            const recordTypeFilterArrow = document.getElementById('recordTypeFilterArrow');
            
            // 绑定筛选框事件
            if (recordTypeFilter) {
                recordTypeFilter.addEventListener('change', () => {
                    this.renderExpenseTable(this.cachedExpenses);
                });
            }
            
            // 绑定筛选框箭头点击事件
            if (recordTypeFilterArrow) {
                recordTypeFilterArrow.addEventListener('click', () => {
                    if (recordTypeFilter) {
                        recordTypeFilter.style.opacity = '1';
                        recordTypeFilter.style.pointerEvents = 'auto';
                        recordTypeFilter.focus();
                        if (typeof recordTypeFilter.showPicker === 'function') {
                            recordTypeFilter.showPicker();
                        } else {
                            recordTypeFilter.click();
                        }
                    }
                });
            }
            
            // 绑定筛选框失焦事件
            if (recordTypeFilter) {
                recordTypeFilter.addEventListener('blur', () => {
                    recordTypeFilter.style.opacity = '0';
                    recordTypeFilter.style.pointerEvents = 'none';
                });
            }
        }
    }

    updateTotalAmount(data, type) {
        const totalAmountDisplay = document.getElementById('totalAmountDisplay');
        const totalAmountValue = document.getElementById('totalAmountValue');
        
        if (!totalAmountDisplay || !totalAmountValue) return;

        const total = data.reduce((sum, item) => {
            const amount = parseFloat(item.amount) || 0;
            return sum + amount;
        }, 0);

        const isInteger = Number.isInteger(total);
        totalAmountValue.textContent = isInteger ? `¥${total}` : `¥${total.toFixed(2)}`;
        
        if (type === 'expense') {
            totalAmountValue.style.color = '#ff4d4f';
        } else if (type === 'income') {
            totalAmountValue.style.color = '#52c41a';
        }
        
        totalAmountDisplay.style.display = 'flex';
    }
    
    // 打开编辑表单并填充数据
    openEditForm(type, data) {
        // 保存当前编辑的记录ID，确保data.id存在
        this.editingRecordId = data.id || data.expense_id || data.income_id;
        
        // 保存旧的图片列表，用于后续比较
        this.oldImageList = data.image_ids && Array.isArray(data.image_ids) ? [...data.image_ids] : [];
        
        // 取消明细标签的选中状态
        const projectDetail = document.getElementById('projectDetail');
        const detailLabel = document.querySelector('label[for="projectDetail"]');
        if (projectDetail && detailLabel) {
            projectDetail.checked = false;
            detailLabel.classList.remove('active');
            localStorage.removeItem('projectDetailSelected');
        }
        
        // 根据类型选择对应的标签
        if (type === 'expense') {
            // 选择项目支出标签
            const expenseRadio = document.getElementById('projectExpense');
            const expenseLabel = document.querySelector('label[for="projectExpense"]');
            if (expenseRadio && expenseLabel) {
                expenseRadio.checked = true;
                
                // 移除所有选项的active类
                document.querySelectorAll('.work-type-option').forEach(opt => {
                    opt.classList.remove('active');
                });
                
                // 为项目支出标签添加active类
                expenseLabel.classList.add('active');
            }
            
            // 修改首页标题为"修改支出"
            this.updatePageTitle('修改支出');
        } else if (type === 'income') {
            // 选择项目收入标签
            const incomeRadio = document.getElementById('projectIncome');
            const incomeLabel = document.querySelector('label[for="projectIncome"]');
            if (incomeRadio && incomeLabel) {
                incomeRadio.checked = true;
                
                // 移除所有选项的active类
                document.querySelectorAll('.work-type-option').forEach(opt => {
                    opt.classList.remove('active');
                });
                
                // 为项目收入标签添加active类
                incomeLabel.classList.add('active');
            }
            
            // 修改首页标题为"修改收入"
            this.updatePageTitle('修改收入');
        }
        
        // 更新页面显示状态
        window.updateInputSectionsDisplay();
        
        // 修改保存按钮为修改按钮
        this.changeSaveButtonToEdit();
        
        // 填充表单数据
        setTimeout(() => {
            this.fillFormData(type, data);
        }, 100);
    }
    
    // 更新页面标题
    updatePageTitle(title) {
        if (window.parent && window.parent !== window) {
            // 使用当前页面的origin作为targetOrigin，提高安全性
            const targetOrigin = window.location.origin || '*';
            window.parent.postMessage({
                type: 'updateTitle',
                page: title
            }, targetOrigin);
        }
    }
    
    // 将保存按钮改为修改按钮
    changeSaveButtonToEdit() {
        const confirmBtn = document.getElementById('confirmAccountBtn');
        if (confirmBtn) {
            confirmBtn.textContent = '修改';
            // 添加编辑模式标识
            confirmBtn.dataset.editMode = 'true';
        }
    }
    
    // 将修改按钮恢复为保存按钮
    changeEditButtonToSave() {
        const confirmBtn = document.getElementById('confirmAccountBtn');
        if (confirmBtn) {
            confirmBtn.textContent = '保存';
            // 移除编辑模式标识
            delete confirmBtn.dataset.editMode;
        }
        
        // 清除编辑的记录ID
        this.editingRecordId = null;
        
        // 恢复页面标题为"项目记账"
        this.updatePageTitle('项目记账');
    }
    
    // 填充表单数据
    fillFormData(type, data) {
        // 填充日期
        const workDateInput = document.getElementById('workDate');
        if (workDateInput && data.record_date) {
            workDateInput.value = data.record_date;
            delete workDateInput.dataset.displayValue;
            delete workDateInput.dataset.selectAll;
            window.updateDateDisplay();
        }
        
        // 根据类型填充不同的字段
        if (type === 'expense') {
            // 填充付款人
            const paymentInput = document.getElementById('paymentInput');
            if (paymentInput && data.payer) {
                paymentInput.value = data.payer;
            }
        }
        
        // 填充金额
        const amountInput = document.getElementById('amountInput');
        if (amountInput && data.amount) {
            amountInput.value = data.amount;
        }
        
        // 填充说明
        const descriptionInput = document.getElementById('description');
        if (descriptionInput && data.detail_description) {
            descriptionInput.value = data.detail_description;
        }
        
        // 填充备注
        const remarkInput = document.getElementById('remark');
        if (remarkInput && data.remark) {
            remarkInput.value = data.remark;
        }
        
        // 更新输入框背景色
        window.setupInputBackgroundChange();
        
        // 处理图片
        if (data.image_ids && Array.isArray(data.image_ids) && data.image_ids.length > 0) {
            this.loadImagesToForm(data.image_ids);
        }
    }
    
    // 加载图片到表单
    loadImagesToForm(imageIds) {
        // 清空当前选中的图片
        window.clearImage();
        
        // 确保图片上传功能已初始化
        if (typeof window.initializeImageUpload === 'function') {
            window.initializeImageUpload();
        }
        
        // 显示加载状态
        this.showImageLoadingState(imageIds.length);
        
        // 下载并显示图片
        let loadedCount = 0;
        imageIds.forEach((url, index) => {
            if (url.trim()) {
                // 处理不同类型的URL
                if (url.startsWith('data:')) {
                    // 直接处理data URL（base64图片）
                    try {
                        // 从data URL创建Blob对象
                        const [header, data] = url.split(',');
                        const mime = header.match(/:(.*?);/)[1];
                        const bstr = atob(data);
                        let n = bstr.length;
                        const u8arr = new Uint8Array(n);
                        while (n--) {
                            u8arr[n] = bstr.charCodeAt(n);
                        }
                        const blob = new Blob([u8arr], { type: mime });
                        
                        // 生成文件名 - 尝试从原始URL中提取文件名，如果无法提取则使用默认命名
                        let fileName;
                        const urlParts = url.split('/');
                        if (urlParts.length > 1) {
                            const lastPart = urlParts[urlParts.length - 1];
                            if (lastPart.includes('.')) {
                                // 包含文件名和扩展名
                                fileName = lastPart;
                            } else {
                                // 没有扩展名，生成默认文件名
                                fileName = `image_${Date.now()}_${index}.${mime.split('/')[1] || 'jpg'}`;
                            }
                        } else {
                            // 无法从URL提取文件名，使用默认命名
                            fileName = `image_${Date.now()}_${index}.${mime.split('/')[1] || 'jpg'}`;
                        }
                        
                        // 创建File对象
                        const file = new File([blob], fileName, { type: mime });
                        
                        // 添加到全局图片数组
                        if (!window.selectedImages) {
                            window.selectedImages = [];
                        }
                        window.selectedImages.push(file);

                        
                        // 创建图片预览
                        this.createImagePreview(file, window.selectedImages.length - 1);
                        
                        // 更新加载状态
                        loadedCount++;
                        this.updateImageLoadingState(loadedCount, imageIds.length);
                        
                        return; // 直接跳过后续处理，因为已经完成了图片处理
                    } catch (error) {
                        console.error('处理base64图片失败:', error);
                        // 更新加载状态
                        loadedCount++;
                        this.updateImageLoadingState(loadedCount, imageIds.length);
                    }
                }
                
                // 处理普通HTTP/HTTPS URL或本地URL
                this.loadImageWithFallback(url, index, () => {
                    loadedCount++;
                    this.updateImageLoadingState(loadedCount, imageIds.length);
                });
            } else {
                // 空URL，直接跳过
                loadedCount++;
                this.updateImageLoadingState(loadedCount, imageIds.length);
            }
        });
    }
    
    // 显示图片加载状态
    showImageLoadingState(totalImages) {
        const container = document.getElementById('imageUploadContainer');
        if (!container) return;
        
        // 创建加载状态元素
        const loadingElement = document.createElement('div');
        loadingElement.id = 'imageLoadingState';
        loadingElement.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100px;
            height: 100px;
            border: 1px dashed #ddd;
            border-radius: 4px;
            margin-right: 10px;
            flex-direction: column;
            background-color: #f9f9f9;
        `;
        
        loadingElement.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 5px;">⏳</div>
            <div style="font-size: 12px; color: #666;">加载中...</div>
            <div style="font-size: 10px; color: #999;">0/${totalImages}</div>
        `;
        
        // 将加载状态元素插入到添加按钮之前
        const addButton = container.querySelector('.image-upload-item');
        if (addButton) {
            container.insertBefore(loadingElement, addButton);
        } else {
            container.appendChild(loadingElement);
        }
    }
    
    // 更新图片加载状态
    updateImageLoadingState(loadedCount, totalCount) {
        const loadingElement = document.getElementById('imageLoadingState');
        if (!loadingElement) return;
        
        // 更新加载进度
        const progressElement = loadingElement.querySelector('div:last-child');
        if (progressElement) {
            progressElement.textContent = `${loadedCount}/${totalCount}`;
        }
        
        // 如果全部加载完成，移除加载状态
        if (loadedCount >= totalCount) {
            setTimeout(() => {
                if (loadingElement.parentNode) {
                    loadingElement.parentNode.removeChild(loadingElement);
                }
            }, 500);
        }
    }
    
    // 下载图片失败时的备选处理函数
    loadImageWithFallback(url, index, callback) {
        // 首先尝试在线获取图片
        this.tryGetImageFromOnline(url, index)
            .then(onlineFile => {
                // 在线获取成功，不需要处理，因为tryGetImageFromOnline已经添加到selectedImages
                if (callback) callback();
            })
            .catch(error => {
                console.log('在线获取图片失败，尝试从本地获取:', error);
                // 在线获取失败，尝试从本地缓存获取图片
                this.tryGetImageFromLocal(url, index)
                    .then(localFile => {
                        if (localFile) {
                            // 成功从本地获取，添加到全局图片数组并创建预览
                            if (!window.selectedImages) {
                                window.selectedImages = [];
                            }
                            window.selectedImages.push(localFile);

                            this.createImagePreview(localFile, window.selectedImages.length - 1);
                        } else {
                            // 本地也没有，创建错误占位图
                            this.createErrorPlaceholder(url, index);
                        }
                        if (callback) callback();
                    })
                    .catch(localError => {
                        console.error('本地获取图片也失败:', localError);
                        // 本地获取也失败，创建错误占位图
                        this.createErrorPlaceholder(url, index);
                        if (callback) callback();
                    });
            });
    }
    
    // 从在线获取图片
    tryGetImageFromOnline(url, index) {
        return new Promise(async (resolve, reject) => {
            // 处理本地URL
            if (url.startsWith('local://')) {
                reject(new Error('本地URL不使用在线获取'));
                return;
            }
            
            try {
                let imageBlob;
                let originalName;
                
                // 检查是否是 Supabase Storage URL
                if (url.includes('supabase.co/storage/v1/object/public/')) {
                    // 从URL中解析 bucketName 和 fileName
                    const urlParts = url.split('supabase.co/storage/v1/object/public/');
                    if (urlParts.length > 1) {
                        const pathParts = urlParts[1].split('/');
                        const bucketName = pathParts[0];
                        const fileName = pathParts.slice(1).join('/');
                        
                        // 解码文件名
                        originalName = decodeURIComponent(fileName.split('/').pop());
                        
                        try {
                            // 使用 Supabase Storage API 下载图片（带认证）
                            if (this.supabase) {
                                const { data, error } = await this.supabase
                                    .storage
                                    .from(bucketName)
                                    .download(fileName);
                                
                                if (error) {
                                    console.error('使用 Supabase API 下载图片失败:', error);
                                    throw error;
                                }
                                
                                imageBlob = data;
                            } else {
                                throw new Error('Supabase 客户端未初始化');
                            }
                        } catch (supabaseError) {
                            console.error('Supabase Storage 下载失败，尝试使用公开 URL:', supabaseError);
                            // 如果 Supabase API 失败，回退到使用公开 URL
                            throw new Error('Supabase Storage 下载失败');
                        }
                    } else {
                        throw new Error('无法解析 Supabase Storage URL');
                    }
                } else {
                    // 非 Supabase URL，使用传统方式下载
                    originalName = url.split('/').pop().split('?')[0].split('#')[0];
                    
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    imageBlob = await response.blob();
                }
                
                // 创建带有原始文件名的File对象
                const file = new File([imageBlob], originalName, {
                    type: imageBlob.type || 'image/jpeg',
                    lastModified: Date.now()
                });
                
                // 添加到全局图片数组
                if (!window.selectedImages) {
                    window.selectedImages = [];
                }
                window.selectedImages.push(file);
                
                // 创建图片预览
                this.createImagePreview(file, window.selectedImages.length - 1);
                
                resolve(file);
                
            } catch (error) {
                console.error('下载图片失败:', url, error);
                reject(error);
            }
        });
    }
    
    // 从本地缓存获取图片
    tryGetImageFromLocal(url, index) {
        return new Promise((resolve, reject) => {
            if (url.startsWith('local://')) {
                const imageId = url.replace('local://', '');
                const imageDataJson = localStorage.getItem(imageId);
                
                if (imageDataJson) {
                    try {
                        const imageData = JSON.parse(imageDataJson);
                        
                        if (imageData.uploaded && imageData.cloudUrl) {
                            // 有云端URL，尝试从云端获取
                            this.tryGetImageFromOnline(imageData.cloudUrl, index)
                                .then(resolve)
                                .catch(() => {
                                    // 云端获取失败，尝试使用本地dataUrl
                                    if (imageData.dataUrl) {
                                        this.dataUrlToFile(imageData.dataUrl, index)
                                            .then(resolve)
                                            .catch(reject);
                                    } else {
                                        reject(new Error('没有可用的图片数据'));
                                    }
                                });
                        } else if (imageData.dataUrl) {
                            // 使用本地dataUrl
                            this.dataUrlToFile(imageData.dataUrl, index)
                                .then(resolve)
                                .catch(reject);
                        } else {
                            reject(new Error('没有可用的图片数据'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                } else {
                    reject(new Error('本地没有找到图片数据'));
                }
            } else {
                reject(new Error('不是本地URL格式'));
            }
        });
    }
    
    // 将data URL转换为File对象
    dataUrlToFile(dataUrl, index) {
        return new Promise((resolve, reject) => {
            try {
                // 从data URL创建Blob对象
                const [header, data] = dataUrl.split(',');
                const mime = header.match(/:(.*?);/)[1];
                const bstr = atob(data);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while (n--) {
                    u8arr[n] = bstr.charCodeAt(n);
                }
                const blob = new Blob([u8arr], { type: mime });
                
                // 生成文件名
                const fileName = `image_${Date.now()}_${index}.${mime.split('/')[1] || 'jpg'}`;
                
                // 创建File对象
                const file = new File([blob], fileName, { type: mime });
                
                // 标记为系统创建的图片，用于后续区分用户上传的图片
                if (!window.systemCreatedImages) {
                    window.systemCreatedImages = new WeakMap();
                }
                window.systemCreatedImages.set(file, true);
                
                // 添加到全局图片数组
                if (!window.selectedImages) {
                    window.selectedImages = [];
                }
                window.selectedImages.push(file);
                
                // 创建图片预览
                this.createImagePreview(file, window.selectedImages.length - 1);
                
                resolve(file);
            } catch (error) {
                reject(error);
            }
        });
    }
    
    // 创建图片预览（不添加到全局图片数组，避免误认为有新图片）
    createImagePreview(file, index) {
        const container = document.getElementById('imageUploadContainer');
        if (!container) return;
        
        const initialItem = container.querySelector('.image-upload-item');
        
        const previewItem = document.createElement('div');
        previewItem.className = 'image-preview-item';
        previewItem.style.position = 'relative';
        previewItem.style.width = '100px';
        previewItem.style.height = '100px';
        previewItem.style.borderRadius = '4px';
        previewItem.style.overflow = 'hidden';
        previewItem.style.border = '1px solid #ddd';
        
        // 保存文件对象引用和唯一标识符
        previewItem.fileObject = file;
        previewItem.dataset.fileIndex = index;
        
        // 生成唯一标识符
        const uniqueId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        previewItem.dataset.uniqueId = uniqueId;
        
        // 创建临时URL，支持File/Blob对象
        let tempUrl;
        let isUrl = false;
        
        if (file instanceof File || file instanceof Blob) {
            // 如果是File或Blob对象，创建本地URL
            tempUrl = URL.createObjectURL(file);
        } else {
            return;
        }
        
        // 创建预览图片
        const previewImg = document.createElement('img');
        previewImg.style.width = '100%';
        previewImg.style.height = '100%';
        previewImg.style.objectFit = 'cover';
        previewImg.style.cursor = 'pointer';
        previewImg.src = tempUrl;
        
        // 查看大图功能
        previewImg.addEventListener('click', function() {
            const modal = document.getElementById('imageModal');
            modal.innerHTML = `
                <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 2001;" 
                     onclick="if(event.target === this) document.getElementById('imageModal').style.display='none'">
                    <img id="draggableImage" src="${tempUrl}" 
                         style="max-width: 90%; max-height: 90%; position: absolute; cursor: move; top: 50%; left: 50%; transform: translate(-50%, -50%);" 
                         ondragstart="return false;">
                    <button onclick="document.getElementById('imageModal').style.display='none'" 
                            style="position: fixed; top: 20px; right: 20px; background: #f5222d; color: white; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 20px; cursor: pointer; z-index: 2002;">×</button>
                </div>
            `;
            modal.style.display = 'block';
            
            // 图片拖动和缩放功能
            const img = document.getElementById('draggableImage');
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
                scale += delta;
                scale = Math.max(0.5, Math.min(3, scale));
                img.style.left = '50%';
                img.style.top = '50%';
                img.style.transform = `translate(-50%, -50%) scale(${scale})`;
            });
        });
        
        // 创建删除按钮
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '×';
        deleteBtn.style.position = 'absolute';
        deleteBtn.style.top = '5px';
        deleteBtn.style.right = '5px';
        deleteBtn.style.width = '24px';
        deleteBtn.style.height = '24px';
        deleteBtn.style.background = 'rgba(0, 0, 0, 0.5)';
        deleteBtn.style.color = 'white';
        deleteBtn.style.border = 'none';
        deleteBtn.style.borderRadius = '50%';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.fontSize = '16px';
        deleteBtn.style.fontWeight = 'bold';
        deleteBtn.style.display = 'flex';
        deleteBtn.style.alignItems = 'center';
        deleteBtn.style.justifyContent = 'center';
        deleteBtn.style.padding = '0';
        
        // 删除图片功能 - 直接使用文件对象引用
            deleteBtn.addEventListener('click', function() {
                // 直接使用文件对象引用删除
                const fileToDelete = previewItem.fileObject;
                
                if (fileToDelete && window.selectedImages) {
                    // 查找文件对象在数组中的索引
                    const fileIndex = window.selectedImages.findIndex(file => file === fileToDelete);
                    
                    if (fileIndex !== -1) {
                        window.selectedImages.splice(fileIndex, 1);
                    } else {
                        // 如果找不到，尝试使用文件名匹配
                        const nameIndex = window.selectedImages.findIndex(file => file.name === fileToDelete.name);
                        if (nameIndex !== -1) {
                            window.selectedImages.splice(nameIndex, 1);
                        }
                    }
                }
                
                // 移除预览元素
                previewItem.remove();
                
                // 释放对象URL
                if (!isUrl) {
                    URL.revokeObjectURL(tempUrl);
                }
            });
        
        // 添加到预览微缩框
        previewItem.appendChild(previewImg);
        previewItem.appendChild(deleteBtn);
        
        // 插入到添加按钮之前
        container.insertBefore(previewItem, initialItem);
    }
    
    // 创建错误占位图
    createErrorPlaceholder(url, index) {
        // 创建一个简单的错误占位图
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        
        // 绘制背景
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, 200, 200);
        
        // 绘制错误图标
        ctx.fillStyle = '#ff4d4f';
        ctx.font = '40px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚠️', 100, 80);
        
        // 绘制错误文本
        ctx.font = '14px Arial';
        ctx.fillText('图片加载失败', 100, 130);
        
        // 转换为blob
        canvas.toBlob(blob => {
            if (blob) {
                // 生成文件名
                const fileName = `error_placeholder_${index}.jpg`;
                
                // 创建File对象
                const file = new File([blob], fileName, { type: 'image/jpeg' });
                
                // 创建图片预览（不添加到全局图片数组，避免误认为有新图片）
                this.createImagePreview(file, index);
            }
        }, 'image/jpeg');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.projectFinanceDetail = new ProjectFinanceDetail();
});
