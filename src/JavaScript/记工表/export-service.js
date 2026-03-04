/**
 * 导出服务
 * 功能：将考勤数据和结算数据导出为Excel文件
 */
class TimesheetExportService {
    constructor() {
        // ExcelJS 和 FileSaver 已经通过 script 标签引入
    }

    /**
     * 导出报表
     * @param {string} startDateStr - 开始日期 (YYYY年MM月DD日)
     * @param {string} endDateStr - 结束日期 (YYYY年MM月DD日)
     * @param {boolean} showSalary - 是否展示工资
     * @param {boolean} settlementOutput - 是否输出结算表
     * @param {Array} filterEmployees - 筛选的员工列表（可选）
     */
    async exportReport(startDateStr, endDateStr, showSalary, settlementOutput = true, filterEmployees = null) {
        try {
            // 1. 解析日期
            const startDate = this._parseDateStr(startDateStr);
            const endDate = this._parseDateStr(endDateStr);
            
            if (!startDate || !endDate) {
                alert('日期格式错误');
                return;
            }

            // 2. 获取数据
            const projectId = TimesheetDataService.getCurrentProjectId();
            if (!projectId) {
                alert('未找到当前项目');
                return;
            }

            let employees = TimesheetDataService.getEmployeesByProject(projectId);
            
            // 如果有筛选员工，则过滤员工列表
            if (filterEmployees && filterEmployees.length > 0) {
                const filterIds = new Set(filterEmployees.map(e => e.id || e.employee_id));
                employees = employees.filter(emp => filterIds.has(emp.employee_id));
            }

            const allAttendance = TimesheetDataService.getAttendanceRecords();
            const allSettlement = TimesheetDataService.getSettlementRecords();

            // 3. 筛选数据
            const dateFilteredAttendance = this._filterByDateRange(allAttendance, projectId, startDate, endDate);
            const dateFilteredSettlement = this._filterByDateRange(allSettlement, projectId, startDate, endDate);

            // 4. 创建工作簿
            const workbook = new ExcelJS.Workbook();
            workbook.creator = '飞鱼考勤';
            workbook.created = new Date();

            // 5. 生成三个工作表
            await this._generateAttendanceSheet(workbook, employees, dateFilteredAttendance, dateFilteredSettlement, startDate, endDate, showSalary);
            await this._generateAdvanceSheet(workbook, employees, dateFilteredSettlement);
            
            if (settlementOutput) {
                await this._generateSalarySettlementSheet(workbook, employees, dateFilteredAttendance, dateFilteredSettlement, startDate, endDate, showSalary);
            }

            // 6. 导出文件
            const buffer = await workbook.xlsx.writeBuffer();
            const fileName = `考勤报表_${startDateStr}至${endDateStr}.xlsx`;
            
            // 尝试使用文件保存对话框
            if (window.showSaveFilePicker) {
                try {
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: fileName,
                        types: [
                            { accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }
                        ]
                    });
                    
                    const writable = await fileHandle.createWritable();
                    await writable.write(buffer);
                    await writable.close();
                    return;
                } catch (err) {
                    // 用户取消保存或其他错误，使用默认保存方式
                    console.log('文件保存对话框错误:', err);
                }
            }
            
            // 默认保存方式
            saveAs(new Blob([buffer]), fileName);

        } catch (error) {
            console.error('导出失败:', error);
            alert('导出失败: ' + error.message);
        }
    }

    /**
     * 生成考勤表 Sheet
     */
    async _generateAttendanceSheet(workbook, employees, attendanceRecords, settlementRecords, startDate, endDate, showSalary) {
        const sheet = workbook.addWorksheet('考勤表');

        // 设置冻结：
        // xSplit: 4 -> 冻结前4列（工号、姓名、类型、记工汇总）
        // ySplit: 2 -> 冻结前2行（标题行、表头行）
        // 注意：Excel 单个工作表只能设置一个冻结区域，因此这将固定显示第一个月的标题和表头。
        // 当滚动查看后续月份数据时，顶部依然会显示第一个月的表头（列对齐依然有效）。
        sheet.views = [
            { state: 'frozen', xSplit: 4, ySplit: 2 }
        ];
        
        // 按月分组生成表格
        // 从结束日期往回推到开始日期
        let currentYear = endDate.getFullYear();
        let currentMonth = endDate.getMonth();
        const endYear = startDate.getFullYear();
        const endMonth = startDate.getMonth();

        let currentRow = 1;

        while (currentYear > endYear || (currentYear === endYear && currentMonth >= endMonth)) {
            // 筛选当前月的数据
            const monthAttendance = TimesheetDataService.filterAttendanceRecordsByMonth(attendanceRecords, TimesheetDataService.getCurrentProjectId(), currentYear, currentMonth);
            const monthSettlement = TimesheetDataService.filterSettlementRecordsByMonth(settlementRecords, TimesheetDataService.getCurrentProjectId(), currentYear, currentMonth);
            
            // 如果该月没有数据，跳过
            // 如果指定了筛选员工，我们还需要检查这些筛选出的员工在本月是否有数据
            // 之前的检查只是看本月是否有任何数据，现在要更精确
            
            // 如果没有指定筛选员工，或者本月根本没有任何记录，则使用原来的逻辑
            if (monthAttendance.length === 0 && monthSettlement.length === 0) {
                if (currentMonth === 0) {
                    currentMonth = 11;
                    currentYear--;
                } else {
                    currentMonth--;
                }
                continue;
            }
            
            // 如果指定了员工，检查这些员工在本月是否有数据
            // 注意：employees参数已经是经过筛选的员工列表（如果在exportReport中传入了filterEmployees）
            // 所以我们只需要检查这些 employees 在 monthAttendance 或 monthSettlement 中是否有记录
            
            // 构建本月有记录的员工ID集合
            const activeEmployeeIdsInMonth = new Set();
            monthAttendance.forEach(r => activeEmployeeIdsInMonth.add(r.employee_id));
            monthSettlement.forEach(r => activeEmployeeIdsInMonth.add(r.employee_id));
            
            // 检查传入的员工列表中，是否有任何人在本月有记录
            const hasRecordInMonth = employees.some(emp => activeEmployeeIdsInMonth.has(emp.employee_id));
            
            if (!hasRecordInMonth) {
                 if (currentMonth === 0) {
                    currentMonth = 11;
                    currentYear--;
                } else {
                    currentMonth--;
                }
                continue;
            }

            // 1. 标题行 (项目名称 + 考勤表标题)
            const projectName = localStorage.getItem('currentProjectName') || '';
            const titleRow = sheet.getRow(currentRow);
            titleRow.height = 50; // 增加行高以容纳两行文字
            
            const titleText = `${currentYear}年${String(currentMonth + 1).padStart(2, '0')}月考勤表`;
            
            titleRow.getCell(1).value = {
                richText: [
                    { text: projectName + '\n', font: { size: 20, bold: true } },
                    { text: titleText, font: { size: 20, bold: true } }
                ]
            };
            
            // 水平靠左，垂直居中，换行
            titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            sheet.mergeCells(currentRow, 1, currentRow, 35);
            currentRow++;

            // 生成表格头
            const headerRow = sheet.getRow(currentRow);
            headerRow.height = 30; // 表格标题行行高
            this._setupHeaderRow(headerRow, currentYear, currentMonth);
            currentRow++;

            // 分组数据
            const groupedData = TimesheetDataService.groupRecordsByEmployeeAndDate(monthAttendance, monthSettlement, currentYear, currentMonth);
            
            // 排序员工
            const sortedEmployees = [...employees].sort((a, b) => (parseInt(a.emp_code) || 0) - (parseInt(b.emp_code) || 0));

            // 定义边框样式
            const borderStyle = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };

            // 用于计算列宽
            const colWidths = new Array(36).fill(0); // 1-35列
            // 初始化表头宽度
            const headers = ['工号', '姓名', '类型', '记工汇总'];
            headers.forEach((h, i) => colWidths[i + 1] = Math.max(colWidths[i + 1], this._calculateWidth(h)));
            const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
            for(let d=1; d<=daysInMonth; d++) {
                colWidths[4 + d] = Math.max(colWidths[4 + d], this._calculateWidth(`${d}日`));
            }

            // 初始化月度合计数据
            const monthlyTotals = {
                '点工': { regular: 0, overtime: 0, daily: {} },
                '包工': { amount: 0, daily: {} },
                '工量': { amount: 0, daily: {} },
                '借支': { amount: 0, daily: {} },
                '扣款': { amount: 0, daily: {} },
                '公司转账': { amount: 0, daily: {} },
                '结算': { amount: 0, daily: {} }
            };

            // 填充数据行
            for (const emp of sortedEmployees) {
                const empData = groupedData[emp.employee_id];
                if (!empData) continue;

                // 获取该员工的所有工作类型
                const workTypes = TimesheetDataService.getAllWorkTypes({ [emp.employee_id]: empData });
                
                // 遍历类型生成行
                let isFirstType = true;
                const startRow = currentRow; // 记录该员工起始行，用于合并单元格
                
                for (const type of workTypes) {
                    const row = sheet.getRow(currentRow);
                    
                    // 根据工作类型设置行高
                    if (type === '点工') {
                        row.height = 30; // 点工行行高设为30
                    } else if (type === '包工' || type === '借支') {
                        row.height = 22.5; // 包工行和借支行行高设为22.5
                    } else {
                        row.height = 30; // 其他类型默认30
                    }

                    // 1. 工号
                    if (isFirstType) {
                        const codeNum = Number(emp.emp_code);
                        row.getCell(1).value = (emp.emp_code && !isNaN(codeNum)) ? codeNum : emp.emp_code;
                        colWidths[1] = Math.max(colWidths[1], this._calculateWidth(emp.emp_code));
                    }
                    // 2. 姓名
                    if (isFirstType) {
                        let name = emp.emp_name || '';
                        // 处理长姓名：超过3个字换行
                        if (name.length > 3) {
                            // 在第3个字后插入换行符
                            name = name.substring(0, 3) + '\n' + name.substring(3);
                            
                            // 强制设置自动换行，并确保在赋值后应用样式
                            // 注意：ExcelJS中，如果后续合并了单元格，样式可能需要应用到合并区域的左上角单元格，或者重新应用
                            // 我们稍后在设置通用样式时会再次设置，但这里先确保内容包含换行符
                        }
                        
                        const nameNum = Number(name);
                        // 如果包含换行符，肯定不是数字，直接赋值字符串
                        const cell = row.getCell(2);
                        cell.value = (name && !isNaN(nameNum) && name.indexOf('\n') === -1) ? nameNum : name;
                        
                        // 显式开启自动换行
                        if (name.indexOf('\n') !== -1) {
                            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                        }
                    }
                    
                    // 计算列宽：固定按3个汉字宽度计算（大约6-7个字符宽，这里设为自动计算3个字）
                    // 或者直接硬编码一个合适的宽度，比如 8
                    // 这里我们取3个字和实际内容的较小值来计算，或者直接按3个字算
                    colWidths[2] = Math.max(colWidths[2], this._calculateWidth("三个字"));
                    
                    // 3. 类型
                    row.getCell(3).value = type;
                    colWidths[3] = Math.max(colWidths[3], this._calculateWidth(type));

                    // 4. 总计 & 5-35. 日期数据
                    let totalAmount = 0;
                    let totalRegular = 0;
                    let totalOvertime = 0;

                    for (let day = 1; day <= daysInMonth; day++) {
                        const dayData = empData.dailyData[day];
                        const val = dayData ? dayData[type] : null;
                        
                        const cell = row.getCell(4 + day); // 第5列开始是1号

                        if (val) {
                            if (type === '点工') {
                                if (typeof val === 'object') {
                                    const reg = parseFloat(val.regular) || 0;
                                    const over = parseFloat(val.overtime) || 0;
                                    totalRegular += reg;
                                    totalOvertime += over;
                                    
                                    // 累计到月度合计
                                    if (!monthlyTotals['点工'].daily[day]) monthlyTotals['点工'].daily[day] = { regular: 0, overtime: 0 };
                                    monthlyTotals['点工'].daily[day].regular += reg;
                                    monthlyTotals['点工'].daily[day].overtime += over;
                                    monthlyTotals['点工'].regular += reg;
                                    monthlyTotals['点工'].overtime += over;

                                    // 格式化显示：9\n3.5
                                    if (reg > 0 && over > 0) {
                                        cell.value = `${reg}\n${over}`;
                                    } else if (reg > 0) {
                                        cell.value = reg;
                                    } else if (over > 0) {
                                        cell.value = over;
                                    }
                                    
                                    // 计算宽度
                                    let text = '';
                                    if (reg > 0) text += reg;
                                    if (over > 0) text += (text ? '\n' : '') + over;
                                    cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
                                    
                                    const lines = text.split('\n');
                                    lines.forEach(line => {
                                        colWidths[4 + day] = Math.max(colWidths[4 + day], this._calculateWidth(line));
                                    });
                                }
                            } else {
                                // 包工、借支等
                                const amount = parseFloat(val) || 0;
                                totalAmount += amount;

                                // 累计到月度合计
                                if (monthlyTotals[type]) {
                                    if (!monthlyTotals[type].daily[day]) monthlyTotals[type].daily[day] = 0;
                                    monthlyTotals[type].daily[day] += amount;
                                    monthlyTotals[type].amount += amount;
                                }

                                if (showSalary || type === '点工') { 
                                    cell.value = amount;
                                    colWidths[4 + day] = Math.max(colWidths[4 + day], this._calculateWidth(amount));
                                } else {
                                    // 即使不显示工资，考勤表也应该显示详细金额（根据用户需求：考勤表不受影响）
                                    // 但为了保持原有逻辑的一致性，如果用户确实想隐藏，这里可以改回去。
                                    // 不过根据最新指令，考勤表应该不受影响。
                                    // 所以这里其实应该直接显示 amount，不需要 if (showSalary) 判断。
                                    // 但既然代码已经是这样了，我将修改这里，使其总是显示 amount。
                                    cell.value = amount;
                                    colWidths[4 + day] = Math.max(colWidths[4 + day], this._calculateWidth(amount));
                                }
                            }
                        }
                        // 设置日期列边框和居中
                        cell.border = borderStyle;
                        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                    }

                    // 填充总计 (第4列)
                    const totalCell = row.getCell(4);
                    // 记工汇总列字体颜色设置为EXCEL标准色第7个(浅蓝)
                    totalCell.font = { color: { argb: 'FF00B0F0' } };

                    if (type === '点工') {
                        let text = '';
                        if (totalRegular > 0) text += `${parseFloat(totalRegular.toFixed(1))}小时`;
                        if (totalOvertime > 0) text += (text ? '\n' : '') + `${parseFloat(totalOvertime.toFixed(1))}小时`;
                        totalCell.value = text;
                        totalCell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
                        
                        // 点工行高已经在前面设置为30，不需要重复设置
                        
                        const lines = text.split('\n');
                        lines.forEach(line => {
                            colWidths[4] = Math.max(colWidths[4], this._calculateWidth(line));
                        });
                    } else {
                        // 始终显示金额
                        const text = totalAmount > 0 ? `${totalAmount}元` : '';
                        totalCell.value = text;
                        colWidths[4] = Math.max(colWidths[4], this._calculateWidth(text));
                    }

                    // 设置前4列的边框、对齐和字号，保留记工汇总列的原有颜色
                    for (let i = 1; i <= 4; i++) {
                        const cell = row.getCell(i);
                        cell.border = borderStyle;
                        
                        // 保留原有字体设置，只添加或修改字号
                        const existingFont = cell.font || {};
                        cell.font = Object.assign({}, existingFont, { size: 12 });
                        
                        if (i >= 3) {
                             if (!cell.alignment) cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                        } else {
                            // 1和2列垂直居中
                            // 检查第二列（姓名列）是否有换行符，如果有，需要设置wrapText: true
                            if (i === 2 && typeof cell.value === 'string' && cell.value.indexOf('\n') !== -1) {
                                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                            } else {
                                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
                            }
                        }
                    }
                    
                    // 设置日期列的字号为12
                    for (let day = 1; day <= daysInMonth; day++) {
                        const cell = row.getCell(4 + day);
                        cell.font = { size: 12 };
                    }

                    currentRow++;
                    isFirstType = false;
                }

                // 合并工号和姓名列
                if (workTypes.length > 1) {
                    sheet.mergeCells(startRow, 1, currentRow - 1, 1);
                    sheet.mergeCells(startRow, 2, currentRow - 1, 2);
                }
            }

            // 生成合计行
            const summaryTypes = ['点工', '包工', '工量', '借支', '扣款', '公司转账', '结算'];
            // 过滤掉没有任何数据的类型
            const activeSummaryTypes = summaryTypes.filter(type => {
                if (type === '点工') {
                    return monthlyTotals[type].regular > 0 || monthlyTotals[type].overtime > 0;
                }
                return monthlyTotals[type].amount > 0;
            });

            if (activeSummaryTypes.length > 0) {
                const startTotalRow = currentRow;
                let isFirstTotal = true;

                for (const type of activeSummaryTypes) {
                    const row = sheet.getRow(currentRow);
                    
                    // 根据类型设置总计行行高
                    if (type === '点工') {
                        row.height = 30; // 点工总计行高设为30
                    } else if (type === '包工' || type === '借支') {
                        row.height = 22.5; // 包工和借支总计行高设为22.5
                    } else {
                        row.height = 30; // 其他类型默认30
                    }

                    // 2. 标题 "总计"
                    if (isFirstTotal) {
                         row.getCell(2).value = '总计';
                         row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
                    }

                    // 3. 类型
                    row.getCell(3).value = type;

                    // 4. 总计 & 5-35. 日期数据
                    for (let day = 1; day <= daysInMonth; day++) {
                        const cell = row.getCell(4 + day);
                        const dayData = monthlyTotals[type].daily[day];
                        
                        if (dayData) {
                            if (type === '点工') {
                                const reg = parseFloat(dayData.regular) || 0;
                                const over = parseFloat(dayData.overtime) || 0;
                                
                                if (reg > 0 && over > 0) {
                                    cell.value = `${reg}\n${over}`;
                                } else if (reg > 0) {
                                    cell.value = reg;
                                } else if (over > 0) {
                                    cell.value = over;
                                }

                                let text = '';
                                if (reg > 0) text += reg;
                                if (over > 0) text += (text ? '\n' : '') + over;
                                cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
                                
                                const lines = text.split('\n');
                                lines.forEach(line => {
                                    colWidths[4 + day] = Math.max(colWidths[4 + day], this._calculateWidth(line));
                                });
                            } else {
                                const amount = parseFloat(dayData) || 0;
                                // 始终显示金额
                                cell.value = amount;
                                colWidths[4 + day] = Math.max(colWidths[4 + day], this._calculateWidth(amount));
                            }
                        }
                        
                        cell.border = borderStyle;
                        if (!cell.alignment) cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                    }

                    // 填充总计列
                    const totalCell = row.getCell(4);
                    if (type === '点工') {
                        let text = '';
                        const totalReg = monthlyTotals['点工'].regular;
                        const totalOver = monthlyTotals['点工'].overtime;
                        if (totalReg > 0) text += `${parseFloat(totalReg.toFixed(1))}小时`;
                        if (totalOver > 0) text += (text ? '\n' : '') + `${parseFloat(totalOver.toFixed(1))}小时`;
                        totalCell.value = text;
                        totalCell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
                        
                        // 如果有换行，设置行高为 30
                        if (totalReg > 0 && totalOver > 0) {
                            row.height = 30;
                        }
                        
                        const lines = text.split('\n');
                        lines.forEach(line => {
                            colWidths[4] = Math.max(colWidths[4], this._calculateWidth(line));
                        });
                    } else {
                        const totalAmt = monthlyTotals[type].amount;
                        // 始终显示金额
                        const text = totalAmt > 0 ? `${totalAmt}元` : '';
                        totalCell.value = text;
                        colWidths[4] = Math.max(colWidths[4], this._calculateWidth(text));
                    }

                    // 设置前4列的边框、对齐和字号
                    for (let i = 1; i <= 4; i++) {
                        const cell = row.getCell(i);
                        cell.border = borderStyle;
                        cell.font = { size: 12 };
                        if (i >= 3) {
                             if (!cell.alignment) cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                        } else {
                             cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
                        }
                    }

                    // 设置总计行所有单元格字体颜色为蓝色和字号为12
                    for (let i = 1; i <= daysInMonth + 4; i++) {
                        const cell = row.getCell(i);
                        const font = cell.font || {};
                        cell.font = Object.assign({}, font, { color: { argb: 'FF0000FF' }, size: 12 });
                    }

                    currentRow++;
                    isFirstTotal = false;
                }

                // 合并 "总计" 列
                if (activeSummaryTypes.length > 0) {
                     sheet.mergeCells(startTotalRow, 1, currentRow - 1, 1); // 合并工号列
                     sheet.mergeCells(startTotalRow, 2, currentRow - 1, 2); // 合并姓名列
                }
            }

            // 设置列宽
            for (let i = 1; i <= 35; i++) {
                if (colWidths[i] > 0) {
                    sheet.getColumn(i).width = colWidths[i] + 2; 
                } else if (i >= 5) {
                    sheet.getColumn(i).width = 6;
                }
            }

            // 增加分隔行 (合并单元格并加边框)
            // 只有当还有下一个月的数据时，才添加边框
            const sepRowStart = currentRow;
            const sepRowEnd = currentRow + 1;
            sheet.mergeCells(sepRowStart, 1, sepRowEnd, 35);
            
            // 检查是否还有下一个月的数据
            let hasNextMonthData = false;
            let tempYear = currentYear;
            let tempMonth = currentMonth;
            
            // 移动到上个月 (下一个循环的月份)
            if (tempMonth === 0) {
                tempMonth = 11;
                tempYear--;
            } else {
                tempMonth--;
            }

            // 循环检查直到结束日期
            while (tempYear > endYear || (tempYear === endYear && tempMonth >= endMonth)) {
                const nextAttendance = TimesheetDataService.filterAttendanceRecordsByMonth(attendanceRecords, TimesheetDataService.getCurrentProjectId(), tempYear, tempMonth);
                const nextSettlement = TimesheetDataService.filterSettlementRecordsByMonth(settlementRecords, TimesheetDataService.getCurrentProjectId(), tempYear, tempMonth);
                
                if (nextAttendance.length > 0 || nextSettlement.length > 0) {
                    hasNextMonthData = true;
                    break;
                }
                
                // 继续往前检查
                if (tempMonth === 0) {
                    tempMonth = 11;
                    tempYear--;
                } else {
                    tempMonth--;
                }
            }

            if (hasNextMonthData) {
                const sepCell = sheet.getCell(sepRowStart, 1);
                sepCell.border = borderStyle; 
            }
            
            currentRow += 2;

            // 移动到上个月
            if (currentMonth === 0) {
                currentMonth = 11;
                currentYear--;
            } else {
                currentMonth--;
            }
        }
    }

    // 辅助方法：计算字符串宽度（近似）
    _calculateWidth(str) {
        if (!str) return 0;
        str = String(str);
        let width = 0;
        for (let i = 0; i < str.length; i++) {
            // 中文算2，其他算1
            if (str.charCodeAt(i) > 255) {
                width += 2.2; // 中文稍微宽一点
            } else {
                width += 1.1; // 英文也稍微宽一点
            }
        }
        return width;
    }

    /**
     * 设置考勤表表头
     */
    _setupHeaderRow(row, year, month) {
        const headers = ['工号', '姓名', '类型', '记工汇总'];
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
            headers.push(`${i}日`);
        }
        
        headers.forEach((text, index) => {
            const cell = row.getCell(index + 1);
            cell.value = text;
            cell.font = { bold: true, size: 12 };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF0F0F0' }
            };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
    }

    /**
     * 生成借支明细表 Sheet
     */
    async _generateAdvanceSheet(workbook, employees, settlementRecords) {
        const sheet = workbook.addWorksheet('借支表');
        
        // 设置冻结：
        // xSplit: 2 -> 冻结前2列（工号、姓名）
        // ySplit: 2 -> 冻结前2行（标题行、表头行）
        sheet.views = [
            { state: 'frozen', xSplit: 2, ySplit: 2 }
        ];

        // 获取项目名称
        const projectName = localStorage.getItem('currentProjectName') || '未知项目';

        // 标题
        sheet.mergeCells('A1:G1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = `${projectName}\n借支明细表`;
        titleCell.font = { size: 18, bold: true };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        // 设置标题行高
        sheet.getRow(1).height = 50;

        // 表头
        const headers = ['工号', '姓名', '日期', '记账类型', '付款人', '金额', '备注'];
        const headerRow = sheet.getRow(2);
        // 设置标题行行高
        headerRow.height = 25;
        headers.forEach((text, index) => {
            const cell = headerRow.getCell(index + 1);
            cell.value = text;
            cell.font = { bold: true, size: 12 };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        // 筛选借支相关记录
        const advanceTypes = ['借支', '扣款', '公司转账', '结算'];
        let records = settlementRecords.filter(r => advanceTypes.includes(r.record_type));
        
        // 如果选择了特定员工（employees数组不是全量员工），则进一步筛选
        // 注意：employees参数可能已经是在exportReport中根据filterEmployees筛选过的
        // 所以我们直接根据employees数组中的ID来过滤记录，确保只包含这些员工的记录
        const allowedEmpIds = new Set(employees.map(e => e.employee_id));
        records = records.filter(r => allowedEmpIds.has(r.employee_id));
        
        // 排序：先按工号升序，同一工号内按日期升序
        records.sort((a, b) => {
            // 先根据工号排序
            const empA = employees.find(e => e.employee_id === a.employee_id);
            const empB = employees.find(e => e.employee_id === b.employee_id);
            const empCodeA = parseInt(empA?.emp_code || '0') || 0;
            const empCodeB = parseInt(empB?.emp_code || '0') || 0;
            
            if (empCodeA !== empCodeB) {
                return empCodeA - empCodeB;
            }
            
            // 同一工号内按日期升序
            return new Date(a.record_date) - new Date(b.record_date);
        });

        // 填充数据
        let currentRow = 3;
        const empMap = new Map(employees.map(e => [e.employee_id, e]));

        // 计算总计金额
        let totalAmount = 0;
        
        for (const record of records) {
            const emp = empMap.get(record.employee_id) || {};
            const row = sheet.getRow(currentRow);
            // 设置内容行行高
            row.height = 25;

            // 工号 - 数字格式，参考考勤表处理方式
            const empCode = emp.emp_code || '';
            const empCodeNum = Number(empCode);
            row.getCell(1).value = !isNaN(empCodeNum) ? empCodeNum : empCode;
            row.getCell(1).font = { size: 12 };
            
            // 姓名 - 参考考勤表处理纯数字问题
            const empName = emp.emp_name || '';
            const empNameNum = Number(empName);
            row.getCell(2).value = !isNaN(empNameNum) ? empNameNum : empName;
            row.getCell(2).font = { size: 12 };
            
            // 日期 - 文本格式
            row.getCell(3).value = this._formatDate(record.record_date);
            row.getCell(3).font = { size: 12 };
            
            // 记账类型 - 文本格式
            row.getCell(4).value = record.record_type;
            row.getCell(4).font = { size: 12 };
            
            // 付款人 - 文本格式
            row.getCell(5).value = record.payer || ''; // 尝试获取付款人，如果没有则为空
            row.getCell(5).font = { size: 12 };
            
            // 金额 - 智能格式，整数显示整数，小数显示一位小数
            const amount = parseFloat(record.amount || 0);
            totalAmount += amount;
            row.getCell(6).value = amount;
            // 判断是否为整数
            const isInteger = Math.floor(amount) === amount;
            row.getCell(6).numFmt = isInteger ? '¥#,##0' : '¥#,##0.0';
            row.getCell(6).font = { size: 12 };
            
            // 备注 - 文本格式
            row.getCell(7).value = record.remark || '';
            row.getCell(7).font = { size: 12 };

            // 边框和对齐
            for(let i=1; i<=7; i++) {
                const cell = row.getCell(i);
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            }

            currentRow++;
        }

        // 添加总计行
        const totalRow = sheet.getRow(currentRow);
        // 合并第1-5列，显示"总计"
        sheet.mergeCells(currentRow, 1, currentRow, 5);
        totalRow.getCell(1).value = '总计';
        totalRow.getCell(1).font = { size: 14, bold: true };
        totalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        
        // 总计金额 - 显示为"¥12345元"格式
        totalRow.getCell(6).value = totalAmount;
        // 判断是否为整数
        const isTotalInteger = Math.floor(totalAmount) === totalAmount;
        totalRow.getCell(6).numFmt = isTotalInteger ? '¥#,##0' : '¥#,##0.0';
        totalRow.getCell(6).font = { size: 14, bold: true };
        totalRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
        
        // 边框设置
        for(let i=1; i<=7; i++) {
            const cell = totalRow.getCell(i);
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        }

        // 设置自动筛选，范围只包含需要筛选的列（工号、姓名、日期、记账类型、付款人），排除金额和备注列
        sheet.autoFilter = 'A2:E2';
        
        // 列宽
        sheet.getColumn(1).width = 10;
        sheet.getColumn(2).width = 15;
        sheet.getColumn(3).width = 15;
        sheet.getColumn(4).width = 12;
        sheet.getColumn(5).width = 12;
        sheet.getColumn(6).width = 15;
        sheet.getColumn(7).width = 20;
    }

    /**
     * 生成工资结算表 Sheet
     */
    async _generateSalarySettlementSheet(workbook, employees, attendanceRecords, settlementRecords, startDate, endDate, showSalary) {
        const sheet = workbook.addWorksheet('工资结算表');
        
        // 设置冻结：
        // xSplit: 2 -> 冻结前2列（工号、姓名）
        // ySplit: 2 -> 冻结前2行（标题行、表头行）
        sheet.views = [
            { state: 'frozen', xSplit: 2, ySplit: 2 }
        ];

        // 获取项目名称
        const projectName = localStorage.getItem('currentProjectName') || '未知项目';
        
        // 获取项目工时设置
        let projectRegularHours = 9;
        let projectOvertimeHours = 9;
        
        try {
            // 尝试从项目缓存中获取当前项目的设置
            const projectId = TimesheetDataService.getCurrentProjectId();
            let userId = 'default';
            const currentUserStr = localStorage.getItem('currentUser');
            if (currentUserStr) {
                const currentUser = JSON.parse(currentUserStr);
                userId = currentUser.user_id || 'default';
            }
            
            const cacheKey = 'project_cache_' + userId;
            const projectsStr = localStorage.getItem(cacheKey);
            
            let foundInCache = false;
            if (projectsStr) {
                const projects = JSON.parse(projectsStr);
                if (Array.isArray(projects)) {
                    const project = projects.find(p => p.project_id === projectId);
                    if (project) {
                        projectRegularHours = parseFloat(project.regular_hours) || 9;
                        projectOvertimeHours = parseFloat(project.overtime_hours) || 9;
                        foundInCache = true;
                    }
                }
            }
            
            // 如果缓存中没找到，尝试使用原来的方式（兼容旧代码）
            if (!foundInCache) {
                const cachedRegular = localStorage.getItem('currentProjectRegularHours');
                const cachedOvertime = localStorage.getItem('currentProjectOvertimeHours');
                
                if (cachedRegular) projectRegularHours = parseFloat(cachedRegular);
                if (cachedOvertime) projectOvertimeHours = parseFloat(cachedOvertime);
            }
        } catch (e) {
            console.warn('获取项目工时设置失败，使用默认值:', e);
            // 降级处理
            const cachedRegular = localStorage.getItem('currentProjectRegularHours');
            const cachedOvertime = localStorage.getItem('currentProjectOvertimeHours');
            
            if (cachedRegular) projectRegularHours = parseFloat(cachedRegular) || 9;
            if (cachedOvertime) projectOvertimeHours = parseFloat(cachedOvertime) || 9;
        }
        
        // 聚合数据
        const summary = {};
        
        // 初始化员工数据
        employees.forEach(emp => {
            summary[emp.employee_id] = {
                emp,
                regularHours: 0,
                overtimeHours: 0,
                contract: 0,
                piecework: 0,
                advance: 0,
                deduction: 0,
                transfer: 0,
                settled: 0
            };
        });

        // 累加考勤
        attendanceRecords.forEach(r => {
            if (!summary[r.employee_id]) return; // 忽略不在当前列表的员工
            
            if (r.work_type === '点工') {
                summary[r.employee_id].regularHours += parseFloat(r.regular_hours || 0);
                summary[r.employee_id].overtimeHours += parseFloat(r.overtime_hours || 0);
            } else if (r.work_type === '包工') {
                summary[r.employee_id].contract += parseFloat(r.contract_amount || 0);
            } else if (r.work_type === '工量') {
                summary[r.employee_id].piecework += parseFloat(r.contract_amount || 0);
            }
        });

        // 累加结算
        settlementRecords.forEach(r => {
            if (!summary[r.employee_id]) return;

            const amount = parseFloat(r.amount || 0);
            if (r.record_type === '借支') summary[r.employee_id].advance += amount;
            else if (r.record_type === '扣款') summary[r.employee_id].deduction += amount;
            else if (r.record_type === '公司转账') summary[r.employee_id].transfer += amount;
            else if (r.record_type === '结算') summary[r.employee_id].settled += amount;
        });

        // 排序并过滤：只显示有考勤记录或结算记录的员工
        const sortedSummary = Object.values(summary).filter(item => {
            // 检查是否有考勤记录或结算记录
            return item.regularHours > 0 || 
                   item.overtimeHours > 0 || 
                   item.contract > 0 || 
                   item.piecework > 0 || 
                   item.advance > 0 || 
                   item.deduction > 0 || 
                   item.transfer > 0 || 
                   item.settled > 0;
        }).sort((a, b) => (parseInt(a.emp.emp_code) || 0) - (parseInt(b.emp.emp_code) || 0));

        // 统计哪些列需要显示
        const columnsToShow = {
            basic: true, // 工号、姓名、点工、点工工钱始终显示
            contract: false, // 包工
            piecework: false, // 工量
            advance: false, // 借支
            deduction: false, // 扣款
            transfer: false, // 公司转账
            settled: false // 结算
        };

        // 检查哪些列有数据
        sortedSummary.forEach(item => {
            if (item.contract > 0) columnsToShow.contract = true;
            if (item.piecework > 0) columnsToShow.piecework = true;
            if (item.advance > 0) columnsToShow.advance = true;
            if (item.deduction > 0) columnsToShow.deduction = true;
            if (item.transfer > 0) columnsToShow.transfer = true;
            if (item.settled > 0) columnsToShow.settled = true;
        });

        // 动态生成表头
        const headers = ['工号', '姓名', '点工'];
        if (showSalary) {
            headers.push('点工工钱');
        }
        if (columnsToShow.contract) headers.push('包工');
        if (columnsToShow.piecework) headers.push('工量');
        if (columnsToShow.advance) headers.push('借支');
        if (columnsToShow.deduction) headers.push('扣款');
        if (columnsToShow.transfer) headers.push('公司转账');
        if (columnsToShow.settled) headers.push('结算');
        if (showSalary) {
            headers.push('剩余工资');
        }

        // 标题 - 加入项目名称，根据动态生成的标题列进行合并
        sheet.mergeCells(1, 1, 1, headers.length);
        const titleCell = sheet.getCell('A1');
        titleCell.value = `${projectName}\n${this._formatDate(startDate)}至${this._formatDate(endDate)}工资结算表`;
        titleCell.font = { size: 18, bold: true };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        // 设置第1行行高为50
        sheet.getRow(1).height = 50;

        // 生成表头
        const headerRow = sheet.getRow(2);
        // 设置第2行行高为25
        headerRow.height = 25;
        headers.forEach((text, index) => {
            const cell = headerRow.getCell(index + 1);
            cell.value = text;
            cell.font = { bold: true, size: 12 };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        // 添加自动筛选，范围包括工号和姓名列（A2:B2）
        sheet.autoFilter = 'A2:B2';

        // 初始化总计数据
        const totalSummary = {
            regularHours: 0,
            overtimeHours: 0,
            regularGong: 0,
            overtimeGong: 0,
            hourlyWage: 0,
            contract: 0,
            piecework: 0,
            advance: 0,
            deduction: 0,
            transfer: 0,
            settled: 0,
            remaining: 0
        };

        // 填充行
        let currentRow = 3;

        for (const item of sortedSummary) {
            const row = sheet.getRow(currentRow);
            // 设置内容行行高
            row.height = 35;
            const laborCost = parseFloat(item.emp.labor_cost || 0);

            // 计算剩余工资
            // 公式：(点工 + 包工 + 工量) - (借支 + 扣款 + 公司转账 + 结算)
            // 修改点工工钱计算逻辑，参考统计.html (statistic.js) 的计算方式
            // 分别计算上班工数和加班工数，四舍五入保留两位小数后再相加
            const regularGongRaw = item.regularHours / projectRegularHours;
            const overtimeGongRaw = item.overtimeHours / projectOvertimeHours;
            const roundedRegularGong = parseFloat(regularGongRaw.toFixed(2));
            const roundedOvertimeGong = parseFloat(overtimeGongRaw.toFixed(2));
            
            const totalGong = roundedRegularGong + roundedOvertimeGong;
            const hourlyWage = Math.floor(totalGong * laborCost);
            const totalEarned = hourlyWage + item.contract + item.piecework;
            const totalPaid = item.advance + item.deduction + item.transfer + item.settled;
            const remaining = totalEarned - totalPaid;

            // 累加总计数据
            totalSummary.regularHours += item.regularHours;
            totalSummary.overtimeHours += item.overtimeHours;
            totalSummary.regularGong += roundedRegularGong;
            totalSummary.overtimeGong += roundedOvertimeGong;
            totalSummary.hourlyWage += hourlyWage;
            totalSummary.contract += item.contract;
            totalSummary.piecework += item.piecework;
            totalSummary.advance += item.advance;
            totalSummary.deduction += item.deduction;
            totalSummary.transfer += item.transfer;
            totalSummary.settled += item.settled;
            totalSummary.remaining += remaining;

            let colIndex = 1;

            // 1. 工号 - 数字格式，参考考勤表处理方式
            const empCode = item.emp.emp_code || '';
            const empCodeNum = Number(empCode);
            row.getCell(colIndex).value = !isNaN(empCodeNum) ? empCodeNum : empCode;
            row.getCell(colIndex).font = { size: 12 };
            colIndex++;
            
            // 2. 姓名 - 参考考勤表处理纯数字问题
            const empName = item.emp.emp_name || '';
            const empNameNum = Number(empName);
            row.getCell(colIndex).value = !isNaN(empNameNum) ? empNameNum : empName;
            row.getCell(colIndex).font = { size: 12 };
            colIndex++;
            
            // 3. 点工 (计算工数)
            const regularGong = item.regularHours / projectRegularHours;
            const overtimeGong = item.overtimeHours / projectOvertimeHours;
            
            let diangongText = '';
            if (item.regularHours > 0) {
                diangongText += `${parseFloat(item.regularHours.toFixed(1))}小时=${parseFloat(regularGong.toFixed(2))}个工`;
            }
            if (item.overtimeHours > 0) {
                if (diangongText) diangongText += '\n';
                diangongText += `${parseFloat(item.overtimeHours.toFixed(1))}小时=${parseFloat(overtimeGong.toFixed(2))}个工`;
            }
            row.getCell(colIndex).value = diangongText;
            row.getCell(colIndex).alignment = { wrapText: true };
            row.getCell(colIndex).font = { size: 12 };
            colIndex++;

            // 4. 点工工钱 - 数字格式，添加"元"后缀
            if (showSalary) {
                row.getCell(colIndex).value = hourlyWage > 0 ? `${hourlyWage}元` : '';
                row.getCell(colIndex).font = { size: 12 };
                colIndex++;
            }

            // 动态列：根据是否显示来填充数据
            
            // 包工 - 数字格式，添加"元"后缀
            if (columnsToShow.contract) {
                row.getCell(colIndex).value = item.contract > 0 ? `${item.contract}元` : '';
                row.getCell(colIndex).font = { size: 12 };
                colIndex++;
            }
            
            // 工量 - 数字格式，添加"元"后缀
            if (columnsToShow.piecework) {
                row.getCell(colIndex).value = item.piecework > 0 ? `${item.piecework}元` : '';
                row.getCell(colIndex).font = { size: 12 };
                colIndex++;
            }
            
            // 借支 - 数字格式，添加"元"后缀
            if (columnsToShow.advance) {
                row.getCell(colIndex).value = item.advance > 0 ? `${item.advance}元` : '';
                row.getCell(colIndex).font = { size: 12 };
                colIndex++;
            }
            
            // 扣款 - 数字格式，添加"元"后缀
            if (columnsToShow.deduction) {
                row.getCell(colIndex).value = item.deduction > 0 ? `${item.deduction}元` : '';
                row.getCell(colIndex).font = { size: 12 };
                colIndex++;
            }
            
            // 公司转账 - 数字格式，添加"元"后缀
            if (columnsToShow.transfer) {
                row.getCell(colIndex).value = item.transfer > 0 ? `${item.transfer}元` : '';
                row.getCell(colIndex).font = { size: 12 };
                colIndex++;
            }
            
            // 结算 - 数字格式，添加"元"后缀
            if (columnsToShow.settled) {
                row.getCell(colIndex).value = item.settled > 0 ? `${item.settled}元` : '';
                row.getCell(colIndex).font = { size: 12 };
                colIndex++;
            }

            // 剩余工资 - 数字格式，添加"元"后缀
            if (showSalary) {
                row.getCell(colIndex).value = `${remaining}元`;
                row.getCell(colIndex).font = { size: 12 };
                // 设置颜色：正数黑色，负数红色
                if (remaining < 0) {
                    row.getCell(colIndex).font = { color: { argb: 'FFFF0000' }, size: 12 };
                }
                colIndex++;
            }

            // 边框和居中
            for(let i=1; i<colIndex; i++) {
                const cell = row.getCell(i);
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            }

            currentRow++;
        }

        // 添加总计行
        const totalRow = sheet.getRow(currentRow);
        // 设置总计行行高为45
        totalRow.height = 45;
        
        // 合并第1-2列，显示"总计"
        sheet.mergeCells(currentRow, 1, currentRow, 2);
        totalRow.getCell(1).value = '总计';
        totalRow.getCell(1).font = { size: 14, bold: true };
        totalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        
        let colIndex = 3;

        // 点工总计 - 计算总工数
        const totalGong = parseFloat((totalSummary.regularGong + totalSummary.overtimeGong).toFixed(2));
        let diangongTotalText = '';
        if (totalSummary.regularHours > 0) {
            diangongTotalText += `${parseFloat(totalSummary.regularHours.toFixed(1))}小时`;
        }
        if (totalSummary.overtimeHours > 0) {
            if (diangongTotalText) diangongTotalText += '\n';
            diangongTotalText += `${parseFloat(totalSummary.overtimeHours.toFixed(1))}小时`;
        }
        diangongTotalText += `\n=${totalGong}个工`;
        totalRow.getCell(colIndex).value = diangongTotalText;
        totalRow.getCell(colIndex).alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
        totalRow.getCell(colIndex).font = { size: 12, bold: true };
        colIndex++;
        
        // 点工工钱总计
        if (showSalary) {
            totalRow.getCell(colIndex).value = `${totalSummary.hourlyWage}元`;
            totalRow.getCell(colIndex).font = { size: 12, bold: true };
            totalRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
            colIndex++;
        }
        
        // 动态列：根据是否显示来填充总计数据
        
        // 包工总计
        if (columnsToShow.contract) {
            totalRow.getCell(colIndex).value = `${totalSummary.contract}元`;
            totalRow.getCell(colIndex).font = { size: 12, bold: true };
            totalRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
            colIndex++;
        }
        
        // 工量总计
        if (columnsToShow.piecework) {
            totalRow.getCell(colIndex).value = `${totalSummary.piecework}元`;
            totalRow.getCell(colIndex).font = { size: 12, bold: true };
            totalRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
            colIndex++;
        }
        
        // 借支总计
        if (columnsToShow.advance) {
            totalRow.getCell(colIndex).value = `${totalSummary.advance}元`;
            totalRow.getCell(colIndex).font = { size: 12, bold: true };
            totalRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
            colIndex++;
        }
        
        // 扣款总计
        if (columnsToShow.deduction) {
            totalRow.getCell(colIndex).value = `${totalSummary.deduction}元`;
            totalRow.getCell(colIndex).font = { size: 12, bold: true };
            totalRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
            colIndex++;
        }
        
        // 公司转账总计
        if (columnsToShow.transfer) {
            totalRow.getCell(colIndex).value = `${totalSummary.transfer}元`;
            totalRow.getCell(colIndex).font = { size: 12, bold: true };
            totalRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
            colIndex++;
        }
        
        // 结算总计
        if (columnsToShow.settled) {
            totalRow.getCell(colIndex).value = `${totalSummary.settled}元`;
            totalRow.getCell(colIndex).font = { size: 12, bold: true };
            totalRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
            colIndex++;
        }
        
        // 剩余工资总计
        if (showSalary) {
            totalRow.getCell(colIndex).value = `${totalSummary.remaining}元`;
            totalRow.getCell(colIndex).font = { size: 12, bold: true, color: { argb: totalSummary.remaining < 0 ? 'FFFF0000' : 'FF000000' } };
            totalRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
            colIndex++;
        }
        
        // 边框设置
        for(let i=1; i<colIndex; i++) {
            const cell = totalRow.getCell(i);
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        }

        // 列宽
        sheet.getColumn(1).width = 8;
        sheet.getColumn(2).width = 12;
        sheet.getColumn(3).width = 25; // 点工列宽一些
        
        colIndex = 4;
        
        if (showSalary) {
             sheet.getColumn(colIndex).width = 12; // 点工工钱
             colIndex++;
        }

        // 动态列宽设置
        if (columnsToShow.contract) {
            sheet.getColumn(colIndex).width = 12;
            colIndex++;
        }
        if (columnsToShow.piecework) {
            sheet.getColumn(colIndex).width = 12;
            colIndex++;
        }
        if (columnsToShow.advance) {
            sheet.getColumn(colIndex).width = 12;
            colIndex++;
        }
        if (columnsToShow.deduction) {
            sheet.getColumn(colIndex).width = 12;
            colIndex++;
        }
        if (columnsToShow.transfer) {
            sheet.getColumn(colIndex).width = 12;
            colIndex++;
        }
        if (columnsToShow.settled) {
            sheet.getColumn(colIndex).width = 12;
            colIndex++;
        }
        // 剩余工资列
        if (showSalary) {
            sheet.getColumn(colIndex).width = 15;
            colIndex++;
        }
    }

    // 辅助方法：解析 YYYY年MM月DD日
    _parseDateStr(dateStr) {
        const match = dateStr.match(/(\d{4})年(\d{2})月(\d{2})日/);
        if (match) {
            return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
        }
        return null;
    }

    // 辅助方法：格式化日期 YYYY年MM月DD日
    _formatDate(date) {
        if (typeof date === 'string') date = new Date(date);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}年${m}月${d}日`;
    }

    // 辅助方法：按日期范围筛选
    _filterByDateRange(records, projectId, startDate, endDate) {
        return records.filter(r => {
            if (r.project_id !== projectId) return false;
            const d = new Date(r.record_date);
            // 将时间设为0进行比较
            const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
            const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            return target >= start && target <= end;
        });
    }
}

// 导出全局实例
window.timesheetExportService = new TimesheetExportService();
