// 统计功能封装
class WorkerStatistic {
    constructor() {
        this.container = document.querySelector('.container');
        this.statContainer = null;
        this.loading = false; // 加载状态锁
        this.loadTimeout = null; // 防抖超时ID
        this.currentViewType = 'worker'; // 当前视图类型，默认工人视图
        this.cachedData = null; // 缓存已加载的数据

        // 延迟初始化,等待DOM加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            // DOM已经加载完成,直接初始化
            this.init();
        }
    }

    // 格式化金额显示
    formatAmount(amount) {
        const num = parseFloat(amount);
        if (Number.isInteger(num)) {
            return `${num}元`;
        } else {
            return `${num.toFixed(2)}元`;
        }
    }
    
    // 初始化
    init() {
        // 先恢复筛选条件
        this.restoreFilterCondition();

        // 创建统计结果容器
        this.createStatContainer();
        // 注意：工人/合计/明细标签的点击事件已经在HTML中绑定，不需要在这里重复绑定
        // 绑定筛选条件变化事件
        try {
            this.bindFilterEvents();
        } catch (error) {
            console.log('测试环境：未找到筛选条件，跳过事件绑定');
        }
        // 暴露全局变量访问
        this.exposeGlobalVariables();

        // 保存实例到全局，方便外部访问
        window.workerStatistic = this;

        // 测试环境下跳过数据加载
        if (window.location.pathname.includes('test')) {
            console.log('测试环境：跳过数据加载');
            return;
        }

        // 等待项目信息加载完成后初始化数据
        this.waitForProjectInfoAndLoadData();
    }

    // 恢复筛选条件
    restoreFilterCondition() {
        const savedFilter = localStorage.getItem('statisticFilter');
        if (!savedFilter) {
            return;
        }

        try {
            const filter = JSON.parse(savedFilter);

            // 恢复项目ID和名称到localStorage
            if (filter.projectId) {
                localStorage.setItem('currentProjectId', filter.projectId);
            }
            if (filter.projectName) {
                localStorage.setItem('currentProjectName', filter.projectName);
            }
            // 注意：不直接设置select元素的value，因为它的value应该是project_id，而不是project_name
            // 项目选择框的选项会在页面加载时通过其他逻辑动态生成和选中

            // 恢复日期
            if (filter.workDate !== undefined) {
                const workDateInput = document.getElementById('workDate');
                if (workDateInput) {
                    workDateInput.value = filter.workDate;
                    if (filter.workDateDisplay) {
                        workDateInput.dataset.displayValue = filter.workDateDisplay;
                    }
                    if (filter.workDateSelectAll) {
                        workDateInput.dataset.selectAll = filter.workDateSelectAll;
                    }
                    // 不触发change事件,避免在切换到明细视图之前加载错误的数据
                    // 更新日期显示
                    if (window.updateDateDisplay) {
                        window.updateDateDisplay();
                    }
                }
            }

            // 恢复员工选择
            if (filter.selectedEmployees) {
                localStorage.setItem('selectedEmployees', filter.selectedEmployees);

                // 更新员工按钮显示
                try {
                    const selectedEmployees = JSON.parse(filter.selectedEmployees);
                    if (selectedEmployees && selectedEmployees.length > 0) {
                        const employeeListBtn = document.getElementById('employeeListBtn');
                        const employeeClearBtn = document.getElementById('employeeClearBtn');
                        if (employeeListBtn) {
                            const employeeNames = selectedEmployees.map(emp => emp.name);
                            let displayText;
                            if (employeeNames.length <= 2) {
                                displayText = `${employeeNames.join(' | ')} | 共${selectedEmployees.length}人`;
                            } else {
                                displayText = `${employeeNames[0]} | ${employeeNames[1]} | ... | 共${selectedEmployees.length}人`;
                            }
                            employeeListBtn.textContent = displayText;
                            if (employeeClearBtn) {
                                employeeClearBtn.style.display = 'inline-block';
                            }
                        }
                    }
                } catch (e) {
                    console.error('更新员工按钮显示失败:', e);
                }
            }

            // 恢复类型选择
            if (filter.selectedTypes) {
                localStorage.setItem('selectedTypes', filter.selectedTypes);
                if (window.selectedTypes) {
                    window.selectedTypes = JSON.parse(filter.selectedTypes);
                }

                // 更新类型按钮显示
                try {
                    const selectedTypes = JSON.parse(filter.selectedTypes);
                    if (window.formatTypeDisplay) {
                        window.formatTypeDisplay(selectedTypes);
                    }
                } catch (e) {
                    console.error('更新类型按钮显示失败:', e);
                }
            }

            // 如果需要进入明细视图
            if (filter.activeTab === 'detail') {
                this.currentViewType = 'detail';

                // 切换到明细标签
                const detailOption = document.getElementById('detailOption');
                if (detailOption) {
                    detailOption.style.display = 'block';

                    // 移除所有标签的active类
                    const workTypeOptions = document.querySelectorAll('.work-type-option');
                    if (workTypeOptions.length > 0) {
                        workTypeOptions.forEach(opt => {
                            opt.classList.remove('active');
                        });

                        // 为明细标签添加active类
                        detailOption.classList.add('active');
                    }
                }

                // 立即切换到明细视图
                setTimeout(() => {
                    this.switchView('detail');

                    // 在切换到明细视图后,手动加载流水记录
                    setTimeout(() => {
                        try {
                            const savedEmployees = localStorage.getItem('selectedEmployees');
                            if (savedEmployees) {
                                const selectedEmployees = JSON.parse(savedEmployees);
                                if (selectedEmployees && selectedEmployees.length > 0) {
                                    // 检查WorkerCardClickHandler是否已初始化
                                    if (window.workerCardClickHandler) {
                                        if (selectedEmployees.length === 1) {
                                            // 如果只有一名员工，使用原来的方法
                                            const employee = selectedEmployees[0];
                                            if (employee.id && employee.name && employee.empCode) {
                                                window.workerCardClickHandler.showEmployeeFlowRecords(employee.id, employee.name, employee.empCode);
                                            }
                                        } else {
                                            // 如果有多名员工，使用新的方法
                                            window.workerCardClickHandler.showMultipleEmployeesFlowRecords(selectedEmployees);
                                        }
                                    } else if (window.WorkerCardClickHandler) {
                                        // 如果还未初始化，创建实例并调用方法
                                        const handler = new window.WorkerCardClickHandler(this);
                                        window.workerCardClickHandler = handler;
                                        if (selectedEmployees.length === 1) {
                                            // 如果只有一名员工，使用原来的方法
                                            const employee = selectedEmployees[0];
                                            if (employee.id && employee.name && employee.empCode) {
                                                handler.showEmployeeFlowRecords(employee.id, employee.name, employee.empCode);
                                            }
                                        } else {
                                            // 如果有多名员工，使用新的方法
                                            handler.showMultipleEmployeesFlowRecords(selectedEmployees);
                                        }
                                    }
                                } else {
                                    // 如果没有选中员工，默认获取所有员工的记录
                                    if (window.workerCardClickHandler) {
                                        window.workerCardClickHandler.showAllEmployeesFlowRecords();
                                    } else if (window.WorkerCardClickHandler) {
                                        // 如果还未初始化，创建实例并调用方法
                                        const handler = new window.WorkerCardClickHandler(this);
                                        window.workerCardClickHandler = handler;
                                        handler.showAllEmployeesFlowRecords();
                                    }
                                }
                            } else {
                                // 如果localStorage中没有保存的员工选择，默认获取所有员工的记录
                                if (window.workerCardClickHandler) {
                                    window.workerCardClickHandler.showAllEmployeesFlowRecords();
                                } else if (window.WorkerCardClickHandler) {
                                    // 如果还未初始化，创建实例并调用方法
                                    const handler = new window.WorkerCardClickHandler(this);
                                    window.workerCardClickHandler = handler;
                                    handler.showAllEmployeesFlowRecords();
                                }
                            }
                        } catch (error) {
                            console.error('加载流水记录失败:', error);
                        }
                    }, 200); // 增加延迟,确保switchView完成
                }, 0);

                // 恢复折叠状态
                if (filter.filterCollapsed) {
                    const filterToggleBtn = document.getElementById('filterToggleBtn');
                    const filterStickyContainer = document.querySelector('.filter-sticky-container');
                    if (filterToggleBtn && filterStickyContainer) {
                        filterStickyContainer.classList.add('filter-collapsed');
                        filterToggleBtn.classList.remove('rotated');
                    }
                }

                // 更新首页标题为"统计"
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'updateTitle',
                        page: '统计.html'
                    }, window.location.origin);
                }
            }

            // 清除保存的筛选条件
            localStorage.removeItem('statisticFilter');
        } catch (error) {
            console.error('恢复筛选条件失败:', error);
        }
    }
    
    // 防抖加载统计数据
    debouncedLoadStatisticData(viewType = null) {
        // 使用保存的视图类型，如果没有指定则使用当前视图
        const actualViewType = viewType !== null ? viewType : this.currentViewType;
        
        // 清除之前的超时
        if (this.loadTimeout) {
            clearTimeout(this.loadTimeout);
        }
        
        // 设置新的超时
        this.loadTimeout = setTimeout(() => {
            this.loadStatisticData(actualViewType);
        }, 300);
    }

    // 等待项目信息加载完成后初始化数据
    waitForProjectInfoAndLoadData() {
        // 监听项目信息变化
        this.observeProjectInfoChanges();

        // 检查是否需要直接进入明细视图
        const savedFilter = localStorage.getItem('statisticFilter');
        if (savedFilter) {
            try {
                const filter = JSON.parse(savedFilter);
                // 如果保存的状态是明细视图,则不加载统计数据,等待外部调用switchView
                if (filter.activeTab === 'detail') {
                    console.log('检测到需要直接进入明细视图,跳过统计数据加载');
                    return;
                }
            } catch (error) {
                console.error('解析statisticFilter失败:', error);
            }
        }

        // 检查当前视图类型或当前选中的标签，如果是明细视图，不加载统计数据
        const activeTab = document.querySelector('.work-type-option.active');
        const isDetailTab = activeTab && activeTab.id === 'detailOption';
        if (this.currentViewType === 'detail' || isDetailTab) {
            return;
        }

        // 只执行一次初始化加载
        this.loadStatisticData();
    }

    // 监听项目信息变化
    observeProjectInfoChanges() {
        // 辅助函数：根据当前选中的标签执行相应的操作
        const handleProjectChange = () => {
            setTimeout(() => {
                // 检查当前选中的标签
                const activeTab = document.querySelector('.work-type-option.active');
                const isDetailTab = activeTab && activeTab.id === 'detailOption';
                
                if (isDetailTab) {
                    // 如果是明细标签，重新加载流水记录
                    try {
                        const savedEmployees = localStorage.getItem('selectedEmployees');
                        if (savedEmployees) {
                            const selectedEmployees = JSON.parse(savedEmployees);
                            if (selectedEmployees && selectedEmployees.length > 0) {
                                // 检查WorkerCardClickHandler是否已初始化
                                if (window.workerCardClickHandler) {
                                    if (selectedEmployees.length === 1) {
                                        // 如果只有一名员工，使用原来的方法
                                        const employee = selectedEmployees[0];
                                        if (employee.id && employee.name && employee.empCode) {
                                            window.workerCardClickHandler.showEmployeeFlowRecords(employee.id, employee.name, employee.empCode);
                                        }
                                    } else {
                                        // 如果有多名员工，使用新的方法
                                        window.workerCardClickHandler.showMultipleEmployeesFlowRecords(selectedEmployees);
                                    }
                                } else if (window.WorkerCardClickHandler) {
                                    // 如果还未初始化，创建实例并调用方法
                                    const handler = new window.WorkerCardClickHandler(this);
                                    window.workerCardClickHandler = handler;
                                    if (selectedEmployees.length === 1) {
                                        // 如果只有一名员工，使用原来的方法
                                        const employee = selectedEmployees[0];
                                        if (employee.id && employee.name && employee.empCode) {
                                            handler.showEmployeeFlowRecords(employee.id, employee.name, employee.empCode);
                                        }
                                    } else {
                                        // 如果有多名员工，使用新的方法
                                        handler.showMultipleEmployeesFlowRecords(selectedEmployees);
                                    }
                                }
                            } else {
                                // 如果没有选中员工，默认获取所有员工的记录
                                if (window.workerCardClickHandler) {
                                    window.workerCardClickHandler.showAllEmployeesFlowRecords();
                                } else if (window.WorkerCardClickHandler) {
                                    // 如果还未初始化，创建实例并调用方法
                                    const handler = new window.WorkerCardClickHandler(this);
                                    window.workerCardClickHandler = handler;
                                    handler.showAllEmployeesFlowRecords();
                                }
                            }
                        } else {
                            // 如果localStorage中没有保存的员工选择，默认获取所有员工的记录
                            if (window.workerCardClickHandler) {
                                window.workerCardClickHandler.showAllEmployeesFlowRecords();
                            } else if (window.WorkerCardClickHandler) {
                                // 如果还未初始化，创建实例并调用方法
                                const handler = new window.WorkerCardClickHandler(this);
                                window.workerCardClickHandler = handler;
                                handler.showAllEmployeesFlowRecords();
                            }
                        }
                    } catch (error) {
                        console.error('重新加载流水记录失败:', error);
                    }
                } else {
                    // 如果是工人或合计标签，重新加载统计数据
                    this.debouncedLoadStatisticData();
                }
            }, 100);
        };

        // 监听URL变化
        window.addEventListener('popstate', () => {
            handleProjectChange();
        });
        
        // 监听localStorage变化
        window.addEventListener('storage', (e) => {
            if (e.key === 'currentProjectId' || e.key === 'currentProjectName') {
                handleProjectChange();
            }
        });
        
        // 监听项目名称输入框变化
        const projectNameInput = document.getElementById('projectName');
        if (projectNameInput) {
            projectNameInput.addEventListener('input', () => {
                handleProjectChange();
            });
        }
    }

    // 绑定筛选条件变化事件
    bindFilterEvents() {
        // 辅助函数：根据当前选中的标签执行相应的操作
        const handleFilterChange = () => {
            setTimeout(() => {
                // 检查当前选中的标签
                const activeTab = document.querySelector('.work-type-option.active');
                const isDetailTab = activeTab && activeTab.id === 'detailOption';
                
                if (isDetailTab) {
                    // 如果是明细标签，重新加载流水记录
                    try {
                        const savedEmployees = localStorage.getItem('selectedEmployees');
                        if (savedEmployees) {
                            const selectedEmployees = JSON.parse(savedEmployees);
                            if (selectedEmployees && selectedEmployees.length > 0) {
                                // 检查WorkerCardClickHandler是否已初始化
                                if (window.workerCardClickHandler) {
                                    if (selectedEmployees.length === 1) {
                                        // 如果只有一名员工，使用原来的方法
                                        const employee = selectedEmployees[0];
                                        if (employee.id && employee.name && employee.empCode) {
                                            window.workerCardClickHandler.showEmployeeFlowRecords(employee.id, employee.name, employee.empCode);
                                        }
                                    } else {
                                        // 如果有多名员工，使用新的方法
                                        window.workerCardClickHandler.showMultipleEmployeesFlowRecords(selectedEmployees);
                                    }
                                } else if (window.WorkerCardClickHandler) {
                                    // 如果还未初始化，创建实例并调用方法
                                    const handler = new window.WorkerCardClickHandler(this);
                                    window.workerCardClickHandler = handler;
                                    if (selectedEmployees.length === 1) {
                                        // 如果只有一名员工，使用原来的方法
                                        const employee = selectedEmployees[0];
                                        if (employee.id && employee.name && employee.empCode) {
                                            handler.showEmployeeFlowRecords(employee.id, employee.name, employee.empCode);
                                        }
                                    } else {
                                        // 如果有多名员工，使用新的方法
                                        handler.showMultipleEmployeesFlowRecords(selectedEmployees);
                                    }
                                }
                            } else {
                                // 如果没有选中员工，默认获取所有员工的记录
                                if (window.workerCardClickHandler) {
                                    window.workerCardClickHandler.showAllEmployeesFlowRecords();
                                } else if (window.WorkerCardClickHandler) {
                                    // 如果还未初始化，创建实例并调用方法
                                    const handler = new window.WorkerCardClickHandler(this);
                                    window.workerCardClickHandler = handler;
                                    handler.showAllEmployeesFlowRecords();
                                }
                            }
                        } else {
                            // 如果localStorage中没有保存的员工选择，默认获取所有员工的记录
                            if (window.workerCardClickHandler) {
                                window.workerCardClickHandler.showAllEmployeesFlowRecords();
                            } else if (window.WorkerCardClickHandler) {
                                // 如果还未初始化，创建实例并调用方法
                                const handler = new window.WorkerCardClickHandler(this);
                                window.workerCardClickHandler = handler;
                                handler.showAllEmployeesFlowRecords();
                            }
                        }
                    } catch (error) {
                        console.error('重新加载流水记录失败:', error);
                    }
                } else {
                    // 如果是工人或合计标签，重新加载统计数据
                    this.debouncedLoadStatisticData();
                }
            }, 100);
        };

        
        // 日期变化事件
        const workDateInput = document.getElementById('workDate');
        if (workDateInput) {
            // 只监听change事件，避免重复触发
            workDateInput.addEventListener('change', () => {
                handleFilterChange();
            });
            
            // 监听dataset变化（用于日期范围选择）
            let lastDatasetValue = workDateInput.dataset.displayValue;
            const observer = new MutationObserver(() => {
                const currentDatasetValue = workDateInput.dataset.displayValue;
                if (currentDatasetValue !== lastDatasetValue) {
                    lastDatasetValue = currentDatasetValue;
                    handleFilterChange();
                }
            });
            observer.observe(workDateInput, { attributes: true });
        }
        
        // 员工选择变化事件
        const confirmEmployeeSelection = document.getElementById('confirmEmployeeSelection');
        if (confirmEmployeeSelection) {
            confirmEmployeeSelection.addEventListener('click', handleFilterChange);
        }
        
        // 员工全选事件
        const selectAllEmployees = document.getElementById('selectAllEmployees');
        if (selectAllEmployees) {
            selectAllEmployees.addEventListener('click', handleFilterChange);
        }
        
        // 员工重置事件
        const resetEmployeeSelection = document.getElementById('resetEmployeeSelection');
        if (resetEmployeeSelection) {
            resetEmployeeSelection.addEventListener('click', handleFilterChange);
        }
        
        // 类型选择变化事件
        const confirmTypeSelection = document.getElementById('confirmTypeSelection');
        if (confirmTypeSelection) {
            confirmTypeSelection.addEventListener('click', handleFilterChange);
        }
        
        // 类型重置事件
        const resetTypeSelection = document.getElementById('resetTypeSelection');
        if (resetTypeSelection) {
            resetTypeSelection.addEventListener('click', handleFilterChange);
        }
        
        // 清除类型事件
        const typeClearBtn = document.getElementById('typeClearBtn');
        if (typeClearBtn) {
            typeClearBtn.addEventListener('click', handleFilterChange);
        }
        
        // 清除员工事件
        const employeeClearBtn = document.getElementById('employeeClearBtn');
        if (employeeClearBtn) {
            employeeClearBtn.addEventListener('click', handleFilterChange);
        }
        
        // 员工模态框关闭按钮事件
        const closeEmployeeListModal = document.getElementById('closeEmployeeListModal');
        if (closeEmployeeListModal) {
            closeEmployeeListModal.addEventListener('click', handleFilterChange);
        }
        
        // 类型模态框关闭按钮事件
        const closeTypeListModal = document.getElementById('closeTypeListModal');
        if (closeTypeListModal) {
            closeTypeListModal.addEventListener('click', handleFilterChange);
        }
        
        // 工人/合计标签切换事件
        const workerOption = document.getElementById('workerOption');
        const totalOption = document.getElementById('totalOption');
        if (workerOption && totalOption) {
            workerOption.addEventListener('click', () => {

                this.switchView('worker');
            });
            
            totalOption.addEventListener('click', () => {

                this.switchView('total');
            });
        }
    }

    // 暴露全局变量访问
    exposeGlobalVariables() {
        // 移除可能导致无限递归的getter/setter
        try {
            // 确保页面原有的selectedTypes变量可以被访问
            if (typeof selectedTypes !== 'undefined') {
                // 直接赋值，不使用getter/setter
                window.selectedTypes = selectedTypes;
            }
            
            // 确保页面原有的selectedEmployees变量可以被访问
            if (typeof selectedEmployees !== 'undefined') {
                // 直接赋值，不使用getter/setter
                window.selectedEmployees = selectedEmployees;
            }
        } catch (error) {
            console.error('暴露全局变量失败:', error);
        }
    }

    // 创建统计结果容器
    createStatContainer() {
        // 测试环境下使用已有的statContainer元素
        if (!this.container) {
            const testContainer = document.getElementById('statContainer');
            if (testContainer) {
                this.statContainer = testContainer;
                return;
            }
        }
        
        // 正常环境下使用已有的statisticResults元素
        const existingContainer = document.getElementById('statisticResults');
        if (existingContainer) {
            this.statContainer = existingContainer;
        } else {
            // 如果没有找到，才创建新的
            this.statContainer = document.createElement('div');
            this.statContainer.id = 'statisticResults';
            this.statContainer.style.cssText = `
                padding: 20px;
                background-color: #fafafa;
                border-radius: 8px;
                margin-top: 20px;
            `;
            this.container.appendChild(this.statContainer);
        }
    }
    


    // 绑定工人/合计标签切换事件（已移除，事件在HTML中处理）
    // bindWorkTypeEvents() {
    //     const workTypeOptions = document.querySelectorAll('.work-type-option');
    //     workTypeOptions.forEach(option => {
    //         option.addEventListener('click', (e) => {
    //             const type = e.target.id === 'workerOption' ? 'worker' :
    //                          e.target.id === 'detailOption' ? 'detail' : 'total';
    //             this.switchView(type);
    //         });
    //     });
    // }

    // 切换工人/合计/明细视图
    switchView(type) {
        // 保存当前视图类型
        this.currentViewType = type;

        // 更新父窗口标题
        if (window.parent && window.parent !== window) {
            let pageTitle = '统计.html';
            if (type === 'detail') {
                pageTitle = '流水明细';
            }
            window.parent.postMessage({
                type: 'updateTitle',
                page: pageTitle
            }, window.location.origin);
        }

        // 切换到工人或合计视图时，展开筛选条件
        if (type === 'worker' || type === 'total') {
            this.expandFilterConditions();
        }

        if (type === 'detail') {
            // 切换到明细视图
            this.renderDetailView();

            // 检查是否有保存的员工选择，如果有，自动加载流水记录
            // 立即执行加载,不使用setTimeout,避免先显示加载提示
            try {
                const savedEmployees = localStorage.getItem('selectedEmployees');
                if (savedEmployees) {
                    const selectedEmployees = JSON.parse(savedEmployees);
                    if (selectedEmployees && selectedEmployees.length > 0) {
                        // 检查WorkerCardClickHandler是否已初始化
                        if (window.workerCardClickHandler) {
                            if (selectedEmployees.length === 1) {
                                // 如果只有一名员工，使用原来的方法
                                const employee = selectedEmployees[0];
                                if (employee.id && employee.name && employee.empCode) {
                                    window.workerCardClickHandler.showEmployeeFlowRecords(employee.id, employee.name, employee.empCode);
                                }
                            } else {
                                // 如果有多名员工，使用新的方法
                                window.workerCardClickHandler.showMultipleEmployeesFlowRecords(selectedEmployees);
                            }
                        } else if (window.WorkerCardClickHandler) {
                            // 如果还未初始化，创建实例并调用方法
                            const handler = new window.WorkerCardClickHandler(this);
                            window.workerCardClickHandler = handler;
                            if (selectedEmployees.length === 1) {
                                // 如果只有一名员工，使用原来的方法
                                const employee = selectedEmployees[0];
                                if (employee.id && employee.name && employee.empCode) {
                                    handler.showEmployeeFlowRecords(employee.id, employee.name, employee.empCode);
                                }
                            } else {
                                // 如果有多名员工，使用新的方法
                                handler.showMultipleEmployeesFlowRecords(selectedEmployees);
                            }
                        }
                    } else {
                        // 如果没有选中员工，默认获取所有员工的记录
                        if (window.workerCardClickHandler) {
                            window.workerCardClickHandler.showAllEmployeesFlowRecords();
                        } else if (window.WorkerCardClickHandler) {
                            // 如果还未初始化，创建实例并调用方法
                            const handler = new window.WorkerCardClickHandler(this);
                            window.workerCardClickHandler = handler;
                            handler.showAllEmployeesFlowRecords();
                        }
                    }
                } else {
                    // 如果localStorage中没有保存的员工选择，默认获取所有员工的记录
                    if (window.workerCardClickHandler) {
                        window.workerCardClickHandler.showAllEmployeesFlowRecords();
                    } else if (window.WorkerCardClickHandler) {
                        // 如果还未初始化，创建实例并调用方法
                        const handler = new window.WorkerCardClickHandler(this);
                        window.workerCardClickHandler = handler;
                        handler.showAllEmployeesFlowRecords();
                    }
                }
            } catch (error) {
                console.error('自动加载流水记录失败:', error);
            }
            return;
        }

        // 如果切换到工人视图，清空界面并显示加载提示
        if (type === 'worker') {
            this.showLoadingState();
        }

        // 如果切换到合计视图，且有缓存数据，直接使用缓存数据进行合计计算
        if (type === 'total' && this.cachedData) {
            this.renderTotalView(this.cachedData);
            return;
        }

        // 如果切换到合计视图，但正在加载数据，显示加载提示并等待加载完成
        if (type === 'total' && this.loading) {
            this.showLoadingState();
            return;
        }

        // 否则加载统计数据
        this.debouncedLoadStatisticData(type);
    }

    // 展开筛选条件
    expandFilterConditions() {
        const filterToggleBtn = document.getElementById('filterToggleBtn');
        const filterStickyContainer = document.querySelector('.filter-sticky-container');
        if (filterToggleBtn && filterStickyContainer) {
            // 移除折叠状态
            filterStickyContainer.classList.remove('filter-collapsed');
            // 添加旋转状态(▼朝上,表示展开)
            filterToggleBtn.classList.add('rotated');
        }
    }

    // 显示加载状态
    showLoadingState() {
        const container = document.getElementById('statisticResults');
        if (container) {
            container.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">正在加载数据...</div>';
        }
    }
    
    // 渲染明细视图
    renderDetailView() {
        // 检查明细标签是否可见
        const detailOption = document.getElementById('detailOption');
        if (detailOption && detailOption.style.display === 'none') {
            return;
        }

        // 确保明细视图的容器存在
        const container = document.getElementById('statisticResults');
        if (container) {
            // 清空容器内容，移除之前工人或合计视图的内容
            container.innerHTML = '';

            // 创建明细视图容器
            const detailContainer = document.createElement('div');
            detailContainer.id = 'detailViewContainer';
            detailContainer.className = 'detail-view-container';

            // 检查是否有保存的员工选择,如果有则显示加载提示,否则显示默认提示
            const savedEmployees = localStorage.getItem('selectedEmployees');
            if (savedEmployees) {
                try {
                    const selectedEmployees = JSON.parse(savedEmployees);
                    if (selectedEmployees && selectedEmployees.length > 0) {
                        // 有保存的员工选择,显示加载提示
                        detailContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">正在加载流水记录...</div>';
                    } else {
                        // 没有保存的员工选择,显示默认提示
                        detailContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">请点击工人卡片查看明细记录</div>';
                    }
                } catch (error) {
                    console.error('解析selectedEmployees失败:', error);
                    detailContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">请点击工人卡片查看明细记录</div>';
                }
            } else {
                // 没有保存的员工选择,显示默认提示
                detailContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">请点击工人卡片查看明细记录</div>';
            }

            container.appendChild(detailContainer);

        }
    }

    // 加载统计数据
    async loadStatisticData(viewType = 'worker') {
        // 检查当前选中的标签，如果是明细标签，不加载统计数据
        const activeTab = document.querySelector('.work-type-option.active');
        const isDetailTab = activeTab && activeTab.id === 'detailOption';
        
        // 如果当前视图类型是明细，或传入的参数是明细，或当前选中的标签是明细，不加载数据
        if (this.currentViewType === 'detail' || viewType === 'detail' || isDetailTab) {
            return;
        }

        // 检查localStorage中是否有statisticFilter数据，如果有，并且activeTab是'detail'，就不加载数据
        const savedFilter = localStorage.getItem('statisticFilter');
        if (savedFilter) {
            try {
                const filter = JSON.parse(savedFilter);
                if (filter.activeTab === 'detail') {
                    return;
                }
            } catch (error) {
                console.error('解析statisticFilter失败:', error);
            }
        }

        // 检查是否正在加载，避免并发执行
        if (this.loading) {
            return;
        }

        try {
            // 设置加载状态
            this.loading = true;

            // 获取筛选条件
            const filters = this.getFilters();

            // 获取考勤数据
            const attendanceData = await this.getAttendanceData(filters);
            // 获取结算数据
            const settlementData = await this.getSettlementData(filters);

            // 合并数据
            const mergedData = this.mergeData(attendanceData, settlementData);

            // 缓存合并后的数据，供合计视图使用
            this.cachedData = mergedData;

            // 根据当前视图类型渲染统计结果
            if (this.currentViewType === 'total') {
                this.renderTotalView(mergedData);
            } else {
                this.renderStatisticResults(mergedData, viewType);
            }
        } catch (error) {
            console.error('加载统计数据失败:', error);
            this.statContainer.innerHTML = '<div style="color: red; text-align: center; padding: 20px;">加载统计数据失败：' + error.message + '</div>';
        } finally {
            // 重置加载状态
            this.loading = false;
        }
    }

    // 获取筛选条件
    getFilters() {
        // 获取项目ID（从localStorage获取）
        const projectId = localStorage.getItem('currentProjectId') || '';
        
        // 获取日期
        const workDateInput = document.getElementById('workDate');
        let dateFilter = {
            isAll: false,
            singleDate: null,
            dateRange: null
        };
        
        // 检查日期输入框是否显示为"全部"
        const displayValue = workDateInput.dataset.displayValue || workDateInput.value;
        if (displayValue === '全部') {
            dateFilter.isAll = true;
        } else if (displayValue.includes('~')) {
            // 处理日期范围，支持"2025-6-1~2025-7-31"和"2025-06-01 ~ 2025-07-31"两种格式
            const range = displayValue.split(/\s*~\s*/);
            dateFilter.dateRange = range;
            dateFilter.isAll = false;
        } else if (displayValue && displayValue !== '请选择日期') {
            // 单个日期
            dateFilter.singleDate = displayValue;
            dateFilter.isAll = false;
        } else {
            // 默认查询所有日期
            dateFilter.isAll = true;
        }
        
        // 获取选中的类型（优先从全局变量获取，兼容localStorage）
        let selectedTypes = [];
        try {
            // 优先使用全局变量
            if (window.selectedTypes && Array.isArray(window.selectedTypes)) {
                selectedTypes = window.selectedTypes;
            } else {
                // 从localStorage获取
                const savedTypes = localStorage.getItem('selectedTypes');
                if (savedTypes) {
                    selectedTypes = JSON.parse(savedTypes);
                }
            }
        } catch (error) {
            console.error('读取选中类型失败:', error);
            selectedTypes = [];
        }
        // 如果类型未选择，默认统计所有类型
        
        // 获取选中的员工（从localStorage获取，只保留employee_id）
        let selectedEmployees = [];
        try {
            const savedSelected = localStorage.getItem('selectedEmployees');
            if (savedSelected) {
                const parsedEmployees = JSON.parse(savedSelected);
                // 只保留employee_id，转换为简单的ID数组
                selectedEmployees = parsedEmployees.map(emp => {
                    // 兼容不同的ID字段名
                    return emp.id || emp.employee_id || emp.employeeId;
                }).filter(id => id); // 过滤掉空值
            }
        } catch (error) {
            console.error('读取选中员工失败:', error);
        }
        
        // 如果员工未选择，默认统计所有员工
        
        return {
            projectId,
            dateFilter,
            selectedTypes,
            selectedEmployees
        };
    }

    // 获取考勤数据（从本地存储获取）
    async getAttendanceData(filters) {
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
            const projectId = filters.projectId;
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
            
            // 从本地存储获取项目数据
            let projectsData = [];
            if (window.ProjectSyncService && window.ProjectSyncService.getLocalProjectsData) {
                projectsData = window.ProjectSyncService.getLocalProjectsData();
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
                const cacheKey = 'project_cache_' + userId;
                const cachedData = localStorage.getItem(cacheKey);
                if (cachedData) {
                    projectsData = JSON.parse(cachedData);
                }
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
            
            // 应用筛选条件
            let filteredData = mergedData;
            
            // 项目过滤
            if (filters.projectId) {
                filteredData = filteredData.filter(record => record.project_id === filters.projectId);
            }
            
            // 类型过滤
            if (filters.selectedTypes.length > 0) {
                filteredData = filteredData.filter(record => filters.selectedTypes.includes(record.work_type));
            }
            
            // 员工过滤
            if (filters.selectedEmployees.length > 0) {
                filteredData = filteredData.filter(record => filters.selectedEmployees.includes(record.employee_id));
            }
            
            // 日期过滤
            if (!filters.dateFilter.isAll) {
                if (filters.dateFilter.dateRange) {
                    // 日期范围
                    const [startDate, endDate] = filters.dateFilter.dateRange;
                    filteredData = filteredData.filter(record => {
                        const recordDate = record.record_date;
                        return recordDate >= startDate && recordDate <= endDate;
                    });
                } else if (filters.dateFilter.singleDate) {
                    // 单个日期
                    filteredData = filteredData.filter(record => record.record_date === filters.dateFilter.singleDate);
                }
            }
            
            // 处理查询结果，转换为统计所需格式
            return this.processAttendanceData(filteredData);
        } catch (error) {
            console.error('获取考勤数据失败:', error);
            return [];
        }
    }

    // 从localStorage获取考勤记录
    async getAttendanceRecordsFromLocalStorage(projectId) {
        return new Promise((resolve, reject) => {
            try {
                if (!projectId) {
                    resolve([]);
                    return;
                }
                
                // 从localStorage加载数据
                const localKey = `attendance_records_${projectId}`;
                const savedData = localStorage.getItem(localKey);
                
                let records = [];
                if (savedData) {
                    const parsedData = JSON.parse(savedData);
                    records = parsedData.attendance_records || parsedData || [];
                } else {
                    // 尝试直接获取所有考勤记录
                    const allRecords = localStorage.getItem('attendance_records');
                    if (allRecords) {
                        const parsedRecords = JSON.parse(allRecords);
                        records = Array.isArray(parsedRecords) ? parsedRecords : [];
                    }
                }
                
                resolve(records);
            } catch (error) {
                console.error('从localStorage获取考勤数据失败:', error);
                resolve([]);
            }
        });
    }

    // 从localStorage获取员工数据
    async getEmployeesFromLocalStorage(projectId) {
        return new Promise((resolve, reject) => {
            try {
                if (!projectId) {
                    resolve([]);
                    return;
                }
                
                // 从localStorage加载数据
                const localKey = `employees_${projectId}`;
                const savedData = localStorage.getItem(localKey);
                
                let employees = [];
                if (savedData) {
                    const parsedData = JSON.parse(savedData);
                    employees = parsedData.employees || [];
                }
                
                resolve(employees);
            } catch (error) {
                console.error('从localStorage获取员工数据失败:', error);
                resolve([]);
            }
        });
    }

    // 从localStorage获取项目数据
    async getProjectsFromLocalStorage() {
        return new Promise((resolve, reject) => {
            try {
                // 从localStorage加载数据
                const localKey = 'projects';
                const savedData = localStorage.getItem(localKey);
                
                let projects = [];
                if (savedData) {
                    const parsedData = JSON.parse(savedData);
                    projects = parsedData.projects || [];
                }
                
                resolve(projects);
            } catch (error) {
                console.error('从localStorage获取项目数据失败:', error);
                resolve([]);
            }
        });
    }

    // 合并考勤数据与员工和项目数据
    mergeAttendanceDataWithEmployeesAndProjects(attendanceRecords, employees, projects) {
        // 创建员工和项目的映射
        const employeeMap = {};
        employees.forEach(emp => {
            employeeMap[emp.employee_id] = emp;
        });
        
        const projectMap = {};
        projects.forEach(proj => {
            projectMap[proj.project_id] = proj;
        });
        
        // 合并数据
        return attendanceRecords.map(record => {
            const employee = employeeMap[record.employee_id] || {};
            const project = projectMap[employee.project_id] || {};
            
            return {
                ...record,
                employees: employee,
                projects: project
            };
        });
    }

    // 应用考勤数据筛选（只保留必要的前端过滤，主要过滤已在数据库层面完成）
    applyAttendanceFilters(data, filters) {
        // 数据库已完成主要过滤，直接返回数据
        return data;
    }


    // 应用结算数据筛选（只保留必要的前端过滤，主要过滤已在数据库层面完成）
    applySettlementFilters(data, filters) {
        // 数据库已完成主要过滤，直接返回数据
        return data;
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
                    emp_name: record.employees.emp_name,
                    emp_code: empCode,
                    labor_cost: record.employees.labor_cost,
                    正常工时单价: record.projects.regular_hours,
                    加班工时单价: record.projects.overtime_hours,
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

    // 获取结算数据（从本地存储获取）
    async getSettlementData(filters) {
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
            const projectId = filters.projectId;
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
            
            // 合并数据
            const mergedData = settlementData.map(record => {
                const employee = employeeMap[record.employee_id] || {};
                
                return {
                    ...record,
                    employees: employee
                };
            });
            
            // 应用筛选条件
            let filteredData = mergedData;
            
            // 项目过滤
            if (filters.projectId) {
                filteredData = filteredData.filter(record => record.project_id === filters.projectId);
            }
            
            // 类型过滤
            if (filters.selectedTypes.length > 0) {
                filteredData = filteredData.filter(record => filters.selectedTypes.includes(record.record_type));
            }
            
            // 员工过滤
            if (filters.selectedEmployees.length > 0) {
                filteredData = filteredData.filter(record => filters.selectedEmployees.includes(record.employee_id));
            }
            
            // 日期过滤
            if (!filters.dateFilter.isAll) {
                if (filters.dateFilter.dateRange) {
                    // 日期范围
                    const [startDate, endDate] = filters.dateFilter.dateRange;
                    filteredData = filteredData.filter(record => {
                        const recordDate = record.record_date;
                        return recordDate >= startDate && recordDate <= endDate;
                    });
                } else if (filters.dateFilter.singleDate) {
                    // 单个日期
                    filteredData = filteredData.filter(record => record.record_date === filters.dateFilter.singleDate);
                }
            }
            
            // 处理结算数据
            return this.processSettlementData(filteredData);
        } catch (error) {
            console.error('获取结算数据失败:', error);
            return [];
        }
    }

    // 从localStorage获取结算记录
    async getSettlementRecordsFromLocalStorage(projectId) {
        return new Promise((resolve, reject) => {
            try {
                if (!projectId) {
                    resolve([]);
                    return;
                }
                
                // 从localStorage加载数据
                const localKey = `settlement_records_${projectId}`;
                const savedData = localStorage.getItem(localKey);
                
                let records = [];
                if (savedData) {
                    const parsedData = JSON.parse(savedData);
                    records = parsedData.settlement_records || parsedData || [];
                } else {
                    // 尝试直接获取所有结算记录
                    const allRecords = localStorage.getItem('settlement_records');
                    if (allRecords) {
                        const parsedRecords = JSON.parse(allRecords);
                        records = Array.isArray(parsedRecords) ? parsedRecords : [];
                    }
                }
                
                resolve(records);
            } catch (error) {
                console.error('从localStorage获取结算数据失败:', error);
                resolve([]);
            }
        });
    }

    // 合并结算数据与员工数据
    mergeSettlementDataWithEmployees(settlementRecords, employees) {
        // 创建员工映射
        const employeeMap = {};
        employees.forEach(emp => {
            employeeMap[emp.employee_id] = emp;
        });
        
        // 合并数据
        return settlementRecords.map(record => {
            const employee = employeeMap[record.employee_id] || {};
            
            return {
                ...record,
                employees: employee
            };
        });
    }

    // 应用结算数据筛选（只保留必要的前端过滤，主要过滤已在数据库层面完成）
    applySettlementFilters(data, filters) {
        // 数据库已完成主要过滤，直接返回数据
        return data;
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
                    emp_name: record.employees.emp_name,
                    emp_code: empCode,
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

    // 合并考勤和结算数据
    mergeData(attendanceData, settlementData) {
        
        
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
            const attendanceItem = attendanceMap[empCode] || {
                emp_name: '未知员工',
                emp_code: empCode,
                labor_cost: 0,
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
            
            const settlementItem = settlementMap[empCode] || {
                借支金额: 0,
                扣款金额: 0,
                公司打款金额: 0,
                结算金额: 0
            };

            mergedData.push({
                ...attendanceItem,
                ...settlementItem
            });
        });

        // 按工号升序排序
        mergedData.sort((a, b) => a.emp_code.localeCompare(b.emp_code));

        
        return mergedData;
    }

    // 渲染统计结果
    renderStatisticResults(data, viewType) {
        if (viewType === 'total') {
            this.renderTotalView(data);
        } else {
            this.renderWorkerView(data);
        }
    }

    // 渲染工人视图
    renderWorkerView(data) {
        let html = '';
        
        if (data.length === 0) {
            // 显示空数据提示
            html = '<div style="text-align: center; color: #666; padding: 40px;">暂无统计数据</div>';
        } else {
            // 按工号升序排序（1~1000000）
            const sortedData = [...data].sort((a, b) => {
                const empCodeA = parseInt(a.emp_code) || 0;
                const empCodeB = parseInt(b.emp_code) || 0;
                return empCodeA - empCodeB;
            });
            
            sortedData.forEach(item => {
                // 计算总金额（上班工数四舍五入两位小数 + 加班工数四舍五入两位小数）× 工价，向下取整
                const roundedRegularWorkDays = parseFloat(item.点工上班工数.toFixed(2));
                const roundedOvertimeWorkDays = parseFloat(item.点工加班工数.toFixed(2));
                const totalWorkDays = roundedRegularWorkDays + roundedOvertimeWorkDays;
                const totalAmount = Math.floor(totalWorkDays * item.labor_cost);
                
                
                // 检查是否有点工数据
                let hasPointWork = false;
                if (item.点工上班小时 > 0 || item.点工上班工数 > 0 || item.点工加班小时 > 0 || item.点工加班工数 > 0) {
                    hasPointWork = true;
                }
                
                // 构建统计项
                const statItems = [];
                
                // 点工项
                if (hasPointWork || totalAmount > 0) {
                    let pointWorkMiddle = '';
                    if (item.点工上班小时 > 0) {
                        const hours = item.点工上班小时;
                        const displayHours = Number.isInteger(hours) ? hours : hours.toFixed(1);
                        const workDays = item.点工上班工数;
                        const displayWorkDays = Number.isInteger(workDays) ? workDays : workDays.toFixed(2);
                        pointWorkMiddle += `上班：${displayHours}小时=${displayWorkDays}个工<br>`;
                    }
                    if (item.点工加班小时 > 0) {
                        const hours = item.点工加班小时;
                        const displayHours = Number.isInteger(hours) ? hours : hours.toFixed(1);
                        const workDays = item.点工加班工数;
                        const displayWorkDays = Number.isInteger(workDays) ? workDays : workDays.toFixed(2);
                        pointWorkMiddle += `加班：${displayHours}小时=${displayWorkDays}个工`;
                    }
                    statItems.push({
                        type: '点工',
                        color: '#007bff',
                        left: '点工',
                        middle: pointWorkMiddle,
                        right: this.formatAmount(totalAmount),
                        rightColor: '#007bff',
                        backgroundColor: '#EDF4FF'
                    });
                }
                
                // 包工项
                if (item.包工金额 > 0) {
                    statItems.push({
                        type: '包工',
                        color: '#28a745',
                        left: '包工',
                        middle: '',
                        right: this.formatAmount(item.包工金额),
                        rightColor: '#28a745',
                        backgroundColor: '#EDF4FF'
                    });
                }
                
                // 工量项
                if (item.工量金额 > 0) {
                    statItems.push({
                        type: '工量',
                        color: '#28a745',
                        left: '工量',
                        middle: '',
                        right: this.formatAmount(item.工量金额),
                        rightColor: '#28a745',
                        backgroundColor: '#EDF4FF'
                    });
                }
                
                // 短工项
                if (item.短工金额 > 0) {
                    statItems.push({
                        type: '短工',
                        color: '#007bff',
                        left: '短工',
                        middle: '',
                        right: this.formatAmount(item.短工金额),
                        rightColor: '#007bff'
                    });
                }
                
                // 借支项
                if (item.借支金额 > 0) {
                    statItems.push({
                        type: '借支',
                        color: '#fd7e14',
                        left: '借支',
                        middle: '',
                        right: this.formatAmount(item.借支金额),
                        rightColor: '#fd7e14',
                        backgroundColor: '#FFF5E7'
                    });
                }
                
                // 扣款项
                if (item.扣款金额 > 0) {
                    statItems.push({
                        type: '扣款',
                        color: '#fd7e14',
                        left: '扣款',
                        middle: '',
                        right: this.formatAmount(item.扣款金额),
                        rightColor: '#fd7e14',
                        backgroundColor: '#FFF5E7'
                    });
                }
                
                // 公司转账项
                if (item.公司打款金额 > 0) {
                    statItems.push({
                        type: '公司转账',
                        color: '#fd7e14',
                        left: '公司转账',
                        middle: '',
                        right: this.formatAmount(item.公司打款金额),
                        rightColor: '#fd7e14',
                        backgroundColor: '#FFF5E7'
                    });
                }
                
                // 结算项
                if (item.结算金额 > 0) {
                    statItems.push({
                        type: '结算',
                        color: '#fd7e14',
                        left: '结算',
                        middle: '',
                        right: this.formatAmount(item.结算金额),
                        rightColor: '#fd7e14',
                        backgroundColor: '#FFF5E7'
                    });
                }
                
                // 计算工资和支出
                const salary = totalAmount + item.包工金额 + item.工量金额 + (item.短工金额 || 0);
                const expense = item.借支金额 + item.扣款金额 + item.公司打款金额 + item.结算金额;
                const unsettled = salary - expense;

                // 渲染员工卡片
                html += `
                    <div class="worker-card" data-employee-id="${item.employee_id || item.id}" data-emp-code="${item.emp_code}" data-emp-name="${item.emp_name}" style="margin-bottom: 30px; padding: 15px; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer; transition: all 0.2s ease;">
                        <!-- 姓名行 -->
                        <div style="padding: 12px 16px; background-color: #4a5568; color: white; font-size: 18px; font-weight: 600; margin: -15px -15px 0 -15px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; flex-shrink: 0;">
                                <!-- 使用SVG图标确保白色显示 -->
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="white" style="margin-right: 8px; flex-shrink: 0;">
                                    <circle cx="12" cy="8" r="5" stroke="none"/>
                                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                                <span style="display: flex; align-items: center;">${item.emp_code} ${item.emp_name}</span>
                            </div>
                            <div style="font-size: 14px; font-weight: 500; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px;">
                                <div style="display: flex; align-items: center;">
                                    工资：<span style="font-weight: 600; color: #ffd700;">${this.formatAmount(salary)}</span>
                                    <span style="margin: 0 8px;">|</span>
                                    支出：<span style="font-weight: 600; color: #ff6b6b;">${this.formatAmount(expense)}</span>
                                </div>
                                <div style="display: flex; align-items: center;">
                                    <span style="margin-right: 8px;">|</span>
                                    未结：<span style="font-weight: 600; color: #4ade80;">${this.formatAmount(unsettled)}</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 统计项列表 -->
                        <div style="margin: 0 -15px; padding: 0;">
                            ${statItems.map(item => `
                                <div style="display: flex; align-items: center; padding: 6px 16px; border-bottom: 1px solid #ccc; ${item.backgroundColor ? 'background-color: ' + item.backgroundColor + ';' : ''}">
                                    <!-- 左侧图标和类型 -->
                                    <div style="display: flex; align-items: center; margin-right: 5px; width: 80px;">
                                        <div style="width: 4px; height: 16px; background-color: ${item.color}; border-radius: 2px; margin-right: 8px;"></div>
                                        <div style="font-weight: bold; color: #333;">${item.left}</div>
                                    </div>

                                    <!-- 中间内容 -->
                                    <div style="flex: 1; color: black; font-size: 16px; line-height: 1.4; display: flex; flex-direction: column; justify-content: center; padding-left: 0;">${item.middle}</div>

                                    <!-- 右侧金额 -->
                                    <div style="text-align: right; font-weight: 600; color: ${item.color}; display: flex; flex-direction: column; justify-content: center;">${item.right}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            });
        }
        
        this.statContainer.innerHTML = html;
    }

    // 渲染合计视图
    renderTotalView(data) {
        let html = '';
        
        if (data.length === 0) {
            // 显示空数据提示
            html = '<div style="text-align: center; color: #666; padding: 40px;">暂无统计数据</div>';
        } else {
            // 计算合计数据
            const total = data.reduce((sum, item) => {
                // 计算每个员工的点工金额（上班工数四舍五入两位小数 + 加班工数四舍五入两位小数）× 工价，向下取整
                const roundedRegularWorkDays = parseFloat(item.点工上班工数.toFixed(2));
                const roundedOvertimeWorkDays = parseFloat(item.点工加班工数.toFixed(2));
                const totalWorkDays = roundedRegularWorkDays + roundedOvertimeWorkDays;
                const pointWorkAmount = Math.floor(totalWorkDays * (item.labor_cost || 0));
                
                
                return {
                    点工上班小时: sum.点工上班小时 + item.点工上班小时,
                    点工上班工数: sum.点工上班工数 + item.点工上班工数,
                    点工加班小时: sum.点工加班小时 + item.点工加班小时,
                    点工加班工数: sum.点工加班工数 + item.点工加班工数,
                    包工金额: sum.包工金额 + item.包工金额,
                    工量金额: sum.工量金额 + item.工量金额,
                    借支金额: sum.借支金额 + item.借支金额,
                    扣款金额: sum.扣款金额 + item.扣款金额,
                    公司打款金额: sum.公司打款金额 + item.公司打款金额,
                    结算金额: sum.结算金额 + item.结算金额,
                    点工金额: sum.点工金额 + pointWorkAmount,
                    labor_cost: sum.labor_cost + (item.labor_cost || 0)
                };
            }, {
                点工上班小时: 0,
                点工上班工数: 0,
                点工加班小时: 0,
                点工加班工数: 0,
                包工金额: 0,
                工量金额: 0,
                借支金额: 0,
                扣款金额: 0,
                公司打款金额: 0,
                结算金额: 0,
                点工金额: 0,
                labor_cost: 0
            });

            // 构建点工显示内容
            let pointWorkContent = '';
            let hasPointWork = false;
            
            // 上班显示
            if (total.点工上班小时 > 0 || total.点工上班工数 > 0) {
                hasPointWork = true;
                const hours = total.点工上班小时;
                const displayHours = Number.isInteger(hours) ? hours : hours.toFixed(1);
                const workDays = total.点工上班工数;
                const displayWorkDays = Number.isInteger(workDays) ? workDays : workDays.toFixed(2);
                pointWorkContent += `<div>上班：${displayHours}小时=${displayWorkDays}个工</div>`;
            }
            
            // 加班显示
            if (total.点工加班小时 > 0 || total.点工加班工数 > 0) {
                hasPointWork = true;
                const hours = total.点工加班小时;
                const displayHours = Number.isInteger(hours) ? hours : hours.toFixed(1);
                const workDays = total.点工加班工数;
                const displayWorkDays = Number.isInteger(workDays) ? workDays : workDays.toFixed(2);
                pointWorkContent += `<div>加班：${displayHours}小时=${displayWorkDays}个工</div>`;
            }
            
            // 构建包工显示内容
            let contractWorkContent = '';
            if (total.包工金额 > 0) {
                contractWorkContent = this.formatAmount(total.包工金额);
            }
            
            // 构建工量显示内容
            let quantityWorkContent = '';
            if (total.工量金额 > 0) {
                quantityWorkContent = this.formatAmount(total.工量金额);
            }
            
            // 构建借支显示内容
            let advanceContent = '';
            if (total.借支金额 > 0) {
                advanceContent = this.formatAmount(total.借支金额);
            }
            
            // 构建扣款显示内容
            let deductionContent = '';
            if (total.扣款金额 > 0) {
                deductionContent = this.formatAmount(total.扣款金额);
            }
            
            // 构建公司转账显示内容
            let companyPaymentContent = '';
            if (total.公司打款金额 > 0) {
                companyPaymentContent = this.formatAmount(total.公司打款金额);
            }
            
            // 构建结算显示内容
            let settlementContent = '';
            if (total.结算金额 > 0) {
                settlementContent = this.formatAmount(total.结算金额);
            }
            
            // 构建合计统计项
            const statItems = [];
            
            // 点工项
            if (hasPointWork) {
                statItems.push({
                    type: '点工',
                    color: '#007bff',
                    left: '点工',
                    middle: pointWorkContent,
                    right: this.formatAmount(total.点工金额),
                    rightColor: '#007bff',
                    backgroundColor: '#EDF4FF'
                });
            }
            
            // 包工项
            if (contractWorkContent) {
                statItems.push({
                    type: '包工',
                    color: '#28a745',
                    left: '包工',
                    middle: '',
                    right: contractWorkContent,
                    rightColor: '#28a745',
                    backgroundColor: '#EDF4FF'
                });
            }
            
            // 工量项
            if (quantityWorkContent) {
                statItems.push({
                    type: '工量',
                    color: '#28a745',
                    left: '工量',
                    middle: '',
                    right: quantityWorkContent,
                    rightColor: '#28a745',
                    backgroundColor: '#EDF4FF'
                });
            }
            
            // 借支项
            if (advanceContent) {
                statItems.push({
                    type: '借支',
                    color: '#fd7e14',
                    left: '借支',
                    middle: '',
                    right: advanceContent,
                    rightColor: '#fd7e14',
                    backgroundColor: '#FFF5E7'
                });
            }
            
            // 扣款项
            if (deductionContent) {
                statItems.push({
                    type: '扣款',
                    color: '#fd7e14',
                    left: '扣款',
                    middle: '',
                    right: deductionContent,
                    rightColor: '#fd7e14',
                    backgroundColor: '#FFF5E7'
                });
            }
            
            // 公司转账项
            if (companyPaymentContent) {
                statItems.push({
                    type: '公司转账',
                    color: '#fd7e14',
                    left: '公司转账',
                    middle: '',
                    right: companyPaymentContent,
                    rightColor: '#fd7e14',
                    backgroundColor: '#FFF5E7'
                });
            }
            
            // 结算项
            if (settlementContent) {
                statItems.push({
                    type: '结算',
                    color: '#fd7e14',
                    left: '结算',
                    middle: '',
                    right: settlementContent,
                    rightColor: '#fd7e14',
                    backgroundColor: '#FFF5E7'
                });
            }
            
            // 未结项（计算得出）
            const unsettled = total.点工金额 + total.包工金额 + total.工量金额 - total.借支金额 - total.扣款金额 - total.公司打款金额 - total.结算金额;
            
            html = `
                <div style="margin-bottom: 30px; padding: 15px; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- 合计标题行 -->
                    <div style="padding: 12px 16px; background-color: #4a5568; color: white; font-size: 18px; font-weight: 600; margin: -15px -15px 0 -15px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;">
                        <div style="flex-shrink: 0;">合计</div>
                        <div style="font-size: 14px; font-weight: 500; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px;">
                            <div style="display: flex; align-items: center;">
                                工资：<span style="font-weight: 600; color: #ffd700;">${this.formatAmount(total.点工金额 + total.包工金额 + total.工量金额)}</span>
                                <span style="margin: 0 8px;">|</span>
                                支出：<span style="font-weight: 600; color: #ff6b6b;">${this.formatAmount(total.借支金额 + total.扣款金额 + total.公司打款金额 + total.结算金额)}</span>
                            </div>
                            <div style="display: flex; align-items: center;">
                                <span style="margin-right: 8px;">|</span>
                                未结：<span style="font-weight: 600; color: #4ade80;">${this.formatAmount(unsettled)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 统计项列表 -->
                    <div style="margin: 0 -15px; padding: 0;">
                        ${statItems.map(item => `
                            <div style="display: flex; align-items: center; padding: 6px 16px; border-bottom: 1px solid #ccc; ${item.backgroundColor ? 'background-color: ' + item.backgroundColor + ';' : ''}">
                                <!-- 左侧图标和类型 -->
                                <div style="display: flex; align-items: center; margin-right: 5px; width: 80px;">
                                    <div style="width: 4px; height: 16px; background-color: ${item.color}; border-radius: 2px; margin-right: 8px;"></div>
                                    <div style="font-weight: bold; color: #333;">${item.left}</div>
                                </div>

                                <!-- 中间内容 -->
                                <div style="flex: 1; color: black; font-size: 16px; line-height: 1.4; display: flex; flex-direction: column; justify-content: center; padding-left: 0;">${item.middle}</div>

                                <!-- 右侧金额 -->
                                <div style="text-align: right; font-weight: 600; color: ${item.color}; display: flex; flex-direction: column; justify-content: center;">${item.right}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        this.statContainer.innerHTML = html;
    }
}

// 页面加载完成后初始化统计功能，确保只创建一个实例
document.addEventListener('DOMContentLoaded', () => {
    // 检查是否已经创建过实例
    if (!window.workerStatistic) {
        new WorkerStatistic();
    }
});