/**
 * CasasBarinas - Authentication Module
 * Loaded on login.html
 */

(function () {
    'use strict';

    // ─── DOM Elements ───────────────────────────────────────────
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const loginMessage = document.getElementById('loginMessage');
    const registerMessage = document.getElementById('registerMessage');
    const strengthBar = document.getElementById('strengthBar');
    const strengthText = document.getElementById('strengthText');

    // ─── Check Auth and Redirect ────────────────────────────────
    function checkAuthAndRedirect() {
        if (isAuthenticated()) {
            window.location.href = 'dashboard.html';
            return true;
        }
        return false;
    }

    // ─── Tab Switching ──────────────────────────────────────────
    function switchTab(tab) {
        if (tab === 'login') {
            tabLogin.classList.add('active');
            tabRegister.classList.remove('active');
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
        } else {
            tabRegister.classList.add('active');
            tabLogin.classList.remove('active');
            registerForm.classList.remove('hidden');
            loginForm.classList.add('hidden');
        }
        // Clear messages
        if (loginMessage) {
            loginMessage.style.display = 'none';
            loginMessage.textContent = '';
        }
        if (registerMessage) {
            registerMessage.style.display = 'none';
            registerMessage.textContent = '';
        }
    }

    if (tabLogin) {
        tabLogin.addEventListener('click', () => switchTab('login'));
    }
    if (tabRegister) {
        tabRegister.addEventListener('click', () => switchTab('register'));
    }

    // ─── Validation Helpers ─────────────────────────────────────
    function showFieldError(elementId, message) {
        const errorEl = document.getElementById(elementId);
        if (errorEl) {
            errorEl.textContent = message;
        }
    }

    function clearFieldError(elementId) {
        const errorEl = document.getElementById(elementId);
        if (errorEl) {
            errorEl.textContent = '';
        }
    }

    function clearAllErrors() {
        document.querySelectorAll('.form-error').forEach(el => {
            el.textContent = '';
        });
    }

    function showMessage(element, message, type = 'error') {
        if (!element) return;
        element.style.display = 'block';
        element.textContent = message;
        element.className = `auth-message ${type}`;
    }

    function hideMessage(element) {
        if (!element) return;
        element.style.display = 'none';
        element.textContent = '';
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function getPasswordStrength(password) {
        let score = 0;
        if (password.length >= 6) score++;
        if (password.length >= 8) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        return score;
    }

    function updatePasswordStrength(password) {
        if (!strengthBar || !strengthText) return;

        if (!password) {
            strengthBar.style.width = '0%';
            strengthBar.className = 'strength-bar';
            strengthText.textContent = '';
            return;
        }

        const score = getPasswordStrength(password);
        const levels = [
            { width: '20%', color: '#e74c3c', label: 'Muy débil' },
            { width: '40%', color: '#e67e22', label: 'Débil' },
            { width: '60%', color: '#f1c40f', label: 'Regular' },
            { width: '80%', color: '#2ecc71', label: 'Fuerte' },
            { width: '100%', color: '#27ae60', label: 'Muy fuerte' },
        ];

        const level = levels[Math.min(score, levels.length - 1)];
        strengthBar.style.width = level.width;
        strengthBar.style.backgroundColor = level.color;
        strengthText.textContent = level.label;
        strengthText.style.color = level.color;
    }

    // ─── Login Handler ──────────────────────────────────────────
    async function handleLogin(e) {
        e.preventDefault();
        clearAllErrors();

        const email = document.getElementById('loginEmail')?.value?.trim();
        const password = document.getElementById('loginPassword')?.value;

        // Validate
        let hasError = false;

        if (!email) {
            showFieldError('loginEmailError', 'El correo electrónico es requerido');
            hasError = true;
        } else if (!isValidEmail(email)) {
            showFieldError('loginEmailError', 'Ingresa un correo electrónico válido');
            hasError = true;
        }

        if (!password) {
            showFieldError('loginPasswordError', 'La contraseña es requerida');
            hasError = true;
        } else if (password.length < 6) {
            showFieldError('loginPasswordError', 'La contraseña debe tener al menos 6 caracteres');
            hasError = true;
        }

        if (hasError) return;

        // Disable button and show loading
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Iniciando sesión...';
        }

        try {
            const data = await api.post('/auth/login', { email, password });

            // Store token and user data
            setToken(data.token);
            if (data.user) {
                setCachedUser(data.user);
            }

            showMessage(loginMessage, '¡Inicio de sesión exitoso! Redirigiendo...', 'success');

            // Redirect after short delay
            setTimeout(() => {
                const urlParams = new URLSearchParams(window.location.search);
                const redirect = urlParams.get('redirect') || 'dashboard.html';
                window.location.href = redirect;
            }, 1000);
        } catch (error) {
            showMessage(loginMessage, error.message, 'error');
        } finally {
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesión';
            }
        }
    }

    // ─── Register Handler ───────────────────────────────────────
    async function handleRegister(e) {
        e.preventDefault();
        clearAllErrors();

        const name = document.getElementById('regName')?.value?.trim();
        const email = document.getElementById('regEmail')?.value?.trim();
        const phone = document.getElementById('regPhone')?.value?.trim();
        const password = document.getElementById('regPassword')?.value;
        const confirmPassword = document.getElementById('regConfirmPassword')?.value;
        const acceptTerms = document.getElementById('acceptTerms')?.checked;

        // Validate
        let hasError = false;

        if (!name) {
            showFieldError('regNameError', 'El nombre es requerido');
            hasError = true;
        } else if (name.length < 2) {
            showFieldError('regNameError', 'El nombre debe tener al menos 2 caracteres');
            hasError = true;
        }

        if (!email) {
            showFieldError('regEmailError', 'El correo electrónico es requerido');
            hasError = true;
        } else if (!isValidEmail(email)) {
            showFieldError('regEmailError', 'Ingresa un correo electrónico válido');
            hasError = true;
        }

        if (!password) {
            showFieldError('regPasswordError', 'La contraseña es requerida');
            hasError = true;
        } else if (password.length < 6) {
            showFieldError('regPasswordError', 'La contraseña debe tener al menos 6 caracteres');
            hasError = true;
        }

        if (!confirmPassword) {
            showFieldError('regConfirmError', 'Debes confirmar la contraseña');
            hasError = true;
        } else if (password !== confirmPassword) {
            showFieldError('regConfirmError', 'Las contraseñas no coinciden');
            hasError = true;
        }

        if (!acceptTerms) {
            showFieldError('regTermsError', 'Debes aceptar los términos y condiciones');
            hasError = true;
        }

        if (hasError) return;

        // Disable button and show loading
        if (registerBtn) {
            registerBtn.disabled = true;
            registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando cuenta...';
        }

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, phone: phone || null, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                // Show detailed error message
                let errorMsg = data.error || 'Error al registrar';
                if (data.debug) {
                    errorMsg += ` (${data.debug})`;
                }
                showMessage(registerMessage, errorMsg, 'error');
                return;
            }

            // Store token and user data
            setToken(data.token);
            if (data.user) {
                setCachedUser(data.user);
            }

            showMessage(registerMessage, '¡Cuenta creada exitosamente! Redirigiendo...', 'success');

            // Redirect after short delay
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        } catch (error) {
            showMessage(registerMessage, 'Error de conexión. Verifica tu internet e intenta de nuevo.', 'error');
        } finally {
            if (registerBtn) {
                registerBtn.disabled = false;
                registerBtn.innerHTML = '<i class="fas fa-user-plus"></i> Crear Cuenta';
            }
        }
    }

    // ─── Password Visibility Toggle ─────────────────────────────
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (!input) return;

            const icon = btn.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                if (icon) icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                if (icon) icon.className = 'fas fa-eye';
            }
        });
    });

    // ─── Password Strength Meter ────────────────────────────────
    const regPassword = document.getElementById('regPassword');
    if (regPassword) {
        regPassword.addEventListener('input', () => {
            updatePasswordStrength(regPassword.value);
        });
    }

    // ─── Real-time Validation Feedback ──────────────────────────
    const regConfirmPassword = document.getElementById('regConfirmPassword');
    if (regConfirmPassword) {
        regConfirmPassword.addEventListener('input', () => {
            const password = document.getElementById('regPassword')?.value;
            if (regConfirmPassword.value && regConfirmPassword.value !== password) {
                showFieldError('regConfirmError', 'Las contraseñas no coinciden');
            } else {
                clearFieldError('regConfirmError');
            }
        });
    }

    const regEmailInput = document.getElementById('regEmail');
    if (regEmailInput) {
        regEmailInput.addEventListener('blur', () => {
            if (regEmailInput.value && !isValidEmail(regEmailInput.value.trim())) {
                showFieldError('regEmailError', 'Formato de correo electrónico inválido');
            } else {
                clearFieldError('regEmailError');
            }
        });
    }

    const loginEmailInput = document.getElementById('loginEmail');
    if (loginEmailInput) {
        loginEmailInput.addEventListener('blur', () => {
            if (loginEmailInput.value && !isValidEmail(loginEmailInput.value.trim())) {
                showFieldError('loginEmailError', 'Formato de correo electrónico inválido');
            } else {
                clearFieldError('loginEmailError');
            }
        });
    }

    // ─── Form Submit Handlers ───────────────────────────────────
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // ─── Forgot Password Link ───────────────────────────────────
    const forgotLink = document.getElementById('forgotPasswordLink');
    if (forgotLink) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            showToast('Función de recuperación de contraseña próximamente disponible.', 'info');
        });
    }

    // ─── Check for redirect parameter ───────────────────────────
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('register') === 'true') {
        switchTab('register');
    }

    // ─── Google Sign-In ─────────────────────────────────────────
    var _googleInitialized = false;

    function initGoogleSignIn() {
        var googleSection = document.getElementById('googleSignInBtn');
        if (!googleSection) return;

        // Wait for the Google GIS script to load
        var attempts = 0;
        var maxAttempts = 50; // 5 seconds

        function tryInit() {
            attempts++;
            if (window.google && window.google.accounts && window.google.accounts.id) {
                loadGoogleConfig();
            } else if (attempts < maxAttempts) {
                setTimeout(tryInit, 100);
            } else {
                // Google script didn't load — disable button
                googleSection.disabled = true;
                googleSection.title = 'No se pudo cargar Google Sign-In. Recarga la pagina.';
            }
        }

        function loadGoogleConfig() {
            if (_googleInitialized) return;
            _googleInitialized = true;

            fetch('/api/auth/google-config')
                .then(function (r) { return r.json(); })
                .then(function (config) {
                    if (!config.client_id) {
                        googleSection.disabled = true;
                        googleSection.title = 'Google Sign-In no configurado.';
                        return;
                    }

                    // Initialize Google Identity Services
                    window.google.accounts.id.initialize({
                        client_id: config.client_id,
                        callback: handleGoogleCredential,
                        auto_select: false,
                        cancel_on_tap_outside: true,
                    });

                    // Replace our custom button with Google's native renderButton
                    // This avoids all the One Tap / FedCM duplicate prompt issues
                    var section = document.querySelector('.google-signin-section');
                    if (section) {
                        section.innerHTML = '';
                        window.google.accounts.id.renderButton(section, {
                            theme: 'outline',
                            size: 'large',
                            width: section.offsetWidth || 340,
                            text: 'signin_with',
                            shape: 'rectangular',
                            logo_alignment: 'left',
                        });
                    }
                })
                .catch(function (err) {
                    console.warn('Google config error:', err);
                    googleSection.disabled = true;
                });
        }

        tryInit();
    }

    function handleGoogleCredential(response) {
        if (!response || !response.credential) {
            showMessage(loginMessage, 'Error al obtener credenciales de Google.', 'error');
            return;
        }
        submitGoogleToken(response.credential);
    }

    async function submitGoogleToken(credential) {
        var section = document.querySelector('.google-signin-section');
        if (section) {
            section.innerHTML = '<div style="text-align:center;padding:12px;color:#666;"><i class="fas fa-spinner fa-spin"></i> Conectando con Google...</div>';
        }

        try {
            var response = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: credential }),
            });

            var data = await response.json();

            if (!response.ok) {
                showMessage(loginMessage, data.error || 'Error al iniciar sesion con Google.', 'error');
                // Re-render button on error
                if (_googleInitialized && window.google && window.google.accounts) {
                    initGoogleSignIn();
                }
                return;
            }

            setToken(data.token);
            if (data.user) {
                setCachedUser(data.user);
            }

            showMessage(loginMessage, 'Inicio de sesion con Google exitoso! Redirigiendo...', 'success');

            setTimeout(function () {
                var redirect = urlParams.get('redirect') || 'dashboard.html';
                window.location.href = redirect;
            }, 1000);
        } catch (error) {
            showMessage(loginMessage, 'Error de conexion con Google. Intenta de nuevo.', 'error');
        }
    }

    // Initialize Google Sign-In
    initGoogleSignIn();

    // ─── Init: Check if already authenticated ───────────────────
    checkAuthAndRedirect();

})();
