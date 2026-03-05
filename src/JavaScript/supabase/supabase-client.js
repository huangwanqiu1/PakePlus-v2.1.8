// Supabase 客户端封装模块
// 提供统一的Supabase客户端初始化和配置功能

// 确保Supabase客户端库已加载，如果未加载则动态引入
(function() {
    // 检查Supabase库是否已加载
    if (typeof window.supabase === 'undefined') {
        // 优先尝试加载本地Supabase客户端库
        const script = document.createElement('script');
        script.src = './supabase.min.js';
        script.async = false; // 同步加载以确保库在初始化前可用
        script.onload = initSupabaseClient;
        script.onerror = function() {
            // 如果本地库加载失败，回退到CDN
            console.warn('本地Supabase库加载失败，正在从CDN加载...');
            const cdnScript = document.createElement('script');
            cdnScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            cdnScript.async = false;
            cdnScript.onload = initSupabaseClient;
            cdnScript.onerror = handleSupabaseLoadError;
            document.head.appendChild(cdnScript);
        };
        document.head.appendChild(script);
    } else {
        // 如果库已存在，直接初始化
        initSupabaseClient();
    }

    // Supabase客户端初始化函数
    function initSupabaseClient() {
        try {
            // Supabase配置
            const supabaseUrl = 'https://oydffrzzulsrbitrrhht.supabase.co';
            const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95ZGZmcnp6dWxzcmJpdHJyaGh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MjcxNDEsImV4cCI6MjA3OTAwMzE0MX0.LFMDgx8eNyE3pVjVYgHqhtvaC--vP4-MtXL8fY3_v-s';
            
            // 创建客户端实例时配置全局头信息
            window.supabase = supabase.createClient(supabaseUrl, supabaseKey, {
                auth: {
                    persistSession: false, // 禁用自动持久化会话
                    autoRefreshToken: false, // 禁用自动刷新令牌
                    detectSessionInUrl: false, // 禁用URL中的会话检测
                    storage: {
                        // 使用内存存储代替localStorage，避免使用cookie
                        getItem: () => null,
                        setItem: () => {},
                        removeItem: () => {}
                    }
                },
                global: {
                        fetch: async (url, options = {}) => {
                            // 获取当前会话，如果有用户登录则使用用户的访问令牌
                            const getCurrentAuthToken = async () => {
                                try {
                                    // 尝试从本地存储获取用户信息
                                    const currentUserStr = localStorage.getItem('currentUser');
                                    if (currentUserStr) {
                                        // 从本地存储的用户信息中获取令牌
                                        // 注意：这里我们不依赖Supabase的会话管理
                                        return supabaseKey; // 使用匿名密钥
                                    }
                                } catch (e) {
                                    // 如果获取失败，使用匿名密钥
                                    console.error('获取用户访问令牌失败:', e);
                                }
                                return supabaseKey;
                            };
                            
                            const authToken = await getCurrentAuthToken();
                            const headers = {
                                'Accept': 'application/json',
                                'Content-Type': 'application/json',
                                'apikey': supabaseKey,
                                'Authorization': `Bearer ${authToken}`,
                                ...options.headers
                            };
                            
                            // 拦截响应以添加调试信息
                            const originalFetch = window.fetch;
                            return originalFetch(url, { ...options, headers }).then(response => {
                                return response;
                            });
                        }
                    }
            });
            
            // 设置初始化状态
            window.supabaseInitStatus = {
                initialized: true,
                error: null
            };
            
            // 初始化成功，由调用方输出日志
            
            // 触发初始化成功事件
            const event = new CustomEvent('supabaseInitialized', { detail: { success: true } });
            window.dispatchEvent(event);
        } catch (error) {
            // Supabase初始化失败的错误日志已移除
            window.supabaseInitStatus = {
                initialized: false,
                error: error.message
            };
            
            // 触发初始化失败事件
            const event = new CustomEvent('supabaseInitialized', { 
                detail: { 
                    success: false, 
                    error: error.message 
                } 
            });
            window.dispatchEvent(event);
        }
    }
    
    // 处理Supabase库加载错误
    function handleSupabaseLoadError(error) {
        // Supabase库加载失败的错误日志已移除
        window.supabaseInitStatus = {
            initialized: false,
            error: 'Supabase库加载失败'
        };
        
        // 触发初始化失败事件
        const event = new CustomEvent('supabaseInitialized', { 
            detail: { 
                success: false, 
                error: 'Supabase库加载失败' 
            } 
        });
        window.dispatchEvent(event);
    }
    
    // 导出一个等待Supabase初始化完成的Promise
    window.waitForSupabase = function() {
        return new Promise((resolve, reject) => {
            // 如果已经初始化完成
            if (window.supabaseInitStatus) {
                if (window.supabaseInitStatus.initialized) {
                    resolve(window.supabase);
                } else {
                    reject(new Error(window.supabaseInitStatus.error));
                }
            } else {
                // 否则监听初始化事件
                window.addEventListener('supabaseInitialized', function handler(event) {
                    window.removeEventListener('supabaseInitialized', handler);
                    if (event.detail.success) {
                        resolve(window.supabase);
                    } else {
                        reject(new Error(event.detail.error));
                    }
                });
            }
        });
    };

    // 全局权限检查函数
    window.checkUserPermission = async function(projectId, permissionType) {
        if (!window.supabase) return false;
        
        // 1. 获取当前用户ID
        let userId = null;
        try {
            const { data: { user } } = await window.supabase.auth.getUser();
            if (user) userId = user.id;
        } catch(e) {}

        if (!userId) {
             const currentUserStr = localStorage.getItem('currentUser');
             if (currentUserStr) {
                 try {
                     const u = JSON.parse(currentUserStr);
                     userId = u.user_id || u.id;
                 } catch(e) {}
             }
        }
        
        if (!userId) return false;

        try {
            // 2. 检查是否为项目所有者 (Owner)
             const { data: project, error: pError } = await window.supabase
                .from('projects')
                .select('user_id')
                .eq('project_id', projectId)
                .single();
             
             if (!pError && project && project.user_id === userId) {
                 console.log('[Permission] User is Owner (auto-granted)');
                 return true;
             }

            // 3. 检查 user_projects 权限
            const { data: up, error: upError } = await window.supabase
                .from('user_projects')
                .select('*')
                .eq('user_id', userId)
                .eq('project_id', projectId)
                .single();
            
            if (upError || !up) {
                console.warn('[Permission] User not found in project or error:', upError);
                return false; // 不是项目成员
            }
            
            const key = permissionType;
            console.log(`[Permission] Checking ${key}: ${up[key]} (User: ${userId})`);
            
            // 如果字段存在且为false，则拒绝。默认(undefined/null)视为true (或者由数据库default控制)
            // 我们的SQL default是TRUE，所以新记录会有值。
            // 考虑到JS对象可能没有该字段（如果select *），Supabase select * 会返回所有字段。
            if (up[key] === false) return false;
            
            return true;
        } catch(e) {
            console.error('Permission check error:', e);
            return false;
        }
    };

})();