// 点工单管理API
class WorkRecordAPI {
    constructor() {
        if (typeof window.supabase === 'undefined') {
            console.error('Supabase客户端未初始化');
            return;
        }
        this.supabase = window.supabase;
        this.offlineSync = window.offlineSync || null;
    }

    async saveWorkRecord(recordData) {
        const isOnline = navigator.onLine;

        if (!recordData.project_id || !recordData.record_date || !recordData.team_name || 
            !recordData.team_leader || !recordData.work_days || !recordData.description) {
            throw new Error('缺少必要字段');
        }

        if (!isOnline) {
            console.log('离线模式：保存点工单到本地存储');
            try {
                await this._saveRecordToLocalStorage(recordData);
                return { success: true, data: { is_local: true }, message: '已保存到本地存储，将在网络恢复后同步' };
            } catch (localError) {
                console.error('保存到本地存储失败:', localError);
                return { success: false, error: localError.message };
            }
        }

        try {
            const now = new Date();
            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
            
            const data = {
                project_id: recordData.project_id,
                record_date: recordData.record_date,
                team_name: recordData.team_name,
                team_leader: recordData.team_leader,
                work_days: parseFloat(recordData.work_days),
                worker_type: recordData.worker_type || '普工',
                unit_price: parseFloat(recordData.unit_price) || 0,
                amount: parseFloat(recordData.amount) || 0,
                description: recordData.description,
                image_ids: recordData.images || [],
                updated_at: beijingTime.toISOString()
            };

            const { data: result, error } = await this.supabase
                .from('work_records')
                .insert([data])
                .select();

            if (error) {
                throw error;
            }

            if (result && result.length > 0) {
                this._saveOnlineRecordToLocal(result[0]);
            }

            return { success: true, data: result };
        } catch (error) {
            console.error('保存点工单失败:', error);
            try {
                await this._saveRecordToLocalStorage(recordData);
                return { success: true, data: { is_local: true }, message: '已保存到本地存储，将在网络恢复后同步' };
            } catch (localError) {
                console.error('保存到本地存储也失败:', localError);
                return { success: false, error: error.message };
            }
        }
    }

    async updateWorkRecord(id, recordData, oldImageList = []) {
        const isOnline = navigator.onLine;

        if (!recordData.project_id || !recordData.record_date || !recordData.team_name || 
            !recordData.team_leader || !recordData.work_days || !recordData.description) {
            throw new Error('缺少必要字段');
        }

        if (!isOnline) {
            try {
                await this._updateRecordInLocalStorage(id, recordData);
                
                const now = new Date();
                const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
                
                // 构造与在线模式一致的数据结构
                const data = {
                    project_id: recordData.project_id,
                    record_date: recordData.record_date,
                    team_name: recordData.team_name,
                    team_leader: recordData.team_leader,
                    work_days: parseFloat(recordData.work_days),
                    worker_type: recordData.worker_type || '普工',
                    unit_price: parseFloat(recordData.unit_price) || 0,
                    amount: parseFloat(recordData.amount) || 0,
                    description: recordData.description,
                    image_ids: recordData.images || [],
                    updated_at: beijingTime.toISOString()
                };

                let imagesToDelete = [];
                if (oldImageList && oldImageList.length > 0) {
                    const currentImages = recordData.images || [];
                    
                    // 检查图片是否真的有变更（参考项目记账的实现）
                    // 1. 检查图片数量是否不同
                    // 2. 检查图片内容是否不同
                    const isImageChanged = oldImageList.length !== currentImages.length || 
                        oldImageList.some((oldImg, index) => oldImg !== currentImages[index]);
                    
                    // 额外检查：当图片数量相同时，检查内容是否完全相同
                    let isActuallyChanged = isImageChanged;
                    if (oldImageList.length === currentImages.length) {
                        // 检查两个数组的内容是否完全相同
                        const isSameImages = oldImageList.every((img, index) => img === currentImages[index]);
                        
                        if (isSameImages) {
                            isActuallyChanged = false;
                        }
                    } else if (currentImages.length < oldImageList.length) {
                        // 图片数量减少，说明用户删除了图片，需要处理图片删除
                        isActuallyChanged = true;
                    }
                    
                    // 只有在图片真的变更时，才处理删除操作
                    if (isActuallyChanged) {
                        imagesToDelete = oldImageList.filter(oldImg => 
                            !currentImages.some(newImg => newImg === oldImg)
                        );
                    }
                }
                
                // 处理要删除的图片路径，与在线模式保持一致
                let filePathsToDelete = [];
                if (imagesToDelete.length > 0) {
                    filePathsToDelete = imagesToDelete.map(url => {
                        const urlParts = url.split('/FYKQ/');
                        if (urlParts.length > 1) {
                            return decodeURIComponent(urlParts[1]);
                        }
                        return null;
                    }).filter(path => path !== null);
                }
                
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('update', {
                        table: 'work_records',
                        work_record_id: id,
                        ...data,
                        old_images: oldImageList,
                        images_to_delete: filePathsToDelete
                    }, id, 'work_record');
                    
                    // 为每个要删除的图片单独添加删除任务到同步队列
                    if (imagesToDelete.length > 0) {
                        imagesToDelete.forEach(imageUrl => {
                            // 从URL中提取存储桶和文件路径信息
                            // URL格式：https://oydffrzzulsrbitrrhht.supabase.co/storage/v1/object/public/FYKQ/project_id/temporaryworker/filename.ext
                            
                            // 查找"public/"的位置
                            const publicIndex = imageUrl.indexOf('public/');
                            if (publicIndex !== -1) {
                                // 提取完整的文件路径部分
                                const fullPath = imageUrl.substring(publicIndex + 'public/'.length);
                                
                                // 使用decodeURIComponent完全解码文件路径
                                const decodedPath = decodeURIComponent(fullPath);
                                
                                // 提取存储桶名称和文件路径
                                const pathParts = decodedPath.split('/');
                                const bucketName = pathParts[0];
                                const filePath = pathParts.slice(1).join('/');
                                
                                // 添加图片删除任务到同步队列
                                window.offlineSyncService.addToSyncQueue('删除_图片', {
                                    bucket_name: bucketName,
                                    file_path: filePath,
                                    image_url: imageUrl
                                }, `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, 'image');
                            }
                        });
                    }
                }
                return { success: true, data: { is_local: true }, message: '已保存到本地存储，将在网络恢复后同步' };
            } catch (localError) {
                console.error('保存到本地存储失败:', localError);
                if (window.offlineSyncService) {
                    const now = new Date();
                    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
                    
                    const data = {
                        project_id: recordData.project_id,
                        record_date: recordData.record_date,
                        team_name: recordData.team_name,
                        team_leader: recordData.team_leader,
                        work_days: parseFloat(recordData.work_days),
                        worker_type: recordData.worker_type || '普工',
                        unit_price: parseFloat(recordData.unit_price) || 0,
                        amount: parseFloat(recordData.amount) || 0,
                        description: recordData.description,
                        image_ids: recordData.images || [],
                        updated_at: beijingTime.toISOString()
                    };

                    let imagesToDelete = [];
                    if (oldImageList && oldImageList.length > 0) {
                        const currentImages = recordData.images || [];
                        
                        // 检查图片是否真的有变更（参考项目记账的实现）
                        // 1. 检查图片数量是否不同
                        // 2. 检查图片内容是否不同
                        const isImageChanged = oldImageList.length !== currentImages.length || 
                            oldImageList.some((oldImg, index) => oldImg !== currentImages[index]);
                        
                        // 额外检查：当图片数量相同时，检查内容是否完全相同
                        let isActuallyChanged = isImageChanged;
                        if (oldImageList.length === currentImages.length) {
                            // 检查两个数组的内容是否完全相同
                            const isSameImages = oldImageList.every((img, index) => img === currentImages[index]);
                            
                            if (isSameImages) {
                                isActuallyChanged = false;
                            }
                        } else if (currentImages.length < oldImageList.length) {
                            // 图片数量减少，说明用户删除了图片，需要处理图片删除
                            isActuallyChanged = true;
                        }
                        
                        // 只有在图片真的变更时，才处理删除操作
                        if (isActuallyChanged) {
                            imagesToDelete = oldImageList.filter(oldImg => 
                                !currentImages.some(newImg => newImg === oldImg)
                            );
                        }
                    }
                    
                    let filePathsToDelete = [];
                    if (imagesToDelete.length > 0) {
                        filePathsToDelete = imagesToDelete.map(url => {
                            const urlParts = url.split('/FYKQ/');
                            if (urlParts.length > 1) {
                                return decodeURIComponent(urlParts[1]);
                            }
                            return null;
                        }).filter(path => path !== null);
                    }

                    window.offlineSyncService.addToSyncQueue('update', {
                        table: 'work_records',
                        work_record_id: id,
                        ...data,
                        old_images: oldImageList,
                        images_to_delete: filePathsToDelete
                    }, id, 'work_record');
                    
                    // 为每个要删除的图片单独添加删除任务到同步队列
                    if (imagesToDelete.length > 0) {
                        imagesToDelete.forEach(imageUrl => {
                            // 从URL中提取存储桶和文件路径信息
                            // URL格式：https://oydffrzzulsrbitrrhht.supabase.co/storage/v1/object/public/FYKQ/project_id/temporaryworker/filename.ext
                            
                            // 查找"public/"的位置
                            const publicIndex = imageUrl.indexOf('public/');
                            if (publicIndex !== -1) {
                                // 提取完整的文件路径部分
                                const fullPath = imageUrl.substring(publicIndex + 'public/'.length);
                                
                                // 使用decodeURIComponent完全解码文件路径
                                const decodedPath = decodeURIComponent(fullPath);
                                
                                // 提取存储桶名称和文件路径
                                const pathParts = decodedPath.split('/');
                                const bucketName = pathParts[0];
                                const filePath = pathParts.slice(1).join('/');
                                
                                // 添加图片删除任务到同步队列
                                window.offlineSyncService.addToSyncQueue('删除_图片', {
                                    bucket_name: bucketName,
                                    file_path: filePath,
                                    image_url: imageUrl
                                }, `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, 'image');
                            }
                        });
                    }
                }
                return { success: true, data: { is_local: true }, message: '已添加到同步队列，将在网络恢复后同步' };
            }
        }

        try {
            const now = new Date();
            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
            
            const data = {
                project_id: recordData.project_id,
                record_date: recordData.record_date,
                team_name: recordData.team_name,
                team_leader: recordData.team_leader,
                work_days: parseFloat(recordData.work_days),
                worker_type: recordData.worker_type || '普工',
                unit_price: parseFloat(recordData.unit_price) || 0,
                amount: parseFloat(recordData.amount) || 0,
                description: recordData.description,
                image_ids: recordData.images || [],
                updated_at: beijingTime.toISOString()
            };

            let imagesToDelete = [];
            if (oldImageList && oldImageList.length > 0) {
                const currentImages = recordData.images || [];
                
                // 检查图片是否真的有变更（参考项目记账的实现）
                // 1. 检查图片数量是否不同
                // 2. 检查图片内容是否不同
                const isImageChanged = oldImageList.length !== currentImages.length || 
                    oldImageList.some((oldImg, index) => oldImg !== currentImages[index]);
                
                // 额外检查：当图片数量相同时，检查内容是否完全相同
                let isActuallyChanged = isImageChanged;
                if (oldImageList.length === currentImages.length) {
                    // 检查两个数组的内容是否完全相同
                    const isSameImages = oldImageList.every((img, index) => img === currentImages[index]);
                    
                    if (isSameImages) {
                        isActuallyChanged = false;
                    }
                } else if (currentImages.length < oldImageList.length) {
                    // 图片数量减少，说明用户删除了图片，需要处理图片删除
                    isActuallyChanged = true;
                }
                
                // 只有在图片真的变更时，才处理删除操作
                if (isActuallyChanged) {
                    imagesToDelete = oldImageList.filter(oldImg => 
                        !currentImages.some(newImg => newImg === oldImg)
                    );
                }
            }

            if (imagesToDelete.length > 0) {
                try {
                    const filePaths = imagesToDelete.map(url => {
                        const urlParts = url.split('/FYKQ/');
                        if (urlParts.length > 1) {
                            return decodeURIComponent(urlParts[1]);
                        }
                        return null;
                    }).filter(path => path !== null);

                    if (filePaths.length > 0) {
                        const { error: deleteImageError } = await this.supabase
                            .storage
                            .from('FYKQ')
                            .remove(filePaths);

                        if (deleteImageError) {
                            console.error('删除旧图片失败:', deleteImageError);
                        } else {
                            console.log('成功删除旧图片:', filePaths.length);
                        }
                    }
                } catch (imageError) {
                    console.error('处理图片删除时出错:', imageError);
                }
            }

            const { data: result, error } = await this.supabase
                .from('work_records')
                .update(data)
                .eq('work_record_id', id)
                .select();

            if (error) {
                throw error;
            }

            if (result && result.length > 0) {
                this._saveOnlineRecordToLocal(result[0]);
            }

            return { success: true, data: result };
        } catch (error) {
            console.error('更新点工单失败:', error);
            try {
                await this._updateRecordInLocalStorage(id, recordData);
                
                const now = new Date();
                const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
                
                // 构造与在线模式一致的数据结构
                const data = {
                    project_id: recordData.project_id,
                    record_date: recordData.record_date,
                    team_name: recordData.team_name,
                    team_leader: recordData.team_leader,
                    work_days: parseFloat(recordData.work_days),
                    worker_type: recordData.worker_type || '普工',
                    unit_price: parseFloat(recordData.unit_price) || 0,
                    amount: parseFloat(recordData.amount) || 0,
                    description: recordData.description,
                    image_ids: recordData.images || [],
                    updated_at: beijingTime.toISOString()
                };

                let imagesToDelete = [];
                if (oldImageList && oldImageList.length > 0) {
                    const currentImages = recordData.images || [];
                    
                    // 检查图片是否真的有变更（参考项目记账的实现）
                    // 1. 检查图片数量是否不同
                    // 2. 检查图片内容是否不同
                    const isImageChanged = oldImageList.length !== currentImages.length || 
                        oldImageList.some((oldImg, index) => oldImg !== currentImages[index]);
                    
                    // 额外检查：当图片数量相同时，检查内容是否完全相同
                    let isActuallyChanged = isImageChanged;
                    if (oldImageList.length === currentImages.length) {
                        // 检查两个数组的内容是否完全相同
                        const isSameImages = oldImageList.every((img, index) => img === currentImages[index]);
                        
                        if (isSameImages) {
                            isActuallyChanged = false;
                        }
                    } else if (currentImages.length < oldImageList.length) {
                        // 图片数量减少，说明用户删除了图片，需要处理图片删除
                        isActuallyChanged = true;
                    }
                    
                    // 只有在图片真的变更时，才处理删除操作
                    if (isActuallyChanged) {
                        imagesToDelete = oldImageList.filter(oldImg => 
                            !currentImages.some(newImg => newImg === oldImg)
                        );
                    }
                }
                
                // 处理要删除的图片路径，与在线模式保持一致
                let filePathsToDelete = [];
                if (imagesToDelete.length > 0) {
                    filePathsToDelete = imagesToDelete.map(url => {
                        const urlParts = url.split('/FYKQ/');
                        if (urlParts.length > 1) {
                            return decodeURIComponent(urlParts[1]);
                        }
                        return null;
                    }).filter(path => path !== null);
                }
                
                if (window.offlineSyncService) {
                    window.offlineSyncService.addToSyncQueue('update', {
                        table: 'work_records',
                        work_record_id: id,
                        ...data,
                        old_images: oldImageList,
                        images_to_delete: filePathsToDelete
                    }, id, 'work_record');
                }
                return { success: true, data: { is_local: true }, message: '已保存到本地存储，将在网络恢复后同步' };
            } catch (localError) {
                console.error('保存到本地存储也失败:', localError);
                if (window.offlineSyncService) {
                    const now = new Date();
                    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
                    
                    const data = {
                        project_id: recordData.project_id,
                        record_date: recordData.record_date,
                        team_name: recordData.team_name,
                        team_leader: recordData.team_leader,
                        work_days: parseFloat(recordData.work_days),
                        worker_type: recordData.worker_type || '普工',
                        unit_price: parseFloat(recordData.unit_price) || 0,
                        amount: parseFloat(recordData.amount) || 0,
                        description: recordData.description,
                        image_ids: recordData.images || [],
                        updated_at: beijingTime.toISOString()
                    };

                    let imagesToDelete = [];
                    if (oldImageList && oldImageList.length > 0) {
                        const currentImages = recordData.images || [];
                        
                        // 检查图片是否真的有变更（参考项目记账的实现）
                        // 1. 检查图片数量是否不同
                        // 2. 检查图片内容是否不同
                        const isImageChanged = oldImageList.length !== currentImages.length || 
                            oldImageList.some((oldImg, index) => oldImg !== currentImages[index]);
                        
                        // 额外检查：当图片数量相同时，检查内容是否完全相同
                        let isActuallyChanged = isImageChanged;
                        if (oldImageList.length === currentImages.length) {
                            // 检查两个数组的内容是否完全相同
                            const isSameImages = oldImageList.every((img, index) => img === currentImages[index]);
                            
                            if (isSameImages) {
                                isActuallyChanged = false;
                            }
                        } else if (currentImages.length < oldImageList.length) {
                            // 图片数量减少，说明用户删除了图片，需要处理图片删除
                            isActuallyChanged = true;
                        }
                        
                        // 只有在图片真的变更时，才处理删除操作
                        if (isActuallyChanged) {
                            imagesToDelete = oldImageList.filter(oldImg => 
                                !currentImages.some(newImg => newImg === oldImg)
                            );
                        }
                    }
                    
                    let filePathsToDelete = [];
                    if (imagesToDelete.length > 0) {
                        filePathsToDelete = imagesToDelete.map(url => {
                            const urlParts = url.split('/FYKQ/');
                            if (urlParts.length > 1) {
                                return decodeURIComponent(urlParts[1]);
                            }
                            return null;
                        }).filter(path => path !== null);
                    }

                    window.offlineSyncService.addToSyncQueue('update', {
                        table: 'work_records',
                        work_record_id: id,
                        ...data,
                        old_images: oldImageList,
                        images_to_delete: filePathsToDelete
                    }, id, 'work_record');
                }
                return { success: true, data: { is_local: true }, message: '已添加到同步队列，将在网络恢复后同步' };
            }
        }
    }

    async deleteWorkRecord(id, imageIds = []) {
        try {
            const isOnline = navigator.onLine;
            
            if (isOnline) {
                // 删除记录关联的图片
                if (imageIds && imageIds.length > 0) {
                    try {
                        const filePaths = imageIds.map(url => {
                            // 从完整URL中提取文件路径
                            // URL格式: https://oydffrzzulsrbitrrhht.supabase.co/storage/v1/object/public/FYKQ/project_id/temporaryworker/filename.ext
                            const urlParts = url.split('/FYKQ/');
                            if (urlParts.length > 1) {
                                return decodeURIComponent(urlParts[1]);
                            }
                            return null;
                        }).filter(path => path !== null);

                        if (filePaths.length > 0) {
                            const { error: deleteImageError } = await this.supabase
                                .storage
                                .from('FYKQ')
                                .remove(filePaths);

                            if (deleteImageError) {
                                console.error('删除关联图片失败:', deleteImageError);
                                // 不阻断记录删除流程，仅记录错误
                            } else {
                                console.log('成功删除关联图片:', filePaths.length);
                            }
                        }
                    } catch (imageError) {
                        console.error('处理图片删除时出错:', imageError);
                    }
                }

                const { error } = await this.supabase
                    .from('work_records')
                    .delete()
                    .eq('work_record_id', id);
                
                if (error) {
                    throw error;
                }
            } else {
                // 离线模式：添加删除任务到同步队列
                if (window.offlineSyncService) {
                    // 添加记录删除任务
                    window.offlineSyncService.addToSyncQueue('delete', {
                        table: 'work_records',
                        work_record_id: id,
                        image_ids: imageIds
                    }, id, 'work_record');
                    
                    // 为每个图片单独添加删除任务到同步队列
                    if (imageIds && imageIds.length > 0) {
                        imageIds.forEach(imageUrl => {
                            // 从URL中提取存储桶和文件路径信息
                            // URL格式：https://oydffrzzulsrbitrrhht.supabase.co/storage/v1/object/public/FYKQ/project_id/temporaryworker/filename.ext
                            
                            // 查找"public/"的位置
                            const publicIndex = imageUrl.indexOf('public/');
                            if (publicIndex !== -1) {
                                // 提取完整的文件路径部分
                                const fullPath = imageUrl.substring(publicIndex + 'public/'.length);
                                
                                // 使用decodeURIComponent完全解码文件路径
                                const decodedPath = decodeURIComponent(fullPath);
                                
                                // 提取存储桶名称和文件路径
                                const pathParts = decodedPath.split('/');
                                const bucketName = pathParts[0];
                                const filePath = pathParts.slice(1).join('/');
                                
                                // 添加图片删除任务到同步队列
                                window.offlineSyncService.addToSyncQueue('删除_图片', {
                                    bucket_name: bucketName,
                                    file_path: filePath,
                                    image_url: imageUrl
                                }, `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, 'image');
                                
                                console.log('已添加图片删除任务到同步队列:', imageUrl);
                            }
                        });
                    }
                }
            }
            
            await this._deleteRecordFromLocalStorage(id);
            
            return { success: true };
        } catch (error) {
            console.error('删除点工单记录失败:', error);
            return { success: false, error: error.message };
        }
    }

    async _saveRecordToLocalStorage(recordData) {
        try {
            const recordId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const now = new Date();
            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
            
            const localRecord = {
                project_id: recordData.project_id,
                record_date: recordData.record_date,
                team_name: recordData.team_name,
                team_leader: recordData.team_leader,
                work_days: parseFloat(recordData.work_days),
                worker_type: recordData.worker_type || '普工',
                unit_price: parseFloat(recordData.unit_price) || 0,
                amount: parseFloat(recordData.amount) || 0,
                description: recordData.description,
                image_ids: recordData.images || [],
                work_record_id: recordId,
                created_at: beijingTime.toISOString(),
                updated_at: beijingTime.toISOString(),
                is_local: true
            };

            const localStorageKey = 'work_records';
            const records = JSON.parse(localStorage.getItem(localStorageKey) || '[]');
            records.push(localRecord);
            localStorage.setItem(localStorageKey, JSON.stringify(records));

            if (window.offlineSyncService) {
                window.offlineSyncService.addToSyncQueue('save_record', {
                    record: localRecord,
                    table: 'work_records'
                }, recordId, 'work_record');
            }
        } catch (error) {
            console.error('保存记录到本地存储失败:', error);
            throw error;
        }
    }

    async _updateRecordInLocalStorage(id, recordData) {
        try {
            const now = new Date();
            const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
            
            const localStorageKey = 'work_records';
            let existingRecords = [];
            const storedData = localStorage.getItem(localStorageKey);
            if (storedData) {
                existingRecords = JSON.parse(storedData);
            }
            
            const recordIndex = existingRecords.findIndex(record => record.work_record_id === id);
            if (recordIndex === -1) {
                // 如果本地存储中找不到记录，创建新记录
                const newRecord = {
                    project_id: recordData.project_id,
                    record_date: recordData.record_date,
                    team_name: recordData.team_name,
                    team_leader: recordData.team_leader,
                    work_days: parseFloat(recordData.work_days),
                    worker_type: recordData.worker_type || '普工',
                    unit_price: parseFloat(recordData.unit_price) || 0,
                    amount: parseFloat(recordData.amount) || 0,
                    description: recordData.description,
                    image_ids: recordData.images || [],
                    work_record_id: id,
                    created_at: beijingTime.toISOString(),
                    updated_at: beijingTime.toISOString(),
                    is_local: true
                };
                existingRecords.push(newRecord);
            } else {
                // 更新现有记录
                existingRecords[recordIndex] = {
                    ...existingRecords[recordIndex],
                    project_id: recordData.project_id,
                    record_date: recordData.record_date,
                    team_name: recordData.team_name,
                    team_leader: recordData.team_leader,
                    work_days: parseFloat(recordData.work_days),
                    worker_type: recordData.worker_type || '普工',
                    unit_price: parseFloat(recordData.unit_price) || 0,
                    amount: parseFloat(recordData.amount) || 0,
                    description: recordData.description,
                    image_ids: recordData.images || [],
                    updated_at: beijingTime.toISOString()
                };
            }
            
            localStorage.setItem(localStorageKey, JSON.stringify(existingRecords));
        } catch (error) {
            console.error('更新本地存储记录失败:', error);
        }
    }

    _saveOnlineRecordToLocal(record) {
        try {
            const localStorageKey = 'work_records';
            const records = JSON.parse(localStorage.getItem(localStorageKey) || '[]');
            
            const existingIndex = records.findIndex(r => r.work_record_id === record.work_record_id);
            
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

    async _deleteRecordFromLocalStorage(id) {
        try {
            const localStorageKeys = ['work_records'];
            
            for (const localStorageKey of localStorageKeys) {
                const storedData = localStorage.getItem(localStorageKey);
                if (storedData) {
                    const records = JSON.parse(storedData);
                    const updatedRecords = records.filter(record => record.work_record_id !== id);
                    localStorage.setItem(localStorageKey, JSON.stringify(updatedRecords));
                }
            }
        } catch (error) {
            console.error('从本地存储删除记录失败:', error);
        }
    }

    async handleImageUpload(images, projectId, recordDate) {
        if (!images || images.length === 0) {
            if (window.workRecordDetail && window.workRecordDetail.oldImageList) {
                return [...window.workRecordDetail.oldImageList];
            }
            return [];
        }

        const isOnline = navigator.onLine;
        let uploadedUrls = [];

        try {
            if (isOnline) {
                try {
                    uploadedUrls = await this._uploadImagesToSupabase(images, projectId, recordDate);
                } catch (supabaseError) {
                    console.warn('Supabase上传失败，回退到本地保存:', supabaseError);
                    uploadedUrls = await this._saveImagesToLocal(images, projectId, recordDate);
                }
            } else {
                uploadedUrls = await this._saveImagesToLocal(images, projectId, recordDate);
            }
        } catch (error) {
            console.error('图片处理失败:', error);
            uploadedUrls = [];
        }

        return uploadedUrls;
    }

    async _uploadImagesToSupabase(images, projectId, recordDate) {
        const uploadedUrls = [];
        const bucketName = 'FYKQ';
        const folderName = `${projectId}/temporaryworker`;
        const supabaseProjectId = 'oydffrzzulsrbitrrhht';

        for (const image of images) {
            if (!image || typeof image !== 'object') continue;

            try {
                const processedImage = await this._compressImage(image);
                
                let baseFileName = image.name;
                // 先尝试解码，防止文件名中包含编码后的路径分隔符（如 %2F）
                try {
                    baseFileName = decodeURIComponent(baseFileName);
                } catch (e) {
                    console.warn('文件名解码失败，使用原文件名:', e);
                }

                if (baseFileName.includes('/')) {
                    baseFileName = baseFileName.split('/').pop();
                } else if (baseFileName.includes('\\')) {
                    baseFileName = baseFileName.split('\\').pop();
                }
                
                const fileExtension = baseFileName.split('.').pop().toLowerCase();
                const originalName = baseFileName.substring(0, baseFileName.lastIndexOf('.'));
                
                let convertedName = originalName;
                if (/[\u4e00-\u9fa5]/.test(originalName)) {
                    convertedName = this._convertChineseToEnglish(originalName);
                }
                
                const uniqueFileName = convertedName;
                const fileName = `${folderName}/${uniqueFileName}.${fileExtension}`;

                await this._uploadFileWithTus(supabaseProjectId, bucketName, fileName, processedImage);
                
                const encodedFileName = encodeURIComponent(fileName);
                const imageUrl = `https://${supabaseProjectId}.supabase.co/storage/v1/object/public/${bucketName}/${encodedFileName}`;
                
                uploadedUrls.push(imageUrl);
            } catch (error) {
                console.error('上传图片失败:', error);
            }
        }

        return uploadedUrls;
    }

    async _saveImagesToLocal(images, projectId, recordDate) {
        const imageUrls = [];

        try {
            for (const image of images) {
                if (!image || typeof image !== 'object') continue;

                const fileExtension = image.name.split('.').pop().toLowerCase();
                const originalName = image.name.substring(0, image.name.lastIndexOf('.'));
                
                let convertedName = originalName;
                if (/[\u4e00-\u9fa5]/.test(originalName)) {
                    convertedName = this._convertChineseToEnglish(originalName);
                }
                
                const folderName = `${projectId}/temporaryworker`;
                const fileName = `${folderName}/${convertedName}.${fileExtension}`;

                const localImageUrl = await this._saveSingleImageToLocal(image, fileName);
                imageUrls.push(localImageUrl);

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

    async _saveSingleImageToLocal(image, fileName) {
        return new Promise((resolve, reject) => {
            try {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                    
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

    _convertChineseToEnglish(str) {
        if (!str) {
            return 'image';
        }
        
        let result = str;
        
        try {
            if (typeof window.pinyinPro !== 'undefined' && typeof window.pinyinPro.pinyin === 'function') {
                result = window.pinyinPro.pinyin(result, {
                    tone: false,
                    type: 'string',
                    separator: ''
                });
                result = result
                    .replace(/[āáǎà]/g, 'a')
                    .replace(/[ōóǒò]/g, 'o')
                    .replace(/[ēéěè]/g, 'e')
                    .replace(/[īíǐì]/g, 'i')
                    .replace(/[ūúǔù]/g, 'u')
                    .replace(/[ǖǘǚǜü]/g, 'v')
                    .replace(/[^a-zA-Z0-9_.-]/g, '_');
            } else {
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
                
                let pinyinResult = '';
                for (let char of result) {
                    if (pinyinMap[char]) {
                        pinyinResult += pinyinMap[char] + '_';
                    } else {
                        pinyinResult += char;
                    }
                }
                result = pinyinResult.replace(/_$/, '');
            }
        } catch (error) {
            console.error('中文转拼音失败:', error);
        }
        
        result = result.replace(/_+/g, '_');
        result = result.replace(/^_|_$/g, '');
        
        if (!result || result.trim() === '') {
            result = 'image';
        }
        
        return result;
    }

    async _compressImage(file) {
        return new Promise((resolve) => {
            if (file.size < 500 * 1024) {
                resolve(file);
                return;
            }

            if (typeof window.Compressor === 'undefined') {
                console.warn('Compressor.js未加载，跳过图片压缩');
                resolve(file);
                return;
            }

            new window.Compressor(file, {
                quality: 0.8,
                maxWidth: 1920,
                maxHeight: 1080,
                convertSize: 1000000,
                success(compressedFile) {
                    console.log(`图片压缩完成: ${file.name} (${(file.size / 1024).toFixed(2)}KB) -> ${compressedFile.name} (${(compressedFile.size / 1024).toFixed(2)}KB)`);
                    resolve(compressedFile);
                },
                error(error) {
                    console.error('图片压缩失败:', error);
                    resolve(file);
                }
            });
        });
    }

    async _uploadFileWithTus(supabaseProjectId, bucketName, fileName, file) {
        return new Promise((resolve, reject) => {
            const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95ZGZmcnp6dWxzcmJpdHJyaGh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MjcxNDEsImV4cCI6MjA3OTAwMzE0MX0.LFMDgx8eNyE3pVjVYgHqhtvaC--vP4-MtXL8fY3_v-s';

            // 移除metadata中的JSON.stringify嵌套，直接使用对象
            // 某些版本的TUS客户端或服务器端可能对嵌套的JSON字符串处理有问题
            const metadata = {
                bucketName: bucketName,
                objectName: fileName,
                contentType: file.type || 'image/png',
                cacheControl: '3600'
            };

            const upload = new window.tus.Upload(file, {
                endpoint: `https://${supabaseProjectId}.supabase.co/storage/v1/upload/resumable`,
                retryDelays: [0, 3000, 5000, 10000, 20000],
                headers: {
                    authorization: `Bearer ${token}`,
                    'x-upsert': 'true',
                },
                metadata: metadata,
                uploadDataDuringCreation: true,
                removeFingerprintOnSuccess: true,
                chunkSize: 6 * 1024 * 1024,
                onSuccess: () => {
                    resolve();
                },
                onError: (error) => {
                    console.error('Tus上传失败:', error);
                    // 如果是400错误，可能是因为重复上传或key冲突，尝试使用普通上传或忽略错误
                    if (error.originalRequest && error.originalRequest.status === 400) {
                        console.warn('Tus上传遇到400错误，尝试继续流程:', error);
                        resolve(); // 暂时视为成功，让流程继续，可能是因为文件已存在
                    } else {
                        reject(error);
                    }
                },
                onProgress: (bytesUploaded, bytesTotal) => {
                    const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
                }
            });

            upload.findPreviousUploads().then(function (previousUploads) {
                if (previousUploads.length) {
                    upload.resumeFromPreviousUpload(previousUploads[0]);
                }
            });

            upload.start();
        });
    }
}

async function initWorkRecordAPI() {
    try {
        await window.waitForSupabase();
        window.workRecordAPI = new WorkRecordAPI();
    } catch (error) {
        console.error('初始化WorkRecordAPI失败:', error);
    }
}

document.addEventListener('DOMContentLoaded', initWorkRecordAPI);

async function saveWorkRecord() {
    try {
        if (!window.workRecordAPI) {
            showNotification('API正在初始化，请稍候重试', true);
            return;
        }
        
        const confirmBtn = document.getElementById('confirmAccountBtn');
        const isEditMode = confirmBtn && confirmBtn.dataset.editMode === 'true';
        
        const projectId = localStorage.getItem('currentProjectId');
        if (!projectId) {
            showNotification('未找到项目ID，请先选择项目', true);
            return;
        }
        
        const recordDate = document.getElementById('workDate').value;
        const teamName = document.getElementById('teamName').value;
        const teamLeader = document.getElementById('teamLeader').value;
        const workDays = document.getElementById('workDays').value;
        const workerTypeCheckbox = document.getElementById('workerType');
        if (!workerTypeCheckbox) {
            console.error('未找到workerType元素');
            showNotification('未找到工人类型选项，请刷新页面重试', true);
            return;
        }
        const workerType = workerTypeCheckbox.checked ? '技工' : '普工';
        const unitPrice = document.getElementById('unitPrice').value;
        const amount = document.getElementById('amount').value;
        const description = document.getElementById('description').value;

        if (!recordDate) {
            showNotification('请选择日期', true);
            return;
        }
        if (!teamName || teamName.trim() === '') {
            showNotification('请输入班组', true);
            return;
        }
        if (!teamLeader || teamLeader.trim() === '') {
            showNotification('请输入班组长', true);
            return;
        }
        if (!workDays || workDays.trim() === '' || parseFloat(workDays) <= 0) {
            showNotification('请输入工日', true);
            return;
        }
        if (!description || description.trim() === '') {
            showNotification('请输入工作内容', true);
            return;
        }

        let images = [];
        if (window.selectedImages && window.selectedImages.length > 0) {
            images = window.selectedImages;
        }

        const workRecordAPI = window.workRecordAPI;
        const isOnline = navigator.onLine;
        if (isOnline) {
            if (isEditMode) {
                showNotification('修改中...', false);
            } else {
                showNotification('保存中...', false);
            }
        }

        let uploadedImages = [];
        let oldImages = [];
        
        if (isEditMode && window.workRecordDetail && window.workRecordDetail.oldImageList) {
            oldImages = [...window.workRecordDetail.oldImageList];
        }
        
        // 收集所有需要上传的图片
        let imagesToUpload = [];
        let keptImageUrls = [];

        for (const img of images) {
            if (img instanceof File || img instanceof Blob) {
                // 检查是否为已存在的图片（从云端加载的）
                if (img.isExisting && img.originalUrl) {
                    if (isEditMode) {
                        // 编辑模式：所有图片（包括已存在的）都重新上传
                        // 这样可以确保如果文件名有变化（比如中文转拼音），或者存储策略有变化，能更新到最新状态
                        imagesToUpload.push(img);
                    } else {
                        // 非编辑模式：已存在的图片直接使用原始URL
                        keptImageUrls.push(img.originalUrl);
                    }
                } else {
                    // 新上传的图片，需要上传
                    imagesToUpload.push(img);
                }
            } else if (typeof img === 'string') {
                // 字符串URL直接保留
                keptImageUrls.push(img);
            }
        }
        
        const imageContainer = document.getElementById('imageUploadContainer');
        const imagePreviews = imageContainer ? imageContainer.querySelectorAll('.image-preview-item') : [];
        
        let newImageUrls = [];
        // 如果有图片需要上传
        if (imagesToUpload.length > 0) {
            if (isOnline) {
                newImageUrls = await workRecordAPI._uploadImagesToSupabase(imagesToUpload, projectId, recordDate);
            } else {
                newImageUrls = await workRecordAPI._saveImagesToLocal(imagesToUpload, projectId, recordDate);
            }
        }
        
        // 合并图片URL：保留的字符串URL + 新上传的图片URL
        // 过滤掉可能的空值
        uploadedImages = [...keptImageUrls, ...newImageUrls].filter(url => url && typeof url === 'string');
        
        // 标记是否有新上传的图片（用于后续判断是否需要检查图片变更）
        let hasNewUploads = newImageUrls.length > 0;
        
        if (window.selectedImages) {
            window.selectedImages = [];
        }

        let result;
        const recordData = {
            project_id: projectId,
            record_date: recordDate,
            team_name: teamName,
            team_leader: teamLeader,
            work_days: workDays,
            worker_type: workerType,
            unit_price: unitPrice,
            amount: amount,
            description: description,
            images: uploadedImages
        };

        let editingRecordId = null;
        if (isEditMode) {
            // 优先从按钮的dataset中获取记录ID
            if (confirmBtn && confirmBtn.dataset.recordId) {
                editingRecordId = confirmBtn.dataset.recordId;
            } else if (window.workRecordDetail && window.workRecordDetail.editingRecordId) {
                editingRecordId = window.workRecordDetail.editingRecordId;
            }
        }

        // 过滤 oldImages，只保留真正被用户删除的图片
        // 排除掉那些在当前 images 列表里依然存在（isExisting=true）的图片
        if (isEditMode && oldImages.length > 0) {
            const keepUrls = new Set();
            for (const img of images) {
                if ((img instanceof File || img instanceof Blob) && img.isExisting && img.originalUrl) {
                    keepUrls.add(img.originalUrl);
                } else if (typeof img === 'string') {
                     // 如果是字符串类型的图片（未修改的），也加入保留列表
                     keepUrls.add(img);
                }
            }
            
            // 只有那些不在 keepUrls 里的 oldImages 才是真正被删除的
            // 我们把 oldImages 替换为“待删除的旧图片列表”，传给 updateWorkRecord
            // 这样 updateWorkRecord 内部计算 imagesToDelete 时，就会基于这个列表
            oldImages = oldImages.filter(url => !keepUrls.has(url));
        }

        if (isEditMode && editingRecordId) {
            result = await workRecordAPI.updateWorkRecord(editingRecordId, recordData, oldImages);
        } else {
            result = await workRecordAPI.saveWorkRecord(recordData);
        }

        if (result.success) {
            if (result.data && result.data.is_local) {
                showNotification('已保存到本地存储，将在网络恢复后同步', false);
                playSuccessSound();
            } else {
                if (isEditMode) {
                    showNotification('修改成功', false);
                } else {
                    showNotification('保存成功', false);
                }
                playSuccessSound();
            }
            resetWorkRecordForm();
            
            // 如果是编辑模式，修改成功后进入明细界面
            if (isEditMode) {
                setTimeout(() => {
                    // 切换到明细标签页
                    const detailTab = document.getElementById('tabWorkFlow');
                    if (detailTab) {
                        detailTab.checked = true;
                        // 触发标签切换事件
                        detailTab.dispatchEvent(new Event('change'));
                    }
                }, 500);
            }
        } else {
            showNotification('保存失败: ' + (result.error || '未知错误'), true);
        }
    } catch (error) {
        console.error('保存点工单记录失败:', error);
        showNotification('保存失败，请重试', true);
    }
}

function resetWorkRecordForm() {
    const inputs = [
        'teamName', 'teamLeader', 'workDays',
        'unitPrice', 'amount', 'description'
    ];
    
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.value = '';
            // 重置输入框样式
            element.style.border = '';
            element.style.backgroundColor = '';
            element.style.boxShadow = '';
            element.classList.remove('has-value');
        }
    });
    
    // 重置日期显示为当前日期
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    // 格式化日期显示：yyyy年MM月dd日
    const displayStr = `${year}年${month}月${day}日`;
    // 添加今天标识
    const displayHtml = `${displayStr}<span class="today-text">（今天）</span>`;

    const dateDisplay = document.getElementById('dateDisplay');
    if (dateDisplay) {
        dateDisplay.innerHTML = displayHtml;
        dateDisplay.classList.add('today');
    }
    const workDateInput = document.getElementById('workDate');
    if (workDateInput) {
        workDateInput.value = todayStr;
        delete workDateInput.dataset.displayValue;
        delete workDateInput.dataset.selectAll;
        workDateInput.setAttribute('data-today', 'true');
    }
    
    const workerType = document.getElementById('workerType');
    if (workerType) {
        workerType.checked = true;
    }
    
    const imageUpload = document.getElementById('imageUpload');
    if (imageUpload) {
        imageUpload.value = '';
    }
    
    const imageUploadContainer = document.getElementById('imageUploadContainer');
    if (imageUploadContainer) {
        // 只移除预览图片，保留上传按钮
        const items = imageUploadContainer.querySelectorAll('.image-preview-item');
        items.forEach(item => item.remove());
        
        // 如果上传按钮意外丢失，重新添加
        if (!imageUploadContainer.querySelector('.image-upload-item')) {
            const initialItem = document.createElement('div');
            initialItem.className = 'image-upload-item';
            initialItem.innerHTML = `
                <label for="imageUpload" style="display: block; width: 100px; height: 100px; border: 1px dashed #ddd; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                    <div style="text-align: center;">
                        <div style="font-size: 24px; color: #999; margin-bottom: 5px;">+</div>
                        <div style="font-size: 12px; color: #999;">添加图片</div>
                    </div>
                </label>
            `;
            imageUploadContainer.appendChild(initialItem);
        }
    }
    
    const confirmBtn = document.getElementById('confirmAccountBtn');
    if (confirmBtn) {
        confirmBtn.textContent = '保存';
        delete confirmBtn.dataset.editMode;
        delete confirmBtn.dataset.recordId;
    }
    
    if (window.workRecordDetail) {
        window.workRecordDetail.editingRecordId = null;
        window.workRecordDetail.oldImageList = null;
    }
}

window.saveWorkRecord = saveWorkRecord;
window.resetWorkRecordForm = resetWorkRecordForm;

function showNotification(message, isError = false) {
    const existingNotifications = document.querySelectorAll('div[style*="position: fixed"][style*="top: 50%"][style*="left: 50%"]');
    existingNotifications.forEach(notification => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    });

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

    notification.style.backgroundColor = isError ? '#ff4d4f' : '#52c41a';
    notification.textContent = message;

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

    document.body.appendChild(notification);

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
 */
function playSuccessSound() {
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
        playTone(523.25, now, 0.15);
        playTone(659.25, now + 0.15, 0.15);
        playTone(783.99, now + 0.3, 0.25);

        console.log('成功提示音已播放');
    } catch (e) {
        console.log('音频播放失败:', e);
    }
}

window.showNotification = showNotification;
