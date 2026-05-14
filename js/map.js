/**
 * CasasBarinas - Map Module
 * Clean restructure: Uses Leaflet native popups (works on desktop & mobile)
 * No custom modal overlays — just native Leaflet popups that work everywhere
 */

(function () {
    'use strict';

    // ─── Configuration ──────────────────────────────────────────
    const BARINAS_CENTER = [8.6233, -70.2288];
    const DEFAULT_ZOOM = 12;

    // ─── State ──────────────────────────────────────────────────
    let map = null;
    let markers = [];
    let markerLayer = null;
    let isMapView = false;
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

    // Filter elements
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

    // ─── Initialize ─────────────────────────────────────────────
    function initMap() {
        if (isMapView) {
            initFullMap();
            setupSidebarToggle();
            setupMapFilters();
        }
        setupMiniMapToggle();
    }

    // ─── Initialize Full Map ────────────────────────────────────
    function initFullMap() {
        if (!mapContainer || typeof L === 'undefined') return;

        try {
            map = L.map('map', {
                center: BARINAS_CENTER,
                zoom: DEFAULT_ZOOM,
                zoomControl: true,
                scrollWheelZoom: true,
                tap: true,           // Enable tap events for mobile
                closePopupOnClick: true,
            });

            // OpenStreetMap tiles (free)
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19,
            }).addTo(map);

            // Marker layer group
            markerLayer = L.layerGroup().addTo(map);

            // Load properties
            loadMapProperties();

            // Fix rendering
            setTimeout(function () { map.invalidateSize(); }, 300);
        } catch (error) {
            console.error('Error initializing map:', error);
            mapContainer.innerHTML = '<div class="map-no-results"><i class="fas fa-exclamation-circle"></i><p>Error al cargar el mapa</p></div>';
        }
    }

    // ─── Safe helpers (fallback if app.js functions not loaded) ──
    function safeFormatPrice(price, currency) {
        try {
            if (typeof formatPrice === 'function') return formatPrice(price, currency);
        } catch (e) { /* ignore */ }
        var symbols = { 'USD': '$', 'EUR': '€', 'Bs': 'Bs' };
        var s = symbols[currency] || '$';
        return price != null ? s + Number(price).toLocaleString() : 'Precio no disponible';
    }

    function safeFormatShortPrice(price, currency) {
        try {
            if (typeof formatShortPrice === 'function') return formatShortPrice(price, currency);
        } catch (e) { /* ignore */ }
        if (!price || isNaN(price)) return '';
        var symbols = { 'USD': '$', 'EUR': '€', 'Bs': 'Bs' };
        var s = symbols[currency] || '$';
        if (price >= 1000000) return s + (price / 1000000).toFixed(1) + 'M';
        if (price >= 1000) return s + (price / 1000).toFixed(0) + 'K';
        return s + price;
    }

    function safeGetTypeLabel(type) {
        try {
            if (typeof getPropertyTypeLabel === 'function') return getPropertyTypeLabel(type);
        } catch (e) { /* ignore */ }
        return type || 'Propiedad';
    }

    function safeGetOpLabel(op) {
        try {
            if (typeof getOperationTypeLabel === 'function') return getOperationTypeLabel(op);
        } catch (e) { /* ignore */ }
        return op || 'Operación';
    }

    // ─── Create Marker ──────────────────────────────────────────
    function createMarker(property) {
        if (!property.lat || !property.lng || typeof L === 'undefined') return null;

        try {
            var coverImage = '';
            if (property.cover_image && typeof property.cover_image === 'string') {
                coverImage = property.cover_image;
            } else if (property.images && Array.isArray(property.images) && property.images.length > 0 && property.images[0].url) {
                coverImage = property.images[0].url;
            }

            var priceStr = safeFormatPrice(property.price, property.currency);
            var typeLabel = safeGetTypeLabel(property.property_type);
            var opLabel = safeGetOpLabel(property.operation_type);
            var title = property.title || 'Sin título';

            // Color by operation type
            var iconColor = getMarkerColor(property.operation_type);

            // Custom pin icon with price
            var icon = L.divIcon({
                className: 'custom-map-marker',
                html: '<div class="marker-pin" style="background-color: ' + iconColor + ';">'
                    + '<span class="marker-price">' + safeFormatShortPrice(property.price, property.currency) + '</span>'
                    + '</div>'
                    + '<div class="marker-shadow"></div>',
                iconSize: [40, 52],
                iconAnchor: [20, 52],
                popupAnchor: [0, -56],
            });

            var marker = L.marker([property.lat, property.lng], { icon: icon });

            // Build popup content — always a valid string
            var imgTag = coverImage
                ? '<div class="map-popup-image"><img src="' + coverImage + '" alt="' + title + '" onerror="this.parentElement.style.display=\'none\'"></div>'
                : '';

            var details = '';
            if (property.bedrooms) details += '<span class="map-popup-detail"><i class="fas fa-bed"></i> ' + property.bedrooms + '</span>';
            if (property.bathrooms) details += '<span class="map-popup-detail"><i class="fas fa-bath"></i> ' + property.bathrooms + '</span>';
            if (property.area) details += '<span class="map-popup-detail"><i class="fas fa-ruler-combined"></i> ' + property.area + (property.area_unit || 'm²') + '</span>';

            var popupHTML = '<div class="map-popup">'
                + imgTag
                + '<div class="map-popup-content">'
                + '<h4 class="map-popup-title">' + title + '</h4>'
                + '<div class="map-popup-price">' + priceStr + '</div>'
                + '<div class="map-popup-badges">'
                + '<span class="map-popup-badge">' + typeLabel + '</span>'
                + '<span class="map-popup-badge">' + opLabel + '</span>'
                + '</div>'
                + details
                + '<a href="property.html?id=' + property.id + '" class="map-popup-link">Ver más <i class="fas fa-arrow-right"></i></a>'
                + '</div>'
                + '</div>';

            // Safety check: popupHTML must be a non-empty string
            if (typeof popupHTML !== 'string' || popupHTML.length === 0) {
                popupHTML = '<div class="map-popup"><div class="map-popup-content"><h4>' + title + '</h4><p>Propiedad</p></div></div>';
            }

            // Bind popup to marker
            marker.bindPopup(popupHTML, {
                maxWidth: 300,
                minWidth: 260,
                closeButton: true,
                autoPan: true,
                autoPanPaddingTopLeft: [20, 60],
                autoPanPaddingBottomRight: [20, 20],
            });

            // On marker click, highlight card in sidebar
            marker.on('click', function () {
                highlightCard(property.id);
            });

            return marker;
        } catch (err) {
            console.error('Error creating marker for property ' + (property.id || '?') + ':', err);
            return null;
        }
    }

    function getMarkerColor(operationType) {
        var colors = {
            'venta': '#1a73e8',
            'alquiler': '#28a745',
            'venta_alquiler': '#ff6b35',
        };
        try {
            return (operationType && colors[operationType.toLowerCase()]) || '#1a73e8';
        } catch (e) {
            return '#1a73e8';
        }
    }

    // ─── Load Map Properties ────────────────────────────────────
    function loadMapProperties() {
        if (!isMapView) return;

        if (mapLoading) mapLoading.style.display = '';

        var filters = getFilterValues();
        var endpoint = '/properties?status=approved&limit=100';

        if (filters.property_type) endpoint += '&property_type=' + encodeURIComponent(filters.property_type);
        if (filters.operation_type) endpoint += '&operation_type=' + encodeURIComponent(filters.operation_type);
        if (filters.min_price) endpoint += '&min_price=' + filters.min_price;
        if (filters.max_price) endpoint += '&max_price=' + filters.max_price;
        if (filters.city) endpoint += '&city=' + encodeURIComponent(filters.city);

        api.get(endpoint).then(function (data) {
            allProperties = data.properties || [];

            // Clear markers
            if (markerLayer) markerLayer.clearLayers();
            markers = [];

            // Update count
            if (mapResultCount) {
                mapResultCount.textContent = allProperties.length + ' propiedades encontradas';
            }

            // Add markers
            var validProps = allProperties.filter(function (p) { return p.lat && p.lng; });

            validProps.forEach(function (property) {
                var marker = createMarker(property);
                if (marker) {
                    markers.push({ marker: marker, property: property });
                    markerLayer.addLayer(marker);
                }
            });

            // Fit map to show all markers
            if (validProps.length > 0) {
                fitAllMarkers();
            }

            // Render sidebar list
            renderPropertyList(allProperties);

        }).catch(function (error) {
            console.error('Error loading map properties:', error);
            showToast('Error al cargar propiedades en el mapa', 'error');
        }).finally(function () {
            if (mapLoading) mapLoading.style.display = 'none';
        });
    }

    // ─── Sidebar Toggle ─────────────────────────────────────────
    function setupSidebarToggle() {
        if (mapSidebarToggle && mapSidebar) {
            mapSidebarToggle.addEventListener('click', function () {
                mapSidebar.classList.toggle('collapsed');
                mapSidebarToggle.classList.toggle('shifted');
                setTimeout(function () {
                    if (map) map.invalidateSize();
                }, 350);
            });
        }
    }

    // ─── Map Filters ────────────────────────────────────────────
    function setupMapFilters() {
        if (mapSearchBtn) {
            mapSearchBtn.addEventListener('click', function () { loadMapProperties(); });
        }
        if (mapResetBtn) {
            mapResetBtn.addEventListener('click', resetFilters);
        }
        [mapCiudad, mapPrecioMin, mapPrecioMax].forEach(function (input) {
            if (input) {
                input.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') loadMapProperties();
                });
            }
        });
    }

    function getFilterValues() {
        return {
            property_type: mapTipo ? mapTipo.value : '',
            operation_type: mapOperacion ? mapOperacion.value : '',
            min_price: mapPrecioMin ? mapPrecioMin.value : '',
            max_price: mapPrecioMax ? mapPrecioMax.value : '',
            city: mapCiudad ? (mapCiudad.value || '').trim() : '',
        };
    }

    function resetFilters() {
        if (mapTipo) mapTipo.value = '';
        if (mapOperacion) mapOperacion.value = '';
        if (mapPrecioMin) mapPrecioMin.value = '';
        if (mapPrecioMax) mapPrecioMax.value = '';
        if (mapCiudad) mapCiudad.value = '';
        loadMapProperties();
    }

    // ─── Render Sidebar Property List ───────────────────────────
    function renderPropertyList(properties) {
        if (!mapPropertyList) return;

        if (properties.length === 0) {
            mapPropertyList.innerHTML = '<div class="map-no-results"><i class="fas fa-search"></i><p>No se encontraron propiedades.</p></div>';
            return;
        }

        mapPropertyList.innerHTML = properties.map(function (p) {
            var coverImage = p.cover_image || (p.images && p.images[0] && p.images[0].url) || '';
            var priceStr = safeFormatPrice(p.price, p.currency);
            var typeLabel = safeGetTypeLabel(p.property_type);
            var opLabel = safeGetOpLabel(p.operation_type);
            var address = p.city ? (p.address ? p.address + ', ' + p.city : p.city) : '--';

            return '<div class="map-property-card" data-property-id="' + p.id + '" data-lat="' + (p.lat || '') + '" data-lng="' + (p.lng || '') + '">'
                + '<img src="' + coverImage + '" alt="' + (p.title || 'Propiedad') + '" onerror="this.style.display=\'none\'">'
                + '<div class="card-info">'
                + '<div class="card-price">' + priceStr + '</div>'
                + '<div class="card-title" title="' + (p.title || '') + '">' + (p.title || 'Sin título') + '</div>'
                + '<div class="card-location">' + address + '</div>'
                + '<div class="card-badges">'
                + '<span class="card-badge badge-type">' + typeLabel + '</span>'
                + '<span class="card-badge badge-operation">' + opLabel + '</span>'
                + '</div>'
                + '</div>'
                + '</div>';
        }).join('');

        // Click on sidebar card -> fly to marker & open popup
        mapPropertyList.querySelectorAll('.map-property-card').forEach(function (card) {
            card.addEventListener('click', function () {
                var id = parseInt(card.dataset.propertyId);
                var lat = parseFloat(card.dataset.lat);
                var lng = parseFloat(card.dataset.lng);

                highlightCard(id);

                if (!isNaN(lat) && !isNaN(lng) && map) {
                    flyToProperty(id);
                } else {
                    window.location.href = 'property.html?id=' + id;
                }
            });
        });
    }

    // ─── Highlight Card & Open Popup ────────────────────────────
    function highlightCard(propertyId) {
        activeCardId = propertyId;

        // Highlight in sidebar
        if (mapPropertyList) {
            mapPropertyList.querySelectorAll('.map-property-card').forEach(function (card) {
                card.classList.toggle('active', parseInt(card.dataset.propertyId) === propertyId);
            });
        }

        // Open popup on marker
        var found = markers.find(function (m) { return m.property.id === propertyId; });
        if (found && map) {
            map.openPopup(found.marker);
        }
    }

    function flyToProperty(propertyId) {
        if (!map) return;

        var found = markers.find(function (m) { return m.property.id === propertyId; });
        if (found) {
            map.flyTo(found.marker.getLatLng(), 15, { duration: 1 });
            setTimeout(function () {
                map.openPopup(found.marker);
            }, 1100);
        }
    }

    function fitAllMarkers() {
        if (!map || markers.length === 0) return;

        var bounds = L.latLngBounds(markers.map(function (m) { return m.marker.getLatLng(); }));
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        }
    }

    // ─── Mini Map (search.html) ─────────────────────────────────
    function setupMiniMapToggle() {
        if (!mapToggleBtn || !searchMapContainer || !searchMiniMap) return;

        mapToggleBtn.addEventListener('click', function () {
            var isHidden = searchMapContainer.classList.contains('hidden');
            if (isHidden) {
                searchMapContainer.classList.remove('hidden');
                mapToggleBtn.classList.add('active');
                if (!miniMapInitialized) {
                    initMiniMap();
                    miniMapInitialized = true;
                } else {
                    setTimeout(function () { if (window._miniMap) window._miniMap.invalidateSize(); }, 100);
                }
            } else {
                searchMapContainer.classList.add('hidden');
                mapToggleBtn.classList.remove('active');
            }
        });

        if (closeMapBtn) {
            closeMapBtn.addEventListener('click', function () {
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
            loadMiniMapProperties();

            setTimeout(function () { window._miniMap.invalidateSize(); }, 300);
        } catch (error) {
            console.error('Error initializing mini map:', error);
        }
    }

    function loadMiniMapProperties() {
        if (!window._miniMap || !window._miniMarkerLayer) return;

        var params = getSearchParams();
        var endpoint = '/properties?status=approved&limit=50';
        if (params.property_type) endpoint += '&property_type=' + encodeURIComponent(params.property_type);
        if (params.operation_type) endpoint += '&operation_type=' + encodeURIComponent(params.operation_type);
        if (params.city) endpoint += '&city=' + encodeURIComponent(params.city);
        if (params.min_price) endpoint += '&min_price=' + params.min_price;
        if (params.max_price) endpoint += '&max_price=' + params.max_price;
        if (params.bedrooms) endpoint += '&bedrooms=' + params.bedrooms;
        if (params.bathrooms) endpoint += '&bathrooms=' + params.bathrooms;

        api.get(endpoint).then(function (data) {
            var properties = data.properties || [];
            window._miniMarkerLayer.clearLayers();
            var validProps = properties.filter(function (p) { return p.lat && p.lng; });

            validProps.forEach(function (property) {
                var marker = createMarker(property);
                if (marker) window._miniMarkerLayer.addLayer(marker);
            });

            if (validProps.length > 0) {
                var bounds = L.latLngBounds(validProps.map(function (p) { return [p.lat, p.lng]; }));
                window._miniMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
            }
        }).catch(function (error) {
            console.error('Error loading mini map properties:', error);
        });
    }

    // ─── Expose for external use ────────────────────────────────
    window.casasMap = {
        flyToProperty: flyToProperty,
        fitAllMarkers: fitAllMarkers,
        filterProperties: loadMapProperties,
        loadMapProperties: loadMapProperties,
        invalidateSize: function () {
            if (map) map.invalidateSize();
            if (window._miniMap) window._miniMap.invalidateSize();
        },
    };

    // ─── Start ──────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMap);
    } else {
        initMap();
    }

})();
