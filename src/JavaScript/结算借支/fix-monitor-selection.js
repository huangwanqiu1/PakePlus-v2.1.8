// 修复monitorSelectionState未定义的问题
// 这个全局函数将确保在bindEvents函数执行前也能正常工作
function monitorSelectionState() {
    try {
        const selectAllBtn = document.getElementById('selectAllBtn');
        const checkboxes = document.querySelectorAll('.employee-item input[type="checkbox"]');
        const checkedBoxes = document.querySelectorAll('.employee-item input[type="checkbox"]:checked');
        
        // 检查选择状态
        const allSelected = checkboxes.length > 0 && checkedBoxes.length === checkboxes.length;
        const noneSelected = checkedBoxes.length === 0;
        const partialSelected = checkedBoxes.length > 0 && checkedBoxes.length < checkboxes.length;
        
        // 根据选择状态更新全选按钮文本
        if (selectAllBtn && window.isAllSelected !== undefined) {
            if (allSelected) {
                isAllSelected = true;
                selectAllBtn.textContent = '取消全选';
            } else {
                isAllSelected = false;
                selectAllBtn.textContent = '全选';
            }
            
            // 输出详细的状态监测信息
            // 全局状态监测: {
            //     total: checkboxes.length,
            //     selected: checkedBoxes.length,
            //     allSelected: allSelected,
            //     noneSelected: noneSelected,
            //     partialSelected: partialSelected,
            //     buttonText: selectAllBtn.textContent,
            //     isAllSelected: isAllSelected
            // }
        } else {
            // 按钮或全局变量不存在时的安全处理
            // 安全模式状态监测: {
            //     total: checkboxes.length,
            //     selected: checkedBoxes.length
            // }
        }
    } catch (error) {
        console.log('状态监测函数执行失败，忽略错误:', error.message);
    }
}