// 精简版认证服务 - 为登录注册功能提供核心认证支持

/**
 * 显示通知
 * @param {string} message - 通知消息
 * @param {boolean} isError - 是否为错误消息
 */
function showNotification(message, isError = false) {
    // 检查是否已存在通知元素，如果存在则移除
    const existingNotification = document.querySelector('.auth-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = 'auth-notification';
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 16px 24px;
        background: ${isError ? '#ef4444' : '#10b981'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        font-weight: 500;
        max-width: 300px;
        text-align: center;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

/**
 * 手机号验证
 * @param {string} phone - 手机号
 * @returns {boolean} 是否为有效手机号
 */
function validatePhone(phone) {
    return /^1[3-9]\d{9}$/.test(phone);
}

/**
 * 验证登录表单
 * @param {HTMLElement} loginPhoneInput - 手机号输入框
 * @param {HTMLElement} loginPasswordInput - 密码输入框
 * @returns {boolean} 表单是否有效
 */
function validateLoginForm(loginPhoneInput, loginPasswordInput) {
    let isValid = true;

    // 验证手机号
    if (!validatePhone(loginPhoneInput.value)) {
        document.getElementById('loginPhoneError').style.display = 'block';
        loginPhoneInput.classList.add('error');
        isValid = false;
    } else {
        document.getElementById('loginPhoneError').style.display = 'none';
        loginPhoneInput.classList.remove('error');
    }

    // 验证密码
    if (!loginPasswordInput.value.trim()) {
        document.getElementById('loginPasswordError').style.display = 'block';
        loginPasswordInput.classList.add('error');
        isValid = false;
    } else {
        document.getElementById('loginPasswordError').style.display = 'none';
        loginPasswordInput.classList.remove('error');
    }

    return isValid;
}

/**
 * 验证注册表单
 * @param {HTMLElement} registerNameInput - 姓名输入框
 * @param {HTMLElement} registerPhoneInput - 手机号输入框
 * @param {HTMLElement} registerPasswordInput - 密码输入框
 * @param {HTMLElement} confirmPasswordInput - 确认密码输入框
 * @returns {boolean} 表单是否有效
 */
function validateRegisterForm(registerNameInput, registerPhoneInput, registerPasswordInput, confirmPasswordInput) {
    let isValid = true;

    // 验证登录名
    if (!registerNameInput.value.trim()) {
        document.getElementById('registerNameError').style.display = 'block';
        registerNameInput.classList.add('error');
        isValid = false;
    } else {
        document.getElementById('registerNameError').style.display = 'none';
        registerNameInput.classList.remove('error');
    }

    // 验证手机号
    if (!validatePhone(registerPhoneInput.value)) {
        document.getElementById('registerPhoneError').style.display = 'block';
        registerPhoneInput.classList.add('error');
        isValid = false;
    } else {
        document.getElementById('registerPhoneError').style.display = 'none';
        registerPhoneInput.classList.remove('error');
    }

    // 验证密码
    if (registerPasswordInput.value.length < 6) {
        document.getElementById('registerPasswordError').style.display = 'block';
        registerPasswordInput.classList.add('error');
        isValid = false;
    } else {
        document.getElementById('registerPasswordError').style.display = 'none';
        registerPasswordInput.classList.remove('error');
    }

    // 验证确认密码
    if (confirmPasswordInput.value !== registerPasswordInput.value) {
        document.getElementById('confirmPasswordError').style.display = 'block';
        confirmPasswordInput.classList.add('error');
        isValid = false;
    } else {
        document.getElementById('confirmPasswordError').style.display = 'none';
        confirmPasswordInput.classList.remove('error');
    }

    return isValid;
}

/**
 * 表单切换功能
 */
function switchToLogin() {
    const forms = document.querySelectorAll('.auth-form');
    const authDescription = document.getElementById('auth-description');
    
    forms.forEach(form => form.classList.remove('active'));
    document.getElementById('loginForm').classList.add('active');
    authDescription.textContent = '欢迎回来，请登录您的账户';
}

function switchToRegister() {
    const forms = document.querySelectorAll('.auth-form');
    const authDescription = document.getElementById('auth-description');
    
    forms.forEach(form => form.classList.remove('active'));
    document.getElementById('registerForm').classList.add('active');
    authDescription.textContent = '创建账户，开始高效管理';
}

// 导出为全局函数
window.showNotification = showNotification;
window.validatePhone = validatePhone;
window.validateLoginForm = validateLoginForm;
window.validateRegisterForm = validateRegisterForm;
window.switchToLogin = switchToLogin;
window.switchToRegister = switchToRegister;