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
    function initGoogleSignIn() {
        const googleBtn = document.getElementById('googleSignInBtn');
        if (!googleBtn) return;

        // Try using the Google Identity Services library
        try {
            // Initialize Google Sign-In using the GIS library (accounts.google.com/gsi/client)
            // The client ID will be loaded from the /api/auth/google-config endpoint
            // or use a direct One Tap / Popup approach

            googleBtn.addEventListener('click', function () {
                handleGoogleSignIn();
            });

            // If google.accounts is available (script loaded), use the prompt
            if (window.google && window.google.accounts && window.google.accounts.id) {
                // Fetch client ID from our config endpoint
                fetch('/api/auth/google-config')
                    .then(function (r) { return r.json(); })
                    .then(function (config) {
                        if (config.client_id) {
                            window.google.accounts.id.initialize({
                                client_id: config.client_id,
                                callback: handleGoogleCredentialResponse,
                                auto_select: false,
                                cancel_on_tap_outside: true,
                            });

                            // Render the button using Google's native rendering
                            googleBtn.addEventListener('click', function (e) {
                                e.preventDefault();
                                e.stopPropagation();
                                window.google.accounts.id.prompt(function (notification) {
                                    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                                        // Fallback: if One Tap doesn't show, try popup
                                        console.log('Google One Tap not shown, will use popup fallback');
                                    }
                                });
                            });
                        }
                    })
                    .catch(function (err) {
                        console.warn('Could not load Google config:', err);
                        // Show message to user
                        googleBtn.disabled = true;
                        googleBtn.title = 'Login con Google no configurado. Se necesita el Client ID de Google.';
                    });
            } else {
                // Script not loaded yet — wait for it
                var checkCount = 0;
                var checkInterval = setInterval(function () {
                    checkCount++;
                    if (window.google && window.google.accounts && window.google.accounts.id) {
                        clearInterval(checkInterval);
                        fetch('/api/auth/google-config')
                            .then(function (r) { return r.json(); })
                            .then(function (config) {
                                if (config.client_id) {
                                    window.google.accounts.id.initialize({
                                        client_id: config.client_id,
                                        callback: handleGoogleCredentialResponse,
                                        auto_select: false,
                                        cancel_on_tap_outside: true,
                                    });

                                    googleBtn.addEventListener('click', function (e) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        window.google.accounts.id.prompt(function (notification) {
                                            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                                                console.log('Google One Tap not shown');
                                            }
                                        });
                                    });
                                }
                            })
                            .catch(function (err) {
                                console.warn('Could not load Google config:', err);
                            });
                    }
                    if (checkCount > 30) clearInterval(checkInterval); // Stop after 3 seconds
                }, 100);
            }
        } catch (err) {
            console.error('Google Sign-In init error:', err);
        }
    }

    function handleGoogleCredentialResponse(response) {
        if (!response || !response.credential) {
            showMessage(loginMessage, 'Error al obtener credenciales de Google.', 'error');
            return;
        }

        // Send the Google ID token to our backend
        submitGoogleToken(response.credential);
    }

    function handleGoogleSignIn() {
        // If google.accounts is not initialized (no client_id), show info
        if (!window.google || !window.google.accounts || !window.google.accounts.id) {
            showToast('Login con Google se configurara proximamente.', 'info');
            return;
        }
        // The click handler is replaced by the initialized handler above
        // This is a fallback
        window.google.accounts.id.prompt();
    }

    async function submitGoogleToken(credential) {
        // Show loading on the button
        const googleBtn = document.getElementById('googleSignInBtn');
        if (googleBtn) {
            googleBtn.disabled = true;
            googleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando con Google...';
        }

        try {
            const response = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: credential }),
            });

            const data = await response.json();

            if (!response.ok) {
                showMessage(loginMessage, data.error || 'Error al iniciar sesion con Google.', 'error');
                return;
            }

            // Store token and user data
            setToken(data.token);
            if (data.user) {
                setCachedUser(data.user);
            }

            showMessage(loginMessage, 'Inicio de sesion con Google exitoso! Redirigiendo...', 'success');

            // Redirect after short delay
            setTimeout(function () {
                const redirect = urlParams.get('redirect') || 'dashboard.html';
                window.location.href = redirect;
            }, 1000);
        } catch (error) {
            showMessage(loginMessage, 'Error de conexion con Google. Intenta de nuevo.', 'error');
        } finally {
            if (googleBtn) {
                googleBtn.disabled = false;
                googleBtn.innerHTML = '<svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">'
                    + '<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>'
                    + '<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>'
                    + '<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>'
                    + '<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>'
                    + '</svg> Continuar con Google';
            }
        }
    }

    // Initialize Google Sign-In
    initGoogleSignIn();

    // ─── Init: Check if already authenticated ───────────────────
    checkAuthAndRedirect();

})();
