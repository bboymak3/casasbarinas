/**
 * CasasBarinas - Property Form Module
 * Loaded on new-property.html
 */

(function () {
    'use strict';

    // ─── Configuration ──────────────────────────────────────────
    const BARINAS_DEFAULT = { lat: 8.6233, lng: -70.2288 };
    const MAX_PHOTOS = 10;
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

    // ─── State ──────────────────────────────────────────────────
    let editingPropertyId = null;
    let uploadedImages = []; // Array of { url, file, preview }
    let isSubmitting = false;

    // ─── DOM Elements ───────────────────────────────────────────
    const formTitle = document.getElementById('formTitle');
    const propertyForm = document.getElementById('propertyForm');
    const submitBtn = document.getElementById('submitPropertyBtn');
    const submitBtnText = document.getElementById('submitBtnText');
    const uploadArea = document.getElementById('uploadArea');
    const uploadPlaceholder = document.getElementById('uploadPlaceholder');
    const photoInput = document.getElementById('photoInput');
    const photosPreview = document.getElementById('photosPreview');

    // ─── Location Picker Map ────────────────────────────────────
    let locationMap = null;
    let locationMarker = null;
    let geocoder = null;
    let selectedLat = BARINAS_DEFAULT.lat;
    let selectedLng = BARINAS_DEFAULT.lng;

    function initLocationPicker() {
        const mapEl = document.getElementById('locationMap');
        if (!mapEl || typeof L === 'undefined') return;

        try {
            // Initialize map centered on Barinas
            locationMap = L.map('locationMap', {
                center: [selectedLat, selectedLng],
                zoom: 13,
                zoomControl: true,
                scrollWheelZoom: true,
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19,
            }).addTo(locationMap);

            // Add a draggable marker
            locationMarker = L.marker([selectedLat, selectedLng], {
                draggable: true,
            }).addTo(locationMap);

            // Update coordinates when marker is dragged
            locationMarker.on('dragend', function (e) {
                const pos = e.target.getLatLng();
                selectedLat = pos.lat;
                selectedLng = pos.lng;
                updateCoordinateFields();
            });

            // Click on map to place/move marker
            locationMap.on('click', function (e) {
                selectedLat = e.latlng.lat;
                selectedLng = e.latlng.lng;
                locationMarker.setLatLng(e.latlng);
                updateCoordinateFields();
            });

            // Initialize geocoder for address search
            if (typeof L.Control.Geocoder !== 'undefined') {
                geocoder = L.Control.Geocoder.nominatim({
                    geocodingQueryParams: { countrycodes: 've' },
                });
            }

            // Search button
            const searchBtn = document.getElementById('locationSearchBtn');
            const searchInput = document.getElementById('locationSearchInput');

            if (searchBtn && searchInput) {
                searchBtn.addEventListener('click', () => searchLocation(searchInput.value));
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        searchLocation(searchInput.value);
                    }
                });
            }

            // Sync manual input fields with map
            const latInput = document.getElementById('propLat');
            const lngInput = document.getElementById('propLng');

            if (latInput) {
                latInput.addEventListener('change', () => {
                    const val = parseFloat(latInput.value);
                    if (!isNaN(val) && val >= -90 && val <= 90) {
                        selectedLat = val;
                        locationMarker.setLatLng([selectedLat, selectedLng]);
                        updateCoordinateFields();
                    }
                });
            }
            if (lngInput) {
                lngInput.addEventListener('change', () => {
                    const val = parseFloat(lngInput.value);
                    if (!isNaN(val) && val >= -180 && val <= 180) {
                        selectedLng = val;
                        locationMarker.setLatLng([selectedLat, selectedLng]);
                        updateCoordinateFields();
                    }
                });
            }

            // Fix map size after container is visible
            setTimeout(() => locationMap.invalidateSize(), 500);

        } catch (error) {
            console.error('Error initializing location picker:', error);
        }
    }

    function updateCoordinateFields() {
        const latInput = document.getElementById('propLat');
        const lngInput = document.getElementById('propLng');
        const latDisplay = document.getElementById('coordLatDisplay');
        const lngDisplay = document.getElementById('coordLngDisplay');

        if (latInput) latInput.value = selectedLat.toFixed(6);
        if (lngInput) lngInput.value = selectedLng.toFixed(6);
        if (latDisplay) latDisplay.textContent = selectedLat.toFixed(6);
        if (lngDisplay) lngDisplay.textContent = selectedLng.toFixed(6);
    }

    async function searchLocation(query) {
        if (!query || !query.trim() || !geocoder) return;

        try {
            const results = await geocoder.geocode(query);
            if (results && results.length > 0) {
                const loc = results[0].center;
                selectedLat = loc.lat;
                selectedLng = loc.lng;
                locationMarker.setLatLng([selectedLat, selectedLng]);
                locationMap.flyTo([selectedLat, selectedLng], 16, { duration: 1 });
                updateCoordinateFields();

                // Update address field if empty
                const dirInput = document.getElementById('propDireccion');
                if (dirInput && !dirInput.value.trim()) {
                    dirInput.value = results[0].name || query;
                }

                // Update city if empty
                const cityInput = document.getElementById('propCiudad');
                if (cityInput && !cityInput.value.trim() && results[0].properties) {
                    const city = results[0].properties.city || results[0].properties.town || '';
                    if (city) cityInput.value = city;
                }
            } else {
                showToast('No se encontró la ubicación. Intenta con otra búsqueda.', 'warning');
            }
        } catch (error) {
            console.error('Geocoding error:', error);
            showToast('Error al buscar la ubicación.', 'error');
        }
    }

    // ─── Initialization ─────────────────────────────────────────
    function initForm() {
        // Check authentication
        if (!requireAuth()) return;

        // Check for edit mode via URL param
        const urlParams = new URLSearchParams(window.location.search);
        const editId = urlParams.get('id');
        if (editId) {
            editingPropertyId = parseInt(editId);
            loadPropertyForEdit(editingPropertyId);
        }

        // Set up event listeners
        setupPhotoUpload();
        setupFormSubmit();

        // Initialize location picker map
        initLocationPicker();
    }

    // ─── Load Property for Editing ──────────────────────────────
    async function loadPropertyForEdit(propertyId) {
        try {
            const property = await api.get(`/properties/${propertyId}`);

            if (formTitle) {
                formTitle.innerHTML = '<i class="fas fa-edit"></i> Editar Propiedad';
            }
            if (submitBtnText) {
                submitBtnText.textContent = 'Guardar Cambios';
            }

            updateFormFromProperty(property);
        } catch (error) {
            showToast('Error al cargar la propiedad para editar', 'error');
            console.error('Error loading property:', error);
        }
    }

    // ─── Populate Form from Property Data ───────────────────────
    function updateFormFromProperty(property) {
        if (!property) return;

        const setValue = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value || '';
        };

        setValue('propTitle', property.title);
        setValue('propDescription', property.description);
        setValue('propPrecio', property.price);
        setValue('propMoneda', property.currency);
        setValue('propDireccion', property.address);
        setValue('propCiudad', property.city);
        setValue('propEstado', property.state);
        setValue('propLat', property.lat);
        setValue('propLng', property.lng);

        // Update map marker if coordinates exist
        if (property.lat && property.lng && locationMap && locationMarker) {
            selectedLat = property.lat;
            selectedLng = property.lng;
            locationMarker.setLatLng([selectedLat, selectedLng]);
            locationMap.flyTo([selectedLat, selectedLng], 15, { duration: 0.5 });
            updateCoordinateFields();
        }
        setValue('propHabitaciones', property.bedrooms);
        setValue('propBanos', property.bathrooms);
        setValue('propEstacionamientos', property.parking_spaces);
        setValue('propPisos', property.floors);
        setValue('propArea', property.area);
        setValue('propAreaUnidad', property.area_unit);
        setValue('propAno', property.year_built);

        // Property type - capitalize for display in select
        const propTipo = document.getElementById('propTipo');
        if (propTipo && property.property_type) {
            const typeMap = {
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
            propTipo.value = typeMap[property.property_type.toLowerCase()] || property.property_type;
        }

        // Operation type
        const propOperacion = document.getElementById('propOperacion');
        if (propOperacion && property.operation_type) {
            const opMap = {
                'venta': 'Venta',
                'alquiler': 'Alquiler',
                'venta_alquiler': 'Venta y Alquiler',
            };
            propOperacion.value = opMap[property.operation_type.toLowerCase()] || property.operation_type;
        }

        // Features checkboxes
        const featuresMap = {
            'has_pool': 'Piscina',
            'has_garden': 'Jardín',
            'has_ac': 'Aire Acondicionado',
            'has_kitchen': 'Cocina',
            'has_furniture': 'Amueblado',
            'has_security': 'Seguridad',
            'has_elevator': 'Ascensor',
        };
        for (const [field, label] of Object.entries(featuresMap)) {
            if (property[field]) {
                const checkbox = propertyForm?.querySelector(`input[name="caracteristicas"][value="${label}"]`);
                if (checkbox) checkbox.checked = true;
            }
        }

        // Load existing images
        if (property.images && property.images.length > 0) {
            uploadedImages = property.images.map((img, index) => ({
                url: img.url,
                file: null,
                preview: img.url || img.thumbnail_url,
                isExisting: true,
                imageId: img.id,
                isCover: img.is_cover,
                orderIndex: img.order_index,
            }));
            renderPhotoPreviews();
        }
    }

    // ─── Photo Upload Setup ─────────────────────────────────────
    function setupPhotoUpload() {
        if (!uploadArea || !photoInput) return;

        // Click to upload
        uploadArea.addEventListener('click', () => {
            photoInput.click();
        });

        // File input change
        photoInput.addEventListener('change', (e) => {
            if (e.target.files) {
                handlePhotoUpload(Array.from(e.target.files));
                photoInput.value = ''; // Reset so same file can be selected again
            }
        });

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadArea.classList.add('drag-over');
        });

        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadArea.classList.remove('drag-over');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadArea.classList.remove('drag-over');

            const files = Array.from(e.dataTransfer.files);
            handlePhotoUpload(files);
        });
    }

    // ─── Handle Photo Upload ────────────────────────────────────
    function handlePhotoUpload(files) {
        if (!files || files.length === 0) return;

        // Check total count
        const remaining = MAX_PHOTOS - uploadedImages.length;
        if (remaining <= 0) {
            showToast(`Máximo ${MAX_PHOTOS} imágenes permitidas`, 'warning');
            return;
        }

        const validFiles = files.slice(0, remaining);

        for (const file of validFiles) {
            // Validate file extension
            const extension = file.name.split('.').pop().toLowerCase();
            if (!ALLOWED_EXTENSIONS.includes(extension)) {
                showToast(`Archivo "${file.name}" no es un formato soportado. Usa JPG, PNG, WebP o GIF.`, 'error');
                continue;
            }

            // Validate file type
            if (!ALLOWED_TYPES.includes(file.type)) {
                showToast(`Tipo de archivo "${file.name}" no soportado.`, 'error');
                continue;
            }

            // Validate file size
            if (file.size > MAX_FILE_SIZE) {
                showToast(`Archivo "${file.name}" excede el límite de 5MB.`, 'error');
                continue;
            }

            // Create preview
            const reader = new FileReader();
            reader.onload = (e) => {
                uploadedImages.push({
                    url: null,
                    file: file,
                    preview: e.target.result,
                    isExisting: false,
                });
                renderPhotoPreviews();
            };
            reader.readAsDataURL(file);
        }
    }

    // ─── Render Photo Previews ──────────────────────────────────
    function renderPhotoPreviews() {
        if (!photosPreview) return;

        photosPreview.innerHTML = '';

        uploadedImages.forEach((img, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'photo-preview-item';
            wrapper.draggable = true;
            wrapper.dataset.index = index;

            wrapper.innerHTML = `
                <img src="${img.preview}" alt="Preview ${index + 1}">
                ${index === 0 ? '<span class="photo-cover-badge">Principal</span>' : ''}
                <button type="button" class="photo-remove-btn" title="Eliminar imagen">
                    <i class="fas fa-times"></i>
                </button>
            `;

            // Remove button
            const removeBtn = wrapper.querySelector('.photo-remove-btn');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removePhoto(index);
            });

            // Drag to reorder
            wrapper.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index.toString());
                wrapper.classList.add('dragging');
            });

            wrapper.addEventListener('dragend', () => {
                wrapper.classList.remove('dragging');
            });

            wrapper.addEventListener('dragover', (e) => {
                e.preventDefault();
                wrapper.classList.add('drag-over');
            });

            wrapper.addEventListener('dragleave', () => {
                wrapper.classList.remove('drag-over');
            });

            wrapper.addEventListener('drop', (e) => {
                e.preventDefault();
                wrapper.classList.remove('drag-over');
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const toIndex = index;
                if (fromIndex !== toIndex) {
                    const item = uploadedImages.splice(fromIndex, 1)[0];
                    uploadedImages.splice(toIndex, 0, item);
                    renderPhotoPreviews();
                }
            });

            photosPreview.appendChild(wrapper);
        });

        // Update upload area message
        if (uploadPlaceholder) {
            if (uploadedImages.length >= MAX_PHOTOS) {
                uploadPlaceholder.innerHTML = `
                    <i class="fas fa-check-circle"></i>
                    <h3>Máximo de imágenes alcanzado</h3>
                    <p>Has alcanzado el límite de ${MAX_PHOTOS} imágenes</p>
                `;
                uploadArea.style.pointerEvents = 'none';
                uploadArea.style.opacity = '0.6';
            } else {
                uploadArea.style.pointerEvents = '';
                uploadArea.style.opacity = '';
            }
        }
    }

    // ─── Remove Photo ───────────────────────────────────────────
    function removePhoto(index) {
        if (index < 0 || index >= uploadedImages.length) return;

        const removed = uploadedImages[index];
        uploadedImages.splice(index, 1);
        renderPhotoPreviews();

        if (removed.isExisting) {
            showToast('La imagen se eliminará al guardar los cambios', 'info');
        }
    }

    // ─── Setup Form Submit ──────────────────────────────────────
    function setupFormSubmit() {
        if (!propertyForm) return;

        propertyForm.addEventListener('submit', handleFormSubmit);
    }

    // ─── Handle Form Submit ─────────────────────────────────────
    async function handleFormSubmit(e) {
        e.preventDefault();

        if (isSubmitting) return;

        // Clear previous errors
        document.querySelectorAll('.form-error').forEach(el => el.textContent = '');

        // Gather form values
        const getValue = (id) => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : '';
        };

        const getValueNum = (id) => {
            const el = document.getElementById(id);
            return el ? parseFloat(el.value) : null;
        };

        const title = getValue('propTitle');
        const description = getValue('propDescription');
        const tipo = getValue('propTipo');
        const operacion = getValue('propOperacion');
        const precio = getValueNum('propPrecio');
        const moneda = getValue('propMoneda');
        const direccion = getValue('propDireccion');
        const ciudad = getValue('propCiudad');
        const estado = getValue('propEstado');
        let lat = getValueNum('propLat');
        let lng = getValueNum('propLng');
        const habitaciones = getValueNum('propHabitaciones');
        const banos = getValueNum('propBanos');
        const estacionamientos = getValueNum('propEstacionamientos');
        const pisos = getValueNum('propPisos');
        const area = getValueNum('propArea');
        const areaUnidad = getValue('propAreaUnidad');
        const ano = getValueNum('propAno');

        // ── Validation ──
        let hasError = false;

        if (!title) {
            showFormError('propTitle', 'El título es requerido');
            hasError = true;
        } else if (title.length > 150) {
            showFormError('propTitle', 'El título no puede exceder 150 caracteres');
            hasError = true;
        }

        if (!description) {
            showFormError('propDescription', 'La descripción es requerida');
            hasError = true;
        }

        if (!tipo) {
            showFormError('propTipo', 'Selecciona un tipo de propiedad');
            hasError = true;
        }

        if (!operacion) {
            showFormError('propOperacion', 'Selecciona un tipo de operación');
            hasError = true;
        }

        if (!precio || precio <= 0) {
            showFormError('propPrecio', 'Ingresa un precio válido');
            hasError = true;
        }

        if (!direccion) {
            showFormError('propDireccion', 'La dirección es requerida');
            hasError = true;
        }

        if (!ciudad) {
            showFormError('propCiudad', 'La ciudad es requerida');
            hasError = true;
        }

        if (!area || area <= 0) {
            showFormError('propArea', 'El área es requerida');
            hasError = true;
        }

        if (hasError) {
            showToast('Por favor corrige los errores en el formulario', 'error');
            // Scroll to first error
            const firstError = document.querySelector('.form-error:not(:empty)');
            if (firstError) {
                firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }

        // Default coordinates to Barinas if not provided
        if (isNaN(lat) || isNaN(lng)) {
            lat = BARINAS_DEFAULT.lat;
            lng = BARINAS_DEFAULT.lng;
        }

        // Map form values to API field names
        const tipoMap = {
            'Casa': 'casa',
            'Apartamento': 'apartamento',
            'Terreno': 'terreno',
            'Local Comercial': 'local_comercial',
            'Oficina': 'oficina',
            'Hotel': 'hotel',
            'Finca': 'finca',
            'Galpón': 'Galpón',
            'Estacionamiento': 'estacionamiento',
            'Otro': 'otro',
        };

        const operacionMap = {
            'Venta': 'venta',
            'Alquiler': 'alquiler',
            'Venta y Alquiler': 'venta_alquiler',
        };

        // Gather features
        const features = {};
        const featureMap = {
            'Piscina': 'has_pool',
            'Jardín': 'has_garden',
            'Aire Acondicionado': 'has_ac',
            'Cocina': 'has_kitchen',
            'Amueblado': 'has_furniture',
            'Seguridad': 'has_security',
            'Ascensor': 'has_elevator',
        };

        const checkedFeatures = propertyForm.querySelectorAll('input[name="caracteristicas"]:checked');
        checkedFeatures.forEach(cb => {
            const apiField = featureMap[cb.value];
            if (apiField) features[apiField] = true;
        });

        const propertyData = {
            title,
            description,
            property_type: tipoMap[tipo] || tipo.toLowerCase(),
            operation_type: operacionMap[operacion] || operacion.toLowerCase(),
            price: precio,
            currency: moneda || 'USD',
            address: direccion,
            city: ciudad,
            state: estado || 'Barinas',
            lat,
            lng,
            bedrooms: habitaciones || null,
            bathrooms: banos || null,
            parking_spaces: estacionamientos || null,
            area,
            area_unit: areaUnidad || 'm2',
            year_built: ano || null,
            floors: pisos || null,
            ...features,
        };

        // Submit
        isSubmitting = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        }

        try {
            let propertyId = editingPropertyId;

            if (editingPropertyId) {
                // Update existing property
                await api.put(`/properties/${editingPropertyId}`, propertyData);
                propertyId = editingPropertyId;
            } else {
                // Create new property
                const result = await api.post('/properties', propertyData);
                propertyId = result.property_id;
            }

            // Upload new images (files that haven't been uploaded yet)
            const newFiles = uploadedImages.filter(img => !img.isExisting && img.file);

            if (newFiles.length > 0 && propertyId) {
                for (let i = 0; i < newFiles.length; i++) {
                    try {
                        const img = newFiles[i];
                        const formData = new FormData();
                        formData.append('file', img.file);
                        formData.append('property_id', propertyId.toString());

                        // Upload file to R2
                        const uploadResult = await api.postFormData('/upload', formData);

                        if (uploadResult.url) {
                            // Register image in DB
                            const isCover = (i === 0 && !uploadedImages.some(u => u.isExisting && u.isCover));
                            await api.post(`/images/${propertyId}`, {
                                url: uploadResult.url,
                                is_cover: isCover,
                                order_index: uploadedImages.indexOf(img),
                            });
                        }
                    } catch (uploadError) {
                        console.error('Error uploading image:', uploadError);
                        showToast(`Error al subir imagen ${i + 1}: ${uploadError.message}`, 'warning');
                    }
                }
            }

            // Show success
            showToast(editingPropertyId ? 'Propiedad actualizada exitosamente' : 'Propiedad publicada exitosamente. Pendiente de aprobación.', 'success');

            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);

        } catch (error) {
            showToast(error.message || 'Error al guardar la propiedad', 'error');
        } finally {
            isSubmitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fas fa-paper-plane"></i> <span id="submitBtnText">${editingPropertyId ? 'Guardar Cambios' : 'Publicar Propiedad'}</span>`;
            }
        }
    }

    // ─── Form Error Helper ──────────────────────────────────────
    function showFormError(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (field) {
            field.classList.add('input-error');
            // Find or create error span
            let errorSpan = field.parentElement.querySelector('.form-error');
            if (!errorSpan) {
                errorSpan = field.closest('.form-group')?.querySelector('.form-error');
            }
            if (errorSpan) {
                errorSpan.textContent = message;
            }
        }
    }

    // ─── Initialize on DOM Ready ────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initForm);
    } else {
        initForm();
    }

})();
