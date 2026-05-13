/**
 * CasasBarinas - Map Module
 * Loaded on map.html and search.html (mini map)
 */

(function () {
    'use strict';

    // ─── Configuration ──────────────────────────────────────────
    const BARINAS_CENTER = [8.6233, -70.2288];
    const DEFAULT_ZOOM = 12;
    const CLUSTER_THRESHOLD = 50; // meters - if markers are closer than this, show cluster

    // ─── State ──────────────────────────────────────────────────
    let map = null;
    let markers = [];
    let markerLayer = null;
    let isMapView = false; // true for map.html, false for search.html mini map
    let allProperties = [];
    let activeCardId = null;
    let miniMapInitialized = false;

    // ─── DOM Elements ───────────────────────────────────────────
    const mapContainer = document.getElementById('map');
    const mapPropertyList = document.getElementById('mapPropertyList');
    const mapLoading = document.getElementById('mapLoading');
    const mapResultCount = document.getElementById('mapCountText');
    const mapSidebar = document.getElementById('mapSidebar');
    const mapSidebarToggle = document.getElementById('mapSidebarToggle');

    // Filter elements (map.html)
    const mapTipo = document.getElementById('mapTipo');
    const mapOperacion = document.getElementById('mapOperacion');
    const mapPrecioMin = document.getElementById('mapPrecioMin');
    const mapPrecioMax = document.getElementById('mapPrecioMax');
    const mapCiudad = document.getElementById('mapCiudad');
    const mapSearchBtn = document.getElementById('mapSearchBtn');
    const mapResetBtn = document.getElementById('mapResetBtn');

    // Search.html mini map elements
    const searchMapContainer = document.getElementById('searchMapContainer');
    const searchMiniMap = document.getElementById('searchMiniMap');
    const mapToggleBtn = document.getElementById('mapToggleBtn');
    const closeMapBtn = document.getElementById('closeMapBtn');

    // ─── Determine Context ──────────────────────────────────────
    isMapView = !!mapContainer;

    // ─── Initialize Map ─────────────────────────────────────────
    function initMap() {
        if (isMapView) {
            initFullMap();
        }
        setupMiniMapToggle();
    }

    function initFullMap() {
        if (!mapContainer || typeof L === 'undefined') return;

        try {
            map = L.map('map', {
                center: BARINAS_CENTER,
                zoom: DEFAULT_ZOOM,
                zoomControl: true,
                scrollWheelZoom: true,
            });

            // OpenStreetMap tiles (free, no API key needed)
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19,
            }).addTo(map);

            // Marker layer group
            markerLayer = L.layerGroup().addTo(map);

            // Setup sidebar toggle
            setupSidebarToggle();

            // Setup filter events
            setupMapFilters();

            // Load initial properties
            loadMapProperties();

            // Fix map rendering on container resize
            setTimeout(() => {
                map.invalidateSize();
            }, 300);
        } catch (error) {
            console.error('Error initializing map:', error);
            if (mapContainer) {
                mapContainer.innerHTML = '<div class="map-no-results"><i class="fas fa-exclamation-circle"></i><p>Error al cargar el mapa</p></div>';
            }
        }
    }

    // ─── Mini Map (search.html) ─────────────────────────────────
    function setupMiniMapToggle() {
        if (!mapToggleBtn || !searchMapContainer || !searchMiniMap) return;

        mapToggleBtn.addEventListener('click', () => {
            const isHidden = searchMapContainer.classList.contains('hidden');
            if (isHidden) {
                searchMapContainer.classList.remove('hidden');
                mapToggleBtn.classList.add('active');

                if (!miniMapInitialized) {
                    initMiniMap();
                    miniMapInitialized = true;
                } else {
                    setTimeout(() => {
                        if (window._miniMap) window._miniMap.invalidateSize();
                    }, 100);
                }
            } else {
                searchMapContainer.classList.add('hidden');
                mapToggleBtn.classList.remove('active');
            }
        });

        if (closeMapBtn) {
            closeMapBtn.addEventListener('click', () => {
                searchMapContainer.classList.add('hidden');
                mapToggleBtn.classList.remove('active');
            });
        }
    }

    function initMiniMap() {
        if (!searchMiniMap || typeof L === 'undefined') return;

        try {
            window._miniMap = L.map('searchMiniMap', {
                center: BARINAS_CENTER,
                zoom: DEFAULT_ZOOM,
                zoomControl: true,
                scrollWheelZoom: true,
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19,
            }).addTo(window._miniMap);

            window._miniMarkerLayer = L.layerGroup().addTo(window._miniMap);

            // Load properties on the mini map using current search filters
            loadMiniMapProperties();

            setTimeout(() => {
                window._miniMap.invalidateSize();
            }, 300);
        } catch (error) {
            console.error('Error initializing mini map:', error);
        }
    }

    async function loadMiniMapProperties() {
        if (!window._miniMap || !window._miniMarkerLayer) return;

        try {
            // Get search filters from URL
            const params = getSearchParams();
            let endpoint = '/properties?status=approved&limit=50';

            if (params.property_type) endpoint += `&property_type=${encodeURIComponent(params.property_type)}`;
            if (params.operation_type) endpoint += `&operation_type=${encodeURIComponent(params.operation_type)}`;
            if (params.city) endpoint += `&city=${encodeURIComponent(params.city)}`;
            if (params.min_price) endpoint += `&min_price=${params.min_price}`;
            if (params.max_price) endpoint += `&max_price=${params.max_price}`;
            if (params.bedrooms) endpoint += `&bedrooms=${params.bedrooms}`;
            if (params.bathrooms) endpoint += `&bathrooms=${params.bathrooms}`;

            const data = await api.get(endpoint);
            const properties = data.properties || [];

            window._miniMarkerLayer.clearLayers();
            const validProps = properties.filter(p => p.lat && p.lng);

            validProps.forEach(property => {
                const marker = createMarker(property);
                if (marker) {
                    window._miniMarkerLayer.addLayer(marker);
                }
            });

            if (validProps.length > 0) {
                const bounds = L.latLngBounds(validProps.map(p => [p.lat, p.lng]));
                window._miniMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
            }
        } catch (error) {
            console.error('Error loading mini map properties:', error);
        }
    }

    // ─── Sidebar Toggle (map.html) ──────────────────────────────
    function setupSidebarToggle() {
        if (mapSidebarToggle && mapSidebar) {
            mapSidebarToggle.addEventListener('click', () => {
                mapSidebar.classList.toggle('collapsed');
                mapSidebarToggle.classList.toggle('shifted');
                // Invalidate map size after animation
                setTimeout(() => {
                    if (map) map.invalidateSize();
                }, 350);
            });
        }
    }

    // ─── Map Filters (map.html) ─────────────────────────────────
    function setupMapFilters() {
        if (mapSearchBtn) {
            mapSearchBtn.addEventListener('click', () => filterProperties());
        }
        if (mapResetBtn) {
            mapResetBtn.addEventListener('click', resetFilters);
        }

        // Allow Enter key in filter inputs
        [mapCiudad, mapPrecioMin, mapPrecioMax].forEach(input => {
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') filterProperties();
                });
            }
        });
    }

    function getFilterValues() {
        return {
            property_type: mapTipo?.value || '',
            operation_type: mapOperacion?.value || '',
            min_price: mapPrecioMin?.value || '',
            max_price: mapPrecioMax?.value || '',
            city: mapCiudad?.value?.trim() || '',
        };
    }

    async function filterProperties() {
        if (!isMapView || !map) return;
        await loadMapProperties();
    }

    function resetFilters() {
        if (mapTipo) mapTipo.value = '';
        if (mapOperacion) mapOperacion.value = '';
        if (mapPrecioMin) mapPrecioMin.value = '';
        if (mapPrecioMax) mapPrecioMax.value = '';
        if (mapCiudad) mapCiudad.value = '';
        filterProperties();
    }

    // ─── Load Map Properties ────────────────────────────────────
    async function loadMapProperties() {
        if (!isMapView) return;

        // Show loading
        if (mapLoading) mapLoading.style.display = '';

        try {
            const filters = getFilterValues();
            let endpoint = '/properties?status=approved&limit=100';

            if (filters.property_type) endpoint += `&property_type=${encodeURIComponent(filters.property_type)}`;
            if (filters.operation_type) endpoint += `&operation_type=${encodeURIComponent(filters.operation_type)}`;
            if (filters.min_price) endpoint += `&min_price=${filters.min_price}`;
            if (filters.max_price) endpoint += `&max_price=${filters.max_price}`;
            if (filters.city) endpoint += `&city=${encodeURIComponent(filters.city)}`;

            const data = await api.get(endpoint);
            allProperties = data.properties || [];

            // Clear existing markers
            if (markerLayer) markerLayer.clearLayers();
            markers = [];

            // Update count
            if (mapResultCount) {
                mapResultCount.textContent = `${allProperties.length} propiedades encontradas`;
            }

            // Add markers for properties with coordinates
            const validProps = allProperties.filter(p => p.lat && p.lng);

            validProps.forEach(property => {
                const marker = createMarker(property);
                if (marker) {
                    markers.push({ marker, property });
                    markerLayer.addLayer(marker);
                }
            });

            // Fit map to show all markers
            if (validProps.length > 0) {
                fitAllMarkers();
            }

            // Render sidebar property list
            renderPropertyList(allProperties);

        } catch (error) {
            console.error('Error loading map properties:', error);
            showToast('Error al cargar propiedades en el mapa', 'error');
        } finally {
            if (mapLoading) mapLoading.style.display = 'none';
        }
    }

    // ─── Create Marker ──────────────────────────────────────────
    function createMarker(property) {
        if (!property.lat || !property.lng || typeof L === 'undefined') return null;

        const coverImage = property.cover_image || property.images?.[0]?.url || '';
        const priceStr = formatPrice(property.price, property.currency);
        const typeLabel = getPropertyTypeLabel(property.property_type);
        const opLabel = getOperationTypeLabel(property.operation_type);
        const title = property.title || 'Sin título';

        // Custom icon with colored circle
        const iconColor = getMarkerColor(property.operation_type);

        const icon = L.divIcon({
            className: 'custom-map-marker',
            html: `<div class="marker-pin" style="background-color: ${iconColor};">
                       <span class="marker-price">${formatShortPrice(property.price, property.currency)}</span>
                   </div>
                   <div class="marker-shadow"></div>`,
            iconSize: [40, 52],
            iconAnchor: [20, 52],
            popupAnchor: [0, -52],
        });

        const marker = L.marker([property.lat, property.lng], { icon });

        // Popup content
        const popupContent = `
            <div class="map-popup">
                ${coverImage ? `<div class="map-popup-image"><img src="${coverImage}" alt="${title}" onerror="this.parentElement.style.display='none'"></div>` : ''}
                <div class="map-popup-content">
                    <h4 class="map-popup-title">${title}</h4>
                    <div class="map-popup-price">${priceStr}</div>
                    <div class="map-popup-badges">
                        <span class="map-popup-badge">${typeLabel}</span>
                        <span class="map-popup-badge">${opLabel}</span>
                    </div>
                    ${property.bedrooms ? `<span class="map-popup-detail"><i class="fas fa-bed"></i> ${property.bedrooms}</span>` : ''}
                    ${property.bathrooms ? `<span class="map-popup-detail"><i class="fas fa-bath"></i> ${property.bathrooms}</span>` : ''}
                    ${property.area ? `<span class="map-popup-detail"><i class="fas fa-ruler-combined"></i> ${property.area}${property.area_unit || 'm²'}</span>` : ''}
                    <a href="property.html?id=${property.id}" class="map-popup-link">Ver más <i class="fas fa-arrow-right"></i></a>
                </div>
            </div>
        `;

        marker.bindPopup(popupContent, {
            maxWidth: 300,
            minWidth: 250,
            closeButton: true,
            autoPan: true,
            autoPanPadding: [50, 50],
        });

        // Click event to highlight sidebar card
        marker.on('click', () => {
            highlightCard(property.id);
        });

        return marker;
    }

    function getMarkerColor(operationType) {
        const colors = {
            'venta': '#1a73e8',
            'alquiler': '#28a745',
            'venta_alquiler': '#ff6b35',
        };
        return colors[operationType?.toLowerCase()] || '#1a73e8';
    }

    function formatShortPrice(price, currency) {
        if (!price || isNaN(price)) return '';
        const symbols = { 'USD': '$', 'EUR': '€', 'Bs': 'Bs' };
        const symbol = symbols[currency] || '$';

        if (price >= 1000000) {
            return `${symbol}${(price / 1000000).toFixed(1)}M`;
        }
        if (price >= 1000) {
            return `${symbol}${(price / 1000).toFixed(0)}K`;
        }
        return `${symbol}${price}`;
    }

    // ─── Render Sidebar Property List ───────────────────────────
    function renderPropertyList(properties) {
        if (!mapPropertyList) return;

        if (properties.length === 0) {
            mapPropertyList.innerHTML = `
                <div class="map-no-results">
                    <i class="fas fa-search"></i>
                    <p>No se encontraron propiedades con los filtros seleccionados.</p>
                </div>
            `;
            return;
        }

        mapPropertyList.innerHTML = properties.map(p => {
            const coverImage = p.cover_image || p.images?.[0]?.url || '';
            const priceStr = formatPrice(p.price, p.currency);
            const typeLabel = getPropertyTypeLabel(p.property_type);
            const opLabel = getOperationTypeLabel(p.operation_type);
            const address = p.city ? (p.address ? `${p.address}, ${p.city}` : p.city) : '--';
            const hasCoords = !!(p.lat && p.lng);

            return `
                <div class="map-property-card" data-property-id="${p.id}" data-lat="${p.lat || ''}" data-lng="${p.lng || ''}">
                    <img src="${coverImage}" alt="${p.title || 'Propiedad'}" onerror="this.style.display='none'">
                    <div class="card-info">
                        <div class="card-price">${priceStr}</div>
                        <div class="card-title" title="${p.title || ''}">${p.title || 'Sin título'}</div>
                        <div class="card-location">${address}</div>
                        <div class="card-badges">
                            <span class="card-badge badge-type">${typeLabel}</span>
                            <span class="card-badge badge-operation">${opLabel}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Add click events to cards
        mapPropertyList.querySelectorAll('.map-property-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = parseInt(card.dataset.propertyId);
                const lat = parseFloat(card.dataset.lat);
                const lng = parseFloat(card.dataset.lng);

                highlightCard(id);

                if (!isNaN(lat) && !isNaN(lng) && map) {
                    flyToProperty(id);
                } else {
                    // No coordinates, just open the property page
                    window.location.href = `property.html?id=${id}`;
                }
            });
        });
    }

    // ─── Highlight Card ─────────────────────────────────────────
    function highlightCard(propertyId) {
        activeCardId = propertyId;

        // Remove active from all cards
        mapPropertyList?.querySelectorAll('.map-property-card').forEach(card => {
            card.classList.toggle('active', parseInt(card.dataset.propertyId) === propertyId);
        });

        // Open popup for the corresponding marker
        const found = markers.find(m => m.property.id === propertyId);
        if (found && map) {
            map.openPopup(found.marker);
        }
    }

    // ─── Fly to Property ────────────────────────────────────────
    function flyToProperty(propertyId) {
        if (!map) return;

        const found = markers.find(m => m.property.id === propertyId);
        if (found) {
            map.flyTo(found.marker.getLatLng(), 15, {
                duration: 1,
            });
            // Open popup
            setTimeout(() => {
                map.openPopup(found.marker);
            }, 1000);
        }
    }

    // ─── Fit All Markers ────────────────────────────────────────
    function fitAllMarkers() {
        if (!map || markers.length === 0) return;

        const bounds = L.latLngBounds(markers.map(m => m.marker.getLatLng()));

        if (bounds.isValid()) {
            map.fitBounds(bounds, {
                padding: [50, 50],
                maxZoom: 14,
            });
        }
    }

    // ─── Expose for external use ────────────────────────────────
    window.casasMap = {
        flyToProperty,
        fitAllMarkers,
        filterProperties,
        loadMapProperties,
        invalidateSize: () => {
            if (map) map.invalidateSize();
            if (window._miniMap) window._miniMap.invalidateSize();
        },
    };

    // ─── Initialize on DOM Ready ────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMap);
    } else {
        initMap();
    }

})();
