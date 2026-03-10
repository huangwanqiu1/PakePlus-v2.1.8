/**
 * 员工状态管理模块
 * 功能：
 * 1. 设为已结清：检查未结金额，更新本地和Supabase员工状态为"结清"，写入离职日期
 * 2. 设为未结：更新本地和Supabase员工状态为"离职"，清除离职日期
 * 3. 支持离线模式：使用现有的 OfflineSyncService 进行离线同步
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
                const indexKey = 'employeesIndex';
                const indexData = localStorage.getItem(indexKey);
                
                if (!indexData) {
                    console.error('未找到员工索引数据');
                    return null;
                }

                const employeeIndex = JSON.parse(indexData);
                
                for (const employeeId in employeeIndex) {
                    const employee = employeeIndex[employeeId];

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
         * @param {string|null} leaveDate - 离职日期，格式 YYYY-MM-DD，设为未结时传null
         * @returns {boolean} 是否更新成功
         */
        updateEmployeeStatusInLocal(employeeId, newStatus, leaveDate) {
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

                employeeIndex[employeeId].status = newStatus;
                employeeIndex[employeeId].leave_date = leaveDate;

                localStorage.setItem(indexKey, JSON.stringify(employeeIndex));

                return true;
            } catch (error) {
                console.error('❌ 更新本地员工状态失败:', error);
                return false;
            }
        }

        /**
         * 更新Supabase中的员工状态（在线时直接更新）
         * @param {string} employeeId - 员工ID
         * @param {string} newStatus - 新的状态（"结清"或"离职"）
         * @param {string|null} leaveDate - 离职日期，格式 YYYY-MM-DD，设为未结时传null
         * @returns {Promise<boolean>} 是否更新成功
         */
        async updateEmployeeStatusInSupabase(employeeId, newStatus, leaveDate) {
            if (!this.isSupabaseReady || !this.supabase) {
                return false;
            }

            try {
                const now = new Date();
                const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
                
                const updateData = {
                    status: newStatus,
                    updated_at: beijingTime.toISOString(),
                    leave_date: leaveDate
                };

                const { data, error } = await this.supabase
                    .from('employees')
                    .update(updateData)
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
         * 添加操作到离线同步队列
         * @param {string} employeeId - 员工ID
         * @param {Object} updateData - 要更新的数据
         */
        addToOfflineSyncQueue(employeeId, updateData) {
            if (window.offlineSyncService && typeof window.offlineSyncService.addToSyncQueue === 'function') {
                window.offlineSyncService.addToSyncQueue(
                    'update',
                    updateData,
                    employeeId,
                    'employee'
                );
            } else {
                console.warn('OfflineSyncService 不可用，数据仅保存在本地');
            }
        }

        /**
         * 设为已结清
         * @param {Object} employee - 员工对象，包含project_id, emp_code, emp_name, unsettled等字段
         * @returns {Promise<Object>} 返回操作结果 {success: boolean, message: string}
         */
        async setAsSettled(employee) {
            try {
                const unsettledAmount = parseFloat(employee.unsettled) || 0;

                if (unsettledAmount > 0) {
                    return {
                        success: false,
                        message: '当前员工工资未结清，不能设为已结清'
                    };
                }

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

                const today = new Date();
                const leaveDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                const localUpdated = this.updateEmployeeStatusInLocal(found.employeeId, '结清', leaveDate);

                if (!localUpdated) {
                    return {
                        success: false,
                        message: '更新本地员工状态失败'
                    };
                }

                if (navigator.onLine && this.isSupabaseReady) {
                    await this.updateEmployeeStatusInSupabase(found.employeeId, '结清', leaveDate);
                } else {
                    const now = new Date();
                    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
                    
                    const updateData = {
                        status: '结清',
                        leave_date: leaveDate,
                        updated_at: beijingTime.toISOString()
                    };
                    this.addToOfflineSyncQueue(found.employeeId, updateData);
                }

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

                const localUpdated = this.updateEmployeeStatusInLocal(found.employeeId, '离职', null);

                if (!localUpdated) {
                    return {
                        success: false,
                        message: '更新本地员工状态失败'
                    };
                }

                if (navigator.onLine && this.isSupabaseReady) {
                    await this.updateEmployeeStatusInSupabase(found.employeeId, '离职', null);
                } else {
                    const now = new Date();
                    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
                    
                    const updateData = {
                        status: '离职',
                        leave_date: null,
                        updated_at: beijingTime.toISOString()
                    };
                    this.addToOfflineSyncQueue(found.employeeId, updateData);
                }

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

    const manager = new EmployeeStatusManager();

    window.EmployeeStatusManager = {
        setAsSettled: (employee) => manager.setAsSettled(employee),
        setAsUnsettled: (employee) => manager.setAsUnsettled(employee),
        getInstance: () => manager
    };

})();
