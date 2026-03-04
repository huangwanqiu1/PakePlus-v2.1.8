// 未结页面功能封装
class UnsettledPage {
    constructor() {
        this.currentProjectId = '';
        this.isVisible = true;
        this.currentHandleSetStatusBtnClick = null; // 保存当前按钮点击事件处理函数的引用
        this.currentHandleSettlementBtnClick = null; // 保存记结算按钮点击事件处理函数的引用
        this.isSidebarOpen = false; // 标记侧边栏是否已打开

        // 初始化showNotification函数
        this.initShowNotification();

        // 延迟初始化,等待DOM加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            // DOM已经加载完成,直接初始化
            this.init();
        }
    }
    
    // 初始化showNotification函数
    initShowNotification() {
        // 如果全局已经有showNotification函数，不重复定义
        if (typeof window.showNotification !== 'function') {
            window.showNotification = function(message, isError = false) {
                // 如果已存在提示元素，则先移除
                const existingNotification = document.getElementById('notification');
                if (existingNotification) {
                    existingNotification.remove();
                }

                // 创建新的提示元素
                const notification = document.createElement('div');
                notification.id = 'notification';
                notification.textContent = message;

                // 设置提示样式
                notification.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    padding: 15px 25px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: bold;
                    text-align: center;
                    z-index: 1000;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
                    animation: popUp 0.3s ease-out forwards;
                    background-color: ${isError ? '#ff4d4f' : '#52c41a'};
                    color: white;
                `;

                // 添加弹出动画
                const style = document.createElement('style');
                style.textContent = `
                    @keyframes popUp {
                        0% {
                            opacity: 0;
                            transform: translate(-50%, -50%) scale(0.8);
                        }
                        100% {
                            opacity: 1;
                            transform: translate(-50%, -50%) scale(1);
                        }
                    }
                `;
                document.head.appendChild(style);

                // 将提示元素添加到页面
                document.body.appendChild(notification);

                // 3秒后自动移除提示
                setTimeout(() => {
                    notification.style.animation = 'popUp 0.3s ease-in reverse';
                    // 等待动画结束后再移除元素
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.remove();
                        }
                        // 移除动画样式
                        style.remove();
                    }, 300);
                }, 3000);
            };
        }
    }

    // 格式化金额显示
    formatAmount(amount) {
        const num = parseFloat(amount);
        if (isNaN(num)) {
            return '¥0';
        }
        // 如果是整数，直接显示整数；否则向下取整为整数
        const formattedNum = Number.isInteger(num) ? num : Math.floor(num);
        return `¥${formattedNum}`;
    }

    // 初始化
    init() {
        // 清理可能存在的残留监听器
        this.cleanupEventListeners();

        // 初始化项目选择框
        this.initProjectSelect();

        // 设置眼睛图标点击事件
        this.setupEyeIcon();

        // 设置标签切换事件
        this.setupTabSwitch();

        // 加载未结数据
        this.loadUnsettledData();

        // 添加消息事件监听器，接收来自首页的刷新消息
        window.addEventListener('message', (event) => {
            const message = event.data;
            // 处理刷新消息
            if (message && typeof message === 'object') {
                // 支持多种刷新类型
                if (message.type === 'refreshData' ||
                    message.type === 'refreshSettlementData' ||
                    message.type === 'refreshAttendanceData' ||
                    message.type === 'refreshEmployeeData') {
                    // 刷新未结数据
                    this.loadUnsettledData();
                }
            }
        });
    }

    // 清理可能存在的残留监听器
    cleanupEventListeners() {
        const setUnsettledBtn = document.getElementById('setUnsettledBtn');
        const settlementBtn = document.getElementById('settlementBtn');

        if (setUnsettledBtn && this.currentHandleSetStatusBtnClick) {
            setUnsettledBtn.removeEventListener('click', this.currentHandleSetStatusBtnClick);
        }
        if (settlementBtn && this.currentHandleSettlementBtnClick) {
            settlementBtn.removeEventListener('click', this.currentHandleSettlementBtnClick);
        }
    }

    // 初始化项目选择框
    initProjectSelect() {
        const projectSelect = document.getElementById('projectName');
        if (projectSelect) {
            // 从localStorage获取项目数据并更新选择框
            const updateProjectSelect = () => {
                // 从localStorage获取项目数据
                let currentUser = {};
                let userId = 'default';
                const currentUserStr = localStorage.getItem('currentUser');
                if (currentUserStr) {
                    currentUser = JSON.parse(currentUserStr);
                    userId = currentUser.user_id || 'default';
                }
                
                const projectsData = localStorage.getItem('project_cache_' + userId);
                if (projectsData) {
                    const projects = JSON.parse(projectsData);
                    // 保存当前选中的项目ID
                    const currentSelectedValue = projectSelect.value;
                    
                    // 清空现有选项
                    projectSelect.innerHTML = '';
                    
                    // 添加项目选项
                    projects.forEach(project => {
                        const option = document.createElement('option');
                        option.value = project.project_id;
                        option.textContent = project.project_name;
                        projectSelect.appendChild(option);
                    });
                    
                    // 恢复之前选中的项目ID（如果存在）
                    if (currentSelectedValue && projectSelect.querySelector(`option[value="${currentSelectedValue}"]`)) {
                        projectSelect.value = currentSelectedValue;
                    } else if (projects.length > 0) {
                        // 如果之前的选中项不存在，选择第一个项目
                        projectSelect.value = projects[0].project_id;
                        // 保存新选中的项目ID
                        localStorage.setItem('currentProjectId', projects[0].project_id);
                        this.currentProjectId = projects[0].project_id;
                    }
                }
            };
            
            // 初始加载项目数据
            updateProjectSelect();
            
            // 添加localStorage变化监听，实现实时更新
            window.addEventListener('storage', (e) => {
                // 当项目缓存数据发生变化时更新选择框
                let currentUser = {};
                let userId = 'default';
                const currentUserStr = localStorage.getItem('currentUser');
                if (currentUserStr) {
                    currentUser = JSON.parse(currentUserStr);
                    userId = currentUser.user_id || 'default';
                }
                
                if (e.key === 'project_cache_' + userId) {
                    updateProjectSelect();
                    // 刷新未结数据
                    this.loadUnsettledData();
                }
            });
            
            // 添加当前窗口的storage变化监听（同一窗口内的变化不会触发storage事件）
            const originalSetItem = localStorage.setItem;
            localStorage.setItem = function(key, value) {
                const event = new Event('localStorageChange');
                event.key = key;
                event.newValue = value;
                window.dispatchEvent(event);
                originalSetItem.apply(this, arguments);
            };
            
            // 监听自定义localStorageChange事件
            window.addEventListener('localStorageChange', (e) => {
                let currentUser = {};
                let userId = 'default';
                const currentUserStr = localStorage.getItem('currentUser');
                if (currentUserStr) {
                    currentUser = JSON.parse(currentUserStr);
                    userId = currentUser.user_id || 'default';
                }
                
                if (e.key === 'project_cache_' + userId) {
                    updateProjectSelect();
                    // 刷新未结数据
                    this.loadUnsettledData();
                }
            });
            
            // 检查URL参数中是否有项目ID
            const urlParams = new URLSearchParams(window.location.search);
            const projectIdFromUrl = urlParams.get('project_id');
            
            // 发送消息给父页面，更新返回列表的标题
            const updateReturnListTitle = () => {
                const selectedOption = projectSelect.options[projectSelect.selectedIndex];
                const selectedProjectName = selectedOption ? selectedOption.textContent : '';
                const selectedProjectId = projectSelect.value;
                
                if (selectedProjectName && selectedProjectId) {
                    const targetOrigin = window.location.origin || '*';
                    window.parent.postMessage({
                        type: 'updateTitle',
                        title: `${selectedProjectName} - 项目未结 (${selectedProjectId})`
                    }, targetOrigin);
                }
            };
            
            // 如果有URL参数中的项目ID，选中对应的项目并设置为不可选
            if (projectIdFromUrl) {
                projectSelect.value = projectIdFromUrl;
                this.currentProjectId = projectIdFromUrl;
                
                // 保存项目ID到localStorage
                localStorage.setItem('currentProjectId', projectIdFromUrl);
                
                // 从项目主页进入时，设置项目选择框为不可选状态
                projectSelect.disabled = true;
                projectSelect.style.backgroundColor = '#f8f9fa';
                projectSelect.style.cursor = 'not-allowed';
                
                // 更新返回列表标题
                updateReturnListTitle();
            }
            // 如果没有URL参数，但localStorage中有当前项目ID，选中对应的项目
            else {
                const currentProjectId = localStorage.getItem('currentProjectId');
                if (currentProjectId) {
                    projectSelect.value = currentProjectId;
                    this.currentProjectId = currentProjectId;
                }
                
                // 更新返回列表标题
                updateReturnListTitle();
            }
            
            // 添加项目选择框的change事件监听器，当选择变更时刷新数据
            projectSelect.addEventListener('change', (e) => {
                // 保存当前选择的项目ID到localStorage
                const selectedProjectId = e.target.value;
                localStorage.setItem('currentProjectId', selectedProjectId);
                this.currentProjectId = selectedProjectId;
                
                // 更新返回列表标题
                updateReturnListTitle();
                
                // 刷新未结数据
                this.loadUnsettledData();
            });
        }
    }

    // 设置眼睛图标点击事件
    setupEyeIcon() {
        const eyeIcon = document.querySelector('.eye-icon');
        if (eyeIcon) {
            eyeIcon.addEventListener('click', () => {
                this.isVisible = !this.isVisible;
                
                const amounts = document.querySelectorAll('.amount, .total-amount');
                if (this.isVisible) {
                    // 显示真实金额
                    eyeIcon.textContent = '👁️';
                    amounts.forEach(amount => {
                        const originalValue = amount.dataset.originalValue;
                        if (originalValue) {
                            amount.textContent = originalValue;
                        }
                    });
                } else {
                    // 隐藏金额，显示****
                    eyeIcon.textContent = '🙈';
                    amounts.forEach(amount => {
                        // 保存原始值
                        if (!amount.dataset.originalValue) {
                            amount.dataset.originalValue = amount.textContent;
                        }
                        amount.textContent = '****';
                    });
                }
            });
        }
    }

    // 设置标签切换事件
    setupTabSwitch() {
        const workTypeOptions = document.querySelectorAll('.work-type-option');
        workTypeOptions.forEach(option => {
            option.addEventListener('click', function(e) {
                const clickedOption = e.target;
                // 移除所有选项的active类
                workTypeOptions.forEach(opt => {
                    opt.classList.remove('active');
                });
                // 为当前点击的选项添加active类
                clickedOption.classList.add('active');
                
                // 先关闭侧边栏并清理事件监听器
                this.closeSidebar();
                this.cleanupEventListeners();
                
                // 根据选中的标签加载对应的数据
                this.loadUnsettledData();
            }.bind(this));
        });
    }
    
    // 关闭侧边栏
    closeSidebar() {
        const sidebar = document.getElementById('employeeSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar && overlay) {
            sidebar.classList.remove('open');
            overlay.classList.remove('open');
            this.isSidebarOpen = false;
        }
    }

    // 从本地存储获取员工数据
    getEmployeeData() {
        try {
            let employeesData = [];
            const indexKey = 'employeesIndex';
            const indexData = localStorage.getItem(indexKey);
            if (indexData) {
                const employeeIndex = JSON.parse(indexData);
                // 将索引对象转换为数组并过滤出指定项目的员工
                employeesData = Object.values(employeeIndex).filter(emp => emp.project_id === this.currentProjectId);
            }
            return employeesData;
        } catch (error) {
            console.error('获取员工数据失败:', error);
            return [];
        }
    }

    // 从本地存储获取考勤记录
    getAttendanceData() {
        try {
            // 从localStorage获取考勤数据
            let userId = 'default';
            const currentUserStr = localStorage.getItem('currentUser');
            if (currentUserStr) {
                const currentUser = JSON.parse(currentUserStr);
                userId = currentUser.user_id || 'default';
            }
            
            const workRecordsKey = 'work_records_' + userId;
            const cachedData = localStorage.getItem(workRecordsKey);
            let attendanceData = cachedData ? JSON.parse(cachedData) : [];
            
            // 获取员工数据
            const employeesData = this.getEmployeeData();
            
            // 从本地存储获取项目数据
            let projectsData = [];
            const cacheKey = 'project_cache_' + userId;
            const projectsCachedData = localStorage.getItem(cacheKey);
            if (projectsCachedData) {
                projectsData = JSON.parse(projectsCachedData);
            }
            
            // 创建员工和项目的映射
            const employeeMap = {};
            employeesData.forEach(emp => {
                employeeMap[emp.employee_id] = emp;
            });
            
            const projectMap = {};
            projectsData.forEach(proj => {
                projectMap[proj.project_id] = proj;
            });
            
            // 合并数据
            const mergedData = attendanceData.map(record => {
                const employee = employeeMap[record.employee_id] || {};
                const project = projectMap[employee.project_id] || {};
                
                return {
                    ...record,
                    employees: employee,
                    projects: project
                };
            });
            
            // 过滤当前项目的数据
            const filteredData = mergedData.filter(record => record.project_id === this.currentProjectId);
            
            // 处理考勤数据
            return this.processAttendanceData(filteredData);
        } catch (error) {
            console.error('获取考勤数据失败:', error);
            return [];
        }
    }

    // 处理考勤数据
    processAttendanceData(data) {
        // 按员工分组
        const employeeMap = {};

        data.forEach(record => {
            const empCode = record.employees.emp_code;

            if (!employeeMap[empCode]) {
                employeeMap[empCode] = {
                    employee_id: record.employee_id, // 保存员工ID
                    project_id: record.employees.project_id, // 保存项目ID
                    emp_name: record.employees.emp_name,
                    emp_code: empCode,
                    labor_cost: record.employees.labor_cost,
                    status: record.employees.status || '在职', // 员工状态
                    正常工时单价: record.projects.regular_hours || 8,
                    加班工时单价: record.projects.overtime_hours || 12,
                    点工上班小时: 0,
                    点工上班工数: 0,
                    点工加班小时: 0,
                    点工加班工数: 0,
                    包工金额: 0,
                    工量金额: 0,
                    短工金额: 0
                };
            }
            
            const empData = employeeMap[empCode];
            
            if (record.work_type === '点工') {
                // 点工处理 - 先累加所有工时
                empData.点工上班小时 += record.regular_hours || 0;
                empData.点工加班小时 += record.overtime_hours || 0;
            } else if (record.work_type === '包工') {
                // 包工处理
                empData.包工金额 += record.contract_amount || 0;
            } else if (record.work_type === '工量') {
                // 工量处理
                empData.工量金额 += record.contract_amount || 0;
            } else if (record.work_type === '短工') {
                // 短工处理
                empData.短工金额 += record.contract_amount || 0;
            }
        });
        
        // 对每个员工计算工数（先累加所有工时，再除以单价）
        Object.values(employeeMap).forEach(empData => {
            if (empData.点工上班小时 > 0) {
                empData.点工上班工数 = empData.点工上班小时 / (empData.正常工时单价 || 1);
            }
            if (empData.点工加班小时 > 0) {
                empData.点工加班工数 = empData.点工加班小时 / (empData.加班工时单价 || 1);
            }
        });
        
        // 转换为数组并返回
        return Object.values(employeeMap);
    }

    // 从本地存储获取结算记录
    getSettlementData() {
        try {
            // 从本地存储获取结算数据
            const settlementRecordsKey = 'settlementRecords';
            const cachedData = localStorage.getItem(settlementRecordsKey);
            let settlementData = cachedData ? JSON.parse(cachedData) : [];
            
            // 从本地存储获取员工数据
            let employeesData = [];
            const indexKey = 'employeesIndex';
            const indexData = localStorage.getItem(indexKey);
            if (indexData) {
                const employeeIndex = JSON.parse(indexData);
                // 将索引对象转换为数组并过滤出指定项目的员工
                employeesData = Object.values(employeeIndex).filter(emp => emp.project_id === this.currentProjectId);
            }
            
            // 创建员工的映射
            const employeeMap = {};
            employeesData.forEach(emp => {
                employeeMap[emp.employee_id] = emp;
            });
            
            // 合并数据
            const mergedData = settlementData.map(record => {
                const employee = employeeMap[record.employee_id] || {};
                
                return {
                    ...record,
                    employees: employee
                };
            });
            
            // 过滤当前项目的数据
            const filteredData = mergedData.filter(record => record.project_id === this.currentProjectId);
            
            // 处理结算数据
            return this.processSettlementData(filteredData);
        } catch (error) {
            console.error('获取结算数据失败:', error);
            return [];
        }
    }

    // 处理结算数据
    processSettlementData(data) {
        // 按员工分组
        const employeeMap = {};

        data.forEach(record => {
            const empCode = record.employees.emp_code;

            if (!employeeMap[empCode]) {
                employeeMap[empCode] = {
                    employee_id: record.employee_id, // 保存员工ID
                    project_id: record.employees.project_id, // 保存项目ID
                    emp_name: record.employees.emp_name,
                    emp_code: empCode,
                    status: record.employees.status || '在职', // 员工状态
                    借支金额: 0,
                    扣款金额: 0,
                    公司打款金额: 0,
                    结算金额: 0
                };
            }
            
            const empData = employeeMap[empCode];
            
            // 根据record_type累加金额
            switch (record.record_type) {
                case '借支':
                    empData.借支金额 += record.amount || 0;
                    break;
                case '扣款':
                    empData.扣款金额 += record.amount || 0;
                    break;
                case '公司转账':
                    empData.公司打款金额 += record.amount || 0;
                    break;
                case '结算':
                    empData.结算金额 += record.amount || 0;
                    break;
            }
        });
        
        // 转换为数组并返回
        return Object.values(employeeMap);
    }

    // 获取员工的日期范围
    getEmployeeDateRange(attendanceData, settlementData, employeeId) {
        // 获取该员工的所有考勤记录
        const empAttendanceRecords = attendanceData.filter(record => record.employee_id === employeeId);
        // 获取该员工的所有结算记录
        const empSettlementRecords = settlementData.filter(record => record.employee_id === employeeId);
        
        // 合并所有日期
        const allDates = [
            ...empAttendanceRecords.map(record => record.record_date),
            ...empSettlementRecords.map(record => record.record_date)
        ];
        
        // 过滤掉无效日期
        const validDates = allDates.filter(date => date);
        
        // 计算最早和最晚日期
        let earliestDate = null;
        let latestDate = null;
        
        if (validDates.length > 0) {
            // 转换为Date对象
            const dateObjects = validDates.map(date => new Date(date));
            
            // 计算最早和最晚日期
            earliestDate = new Date(Math.min(...dateObjects));
            latestDate = new Date(Math.max(...dateObjects));
            
            // 如果只有一个日期，最早日期和最晚日期相同
            if (validDates.length === 1) {
                latestDate = earliestDate;
            }
        }
        
        // 格式化日期为YYYY年MM月DD日格式
        const formatDate = (date) => {
            if (!date) return '';
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();
            return `${year}年${month}月${day}日`;
        };
        
        return {
            earliestDate: formatDate(earliestDate),
            latestDate: formatDate(latestDate)
        };
    }

    // 合并考勤和结算记录，用于获取原始记录数据
    getOriginalRecords() {
        try {
            // 从localStorage获取考勤数据
            let userId = 'default';
            const currentUserStr = localStorage.getItem('currentUser');
            if (currentUserStr) {
                const currentUser = JSON.parse(currentUserStr);
                userId = currentUser.user_id || 'default';
            }
            
            // 获取考勤记录
            const workRecordsKey = 'work_records_' + userId;
            const cachedWorkData = localStorage.getItem(workRecordsKey);
            const attendanceRecords = cachedWorkData ? JSON.parse(cachedWorkData) : [];
            
            // 获取结算记录
            const settlementRecordsKey = 'settlementRecords';
            const cachedSettlementData = localStorage.getItem(settlementRecordsKey);
            const settlementRecords = cachedSettlementData ? JSON.parse(cachedSettlementData) : [];
            
            // 过滤当前项目的数据
            const filteredAttendance = attendanceRecords.filter(record => record.project_id === this.currentProjectId);
            const filteredSettlement = settlementRecords.filter(record => record.project_id === this.currentProjectId);
            
            return {
                attendance: filteredAttendance,
                settlement: filteredSettlement
            };
        } catch (error) {
            console.error('获取原始记录失败:', error);
            return {
                attendance: [],
                settlement: []
            };
        }
    }

    // 合并考勤和结算数据
    mergeData(attendanceData, settlementData) {
        // 获取原始记录数据
        const originalRecords = this.getOriginalRecords();
        
        // 创建工号到数据的映射
        const attendanceMap = {};
        attendanceData.forEach(item => {
            attendanceMap[item.emp_code] = item;
        });

        const settlementMap = {};
        settlementData.forEach(item => {
            settlementMap[item.emp_code] = item;
        });

        // 合并数据
        const mergedData = [];
        
        // 获取所有工号
        const allEmpCodes = [...new Set([...Object.keys(attendanceMap), ...Object.keys(settlementMap)])];
        
        allEmpCodes.forEach(empCode => {
            const settlementItem = settlementMap[empCode] || {
                project_id: '',
                借支金额: 0,
                扣款金额: 0,
                公司打款金额: 0,
                结算金额: 0
            };

            const attendanceItem = attendanceMap[empCode] || {
                employee_id: '',
                project_id: settlementItem.project_id || '', // 从结算记录中获取项目ID
                emp_name: '未知员工',
                emp_code: empCode,
                labor_cost: 0,
                status: '在职',
                正常工时单价: 8,
                加班工时单价: 12,
                点工上班小时: 0,
                点工上班工数: 0,
                点工加班小时: 0,
                点工加班工数: 0,
                包工金额: 0,
                工量金额: 0,
                短工金额: 0
            };
            
            // 获取该员工的日期范围
            // 优先使用attendanceItem.employee_id，如果为空则使用settlementItem.employee_id
            const employeeId = attendanceItem.employee_id || settlementItem.employee_id;
            const dateRange = this.getEmployeeDateRange(originalRecords.attendance, originalRecords.settlement, employeeId);

            mergedData.push({
                ...attendanceItem,
                ...settlementItem,
                dateRange: dateRange
            });
        });

        // 按工号数值升序排序（1~100000）
        mergedData.sort((a, b) => {
            // 将工号转换为数值进行比较
            const empCodeA = parseInt(a.emp_code) || 0;
            const empCodeB = parseInt(b.emp_code) || 0;
            return empCodeA - empCodeB;
        });

        return mergedData;
    }

    // 计算未结金额
    calculateUnsettledAmount(data) {
        return data.map(item => {
            // 计算点工金额
            const roundedRegularWorkDays = parseFloat(item.点工上班工数.toFixed(2));
            const roundedOvertimeWorkDays = parseFloat(item.点工加班工数.toFixed(2));
            const totalWorkDays = roundedRegularWorkDays + roundedOvertimeWorkDays;
            const pointWorkAmount = Math.floor(totalWorkDays * (item.labor_cost || 0));
            
            // 计算工资和支出
            const salary = pointWorkAmount + item.包工金额 + item.工量金额 + (item.短工金额 || 0);
            const expense = item.借支金额 + item.扣款金额 + item.公司打款金额 + item.结算金额;
            const unsettled = salary - expense;
            
            return {
                ...item,
                pointWorkAmount,
                salary,
                expense,
                unsettled
            };
        });
    }

    // 加载未结数据
    loadUnsettledData() {
        if (!this.currentProjectId) {
            console.log('没有选择项目，无法加载未结数据');
            return;
        }
        
        // 获取考勤数据
        const attendanceData = this.getAttendanceData();
        // 获取结算数据
        const settlementData = this.getSettlementData();
        // 合并数据
        const mergedData = this.mergeData(attendanceData, settlementData);
        // 计算未结金额
        const unsettledData = this.calculateUnsettledAmount(mergedData);
        
        // 渲染未结数据
        this.renderUnsettledData(unsettledData);
    }

    // 显示员工详情侧边栏
    showEmployeeDetails(employee) {
        // 先清理所有事件监听器，避免重复绑定
        this.cleanupEventListeners();
        
        // 获取侧边栏元素和遮罩层
        const sidebar = document.getElementById('employeeSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const closeBtn = document.getElementById('closeSidebar');
        
        if (!sidebar || !overlay || !closeBtn) return;
        
        // 设置侧边栏头部信息
        const sidebarAvatar = document.getElementById('sidebarAvatar');
        const sidebarName = document.getElementById('sidebarName');
        const sidebarDateRange = document.getElementById('sidebarDateRange');
        
        if (sidebarAvatar) {
            sidebarAvatar.textContent = employee.emp_code;
        }
        if (sidebarName) {
            // 根据员工状态决定是否显示已退场标签
            const shouldShowExited = ['离职', '结清'].includes(employee.status);
            let exitedTag = '';
            if (shouldShowExited) {
                exitedTag = ' <span style="color: #1890ff; font-weight: normal; background-color: #e0e0e0; padding: 2px 6px; border-radius: 8px; margin-left: 5px;">已退场</span>';
            }
            sidebarName.innerHTML = `${employee.emp_name}${exitedTag}`;
        }
        if (sidebarDateRange) {
            sidebarDateRange.textContent = `${employee.dateRange.earliestDate}~${employee.dateRange.latestDate}`;
        }
        
        // 获取原始记录并统计每种记录类型的条数
        const originalRecords = this.getOriginalRecords();
        const recordCounts = {
            包工: 0,
            工量: 0,
            借支: 0,
            扣款: 0,
            公司转账: 0,
            结算: 0
        };
        
        // 统计考勤记录中的包工和工量
        originalRecords.attendance.forEach(record => {
            if (record.employee_id === employee.employee_id) {
                if (record.work_type === '包工') {
                    recordCounts.包工++;
                } else if (record.work_type === '工量') {
                    recordCounts.工量++;
                }
            }
        });
        
        // 统计结算记录中的借支、扣款、公司转账和结算
        originalRecords.settlement.forEach(record => {
            if (record.employee_id === employee.employee_id) {
                switch (record.record_type) {
                    case '借支':
                        recordCounts.借支++;
                        break;
                    case '扣款':
                        recordCounts.扣款++;
                        break;
                    case '公司转账':
                        recordCounts.公司转账++;
                        break;
                    case '结算':
                        recordCounts.结算++;
                        break;
                }
            }
        });
        
        // 生成侧边栏内容
        const sidebarContent = document.getElementById('sidebarContent');
        if (sidebarContent) {
            sidebarContent.innerHTML = this.generateEmployeeDetails(employee, recordCounts);
        }
        
        // 获取侧边栏按钮
        const setUnsettledBtn = document.getElementById('setUnsettledBtn');
        const settlementBtn = document.getElementById('settlementBtn');
        
        // 获取当前选中的标签
        const activeTab = document.querySelector('.work-type-option.active');
        const isUnsettledTab = activeTab && activeTab.textContent.includes('未结');
        
        // 更新侧边栏按钮文本和样式
        if (setUnsettledBtn) {
            if (isUnsettledTab) {
                // 未结标签：按钮显示"设为已结清"，边框和字体设为红色
                setUnsettledBtn.textContent = '设为已结清';
                setUnsettledBtn.style.color = 'red';
                setUnsettledBtn.style.borderColor = 'red';
                setUnsettledBtn.style.backgroundColor = 'white';
                setUnsettledBtn.onmouseover = function() {
                    this.style.backgroundColor = '#fff2f0';
                };
                setUnsettledBtn.onmouseout = function() {
                    this.style.backgroundColor = 'white';
                };
            } else {
                // 已结标签：按钮显示"设为未结"，边框和字体设为蓝色
                setUnsettledBtn.textContent = '设为未结';
                setUnsettledBtn.style.color = '#1890ff';
                setUnsettledBtn.style.borderColor = '#1890ff';
                setUnsettledBtn.style.backgroundColor = 'white';
                setUnsettledBtn.onmouseover = function() {
                    this.style.backgroundColor = '#edf4ff';
                };
                setUnsettledBtn.onmouseout = function() {
                    this.style.backgroundColor = 'white';
                };
            }
            
            // 先保存旧的事件处理函数引用
            const oldSetStatusHandler = this.currentHandleSetStatusBtnClick;
            const oldSettlementHandler = this.currentHandleSettlementBtnClick;
            
            // 先移除旧的监听器，防止重复绑定
            if (oldSetStatusHandler) {
                setUnsettledBtn.removeEventListener('click', oldSetStatusHandler);
            }
            if (oldSettlementHandler) {
                settlementBtn.removeEventListener('click', oldSettlementHandler);
            }

            // 创建按钮点击事件处理函数并保存到实例属性
            this.currentHandleSetStatusBtnClick = async () => {
                try {
                    // 根据按钮当前显示的文本内容决定执行哪个功能
                    // 这样确保按钮显示与执行功能完全一致
                    const buttonText = setUnsettledBtn.textContent;
                    
                    if (buttonText === '设为已结清') {
                        // 按钮显示"设为已结清"：执行设为已结清功能
                        if (typeof window.EmployeeStatusManager === 'undefined') {
                            showNotification('员工状态管理模块未加载', true);
                            return;
                        }

                        // 先检查未结金额是否符合条件
                        const unsettledAmount = parseFloat(employee.unsettled) || 0;
                        if (unsettledAmount > 0) {
                            showNotification('当前员工工资未结清，不能设为已结清', true);
                            return;
                        }
                        
                        // 显示确认模态框
                        const confirmModal = document.getElementById('confirmModal');
                        const cancelBtn = document.getElementById('cancelBtn');
                        const confirmBtn = document.getElementById('confirmBtn');
                        
                        if (confirmModal) {
                            confirmModal.classList.add('open');
                        }
                        
                        // 创建确认和取消按钮的事件处理函数
                        const handleConfirm = async () => {
                            // 移除事件监听器
                            confirmBtn.removeEventListener('click', handleConfirm);
                            cancelBtn.removeEventListener('click', handleCancel);
                            
                            // 关闭模态框
                            if (confirmModal) {
                                confirmModal.classList.remove('open');
                            }
                            
                            // 执行设为已结清操作
                            const result = await window.EmployeeStatusManager.setAsSettled(employee);

                            if (!result.success) {
                                // 显示错误提示（红色背景）
                                showNotification(result.message, true);
                                return;
                            }

                            // 成功提示
                            showNotification('设为已结清成功');
                            
                            // 刷新页面数据
                            this.loadUnsettledData();

                            // 关闭侧边栏
                            sidebar.classList.remove('open');
                            overlay.classList.remove('open');
                        };
                        
                        const handleCancel = () => {
                            // 移除事件监听器
                            confirmBtn.removeEventListener('click', handleConfirm);
                            cancelBtn.removeEventListener('click', handleCancel);
                            
                            // 关闭模态框，终止操作
                            if (confirmModal) {
                                confirmModal.classList.remove('open');
                            }
                        };
                        
                        // 添加事件监听器
                        confirmBtn.addEventListener('click', handleConfirm);
                        cancelBtn.addEventListener('click', handleCancel);
                        
                        // 点击模态框外部关闭模态框
                        confirmModal.addEventListener('click', (e) => {
                            if (e.target === confirmModal) {
                                handleCancel();
                            }
                        });
                    } else if (buttonText === '设为未结') {
                        // 按钮显示"设为未结"：执行设为未结功能
                        if (typeof window.EmployeeStatusManager === 'undefined') {
                            showNotification('员工状态管理模块未加载', true);
                            return;
                        }

                        const result = await window.EmployeeStatusManager.setAsUnsettled(employee);

                        if (!result.success) {
                            // 显示错误提示（红色背景）
                            showNotification(result.message, true);
                            return;
                        }

                        // 成功提示
                        showNotification('设为未结成功');
                        
                        // 刷新页面数据
                        this.loadUnsettledData();

                        // 关闭侧边栏
                        sidebar.classList.remove('open');
                        overlay.classList.remove('open');
                    }
                } catch (error) {
                    console.error('设置员工状态失败:', error);
                    showNotification('操作失败，请重试', true);
                }
            };

            // 添加新的点击事件监听器
            setUnsettledBtn.addEventListener('click', this.currentHandleSetStatusBtnClick);
        }
        
        // 更新未结工资显示
        const unsettledAmountElement = document.getElementById('unsettledAmount');
        if (unsettledAmountElement) {
            // 获取当前选中的标签
            const activeTab = document.querySelector('.work-type-option.active');
            const isUnsettledTab = activeTab && activeTab.textContent.includes('未结');
            
            if (isUnsettledTab) {
                // 未结标签：显示未结工资
                unsettledAmountElement.parentElement.style.display = 'block';
                // 格式化未结金额：整数显示整数，非整数向下取整，添加人民币符号
                let formattedAmount;
                const unsettled = parseFloat(employee.unsettled);
                if (Number.isInteger(unsettled)) {
                    // 整数显示整数
                    formattedAmount = unsettled;
                } else {
                    // 非整数向下取整
                    formattedAmount = Math.floor(unsettled);
                }
                unsettledAmountElement.textContent = `¥${formattedAmount}`;
            } else {
                // 已结标签：隐藏未结工资
                unsettledAmountElement.parentElement.style.display = 'none';
            }
        }
        
        // 更新记结算按钮的显示/隐藏
               if (settlementBtn) {
                   if (isUnsettledTab) {
                       // 未结标签：显示记结算按钮
                       settlementBtn.style.display = 'block';

                       // 先移除旧的记结算按钮监听器，避免重复绑定
                        if (this.currentHandleSettlementBtnClick) {
                            settlementBtn.removeEventListener('click', this.currentHandleSettlementBtnClick);
                        }
                        
                        // 创建记结算按钮点击事件处理函数并保存到实例属性
                        this.currentHandleSettlementBtnClick = async () => {
                            // 获取当前项目ID
                            const projectId = this.currentProjectId;
                            // 获取当前员工ID
                            const employeeId = employee.employee_id;

                            // 检查员工是否已有结算记录
                            let hasSettlementRecord = false;

                            try {
                                // 从localStorage获取所有结算记录
                                const sources = ['settlement_records_cache', 'offline_settlement_records', 'settlementRecords'];

                                for (const source of sources) {
                                    const records = localStorage.getItem(source);
                                    if (records) {
                                        const parsedRecords = JSON.parse(records);

                                        if (Array.isArray(parsedRecords)) {
                                            // 检查是否有当前员工的结算记录
                                            for (const record of parsedRecords) {
                                                if (record.employee_id === employeeId && record.record_type === '结算') {
                                                    hasSettlementRecord = true;
                                                    break;
                                                }
                                            }
                                        } else if (typeof parsedRecords === 'object' && parsedRecords !== null) {
                                            // 处理对象格式的记录
                                            for (const date in parsedRecords) {
                                                if (parsedRecords.hasOwnProperty(date)) {
                                                    const dateRecords = parsedRecords[date];
                                                    if (Array.isArray(dateRecords)) {
                                                        for (const record of dateRecords) {
                                                            if (record.employee_id === employeeId && record.record_type === '结算') {
                                                                hasSettlementRecord = true;
                                                                break;
                                                            }
                                                        }
                                                    }
                                                }
                                                if (hasSettlementRecord) break;
                                            }
                                        }
                                    }
                                    if (hasSettlementRecord) break;
                                }
                            } catch (error) {
                                console.error('检查结算记录失败:', error);
                            }

                            // 如果已有结算记录，显示提示并停止跳转
                            if (hasSettlementRecord) {
                                // 使用与结算借支页面相同的提示样式
                                showNotification('当前员工已有结算记录', true);
                                return;
                            }

                            // 构建结算借支页面URL
                            const baseUrl = window.location.href.split('?')[0];
                            const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
                            const settlementUrl = new URL(basePath + '结算借支.html');

                            // 添加URL参数
                            settlementUrl.searchParams.append('project_id', projectId);
                            settlementUrl.searchParams.append('employee_ids', employeeId);
                            // 添加结算类型参数，用于选中结算选项卡
                            settlementUrl.searchParams.append('work_type', 'settleWork');

                            // 跳转到结算借支页面
                            window.location.href = settlementUrl.href;
                        };

                        // 添加新的点击事件监听器
                        settlementBtn.addEventListener('click', this.currentHandleSettlementBtnClick);
                   } else {
                       // 已结标签：隐藏记结算按钮
                       settlementBtn.style.display = 'none';
                   }
               }
        
        // 显示侧边栏和遮罩层
        sidebar.classList.add('open');
        overlay.classList.add('open');

        // 添加关闭侧边栏的事件监听器
        const closeSidebar = () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('open');
            this.isSidebarOpen = false; // 标记侧边栏已关闭

            // 移除侧边栏关闭事件监听器
            overlay.removeEventListener('click', closeSidebar);
            closeBtn.removeEventListener('click', closeSidebar);

            // 清理按钮点击事件监听器
            this.cleanupEventListeners();
        };

        closeBtn.addEventListener('click', closeSidebar);
        overlay.addEventListener('click', closeSidebar);

        // 标记侧边栏已打开
        this.isSidebarOpen = true;
    }
    
    // 生成员工详情内容
    generateEmployeeDetails(employee, recordCounts) {
        // 计算各项数据
        let pointWorkDetails = '';
        if (employee.点工上班小时 > 0) {
            const hours = Number.isInteger(employee.点工上班小时)
                ? employee.点工上班小时
                : employee.点工上班小时.toFixed(1);
            const workDays = employee.点工上班工数;
            const displayWorkDays = Number.isInteger(workDays) ? workDays : workDays.toFixed(2);
            pointWorkDetails += `上班：${hours}小时=${displayWorkDays}个工\n`;
        }
        if (employee.点工加班小时 > 0) {
            const hours = Number.isInteger(employee.点工加班小时)
                ? employee.点工加班小时
                : employee.点工加班小时.toFixed(1);
            const workDays = employee.点工加班工数;
            const displayWorkDays = Number.isInteger(workDays) ? workDays : workDays.toFixed(2);
            pointWorkDetails += `加班：${hours}小时=${displayWorkDays}个工\n`;
        }
        // 移除末尾的换行符
        pointWorkDetails = pointWorkDetails.trim();
        
        // 格式化金额
        const pointWorkAmount = this.formatAmount(employee.pointWorkAmount || 0);
        const contractWorkAmount = this.formatAmount(employee.包工金额 || 0);
        const quantityWorkAmount = this.formatAmount(employee.工量金额 || 0);
        const advanceAmount = this.formatAmount(employee.借支金额 || 0);
        const deductionAmount = this.formatAmount(employee.扣款金额 || 0);
        const companyTransferAmount = this.formatAmount(employee.公司打款金额 || 0);
        const settlementAmount = this.formatAmount(employee.结算金额 || 0);
        
        // 生成HTML内容
        let html = '';

        // 获取当前项目信息
        const projectName = localStorage.getItem('currentProjectName') || '';
        const projectId = this.currentProjectId;

        // 构建点击事件处理函数
        const buildClickHandler = (type) => {
            return `onclick="window.unsettledPage.goToStatistic('${projectId}', '${projectName}', '${employee.employee_id}', '${employee.emp_name}', '${employee.emp_code}', '${type}')"`;
        };

        // 只有当点工有记录时才显示
        if (employee.点工上班小时 > 0 || employee.点工加班小时 > 0) {
            html += `
            <div class="data-item work" ${buildClickHandler('点工')}>
                <div style="display: flex; align-items: center;">
                    <div style="width: 4px; height: 16px; background-color: #007bff; border-radius: 2px; margin-right: 4px;"></div>
                    <div class="data-item-title" style="min-width: 40px; text-align: left;">点工</div>
                    <div style="flex: 1; margin-left: 4px; display: flex; flex-direction: column; gap: 4px;">
                        ${pointWorkDetails.split('\n').map(line => `<div style="font-size: 14px; color: black;">${line}</div>`).join('')}
                    </div>
                </div>
                <div style="display: flex; align-items: center;">
                    <div class="data-item-amount">${pointWorkAmount}</div>
                    <div class="data-item-arrow">></div>
                </div>
            </div>
            `;
        }

        // 只有当记录条数大于0时才显示对应的记录行
        if (recordCounts.包工 > 0) {
            html += `
            <div class="data-item work" ${buildClickHandler('包工')}>
                <div style="display: flex; align-items: center;">
                    <div style="width: 4px; height: 16px; background-color: #28a745; border-radius: 2px; margin-right: 8px;"></div>
                    <div class="data-item-title">包工</div>
                    <span style="color: black; font-size: 14px; margin-left: 10px;">${recordCounts.包工}笔</span>
                </div>
                <div style="display: flex; align-items: center;">
                    <div class="data-item-amount" style="color: #28a745;">${contractWorkAmount}</div>
                    <div class="data-item-arrow">></div>
                </div>
            </div>
            `;
        }

        if (recordCounts.工量 > 0) {
            html += `
            <div class="data-item work" ${buildClickHandler('工量')}>
                <div style="display: flex; align-items: center;">
                    <div style="width: 4px; height: 16px; background-color: #28a745; border-radius: 2px; margin-right: 8px;"></div>
                    <div class="data-item-title">工量</div>
                    <span style="color: black; font-size: 14px; margin-left: 10px;">${recordCounts.工量}笔</span>
                </div>
                <div style="display: flex; align-items: center;">
                    <div class="data-item-amount" style="color: #28a745;">${quantityWorkAmount}</div>
                    <div class="data-item-arrow">></div>
                </div>
            </div>
            `;
        }

        if (recordCounts.借支 > 0) {
            html += `
            <div class="data-item expense" ${buildClickHandler('借支')}>
                <div style="display: flex; align-items: center;">
                    <div style="width: 4px; height: 16px; background-color: #fd7e14; border-radius: 2px; margin-right: 8px;"></div>
                    <div class="data-item-title">借支</div>
                    <span style="color: black; font-size: 14px; margin-left: 10px;">${recordCounts.借支}笔</span>
                </div>
                <div style="display: flex; align-items: center;">
                    <div class="data-item-amount expense">${advanceAmount}</div>
                    <div class="data-item-arrow">></div>
                </div>
            </div>
            `;
        }

        if (recordCounts.扣款 > 0) {
            html += `
            <div class="data-item expense" ${buildClickHandler('扣款')}>
                <div style="display: flex; align-items: center;">
                    <div style="width: 4px; height: 16px; background-color: #fd7e14; border-radius: 2px; margin-right: 8px;"></div>
                    <div class="data-item-title">扣款</div>
                    <span style="color: black; font-size: 14px; margin-left: 10px;">${recordCounts.扣款}笔</span>
                </div>
                <div style="display: flex; align-items: center;">
                    <div class="data-item-amount expense">${deductionAmount}</div>
                    <div class="data-item-arrow">></div>
                </div>
            </div>
            `;
        }

        if (recordCounts.公司转账 > 0) {
            html += `
            <div class="data-item expense" ${buildClickHandler('公司转账')}>
                <div style="display: flex; align-items: center;">
                    <div style="width: 4px; height: 16px; background-color: #fd7e14; border-radius: 2px; margin-right: 8px;"></div>
                    <div class="data-item-title">公司转账</div>
                    <span style="color: black; font-size: 14px; margin-left: 10px;">${recordCounts.公司转账}笔</span>
                </div>
                <div style="display: flex; align-items: center;">
                    <div class="data-item-amount expense">${companyTransferAmount}</div>
                    <div class="data-item-arrow">></div>
                </div>
            </div>
            `;
        }

        if (recordCounts.结算 > 0) {
            html += `
            <div class="data-item expense" ${buildClickHandler('结算')}>
                <div style="display: flex; align-items: center;">
                    <div style="width: 4px; height: 16px; background-color: #fd7e14; border-radius: 2px; margin-right: 8px;"></div>
                    <div class="data-item-title">结算</div>
                    <span style="color: black; font-size: 14px; margin-left: 10px;">${recordCounts.结算}笔</span>
                </div>
                <div style="display: flex; align-items: center;">
                    <div class="data-item-amount expense">${settlementAmount}</div>
                    <div class="data-item-arrow">></div>
                </div>
            </div>
            `;
        }

        return html;
    }
    
    // 跳转到统计页面
    goToStatistic(projectId, projectName, employeeId, employeeName, employeeCode, recordType) {
        // 构建统计页面URL
        const baseUrl = window.location.href.split('?')[0];
        const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
        const statisticUrl = new URL(basePath + '统计.html');
        
        // 设置选中的类型
        const selectedTypes = [recordType];
        localStorage.setItem('selectedTypes', JSON.stringify(selectedTypes));
        
        // 保存当前员工信息 - 使用正确的员工ID
        const selectedEmployee = [{ id: employeeId, name: employeeName, empCode: employeeCode }];
        localStorage.setItem('selectedEmployees', JSON.stringify(selectedEmployee));
        
        // 设置统计页面过滤器 - 不设置日期
        const statisticFilter = {
            projectId: projectId,
            projectName: projectName,
            activeTab: 'detail', // 直接进入明细视图
            selectedEmployees: JSON.stringify(selectedEmployee), // 保存员工选择
            selectedTypes: JSON.stringify(selectedTypes), // 保存类型选择
            filterCollapsed: true // 折叠筛选条件
        };
        
        // 保存过滤器到localStorage
        localStorage.setItem('statisticFilter', JSON.stringify(statisticFilter));
        
        // 添加URL参数 - 不设置日期范围
        statisticUrl.searchParams.append('project_id', projectId);
        statisticUrl.searchParams.append('employee_id', employeeId);
        statisticUrl.searchParams.append('employee_name', employeeName);
        statisticUrl.searchParams.append('employee_code', employeeCode);
        statisticUrl.searchParams.append('record_type', recordType);
        
        // 跳转到统计页面
        window.location.href = statisticUrl.href;
    }
    
    // 渲染未结数据
    renderUnsettledData(data) {
        const cardsContainer = document.querySelector('.cards-container');
        const totalElement = document.querySelector('.total-amount');
        const workTypeOptions = document.querySelectorAll('.work-type-option');
        
        if (cardsContainer) {
            // 清空现有卡片（取消示例数据）
            cardsContainer.innerHTML = '';
            
            // 获取当前选中的标签
            const activeTab = document.querySelector('.work-type-option.active');
            const isUnsettledTab = activeTab && activeTab.textContent.includes('未结');
            
            // 根据选中的标签过滤数据
            let filteredData = [];
            if (isUnsettledTab) {
                // 未结标签：显示状态不为"结清"的员工
                filteredData = data.filter(item => item.status !== '结清');
            } else {
                // 已结标签：显示状态为"结清"的员工
                filteredData = data.filter(item => item.status === '结清');
            }
            
            // 计算总未结金额（所有员工的未结金额总和，无论状态如何）
            const totalUnsettled = data.reduce((sum, item) => sum + item.unsettled, 0);
            
            // 更新总未结金额
            if (totalElement) {
                totalElement.textContent = this.formatAmount(totalUnsettled);
                totalElement.dataset.originalValue = totalElement.textContent;
            }
            
            // 更新未结和已结标签的数量
            const unsettledCount = data.filter(item => item.status !== '结清').length;
            const settledCount = data.filter(item => item.status === '结清').length;
            
            if (workTypeOptions.length >= 2) {
                workTypeOptions[0].textContent = `未结 (${unsettledCount})`;
                workTypeOptions[1].textContent = `已结 (${settledCount})`;
            }
            
            // 渲染员工卡片
            filteredData.forEach(item => {
                const card = document.createElement('div');
                // 根据当前标签添加不同的类
                card.className = `card ${isUnsettledTab ? '' : 'settled'}`;
                
                // 使用工号作为头像
                const avatarText = item.emp_code;
                
                // 根据当前标签渲染不同的卡片内容
                let cardHTML = '';
                if (isUnsettledTab) {
                    // 未结标签：显示员工姓名和未结金额
                    cardHTML = `
                        <div class="card-content">
                            <div class="avatar">${avatarText}</div>
                            <div class="name">${item.emp_name}</div>
                        </div>
                        <div class="amount-arrow-container">
                            <div class="amount ${item.unsettled < 0 ? 'negative' : ''}" data-original-value="${this.formatAmount(item.unsettled)}">${this.formatAmount(item.unsettled)}</div>
                            <div class="arrow">></div>
                        </div>
                    `;
                } else {
                    // 已结标签：显示员工姓名和日期范围，取消未结金额显示
                    const dateRangeText = `${item.dateRange.earliestDate}~${item.dateRange.latestDate}`;
                    cardHTML = `
                        <div class="card-content">
                            <div class="avatar">${avatarText}</div>
                            <div>
                                <div class="name">${item.emp_name}</div>
                                <div style="font-size: 14px; color: #666; margin-top: 2px;">${dateRangeText}</div>
                            </div>
                        </div>
                        <div class="amount-arrow-container">
                            <div class="arrow">></div>
                        </div>
                    `;
                }
                
                card.innerHTML = cardHTML;
                
                // 添加点击事件
                card.addEventListener('click', () => {
                    // 显示侧边栏
                    this.showEmployeeDetails(item);
                });
                
                cardsContainer.appendChild(card);
            });
        }
    }
}

// 页面加载完成后初始化未结页面功能
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.unsettledPage = new UnsettledPage();
    });
} else {
    window.unsettledPage = new UnsettledPage();
}
