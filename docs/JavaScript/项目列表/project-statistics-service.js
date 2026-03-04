/**
 * 项目统计服务 - 用于计算项目的详细统计数据
 * 包含：点工、包工、工量、借支、扣款、公司转账、结算、总工资、未结金额
 */

class ProjectStatisticsService {
    constructor() {
        this.CACHE_KEY_PREFIX = 'project_stats_'; // localStorage缓存键前缀
        this.CACHE_EXPIRY_MS = 30 * 60 * 1000; // 缓存过期时间：30分钟
    }

    /**
     * 获取localStorage缓存的统计数据
     */
    getStatsFromLocalStorage(projectId) {
        try {
            const cacheKey = this.CACHE_KEY_PREFIX + projectId;
            const cached = localStorage.getItem(cacheKey);
            if (!cached) return null;

            const data = JSON.parse(cached);

            // 检查缓存是否过期
            if (Date.now() > data.expiry) {
                localStorage.removeItem(cacheKey);
                return null;
            }

            return data.stats;
        } catch (error) {
            console.error('[统计服务] 读取localStorage缓存失败:', error);
            return null;
        }
    }

    /**
     * 保存统计数据到localStorage
     */
    saveStatsToLocalStorage(projectId, stats) {
        try {
            const cacheKey = this.CACHE_KEY_PREFIX + projectId;
            const data = {
                stats: stats,
                expiry: Date.now() + this.CACHE_EXPIRY_MS
            };
            localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (error) {
            console.error('[统计服务] 保存localStorage缓存失败:', error);
        }
    }

    /**
     * 清除指定项目的缓存
     */
    clearCache(projectId = null) {
        if (projectId) {
            localStorage.removeItem(this.CACHE_KEY_PREFIX + projectId);
        } else {
            // 清除所有项目统计缓存
            Object.keys(localStorage)
                .filter(key => key.startsWith(this.CACHE_KEY_PREFIX))
                .forEach(key => localStorage.removeItem(key));
        }
    }

    /**
     * 格式化金额显示
     */
    formatAmount(amount) {
        const num = parseFloat(amount);
        if (Number.isInteger(num)) {
            return `${num}元`;
        } else {
            return `${num.toFixed(2)}元`;
        }
    }

    /**
     * 获取项目的完整统计数据
     * @param {string} projectId - 项目ID
     * @returns {Promise<Object>} 统计数据对象
     */
    async getProjectStatistics(projectId) {
        // 检查localStorage缓存（跨页面共享）
        const localStorageStats = this.getStatsFromLocalStorage(projectId);
        if (localStorageStats) {
            return localStorageStats;
        }

        try {
            if (!window.supabase) {
                console.error('Supabase客户端未初始化');
                return this.getEmptyStats();
            }

            // 并行获取所需数据
            const [projectData, attendanceData, settlementData] = await Promise.all([
                this.getProjectData(projectId),
                this.getAttendanceData(projectId),
                this.getSettlementData(projectId)
            ]);

            // 处理项目数据
            const actualProjectData = Array.isArray(projectData) && projectData.length > 0
                ? projectData[0]
                : projectData;

            const projectRegularHours = actualProjectData?.regular_hours !== undefined
                ? actualProjectData.regular_hours
                : 8;
            const projectOvertimeHours = actualProjectData?.overtime_hours !== undefined
                ? actualProjectData.overtime_hours
                : 4;

            // 计算统计结果
            const stats = this.calculateStatistics(
                attendanceData,
                settlementData,
                projectRegularHours,
                projectOvertimeHours
            );

            // 缓存结果到localStorage（跨页面共享）
            this.saveStatsToLocalStorage(projectId, stats);

            return stats;

        } catch (error) {
            console.error('获取项目统计数据失败:', error);
            return this.getEmptyStats();
        }
    }

    /**
     * 获取项目数据
     */
    async getProjectData(projectId) {
        try {
            // 从本地存储获取项目数据
            let projectsData = [];
            if (window.ProjectSyncService && window.ProjectSyncService.getLocalProjectsData) {
                projectsData = window.ProjectSyncService.getLocalProjectsData();
            } else {
                // 尝试直接从localStorage获取
                let userId = 'default';
                try {
                    const currentUserStr = localStorage.getItem('currentUser');
                    if (currentUserStr) {
                        const currentUser = JSON.parse(currentUserStr);
                        userId = currentUser.user_id || 'default';
                    }
                } catch (e) {
                    console.error('解析currentUser失败:', e);
                }
                const cacheKey = 'project_cache_' + userId;
                const cachedData = localStorage.getItem(cacheKey);
                if (cachedData) {
                    projectsData = JSON.parse(cachedData);
                }
            }
            
            // 查找指定项目的数据
            const projectData = projectsData.find(project => project.project_id === projectId);
            return projectData ? [projectData] : [];
        } catch (error) {
            console.error('从本地存储获取项目数据失败:', error);
            return [];
        }
    }

    /**
     * 获取考勤数据
     */
    async getAttendanceData(projectId) {
        try {
            // 从本地存储获取考勤数据
            let attendanceData = [];
            if (window.ProjectSyncService && window.ProjectSyncService.getLocalAttendanceRecordsData) {
                attendanceData = window.ProjectSyncService.getLocalAttendanceRecordsData();
            } else {
                // 尝试直接从localStorage获取
                let userId = 'default';
                try {
                    const currentUserStr = localStorage.getItem('currentUser');
                    if (currentUserStr) {
                        const currentUser = JSON.parse(currentUserStr);
                        userId = currentUser.user_id || 'default';
                    }
                } catch (e) {
                    console.error('解析currentUser失败:', e);
                }
                // 从新的存储位置获取考勤数据
                const workRecordsKey = 'work_records_' + userId;
                const cachedData = localStorage.getItem(workRecordsKey);
                if (cachedData) {
                    attendanceData = JSON.parse(cachedData);
                }
            }
            
            // 过滤指定项目的考勤数据
            const filteredData = attendanceData.filter(record => record.project_id === projectId);
            
            // 处理员工数据关联
            const processedData = filteredData.map(record => {
                // 尝试从本地存储获取员工数据
                let employeeData = {};
                try {
                    // 从新的存储位置employeesIndex获取
                    const indexKey = 'employeesIndex';
                    const indexData = localStorage.getItem(indexKey);
                    if (indexData) {
                        const employeeIndex = JSON.parse(indexData);
                        const employee = employeeIndex[record.employee_id];
                        if (employee) {
                            employeeData = { labor_cost: employee.labor_cost };
                        }
                    }
                } catch (e) {
                    console.error('获取员工数据失败:', e);
                }
                
                return {
                    ...record,
                    employees: employeeData
                };
            });
            
            return processedData;
        } catch (error) {
            console.error('从本地存储获取考勤数据失败:', error);
            return [];
        }
    }

    /**
     * 获取结算数据
     */
    async getSettlementData(projectId) {
        try {
            // 从本地存储获取结算数据
            let settlementData = [];
            if (window.ProjectSyncService && window.ProjectSyncService.getLocalSettlementRecordsData) {
                settlementData = window.ProjectSyncService.getLocalSettlementRecordsData();
            } else {
                // 尝试直接从localStorage获取
                // 从新的存储位置获取结算数据
                const cachedData = localStorage.getItem('settlementRecords');
                if (cachedData) {
                    settlementData = JSON.parse(cachedData);
                }
            }
            
            // 过滤指定项目的结算数据
            const filteredData = settlementData.filter(record => record.project_id === projectId);
            
            // 提取需要的字段
            const processedData = filteredData.map(record => ({
                record_type: record.record_type,
                amount: record.amount
            }));
            
            return processedData;
        } catch (error) {
            console.error('从本地存储获取结算数据失败:', error);
            return [];
        }
    }

    /**
     * 计算统计数据
     */
    calculateStatistics(attendanceData, settlementData, regularHours, overtimeHours) {
        // 初始化统计结果
        const stats = {
            // 点工相关
            点工上班小时: 0,
            点工上班工数: 0,
            点工加班小时: 0,
            点工加班工数: 0,
            点工金额: 0,

            // 包工和工量
            包工金额: 0,
            工量金额: 0,

            // 支出相关
            借支金额: 0,
            扣款金额: 0,
            公司打款金额: 0,
            结算金额: 0,

            // 总计
            总工资: 0,
            未结金额: 0
        };

        // 按员工分组处理点工数据
        const employeeWages = {};

        attendanceData.forEach(record => {
            if (record.work_type === '点工') {
                const employeeId = record.employee_id;
                if (!employeeWages[employeeId]) {
                    employeeWages[employeeId] = {
                        regularHours: 0,
                        overtimeHours: 0,
                        laborCost: record.employees?.labor_cost || 0
                    };
                }

                // 累计工时
                employeeWages[employeeId].regularHours += record.regular_hours || 0;
                employeeWages[employeeId].overtimeHours += record.overtime_hours || 0;

                // 更新工价（如果有）
                if (record.employees?.labor_cost) {
                    employeeWages[employeeId].laborCost = record.employees.labor_cost;
                }
            } else if (record.work_type === '包工') {
                stats.包工金额 += record.contract_amount || 0;
            } else if (record.work_type === '工量') {
                stats.工量金额 += record.contract_amount || 0;
            }
        });

        // 计算所有员工的点工工资
        Object.values(employeeWages).forEach(employee => {
            // 累计工时
            stats.点工上班小时 += employee.regularHours;
            stats.点工加班小时 += employee.overtimeHours;

            // 计算工数
            const regularWorkUnits = employee.regularHours / regularHours;
            const overtimeWorkUnits = employee.overtimeHours / overtimeHours;

            // 四舍五入到两位小数
            const roundedRegularWorkUnits = parseFloat(regularWorkUnits.toFixed(2));
            const roundedOvertimeWorkUnits = parseFloat(overtimeWorkUnits.toFixed(2));

            // 累计工数
            stats.点工上班工数 += roundedRegularWorkUnits;
            stats.点工加班工数 += roundedOvertimeWorkUnits;

            // 计算该员工的点工工资（向下取整）
            const totalWorkUnits = roundedRegularWorkUnits + roundedOvertimeWorkUnits;
            const pieceWage = Math.floor(totalWorkUnits * employee.laborCost);
            stats.点工金额 += pieceWage;
        });

        // 四舍五入工数到2位小数
        stats.点工上班工数 = parseFloat(stats.点工上班工数.toFixed(2));
        stats.点工加班工数 = parseFloat(stats.点工加班工数.toFixed(2));

        // 处理结算数据
        settlementData.forEach(record => {
            switch (record.record_type) {
                case '借支':
                    stats.借支金额 += record.amount || 0;
                    break;
                case '扣款':
                    stats.扣款金额 += record.amount || 0;
                    break;
                case '公司转账':
                    stats.公司打款金额 += record.amount || 0;
                    break;
                case '结算':
                    stats.结算金额 += record.amount || 0;
                    break;
            }
        });

        // 计算总工资
        stats.总工资 = stats.点工金额 + stats.包工金额 + stats.工量金额;

        // 计算未结金额
        stats.未结金额 = stats.总工资 - stats.借支金额 - stats.扣款金额 - stats.公司打款金额 - stats.结算金额;

        return stats;
    }

    /**
     * 获取空的统计数据
     */
    getEmptyStats() {
        return {
            点工上班小时: 0,
            点工上班工数: 0,
            点工加班小时: 0,
            点工加班工数: 0,
            点工金额: 0,
            包工金额: 0,
            工量金额: 0,
            借支金额: 0,
            扣款金额: 0,
            公司打款金额: 0,
            结算金额: 0,
            总工资: 0,
            未结金额: 0
        };
    }

    /**
     * 获取项目总工资（便捷方法，用于项目列表）
     * @param {string} projectId - 项目ID
     * @returns {Promise<number>} 总工资金额
     */
    async getTotalWageAmount(projectId) {
        try {
            const stats = await this.getProjectStatistics(projectId);
            return stats.总工资;
        } catch (error) {
            console.error('获取总工资金额失败:', error);
            return 0;
        }
    }

    /**
     * 获取项目未结金额（便捷方法，用于项目列表）
     * @param {string} projectId - 项目ID
     * @returns {Promise<number>} 未结金额
     */
    async getUnsettledAmount(projectId) {
        try {
            const stats = await this.getProjectStatistics(projectId);
            return stats.未结金额;
        } catch (error) {
            console.error('获取未结金额失败:', error);
            return 0;
        }
    }

    /**
     * 生成统计面板HTML（用于项目主页显示，样式与统计.html的合计页面一致）
     */
    generateStatsPanel(stats) {
        if (!stats) {
            return '<div style="text-align: center; color: #999; padding: 20px;">暂无统计数据</div>';
        }

        const statItems = [];

        // 获取当前项目信息
        const projectName = localStorage.getItem('currentProjectName') || '';
        const projectId = localStorage.getItem('currentProjectId') || '';
        const encodedProjectName = encodeURIComponent(projectName);
        const encodedProjectId = encodeURIComponent(projectId);

        // 点工项
        if (stats.点工上班小时 > 0 || stats.点工加班小时 > 0) {
            let pointWorkContent = '';
            if (stats.点工上班小时 > 0) {
                const hours = Number.isInteger(stats.点工上班小时)
                    ? stats.点工上班小时
                    : stats.点工上班小时.toFixed(1);
                const workDays = stats.点工上班工数;
                const displayWorkDays = Number.isInteger(workDays) ? workDays : workDays.toFixed(2);
                pointWorkContent += `<div style="font-size: 16px; color: black;">上班：${hours}小时=${displayWorkDays}个工</div>`;
            }
            if (stats.点工加班小时 > 0) {
                const hours = Number.isInteger(stats.点工加班小时)
                    ? stats.点工加班小时
                    : stats.点工加班小时.toFixed(1);
                const workDays = stats.点工加班工数;
                const displayWorkDays = Number.isInteger(workDays) ? workDays : workDays.toFixed(2);
                pointWorkContent += `<div style="font-size: 16px; color: black;">加班：${hours}小时=${displayWorkDays}个工</div>`;
            }
            statItems.push({
                label: '点工',
                content: pointWorkContent,
                amount: this.formatAmount(stats.点工金额),
                color: '#007bff',
                bgColor: '#EDF4FF'
            });
        }

        // 包工项
        if (stats.包工金额 > 0) {
            statItems.push({
                label: '包工',
                content: '',
                amount: this.formatAmount(stats.包工金额),
                color: '#28a745',
                bgColor: '#EDF4FF'
            });
        }

        // 工量项
        if (stats.工量金额 > 0) {
            statItems.push({
                label: '工量',
                content: '',
                amount: this.formatAmount(stats.工量金额),
                color: '#28a745',
                bgColor: '#EDF4FF'
            });
        }

        // 借支项
        if (stats.借支金额 > 0) {
            statItems.push({
                label: '借支',
                content: '',
                amount: this.formatAmount(stats.借支金额),
                color: '#fd7e14',
                bgColor: '#FFF5E7'
            });
        }

        // 扣款项
        if (stats.扣款金额 > 0) {
            statItems.push({
                label: '扣款',
                content: '',
                amount: this.formatAmount(stats.扣款金额),
                color: '#fd7e14',
                bgColor: '#FFF5E7'
            });
        }

        // 公司转账项
        if (stats.公司打款金额 > 0) {
            statItems.push({
                label: '公司转账',
                content: '',
                amount: this.formatAmount(stats.公司打款金额),
                color: '#fd7e14',
                bgColor: '#FFF5E7'
            });
        }

        // 结算项
        if (stats.结算金额 > 0) {
            statItems.push({
                label: '结算',
                content: '',
                amount: this.formatAmount(stats.结算金额),
                color: '#fd7e14',
                bgColor: '#FFF5E7'
            });
        }

        // 如果没有数据
        if (statItems.length === 0) {
            return '<div style="text-align: center; color: #999; padding: 40px;">暂无统计数据</div>';
        }

        // 生成HTML - 使用与统计.html合计页面相同的样式
        let html = `
            <div style="margin-bottom: 0; padding: 15px; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <!-- 合计标题行 -->
                <div style="padding: 12px 16px; background-color: #4a5568; color: white; font-size: 18px; font-weight: 600; margin: -15px -15px 15px -15px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;">
                    合计
                    <div style="font-size: 16px; font-weight: 500;">
                        工资：<span style="font-weight: 600; color: #ffd700;">${this.formatAmount(stats.总工资)}</span>
                        <span style="margin: 0 8px;">|</span>
                        支出：<span style="font-weight: 600; color: #ff6b6b;">${this.formatAmount(stats.借支金额 + stats.扣款金额 + stats.公司打款金额 + stats.结算金额)}</span>
                        <br>
                        未结：<span style="font-weight: 600; color: #4ade80;">${this.formatAmount(stats.未结金额)}</span>
                    </div>
                </div>

                <!-- 统计项列表 -->
                <div style="">
        `;

        statItems.forEach(item => {
            // 创建点击事件处理函数
            const clickHandler = `handleStatItemClick('${item.label}')`;

            html += `
                <div style="display: flex; align-items: center; padding: 12px 16px; margin-bottom: 8px; border-radius: 8px; ${item.bgColor ? 'background-color: ' + item.bgColor + ';' : ''} cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" onclick="${clickHandler}">
                    <!-- 左侧图标和类型 -->
                    <div style="display: flex; align-items: center; margin-right: 5px; width: 80px;">
                        <div style="width: 4px; height: 16px; background-color: ${item.color}; border-radius: 2px; margin-right: 5px;"></div>
                        <div style="font-weight: bold; color: #333;">${item.label}</div>
                    </div>

                    <!-- 中间内容 -->
                    <div style="flex: 1; color: black; font-size: 16px; line-height: 1.4; display: flex; flex-direction: column; justify-content: center; text-align: left;">${item.content}</div>

                    <!-- 右侧金额 -->
                    <div style="text-align: right; font-weight: 600; color: ${item.color}; display: flex; flex-direction: column; justify-content: center;">${item.amount}</div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
        return html;
    }
}

// 创建全局实例
window.projectStatisticsService = new ProjectStatisticsService();
