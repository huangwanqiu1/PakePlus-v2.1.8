// 记工表PDF生成器模块
class PDFGenerator {
    /**
     * 生成记工表PDF
     * @param {Array} employees - 员工数据数组
     * @param {string} projectName - 项目名称
     */
    static async generateAttendancePDF(employees, projectName) {
        try {
            // 确保所有依赖库都已加载
            let jsPDF = window.jsPDF;
            // 检查jsPDF是否以不同方式导出
            if (!jsPDF && window.jspdf) {
                jsPDF = window.jspdf.jsPDF;
            }
            if (!jsPDF) {
                throw new Error('jsPDF库未加载');
            }
            
            if (!window.html2canvas) {
                throw new Error('html2canvas库未加载');
            }
            
            // 创建临时HTML元素来渲染记工表
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '-9999px';
            tempDiv.style.padding = '0';
            tempDiv.style.fontFamily = 'Microsoft YaHei, sans-serif';
            tempDiv.style.fontSize = '12px';
            tempDiv.style.backgroundColor = 'white';
            tempDiv.style.width = '210mm'; // A4宽度
            tempDiv.style.boxSizing = 'border-box';
            tempDiv.style.lineHeight = '1';
            tempDiv.style.margin = '0';
            
            // 获取当前日期
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            
            // 计算块大小
            const blockSize = 33;
            const totalEmployees = employees.length;
            const totalBlocks = Math.ceil(totalEmployees / blockSize);
            
            // 创建PDF文档
            const pdf = new jsPDF('p', 'mm', 'a4');
            
            // 计算需要的总页数
            const totalPDFPages = Math.ceil(totalBlocks / 2);
            
            // 循环为每一页生成内容
            for (let pageIndex = 0; pageIndex < totalPDFPages; pageIndex++) {
                // 计算当前页的起始块索引
                const startBlockIndex = pageIndex * 2;
                const endBlockIndex = Math.min(startBlockIndex + 2, totalBlocks);
                
                // 创建临时HTML元素来渲染当前页面
                const pageDiv = document.createElement('div');
                pageDiv.style.position = 'absolute';
                pageDiv.style.left = '-9999px';
                pageDiv.style.top = '-9999px';
                pageDiv.style.padding = '0';
                pageDiv.style.fontFamily = 'Microsoft YaHei, sans-serif';
                pageDiv.style.fontSize = '12px';
                pageDiv.style.backgroundColor = 'white';
                pageDiv.style.width = '210mm'; // A4宽度
                pageDiv.style.height = '297mm'; // A4高度
                pageDiv.style.boxSizing = 'border-box';
                pageDiv.style.lineHeight = '1';
                pageDiv.style.margin = '0';
                
                // 构建当前页面的HTML内容
                let pageContent = `
                    <div style="width: 100%; height: 100%;">
                        <!-- 表头行 -->
                        <div style="margin-bottom: 8px;">
                            <!-- 第一行：项目名称 -->
                            <div style="width: 100%; font-size: 24px; font-weight: bold; text-align: center; margin-bottom: 5px; line-height: 1.2;">${projectName}</div>
                            <!-- 第二行：日期和说明 -->
                            <div style="display: flex; align-items: center; height: 22px;">
                                <div style="width: 30%; font-size: 16px; white-space: nowrap;">${year}年${month}月_____日</div>
                                <div style="width: 70%; font-size: 16px; text-align: right;">√ 代表半天</div>
                            </div>
                        </div>
                        
                        <!-- 列标题行 -->
                        <div style="display: flex; margin-bottom: 0; height: 35px;">
                            <!-- 左表格标题 -->
                            <div style="display: flex; width: 48%; border: 0.5px solid #666;">
                                <div style="width: 11%; text-align: center; font-weight: bold; color: red; font-family: 楷体; border-right: 0.5px solid #666; padding: 8px 5px; display: flex; align-items: center; justify-content: center; font-size: 14px;">工号</div>
                                <div style="width: 17%; text-align: center; font-weight: bold; color: red; font-family: 楷体; border-right: 0.5px solid #666; padding: 8px 5px; display: flex; align-items: center; justify-content: center; font-size: 14px;">姓名</div>
                                <div style="width: 23.5%; text-align: center; font-weight: bold; color: red; font-family: 楷体; border-right: 0.5px solid #666; padding: 8px 5px; display: flex; align-items: center; justify-content: center; font-size: 14px;">电话</div>
                                <div style="width: 12%; text-align: center; font-weight: bold; color: red; font-family: 楷体; border-right: 0.5px solid #666; padding: 8px 5px; display: flex; align-items: center; justify-content: center; font-size: 14px;">上午</div>
                                <div style="width: 12%; text-align: center; font-weight: bold; color: red; font-family: 楷体; border-right: 0.5px solid #666; padding: 8px 5px; display: flex; align-items: center; justify-content: center; font-size: 14px;">下午</div>
                                <div style="width: 12%; text-align: center; font-weight: bold; color: red; font-family: 楷体; border-right: 0.5px solid #666; padding: 8px 5px; display: flex; align-items: center; justify-content: center; font-size: 14px;">加班</div>
                                <div style="width: 12%; text-align: center; font-weight: bold; color: red; font-family: 楷体; padding: 8px 5px; display: flex; align-items: center; justify-content: center; font-size: 14px;">包工</div>
                            </div>
                            
                            <!-- 中间间隔 -->
                            <div style="width: 4%;"></div>
                            
                            <!-- 右表格标题 -->
                            <div style="display: flex; width: 48%; border: 0.5px solid #666;">
                                <div style="width: 11%; text-align: center; font-weight: bold; color: red; font-family: 楷体; border-right: 0.5px solid #666; padding: 8px 5px; display: flex; align-items: center; justify-content: center; font-size: 14px;">工号</div>
                                <div style="width: 17%; text-align: center; font-weight: bold; color: red; font-family: 楷体; border-right: 0.5px solid #666; padding: 8px 5px; display: flex; align-items: center; justify-content: center; font-size: 14px;">姓名</div>
                                <div style="width: 23.5%; text-align: center; font-weight: bold; color: red; font-family: 楷体; border-right: 0.5px solid #666; padding: 8px 5px; display: flex; align-items: center; justify-content: center; font-size: 14px;">电话</div>
                                <div style="width: 12%; text-align: center; font-weight: bold; color: red; font-family: 楷体; border-right: 0.5px solid #666; padding: 8px 5px; display: flex; align-items: center; justify-content: center; font-size: 14px;">上午</div>
                                <div style="width: 12%; text-align: center; font-weight: bold; color: red; font-family: 楷体; border-right: 0.5px solid #666; padding: 8px 5px; display: flex; align-items: center; justify-content: center; font-size: 14px;">下午</div>
                                <div style="width: 12%; text-align: center; font-weight: bold; color: red; font-family: 楷体; border-right: 0.5px solid #666; padding: 8px 5px; display: flex; align-items: center; justify-content: center; font-size: 14px;">加班</div>
                                <div style="width: 12%; text-align: center; font-weight: bold; color: red; font-family: 楷体; padding: 8px 5px; display: flex; align-items: center; justify-content: center; font-size: 14px;">包工</div>
                            </div>
                        </div>
                        
                        <!-- 数据行 -->
                `;
                
                // 生成33行数据
                for (let rowIndex = 0; rowIndex < blockSize; rowIndex++) {
                    pageContent += `
                        <div style="display: flex; min-height: 30px;">
                            <!-- 左表格数据 -->
                            <div style="display: flex; width: 48%; border-left: 0.5px solid #666; border-right: 0.5px solid #666; border-bottom: 0.5px solid #666;">
                    `;
                    
                    // 左表格数据
                    const leftBlockIndex = startBlockIndex;
                    const leftEmployeeIndex = leftBlockIndex * blockSize + rowIndex;
                    const leftEmployee = leftEmployeeIndex < totalEmployees ? employees[leftEmployeeIndex] : null;
                    
                    // 计算工号和姓名的字体大小
                    const leftCodeFontSize = leftEmployee && leftEmployee.emp_code ? (leftEmployee.emp_code.length <= 2 ? '14px' : '13px') : '13px';
                    const leftNameFontSize = leftEmployee && leftEmployee.emp_name ? (leftEmployee.emp_name.length <= 3 ? '14px' : '13px') : '13px';
                    
                    pageContent += `
                        <div style="width: 11%; text-align: left; vertical-align: middle; padding: 5px; font-weight: bold; font-size: ${leftCodeFontSize}; border-right: 0.5px solid #666;">${leftEmployee ? (leftEmployee.emp_code || '') : ''}</div>
                        <div style="width: 17%; text-align: left; vertical-align: middle; padding: 5px; font-weight: bold; font-size: ${leftNameFontSize}; border-right: 0.5px solid #666;">${leftEmployee ? (leftEmployee.emp_name || '') : ''}</div>
                        <div style="width: 23.5%; text-align: left; vertical-align: middle; padding: 5px; font-size: 13px; border-right: 0.5px solid #666;">${leftEmployee ? (leftEmployee.phone || '') : ''}</div>
                        <div style="width: 12%; text-align: left; vertical-align: middle; padding: 5px; border-right: 0.5px solid #666;"></div>
                        <div style="width: 12%; text-align: left; vertical-align: middle; padding: 5px; border-right: 0.5px solid #666;"></div>
                        <div style="width: 12%; text-align: left; vertical-align: middle; padding: 5px; border-right: 0.5px solid #666;"></div>
                        <div style="width: 12%; text-align: left; vertical-align: middle; padding: 5px;"></div>
                    `;
                    
                    pageContent += `
                            </div>
                            
                            <!-- 中间间隔 -->
                            <div style="width: 4%;"></div>
                            
                            <!-- 右表格数据 -->
                            <div style="display: flex; width: 48%; border-left: 0.5px solid #666; border-right: 0.5px solid #666; border-bottom: 0.5px solid #666;">
                    `;
                    
                    // 右表格数据
                    const rightBlockIndex = startBlockIndex + 1;
                    const rightEmployeeIndex = rightBlockIndex * blockSize + rowIndex;
                    const rightEmployee = rightBlockIndex < totalBlocks && rightEmployeeIndex < totalEmployees ? employees[rightEmployeeIndex] : null;
                    
                    // 计算工号和姓名的字体大小
                    const rightCodeFontSize = rightEmployee && rightEmployee.emp_code ? (rightEmployee.emp_code.length <= 2 ? '14px' : '13px') : '13px';
                    const rightNameFontSize = rightEmployee && rightEmployee.emp_name ? (rightEmployee.emp_name.length <= 3 ? '14px' : '13px') : '13px';
                    
                    pageContent += `
                        <div style="width: 11%; text-align: left; vertical-align: middle; padding: 5px; font-weight: bold; font-size: ${rightCodeFontSize}; border-right: 0.5px solid #666;">${rightEmployee ? (rightEmployee.emp_code || '') : ''}</div>
                        <div style="width: 17%; text-align: left; vertical-align: middle; padding: 5px; font-weight: bold; font-size: ${rightNameFontSize}; border-right: 0.5px solid #666;">${rightEmployee ? (rightEmployee.emp_name || '') : ''}</div>
                        <div style="width: 23.5%; text-align: left; vertical-align: middle; padding: 5px; font-size: 13px; border-right: 0.5px solid #666;">${rightEmployee ? (rightEmployee.phone || '') : ''}</div>
                        <div style="width: 12%; text-align: left; vertical-align: middle; padding: 5px; border-right: 0.5px solid #666;"></div>
                        <div style="width: 12%; text-align: left; vertical-align: middle; padding: 5px; border-right: 0.5px solid #666;"></div>
                        <div style="width: 12%; text-align: left; vertical-align: middle; padding: 5px; border-right: 0.5px solid #666;"></div>
                        <div style="width: 12%; text-align: left; vertical-align: middle; padding: 5px;"></div>
                    `;
                    
                    pageContent += `
                            </div>
                        </div>
                    `;
                }
                
                // 关闭页面容器
                pageContent += `
                    </div>
                `;
                
                pageDiv.innerHTML = pageContent;
                document.body.appendChild(pageDiv);
                
                // 使用html2canvas将当前页面转换为图像
                const canvas = await window.html2canvas(pageDiv, {
                    scale: 2,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: '#ffffff'
                });
                
                // 将图像添加到PDF
                if (pageIndex > 0) {
                    pdf.addPage();
                }
                const imgData = canvas.toDataURL('image/png');
                // 设置边距
                const leftMargin = 8; // 左右边距8mm
                const topMargin = 15; // 上边距15mm
                const imgWidth = 194; // 210mm - 2*8mm边距
                const imgHeight = 277; // 297mm - 15mm上边距 - 5mm下边距
                pdf.addImage(imgData, 'PNG', leftMargin, topMargin, imgWidth, imgHeight); // 添加边距
                
                // 移除临时元素
                document.body.removeChild(pageDiv);
            }
            
            // 清理工作已完成，所有临时元素都已在循环中移除
            
            // 生成文件名
            const day = String(now.getDate()).padStart(2, '0');
            const formattedDate = year + month + day;
            const filename = `记工表_${formattedDate}.pdf`;
            
            // 尝试使用文件保存对话框
            if (window.showSaveFilePicker) {
                try {
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: filename,
                        types: [
                            { accept: { 'application/pdf': ['.pdf'] } }
                        ]
                    });
                    
                    // 获取PDF数据
                    const pdfData = pdf.output('blob');
                    const writable = await fileHandle.createWritable();
                    await writable.write(pdfData);
                    await writable.close();
                    return true;
                } catch (err) {
                    // 用户取消保存或其他错误，使用默认保存方式
                    console.log('文件保存对话框错误:', err);
                }
            }
            
            // 默认保存方式
            pdf.save(filename);
            
            return true;
        } catch (error) {
            console.error('生成PDF失败:', error);
            throw error;
        }
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFGenerator;
} else if (typeof window !== 'undefined') {
    window.PDFGenerator = PDFGenerator;
}
