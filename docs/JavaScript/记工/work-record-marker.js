/**
 * 记工标记服务 - 负责处理员工列表的"已记"标记功能
 */
class WorkRecordMarker {
    constructor() {
        this.markedEmployees = new Set(); // 存储已记工的员工ID
        this.isChecking = false; // 防止重复检查的标志
        this.eventListenersSet = false; // 防止事件监听器被多次绑定的标志
        this.checkTimeoutId = null; // 防抖定时器ID
        // 存储事件监听器的引用，以便后续可以移除
        this.eventHandlers = {};
    }

    /**
     * 检查是否处于编辑模式
     */
    isEditMode() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.has('record_id');
    }
    
    /**
     * 初始化服务
     */
    init() {

        this.setupEventListeners();
        // 初始加载时检查已记工员工（非编辑模式）
        if (!this.isEditMode()) {
            // 延迟执行，避免与其他初始化过程冲突
            setTimeout(() => {
                this.checkMarkedEmployees();
            }, 100);
        }
        
        // 监听员工列表渲染完成事件
        document.addEventListener('employeeListRendered', () => {
            // 非编辑模式下才检查已记工员工
            if (!this.isEditMode()) {
                this.checkMarkedEmployees();
            }
        });
    }

    /**
     * 重置事件监听器
     */
    resetEventListeners() {
        // 重置事件监听器标志
        this.eventListenersSet = false;
        // 移除之前的事件监听器
        if (this.eventHandlers.clickHandler) {
            document.removeEventListener('click', this.eventHandlers.clickHandler);
        }
        if (this.eventHandlers.changeHandler) {
            document.removeEventListener('change', this.eventHandlers.changeHandler, true);
        }
        if (this.eventHandlers.mousedownHandler) {
            document.removeEventListener('mousedown', this.eventHandlers.mousedownHandler);
        }
        if (this.eventHandlers.workRecordConfirmedHandler) {
            document.removeEventListener('workRecordConfirmed', this.eventHandlers.workRecordConfirmedHandler);
        }
        if (this.eventHandlers.dateDisplayUpdatedHandler) {
            document.removeEventListener('dateDisplayUpdated', this.eventHandlers.dateDisplayUpdatedHandler);
        }
        // 清空事件处理器对象
        this.eventHandlers = {};
        // 重新设置事件监听器
        this.setupEventListeners();
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 防止事件监听器被多次绑定
        if (this.eventListenersSet) {
            return;
        }
        
        this.eventListenersSet = true;
        
        // 只有非编辑模式才设置已记相关的事件监听器
        if (!this.isEditMode()) {
            // 监听工作类型切换事件（只选择工作类型选项，排除标签页选项）
            const workTypeOptions = document.querySelectorAll('input[name="workType"] + .work-type-option');
            workTypeOptions.forEach(option => {
                option.addEventListener('click', () => {
                    // 延迟执行，确保工作类型已切换
                    setTimeout(() => {
                        this.checkMarkedEmployees();
                    }, 100);
                });
            });
            
            // 监听工作类型单选按钮的change事件
            const workTypeRadios = document.querySelectorAll('input[name="workType"]');
            workTypeRadios.forEach(radio => {
                radio.addEventListener('change', () => {
                    // 延迟执行，确保工作类型已切换
                    setTimeout(() => {
                        this.checkMarkedEmployees();
                    }, 100);
                });
            });

            // 监听记工日期变更事件
            const workDateInput = document.getElementById('workDate');
            if (workDateInput) {
                // 监听change事件
                workDateInput.addEventListener('change', () => {
                    this.checkMarkedEmployees();
                });
            }
            
            // 监听日期选择器相关事件
            this.setupDatePickerListeners();
            
            // 监听员工选择事件，阻止已记工员工被选择
            this.eventHandlers.clickHandler = (e) => {
                // 检查是否点击了员工项或其内部元素
                const employeeItem = e.target.closest('.employee-item');
                if (employeeItem) {
                    const employeeId = employeeItem.getAttribute('data-id');
                    if (!employeeId) {
                        return;
                    }
                    if (this.markedEmployees.has(employeeId)) {
                        e.preventDefault();
                        e.stopPropagation();
                        // 使用showNotification替代alert，使用统一的提示样式
                        showNotification('当前员工已记工', true);
                        // 确保复选框未选中
                        const empCheckbox = employeeItem.querySelector('input[type="checkbox"]');
                        if (empCheckbox) {
                            empCheckbox.checked = false;
                        }
                    }
                }
            };
            document.addEventListener('click', this.eventHandlers.clickHandler);
            
            // 监听复选框change事件，阻止已记工员工被选中（使用事件捕获阶段，确保优先处理）
            this.eventHandlers.changeHandler = (e) => {
                if (e.target.type === 'checkbox') {
                    const employeeItem = e.target.closest('.employee-item');
                    if (employeeItem) {
                        const employeeId = employeeItem.getAttribute('data-id');
                        if (!employeeId) {
                            return;
                        }
                        if (this.markedEmployees.has(employeeId)) {
                            // 阻止事件继续传播，防止后续事件监听器处理
                            e.stopImmediatePropagation();
                            // 恢复复选框状态
                            e.target.checked = false;
                            // 移除选中状态
                            employeeItem.classList.remove('selected');
                            // 从选中员工集合中移除（如果存在）
                            if (window.selectedEmployeeIds) {
                                window.selectedEmployeeIds.delete(employeeId);
                            }
                            // 更新全选按钮状态
                            if (window.updateSelectAllButtonState) {
                                window.updateSelectAllButtonState();
                            }
                            // 调用增强版监测函数确保状态同步
                            if (window.monitorSelectionState) {
                                window.monitorSelectionState();
                            }
                            // 使用showNotification替代alert，使用统一的提示样式
                            showNotification('当前员工已记工', true);
                            // 阻止事件冒泡
                            e.stopPropagation();
                        }
                    }
                }
            };
            document.addEventListener('change', this.eventHandlers.changeHandler, true); // 使用事件捕获阶段
            
            // 监听员工项的所有点击相关事件
            this.eventHandlers.mousedownHandler = (e) => {
                const employeeItem = e.target.closest('.employee-item');
                if (employeeItem) {
                    const employeeId = employeeItem.getAttribute('data-id');
                    if (!employeeId) {
                        return;
                    }
                    if (this.markedEmployees.has(employeeId)) {
                        e.preventDefault();
                        e.stopPropagation();
                        // 使用showNotification替代alert，使用统一的提示样式
                        showNotification('当前员工已记工', true);
                        // 确保复选框未选中
                        const empCheckbox = employeeItem.querySelector('input[type="checkbox"]');
                        if (empCheckbox) {
                            empCheckbox.checked = false;
                        }
                    }
                }
            };
            document.addEventListener('mousedown', this.eventHandlers.mousedownHandler);
            
            // 监听记工记录确认事件
            this.eventHandlers.workRecordConfirmedHandler = () => {
                this.checkMarkedEmployees();
            };
            document.addEventListener('workRecordConfirmed', this.eventHandlers.workRecordConfirmedHandler);
            
            // 监听日期显示更新事件
            this.eventHandlers.dateDisplayUpdatedHandler = () => {
                this.checkMarkedEmployees();
            };
            document.addEventListener('dateDisplayUpdated', this.eventHandlers.dateDisplayUpdatedHandler);
        }
    }
    
    /**
     * 设置日期选择器事件监听器
     */
    setupDatePickerListeners() {
        // 监听日期选择器的日期点击事件
        document.addEventListener('click', (e) => {
            // 检查点击的是否是日期选择器中的日期单元格
            if (e.target.classList.contains('day-cell') && !e.target.classList.contains('other-month') && !e.target.classList.contains('disabled-future')) {
                // 延迟执行，确保workDateInput的值已经更新
                setTimeout(() => {
                    this.checkMarkedEmployees();
                }, 200);
            }
        });
        
        // 监听日期显示更新函数调用
        // 重写updateDateDisplay函数，添加事件触发 - 但只在必要时触发
        const originalUpdateDateDisplay = window.updateDateDisplay;
        if (originalUpdateDateDisplay) {
            window.updateDateDisplay = function() {
                const result = originalUpdateDateDisplay.apply(this, arguments);
                // 触发日期显示更新事件
                const event = new Event('dateDisplayUpdated');
                document.dispatchEvent(event);
                return result;
            };
        }
    }

    /**
     * 检查已记工的员工 - 防抖版本
     */
    checkMarkedEmployees() {
        // 清除之前的定时器
        if (this.checkTimeoutId) {
            clearTimeout(this.checkTimeoutId);
        }
        
        // 设置新的定时器，防抖200ms
        this.checkTimeoutId = setTimeout(async () => {
            await this._checkMarkedEmployeesImpl();
        }, 200);
    }
    
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
                resolve(true);
            };
            
            window.addEventListener('online', handleOnline);
        });
    }
    
    /**
     * 检查已记工的员工 - 实际实现
     */
    async _checkMarkedEmployeesImpl() {
        // 防止重复调用
        if (this.isChecking) {
            return;
        }
        
        this.isChecking = true;
        
        try {
            // 优先从URL中获取项目ID
            const urlParams = new URLSearchParams(window.location.search);
            let projectId = urlParams.get('project_id');
            
            // 只在项目ID真正改变时才保存到localStorage
            const currentProjectId = localStorage.getItem('currentProjectId');
            if (projectId && projectId !== currentProjectId) {
                localStorage.setItem('currentProjectId', projectId);
            } else if (!projectId) {
                // 如果URL中没有项目ID，从localStorage中获取
                projectId = currentProjectId;
                
                // 如果localStorage中也没有项目ID，等待项目ID设置完成
                if (!projectId) {
                    // 延迟1秒后再次尝试
                    setTimeout(() => {
                        this.checkMarkedEmployees();
                    }, 1000);
                    return;
                }
            }

            // 获取当前记工日期
            const workDateInput = document.getElementById('workDate');
            const workDate = workDateInput ? workDateInput.value : new Date().toISOString().split('T')[0];
            if (!workDate) {
                return;
            }

            // 获取当前工作类型
            const currentWorkType = this.getCurrentWorkType();
            if (!currentWorkType) {
                return;
            }

            // 直接从本地存储加载数据
            this.markedEmployees.clear();
            this.loadMarkedEmployeesFromLocal(projectId, workDate, currentWorkType);

            // 标记已记工员工
            this.markEmployees();
        } catch (error) {
            console.error('WorkRecordMarker: 检查已记工员工失败:', error);
            try {
                // 出错时从本地存储加载数据
                const projectId = localStorage.getItem('currentProjectId');
                const workDate = document.getElementById('workDate')?.value || new Date().toISOString().split('T')[0];
                const currentWorkType = this.getCurrentWorkType();
                if (projectId && workDate && currentWorkType) {
                    this.markedEmployees.clear();
                    this.loadMarkedEmployeesFromLocal(projectId, workDate, currentWorkType);
                    this.markEmployees();
                }
            } catch (retryError) {
                console.error('WorkRecordMarker: 重试从本地存储加载数据失败:', retryError);
            }
        } finally {
            // 无论成功还是失败，都设置isChecking为false
            this.isChecking = false;
        }
    }
    
    /**
     * 从本地存储加载已记工员工数据
     */
    loadMarkedEmployeesFromLocal(projectId, workDate, workType) {
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
                console.error('WorkRecordMarker: 解析currentUser失败:', e);
            }
            
            // 使用与首页一致的键名：work_records_${userId}
            const localStorageKey = `work_records_${userId}`;
            
            // 从本地存储获取数据
            const localWorkFlowDataStr = localStorage.getItem(localStorageKey);
            if (localWorkFlowDataStr) {
                const allRecords = JSON.parse(localWorkFlowDataStr);
                
                // 过滤出当前项目、日期和工作类型的记录
                const filteredRecords = allRecords.filter(record => 
                    record.project_id === projectId && 
                    record.record_date === workDate && 
                    record.work_type === workType
                );
                
                // 将过滤后的记录的员工ID添加到已记工集合
                filteredRecords.forEach(record => {
                    if (record.employee_id) {
                        this.markedEmployees.add(record.employee_id);
                    }
                });
            }
        } catch (error) {
            console.error('WorkRecordMarker: 从本地存储加载已记工员工数据失败:', error);
        }
    }

    /**
     * 获取当前工作类型
     */
    getCurrentWorkType() {
        // 查找当前激活的工作类型选项（只选择工作类型选项，排除标签页选项）
        const activeOption = document.querySelector('input[name="workType"] + .work-type-option.active');
        if (activeOption) {
            // 根据激活的选项返回对应的工作类型
            const optionText = activeOption.textContent.trim();
            if (optionText.includes('点工')) {
                return '点工';
            } else if (optionText.includes('包工')) {
                return '包工';
            } else if (optionText.includes('工量')) {
                return '工量';
            }
        }
        
        // 如果没有找到激活的选项，通过单选按钮的checked状态来判断
        const checkedRadio = document.querySelector('input[name="workType"]:checked');
        if (checkedRadio) {
            const radioId = checkedRadio.id;
            if (radioId.includes('workType1')) {
                return '点工';
            } else if (radioId.includes('workType2')) {
                return '包工';
            } else if (radioId.includes('workType3')) {
                return '工量';
            }
        }

        return null;
    }

    /**
     * 标记已记工的员工
     */
    markEmployees() {
        // 获取所有员工项
        const employeeItems = document.querySelectorAll('.employee-item');
        
        employeeItems.forEach(item => {
            const employeeId = item.getAttribute('data-id');
            
            if (this.markedEmployees.has(employeeId)) {
                // 标记为已记工
                this.markAsRecorded(item);
            } else {
                // 移除已记工标记
                this.unmarkAsRecorded(item);
            }
        });
    }

    /**
     * 将员工标记为已记工
     */
    markAsRecorded(employeeItem) {
        // 检查是否是从URL参数指定的员工，如果是，则不将其标记为已记工，保持可选中状态
        const employeeId = employeeItem.getAttribute('data-id');
        if (window.employeeIdFromUrl && employeeId === window.employeeIdFromUrl) {
            // 从URL参数进来的员工，即使已记工也保持可选中状态
            // 不添加已记工标记，不禁用复选框
            // 仅移除已记样式，保留选中状态
            employeeItem.classList.remove('recorded-employee');
            employeeItem.style.opacity = '';
            employeeItem.style.cursor = '';

            // 移除可能存在的已记标记
            const recordedLabels = employeeItem.querySelectorAll('.recorded-label');
            recordedLabels.forEach(label => label.remove());

            // 确保复选框可用并保持选中状态
            const checkbox = employeeItem.querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.disabled = false;
                // 保持选中状态（因为已经在selectedEmployeeIds集合中）
                if (window.selectedEmployeeIds && window.selectedEmployeeIds.has(employeeId)) {
                    checkbox.checked = true;
                    employeeItem.classList.add('selected');
                }
            }
            return;
        }

        // 添加已记工样式
        employeeItem.classList.add('recorded-employee');
        employeeItem.style.opacity = '1'; // 取消半透明效果
        employeeItem.style.cursor = 'not-allowed';

        // 检查是否已有已记标记，没有则添加
        let recordedLabel = employeeItem.querySelector('.recorded-label');
        if (!recordedLabel) {
            // 获取工号元素
            const employeeIdElement = employeeItem.querySelector('.employee-id');
            if (employeeIdElement) {
                // 设置工号元素为相对定位，以便标记绝对定位
                employeeIdElement.style.position = 'relative';
                // 把工号背景改为更现代的橙色（Material Design橙色）
                employeeIdElement.style.background = '#FF9800';
                // 将工号字体改为白色，提高在橙色背景上的可读性
                employeeIdElement.style.color = 'white';
                // 调整工号文字位置，向上移动更多
                employeeIdElement.style.alignItems = 'flex-start'; // 垂直对齐方式改为顶部对齐
                employeeIdElement.style.justifyContent = 'center'; // 水平居中
                employeeIdElement.style.paddingTop = '3px'; // 调整顶部内边距至3px
                employeeIdElement.style.paddingBottom = '18px'; // 增加底部内边距，为已记标记留出更多空间

                // 创建已记标记容器
                recordedLabel = document.createElement('div');
                recordedLabel.className = 'recorded-label';
                recordedLabel.style.position = 'absolute';
                recordedLabel.style.bottom = '0';
                recordedLabel.style.left = '0';
                recordedLabel.style.width = '100%';
                recordedLabel.style.height = '40%'; // 调整高度，使标记更明显
                recordedLabel.style.background = '#f0f0f0'; // 已记范围改为淡灰色
                recordedLabel.style.borderRadius = '50% 50% 0 0 / 100% 100% 0 0';
                recordedLabel.style.zIndex = '1';
                recordedLabel.style.overflow = 'hidden';
                recordedLabel.style.boxShadow = '0 -1px 3px rgba(0, 0, 0, 0.1)'; // 添加微妙阴影，增加深度

                // 创建已记文字
                const recordedText = document.createElement('div');
                recordedText.textContent = '已记';
                recordedText.style.position = 'absolute';
                recordedText.style.bottom = '2px';
                recordedText.style.left = '0';
                recordedText.style.width = '100%';
                recordedText.style.textAlign = 'center';
                recordedText.style.color = '#2196F3'; // 已记字体颜色改为蓝色
                recordedText.style.fontSize = '10px'; // 略微增大字体
                recordedText.style.fontWeight = 'normal'; // 字体不加粗
                recordedText.style.zIndex = '2';

                // 组合元素
                recordedLabel.appendChild(recordedText);
                employeeIdElement.appendChild(recordedLabel);
            }
        }

        // 禁用复选框
        const checkbox = employeeItem.querySelector('input[type="checkbox"]');
        if (checkbox) {
            // 禁用复选框，防止被选中
            checkbox.disabled = true;
            // 确保复选框未选中
            checkbox.checked = false;
        }

        // 移除选中状态
        employeeItem.classList.remove('selected');
    }

    /**
     * 移除员工的已记工标记
     */
    unmarkAsRecorded(employeeItem) {
        // 检查是否是从URL参数指定的员工，如果是，则跳过处理
        const employeeId = employeeItem.getAttribute('data-id');
        if (window.employeeIdFromUrl && employeeId === window.employeeIdFromUrl) {
            // 从URL参数进来的员工，不进行任何处理，保持其选中状态
            return;
        }

        // 移除已记工样式
        employeeItem.classList.remove('recorded-employee');
        employeeItem.style.opacity = '';
        employeeItem.style.cursor = '';

        // 移除已记标记
        const recordedLabels = employeeItem.querySelectorAll('.recorded-label');
        recordedLabels.forEach(label => {
            label.remove();
        });
        
        // 恢复工号元素的原始样式
        const employeeIdElement = employeeItem.querySelector('.employee-id');
        if (employeeIdElement) {
            // 恢复原始背景色
            employeeIdElement.style.background = '';
            // 恢复原始文字颜色
            employeeIdElement.style.color = '';
            // 恢复原始对齐方式
            employeeIdElement.style.alignItems = '';
            employeeIdElement.style.justifyContent = '';
            // 恢复原始内边距
            employeeIdElement.style.paddingTop = '';
            employeeIdElement.style.paddingBottom = '';
        }
        
        // 启用复选框并重置状态
        const checkbox = employeeItem.querySelector('input[type="checkbox"]');
        if (checkbox) {
            // 启用复选框
            checkbox.disabled = false;
            // 重置复选框状态为未选中
            checkbox.checked = false;
        }
        
        // 移除选中状态
        employeeItem.classList.remove('selected');
        
        // 从选中员工集合中移除（如果存在）
        if (window.selectedEmployeeIds) {
            window.selectedEmployeeIds.delete(employeeId);
        }
        
        // 更新全选按钮状态
        if (window.updateSelectAllButtonState) {
            window.updateSelectAllButtonState();
        }
        
        // 调用增强版监测函数确保状态同步
        if (window.monitorSelectionState) {
            window.monitorSelectionState();
        }
    }
}

// 导出服务实例
const workRecordMarker = new WorkRecordMarker();

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    workRecordMarker.init();
});

// 手动触发检查已记工员工的函数，方便调试
window.checkMarkedEmployees = () => {
    workRecordMarker.checkMarkedEmployees();
};

// 手动触发检查已记工员工的函数（无防抖，用于调试）
window.checkMarkedEmployeesImmediate = () => {
    workRecordMarker._checkMarkedEmployeesImpl();
};
