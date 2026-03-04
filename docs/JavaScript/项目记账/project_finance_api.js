// 项目收支管理API
class ProjectFinanceAPI {
    constructor() {
        // 检查全局Supabase客户端是否已存在
        if (typeof window.supabase === 'undefined') {
            console.error('Supabase客户端未初始化');
            return;
        }
        this.supabase = window.supabase;
        this.offlineSync = window.offlineSync || null;
    }

    /**
     * 保存项目支出记录
     * @param {Object} expenseData - 支出数据
     * @returns {Promise<Object>} 保存结果
     */
    async saveProjectExpense(expenseData) {
        // 检查网络状态
        const isOnline = navigator.onLine;

        // 检查必要字段
        if (!expenseData.project_id || !expenseData.record_date || !expenseData.payment || !expenseData.amount) {
            throw new Error('缺少必要字段');
        }

        // 离线模式：直接保存到本地存储
        if (!isOnline) {
            console.log('离线模式：保存项目支出到本地存储');
            try {
                await this._saveRecordToLocalStorage(expenseData, 'project_expenses');
                return { success: true, data: { is_local: true }, message: '已保存到本地存储，将在网络恢复后同步' };
            } catch (localError) {
                console.error('保存到本地存储失败:', localError);
                return { success: false, error: localError.message };
            }
        }

        // 在线模式：保存到Supabase
        try {
            // 准备数据，使用北京时间
            const now = new Date();
            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
            
            const data = {
                project_id: expenseData.project_id,
                record_date: expenseData.record_date,
                payer: expenseData.payment,
                amount: parseFloat(expenseData.amount),
                detail_description: expenseData.description || '',
                remark: expenseData.remark || '',
                image_ids: expenseData.images || [],
                updated_at: beijingTime.toISOString() // 更新最后修改时间（北京时间）
            };

            const { data: result, error } = await this.supabase
                .from('project_expenses')
                .insert([data])
                .select();

            if (error) {
                throw error;
            }

            // 同步到本地存储
            if (result && result.length > 0) {
                this._saveOnlineRecordToLocal(result[0], 'project_expenses');
            }

            return { success: true, data: result };
        } catch (error) {
            console.error('保存项目支出失败:', error);
            // 发生错误时，保存到本地存储（离线模式）
            try {
                await this._saveRecordToLocalStorage(expenseData, 'project_expenses');
                return { success: true, data: { is_local: true }, message: '已保存到本地存储，将在网络恢复后同步' };
            } catch (localError) {
                console.error('保存到本地存储也失败:', localError);
                return { success: false, error: error.message };
            }
        }
    }

    /**
     * 更新项目支出记录
     * @param {string} id - 支出记录ID
     * @param {Object} expenseData - 支出数据
     * @returns {Promise<Object>} 更新结果
     */
    async updateProjectExpense(id, expenseData) {
        // 检查网络状态
        const isOnline = navigator.onLine;

        // 检查必要字段
        if (!expenseData.project_id || !expenseData.record_date || !expenseData.payment || !expenseData.amount) {
            throw new Error('缺少必要字段');
        }

        // 离线模式：保存到本地存储并添加到同步队列
        if (!isOnline) {
            try {
                // 尝试更新本地存储
                await this._updateRecordInLocalStorage(id, expenseData, 'project_expenses');
                
                // 无论本地更新是否成功，都添加到同步队列
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('update', {
                        table: 'project_expenses',
                        expense_id: id,
                        ...expenseData
                    }, id, 'project_expense');

                }
                
                return { success: true, data: { is_local: true }, message: '已保存到本地存储，将在网络恢复后同步' };
            } catch (localError) {
                console.error('保存到本地存储失败:', localError);
                // 即使本地保存失败，也要添加到同步队列
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('update', {
                        table: 'project_expenses',
                        expense_id: id,
                        ...expenseData
                    }, id, 'project_expense');

                }
                return { success: true, data: { is_local: true }, message: '已添加到同步队列，将在网络恢复后同步' };
            }
        }

        // 在线模式：更新到Supabase
        try {
            // 准备数据，使用北京时间
            const now = new Date();
            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
            
            const data = {
                project_id: expenseData.project_id,
                record_date: expenseData.record_date,
                payer: expenseData.payment,
                amount: parseFloat(expenseData.amount),
                detail_description: expenseData.description || '',
                remark: expenseData.remark || '',
                image_ids: expenseData.images || [],
                updated_at: beijingTime.toISOString() // 更新最后修改时间（北京时间）
            };

            const { data: result, error } = await this.supabase
                .from('project_expenses')
                .update(data)
                .eq('expense_id', id)
                .select();

            if (error) {
                throw error;
            }

            // 同步到本地存储
            if (result && result.length > 0) {
                this._saveOnlineRecordToLocal(result[0], 'project_expenses');
            }

            return { success: true, data: result };
        } catch (error) {
            console.error('更新项目支出失败:', error);
            // 发生错误时，保存到本地存储（离线模式）
            try {
                await this._updateRecordInLocalStorage(id, expenseData, 'project_expenses');
                // 添加到同步队列
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('update', {
                        table: 'project_expenses',
                        expense_id: id,
                        ...expenseData
                    }, id, 'project_expense');
                    console.log('离线更新项目支出任务已添加到同步队列');
                }
                return { success: true, data: { is_local: true }, message: '已保存到本地存储，将在网络恢复后同步' };
            } catch (localError) {
                console.error('保存到本地存储也失败:', localError);
                // 即使本地保存失败，也要添加到同步队列
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('update', {
                        table: 'project_expenses',
                        expense_id: id,
                        ...expenseData
                    }, id, 'project_expense');
                    console.log('离线更新项目支出任务已添加到同步队列');
                }
                return { success: true, data: { is_local: true }, message: '已添加到同步队列，将在网络恢复后同步' };
            }
        }
    }

    /**
     * 更新项目收入记录
     * @param {string} id - 收入记录ID
     * @param {Object} incomeData - 收入数据
     * @returns {Promise<Object>} 更新结果
     */
    async updateProjectIncome(id, incomeData) {
        // 检查网络状态
        const isOnline = navigator.onLine;

        // 检查必要字段
        if (!incomeData.project_id || !incomeData.record_date || !incomeData.amount) {
            throw new Error('缺少必要字段');
        }

        // 离线模式：保存到本地存储并添加到同步队列
        if (!isOnline) {
            console.log('离线模式：更新项目收入到本地存储');
            try {
                // 尝试更新本地存储
                await this._updateRecordInLocalStorage(id, incomeData, 'project_income');
                
                // 无论本地更新是否成功，都添加到同步队列
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('update', {
                        table: 'project_income',
                        income_id: id,
                        ...incomeData
                    }, id, 'project_income');
                    console.log('离线更新项目收入任务已添加到同步队列');
                }
                
                return { success: true, data: { is_local: true }, message: '已保存到本地存储，将在网络恢复后同步' };
            } catch (localError) {
                console.error('保存到本地存储失败:', localError);
                // 即使本地保存失败，也要添加到同步队列
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('update', {
                        table: 'project_income',
                        income_id: id,
                        ...incomeData
                    }, id, 'project_income');
                    console.log('离线更新项目收入任务已添加到同步队列');
                }
                return { success: true, data: { is_local: true }, message: '已添加到同步队列，将在网络恢复后同步' };
            }
        }

        // 在线模式：更新到Supabase
        try {
            // 准备数据，使用北京时间
            const now = new Date();
            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
            
            const data = {
                project_id: incomeData.project_id,
                record_date: incomeData.record_date,
                amount: parseFloat(incomeData.amount),
                detail_description: incomeData.description || '',
                remark: incomeData.remark || '',
                image_ids: incomeData.images || [],
                updated_at: beijingTime.toISOString() // 更新最后修改时间（北京时间）
            };

            const { data: result, error } = await this.supabase
                .from('project_income')
                .update(data)
                .eq('income_id', id)
                .select();

            if (error) {
                throw error;
            }

            // 同步到本地存储
            if (result && result.length > 0) {
                this._saveOnlineRecordToLocal(result[0], 'project_income');
            }

            return { success: true, data: result };
        } catch (error) {
            console.error('更新项目收入失败:', error);
            // 发生错误时，保存到本地存储（离线模式）
            try {
                await this._updateRecordInLocalStorage(id, incomeData, 'project_income');
                // 添加到同步队列
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('update', {
                        table: 'project_income',
                        income_id: id,
                        ...incomeData
                    }, id, 'project_income');
                    console.log('离线更新项目收入任务已添加到同步队列');
                }
                return { success: true, data: { is_local: true }, message: '已保存到本地存储，将在网络恢复后同步' };
            } catch (localError) {
                console.error('保存到本地存储也失败:', localError);
                // 即使本地保存失败，也要添加到同步队列
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('update', {
                        table: 'project_income',
                        income_id: id,
                        ...incomeData
                    }, id, 'project_income');
                    console.log('离线更新项目收入任务已添加到同步队列');
                }
                return { success: true, data: { is_local: true }, message: '已添加到同步队列，将在网络恢复后同步' };
            }
        }
    }

    /**
     * 保存项目收入记录
     * @param {Object} incomeData - 收入数据
     * @returns {Promise<Object>} 保存结果
     */
    async saveProjectIncome(incomeData) {
        // 检查网络状态
        const isOnline = navigator.onLine;

        // 检查必要字段
        if (!incomeData.project_id || !incomeData.record_date || !incomeData.amount) {
            throw new Error('缺少必要字段');
        }

        // 离线模式：直接保存到本地存储
        if (!isOnline) {
            console.log('离线模式：保存项目收入到本地存储');
            try {
                await this._saveRecordToLocalStorage(incomeData, 'project_income');
                return { success: true, data: { is_local: true }, message: '已保存到本地存储，将在网络恢复后同步' };
            } catch (localError) {
                console.error('保存到本地存储失败:', localError);
                return { success: false, error: localError.message };
            }
        }

        // 在线模式：保存到Supabase
        try {
            // 准备数据，使用北京时间
            const now = new Date();
            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
            
            const data = {
                project_id: incomeData.project_id,
                record_date: incomeData.record_date,
                amount: parseFloat(incomeData.amount),
                detail_description: incomeData.description || '',
                remark: incomeData.remark || '',
                image_ids: incomeData.images || [],
                updated_at: beijingTime.toISOString() // 更新最后修改时间（北京时间）
            };

            const { data: result, error } = await this.supabase
                .from('project_income')
                .insert([data])
                .select();

            if (error) {
                throw error;
            }

            // 同步到本地存储
            if (result && result.length > 0) {
                this._saveOnlineRecordToLocal(result[0], 'project_income');
            }

            return { success: true, data: result };
        } catch (error) {
            console.error('保存项目收入失败:', error);
            // 发生错误时，保存到本地存储（离线模式）
            try {
                await this._saveRecordToLocalStorage(incomeData, 'project_income');
                return { success: true, data: { is_local: true }, message: '已保存到本地存储，将在网络恢复后同步' };
            } catch (localError) {
                console.error('保存到本地存储也失败:', localError);
                return { success: false, error: error.message };
            }
        }
    }

    /**
     * 上传图片到Supabase存储
     * @param {Array} images - 图片文件数组
     * @param {string} projectId - 项目ID
     * @param {string} recordDate - 记录日期
     * @param {boolean} isExpense - 是否为项目支出（用于决定存储路径）
     * @returns {Promise<Array>} 上传后的图片URL数组
     */
    async _uploadImagesToSupabase(images, projectId, recordDate, isExpense = false) {
        const uploadedUrls = [];

        try {
            // 根据是否为项目支出选择不同的存储配置
            let bucketName, folderName, supabaseProjectId;
            
            if (isExpense) {
                // 项目支出使用与结算借支相同的配置
                bucketName = 'FYKQ';
                folderName = `${projectId}/expenditure`; // 使用expenditure路径保持一致性
                supabaseProjectId = 'oydffrzzulsrbitrrhht';
//                console.log('项目支出模式，使用配置:', { bucketName, folderName, supabaseProjectId });
            } else {
                // 项目收入使用新的配置
                bucketName = 'FYKQ';
                folderName = `${projectId}/income`; // 使用income路径保持一致性
                supabaseProjectId = 'oydffrzzulsrbitrrhht';
//                console.log('项目收入模式，使用配置:', { bucketName, folderName, supabaseProjectId });
            }

            for (const image of images) {
                if (!image || typeof image !== 'object') continue;

                let fileName, imageUrl;

                if (isExpense) {
                    // 先压缩图片
                    const processedImage = await this._compressImage(image);
                    
                    // 使用原始图片的文件名，而不是压缩后的文件名
                    // 从image.name中提取文件名，避免路径重复
                    let baseFileName = image.name;
                    // 如果文件名包含路径分隔符，只保留最后一部分
                    if (baseFileName.includes('/')) {
                        baseFileName = baseFileName.split('/').pop();
                    } else if (baseFileName.includes('\\')) {
                        baseFileName = baseFileName.split('\\').pop();
                    }
                    
                    const fileExtension = baseFileName.split('.').pop().toLowerCase();
                    const originalName = baseFileName.substring(0, baseFileName.lastIndexOf('.'));
                    
                    // 仅对包含中文的文件名进行转换，英文文件名保持不变
                    let convertedName = originalName;
                    if (/[\u4e00-\u9fa5]/.test(originalName)) {
                        convertedName = this._convertChineseToEnglish(originalName);
                    }
                    
                    // 直接使用转换后的文件名，不添加时间戳（与结算借支保持一致）
                    const uniqueFileName = convertedName;
                    
                    fileName = `${folderName}/${recordDate}/${uniqueFileName}.${fileExtension}`;
                    
//                    console.log(`上传图片: ${image.name} -> ${fileName}`);

                    // 使用tus-js-client上传（与结算借支保持一致）
                    await this._uploadFileWithTus(supabaseProjectId, bucketName, fileName, processedImage);
                    
                    // 生成图片URL
                    const encodedFileName = encodeURIComponent(fileName);
                    imageUrl = `https://${supabaseProjectId}.supabase.co/storage/v1/object/public/${bucketName}/${encodedFileName}`;
                } else {
                    // 项目收入也使用压缩和中文转拼音
                    const processedImage = await this._compressImage(image);
                    
                    // 处理文件名中的中文
                    // 从image.name中提取文件名，避免路径重复
                    let baseFileName = image.name;
                    // 如果文件名包含路径分隔符，只保留最后一部分
                    if (baseFileName.includes('/')) {
                        baseFileName = baseFileName.split('/').pop();
                    } else if (baseFileName.includes('\\')) {
                        baseFileName = baseFileName.split('\\').pop();
                    }
                    
                    const fileExtension = baseFileName.split('.').pop().toLowerCase();
                    const originalName = baseFileName.substring(0, baseFileName.lastIndexOf('.'));
                    
                    // 仅对包含中文的文件名进行转换，英文文件名保持不变
                    let convertedName = originalName;
                    if (/[\u4e00-\u9fa5]/.test(originalName)) {
                        convertedName = this._convertChineseToEnglish(originalName);
                    }
                    
                    // 直接使用转换后的文件名，不添加时间戳（与项目支出保持一致）
                    const uniqueFileName = convertedName;
                    
                    fileName = `${folderName}/${recordDate}/${uniqueFileName}.${fileExtension}`;

                    // 使用tus-js-client上传（与项目支出保持一致）
                    await this._uploadFileWithTus(supabaseProjectId, bucketName, fileName, processedImage);
                    
                    // 生成图片URL
                    const encodedFileName = encodeURIComponent(fileName);
                    imageUrl = `https://${supabaseProjectId}.supabase.co/storage/v1/object/public/${bucketName}/${encodedFileName}`;
                }

                if (imageUrl) {
                    uploadedUrls.push(imageUrl);
                }
            }

            return uploadedUrls;
        } catch (error) {
            console.error('图片上传过程出错:', error);
            return uploadedUrls;
        }
    }

    /**
     * 保存记录到本地存储（临时方案或离线模式）
     * @param {Object} recordData - 记录数据
     * @param {string} table - 数据库表名
     */
    async _updateRecordInLocalStorage(id, recordData, table) {
        try {
            const now = new Date();
            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
            
            // 根据表名确定记录ID字段名
            const recordIdField = table === 'project_expenses' ? 'expense_id' : 'income_id';
            
            // 获取现有记录
            const localStorageKey = `project_${table}`;
            let existingRecords = [];
            const storedData = localStorage.getItem(localStorageKey);
            if (storedData) {
                existingRecords = JSON.parse(storedData);
            }
            
            // 查找要更新的记录 - 仅使用recordIdField，不使用id
            const recordIndex = existingRecords.findIndex(record => record[recordIdField] === id);
            if (recordIndex === -1) {
                // 如果在本地存储中找不到，可能是在线记录，直接返回成功
                return; // 不抛出错误，允许在线更新
            }
            
            // 转换字段名，确保与在线保存的字段一致
            let convertedData = {};
            if (table === 'project_expenses') {
                convertedData = {
                    project_id: recordData.project_id,
                    record_date: recordData.record_date,
                    payer: recordData.payment,
                    amount: parseFloat(recordData.amount),
                    detail_description: recordData.description || '',
                    remark: recordData.remark || '',
                    image_ids: recordData.images || []
                };
            } else if (table === 'project_income') {
                convertedData = {
                    project_id: recordData.project_id,
                    record_date: recordData.record_date,
                    amount: parseFloat(recordData.amount),
                    detail_description: recordData.description || '',
                    remark: recordData.remark || '',
                    image_ids: recordData.images || []
                };
            }
            
            // 更新记录
            existingRecords[recordIndex] = {
                ...existingRecords[recordIndex],
                ...convertedData,
                updated_at: beijingTime.toISOString()
            };
            
            // 保存到本地存储
            localStorage.setItem(localStorageKey, JSON.stringify(existingRecords));
        } catch (error) {
            console.error('更新本地存储记录失败:', error);
            // 不抛出错误，允许在线更新继续
            console.log('继续进行在线更新');
        }
    }
    
    async _saveRecordToLocalStorage(recordData, table) {
        try {
            // 添加记录ID和时间戳
            // 生成符合UUID格式的记录ID，用于本地存储和同步
            // 格式：local_时间戳_随机字符串，但在同步到Supabase时会被替换为真实UUID
            const recordId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const now = new Date();
            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
            
            // 根据表名确定记录ID字段名
            const recordIdField = table === 'project_expenses' ? 'expense_id' : 'income_id';
            
            // 转换字段名，确保与在线保存的字段一致
            let convertedData = {};
            if (table === 'project_expenses') {
                convertedData = {
                    project_id: recordData.project_id,
                    record_date: recordData.record_date,
                    payer: recordData.payment,
                    amount: parseFloat(recordData.amount),
                    detail_description: recordData.description || '',
                    remark: recordData.remark || '',
                    image_ids: recordData.images || []
                };
            } else if (table === 'project_income') {
                convertedData = {
                    project_id: recordData.project_id,
                    record_date: recordData.record_date,
                    amount: parseFloat(recordData.amount),
                    detail_description: recordData.description || '',
                    remark: recordData.remark || '',
                    image_ids: recordData.images || []
                };
            }
            
            const localRecord = {
                ...convertedData,
                [recordIdField]: recordId,
                created_at: beijingTime.toISOString(),
                updated_at: beijingTime.toISOString(),
                is_local: true // 标记为本地记录
            };

            // 保存到本地存储
            const localStorageKey = `project_${table}`;
            const records = JSON.parse(localStorage.getItem(localStorageKey) || '[]');
            records.push(localRecord);
            localStorage.setItem(localStorageKey, JSON.stringify(records));

            // 添加到同步队列
            if (window.offlineSyncService) {
                const dataType = table === 'project_expenses' ? 'project_expense' : 'project_income';
                window.offlineSyncService.addToSyncQueue('save_record', {
                    record: localRecord,
                    table: table
                }, recordId, dataType);
            }
        } catch (error) {
            console.error('保存记录到本地存储失败:', error);
            throw error;
        }
    }

    /**
     * 保存在线记录到本地存储
     * @param {Object} record - 记录数据
     * @param {string} table - 表名
     */
    _saveOnlineRecordToLocal(record, table) {
        try {
            const localStorageKey = `project_${table}`;
            const records = JSON.parse(localStorage.getItem(localStorageKey) || '[]');
            
            const idField = table === 'project_expenses' ? 'expense_id' : 'income_id';
            const existingIndex = records.findIndex(r => r[idField] === record[idField]);
            
            if (existingIndex !== -1) {
                records[existingIndex] = record;
            } else {
                records.push(record);
            }
            
            localStorage.setItem(localStorageKey, JSON.stringify(records));
        } catch (error) {
            console.error('保存在线记录到本地失败:', error);
        }
    }

    /**
     * 中文转英文的辅助函数 - 使用pinyin-pro库将中文转为拼音（与结算借支保持一致）
     * @param {string} str - 要转换的字符串
     * @returns {string} 转换后的字符串
     */
    _convertChineseToEnglish(str) {
        if (!str) {
            return 'image';
        }
        
        let result = str;
        
        try {
            // 检查pinyin-pro库是否可用
            if (typeof window.pinyinPro !== 'undefined' && typeof window.pinyinPro.pinyin === 'function') {
                // 使用正确的调用方式：pinyinPro.pinyin()
                result = window.pinyinPro.pinyin(result, {
                    tone: false,  // 不带声调
                    type: 'string',  // 返回字符串
                    separator: ''  // 空分隔符，生成连续的拼音
                });
                // 手动移除声调符号（库参数tone:false可能不生效）
                result = result
                    .replace(/[āáǎà]/g, 'a')
                    .replace(/[ōóǒò]/g, 'o')
                    .replace(/[ēéěè]/g, 'e')
                    .replace(/[īíǐì]/g, 'i')
                    .replace(/[ūúǔù]/g, 'u')
                    .replace(/[ǖǘǚǜü]/g, 'v')
                    .replace(/[^a-zA-Z0-9_.-]/g, '_');
            } else {
                // 如果pinyinPro库不可用，使用简单的中文转拼音映射
                const pinyinMap = {
                    '你': 'ni', '好': 'hao',
                    '图': 'tu', '片': 'pian',
                    '考': 'kao', '勤': 'qin',
                    '记': 'ji', '工': 'gong',
                    '一': 'yi', '二': 'er', '三': 'san',
                    '四': 'si', '五': 'wu',
                    '六': 'liu', '七': 'qi',
                    '八': 'ba', '九': 'jiu', '十': 'shi',
                    '多': 'duo', 'QQ': 'QQ', '多多': 'duoduo', 'QQ多多': 'QQduoduo',
                    '截': 'jie', '屏': 'ping', '截图': 'jietu'
                };
                
                // 替换中文汉字为拼音
                let pinyinResult = '';
                for (let char of result) {
                    if (pinyinMap[char]) {
                        pinyinResult += pinyinMap[char] + '_';
                    } else {
                        pinyinResult += char;
                    }
                }
                // 移除末尾的下划线
                result = pinyinResult.replace(/_$/, '');
            }
        } catch (error) {
            console.error('中文转拼音失败:', error);
        }
        
        // 移除连续的下划线
        result = result.replace(/_+/g, '_');
        
        // 移除开头和结尾的下划线
        result = result.replace(/^_|_$/g, '');
        
        // 确保生成的文件名不为空
        if (!result || result.trim() === '') {
            result = 'image';
        }
        
        return result;
    }

    /**
     * 压缩图片文件
     * @param {File} file - 原始图片文件
     * @returns {Promise<File>} 压缩后的图片文件
     */
    async _compressImage(file) {
        return new Promise((resolve) => {
            // 检查文件大小，如果小于500KB，直接返回原文件
            if (file.size < 500 * 1024) {
                resolve(file);
                return;
            }

            // 检查Compressor.js是否可用
            if (typeof window.Compressor === 'undefined') {
                console.warn('Compressor.js未加载，跳过图片压缩');
                resolve(file);
                return;
            }

            new window.Compressor(file, {
                quality: 0.8, // 压缩质量
                maxWidth: 1920, // 最大宽度
                maxHeight: 1080, // 最大高度
                convertSize: 1000000, // 超过1MB的图片转换为jpeg
                success(compressedFile) {
                    console.log(`图片压缩完成: ${file.name} (${(file.size / 1024).toFixed(2)}KB) -> ${compressedFile.name} (${(compressedFile.size / 1024).toFixed(2)}KB)`);
                    resolve(compressedFile);
                },
                error(error) {
                    console.error('图片压缩失败:', error);
                    resolve(file); // 压缩失败时使用原文件
                }
            });
        });
    }

    /**
     * 使用tus-js-client上传文件到Supabase（与结算借支保持一致）
     * @param {string} supabaseProjectId - Supabase项目ID
     * @param {string} bucketName - 存储桶名称
     * @param {string} fileName - 文件名
     * @param {File} file - 文件对象
     */
    async _uploadFileWithTus(supabaseProjectId, bucketName, fileName, file) {
        return new Promise((resolve, reject) => {
            // 获取访问令牌
            // 直接使用匿名访问令牌（与结算借支保持一致）
            const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95ZGZmcnp6dWxzcmJpdHJyaGh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MjcxNDEsImV4cCI6MjA3OTAwMzE0MX0.LFMDgx8eNyE3pVjVYgHqhtvaC--vP4-MtXL8fY3_v-s';

            const upload = new window.tus.Upload(file, {
                endpoint: `https://${supabaseProjectId}.supabase.co/storage/v1/upload/resumable`,
                retryDelays: [0, 3000, 5000, 10000, 20000],
                headers: {
                    authorization: `Bearer ${token}`,
                    'x-upsert': 'true', // 允许覆盖已存在的文件
                },
                metadata: {
                    bucketName: bucketName,
                    objectName: fileName,
                    contentType: file.type || 'image/png',
                    cacheControl: '3600',
                    metadata: JSON.stringify({ // custom metadata passed to user_metadata column
                        yourCustomMetadata: true,
                    }),
                },
                uploadDataDuringCreation: true,
                removeFingerprintOnSuccess: true, // Important if you want to allow re-uploading the same file
                chunkSize: 6 * 1024 * 1024, // 6MB chunks
                onSuccess: () => {
                    resolve();
                },
                onError: (error) => {
                    console.error('Tus上传失败:', error);
                    reject(error);
                },
                onProgress: (bytesUploaded, bytesTotal) => {
                    const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
//                    console.log(`上传进度: ${percentage}%`);
                }
                });

                // 检查是否有之前的上传可以继续
                upload.findPreviousUploads().then(function (previousUploads) {
                    // 如果有之前的上传，选择第一个继续
                    if (previousUploads.length) {
                        upload.resumeFromPreviousUpload(previousUploads[0]);
                    }
                });

                upload.start();
            });
    }

    /**
     * 保存图片到本地存储（离线模式）
     * @param {Array} images - 图片文件数组
     * @param {string} projectId - 项目ID
     * @param {string} recordDate - 记录日期
     * @param {boolean} isExpense - 是否为项目支出
     * @returns {Promise<Array>} 本地图片URL数组
     */
    async _saveImagesToLocal(images, projectId, recordDate, isExpense = false) {
        const imageUrls = [];

        try {
            for (const image of images) {
                if (!image || typeof image !== 'object') continue;

                // 获取文件扩展名
                const fileExtension = image.name.split('.').pop().toLowerCase();
                
                // 获取原始文件名（不含扩展名）
                const originalName = image.name.substring(0, image.name.lastIndexOf('.'));
                
                // 仅对包含中文的文件名进行转换，英文文件名保持不变
                let convertedName = originalName;
                if (/[\u4e00-\u9fa5]/.test(originalName)) {
                    convertedName = this._convertChineseToEnglish(originalName);
                }
                
                // 生成文件名：project_id/expenditure或income/记账日期/转换后的文件名.后缀
                const folderName = isExpense ? `${projectId}/expenditure` : `${projectId}/income`;
                const fileName = `${folderName}/${recordDate}/${convertedName}.${fileExtension}`;

                // 保存图片到本地
                const localImageUrl = await this._saveSingleImageToLocal(image, fileName);
                imageUrls.push(localImageUrl);

                // 添加图片上传任务到同步队列
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('upload_image', {
                        fileName: fileName,
                        localPath: localImageUrl,
                        bucketName: 'FYKQ',
                        projectId: 'oydffrzzulsrbitrrhht'
                    }, `img_${fileName}_${Date.now()}`, 'image');
                }
            }

            return imageUrls;
        } catch (error) {
            console.error('本地图片保存失败:', error);
            return imageUrls;
        }
    }

    /**
     * 保存单个图片到本地
     * @param {File} image - 图片文件
     * @param {string} fileName - 文件名
     * @returns {Promise<string>} 本地图片URL
     */
    async _saveSingleImageToLocal(image, fileName) {
        return new Promise((resolve, reject) => {
            try {
                const reader = new FileReader();
                reader.onload = function(e) {
                    // 生成唯一ID
                    const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                    
                    // 保存图片数据到localStorage
                    const imageData = {
                        id: imageId,
                        fileName: fileName,
                        dataUrl: e.target.result,
                        originalName: image.name,
                        size: image.size,
                        type: image.type,
                        timestamp: new Date().toISOString()
                    };
                    
                    localStorage.setItem(imageId, JSON.stringify(imageData));
                    
                    // 返回本地URL格式
                    const localUrl = `local://${imageId}`;
                    resolve(localUrl);
                };
                reader.onerror = function(error) {
                    reject(error);
                };
                reader.readAsDataURL(image);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 获取当前显示的图片URLs
     * @returns {Array} 图片URL数组
     */
    _getCurrentImageUrls() {
        const imageUrls = [];
        
        // 从全局图片数组获取文件对象，如果没有上传则返回空数组
        if (window.selectedImages && window.selectedImages.length > 0) {
            // 这里返回空数组，因为我们不使用预览图片的URL
            // 而是依赖于上传后的URL或者本地存储的URL
            console.log('检测到未上传的图片，将进行上传处理');
        }
        
        return imageUrls; // 返回空数组，让handleImageUpload处理图片上传
    }

    /**
     * 处理图片上传
     * @param {Array} images - 图片文件数组
     * @param {string} projectId - 项目ID
     * @param {string} recordDate - 记录日期
     * @param {boolean} isExpense - 是否为项目支出
     * @returns {Promise<Array>} 图片URL数组
     */
    async handleImageUpload(images, projectId, recordDate, isExpense = false) {
//        console.log('handleImageUpload 调用:', { images: images?.length, projectId, recordDate, isExpense });
        
        if (!images || images.length === 0) {
//            console.log('没有新图片需要上传');
            // 如果是在编辑模式下且没有新图片，返回原有的图片URL
            if (window.projectFinanceDetail && window.projectFinanceDetail.oldImageList) {
                return [...window.projectFinanceDetail.oldImageList];
            }
            return [];
        }

        // 检查是否在线
        const isOnline = navigator.onLine;
        let uploadedUrls = [];

        try {
            if (isOnline) {
//                console.log('在线模式：上传到Supabase');
                try {
                    // 在线模式：上传到Supabase
                    uploadedUrls = await this._uploadImagesToSupabase(images, projectId, recordDate, isExpense);
                } catch (supabaseError) {
                    console.warn('Supabase上传失败，回退到本地保存:', supabaseError);
                    // 上传失败时回退到本地保存
                    uploadedUrls = await this._saveImagesToLocal(images, projectId, recordDate, isExpense);
                }
            } else {
//                console.log('离线模式：保存到本地');
                // 离线模式：保存到本地
                uploadedUrls = await this._saveImagesToLocal(images, projectId, recordDate, isExpense);
            }
        } catch (error) {
            console.error('图片处理失败:', error);
            // 即使保存到本地也失败，返回空数组，确保记录能保存
            uploadedUrls = [];
        }

//        console.log('图片上传结果:', uploadedUrls);
        return uploadedUrls;
    }
    
    /**
     * 删除项目支出记录
     * @param {string} id - 支出记录ID
     * @returns {Promise<Object>} 删除结果
     */
    async deleteProjectExpense(id) {
        try {
            // 检查网络状态
            const isOnline = navigator.onLine;
            
            // 在线模式：从Supabase删除记录
            if (isOnline) {
                const { error } = await this.supabase
                    .from('project_expenses')
                    .delete()
                    .eq('expense_id', id);
                
                if (error) {
                    throw error;
                }
            } else {
                // 离线模式：添加删除任务到同步队列
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('delete', {
                        table: 'project_expenses',
                        expense_id: id
                    }, id, 'project_expense');
                }
            }
            
            // 删除本地存储中的记录
            await this._deleteRecordFromLocalStorage(id, 'project_expenses');
            
            return { success: true };
        } catch (error) {
            console.error('删除项目支出记录失败:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 删除项目收入记录
     * @param {string} id - 收入记录ID
     * @returns {Promise<Object>} 删除结果
     */
    async deleteProjectIncome(id) {
        try {
            // 检查网络状态
            const isOnline = navigator.onLine;
            
            // 在线模式：从Supabase删除记录
            if (isOnline) {
                const { error } = await this.supabase
                    .from('project_income')
                    .delete()
                    .eq('income_id', id);
                
                if (error) {
                    throw error;
                }
            } else {
                // 离线模式：添加删除任务到同步队列
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('delete', {
                        table: 'project_income',
                        income_id: id
                    }, id, 'project_income');
                }
            }
            
            // 删除本地存储中的记录
            await this._deleteRecordFromLocalStorage(id, 'project_income');
            
            return { success: true };
        } catch (error) {
            console.error('删除项目收入记录失败:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 从本地存储中删除记录
     * @param {string} id - 记录ID
     * @param {string} table - 表名
     * @returns {Promise<void>}
     */
    async _deleteRecordFromLocalStorage(id, table) {
        try {
            // 定义需要检查和删除的所有可能的本地存储键
            const localStorageKeys = [
                `project_${table}`,  // 带前缀的格式
                table                 // 不带前缀的格式（明细表使用）
            ];
            
            // 遍历所有可能的本地存储键，删除匹配的记录
            for (const localStorageKey of localStorageKeys) {
                const storedData = localStorage.getItem(localStorageKey);
                if (storedData) {
                    const records = JSON.parse(storedData);
                    const updatedRecords = records.filter(record => {
                        const recordId = table === 'project_expenses' ? record.expense_id : record.income_id;
                        return recordId !== id;
                    });
                    localStorage.setItem(localStorageKey, JSON.stringify(updatedRecords));
                }
            }
        } catch (error) {
            console.error('从本地存储删除记录失败:', error);
        }
    }
}

// 确保在Supabase完全初始化后再初始化API
async function initFinanceAPI() {
    try {
        // 等待Supabase初始化完成
        await window.waitForSupabase();
        // 初始化ProjectFinanceAPI
        window.projectFinanceAPI = new ProjectFinanceAPI();
    } catch (error) {
        console.error('初始化ProjectFinanceAPI失败:', error);
    }
}

// 页面加载完成后初始化API
document.addEventListener('DOMContentLoaded', initFinanceAPI);

/**
 * 保存项目记账记录的主函数
 */
async function saveProjectFinance() {
    try {
        if (!window.projectFinanceAPI) {
            showNotification('API正在初始化，请稍候重试', true);
            return;
        }

        const confirmBtn = document.getElementById('confirmAccountBtn');
        const isEditMode = confirmBtn && confirmBtn.dataset.editMode === 'true';

        const isExpense = document.getElementById('projectExpense').checked;
        const isIncome = document.getElementById('projectIncome').checked;

        const projectId = localStorage.getItem('currentProjectId');
        if (!projectId) {
            showNotification('未找到项目ID，请先选择项目', true);
            return;
        }

        if (isExpense) {
            if (isEditMode) {
                if (!checkPermission('perm_edit_expense')) {
                    showNotification('你无修改项目支出权限！', true);
                    return;
                }
            } else {
                if (!checkPermission('perm_add_expense')) {
                    showNotification('你无记项目支出权限！', true);
                    return;
                }
            }
        } else if (isIncome) {
            if (isEditMode) {
                if (!checkPermission('perm_edit_income')) {
                    showNotification('你无修改项目收入权限！', true);
                    return;
                }
            } else {
                if (!checkPermission('perm_add_income')) {
                    showNotification('你无记项目收入权限！', true);
                    return;
                }
            }
        } else {
            showNotification('请选择记账类型', true);
            return;
        }

        const recordDate = document.getElementById('workDate').value;
        const amount = document.getElementById('amountInput').value;
        const description = document.getElementById('description').value;
        const remark = document.getElementById('remark').value;

        // 根据记账类型检查必填字段
        if (isExpense) {
            // 项目支出验证：记账日期、付款人、金额为必填项
            const payment = document.getElementById('paymentInput').value;
            if (!recordDate) {
                showNotification('请选择记账日期', true);
                return;
            }
            if (!payment) {
                showNotification('请输入付款人', true);
                return;
            }
            if (!amount) {
                showNotification('请输入金额', true);
                return;
            }
        } else if (isIncome) {
            // 项目收入验证：记账日期、金额为必填项
            if (!recordDate) {
                showNotification('请选择记账日期', true);
                return;
            }
            if (!amount) {
                showNotification('请输入金额', true);
                return;
            }
        } else {
            showNotification('请选择记账类型', true);
            return;
        }

        // 获取图片数据
        let images = [];
        // 从全局图片数组获取图片，而不是从input文件获取
        if (window.selectedImages && window.selectedImages.length > 0) {
            images = window.selectedImages;
        }

        // 获取API实例
        const financeAPI = window.projectFinanceAPI;

        // 在线模式下，先显示"保存中..."或"修改中..."提示
        const isOnline = navigator.onLine;
        if (isOnline) {
            if (isEditMode) {
                showNotification('修改中...', false);
            } else {
                showNotification('保存中...', false);
            }
        }

        // 处理图片上传
        let uploadedImages = [];
        let oldImages = [];
        
        // 如果是编辑模式，获取旧图片URL
        if (isEditMode && window.projectFinanceDetail && window.projectFinanceDetail.oldImageList) {
            oldImages = [...window.projectFinanceDetail.oldImageList];
        }
        
        // 检查是否真的有新图片上传，避免重复处理
        let hasRealNewImages = false;
        let realNewImages = [];
        if (images && images.length > 0) {
            // 过滤出真正的新图片（File或Blob对象，且不是从旧图片URL下载的）
            realNewImages = images.filter(img => {
                // 检查是否是真正的File或Blob对象
                if (!(img instanceof File || img instanceof Blob)) {
                    return false;
                }
                
                // 如果是编辑模式，检查图片是否是从旧图片URL下载的
                if (isEditMode && oldImages.length > 0) {
                    // 检查是否是通过选择文件上传的新图片
                    // 如果是从系统创建的图片，它的name应该与旧图片URL中的文件名匹配
                    // 从旧图片URL中提取所有文件名
                    const oldFileNames = oldImages.map(oldUrl => {
                        const urlParts = oldUrl.split('/');
                        const encodedFileName = urlParts[urlParts.length - 1];
                        const decodedFileName = decodeURIComponent(encodedFileName);
                        return decodedFileName;
                    });
                    
                    // 检查当前图片的name是否在旧文件名列表中
                    // 如果在，说明是系统创建的图片，不是真正的新图片
                    const isSystemCreated = oldFileNames.some(oldFileName => {
                        // 检查旧文件名是否包含当前图片的name（不区分大小写）
                        return oldFileName.toLowerCase().includes(img.name.toLowerCase());
                    });
                    
                    if (isSystemCreated) {
                        // 系统创建的图片，不视为新图片
                        return false;
                    }
                }
                
                // 否则视为新图片
                return true;
            });
            hasRealNewImages = realNewImages.length > 0;
        }
        
        // 获取当前预览图片数量
        const imageContainer = document.getElementById('imageUploadContainer');
        const imagePreviews = imageContainer ? imageContainer.querySelectorAll('.image-preview-item') : [];
        
        // 处理图片上传，只上传真正的新图片
        let newImageUrls = [];
        if (realNewImages.length > 0) {
            if (isOnline) {
                // 在线模式：上传图片到Supabase存储
                newImageUrls = await financeAPI._uploadImagesToSupabase(realNewImages, projectId, recordDate, isExpense);
            } else {
                // 离线模式：保存图片到本地并生成本地URL
                newImageUrls = await financeAPI._saveImagesToLocal(realNewImages, projectId, recordDate, isExpense);
            }
        } else if (isEditMode && images.length > 0) {
            // 编辑模式下，即使没有真正的新图片，也为所有图片添加上传任务
            // 这样可以确保图片被重新上传到云端
            if (isOnline) {
                // 在线模式：上传图片到Supabase存储
                newImageUrls = await financeAPI._uploadImagesToSupabase(images, projectId, recordDate, isExpense);
            } else {
                // 离线模式：保存图片到本地并生成本地URL
                newImageUrls = await financeAPI._saveImagesToLocal(images, projectId, recordDate, isExpense);
            }
        }
        
        // 合并图片URL，根据是否有真正的新图片或图片数量变化决定策略
        let allImageUrls = [];
        
        if (hasRealNewImages || (isEditMode && images.length > 0 && newImageUrls.length > 0)) {
            // 有真正的新图片上传，或者在编辑模式下为所有图片添加上传任务
            // 保留新上传的图片URL
            allImageUrls = newImageUrls.filter(url => url && typeof url === 'string');
        } else if (imagePreviews.length !== oldImages.length) {
            // 图片数量发生变化，说明用户删除了图片
            // 对于删除图片的情况，我们需要重新构建URL数组
            // 由于图片被删除，我们不能再使用旧的URL数组
            // 我们需要根据当前选中的图片，生成对应的URL数组
            // 这里我们使用当前选中的图片数量作为新的URL数组长度
            // 具体的URL会在后续的逻辑中处理
            allImageUrls = [];
        } else {
            // 没有真正的新图片上传，直接使用旧图片URL
            // 这样可以确保uploadedImages和oldImageList完全相同
            allImageUrls = [...oldImages];
        }
        
        // 清空window.selectedImages数组，避免重复上传
        if (window.selectedImages) {
            window.selectedImages = [];
        }
        
        uploadedImages = allImageUrls;

        let result;

        if (isExpense) {
            // 保存项目支出
            const payment = document.getElementById('paymentInput').value;

            const expenseData = {
                project_id: projectId,
                record_date: recordDate,
                payment: payment,
                amount: amount,
                description: description,
                remark: remark,
                images: uploadedImages
            };
            
            // 保存项目支出
            if (isEditMode && window.projectFinanceDetail && window.projectFinanceDetail.editingRecordId) {
                // 编辑模式：更新现有记录
                result = await financeAPI.updateProjectExpense(window.projectFinanceDetail.editingRecordId, expenseData);
            } else {
                // 新建模式：创建新记录
                result = await financeAPI.saveProjectExpense(expenseData);
            }
        } else if (isIncome) {
            // 保存项目收入
            const incomeData = {
                project_id: projectId,
                record_date: recordDate,
                amount: amount,
                description: description,
                remark: remark,
                images: uploadedImages
            };
            
            // 根据是否是编辑模式调用不同的方法
            if (isEditMode && window.projectFinanceDetail && window.projectFinanceDetail.editingRecordId) {
                // 编辑模式：更新现有记录
                result = await financeAPI.updateProjectIncome(window.projectFinanceDetail.editingRecordId, incomeData);
            } else {
                // 新建模式：创建新记录
                result = await financeAPI.saveProjectIncome(incomeData);
            }
        } else {
            showNotification('请选择记账类型', true);
            return;
        }

        // 处理保存结果
        if (result.success) {
            // 编辑模式下检查图片变更
            if (isEditMode && window.projectFinanceDetail && window.projectFinanceDetail.oldImageList) {
                // 检查预览图片数量
                const imageContainer = document.getElementById('imageUploadContainer');
                const imagePreviews = imageContainer ? imageContainer.querySelectorAll('.image-preview-item') : [];
                
                // 检查是否真的有图片变更
                // 1. hasRealNewImages 在前面已经定义过，表示是否有真正的新图片上传
                // 2. 检查预览图片数量是否与旧图片数量不同
                // 3. 检查uploadedImages与oldImageList是否完全相同
                const isImageChanged = hasRealNewImages || imagePreviews.length !== window.projectFinanceDetail.oldImageList.length;
                
                // 额外检查：当没有真正的新图片时，uploadedImages应该与oldImageList完全相同
                // 如果完全相同，即使isImageChanged为true，也不需要处理图片删除
                let isActuallyChanged = isImageChanged;
                if (!hasRealNewImages && imagePreviews.length === window.projectFinanceDetail.oldImageList.length) {
                    // 检查两个数组的内容是否完全相同
                    const isSameImages = uploadedImages.length === window.projectFinanceDetail.oldImageList.length &&
                        uploadedImages.every((img, index) => img === window.projectFinanceDetail.oldImageList[index]);
                    
                    if (isSameImages) {
                        isActuallyChanged = false;
                    }
                } else if (imagePreviews.length < window.projectFinanceDetail.oldImageList.length) {
                    // 预览图片数量减少，说明用户删除了图片，需要处理图片删除
                    isActuallyChanged = true;
                }
                
                // 只有在图片真的变更时，才检查被移除的图片
                if (isActuallyChanged) {
                    // 比较旧图片列表和新图片列表，找出被移除的图片
                    const removedImages = window.projectFinanceDetail.oldImageList.filter(oldImg => 
                        !uploadedImages.some(newImg => newImg === oldImg)
                    );
                    
                    // 如果有图片被移除，处理被移除的图片
                    if (removedImages.length > 0 && typeof window.projectFinanceDetail.deleteRecordImages === 'function') {
                        try {
                            // 调用现有的deleteRecordImages方法处理被移除的图片
                            await window.projectFinanceDetail.deleteRecordImages(removedImages);
                        } catch (error) {
                            console.error('处理被移除的图片失败:', error);
                            // 不影响主流程，只记录日志
                        }
                    }
                } else {
                    // 图片没有变更，直接跳过图片删除处理
                    console.log('图片没有变更，跳过图片删除处理');
                }
            }

            if (result.data && result.data.is_local) {
                showNotification('已保存到本地存储，将在网络恢复后同步', false);
                playSuccessSound(isIncome);
            } else {
                if (isEditMode) {
                    showNotification('修改成功', false);
                } else {
                    showNotification('保存成功', false);
                }
                playSuccessSound(isIncome);
            }
            // 重置表单
            resetForm();
        } else {
            showNotification('保存失败: ' + (result.error || '未知错误'), true);
        }
    } catch (error) {
        console.error('保存项目记账记录失败:', error);
        showNotification('保存失败，请重试', true);
    }
}

/**
 * 重置表单
 */
function resetForm() {
    // 重置输入字段
    document.getElementById('workDate').value = '';
    document.getElementById('paymentInput').value = '';
    document.getElementById('amountInput').value = '';
    document.getElementById('description').value = '';
    document.getElementById('remark').value = '';
    
    // 重置图片上传
    const imageUpload = document.getElementById('imageUpload');
    if (imageUpload) {
        imageUpload.value = '';
    }
    
    // 重置图片预览
    const imageUploadContainer = document.getElementById('imageUploadContainer');
    if (imageUploadContainer) {
        imageUploadContainer.innerHTML = '';
    }
    
    // 重置编辑模式
    const confirmBtn = document.getElementById('confirmAccountBtn');
    if (confirmBtn) {
        confirmBtn.textContent = '保存';
        delete confirmBtn.dataset.editMode;
    }
    
    // 清除编辑的记录ID和旧图片列表
    if (window.projectFinanceDetail) {
        window.projectFinanceDetail.editingRecordId = null;
        // 清除旧图片列表
        window.projectFinanceDetail.oldImageList = null;
        // 恢复页面标题为"项目记账"
        window.projectFinanceDetail.updatePageTitle('项目记账');
    }
    
    // 重置记账类型选择
    const projectExpense = document.getElementById('projectExpense');
    const projectIncome = document.getElementById('projectIncome');
    if (projectExpense && projectIncome) {
        projectExpense.checked = false;
        projectIncome.checked = false;
    }
}

// 确保函数在全局作用域可用
window.saveProjectFinance = saveProjectFinance;
window.resetForm = resetForm;

/**
 * 显示通知（与结算借支保持一致）
 * @param {string} message - 通知消息
 * @param {boolean} isError - 是否为错误消息
 */
function showNotification(message, isError = false) {
    // 移除所有已存在的通知
    const existingNotifications = document.querySelectorAll('div[style*="position: fixed"][style*="top: 50%"][style*="left: 50%"]');
    existingNotifications.forEach(notification => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    });

    // 创建通知容器
    const notification = document.createElement('div');
    notification.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                padding: 15px 20px;
                border-radius: 8px;
                color: white;
                font-size: 14px;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 9999;
                max-width: 300px;
                word-wrap: break-word;
                animation: fadeIn 0.3s ease-out;
            `;

    // 设置背景颜色
    notification.style.backgroundColor = isError ? '#ff4d4f' : '#52c41a';

    // 设置消息内容
    notification.textContent = message;

    // 添加动画
            const style = document.createElement('style');
            style.textContent = `
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translate(-50%, -50%) scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: translate(-50%, -50%) scale(1);
                    }
                }
            `;
            document.head.appendChild(style);

    // 添加到页面
    document.body.appendChild(notification);

    // 3秒后自动移除
            setTimeout(() => {
                notification.style.animation = 'fadeIn 0.3s ease-in reverse';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }, 3000);
}

/**
 * 播放成功提示音
 * @param {boolean} isIncome - 是否为项目收入，true为收入，false为支出
 */
function playSuccessSound(isIncome = false) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        function playTone(frequency, startTime, duration, type = 'sine') {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = frequency;
            oscillator.type = type;

            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        }

        const now = audioContext.currentTime;

        if (isIncome) {
            // 项目收入：三个音调（C大调三和弦）
            playTone(523.25, now, 0.15);
            playTone(659.25, now + 0.15, 0.15);
            playTone(783.99, now + 0.3, 0.25);
            console.log('项目收入提示音已播放（三音调）');
        } else {
            // 项目支出：两个音调
            playTone(523.25, now, 0.15);
            playTone(750, now + 0.15, 0.3);
            console.log('项目支出提示音已播放（两音调）');
        }
    } catch (e) {
        console.log('音频播放失败:', e);
    }
}

// 确保showNotification在全局作用域可用
window.showNotification = showNotification;
