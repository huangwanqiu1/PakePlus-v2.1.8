// 点工单PDF生成器
class WorkOrderPDFCreator {
    constructor() {
        this.init();
    }

    init() {
        // 绑定生成点工单按钮事件
        this.bindEvents();
    }

    // 绑定事件
    bindEvents() {
        // 监听页面加载完成
        document.addEventListener('DOMContentLoaded', () => {
            // 初始化按钮事件监听
            this.initButtonEventListening();
        });
    }

    // 监听表格行选择事件
    setupTableRowListeners() {
        const detailTableBody = document.getElementById('detailTableBody');
        if (detailTableBody) {
            detailTableBody.addEventListener('click', (e) => {
                const row = e.target.closest('tr');
                if (row && row.parentElement.id === 'detailTableBody') {
                    // 延迟更新按钮事件，确保选中状态已更新
                    setTimeout(() => this.updateButtonEvent(), 100);
                }
            });
        }
    }

    // 设置标签页监听器
    setupTabListeners() {
        const workRecordTab = document.getElementById('tabWorkRecord');
        const workFlowTab = document.getElementById('tabWorkFlow');
        
        if (workRecordTab) {
            workRecordTab.addEventListener('change', () => {
                this.updateButtonEvent();
            });
        }
        
        if (workFlowTab) {
            workFlowTab.addEventListener('change', () => {
                this.updateButtonEvent();
            });
        }
    }

    // 初始化按钮事件监听
    initButtonEventListening() {
        // 使用MutationObserver监听按钮文本变化
        this.observeButtonChanges();
        
        // 直接为按钮添加点击事件监听器
        this.bindButtonClick();
        
        // 监听表格行选择事件
        this.setupTableRowListeners();
        
        // 监听标签页切换事件
        this.setupTabListeners();
    }

    // 使用MutationObserver监听按钮变化
    observeButtonChanges() {
        const generatePdfBtn = document.getElementById('generatePdfBtn');
        if (!generatePdfBtn) return;
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                    // 按钮文本或内容发生变化，重新绑定点击事件
                    this.bindButtonClick();
                }
            });
        });
        
        observer.observe(generatePdfBtn, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    // 绑定按钮点击事件
    bindButtonClick() {
        const generatePdfBtn = document.getElementById('generatePdfBtn');
        if (!generatePdfBtn) return;
        
        // 移除所有现有的点击事件监听器
        const newBtn = generatePdfBtn.cloneNode(true);
        generatePdfBtn.parentNode.replaceChild(newBtn, generatePdfBtn);
        
        // 为新按钮添加点击事件监听器
        newBtn.addEventListener('click', (e) => {
            const btnText = newBtn.textContent.trim();
            
            // 检查当前激活的标签页
            const workFlowTab = document.getElementById('tabWorkFlow');
            const isWorkFlowActive = workFlowTab && workFlowTab.checked;
            
            if (isWorkFlowActive && btnText === '生成点工单') {
                // 按钮显示为"生成点工单"，执行点工单PDF生成
                e.stopPropagation();
                e.preventDefault();
                this.generateWorkOrderPDF();
            } else {
                // 按钮显示为"生成表格"，让pdf_generator.js处理
                // 这里不需要做任何事情，因为pdf_generator.js会处理
            }
        });
    }

    // 监听表格行选择事件
    setupTableRowListeners() {
        const detailTableBody = document.getElementById('detailTableBody');
        if (detailTableBody) {
            detailTableBody.addEventListener('click', (e) => {
                const row = e.target.closest('tr');
                if (row && row.parentElement.id === 'detailTableBody') {
                    // 延迟检查，确保选中状态已更新
                    setTimeout(() => {
                        const generatePdfBtn = document.getElementById('generatePdfBtn');
                        if (generatePdfBtn && generatePdfBtn.textContent.trim() === '生成点工单') {
                            // 按钮已经变为"生成点工单"，确保事件监听正确
                            console.log('按钮已切换为生成点工单');
                        }
                    }, 100);
                }
            });
        }
    }

    // 设置标签页监听器
    setupTabListeners() {
        const workRecordTab = document.getElementById('tabWorkRecord');
        const workFlowTab = document.getElementById('tabWorkFlow');
        
        if (workRecordTab) {
            workRecordTab.addEventListener('change', () => {
                console.log('切换到记工标签页');
            });
        }
        
        if (workFlowTab) {
            workFlowTab.addEventListener('change', () => {
                console.log('切换到明细标签页');
            });
        }
    }

    // 生成点工单PDF
    async generateWorkOrderPDF() {
        try {
            // 检查是否加载了必要的PDF库
            if (typeof jspdf === 'undefined' || typeof html2canvas === 'undefined') {
                alert('PDF生成库未加载，请刷新页面重试');
                return;
            }

            // 获取选中的行数据
            const selectedData = this.getSelectedRowData();
            if (!selectedData) {
                alert('请先选择一条记录');
                return;
            }

            // 获取项目信息
            const projectName = localStorage.getItem('currentProjectName') || '未知项目';

            // 创建PDF文档
            const doc = new jspdf.jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            // 生成PDF页面（包含两份点工单）
            await this.generateWorkOrderPage(doc, selectedData, projectName);

            // 保存PDF
            const fileName = `点工单_${projectName}_${selectedData.date || new Date().toISOString().slice(0, 10)}.pdf`;
            
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

        } catch (error) {
            console.error('生成点工单PDF失败:', error);
            alert('生成点工单失败，请重试');
        }
    }

    // 获取选中的行数据
    getSelectedRowData() {
        // 检查明细表格中是否有选中的行
        const selectedRow = document.querySelector('#detailTableBody tr.selected');
        if (selectedRow) {
            return this.extractDataFromRow(selectedRow);
        }

        // 如果没有选中行，尝试从表单获取数据
        return this.extractDataFromForm();
    }

    // 从表格行提取数据
    extractDataFromRow(row) {
        const cells = row.querySelectorAll('td');
        
        return {
            date: cells[1]?.textContent.trim() || '',
            team: cells[2]?.textContent.trim() || '',
            leader: cells[3]?.textContent.trim() || '',
            workDays: cells[4]?.textContent.trim().replace('个工', '') || '0',
            workerType: cells[5]?.textContent.trim() || '',
            unitPrice: cells[6]?.textContent.trim() || '0',
            amount: cells[7]?.textContent.trim() || '0',
            description: cells[8]?.textContent.trim() || ''
        };
    }

    // 从表单提取数据
    extractDataFromForm() {
        return {
            date: document.getElementById('workDate')?.value || '',
            team: document.getElementById('teamName')?.value || '',
            leader: document.getElementById('teamLeader')?.value || '',
            workDays: document.getElementById('workDays')?.value || '0',
            workerType: document.getElementById('workerType')?.checked ? '技工' : '普工',
            unitPrice: document.getElementById('unitPrice')?.value || '0',
            amount: document.getElementById('amount')?.value || '0',
            description: document.getElementById('description')?.value || ''
        };
    }

    // 生成点工单页面
    async generateWorkOrderPage(doc, data, projectName) {
        // 创建临时HTML元素
        const tempDiv = document.createElement('div');
        tempDiv.style.cssText = `
            width: 794px; 
            min-height: 1123px;
            padding: 30px 60px 50px 60px;
            background-color: #ffffff;
            position: absolute;
            left: -9999px;
            top: -9999px;
            font-family: 'SimSun', 'Songti SC', serif;
            box-sizing: border-box;
        `;
        // A4 width in px at 96dpi is 794px. 
        // Using 794px width for better resolution.

        // 构建点工单HTML (两份)
        const singleForm = this.generateWorkOrderHTML(data, projectName);
        const htmlContent = `
            <div style="display: flex; flex-direction: column; height: 100%; justify-content: space-between;">
                ${singleForm}
                
                <!-- 裁剪线 -->
                <div style="width: 100%; height: 1px; border-top: 2px dashed #999; margin: 40px 0; position: relative; text-align: center;">
                    <span style="background: #fff; padding: 0 10px; color: #999; font-size: 12px; position: relative; top: -10px;">裁剪线</span>
                </div>
                
                ${singleForm}
            </div>
        `;
        
        tempDiv.innerHTML = htmlContent;
        document.body.appendChild(tempDiv);

        // 使用html2canvas转换为图片
        const canvas = await html2canvas(tempDiv, {
            scale: 4, // 提高清晰度 (原始为2)
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff'
        });

        // 清理临时元素
        document.body.removeChild(tempDiv);

        // 添加到PDF
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 210; // A4竖向宽度 mm
        const imgHeight = 297; // A4竖向高度 mm
        
        // 调整图片高度以适应页面
        const ratio = canvas.width / canvas.height;
        const pdfHeight = imgWidth / ratio;

        doc.addImage(imgData, 'PNG', 0, 0, imgWidth, pdfHeight);
    }

    // 生成点工单HTML
    generateWorkOrderHTML(data, projectName) {
        // 格式化日期
        const formattedDate = this.formatDate(data.date);
        
        // 计算普工和技工数量
        let generalWorker = '';
        let skilledWorker = '';
        // 选中状态的HTML：大号勾选标记 + 单价文本
        const unitPriceText = `${data.unitPrice}元/工`;
        const checkMarkHtml = `<span style="font-size: 24px; font-weight: bold; vertical-align: -3px;">√</span> <span style="font-size: 16px; margin-left: 5px;">${unitPriceText}</span>`;
        
        if (data.workerType === '普工') {
            generalWorker = checkMarkHtml;
        } else if (data.workerType === '技工') {
            skilledWorker = checkMarkHtml;
        }

        // 基础单元格样式：字体加大到 18px，加粗以加深颜色
        const tdStyle = "border: 1px solid #000; padding: 5px; text-align: center; font-size: 18px; color: #000; font-family: 'SimSun', serif; font-weight: bold;";
        // 标签样式保持不变
        const labelStyle = "border: 1px solid #000; padding: 5px; text-align: center; font-weight: bold; font-size: 16px; font-family: 'SimHei', sans-serif; color: #000;";
        
        return `
            <div style="width: 100%; padding: 10px 20px; position: relative;">
                <!-- 项目名称 - 绝对定位到表格左上角 -->
                <div style="position: absolute; left: 20px; top: 40px; font-size: 16px; font-weight: bold; font-family: 'SimHei', sans-serif;">
                    ${projectName}
                </div>
                
                <!-- 标题 -->
                <h1 style="text-align: center; margin: 0 0 20px 0; color: #000; font-size: 32px; font-weight: bold; font-family: 'SimHei', sans-serif; letter-spacing: 15px;">
                    点 工 单
                </h1>
                
                <!-- 表格 -->
                <table style="width: 100%; border-collapse: collapse; border: 2px solid #000;">
                    <colgroup>
                        <col style="width: 12%">
                        <col style="width: 21%">
                        <col style="width: 12%">
                        <col style="width: 21%">
                        <col style="width: 12%">
                        <col style="width: 22%">
                    </colgroup>
                    <!-- 第一行：日期、班组、班组长 -->
                    <tr style="height: 40px;">
                        <td style="${labelStyle}">日&nbsp;&nbsp;期</td>
                        <td style="${tdStyle} font-size: 16px;">${formattedDate}</td>
                        <td style="${labelStyle}">班&nbsp;&nbsp;组</td>
                        <td style="${tdStyle}">${data.team}</td>
                        <td style="${labelStyle}">班组长</td>
                        <td style="${tdStyle}">${data.leader}</td>
                    </tr>
                    
                    <!-- 第二行：工作时间 -->
                    <tr style="height: 40px;">
                        <td style="${labelStyle}">工作时间</td>
                        <td style="${tdStyle}" colspan="5"></td>
                    </tr>
                    
                    <!-- 第三行：工作内容 -->
                    <tr style="height: 110px;">
                        <td style="${labelStyle} vertical-align: middle;">工&nbsp;&nbsp;作<br><br>内&nbsp;&nbsp;容</td>
                        <td style="${tdStyle} text-align: left; vertical-align: top; padding: 10px;" colspan="5">
                            <div style="min-height: 100%; display: flex; flex-direction: column; justify-content: space-between;">
                                <div style="word-wrap: break-word; word-break: break-all; white-space: pre-wrap;">${data.description || ''}</div>
                                <div style="text-align: left; font-weight: bold; margin-top: 10px;">金额：${data.amount}元</div>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- 第四行：工日数 -->
                    <tr style="height: 40px;">
                        <td style="${labelStyle}">工日数</td>
                        <td style="${tdStyle}">${data.workDays}个工</td>
                        <td style="${labelStyle}">普&nbsp;&nbsp;工</td>
                        <td style="${tdStyle}">${generalWorker}</td>
                        <td style="${labelStyle}">技&nbsp;&nbsp;工</td>
                        <td style="${tdStyle}">${skilledWorker}</td>
                    </tr>
                    
                    <!-- 第五行：工长签字、生产经理签字 -->
                    <tr style="height: 70px;">
                        <td style="${labelStyle}">工&nbsp;&nbsp;长<br><br>签&nbsp;&nbsp;字</td>
                        <td style="${tdStyle}" colspan="2"></td>
                        <td style="${labelStyle}">生产经理<br><br>签&nbsp;&nbsp;&nbsp;&nbsp;字</td>
                        <td style="${tdStyle}" colspan="2"></td>
                    </tr>
                    
                    <!-- 第六行：项目经理签字 -->
                    <tr style="height: 70px;">
                        <td style="${labelStyle}">项目经理<br><br>签&nbsp;&nbsp;&nbsp;&nbsp;字</td>
                        <td style="${tdStyle}" colspan="5"></td>
                    </tr>
                </table>
                
                <!-- 备注 -->
                <div style="width: 100%; text-align: left; font-size: 16px; color: #000; margin-top: 10px; font-weight: bold;">
                    注：本单一式两份，班组长与项目部各执一份
                </div>
            </div>
        `;
    }

    // 格式化日期
    formatDate(dateStr) {
        if (!dateStr) return '';
        
        // 处理不同格式的日期
        if (dateStr.includes('-')) {
            const [year, month, day] = dateStr.split('-');
            return `${year}年${parseInt(month)}月${parseInt(day)}日`;
        }
        
        return dateStr;
    }
}

// 初始化点工单PDF生成器
document.addEventListener('DOMContentLoaded', function() {
    window.workOrderPDFCreator = new WorkOrderPDFCreator();
});