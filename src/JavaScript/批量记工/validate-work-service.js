class ValidateWorkService {
    constructor() {
        this.regularHoursPerDay = 8;
        this.overtimeHoursPerDay = 0;
    }

    showNotification(message, isError = false, autoHide = true) {
        const notification = document.getElementById('notification');
        if (!notification) {
            alert(message);
            return;
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
        
        if (autoHide) {
            setTimeout(() => {
                notification.style.transition = 'opacity 0.3s ease-out';
                notification.style.opacity = '0';
                setTimeout(() => {
                    notification.style.display = 'none';
                }, 300);
            }, 5000);
        }
    }

    showErrorModal(title, mismatchedRecords) {
        const existingModal = document.getElementById('validateErrorModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        const notification = document.getElementById('notification');
        if (notification) {
            notification.style.transition = 'opacity 0.3s ease-out';
            notification.style.opacity = '0';
            setTimeout(() => {
                notification.style.display = 'none';
            }, 300);
        }
        
        const modal = document.createElement('div');
        modal.id = 'validateErrorModal';
        modal.style.cssText = `
            display: flex;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            justify-content: center;
            align-items: center;
        `;
        
        let recordsHtml = '';
        for (const record of mismatchedRecords) {
            recordsHtml += `
                <div style="
                    padding: 10px 12px;
                    margin: 8px 0;
                    background: #fef2f2;
                    border-radius: 6px;
                    border-left: 3px solid #ef4444;
                ">
                    <div style="font-weight: 600; color: #991b1b; margin-bottom: 4px;">
                        ${record.empCode}-${record.empName}
                    </div>
                    <div style="color: #dc2626; font-size: 13px;">
                        ${record.reason}
                    </div>
                </div>
            `;
        }
        
        modal.innerHTML = `
            <div style="
                background: white;
                padding: 24px;
                border-radius: 12px;
                width: 450px;
                max-width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            ">
                <h3 style="
                    color: #dc2626;
                    margin: 0 0 16px 0;
                    font-size: 18px;
                    font-weight: 600;
                    text-align: center;
                    padding-bottom: 12px;
                    border-bottom: 2px solid #fee2e2;
                ">${title}</h3>
                <div style="margin-bottom: 16px;">
                    ${recordsHtml}
                </div>
                <div style="text-align: center;">
                    <button id="closeValidateErrorModal" style="
                        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                        color: white;
                        border: none;
                        padding: 10px 40px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 600;
                        font-size: 14px;
                    ">关闭</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const closeBtn = document.getElementById('closeValidateErrorModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.remove();
            });
        }
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    showSuccessModal(title, message) {
        const existingModal = document.getElementById('validateSuccessModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        const notification = document.getElementById('notification');
        if (notification) {
            notification.style.transition = 'opacity 0.3s ease-out';
            notification.style.opacity = '0';
            setTimeout(() => {
                notification.style.display = 'none';
            }, 300);
        }
        
        const modal = document.createElement('div');
        modal.id = 'validateSuccessModal';
        modal.style.cssText = `
            display: flex;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            justify-content: center;
            align-items: center;
        `;
        
        modal.innerHTML = `
            <div style="
                background: white;
                padding: 32px;
                border-radius: 12px;
                width: 400px;
                max-width: 90%;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                text-align: center;
            ">
                <div style="
                    width: 60px;
                    height: 60px;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    border-radius: 50%;
                    margin: 0 auto 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <span style="color: white; font-size: 32px; font-weight: bold;">✓</span>
                </div>
                <h3 style="
                    color: #059669;
                    margin: 0 0 12px 0;
                    font-size: 20px;
                    font-weight: 600;
                ">${title}</h3>
                <p style="
                    color: #374151;
                    margin: 0 0 24px 0;
                    font-size: 15px;
                    line-height: 1.6;
                ">${message}</p>
                <button id="closeValidateSuccessModal" style="
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                    border: none;
                    padding: 12px 48px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 14px;
                ">关闭</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const closeBtn = document.getElementById('closeValidateSuccessModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.remove();
            });
        }
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

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

    getEmployeeList(projectId) {
        try {
            const phone = localStorage.getItem('loggedInPhone') || 'default';
            
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
            
            return [];
        } catch (error) {
            console.error('获取员工列表失败:', error);
            return [];
        }
    }

    findEmployeeId(empCode, empName, employees) {
        const employee = employees.find(emp => 
            emp.emp_code === empCode || 
            (emp.emp_code === empCode && emp.emp_name === empName)
        );
        return employee ? employee.employee_id : null;
    }

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

    async fetchDatabaseRecords(projectId, recordDate, employeeIds) {
        try {
            let supabase;
            if (typeof window.waitForSupabase === 'function') {
                supabase = await window.waitForSupabase();
            } else if (window.supabase) {
                supabase = window.supabase;
            } else {
                console.warn('Supabase未初始化');
                return [];
            }
            
            const { data, error } = await supabase
                .from('attendance_records')
                .select('*')
                .eq('project_id', projectId)
                .eq('record_date', recordDate)
                .in('employee_id', employeeIds);
            
            if (error) {
                console.error('查询数据库失败:', error);
                return [];
            }
            
            return data || [];
        } catch (error) {
            console.error('获取数据库记录失败:', error);
            return [];
        }
    }

    async updateAuditStatus(projectId, recordDate, records) {
        try {
            let supabase;
            if (typeof window.waitForSupabase === 'function') {
                supabase = await window.waitForSupabase();
            } else if (window.supabase) {
                supabase = window.supabase;
            } else {
                console.warn('Supabase未初始化');
                return false;
            }
            
            let successCount = 0;
            let failCount = 0;
            
            for (const record of records) {
                const { error } = await supabase
                    .from('attendance_records')
                    .update({ audit_status: '已审', updated_at: new Date(new Date().getTime() + 8 * 60 * 60 * 1000).toISOString() })
                    .eq('employee_id', record.employee_id)
                    .eq('record_date', recordDate)
                    .eq('project_id', projectId)
                    .eq('work_type', record.type);
                
                if (error) {
                    console.error('更新审核状态失败:', error, record);
                    failCount++;
                } else {
                    successCount++;
                }
            }
            
            return { success: true, successCount, failCount };
        } catch (error) {
            console.error('更新审核状态失败:', error);
            return { success: false, successCount: 0, failCount: 0 };
        }
    }

    compareRecords(tableRecord, dbRecord, regularHours, overtimeHours) {
        const result = { matched: true, mismatches: [] };
        
        if (tableRecord.type === '点工') {
            const tableRegularHours = tableRecord.regular_hours || 0;
            const tableOvertimeHours = tableRecord.overtime_hours || 0;
            
            const dbRegularHours = parseFloat(dbRecord.regular_hours) || 0;
            const dbOvertimeHours = parseFloat(dbRecord.overtime_hours) || 0;
            
            const regularMatch = Math.abs(tableRegularHours - dbRegularHours) < 0.01;
            const overtimeMatch = Math.abs(tableOvertimeHours - dbOvertimeHours) < 0.01;
            
            if (!regularMatch) {
                result.mismatches.push(`正常工时不匹配（表格: ${tableRegularHours}小时，数据库: ${dbRegularHours}小时）`);
            }
            if (!overtimeMatch) {
                result.mismatches.push(`加班时间不匹配（表格: ${tableOvertimeHours}小时，数据库: ${dbOvertimeHours}小时）`);
            }
            
            result.matched = regularMatch && overtimeMatch;
        } else if (tableRecord.type === '包工') {
            const tableContractAmount = parseFloat(tableRecord.contract_amount) || 0;
            const dbContractAmount = parseFloat(dbRecord.contract_amount) || 0;
            
            const contractMatch = Math.abs(tableContractAmount - dbContractAmount) < 0.01;
            
            if (!contractMatch) {
                result.mismatches.push(`合同金额不匹配（表格: ${tableContractAmount}元，数据库: ${dbContractAmount}元）`);
            }
            
            result.matched = contractMatch;
        }
        
        return result;
    }

    async executeValidate() {
        try {
            const tablesWrapper = document.querySelector('.tables-wrapper');
            if (!tablesWrapper || !tablesWrapper.classList.contains('show')) {
                this.showNotification('请先选择并加载JSON文件', true);
                return;
            }

            const projectId = localStorage.getItem('currentProjectId');
            if (!projectId) {
                this.showNotification('未找到项目ID，请先选择项目', true);
                return;
            }

            const projectNameInput = document.getElementById('projectName');
            const projectNameFromInput = projectNameInput ? projectNameInput.value.trim() : '';
            
            const headerCompany = document.querySelector('.header-info .company');
            const headerDate = document.querySelector('.header-info .date');
            
            const projectNameFromHeader = headerCompany ? headerCompany.textContent.trim() : '';
            const dateStr = headerDate ? headerDate.textContent.trim() : '';
            
            if (!projectNameFromInput) {
                this.showNotification('未选择项目，请先选择项目', true);
                return;
            }
            
            if (!projectNameFromHeader) {
                this.showNotification('请先选择并加载JSON文件', true);
                return;
            }
            
            if (projectNameFromInput !== projectNameFromHeader) {
                this.showNotification('当前项目不匹配请检查', true);
                return;
            }

            const projectConfig = this.getProjectConfig(projectId);
            if (!projectConfig) {
                this.showNotification('未找到项目配置信息', true);
                return;
            }
            
            this.regularHoursPerDay = projectConfig.regular_hours;
            this.overtimeHoursPerDay = projectConfig.overtime_hours;
            
            const employees = this.getEmployeeList(projectId);
            const recordDate = this.parseDate(dateStr);
            
            const tableBody1 = document.getElementById('tableBody1');
            const tableBody2 = document.getElementById('tableBody2');
            
            const tableRecords = [];
            const unmatchedEmployees = [];
            const employeeIds = [];
            
            const processRow = (row) => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 7) {
                    return;
                }
                
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
                
                if (!employeeIds.includes(employeeId)) {
                    employeeIds.push(employeeId);
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
                    
                    tableRecords.push({
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
                    tableRecords.push({
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
                rows1.forEach(row => processRow(row));
            }
            
            if (tableBody2) {
                const rows2 = tableBody2.querySelectorAll('tr');
                rows2.forEach(row => processRow(row));
            }
            
            if (unmatchedEmployees.length > 0) {
                const unmatchedNames = unmatchedEmployees.map(e => `${e.empCode}-${e.empName}`).join('、');
                this.showNotification(`以下员工未匹配：${unmatchedNames}`, true);
                return;
            }
            
            if (tableRecords.length === 0) {
                this.showNotification('没有找到有效的记工数据', true);
                return;
            }
            
            this.showNotification('正在校验数据...', false, false);
            
            const dbRecords = await this.fetchDatabaseRecords(projectId, recordDate, employeeIds);
            
            if (dbRecords.length === 0) {
                this.showNotification('数据库中没有找到对应的记工记录', true);
                return;
            }
            
            const matchedRecords = [];
            const mismatchedRecords = [];
            
            for (const tableRecord of tableRecords) {
                const matchingDbRecords = dbRecords.filter(db => 
                    db.employee_id === tableRecord.employee_id && 
                    db.work_type === tableRecord.type
                );
                
                if (matchingDbRecords.length === 0) {
                    mismatchedRecords.push({
                        empCode: tableRecord.emp_code,
                        empName: tableRecord.emp_name,
                        type: tableRecord.type,
                        reason: `数据库中无对应记录（工作类型: ${tableRecord.type}）`
                    });
                    continue;
                }
                
                let matched = false;
                for (const dbRecord of matchingDbRecords) {
                    const compareResult = this.compareRecords(tableRecord, dbRecord, this.regularHoursPerDay, this.overtimeHoursPerDay);
                    if (compareResult.matched) {
                        matchedRecords.push(tableRecord);
                        matched = true;
                        break;
                    } else {
                        const mismatchDetails = compareResult.mismatches.join('；');
                        mismatchedRecords.push({
                            empCode: tableRecord.emp_code,
                            empName: tableRecord.emp_name,
                            type: tableRecord.type,
                            reason: mismatchDetails || '数据不匹配'
                        });
                        break;
                    }
                }
            }
            
            if (mismatchedRecords.length > 0) {
                this.showErrorModal(`校验失败（共${mismatchedRecords.length}条记录）`, mismatchedRecords);
                return;
            }
            
            if (matchedRecords.length > 0) {
                const updateResult = await this.updateAuditStatus(projectId, recordDate, matchedRecords);
                
                if (updateResult.success && updateResult.successCount > 0) {
                    this.showSuccessModal('校验成功', `已将${updateResult.successCount}条记录标记为已审`);
                } else {
                    this.showNotification('更新审核状态失败，请稍后重试', true);
                }
            } else {
                this.showNotification('没有匹配的记录需要更新', true);
            }
            
        } catch (error) {
            console.error('校验失败:', error);
            this.showNotification('校验失败: ' + error.message, true);
        }
    }
}

const validateWorkService = new ValidateWorkService();

window.validateWorkService = validateWorkService;

document.addEventListener('DOMContentLoaded', function() {
    const validateButton = document.querySelector('.validate-button');
    if (validateButton) {
        validateButton.addEventListener('click', function() {
            validateWorkService.executeValidate();
        });
    }
});
