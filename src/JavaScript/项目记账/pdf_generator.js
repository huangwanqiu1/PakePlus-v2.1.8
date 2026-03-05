// PDF生成功能
class PDFGenerator {
    constructor() {
        this.init();
    }

    init() {
        // 绑定生成PDF按钮事件
        const generatePdfBtn = document.getElementById('generatePdfBtn');
        if (generatePdfBtn) {
            generatePdfBtn.addEventListener('click', () => {
                this.generatePDF();
            });
        }
    }

    // 获取项目名称
    getProjectName() {
        const projectNameInput = document.getElementById('projectName');
        return projectNameInput ? projectNameInput.value : '未知项目';
    }

    // 获取日期显示文本
    getDateDisplayText() {
        const dateDisplay = document.getElementById('dateDisplay');
        if (dateDisplay) {
            return dateDisplay.textContent || dateDisplay.innerText;
        }
        return '';
    }

    // 获取当前表格类型
    getCurrentTableType() {
        const expenseTableHeader = document.getElementById('expenseTableHeader');
        const incomeTableHeader = document.getElementById('incomeTableHeader');
        
        if (expenseTableHeader && expenseTableHeader.style.display !== 'none') {
            return 'expense';
        } else if (incomeTableHeader && incomeTableHeader.style.display !== 'none') {
            return 'income';
        }
        return null;
    }

    // 获取表格数据
    getTableData() {
        const tableType = this.getCurrentTableType();
        if (!tableType) {
            console.error('无法确定当前表格类型');
            return { type: null, headers: [], data: [], totalAmount: 0 };
        }

        const tableBody = document.querySelector('#detailTableSection tbody');
        if (!tableBody) {
            console.error('找不到表格tbody元素');
            return { type: null, headers: [], data: [], totalAmount: 0 };
        }

        const rows = tableBody.querySelectorAll('tr');
        if (rows.length === 0) {
            console.error('表格中没有数据');
            return { type: null, headers: [], data: [], totalAmount: 0 };
        }

        // 获取表头
        let headers = [];
        if (tableType === 'expense') {
            headers = ['序号', '日期', '付款人', '支出金额（元）', '明细说明', '备注', '图片'];
        } else {
            headers = ['序号', '日期', '收入金额（元）', '明细说明', '备注', '图片'];
        }

        // 获取数据行
        const data = [];
        let totalAmount = 0;

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length > 0) {
                const rowData = [];
                
                // 检测是否是结算借支数据（蓝色字体数据）
                // 方法1：检查行的style属性
                let isSettlementRecord = row.style.color === '#1890ff' || row.style.getPropertyValue('color') === '#1890ff';
                
                // 方法2：检查单元格的style属性
                if (!isSettlementRecord) {
                    const cells = row.querySelectorAll('td');
                    for (let i = 0; i < cells.length; i++) {
                        const cell = cells[i];
                        if (cell.style.color === '#1890ff' || cell.style.getPropertyValue('color') === '#1890ff') {
                            isSettlementRecord = true;
                            break;
                        }
                    }
                }
                
                // 方法3：检查行的class或其他属性
                if (!isSettlementRecord) {
                    isSettlementRecord = row.classList.contains('settlement-record') || row.dataset.recordType === 'settlement';
                }
                
                // 根据表格类型提取数据
                if (tableType === 'expense') {
                    // 支出表格
                    for (let i = 0; i < 7; i++) {
                        if (i < cells.length) {
                            let cellText = cells[i].textContent || cells[i].innerText;
                            
                            // 处理金额列，提取数字
                            if (i === 3) { // 支出金额列
                                const amountText = cellText.replace(/[^\d.]/g, '');
                                const amount = parseFloat(amountText) || 0;
                                totalAmount += amount;
                                rowData.push(cellText);
                            } else {
                                rowData.push(cellText);
                            }
                        } else {
                            rowData.push('');
                        }
                    }
                } else {
                    // 收入表格
                    for (let i = 0; i < 6; i++) {
                        if (i < cells.length) {
                            let cellText = cells[i].textContent || cells[i].innerText;
                            
                            // 处理金额列，提取数字
                            if (i === 2) { // 收入金额列
                                const amountText = cellText.replace(/[^\d.]/g, '');
                                const amount = parseFloat(amountText) || 0;
                                totalAmount += amount;
                                rowData.push(cellText);
                            } else {
                                rowData.push(cellText);
                            }
                        } else {
                            rowData.push('');
                        }
                    }
                }
                
                // 添加是否是结算借支数据的标记
                rowData.isSettlementRecord = isSettlementRecord;
                
                data.push(rowData);
            }
        });

        return {
            type: tableType,
            headers: headers,
            data: data,
            totalAmount: totalAmount
        };
    }

    // 生成PDF
    async generatePDF() {
        let originalText = '生成PDF'; // 默认值
        try {
            // 获取按钮元素和原始文本
            const generatePdfBtn = document.getElementById('generatePdfBtn');
            if (generatePdfBtn) {
                originalText = generatePdfBtn.textContent;
                generatePdfBtn.textContent = '加载中...';
            }
            
            // 确保jsPDF库已加载
            if (typeof window.jsPDF === 'undefined') {
                // 尝试使用其他可能的全局变量
                if (typeof window.jspdf !== 'undefined' && window.jspdf.jsPDF) {
                    window.jsPDF = window.jspdf.jsPDF;
                } else {
                    throw new Error('jsPDF库未加载，请刷新页面重试');
                }
            }

            // 获取数据
            const projectName = this.getProjectName();
            const dateText = this.getDateDisplayText();
            const tableData = this.getTableData();

            if (!tableData.type || tableData.data.length === 0) {
                alert('没有可导出的数据');
                if (generatePdfBtn) {
                    generatePdfBtn.textContent = originalText;
                }
                return;
            }

            // 创建临时HTML元素来渲染表格
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '-9999px';
            tempDiv.style.padding = '20px';
            tempDiv.style.fontFamily = 'Microsoft YaHei, sans-serif';
            tempDiv.style.fontSize = '12px';
            tempDiv.style.backgroundColor = 'white';
            tempDiv.style.width = '210mm'; // A4宽度
            
            // 构建HTML内容
            // 如果是收入类型，则不显示日期
            const isIncome = tableData.type === 'income';
            let htmlContent = `
                <div style="display: flex; justify-content: ${isIncome ? 'center' : 'space-between'}; align-items: center; margin-bottom: 20px;">
                    ${!isIncome ? `<h2 style="margin: 0; color: #333; font-size: 14px;">${dateText}</h2>` : ''}
                    <h1 style="margin: 0; color: #1890ff; text-align: center; flex: 1;">${projectName}</h1>
                    ${!isIncome ? `<h3 style="margin: 0; color: #722ed1; background-color: #f0f5ff; padding: 8px; border-radius: 4px; font-size: 14px;">项目支出明细</h3>` : `<h3 style="margin: 0; color: #52c41a; background-color: #f6ffed; padding: 8px; border-radius: 4px; font-size: 14px;">项目收入明细</h3>`}
                </div>
                <table style="width: 100%; border-collapse: collapse; margin: 0 auto 20px auto; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <thead>
                        <tr style="background-color: ${isIncome ? '#52c41a' : '#1890ff'}; color: white;">
            `;
            
            // 添加表头
            tableData.headers.forEach(header => {
                htmlContent += `<th style="border: 1px solid #ddd; padding: 8px; text-align: center; font-weight: bold;">${header}</th>`;
            });
            
            htmlContent += `
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            // 添加数据行
            tableData.data.forEach((row, index) => {
                const bgColor = index % 2 === 0 ? '#ffffff' : '#e6f7ff'; // 白色和淡蓝色交替
                
                // 检查是否是结算借支数据
                const isSettlementRecord = row.isSettlementRecord;
                
                // 设置行样式
                let rowStyle = `background-color: ${bgColor};`;
                if (isSettlementRecord) {
                    rowStyle += ' color: #1890ff; font-weight: 500;';
                }
                
                htmlContent += `<tr style="${rowStyle};">`;
                row.forEach((cell, cellIndex) => {
                    // 跳过isSettlementRecord属性
                    if (cellIndex === row.length - 1 && typeof cell === 'boolean') {
                        return;
                    }
                    
                    // 根据单元格类型决定对齐方式
                    let align = 'left'; // 默认左对齐
                    
                    if (isIncome) {
                        // 收入表格对齐方式
                        if (cellIndex === 0) {
                            // 序号列居中
                            align = 'center';
                        } else if (cellIndex === 1) {
                            // 日期列居中
                            align = 'center';
                        } else if (cellIndex === 2) {
                            // 收入金额列居中
                            align = 'center';
                        } else if (cellIndex === 3) {
                            // 明细说明列靠左显示
                            align = 'left';
                        } else if (cellIndex === 4) {
                            // 备注列靠左显示
                            align = 'left';
                        } else if (cellIndex === 5) {
                            // 图片列居中
                            align = 'center';
                        }
                    } else {
                        // 支出表格对齐方式
                        if (cellIndex === 0) {
                            // 序号列居中
                            align = 'center';
                        } else if (cellIndex === 1) {
                            // 日期列居中
                            align = 'center';
                        } else if (cellIndex === 2) {
                            // 付款人列居中
                            align = 'center';
                        } else if (cellIndex === 3) {
                            // 支出金额列居中
                            align = 'center';
                        } else if (cellIndex === 4) {
                            // 明细说明列靠左显示
                            align = 'left';
                        } else if (cellIndex === 5) {
                            // 备注列靠左显示
                            align = 'left';
                        } else if (cellIndex === 6) {
                            // 图片列居中
                            align = 'center';
                        }
                    }
                    
                    // 设置单元格样式
                    let cellStyle = `border: 1px solid #ddd; padding: 8px; text-align: ${align};`;
                    if (isSettlementRecord) {
                        cellStyle += ' color: #1890ff; font-weight: 500;';
                    }
                    
                    htmlContent += `<td style="${cellStyle};">${cell}</td>`;
                });
                htmlContent += '</tr>';
            });
            
            // 格式化合计金额，如果是整数则不显示小数点
            const totalAmount = tableData.totalAmount.toFixed(2);
            const formattedTotal = totalAmount.endsWith('.00') ? 
                `¥${parseInt(tableData.totalAmount).toLocaleString()}元` : 
                `¥${tableData.totalAmount.toLocaleString()}元`;
            
            htmlContent += `
                    </tbody>
                </table>
                <div style="text-align: left; font-weight: bold; font-size: 14px; margin-top: 20px; color: #ff4d4f;">
                    合计：${formattedTotal}
                </div>
            `;
            
            tempDiv.innerHTML = htmlContent;
            document.body.appendChild(tempDiv);
            
            // 使用html2canvas将HTML转换为图像
            const canvas = await window.html2canvas(tempDiv, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff'
            });
            
            // 创建PDF文档
            const pdf = new window.jsPDF('p', 'mm', 'a4');
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = 210; // A4宽度(mm)
            const pageHeight = 297; // A4高度(mm)
            const imgHeight = canvas.height * imgWidth / canvas.width;
            let heightLeft = imgHeight;
            let position = 0;
            
            // 添加图像到PDF，如果需要分页则添加多页
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
            
            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }
            
            // 移除临时元素
            document.body.removeChild(tempDiv);
            
            // 保存PDF
            const fileName = `${projectName}_${tableData.type === 'expense' ? '支出' : '收入'}明细_${new Date().toISOString().slice(0, 10)}.pdf`;
            
            // 尝试使用文件保存对话框
            if (window.showSaveFilePicker) {
                try {
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: fileName,
                        types: [
                            { accept: { 'application/pdf': ['.pdf'] } }
                        ]
                    });
                    
                    // 获取PDF数据
                    const pdfData = pdf.output('blob');
                    const writable = await fileHandle.createWritable();
                    await writable.write(pdfData);
                    await writable.close();
                    return;
                } catch (err) {
                    // 用户取消保存或其他错误，使用默认保存方式
                    console.log('文件保存对话框错误:', err);
                }
            }
            
            // 默认保存方式
            pdf.save(fileName);
            
            // 恢复按钮文本
            if (generatePdfBtn) {
                generatePdfBtn.textContent = originalText;
            }
            
        } catch (error) {
            console.error('生成PDF失败:', error);
            alert('生成PDF失败，请重试');
            // 恢复按钮文本
            const generatePdfBtn = document.getElementById('generatePdfBtn');
            if (generatePdfBtn) {
                generatePdfBtn.textContent = originalText;
            }
        }
    }

    // 计算列宽
    calculateColumnWidths(pdf, headers, pageWidth) {
        // 由于使用autoTable插件，这个方法现在不需要了
        return [];
    }
}

// 初始化PDF生成器
document.addEventListener('DOMContentLoaded', function() {
    window.pdfGenerator = new PDFGenerator();
});