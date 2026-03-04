
// 统计PDF导出功能封装
document.addEventListener('DOMContentLoaded', function() {
    const downloadBtn = document.getElementById('downloadPdfBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', generatePDF);
    }
});

/**
 * 生成统计PDF文件
 */
async function generatePDF() {
    // 检查依赖库是否加载
    if (typeof window.html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
        console.error('PDF libraries not loaded');
        alert('PDF组件加载失败，请刷新页面重试');
        return;
    }

    const element = document.getElementById('statisticResults');
    if (!element) {
        alert('未找到需要导出的内容');
        return;
    }

    // 检查是否有内容
    if (element.children.length === 0 || element.innerText.trim() === '') {
        alert('当前没有可导出的数据');
        return;
    }

    const downloadBtn = document.getElementById('downloadPdfBtn');
    const originalText = downloadBtn.innerHTML;
    const originalPointerEvents = downloadBtn.style.pointerEvents;
    
    // 显示加载状态
    downloadBtn.innerHTML = '⏳';
    downloadBtn.style.pointerEvents = 'none'; // 禁用点击

    try {
        // 1. 生成头部信息（项目名称和日期）
        const projectName = document.getElementById('projectName') ? 
                           (document.getElementById('projectName').options[document.getElementById('projectName').selectedIndex]?.text || '项目') : 
                           '项目';
        
        // 获取日期显示
        const workDateInput = document.getElementById('workDate');
        let dateDisplay = '';
        if (workDateInput) {
            if (workDateInput.dataset.displayValue) {
                dateDisplay = workDateInput.dataset.displayValue;
            } else if (workDateInput.value) {
                dateDisplay = workDateInput.value;
            } else if (workDateInput.dataset.selectAll === 'true') {
                dateDisplay = '全部日期';
            } else {
                // 如果没有选择日期，默认为当前年月
                const now = new Date();
                dateDisplay = `${now.getFullYear()}年${now.getMonth() + 1}月`;
            }
        }

        // 创建头部容器
        const headerContainer = document.createElement('div');
        headerContainer.style.position = 'absolute';
        headerContainer.style.top = '-10000px';
        headerContainer.style.left = '0';
        headerContainer.style.width = element.offsetWidth + 'px';
        headerContainer.style.zIndex = '-1000';
        headerContainer.style.background = '#fff';
        // 减少头部内边距，使其更紧凑，靠近顶部
        headerContainer.style.padding = '10px 0 5px 0'; 
        headerContainer.style.textAlign = 'center';
        
        headerContainer.innerHTML = `
            <h2 style="margin: 0 0 5px 0; color: #333; font-size: 24px;">${projectName}</h2>
            <div style="color: #666; font-size: 16px;">统计日期：${dateDisplay}</div>
        `;
        
        document.body.appendChild(headerContainer);
        
        // 截图头部
        let headerCanvas = await html2canvas(headerContainer, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });
        
        document.body.removeChild(headerContainer);

        // 2. 准备主列表
        // 创建一个克隆节点用于计算位置，以处理滚动区域问题
        const clone = element.cloneNode(true);
        
        // 设置克隆节点样式
        clone.style.maxHeight = 'none';
        clone.style.overflow = 'visible';
        clone.style.height = 'auto';
        clone.style.width = element.offsetWidth + 'px';
        
        // 创建临时容器
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.top = '-10000px';
        container.style.left = '0';
        container.style.width = element.offsetWidth + 'px';
        container.style.zIndex = '-1000';
        container.style.background = '#fff';
        
        container.appendChild(clone);
        document.body.appendChild(container);

        // 获取所有员工卡片的位置信息
        // 注意：这里我们通过克隆节点获取所有卡片的offset信息
        // 假设卡片有特定的class，如果没有，我们遍历一级子元素
        let cardElements = Array.from(clone.querySelectorAll('.worker-card'));
        if (cardElements.length === 0) {
            // 如果没有找到worker-card类，尝试直接使用子元素
            cardElements = Array.from(clone.children).filter(child => child.tagName === 'DIV');
        }

        // 记录每个卡片的相对位置和高度
        const cardPositions = cardElements.map(card => {
            return {
                top: card.offsetTop,
                height: card.offsetHeight,
                bottom: card.offsetTop + card.offsetHeight
            };
        });

        // 截图整个列表
        let mainCanvas = await html2canvas(clone, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: container.scrollWidth,
            windowHeight: container.scrollHeight
        });

        // 清理临时DOM
        document.body.removeChild(container);

        // 3. 准备合计卡片
        let totalCanvas = null;
        if (window.workerStatistic && 
            window.workerStatistic.currentViewType !== 'total' && 
            window.workerStatistic.cachedData) {
            
            try {
                const totalContainer = document.createElement('div');
                totalContainer.style.position = 'absolute';
                totalContainer.style.top = '-10000px';
                totalContainer.style.left = '0';
                totalContainer.style.width = element.offsetWidth + 'px';
                totalContainer.style.zIndex = '-1000';
                totalContainer.style.background = '#fff';
                totalContainer.style.padding = '20px';
                
                document.body.appendChild(totalContainer);
                
                const originalStatContainer = window.workerStatistic.statContainer;
                window.workerStatistic.statContainer = totalContainer;
                window.workerStatistic.renderTotalView(window.workerStatistic.cachedData);
                
                totalCanvas = await html2canvas(totalContainer, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff',
                    windowWidth: totalContainer.scrollWidth,
                    windowHeight: totalContainer.scrollHeight
                });
                
                window.workerStatistic.statContainer = originalStatContainer;
                document.body.removeChild(totalContainer);
                
            } catch (e) {
                console.error('生成合计卡片失败:', e);
            }
        }

        // 4. 初始化PDF
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 10;
        const contentWidth = pageWidth - (margin * 2);
        const contentHeight = pageHeight - (margin * 2); // 每页可用高度

        // 计算缩放比例 (PDF宽度 / Canvas宽度)
        // 我们统一使用 mainCanvas 的宽度作为基准，假设所有 Canvas 宽度一致（或者 close enough）
        const scaleFactor = contentWidth / mainCanvas.width;

        // 计算头部在 PDF 中的高度
        const headerPdfHeight = headerCanvas.height * scaleFactor;

        // 当前页面的 Y 坐标 (PDF单位)
        // 从 margin 开始
        let currentY = margin;

        // 辅助函数：添加图片到PDF
        const addImageToPdf = (canvas, sx, sy, sw, sh) => {
            // 创建临时 Canvas 截取部分内容
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = sw;
            tempCanvas.height = sh;
            const ctx = tempCanvas.getContext('2d');
            
            // 从源 Canvas 截取
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, sw, sh);
            ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
            
            // 计算在 PDF 中的高度
            const pdfH = sh * scaleFactor;
            
            // 添加到 PDF
            pdf.addImage(tempCanvas.toDataURL('image/png'), 'PNG', margin, currentY, contentWidth, pdfH);
            
            // 更新当前 Y
            currentY += pdfH;
            
            return pdfH;
        };

        // 辅助函数：添加页眉
        const addHeader = () => {
            // 添加头部
            // 为了让头部更靠上，我们可以稍微减少一点 Y 坐标，比如 margin - 2
            // 但如果 margin 已经是边界了，可能无法更靠上。
            // 这里的 margin 是 10mm。
            // 我们可以让 header 从 margin 开始绘制。
            
            // 使用辅助函数绘制头部，不需要截取，直接绘制整个 headerCanvas
            pdf.addImage(headerCanvas.toDataURL('image/png'), 'PNG', margin, margin, contentWidth, headerPdfHeight);
            
            // 更新 currentY，加上头部高度和一点间距
            currentY = margin + headerPdfHeight + 5;
        };

        // 4.1 添加第一页的头部
        addHeader();

        // 4.2 添加主列表（智能分页）
        const domToCanvasRatio = mainCanvas.width / element.offsetWidth; // 通常是 2

        // 记录上一张卡片的结束位置 (DOM单位)
        let lastCardBottomDom = 0;
        
        for (let i = 0; i < cardPositions.length; i++) {
            const card = cardPositions[i];
            
            // 当前卡片的高度 (PDF单位)
            const cardCanvasHeight = card.height * domToCanvasRatio;
            const cardPdfHeight = cardCanvasHeight * scaleFactor;

            // 检查当前页面剩余空间是否足够
            const remainingSpace = (pageHeight - margin) - currentY;
            
            if (cardPdfHeight > remainingSpace) {
                // 空间不足，新起一页
                pdf.addPage();
                // 新页也添加头部
                addHeader();
            }
            
            const sy = card.top * domToCanvasRatio;
            const sh = card.height * domToCanvasRatio;
            
            // 截取并绘制
            addImageToPdf(mainCanvas, 0, sy, mainCanvas.width, sh);
            
            // 手动添加间距
            const spacingDom = 30; 
            const spacingPdf = spacingDom * (contentWidth / element.offsetWidth);
            currentY += spacingPdf;
            
            lastCardBottomDom = card.bottom;
        }

        // 4.3 添加合计卡片
        if (totalCanvas) {
            const totalPdfHeight = totalCanvas.height * scaleFactor;
            
            // 检查剩余空间
            const remainingSpace = (pageHeight - margin) - currentY;
            
            if (totalPdfHeight > remainingSpace) {
                pdf.addPage();
                // 新页也添加头部
                addHeader();
            }
            
            // 绘制合计卡片
            addImageToPdf(totalCanvas, 0, 0, totalCanvas.width, totalCanvas.height);
        }

        // 获取当前日期作为文件名的一部分
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `${projectName}_员工统计_${dateStr}.pdf`;
        
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

    } catch (error) {
        console.error('PDF generation failed:', error);
        alert('生成PDF失败: ' + error.message);
    } finally {
        // 恢复按钮状态
        downloadBtn.innerHTML = originalText;
        downloadBtn.style.pointerEvents = originalPointerEvents;
    }
}
