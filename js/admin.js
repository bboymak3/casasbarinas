/**
 * CasasBarinas - Admin Panel Module
 * Loaded on admin.html
 */

(function () {
    'use strict';

    // ─── State ──────────────────────────────────────────────────
    let currentTab = 'dashboard';
    let currentDeleteAction = null; // { type, id, callback }
    let currentRejectId = null;

    // Pagination state
    let propsPage = 1;
    let usersPage = 1;
    let msgsPage = 1;
    const PAGE_LIMIT = 15;

    // ─── DOM Elements ───────────────────────────────────────────
    const adminDate = document.getElementById('adminDate');
    const adminPageTitle = document.getElementById('adminPageTitle');
    const adminSidebarToggle = document.getElementById('adminSidebarToggle');
    const adminSidebar = document.getElementById('adminSidebar');

    // Tab panels
    const tabDashboard = document.getElementById('tabDashboard');
    const tabProperties = document.getElementById('tabProperties');
    const tabUsers = document.getElementById('tabUsers');
    const tabMessages = document.getElementById('tabMessages');
    const tabFacebook = document.getElementById('tabFacebook');

    // Stat elements
    const adminTotalProps = document.getElementById('adminTotalProps');
    const adminPendingProps = document.getElementById('adminPendingProps');
    const adminTotalUsers = document.getElementById('adminTotalUsers');
    const adminTotalMsgs = document.getElementById('adminTotalMsgs');
    const adminPendingBadge = document.getElementById('adminPendingBadge');
    const adminMsgBadge = document.getElementById('adminMsgBadge');

    // Modals
    const adminDeleteModal = document.getElementById('adminDeleteModal');
    const adminDeleteMsg = document.getElementById('adminDeleteMsg');
    const adminDeleteConfirm = document.getElementById('adminDeleteConfirm');
    const adminDeleteCancel = document.getElementById('adminDeleteCancel');
    const adminDeleteModalClose = document.getElementById('adminDeleteModalClose');

    const adminRejectModal = document.getElementById('adminRejectModal');
    const adminRejectConfirm = document.getElementById('adminRejectConfirm');
    const adminRejectCancel = document.getElementById('adminRejectCancel');
    const adminRejectModalClose = document.getElementById('adminRejectModalClose');
    const rejectReason = document.getElementById('rejectReason');

    const adminUserModal = document.getElementById('adminUserModal');
    const adminUserModalSave = document.getElementById('adminUserModalSave');
    const adminUserModalCancel = document.getElementById('adminUserModalCancel');
    const adminUserModalClose = document.getElementById('adminUserModalClose');

    const adminPropertyModal = document.getElementById('adminPropertyModal');
    const adminPropModalClose = document.getElementById('adminPropModalClose');

    const adminMsgModal = document.getElementById('adminMsgModal');
    const adminMsgModalClose = document.getElementById('adminMsgModalClose');
    const adminMsgModalCloseBtn = document.getElementById('adminMsgModalCloseBtn');

    // ─── Initialization ─────────────────────────────────────────
    async function init() {
        // Check auth
        if (!isAuthenticated()) {
            window.location.href = 'login.html';
            return;
        }

        // Check admin role
        const user = getCachedUser();
        if (!user || user.role !== 'admin') {
            showToast('Acceso denegado. Solo administradores.', 'error');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
            return;
        }

        // Set current date
        if (adminDate) {
            adminDate.textContent = new Date().toLocaleDateString('es-VE', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        }

        // Setup event listeners
        setupTabNavigation();
        setupSidebarToggle();
        setupModals();
        setupFilterListeners();
        setupFacebookListeners();

        // Load initial data
        await loadDashboardStats();
        loadDashboardTab();
    }

    // ─── Tab Navigation ─────────────────────────────────────────
    function setupTabNavigation() {
        document.querySelectorAll('.admin-nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = link.dataset.tab;
                if (tab) switchTab(tab);
            });
        });

        // Also handle data-tab links inside cards
        document.querySelectorAll('[data-tab]').forEach(el => {
            if (el.tagName === 'A') {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    const tab = el.dataset.tab;
                    if (tab) switchTab(tab);
                });
            }
        });
    }

    function switchTab(tab) {
        currentTab = tab;

        // Update nav links
        document.querySelectorAll('.admin-nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.tab === tab);
        });

        // Hide all tab panels
        const panels = { dashboard: tabDashboard, properties: tabProperties, users: tabUsers, messages: tabMessages, facebook: tabFacebook };
        for (const [key, panel] of Object.entries(panels)) {
            if (panel) {
                panel.classList.toggle('hidden', key !== tab);
            }
        }

        // Update page title
        const titles = { dashboard: 'Dashboard', properties: 'Propiedades', users: 'Usuarios', messages: 'Mensajes', facebook: 'Facebook Import' };
        if (adminPageTitle) {
            adminPageTitle.textContent = titles[tab] || 'Dashboard';
        }

        // Load tab data
        switch (tab) {
            case 'dashboard':
                loadDashboardTab();
                break;
            case 'properties':
                propsPage = 1;
                loadProperties();
                break;
            case 'users':
                usersPage = 1;
                loadUsers();
                break;
            case 'messages':
                msgsPage = 1;
                loadMessages();
                break;
            case 'facebook':
                loadFacebookConfig();
                loadFacebookHistory();
                break;
        }

        // Close sidebar on mobile
        if (adminSidebar) {
            adminSidebar.classList.remove('active');
        }
    }

    // ─── Sidebar Toggle ─────────────────────────────────────────
    function setupSidebarToggle() {
        if (adminSidebarToggle && adminSidebar) {
            adminSidebarToggle.addEventListener('click', () => {
                adminSidebar.classList.toggle('active');
            });
        }
    }

    // ─── Dashboard Stats ────────────────────────────────────────
    async function loadDashboardStats() {
        try {
            const data = await api.get('/stats');
            if (data.stats) {
                const s = data.stats;
                if (adminTotalProps) adminTotalProps.textContent = s.total_properties || 0;
                if (adminPendingProps) adminPendingProps.textContent = s.pending_properties || 0;
                if (adminTotalUsers) adminTotalUsers.textContent = s.total_users || 0;
                if (adminTotalMsgs) adminTotalMsgs.textContent = s.total_contacts || 0;
                if (adminPendingBadge) adminPendingBadge.textContent = s.pending_properties || 0;
                if (adminMsgBadge) adminMsgBadge.textContent = s.unread_contacts || 0;
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async function loadDashboardTab() {
        await loadDashboardStats();
        loadRecentActivity();
        loadRecentProperties();
        loadRecentUsers();
    }

    function loadRecentActivity() {
        // Activity is derived from recent properties for now
    }

    async function loadRecentProperties() {
        const tbody = document.getElementById('adminRecentProps');
        if (!tbody) return;

        try {
            const data = await api.get('/properties?status=&limit=5&page=1');
            const properties = data.properties || [];

            if (properties.length === 0) {
                tbody.innerHTML = '<tr class="empty-row"><td colspan="5"><div class="empty-state-sm"><p>No hay propiedades.</p></div></td></tr>';
                return;
            }

            tbody.innerHTML = properties.map(p => `
                <tr>
                    <td>${truncateText(p.title, 40)}</td>
                    <td>${getPropertyTypeLabel(p.property_type)}</td>
                    <td>${p.owner_name || '--'}</td>
                    <td>${getStatusBadge(p.status)}</td>
                    <td>${formatDate(p.created_at)}</td>
                </tr>
            `).join('');
        } catch (error) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="5"><div class="empty-state-sm"><p>Error al cargar.</p></div></td></tr>';
        }
    }

    async function loadRecentUsers() {
        const tbody = document.getElementById('adminRecentUsers');
        if (!tbody) return;

        try {
            const data = await api.get('/users?limit=5&page=1');
            const users = data.users || [];

            if (users.length === 0) {
                tbody.innerHTML = '<tr class="empty-row"><td colspan="5"><div class="empty-state-sm"><p>No hay usuarios.</p></div></td></tr>';
                return;
            }

            tbody.innerHTML = users.map(u => `
                <tr>
                    <td>${u.name || '--'}</td>
                    <td>${u.email || '--'}</td>
                    <td><span class="badge badge-${u.role === 'admin' ? 'info' : 'default'}">${u.role === 'admin' ? 'Admin' : 'Usuario'}</span></td>
                    <td>${u.is_active ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-danger">Inactivo</span>'}</td>
                    <td>${formatDate(u.created_at)}</td>
                </tr>
            `).join('');
        } catch (error) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="5"><div class="empty-state-sm"><p>Error al cargar.</p></div></td></tr>';
        }
    }

    // ─── Properties Management ──────────────────────────────────
    async function loadProperties() {
        const tbody = document.getElementById('adminPropsTableBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr class="empty-row"><td colspan="10"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div></td></tr>';

        try {
            // Build query params
            const statusFilter = document.getElementById('adminPropStatusFilter')?.value || '';
            const typeFilter = document.getElementById('adminPropTypeFilter')?.value || '';
            const searchVal = document.getElementById('adminPropSearch')?.value || '';

            let endpoint = `/properties?status=${statusFilter || ''}&page=${propsPage}&limit=${PAGE_LIMIT}`;
            if (typeFilter) endpoint += `&property_type=${typeFilter}`;
            if (searchVal) endpoint += `&search=${encodeURIComponent(searchVal)}`;

            const data = await api.get(endpoint);
            const properties = data.properties || [];

            if (properties.length === 0) {
                tbody.innerHTML = '<tr class="empty-row"><td colspan="10"><div class="empty-state-sm"><p>No se encontraron propiedades.</p></div></td></tr>';
                return;
            }

            tbody.innerHTML = properties.map(p => {
                const coverImg = p.cover_image || '';
                const priceStr = formatPrice(p.price, p.currency);
                return `
                    <tr data-property-id="${p.id}">
                        <td>${p.id}</td>
                        <td>${coverImg ? `<img src="${coverImg}" alt="" class="admin-thumb" onerror="this.style.display='none'">` : '<div class="admin-thumb-placeholder"><i class="fas fa-image"></i></div>'}</td>
                        <td><a href="property.html?id=${p.id}" target="_blank" title="${p.title}">${truncateText(p.title, 35)}</a></td>
                        <td>${getPropertyTypeLabel(p.property_type)}</td>
                        <td>${getOperationTypeLabel(p.operation_type)}</td>
                        <td>${priceStr}</td>
                        <td>${p.owner_name || '--'}</td>
                        <td>${getStatusBadge(p.status)}</td>
                        <td>${p.featured ? '<i class="fas fa-star text-warning"></i>' : '<i class="far fa-star text-muted"></i>'}</td>
                        <td class="admin-actions">
                            <button class="btn btn-xs btn-outline" onclick="window.admin.viewProperty(${p.id})" title="Ver"><i class="fas fa-eye"></i></button>
                            ${p.status === 'pending' ? `
                                <button class="btn btn-xs btn-success" onclick="window.admin.approveProperty(${p.id})" title="Aprobar"><i class="fas fa-check"></i></button>
                                <button class="btn btn-xs btn-danger" onclick="window.admin.rejectProperty(${p.id})" title="Rechazar"><i class="fas fa-ban"></i></button>
                            ` : ''}
                            <button class="btn btn-xs btn-outline" onclick="window.admin.toggleFeatured(${p.id}, ${p.featured ? 0 : 1})" title="Destacada"><i class="fas fa-star"></i></button>
                            <button class="btn btn-xs btn-danger" onclick="window.admin.deleteProperty(${p.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');

            // Pagination
            renderAdminPagination('adminPropsPagination', data.pagination, (page) => {
                propsPage = page;
                loadProperties();
            });

        } catch (error) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="10"><div class="empty-state-sm"><p>Error al cargar propiedades.</p></div></td></tr>';
            showToast(error.message, 'error');
        }
    }

    async function viewProperty(propertyId) {
        if (!adminPropertyModal) return;

        const modalBody = document.getElementById('adminPropModalBody');
        const modalTitle = document.getElementById('adminPropModalTitle');
        const modalFooter = document.getElementById('adminPropModalFooter');

        if (modalBody) modalBody.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>';

        adminPropertyModal.classList.remove('hidden');

        try {
            const property = await api.get(`/properties/${propertyId}`);

            if (modalTitle) modalTitle.textContent = property.title || 'Propiedad';

            const images = property.images || [];
            const imgHTML = images.length > 0
                ? images.map(img => `<img src="${img.url}" alt="" class="admin-modal-thumb" onerror="this.style.display='none'">`).join('')
                : '<p class="text-muted">Sin imágenes</p>';

            const features = [];
            if (property.has_pool) features.push('Piscina');
            if (property.has_garden) features.push('Jardín');
            if (property.has_ac) features.push('A/C');
            if (property.has_kitchen) features.push('Cocina');
            if (property.has_furniture) features.push('Amueblado');
            if (property.has_security) features.push('Seguridad');
            if (property.has_elevator) features.push('Ascensor');

            if (modalBody) {
                modalBody.innerHTML = `
                    <div class="admin-prop-detail">
                        <div class="admin-prop-images">${imgHTML}</div>
                        <div class="admin-prop-info">
                            <div class="detail-row"><strong>Tipo:</strong> ${getPropertyTypeLabel(property.property_type)}</div>
                            <div class="detail-row"><strong>Operación:</strong> ${getOperationTypeLabel(property.operation_type)}</div>
                            <div class="detail-row"><strong>Precio:</strong> ${formatPrice(property.price, property.currency)}</div>
                            <div class="detail-row"><strong>Dirección:</strong> ${property.address || '--'}</div>
                            <div class="detail-row"><strong>Ciudad:</strong> ${property.city || '--'}, ${property.state || '--'}</div>
                            <div class="detail-row"><strong>Propietario:</strong> ${property.owner_name || '--'} (${property.owner_email || '--'})</div>
                            <div class="detail-row"><strong>Habitaciones:</strong> ${property.bedrooms || '--'}</div>
                            <div class="detail-row"><strong>Baños:</strong> ${property.bathrooms || '--'}</div>
                            <div class="detail-row"><strong>Área:</strong> ${property.area || '--'} ${property.area_unit || 'm²'}</div>
                            ${features.length > 0 ? `<div class="detail-row"><strong>Características:</strong> ${features.join(', ')}</div>` : ''}
                            <div class="detail-row"><strong>Estado:</strong> ${getStatusBadge(property.status)}</div>
                            <div class="detail-row"><strong>Vistas:</strong> ${property.views || 0}</div>
                            <div class="detail-row"><strong>Creada:</strong> ${formatDateTime(property.created_at)}</div>
                            <div class="detail-row"><strong>Descripción:</strong> ${property.description || 'Sin descripción'}</div>
                        </div>
                    </div>
                `;
            }

            if (modalFooter) {
                modalFooter.innerHTML = `
                    ${property.status === 'pending' ? `
                        <button class="btn btn-success" onclick="window.admin.approveProperty(${propertyId}); document.getElementById('adminPropertyModal').classList.add('hidden');">
                            <i class="fas fa-check"></i> Aprobar
                        </button>
                        <button class="btn btn-danger" onclick="window.admin.rejectProperty(${propertyId}); document.getElementById('adminPropertyModal').classList.add('hidden');">
                            <i class="fas fa-ban"></i> Rechazar
                        </button>
                    ` : ''}
                    <button class="btn btn-secondary" onclick="document.getElementById('adminPropertyModal').classList.add('hidden');">Cerrar</button>
                `;
            }
        } catch (error) {
            if (modalBody) modalBody.innerHTML = `<p class="text-danger">Error al cargar la propiedad: ${error.message}</p>`;
        }
    }

    async function approveProperty(id) {
        try {
            await api.post(`/properties/${id}/approve`);
            showToast('Propiedad aprobada exitosamente', 'success');
            loadProperties();
            loadDashboardStats();
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    function rejectProperty(id) {
        currentRejectId = id;
        if (rejectReason) rejectReason.value = '';
        if (adminRejectModal) adminRejectModal.classList.remove('hidden');
    }

    async function confirmReject() {
        if (!currentRejectId) return;

        try {
            await api.post(`/properties/${currentRejectId}/reject`);
            showToast('Propiedad rechazada', 'info');
            closeRejectModal();
            loadProperties();
            loadDashboardStats();
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    function closeRejectModal() {
        if (adminRejectModal) adminRejectModal.classList.add('hidden');
        currentRejectId = null;
    }

    async function toggleFeatured(id, featured) {
        try {
            await api.put(`/properties/${id}`, { featured: featured ? 1 : 0 });
            showToast(featured ? 'Propiedad marcada como destacada' : 'Propiedad removida de destacadas', 'success');
            loadProperties();
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    function deleteProperty(id) {
        if (adminDeleteMsg) adminDeleteMsg.textContent = '¿Estás seguro de que deseas eliminar esta propiedad? Esta acción no se puede deshacer y se eliminarán todas sus imágenes.';
        currentDeleteAction = { type: 'property', id };
        if (adminDeleteModal) adminDeleteModal.classList.remove('hidden');
    }

    async function confirmDelete() {
        if (!currentDeleteAction) return;

        try {
            if (currentDeleteAction.type === 'property') {
                await api.delete(`/properties/${currentDeleteAction.id}`);
                showToast('Propiedad eliminada exitosamente', 'success');
                loadProperties();
                loadDashboardStats();
            } else if (currentDeleteAction.type === 'user') {
                await api.delete(`/users/${currentDeleteAction.id}`);
                showToast('Usuario eliminado exitosamente', 'success');
                loadUsers();
                loadDashboardStats();
            }
            closeDeleteModal();
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    function closeDeleteModal() {
        if (adminDeleteModal) adminDeleteModal.classList.add('hidden');
        currentDeleteAction = null;
    }

    // ─── Users Management ───────────────────────────────────────
    async function loadUsers() {
        const tbody = document.getElementById('adminUsersTableBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr class="empty-row"><td colspan="9"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div></td></tr>';

        try {
            const roleFilter = document.getElementById('adminUserRoleFilter')?.value || '';
            const searchVal = document.getElementById('adminUserSearch')?.value || '';

            let endpoint = `/users?page=${usersPage}&limit=${PAGE_LIMIT}`;
            if (roleFilter) endpoint += `&role=${roleFilter}`;
            if (searchVal) endpoint += `&search=${encodeURIComponent(searchVal)}`;

            const data = await api.get(endpoint);
            const users = data.users || [];

            if (users.length === 0) {
                tbody.innerHTML = '<tr class="empty-row"><td colspan="9"><div class="empty-state-sm"><p>No se encontraron usuarios.</p></div></td></tr>';
                return;
            }

            const myUser = getCachedUser();
            const myId = myUser ? myUser.id : null;

            tbody.innerHTML = users.map(u => {
                const initials = (u.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
                const avatarHTML = u.avatar
                    ? `<div class="admin-user-avatar"><img src="${u.avatar}" alt=""></div>`
                    : `<div class="admin-user-avatar">${initials}</div>`;
                const isSelf = myId && (String(u.id) === String(myId));
                const currentRole = u.role || 'user';
                const selfLabel = isSelf ? ' <span style="color:#aaa;font-size:0.7rem">(Tú)</span>' : '';

                // Role toggle
                let toggleHTML = `<div class="role-toggle" data-user-id="${u.id}" data-current-role="${currentRole}">`;
                toggleHTML += `<button class="role-toggle-btn ${currentRole === 'admin' ? 'active-admin' : ''} ${isSelf ? 'self-badge' : ''}" data-role="admin" ${isSelf ? 'disabled' : ''}><i class="fas fa-shield-alt"></i> Admin</button>`;
                toggleHTML += `<button class="role-toggle-btn ${currentRole === 'user' ? 'active-user' : ''} ${isSelf ? 'self-badge' : ''}" data-role="user" ${isSelf ? 'disabled' : ''}><i class="fas fa-user"></i> User</button>`;
                toggleHTML += `</div>`;

                return `
                    <tr data-user-id="${u.id}">
                        <td>${u.id}</td>
                        <td>
                            <div class="admin-user-cell">
                                ${avatarHTML}
                                <div>
                                    <div class="admin-user-name">${u.name || '--'}${selfLabel}</div>
                                </div>
                            </div>
                        </td>
                        <td style="font-size:0.83rem; color:#666;">${u.email || '--'}</td>
                        <td style="font-size:0.83rem;">${u.phone || '<span style="color:#ccc">—</span>'}</td>
                        <td>
                            <span class="admin-role-badge-inline role-${currentRole}">
                                <i class="fas ${currentRole === 'admin' ? 'fa-shield-alt' : 'fa-user'}"></i>
                                ${currentRole === 'admin' ? 'Admin' : 'Usuario'}
                            </span>
                        </td>
                        <td>${u.is_active ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-danger">Inactivo</span>'}</td>
                        <td style="text-align:center; font-weight:600;">${u.property_count || 0}</td>
                        <td><span class="admin-user-date">${formatDate(u.created_at)}</span></td>
                        <td>
                            ${toggleHTML}
                            <div style="margin-top:6px;">
                                <button class="btn btn-xs btn-outline" onclick="window.admin.editUser(${u.id})" title="Editar"><i class="fas fa-edit"></i></button>
                                <button class="btn btn-xs btn-outline" onclick="window.admin.toggleUserStatus(${u.id}, ${u.is_active ? 0 : 1})" title="${u.is_active ? 'Desactivar' : 'Activar'}"><i class="fas fa-${u.is_active ? 'toggle-on' : 'toggle-off'}"></i></button>
                                <button class="btn btn-xs btn-danger" onclick="window.admin.deleteUser(${u.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            // Attach role toggle handlers
            tbody.querySelectorAll('.role-toggle-btn:not([disabled])').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const toggle = btn.closest('.role-toggle');
                    const userId = toggle.dataset.userId;
                    const currentRole = toggle.dataset.currentRole;
                    const newRole = btn.dataset.role;
                    if (newRole !== currentRole) {
                        toggleUserRole(userId, newRole, toggle);
                    }
                });
            });

            renderAdminPagination('adminUsersPagination', data.pagination, (page) => {
                usersPage = page;
                loadUsers();
            });

        } catch (error) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="9"><div class="empty-state-sm"><p>Error al cargar usuarios.</p></div></td></tr>';
            showToast(error.message, 'error');
        }
    }

    async function toggleUserRole(userId, newRole, toggleEl) {
        const buttons = toggleEl.querySelectorAll('.role-toggle-btn');
        buttons.forEach(b => b.classList.add('saving-role'));

        try {
            await api.put(`/users/${userId}`, { role: newRole });
            showToast(`Rol cambiado a ${newRole === 'admin' ? 'Administrador' : 'Usuario'} exitosamente`, 'success');

            // Update toggle UI
            toggleEl.dataset.currentRole = newRole;
            buttons.forEach(b => {
                b.classList.remove('active-admin', 'active-user', 'active-agent', 'saving-role');
                if (b.dataset.role === newRole) {
                    b.classList.add(newRole === 'admin' ? 'active-admin' : newRole === 'agent' ? 'active-agent' : 'active-user');
                }
            });

            // Update role badge inline
            const row = toggleEl.closest('tr');
            if (row) {
                const badgeCell = row.querySelectorAll('td')[4];
                if (badgeCell) {
                    badgeCell.innerHTML = `
                        <span class="admin-role-badge-inline role-${newRole}">
                            <i class="fas ${newRole === 'admin' ? 'fa-shield-alt' : 'fa-user'}"></i>
                            ${newRole === 'admin' ? 'Admin' : 'Usuario'}
                        </span>
                    `;
                }
            }

            // Refresh stats and dashboard
            loadDashboardStats();
        } catch (error) {
            showToast(error.message || 'Error al cambiar rol', 'error');
            buttons.forEach(b => b.classList.remove('saving-role'));
        }
    }

    async function editUser(userId) {
        if (!adminUserModal) return;

        // Populate form
        try {
            const data = await api.get(`/users/${userId}`);
            const user = data;

            document.getElementById('editUserName').value = user.name || '';
            document.getElementById('editUserEmail').value = user.email || '';
            document.getElementById('editUserRole').value = user.role || 'user';
            document.getElementById('editUserStatus').value = user.is_active ? 'activo' : 'inactivo';

            // Store user ID for saving
            adminUserModal.dataset.userId = userId;
            adminUserModal.classList.remove('hidden');
        } catch (error) {
            showToast('Error al cargar datos del usuario', 'error');
        }
    }

    async function saveUser() {
        if (!adminUserModal) return;

        const userId = adminUserModal.dataset.userId;
        if (!userId) return;

        const name = document.getElementById('editUserName')?.value?.trim();
        const email = document.getElementById('editUserEmail')?.value?.trim();
        const role = document.getElementById('editUserRole')?.value;
        const statusVal = document.getElementById('editUserStatus')?.value;

        if (!name || !email) {
            showToast('Nombre y email son requeridos', 'error');
            return;
        }

        try {
            await api.put(`/users/${userId}`, {
                name,
                email,
                role,
                is_active: statusVal === 'activo',
            });

            showToast('Usuario actualizado exitosamente', 'success');
            adminUserModal.classList.add('hidden');
            loadUsers();
            loadDashboardStats();
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    function toggleUserStatus(userId, active) {
        if (!adminUserModal) return;
        document.getElementById('editUserName').value = '';
        document.getElementById('editUserEmail').value = '';
        document.getElementById('editUserRole').value = 'user';
        document.getElementById('editUserStatus').value = active ? 'activo' : 'inactivo';
        adminUserModal.dataset.userId = userId;
        adminUserModal.classList.remove('hidden');
    }

    function deleteUser(id) {
        if (adminDeleteMsg) adminDeleteMsg.textContent = '¿Estás seguro de que deseas eliminar este usuario? Esta acción no se puede deshacer. Las propiedades del usuario serán eliminadas también.';
        currentDeleteAction = { type: 'user', id };
        if (adminDeleteModal) adminDeleteModal.classList.remove('hidden');
    }

    // ─── Messages Management ────────────────────────────────────
    async function loadMessages() {
        const tbody = document.getElementById('adminMsgsTableBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div></td></tr>';

        try {
            const filterVal = document.getElementById('adminMsgFilter')?.value || '';

            // Use contacts endpoint - we get all, then filter client-side
            // Since there's no specific admin contacts endpoint, use properties approach
            let endpoint = `/contacts?`;
            // Note: The contacts API only has POST. We'll need to get messages through a workaround.
            // For now, we'll show an appropriate message or use stats data.

            // The API currently only has POST for contacts. Admin messages view would need
            // a GET endpoint. Let's show a placeholder and try.
            try {
                const data = await api.get('/contacts');
                const messages = data.contacts || data || [];

                if (Array.isArray(messages) && messages.length === 0) {
                    tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state-sm"><p>No hay mensajes.</p></div></td></tr>';
                    return;
                }

                if (Array.isArray(messages)) {
                    tbody.innerHTML = messages.map(m => `
                        <tr>
                            <td>${formatDate(m.created_at)}</td>
                            <td>${m.sender_name || '--'}</td>
                            <td>${m.sender_email || '--'}</td>
                            <td>${m.property_id || '--'}</td>
                            <td>${truncateText(m.message, 60)}</td>
                            <td>${m.sender_phone || '--'}</td>
                            <td>${m.is_read ? '<span class="badge badge-default">Leído</span>' : '<span class="badge badge-warning">Nuevo</span>'}</td>
                            <td>
                                <button class="btn btn-xs btn-outline" onclick="window.admin.viewMessage(${m.id})" title="Ver"><i class="fas fa-eye"></i></button>
                            </td>
                        </tr>
                    `).join('');
                }
            } catch {
                tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state-sm"><p>No hay mensajes de contacto aún.</p></div></td></tr>';
            }

        } catch (error) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="empty-state-sm"><p>Error al cargar mensajes.</p></div></td></tr>';
        }
    }

    function viewMessage(messageId) {
        // This would need a proper API endpoint to get message by ID
        showToast('Función de detalle de mensaje próximamente disponible', 'info');
    }

    // ─── Modals Setup ───────────────────────────────────────────
    function setupModals() {
        // Delete modal
        if (adminDeleteConfirm) adminDeleteConfirm.addEventListener('click', confirmDelete);
        if (adminDeleteCancel) adminDeleteCancel.addEventListener('click', closeDeleteModal);
        if (adminDeleteModalClose) adminDeleteModalClose.addEventListener('click', closeDeleteModal);
        if (adminDeleteModal) {
            adminDeleteModal.querySelector('.modal-overlay')?.addEventListener('click', closeDeleteModal);
        }

        // Reject modal
        if (adminRejectConfirm) adminRejectConfirm.addEventListener('click', confirmReject);
        if (adminRejectCancel) adminRejectCancel.addEventListener('click', closeRejectModal);
        if (adminRejectModalClose) adminRejectModalClose.addEventListener('click', closeRejectModal);
        if (adminRejectModal) {
            adminRejectModal.querySelector('.modal-overlay')?.addEventListener('click', closeRejectModal);
        }

        // User edit modal
        if (adminUserModalSave) adminUserModalSave.addEventListener('click', saveUser);
        if (adminUserModalCancel) adminUserModalCancel.addEventListener('click', () => adminUserModal?.classList.add('hidden'));
        if (adminUserModalClose) adminUserModalClose.addEventListener('click', () => adminUserModal?.classList.add('hidden'));
        if (adminUserModal) {
            adminUserModal.querySelector('.modal-overlay')?.addEventListener('click', () => adminUserModal.classList.add('hidden'));
        }

        // Property detail modal
        if (adminPropModalClose) adminPropModalClose.addEventListener('click', () => adminPropertyModal?.classList.add('hidden'));
        if (adminPropertyModal) {
            adminPropertyModal.querySelector('.modal-overlay')?.addEventListener('click', () => adminPropertyModal.classList.add('hidden'));
        }

        // Message detail modal
        if (adminMsgModalClose) adminMsgModalClose.addEventListener('click', () => adminMsgModal?.classList.add('hidden'));
        if (adminMsgModalCloseBtn) adminMsgModalCloseBtn.addEventListener('click', () => adminMsgModal?.classList.add('hidden'));
        if (adminMsgModal) {
            adminMsgModal.querySelector('.modal-overlay')?.addEventListener('click', () => adminMsgModal.classList.add('hidden'));
        }
    }

    // ─── Filter Listeners ───────────────────────────────────────
    function setupFilterListeners() {
        // Property filters
        const propStatusFilter = document.getElementById('adminPropStatusFilter');
        const propTypeFilter = document.getElementById('adminPropTypeFilter');
        const propSearch = document.getElementById('adminPropSearch');

        if (propStatusFilter) propStatusFilter.addEventListener('change', () => { propsPage = 1; loadProperties(); });
        if (propTypeFilter) propTypeFilter.addEventListener('change', () => { propsPage = 1; loadProperties(); });
        if (propSearch) propSearch.addEventListener('input', debounce(() => { propsPage = 1; loadProperties(); }, 400));

        // User filters
        const userRoleFilter = document.getElementById('adminUserRoleFilter');
        const userSearch = document.getElementById('adminUserSearch');

        if (userRoleFilter) userRoleFilter.addEventListener('change', () => { usersPage = 1; loadUsers(); });
        if (userSearch) userSearch.addEventListener('input', debounce(() => { usersPage = 1; loadUsers(); }, 400));

        // Message filter
        const msgFilter = document.getElementById('adminMsgFilter');
        if (msgFilter) msgFilter.addEventListener('change', () => { msgsPage = 1; loadMessages(); });
    }

    // ─── Pagination Helper ──────────────────────────────────────
    function renderAdminPagination(containerId, pagination, onPageChange) {
        const container = document.getElementById(containerId);
        if (!container || !pagination) return;

        const { page, totalPages, total } = pagination;

        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        let pagesHTML = '';

        // Previous button
        pagesHTML += `<button class="pagination-btn" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}"><i class="fas fa-chevron-left"></i></button>`;

        // Page numbers
        const maxVisible = 5;
        let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        if (startPage > 1) {
            pagesHTML += `<button class="pagination-btn" data-page="1">1</button>`;
            if (startPage > 2) pagesHTML += '<span class="pagination-dots">...</span>';
        }

        for (let i = startPage; i <= endPage; i++) {
            pagesHTML += `<button class="pagination-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) pagesHTML += '<span class="pagination-dots">...</span>';
            pagesHTML += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        // Next button
        pagesHTML += `<button class="pagination-btn" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}"><i class="fas fa-chevron-right"></i></button>`;

        // Total info
        pagesHTML += `<span class="pagination-info">Total: ${total}</span>`;

        container.innerHTML = pagesHTML;

        // Click handlers
        container.querySelectorAll('.pagination-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = parseInt(btn.dataset.page);
                if (p && p >= 1 && p <= totalPages) {
                    onPageChange(p);
                }
            });
        });
    }

    // ─── Facebook Integration ───────────────────────────────────
    async function loadFacebookConfig() {
        try {
            const data = await api.get('/facebook/config');
            const config = data.config || {};

            if (config.page_id) document.getElementById('fbPageId').value = config.page_id;
            if (config.page_access_token) document.getElementById('fbAccessToken').value = config.page_access_token;
            if (config.default_city) document.getElementById('fbCity').value = config.default_city;
            if (config.auto_approve === '1') document.getElementById('fbAutoApprove').checked = true;

            const statusEl = document.getElementById('fbConfigStatus');
            if (config.page_id && config.page_access_token) {
                statusEl.innerHTML = '<div style="color:#28a745;"><i class="fas fa-check-circle"></i> Facebook conectado. Token: ' + (config.page_access_token_masked || '***') + '</div>';
            }
        } catch (error) {
            // Config not set yet, that's fine
            const statusEl = document.getElementById('fbConfigStatus');
            if (statusEl) statusEl.innerHTML = '<div style="color:#999;"><i class="fas fa-info-circle"></i> No configurado. Ingresa tu Page ID y Token de Facebook.</div>';
        }
    }

    async function saveFacebookConfig() {
        const pageId = document.getElementById('fbPageId')?.value?.trim();
        const accessToken = document.getElementById('fbAccessToken')?.value?.trim();
        const city = document.getElementById('fbCity')?.value?.trim() || 'Barinas';
        const autoApprove = document.getElementById('fbAutoApprove')?.checked;

        if (!pageId || !accessToken) {
            showToast('Page ID y Token son requeridos', 'error');
            return;
        }

        const statusEl = document.getElementById('fbConfigStatus');
        statusEl.innerHTML = '<div style="color:#1a73e8;"><i class="fas fa-spinner fa-spin"></i> Guardando...</div>';

        try {
            const data = await api.post('/facebook/config', {
                page_id: pageId,
                page_access_token: accessToken,
                default_city: city,
                auto_approve: autoApprove,
            });

            if (data.success) {
                statusEl.innerHTML = '<div style="color:#28a745;"><i class="fas fa-check-circle"></i> ' + data.message + '</div>';
                showToast(data.message, 'success');
            } else {
                statusEl.innerHTML = '<div style="color:#e74c3c;"><i class="fas fa-times-circle"></i> ' + (data.error || 'Error al guardar') + '</div>';
                showToast(data.error || 'Error al guardar', 'error');
            }
        } catch (error) {
            statusEl.innerHTML = '<div style="color:#e74c3c;"><i class="fas fa-times-circle"></i> ' + error.message + '</div>';
            showToast(error.message, 'error');
        }
    }

    async function testFacebookConnection() {
        const pageId = document.getElementById('fbPageId')?.value?.trim();
        const accessToken = document.getElementById('fbAccessToken')?.value?.trim();

        if (!pageId || !accessToken) {
            showToast('Ingresa Page ID y Token primero', 'warning');
            return;
        }

        const statusEl = document.getElementById('fbConfigStatus');
        statusEl.innerHTML = '<div style="color:#1a73e8;"><i class="fas fa-spinner fa-spin"></i> Probando conexion con Facebook...</div>';

        try {
            const resp = await fetch(`https://graph.facebook.com/v18.0/${pageId}?fields=name,fan_count&access_token=${accessToken}`);
            const data = await resp.json();

            if (data.error) {
                statusEl.innerHTML = '<div style="color:#e74c3c;"><i class="fas fa-times-circle"></i> Error: ' + data.error.message + ' (Codigo: ' + data.error.code + ')</div>';
                showToast('Error de conexion con Facebook', 'error');
            } else {
                const fans = data.fan_count ? ' con ' + data.fan_count.toLocaleString() + ' seguidores' : '';
                statusEl.innerHTML = '<div style="color:#28a745;"><i class="fas fa-check-circle"></i> Conexion exitosa! Pagina: <strong>' + (data.name || pageId) + '</strong>' + fans + '</div>';
                showToast('Conexion exitosa con Facebook!', 'success');
            }
        } catch (error) {
            statusEl.innerHTML = '<div style="color:#e74c3c;"><i class="fas fa-times-circle"></i> Error de conexion: ' + error.message + '</div>';
            showToast('Error al conectar con Facebook', 'error');
        }
    }

    async function importFromFacebook() {
        const statusEl = document.getElementById('fbImportStatus');
        statusEl.innerHTML = '<div style="color:#1a73e8;"><i class="fas fa-spinner fa-spin"></i> Importando posts desde Facebook... esto puede tomar unos segundos.</div>';

        try {
            const data = await api.post('/facebook/import', {});

            if (data.success) {
                let html = '<div style="color:#28a745;"><i class="fas fa-check-circle"></i> ' + data.message + '</div>';
                if (data.results && data.results.length > 0) {
                    html += '<div style="margin-top:12px;">';
                    html += '<table class="admin-table" style="font-size:13px;"><thead><tr><th>Propiedad</th><th>Imagenes</th></tr></thead><tbody>';
                    data.results.forEach(r => {
                        html += '<tr><td><a href="property.html?id=' + r.property_id + '" target="_blank">' + (r.title || 'Sin titulo') + '</a></td><td>' + r.images + '</td></tr>';
                    });
                    html += '</tbody></table></div>';
                }
                statusEl.innerHTML = html;
                showToast(data.message, 'success');
                loadFacebookHistory();
                loadDashboardStats();
            } else {
                statusEl.innerHTML = '<div style="color:#e74c3c;"><i class="fas fa-times-circle"></i> ' + (data.error || 'Error en la importacion') + '</div>';
                showToast(data.error || 'Error al importar', 'error');
            }
        } catch (error) {
            statusEl.innerHTML = '<div style="color:#e74c3c;"><i class="fas fa-times-circle"></i> ' + error.message + '</div>';
            showToast(error.message, 'error');
        }
    }

    async function loadFacebookHistory() {
        const container = document.getElementById('fbHistoryContent');
        if (!container) return;

        container.innerHTML = '<p style="color:#999;"><i class="fas fa-spinner fa-spin"></i> Cargando historial...</p>';

        try {
            const data = await api.get('/facebook/history?limit=30');

            if (!data.history || data.history.length === 0) {
                container.innerHTML = '<p style="color:#999;"><i class="fas fa-inbox"></i> No hay importaciones todavia. Configura Facebook y luego haz clic en "Importar Posts Ahora".</p>';
                return;
            }

            let html = '<div style="margin-bottom:8px;color:#666;">';
            html += '<strong>Total procesados:</strong> ' + data.total + ' | ';
            html += '<strong>Importados como propiedad:</strong> ' + data.imported + ' | ';
            html += '<strong>Omitidos (sin foto):</strong> ' + data.skipped;
            html += '</div>';

            html += '<div class="admin-table-responsive"><table class="admin-table" style="font-size:13px;">';
            html += '<thead><tr><th>Fecha</th><th>Post</th><th>Propiedad</th><th>Estado</th></tr></thead><tbody>';

            data.history.forEach(h => {
                const statusHTML = h.property_id
                    ? '<a href="property.html?id=' + h.property_id + '" target="_blank" class="badge badge-success">Ver Propiedad</a>'
                    : '<span class="badge badge-warning">Omitido</span>';
                const title = h.property_title || (h.post_message ? truncateText(h.post_message, 40) : 'Post sin texto');
                html += '<tr>';
                html += '<td>' + (h.imported_at ? formatDate(h.imported_at) : '--') + '</td>';
                html += '<td>' + title + '</td>';
                html += '<td>' + (h.property_id ? '#' + h.property_id : '--') + '</td>';
                html += '<td>' + statusHTML + '</td>';
                html += '</tr>';
            });

            html += '</tbody></table></div>';
            container.innerHTML = html;
        } catch (error) {
            container.innerHTML = '<p style="color:#e74c3c;">Error al cargar historial: ' + error.message + '</p>';
        }
    }

    // ─── Expose functions for inline onclick handlers ───────────
    window.admin = {
        viewProperty,
        approveProperty,
        rejectProperty,
        toggleFeatured,
        deleteProperty,
        editUser,
        toggleUserStatus,
        deleteUser,
        viewMessage,
    };

    // ─── Facebook Event Listeners (set up in init) ─────────────
    function setupFacebookListeners() {
        const fbSaveConfigBtn = document.getElementById('fbSaveConfig');
        const fbTestConnectionBtn = document.getElementById('fbTestConnection');
        const fbImportNowBtn = document.getElementById('fbImportNow');

        if (fbSaveConfigBtn) fbSaveConfigBtn.addEventListener('click', saveFacebookConfig);
        if (fbTestConnectionBtn) fbTestConnectionBtn.addEventListener('click', testFacebookConnection);
        if (fbImportNowBtn) fbImportNowBtn.addEventListener('click', importFromFacebook);
    }

    // ─── Initialize on DOM Ready ────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
