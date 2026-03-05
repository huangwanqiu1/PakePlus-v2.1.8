// 登录注册页面主逻辑

// 获取北京时间（UTC+8）的ISO字符串
function getBeijingTimeISOString() {
    const now = new Date();
    // 获取UTC时间并加上8小时
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return beijingTime.toISOString();
}

// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', function() {
    // 初始化页面功能
    initLoginPage();
});

/**
 * 初始化登录页面功能
 */
function initLoginPage() {
    console.log('初始化登录页面功能...');
    
    // 绑定表单切换事件
    bindFormSwitchEvents();
    
    // 绑定表单提交事件
    bindFormSubmitEvents();
    
    // 绑定实时验证事件
    bindRealTimeValidationEvents();
    
    // 执行数据处理流程
    executeDataProcessingFlow();
}

/**
 * 绑定表单切换事件
 */
function bindFormSwitchEvents() {
    // 确保全局函数可访问
    window.switchToLogin = switchToLogin;
    window.switchToRegister = switchToRegister;
}

/**
 * 切换到登录表单
 */
function switchToLogin() {
    // 获取表单元素
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    // 显示登录表单，隐藏注册表单
    if (loginForm) {
        loginForm.style.display = 'block';
        loginForm.classList.add('active');
    }
    
    if (registerForm) {
        registerForm.style.display = 'none';
        registerForm.classList.remove('active');
    }
    
    // 更新UI状态，如标题、提示等
    const pageTitle = document.querySelector('.login-page-title');
    if (pageTitle) {
        pageTitle.textContent = '登录';
    }
    
    console.log('切换到登录表单完成');
}

/**
 * 切换到注册表单
 */
function switchToRegister() {
    // 获取表单元素
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    // 显示注册表单，隐藏登录表单
    if (registerForm) {
        registerForm.style.display = 'block';
        registerForm.classList.add('active');
    }
    
    if (loginForm) {
        loginForm.style.display = 'none';
        loginForm.classList.remove('active');
    }
    
    // 更新UI状态，如标题、提示等
    const pageTitle = document.querySelector('.login-page-title');
    if (pageTitle) {
        pageTitle.textContent = '注册';
    }
    
    console.log('切换到注册表单完成');
}

/**
 * 绑定表单提交事件
 */
function bindFormSubmitEvents() {
    // 登录表单提交
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginSubmit);
    }
    
    // 注册表单提交
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegisterSubmit);
    }
}

/**
 * 绑定实时验证事件
 */
function bindRealTimeValidationEvents() {
    // 登录表单实时验证
    const loginPhoneInput = document.getElementById('loginPhone');
    const loginPasswordInput = document.getElementById('loginPassword');
    
    if (loginPhoneInput) {
        loginPhoneInput.addEventListener('input', () => {
            validateLoginForm(loginPhoneInput, loginPasswordInput);
        });
    }
    
    if (loginPasswordInput) {
        loginPasswordInput.addEventListener('input', () => {
            validateLoginForm(loginPhoneInput, loginPasswordInput);
        });
    }
    
    // 注册表单实时验证
    const registerNameInput = document.getElementById('registerName');
    const registerPhoneInput = document.getElementById('registerPhone');
    const registerPasswordInput = document.getElementById('registerPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    
    if (registerNameInput) {
        registerNameInput.addEventListener('input', () => {
            validateRegisterForm(registerNameInput, registerPhoneInput, registerPasswordInput, confirmPasswordInput);
        });
    }
    
    if (registerPhoneInput) {
        registerPhoneInput.addEventListener('input', () => {
            validateRegisterForm(registerNameInput, registerPhoneInput, registerPasswordInput, confirmPasswordInput);
        });
    }
    
    if (registerPasswordInput) {
        registerPasswordInput.addEventListener('input', () => {
            validateRegisterForm(registerNameInput, registerPhoneInput, registerPasswordInput, confirmPasswordInput);
        });
    }
    
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', () => {
            validateRegisterForm(registerNameInput, registerPhoneInput, registerPasswordInput, confirmPasswordInput);
        });
    }
}

/**
 * 执行数据处理流程
 * 简化为只使用Supabase，不再需要本地数据库同步逻辑
 */
function executeDataProcessingFlow() {
    // 精简日志输出
    console.log('页面加载完成，准备执行数据处理流程...');
    // 延迟执行，确保其他脚本已加载完成
    setTimeout(async () => {
        try {
            // 清除本地存储中可能存在的旧数据
            console.log('清除本地存储中的旧数据');
            localStorage.removeItem('localUsersData');
            localStorage.removeItem('syncTimestamp');
            
            // 不再需要本地数据库同步逻辑，直接使用Supabase进行操作
            console.log('✅ 数据处理流程执行成功！使用Supabase进行数据操作');
        } catch (error) {
            console.error('❌ 数据处理流程执行失败：', error);
        }
    }, 100);
}

/**
 * 处理登录表单提交
 * @param {Event} e - 提交事件
 */
async function handleLoginSubmit(e) {
    e.preventDefault();
    
    const loginPhoneInput = document.getElementById('loginPhone');
    const loginPasswordInput = document.getElementById('loginPassword');
    const loginButton = document.getElementById('loginButton');
    
    if (!validateLoginForm(loginPhoneInput, loginPasswordInput)) return;

    loginButton.disabled = true;
    loginButton.innerHTML = '<span class="loading"></span>登录中...';

    try {
        const phone = loginPhoneInput.value;
        const password = loginPasswordInput.value;
        
        // 第一次验证：查询所有phone字段数据并检查输入的手机号是否存在
        console.log('执行第一次验证');
        const { data: allUsers, error } = await window.supabase
            .from('users')
            .select('phone') // 只查询phone字段，减少数据传输
            .eq('phone', phone) // 直接查找匹配的手机号
            .limit(1); // 限制返回结果数量，提高查询效率
        
        // 检查查询结果
        
        // 检查查询是否成功
        if (error) {
            console.error('[错误] 查询手机号时出错:', error);
            showNotification('系统查询失败，请稍后重试', true);
            return;
        }
        
        // 检查手机号是否存在于查询结果中
        if (!allUsers || allUsers.length === 0) {
            console.log('[验证失败] 手机号未注册');
            showNotification('当前手机号未注册，请注册！', true);
            return;
        }
        
        console.log('[验证成功] 手机号已注册');
        
        // 手机号已存在，现在获取完整的用户信息用于密码验证
        const { data: userInfoData, error: userInfoError } = await window.supabase
            .from('users')
            .select('user_id, phone, login_name, password')
            .eq('phone', phone);
        
        // 检查查询是否成功
        if (userInfoError) {
            console.error('[错误] 获取用户信息时出错:', userInfoError);
            showNotification('系统查询失败，请稍后重试', true);
            return;
        }
        
        // 处理可能是数组的返回数据，获取第一个元素
        const userInfo = Array.isArray(userInfoData) && userInfoData.length > 0 ? userInfoData[0] : userInfoData;
        
        // 准备进行第二次验证
        
        // 第二次验证：验证密码是否正确
        console.log('执行第二次验证');
        
        // 安全比较密码，去除可能的空格并确保字段存在
        const dbPassword = userInfo?.password ? String(userInfo.password).trim() : '';
        const inputPassword = String(password).trim();
        
        if (userInfo && dbPassword === inputPassword) {
            console.log('[验证成功] 密码验证通过');
            // 登录成功，保存用户信息
            const userDataToSave = {
                user_id: userInfo.user_id,
                phone: userInfo.phone,
                login_name: userInfo.login_name,
                password: userInfo.password
            };
            localStorage.setItem('currentUser', JSON.stringify(userDataToSave));
            localStorage.setItem('loggedInPhone', phone);
            
            // 登录成功，准备跳转到首页
            showNotification('登录成功！');
            
            // 跳转到首页页面
            setTimeout(() => {
                window.location.href = '首页.html';
            }, 1500);
            return;
        } else {
            // 密码错误，显示错误提示
            console.log('[验证失败] 密码验证失败');
            showNotification('密码错误，请重新输入！', true);
            return;
        }

    } catch (error) {
        console.error('登录验证失败:', error);
        // 区分不同类型的错误
        if (error.code && error.code.includes('406')) {
            showNotification('服务暂时不可用，请稍后重试', true);
        } else if (error.code === 'PGRST116') {
            showNotification('手机号未注册，请先注册！', true);
        } else {
            showNotification('登录失败，请稍后重试', true);
        }
    } finally {
        loginButton.disabled = false;
        loginButton.innerHTML = '登录';
    }
}

/**
 * 处理注册表单提交
 * @param {Event} e - 提交事件
 */
async function handleRegisterSubmit(e) {
    e.preventDefault();
    
    const registerNameInput = document.getElementById('registerName');
    const registerPhoneInput = document.getElementById('registerPhone');
    const registerPasswordInput = document.getElementById('registerPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const registerButton = document.getElementById('registerButton');
    
    // 在函数顶部定义registerData变量，确保finally块可访问
    let registerData = {};
    
    try {
        if (!validateRegisterForm(registerNameInput, registerPhoneInput, registerPasswordInput, confirmPasswordInput)) return;

        registerButton.disabled = true;
        registerButton.innerHTML = '<span class="loading"></span>注册中...';

        const formData = new FormData(document.getElementById('registerForm'));
        registerData = {
            phone: formData.get('phone'),
            login_name: formData.get('login_name'), // 正确获取表单中的登录名
            password: formData.get('password'),
            // 不再手动生成user_id，由数据库自动生成UUID
            // created_at和updated_at由数据库自动生成
        };

        // 使用新增的初始化状态对象进行更详细的检查
        if (window.supabaseInitStatus && window.supabaseInitStatus.error) {
            console.error('Supabase初始化状态错误:', window.supabaseInitStatus.error);
            // 根据具体错误类型提供更精确的提示
            if (window.supabaseInitStatus.error.includes('CDN') || window.supabaseInitStatus.error.includes('加载')) {
                showNotification('网络连接问题：无法连接到服务。请检查网络连接后重试。', true);
            } else if (window.supabaseInitStatus.error.includes('createClient')) {
                showNotification('服务初始化失败：缺少必要组件。请刷新页面重试。', true);
            } else {
                showNotification('服务未就绪：' + window.supabaseInitStatus.error + '。请刷新页面重试。', true);
            }
            return;
        }
        
        // 检查Supabase客户端是否已初始化且功能完整
        if (!window.supabase) {
            console.error('Supabase客户端未初始化');
            showNotification('注册失败：服务连接中，请稍等片刻后重试', true);
            
            // 初始化失败，不进行重试
            return;
        }
        
        if (typeof window.supabase.from !== 'function') {
            console.error('Supabase客户端缺少必要功能');
            showNotification('注册失败：服务功能不完整，请刷新页面重试', true);
            return;
        }
        
        // Supabase客户端可用，继续处理
        
        // 输出手机号查询日志
        console.log('检查手机号是否已注册:', { phone: registerData.phone });
        
        // 使用Supabase检查手机号是否已注册
        const { data: existingUsers, error: queryError } = await window.supabase
            .from('users')
            .select('phone') // 只查询phone列，减少数据传输
            .eq('phone', registerData.phone)
            .limit(1);
            
        // 处理查询错误
        if (queryError) {
            console.error('查询手机号时出错:', queryError);
            showNotification('检查手机号时出错，请重试', true);
            return;
        }
        
        // 检查是否存在相同手机号
        if (existingUsers && existingUsers.length > 0) {
            showNotification('当前手机号已注册，请登录！', true);
            setTimeout(() => {
                // 切换到登录表单
                switchToLogin();
            }, 2000);
            return;
        }
        
        // 手机号未注册，可以继续注册流程
        console.log('手机号未注册，继续注册流程');

        // 清理和验证数据格式
        const sanitizedData = {
            phone: registerData.phone || '',
            login_name: registerData.login_name || 'user_' + Date.now(),
            password: registerData.password || '',
            // user_id、created_at和updated_at由数据库自动生成
        };
        
        // 准备上传清理后的用户数据到Supabase
        
        // 使用Supabase保存用户数据
        const { data, error: insertError } = await window.supabase
            .from('users')
            .insert([sanitizedData]) // 包装在数组中确保正确格式
            .select();
        
        // 检查数据上传结果
        
        if (insertError) {
            // 检测用户名或手机号冲突错误
            if (insertError.code === '23505') {
                if (insertError.details && insertError.details.includes('login_name')) {
                    showNotification('用户名已注册，请更换用户名！', true);
                } else if (insertError.details && insertError.details.includes('phone')) {
                    showNotification('手机号已注册，请更换手机号！', true);
                } else {
                    // 其他唯一约束冲突，输出日志
                    console.error('插入用户数据时出错:', insertError);
                    showNotification(`注册失败: ${insertError.message || '数据格式错误'}`, true);
                }
            } else {
                // 非唯一约束冲突，输出日志
                console.error('插入用户数据时出错:', insertError);
                showNotification(`注册失败: ${insertError.message || '数据格式错误'}`, true);
            }
            return;
        }
        
        if (data) {
            console.log('用户数据上传成功到Supabase:', data);
            showNotification('注册成功！即将跳转到登录界面', false);
            setTimeout(() => {
                // 切换到登录表单
                switchToLogin();
            }, 1500);
        } else {
            console.log('数据上传成功');
            showNotification('注册成功！即将跳转到登录界面', false);
            setTimeout(() => {
                switchToLogin();
            }, 1500);
        }
    } catch (error) {
        console.error('注册过程发生异常:', error);
        
        if (error.name === 'TypeError') {
            showNotification('注册失败：系统组件错误，请刷新页面重试', true);
        } else if (error.name === 'SyntaxError') {
            showNotification('注册失败：数据格式错误，请检查输入', true);
        } else if (error.message && error.message.includes('网络')) {
            showNotification('注册失败：网络连接异常，请检查网络后重试', true);
        } else {
            showNotification('注册失败：发生意外错误。错误信息：' + (error.message || '未知错误'), true);
        }
    } finally {
        // 无论成功或失败，都恢复按钮状态
        registerButton.disabled = false;
        registerButton.innerHTML = '注册';
        
        // 填充登录表单
        const loginPhoneInput = document.getElementById('loginPhone');
        const loginPasswordInput = document.getElementById('loginPassword');
        if (loginPhoneInput && loginPasswordInput) {
            loginPhoneInput.value = registerData.phone;
            loginPasswordInput.value = registerData.password;
        }
    }

}