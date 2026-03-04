/**
 * 编辑模式工作类型处理函数
 * 包含点工、包工、工量三种工作类型的字段处理逻辑
 */

/**
 * 解析工作时长字符串并填充对应的UI组件
 * @param {string} workTimeStr - 工作时长字符串，如"2个工/2小时"、"上午半个工-下午3.5小时/3小时"等
 */
function parseAndFillWorkTime(workTimeStr) {
    if (!workTimeStr || typeof workTimeStr !== 'string') return;
    

    
    // 清空所有选择
    document.querySelectorAll('input[name="dayWork"]').forEach(radio => { 
        radio.checked = false; 
    });
    
    // 处理特殊情况：只有"休息"
    if (workTimeStr.trim() === '休息') {
        selectWorkType('rest');
        setOvertimeDisplay('无加班');
        return;
    }
    
    // 分离工作时间（/前）和加班时间（/后）
    let workPart = workTimeStr;
    let overtimePart = '';
    
    if (workTimeStr.includes('/')) {
        const parts = workTimeStr.split('/');
        workPart = parts[0].trim();
        overtimePart = parts[1].trim();
    }
    

    
    // 解析工作部分并设置对应按钮
    fillWorkPart(workPart);
    
    // 解析加班部分并设置加班显示
    if (overtimePart) {
        fillOvertimePart(overtimePart);
    } else {
        setOvertimeDisplay('无加班');
    }
}

/**
 * 填充工作部分到对应的按钮
 * @param {string} workPart - 工作部分字符串
 */
function fillWorkPart(workPart) {
    if (!workPart) return;
    
    // 处理"X个工"格式
    if (workPart.includes('个工')) {
        const match = workPart.match(/(\d+(?:\.\d+)?)\s*个工/);
        if (match) {
            const workValue = parseFloat(match[1]);
            if (workValue === 1) {
                selectWorkType('1');
            } else if (workValue === 0.5) {
                selectWorkType('0.5');
            } else {
                // 非整数工数，也按1个工处理，但需要更新editable-number的值
                selectWorkType('1');
                // 更新editable-number的值为实际工数
                const dayWork1Btn = document.getElementById('dayWork1');
                if (dayWork1Btn) {
                    const editableNumber = dayWork1Btn.querySelector('.editable-number');
                    if (editableNumber) {
                        editableNumber.textContent = workValue.toString();
                        // 更新按钮的data-value属性
                        dayWork1Btn.setAttribute('data-value', workValue.toString());

                    }
                }
            }
            return;
        }
    }
    
    // 处理"上午X-下午Y"格式 - 需要在处理"半个工"之前，否则会先匹配到"半个工"
    if (workPart.includes('上午') && workPart.includes('下午')) {
        selectWorkType('period');
        
        // 设置上下午按钮的文本内容
        const morningAfternoonBtn = document.getElementById('morningAfternoonBtn');
        if (morningAfternoonBtn) {
            morningAfternoonBtn.textContent = workPart;
            morningAfternoonBtn.classList.add('active');
            morningAfternoonBtn.style.backgroundColor = '#1890ff';
            morningAfternoonBtn.style.color = 'white';
        }
        
        // 设置隐藏单选按钮的值
        const hiddenRadioPeriod = document.getElementById('hiddenRadioPeriod');
        if (hiddenRadioPeriod) {
            hiddenRadioPeriod.checked = true;
            hiddenRadioPeriod.value = workPart;
        }
        
        return;
    }
    
    // 处理"半个工"
    if (workPart.includes('半个工')) {
        selectWorkType('0.5');
        return;
    }
    
    // 处理"休息"
    if (workPart.includes('休息')) {
        selectWorkType('rest');
        return;
    }
    
    // 处理"X小时"格式
    if (workPart.includes('小时')) {
        const match = workPart.match(/(\d+(?:\.\d+)?)\s*小时/);
        if (match) {
            const hours = parseFloat(match[1]);
            selectWorkType('hours');
            
            // 设置选小时按钮的值和状态
            const dayWorkHoursContainer = document.getElementById('dayWorkHours');
            const hoursInputEl = dayWorkHoursContainer ? dayWorkHoursContainer.querySelector('.hours-input') : null;
            const hiddenRadio = document.getElementById('hiddenRadioHours');
            
            if (dayWorkHoursContainer && hoursInputEl) {
                // 只更新hours-input的值，不替换整个容器内容
                hoursInputEl.value = `${hours}小时`;
                // 设置data-value属性
                dayWorkHoursContainer.setAttribute('data-value', hours.toString());
                // 设置隐藏单选按钮
                if (hiddenRadio) {
                    hiddenRadio.checked = true;
                    hiddenRadio.value = hours.toString();
                }
                
                // 为容器添加active状态
                dayWorkHoursContainer.classList.add('active');
                dayWorkHoursContainer.style.backgroundColor = '#1890ff';
                dayWorkHoursContainer.style.color = 'white';
                dayWorkHoursContainer.style.border = 'none';
            }
            return;
        }
    }
    
    // 默认情况：选择小时模式
    selectWorkType('hours');
}

/**
 * 填充加班部分到加班按钮显示
 * @param {string} overtimePart - 加班部分字符串
 */
function fillOvertimePart(overtimePart) {
    if (!overtimePart) {
        setOvertimeDisplay('无加班');
        // 设置window.overtimeData表示无加班
        window.overtimeData = { type: 'none', value: '' };
        return;
    }
    
    // 处理"半个工"特殊情况
    if (overtimePart.includes('半个工')) {
        setOvertimeDisplay('半个工');
        // 设置window.overtimeData
        window.overtimeData = { type: 'work', value: '0.5' };
        return;
    }
    
    // 处理加班小时数
    if (overtimePart.includes('小时')) {
        const match = overtimePart.match(/(\d+(?:\.\d+)?)\s*小时/);
        if (match) {
            const hours = parseFloat(match[1]);
            setOvertimeDisplay(`${hours}小时`);
            // 设置window.overtimeData
            window.overtimeData = { type: 'hours', value: hours.toString() };
            return;
        }
    }
    
    // 处理加班工数
    if (overtimePart.includes('个工')) {
        const match = overtimePart.match(/(\d+(?:\.\d+)?)\s*个工/);
        if (match) {
            const workUnits = parseFloat(match[1]);
            setOvertimeDisplay(`${workUnits}个工`);
            // 设置window.overtimeData
            window.overtimeData = { type: 'work', value: workUnits.toString() };
            return;
        }
    }
    
    // 默认：设置为无加班
    setOvertimeDisplay('无加班');
    // 设置window.overtimeData表示无加班
    window.overtimeData = { type: 'none', value: '' };
}

/**
 * 选择工作类型
 * @param {string} type - 工作类型：'1', '0.5', 'rest', 'period', 'hours'
 */
function selectWorkType(type) {
    // 隐藏所有输入区域
    hideAllWorkTypeInputs();
    
    // 重置所有按钮的样式
    document.querySelectorAll('.daywork-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.backgroundColor = '#f5f5f5';
        btn.style.color = '#333';
        btn.style.border = '1px solid #ddd';
    });
    
    switch (type) {
        case '1':
            document.getElementById('hiddenRadio1').checked = true;
            const dayWork1Btn = document.getElementById('dayWork1');
            if (dayWork1Btn) {
                dayWork1Btn.classList.add('active');
                dayWork1Btn.style.backgroundColor = '#1890ff';
                dayWork1Btn.style.color = 'white';
                dayWork1Btn.style.border = 'none';
            }
            break;
        case '0.5':
            document.getElementById('hiddenRadio05').checked = true;
            const dayWork05Btn = document.getElementById('dayWork05');
            if (dayWork05Btn) {
                dayWork05Btn.classList.add('active');
                dayWork05Btn.style.backgroundColor = '#1890ff';
                dayWork05Btn.style.color = 'white';
                dayWork05Btn.style.border = 'none';
            }
            break;
        case 'rest':
            document.getElementById('hiddenRadioRest').checked = true;
            const restBtn = document.getElementById('dayWorkRest');
            if (restBtn) {
                restBtn.classList.add('active');
                restBtn.style.backgroundColor = '#1890ff';
                restBtn.style.color = 'white';
                restBtn.style.border = 'none';
            }
            break;
        case 'period':
            document.getElementById('hiddenRadioPeriod').checked = true;
            const morningAfternoonBtn = document.getElementById('morningAfternoonBtn');
            if (morningAfternoonBtn) {
                morningAfternoonBtn.classList.add('active');
                morningAfternoonBtn.style.backgroundColor = '#1890ff';
                morningAfternoonBtn.style.color = 'white';
                morningAfternoonBtn.style.border = 'none';
            }
            break;
        case 'hours':
            document.getElementById('hiddenRadioHours').checked = true;
            // 已删除hoursInput元素，无需处理
            const hoursBtn = document.querySelector('.daywork-btn.hours-select-container');
            if (hoursBtn) {
                hoursBtn.classList.add('active');
                hoursBtn.style.backgroundColor = '#1890ff';
                hoursBtn.style.color = 'white';
                hoursBtn.style.border = 'none';
            }
            break;
    }
}

/**
 * 隐藏所有工作类型输入区域
 */
function hideAllWorkTypeInputs() {
    // 已删除hoursInput元素，无需处理
}

/**
 * 设置加班按钮显示
 * @param {string} displayText - 显示文本
 */
function setOvertimeDisplay(displayText) {
    const overtimeBtn = document.getElementById('overtimeBtn');
    if (overtimeBtn) {
        overtimeBtn.textContent = displayText;
        if (displayText === '无加班') {
            overtimeBtn.style.backgroundColor = 'transparent';
        } else {
            overtimeBtn.style.backgroundColor = '#ff7875';
        }
    }
}

/**
 * 兼容旧数据格式的填充方法
 * @param {string} dayWorkValue - 旧的数据格式值
 * @param {Object} record - 记录对象
 */
function fillWorkTimeByDayWorkValue(dayWorkValue, record) {
    if (!dayWorkValue) return;
    
    switch (dayWorkValue) {
        case '1':
            selectWorkType('1');
            break;
        case '0.5':
            selectWorkType('0.5');
            break;
        case 'rest':
            selectWorkType('rest');
            break;
        case 'period':
            selectWorkType('period');
            break;
        case 'hours':
            selectWorkType('hours');
            if (record.work_hours) {
                // 已删除workHours元素，仅设置选小时按钮
            }
            break;
    }
    
    // 处理加班数据
    if (record.overtime_hours) {
        setOvertimeDisplay(`${record.overtime_hours}小时`);
        // 设置window.overtimeData
        window.overtimeData = { type: 'hours', value: record.overtime_hours.toString() };
    } else if (record.overtime_work) {
        setOvertimeDisplay(`${record.overtime_work}个工`);
        // 设置window.overtimeData
        window.overtimeData = { type: 'work', value: record.overtime_work.toString() };
    } else {
        setOvertimeDisplay('无加班');
        // 设置window.overtimeData表示无加班
        window.overtimeData = { type: 'none', value: '' };
    }
}

// 处理点工字段用于编辑
function handleDayWorkFieldsForEditing(record) {
    // 首先隐藏所有输入区域
    hideAllWorkTypeInputs();
    
    // 重新绑定点工按钮事件，确保编辑模式下1个工、半个工、休息按钮可用
    if (typeof bindDayWorkButtons === 'function') {
        bindDayWorkButtons();
    } else if (typeof window.bindDayWorkButtons === 'function') {
        window.bindDayWorkButtons();
    }
    
    // 重新绑定加班按钮事件
    const overtimeBtn = document.getElementById('overtimeBtn');
    if (overtimeBtn) {
        // 移除旧的事件监听器（如果存在）
        overtimeBtn.removeEventListener('click', showOvertimeModal);
        // 添加新的事件监听器（带类型检查）
        overtimeBtn.addEventListener('click', function() {
            if (typeof showOvertimeModal === 'function') {
                showOvertimeModal();
            }
        });
    }
    
    // 绑定早上下午按钮事件
    const morningAfternoonBtn = document.getElementById('morningAfternoonBtn');
    if (morningAfternoonBtn) {
        morningAfternoonBtn.removeEventListener('click', showMorningAfternoonModal);
        morningAfternoonBtn.addEventListener('click', function() {
            // 重置1个工按钮为默认状态（如果函数存在）
            if (typeof resetDayWork1Button === 'function') {
                resetDayWork1Button();
            }
            
            // 重置小时选择器按钮（如果函数存在）
            if (typeof resetHoursSelectorButton === 'function') {
                resetHoursSelectorButton();
            }
            
            // 显示上下午模态框（如果函数存在）
            if (typeof showMorningAfternoonModal === 'function') {
                showMorningAfternoonModal();
            }
            
            // 切换为 period 选项
            document.querySelectorAll('input[name="dayWork"]').forEach(radio => { radio.checked = false; });
            const periodRadio = document.getElementById('hiddenRadioPeriod');
            if (periodRadio) periodRadio.checked = true;
        });
    }
    
    // 绑定模态框事件
    const confirmMorningAfternoonBtn = document.getElementById('confirmMorningAfternoon');
    const cancelMorningAfternoonBtn = document.getElementById('cancelMorningAfternoon');
    if (confirmMorningAfternoonBtn) {
        confirmMorningAfternoonBtn.removeEventListener('click', confirmMorningAfternoon);
        confirmMorningAfternoonBtn.addEventListener('click', function() {
            if (typeof confirmMorningAfternoon === 'function') {
                confirmMorningAfternoon();
            }
        });
    }
    if (cancelMorningAfternoonBtn) {
        cancelMorningAfternoonBtn.removeEventListener('click', hideMorningAfternoonModal);
        cancelMorningAfternoonBtn.addEventListener('click', function() {
            if (typeof hideMorningAfternoonModal === 'function') {
                hideMorningAfternoonModal();
            }
        });
    }
    
    // 绑定模态框关闭按钮事件
    const morningAfternoonModal = document.getElementById('morningAfternoonModal');
    if (morningAfternoonModal) {
        const closeBtn = morningAfternoonModal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.removeEventListener('click', hideMorningAfternoonModal);
            closeBtn.addEventListener('click', function(e) {
                e.preventDefault();
                if (typeof hideMorningAfternoonModal === 'function') {
                    hideMorningAfternoonModal();
                }
            });
        }
        
        // 绑定模态框外部点击关闭事件
        morningAfternoonModal.removeEventListener('click', function(e) {
            if (e.target === this) {
                if (typeof hideMorningAfternoonModal === 'function') {
                    hideMorningAfternoonModal();
                }
            }
        });
        morningAfternoonModal.addEventListener('click', function(e) {
            if (e.target === this) {
                if (typeof hideMorningAfternoonModal === 'function') {
                    hideMorningAfternoonModal();
                }
            }
        });
    }
    
    // 初始化上下午模态框中的小时选择器（编辑模式专用）
    if (typeof initModalHoursSelector === 'function') {
        initModalHoursSelector();
    }
    if (typeof bindModalHoursSelectorEvents === 'function') {
        bindModalHoursSelectorEvents();
    }
    
    // 绑定模态框中的按钮事件
    if (typeof bindMorningAfternoonButtonEvents === 'function') {
        bindMorningAfternoonButtonEvents();
    }
    
    // 初始化加班模态框中的小时选择器（编辑模式专用）
    if (typeof initOvertimeHoursSelector === 'function') {
        initOvertimeHoursSelector();
    }
    if (typeof bindOvertimeHoursSelectorEvents === 'function') {
        bindOvertimeHoursSelectorEvents();
    }
    
    // 绑定加班模态框按钮事件
    if (typeof bindOvertimeModalButtonEvents === 'function') {
        bindOvertimeModalButtonEvents();
    }
    
    // 初始化加班按钮和关闭事件（使用已声明的overtimeBtn变量）
    if (overtimeBtn) {
        overtimeBtn.textContent = '无加班';
        overtimeBtn.style.backgroundColor = 'transparent';
        overtimeBtn.addEventListener('click', function() {
            if (typeof showOvertimeModal === 'function') {
                showOvertimeModal();
            }
        });
    }
    
    // 解析work_time字段并填充对应的按钮状态
    let overtimeDisplaySet = false; // 标志：加班显示是否已经通过parseAndFillWorkTime设置
    if (record.work_time) {
        parseAndFillWorkTime(record.work_time);
        overtimeDisplaySet = true; // 标记加班显示已经被设置
    } else if (record.day_work_value) {
        // 兼容旧的数据格式
        fillWorkTimeByDayWorkValue(record.day_work_value, record);
    }
    
    // 处理加班数据
    const dayWorkOvertimeBtn = document.getElementById('overtimeBtn');
    if (dayWorkOvertimeBtn) {
        // 重新绑定加班按钮事件，确保编辑模式下加班按钮可用
        dayWorkOvertimeBtn.removeEventListener('click', showOvertimeModal);
        dayWorkOvertimeBtn.addEventListener('click', function() {
            if (typeof showOvertimeModal === 'function') {
                showOvertimeModal();
            }
        });
        
        // 只有当初始化时没有设置加班显示，且记录中确实有加班数据时，才使用记录的加班数据更新显示
        if (!overtimeDisplaySet && (record.overtime_hours || record.overtime_work)) {
            // 处理加班数据并更新加班按钮显示
            if (record.overtime_hours) {
                // 显示加班小时数，不添加"加班"前缀
                dayWorkOvertimeBtn.textContent = `${record.overtime_hours}小时`;
                dayWorkOvertimeBtn.style.backgroundColor = '#ff7875';
                // 设置window.overtimeData
                window.overtimeData = { type: 'hours', value: record.overtime_hours.toString() };
            } else if (record.overtime_work) {
                // 检查是否是半个工，如果是，显示为"半个工"
                if (record.overtime_work === 0.5 || record.overtime_work === '0.5') {
                    dayWorkOvertimeBtn.textContent = '半个工';
                    // 设置window.overtimeData
                    window.overtimeData = { type: 'work', value: '0.5' };
                } else {
                    // 显示加班工数，不添加"加班"前缀
                    dayWorkOvertimeBtn.textContent = `${record.overtime_work}个工`;
                    // 设置window.overtimeData
                    window.overtimeData = { type: 'work', value: record.overtime_work.toString() };
                }
                dayWorkOvertimeBtn.style.backgroundColor = '#ff7875';
            }
        }
        // 如果没有加班数据且没有通过parseAndFillWorkTime设置显示，则显示"无加班"
        else if (!overtimeDisplaySet && !record.overtime_hours && !record.overtime_work) {
            dayWorkOvertimeBtn.textContent = '无加班';
            dayWorkOvertimeBtn.style.backgroundColor = 'transparent';
            // 设置window.overtimeData表示无加班
            window.overtimeData = { type: 'none', value: '' };
        }
    }
    
    // 重新绑定加班模态框关闭事件
    const overtimeModal = document.getElementById('overtimeModal');
    if (overtimeModal) {
        const closeBtn = overtimeModal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.removeEventListener('click', hideOvertimeModal);
            closeBtn.addEventListener('click', function() {
                if (typeof hideOvertimeModal === 'function') {
                    hideOvertimeModal();
                }
            });
        }
        
        // 绑定模态框外部点击关闭事件
        overtimeModal.removeEventListener('click', function(e) {
            if (e.target === this) {
                if (typeof hideOvertimeModal === 'function') {
                    hideOvertimeModal();
                }
            }
        });
        overtimeModal.addEventListener('click', function(e) {
            if (e.target === this) {
                if (typeof hideOvertimeModal === 'function') {
                    hideOvertimeModal();
                }
            }
        });
    }
    
    // 确保加班模态框中的事件已绑定（如果函数存在）
    if (typeof bindOvertimeModalButtonEvents === 'function') {
        bindOvertimeModalButtonEvents();
    }
}

// 处理包工字段用于编辑
function handleContractWorkFieldsForEditing(record) {
    // 清空加班标签内容
    const overtimeLabel = document.querySelector('#overtimeContainer label');
    if (overtimeLabel) {
        overtimeLabel.innerHTML = ''; // 清空标签内容
    }
    
    // 隐藏加班按钮
    const contractOvertimeBtn = document.getElementById('overtimeBtn');
    if (contractOvertimeBtn) {
        contractOvertimeBtn.style.display = 'none';
    }

    // 隐藏模态框相关元素
    const overtimeModal = document.getElementById('overtimeModal');
    if (overtimeModal) {
        overtimeModal.style.display = 'none';
    }

    // 隐藏工量输入框（如果存在）
    const workAmountInputContainer = document.getElementById('workAmountInputContainer');
    if (workAmountInputContainer) {
        workAmountInputContainer.style.display = 'none';
    }
    
    // 确保包工界面已创建
    let amountInputContainer = document.getElementById('amountInputContainer');
    if (!amountInputContainer) {
        // 创建包工界面
        amountInputContainer = document.createElement('div');
        amountInputContainer.id = 'amountInputContainer';
        amountInputContainer.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-top: 10px;';
        amountInputContainer.innerHTML = `
            <label style="color: black; font-weight: bold; margin: 0;">金额：</label>
            <input type="number" id="amountInput" placeholder="*请输入金额" 
                   style="width: 150px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px;" 
                   onfocus="this.setAttribute('placeholder', ''); this.style.fontWeight = 'bold';" 
                   onblur="this.setAttribute('placeholder', '*请输入金额'); this.style.fontWeight = (this.value ? 'bold' : 'normal');">
            <span style="font-size: 16px; color: #666; white-space: nowrap;">元</span>
            <style>
                #amountInput::placeholder {
                    color: red;
                    opacity: 1;
                }
            </style>
        `;
        
        const overtimeContainer = document.getElementById('overtimeContainer');
        overtimeContainer.appendChild(amountInputContainer);
    } else {
        amountInputContainer.style.display = 'flex';
    }
    
    // 填充contract_amount值到金额输入框
    if (record.contract_amount) {
        const amountInput = document.getElementById('amountInput');
        if (amountInput) {
            amountInput.value = record.contract_amount;
            amountInput.style.fontWeight = 'bold';

        }
    }
    
    // 设置金额值
    if (record.amount) {
        const amountInput = document.getElementById('amountInput');
        if (amountInput) {
            amountInput.value = record.amount;
        }
    }
}

// 处理工量字段用于编辑
function handleWorkQuantityFieldsForEditing(record) {
    // 清空加班标签内容
    const overtimeLabel = document.querySelector('#overtimeContainer label');
    if (overtimeLabel) {
        overtimeLabel.innerHTML = ''; // 清空原有标签
    }
    
    // 隐藏加班按钮
    const quantityOvertimeBtn = document.getElementById('overtimeBtn');
    if (quantityOvertimeBtn) {
        quantityOvertimeBtn.style.display = 'none';
    }

    // 隐藏模态框相关元素
    const overtimeModal = document.getElementById('overtimeModal');
    if (overtimeModal) {
        overtimeModal.style.display = 'none';
    }

    // 隐藏金额输入框（如果存在）
    const amountInputContainer = document.getElementById('amountInputContainer');
    if (amountInputContainer) {
        amountInputContainer.style.display = 'none';
    }
    
    // 确保工量界面已创建
    let workAmountInputContainer = document.getElementById('workAmountInputContainer');
    if (!workAmountInputContainer) {
        // 创建工量界面
        workAmountInputContainer = document.createElement('div');
        workAmountInputContainer.id = 'workAmountInputContainer';
        workAmountInputContainer.style.cssText = 'margin-top: 10px; display: flex; flex-direction: column; gap: 12px;';
        workAmountInputContainer.innerHTML = `
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="color: red; font-weight: bold;">*</span>
                                    <label style="color: black; font-weight: bold; margin: 0;">分项：</label>
                                    <div id="subProjectSelector" style="display: flex; align-items: center; gap: 10px;">
                                        <div id="currentSubProject" style="width: 250px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px; cursor: pointer; background-color: white; color: #999;">
                                            请选择分项
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- 分项选择模态框 -->
                                <div id="subProjectModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.3); z-index: 1000; align-items: flex-start; justify-content: flex-end;">
                                    <div style="background-color: white; width: 320px; height: 100%; overflow-y: auto; box-shadow: -2px 0 10px rgba(0,0,0,0.1);">
                                        <div style="padding: 15px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                                            <button id="addSubProjectBtn" style="background-color: #1890ff; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-size: 14px; cursor: pointer;">
                                                添加分项
                                            </button>
                                            <button id="closeSubProjectModal" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666;">×</button>
                                        </div>
                                        <div style="padding: 15px;">
                                            <div id="subProjectList" style="display: flex; flex-direction: column; gap: 10px;">
                                                <!-- 分项列表初始为空，用户通过添加分项功能添加 -->
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="color: red; font-weight: bold;">*</span>
                                    <label style="color: black; font-weight: bold; margin: 0;">工量：</label>
                                    <input type="number" id="workAmountInput" placeholder="请输入工程量" 
                                           style="width: 250px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px;">
                                    <span id="workAmountUnit" style="font-size: 16px; color: #666; white-space: nowrap;"></span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="color: red; font-weight: bold;">*</span>
                                    <label style="color: black; font-weight: bold; margin: 0;">单价：</label>
                                    <input type="number" id="unitPriceInput" placeholder="请输入单价" step="0.01" 
                                           style="width: 250px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px;">
                                    <span id="unitPriceUnit" style="font-size: 16px; color: #666; white-space: nowrap;">元</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="color: red; font-weight: bold;">*</span>
                                    <label style="color: black; font-weight: bold; margin: 0;">工钱：</label>
                                    <input type="number" id="totalPriceInput" placeholder="可输入谈好的价钱" 
                                           style="width: 250px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px;">
                                    <span style="font-size: 16px; color: #666; white-space: nowrap;">元</span>
                                </div>
                            `;
                            
                            const overtimeContainer = document.getElementById('overtimeContainer');
                            overtimeContainer.appendChild(workAmountInputContainer);
                            
                            // 添加自动计算功能
                            const workAmountInput = document.getElementById('workAmountInput');
                            const unitPriceInput = document.getElementById('unitPriceInput');
                            const totalPriceInput = document.getElementById('totalPriceInput');
                            
                            function calculateTotal() {
                                const workAmount = parseFloat(workAmountInput.value) || 0;
                                const unitPrice = parseFloat(unitPriceInput.value) || 0;
                                
                                if (workAmount > 0 && unitPrice > 0) {
                                    const total = Math.floor(workAmount * unitPrice);
                                    totalPriceInput.value = total;
                                } else if (workAmount === 0 || unitPrice === 0) {
                                    totalPriceInput.value = '';
                                }
                            }
                            
                            workAmountInput.addEventListener('input', calculateTotal);
                            unitPriceInput.addEventListener('input', calculateTotal);
                            
                            // 为分项选择器添加点击事件
                            setTimeout(function() {
                                const subProjectSelector = document.getElementById('subProjectSelector');
                                if (subProjectSelector) {
                                    subProjectSelector.onclick = function() {
                                        // 加载本地分项数据（如果函数存在）
                                        if (typeof loadSubProjectsFromLocal === 'function') {
                                            loadSubProjectsFromLocal();
                                        }
                                        
                                        const subProjectModal = document.getElementById('subProjectModal');
                                        if (subProjectModal) {
                                            subProjectModal.style.display = 'flex';
                                        }
                                    };
                                }
                                
                                // 为分项选择模态框中的添加分项按钮绑定事件
                                const addSubProjectBtnInModal = document.getElementById('addSubProjectBtn');
                                if (addSubProjectBtnInModal) {
                                    addSubProjectBtnInModal.onclick = function() {
                                        const addSubProjectModal = document.getElementById('addSubProjectModal');
                                        if (addSubProjectModal) {
                                            addSubProjectModal.style.display = 'flex';
                                        }
                                    };
                                }
                                
                                // 为关闭按钮添加点击事件
                                const closeSubProjectModal = document.getElementById('closeSubProjectModal');
                                if (closeSubProjectModal) {
                                    closeSubProjectModal.onclick = function() {
                                        const subProjectModal = document.getElementById('subProjectModal');
                                        if (subProjectModal) {
                                            subProjectModal.style.display = 'none';
                                        }
                                    };
                                }
                                
                                // 点击模态框外部关闭模态框
                                const subProjectModal = document.getElementById('subProjectModal');
                                if (subProjectModal) {
                                    subProjectModal.onclick = function(e) {
                                        if (e.target === subProjectModal) {
                                            subProjectModal.style.display = 'none';
                                        }
                                    };
                                }
                            }, 100);
                            
                            // 绑定分项管理事件（如果函数存在）
                            if (typeof bindSubProjectManagementEvents === 'function') {
                                bindSubProjectManagementEvents();
                            }
                            
                            // 初始化分项选择器事件（如果函数存在）
                            if (typeof initSubProjectSelector === 'function') {
                                initSubProjectSelector();
                            }
    } else {
        workAmountInputContainer.style.display = 'flex';
    }
    
    // 解析work_time内容，提取分项和单位
    if (record.work_time) {
        // 格式如："扎柱/条"
        const parts = record.work_time.split('/');
        if (parts.length >= 2) {
            const subProject = parts[0].trim(); // 分项：扎柱
            const unit = parts[1].trim(); // 单位：条
            
            // 填充分项到选择分项输入框
            const currentSubProject = document.getElementById('currentSubProject');
            if (currentSubProject) {
                currentSubProject.textContent = subProject;
                currentSubProject.style.color = '#333';
            }
            
            // 设置单位到工量输入框后面
            const workAmountUnit = document.getElementById('workAmountUnit');
            if (workAmountUnit) {
                workAmountUnit.textContent = unit;
            }
            
            // 设置单位到单价输入框后面（元/条）
            const unitPriceUnit = document.getElementById('unitPriceUnit');
            if (unitPriceUnit) {
                unitPriceUnit.textContent = `元/${unit}`;
            }
        }
    }
    
    // 填充work_quantity到工量输入框
    if (record.work_quantity) {
        const workAmountInput = document.getElementById('workAmountInput');
        if (workAmountInput) {
            workAmountInput.value = record.work_quantity;
        }
    }
    
    // 填充unit_price到单价输入框
    if (record.unit_price) {
        const unitPriceInput = document.getElementById('unitPriceInput');
        if (unitPriceInput) {
            unitPriceInput.value = record.unit_price;
        }
    }
    
    // 填充contract_amount到工钱输入框
    if (record.contract_amount) {
        const totalPriceInput = document.getElementById('totalPriceInput');
        if (totalPriceInput) {
            totalPriceInput.value = record.contract_amount;
        }
    }
}

// 处理备注和图片信息用于编辑
async function handleRemarkAndImagesForEditing(record) {
    // 设置备注
    if (record.remark) {
        const remarkElement = document.getElementById('remark');
        if (remarkElement) {
            remarkElement.value = record.remark;
        }
    }
    
    // 初始化图片上传容器
    if (typeof initImageUpload === 'function') {
        initImageUpload();
    }
    
    // 清空现有图片
    if (typeof window.clearImage === 'function') {
        window.clearImage();
    }
    
    // 初始化图片数组
    window.selectedImages = [];
    
    // 保存原始图片URL，用于后续对比图片是否变更
    window.originalImageIds = [];
    
    // 处理 image_ids 字段 - 下载图片链接到本地
    if (record.image_ids && Array.isArray(record.image_ids) && record.image_ids.length > 0) {
        // 保存原始图片URL
        window.originalImageIds = [...record.image_ids];
        
        // 显示加载状态
        showImageLoadingStatus();
        
        try {
            // 逐一下载图片链接
            for (let i = 0; i < record.image_ids.length; i++) {
                const imageUrl = record.image_ids[i];
                if (typeof imageUrl === 'string' && imageUrl.trim()) {
                    try {
                        const imageData = await downloadImageToDataURL(imageUrl);
                        if (imageData) {
                            // 为图片对象添加原始URL属性，用于后续对比
                            imageData.originalUrl = imageUrl;
                            window.selectedImages.push(imageData);
                        }
                    } catch (error) {
                        console.error(`下载图片失败 (${i + 1}):`, imageUrl, error);
                        // 继续处理其他图片
                    }
                }
            }
            
            // 隐藏加载状态
            hideImageLoadingStatus();
            
            // 渲染图片预览
            if (window.selectedImages.length > 0) {
                renderImagePreviews(window.selectedImages);
            }
            
        } catch (error) {
            console.error('处理图片链接时出错:', error);
            hideImageLoadingStatus();
        }
    }
    // 兼容处理 images 字段（如果存在）
    else if (record.images && record.images.length > 0) {
        window.selectedImages = record.images || [];
        
        // 如果有图片数据，重新渲染图片预览
        if (window.selectedImages.length > 0) {
            renderImagePreviews(window.selectedImages);
        }
    }
}

/**
 * 下载图片链接到 DataURL
 * @param {string} imageUrl - 图片URL
 * @returns {Promise<Object>} 包含dataURL和name的对象
 */
async function downloadImageToDataURL(imageUrl) {
    return new Promise((resolve, reject) => {
        try {
            // 从URL中解析图片名称
            const urlParts = imageUrl.split('/');
            let originalName = urlParts[urlParts.length - 1];
            
            // 去除URL参数和哈希值
            originalName = originalName.split('?')[0].split('#')[0];
            
            // 创建图片对象
            const img = new Image();
            img.crossOrigin = 'anonymous'; // 处理跨域问题
            
            img.onload = function() {
                try {
                    // 创建 canvas 来转换图片为 DataURL
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // 设置 canvas 尺寸
                    canvas.width = img.width;
                    canvas.height = img.height;
                    
                    // 绘制图片
                    ctx.drawImage(img, 0, 0);
                    
                    // 转换为 DataURL
                    const dataURL = canvas.toDataURL('image/jpeg', 0.8);
                    
                    // 从DataURL创建Blob对象
                    fetch(dataURL) // 使用fetch获取Blob
                        .then(response => response.blob())
                        .then(blob => {
                            // 创建带有原始文件名的File对象
                            const file = new File([blob], originalName, {
                                type: blob.type,
                                lastModified: Date.now()
                            });
                            resolve(file);
                        })
                        .catch(error => {
                            console.error('从DataURL创建Blob失败:', error);
                            // 如果创建File对象失败，至少返回带有名称的dataURL对象
                            resolve({
                                dataURL: dataURL,
                                name: originalName
                            });
                        });
                } catch (error) {
                    console.error('转换图片为 DataURL 失败:', error);
                    reject(error);
                }
            };
            
            img.onerror = function(error) {
                console.error('加载图片失败:', imageUrl, error);
                reject(new Error('图片加载失败'));
            };
            
            // 开始加载图片
            img.src = imageUrl;
            
        } catch (error) {
            console.error('下载图片失败:', error);
            reject(error);
        }
    });
}

/**
 * 显示图片加载状态
 */
function showImageLoadingStatus() {
    const container = document.getElementById('imageUploadContainer');
    if (container) {
        // 创建加载指示器
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'imageLoadingIndicator';
        loadingDiv.style.cssText = `
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(255, 255, 255, 0.9); padding: 10px 20px; border-radius: 4px;
            border: 1px solid #ddd; font-size: 14px; color: #666;
        `;
        loadingDiv.innerHTML = '正在下载图片...';
        container.style.position = 'relative';
        container.appendChild(loadingDiv);
    }
}

/**
 * 隐藏图片加载状态
 */
function hideImageLoadingStatus() {
    const loadingIndicator = document.getElementById('imageLoadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
}

// 渲染图片预览
function renderImagePreviews(images) {
    const container = document.getElementById('imageUploadContainer');
    if (!container) return;
    
    images.forEach((imageData, index) => {
        const previewItem = document.createElement('div');
        previewItem.className = 'image-preview-item';
        previewItem.style.position = 'relative';
        previewItem.style.width = '100px';
        previewItem.style.height = '100px';
        previewItem.style.borderRadius = '4px';
        previewItem.style.overflow = 'hidden';
        previewItem.style.border = '1px solid #ddd';
        
        // 保存文件索引，用于删除
        previewItem.dataset.fileIndex = index;
        
        // 预览图片
        const previewImg = document.createElement('img');
        let imgSrc = '';
        
        // 处理不同类型的图片数据
        if (imageData instanceof File || imageData instanceof Blob) {
            // 对于File或Blob对象，创建临时URL
            imgSrc = URL.createObjectURL(imageData);
        } else if (imageData.dataURL) {
            // 对于包含dataURL的对象
            imgSrc = imageData.dataURL;
        } else if (imageData.src) {
            // 对于包含src属性的对象
            imgSrc = imageData.src;
        } else {
            // 对于普通字符串（如直接的dataURL）
            imgSrc = imageData;
        }
        
        previewImg.src = imgSrc;
        previewImg.style.width = '100%';
        previewImg.style.height = '100%';
        previewImg.style.objectFit = 'cover';
        previewImg.style.cursor = 'pointer';
        
        // 查看大图功能
        previewImg.addEventListener('click', function() {
            // 重新获取图片源，确保使用最新的URL
            let modalImgSrc = '';
            
            if (imageData instanceof File || imageData instanceof Blob) {
                // 对于File或Blob对象，创建临时URL
                modalImgSrc = URL.createObjectURL(imageData);
            } else if (imageData.dataURL) {
                // 对于包含dataURL的对象
                modalImgSrc = imageData.dataURL;
            } else if (imageData.src) {
                // 对于包含src属性的对象
                modalImgSrc = imageData.src;
            } else {
                // 对于普通字符串（如直接的dataURL）
                modalImgSrc = imageData;
            }
            
            const modal = document.getElementById('imageModal');
            modal.innerHTML = `
                <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 2001;" 
                     onclick="if(event.target === this) document.getElementById('imageModal').style.display='none'">
                    <img id="draggableImage" src="${modalImgSrc}" 
                         style="max-width: 90%; max-height: 90%; position: absolute; cursor: move; top: 50%; left: 50%; transform: translate(-50%, -50%);"
                         ondragstart="return false;">
                    <button onclick="document.getElementById('imageModal').style.display='none'" 
                            style="position: fixed; top: 20px; right: 20px; background: #f5222d; color: white; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 20px; cursor: pointer; z-index: 2002;">×</button>
                </div>
            `;
            modal.style.display = 'block';
            
            // 图片拖动功能
            const img = document.getElementById('draggableImage');
            let isDragging = false;
            let offsetX, offsetY;
            let scale = 1; // 初始缩放比例

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
            
            // 鼠标滚轮缩放功能
            img.addEventListener('wheel', function(e) {
                e.preventDefault(); // 阻止页面滚动
                
                // 获取当前缩放值
                const delta = e.deltaY > 0 ? 0.9 : 1.1; // 向下滚动缩小，向上滚动放大
                const oldScale = scale;
                scale *= delta;
                
                // 限制缩放范围
                scale = Math.min(Math.max(0.5, scale), 3); // 最小0.5倍，最大3倍
                
                // 计算缩放后的位置，保持图片中心点在窗口中心
                const modalRect = img.parentElement.getBoundingClientRect();
                const centerX = modalRect.width / 2;
                const centerY = modalRect.height / 2;
                
                // 如果图片没有拖动过，则居中显示
                if (!img.style.left && !img.style.top) {
                    img.style.left = centerX + 'px';
                    img.style.top = centerY + 'px';
                }
                
                // 调整位置以保持中心点不变
                const currentLeft = parseFloat(img.style.left) || centerX;
                const currentTop = parseFloat(img.style.top) || centerY;
                
                img.style.left = currentLeft - (currentLeft - centerX) * (scale - oldScale) + 'px';
                img.style.top = currentTop - (currentTop - centerY) * (scale - oldScale) + 'px';
                
                // 应用缩放，并设置变换原点为图片中心
                img.style.transformOrigin = 'center';
                img.style.transform = `scale(${scale})`;
            });
        });
        
        // 删除按钮
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '×';
        deleteBtn.style.cssText = `
            position: absolute; top: 2px; right: 2px; 
            background: rgba(255, 59, 48, 0.8); color: white; 
            border: none; border-radius: 50%; width: 20px; height: 20px; 
            font-size: 12px; cursor: pointer; z-index: 100;
        `;
        
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const fileIndex = parseInt(this.parentElement.dataset.fileIndex);
            
            if (!isNaN(fileIndex) && fileIndex >= 0 && fileIndex < window.selectedImages.length) {
                // 从全局数组中移除
                window.selectedImages.splice(fileIndex, 1);
                
                // 移除预览项
                this.parentElement.remove();
                
                // 更新所有剩余图片预览项的索引
                const container = document.getElementById('imageUploadContainer');
                if (container) {
                    const previewItems = container.querySelectorAll('.image-preview-item');
                    previewItems.forEach((item, newIndex) => {
                        item.dataset.fileIndex = newIndex;
                    });
                }
                
                console.log('删除图片，索引:', fileIndex, '当前数组长度:', window.selectedImages.length);
            }
        });
        
        previewItem.appendChild(previewImg);
        previewItem.appendChild(deleteBtn);
        
        // 添加到容器中（在添加按钮之前）
        const addButton = container.querySelector('.image-upload-item');
        if (addButton) {
            container.insertBefore(previewItem, addButton);
        } else {
            container.appendChild(previewItem);
        }
    });
}

// 导出所有处理函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        // 工作类型处理函数
        handleDayWorkFieldsForEditing,
        handleContractWorkFieldsForEditing,
        handleWorkQuantityFieldsForEditing,
        
        // 备注和图片处理函数
        handleRemarkAndImagesForEditing,
        
        // 工作时间解析函数
        parseAndFillWorkTime,
        fillWorkPart,
        fillOvertimePart,
        selectWorkType,
        hideAllWorkTypeInputs,
        setOvertimeDisplay,
        fillWorkTimeByDayWorkValue,
        
        // 图片处理函数
        renderImagePreviews,
        downloadImageToDataURL,
        showImageLoadingStatus,
        hideImageLoadingStatus
    };
}