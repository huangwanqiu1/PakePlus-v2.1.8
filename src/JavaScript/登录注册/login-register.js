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
    
    // 显示描述文字
    const authDescription = document.getElementById('auth-description');
    if (authDescription) {
        authDescription.style.display = 'block';
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
    
    // 隐藏描述文字
    const authDescription = document.getElementById('auth-description');
    if (authDescription) {
        authDescription.style.display = 'none';
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
    const registerEmailInput = document.getElementById('registerEmail');
    const registerPasswordInput = document.getElementById('registerPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    
    if (registerNameInput) {
        registerNameInput.addEventListener('input', () => {
            validateRegisterForm(registerNameInput, registerPhoneInput, registerEmailInput, registerPasswordInput, confirmPasswordInput);
        });
    }
    
    if (registerPhoneInput) {
        registerPhoneInput.addEventListener('input', () => {
            validateRegisterForm(registerNameInput, registerPhoneInput, registerEmailInput, registerPasswordInput, confirmPasswordInput);
        });
    }
    
    if (registerEmailInput) {
        registerEmailInput.addEventListener('input', () => {
            validateRegisterForm(registerNameInput, registerPhoneInput, registerEmailInput, registerPasswordInput, confirmPasswordInput);
        });
    }
    
    if (registerPasswordInput) {
        registerPasswordInput.addEventListener('input', () => {
            validateRegisterForm(registerNameInput, registerPhoneInput, registerEmailInput, registerPasswordInput, confirmPasswordInput);
        });
    }
    
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', () => {
            validateRegisterForm(registerNameInput, registerPhoneInput, registerEmailInput, registerPasswordInput, confirmPasswordInput);
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
        
        if (!window.supabase) {
            console.error('Supabase客户端未初始化');
            showNotification('系统初始化失败，请刷新页面重试', true);
            return;
        }
        
        console.log('执行第一步：通过手机号查询用户信息');
        
        const { data: userInfoData, error: userInfoError } = await window.supabase
            .rpc('check_phone_exists', { phone_number: phone });
        
        if (userInfoError) {
            console.error('[错误] 获取用户信息时出错:', userInfoError);
            showNotification('系统查询失败，请稍后重试', true);
            return;
        }
        
        if (!userInfoData || userInfoData.length === 0) {
            console.log('[验证失败] 手机号未注册');
            showNotification('当前手机号未注册，请注册！', true);
            return;
        }
        
        const userInfo = userInfoData[0];
        console.log('[验证成功] 手机号已注册，用户信息:', userInfo);
        
        console.log('执行第二步：使用邮箱和密码登录');
        const { data: authData, error: authError } = await window.supabase.auth.signInWithPassword({
            email: userInfo.email,
            password: password
        });
        
        if (authError) {
            console.error('[错误] 登录失败:', authError);
            if (authError.code === '400') {
                showNotification('密码错误，请重新输入！', true);
            } else if (authError.code === '401') {
                showNotification('认证失败，请检查邮箱和密码', true);
            } else {
                showNotification('登录失败：' + authError.message, true);
            }
            return;
        }
        
        console.log('[验证成功] 登录成功:', authData);
        
        const userDataToSave = {
            user_id: userInfo.user_id,
            phone: phone,
            login_name: userInfo.login_name,
            email: userInfo.email
        };
        localStorage.setItem('currentUser', JSON.stringify(userDataToSave));
        localStorage.setItem('loggedInPhone', phone);
        
        showNotification('登录成功！');
        
        setTimeout(() => {
            window.location.href = '首页.html';
        }, 1500);
        return;

    } catch (error) {
        console.error('登录验证失败:', error);
        if (error.code && error.code.includes('406')) {
            showNotification('服务暂时不可用，请稍后重试', true);
        } else if (error.code === 'PGRST116') {
            showNotification('手机号未注册，请先注册！', true);
        } else if (error.name === 'TypeError') {
            showNotification('系统错误，请刷新页面重试', true);
        } else if (error.message && error.message.includes('网络')) {
            showNotification('网络连接异常，请检查网络后重试', true);
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
    const registerEmailInput = document.getElementById('registerEmail');
    const registerPasswordInput = document.getElementById('registerPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const registerButton = document.getElementById('registerButton');
    
    let registerData = {};
    
    try {
        if (!validateRegisterForm(registerNameInput, registerPhoneInput, registerEmailInput, registerPasswordInput, confirmPasswordInput)) return;

        registerButton.disabled = true;
        registerButton.innerHTML = '<span class="loading"></span>注册中...';

        const formData = new FormData(document.getElementById('registerForm'));
        registerData = {
            phone: formData.get('phone'),
            email: formData.get('email'),
            login_name: formData.get('login_name'),
            password: formData.get('password')
        };

        if (window.supabaseInitStatus && window.supabaseInitStatus.error) {
            console.error('Supabase初始化状态错误:', window.supabaseInitStatus.error);
            if (window.supabaseInitStatus.error.includes('CDN') || window.supabaseInitStatus.error.includes('加载')) {
                showNotification('网络连接问题：无法连接到服务。请检查网络连接后重试。', true);
            } else if (window.supabaseInitStatus.error.includes('createClient')) {
                showNotification('服务初始化失败：缺少必要组件。请刷新页面重试。', true);
            } else {
                showNotification('服务未就绪：' + window.supabaseInitStatus.error + '。请刷新页面重试', true);
            }
            return;
        }
        
        if (!window.supabase) {
            console.error('Supabase客户端未初始化');
            showNotification('注册失败：服务连接中，请稍等片刻后重试', true);
            return;
        }
        
        if (typeof window.supabase.from !== 'function') {
            console.error('Supabase客户端缺少必要功能');
            showNotification('注册失败：服务功能不完整，请刷新页面重试', true);
            return;
        }
        
        console.log('第一步：检查手机号是否已注册:', { phone: registerData.phone });
        
        const { data: phoneExistsData, error: phoneQueryError } = await window.supabase
            .rpc('check_phone_exists', { phone_number: registerData.phone });
            
        if (phoneQueryError) {
            console.error('查询手机号时出错:', phoneQueryError);
            showNotification('检查手机号时出错，请重试', true);
            return;
        }
        
        if (phoneExistsData && phoneExistsData.length > 0) {
            showNotification('当前手机号已注册，请登录！', true);
            setTimeout(() => {
                switchToLogin();
            }, 2000);
            return;
        }
        
        console.log('第二步：检查邮箱是否已注册:', { email: registerData.email });
        
        const { data: emailExistsData, error: emailQueryError } = await window.supabase
            .rpc('check_email_exists', { email_address: registerData.email });
            
        if (emailQueryError) {
            console.error('查询邮箱时出错:', emailQueryError);
            showNotification('检查邮箱时出错，请重试', true);
            return;
        }
        
        if (emailExistsData === true) {
            showNotification('当前邮箱已注册，请更换邮箱！', true);
            return;
        }
        
        console.log('第三步：使用邮箱和密码注册Supabase Auth');
        
        const { data: authData, error: authError } = await window.supabase.auth.signUp({
            email: registerData.email,
            password: registerData.password,
            options: {
                data: {
                    login_name: registerData.login_name,
                    phone: registerData.phone
                }
            }
        });
        
        if (authError) {
            console.error('注册Supabase Auth失败:', authError);
            
            if (authError.message && authError.message.includes('rate limit')) {
                showNotification('注册过于频繁，请1小时后再试或联系管理员', true);
            } else if (authError.message && authError.message.includes('already been registered')) {
                showNotification('该邮箱已被注册，请更换邮箱或直接登录', true);
            } else {
                showNotification('注册失败：' + authError.message, true);
            }
            return;
        }
        
        console.log('Supabase Auth注册成功:', authData);
        
        console.log('第四步：将用户信息保存到users表');
        
        const { error: insertError } = await window.supabase
            .rpc('register_user', {
                p_phone: registerData.phone,
                p_email: registerData.email,
                p_login_name: registerData.login_name,
                p_user_id: authData.user.id
            });
        
        if (insertError) {
            console.error('插入用户数据时出错:', insertError);
            showNotification('注册失败：保存用户信息失败', true);
            return;
        }
        
        console.log('用户数据保存成功');
        
        showNotification('注册信息提交成功，请进入邮箱进行验证后登录！', false, 5000);
        setTimeout(() => {
            switchToLogin();
        }, 1500);
        
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
        registerButton.disabled = false;
        registerButton.innerHTML = '注册';
        
        const loginPhoneInput = document.getElementById('loginPhone');
        const loginPasswordInput = document.getElementById('loginPassword');
        if (loginPhoneInput && loginPasswordInput) {
            loginPhoneInput.value = registerData.phone;
            loginPasswordInput.value = registerData.password;
        }
    }
}