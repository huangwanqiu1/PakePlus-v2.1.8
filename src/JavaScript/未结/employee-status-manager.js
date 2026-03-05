/**
 * 员工状态管理模块
 * 功能：
 * 1. 设为已结清：检查未结金额，更新本地和Supabase员工状态为"结清"
 * 2. 设为未结：更新本地和Supabase员工状态为"离职"
 */

(function() {
    'use strict';

    /**
     * 员工状态管理器类
     */
    class EmployeeStatusManager {
        constructor() {
            this.supabase = null;
            this.isSupabaseReady = false;
            this.initSupabase();
        }

        /**
         * 初始化Supabase客户端
         */
        async initSupabase() {
            try {
                // 等待Supabase客户端初始化
                if (typeof window.waitForSupabase === 'function') {
                    this.supabase = await window.waitForSupabase();
                    this.isSupabaseReady = true;
                } else if (typeof window.supabase !== 'undefined') {
                    this.supabase = window.supabase;
                    this.isSupabaseReady = true;
                }
            } catch (error) {
                console.error('❌ 员工状态管理器：Supabase初始化失败', error);
            }
        }

        /**
         * 在本地存储中查找员工数据
         * @param {string} projectId - 项目ID
         * @param {string} empCode - 员工工号
         * @param {string} empName - 员工姓名
         * @returns {Object|null} 员工数据对象，如果未找到则返回null
         */
        findEmployeeInLocal(projectId, empCode, empName) {
            try {
                // 从localStorage获取员工索引
                const indexKey = 'employeesIndex';
                const indexData = localStorage.getItem(indexKey);
                
                if (!indexData) {
                    console.error('未找到员工索引数据');
                    return null;
                }

                const employeeIndex = JSON.parse(indexData);
                
                // 查找匹配的员工
                for (const employeeId in employeeIndex) {
                    const employee = employeeIndex[employeeId];

                    // 使用project_id, emp_code, emp_name三个字段匹配
                    if (employee.project_id === projectId &&
                        employee.emp_code === empCode &&
                        employee.emp_name === empName) {
                        return {
                            employeeId: employeeId,
                            data: employee
                        };
                    }
                }

                return null;
            } catch (error) {
                console.error('❌ 查找员工数据失败:', error);
                return null;
            }
        }

        /**
         * 更新本地存储中的员工状态
         * @param {string} employeeId - 员工ID
         * @param {string} newStatus - 新的状态（"结清"或"离职"）
         * @returns {boolean} 是否更新成功
         */
        updateEmployeeStatusInLocal(employeeId, newStatus) {
            try {
                const indexKey = 'employeesIndex';
                const indexData = localStorage.getItem(indexKey);
                
                if (!indexData) {
                    console.error('未找到员工索引数据');
                    return false;
                }

                const employeeIndex = JSON.parse(indexData);

                if (!employeeIndex[employeeId]) {
                    return false;
                }

                // 更新状态
                employeeIndex[employeeId].status = newStatus;

                // 保存回localStorage
                localStorage.setItem(indexKey, JSON.stringify(employeeIndex));

                return true;
            } catch (error) {
                console.error('❌ 更新本地员工状态失败:', error);
                return false;
            }
        }

        /**
         * 更新Supabase中的员工状态
         * @param {string} employeeId - 员工ID
         * @param {string} newStatus - 新的状态（"结清"或"离职"）
         * @returns {Promise<boolean>} 是否更新成功
         */
        async updateEmployeeStatusInSupabase(employeeId, newStatus) {
            if (!this.isSupabaseReady || !this.supabase) {
                return false;
            }

            try {
                const { data, error } = await this.supabase
                    .from('employees')
                    .update({
                        status: newStatus,
                        updated_at: new Date().toISOString()
                    })
                    .eq('employee_id', employeeId)
                    .select();

                if (error) {
                    return false;
                }

                return true;
            } catch (error) {
                return false;
            }
        }

        /**
         * 设为已结清
         * @param {Object} employee - 员工对象，包含project_id, emp_code, emp_name, unsettled等字段
         * @returns {Promise<Object>} 返回操作结果 {success: boolean, message: string}
         */
        async setAsSettled(employee) {
            try {
                // 1. 检查未结金额是否为0或负数（第一步，必须在任何修改之前）
                const unsettledAmount = parseFloat(employee.unsettled) || 0;

                if (unsettledAmount > 0) {
                    return {
                        success: false,
                        message: '当前员工工资未结清，不能设为已结清'
                    };
                }

                // 2. 在本地查找员工数据
                const found = this.findEmployeeInLocal(
                    employee.project_id,
                    employee.emp_code,
                    employee.emp_name
                );

                if (!found) {
                    return {
                        success: false,
                        message: '未找到员工数据'
                    };
                }

                // 3. 更新本地员工状态为"结清"
                const localUpdated = this.updateEmployeeStatusInLocal(found.employeeId, '结清');

                if (!localUpdated) {
                    return {
                        success: false,
                        message: '更新本地员工状态失败'
                    };
                }

                // 4. 更新Supabase员工状态为"结清"
                const supabaseUpdated = await this.updateEmployeeStatusInSupabase(found.employeeId, '结清');

                return {
                    success: true,
                    message: '设为已结清成功'
                };
            } catch (error) {
                console.error('❌ 设为已结清失败:', error);
                return {
                    success: false,
                    message: '操作失败，请重试'
                };
            }
        }

        /**
         * 设为未结（离职）
         * @param {Object} employee - 员工对象，包含project_id, emp_code, emp_name等字段
         * @returns {Promise<Object>} 返回操作结果 {success: boolean, message: string}
         */
        async setAsUnsettled(employee) {
            try {
                // 1. 在本地查找员工数据
                const found = this.findEmployeeInLocal(
                    employee.project_id,
                    employee.emp_code,
                    employee.emp_name
                );

                if (!found) {
                    return {
                        success: false,
                        message: '未找到员工数据'
                    };
                }

                // 2. 更新本地员工状态为"离职"
                const localUpdated = this.updateEmployeeStatusInLocal(found.employeeId, '离职');

                if (!localUpdated) {
                    return {
                        success: false,
                        message: '更新本地员工状态失败'
                    };
                }

                // 3. 更新Supabase员工状态为"离职"
                const supabaseUpdated = await this.updateEmployeeStatusInSupabase(found.employeeId, '离职');

                return {
                    success: true,
                    message: '设为未结成功'
                };
            } catch (error) {
                console.error('❌ 设为未结失败:', error);
                return {
                    success: false,
                    message: '操作失败，请重试'
                };
            }
        }
    }

    // 创建全局单例实例
    const manager = new EmployeeStatusManager();

    // 导出为全局对象
    window.EmployeeStatusManager = {
        /**
         * 设为已结清
         * @param {Object} employee - 员工对象
         * @returns {Promise<Object>} 返回操作结果
         */
        setAsSettled: (employee) => manager.setAsSettled(employee),

        /**
         * 设为未结（离职）
         * @param {Object} employee - 员工对象
         * @returns {Promise<Object>} 返回操作结果
         */
        setAsUnsettled: (employee) => manager.setAsUnsettled(employee),

        /**
         * 获取管理器实例
         * @returns {EmployeeStatusManager} 管理器实例
         */
        getInstance: () => manager
    };


})();
