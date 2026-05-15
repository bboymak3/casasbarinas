/**
 * CasasBarinas - Dashboard Module
 * Handles user dashboard and admin panel functionality
 */

(function () {
    'use strict';

    // ─── State ──────────────────────────────────────────────────
    let currentUser = null;
    let userProperties = [];
    let pendingProperties = []; // For admin view
    let deleteTargetId = null;

    // ─── DOM Elements ───────────────────────────────────────────
    const sidebar = document.getElementById('dashboardSidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sectionTitle = document.getElementById('sectionTitle');
    const sidebarLinks = document.querySelectorAll('.sidebar-link[data-section]');

    // Dashboard stats
    const dashTotalProps = document.getElementById('dashTotalProps');
    const dashPublishedProps = document.getElementById('dashPublishedProps');
    const dashPendingProps = document.getElementById('dashPendingProps');
    const dashTotalViews = document.getElementById('dashTotalViews');

    // User info
    const dashUserName = document.getElementById('dashUserName');
    const dashUserEmail = document.getElementById('dashUserEmail');
    const userAvatar = document.getElementById('userAvatar');

    // Tables
    const recentPropsBody = document.getElementById('recentPropsBody');
    const allPropsBody = document.getElementById('allPropsBody');
    const dashPropFilter = document.getElementById('dashPropFilter');

    // Messages
    const messagesList = document.getElementById('messagesList');
    const msgBadge = document.getElementById('msgBadge');

    // Favorites
    const favoritesGrid = document.getElementById('favoritesGrid');

    // Profile
    const profileForm = document.getElementById('profileForm');

    // Delete modal
    const deleteModal = document.getElementById('deleteModal');
    const deleteModalClose = document.getElementById('deleteModalClose');
    const deleteModalCancel = document.getElementById('deleteModalCancel');
    const deleteModalConfirm = document.getElementById('deleteModalConfirm');

    // Admin section
    const adminSection = document.getElementById('sectionAdmin');
    const adminPendingBody = document.getElementById('adminPendingBody');
    const adminAllPropsBody = document.getElementById('adminAllPropsBody');
    const adminTabPending = document.getElementById('adminTabPending');
    const adminTabAll = document.getElementById('adminTabAll');

    // ─── Initialize ─────────────────────────────────────────────
    async function initDashboard() {
        if (!requireAuth()) return;

        // Load current user
        currentUser = await getCurrentUser();
        if (!currentUser) {
            removeToken();
            window.location.href = 'login.html';
            return;
        }

        // Auto-promote first user to admin if no admin exists
        if (currentUser.role !== 'admin') {
            try {
                const promoteResult = await api.post('/auth/promote-me', {});
                if (promoteResult.role === 'admin') {
                    // Update cached user and token
                    currentUser.role = 'admin';
                    setCachedUser(currentUser);
                    if (promoteResult.token) setToken(promoteResult.token);
                    showToast('Has sido promovido a Administrador.', 'success');
                }
            } catch (promoteErr) {
                // Silently ignore - not first user or already admin
            }
        }

        // Update user info
        updateUserDisplay();

        // Show admin section if user is admin
        if (currentUser.role === 'admin') {
            setupAdminSection();
        }

        // Setup sidebar navigation
        setupSidebar();

        // Setup sidebar toggle (mobile)
        setupSidebarToggle();

        // Setup delete modal
        setupDeleteModal();

        // Setup profile form
        setupProfileForm();

        // Load data for overview section
        await loadOverviewData();
    }

    // ─── User Display ──────────────────────────────────────────
    function updateUserDisplay() {
        if (!currentUser) return;

        if (dashUserName) dashUserName.textContent = currentUser.name || 'Usuario';
        if (dashUserEmail) dashUserEmail.textContent = currentUser.email || '';
        if (userAvatar) {
            if (currentUser.avatar) {
                userAvatar.innerHTML = `<img src="${currentUser.avatar}" alt="${currentUser.name}">`;
            } else {
                const initials = (currentUser.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                userAvatar.innerHTML = `<span class="avatar-initials">${initials}</span>`;
            }
        }
    }

    // ─── Sidebar Navigation ────────────────────────────────────
    function setupSidebar() {
        sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                switchSection(section);

                // Update active state
                sidebarLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            });
        });
    }

    function setupSidebarToggle() {
        if (!sidebarToggle || !sidebar) return;

        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            sidebarToggle.classList.toggle('active');
        });
    }

    function switchSection(sectionId) {
        // Hide all sections
        document.querySelectorAll('.dashboard-section').forEach(s => s.classList.add('hidden'));

        // Show target section
        const target = document.getElementById(`section${capitalize(sectionId)}`);
        if (target) target.classList.remove('hidden');

        // Update title
        const titles = {
            overview: 'Resumen',
            properties: 'Mis Propiedades',
            messages: 'Mensajes',
            favorites: 'Favoritos',
            profile: 'Mi Perfil',
            admin: 'Panel de Administracion',
        };
        if (sectionTitle) sectionTitle.textContent = titles[sectionId] || 'Resumen';

        // Load section data
        switch (sectionId) {
            case 'overview':
                loadOverviewData();
                break;
            case 'properties':
                loadMyProperties();
                break;
            case 'messages':
                loadMessages();
                break;
            case 'favorites':
                loadFavorites();
                break;
            case 'admin':
                loadAdminData();
                break;
        }
    }

    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // ─── Overview Data ─────────────────────────────────────────
    async function loadOverviewData() {
        try {
            const userId = currentUser?.id;

            // Get user's approved properties
            const approvedData = await api.get(`/properties?limit=100&user_id=${userId}&status=approved`);
            const approvedProps = approvedData.properties || [];

            // Get user's pending properties
            const pendingData = await api.get(`/properties?limit=100&user_id=${userId}&status=pending`);
            const pendingProps = pendingData.properties || [];

            // Get user's rejected properties
            const rejectedData = await api.get(`/properties?limit=100&user_id=${userId}&status=rejected`);
            const rejectedProps = rejectedData.properties || [];

            userProperties = [...approvedProps, ...pendingProps, ...rejectedProps];

            // Stats
            const total = userProperties.length;
            const published = userProperties.filter(p => p.status === 'approved').length;
            const pending = userProperties.filter(p => p.status === 'pending').length;
            const views = userProperties.reduce((sum, p) => sum + (p.views || 0), 0);

            if (dashTotalProps) dashTotalProps.textContent = total;
            if (dashPublishedProps) dashPublishedProps.textContent = published;
            if (dashPendingProps) dashPendingProps.textContent = pending;
            if (dashTotalViews) dashTotalViews.textContent = views;

            // Recent properties table (last 5)
            if (recentPropsBody) {
                const recent = userProperties.slice(0, 5);
                if (recent.length === 0) {
                    recentPropsBody.innerHTML = `
                        <tr class="empty-row">
                            <td colspan="6">
                                <div class="empty-state">
                                    <i class="fas fa-inbox"></i>
                                    <p>No tienes propiedades aun.</p>
                                    <a href="new-property.html" class="btn btn-primary btn-sm">Publicar Propiedad</a>
                                </div>
                            </td>
                        </tr>
                    `;
                } else {
                    recentPropsBody.innerHTML = recent.map(p => `
                        <tr>
                            <td>
                                <div class="dash-prop-name">
                                    ${(p.cover_image || p.image_count > 0) ? `<img src="${p.cover_image || ''}" alt="" class="dash-thumb" onerror="this.style.display='none'">` : '<i class="fas fa-image dash-thumb-placeholder"></i>'}
                                    <span>${truncateText(p.title, 35)}</span>
                                </div>
                            </td>
                            <td>${getPropertyTypeLabel(p.property_type)}</td>
                            <td class="dash-price">${formatPrice(p.price, p.currency)}</td>
                            <td>${getStatusBadge(p.status)}</td>
                            <td>${p.views || 0}</td>
                            <td class="dash-actions">
                                <a href="property.html?id=${p.id}" class="btn-icon" title="Ver"><i class="fas fa-eye"></i></a>
                                <a href="new-property.html?id=${p.id}" class="btn-icon" title="Editar"><i class="fas fa-edit"></i></a>
                                <button class="btn-icon btn-icon-danger" onclick="confirmDeleteProperty(${p.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>
                    `).join('');
                }
            }
        } catch (error) {
            console.error('Error loading overview:', error);
        }
    }

    // ─── My Properties ─────────────────────────────────────────
    async function loadMyProperties(filter) {
        try {
            const userId = currentUser?.id;

            let userPropertiesList;

            if (filter) {
                // Filter by specific status
                const statusMap = { 'publicada': 'approved', 'pendiente': 'pending', 'rechazada': 'rejected' };
                const status = statusMap[filter] || filter;
                const data = await api.get(`/properties?limit=100&user_id=${userId}&status=${status}`);
                userPropertiesList = data.properties || [];
            } else {
                // No filter: fetch ALL user properties (all statuses)
                const [approvedData, pendingData, rejectedData] = await Promise.all([
                    api.get(`/properties?limit=100&user_id=${userId}&status=approved`),
                    api.get(`/properties?limit=100&user_id=${userId}&status=pending`),
                    api.get(`/properties?limit=100&user_id=${userId}&status=rejected`),
                ]);
                userPropertiesList = [
                    ...(approvedData.properties || []),
                    ...(pendingData.properties || []),
                    ...(rejectedData.properties || []),
                ];
            }

            userProperties = userPropertiesList;

            if (allPropsBody) {
                if (userProperties.length === 0) {
                    allPropsBody.innerHTML = `
                        <tr class="empty-row">
                            <td colspan="8">
                                <div class="empty-state">
                                    <i class="fas fa-inbox"></i>
                                    <p>${filter ? 'No hay propiedades con ese filtro.' : 'No tienes propiedades.'}</p>
                                    <a href="new-property.html" class="btn btn-primary btn-sm">Publicar Propiedad</a>
                                </div>
                            </td>
                        </tr>
                    `;
                } else {
                    allPropsBody.innerHTML = userProperties.map(p => `
                        <tr>
                            <td>
                                ${(p.cover_image || p.image_count > 0) ? `<img src="${p.cover_image || ''}" alt="" class="dash-thumb" onerror="this.style.display='none'">` : '<i class="fas fa-image dash-thumb-placeholder"></i>'}
                            </td>
                            <td>${truncateText(p.title, 30)}</td>
                            <td>${getPropertyTypeLabel(p.property_type)}</td>
                            <td>${getOperationTypeLabel(p.operation_type)}</td>
                            <td class="dash-price">${formatPrice(p.price, p.currency)}</td>
                            <td>${getStatusBadge(p.status)}</td>
                            <td>${p.views || 0}</td>
                            <td class="dash-actions">
                                <a href="property.html?id=${p.id}" class="btn-icon" title="Ver"><i class="fas fa-eye"></i></a>
                                <a href="new-property.html?id=${p.id}" class="btn-icon" title="Editar"><i class="fas fa-edit"></i></a>
                                <button class="btn-icon btn-icon-danger" onclick="confirmDeleteProperty(${p.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>
                    `).join('');
                }
            }
        } catch (error) {
            console.error('Error loading properties:', error);
        }
    }

    // Setup property filter
    if (dashPropFilter) {
        dashPropFilter.addEventListener('change', () => {
            loadMyProperties(dashPropFilter.value);
        });
    }

    // ─── Messages ──────────────────────────────────────────────
    async function loadMessages() {
        if (!messagesList) return;

        try {
            const data = await api.get('/contacts');
            const messages = data.contacts || data.messages || [];

            const unreadCount = messages.filter(m => !m.is_read).length;
            if (msgBadge) {
                msgBadge.textContent = unreadCount;
                msgBadge.style.display = unreadCount > 0 ? '' : 'none';
            }

            if (messages.length === 0) {
                messagesList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-envelope-open"></i>
                        <p>No tienes mensajes nuevos.</p>
                    </div>
                `;
            } else {
                messagesList.innerHTML = messages.map(m => `
                    <div class="message-item ${m.is_read ? '' : 'unread'}">
                        <div class="message-header">
                            <div class="message-sender">
                                <i class="fas fa-user-circle"></i>
                                <strong>${m.sender_name}</strong>
                                <span class="message-date">${formatDateTime(m.created_at)}</span>
                            </div>
                            <span class="message-property">${m.property_title || `Propiedad #${m.property_id}`}</span>
                        </div>
                        <p class="message-text">${truncateText(m.message, 200)}</p>
                        <div class="message-actions">
                            <a href="mailto:${m.sender_email}" class="btn btn-sm btn-secondary">
                                <i class="fas fa-reply"></i> Responder
                            </a>
                            ${m.sender_phone ? `<a href="tel:${m.sender_phone}" class="btn btn-sm btn-secondary"><i class="fas fa-phone"></i> Llamar</a>` : ''}
                        </div>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Error loading messages:', error);
            messagesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Error al cargar mensajes.</p>
                </div>
            `;
        }
    }

    // ─── Favorites ─────────────────────────────────────────────
    async function loadFavorites() {
        if (!favoritesGrid) return;

        try {
            const data = await api.get('/favorites');
            const favorites = data.favorites || [];

            if (favorites.length === 0) {
                favoritesGrid.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-heart"></i>
                        <p>No tienes propiedades favoritas.</p>
                        <a href="search.html" class="btn btn-primary btn-sm">Explorar Propiedades</a>
                    </div>
                `;
            } else {
                favoritesGrid.innerHTML = favorites.map(f => {
                    const prop = f.property || f;
                    return createPropertyCard(prop);
                }).join('');
            }
        } catch (error) {
            console.error('Error loading favorites:', error);
            favoritesGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Error al cargar favoritos.</p>
                </div>
            `;
        }
    }

    // ─── Profile ───────────────────────────────────────────────
    function setupProfileForm() {
        if (!profileForm || !currentUser) return;

        // Populate form
        const nameField = document.getElementById('profileName');
        const emailField = document.getElementById('profileEmail');
        const phoneField = document.getElementById('profilePhone');
        const whatsappField = document.getElementById('profileWhatsApp');
        const bioField = document.getElementById('profileBio');

        if (nameField) nameField.value = currentUser.name || '';
        if (emailField) emailField.value = currentUser.email || '';
        if (phoneField) phoneField.value = currentUser.phone || '';
        if (whatsappField) whatsappField.value = currentUser.whatsapp || '';
        if (bioField) bioField.value = currentUser.bio || '';

        // Submit handler
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const formData = new FormData(profileForm);
                const data = {
                    name: formData.get('name'),
                    email: formData.get('email'),
                    phone: formData.get('phone'),
                    whatsapp: formData.get('whatsapp'),
                    bio: formData.get('bio'),
                };

                await api.put('/users/me', data);
                showToast('Perfil actualizado exitosamente', 'success');

                // Update cache
                setCachedUser({ ...currentUser, ...data });
                updateUserDisplay();
            } catch (error) {
                showToast(error.message || 'Error al actualizar perfil', 'error');
            }
        });
    }

    // ─── Delete Modal ──────────────────────────────────────────
    function setupDeleteModal() {
        if (!deleteModal) return;

        if (deleteModalClose) {
            deleteModalClose.addEventListener('click', () => closeModal());
        }
        if (deleteModalCancel) {
            deleteModalCancel.addEventListener('click', () => closeModal());
        }
        if (deleteModalConfirm) {
            deleteModalConfirm.addEventListener('click', async () => {
                if (deleteTargetId) {
                    await deleteProperty(deleteTargetId);
                    closeModal();
                }
            });
        }

        // Close on overlay click
        const overlay = deleteModal.querySelector('.modal-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => closeModal());
        }
    }

    window.confirmDeleteProperty = function (id) {
        deleteTargetId = id;
        if (deleteModal) deleteModal.classList.remove('hidden');
    };

    function closeModal() {
        deleteTargetId = null;
        if (deleteModal) deleteModal.classList.add('hidden');
    }

    async function deleteProperty(id) {
        try {
            await api.delete(`/properties/${id}`);
            showToast('Propiedad eliminada exitosamente', 'success');

            // Reload current section
            const activeSection = document.querySelector('.sidebar-link.active');
            if (activeSection) {
                switchSection(activeSection.dataset.section);
            } else {
                loadOverviewData();
            }
        } catch (error) {
            showToast(error.message || 'Error al eliminar la propiedad', 'error');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ADMIN SECTION - Approve/Reject Properties
    // ═══════════════════════════════════════════════════════════════

    function setupAdminSection() {
        // Add admin link to sidebar
        const sidebarNav = document.querySelector('.sidebar-nav');
        if (sidebarNav && !document.querySelector('.sidebar-link[data-section="admin"]')) {
            const adminLink = document.createElement('a');
            adminLink.href = '#';
            adminLink.className = 'sidebar-link';
            adminLink.dataset.section = 'admin';
            adminLink.innerHTML = '<i class="fas fa-shield-alt"></i> Administrar <span class="badge badge-warning" id="adminPendingBadge">0</span>';
            sidebarNav.appendChild(adminLink);

            // Add event listener
            adminLink.addEventListener('click', (e) => {
                e.preventDefault();
                switchSection('admin');
                sidebarLinks.forEach(l => l.classList.remove('active'));
                adminLink.classList.add('active');
            });
        }

        // Setup admin tabs
        if (adminTabPending) {
            adminTabPending.addEventListener('click', () => {
                adminTabPending.classList.add('active');
                if (adminTabAll) adminTabAll.classList.remove('active');
                if (document.getElementById('adminPanelPending')) document.getElementById('adminPanelPending').classList.remove('hidden');
                if (document.getElementById('adminPanelAll')) document.getElementById('adminPanelAll').classList.add('hidden');
            });
        }

        if (adminTabAll) {
            adminTabAll.addEventListener('click', () => {
                adminTabAll.classList.add('active');
                if (adminTabPending) adminTabPending.classList.remove('active');
                if (document.getElementById('adminPanelAll')) document.getElementById('adminPanelAll').classList.remove('hidden');
                if (document.getElementById('adminPanelPending')) document.getElementById('adminPanelPending').classList.add('hidden');
                loadAdminAllProperties();
            });
        }
    }

    async function loadAdminData() {
        await loadAdminPendingProperties();
        loadAdminAllProperties();
    }

    async function loadAdminPendingProperties() {
        if (!adminPendingBody) return;

        try {
            const data = await api.get('/properties?status=pending&limit=100');
            pendingProperties = data.properties || [];

            // Update badge
            const badge = document.getElementById('adminPendingBadge');
            if (badge) {
                badge.textContent = pendingProperties.length;
                badge.style.display = pendingProperties.length > 0 ? '' : 'none';
            }

            if (pendingProperties.length === 0) {
                adminPendingBody.innerHTML = `
                    <tr class="empty-row">
                        <td colspan="7">
                            <div class="empty-state">
                                <i class="fas fa-check-circle" style="color: #28a745;"></i>
                                <p>No hay propiedades pendientes de aprobacion.</p>
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                adminPendingBody.innerHTML = pendingProperties.map(p => `
                    <tr class="admin-pending-row">
                        <td>
                            <div class="dash-prop-name">
                                ${(p.cover_image || p.image_count > 0) ? `<img src="${p.cover_image || ''}" alt="" class="dash-thumb" onerror="this.style.display='none'">` : '<i class="fas fa-image dash-thumb-placeholder"></i>'}
                                <span>${truncateText(p.title, 30)}</span>
                            </div>
                        </td>
                        <td>${getPropertyTypeLabel(p.property_type)}</td>
                        <td class="dash-price">${formatPrice(p.price, p.currency)}</td>
                        <td><i class="fas fa-map-marker-alt"></i> ${p.city || 'Barinas'}</td>
                        <td>${formatDate(p.created_at)}</td>
                        <td>${p.owner_name || 'Usuario'}</td>
                        <td class="dash-actions">
                            <button class="btn btn-sm btn-success" onclick="adminApproveProperty(${p.id})" title="Aprobar">
                                <i class="fas fa-check"></i> Aprobar
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="adminRejectProperty(${p.id})" title="Rechazar">
                                <i class="fas fa-times"></i> Rechazar
                            </button>
                            <a href="property.html?id=${p.id}" class="btn-icon" title="Ver detalle"><i class="fas fa-eye"></i></a>
                        </td>
                    </tr>
                `).join('');
            }
        } catch (error) {
            console.error('Error loading admin pending:', error);
            adminPendingBody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="7">
                        <div class="empty-state">
                            <i class="fas fa-exclamation-circle"></i>
                            <p>Error al cargar propiedades pendientes.</p>
                        </div>
                    </td>
                </tr>
            `;
        }
    }

    async function loadAdminAllProperties() {
        if (!adminAllPropsBody) return;

        try {
            // Admin sees ALL properties regardless of status
            const data = await api.get('/properties?status=approved&limit=100');
            const approvedProps = data.properties || [];
            // Also fetch pending and rejected
            const pendingData = await api.get('/properties?status=pending&limit=100');
            const rejectedData = await api.get('/properties?status=rejected&limit=100');
            const allProps = [...approvedProps, ...(pendingData.properties || []), ...(rejectedData.properties || [])];

            if (allProps.length === 0) {
                adminAllPropsBody.innerHTML = `
                    <tr class="empty-row">
                        <td colspan="8">
                            <div class="empty-state">
                                <i class="fas fa-inbox"></i>
                                <p>No hay propiedades registradas.</p>
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                adminAllPropsBody.innerHTML = allProps.map(p => `
                    <tr>
                        <td>
                            <div class="dash-prop-name">
                                ${(p.cover_image || p.image_count > 0) ? `<img src="${p.cover_image || ''}" alt="" class="dash-thumb" onerror="this.style.display='none'">` : '<i class="fas fa-image dash-thumb-placeholder"></i>'}
                                <span>${truncateText(p.title, 30)}</span>
                            </div>
                        </td>
                        <td>${getPropertyTypeLabel(p.property_type)}</td>
                        <td>${getOperationTypeLabel(p.operation_type)}</td>
                        <td class="dash-price">${formatPrice(p.price, p.currency)}</td>
                        <td>${getStatusBadge(p.status)}</td>
                        <td>${p.owner_name || 'Usuario'}</td>
                        <td>${formatDate(p.created_at)}</td>
                        <td class="dash-actions">
                            ${p.status === 'pending' ? `
                                <button class="btn btn-sm btn-success" onclick="adminApproveProperty(${p.id})"><i class="fas fa-check"></i></button>
                                <button class="btn btn-sm btn-danger" onclick="adminRejectProperty(${p.id})"><i class="fas fa-times"></i></button>
                            ` : ''}
                            <a href="property.html?id=${p.id}" class="btn-icon" title="Ver"><i class="fas fa-eye"></i></a>
                            <button class="btn-icon btn-icon-danger" onclick="confirmDeleteProperty(${p.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `).join('');
            }
        } catch (error) {
            console.error('Error loading admin all properties:', error);
        }
    }

    // Admin approve property
    window.adminApproveProperty = async function (id) {
        try {
            await api.post(`/properties/${id}/approve`, {});
            showToast('Propiedad aprobada exitosamente', 'success');

            // Reload admin data
            loadAdminData();

            // Also update user pending count if visible
            if (dashPendingProps) {
                const pending = pendingProperties.length - 1;
                dashPendingProps.textContent = Math.max(0, pending);
            }
        } catch (error) {
            showToast(error.message || 'Error al aprobar propiedad', 'error');
        }
    };

    // Admin reject property
    window.adminRejectProperty = async function (id) {
        if (!confirm('¿Estas seguro de que deseas rechazar esta propiedad?')) return;

        try {
            await api.post(`/properties/${id}/reject`, {});
            showToast('Propiedad rechazada', 'info');

            // Reload admin data
            loadAdminData();
        } catch (error) {
            showToast(error.message || 'Error al rechazar propiedad', 'error');
        }
    };

    // ─── Initialize on DOM Ready ────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDashboard);
    } else {
        initDashboard();
    }

})();
