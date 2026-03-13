(function() {
    'use strict';

    function isDateString(str) {
        if (!str || typeof str !== 'string') return false;
        
        var datePatterns = [
            /^\d{4}年\d{1,2}月\d{1,2}日$/,
            /^\d{4}-\d{1,2}-\d{1,2}$/,
            /^\d{4}\/\d{1,2}\/\d{1,2}$/,
            /^\d{1,2}月\d{1,2}日$/,
            /^\d{1,2}-\d{1,2}$/,
            /^\d{1,2}\/\d{1,2}$/,
            /^\d{4}\d{2}\d{2}$/
        ];
        
        for (var i = 0; i < datePatterns.length; i++) {
            if (datePatterns[i].test(str)) {
                return true;
            }
        }
        
        return false;
    }

    function formatTime(time, addDecimalPoint) {
        if (addDecimalPoint === undefined) {
            addDecimalPoint = true;
        }
        
        if (time === '') return '';
        
        if (time === 'J' || time === 'j') {
            return '✓';
        }
        
        if (time === 'X' || time === 'x') {
            return '×';
        }
        
        if (addDecimalPoint) {
            var num = parseFloat(time);
            if (!isNaN(num) && num > 14) {
                var str = num.toString();
                if (str.length >= 2) {
                    return str.charAt(0) + '.' + str.substring(1);
                }
            }
        }
        
        if (time === '05') {
            return '0.5';
        }
        
        if (time.includes('-')) {
            var parts = time.split('-');
            if (parts.length === 2) {
                return parts[0] + '.' + parts[1];
            }
        }
        
        if (time.endsWith('.')) {
            return time.slice(0, -1);
        }
        
        return time;
    }

    function renderTable(data) {
        var tableBody1 = document.getElementById('tableBody1');
        var tableBody2 = document.getElementById('tableBody2');
        tableBody1.innerHTML = '';
        tableBody2.innerHTML = '';
        
        document.querySelector('.table-container:last-child').style.display = '';
        
        document.querySelector('.header-info').classList.add('show');
        document.querySelector('.tables-wrapper').classList.add('show');
        document.getElementById('saveButton').classList.add('show');
        document.querySelector('.batch-button').classList.add('show');
        document.querySelector('.validate-button').classList.add('show');
        
        var employeeMap = {};
        var currentProjectId = localStorage.getItem('currentProjectId') || '';
        
        try {
            var phone = localStorage.getItem('loggedInPhone') || 'default';
            
            if (currentProjectId) {
                var projectEmployeeKey = 'employees_' + currentProjectId;
                var projectEmployeeData = localStorage.getItem(projectEmployeeKey);
                if (projectEmployeeData) {
                    var parsed = JSON.parse(projectEmployeeData);
                    if (parsed.employees && Array.isArray(parsed.employees)) {
                        parsed.employees.forEach(function(emp) {
                            if (emp.emp_code) {
                                var key = currentProjectId + '_' + emp.emp_code;
                                employeeMap[key] = {
                                    emp_name: emp.emp_name || '',
                                    project_id: currentProjectId,
                                    emp_code: emp.emp_code
                                };
                                employeeMap[emp.emp_code] = emp.emp_name || '';
                            }
                        });
                    }
                }
            }
        } catch (error) {
            console.error('加载员工数据失败:', error);
        }
        
        var parsedData = [];
        
        if (data && data.length > 0 && data[0].prunedResult) {
            var parsingResList = data[0].prunedResult.parsing_res_list;
            var tableBlock = parsingResList.find(function(block) { return block.block_label === 'table'; });
            
            var titleBlock = parsingResList.find(function(block) { return block.block_label === 'paragraph_title'; });
            var dateBlock = parsingResList.find(function(block) { return block.block_label === 'vision_footnote'; });
            
            if (dateBlock) {
                var dateText = dateBlock.block_content.trim();
                dateText = dateText.replace(/^#+/, '').trim();
                dateText = dateText.replace(/\s+/g, '');
                document.querySelector('.header-info .date').textContent = dateText;
            }
            
            if (titleBlock) {
                var companyText = titleBlock.block_content.trim();
                companyText = companyText.replace(/^#+/, '').trim();
                document.querySelector('.header-info .company').textContent = companyText;
            }
            
            if (tableBlock) {
                var tableHtml = tableBlock.block_content;
                var parser = new DOMParser();
                var doc = parser.parseFromString(tableHtml, 'text/html');
                var rows = doc.querySelectorAll('tr');
                
                for (var i = 1; i < rows.length; i++) {
                    var cells = rows[i].querySelectorAll('td');
                    
                    if (cells.length >= 7) {
                        var morning = cells[3].textContent.trim();
                        var afternoon = cells[4].textContent.trim();
                        var overtime = cells[5].textContent.trim();
                        var contract = cells[6].textContent.trim();
                        
                        morning = formatTime(morning, true);
                        afternoon = formatTime(afternoon, true);
                        overtime = formatTime(overtime, true);
                        contract = formatTime(contract, false);
                        
                        if (morning !== '' || afternoon !== '' || overtime !== '' || contract !== '') {
                            var empId = cells[0].textContent.trim();
                            var jsonName = cells[1].textContent.trim();
                            var matchKey = currentProjectId + '_' + empId;
                            var empData = employeeMap[matchKey];
                            var nameMatched = empData !== undefined;
                            var empName = nameMatched ? empData.emp_name : employeeMap[empId];
                            
                            parsedData.push({
                                id: empId,
                                name: nameMatched ? empName : jsonName,
                                nameMatched: nameMatched,
                                morning: morning,
                                afternoon: afternoon,
                                overtime: overtime,
                                contract: contract
                            });
                        }
                    }
                    
                    if (cells.length >= 14) {
                        var morning2 = cells[10].textContent.trim();
                        var afternoon2 = cells[11].textContent.trim();
                        var overtime2 = cells[12].textContent.trim();
                        var contract2 = cells[13].textContent.trim();
                        
                        morning2 = formatTime(morning2, true);
                        afternoon2 = formatTime(afternoon2, true);
                        overtime2 = formatTime(overtime2, true);
                        contract2 = formatTime(contract2, false);
                        
                        if (morning2 !== '' || afternoon2 !== '' || overtime2 !== '' || contract2 !== '') {
                            var empId2 = cells[7].textContent.trim();
                            var jsonName2 = cells[8].textContent.trim();
                            var matchKey2 = currentProjectId + '_' + empId2;
                            var empData2 = employeeMap[matchKey2];
                            var nameMatched2 = empData2 !== undefined;
                            var empName2 = nameMatched2 ? empData2.emp_name : employeeMap[empId2];
                            
                            parsedData.push({
                                id: empId2,
                                name: nameMatched2 ? empName2 : jsonName2,
                                nameMatched: nameMatched2,
                                morning: morning2,
                                afternoon: afternoon2,
                                overtime: overtime2,
                                contract: contract2
                            });
                        }
                    }
                }
                
                parsedData.sort(function(a, b) {
                    var idA = parseInt(a.id) || 0;
                    var idB = parseInt(b.id) || 0;
                    return idA - idB;
                });
            }
        } else {
            if (data.headerInfo && data.data) {
                if (data.headerInfo.company) {
                    document.querySelector('.header-info .company').textContent = data.headerInfo.company;
                }
                if (data.headerInfo.date) {
                    document.querySelector('.header-info .date').textContent = data.headerInfo.date;
                }
                
                data.data.forEach(function(item) {
                    var morning = item.morning || '';
                    var afternoon = item.afternoon || '';
                    var overtime = item.overtime || '';
                    var contract = item.contract || '';
                    
                    if (morning === '' && afternoon === '' && overtime === '' && contract === '') {
                        return;
                    }
                    
                    parsedData.push({
                        id: item.id || '',
                        name: item.name || '',
                        nameMatched: item.nameMatched !== undefined ? item.nameMatched : true,
                        morning: morning,
                        afternoon: afternoon,
                        overtime: overtime,
                        contract: contract,
                        isBlue: item.isBlue || false,
                        iconColor: item.iconColor || '⚫'
                    });
                });
            } else if (data.title && data.employees) {
                if (data.title) {
                    document.querySelector('.header-info .company').textContent = data.title;
                }
                if (data.date) {
                    document.querySelector('.header-info .date').textContent = data.date;
                }
                
                data.employees.forEach(function(emp) {
                    var empId = emp['工号'] || emp.id || '';
                    var empName = emp['姓名'] || emp.name || '';
                    var morning = emp['上午'] || emp.morning || '';
                    var afternoon = emp['下午'] || emp.afternoon || '';
                    var overtime = emp['加班'] || emp.overtime || '';
                    var contract = emp['包工'] || emp.contract || '';
                    
                    morning = formatTime(String(morning), true);
                    afternoon = formatTime(String(afternoon), true);
                    overtime = formatTime(String(overtime), true);
                    contract = formatTime(String(contract), false);
                    
                    if (morning !== '' || afternoon !== '' || overtime !== '' || contract !== '') {
                        var matchKey = currentProjectId + '_' + empId;
                        var empData = employeeMap[matchKey];
                        var nameMatched = empData !== undefined;
                        var finalName = nameMatched ? empData.emp_name : (employeeMap[empId] || empName);
                        
                        parsedData.push({
                            id: String(empId),
                            name: finalName,
                            nameMatched: nameMatched,
                            morning: morning,
                            afternoon: afternoon,
                            overtime: overtime,
                            contract: contract
                        });
                    }
                });
                
                parsedData.sort(function(a, b) {
                    var idA = parseInt(a.id) || 0;
                    var idB = parseInt(b.id) || 0;
                    return idA - idB;
                });
            } else {
                var keys = Object.keys(data);
                var titleValue = null;
                var dateValue = null;
                var employeesData = null;
                
                if (keys.length >= 2) {
                    var value0 = data[keys[0]];
                    var value1 = data[keys[1]];
                    
                    var isDatePattern0 = isDateString(value0);
                    var isDatePattern1 = isDateString(value1);
                    
                    if (isDatePattern0 && !isDatePattern1) {
                        dateValue = value0;
                        titleValue = value1;
                    } else if (!isDatePattern0 && isDatePattern1) {
                        titleValue = value0;
                        dateValue = value1;
                    } else {
                        titleValue = value0;
                        dateValue = value1;
                    }
                } else if (keys.length >= 1) {
                    titleValue = data[keys[0]];
                }
                
                for (var kIdx = 2; kIdx < keys.length; kIdx++) {
                    var keyName = keys[kIdx];
                    var keyValue = data[keyName];
                    if (keyName.indexOf('√') !== -1 || keyName.indexOf('半天') !== -1 || 
                        (typeof keyValue === 'string' && (keyValue.indexOf('√') !== -1 || keyValue.indexOf('半天') !== -1))) {
                        continue;
                    }
                    if (Array.isArray(keyValue) && keyValue.length > 0) {
                        var firstItem = keyValue[0];
                        if (firstItem && (firstItem['工号'] || firstItem['姓名'] || firstItem.id || firstItem.name)) {
                            employeesData = keyValue;
                            break;
                        }
                    }
                }
                
                if (titleValue && typeof titleValue === 'string') {
                    document.querySelector('.header-info .company').textContent = titleValue;
                }
                if (dateValue && typeof dateValue === 'string') {
                    document.querySelector('.header-info .date').textContent = dateValue;
                }
                
                if (employeesData) {
                    employeesData.forEach(function(emp) {
                        var empId = emp['工号'] || emp.id || '';
                        var empName = emp['姓名'] || emp.name || '';
                        var morning = emp['上午'] || emp.morning || '';
                        var afternoon = emp['下午'] || emp.afternoon || '';
                        var overtime = emp['加班'] || emp.overtime || '';
                        var contract = emp['包工'] || emp.contract || '';
                        
                        morning = formatTime(String(morning), true);
                        afternoon = formatTime(String(afternoon), true);
                        overtime = formatTime(String(overtime), true);
                        contract = formatTime(String(contract), false);
                        
                        if (morning !== '' || afternoon !== '' || overtime !== '' || contract !== '') {
                            var matchKey = currentProjectId + '_' + empId;
                            var empData = employeeMap[matchKey];
                            var nameMatched = empData !== undefined;
                            var finalName = nameMatched ? empData.emp_name : (employeeMap[empId] || empName);
                            
                            parsedData.push({
                                id: String(empId),
                                name: finalName,
                                nameMatched: nameMatched,
                                morning: morning,
                                afternoon: afternoon,
                                overtime: overtime,
                                contract: contract
                            });
                        }
                    });
                    
                    parsedData.sort(function(a, b) {
                        var idA = parseInt(a.id) || 0;
                        var idB = parseInt(b.id) || 0;
                        return idA - idB;
                    });
                }
            }
        }
        
        var isMobile = window.innerWidth <= 768;
        var maxRowsPerTable = isMobile ? parsedData.length : 33;
        var firstTableData = parsedData.slice(0, maxRowsPerTable);
        var secondTableData = isMobile ? [] : parsedData.slice(maxRowsPerTable, maxRowsPerTable * 2);
        
        firstTableData.forEach(function(item, index) {
            var row = document.createElement('tr');
            var nameStyle = item.nameMatched ? '' : 'style="color: red;"';
            var nameEditable = item.nameMatched ? 'contenteditable="false"' : 'contenteditable="true"';
            var nameEditableData = item.nameMatched ? 'data-editable="false"' : 'data-editable="true"';
            
            var iconColor = item.iconColor || '⚫';
            var isBlue = item.isBlue || false;
            
            if (isBlue) {
                row.classList.add('blue-row');
            }
            
            row.innerHTML = 
                '<td style="text-align: center; cursor: pointer;" onclick="toggleRowColor(this)">' + iconColor + '</td>' +
                '<td contenteditable="false" class="id-cell" data-editable="false">' + item.id + '</td>' +
                '<td class="name-cell" ' + nameEditable + ' ' + nameEditableData + ' ' + nameStyle + '>' + item.name + '</td>' +
                '<td contenteditable="true" data-editable="true">' + item.morning + '</td>' +
                '<td contenteditable="true" data-editable="true">' + item.afternoon + '</td>' +
                '<td contenteditable="true" data-editable="true">' + item.overtime + '</td>' +
                '<td contenteditable="true" data-editable="true">' + item.contract + '</td>';
            
            if (isBlue) {
                var cells = row.querySelectorAll('td');
                cells.forEach(function(cell, cellIndex) {
                    if (cellIndex !== 0) {
                        cell.style.color = 'blue';
                        cell.contentEditable = false;
                    }
                });
            }
            
            tableBody1.appendChild(row);
        });
        
        if (secondTableData.length > 0) {
            secondTableData.forEach(function(item, index) {
                var row = document.createElement('tr');
                var nameStyle = item.nameMatched ? '' : 'style="color: red;"';
                var nameEditable = item.nameMatched ? 'contenteditable="false"' : 'contenteditable="true"';
                var nameEditableData = item.nameMatched ? 'data-editable="false"' : 'data-editable="true"';
                
                var iconColor = item.iconColor || '⚫';
                var isBlue = item.isBlue || false;
                
                if (isBlue) {
                    row.classList.add('blue-row');
                }
                
                row.innerHTML = 
                    '<td style="text-align: center; cursor: pointer;" onclick="toggleRowColor(this)">' + iconColor + '</td>' +
                    '<td contenteditable="false" class="id-cell" data-editable="false">' + item.id + '</td>' +
                    '<td class="name-cell" ' + nameEditable + ' ' + nameEditableData + ' ' + nameStyle + '>' + item.name + '</td>' +
                    '<td contenteditable="true" data-editable="true">' + item.morning + '</td>' +
                    '<td contenteditable="true" data-editable="true">' + item.afternoon + '</td>' +
                    '<td contenteditable="true" data-editable="true">' + item.overtime + '</td>' +
                    '<td contenteditable="true" data-editable="true">' + item.contract + '</td>';
                
                if (isBlue) {
                    var cells = row.querySelectorAll('td');
                    cells.forEach(function(cell, cellIndex) {
                        if (cellIndex !== 0) {
                            cell.style.color = 'blue';
                            cell.contentEditable = false;
                        }
                    });
                }
                
                tableBody2.appendChild(row);
            });
        } else {
            document.querySelector('.table-container:last-child').style.display = 'none';
        }
    }

    window.JsonParserService = {
        formatTime: formatTime,
        renderTable: renderTable
    };
})();
