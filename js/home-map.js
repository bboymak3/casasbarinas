/**
 * CasasBarinas - Home Page Mini Map
 * Shows a compact map with property markers on the homepage
 */

(function () {
    'use strict';

    var BARINAS_CENTER = [8.6233, -70.2288];
    var map = null;
    var markerLayer = null;

    function initHomeMap() {
        var mapEl = document.getElementById('homeMap');
        if (!mapEl || typeof L === 'undefined') return;

        try {
            map = L.map('homeMap', {
                center: BARINAS_CENTER,
                zoom: 12,
                zoomControl: false,
                scrollWheelZoom: false,
                dragging: true,
                tap: true,
                touchZoom: true,
                doubleClickZoom: false,
                boxZoom: false,
                keyboard: false,
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 19,
            }).addTo(map);

            markerLayer = L.layerGroup().addTo(map);

            // Load properties
            loadProperties();

            // Fix size after render
            setTimeout(function () { map.invalidateSize(); }, 300);
        } catch (error) {
            console.error('Error loading home map:', error);
        }
    }

    function createMarkerIcon(price, operationType) {
        var colors = {
            'venta': '#1a73e8',
            'alquiler': '#28a745',
            'venta_alquiler': '#ff6b35',
        };
        var color = (operationType && colors[operationType.toLowerCase()]) || '#1a73e8';

        var label = '';
        if (price != null && !isNaN(price)) {
            if (price >= 1000000) label = '$' + (price / 1000000).toFixed(1) + 'M';
            else if (price >= 1000) label = '$' + (price / 1000).toFixed(0) + 'K';
            else label = '$' + price;
        }

        return L.divIcon({
            className: 'custom-map-marker',
            html: '<div class="marker-pin" style="background-color:' + color + ';">'
                + '<span class="marker-price">' + label + '</span>'
                + '</div>'
                + '<div class="marker-shadow"></div>',
            iconSize: [40, 52],
            iconAnchor: [20, 52],
            popupAnchor: [0, -56],
        });
    }

    function loadProperties() {
        if (!map || !markerLayer) return;

        fetch('/api/properties?status=approved&limit=100')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var properties = data.properties || [];
                var validProps = properties.filter(function (p) { return p.lat && p.lng; });

                markerLayer.clearLayers();

                validProps.forEach(function (p) {
                    var icon = createMarkerIcon(p.price, p.operation_type);
                    var coverImage = p.cover_image || (p.images && p.images[0] && p.images[0].url) || '';
                    var title = p.title || 'Sin titulo';
                    var priceStr = p.price != null ? '$' + Number(p.price).toLocaleString() : 'Precio no disponible';

                    var imgTag = coverImage
                        ? '<div class="map-popup-image"><img src="' + coverImage + '" alt="' + title + '" onerror="this.parentElement.style.display=\'none\'"></div>'
                        : '';

                    var popupHTML = '<div class="map-popup">'
                        + imgTag
                        + '<div class="map-popup-content">'
                        + '<h4 class="map-popup-title">' + title + '</h4>'
                        + '<div class="map-popup-price">' + priceStr + '</div>'
                        + '<a href="property.html?id=' + p.id + '" class="map-popup-link">Ver más <i class="fas fa-arrow-right"></i></a>'
                        + '</div>'
                        + '</div>';

                    var marker = L.marker([p.lat, p.lng], { icon: icon });
                    marker.bindPopup(popupHTML, {
                        maxWidth: 300,
                        minWidth: 260,
                        closeButton: true,
                    });

                    markerLayer.addLayer(marker);
                });

                // Fit bounds to show all markers
                if (validProps.length > 0) {
                    var bounds = L.latLngBounds(validProps.map(function (p) { return [p.lat, p.lng]; }));
                    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
                }

                // Hide overlay if properties exist
                var overlay = document.getElementById('homeMapOverlay');
                if (overlay && validProps.length > 0) {
                    overlay.style.display = 'none';
                }
            })
            .catch(function (err) {
                console.error('Error loading map properties:', err);
            });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHomeMap);
    } else {
        initHomeMap();
    }

})();
