// PDF生成功能
class WorkOrderPDFGenerator {
    constructor() {
        this.init();
    }

    init() {
        // 绑定生成PDF按钮事件
        const generatePdfBtn = document.getElementById('generatePdfBtn');
        if (generatePdfBtn) {
            generatePdfBtn.addEventListener('click', () => {
                const btnText = generatePdfBtn.textContent.trim();
                
                // 检查当前激活的标签页
                const workFlowTab = document.getElementById('tabWorkFlow');
                const isWorkFlowActive = workFlowTab && workFlowTab.checked;
                
                if (isWorkFlowActive && btnText === '生成点工单') {
                    // 按钮显示为"生成点工单"，执行点工单PDF生成
                    if (window.workOrderPDFCreator) {
                        window.workOrderPDFCreator.generateWorkOrderPDF();
                    }
                } else {
                    // 按钮显示为"生成表格"，执行原有的PDF生成功能
                    this.generatePdfReport();
                }
            });
        }
    }

    // 生成PDF报告
    async generatePdfReport() {
        try {
            // 检查是否加载了必要的PDF库
            if (typeof jspdf === 'undefined' || typeof html2canvas === 'undefined') {
                alert('PDF生成库未加载，请刷新页面重试');
                return;
            }

            // 获取项目信息
            const projectId = localStorage.getItem('currentProjectId');
            const projectName = localStorage.getItem('currentProjectName') || '未知项目';

            // 从数据库查询点工单数据
            const { data: workOrders, error } = await supabase
                .from('work_records')
                .select('*')
                .eq('project_id', projectId)
                .order('record_date', { ascending: true });

            if (error) {
                console.error('查询点工单数据失败:', error);
                alert('获取数据失败，请重试');
                return;
            }

            // 计算合计金额
            const totalAmount = workOrders.reduce((sum, item) => {
                return sum + (parseFloat(item.amount) || 0);
            }, 0);

            // 计算工日合计
            const totalWorkDays = workOrders.reduce((sum, item) => {
                return sum + (parseFloat(item.work_days) || 0);
            }, 0);

            // 计算日期范围（根据最早和最晚记录的日期）
            let dateRange = '全部日期';
            if (workOrders && workOrders.length > 0) {
                // 提取所有记录的日期
                const dates = workOrders
                    .map(item => item.record_date)
                    .filter(date => date !== null && date !== undefined && date !== '');
                
                if (dates.length > 0) {
                    // 排序日期
                    dates.sort();
                    const startDate = dates[0];
                    const endDate = dates[dates.length - 1];
                    
                    if (startDate === endDate) {
                        dateRange = startDate;
                    } else {
                        dateRange = `${startDate} ~ ${endDate}`;
                    }
                }
            }

            // 创建临时HTML内容
            const tempDiv = document.createElement('div');
            tempDiv.style.fontFamily = 'Microsoft YaHei, sans-serif';
            tempDiv.style.width = '600px';
            tempDiv.style.padding = '20px 20px 20px 20px'; // 左右边距一致
            tempDiv.style.backgroundColor = '#ffffff';
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '-9999px';
            document.body.appendChild(tempDiv);

            // 构建HTML内容
            let htmlContent = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h2 style="margin: 0; color: #333; font-size: 11px;">${dateRange}</h2>
                    <h1 style="margin: 0; color: #1890ff; text-align: center; flex: 1; font-size: 14px;">${projectName}</h1>
                    <h3 style="margin: 0; color: #722ed1; background-color: #f0f5ff; padding: 6px; border-radius: 4px; font-size: 11px;">点工单明细表</h3>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin: 0 auto 15px auto; box-shadow: 0 2px 8px rgba(0,0,0,0.1); table-layout: fixed;">
                    <thead>
                        <tr style="background-color: #1890ff; color: white;">
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; white-space: nowrap; font-size: 10px; width: 30px;">序号</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; white-space: nowrap; font-size: 10px; width: 65px;">日期</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; white-space: nowrap; font-size: 10px;">班组</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; white-space: nowrap; font-size: 10px;">班组长</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; white-space: nowrap; font-size: 10px;">工日</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; white-space: nowrap; font-size: 10px; width: 40px;">类型</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; white-space: nowrap; font-size: 10px; width: 40px;">单价</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; white-space: nowrap; font-size: 10px;">金额</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: left; font-weight: bold; width: 200px; word-wrap: break-word; white-space: normal; font-size: 10px;">工作内容</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            // 添加表格数据
            workOrders.forEach((item, index) => {
                const bgColor = index % 2 === 0 ? '#ffffff' : '#e6f7ff'; // 白色和淡蓝色交替
                
                // 处理单价显示（不显示人民币符号，整数显示整数）
                const unitPrice = parseFloat(item.unit_price || 0);
                const unitPriceDisplay = unitPrice === Math.floor(unitPrice) ? unitPrice.toString() : unitPrice.toFixed(2);
                
                // 处理金额显示（整数显示整数）
                const amount = parseFloat(item.amount || 0);
                const amountDisplay = amount === Math.floor(amount) ? `¥${amount.toString()}` : `¥${amount.toFixed(2)}`;
                
                htmlContent += `
                    <tr style="background-color: ${bgColor};">
                        <td style="border: 1px solid #ddd; padding: 4px; text-align: center; white-space: nowrap; font-size: 10px;">${index + 1}</td>
                        <td style="border: 1px solid #ddd; padding: 4px; text-align: center; white-space: nowrap; font-size: 10px;">${item.record_date || '-'}</td>
                        <td style="border: 1px solid #ddd; padding: 4px; text-align: center; white-space: nowrap; font-size: 10px;">${item.team_name || '-'}</td>
                        <td style="border: 1px solid #ddd; padding: 4px; text-align: center; white-space: nowrap; font-size: 10px;">${item.team_leader || '-'}</td>
                        <td style="border: 1px solid #ddd; padding: 4px; text-align: center; white-space: nowrap; font-size: 10px;">${item.work_days || 0}个工</td>
                        <td style="border: 1px solid #ddd; padding: 4px; text-align: center; white-space: nowrap; font-size: 10px; width: 40px;">${item.worker_type || '-'}</td>
                        <td style="border: 1px solid #ddd; padding: 4px; text-align: center; white-space: nowrap; font-size: 10px; width: 40px;">${unitPriceDisplay}</td>
                        <td style="border: 1px solid #ddd; padding: 4px; text-align: center; white-space: nowrap; font-size: 10px;">${amountDisplay}</td>
                        <td style="border: 1px solid #ddd; padding: 4px; text-align: left; word-wrap: break-word; width: 200px; white-space: normal; font-size: 10px;">${item.description || '-'}</td>
                    </tr>
                `;
            });

            // 结束表格
            htmlContent += `
                    </tbody>
                </table>
                <div style="width: 100%; margin-top: 15px; text-align: right; font-size: 12px; font-weight: bold;">
                    合计：${totalWorkDays.toFixed(1)}天        ¥${totalAmount.toFixed(2)}元
                </div>
            `;

            // 设置HTML内容
            tempDiv.innerHTML = htmlContent;

            // 创建PDF文档
            const doc = new jspdf.jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            // 计算每页可容纳的行数
            const rowsPerPage = 30; // 增加每页行数，充分利用页面空间

            // 生成表头HTML（不含合计）
            const headerHtml = `
                <div style="font-family: Microsoft YaHei, sans-serif; width: 600px; padding: 20px 20px 20px 20px; background-color: #ffffff;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h2 style="margin: 0; color: #333; font-size: 11px;">${dateRange}</h2>
                        <h1 style="margin: 0; color: #1890ff; text-align: center; flex: 1; font-size: 16px; position: relative; left: -20px;">${projectName}</h1>
                        <h3 style="margin: 0; color: #722ed1; background-color: #f0f5ff; padding: 6px; border-radius: 4px; font-size: 11px;">点工单明细表</h3>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; margin: 0 auto 15px auto; box-shadow: 0 2px 8px rgba(0,0,0,0.1); table-layout: fixed;">
                        <thead>
                            <tr style="background-color: #1890ff; color: white;">
                                <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; white-space: nowrap; font-size: 10px; width: 30px;">序号</th>
                                <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; white-space: nowrap; font-size: 10px; width: 65px;">日期</th>
                                <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; white-space: nowrap; font-size: 10px;">班组</th>
                                <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; white-space: nowrap; font-size: 10px;">班组长</th>
                                <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; white-space: nowrap; font-size: 10px;">工日</th>
                                <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; white-space: nowrap; font-size: 10px; width: 40px;">类型</th>
                                <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; white-space: nowrap; font-size: 10px; width: 40px;">单价</th>
                                <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold; white-space: nowrap; font-size: 10px;">金额</th>
                                <th style="border: 1px solid #ddd; padding: 6px; text-align: left; font-weight: bold; width: 200px; word-wrap: break-word; white-space: normal; font-size: 10px;">工作内容</th>
                            </tr>
                        </thead>
            `;

            // 生成页脚HTML（不含合计）
            const pageFooterHtml = `
                    </tbody>
                </table>
            </div>
            `;

            // 生成合计HTML
            const totalFooterHtml = `
                    </tbody>
                </table>
                <div style="width: 100%; margin-top: 15px; text-align: right; font-size: 12px; font-weight: bold;">
                    合计：${totalWorkDays.toFixed(1)}天        ¥${totalAmount.toFixed(2)}元
                </div>
            </div>
            `;

            // 分批次生成PDF
            for (let i = 0; i < workOrders.length; i += rowsPerPage) {
                // 计算当前页的数据范围
                const endIndex = Math.min(i + rowsPerPage, workOrders.length);
                const pageData = workOrders.slice(i, endIndex);

                // 生成当前页的HTML
                let pageHtml = headerHtml + '<tbody>';

                // 添加数据行
                pageData.forEach((item, index) => {
                    const bgColor = (i + index) % 2 === 0 ? '#ffffff' : '#e6f7ff'; // 白色和淡蓝色交替
                    
                    // 处理单价显示（不显示人民币符号，整数显示整数）
                    const unitPrice = parseFloat(item.unit_price || 0);
                    const unitPriceDisplay = unitPrice === Math.floor(unitPrice) ? unitPrice.toString() : unitPrice.toFixed(2);
                    
                    // 处理金额显示（整数显示整数）
                    const amount = parseFloat(item.amount || 0);
                    const amountDisplay = amount === Math.floor(amount) ? `¥${amount.toString()}` : `¥${amount.toFixed(2)}`;
                    
                    pageHtml += `
                        <tr style="background-color: ${bgColor};">
                            <td style="border: 1px solid #ddd; padding: 4px; text-align: center; white-space: nowrap; font-size: 10px; width: 30px;">${i + index + 1}</td>
                            <td style="border: 1px solid #ddd; padding: 4px; text-align: center; white-space: nowrap; font-size: 10px; width: 65px;">${item.record_date || '-'}</td>
                            <td style="border: 1px solid #ddd; padding: 4px; text-align: center; white-space: nowrap; font-size: 10px;">${item.team_name || '-'}</td>
                            <td style="border: 1px solid #ddd; padding: 4px; text-align: center; white-space: nowrap; font-size: 10px;">${item.team_leader || '-'}</td>
                            <td style="border: 1px solid #ddd; padding: 4px; text-align: center; white-space: nowrap; font-size: 10px;">${item.work_days || 0}个工</td>
                            <td style="border: 1px solid #ddd; padding: 4px; text-align: center; white-space: nowrap; font-size: 10px; width: 40px;">${item.worker_type || '-'}</td>
                            <td style="border: 1px solid #ddd; padding: 4px; text-align: center; white-space: nowrap; font-size: 10px; width: 40px;">${unitPriceDisplay}</td>
                            <td style="border: 1px solid #ddd; padding: 4px; text-align: center; white-space: nowrap; font-size: 10px;">${amountDisplay}</td>
                            <td style="border: 1px solid #ddd; padding: 4px; text-align: left; word-wrap: break-word; width: 200px; white-space: normal; font-size: 10px;">${item.description || '-'}</td>
                        </tr>
                    `;
                });

                // 只在最后一页添加合计
                if (endIndex === workOrders.length) {
                    pageHtml += totalFooterHtml;
                } else {
                    pageHtml += pageFooterHtml;
                }

                // 创建临时元素
                const pageTempDiv = document.createElement('div');
                pageTempDiv.style.position = 'absolute';
                pageTempDiv.style.left = '-9999px';
                pageTempDiv.style.top = '-9999px';
                pageTempDiv.innerHTML = pageHtml;
                document.body.appendChild(pageTempDiv);

                // 使用html2canvas转换为图片
                const pageCanvas = await html2canvas(pageTempDiv, {
                    scale: 3,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#ffffff'
                });

                // 清理临时元素
                document.body.removeChild(pageTempDiv);

                // 添加到PDF
                if (i > 0) {
                    doc.addPage();
                }

                const imgData = pageCanvas.toDataURL('image/png');
                const imgWidth = 210; // A4竖向宽度
                const imgHeight = pageCanvas.height * imgWidth / pageCanvas.width;

                doc.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
            }

            // 保存PDF
            const fileName = `点工单明细表_${projectName}_${new Date().toISOString().slice(0, 10)}.pdf`;
            
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
                    const pdfData = doc.output('blob');
                    const writable = await fileHandle.createWritable();
                    await writable.write(pdfData);
                    await writable.close();
                } catch (err) {
                    // 用户取消保存或其他错误，使用默认保存方式
                    console.log('文件保存对话框错误:', err);
                    doc.save(fileName);
                }
            } else {
                // 默认保存方式
                doc.save(fileName);
            }

            // 清理临时元素
            document.body.removeChild(tempDiv);

        } catch (error) {
            console.error('生成PDF失败:', error);
            alert('生成PDF失败，请重试');
        }
    }
}

// 初始化PDF生成器
document.addEventListener('DOMContentLoaded', function() {
    new WorkOrderPDFGenerator();
});
