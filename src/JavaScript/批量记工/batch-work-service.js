/**
 * 批量记工服务
 * 负责处理批量记工数据的收集、验证和保存
 */
class BatchWorkService {
    constructor() {
        this.regularHoursPerDay = 8;
        this.overtimeHoursPerDay = 0;
        this.employees = [];
        this.projectConfig = null;
    }

    /**
     * 播放成功提示音
     */
    playSuccessSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            function playTone(frequency, startTime, duration, type = 'sine') {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.frequency.value = frequency;
                oscillator.type = type;

                gainNode.gain.setValueAtTime(0, startTime);
                gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

                oscillator.start(startTime);
                oscillator.stop(startTime + duration);
            }

            const now = audioContext.currentTime;
            playTone(523.25, now, 0.15);
            playTone(659.25, now + 0.15, 0.15);
            playTone(783.99, now + 0.3, 0.25);
        } catch (e) {
            console.log('音频播放失败:', e);
        }
    }

    /**
     * 显示通知消息
     * @param {string} message - 消息内容
     * @param {boolean} isError - 是否为错误消息
     */
    showNotification(message, isError = false) {
        const notification = document.getElementById('notification');
        if (!notification) {
            alert(message);
            return;
        }
        
        // 播放成功提示音：当消息包含"成功"且不是错误消息时
        if (!isError && message.includes('成功')) {
            this.playSuccessSound();
        }
        
        notification.textContent = message;
        notification.className = isError ? 'notification error' : 'notification';
        notification.style.cssText = `
            display: block;
            visibility: visible;
            opacity: 1;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 16px 24px;
            background: ${isError ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 15px 40px rgba(16, 185, 129, 0.4);
            z-index: 9999;
            font-weight: 700;
            font-size: 16px;
            min-width: 200px;
            text-align: center;
        `;
        
        setTimeout(() => {
            notification.style.transition = 'opacity 0.3s ease-out';
            notification.style.opacity = '0';
            setTimeout(() => {
                notification.style.display = 'none';
            }, 300);
        }, 5000);
    }

    /**
     * 显示确认模态框
     * @param {string} title - 标题
     * @param {string} message - 消息内容
     * @param {Function} confirmCallback - 确认回调
     */
    showConfirmModal(title, message, confirmCallback) {
        document.querySelectorAll('.modal').forEach(existingModal => {
            const hasFunctionalId = existingModal.id && (
                existingModal.id === 'overtimeModal' || 
                existingModal.id === 'morningAfternoonModal' ||
                existingModal.id === 'addEmployeeModal' ||
                existingModal.id === 'datePickerModal' ||
                existingModal.id === 'imageModal'
            );
            if (!hasFunctionalId && !existingModal.classList.contains('functional-modal')) {
                existingModal.remove();
            }
        });
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = `
            display: flex;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 9998;
            justify-content: center;
            align-items: center;
        `;
        
        const formattedMessage = this.formatConfirmationMessage(message);
        
        modal.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
                padding: 24px 28px;
                border-radius: 12px;
                width: 360px;
                max-width: 90%;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.1);
                border: 1px solid rgba(0, 0, 0, 0.08);
                animation: modalSlideIn 0.3s ease-out;
            ">
                <h3 style="
                    color: #ED7D31;
                    margin: 0 0 16px 0;
                    font-size: 18px;
                    font-weight: 600;
                    text-align: center;
                    padding-bottom: 12px;
                    border-bottom: 2px solid #f0f0f0;
                ">${title}</h3>
                <div style="
                    line-height: 1.8;
                    font-size: 15px;
                    color: #333;
                    padding: 8px 0;
                ">${formattedMessage}</div>
                <div style="
                    display: flex;
                    justify-content: center;
                    gap: 16px;
                    margin-top: 24px;
                ">
                    <button id="confirmAction" style="
                        background: linear-gradient(135deg, #52c41a 0%, #389e0d 100%);
                        color: white;
                        border: none;
                        padding: 10px 32px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 600;
                        font-size: 14px;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 8px rgba(82, 196, 26, 0.3);
                    ">确认</button>
                    <button id="cancelAction" style="
                        background: linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%);
                        color: white;
                        border: none;
                        padding: 10px 32px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 600;
                        font-size: 14px;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 8px rgba(255, 77, 79, 0.3);
                    ">取消</button>
                </div>
            </div>
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes modalSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px) scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(modal);
        
        setTimeout(() => {
            const confirmButton = modal.querySelector('#confirmAction');
            const cancelButton = modal.querySelector('#cancelAction');
            
            if (confirmButton) {
                confirmButton.addEventListener('click', () => {
                    confirmCallback();
                    modal.remove();
                });
                confirmButton.addEventListener('mouseenter', () => {
                    confirmButton.style.transform = 'translateY(-1px)';
                    confirmButton.style.boxShadow = '0 4px 12px rgba(82, 196, 26, 0.4)';
                });
                confirmButton.addEventListener('mouseleave', () => {
                    confirmButton.style.transform = 'translateY(0)';
                    confirmButton.style.boxShadow = '0 2px 8px rgba(82, 196, 26, 0.3)';
                });
            }
            
            if (cancelButton) {
                cancelButton.addEventListener('click', () => {
                    modal.remove();
                });
                cancelButton.addEventListener('mouseenter', () => {
                    cancelButton.style.transform = 'translateY(-1px)';
                    cancelButton.style.boxShadow = '0 4px 12px rgba(255, 77, 79, 0.4)';
                });
                cancelButton.addEventListener('mouseleave', () => {
                    cancelButton.style.transform = 'translateY(0)';
                    cancelButton.style.boxShadow = '0 2px 8px rgba(255, 77, 79, 0.3)';
                });
            }
        }, 0);
    }

    /**
     * 格式化确认消息
     * @param {string} message - 原始消息
     * @returns {string} 格式化后的消息
     */
    formatConfirmationMessage(message) {
        const lines = message.split('\n');
        const formattedLines = lines.map(line => {
            if (line.includes(':') && !line.includes('确认')) {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const label = parts[0];
                    const data = parts.slice(1).join(':');
                    return `<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #eee;">
                        <span style="color: #666; font-weight: 500;">${label}:</span>
                        <span style="color: #1890ff; font-weight: 600;">${data}</span>
                    </div>`;
                }
            }
            return `<div style="text-align: center; color: #888; margin-top: 12px; font-size: 14px;">${line}</div>`;
        });
        return formattedLines.join('');
    }

    /**
     * 获取项目配置
     * @param {string} projectId - 项目ID
     * @returns {Object|null} 项目配置
     */
    getProjectConfig(projectId) {
        try {
            const userId = JSON.parse(localStorage.getItem('currentUser'))?.user_id || 'default';
            const projectsData = localStorage.getItem('project_cache_' + userId);
            if (projectsData) {
                const projects = JSON.parse(projectsData);
                const project = projects.find(p => p.project_id === projectId);
                if (project) {
                    return {
                        regular_hours: parseFloat(project.regular_hours) || 8,
                        overtime_hours: parseFloat(project.overtime_hours) || 0,
                        project_name: project.project_name
                    };
                }
            }
            return null;
        } catch (error) {
            console.error('获取项目配置失败:', error);
            return null;
        }
    }

    /**
     * 获取员工列表
     * @param {string} projectId - 项目ID
     * @returns {Array} 员工列表
     */
    getEmployeeList(projectId) {
        try {
            const phone = localStorage.getItem('loggedInPhone') || 'default';
            const employees = [];
            
            const projectEmployeeKey = `employees_${projectId}`;
            const projectEmployeeData = localStorage.getItem(projectEmployeeKey);
            if (projectEmployeeData) {
                const parsed = JSON.parse(projectEmployeeData);
                if (parsed.employees && Array.isArray(parsed.employees)) {
                    return parsed.employees;
                }
            }
            
            const cacheKey = 'employee_cache_' + phone;
            const cacheData = localStorage.getItem(cacheKey);
            if (cacheData) {
                const empList = JSON.parse(cacheData);
                if (Array.isArray(empList)) {
                    return empList;
                }
            }
            
            return employees;
        } catch (error) {
            console.error('获取员工列表失败:', error);
            return [];
        }
    }

    /**
     * 根据工号和姓名查找员工ID
     * @param {string} empCode - 工号
     * @param {string} empName - 姓名
     * @param {Array} employees - 员工列表
     * @returns {string|null} 员工ID
     */
    findEmployeeId(empCode, empName, employees) {
        const employee = employees.find(emp => 
            emp.emp_code === empCode || 
            (emp.emp_code === empCode && emp.emp_name === empName)
        );
        return employee ? employee.employee_id : null;
    }

    /**
     * 解析日期字符串为标准格式
     * @param {string} dateStr - 原始日期字符串
     * @returns {string} 标准格式日期 (YYYY-MM-DD)
     */
    parseDate(dateStr) {
        if (!dateStr) return new Date().toISOString().split('T')[0];
        
        dateStr = dateStr.trim();
        
        const yearMatch = dateStr.match(/(\d{4})/);
        const monthMatch = dateStr.match(/(\d{1,2})月/);
        const dayMatch = dateStr.match(/(\d{1,2})日/);
        
        if (yearMatch && monthMatch && dayMatch) {
            const year = yearMatch[1];
            const month = monthMatch[1].padStart(2, '0');
            const day = dayMatch[1].padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        
        const dateMatch = dateStr.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
        if (dateMatch) {
            const year = dateMatch[1];
            const month = dateMatch[2].padStart(2, '0');
            const day = dateMatch[3].padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        
        return new Date().toISOString().split('T')[0];
    }

    /**
     * 解析单元格值
     * @param {string} value - 单元格值
     * @param {string} columnType - 列类型 (morning/afternoon/overtime/contract)
     * @param {number} regularHours - 正常工作时间
     * @param {number} overtimeHours - 加班时间
     * @returns {Object} 解析结果 {value, type}
     */
    parseCellValue(value, columnType, regularHours, overtimeHours) {
        if (!value || value.trim() === '') {
            return { value: null, type: 'empty' };
        }
        
        value = value.trim();
        
        if (value === 'X' || value === 'x' || value === '×' || value === 'X') {
            if (columnType === 'morning' || columnType === 'afternoon') {
                return { value: '休息', type: 'rest' };
            } else {
                return { value: null, type: 'empty' };
            }
        }
        
        if (value === '✓' || value === '✓' || value === '√' || value === 'J' || value === 'j') {
            if (columnType === 'morning' || columnType === 'afternoon') {
                return { value: regularHours / 2, type: 'half_work' };
            } else if (columnType === 'overtime') {
                return { value: overtimeHours / 2, type: 'half_overtime' };
            }
        }
        
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
            return { value: numValue, type: 'hours' };
        }
        
        return { value: null, type: 'empty' };
    }

    /**
     * 生成工作时间描述
     * @param {number} morningHours - 上午工时
     * @param {number} afternoonHours - 下午工时
     * @param {number} overtimeHours - 加班工时
     * @param {number} regularHours - 正常工作时间
     * @param {number} projectOvertimeHours - 项目加班时间
     * @returns {string} 工作时间描述
     */
    generateWorkTime(morningHours, afternoonHours, overtimeHours, regularHours, projectOvertimeHours) {
        const parts = [];
        
        const halfRegular = regularHours / 2;
        const halfOvertime = projectOvertimeHours / 2;
        
        if (morningHours === '休息' || morningHours === null) {
            parts.push('上午休息');
        } else if (morningHours === halfRegular) {
            parts.push('上午半个工');
        } else if (morningHours > 0) {
            parts.push(`上午${morningHours}小时`);
        } else {
            parts.push('上午休息');
        }
        
        if (afternoonHours === '休息' || afternoonHours === null) {
            parts.push('下午休息');
        } else if (afternoonHours === halfRegular) {
            parts.push('下午半个工');
        } else if (afternoonHours > 0) {
            parts.push(`下午${afternoonHours}小时`);
        } else {
            parts.push('下午休息');
        }
        
        let workTime = parts.join('-');
        
        if (overtimeHours !== null && overtimeHours > 0) {
            if (overtimeHours === halfOvertime) {
                workTime += '/加班半个工';
            } else {
                workTime += `/${overtimeHours}小时`;
            }
        }
        
        return workTime;
    }

    /**
     * 收集表格数据
     * @returns {Object} 收集的数据
     */
    collectTableData() {
        const projectNameInput = document.getElementById('projectName');
        const projectId = localStorage.getItem('currentProjectId');
        const projectNameFromInput = projectNameInput ? projectNameInput.value.trim() : '';
        
        const headerCompany = document.querySelector('.header-info .company');
        const headerDate = document.querySelector('.header-info .date');
        
        const projectNameFromHeader = headerCompany ? headerCompany.textContent.trim() : '';
        const dateStr = headerDate ? headerDate.textContent.trim() : '';
        
        if (!projectNameFromInput) {
            return {
                success: false,
                error: '未选择项目，请先选择项目'
            };
        }
        
        if (!projectNameFromHeader) {
            return {
                success: false,
                error: '请先选择并加载JSON文件'
            };
        }
        
        if (projectNameFromInput !== projectNameFromHeader) {
            return {
                success: false,
                error: '当前项目不匹配请检查'
            };
        }
        
        const phone = localStorage.getItem('loggedInPhone');
        if (!phone) {
            return {
                success: false,
                error: '未找到登录用户信息'
            };
        }
        
        const projectConfig = this.getProjectConfig(projectId);
        if (!projectConfig) {
            return {
                success: false,
                error: '未找到项目配置信息'
            };
        }
        
        this.regularHoursPerDay = projectConfig.regular_hours;
        this.overtimeHoursPerDay = projectConfig.overtime_hours;
        
        const employees = this.getEmployeeList(projectId);
        
        const recordDate = this.parseDate(dateStr);
        
        const tableBody1 = document.getElementById('tableBody1');
        const tableBody2 = document.getElementById('tableBody2');
        
        const records = [];
        const unmatchedEmployees = [];
        
        const processRow = (row, tableIndex, rowIndex) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 7) {
                return;
            }
            
            const isBlue = row.classList.contains('blue-row');
            
            const empCode = cells[1].textContent.trim();
            const empName = cells[2].textContent.trim();
            const morningValue = cells[3].textContent.trim();
            const afternoonValue = cells[4].textContent.trim();
            const overtimeValue = cells[5].textContent.trim();
            const contractValue = cells[6].textContent.trim();
            
            if (!empCode && !empName) {
                return;
            }
            
            const morningParsed = this.parseCellValue(morningValue, 'morning', this.regularHoursPerDay, this.overtimeHoursPerDay);
            const afternoonParsed = this.parseCellValue(afternoonValue, 'afternoon', this.regularHoursPerDay, this.overtimeHoursPerDay);
            const overtimeParsed = this.parseCellValue(overtimeValue, 'overtime', this.regularHoursPerDay, this.overtimeHoursPerDay);
            const contractParsed = this.parseCellValue(contractValue, 'contract', this.regularHoursPerDay, this.overtimeHoursPerDay);
            
            const hasPointWork = morningParsed.value !== null || afternoonParsed.value !== null || overtimeParsed.value !== null;
            const hasContractWork = contractParsed.value !== null && contractParsed.value > 0;
            
            if (!hasPointWork && !hasContractWork) {
                return;
            }
            
            const employeeId = this.findEmployeeId(empCode, empName, employees);
            if (!employeeId) {
                unmatchedEmployees.push({ empCode, empName });
                return;
            }
            
            if (hasPointWork) {
                let morningHours = 0;
                let afternoonHours = 0;
                let overtimeHours = 0;
                let regularHoursTotal = 0;
                
                if (morningParsed.type === 'rest') {
                    morningHours = '休息';
                } else if (morningParsed.value !== null) {
                    morningHours = morningParsed.value;
                    if (typeof morningHours === 'number') {
                        regularHoursTotal += morningHours;
                    }
                }
                
                if (afternoonParsed.type === 'rest') {
                    afternoonHours = '休息';
                } else if (afternoonParsed.value !== null) {
                    afternoonHours = afternoonParsed.value;
                    if (typeof afternoonHours === 'number') {
                        regularHoursTotal += afternoonHours;
                    }
                }
                
                if (overtimeParsed.value !== null && typeof overtimeParsed.value === 'number') {
                    overtimeHours = overtimeParsed.value;
                }
                
                const workTime = this.generateWorkTime(
                    morningHours, 
                    afternoonHours, 
                    overtimeHours, 
                    this.regularHoursPerDay, 
                    this.overtimeHoursPerDay
                );
                
                records.push({
                    type: '点工',
                    employee_id: employeeId,
                    emp_code: empCode,
                    emp_name: empName,
                    regular_hours: regularHoursTotal,
                    overtime_hours: overtimeHours,
                    work_time: workTime,
                    contract_amount: 0,
                    work_quantity: 0,
                    unit_price: 0
                });
            }
            
            if (hasContractWork) {
                records.push({
                    type: '包工',
                    employee_id: employeeId,
                    emp_code: empCode,
                    emp_name: empName,
                    regular_hours: 0,
                    overtime_hours: 0,
                    work_time: '金额',
                    contract_amount: contractParsed.value,
                    work_quantity: 0,
                    unit_price: 0
                });
            }
        };
        
        if (tableBody1) {
            const rows1 = tableBody1.querySelectorAll('tr');
            rows1.forEach((row, index) => processRow(row, 1, index));
        }
        
        if (tableBody2) {
            const rows2 = tableBody2.querySelectorAll('tr');
            rows2.forEach((row, index) => processRow(row, 2, index));
        }
        
        return {
            success: true,
            projectId,
            projectName: projectNameFromInput,
            recordDate,
            phone,
            records,
            unmatchedEmployees,
            regularHoursPerDay: this.regularHoursPerDay,
            overtimeHoursPerDay: this.overtimeHoursPerDay
        };
    }

    /**
     * 中文转英文的辅助函数 - 使用pinyin-pro库将中文转为拼音
     * @param {string} str - 输入字符串
     * @returns {string} 转换后的英文字符串
     */
    _convertChineseToEnglish(str) {
        if (!str) {
            return 'image';
        }
        
        // 检查字符串是否包含中文汉字
        const hasChinese = /[\u4e00-\u9fa5]/.test(str);
        
        // 如果没有中文，直接返回处理后的原始字符串
        if (!hasChinese) {
            // 只处理特殊字符
            let result = str;
            // 只移除真正的特殊字符，保留字母、数字、下划线、连字符、点和空格
            result = result.replace(/[^a-zA-Z0-9_.-\s]/g, '_');
            // 去除多余的下划线，将连续多个下划线替换为单个下划线
            result = result.replace(/_+/g, '_');
            // 去除首尾的下划线
            result = result.trim().replace(/^_|_$/g, '');
            // 确保文件名不为空
            return result || 'image';
        }
        
        let result = '';
        
        try {
            // 更可靠的方法：将字符串分割为中文和非中文部分
            // 使用正则表达式将字符串分割为中文和非中文部分的数组
            const parts = str.split(/([\u4e00-\u9fa5]+)/);
            
            // 检查pinyin-pro库是否可用
            if (typeof window.pinyinPro !== 'undefined' && typeof window.pinyinPro.pinyin === 'function') {
                // 遍历所有部分
                for (const part of parts) {
                    if (/[\u4e00-\u9fa5]/.test(part)) {
                        // 是中文，转换为拼音
                        let pinyin = window.pinyinPro.pinyin(part, {
                            tone: false,  // 不带声调
                            type: 'string',  // 返回字符串
                            separator: ''  // 空分隔符，生成连续的拼音
                        });
                        // 确保去除所有下划线，无论pinyin库返回什么
                        pinyin = pinyin.replace(/_/g, '');
                        result += pinyin;
                    } else {
                        // 不是中文，直接添加
                        result += part;
                    }
                }
            } else {
                // 如果pinyin-pro库不可用，使用简单的占位符
                result = 'image';
            }
        } catch (error) {
            console.warn('中文转拼音失败:', error);
            result = 'image';
        }
        
        // 只保留字母、数字、下划线、连字符和点
        result = result.replace(/[^a-zA-Z0-9_.-]/g, '_');
        // 去除多余的下划线
        result = result.replace(/_+/g, '_');
        // 去除首尾的下划线
        result = result.trim().replace(/^_|_$/g, '');
        
        // 确保结果不为空
        return result || 'image';
    }

    /**
     * 将图片转换为Base64格式
     * @param {File} image - 图片文件
     * @returns {Promise<string>} Base64字符串
     */
    async convertImageToBase64(image) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(image);
        });
    }

    /**
     * 上传图片到Supabase存储
     * @param {Array} images - 图片数组
     * @param {string} projectId - 项目ID
     * @param {string} recordDate - 记工日期
     * @param {boolean} isOffline - 是否离线模式
     * @returns {Promise<Object>} 返回对象 { urls: Array, localImages: Array }
     */
    async uploadImagesToSupabase(images, projectId, recordDate, isOffline = false) {
        try {
            let supabase;
            if (typeof window.waitForSupabase === 'function') {
                supabase = await window.waitForSupabase();
            } else if (window.supabase) {
                supabase = window.supabase;
            } else {
                console.warn('Supabase未初始化');
                return { urls: [], localImages: [] };
            }
            
            const bucketName = 'FYKQ';
            const folderName = 'attendance';
            const uploadedUrls = [];
            const localImages = [];
            
            const dateStr = recordDate;
            
            for (let i = 0; i < images.length; i++) {
                const image = images[i];
                
                let fileExtension = 'jpg';
                if (image.name && image.name.includes('.')) {
                    fileExtension = image.name.split('.').pop();
                } else if (image.type) {
                    fileExtension = image.type.split('/')[1];
                }
                
                let originalName = 'image';
                if (image.name) {
                    let blobName = image.name;
                    if (blobName.includes('/')) {
                        blobName = blobName.split('/').pop();
                    }
                    if (blobName.includes('\\')) {
                        blobName = blobName.split('\\').pop();
                    }
                    
                    originalName = blobName.replace(`.${fileExtension}`, '');
                }
                
                const finalName = this._convertChineseToEnglish(originalName);
                const safeName = finalName || `image_${i + 1}`;
                const fileName = `${projectId}/${folderName}/${dateStr}/${safeName}.${fileExtension}`;
                
                if (isOffline) {
                    try {
                        const base64Data = await this.convertImageToBase64(image);
                        
                        const imageId = `local_image_${projectId}_${recordDate}_${i}_${Date.now()}`;
                        
                        const imageData = {
                            dataUrl: base64Data,
                            type: image.type || `image/${fileExtension}`,
                            fileName: fileName,
                            originalName: safeName,
                            fileExtension: fileExtension,
                            projectId: projectId,
                            recordDate: recordDate,
                            timestamp: new Date().toISOString()
                        };
                        
                        localStorage.setItem(imageId, JSON.stringify(imageData));
                        
                        const localImageData = {
                            localPath: `local://${imageId}`,
                            fileName: fileName,
                            originalName: safeName,
                            fileExtension: fileExtension,
                            projectId: projectId,
                            bucketName: bucketName,
                            recordDate: recordDate,
                            timestamp: new Date().toISOString()
                        };
                        localImages.push(localImageData);
                    } catch (base64Error) {
                        console.error(`图片 ${i + 1} 转换Base64失败:`, base64Error);
                    }
                } else {
                    try {
                        const { data, error } = await supabase.storage
                            .from(bucketName)
                            .upload(fileName, image, {
                                cacheControl: '3600',
                                upsert: false
                            });
                        
                        if (error) {
                            console.error('上传图片失败:', error);
                            continue;
                        }
                        
                        const { data: urlData } = await supabase.storage
                            .from(bucketName)
                            .getPublicUrl(fileName);
                        
                        uploadedUrls.push(urlData.publicUrl);
                    } catch (uploadError) {
                        console.error('图片上传异常:', uploadError);
                        continue;
                    }
                }
            }
            
            return { urls: uploadedUrls, localImages: localImages };
        } catch (error) {
            console.error('处理图片失败:', error);
            return { urls: [], localImages: [] };
        }
    }

    /**
     * 保存记工记录到数据库
     * @param {Object} data - 记工数据
     * @returns {Promise<boolean>} 是否成功
     */
    async saveWorkRecords(data) {
        try {
            const { projectId, recordDate, phone, records } = data;
            
            if (!records || records.length === 0) {
                this.showNotification('没有可保存的记工记录', true);
                return false;
            }
            
            const isOnline = navigator.onLine;
            let imageUrls = [];
            let localImages = [];
            
            if (window.selectedImages && window.selectedImages.length > 0) {
                try {
                    const imageResult = await this.uploadImagesToSupabase(
                        window.selectedImages, 
                        projectId, 
                        recordDate, 
                        !isOnline
                    );
                    imageUrls = imageResult.urls || [];
                    localImages = imageResult.localImages || [];
                    
                    if (!isOnline && localImages.length > 0) {
                        imageUrls = localImages.map(img => img.localPath);
                    }
                } catch (uploadError) {
                    console.error('图片处理失败:', uploadError);
                    if (!isOnline) {
                        console.log('离线模式下图片处理失败，将跳过图片上传');
                    }
                }
            }
            
            const remark = document.getElementById('remark')?.value?.trim() || null;
            const attendanceRecords = [];
            
            for (const record of records) {
                const baseData = {
                    phone: phone,
                    project_id: projectId,
                    employee_id: record.employee_id,
                    record_date: recordDate,
                    work_type: record.type,
                    image_ids: imageUrls,
                    remark: remark,
                    audit_status: '未审核',
                    created_at: new Date(new Date().getTime() + 8 * 60 * 60 * 1000).toISOString(),
                    updated_at: new Date(new Date().getTime() + 8 * 60 * 60 * 1000).toISOString()
                };
                
                let attendanceData;
                
                if (record.type === '包工') {
                    attendanceData = {
                        ...baseData,
                        regular_hours: 0,
                        overtime_hours: 0,
                        contract_amount: record.contract_amount || 0,
                        work_time: '金额'
                    };
                } else {
                    attendanceData = {
                        ...baseData,
                        regular_hours: record.regular_hours || 0,
                        overtime_hours: record.overtime_hours || 0,
                        contract_amount: 0,
                        work_time: record.work_time
                    };
                }
                
                attendanceRecords.push({
                    data: attendanceData,
                    record_id: `attendance_${phone}_${record.employee_id}_${recordDate}`
                });
            }
            
            if (isOnline && window.supabase && typeof window.supabase.from === 'function') {
                try {
                    console.log('在线模式：尝试保存到Supabase');
                    
                    const { data: insertData, error } = await window.supabase
                        .from('attendance_records')
                        .insert(attendanceRecords.map(record => record.data));
                    
                    if (error) {
                        console.error('保存到Supabase失败:', error);
                        throw error;
                    }
                    
                    console.log('记工记录已成功保存到Supabase');
                    
                    for (const record of attendanceRecords) {
                        localStorage.setItem(record.record_id, JSON.stringify(record.data));
                    }
                    
                    this.showNotification(`记工数据保存成功！共${records.length}条记录`, false);
                    return true;
                    
                } catch (supabaseError) {
                    console.error('Supabase操作异常:', supabaseError);
                    console.log('切换到离线模式保存');
                }
            }
            
            for (const record of attendanceRecords) {
                localStorage.setItem(record.record_id, JSON.stringify(record.data));
                
                if (window.offlineSyncService) {
                    const syncRecordId = `${record.record_id}_${Date.now()}`;
                    window.offlineSyncService.addToSyncQueue('add', record.data, syncRecordId, 'attendance');
                }
            }
            
            if (localImages.length > 0 && window.offlineSyncService) {
                for (let i = 0; i < localImages.length; i++) {
                    const imageData = localImages[i];
                    const imageSyncId = `image_${projectId}_${recordDate}_${i}_${Date.now()}`;
                    
                    window.offlineSyncService.addToSyncQueue('upload_image', imageData, imageSyncId, 'image');
                }
            }
            
            this.showNotification(`记工数据保存到本地（网络恢复后同步），共${records.length}条记录${localImages.length > 0 ? `，${localImages.length}张图片` : ''}`, false);
            return true;
            
        } catch (error) {
            console.error('保存记工记录失败:', error);
            this.showNotification('保存记工记录失败: ' + error.message, true);
            return false;
        }
    }

    /**
     * 执行批量记工
     */
    async executeBatchWork() {
        try {
            const tablesWrapper = document.querySelector('.tables-wrapper');
            if (!tablesWrapper || !tablesWrapper.classList.contains('show')) {
                this.showNotification('请先选择并加载JSON文件', true);
                return;
            }
            
            const collectedData = this.collectTableData();
            
            if (!collectedData.success) {
                this.showNotification(collectedData.error, true);
                return;
            }
            
            if (collectedData.unmatchedEmployees.length > 0) {
                console.warn('未匹配的员工:', collectedData.unmatchedEmployees);
            }
            
            if (collectedData.records.length === 0) {
                this.showNotification('没有找到有效的记工数据', true);
                return;
            }
            
            const confirmMessage = `项目名称: ${collectedData.projectName}\n记工日期: ${collectedData.recordDate}\n员工数量: ${collectedData.records.length}条记录\n\n确认保存这些记工记录吗？`;
            
            this.showConfirmModal('确认批量记工', confirmMessage, async () => {
                this.showNotification('正在保存记工记录...', false);
                
                const success = await this.saveWorkRecords(collectedData);
                
                if (success) {
                    if (window.clearImage) {
                        window.clearImage();
                    }
                    const remarkElement = document.getElementById('remark');
                    if (remarkElement) {
                        remarkElement.value = '';
                    }
                }
            });
            
        } catch (error) {
            console.error('批量记工失败:', error);
            this.showNotification('批量记工失败: ' + error.message, true);
        }
    }
}

const batchWorkService = new BatchWorkService();

window.batchWorkService = batchWorkService;

document.addEventListener('DOMContentLoaded', function() {
    const batchButton = document.querySelector('.batch-button');
    if (batchButton) {
        batchButton.addEventListener('click', function() {
            batchWorkService.executeBatchWork();
        });
    }
});
