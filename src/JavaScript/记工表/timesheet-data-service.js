/**
 * 统计表数据填充服务
 * 功能：根据当前项目ID和选择的日期，从本地存储中筛选考勤和结算记录，填充到记工表中
 */

/**
 * 获取当前用户ID
 * @returns {string} 用户ID
 */
function getUserId() {
    try {
        const currentUserStr = localStorage.getItem('currentUser');
        if (currentUserStr) {
            const currentUser = JSON.parse(currentUserStr);
            return currentUser.user_id || 'default';
        }
    } catch (e) {
        console.error('解析currentUser失败:', e);
    }
    return 'default';
}

/**
 * 获取当前项目ID
 * @returns {string} 项目ID
 */
function getCurrentProjectId() {
    // 尝试从URL参数中获取
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('project_id') || urlParams.get('projectId');
        if (projectId) {
            return projectId;
        }
    } catch (e) {
        console.warn('从URL获取项目ID失败:', e);
    }

    // 从localStorage获取
    return localStorage.getItem('currentProjectId') || '';
}

/**
 * 获取当前选中的年月
 * @returns {Object} {year: number, month: number}
 */
function getCurrentYearMonth() {
    try {
        const dateDisplay = document.getElementById('currentDate');
        if (dateDisplay) {
            const match = dateDisplay.textContent.match(/(\d{4})年(\d{1,2})月/);
            if (match) {
                return {
                    year: parseInt(match[1]),
                    month: parseInt(match[2]) - 1 // 转换为0-11
                };
            }
        }
    } catch (e) {
        console.error('获取年月失败:', e);
    }

    // 默认返回当前月份
    const now = new Date();
    return {
        year: now.getFullYear(),
        month: now.getMonth()
    };
}

/**
 * 从本地存储获取考勤记录
 * @returns {Array} 考勤记录数组
 */
function getAttendanceRecords() {
    try {
        const userId = getUserId();
        const workRecordsKey = 'work_records_' + userId;
        const cachedData = localStorage.getItem(workRecordsKey);
        if (cachedData) {
            return JSON.parse(cachedData);
        }
    } catch (e) {
        console.error('获取考勤记录失败:', e);
    }
    return [];
}

/**
 * 从本地存储获取结算记录
 * @returns {Array} 结算记录数组
 */
function getSettlementRecords() {
    try {
        const cachedData = localStorage.getItem('settlementRecords');
        if (cachedData) {
            return JSON.parse(cachedData);
        }
    } catch (e) {
        console.error('获取结算记录失败:', e);
    }
    return [];
}

/**
 * 获取指定项目的员工数据
 * @param {string} projectId - 项目ID
 * @returns {Array} 员工数组
 */
function getEmployeesByProject(projectId) {
    try {
        const key = `employees_${projectId}`;
        const cachedData = localStorage.getItem(key);
        if (cachedData) {
            const data = JSON.parse(cachedData);
            return data.employees || [];
        }
    } catch (e) {
        console.error('获取员工数据失败:', e);
    }
    return [];
}

/**
 * 按项目和月份筛选考勤记录
 * @param {Array} records - 考勤记录数组
 * @param {string} projectId - 项目ID
 * @param {number} year - 年份
 * @param {number} month - 月份（0-11）
 * @returns {Array} 筛选后的考勤记录
 */
function filterAttendanceRecordsByMonth(records, projectId, year, month) {
    return records.filter(record => {
        if (record.project_id !== projectId) return false;

        const recordDate = new Date(record.record_date);
        return recordDate.getFullYear() === year && recordDate.getMonth() === month;
    });
}

/**
 * 按项目和月份筛选结算记录
 * @param {Array} records - 结算记录数组
 * @param {string} projectId - 项目ID
 * @param {number} year - 年份
 * @param {number} month - 月份（0-11）
 * @returns {Array} 筛选后的结算记录
 */
function filterSettlementRecordsByMonth(records, projectId, year, month) {
    return records.filter(record => {
        if (record.project_id !== projectId) return false;

        const recordDate = new Date(record.record_date);
        return recordDate.getFullYear() === year && recordDate.getMonth() === month;
    });
}

/**
 * 计算工作量的值
 * @param {Object} record - 考勤记录或结算记录
 * @returns {number} 工作量值
 */
function calculateWorkValue(record) {
    // 如果是考勤记录
    if (record.work_type) {
        // 如果是点工，计算工时
        if (record.work_type === '点工') {
            const regularHours = parseFloat(record.regular_hours) || 0;
            const overtimeHours = parseFloat(record.overtime_hours) || 0;
            return regularHours + overtimeHours;
        }
        // 如果是包工或工量，都使用合同金额（工量也显示金额）
        else if (record.work_type === '包工') {
            return parseFloat(record.contract_amount) || 0;
        }
        else if (record.work_type === '工量') {
            // 工量也显示金额，使用 contract_amount
            return parseFloat(record.contract_amount) || 0;
        }
    }
    // 如果是结算记录，直接返回金额
    else if (record.record_type) {
        return parseFloat(record.amount) || 0;
    }

    return 0;
}

/**
 * 按员工和日期分组计算工作量
 * @param {Array} attendanceRecords - 考勤记录
 * @param {Array} settlementRecords - 结算记录
 * @param {number} year - 年份
 * @param {number} month - 月份（0-11）
 * @returns {Object} 分组后的数据
 */
function groupRecordsByEmployeeAndDate(attendanceRecords, settlementRecords, year, month) {
    const groupedData = {};

    // 处理考勤记录
    attendanceRecords.forEach(record => {
        const employeeId = record.employee_id;
        const date = new Date(record.record_date);
        const day = date.getDate();
        const workType = record.work_type || '未知';

        // 映射类型
        const mappedType = mapWorkType(workType);

        if (!groupedData[employeeId]) {
            groupedData[employeeId] = {
                employeeId: employeeId,
                emp_code: '',
                emp_name: '',
                dailyData: {} // { day: { '点工': { regular: 0, overtime: 0 }, '包工': 0 } }
            };
        }

        if (!groupedData[employeeId].dailyData[day]) {
            groupedData[employeeId].dailyData[day] = {};
        }

        if (!groupedData[employeeId].dailyData[day][mappedType]) {
            groupedData[employeeId].dailyData[day][mappedType] = 0;
        }

        // 点工特殊处理：分别存储上班和加班
        if (mappedType === '点工') {
            const regularHours = parseFloat(record.regular_hours) || 0;
            const overtimeHours = parseFloat(record.overtime_hours) || 0;

            // 将点工数据存储为对象 { regular: 9, overtime: 3.5 }
            if (!groupedData[employeeId].dailyData[day][mappedType] ||
                typeof groupedData[employeeId].dailyData[day][mappedType] !== 'object') {
                groupedData[employeeId].dailyData[day][mappedType] = { regular: 0, overtime: 0 };
            }

            groupedData[employeeId].dailyData[day][mappedType].regular += regularHours;
            groupedData[employeeId].dailyData[day][mappedType].overtime += overtimeHours;
        } else {
            // 其他类型正常累加
            const value = calculateWorkValue(record);
            groupedData[employeeId].dailyData[day][mappedType] += value;
        }
    });

    // 处理结算记录
    settlementRecords.forEach(record => {
        const employeeId = record.employee_id;
        const date = new Date(record.record_date);
        const day = date.getDate();
        const recordType = record.record_type || '未知';

        // 映射类型
        const mappedType = mapWorkType(recordType);

        if (!groupedData[employeeId]) {
            groupedData[employeeId] = {
                employeeId: employeeId,
                emp_code: '',
                emp_name: '',
                dailyData: {}
            };
        }

        if (!groupedData[employeeId].dailyData[day]) {
            groupedData[employeeId].dailyData[day] = {};
        }

        if (!groupedData[employeeId].dailyData[day][mappedType]) {
            groupedData[employeeId].dailyData[day][mappedType] = 0;
        }

        // 累加金额
        const value = parseFloat(record.amount) || 0;
        groupedData[employeeId].dailyData[day][mappedType] += value;
    });

    return groupedData;
}

/**
 * 获取月份的天数
 * @param {number} year - 年份
 * @param {number} month - 月份（0-11）
 * @returns {number} 天数
 */
function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

/**
 * 工作类型映射（固定顺序）
 */
const WORK_TYPE_ORDER = ['点工', '包工', '借支'];

/**
 * 获取映射后的工作类型
 * @param {string} originalType - 原始类型
 * @returns {string} 映射后的类型
 */
function mapWorkType(originalType) {
    // 类型映射规则
    const typeMap = {
        '点工': '点工',
        '包工': '包工',
        '工量': '包工', // 工量映射为包工
        '借支': '借支',
        '扣款': '借支', // 扣款映射为借支
        '公司转账': '借支', // 公司转账映射为借支
        '结算': '借支' // 结算映射为借支
    };

    return typeMap[originalType] || originalType;
}

/**
 * 获取所有工作类型（按固定顺序）
 * @param {Object} groupedData - 分组数据
 * @returns {Array} 工作类型数组（按固定顺序）
 */
function getAllWorkTypes(groupedData) {
    const workTypes = new Set();

    // 收集所有存在的类型
    Object.values(groupedData).forEach(employeeData => {
        Object.values(employeeData.dailyData).forEach(dayData => {
            Object.keys(dayData).forEach(type => {
                // 映射类型
                const mappedType = mapWorkType(type);
                workTypes.add(mappedType);
            });
        });
    });

    // 按固定顺序返回
    return WORK_TYPE_ORDER.filter(type => workTypes.has(type));
}

/**
 * 格式化点工数据显示
 * @param {Object|number} dayValue - 天数值，可能是对象 {regular, overtime} 或数字
 * @returns {string} 格式化后的字符串
 */
function formatRegularWorkValue(dayValue) {
    if (!dayValue) return '';

    // 如果是对象（点工），格式为：上班/加班
    if (typeof dayValue === 'object' && dayValue !== null) {
        const regular = dayValue.regular || 0;
        const overtime = dayValue.overtime || 0;

        // 如果两者都是0，返回空
        if (regular === 0 && overtime === 0) return '';

        // 格式化，保留一位小数（如果有小数）
        const formatNum = (num) => {
            if (Number.isInteger(num)) return num;
            return num.toFixed(1);
        };

        // 加班为0时只显示上班，上班为0时只显示加班
        if (overtime === 0) {
            return `${formatNum(regular)}`;
        } else if (regular === 0) {
            return `<span style="color: orange;">${formatNum(overtime)}</span>`;
        } else {
            return `${formatNum(regular)}<br><span style="color: orange;">${formatNum(overtime)}</span>`;
        }
    }

    // 其他情况直接返回
    return dayValue;
}

/**
 * 计算点工的总计
 * @param {Object} dayValue - 天数值，可能是对象 {regular, overtime}
 * @returns {number} 总计值
 */
function calculateRegularWorkTotal(dayValue) {
    if (!dayValue || typeof dayValue !== 'object') return 0;

    const regular = parseFloat(dayValue.regular) || 0;
    const overtime = parseFloat(dayValue.overtime) || 0;

    return regular + overtime;
}

/**
 * 填充记工表
 * @param {Object} groupedData - 分组数据
 * @param {Array} employees - 员工数组
 * @param {number} year - 年份
 * @param {number} month - 月份（0-11）
 */
function fillTimesheetTable(groupedData, employees, year, month) {
    const table = document.getElementById('timesheetTable');
    if (!table) {
        console.error('找不到表格元素');
        return;
    }

    const tbody = table.querySelector('tbody');
    if (!tbody) {
        console.error('找不到tbody元素');
        return;
    }

    const days = getDaysInMonth(year, month);
    const workTypes = getAllWorkTypes(groupedData);

    // 清空tbody
    tbody.innerHTML = '';

    // 按工号排序员工（emp_code 从小到大排序，1-100000）
    const sortedEmployees = [...employees].sort((a, b) => {
        const codeA = parseInt(a.emp_code) || 0;
        const codeB = parseInt(b.emp_code) || 0;
        return codeA - codeB;
    });

    // 遍历所有员工
    sortedEmployees.forEach((employee, index) => {
        const employeeId = employee.employee_id;
        const employeeData = groupedData[employeeId];

        if (!employeeData) {
            // 如果该员工没有数据，跳过
            return;
        }

        // 更新员工信息
        employeeData.emp_code = employee.emp_code || '';
        employeeData.emp_name = employee.emp_name || '';

        // 计算该员工有多少种工作类型（用于rowspan）
        let employeeTypeCount = 0;
        workTypes.forEach(workType => {
            // 检查该员工在当月是否有该类型的数据
            let hasData = false;
            for (let day = 1; day <= days; day++) {
                const dayData = employeeData.dailyData[day];
                const dayValue = dayData && dayData[workType];
                if (dayValue !== '' && dayValue !== 0 && dayValue !== null && dayValue !== undefined) {
                    hasData = true;
                    break;
                }
            }
            if (hasData) {
                employeeTypeCount++;
            }
        });

        // 为每种工作类型创建一行（按固定顺序）
        let isFirstType = true; // 标记是否是该员工的第一行
        workTypes.forEach(workType => {
            // 检查该类型是否有数据
            let hasData = false;
            for (let day = 1; day <= days; day++) {
                const dayData = employeeData.dailyData[day];
                const dayValue = dayData && dayData[workType];
                if (dayValue !== '' && dayValue !== 0 && dayValue !== null && dayValue !== undefined) {
                    hasData = true;
                    break;
                }
            }

            // 如果该类型没有数据，跳过不创建行
            if (!hasData) {
                return;
            }

            const tr = document.createElement('tr');
            tr.setAttribute('data-employee-id', employeeId);
            // 添加奇偶员工标识 class
            // index从0开始，偶数索引对应第1个、第3个员工（即奇数员工），使用白色背景
            // 奇数索引对应第2个、第4个员工（即偶数员工），使用浅灰色背景
            if ((index + 1) % 2 === 0) {
                tr.classList.add('even-employee-row');
            } else {
                tr.classList.add('odd-employee-row');
            }

            // 1. 工号列（只在该员工的第一行创建）
            if (isFirstType) {
                const empCodeCell = document.createElement('td');
                empCodeCell.className = 'fixed-col fixed-col-1';
                empCodeCell.textContent = employeeData.emp_code;
                empCodeCell.rowSpan = employeeTypeCount; // 合并该员工的所有行
                empCodeCell.style.verticalAlign = 'middle'; // 垂直居中
                empCodeCell.style.textAlign = 'center'; // 水平居中
                empCodeCell.style.width = '40px';
                empCodeCell.style.minWidth = '40px';
                empCodeCell.style.maxWidth = '40px';
                tr.appendChild(empCodeCell);

                // 2. 姓名列（只在该员工的第一行创建）
                const empNameCell = document.createElement('td');
                empNameCell.className = 'fixed-col fixed-col-2';
                empNameCell.textContent = employeeData.emp_name;
                empNameCell.rowSpan = employeeTypeCount; // 合并该员工的所有行
                empNameCell.style.verticalAlign = 'middle'; // 垂直居中
                empNameCell.style.textAlign = 'left'; // 水平靠左
                // 固定宽度为60px，确保与后续列对齐
                empNameCell.style.width = '60px !important';
                empNameCell.style.minWidth = '60px !important';
                empNameCell.style.maxWidth = '60px !important';
                
                // 姓名>3个汉字时才换行显示
                const nameLength = employeeData.emp_name.toString().length;
                if (nameLength > 3) {
                    empNameCell.style.wordBreak = 'break-word';
                    empNameCell.style.overflowWrap = 'break-word';
                } else {
                    empNameCell.style.whiteSpace = 'nowrap';
                }
                
                tr.appendChild(empNameCell);
            }

            // 3. 类型列
            const typeCell = document.createElement('td');
            typeCell.className = 'fixed-col fixed-col-3';
            typeCell.textContent = workType;
            // 固定宽度为50px，确保与总计列对齐
            typeCell.style.width = '50px !important';
            typeCell.style.minWidth = '50px !important';
            typeCell.style.maxWidth = '50px !important';
            tr.appendChild(typeCell);

            // 4. 总计列
            const totalCell = document.createElement('td');
            totalCell.className = 'fixed-col fixed-col-4';
            let total = 0;
            tr.appendChild(totalCell);

            // 5. 日期列（1日-31日）
            for (let day = 1; day <= days; day++) {
                const dayCell = document.createElement('td');
                dayCell.className = 'scrollable-col';
                const dayData = employeeData.dailyData[day];
                const dayValue = dayData && dayData[workType] ? dayData[workType] : '';
                const hasContent = dayValue !== '' && dayValue !== 0 && dayValue !== null && dayValue !== undefined;

                if (hasContent) {
                    // 点工特殊处理
                    if (workType === '点工') {
                        const formattedValue = formatRegularWorkValue(dayValue);
                        if (formattedValue) {
                            dayCell.innerHTML = formattedValue;
                            total += calculateRegularWorkTotal(dayValue);
                            // 点工固定宽度为40px，不根据字符串长度调整
                            dayCell.style.width = '40px';
                            dayCell.style.minWidth = '40px';
                        }
                    } else {
                        dayCell.textContent = dayValue;
                        total += parseFloat(dayValue) || 0;
                        // 根据内容长度设置宽度
                        const contentLength = dayValue.toString().length;
                        if (contentLength <= 3) {
                            dayCell.style.width = '40px';
                            dayCell.style.minWidth = '40px';
                        } else if (contentLength <= 6) {
                            dayCell.style.width = '60px';
                            dayCell.style.minWidth = '60px';
                        } else {
                            dayCell.style.width = '80px';
                            dayCell.style.minWidth = '80px';
                        }
                    }
                } else {
                    // 没有内容时设置为40px
                    dayCell.style.width = '40px';
                    dayCell.style.minWidth = '40px';
                }

                // 添加点击事件
                dayCell.style.cursor = 'pointer';
                dayCell.addEventListener('click', function() {
                    // 格式化日期为YYYY-MM-DD
                    const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                    // 获取当前项目名称和ID
                    const projectName = localStorage.getItem('currentProjectName') || '';
                    const projectId = getCurrentProjectId();
                    const encodedProjectName = encodeURIComponent(projectName);
                    const encodedProjectId = encodeURIComponent(projectId);

                    if (hasContent) {
                        // 单元格有内容，跳转到统计页面的明细界面
                        // 构建员工对象，包含 id, name, empCode
                        const employeeObj = {
                            id: employeeData.employeeId,
                            name: employeeData.emp_name,
                            empCode: employeeData.emp_code
                        };

                        // 根据行类型选择对应的类型数组
                        let selectedTypes = [];
                        if (workType === '包工') {
                            // 包工行：选择包工、工量
                            selectedTypes = ['包工', '工量'];
                        } else if (workType === '借支') {
                            // 借支行：选择借支、扣款、公司转账、结算
                            selectedTypes = ['借支', '扣款', '公司转账', '结算'];
                        } else {
                            // 点工行：只选择点工
                            selectedTypes = [workType];
                        }

                        const filter = {
                            projectId: projectId,
                            projectName: projectName,
                            workDate: formattedDate,
                            workDateDisplay: formattedDate,
                            workDateSelectAll: 'false',
                            selectedEmployees: JSON.stringify([employeeObj]), // 只选择当前员工（包含完整信息）
                            selectedTypes: JSON.stringify(selectedTypes), // 根据行类型选择多个类型
                            activeTab: 'detail', // 明细选项卡
                            filterCollapsed: true
                        };
                        localStorage.setItem('statisticFilter', JSON.stringify(filter));

                        // 跳转到统计页面
                        window.location.href = `统计.html?project_name=${encodedProjectName}&project_id=${encodedProjectId}`;
                    } else {
                        // 单元格没有内容，根据类型跳转到对应页面
                        if (workType === '借支') {
                            // 借支类型，跳转到结算借支页面
                            // 结算借支页面使用employee_ids参数（复数）
                            window.location.href = `结算借支.html?project_name=${encodedProjectName}&project_id=${encodedProjectId}&date=${formattedDate}&employee_ids=${employeeData.employeeId}`;
                        } else {
                            // 点工和包工，跳转到记工页面
                            // 记工页面使用employee_id参数（单数）
                            window.location.href = `记工.html?project_name=${encodedProjectName}&project_id=${encodedProjectId}&date=${formattedDate}&employee_id=${employeeData.employeeId}&work_type=${workType}`;
                        }
                    }
                });

                tr.appendChild(dayCell);
            }

            // 更新总计
            if (workType === '点工') {
                // 点工的总计也显示为：上班/加班
                // 计算总上班和总加班
                let totalRegular = 0;
                let totalOvertime = 0;

                for (let day = 1; day <= days; day++) {
                    const dayData = employeeData.dailyData[day];
                    const dayValue = dayData && dayData[workType];

                    if (dayValue && typeof dayValue === 'object') {
                        totalRegular += parseFloat(dayValue.regular) || 0;
                        totalOvertime += parseFloat(dayValue.overtime) || 0;
                    }
                }

                const formatNum = (num) => {
                    if (Number.isInteger(num)) return num;
                    return num.toFixed(1);
                };

                // 加班为0时只显示上班，上班为0时只显示加班，添加"小时"后缀
                let totalContent = '';
                if (totalOvertime === 0) {
                    totalContent = `${formatNum(totalRegular)}小时`;
                } else if (totalRegular === 0) {
                    totalContent = `<span style="color: orange;">${formatNum(totalOvertime)}小时</span>`;
                } else {
                    totalContent = `${formatNum(totalRegular)}小时<br><span style="color: orange;">${formatNum(totalOvertime)}小时</span>`;
                }
                
                totalCell.innerHTML = totalContent;
                
                // 不固定宽度，根据内容调整
                totalCell.style.whiteSpace = 'nowrap';
                totalCell.style.verticalAlign = 'middle';
                
                // 根据总计内容长度设置宽度，考虑换行的情况
                const totalLength = totalContent.replace(/<br>/g, '').length;
                if (totalLength <= 5) {
                    totalCell.style.width = '60px';
                    totalCell.style.minWidth = '60px';
                } else if (totalLength <= 8) {
                    totalCell.style.width = '80px';
                    totalCell.style.minWidth = '80px';
                } else {
                    totalCell.style.width = '100px';
                    totalCell.style.minWidth = '100px';
                }
            } else {
                // 其他类型（包工、借支）直接显示总和，添加"元"后缀
                const totalText = total > 0 ? `${total}元` : '';
                totalCell.textContent = totalText;
                // 根据总计内容长度设置宽度，不换行
                totalCell.style.whiteSpace = 'nowrap';
                const totalLength = totalText.toString().length;
                if (totalLength <= 3) {
                    totalCell.style.width = '40px';
                    totalCell.style.minWidth = '40px';
                } else if (totalLength <= 6) {
                    totalCell.style.width = '60px';
                    totalCell.style.minWidth = '60px';
                } else if (totalLength <= 8) {
                    totalCell.style.width = '80px';
                    totalCell.style.minWidth = '80px';
                } else {
                    totalCell.style.width = '100px';
                    totalCell.style.minWidth = '100px';
                }
            }

            tbody.appendChild(tr);

            // 标记已处理过第一行
            isFirstType = false;
        });
    });

    // 计算并添加总计行
    addTotalRow(groupedData, workTypes, days, sortedEmployees);
}

/**
 * 添加总计行
 * @param {Object} groupedData - 分组数据
 * @param {Array} workTypes - 工作类型数组
 * @param {number} days - 当月天数
 * @param {Array} displayedEmployees - 当前显示的员工列表
 */
function addTotalRow(groupedData, workTypes, days, displayedEmployees) {
    const table = document.getElementById('timesheetTable');
    const tbody = table.querySelector('tbody');

    // 计算总行数（用于合并单元格）
    const totalRowCount = workTypes.length;

    // 如果没有显示的员工，不计算总计
    if (!displayedEmployees || displayedEmployees.length === 0) {
        return;
    }

    workTypes.forEach((workType, index) => {
        const tr = document.createElement('tr');
        tr.classList.add('total-row'); // 添加总计行样式类

        // 1. 工号列（不显示，但合并单元格）
        if (index === 0) {
            const empCodeCell = document.createElement('td');
            empCodeCell.className = 'fixed-col fixed-col-1';
            empCodeCell.textContent = '';
            empCodeCell.style.backgroundColor = '#f0f0f0';
            empCodeCell.rowSpan = totalRowCount;
            empCodeCell.style.verticalAlign = 'middle';
            tr.appendChild(empCodeCell);

            // 2. 姓名列（显示“总计”，合并单元格）
            const empNameCell = document.createElement('td');
            empNameCell.className = 'fixed-col fixed-col-2';
            empNameCell.textContent = '总计';
            empNameCell.style.fontWeight = 'bold';
            empNameCell.style.backgroundColor = '#f0f0f0';
            empNameCell.rowSpan = totalRowCount;
            empNameCell.style.verticalAlign = 'middle';
            empNameCell.style.textAlign = 'center'; // 居中显示
            tr.appendChild(empNameCell);
        }

        // 3. 类型列
        const typeCell = document.createElement('td');
        typeCell.className = 'fixed-col fixed-col-3';
        typeCell.textContent = workType;
        typeCell.style.fontWeight = 'bold';
        typeCell.style.backgroundColor = '#f0f0f0';
        tr.appendChild(typeCell);

        // 4. 总计列（该类型所有员工当月总和）
        const totalCell = document.createElement('td');
        totalCell.className = 'fixed-col fixed-col-4';
        totalCell.style.fontWeight = 'bold';
        totalCell.style.backgroundColor = '#f0f0f0';
        
        // 计算该类型所有员工当月总和
        let grandTotalRegular = 0;
        let grandTotalOvertime = 0;
        let grandTotalAmount = 0;

        // 仅遍历当前显示的员工
        displayedEmployees.forEach(employee => {
            const employeeId = employee.employee_id;
            const employeeData = groupedData[employeeId];
            if (!employeeData) return;

            for (let day = 1; day <= days; day++) {
                const dayData = employeeData.dailyData[day];
                const dayValue = dayData && dayData[workType];

                if (dayValue) {
                    if (workType === '点工' && typeof dayValue === 'object') {
                        grandTotalRegular += parseFloat(dayValue.regular) || 0;
                        grandTotalOvertime += parseFloat(dayValue.overtime) || 0;
                    } else {
                        grandTotalAmount += parseFloat(dayValue) || 0;
                    }
                }
            }
        });

        // 格式化总计列显示
        if (workType === '点工') {
            const formatNum = (num) => (Number.isInteger(num) ? num : num.toFixed(1));
            let totalContent = '';
            if (grandTotalOvertime === 0) {
                totalContent = `${formatNum(grandTotalRegular)}小时`;
            } else if (grandTotalRegular === 0) {
                totalContent = `<span style="color: orange;">${formatNum(grandTotalOvertime)}小时</span>`;
            } else {
                totalContent = `${formatNum(grandTotalRegular)}小时<br><span style="color: orange;">${formatNum(grandTotalOvertime)}小时</span>`;
            }
            totalCell.innerHTML = totalContent;
        } else {
            totalCell.textContent = grandTotalAmount > 0 ? `${grandTotalAmount}元` : '';
        }
        tr.appendChild(totalCell);

        // 5. 日期列（该类型所有员工每日总和）
        for (let day = 1; day <= days; day++) {
            const dayCell = document.createElement('td');
            dayCell.className = 'scrollable-col';
            dayCell.style.fontWeight = 'bold';
            dayCell.style.backgroundColor = '#f0f0f0';

            let dailyRegular = 0;
            let dailyOvertime = 0;
            let dailyAmount = 0;
            let hasDailyData = false;

            // 仅遍历当前显示的员工
            displayedEmployees.forEach(employee => {
                const employeeId = employee.employee_id;
                const employeeData = groupedData[employeeId];
                if (!employeeData) return;

                const dayData = employeeData.dailyData[day];
                const dayValue = dayData && dayData[workType];

                if (dayValue) {
                    hasDailyData = true;
                    if (workType === '点工' && typeof dayValue === 'object') {
                        dailyRegular += parseFloat(dayValue.regular) || 0;
                        dailyOvertime += parseFloat(dayValue.overtime) || 0;
                    } else {
                        dailyAmount += parseFloat(dayValue) || 0;
                    }
                }
            });

            if (hasDailyData) {
                if (workType === '点工') {
                    const formattedValue = formatRegularWorkValue({ regular: dailyRegular, overtime: dailyOvertime });
                    dayCell.innerHTML = formattedValue;
                } else {
                    dayCell.textContent = dailyAmount > 0 ? dailyAmount : '';
                }
            }

            tr.appendChild(dayCell);
        }

        tbody.appendChild(tr);
    });
}

/**
 * 主函数：加载并填充记工表
 * @param {Array} filterEmployees - 可选，需要筛选的员工列表
 */
function loadAndFillTimesheet(filterEmployees = null) {
    try {
        // 1. 获取当前项目ID
        const projectId = getCurrentProjectId();
        if (!projectId) {
            console.warn('⚠️ 未找到当前项目ID');
            return;
        }

        // 2. 获取当前选中的年月
        const { year, month } = getCurrentYearMonth();

        // 3. 获取员工数据
        let employees = getEmployeesByProject(projectId);

        // 如果提供了筛选员工列表，则进行筛选
        if (filterEmployees && Array.isArray(filterEmployees) && filterEmployees.length > 0) {
            const filterIds = new Set(filterEmployees.map(e => e.id || e.employee_id));
            employees = employees.filter(e => filterIds.has(e.employee_id));
        } else if (window.currentSelectedEmployees && Array.isArray(window.currentSelectedEmployees) && window.currentSelectedEmployees.length > 0) {
            // 如果全局变量中有筛选员工列表，也进行筛选
            const filterIds = new Set(window.currentSelectedEmployees.map(e => e.id || e.employee_id));
            employees = employees.filter(e => filterIds.has(e.employee_id));
        }

        // 4. 获取考勤记录
        const allAttendanceRecords = getAttendanceRecords();

        // 5. 获取结算记录
        const allSettlementRecords = getSettlementRecords();

        // 6. 按项目和月份筛选
        const filteredAttendanceRecords = filterAttendanceRecordsByMonth(
            allAttendanceRecords,
            projectId,
            year,
            month
        );

        const filteredSettlementRecords = filterSettlementRecordsByMonth(
            allSettlementRecords,
            projectId,
            year,
            month
        );

        // 7. 按员工和日期分组
        const groupedData = groupRecordsByEmployeeAndDate(
            filteredAttendanceRecords,
            filteredSettlementRecords,
            year,
            month
        );

        // 8. 填充表格
        fillTimesheetTable(groupedData, employees, year, month);
    } catch (error) {
        console.error('❌ 加载记工表数据失败:', error);
    }
}

// 初始化表格行高亮功能
function initTableHoverEffect() {
    const table = document.getElementById('timesheetTable');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    // 使用事件委托处理鼠标移入移出
    tbody.addEventListener('mouseover', function(e) {
        // 找到最近的tr
        const tr = e.target.closest('tr');
        if (!tr) return;

        // 如果是tbody的直接子元素才处理
        if (tr.parentElement !== tbody) return;

        // 1. 高亮当前行所有单元格
        const currentCells = tr.querySelectorAll('td');
        currentCells.forEach(cell => cell.classList.add('highlight-row'));

        // 2. 处理关联行的固定列高亮
        const employeeId = tr.getAttribute('data-employee-id');
        if (employeeId) {
            // 普通员工行：找到该员工的第一行
            // querySelector会返回文档中匹配的第一个元素，对于从上到下的表格，就是第一行
            const firstRow = tbody.querySelector(`tr[data-employee-id="${employeeId}"]`);
            
            // 如果找到了第一行，且第一行不是当前行（说明当前行是包工或借支等后续行）
            if (firstRow && firstRow !== tr) {
                // 单独高亮第一行的工号和姓名列
                // 工号列是 fixed-col-1，姓名列是 fixed-col-2
                const fixedCell1 = firstRow.querySelector('.fixed-col-1');
                const fixedCell2 = firstRow.querySelector('.fixed-col-2');
                
                if (fixedCell1) fixedCell1.classList.add('highlight-row');
                if (fixedCell2) fixedCell2.classList.add('highlight-row');
            }
        } else if (tr.classList.contains('total-row')) {
            // 总计行：找到第一个总计行（包含rowspan的工号和姓名）
            const firstTotalRow = tbody.querySelector('tr.total-row');
            
            if (firstTotalRow && firstTotalRow !== tr) {
                const fixedCell1 = firstTotalRow.querySelector('.fixed-col-1');
                const fixedCell2 = firstTotalRow.querySelector('.fixed-col-2');
                
                if (fixedCell1) fixedCell1.classList.add('highlight-row');
                if (fixedCell2) fixedCell2.classList.add('highlight-row');
            }
        }
    });

    tbody.addEventListener('mouseout', function(e) {
        const tr = e.target.closest('tr');
        if (!tr) return;

        // 如果是tbody的直接子元素才处理
        if (tr.parentElement !== tbody) return;

        // 1. 移除当前行所有单元格高亮
        const currentCells = tr.querySelectorAll('td');
        currentCells.forEach(cell => cell.classList.remove('highlight-row'));

        // 2. 移除关联行的固定列高亮
        const employeeId = tr.getAttribute('data-employee-id');
        if (employeeId) {
            const firstRow = tbody.querySelector(`tr[data-employee-id="${employeeId}"]`);
            if (firstRow) {
                const fixedCell1 = firstRow.querySelector('.fixed-col-1');
                const fixedCell2 = firstRow.querySelector('.fixed-col-2');
                
                if (fixedCell1) fixedCell1.classList.remove('highlight-row');
                if (fixedCell2) fixedCell2.classList.remove('highlight-row');
            }
        } else if (tr.classList.contains('total-row')) {
            const firstTotalRow = tbody.querySelector('tr.total-row');
            if (firstTotalRow) {
                const fixedCell1 = firstTotalRow.querySelector('.fixed-col-1');
                const fixedCell2 = firstTotalRow.querySelector('.fixed-col-2');
                
                if (fixedCell1) fixedCell1.classList.remove('highlight-row');
                if (fixedCell2) fixedCell2.classList.remove('highlight-row');
            }
        }
    });
}

// 导出服务对象
const TimesheetDataService = {
    getUserId,
    getCurrentProjectId,
    getCurrentYearMonth,
    getAttendanceRecords,
    getSettlementRecords,
    getEmployeesByProject,
    filterAttendanceRecordsByMonth,
    filterSettlementRecordsByMonth,
    calculateWorkValue,
    groupRecordsByEmployeeAndDate,
    getAllWorkTypes,
    mapWorkType,
    formatRegularWorkValue,
    calculateRegularWorkTotal,
    fillTimesheetTable,
    loadAndFillTimesheet
};

// 导出到全局作用域
window.TimesheetDataService = TimesheetDataService;
window.loadAndFillTimesheet = loadAndFillTimesheet;

// 页面加载时自动执行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        loadAndFillTimesheet();
        initTableHoverEffect();
    });
} else {
    loadAndFillTimesheet();
    initTableHoverEffect();
}

// 监听日期变化，自动刷新表格
document.addEventListener('DOMContentLoaded', function() {
    // 监听日期显示更新
    const dateDisplay = document.getElementById('currentDate');
    if (dateDisplay) {
        // 使用MutationObserver监听日期变化
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                    console.log('📅 日期已更新，重新加载表格...');
                    loadAndFillTimesheet();
                }
            });
        });

        observer.observe(dateDisplay, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }
});
