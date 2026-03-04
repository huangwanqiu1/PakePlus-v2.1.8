// Supabase记工服务模块
// 提供与Supabase数据库的交互功能，支持点工、包工、工量三种工作类型

class SupabaseWorkService {
    constructor() {
        this.supabase = null;
        this.initialized = false;
    }

    // 初始化Supabase客户端
    async initialize() {
        try {
            if (typeof window !== 'undefined' && window.supabase) {
                this.supabase = window.supabase;
                this.initialized = true;
                console.log('Supabase记工服务初始化成功');
                return true;
            } else {
                throw new Error('Supabase客户端未加载');
            }
        } catch (error) {
            console.error('Supabase记工服务初始化失败:', error);
            throw error;
        }
    }

    // 确保服务已初始化
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }

    // ==================== 用户相关操作 ====================

    // 获取或创建用户
    async getOrCreateUser(phone, username = null) {
        await this.ensureInitialized();
        
        try {
            // 首先尝试获取用户
            const { data: existingUser, error: getError } = await this.supabase
                .from('users')
                .select('*')
                .eq('phone', phone)
                .single();

            if (existingUser && !getError) {
                return existingUser;
            }

            // 如果用户不存在，创建新用户
            const { data: newUser, error: createError } = await this.supabase
                .from('users')
                .insert([{
                    phone: phone,
                    username: username || `用户_${phone.slice(-4)}`,
                    status: 'active',
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (createError) {
                throw createError;
            }

            return newUser;
        } catch (error) {
            console.error('获取或创建用户失败:', error);
            throw error;
        }
    }

    // 更新用户信息
    async updateUser(userId, updateData) {
        await this.ensureInitialized();
        
        try {
            const { data, error } = await this.supabase
                .from('users')
                .update(updateData)
                .eq('id', userId)
                .select()
                .single();

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('更新用户信息失败:', error);
            throw error;
        }
    }

    // ==================== 项目相关操作 ====================

    // 获取用户项目列表
    async getUserProjects(userId) {
        await this.ensureInitialized();
        
        try {
            const { data, error } = await this.supabase
                .from('user_projects')
                .select('projects:project_id(*), created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) {
                throw error;
            }

            // 转换数据格式，直接返回项目列表
            return data.map(item => item.projects);
        } catch (error) {
            console.error('获取用户项目列表失败:', error);
            throw error;
        }
    }

    // 关联用户和项目
    async associateUserWithProject(userId, projectId) {
        await this.ensureInitialized();
        
        try {
            const { data, error } = await this.supabase
                .from('user_projects')
                .insert([{
                    user_id: userId,
                    project_id: projectId
                }])
                .select()
                .single();

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('关联用户和项目失败:', error);
            throw error;
        }
    }

    // 解除用户和项目的关联
    async disassociateUserFromProject(userId, projectId) {
        await this.ensureInitialized();
        
        try {
            const { error } = await this.supabase
                .from('user_projects')
                .delete()
                .eq('user_id', userId)
                .eq('project_id', projectId);

            if (error) {
                throw error;
            }

            return true;
        } catch (error) {
            console.error('解除用户和项目关联失败:', error);
            throw error;
        }
    }

    // 检查用户是否有权限访问项目
    async checkUserProjectAccess(userId, projectId) {
        await this.ensureInitialized();
        
        try {
            const { data, error } = await this.supabase
                .from('user_projects')
                .select('id')
                .eq('user_id', userId)
                .eq('project_id', projectId)
                .single();

            if (error) {
                // 如果没有找到记录，返回false
                return false;
            }

            return true;
        } catch (error) {
            console.error('检查用户项目访问权限失败:', error);
            return false;
        }
    }

    // 获取项目详情
    async getProjectDetails(projectId, userId = null) {
        await this.ensureInitialized();
        
        try {
            // 如果提供了userId，先检查用户是否有权限访问该项目
            if (userId && !await this.checkUserProjectAccess(userId, projectId)) {
                throw new Error('用户没有权限访问该项目');
            }
            
            const { data, error } = await this.supabase
                .from('projects')
                .select('*')
                .eq('project_id', projectId)
                .single();

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('获取项目详情失败:', error);
            throw error;
        }
    }

    // 获取项目关联的用户列表
    async getProjectUsers(projectId) {
        await this.ensureInitialized();
        
        try {
            const { data, error } = await this.supabase
                .from('user_projects')
                .select('users:user_id(*), created_at')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false });

            if (error) {
                throw error;
            }

            // 转换数据格式，直接返回用户列表
            return data.map(item => item.users);
        } catch (error) {
            console.error('获取项目关联用户列表失败:', error);
            throw error;
        }
    }

    // 创建项目
    async createProject(projectData, userId) {
        await this.ensureInitialized();
        
        try {
            // 创建项目
            const { data: project, error: projectError } = await this.supabase
                .from('projects')
                .insert([projectData])
                .select()
                .single();

            if (projectError) {
                throw projectError;
            }

            // 自动将创建者与项目关联
            await this.associateUserWithProject(userId, project.project_id);

            return project;
        } catch (error) {
            console.error('创建项目失败:', error);
            throw error;
        }
    }

    // ==================== 员工相关操作 ====================

    // 获取项目员工列表
    async getProjectEmployees(projectId) {
        await this.ensureInitialized();
        
        try {
            const { data, error } = await this.supabase
                .from('employees')
                .select('*')
                .eq('project_id', projectId)
                .eq('empstatus', '在职')
                .order('empname', { ascending: true });

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('获取项目员工列表失败:', error);
            throw error;
        }
    }

    // 获取员工详情
    async getEmployeeDetails(employeeId) {
        await this.ensureInitialized();
        
        try {
            const { data, error } = await this.supabase
                .from('employees')
                .select('*')
                .eq('employee_id', employeeId)
                .single();

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('获取员工详情失败:', error);
            throw error;
        }
    }

    // 创建员工
    async createEmployee(employeeData) {
        await this.ensureInitialized();
        
        try {
            const { data, error } = await this.supabase
                .from('employees')
                .insert([employeeData])
                .select()
                .single();

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('创建员工失败:', error);
            throw error;
        }
    }

    // 获取用户关联的所有员工（通过项目关联）
    async getUserEmployees(userId) {
        await this.ensureInitialized();
        
        try {
            // 使用视图查询用户关联的所有员工
            const { data, error } = await this.supabase
                .from('user_project_employee_view')
                .select('*')
                .eq('user_id', userId)
                .order('project_name', { ascending: true })
                .order('employee_name', { ascending: true });

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('获取用户关联员工列表失败:', error);
            throw error;
        }
    }

    // ==================== 记工记录相关操作 ====================

    // 保存记工记录（核心功能）
    async saveWorkRecord(workRecordData) {
        await this.ensureInitialized();
        
        try {
            // 生成业务ID
            const record_id = `attendance_${workRecordData.phone}_${workRecordData.employee_id}_${workRecordData.work_date}`;
            
            // 构建完整的记工记录数据
            const completeWorkRecord = {
                ...workRecordData,
                record_id: record_id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                sync_status: 'synced'
            };

            // 开始事务
            const { data, error } = await this.supabase
                .from('work_records')
                .insert([completeWorkRecord])
                .select()
                .single();

            if (error) {
                throw error;
            }

            // 记录操作日志
            await this.logOperation({
                user_id: workRecordData.user_id,
                operation: 'CREATE_ATTENDANCE',
                table_name: 'work_records',
                record_id: data.id,
                project_id: workRecordData.project_id,
                details: workRecordData
            });

            return data;
        } catch (error) {
            console.error('保存记工记录失败:', error);
            throw error;
        }
    }

    // 批量保存记工记录
    async batchSaveWorkRecords(workRecordsData) {
        await this.ensureInitialized();
        
        try {
            // 为每个记录生成ID并添加时间戳
            const completeWorkRecords = workRecordsData.map(record => ({
                ...record,
                record_id: `attendance_${record.phone}_${record.employee_id}_${record.work_date}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                sync_status: 'synced'
            }));

            const { data, error } = await this.supabase
                .from('work_records')
                .insert(completeWorkRecords)
                .select();

            if (error) {
                throw error;
            }

            // 记录批量操作日志
            if (data && data.length > 0) {
                await this.logOperation({
                    user_id: workRecordsData[0].user_id,
                    operation: 'BATCH_CREATE_ATTENDANCE',
                    table_name: 'work_records',
                    record_count: data.length,
                    project_id: workRecordsData[0].project_id,
                    details: { batch_size: data.length }
                });
            }

            return data;
        } catch (error) {
            console.error('批量保存记工记录失败:', error);
            throw error;
        }
    }

    // 获取记工记录列表
    async getWorkRecords(filters = {}) {
        await this.ensureInitialized();
        
        try {
            let query = this.supabase
                .from('work_record_details')
                .select('*');

            // 应用过滤器
            if (filters.user_id) {
                query = query.eq('user_id', filters.user_id);
            }
            if (filters.project_id) {
                query = query.eq('project_id', filters.project_id);
            }
            if (filters.employee_id) {
                query = query.eq('employee_id', filters.employee_id);
            }
            if (filters.work_date) {
                query = query.eq('work_date', filters.work_date);
            }
            if (filters.work_type) {
                query = query.eq('work_type', filters.work_type);
            }
            if (filters.start_date && filters.end_date) {
                query = query.gte('work_date', filters.start_date).lte('work_date', filters.end_date);
            }

            // 排序和分页
            query = query.order('work_date', { ascending: false });
            
            if (filters.limit) {
                query = query.limit(filters.limit);
            }
            if (filters.offset) {
                query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
            }

            const { data, error } = await query;

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('获取记工记录列表失败:', error);
            throw error;
        }
    }

    // 获取单条记工记录
    async getWorkRecord(record_id) {
        await this.ensureInitialized();
        
        try {
            // 首先尝试从考勤记录表获取记录
            let { data, error } = await this.supabase
                .from('attendance_records')
                .select('*')
                .eq('record_id', record_id)
                .single();

            // 如果考勤记录表中没有找到，尝试从视图中获取
            if (error && error.code === 'PGRST116') {
                ({ data, error } = await this.supabase
                    .from('work_record_details')
                    .select('*')
                    .eq('record_id', record_id)
                    .single());
            }

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('获取记工记录失败:', error);
            throw error;
        }
    }

    // 更新记工记录
    async updateWorkRecord(record_id, updateData) {
        await this.ensureInitialized();
        
        try {
            // 首先尝试更新考勤记录表
            let { data, error } = await this.supabase
                .from('attendance_records')
                .update({
                    ...updateData,
                    updated_at: new Date().toISOString()
                })
                .eq('record_id', record_id)
                .select()
                .single();

            // 如果考勤记录表中没有找到，尝试更新work_records表
            if (error && error.code === 'PGRST116') {
                ({ data, error } = await this.supabase
                    .from('work_records')
                    .update({
                        ...updateData,
                        updated_at: new Date().toISOString()
                    })
                    .eq('record_id', record_id)
                    .select()
                    .single());
            }

            if (error) {
                throw error;
            }

            // 记录更新操作日志
            await this.logOperation({
                user_id: data.user_id,
                operation: 'UPDATE_ATTENDANCE',
                table_name: data.table_name || 'attendance_records',
                record_id: record_id,
                project_id: data.project_id,
                details: updateData
            });

            return data;
        } catch (error) {
            console.error('更新记工记录失败:', error);
            throw error;
        }
    }

    // 删除记工记录
    async deleteWorkRecord(record_id) {
        await this.ensureInitialized();
        
        try {
            // 首先获取记录信息用于日志
            const record = await this.getWorkRecord(record_id);
            
            // 首先尝试删除考勤记录表中的记录
            let { error } = await this.supabase
                .from('attendance_records')
                .delete()
                .eq('record_id', record_id);

            // 如果考勤记录表中没有找到，尝试删除work_records表中的记录
            if (error && error.code === 'PGRST116') {
                ({ error } = await this.supabase
                    .from('work_records')
                    .delete()
                    .eq('record_id', record_id));
            }

            if (error) {
                throw error;
            }

            // 记录删除操作日志
            await this.logOperation({
                user_id: record.user_id,
                operation: 'DELETE_ATTENDANCE',
                table_name: record.table_name || 'attendance_records',
                record_id: record_id,
                project_id: record.project_id,
                details: { deleted_record: record }
            });

            return true;
        } catch (error) {
            console.error('删除记工记录失败:', error);
            throw error;
        }
    }

    // ==================== 统计查询操作 ====================

    // 获取项目统计信息
    async getProjectStatistics(projectId) {
        await this.ensureInitialized();
        
        try {
            const { data, error } = await this.supabase
                .from('project_statistics')
                .select('*')
                .eq('project_id', projectId)
                .single();

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('获取项目统计信息失败:', error);
            throw error;
        }
    }

    // 获取员工工作统计
    async getEmployeeStatistics(employeeId, startDate = null, endDate = null) {
        await this.ensureInitialized();
        
        try {
            let query = this.supabase
                .from('work_record_details')
                .select('*')
                .eq('employee_id', employeeId);

            if (startDate && endDate) {
                query = query.gte('work_date', startDate).lte('work_date', endDate);
            }

            const { data, error } = await query;

            if (error) {
                throw error;
            }

            // 计算统计数据
            const statistics = {
                total_records: data.length,
                total_regular_hours: 0,
                total_overtime_hours: 0,
                total_contract_amount: 0,
                total_work_amount: 0,
                total_calculated_amount: 0,
                work_type_breakdown: {
                    '点工': { count: 0, hours: 0, amount: 0 },
                    '包工': { count: 0, amount: 0 },
                    '工量': { count: 0, amount: 0 }
                }
            };

            data.forEach(record => {
                if (record.work_type === '点工') {
                    statistics.total_regular_hours += record.regular_hours || 0;
                    statistics.total_overtime_hours += record.overtime_hours || 0;
                    statistics.work_type_breakdown['点工'].count++;
                    statistics.work_type_breakdown['点工'].hours += record.regular_hours + record.overtime_hours;
                    statistics.work_type_breakdown['点工'].amount += record.calculated_amount || 0;
                } else if (record.work_type === '包工') {
                    statistics.total_contract_amount += record.contract_amount || 0;
                    statistics.work_type_breakdown['包工'].count++;
                    statistics.work_type_breakdown['包工'].amount += record.contract_amount || 0;
                } else if (record.work_type === '工量') {
                    statistics.total_work_amount += record.total_amount || 0;
                    statistics.work_type_breakdown['工量'].count++;
                    statistics.work_type_breakdown['工量'].amount += record.total_amount || 0;
                }
                statistics.total_calculated_amount += record.calculated_amount || 0;
            });

            return statistics;
        } catch (error) {
            console.error('获取员工工作统计失败:', error);
            throw error;
        }
    }

    // ==================== 图片相关操作 ====================

    // 保存工作图片
    async saveWorkImages(workRecordId, imageData) {
        await this.ensureInitialized();
        
        try {
            const imageRecords = imageData.map(image => ({
                work_record_id: workRecordId,
                image_url: image.url,
                image_name: image.name,
                image_size: image.size,
                upload_status: 'uploaded',
                uploaded_at: new Date().toISOString()
            }));

            const { data, error } = await this.supabase
                .from('work_images')
                .insert(imageRecords)
                .select();

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('保存工作图片失败:', error);
            throw error;
        }
    }

    // 获取工作图片
    async getWorkImages(workRecordId) {
        await this.ensureInitialized();
        
        try {
            const { data, error } = await this.supabase
                .from('work_images')
                .select('*')
                .eq('work_record_id', workRecordId)
                .order('uploaded_at', { ascending: true });

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('获取工作图片失败:', error);
            throw error;
        }
    }

    // ==================== 操作日志 ====================

    // 记录操作日志
    async logOperation(logData) {
        await this.ensureInitialized();
        
        try {
            const { data, error } = await this.supabase
                .from('operation_logs')
                .insert([{
                    ...logData,
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (error) {
                console.warn('记录操作日志失败:', error);
                // 不抛出错误，避免影响主业务流程
            }

            return data;
        } catch (error) {
            console.warn('记录操作日志异常:', error);
            // 不抛出错误，避免影响主业务流程
        }
    }

    // 获取操作日志
    async getOperationLogs(userId, limit = 50) {
        await this.ensureInitialized();
        
        try {
            const { data, error } = await this.supabase
                .from('operation_logs')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('获取操作日志失败:', error);
            throw error;
        }
    }

    // ==================== 数据同步相关 ====================

    // 获取待同步的记录
    async getPendingSyncRecords(userId) {
        await this.ensureInitialized();
        
        try {
            const { data, error } = await this.supabase
                .from('work_records')
                .select('*')
                .eq('user_id', userId)
                .eq('sync_status', 'pending')
                .order('created_at', { ascending: true });

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('获取待同步记录失败:', error);
            throw error;
        }
    }

    // 更新同步状态
    async updateSyncStatus(recordIds, status) {
        await this.ensureInitialized();
        
        try {
            const { data, error } = await this.supabase
                .from('work_records')
                .update({ 
                    sync_status: status,
                    updated_at: new Date().toISOString()
                })
                .in('id', recordIds)
                .select();

            if (error) {
                throw error;
            }

            return data;
        } catch (error) {
            console.error('更新同步状态失败:', error);
            throw error;
        }
    }
}

// 创建全局实例
window.supabaseWorkService = new SupabaseWorkService();

// 导出服务类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SupabaseWorkService;
}