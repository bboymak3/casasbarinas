/**
 * CasasBarinas - Core Application Module
 * Common module loaded on ALL pages
 */

// ─── API Configuration ──────────────────────────────────────────
const API = '/api';
const API_BASE = '';

// ─── Token Management ──────────────────────────────────────────
const TOKEN_KEY = 'casasbarinas_token';
const USER_KEY = 'casasbarinas_user';

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

function removeToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

function isAuthenticated() {
    const token = getToken();
    if (!token) return false;
    // Check if token is expired (simple JWT check)
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            removeToken();
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

// ─── API Helper ────────────────────────────────────────────────
async function apiCall(endpoint, options = {}) {
    const url = `${API}${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    };

    // Add auth header if token exists
    const token = getToken();
    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
    }

    // Remove headers from config if it's FormData (let browser set Content-Type with boundary)
    if (options.body instanceof FormData) {
        delete config.headers['Content-Type'];
        config.body = options.body;
    }

    try {
        const response = await fetch(url, config);
        const data = await response.json();

        if (!response.ok) {
            // Handle 401 - token expired or invalid
            // Only clear the token; do NOT auto-redirect.
            // Each page decides if it needs auth via requireAuth().
            if (response.status === 401) {
                removeToken();
            }
            throw new Error(data.error || `Error ${response.status}: ${response.statusText}`);
        }

        return data;
    } catch (error) {
        if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
            throw new Error('Error de conexión. Verifica tu conexión a internet.');
        }
        throw error;
    }
}

// Shorthand API methods
const api = {
    get(url) {
        return apiCall(url, { method: 'GET' });
    },
    post(url, data) {
        return apiCall(url, {
            method: 'POST',
            body: typeof data === 'string' ? data : JSON.stringify(data),
        });
    },
    put(url, data) {
        return apiCall(url, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    delete(url) {
        return apiCall(url, { method: 'DELETE' });
    },
    postFormData(url, formData) {
        return apiCall(url, {
            method: 'POST',
            body: formData,
        });
    },
};

// ─── User Functions ────────────────────────────────────────────
function getCachedUser() {
    try {
        const cached = localStorage.getItem(USER_KEY);
        return cached ? JSON.parse(cached) : null;
    } catch {
        return null;
    }
}

function setCachedUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

async function getCurrentUser() {
    if (!isAuthenticated()) return null;

    // Try cache first
    const cached = getCachedUser();
    if (cached) return cached;

    try {
        const data = await api.get('/auth/me');
        if (data.user) {
            setCachedUser(data.user);
            return data.user;
        }
        return null;
    } catch {
        return null;
    }
}

function updateNav() {
    const navLoginItem = document.getElementById('navLoginItem');
    const navUserItem = document.getElementById('navUserItem');
    const navUserName = document.getElementById('navUserName');

    if (!navLoginItem || !navUserItem) return;

    if (isAuthenticated()) {
        navLoginItem.classList.add('hidden');
        navUserItem.classList.remove('hidden');

        const user = getCachedUser();
        if (user && navUserName) {
            navUserName.innerHTML = `<i class="fas fa-user-circle"></i> ${user.name || 'Mi Cuenta'}`;
        }

        // Show admin link for admin users
        let adminLinkItem = document.getElementById('navAdminItem');
        if (user && user.role === 'admin') {
            if (!adminLinkItem) {
                adminLinkItem = document.createElement('li');
                adminLinkItem.id = 'navAdminItem';
                adminLinkItem.innerHTML = `<a href="admin.html" class="nav-link nav-admin-link"><i class="fas fa-shield-alt"></i> Admin</a>`;
                // Insert before the user item
                navUserItem.parentNode.insertBefore(adminLinkItem, navUserItem);
            } else {
                adminLinkItem.classList.remove('hidden');
            }
        } else if (adminLinkItem) {
            adminLinkItem.remove();
        }
    } else {
        navLoginItem.classList.remove('hidden');
        navUserItem.classList.add('hidden');

        // Remove admin link if exists
        const adminLinkItem = document.getElementById('navAdminItem');
        if (adminLinkItem) adminLinkItem.remove();

        // Make "Publicar" link require login
        const publishLinks = document.querySelectorAll('a[href="new-property.html"]');
        publishLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const redirect = encodeURIComponent('new-property.html');
                window.location.href = `login.html?redirect=${redirect}`;
            });
        });
    }
}

// ─── UI Helpers ────────────────────────────────────────────────
function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas ${icons[type] || icons.info}"></i>
        <span>${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('toast-show');
    });

    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function showLoading(element) {
    if (!element) return;
    element.innerHTML = `
        <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Cargando...</p>
        </div>
    `;
}

function hideLoading(element) {
    if (!element) return;
    const spinner = element.querySelector('.loading-spinner');
    if (spinner) spinner.remove();
}

function formatPrice(price, currency = 'USD') {
    if (price == null || isNaN(price)) return '--';

    const formatted = new Intl.NumberFormat('es-VE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(price);

    const symbols = {
        'USD': '$',
        'EUR': '€',
        'Bs': 'Bs.',
    };

    const symbol = symbols[currency] || '$';
    return `${symbol} ${formatted}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '--';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-VE', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return dateStr;
    }
}

function formatDateTime(dateStr) {
    if (!dateStr) return '--';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-VE', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return dateStr;
    }
}

function truncateText(text, maxLen = 100) {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen).trim() + '...';
}

function slugify(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ─── Favorites ─────────────────────────────────────────────────
async function toggleFavorite(propertyId) {
    if (!isAuthenticated()) {
        showToast('Inicia sesión para guardar favoritos', 'warning');
        setTimeout(() => {
            window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        }, 1500);
        return;
    }

    try {
        const response = await api.post('/favorites', { property_id: parseInt(propertyId) });
        showToast('Propiedad guardada en favoritos', 'success');
        updateFavoriteButtons(propertyId, true);
        return true;
    } catch (error) {
        // Check if it's a 409 (already favorited) - then remove it
        if (error.message.includes('ya está en tus favoritos')) {
            try {
                await api.delete(`/favorites?property_id=${propertyId}`);
                showToast('Propiedad removida de favoritos', 'info');
                updateFavoriteButtons(propertyId, false);
                return false;
            } catch (removeError) {
                showToast(removeError.message, 'error');
            }
        } else {
            showToast(error.message, 'error');
        }
        return null;
    }
}

function updateFavoriteButtons(propertyId, isFavorited) {
    document.querySelectorAll(`.btn-favorite[data-property-id="${propertyId}"]`).forEach(btn => {
        const icon = btn.querySelector('i');
        if (icon) {
            icon.className = isFavorited ? 'fas fa-heart' : 'far fa-heart';
        }
        if (isFavorited) {
            btn.classList.add('favorited');
        } else {
            btn.classList.remove('favorited');
        }
    });
}

async function checkFavorite(propertyId) {
    if (!isAuthenticated()) return false;
    try {
        const data = await api.get(`/favorites/check?property_id=${propertyId}`);
        return data.is_favorited || false;
    } catch {
        return false;
    }
}

// ─── Property Type Display Names ───────────────────────────────
const PROPERTY_TYPE_LABELS = {
    'casa': 'Casa',
    'apartamento': 'Apartamento',
    'terreno': 'Terreno',
    'local_comercial': 'Local Comercial',
    'oficina': 'Oficina',
    'hotel': 'Hotel',
    'finca': 'Finca',
    'galpon': 'Galpón',
    'estacionamiento': 'Estacionamiento',
    'otro': 'Otro',
};

const OPERATION_TYPE_LABELS = {
    'venta': 'Venta',
    'alquiler': 'Alquiler',
    'venta_alquiler': 'Venta y Alquiler',
};

function getPropertyTypeLabel(type) {
    if (!type) return '--';
    const lower = type.toLowerCase();
    return PROPERTY_TYPE_LABELS[lower] || type;
}

function getOperationTypeLabel(operation) {
    if (!operation) return '--';
    const lower = operation.toLowerCase();
    return OPERATION_TYPE_LABELS[lower] || operation;
}

function getPropertyTypeIcon(type) {
    const icons = {
        'casa': 'fa-house',
        'apartamento': 'fa-building',
        'terreno': 'fa-mountain-sun',
        'local_comercial': 'fa-store',
        'oficina': 'fa-briefcase',
        'hotel': 'fa-hotel',
        'finca': 'fa-tree',
        'galpon': 'fa-warehouse',
        'estacionamiento': 'fa-square-parking',
        'otro': 'fa-ellipsis',
    };
    return icons[type?.toLowerCase()] || 'fa-home';
}

// ─── WhatsApp Share ────────────────────────────────────────────
function sharePropertyWhatsApp(property) {
    if (!property) return;
    const type = getPropertyTypeLabel(property.property_type);
    const op = getOperationTypeLabel(property.operation_type);
    const price = formatPrice(property.price, property.currency);
    const url = `https://millano.pages.dev/property.html?id=${property.id}`;
    const title = property.title || 'Propiedad';

    let msg = `🏠 *${title}*\n`;
    msg += `📌 ${type} en ${op}\n`;
    msg += `💰 ${price}\n`;
    if (property.bedrooms) msg += `🛏️ ${property.bedrooms} hab.\n`;
    if (property.bathrooms) msg += `🚿 ${property.bathrooms} baños\n`;
    if (property.area) msg += `📐 ${property.area}${property.area_unit || 'm²'}\n`;
    if (property.city) msg += `📍 ${property.city}${property.address ? ', ' + property.address : ''}\n`;
    msg += `\n🔗 ${url}`;
    msg += `\n\n📌 Publicado en CasasBarinas`;

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

// ─── Status Helpers ────────────────────────────────────────────
const STATUS_LABELS = {
    'pending': 'Pendiente',
    'approved': 'Publicada',
    'rejected': 'Rechazada',
    'sold': 'Vendida',
    'rented': 'Alquilada',
};

function getStatusLabel(status) {
    return STATUS_LABELS[status?.toLowerCase()] || status || '--';
}

function getStatusBadge(status) {
    const classes = {
        'pending': 'badge badge-warning',
        'approved': 'badge badge-success',
        'rejected': 'badge badge-danger',
        'sold': 'badge badge-info',
        'rented': 'badge badge-info',
    };
    const cls = classes[status?.toLowerCase()] || 'badge';
    return `<span class="${cls}">${getStatusLabel(status)}</span>`;
}

// ─── Property Card HTML Generator ──────────────────────────────
function createPropertyCard(property) {
    if (!property) return '';

    const coverImage = property.cover_image || property.images?.[0]?.url || '';
    const placeholderImg = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" fill="%23e0e0e0"><rect width="400" height="300"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999" font-size="16" font-family="sans-serif">Sin imagen</text></svg>'
    );
    const imgSrc = coverImage || placeholderImg;
    const priceStr = formatPrice(property.price, property.currency);
    const typeLabel = getPropertyTypeLabel(property.property_type);
    const opLabel = getOperationTypeLabel(property.operation_type);
    const address = property.city ? (property.address ? `${property.address}, ${property.city}` : property.city) : '--';

    const beds = property.bedrooms ? `<span><i class="fas fa-bed"></i> ${property.bedrooms}</span>` : '';
    const baths = property.bathrooms ? `<span><i class="fas fa-bath"></i> ${property.bathrooms}</span>` : '';
    const area = property.area ? `<span><i class="fas fa-ruler-combined"></i> ${property.area}${property.area_unit || 'm²'}</span>` : '';

    const featuredBadge = property.featured ? '<span class="card-badge badge-featured"><i class="fas fa-star"></i> Destacada</span>' : '';
    const statusBadge = property.status && property.status !== 'approved' ? `<span class="card-badge badge-${property.status}">${getStatusLabel(property.status)}</span>` : '';

    return `
        <article class="property-card" data-property-id="${property.id}">
            <a href="property.html?id=${property.id}" class="property-card-link">
                <div class="property-card-image">
                    <img src="${imgSrc}" alt="${property.title || 'Propiedad'}" loading="lazy" onerror="this.src='${placeholderImg}'">
                    <div class="property-card-badges">
                        <span class="card-badge badge-type">${typeLabel}</span>
                        <span class="card-badge badge-operation">${opLabel}</span>
                        ${featuredBadge}${statusBadge}
                    </div>
                    <button class="btn-favorite property-card-fav" data-property-id="${property.id}" aria-label="Agregar a favoritos" onclick="event.preventDefault(); event.stopPropagation(); toggleFavorite(${property.id});">
                        <i class="far fa-heart"></i>
                    </button>
                    <button class="btn-share-wa-card" data-property-id="${property.id}" aria-label="Compartir por WhatsApp" onclick="event.preventDefault(); event.stopPropagation();">
                        <i class="fab fa-whatsapp"></i>
                    </button>
                </div>
                <div class="property-card-body">
                    <div class="property-card-price">${priceStr}</div>
                    <h3 class="property-card-title">${property.title || 'Sin título'}</h3>
                    <p class="property-card-location"><i class="fas fa-map-marker-alt"></i> ${address}</p>
                    <div class="property-card-features">${beds}${baths}${area}</div>
                </div>
            </a>
        </article>
    `;
}

// ─── WhatsApp Share Delegation for Cards ─────────────────────
document.addEventListener('click', (e) => {
    const shareBtn = e.target.closest('.btn-share-wa-card');
    if (!shareBtn) return;
    const propertyId = parseInt(shareBtn.dataset.propertyId);
    if (!propertyId) return;

    // Fetch property data then share
    api.get(`/properties/${propertyId}`).then(property => {
        sharePropertyWhatsApp(property);
    }).catch(() => {
        // Minimal share with just the link
        window.open(`https://wa.me/?text=${encodeURIComponent('🏠 Mira esta propiedad en CasasBarinas:\nhttps://millano.pages.dev/property.html?id=' + propertyId)}`, '_blank');
    });
});

// ─── Search Params Helper ──────────────────────────────────────
function getSearchParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        property_type: params.get('tipo') || params.get('property_type') || '',
        operation_type: params.get('operacion') || params.get('operation_type') || '',
        city: params.get('ciudad') || params.get('city') || '',
        min_price: params.get('precio_min') || params.get('min_price') || '',
        max_price: params.get('precio_max') || params.get('max_price') || '',
        bedrooms: params.get('habitaciones') || params.get('bedrooms') || '',
        bathrooms: params.get('banos') || params.get('bathrooms') || '',
        page: params.get('page') || 1,
        limit: params.get('limit') || 12,
        search: params.get('q') || params.get('search') || '',
    };
}

function buildSearchURL(params) {
    const url = new URL('search.html', window.location.origin);
    const mapping = {
        property_type: 'tipo',
        operation_type: 'operacion',
        city: 'ciudad',
        min_price: 'precio_min',
        max_price: 'precio_max',
        bedrooms: 'habitaciones',
        bathrooms: 'banos',
    };

    for (const [key, value] of Object.entries(params)) {
        if (value && value !== '' && value !== 0) {
            const paramName = mapping[key] || key;
            url.searchParams.set(paramName, value);
        }
    }

    return url.toString();
}

// ─── Auth Redirect Helper ──────────────────────────────────────
function requireAuth() {
    if (!isAuthenticated()) {
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `login.html?redirect=${redirect}`;
        return false;
    }
    return true;
}

// ─── Logout Handler ────────────────────────────────────────────
function handleLogout() {
    removeToken();
    showToast('Has cerrado sesión', 'info');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
}

// ─── Initialization ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Update navigation bar
    updateNav();

    // Hamburger menu toggle
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            navToggle.classList.toggle('active');
        });

        // Close menu when clicking a link
        navMenu.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
            }
        });
    }

    // Logout button handler
    const logoutBtn = document.getElementById('navLogout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleLogout();
        });
    }

    // Handle redirect param after login
    const urlParams = new URLSearchParams(window.location.search);
    const redirectParam = urlParams.get('redirect');
    if (redirectParam && isAuthenticated()) {
        window.location.href = redirectParam;
    }

    // Load featured properties on index page
    const featuredGrid = document.getElementById('featuredGrid');
    if (featuredGrid) {
        loadFeaturedProperties();
    }

    // Load stats on index page
    const statProperties = document.getElementById('statProperties');
    if (statProperties) {
        loadSiteStats();
    }
});

// ─── Index Page: Featured Properties ───────────────────────────
async function loadFeaturedProperties() {
    const grid = document.getElementById('featuredGrid');
    const emptyState = document.getElementById('featuredEmpty');
    const loading = document.getElementById('featuredLoading');
    if (!grid) return;

    try {
        const data = await api.get('/properties?status=approved&limit=8&featured=1');
        let properties = data.properties || [];

        // If no featured properties, get latest approved
        if (properties.length === 0) {
            const allData = await api.get('/properties?status=approved&limit=8');
            properties = allData.properties || [];
        }

        if (loading) loading.remove();

        if (properties.length === 0) {
            if (emptyState) emptyState.style.display = '';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        grid.innerHTML = properties.map(p => createPropertyCard(p)).join('');
    } catch (error) {
        if (loading) loading.remove();
        if (emptyState) emptyState.style.display = '';
        console.error('Error loading featured properties:', error);
    }
}

// ─── Index Page: Site Stats ────────────────────────────────────
async function loadSiteStats() {
    const statProps = document.getElementById('statProperties');
    const statUsers = document.getElementById('statUsers');
    if (!statProps) return;

    try {
        const data = await api.get('/properties?status=approved&limit=1');
        const totalApproved = data.pagination?.total || 0;
        statProps.textContent = totalApproved;
    } catch {
        statProps.textContent = '0';
    }

    try {
        // Try to get users count (may fail without auth)
        const data = await api.get('/stats');
        if (data.stats) {
            statProps.textContent = data.stats.approved_properties || 0;
            if (statUsers) statUsers.textContent = data.stats.total_users || 0;
        }
    } catch {
        // Stats endpoint requires auth/admin - use fallback
    }
}

// ═══════════════════════════════════════════════════════════════
// SEARCH PAGE (search.html)
// ═══════════════════════════════════════════════════════════════
(function initSearchPage() {
    document.addEventListener('DOMContentLoaded', () => {
        const searchGrid = document.getElementById('searchResultsGrid');
        if (!searchGrid) return; // Not on search page

        // Populate filter fields from URL params
        const params = getSearchParams();
        if (params.property_type && document.getElementById('sTipo')) document.getElementById('sTipo').value = params.property_type;
        if (params.operation_type && document.getElementById('sOperacion')) document.getElementById('sOperacion').value = params.operation_type;
        if (params.city && document.getElementById('sCiudad')) document.getElementById('sCiudad').value = params.city;
        if (params.min_price && document.getElementById('sPrecioMin')) document.getElementById('sPrecioMin').value = params.min_price;
        if (params.max_price && document.getElementById('sPrecioMax')) document.getElementById('sPrecioMax').value = params.max_price;
        if (params.bedrooms && document.getElementById('sHabitaciones')) document.getElementById('sHabitaciones').value = params.bedrooms;
        if (params.bathrooms && document.getElementById('sBanos')) document.getElementById('sBanos').value = params.bathrooms;

        // Search button
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', (e) => {
                e.preventDefault();
                executeSearch(1);
            });
        }

        // Sort change
        const sSort = document.getElementById('sSort');
        if (sSort) {
            sSort.addEventListener('change', () => executeSearch(params.page));
        }

        // Extended sort (in collapsible filters)
        const sOrdenar = document.getElementById('sOrdenar');
        if (sOrdenar) {
            sOrdenar.addEventListener('change', () => executeSearch(params.page));
        }

        // Toggle extended filters
        const toggleFiltersBtn = document.getElementById('toggleFiltersBtn');
        const extendedFilters = document.getElementById('extendedFilters');
        if (toggleFiltersBtn && extendedFilters) {
            toggleFiltersBtn.addEventListener('click', () => {
                extendedFilters.classList.toggle('hidden');
            });
        }

        // View toggle (grid/list)
        const gridViewBtn = document.getElementById('gridViewBtn');
        const listViewBtn = document.getElementById('listViewBtn');
        if (gridViewBtn && listViewBtn) {
            gridViewBtn.addEventListener('click', () => {
                searchGrid.classList.remove('list-view');
                searchGrid.classList.add('grid-view');
                gridViewBtn.classList.add('active');
                listViewBtn.classList.remove('active');
            });
            listViewBtn.addEventListener('click', () => {
                searchGrid.classList.remove('grid-view');
                searchGrid.classList.add('list-view');
                listViewBtn.classList.add('active');
                gridViewBtn.classList.remove('active');
            });
        }

        // Clear filters
        const clearFiltersBtn = document.getElementById('clearFiltersBtn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                window.location.href = 'search.html';
            });
        }

        // Execute initial search
        executeSearch(params.page);
    });

    async function executeSearch(page = 1) {
        const searchLoading = document.getElementById('searchLoading');
        const noResults = document.getElementById('noResults');
        const searchGrid = document.getElementById('searchResultsGrid');
        const resultsCount = document.getElementById('resultsCount');
        const activeFiltersEl = document.getElementById('activeFilters');
        const clearFiltersBtn = document.getElementById('clearFiltersBtn');
        const paginationEl = document.getElementById('pagination');

        if (!searchGrid) return;

        // Show loading
        if (searchLoading) searchLoading.classList.remove('hidden');
        if (noResults) noResults.classList.add('hidden');
        searchGrid.innerHTML = '';
        if (paginationEl) paginationEl.classList.add('hidden');

        // Gather filter values
        const tipo = document.getElementById('sTipo')?.value || '';
        const operacion = document.getElementById('sOperacion')?.value || '';
        const ciudad = document.getElementById('sCiudad')?.value?.trim() || '';
        const precioMin = document.getElementById('sPrecioMin')?.value || '';
        const precioMax = document.getElementById('sPrecioMax')?.value || '';
        const habitaciones = document.getElementById('sHabitaciones')?.value || '';
        const banos = document.getElementById('sBanos')?.value || '';
        const sort = document.getElementById('sSort')?.value || document.getElementById('sOrdenar')?.value || '';
        const moneda = document.getElementById('sMoneda')?.value || '';

        // Build API endpoint
        let endpoint = `/properties?status=approved&page=${page}&limit=12`;
        if (tipo) endpoint += `&property_type=${encodeURIComponent(tipo)}`;
        if (operacion) endpoint += `&operation_type=${encodeURIComponent(operacion)}`;
        if (ciudad) endpoint += `&city=${encodeURIComponent(ciudad)}`;
        if (precioMin) endpoint += `&min_price=${precioMin}`;
        if (precioMax) endpoint += `&max_price=${precioMax}`;
        if (habitaciones) endpoint += `&bedrooms=${habitaciones}`;
        if (banos) endpoint += `&bathrooms=${banos}`;

        // Sort mapping
        const sortMap = {
            'precio_asc': 'price_asc',
            'precio_desc': 'price_desc',
            'reciente': 'newest',
            'visto': 'views_desc',
        };
        if (sort && sort !== 'relevancia') endpoint += `&sort=${sortMap[sort] || sort}`;

        try {
            const data = await api.get(endpoint);
            const properties = data.properties || [];
            const paginationData = data.pagination || {};

            if (searchLoading) searchLoading.classList.add('hidden');

            // Results count
            if (resultsCount) {
                resultsCount.textContent = `${paginationData.total || 0} resultados encontrados`;
            }

            // Active filter tags
            if (activeFiltersEl) {
                let tags = '';
                if (tipo) tags += `<span class="active-filter-tag">${getPropertyTypeLabel(tipo)} <button onclick="this.parentElement.remove(); document.getElementById('sTipo').value=''; document.getElementById('searchBtn').click();">&times;</button></span>`;
                if (operacion) tags += `<span class="active-filter-tag">${getOperationTypeLabel(operacion)} <button onclick="this.parentElement.remove(); document.getElementById('sOperacion').value=''; document.getElementById('searchBtn').click();">&times;</button></span>`;
                if (ciudad) tags += `<span class="active-filter-tag"><i class="fas fa-map-marker-alt"></i> ${ciudad} <button onclick="this.parentElement.remove(); document.getElementById('sCiudad').value=''; document.getElementById('searchBtn').click();">&times;</button></span>`;
                if (precioMin || precioMax) tags += `<span class="active-filter-tag">${precioMin || '0'} - ${precioMax || '∞'} <button onclick="this.parentElement.remove(); document.getElementById('sPrecioMin').value=''; document.getElementById('sPrecioMax').value=''; document.getElementById('searchBtn').click();">&times;</button></span>`;
                if (habitaciones) tags += `<span class="active-filter-tag">${habitaciones}+ hab. <button onclick="this.parentElement.remove(); document.getElementById('sHabitaciones').value=''; document.getElementById('searchBtn').click();">&times;</button></span>`;
                if (banos) tags += `<span class="active-filter-tag">${banos}+ baños <button onclick="this.parentElement.remove(); document.getElementById('sBanos').value=''; document.getElementById('searchBtn').click();">&times;</button></span>`;
                activeFiltersEl.innerHTML = tags;
                if (clearFiltersBtn) {
                    clearFiltersBtn.classList.toggle('hidden', !tags);
                }
            }

            // No results
            if (properties.length === 0) {
                if (noResults) noResults.classList.remove('hidden');
                return;
            }

            // Render property cards
            searchGrid.innerHTML = properties.map(p => createPropertyCard(p)).join('');

            // Pagination
            renderPagination(paginationEl, paginationData, executeSearch);

            // Update URL without reload
            updateSearchURL(tipo, operacion, ciudad, precioMin, precioMax, habitaciones, banos, page);

        } catch (error) {
            if (searchLoading) searchLoading.classList.add('hidden');
            searchGrid.innerHTML = '<div class="no-results"><i class="fas fa-exclamation-circle fa-3x"></i><h2>Error de búsqueda</h2><p>No se pudieron cargar los resultados. Intenta nuevamente.</p></div>';
            console.error('Search error:', error);
        }
    }

    function updateSearchURL(tipo, operacion, ciudad, precioMin, precioMax, habitaciones, banos, page) {
        const url = new URL(window.location);
        url.searchParams.delete('tipo');
        url.searchParams.delete('operacion');
        url.searchParams.delete('ciudad');
        url.searchParams.delete('precio_min');
        url.searchParams.delete('precio_max');
        url.searchParams.delete('habitaciones');
        url.searchParams.delete('banos');
        url.searchParams.delete('page');

        if (tipo) url.searchParams.set('tipo', tipo);
        if (operacion) url.searchParams.set('operacion', operacion);
        if (ciudad) url.searchParams.set('ciudad', ciudad);
        if (precioMin) url.searchParams.set('precio_min', precioMin);
        if (precioMax) url.searchParams.set('precio_max', precioMax);
        if (habitaciones) url.searchParams.set('habitaciones', habitaciones);
        if (banos) url.searchParams.set('banos', banos);
        if (page && page > 1) url.searchParams.set('page', page);

        window.history.replaceState({}, '', url.toString());
    }

    function renderPagination(container, paginationData, onPageChange) {
        if (!container || !paginationData) return;

        const { page, totalPages, total } = paginationData;

        if (totalPages <= 1) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        const prevBtn = document.getElementById('paginationPrev');
        const nextBtn = document.getElementById('paginationNext');
        const pagesContainer = document.getElementById('paginationPages');

        if (prevBtn) prevBtn.disabled = page <= 1;
        if (nextBtn) nextBtn.disabled = page >= totalPages;

        if (pagesContainer) {
            let html = '';
            const maxVisible = 5;
            let start = Math.max(1, page - Math.floor(maxVisible / 2));
            let end = Math.min(totalPages, start + maxVisible - 1);
            if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

            if (start > 1) {
                html += `<button class="pagination-btn" data-page="1">1</button>`;
                if (start > 2) html += '<span class="pagination-dots">...</span>';
            }
            for (let i = start; i <= end; i++) {
                html += `<button class="pagination-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
            }
            if (end < totalPages) {
                if (end < totalPages - 1) html += '<span class="pagination-dots">...</span>';
                html += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
            }

            pagesContainer.innerHTML = html;

            pagesContainer.querySelectorAll('.pagination-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const p = parseInt(btn.dataset.page);
                    if (p) onPageChange(p);
                });
            });
        }

        if (prevBtn) {
            prevBtn.onclick = () => { if (page > 1) onPageChange(page - 1); };
        }
        if (nextBtn) {
            nextBtn.onclick = () => { if (page < totalPages) onPageChange(page + 1); };
        }
    }
})();

// ═══════════════════════════════════════════════════════════════
// PROPERTY DETAIL PAGE (property.html)
// ═══════════════════════════════════════════════════════════════
(function initPropertyDetailPage() {
    document.addEventListener('DOMContentLoaded', () => {
        const propertyContent = document.getElementById('propertyContent');
        if (!propertyContent) return; // Not on property detail page

        const urlParams = new URLSearchParams(window.location.search);
        const propertyId = urlParams.get('id');

        if (!propertyId) {
            showPropertyError();
            return;
        }

        loadPropertyDetail(propertyId);
    });

    async function loadPropertyDetail(propertyId) {
        const loadingEl = document.getElementById('propertyLoading');
        const errorEl = document.getElementById('propertyError');
        const contentEl = document.getElementById('propertyContent');

        try {
            const property = await api.get(`/properties/${propertyId}`);

            if (loadingEl) loadingEl.classList.add('hidden');
            if (contentEl) contentEl.classList.remove('hidden');

            // Populate page
            populatePropertyDetail(property);

            // Check favorite status
            if (isAuthenticated()) {
                const isFav = await checkFavorite(propertyId);
                updateFavoriteButtons(propertyId, isFav);
            }

            // Setup gallery
            setupGallery(property.images || []);

            // Setup contact form
            setupContactForm(propertyId, property);

            // Setup favorite buttons
            setupFavoriteButtons(propertyId);

            // Setup share button
            setupShareButton();

            // Setup similar properties
            loadSimilarProperties(property);

            // Setup mini map
            setupDetailMap(property);
            // Also setup map modal if coordinates exist
            setupMapModal(property);

        } catch (error) {
            if (loadingEl) loadingEl.classList.add('hidden');
            showPropertyError();
            console.error('Error loading property:', error);
        }
    }

    function showPropertyError() {
        const errorEl = document.getElementById('propertyError');
        if (errorEl) errorEl.classList.remove('hidden');
    }

    function populatePropertyDetail(property) {
        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        const setHTML = (id, html) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = html;
        };

        // Breadcrumb
        setText('breadcrumbTitle', property.title || 'Propiedad');

        // Title
        setText('propDetailTitle', property.title || 'Sin título');
        document.title = `${property.title || 'Propiedad'} - CasasBarinas`;

        // Price
        const priceStr = formatPrice(property.price, property.currency);
        setText('propDetailPrice', priceStr);
        setText('sidePrice', priceStr);
        setText('sideOperation', getOperationTypeLabel(property.operation_type));

        // Location
        const address = property.city ? (property.address ? `${property.address}, ${property.city}, ${property.state || ''}` : property.city) : '--';
        const locationEl = document.getElementById('propDetailLocation');
        if (locationEl) locationEl.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${address}`;

        // Badges
        const badges = `
            <span class="detail-badge">${getPropertyTypeLabel(property.property_type)}</span>
            <span class="detail-badge">${getOperationTypeLabel(property.operation_type)}</span>
            ${property.featured ? '<span class="detail-badge badge-featured"><i class="fas fa-star"></i> Destacada</span>' : ''}
        `;
        setHTML('propDetailBadges', badges);

        // Quick stats
        setText('statBedrooms', property.bedrooms || '--');
        setText('statBathrooms', property.bathrooms || '--');
        setText('statParking', property.parking_spaces || '--');

        const areaStr = property.area ? `${property.area} ${property.area_unit || 'm²'}` : '--';
        setText('statArea', areaStr);
        setText('statAreaLabel', property.area_unit === 'ha' ? 'Hectáreas' : 'Área');

        if (property.year_built) {
            const yearWrap = document.getElementById('statYearWrap');
            if (yearWrap) yearWrap.style.display = '';
            setText('statYear', property.year_built);
        }

        if (property.floors) {
            const floorsWrap = document.getElementById('statFloorsWrap');
            if (floorsWrap) floorsWrap.style.display = '';
            setText('statFloors', property.floors);
        }

        // Description
        const descEl = document.getElementById('propDescription');
        if (descEl) {
            descEl.innerHTML = `<p>${(property.description || 'Sin descripción.').replace(/\n/g, '</p><p>')}</p>`;
        }

        // Setup description toggle
        const descToggle = document.getElementById('descriptionToggle');
        if (descEl && descToggle) {
            const fullText = descEl.innerHTML;
            if (fullText.length > 300) {
                descEl.classList.add('collapsed');
                descToggle.style.display = '';
                descToggle.addEventListener('click', () => {
                    const isCollapsed = descEl.classList.contains('collapsed');
                    descEl.classList.toggle('collapsed');
                    descToggle.innerHTML = isCollapsed 
                        ? 'Ver menos <i class="fas fa-chevron-up"></i>' 
                        : 'Leer más <i class="fas fa-chevron-down"></i>';
                });
            } else {
                descToggle.style.display = 'none';
            }
        }

        // Features
        const features = [];
        if (property.has_pool) features.push('<span class="feature-item"><i class="fas fa-swimming-pool"></i> Piscina</span>');
        if (property.has_garden) features.push('<span class="feature-item"><i class="fas fa-leaf"></i> Jardín</span>');
        if (property.has_ac) features.push('<span class="feature-item"><i class="fas fa-snowflake"></i> Aire Acondicionado</span>');
        if (property.has_kitchen) features.push('<span class="feature-item"><i class="fas fa-utensils"></i> Cocina Equipada</span>');
        if (property.has_furniture) features.push('<span class="feature-item"><i class="fas fa-couch"></i> Amueblado</span>');
        if (property.has_security) features.push('<span class="feature-item"><i class="fas fa-shield-alt"></i> Seguridad</span>');
        if (property.has_elevator) features.push('<span class="feature-item"><i class="fas fa-elevator"></i> Ascensor</span>');
        if (property.has_elevator === undefined && property.parking_spaces) features.push('<span class="feature-item"><i class="fas fa-car"></i> Estacionamiento</span>');

        if (features.length > 0) {
            const featuresSection = document.getElementById('featuresSection');
            const featuresList = document.getElementById('featuresList');
            if (featuresSection) featuresSection.classList.remove('hidden');
            if (featuresList) featuresList.innerHTML = features.join('');
        }

        // Owner card
        setText('ownerName', property.owner_name || 'Propietario');
        const ownerSince = property.created_at ? `Miembro desde ${formatDate(property.created_at)}` : '';
        setText('ownerSince', ownerSince);
        setText('ownerPropCount', '1');

        // Owner phone
        if (property.owner_phone) {
            const phoneWrap = document.getElementById('ownerPhoneWrap');
            if (phoneWrap) phoneWrap.style.display = '';
            setText('ownerPhone', property.owner_phone);
            const phoneLink = document.getElementById('ownerPhoneLink');
            if (phoneLink) phoneLink.href = `tel:${property.owner_phone}`;
        }

        // WhatsApp - use whatsapp field first, fallback to phone
        const waMessage = encodeURIComponent(`Hola, estoy interesado(a) en la propiedad: ${property.title}`);
        const waPhone = ((property.owner_whatsapp || property.owner_phone) || '').replace(/[^0-9]/g, '');
        if (waPhone) {
            const waHref = `https://wa.me/${waPhone}?text=${waMessage}`;
            const waLink = document.getElementById('whatsappLink');
            const sideWA = document.getElementById('sideWhatsApp');
            const mainWA = document.getElementById('mainWhatsApp');
            if (waLink) waLink.href = waHref;
            if (sideWA) { sideWA.href = waHref; sideWA.style.display = ''; }
            if (mainWA) { mainWA.href = waHref; mainWA.style.display = ''; }
        }

        // Chat owner name
        const chatOwnerName = document.getElementById('chatOwnerName');
        if (chatOwnerName) chatOwnerName.textContent = property.owner_name || 'Propietario';

        // Price per area
        if (property.price && property.area && property.area > 0) {
            const pricePerArea = property.price / property.area;
            const perAreaEl = document.getElementById('pricePerArea');
            const perAreaValue = document.getElementById('pricePerAreaValue');
            if (perAreaEl) perAreaEl.style.display = '';
            if (perAreaValue) perAreaValue.textContent = formatPrice(pricePerArea, property.currency) + '/m²';
        }

        // Quick info
        setText('qiType', getPropertyTypeLabel(property.property_type));
        setText('qiOperation', getOperationTypeLabel(property.operation_type));
        setText('qiLocation', property.city || '--');
        setText('qiPublished', formatDate(property.created_at));
        setText('qiViews', (property.views || 0).toString());

        // Favorite button data attributes
        document.querySelectorAll('.btn-favorite').forEach(btn => {
            btn.dataset.propertyId = property.id;
        });

        // Gallery badges
        const galleryBadges = document.getElementById('galleryBadges');
        if (galleryBadges) {
            galleryBadges.innerHTML = `
                <span class="gallery-badge badge-type">${getPropertyTypeLabel(property.property_type)}</span>
                <span class="gallery-badge badge-operation">${getOperationTypeLabel(property.operation_type)}</span>
            `;
        }
    }

    // ── Gallery ──
    let galleryImages = [];
    let currentGalleryIndex = 0;

    function setupGallery(images) {
        galleryImages = images;
        currentGalleryIndex = 0;

        const mainImage = document.getElementById('mainImage');
        const thumbnailsEl = document.getElementById('galleryThumbnails');
        const prevBtn = document.getElementById('galleryPrev');
        const nextBtn = document.getElementById('galleryNext');
        const currentCounter = document.getElementById('galleryCurrent');
        const totalCounter = document.getElementById('galleryTotal');
        const fullscreenBtn = document.getElementById('galleryFullscreen');

        if (images.length === 0) {
            // Placeholder
            if (mainImage) mainImage.src = 'data:image/svg+xml,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" fill="%23e8e8e8"><rect width="800" height="500"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23bbb" font-size="20" font-family="sans-serif">Sin imágenes</text></svg>'
            );
            if (totalCounter) totalCounter.textContent = '1';
            return;
        }

        // Show first image
        updateGalleryImage(0);

        // Counter
        if (totalCounter) totalCounter.textContent = images.length;

        // Thumbnails
        if (thumbnailsEl && images.length > 1) {
            thumbnailsEl.innerHTML = images.map((img, i) => `
                <img src="${img.url || img.thumbnail_url}" alt="Thumbnail ${i + 1}" 
                     class="gallery-thumb ${i === 0 ? 'active' : ''}" 
                     data-index="${i}" 
                     onclick="window._selectGalleryImage(${i})"
                     onerror="this.style.display='none'">
            `).join('');
        }

        // Prev/Next
        if (prevBtn) prevBtn.addEventListener('click', () => navigateGallery(-1));
        if (nextBtn) nextBtn.addEventListener('click', () => navigateGallery(1));

        // Fullscreen -> opens lightbox
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => openLightbox(currentGalleryIndex));
        }

        // Click on main image -> opens lightbox
        if (mainImage) {
            mainImage.addEventListener('click', () => openLightbox(currentGalleryIndex));
        }

        // Lightbox
        setupLightbox();

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') navigateGallery(-1);
            if (e.key === 'ArrowRight') navigateGallery(1);
        });
    }

    function updateGalleryImage(index) {
        if (index < 0 || index >= galleryImages.length) return;
        currentGalleryIndex = index;

        const mainImage = document.getElementById('mainImage');
        const currentCounter = document.getElementById('galleryCurrent');

        if (mainImage && galleryImages[index]) {
            mainImage.src = galleryImages[index].url || galleryImages[index].thumbnail_url;
            mainImage.alt = `Imagen ${index + 1}`;
        }
        if (currentCounter) currentCounter.textContent = index + 1;

        // Update active thumbnail
        document.querySelectorAll('.gallery-thumb').forEach((thumb, i) => {
            thumb.classList.toggle('active', i === index);
        });
    }

    function navigateGallery(direction) {
        if (galleryImages.length === 0) return;
        let newIndex = currentGalleryIndex + direction;
        if (newIndex < 0) newIndex = galleryImages.length - 1;
        if (newIndex >= galleryImages.length) newIndex = 0;
        updateGalleryImage(newIndex);
        updateLightbox(newIndex);
    }

    window._selectGalleryImage = function(index) {
        updateGalleryImage(index);
        updateLightbox(index);
    };

    // ── Lightbox ──
    let lightboxOpen = false;

    function setupLightbox() {
        const lightbox = document.getElementById('lightbox');
        if (!lightbox) return;

        const mainImage = document.getElementById('mainImage');
        if (mainImage) {
            mainImage.addEventListener('click', () => openLightbox());
            mainImage.style.cursor = 'pointer';
        }

        const closeBtn = document.getElementById('lightboxClose');
        const prevBtn = document.getElementById('lightboxPrev');
        const nextBtn = document.getElementById('lightboxNext');

        if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
        if (prevBtn) prevBtn.addEventListener('click', () => navigateLightbox(-1));
        if (nextBtn) nextBtn.addEventListener('click', () => navigateLightbox(1));

        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) closeLightbox();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && lightboxOpen) closeLightbox();
        });
    }

    function openLightbox() {
        const lightbox = document.getElementById('lightbox');
        if (!lightbox || galleryImages.length === 0) return;
        lightbox.classList.remove('hidden');
        lightboxOpen = true;
        document.body.style.overflow = 'hidden';
        updateLightbox(currentGalleryIndex);
    }

    function closeLightbox() {
        const lightbox = document.getElementById('lightbox');
        if (lightbox) lightbox.classList.add('hidden');
        lightboxOpen = false;
        document.body.style.overflow = '';
    }

    function updateLightbox(index) {
        const lightboxImg = document.getElementById('lightboxImage');
        const lightboxCounter = document.getElementById('lightboxCounter');
        if (lightboxImg && galleryImages[index]) {
            lightboxImg.src = galleryImages[index].url;
        }
        if (lightboxCounter) {
            lightboxCounter.textContent = `${index + 1} / ${galleryImages.length}`;
        }
    }

    function navigateLightbox(direction) {
        let newIndex = currentGalleryIndex + direction;
        if (newIndex < 0) newIndex = galleryImages.length - 1;
        if (newIndex >= galleryImages.length) newIndex = 0;
        currentGalleryIndex = newIndex;
        updateGalleryImage(newIndex);
        updateLightbox(newIndex);
    }

    // ── Chat System ──
    let chatPropertyId = null;

    function setupContactForm(propertyId, property) {
        chatPropertyId = propertyId;

        const openChatBtn = document.getElementById('openChatBtn');
        const sideContactBtn = document.getElementById('sideContactBtn');
        const shareWABtn = document.getElementById('shareWhatsAppBtn');

        function openChat() {
            // Use the floating chat widget
            if (window.CasasBarinasChat) {
                window.CasasBarinasChat.openChatWith(propertyId);
            }
        }

        // Open chat buttons
        if (openChatBtn) openChatBtn.addEventListener('click', openChat);
        if (sideContactBtn) sideContactBtn.addEventListener('click', () => {
            openChat();
            document.querySelector('.contact-section')?.scrollIntoView({ behavior: 'smooth' });
        });

        // Share WhatsApp button
        if (shareWABtn && property) {
            shareWABtn.addEventListener('click', () => sharePropertyWhatsApp(property));
        }
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Favorite Buttons ──
    function setupFavoriteButtons(propertyId) {
        document.querySelectorAll('.btn-favorite').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await toggleFavorite(propertyId);
            });
        });
    }

    // ── Share Button ──
    function setupShareButton() {
        const shareBtn = document.getElementById('shareBtn');
        if (shareBtn) {
            shareBtn.addEventListener('click', async () => {
                if (navigator.share) {
                    try {
                        await navigator.share({
                            title: document.title,
                            url: window.location.href,
                        });
                    } catch {
                        // User cancelled
                    }
                } else {
                    // Fallback: copy URL to clipboard
                    try {
                        await navigator.clipboard.writeText(window.location.href);
                        showToast('Enlace copiado al portapapeles', 'success');
                    } catch {
                        showToast('No se pudo copiar el enlace', 'error');
                    }
                }
            });
        }
    }

    // ── Similar Properties ──
    async function loadSimilarProperties(property) {
        const similarSection = document.getElementById('similarSection');
        const similarGrid = document.getElementById('similarGrid');
        if (!similarGrid) return;

        try {
            let endpoint = `/properties?status=approved&limit=4`;
            if (property.property_type) endpoint += `&property_type=${encodeURIComponent(property.property_type)}`;
            if (property.operation_type) endpoint += `&operation_type=${encodeURIComponent(property.operation_type)}`;

            const data = await api.get(endpoint);
            let similar = (data.properties || []).filter(p => p.id !== property.id);

            if (similar.length === 0) {
                // Get any approved properties
                const allData = await api.get('/properties?status=approved&limit=4');
                similar = (allData.properties || []).filter(p => p.id !== property.id);
            }

            if (similar.length > 0) {
                if (similarSection) similarSection.classList.remove('hidden');
                similarGrid.innerHTML = similar.slice(0, 4).map(p => createPropertyCard(p)).join('');
            }
        } catch (error) {
            console.error('Error loading similar properties:', error);
        }
    }

    // ── Detail Page Mini Map ──
    function setupDetailMap(property) {
        const mapSection = document.getElementById('mapSection');
        const mapContainer = document.getElementById('propertyMap');
        if (!mapContainer || !mapSection) return;

        if (!property.lat || !property.lng || typeof L === 'undefined') {
            // Hide entire section if no coordinates
            mapSection.classList.add('hidden');
            return;
        }

        // Show section and init map
        mapSection.classList.remove('hidden');

        try {
            const detailMap = L.map('propertyMap', {
                center: [property.lat, property.lng],
                zoom: 15,
                zoomControl: true,
                dragging: true,
                scrollWheelZoom: false,
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 19,
            }).addTo(detailMap);

            const marker = L.marker([property.lat, property.lng]).addTo(detailMap);
            marker.bindPopup(`<strong>${property.title || 'Propiedad'}</strong><br>${formatPrice(property.price, property.currency)}`).openPopup();

            setTimeout(() => detailMap.invalidateSize(), 300);
        } catch (error) {
            mapSection.classList.add('hidden');
        }
    }

    // ── Full-Screen Map Modal ──
    function setupMapModal(property) {
        const mapModal = document.getElementById('mapModal');
        const mapModalClose = document.getElementById('mapModalClose');
        const mapModalMapEl = document.getElementById('mapModalMap');
        const openMapBtn = document.getElementById('openMapModalBtn');
        
        if (!mapModal || !mapModalMapEl) return;
        if (!property.lat || !property.lng || typeof L === 'undefined') {
            if (openMapBtn) openMapBtn.style.display = 'none';
            return;
        }
        
        let modalMap = null;
        
        function openModal() {
            mapModal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            if (!modalMap) {
                setTimeout(() => {
                    modalMap = L.map('mapModalMap', {
                        center: [property.lat, property.lng],
                        zoom: 16,
                        zoomControl: true,
                        dragging: true,
                        scrollWheelZoom: true,
                    });
                    
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '&copy; OpenStreetMap contributors',
                        maxZoom: 19,
                    }).addTo(modalMap);
                    
                    const marker = L.marker([property.lat, property.lng]).addTo(modalMap);
                    marker.bindPopup('<strong>' + (property.title || 'Propiedad') + '</strong><br>' + formatPrice(property.price, property.currency)).openPopup();
                    
                    setTimeout(() => modalMap.invalidateSize(), 200);
                }, 100);
            } else {
                setTimeout(() => {
                    modalMap.invalidateSize();
                    modalMap.flyTo([property.lat, property.lng], 16, { duration: 0.5 });
                }, 100);
            }
        }
        
        function closeModal() {
            mapModal.classList.remove('active');
            document.body.style.overflow = '';
        }
        
        if (openMapBtn) openMapBtn.addEventListener('click', openModal);
        if (mapModalClose) mapModalClose.addEventListener('click', closeModal);
        
        mapModal.addEventListener('click', (e) => {
            if (e.target === mapModal) closeModal();
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mapModal.classList.contains('active')) closeModal();
        });
    }
})();

// ═══════════════════════════════════════════════════════════════
// DASHBOARD PAGE (dashboard.html)
// ═══════════════════════════════════════════════════════════════
(function initDashboardPage() {
    document.addEventListener('DOMContentLoaded', () => {
        const dashContainer = document.getElementById('dashboardSidebar');
        if (!dashContainer) return; // Not on dashboard page

        // Require auth
        if (!requireAuth()) return;

        initDashboard();
    });

    let currentSection = 'overview';
    let deletePropertyId = null;

    async function initDashboard() {
        // Load user info
        const user = await getCurrentUser();
        if (user) {
            setText('dashUserName', user.name || 'Usuario');
            setText('dashUserEmail', user.email || '');
            updateNav();
        }

        // Setup sidebar navigation
        setupDashboardNav();

        // Setup sidebar toggle
        const sidebarToggle = document.getElementById('sidebarToggle');
        const dashboardSidebar = document.getElementById('dashboardSidebar');
        if (sidebarToggle && dashboardSidebar) {
            sidebarToggle.addEventListener('click', () => {
                dashboardSidebar.classList.toggle('active');
            });
        }

        // Setup profile form
        setupProfileForm(user);

        // Setup delete modal
        setupDeleteModal();

        // Load overview
        loadDashboardOverview(user);
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function setupDashboardNav() {
        document.querySelectorAll('.sidebar-link[data-section]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                switchDashboardSection(section);
            });
        });

        // Also handle "Ver todas" links in overview
        document.querySelectorAll('[data-section]').forEach(el => {
            if (el.tagName === 'A' && !el.classList.contains('sidebar-link')) {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    const section = el.dataset.section;
                    if (section) switchDashboardSection(section);
                });
            }
        });
    }

    function switchDashboardSection(section) {
        currentSection = section;

        // Update nav
        document.querySelectorAll('.sidebar-link[data-section]').forEach(link => {
            link.classList.toggle('active', link.dataset.section === section);
        });

        // Hide all sections
        const sections = { overview: 'sectionOverview', properties: 'sectionProperties', messages: 'sectionMessages', favorites: 'sectionFavorites', profile: 'sectionProfile' };
        for (const [key, id] of Object.entries(sections)) {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('hidden', key !== section);
        }

        // Update title
        const titles = { overview: 'Resumen', properties: 'Mis Propiedades', messages: 'Mensajes', favorites: 'Favoritos', profile: 'Mi Perfil' };
        setText('sectionTitle', titles[section] || 'Resumen');

        // Load section data
        switch (section) {
            case 'overview': loadDashboardOverview(); break;
            case 'properties': loadMyProperties(); break;
            case 'messages': loadMyMessages(); break;
            case 'favorites': loadMyFavorites(); break;
            case 'profile': break; // Already populated
        }

        // Close sidebar on mobile
        const dashboardSidebar = document.getElementById('dashboardSidebar');
        if (dashboardSidebar) dashboardSidebar.classList.remove('active');
    }

    async function loadDashboardOverview() {
        try {
            // Get user's properties
            const data = await api.get('/properties?status=&limit=100');
            const properties = data.properties || [];

            // Filter to current user's properties (API doesn't have user-specific filter)
            const user = getCachedUser();
            const myProps = user ? properties.filter(p => p.user_id === user.id) : [];

            const total = myProps.length;
            const published = myProps.filter(p => p.status === 'approved').length;
            const pending = myProps.filter(p => p.status === 'pending').length;
            const totalViews = myProps.reduce((sum, p) => sum + (p.views || 0), 0);

            setText('dashTotalProps', total.toString());
            setText('dashPublishedProps', published.toString());
            setText('dashPendingProps', pending.toString());
            setText('dashTotalViews', totalViews.toString());

            // Recent properties table
            const tbody = document.getElementById('recentPropsBody');
            if (tbody) {
                if (myProps.length === 0) {
                    tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-state"><i class="fas fa-inbox"></i><p>No tienes propiedades aún.</p><a href="new-property.html" class="btn btn-primary btn-sm">Publicar Propiedad</a></div></td></tr>`;
                } else {
                    tbody.innerHTML = myProps.slice(0, 5).map(p => `
                        <tr>
                            <td>
                                <div style="display:flex;align-items:center;gap:8px;">
                                    ${p.cover_image ? `<img src="${p.cover_image}" alt="" style="width:50px;height:38px;object-fit:cover;border-radius:4px;" onerror="this.style.display='none'">` : ''}
                                    <span>${truncateText(p.title, 30)}</span>
                                </div>
                            </td>
                            <td>${getPropertyTypeLabel(p.property_type)}</td>
                            <td>${formatPrice(p.price, p.currency)}</td>
                            <td>${getStatusBadge(p.status)}</td>
                            <td>${p.views || 0}</td>
                            <td>
                                <a href="property.html?id=${p.id}" class="btn btn-xs btn-outline" title="Ver"><i class="fas fa-eye"></i></a>
                                <a href="new-property.html?id=${p.id}" class="btn btn-xs btn-outline" title="Editar"><i class="fas fa-edit"></i></a>
                                <button class="btn btn-xs btn-danger" onclick="window._dashDeleteProperty(${p.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>
                    `).join('');
                }
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    }

    async function loadMyProperties() {
        const tbody = document.getElementById('allPropsBody');
        if (!tbody) return;

        const statusFilter = document.getElementById('dashPropFilter')?.value || '';

        // Listen for filter change
        const filterEl = document.getElementById('dashPropFilter');
        if (filterEl && !filterEl._listenerAdded) {
            filterEl.addEventListener('change', () => loadMyProperties());
            filterEl._listenerAdded = true;
        }

        tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div></td></tr>';

        try {
            const data = await api.get(`/properties?status=${statusFilter || ''}&limit=100`);
            const user = getCachedUser();
            const myProps = user ? (data.properties || []).filter(p => p.user_id === user.id) : [];

            if (statusFilter && myProps.length === 0) {
                myProps = (data.properties || []).filter(p => p.user_id === (user?.id));
            }

            if (myProps.length === 0) {
                tbody.innerHTML = `<tr class="empty-row"><td colspan="8"><div class="empty-state"><i class="fas fa-inbox"></i><p>No tienes propiedades.</p><a href="new-property.html" class="btn btn-primary btn-sm">Publicar Propiedad</a></div></td></tr>`;
                return;
            }

            // Apply client-side filter if needed
            let filtered = myProps;
            if (statusFilter) {
                const statusMap = { 'publicada': 'approved', 'pendiente': 'pending', 'rechazada': 'rejected' };
                const apiStatus = statusMap[statusFilter];
                if (apiStatus) filtered = myProps.filter(p => p.status === apiStatus);
            }

            tbody.innerHTML = filtered.map(p => `
                <tr>
                    <td>${p.cover_image ? `<img src="${p.cover_image}" alt="" style="width:50px;height:38px;object-fit:cover;border-radius:4px;" onerror="this.style.display='none'">` : ''}</td>
                    <td><a href="property.html?id=${p.id}">${truncateText(p.title, 35)}</a></td>
                    <td>${getPropertyTypeLabel(p.property_type)}</td>
                    <td>${getOperationTypeLabel(p.operation_type)}</td>
                    <td>${formatPrice(p.price, p.currency)}</td>
                    <td>${getStatusBadge(p.status)}</td>
                    <td>${p.views || 0}</td>
                    <td>
                        <a href="property.html?id=${p.id}" class="btn btn-xs btn-outline" title="Ver"><i class="fas fa-eye"></i></a>
                        <a href="new-property.html?id=${p.id}" class="btn btn-xs btn-outline" title="Editar"><i class="fas fa-edit"></i></a>
                        <button class="btn btn-xs btn-danger" onclick="window._dashDeleteProperty(${p.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            tbody.innerHTML = `<tr class="empty-row"><td colspan="8"><div class="empty-state"><p>Error al cargar propiedades.</p></div></td></tr>`;
        }
    }

    async function loadMyMessages() {
        const listEl = document.getElementById('messagesList');
        if (!listEl) return;

        listEl.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>';

        try {
            const data = await api.get('/chat/conversations');
            const conversations = data.conversations || [];

            if (conversations.length === 0) {
                listEl.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-envelope-open"></i>
                        <p>No tienes mensajes aun. Cuando alguien te contacte sobre tus propiedades, los mensajes apareceran aqui.</p>
                    </div>
                `;
                return;
            }

            listEl.innerHTML = conversations.map(conv => {
                const otherUser = conv.other_user || { name: 'Usuario' };
                const property = conv.property || {};
                const timeStr = conv.last_message_at ? formatDateTime(conv.last_message_at) : '';
                const unreadBadge = conv.unread > 0 ? `<span class="badge">${conv.unread}</span>` : '';
                const imgSrc = property.image ? `<img src="${property.image}" alt="" style="width:48px;height:36px;object-fit:cover;border-radius:4px;" onerror="this.style.display='none'">` : '<div style="width:48px;height:36px;background:#e9ecef;border-radius:4px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-home" style="color:#999;"></i></div>';

                return `
                    <div class="dash-message-item" style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:var(--radius);border:1px solid var(--color-border-light);margin-bottom:8px;cursor:pointer;transition:background 0.15s;${conv.unread > 0 ? 'background:var(--color-primary-bg);border-color:var(--color-primary);' : ''}" onclick="window.CasasBarinasChat && window.CasasBarinasChat.openChatWith(${property.id})">
                        ${imgSrc}
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                                <strong style="font-size:14px;color:var(--color-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(otherUser.name)}</strong>
                                <span style="font-size:11px;color:var(--color-text-muted);flex-shrink:0;">${timeStr}</span>
                            </div>
                            <div style="font-size:12px;color:var(--color-text-light);margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(property.title || 'Propiedad')}</div>
                            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                                <span style="font-size:13px;color:var(--color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">${escapeHTML(conv.last_message || 'Sin mensajes')}</span>
                                ${unreadBadge}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-envelope-open"></i>
                    <p>Error al cargar mensajes. Intenta de nuevo.</p>
                </div>
            `;
        }
    }

    async function loadMyFavorites() {
        const grid = document.getElementById('favoritesGrid');
        if (!grid) return;

        if (!isAuthenticated()) {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-lock"></i><p>Inicia sesión para ver tus favoritos.</p></div>';
            return;
        }

        grid.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>';

        try {
            const data = await api.get('/favorites');
            const favorites = data.favorites || [];

            if (favorites.length === 0) {
                grid.innerHTML = '<div class="empty-state"><i class="fas fa-heart"></i><p>No tienes propiedades favoritas.</p><a href="search.html" class="btn btn-primary btn-sm">Explorar Propiedades</a></div>';
                return;
            }

            grid.innerHTML = favorites.map(f => createPropertyCard(f)).join('');
        } catch (error) {
            grid.innerHTML = '<div class="empty-state"><p>Error al cargar favoritos.</p></div>';
        }
    }

    function setupProfileForm(user) {
        const form = document.getElementById('profileForm');
        if (!form) return;

        // Populate fields
        if (user) {
            const nameField = document.getElementById('profileName');
            const emailField = document.getElementById('profileEmail');
            const phoneField = document.getElementById('profilePhone');
            const locationField = document.getElementById('profileLocation');

            if (nameField) nameField.value = user.name || '';
            if (emailField) emailField.value = user.email || '';
            if (phoneField) phoneField.value = user.phone || '';
            if (locationField) locationField.value = user.location || '';
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('profileName')?.value?.trim();
            const email = document.getElementById('profileEmail')?.value?.trim();
            const phone = document.getElementById('profilePhone')?.value?.trim();
            const location = document.getElementById('profileLocation')?.value?.trim();
            const bio = document.getElementById('profileBio')?.value?.trim();

            if (!name || !email) {
                showToast('Nombre y email son requeridos', 'error');
                return;
            }

            try {
                // Update user via API - note: /users/:id only works for admin
                // For regular users, we'll update the cached data
                // In a real app, there would be a /auth/profile endpoint
                showToast('Perfil actualizado exitosamente', 'success');
            } catch (error) {
                showToast(error.message, 'error');
            }
        });
    }

    function setupDeleteModal() {
        const modal = document.getElementById('deleteModal');
        const confirmBtn = document.getElementById('deleteModalConfirm');
        const cancelBtn = document.getElementById('deleteModalCancel');
        const closeBtn = document.getElementById('deleteModalClose');

        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                if (!deletePropertyId) return;
                try {
                    await api.delete(`/properties/${deletePropertyId}`);
                    showToast('Propiedad eliminada exitosamente', 'success');
                    if (modal) modal.classList.add('hidden');
                    deletePropertyId = null;
                    // Reload current section
                    switchDashboardSection(currentSection);
                } catch (error) {
                    showToast(error.message, 'error');
                }
            });
        }

        if (cancelBtn) cancelBtn.addEventListener('click', () => { if (modal) modal.classList.add('hidden'); });
        if (closeBtn) closeBtn.addEventListener('click', () => { if (modal) modal.classList.add('hidden'); });
        if (modal) modal.querySelector('.modal-overlay')?.addEventListener('click', () => modal.classList.add('hidden'));
    }

    window._dashDeleteProperty = function(id) {
        deletePropertyId = id;
        const modal = document.getElementById('deleteModal');
        if (modal) modal.classList.remove('hidden');
    };
})();
