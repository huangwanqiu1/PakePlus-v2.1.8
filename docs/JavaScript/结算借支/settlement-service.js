// 结算借支服务类
class SettlementService {
    constructor() {
        this.supabase = null;
        this.initSupabase();
    }

    // 初始化Supabase客户端
    initSupabase() {
        try {
            // 尝试使用全局supabase客户端，如果可用
            if (typeof window.supabase !== 'undefined') {
                this.supabase = window.supabase;
            } else {
                // 全局客户端不可用时，尝试直接初始化
                
                // 使用与supabase-client.js相同的配置
                const supabaseUrl = 'https://oydffrzzulsrbitrrhht.supabase.co';
                const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95ZGZmcnp6dWxzcmJpdHJyaGh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MjcxNDEsImV4cCI6MjA3OTAwMzE0MX0.LFMDgx8eNyE3pVjVYgHqhtvaC--vP4-MtXL8fY3_v-s';
                
                // 检查supabase是否可用
                if (typeof supabase !== 'undefined') {
                    this.supabase = supabase.createClient(supabaseUrl, supabaseKey, {
                        auth: {
                            persistSession: false
                        }
                    });
                }
            }
        } catch (error) {
            console.error('SettlementService: 初始化Supabase客户端失败:', error);
        }
    }

    /**
     * 检查权限
     * @param {string} permissionName - 权限字段名
     * @returns {boolean} 是否有权限
     */
    checkPermission(permissionName) {
        try {
            // 获取当前登录用户ID
            const currentUserStr = localStorage.getItem('currentUser');
            if (!currentUserStr) return false;
            
            const currentUser = JSON.parse(currentUserStr);
            const userId = currentUser.user_id;
            if (!userId) return false;
            
            // 获取当前项目ID
            const projectId = localStorage.getItem('currentProjectId');
            if (!projectId) return false;
            
            // 检查是否是项目所有者
            const projectsCache = localStorage.getItem(`project_cache_${userId}`);
            if (projectsCache) {
                const projects = JSON.parse(projectsCache);
                const project = projects.find(p => p.project_id === projectId);
                if (project && project.user_id === userId) {
                    return true; // 拥有者有所有权限
                }
            }

            // 获取用户项目权限列表
            const userProjectsStr = localStorage.getItem(`user_projects_${userId}`);
            if (!userProjectsStr) {
                return false; // 既无权限记录也不是拥有者
            }
            
            const userProjects = JSON.parse(userProjectsStr);
            const permissionRecord = userProjects.find(p => p.project_id === projectId);
            
            if (!permissionRecord) {
                return false; // 没有找到该项目的权限记录
            }
            
            // 检查具体权限
            return permissionRecord[permissionName] === true;
        } catch (error) {
            console.error('权限检查出错:', error);
            return false; // 出错时默认无权限
        }
    }

    // 确认记账功能
    async confirmAccounting() {
        try {
            // 权限检查
            if (!this.checkPermission('perm_add_settlement')) {
                this.showNotification('你无记结算借支权限！', true);
                return;
            }

            // 1. 获取选中的员工
            const selectedItems = document.querySelectorAll('.employee-item.selected');
            if (selectedItems.length === 0) {
                this.showNotification('请先选择员工！', true);
                return;
            }

            // 2. 获取金额输入值
            const amount = document.getElementById('amountInput').value;
            if (!amount || parseFloat(amount) <= 0) {
                this.showNotification('请输入有效的金额！', true);
                return;
            }

            // 3. 获取其他表单数据
            const recordType = this.getCurrentWorkType();
            const projectId = this.getCurrentProjectId();
            const recordDates = this.getSelectedDates();
            const payer = document.getElementById('paymentInput').value;
            const remark = document.getElementById('remark').value;
            const images = window.selectedImages || [];

            // 4. 验证必填字段
            if (!projectId) {
                this.showNotification('请先选择项目！', true);
                return;
            }

            if (recordDates.length === 0) {
                this.showNotification('请选择记账日期！', true);
                return;
            }

            // 5. 对于借支和结算类型，验证付款人必填
            if ((recordType === '借支' || recordType === '结算') && !payer.trim()) {
                this.showNotification('请输入付款人！', true);
                return;
            }

            // 6. 检查网络状态
            const isOnline = navigator.onLine;
            
            // 7. 显示"数据保存中"提示
            this.showNotification('数据保存中...', false);

            // 8. 处理图片上传（如果有图片）
            let imageUrls = [];
            if (images.length > 0 && recordDates.length > 0) {
                // 使用第一个日期作为记账日期
                const accountingDate = recordDates[0];
                if (isOnline) {
                    // 在线模式：上传图片到Supabase存储
                    imageUrls = await this._uploadImagesToSupabase(images, projectId, accountingDate);
                } else {
                    // 离线模式：保存图片到本地并生成本地URL
                    imageUrls = await this._saveImagesToLocal(images, projectId, accountingDate);
                }
            }

            // 9. 遍历选中的员工和日期，创建记录
            for (const employeeItem of selectedItems) {
                // 使用正确的data-employee-id属性获取员工ID
                const employeeId = employeeItem.dataset.employeeId;
                
                // 验证employeeId是否存在
                if (!employeeId) {
                    console.error('未找到员工ID:', employeeItem);
                    continue;
                }
                
                for (const recordDate of recordDates) {
                    // 10. 构建记录数据
                    const recordData = {
                        record_type: recordType,
                        project_id: projectId,
                        record_date: recordDate,
                        employee_id: employeeId,
                        amount: parseFloat(amount),
                        payer: payer || null,
                        remark: remark || null,
                        image_ids: imageUrls,
                        audit_status: '未审核'
                    };

                    // 11. 写入数据库
                    if (isOnline) {
                        // 在线模式：写入Supabase
                        await this._saveRecordToSupabase(recordData);
                    } else {
                        // 离线模式：保存到本地存储
                        await this._saveRecordToLocalStorage(recordData);
                    }
                }
            }

            // 12. 显示成功通知
            this.showNotification(isOnline ? '记账成功！' : '记账成功！记录将在联网后同步', false);

            // 13. 重置表单
            this.resetForm();
            
            // 14. 刷新已记标记，确保立即显示当前记账员工的已记标记
            if (window.accountingFlowService) {
                // 清除缓存，确保能获取到最新数据
                window.accountingFlowService._markedEmployeesCache = null;
                window.accountingFlowService._accountingRecordsCache = null;
                window.accountingFlowService.refreshMarkedEmployees();
            }

        } catch (error) {
            console.error('记账失败:', error);
            this.showNotification('记账失败，请重试！', true);
        }
    }

    // 获取当前工作类型
    getCurrentWorkType() {
        const checkedRadio = document.querySelector('input[name="workType"]:checked');
        if (!checkedRadio) return '借支'; // 默认借支

        const workTypeMap = {
            'pointWork': '借支',
            'contractWork': '扣款',
            'quantityWork': '公司转账',
            'settleWork': '结算'
        };

        return workTypeMap[checkedRadio.id] || '借支';
    }

    // 获取当前项目ID
    getCurrentProjectId() {
        // 从localStorage获取项目ID，因为HTML代码已经将URL中的project_id保存到了localStorage
        const projectId = localStorage.getItem('currentProjectId');
        return projectId || '';
    }

    // 获取选中的日期
    getSelectedDates() {
        const workDateInput = document.getElementById('workDate');
        if (!workDateInput) return [new Date().toISOString().split('T')[0]];

        // 检查是否是多选模式
        if (workDateInput.dataset.displayValue) {
            // 这里需要解析多选日期，具体实现取决于日期选择器的实现
            // 示例：假设多选日期存储在某个全局状态中
            // return window.datePickerState.confirmedDates;
            return [workDateInput.value]; // 临时处理
        } else {
            // 单选日期
            return [workDateInput.value];
        }
    }

    // 上传图片到Supabase存储
    async _uploadImagesToSupabase(images, projectId, recordDate) {
        const imageUrls = [];
        const bucketName = 'FYKQ';
        // 在settlement前面加入当前项目ID
        const folderName = `${projectId}/settlement`;
        // 使用传入的recordDate作为记账日期
        
        // 获取Supabase项目ID
        const supabaseProjectId = 'oydffrzzulsrbitrrhht';
        
        // 获取会话信息
        const { data: { session } } = await this.supabase.auth.getSession();

        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            let fileName = ''; // 在try块外部定义fileName
            
            try {
                // 获取文件扩展名
                const fileExtension = image.name.split('.').pop().toLowerCase();
                
                // 获取原始文件名（不含扩展名）
                const originalName = image.name.substring(0, image.name.lastIndexOf('.'));
                
                // 生成文件名：project_id/settlement/记账日期/原始文件名.后缀
                fileName = `${folderName}/${recordDate}/${originalName}.${fileExtension}`;
                
                // 使用tus-js-client上传图片（与记工.html保持一致）
                await this._uploadFileWithTus(supabaseProjectId, session?.access_token, bucketName, fileName, image);
                
                // 生成图片URL
                const encodedFileName = encodeURIComponent(fileName);
                const imageUrl = `https://${supabaseProjectId}.supabase.co/storage/v1/object/public/${bucketName}/${encodedFileName}`;
                imageUrls.push(imageUrl);
            } catch (error) {
                console.error('上传图片到Supabase失败:', error);
                // 上传失败，将图片保存到本地并添加到同步队列
                try {
                    const localImageUrl = await this._saveSingleImageToLocal(image, fileName);
                    imageUrls.push(localImageUrl);
                    
                    // 添加图片上传任务到同步队列
                    if (window.offlineSyncService) {
                        window.offlineSyncService.addToSyncQueue('upload_image', {
                            fileName: fileName,
                            localPath: localImageUrl,
                            bucketName: bucketName,
                            projectId: supabaseProjectId
                        }, `img_${fileName}_${Date.now()}`, 'image');
                    }
                } catch (localSaveError) {
                    console.error('保存图片到本地也失败:', localSaveError);
                    // 即使保存失败，也要继续处理其他图片
                }
            }
        }

        return imageUrls;
    }

    // 保存图片到本地存储（离线模式）
    async _saveImagesToLocal(images, projectId, recordDate) {
        const imageUrls = [];
        // 在settlement前面加入当前项目ID，与在线模式保持一致
        const folderName = `${projectId}/settlement`;
        // 使用传入的recordDate作为记账日期

        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            let fileName = ''; // 在try块外部定义fileName
            
            try {
                // 获取文件扩展名
                const fileExtension = image.name.split('.').pop().toLowerCase();
                
                // 获取原始文件名（不含扩展名）
                const originalName = image.name.substring(0, image.name.lastIndexOf('.'));
                
                // 生成文件名：project_id/settlement/记账日期/原始文件名.后缀，与在线模式保持一致
                fileName = `${folderName}/${recordDate}/${originalName}.${fileExtension}`;

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
                    }, `img_${fileName}_${Date.now()}_${i}`, 'image');
                }
            } catch (error) {
                console.error('保存图片到本地失败:', error);
                // 保存失败时，继续处理其他图片
            }
        }

        return imageUrls;
    }

    // 保存单个图片到本地
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

    // 保存记录到Supabase
    async _saveRecordToSupabase(recordData) {
        try {
            if (!this.supabase) {
                console.error('_saveRecordToSupabase: Supabase客户端未初始化');
                // 如果Supabase客户端未初始化，保存到本地
                await this._saveRecordToLocalStorage(recordData);
                return;
            }

            // 保存记录到Supabase
            const { data, error } = await this.supabase
                .from('settlement_records')
                .insert(recordData);

            if (error) {
                console.error('保存记录到Supabase失败:', error);
                // 保存失败时，保存到本地
                await this._saveRecordToLocalStorage(recordData);
                return;
            }

            return data;
        } catch (error) {
            console.error('_saveRecordToSupabase: 未知错误:', error);
            // 发生未知错误时，保存到本地
            await this._saveRecordToLocalStorage(recordData);
        }
    }

    // 保存记录到本地存储（临时方案或离线模式）
    async _saveRecordToLocalStorage(recordData) {
        try {
            // 添加记录ID和时间戳
            // 生成符合UUID格式的记录ID，用于本地存储和同步
            // 格式：local_时间戳_随机字符串，但在同步到Supabase时会被替换为真实UUID
            const recordId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const now = new Date();
            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
            
            const localRecord = {
                ...recordData,
                settlement_id: recordId,
                created_at: beijingTime.toISOString(),
                updated_at: beijingTime.toISOString(),
                is_local: true // 标记为本地记录
            };

            // 保存到本地存储
            const records = JSON.parse(localStorage.getItem('settlementRecords') || '[]');
            records.push(localRecord);
            localStorage.setItem('settlementRecords', JSON.stringify(records));

            // 添加到同步队列
            if (window.offlineSyncService) {
                window.offlineSyncService.addToSyncQueue('save_record', {
                    record: localRecord,
                    table: 'settlement_records'
                }, recordId, 'record');
            }
        } catch (error) {
            console.error('保存记录到本地存储失败:', error);
            throw error;
        }
    }

    // 重置表单
    resetForm() {
        // 重置员工选择
        document.querySelectorAll('.employee-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // 重置输入框
        document.getElementById('amountInput').value = '';
        document.getElementById('paymentInput').value = '';
        document.getElementById('remark').value = '';
        
        // 重置图片选择器
        clearImage();
    }

    // 显示通知
    showNotification(message, isError = false) {
        // 使用现有的showNotification函数
        if (typeof showNotification === 'function') {
            showNotification(message, isError);
        } else {
            // 简单的通知实现
            alert(message);
        }
    }
    
    // 使用tus-js-client上传单个文件
    async _uploadFileWithTus(projectId, accessToken, bucketName, fileName, file) {
        let uploadFile = file;
        
        // 检查文件类型，如果是base64字符串，转换为Blob对象
        if (typeof file === 'string' && file.startsWith('data:image/')) {
            try {
                // 转换base64字符串为Blob
                const response = await fetch(file);
                uploadFile = await response.blob();
            } catch (error) {
                console.error('转换base64图片失败:', error);
                throw new Error('Failed to convert base64 string to Blob');
            }
        } else if (!(file instanceof File || file instanceof Blob)) {
            throw new Error('source object may only be an instance of File, Blob, or Reader in this environment');
        }
        
        return new Promise((resolve, reject) => {
            // 检查tus是否可用
            if (typeof window.tus === 'undefined') {
                console.error('tus-js-client未加载');
                reject(new Error('tus-js-client未加载'));
                return;
            }
            
            // 检查tus.isSupported
            if (!window.tus.isSupported) {
                console.error('当前环境不支持tus-js-client');
                reject(new Error('当前环境不支持tus-js-client'));
                return;
            }
            
            // 创建tus上传实例
                const upload = new window.tus.Upload(uploadFile, {
                    // Supabase TUS endpoint (正确的URL格式，不带.storage子域名)
                    endpoint: `https://${projectId}.supabase.co/storage/v1/upload/resumable`,
                    retryDelays: [0, 3000, 5000, 10000, 20000],
                    headers: {
                        // 使用正确的API密钥进行认证
                        authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95ZGZmcnp6dWxzcmJpdHJyaGh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MjcxNDEsImV4cCI6MjA3OTAwMzE0MX0.LFMDgx8eNyE3pVjVYgHqhtvaC--vP4-MtXL8fY3_v-s`,
                        'x-upsert': 'true', // 允许覆盖已存在的文件，解决编辑模式下的409 Conflict错误
                    },
                uploadDataDuringCreation: true,
                removeFingerprintOnSuccess: true, // Important if you want to allow re-uploading the same file
                metadata: {
                    bucketName: bucketName,
                    objectName: fileName,
                    contentType: file.type || 'image/png',
                    cacheControl: '3600',
                    metadata: JSON.stringify({ // custom metadata passed to the user_metadata column
                        yourCustomMetadata: true,
                    }),
                },
                chunkSize: 6 * 1024 * 1024, // NOTE: it must be set to 6MB (for now) do not change it
                onError: function (error) {
                    console.error('Failed because: ' + error);
                    reject(error);
                },
                onProgress: function (bytesUploaded, bytesTotal) {
                    const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
                },
                onSuccess: function () {
                    resolve(upload.url);
                },
            });
            
            // 检查是否有之前的上传可以继续
            upload.findPreviousUploads().then(function (previousUploads) {
                // 如果有之前的上传，选择第一个继续
                if (previousUploads.length) {
                    upload.resumeFromPreviousUpload(previousUploads[0]);
                }
                
                // 开始上传
                upload.start();
            }).catch(function (error) {
                console.error('查找之前的上传失败:', error);
                // 直接开始新的上传
                upload.start();
            });
        });
    }

    // 更新记录功能
    async updateAccounting() {
        try {
            // 权限检查
            if (!this.checkPermission('perm_edit_settlement')) {
                this.showNotification('你无修改结算借支权限！', true);
                return;
            }

            // 优先从全局变量获取settlement_id，如果没有则从URL参数获取
            let settlementId = window.currentSettlementId;
            if (!settlementId) {
                const urlParams = new URLSearchParams(window.location.search);
                settlementId = urlParams.get('settlement_id');
            }
            
            if (!settlementId) {
                this.showNotification('未找到记录ID，无法更新', true);
                return;
            }

            // 1. 获取选中的员工
            const selectedItems = document.querySelectorAll('.employee-item.selected');
            if (selectedItems.length === 0) {
                this.showNotification('请先选择员工！', true);
                return;
            }

            // 2. 获取表单数据
            const amount = document.getElementById('amountInput').value;
            if (!amount || parseFloat(amount) <= 0) {
                this.showNotification('请输入有效的金额！', true);
                return;
            }

            // 获取记账日期
            const accountingDate = document.getElementById('workDate').value;
            if (!accountingDate) {
                this.showNotification('请选择记账日期！', true);
                return;
            }

            const recordType = this.getCurrentWorkType();
            const projectId = this.getCurrentProjectId();
            const recordDates = [accountingDate];
            const payer = document.getElementById('paymentInput').value.trim();
            const remark = document.getElementById('remark').value.trim();
            
            // 3. 检查图片选择器中是否有图片
            const imageContainer = document.getElementById('imageUploadContainer');
            const imagePreviews = imageContainer ? imageContainer.querySelectorAll('.image-preview-item') : [];
            const hasImagesInSelector = imagePreviews.length > 0;
            
            // 获取图片选择器中的图片（从window.selectedImages）
            const images = [];
            if (window.selectedImages && window.selectedImages.length > 0) {
                window.selectedImages.forEach(img => {
                    if (img instanceof File || img instanceof Blob) {
                        images.push(img);
                    }
                });
            }
            
            // 4. 获取原始记录中的旧图片URL
            let oldImages = [];
            if (window.originalImageIds) {
                oldImages = window.originalImageIds.split(',').filter(img => 
                    img && typeof img === 'string'
                );
            }
            
            // 5. 检查是否真的有新图片上传，避免重复处理
            let hasRealNewImages = false;
            let realNewImages = [];
            let hasOnlineDownloadedImages = false;
            
            if (images && images.length > 0) {
                // 过滤出真正的新图片（File或Blob对象，且不是从旧图片URL下载的）
                realNewImages = images.filter(img => {
                    // 检查是否是真正的File或Blob对象
                    if (!(img instanceof File || img instanceof Blob)) {
                        return false;
                    }
                    
                    // 如果有旧图片，检查图片是否是从旧图片URL下载的
                    if (oldImages.length > 0) {
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
                            // 系统创建的图片，标记为在线下载的图片
                            hasOnlineDownloadedImages = true;
                            // 不视为新图片
                            return false;
                        }
                    }
                    
                    // 否则视为新图片
                    return true;
                });
                hasRealNewImages = realNewImages.length > 0;
            }
            
            // 6. 显示"数据保存中"提示
            this.showNotification('数据保存中...', false);
            
            // 7. 根据图片选择器状态处理图片
            let finalImageUrls = [];
            const isOnline = navigator.onLine;
            
            if (!hasImagesInSelector) {
                // 情况1：图片选择器中没有图片
                finalImageUrls = [];
            } else if (isOnline) {
                // 在线模式：始终重新上传图片，确保图片是最新的
                if (images.length > 0) {
                    finalImageUrls = await this._uploadImagesToSupabase(images, projectId, accountingDate);
                } else {
                    // 如果没有images数据但有预览图片，使用旧图片URL
                    finalImageUrls = [...oldImages];
                }
            } else {
                // 离线模式：始终重新上传图片，与在线模式保持一致
                if (images.length > 0) {
                    finalImageUrls = await this._saveImagesToLocal(images, projectId, accountingDate);
                } else {
                    // 如果没有images数据但有预览图片，使用旧图片URL
                    finalImageUrls = [...oldImages];
                }
            }
            
            // 7. 更新现有记录
            for (const selectedItem of selectedItems) {
                const employeeId = selectedItem.dataset.employeeId;
                
                for (const recordDate of recordDates) {
                    const recordData = {
                        settlement_id: settlementId,
                        record_type: recordType,
                        project_id: projectId,
                        record_date: recordDate,
                        employee_id: employeeId,
                        amount: parseFloat(amount),
                        payer: payer || null,
                        remark: remark || null,
                        image_ids: finalImageUrls,
                        audit_status: '已审核'
                    };
                    
                    // 更新数据库中的记录
                    if (isOnline) {
                        await this._updateRecordInSupabase(settlementId, employeeId, recordDate, recordData);
                    } else {
                        await this._updateRecordInLocalStorage(settlementId, employeeId, recordDate, recordData);
                    }
                }
            }
            
            // 8. 更新记录后，检查图片变更并删除被移除的图片
            // 参考项目记账的逻辑：先更新记录，再检查图片变更
            if (oldImages.length > 0) {
                // 检查是否真的有图片变更
                // 1. hasRealNewImages 表示是否有真正的新图片上传
                // 2. 检查预览图片数量是否与旧图片数量不同
                // 3. 检查finalImageUrls与oldImages是否完全相同
                const isImageChanged = hasRealNewImages || 
                                     imagePreviews.length !== oldImages.length;
                
                // 额外检查：当没有真正的新图片时，finalImageUrls应该与oldImages完全相同
                // 如果完全相同，即使isImageChanged为true，也不需要处理图片删除
                let isActuallyChanged = isImageChanged;
                if (!hasRealNewImages && imagePreviews.length === oldImages.length) {
                    // 检查两个数组的内容是否完全相同
                    const isSameImages = finalImageUrls.length === oldImages.length &&
                        finalImageUrls.every((img, index) => img === oldImages[index]);
                    
                    if (isSameImages) {
                        isActuallyChanged = false;
                    }
                } else if (imagePreviews.length < oldImages.length) {
                    // 预览图片数量减少，说明用户删除了图片，需要处理图片删除
                    isActuallyChanged = true;
                }
                
                // 只有在图片真的变更时，才检查被移除的图片
                if (isActuallyChanged) {
                    // 比较旧图片列表和新图片列表，找出被移除的图片
                    const removedImages = oldImages.filter(oldImg => 
                        !finalImageUrls.some(newImg => newImg === oldImg)
                    );
                    
                    // 如果有图片被移除，删除这些图片
                    if (removedImages.length > 0) {
                        // 收集所有被更新的记录，用于在检查图片引用时排除
                        const excludedRecords = [];
                        for (const selectedItem of selectedItems) {
                            const employeeId = selectedItem.dataset.employeeId;
                            for (const recordDate of recordDates) {
                                excludedRecords.push({
                                    settlement_id: settlementId,
                                    employee_id: employeeId,
                                    record_date: recordDate
                                });
                            }
                        }
                        
                        // 使用excludedRecords参数检查图片引用
                        await this._deleteRecordImages(removedImages, settlementId, null, accountingDate, excludedRecords);
                    }
                }
            }
            
            // 9. 更新window.originalImageIds为最新的图片列表，以便下次编辑时正确比较
            window.originalImageIds = finalImageUrls.join(',');
            
            // 10. 清空window.selectedImages数组
            if (window.selectedImages) {
                window.selectedImages = [];
            }
            
            // 11. 显示成功通知
            this.showNotification('记录更新成功！', false);
            
            // 检查是否从统计页面进入
            const urlParams = new URLSearchParams(window.location.search);
            const from = urlParams.get('from');
            
            if (from === 'statistic') {
                // 从统计页面进入,返回统计页面
                const statisticFilter = JSON.parse(localStorage.getItem('statisticFilter') || '{}');
                
                // 构建统计页面URL
                const baseUrl = window.location.href.split('?')[0];
                const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
                const statisticUrl = new URL(basePath + '统计.html');
                if (statisticFilter.projectId) {
                    statisticUrl.searchParams.append('project_id', statisticFilter.projectId);
                }
                
                // 跳转到统计页面
                window.location.href = statisticUrl.href;
                return;
            }
            
            // 11. 刷新已记标记
            if (window.accountingFlowService) {
                // 清除缓存，确保能获取到最新数据
                window.accountingFlowService._markedEmployeesCache = null;
                window.accountingFlowService._accountingRecordsCache = null;
                window.accountingFlowService.refreshMarkedEmployees();
            }
            
            // 12. 进入新建模式并切换到当日流水页面，传递项目ID和记账日期
            setTimeout(() => {
                // 获取当前项目ID和记账日期
                const currentProjectId = this.getCurrentProjectId();
                const currentRecordDate = accountingDate; // 使用已获取的记账日期
                
                // 清除URL参数，进入新建模式
                const newUrl = window.location.origin + window.location.pathname;
                window.history.pushState({}, '', newUrl);
                
                // 重置页面到新建模式
                if (typeof resetForm === 'function') {
                    resetForm();
                }
                
                // 传递项目ID和记账日期到页面状态
                if (currentProjectId) {
                    // 设置项目ID到全局变量，供页面初始化时使用
                    window.pendingProjectId = currentProjectId;
                }
                
                if (currentRecordDate) {
                    // 设置记账日期到全局变量，供页面初始化时使用
                    window.pendingRecordDate = currentRecordDate;
                }
                
                // 切换到当日流水标签
                const tabDailyFlow = document.getElementById('tabDailyFlow');
                if (tabDailyFlow) {
                    tabDailyFlow.checked = true;
                    // 触发change事件以确保页面样式正确更新
                    tabDailyFlow.dispatchEvent(new Event('change'));
                }
                
                // 清除编辑模式的UI
                if (typeof restoreUINormalMode === 'function') {
                    restoreUINormalMode();
                }
                
                // 通知父页面更新标题为"当日流水"
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'updateTitle',
                        title: '当日流水',
                        page: '当日流水'
                    }, window.location.origin || '*');
                }
            }, 1500);
            
            return;
        } catch (error) {
            console.error('更新记录失败:', error);
            this.showNotification('更新记录失败，请重试！', true);
        }
    }

    // 显示确认模态框
    showConfirmModal(title, message, confirmCallback) {
        // 移除所有现有的确认模态框，防止叠加
        document.querySelectorAll('.confirm-modal').forEach(existingModal => {
            existingModal.remove();
        });
        
        const modal = document.createElement('div');
        modal.className = 'modal confirm-modal';
        modal.style.display = 'flex';
        
        modal.innerHTML = `
            <div class="modal-content">
                <h3 style="color: #ED7D31;">${title}</h3>
                <p>${message}</p>
                <div class="form-buttons" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-top: 20px;">
                    <button id="confirmAction" style="background-color: #52c41a; margin-left: 0;">删除</button>
                    <button id="cancelAction" style="background-color: #f5222d; margin-right: 0;">取消</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 确保DOM已渲染完成后再添加事件监听器
        setTimeout(() => {
            // 从modal元素内部查找按钮，而不是全局查找
            const confirmButton = modal.querySelector('#confirmAction');
            const cancelButton = modal.querySelector('#cancelAction');
            
            if (confirmButton) {
                confirmButton.addEventListener('click', () => {
                    // 执行确认回调
                    confirmCallback();
                    // 移除模态框
                    modal.remove();
                });
            }
            
            if (cancelButton) {
                cancelButton.addEventListener('click', () => {
                    modal.remove();
                });
            }
        }, 0);
    }

    // 删除记录功能
    async deleteAccounting() {
        try {
            // 权限检查
            if (!this.checkPermission('perm_delete_settlement')) {
                this.showNotification('你无删除结算借支权限！', true);
                return;
            }

            // 优先从全局变量获取settlement_id，如果没有则从URL参数获取
            let settlementId = window.currentSettlementId;
            if (!settlementId) {
                const urlParams = new URLSearchParams(window.location.search);
                settlementId = urlParams.get('settlement_id');
            }
            
            if (!settlementId) {
                this.showNotification('未找到记录ID，无法删除', true);
                return;
            }

            // 获取当前选中的员工
            const selectedItems = document.querySelectorAll('.employee-item.selected');
            if (selectedItems.length === 0) {
                this.showNotification('请先选择要删除的员工记录！', true);
                return;
            }

            // 获取记账日期
            const accountingDate = document.getElementById('workDate').value;
            if (!accountingDate) {
                this.showNotification('请选择记账日期！', true);
                return;
            }

            // 使用模态框确认删除
            this.showConfirmModal('删除记录', '确定要删除这条记录吗？此操作不可恢复！', async () => {
                // 显示"数据保存中"提示
                this.showNotification('数据保存中...', false);
                
                // 删除记录 - 使用与更新相同的匹配逻辑
                for (const selectedItem of selectedItems) {
                    const employeeId = selectedItem.dataset.employeeId;
                    await this._deleteSpecificRecord(settlementId, employeeId, accountingDate);
                }

                // 显示成功通知
                this.showNotification('记录删除成功！', false);
                
                // 清除缓存，确保能获取到最新数据
                if (window.accountingFlowService) {
                    window.accountingFlowService._markedEmployeesCache = null;
                    window.accountingFlowService._accountingRecordsCache = null;
                }

                // 检查是否从统计页面进入
                const urlParams = new URLSearchParams(window.location.search);
                const from = urlParams.get('from');
                
                if (from === 'statistic') {
                    // 从统计页面进入,返回统计页面
                    const statisticFilter = JSON.parse(localStorage.getItem('statisticFilter') || '{}');
                    
                    // 构建统计页面URL
                    const baseUrl = window.location.href.split('?')[0];
                    const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
                    const statisticUrl = new URL(basePath + '统计.html');
                    if (statisticFilter.projectId) {
                        statisticUrl.searchParams.append('project_id', statisticFilter.projectId);
                    }
                    
                    // 跳转到统计页面
                    window.location.href = statisticUrl.href;
                    return;
                }

                // 重置表单
                if (typeof resetForm === 'function') {
                    resetForm();
                }
                
                // 重置全局状态
                if (window.currentSettlementId) {
                    delete window.currentSettlementId;
                }
                
                // 隐藏编辑模式的UI元素
                if (typeof restoreUINormalMode === 'function') {
                    restoreUINormalMode();
                }
                
                // 清除URL参数，确保页面不会再次进入编辑模式
                const url = new URL(window.location.href);
                url.searchParams.delete('settlement_id');
                window.history.replaceState({}, '', url);
                
                // 进入新建模式并切换到当日流水页面，传递项目ID和记账日期
                setTimeout(() => {
                    // 获取当前项目ID和记账日期
                    const currentProjectId = this.getCurrentProjectId();
                    const currentRecordDate = accountingDate; // 使用已获取的记账日期
                    
                    // 传递项目ID和记账日期到页面状态
                    if (currentProjectId) {
                        // 设置项目ID到全局变量，供页面初始化时使用
                        window.pendingProjectId = currentProjectId;
                    }
                    
                    if (currentRecordDate) {
                        // 设置记账日期到全局变量，供页面初始化时使用
                        window.pendingRecordDate = currentRecordDate;
                    }
                    
                    // 切换到当日流水标签
                    const tabDailyFlow = document.getElementById('tabDailyFlow');
                    if (tabDailyFlow) {
                        tabDailyFlow.checked = true;
                        // 触发change事件以确保页面样式正确更新
                        tabDailyFlow.dispatchEvent(new Event('change'));
                    }
                    
                    // 通知父页面更新标题为"当日流水"
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({
                            type: 'updateTitle',
                            title: '当日流水',
                            page: '当日流水'
                        }, window.location.origin || '*');
                    }
                }, 500);
            });

        } catch (error) {
            console.error('删除记录失败:', error);
            this.showNotification('删除记录失败，请重试！', true);
        }
    }

    /**
     * 检查图片是否有其他引用
     * @param {Array} image_ids - 要检查的图片ID数组
     * @param {string} settlementId - 当前记录的settlement_id
     * @param {string} [employeeId] - 当前记录的employee_id（可选，用于精确排除当前记录）
     * @param {string} [recordDate] - 当前记录的record_date（可选，用于精确排除当前记录）
     * @param {Array} [excludedRecords] - 要排除的记录列表，每个记录包含settlement_id, employee_id, record_date
     * @returns {boolean} - 是否有其他引用
     */
    async _checkImageReferences(image_ids, settlementId, employeeId = null, recordDate = null, excludedRecords = []) {
        try {
            const isOnline = navigator.onLine;
            
            if (isOnline && this.supabase) {
                const orConditions = image_ids.map(img => `image_ids.cs.{"${img}"}`).join(',');
                const { data, error } = await this.supabase
                    .from('settlement_records')
                    .select('image_ids')
                    .not('settlement_id', 'eq', settlementId)
                    .or(orConditions);
                
                if (error) {
                    console.error('查询Supabase图片引用失败:', error);
                } else if (data && data.length > 0) {
                    for (const record of data) {
                        if (record.image_ids) {
                            let recordImageIds = record.image_ids;
                            if (typeof recordImageIds === 'string') {
                                try {
                                    recordImageIds = JSON.parse(recordImageIds);
                                } catch (e) {
                                    continue;
                                }
                            }
                            
                            if (Array.isArray(recordImageIds)) {
                                for (const img of recordImageIds) {
                                    if (image_ids.includes(img)) {
                                        return true;
                                    }
                                }
                            }
                        }
                    }
                }
                
                return false;
            }
            
            const storageKeys = ['settlement_records_cache', 'settlementRecords', 'offline_settlement_records'];
            
            for (const storageKey of storageKeys) {
                const existingData = localStorage.getItem(storageKey);
                if (!existingData) {
                    continue;
                }
                
                try {
                    const records = JSON.parse(existingData);
                    if (!Array.isArray(records)) {
                        continue;
                    }
                    
                    for (const record of records) {
                        let shouldExclude = false;
                        
                        if (excludedRecords.length > 0) {
                            shouldExclude = excludedRecords.some(excluded => 
                                excluded.settlement_id === record.settlement_id &&
                                excluded.employee_id === record.employee_id &&
                                excluded.record_date === record.record_date
                            );
                        } else if (record.settlement_id === settlementId) {
                            if (employeeId && recordDate) {
                                if (record.employee_id === employeeId && record.record_date === recordDate) {
                                    shouldExclude = true;
                                }
                            } else {
                                shouldExclude = true;
                            }
                        }
                        
                        if (shouldExclude) {
                            continue;
                        }
                        
                        if (record.image_ids) {
                            let recordImageIds = record.image_ids;
                            if (typeof recordImageIds === 'string') {
                                try {
                                    recordImageIds = JSON.parse(recordImageIds);
                                } catch (e) {
                                    continue;
                                }
                            }
                            
                            if (Array.isArray(recordImageIds)) {
                                for (const img of recordImageIds) {
                                    if (image_ids.includes(img)) {
                                        return true;
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error(`解析${storageKey}数据失败:`, e);
                }
            }
            
            return false;
        } catch (error) {
            console.error('检查图片引用失败:', error);
            return false;
        }
    }
    
    // 删除记录图片
    async _deleteRecordImages(image_ids, settlementId, employeeId = null, recordDate = null, excludedRecords = []) {
        try {
            // 检查image_ids是否有效
            if (!image_ids) {
                return;
            }
            
            // 处理image_ids是字符串的情况
            let imagesToDelete = Array.isArray(image_ids) ? image_ids : JSON.parse(image_ids);
            
            // 过滤掉空值
            imagesToDelete = imagesToDelete.filter(img => img && typeof img === 'string');
            
            if (imagesToDelete.length === 0) {
                return;
            }
            
            // 逐个检查并处理图片，而不是一次性检查全部
            for (const imageUrl of imagesToDelete) {
                try {
                    // 检查当前图片是否有其他引用
                    const hasOtherReferences = await this._checkImageReferences([imageUrl], settlementId, employeeId, recordDate, excludedRecords);
                    
                    // 无论是否有其他引用，都清理本地缓存
                    if (imageUrl.startsWith('local://')) {
                        const imageId = imageUrl.replace('local://', '');
                        localStorage.removeItem(imageId);
                    } else if (imageUrl.startsWith('https://')) {
                        // 提取文件名作为可能的本地存储键
                        const urlParts = imageUrl.split('/');
                        const fileName = urlParts.pop();
                        if (fileName) {
                            // 只删除明确的图片缓存键
                            const possibleKeys = [
                                `image_cache_${fileName}`,
                                `temp_image_${fileName}`,
                                `upload_${fileName}`
                            ];
                            possibleKeys.forEach(key => {
                                if (localStorage.getItem(key)) {
                                    localStorage.removeItem(key);
                                }
                            });
                        }
                    }
                    
                    if (!hasOtherReferences) {
                        let bucketName = '';
                        let fullFilePath = '';
                        
                        if (imageUrl.includes('/storage/v1/object/public/')) {
                            const publicIndex = imageUrl.indexOf('public/');
                            if (publicIndex !== -1) {
                                const fullPath = imageUrl.substring(publicIndex + 'public/'.length);
                                const decodedPath = decodeURIComponent(fullPath);
                                const pathParts = decodedPath.split('/');
                                bucketName = pathParts[0];
                                fullFilePath = pathParts.slice(1).join('/');
                            }
                        } else if (imageUrl.includes('https://')) {
                            const urlParts = imageUrl.split('/');
                            const bucketIndex = urlParts.indexOf('FYKQ');
                            if (bucketIndex !== -1 && bucketIndex + 1 < urlParts.length) {
                                const encodedFilePath = urlParts.slice(bucketIndex + 1).join('/');
                                fullFilePath = decodeURIComponent(encodedFilePath);
                                bucketName = urlParts[bucketIndex];
                            }
                        }
                        
                        if (bucketName && fullFilePath) {
                            const isOnline = navigator.onLine;
                            
                            if (isOnline && this.supabase) {
                                let deleteSuccess = true;
                                try {
                                    const { error } = await this.supabase.storage
                                        .from(bucketName)
                                        .remove([fullFilePath]);
                                    
                                    if (error) {
                                        console.error('删除云端图片失败:', error);
                                        deleteSuccess = false;
                                    }
                                } catch (deleteError) {
                                    console.error('删除云端图片时发生异常:', deleteError);
                                    deleteSuccess = false;
                                }
                                
                                if (!deleteSuccess) {
                                    if (window.offlineSyncService) {
                                        window.offlineSyncService.addToSyncQueue('delete_image', {
                                            filePath: fullFilePath,
                                            bucketName: bucketName
                                        }, `del_img_${fullFilePath}_${Date.now()}`, 'image');
                                    }
                                }
                            } else {
                                if (window.offlineSyncService) {
                                    window.offlineSyncService.addToSyncQueue('delete_image', {
                                        filePath: fullFilePath,
                                        bucketName: bucketName
                                    }, `del_img_${fullFilePath}_${Date.now()}`, 'image');
                                }
                            }
                        }
                    }
                } catch (imgError) {
                    console.error('处理图片时出错:', imgError);
                    // 继续处理下一张图片
                }
            }
            
            // 所有图片已处理完毕
        } catch (error) {
            console.error('删除记录图片失败:', error);
            // 继续执行，不中断删除流程
        }
    }
    
    // 删除特定记录（使用与更新相同的匹配条件）
    async _deleteSpecificRecord(settlementId, employeeId, recordDate) {
        try {
            const isOnline = navigator.onLine;
            
            // 先获取记录信息，以便删除图片
            let record = null;
            
            // 从所有本地存储位置查找记录
            const storageSources = ['settlementRecords', 'settlement_records_cache', 'offline_settlement_records'];
            for (const source of storageSources) {
                try {
                    const storedData = localStorage.getItem(source);
                    if (storedData) {
                        const parsedData = JSON.parse(storedData);
                        if (Array.isArray(parsedData)) {
                            record = parsedData.find(r => 
                                r.settlement_id === settlementId && 
                                r.employee_id === employeeId && 
                                r.record_date === recordDate
                            );
                            if (record) break;
                        }
                    }
                } catch (e) {
                    console.error(`从${source}获取记录失败:`, e);
                }
            }
            
            // 在线模式下也尝试从Supabase获取记录
            if (!record && isOnline && this.supabase) {
                const { data, error } = await this.supabase
                    .from('settlement_records')
                    .select('image_ids')
                    .eq('settlement_id', settlementId)
                    .eq('employee_id', employeeId)
                    .eq('record_date', recordDate)
                    .single();
                
                if (data) {
                    record = data;
                }
            }
            
            // 如果找到记录，先删除图片
            if (record && record.image_ids) {
                await this._deleteRecordImages(record.image_ids, settlementId, employeeId, recordDate);
            }
            
            // 在线模式：从Supabase删除特定记录
            if (isOnline && this.supabase) {
                const { error } = await this.supabase
                    .from('settlement_records')
                    .delete()
                    .eq('settlement_id', settlementId)
                    .eq('employee_id', employeeId)
                    .eq('record_date', recordDate);
                
                if (error) throw error;
            } else {
                // 离线模式：添加删除任务到同步队列
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('delete', {
                        table: 'settlement_records',
                        settlement_id: settlementId,
                        employee_id: employeeId,
                        record_date: recordDate
                    }, `del_${settlementId}_${employeeId}_${recordDate}_${Date.now()}`, 'record');
                }
            }
            
            // 从所有本地存储位置删除记录
            this._deleteFromAllLocalStores(settlementId, employeeId, recordDate);
        } catch (error) {
            console.error('删除特定记录失败:', error);
            throw error;
        }
    }
    
    // 从所有本地存储位置删除记录
    _deleteFromAllLocalStores(settlementId, employeeId, recordDate) {
        let deletedAny = false;
        const storageSources = ['settlementRecords', 'settlement_records_cache', 'offline_settlement_records'];
        
        storageSources.forEach(source => {
            try {
                const storedData = localStorage.getItem(source);
                if (storedData) {
                    let parsedData = JSON.parse(storedData);
                    if (Array.isArray(parsedData)) {
                        const initialLength = parsedData.length;
                        
                        // 过滤掉匹配的记录
                        parsedData = parsedData.filter(r => 
                            !(r.settlement_id === settlementId && 
                              r.employee_id === employeeId && 
                              r.record_date === recordDate)
                        );
                        
                        // 如果记录数减少，说明删除了记录
                        if (parsedData.length < initialLength) {
                            localStorage.setItem(source, JSON.stringify(parsedData));
                            deletedAny = true;
                        }
                    }
                }
            } catch (error) {
                console.error(`从${source}删除记录失败:`, error);
            }
        });
        
        return deletedAny;
    }



    // 更新Supabase中的记录
    async _updateRecordInSupabase(settlementId, employeeId, recordDate, recordData) {
        try {
            // 使用settlement_id, employee_id和record_date作为查询条件
            const { data, error } = await this.supabase
                .from('settlement_records')
                .update(recordData)
                .eq('settlement_id', settlementId)
                .eq('employee_id', employeeId)
                .eq('record_date', recordDate);
            
            if (error) throw error;
            
            return data;
        } catch (error) {
            console.error('更新Supabase记录失败:', error);
            throw error;
        }
    }

    // 更新本地存储中的记录
    async _updateRecordInLocalStorage(settlementId, employeeId, recordDate, recordData) {
        try {
            // 获取本地存储中的记录
            let records = JSON.parse(localStorage.getItem('settlementRecords') || '[]');
            
            // 查找并更新匹配的记录
            const index = records.findIndex(r => 
                r.settlement_id === settlementId && 
                r.employee_id === employeeId && 
                r.record_date === recordDate
            );
            
            if (index !== -1) {
                // 更新记录
                records[index] = {
                    ...records[index],
                    ...recordData,
                    updated_at: new Date().toISOString()
                };
                
                // 保存回本地存储
                localStorage.setItem('settlementRecords', JSON.stringify(records));
                
                // 添加更新任务到同步队列
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('update', {
                        table: 'settlement_records',
                        settlement_id: settlementId,
                        employee_id: employeeId,
                        record_date: recordDate,
                        ...recordData
                    }, `update_${settlementId}_${employeeId}_${recordDate}_${Date.now()}`, 'record');
                }
            } else {
                // 找不到匹配的记录，这可能是因为本地存储中没有该记录，但云端存在
                // 在更新操作中，我们应该始终使用update操作，而不是save_record操作
                // 因为我们已经有了settlement_id，这是一个更新操作，不是创建操作
                const now = new Date();
                const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC+8
                
                const newRecord = {
                    ...recordData,
                    created_at: beijingTime.toISOString(),
                    updated_at: beijingTime.toISOString(),
                    is_local: true // 标记为本地记录
                };
                
                // 添加新记录到本地存储
                records.push(newRecord);
                
                // 保存回本地存储
                localStorage.setItem('settlementRecords', JSON.stringify(records));
                
                // 添加更新任务到同步队列，使用update操作而不是save_record操作
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('update', {
                        table: 'settlement_records',
                        settlement_id: settlementId,
                        employee_id: employeeId,
                        record_date: recordDate,
                        ...recordData
                    }, `update_${settlementId}_${employeeId}_${recordDate}_${Date.now()}`, 'record');
                }
            }
            
            // 确保其他存储位置的旧记录不会导致冲突
            // 从缓存和离线存储中删除相同的记录，因为settlementRecords具有最高优先级
            const otherStorageSources = ['settlement_records_cache', 'offline_settlement_records'];
            otherStorageSources.forEach(source => {
                try {
                    const storedData = localStorage.getItem(source);
                    if (storedData) {
                        let parsedData = JSON.parse(storedData);
                        if (Array.isArray(parsedData)) {
                            const initialLength = parsedData.length;
                            
                            // 过滤掉匹配的记录
                            parsedData = parsedData.filter(r => 
                                !(r.settlement_id === settlementId && 
                                  r.employee_id === employeeId && 
                                  r.record_date === recordDate)
                            );
                            
                            // 如果记录数减少，说明删除了记录
                            if (parsedData.length < initialLength) {
                                localStorage.setItem(source, JSON.stringify(parsedData));
                            }
                        }
                    }
                } catch (error) {
                    console.error(`从${source}清理旧记录失败:`, error);
                }
            });
            
            return records;
        } catch (error) {
            console.error('更新本地记录失败:', error);
            throw error;
        }
    }
}

// 初始化服务
const settlementService = new SettlementService();

// 导出服务，以便在HTML中使用
if (typeof window !== 'undefined') {
    window.settlementService = settlementService;
}