// 修复记工系统中的全局函数问题

// ==================== 修复monitorSelectionState未定义的问题 ====================
/**
 * 监测员工选择状态，更新全选按钮文本
 */
function monitorSelectionState() {
    try {
        const selectAllBtn = document.getElementById('selectAllBtn');
        const checkboxes = document.querySelectorAll('.employee-item input[type="checkbox"]');
        const checkedBoxes = document.querySelectorAll('.employee-item input[type="checkbox"]:checked');
        
        // 检查选择状态
        const allSelected = checkboxes.length > 0 && checkedBoxes.length === checkboxes.length;
        const noneSelected = checkedBoxes.length === 0;
        const partialSelected = checkedBoxes.length > 0 && checkedBoxes.length < checkboxes.length;
        
        // 根据选择状态更新全选按钮文本
        if (selectAllBtn && window.isAllSelected !== undefined) {
            if (allSelected) {
                isAllSelected = true;
                selectAllBtn.textContent = '取消全选';
            } else {
                isAllSelected = false;
                selectAllBtn.textContent = '全选';
            }
        }
    } catch (error) {
        console.log('状态监测函数执行失败，忽略错误:', error.message);
    }
}

// ==================== 修复showMorningAfternoonModal函数中的TypeError ====================
/**
 * 修复showMorningAfternoonModal函数，添加存在性检查和重试机制
 */
function fixMorningAfternoonModal() {
    // 重写函数，添加存在性检查和重试机制
    window.showMorningAfternoonModal = function(retryCount = 0) {
        try {
            // 重置数据
            window.morningAfternoonData = {
                morning: { type: 'rest', value: '' },
                afternoon: { type: 'rest', value: '' }
            };
            
            // 重置按钮状态
            document.querySelectorAll('.morning-afternoon-btn').forEach(btn => {
                btn.classList.remove('active');
                btn.style.backgroundColor = '#f5f5f5';
                btn.style.color = '#333';
                btn.style.border = '1px solid #ddd';
            });
            
            // 重置输入工容器
            document.querySelectorAll('[id$="WorkContainer"]').forEach(container => {
                const textSpan = container.querySelector('.work-btn-text');
                const input = container.querySelector('.work-input');
                if (textSpan && input) {
                    textSpan.textContent = '输入工';
                    textSpan.style.display = 'inline-block';
                    input.style.display = 'none';
                    input.value = '';
                    container.removeAttribute('data-work-value');
                }
            });
            
            // 重置小时选择器
            document.querySelectorAll('.modal-hours-input').forEach(input => {
                input.value = '选小时';
            });
            
            // 清理小时选择器的数据属性
            document.querySelectorAll('.modal-hours-select-container').forEach(container => {
                container.removeAttribute('data-selected-hours');
            });
            
            // 重置下拉框
            document.querySelectorAll('.modal-hours-dropdown').forEach(dropdown => {
                dropdown.style.display = 'none';
            });
            
            // 默认选中休息
            const morningRest = document.getElementById('morningRest');
            if (morningRest) {
                morningRest.classList.add('active');
                morningRest.style.backgroundColor = '#1890ff';
                morningRest.style.color = 'white';
                morningRest.style.border = 'none';
            }
            
            const afternoonRest = document.getElementById('afternoonRest');
            if (afternoonRest) {
                afternoonRest.classList.add('active');
                afternoonRest.style.backgroundColor = '#1890ff';
                afternoonRest.style.color = 'white';
                afternoonRest.style.border = 'none';
            }
            
            // 查找上下午模态框，考虑不同的DOM结构
            let morningAfternoonModal = document.getElementById('morningAfternoonModal');
            
            // 如果找不到，尝试通过类名查找
            if (!morningAfternoonModal) {
                morningAfternoonModal = document.querySelector('.modal#morningAfternoonModal');
            }
            
            // 如果还是找不到，尝试只通过类名查找（假设只有一个模态框）
            if (!morningAfternoonModal) {
                const modals = document.querySelectorAll('.modal');
                for (const modal of modals) {
                    if (modal.querySelector('h3') && modal.querySelector('h3').textContent.includes('上/下午时长')) {
                        morningAfternoonModal = modal;
                        break;
                    }
                }
            }
            
            // 如果找到了模态框，显示它
            if (morningAfternoonModal) {
                morningAfternoonModal.style.display = 'flex';
            } 
            // 如果找不到模态框，并且重试次数小于3次，尝试稍后再显示
            else if (retryCount < 3) {
                // 延迟100ms后重试
                setTimeout(() => {
                    window.showMorningAfternoonModal(retryCount + 1);
                }, 100);
            }
        } catch (error) {
            console.error('showMorningAfternoonModal执行错误:', error);
        }
    };
    
    // 修复hideMorningAfternoonModal函数，添加存在性检查
    window.hideMorningAfternoonModal = function() {
        try {
            // 查找上下午模态框，考虑不同的DOM结构
            let morningAfternoonModal = document.getElementById('morningAfternoonModal');
            
            // 如果找不到，尝试通过类名查找
            if (!morningAfternoonModal) {
                morningAfternoonModal = document.querySelector('.modal#morningAfternoonModal');
            }
            
            // 如果还是找不到，尝试只通过类名查找（假设只有一个模态框）
            if (!morningAfternoonModal) {
                const modals = document.querySelectorAll('.modal');
                for (const modal of modals) {
                    if (modal.querySelector('h3') && modal.querySelector('h3').textContent.includes('上/下午时长')) {
                        morningAfternoonModal = modal;
                        break;
                    }
                }
            }
            
            // 如果找到了模态框，隐藏它
            if (morningAfternoonModal) {
                morningAfternoonModal.style.display = 'none';
            }
        } catch (error) {
            console.error('hideMorningAfternoonModal执行错误:', error);
        }
    };
}

// ==================== 修复showOvertimeModal函数中的TypeError ====================
/**
 * 修复showOvertimeModal函数，添加存在性检查和重试机制
 */
function fixShowOvertimeModal() {
    // 不保存原始函数，直接重写，因为原始函数可能有问题
    window.showOvertimeModal = function(retryCount = 0) {
        try {
            // 查找加班模态框，考虑不同的DOM结构
            let overtimeModal = document.getElementById('overtimeModal');
            
            // 如果找不到，尝试通过类名查找
            if (!overtimeModal) {
                overtimeModal = document.querySelector('.modal#overtimeModal');
            }
            
            // 如果还是找不到，尝试只通过类名查找（假设只有一个模态框）
            if (!overtimeModal) {
                const modals = document.querySelectorAll('.modal');
                for (const modal of modals) {
                    if (modal.querySelector('h3') && modal.querySelector('h3').textContent.includes('加班时长')) {
                        overtimeModal = modal;
                        break;
                    }
                }
            }
            
            // 如果找到模态框，显示它
            if (overtimeModal) {
                overtimeModal.style.display = 'flex';
                
                // 简单直接地绑定加班小时选择器事件
                const overtimeHoursContainer = overtimeModal.querySelector('#overtimeHours') || overtimeModal.querySelector('.overtime-option.work-container');
                if (overtimeHoursContainer) {
                    // 移除旧的事件监听器
                    overtimeHoursContainer.onclick = null;
                    
                    // 添加新的事件监听器
                    overtimeHoursContainer.onclick = function(e) {
                        // 重置输入工按钮
                        const workBtnText = overtimeModal.querySelector('#overtimeWork .work-btn-text');
                        const workInput = overtimeModal.querySelector('#overtimeWork .work-input');
                        if (workBtnText && workInput) {
                            workBtnText.style.display = 'inline-block';
                            workInput.style.display = 'none';
                            workBtnText.textContent = '输入工';
                        }
                        
                        const dropdown = this.querySelector('.modal-hours-dropdown') || this.querySelector('.hours-dropdown');
                        if (dropdown) {
                            if (dropdown.style.display === 'block') {
                                dropdown.style.display = 'none';
                            } else {
                                dropdown.style.display = 'block';
                            }
                        }
                    };
                }
                
                // 清理所有下拉框
                overtimeModal.querySelectorAll('.modal-hours-dropdown, .hours-dropdown').forEach(dropdown => {
                    dropdown.style.display = 'none';
                });
            } 
            // 如果找不到模态框，并且重试次数小于3次，尝试稍后再显示
            else if (retryCount < 3) {
                // 延迟100ms后重试
                setTimeout(() => {
                    window.showOvertimeModal(retryCount + 1);
                }, 100);
            }
        } catch (error) {
            console.error('showOvertimeModal执行错误:', error);
        }
    };
    
    // 修复hideOvertimeModal函数，添加存在性检查
    window.hideOvertimeModal = function() {
        try {
            // 查找加班模态框，考虑不同的DOM结构
            let overtimeModal = document.getElementById('overtimeModal');
            
            // 如果找不到，尝试通过类名查找
            if (!overtimeModal) {
                overtimeModal = document.querySelector('.modal#overtimeModal');
            }
            
            // 如果还是找不到，尝试只通过类名查找（假设只有一个模态框）
            if (!overtimeModal) {
                const modals = document.querySelectorAll('.modal');
                for (const modal of modals) {
                    if (modal.querySelector('h3') && modal.querySelector('h3').textContent.includes('加班时长')) {
                        overtimeModal = modal;
                        break;
                    }
                }
            }
            
            // 如果找到模态框，隐藏它
            if (overtimeModal) {
                overtimeModal.style.display = 'none';
            }
        } catch (error) {
            console.error('hideOvertimeModal执行错误:', error);
        }
    };
}

// ==================== 页面加载完成后执行修复 ====================
/**
 * 页面加载完成后执行所有修复
 */
function applyAllFixes() {
    fixMorningAfternoonModal();
    fixShowOvertimeModal();
}

// 确保修复函数在所有DOM内容加载完成后执行，包括HTML中的script标签
document.addEventListener('DOMContentLoaded', () => {
    // 使用setTimeout确保我们的修复在所有其他DOMContentLoaded事件处理完成后执行
    setTimeout(() => {
        applyAllFixes();
    }, 0);
});

// 如果页面已经加载完成，立即执行修复
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // 使用setTimeout确保我们的修复在所有其他代码执行完成后执行
    setTimeout(() => {
        applyAllFixes();
    }, 0);
}