(function () {
    function ensureModalElements() {
        const existing = document.getElementById('invalidImageCleanerModal');
        if (existing) return existing;

        const modal = document.createElement('div');
        modal.id = 'invalidImageCleanerModal';
        modal.className = 'modal';
        modal.style.display = 'none';

        const content = document.createElement('div');
        content.style.backgroundColor = '#fff';
        content.style.borderRadius = '12px';
        content.style.width = '420px';
        content.style.maxWidth = '92vw';
        content.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.2)';
        content.style.overflow = 'hidden';

        const header = document.createElement('div');
        header.style.padding = '14px 18px';
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.borderBottom = '1px solid #f0f0f0';

        const title = document.createElement('div');
        title.id = 'invalidImageCleanerModalTitle';
        title.style.fontSize = '16px';
        title.style.fontWeight = '600';
        title.style.color = '#333';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.id = 'invalidImageCleanerModalClose';
        closeBtn.textContent = '×';
        closeBtn.style.border = 'none';
        closeBtn.style.background = 'transparent';
        closeBtn.style.fontSize = '22px';
        closeBtn.style.lineHeight = '22px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.color = '#999';

        header.appendChild(title);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.id = 'invalidImageCleanerModalBody';
        body.style.padding = '16px 18px';
        body.style.color = '#333';
        body.style.fontSize = '14px';
        body.style.lineHeight = '1.6';
        body.style.whiteSpace = 'pre-line';

        const footer = document.createElement('div');
        footer.id = 'invalidImageCleanerModalFooter';
        footer.style.display = 'flex';
        footer.style.justifyContent = 'flex-end';
        footer.style.gap = '10px';
        footer.style.padding = '12px 18px 16px';
        footer.style.borderTop = '1px solid #f0f0f0';

        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);

        modal.appendChild(content);
        document.body.appendChild(modal);
        return modal;
    }

    function setButtonStyle(btn, variant) {
        btn.style.border = 'none';
        btn.style.borderRadius = '8px';
        btn.style.padding = '8px 14px';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '14px';
        btn.style.fontWeight = '500';
        btn.style.transition = 'all 0.2s ease';

        if (variant === 'primary') {
            btn.style.background = '#1890ff';
            btn.style.color = '#fff';
        } else if (variant === 'danger') {
            btn.style.background = '#ff4d4f';
            btn.style.color = '#fff';
        } else {
            btn.style.background = '#f5f5f5';
            btn.style.color = '#333';
        }
    }

    function openModal(options) {
        const modal = ensureModalElements();
        const titleEl = document.getElementById('invalidImageCleanerModalTitle');
        const bodyEl = document.getElementById('invalidImageCleanerModalBody');
        const footerEl = document.getElementById('invalidImageCleanerModalFooter');
        const closeBtn = document.getElementById('invalidImageCleanerModalClose');

        const title = options && options.title ? String(options.title) : '';
        const message = options && options.message ? String(options.message) : '';
        const buttons = options && Array.isArray(options.buttons) ? options.buttons : [];
        const closeOnBackdrop = options && options.closeOnBackdrop === true;

        titleEl.textContent = title;
        bodyEl.textContent = message;
        footerEl.innerHTML = '';

        modal.style.display = 'flex';

        return new Promise((resolve) => {
            let resolved = false;

            const cleanup = (value) => {
                if (resolved) return;
                resolved = true;
                modal.style.display = 'none';
                modal.removeEventListener('click', onBackdropClick, true);
                document.removeEventListener('keydown', onKeyDown, true);
                closeBtn.removeEventListener('click', onClose, true);
                resolve(value);
            };

            const onClose = (e) => {
                e.preventDefault();
                cleanup(null);
            };

            const onBackdropClick = (e) => {
                if (!closeOnBackdrop) return;
                if (e.target === modal) cleanup(null);
            };

            const onKeyDown = (e) => {
                if (e.key === 'Escape') cleanup(null);
            };

            closeBtn.addEventListener('click', onClose, true);
            modal.addEventListener('click', onBackdropClick, true);
            document.addEventListener('keydown', onKeyDown, true);

            const defaultButtons = buttons.length
                ? buttons
                : [{ text: '确定', value: true, variant: 'primary' }];

            let firstButtonEl = null;

            for (const b of defaultButtons) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = b.text || '确定';
                setButtonStyle(btn, b.variant || 'default');
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    cleanup(typeof b.value === 'undefined' ? true : b.value);
                });
                footerEl.appendChild(btn);
                if (!firstButtonEl) firstButtonEl = btn;
            }

            window.setTimeout(() => {
                if (firstButtonEl) firstButtonEl.focus();
            }, 0);
        });
    }

    async function showModalAlert(message, title) {
        await openModal({
            title: title || '提示',
            message: message || '',
            buttons: [{ text: '确定', value: true, variant: 'primary' }],
            closeOnBackdrop: true
        });
    }

    async function showModalConfirm(message, title, danger) {
        const value = await openModal({
            title: title || '确认',
            message: message || '',
            buttons: [
                { text: '取消', value: false, variant: 'default' },
                { text: '确定', value: true, variant: danger ? 'danger' : 'primary' }
            ],
            closeOnBackdrop: true
        });
        return value === true;
    }

    async function showModalChoice(options) {
        const title = options && options.title ? options.title : '请选择';
        const message = options && options.message ? options.message : '';
        const choices = options && Array.isArray(options.choices) ? options.choices : [];
        const buttons = choices.map(c => ({ text: c.text, value: c.value, variant: c.variant || 'default' }));
        return await openModal({ title, message, buttons, closeOnBackdrop: true });
    }

    function safeDecodeURIComponent(input) {
        if (typeof input !== 'string') return '';
        try {
            return decodeURIComponent(input);
        } catch (e) {
            return input;
        }
    }

    function normalizeImageIdToObjectRef(imageId) {
        if (typeof imageId !== 'string') return null;

        const trimmed = imageId.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('local://')) return null;

        if (/^https?:\/\//i.test(trimmed)) {
            const publicIndex = trimmed.indexOf('/storage/v1/object/public/');
            if (publicIndex !== -1) {
                const afterPublic = trimmed.slice(publicIndex + '/storage/v1/object/public/'.length);
                const firstSlash = afterPublic.indexOf('/');
                if (firstSlash !== -1) {
                    const bucket = afterPublic.slice(0, firstSlash);
                    const pathEncoded = afterPublic.slice(firstSlash + 1);
                    const path = safeDecodeURIComponent(pathEncoded).replace(/^\/+/, '');
                    if (bucket && path) return { bucket, path };
                }
            }

            const match = trimmed.match(/\/(FYKQ)\/(.+)$/i);
            if (match) {
                const bucket = match[1];
                const path = safeDecodeURIComponent(match[2]).replace(/^\/+/, '');
                if (bucket && path) return { bucket, path };
            }

            return null;
        }

        const raw = safeDecodeURIComponent(trimmed).replace(/^\/+/, '');

        if (raw.startsWith('public/')) {
            const after = raw.slice('public/'.length);
            const firstSlash = after.indexOf('/');
            if (firstSlash !== -1) {
                const bucket = after.slice(0, firstSlash);
                const path = after.slice(firstSlash + 1);
                if (bucket && path) return { bucket, path };
            }
        }

        return { bucket: 'FYKQ', path: raw };
    }

    function toArrayMaybeJson(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return [];
            try {
                const parsed = JSON.parse(trimmed);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                return [];
            }
        }
        return [];
    }

    function isImagePath(path) {
        if (typeof path !== 'string') return false;
        const lower = path.toLowerCase();
        return (
            lower.endsWith('.jpg') ||
            lower.endsWith('.jpeg') ||
            lower.endsWith('.png') ||
            lower.endsWith('.webp') ||
            lower.endsWith('.gif') ||
            lower.endsWith('.bmp') ||
            lower.endsWith('.heic') ||
            lower.endsWith('.heif')
        );
    }

    async function fetchReferencedObjectPathsForTable(supabase, tableName, projectId, bucketName, onProgress) {
        const referenced = new Set();
        const pageSize = 1000;
        let from = 0;

        while (true) {
            let query = supabase.from(tableName).select('image_ids');
            if (projectId) query = query.eq('project_id', projectId);
            query = query.range(from, from + pageSize - 1);

            const { data, error } = await query;
            if (error) throw error;
            if (!data || data.length === 0) break;

            for (const row of data) {
                const ids = toArrayMaybeJson(row.image_ids);
                for (const id of ids) {
                    const ref = normalizeImageIdToObjectRef(id);
                    if (!ref) continue;
                    if (ref.bucket !== bucketName) continue;
                    if (!ref.path) continue;
                    referenced.add(ref.path);
                }
            }

            if (typeof onProgress === 'function') {
                onProgress({ phase: 'scan_tables', tableName, fetchedRows: data.length, offset: from });
            }

            if (data.length < pageSize) break;
            from += pageSize;
        }

        return referenced;
    }

    async function fetchAllReferencedObjectPaths(supabase, projectId, bucketName, tables, onProgress) {
        const all = new Set();
        for (const tableName of tables) {
            const tableSet = await fetchReferencedObjectPathsForTable(supabase, tableName, projectId, bucketName, onProgress);
            for (const p of tableSet) all.add(p);
        }
        return all;
    }

    async function listAllObjectPaths(supabase, bucketName, prefix, onProgress) {
        const objects = [];
        const folders = [];
        const start = (prefix || '').replace(/\/+$/, '');
        folders.push(start);

        while (folders.length) {
            const current = folders.shift();
            const limit = 1000;
            let offset = 0;

            while (true) {
                const { data, error } = await supabase.storage.from(bucketName).list(current, {
                    limit,
                    offset,
                    sortBy: { column: 'name', order: 'asc' }
                });
                if (error) throw error;

                const items = Array.isArray(data) ? data : [];
                for (const item of items) {
                    if (!item || !item.name) continue;
                    if (item.name === '.emptyFolderPlaceholder') continue;

                    const isFolder = item.id == null && item.metadata == null;
                    if (isFolder) {
                        const nextFolder = current ? `${current}/${item.name}` : item.name;
                        folders.push(nextFolder);
                        continue;
                    }

                    const fullPath = current ? `${current}/${item.name}` : item.name;
                    if (isImagePath(fullPath)) objects.push(fullPath);
                }

                if (typeof onProgress === 'function') {
                    onProgress({ phase: 'list_bucket', folder: current || '/', returned: items.length, offset, imagesCollected: objects.length });
                }

                if (items.length < limit) break;
                offset += limit;
            }
        }

        return objects;
    }

    async function removeObjects(supabase, bucketName, paths, onProgress) {
        const batchSize = 100;
        let removed = 0;

        for (let i = 0; i < paths.length; i += batchSize) {
            const batch = paths.slice(i, i + batchSize);
            const { error } = await supabase.storage.from(bucketName).remove(batch);
            if (error) throw error;
            removed += batch.length;

            if (typeof onProgress === 'function') {
                onProgress({ phase: 'delete', removed, totalToDelete: paths.length });
            }
        }

        return removed;
    }

    async function cleanupInvalidImages(options) {
        const bucketName = options && options.bucketName ? options.bucketName : 'FYKQ';
        const scope = options && options.scope === 'global' ? 'global' : 'project';
        const requestedProjectId = options && typeof options.projectId === 'string' ? options.projectId : (localStorage.getItem('currentProjectId') || '');
        const projectId = scope === 'global' ? '' : requestedProjectId;
        const prefix = scope === 'global'
            ? ''
            : (options && typeof options.prefix === 'string' ? options.prefix : (projectId ? `${projectId}` : ''));
        const dryRun = !!(options && options.dryRun);
        const onProgress = options && typeof options.onProgress === 'function' ? options.onProgress : null;
        const tables = options && Array.isArray(options.tables) && options.tables.length
            ? options.tables
            : ['attendance_records', 'settlement_records', 'project_expenses', 'project_income', 'work_records', 'construction_logs'];

        const supabase = options && options.supabase ? options.supabase : await window.waitForSupabase();

        if (!bucketName) throw new Error('bucketName不能为空');

        if (typeof onProgress === 'function') onProgress({ phase: 'start', scope, bucketName, projectId, prefix, dryRun });

        const referenced = await fetchAllReferencedObjectPaths(supabase, projectId, bucketName, tables, onProgress);
        const objects = await listAllObjectPaths(supabase, bucketName, prefix, onProgress);

        const invalid = [];
        for (const p of objects) {
            if (!referenced.has(p)) invalid.push(p);
        }

        if (typeof onProgress === 'function') {
            onProgress({ phase: 'diff', referencedCount: referenced.size, bucketImagesCount: objects.length, invalidCount: invalid.length });
        }

        if (dryRun) {
            return { scope, bucketName, projectId, prefix, referencedCount: referenced.size, bucketImagesCount: objects.length, invalidCount: invalid.length, deletedCount: 0, invalidPaths: invalid };
        }

        const deletedCount = await removeObjects(supabase, bucketName, invalid, onProgress);
        return { scope, bucketName, projectId, prefix, referencedCount: referenced.size, bucketImagesCount: objects.length, invalidCount: invalid.length, deletedCount };
    }

    async function chooseCleanupScope(projectId) {
        const choice = await showModalChoice({
            title: '删除无效图片',
            message: '请选择清理范围：',
            choices: [
                { text: '仅当前项目', value: 'project', variant: 'primary' },
                { text: '全局清理', value: 'global', variant: 'danger' },
                { text: '取消', value: null, variant: 'default' }
            ]
        });

        if (!choice) return null;

        if (choice === 'project') {
            if (!projectId) {
                await showModalAlert('未找到当前项目ID，无法按项目清理。', '提示');
                return null;
            }
            const ok = await showModalConfirm('将清理当前项目目录下未被任何记录引用的图片，是否继续？', '确认', false);
            return ok ? 'project' : null;
        }

        const ok2 = await showModalConfirm('全局清理将遍历整个存储桶并删除未被任何记录引用的图片，风险较高，是否继续？', '高风险操作确认', true);
        return ok2 ? 'global' : null;
    }

    function buildProgressUpdater(statusEl) {
        if (!statusEl) return function () { };
        return function (p) {
            if (!p || !p.phase) return;
            if (p.phase === 'scan_tables') statusEl.textContent = `扫描引用中...`;
            else if (p.phase === 'list_bucket') statusEl.textContent = `列举存储中...`;
            else if (p.phase === 'delete') statusEl.textContent = `删除中... (${p.removed || 0}/${p.totalToDelete || 0})`;
            else if (p.phase === 'diff') statusEl.textContent = `对比中...`;
        };
    }

    async function bindCleanupButton(buttonId) {
        const btn = document.getElementById(buttonId);
        if (!btn) return;

        btn.addEventListener('click', async function (e) {
            e.preventDefault();
            e.stopPropagation();

            if (btn.disabled) return;

            const projectName = localStorage.getItem('currentProjectName') || '';
            const projectId = localStorage.getItem('currentProjectId') || '';
            const tipProject = projectName ? `【${projectName}】` : (projectId ? `【${projectId}】` : '');
            const scope = await chooseCleanupScope(projectId);
            if (!scope) return;

            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = '清理中...';

            try {
                const result = await cleanupInvalidImages({
                    projectId,
                    scope,
                    bucketName: 'FYKQ',
                    onProgress: function () { }
                });
                await showModalAlert(`清理完成：共删除 ${result.deletedCount} 张无效图片`, '完成');
            } catch (err) {
                await showModalAlert(`清理失败：${err && err.message ? err.message : String(err)}`, '失败');
            } finally {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        });
    }

    async function bindCleanupCard(cardId, statusId) {
        const card = document.getElementById(cardId);
        if (!card) return;

        const statusEl = statusId ? document.getElementById(statusId) : null;

        card.addEventListener('click', async function (e) {
            e.preventDefault();
            e.stopPropagation();

            if (card.classList.contains('is-disabled')) return;

            const projectName = localStorage.getItem('currentProjectName') || '';
            const projectId = localStorage.getItem('currentProjectId') || '';
            const tipProject = projectName ? `【${projectName}】` : (projectId ? `【${projectId}】` : '');
            const scope = await chooseCleanupScope(projectId);
            if (!scope) return;

            const originalStatus = statusEl ? statusEl.textContent : '';
            card.classList.add('is-disabled');
            if (statusEl) statusEl.textContent = '清理中...';

            try {
                const onProgress = buildProgressUpdater(statusEl);
                const result = await cleanupInvalidImages({
                    projectId,
                    scope,
                    bucketName: 'FYKQ',
                    onProgress
                });
                if (statusEl) statusEl.textContent = '点击清理';
                await showModalAlert(`清理完成：共删除 ${result.deletedCount} 张无效图片`, '完成');
            } catch (err) {
                if (statusEl) statusEl.textContent = originalStatus || '点击清理';
                await showModalAlert(`清理失败：${err && err.message ? err.message : String(err)}`, '失败');
            } finally {
                card.classList.remove('is-disabled');
            }
        });
    }

    window.InvalidImageCleaner = {
        cleanupInvalidImages,
        bindCleanupButton,
        bindCleanupCard
    };

    document.addEventListener('DOMContentLoaded', function () {
        bindCleanupButton('cleanInvalidImagesBtn');
        bindCleanupCard('cleanInvalidImagesCard', 'cleanInvalidImagesStatus');
    });
})();
