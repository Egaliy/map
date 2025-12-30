// Состояние приложения
let cities = []; // Массив всех вхождений городов (разрешаем дубликаты)
let map = null;
let markers = [];
let cityMarkers = []; // Массив маркеров городов, каждый маркер связан с индексом в cities
let linesToCenter = []; // Массив линий от городов до центральной точки
let geocodeCache = {}; // Кэш результатов геокодирования
let reverseGeocodeCache = {}; // Кэш результатов reverse geocoding
let processingQueue = []; // Очередь городов для обработки
let isProcessing = false; // Флаг обработки очереди

// Работа с localStorage (кэш)
const CACHE_KEYS = {
    CITIES: 'mapApp_cities',
    RESULT: 'mapApp_result',
    MAP_STATE: 'mapApp_mapState',
    GEOCODE_CACHE: 'mapApp_geocodeCache'
};

// Сохранение в localStorage
function saveToCache(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn('Не удалось сохранить в кэш:', e);
    }
}

// Загрузка из localStorage
function loadFromCache(key) {
    try {
        const item = localStorage.getItem(key);
        if (item) {
            return JSON.parse(item);
        }
    } catch (e) {
        console.warn('Не удалось загрузить из кэша:', e);
    }
    return null;
}

// Удаление из кэша
function removeFromCache(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.warn('Не удалось удалить из кэша:', e);
    }
}

// Сохранение всех данных в кэш
function saveAllData() {
    // Сохраняем только города с координатами (не сохраняем города в процессе загрузки)
    const citiesToSave = cities.filter(c => c.lat && c.lon);
    saveToCache(CACHE_KEYS.CITIES, citiesToSave);
    
    // Сохраняем результат, если он есть
    const resultSection = document.getElementById('resultSection');
    if (resultSection && resultSection.style.display !== 'none') {
        const result = {
            city: document.getElementById('resultCity').textContent,
            country: document.getElementById('resultCountry').textContent
        };
        saveToCache(CACHE_KEYS.RESULT, result);
    }
    
    // Сохраняем состояние карты
    if (map) {
        const center = map.getCenter();
        const zoom = map.getZoom();
        saveToCache(CACHE_KEYS.MAP_STATE, {
            center: [center.lat, center.lng],
            zoom: zoom
        });
    }
    
    // Сохраняем кэш геокодирования
    saveToCache(CACHE_KEYS.GEOCODE_CACHE, geocodeCache);
    
    // Сохраняем кэш reverse geocoding
    saveToCache('mapApp_reverseGeocodeCache', reverseGeocodeCache);
}

// Загрузка всех данных из кэша
function loadAllData() {
    // Загружаем города
    const savedCities = loadFromCache(CACHE_KEYS.CITIES);
    if (savedCities && Array.isArray(savedCities) && savedCities.length > 0) {
        cities = savedCities;
    }
    
    // Загружаем кэш геокодирования
    const savedGeocodeCache = loadFromCache(CACHE_KEYS.GEOCODE_CACHE);
    if (savedGeocodeCache && typeof savedGeocodeCache === 'object') {
        geocodeCache = savedGeocodeCache;
    }
    
    // Загружаем кэш reverse geocoding
    const savedReverseCache = loadFromCache('mapApp_reverseGeocodeCache');
    if (savedReverseCache && typeof savedReverseCache === 'object') {
        reverseGeocodeCache = savedReverseCache;
    }
    
    // Загружаем состояние карты
    const savedMapState = loadFromCache(CACHE_KEYS.MAP_STATE);
    if (savedMapState) {
        return savedMapState;
    }
    
    return null;
}

// Сохранение городов (для обратной совместимости)
function saveCitiesToCookie() {
    saveAllData();
}

// Загрузка городов (для обратной совместимости)
function loadCitiesFromCookie() {
    const savedCities = loadFromCache(CACHE_KEYS.CITIES);
    if (savedCities && Array.isArray(savedCities) && savedCities.length > 0) {
        return savedCities;
    }
    return null;
}

// Инициализация карты
function initMap(center = [55.7558, 37.6173], zoom = 2) {
    if (map) {
        map.remove();
    }
    
    map = L.map('map', {
        zoomControl: true,
        attributionControl: false
    }).setView(center, zoom);
    
    // Используем CartoDB Dark Matter - черная карта
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '',
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(map);
}

// Показать загрузку
function showLoading() {
    document.getElementById('loading').style.display = 'flex';
}

// Скрыть загрузку
function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

// Показать сообщение об ошибке
function showError(message) {
    const citiesList = document.getElementById('citiesList');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    citiesList.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

// Показать сообщение об успехе
function showSuccess(message) {
    const citiesList = document.getElementById('citiesList');
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    citiesList.appendChild(successDiv);
    
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

// Геокодирование города (преобразование названия в координаты)
async function geocodeCity(cityName) {
    // Проверяем кэш
    const cacheKey = cityName.toLowerCase().trim();
    if (geocodeCache[cacheKey]) {
        return geocodeCache[cacheKey];
    }
    
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}&limit=1`,
            {
                headers: {
                    'User-Agent': 'LocationAverageService/1.0'
                }
            }
        );
        
        const data = await response.json();
        
        if (data && data.length > 0) {
            const result = {
                name: cityName,
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon),
                displayName: data[0].display_name
            };
            
            // Сохраняем в кэш
            geocodeCache[cacheKey] = result;
            saveToCache(CACHE_KEYS.GEOCODE_CACHE, geocodeCache);
            
            return result;
        } else {
            throw new Error('Город не найден');
        }
    } catch (error) {
        throw new Error(`Ошибка при поиске города: ${error.message}`);
    }
}

// Reverse geocoding (преобразование координат в адрес)
async function reverseGeocode(lat, lon) {
    // Проверяем кэш (округление до 4 знаков для кэширования)
    const cacheKey = `${lat.toFixed(4)}_${lon.toFixed(4)}`;
    if (reverseGeocodeCache[cacheKey]) {
        return reverseGeocodeCache[cacheKey];
    }
    
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
            {
                headers: {
                    'User-Agent': 'LocationAverageService/1.0'
                }
            }
        );
        
        const data = await response.json();
        
        let result;
        if (data && data.address) {
            const address = data.address;
            const city = address.city || address.town || address.village || address.municipality;
            
            // Если город неизвестный, ищем ближайший город
            if (!city || city === 'Неизвестно') {
                result = await findNearestCityName(lat, lon);
            } else {
                result = {
                    city: city,
                    country: address.country || 'Неизвестно',
                    fullAddress: data.display_name
                };
            }
        } else {
            result = await findNearestCityName(lat, lon);
        }
        
        // Сохраняем в кэш
        reverseGeocodeCache[cacheKey] = result;
        saveToCache('mapApp_reverseGeocodeCache', reverseGeocodeCache);
        
        return result;
    } catch (error) {
        const result = await findNearestCityName(lat, lon);
        // Сохраняем даже ошибки в кэш, чтобы не повторять запросы
        reverseGeocodeCache[cacheKey] = result;
        return result;
    }
}

// Поиск ближайшего города по координатам
async function findNearestCityName(lat, lon) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=5&addressdetails=1`,
            {
                headers: {
                    'User-Agent': 'LocationAverageService/1.0'
                }
            }
        );
        
        const data = await response.json();
        
        if (data && data.address) {
            const address = data.address;
            return {
                city: address.city || address.town || address.village || address.municipality || 'Ближайший город',
                country: address.country || 'Неизвестно',
                fullAddress: data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`
            };
        }
    } catch (error) {
        // Игнорируем ошибку
    }
    
    return {
        city: 'Ближайший город',
        country: 'Неизвестно',
        fullAddress: `${lat.toFixed(4)}, ${lon.toFixed(4)}`
    };
}

// Поиск ближайшего населенного пункта к координатам через поиск в радиусе
async function findNearestSettlement(lat, lon) {
    // Проверяем кэш
    const cacheKey = `settlement_${lat.toFixed(4)}_${lon.toFixed(4)}`;
    if (reverseGeocodeCache[cacheKey]) {
        return reverseGeocodeCache[cacheKey];
    }
    
    try {
        // Сначала пробуем простой reverse geocoding
        const reverseInfo = await findNearestCityName(lat, lon);
        
        // Если нашли нормальный город, возвращаем его
        if (reverseInfo.city && reverseInfo.city !== 'Ближайший город' && reverseInfo.city !== 'Неизвестно') {
            const result = {
                city: reverseInfo.city,
                country: reverseInfo.country,
                fullAddress: reverseInfo.fullAddress,
                lat: lat,
                lon: lon
            };
            reverseGeocodeCache[cacheKey] = result;
            saveToCache('mapApp_reverseGeocodeCache', reverseGeocodeCache);
            return result;
        }
        
        // Если не нашли, ищем через nearby поиск (только один запрос с небольшим радиусом)
        try {
            const nearbyResponse = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=&lat=${lat}&lon=${lon}&radius=50000&limit=10&addressdetails=1&featuretype=settlement`,
                {
                    headers: {
                        'User-Agent': 'LocationAverageService/1.0'
                    }
                }
            );
            
            const nearbyData = await nearbyResponse.json();
            
            if (nearbyData && nearbyData.length > 0) {
                // Находим ближайший населенный пункт
                let nearest = null;
                let minDistance = Infinity;
                
                nearbyData.forEach(item => {
                    const address = item.address || {};
                    const cityName = address.city || address.town || address.village || address.municipality;
                    if (cityName) {
                        const itemLat = parseFloat(item.lat);
                        const itemLon = parseFloat(item.lon);
                        const distance = calculateDistance(lat, lon, itemLat, itemLon);
                        
                        if (distance < minDistance) {
                            minDistance = distance;
                            nearest = {
                                lat: itemLat,
                                lon: itemLon,
                                city: cityName,
                                country: address.country || 'Неизвестно',
                                fullAddress: item.display_name
                            };
                        }
                    }
                });
                
                if (nearest) {
                    reverseGeocodeCache[cacheKey] = nearest;
                    saveToCache('mapApp_reverseGeocodeCache', reverseGeocodeCache);
                    return nearest;
                }
            }
        } catch (e) {
            // Игнорируем ошибку nearby поиска
        }
        
        // Если ничего не нашли, возвращаем базовую информацию
        const result = {
            city: reverseInfo.city,
            country: reverseInfo.country,
            fullAddress: reverseInfo.fullAddress,
            lat: lat,
            lon: lon
        };
        reverseGeocodeCache[cacheKey] = result;
        saveToCache('mapApp_reverseGeocodeCache', reverseGeocodeCache);
        return result;
    } catch (error) {
        console.error('Ошибка при поиске ближайшего населенного пункта:', error);
        const result = {
            city: 'Ближайший населенный пункт',
            country: 'Неизвестно',
            fullAddress: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
            lat: lat,
            lon: lon
        };
        reverseGeocodeCache[cacheKey] = result;
        return result;
    }
}

// Вычисление средней точки
function calculateAverageLocation(cities) {
    // Фильтруем только города с координатами
    const citiesWithCoords = cities.filter(city => city.lat && city.lon);
    if (citiesWithCoords.length === 0) return null;
    
    let sumLat = 0;
    let sumLon = 0;
    
    citiesWithCoords.forEach(city => {
        sumLat += city.lat;
        sumLon += city.lon;
    });
    
    return {
        lat: sumLat / citiesWithCoords.length,
        lon: sumLon / citiesWithCoords.length
    };
}

// Вычисление расстояния между двумя точками (формула гаверсинуса)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Радиус Земли в км
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Поиск ближайшего города к средней точке
function findNearestCity(avgLocation, cities) {
    if (cities.length === 0) return null;
    if (cities.length === 1) return cities[0];
    
    let nearestCity = cities[0];
    let minDistance = calculateDistance(avgLocation.lat, avgLocation.lon, cities[0].lat, cities[0].lon);
    
    for (let i = 1; i < cities.length; i++) {
        const distance = calculateDistance(avgLocation.lat, avgLocation.lon, cities[i].lat, cities[i].lon);
        if (distance < minDistance) {
            minDistance = distance;
            nearestCity = cities[i];
        }
    }
    
    return nearestCity;
}

// Обработка очереди городов
async function processQueue() {
    if (isProcessing || processingQueue.length === 0) {
        return;
    }
    
    isProcessing = true;
    
    while (processingQueue.length > 0) {
        const cityName = processingQueue.shift();
        
        try {
            // Геокодируем город
            const city = await geocodeCity(cityName);
            
            // Обновляем все города с таким именем, которые еще не обработаны
            let updated = false;
            cities.forEach((c, index) => {
                if (c.name === cityName && !c.lat) {
                    cities[index] = { ...city };
                    updated = true;
                }
            });
            
            // Если не нашли для обновления, добавляем новый
            if (!updated) {
                cities.push(city);
            }
            
            // Обновляем список городов
            await renderCitiesList();
            
            // Если это первый город с координатами, инициализируем карту
            const citiesWithCoords = cities.filter(c => c.lat && c.lon);
            if (citiesWithCoords.length === 1) {
                initMap([city.lat, city.lon], 10);
            }
            
            // Обновляем маркеры на карте
            updateCityMarkers();
            
            // Обновляем границы карты
            if (citiesWithCoords.length > 0) {
                updateMapBounds();
            }
            
            // Сохраняем в кэш
            saveCitiesToCookie();
            
            // Автоматически рассчитываем среднюю точку асинхронно в фоне
            if (citiesWithCoords.length >= 1) {
                calculateAverage().catch(error => {
                    console.error('Ошибка при расчете:', error);
                });
            }
            
            // Небольшая задержка между обработкой городов, чтобы не перегружать API
            if (processingQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        } catch (error) {
            // Удаляем все города с таким именем, которые еще не обработаны
            cities = cities.filter(c => !(c.name === cityName && !c.lat));
            await renderCitiesList();
            showError(`Ошибка при обработке города "${cityName}": ${error.message}`);
        }
    }
    
    isProcessing = false;
}

// Добавление города
async function addCity(cityNameToAdd = null) {
    const input = document.getElementById('cityInput');
    const cityName = cityNameToAdd || input.value.trim();
    
    if (!cityName) {
        showError('Введите название города');
        return;
    }
    
    // Сразу добавляем город в список с пометкой "загрузка"
    const placeholderCity = {
        name: cityName,
        lat: null,
        lon: null,
        displayName: 'Загрузка...',
        isLoading: true
    };
    cities.push(placeholderCity);
    
    // Очистка сообщения "пусто"
    const citiesList = document.getElementById('citiesList');
    const emptyMsg = citiesList.querySelector('.empty-message');
    if (emptyMsg) {
        emptyMsg.remove();
    }
    
    // Сразу обновляем список городов
    await renderCitiesList();
    
    // Сохраняем в кэш
    saveCitiesToCookie();
    
    // Очищаем поле ввода
    if (!cityNameToAdd) {
        input.value = '';
        showSuccess(`Город "${cityName}" добавлен, обработка...`);
    }
    
    // Добавляем в очередь обработки
    processingQueue.push(cityName);
    
    // Запускаем обработку очереди (если еще не запущена)
    processQueue().catch(error => {
        console.error('Ошибка при обработке очереди:', error);
    });
}

// Обновление всех маркеров городов на карте
function updateCityMarkers() {
    // Удаляем все существующие маркеры
    cityMarkers.forEach(marker => map.removeLayer(marker));
    cityMarkers = [];
    
    // Создаем новые маркеры только для городов с координатами
    cities.forEach(city => {
        if (city.lat && city.lon) {
            const marker = L.marker([city.lat, city.lon])
                .addTo(map)
                .bindPopup(`<b>${city.name}</b><br>${city.displayName}`);
            cityMarkers.push(marker);
        }
    });
}

// Обновление линий от городов до центральной точки
function updateLinesToCenter(centerLat, centerLon) {
    // Проверяем, что карта инициализирована
    if (!map) return;
    
    // Удаляем все существующие линии
    linesToCenter.forEach(line => {
        if (map.hasLayer(line)) {
            map.removeLayer(line);
        }
    });
    linesToCenter = [];
    
    // Создаем линии от каждого города до центральной точки
    cities.forEach(city => {
        if (city.lat && city.lon && centerLat && centerLon) {
            const line = L.polyline(
                [[city.lat, city.lon], [centerLat, centerLon]],
                {
                    color: 'rgba(255, 255, 255, 0.4)',
                    weight: 2,
                    opacity: 0.7,
                    dashArray: '5, 5'
                }
            ).addTo(map);
            linesToCenter.push(line);
        }
    });
}

// Обновление границ карты для показа всех городов
function updateMapBounds() {
    if (cityMarkers.length === 0) return;
    
    const group = new L.featureGroup(cityMarkers);
    map.fitBounds(group.getBounds().pad(0.1));
}

// Получение статистики по городам
function getCityStats() {
    const stats = {};
    cities.forEach(city => {
        const key = city.name.toLowerCase();
        if (!stats[key]) {
            stats[key] = {
                name: city.name,
                count: 0,
                city: city
            };
        }
        stats[key].count++;
    });
    return Object.values(stats);
}

// Отображение списка городов
async function renderCitiesList() {
    const citiesList = document.getElementById('citiesList');
    
    if (cities.length === 0) {
        citiesList.innerHTML = '<p class="empty-message">Добавьте города для определения ближайшего</p>';
        return;
    }
    
    const stats = getCityStats();
    
    // Вычисляем центральную точку для расчета расстояний (только для городов с координатами)
    const citiesWithCoords = cities.filter(c => c.lat && c.lon);
    let centerLocation = null;
    if (citiesWithCoords.length > 0) {
        centerLocation = calculateAverageLocation(citiesWithCoords);
    }
    
    let html = '';
    for (const stat of stats) {
        const isLoading = stat.city.isLoading || !stat.city.lat;
        let distance = 0;
        
        if (centerLocation && stat.city.lat && stat.city.lon) {
            distance = calculateDistance(
                centerLocation.lat, centerLocation.lon,
                stat.city.lat, stat.city.lon
            );
        }
        
        html += `
        <div class="city-item ${isLoading ? 'city-loading' : ''}">
            <div class="city-main-info">
                <div class="city-header">
                    <span class="city-name">${stat.name}</span>
                    ${stat.count > 1 ? `<span class="city-count">×${stat.count}</span>` : ''}
                    ${isLoading ? `<span class="loading-indicator">⏳</span>` : ''}
                </div>
                ${isLoading ? `
                    <div class="city-details">
                        <span class="city-loading-text">Загрузка координат...</span>
                    </div>
                ` : distance > 0 ? `
                    <div class="city-details">
                        <span class="city-distance">${distance.toFixed(0)} км</span>
                    </div>
                ` : ''}
            </div>
        </div>
        `;
    }
    
    citiesList.innerHTML = html;
}

// Добавление того же города еще раз
async function addCityAgain(cityName) {
    await addCity(cityName);
}

// Удаление города по имени (удаляет одно вхождение)
async function removeCityByName(cityName) {
    const index = cities.findIndex(c => c.name.toLowerCase() === cityName.toLowerCase());
    if (index === -1) return;
    
    // Удаляем город из массива
    cities.splice(index, 1);
    
    await     await renderCitiesList();
    
    // Обновляем все маркеры городов
    if (cities.length > 0) {
        updateCityMarkers();
    } else {
        // Если городов не осталось, возвращаем карту к начальному виду
        cityMarkers.forEach(marker => map.removeLayer(marker));
        cityMarkers = [];
        linesToCenter.forEach(line => map.removeLayer(line));
        linesToCenter = [];
        initMap();
        document.getElementById('resultSection').style.display = 'none';
        saveCitiesToCookie();
        return;
    }
    
    // Пересчитываем среднюю точку
    calculateAverage();
    if (cityMarkers.length > 0) {
        updateMapBounds();
    }
    
    // Сохраняем в cookies
    saveCitiesToCookie();
}

// Расчет ближайшего города
async function calculateAverage() {
    // Фильтруем только города с координатами
    const citiesWithCoords = cities.filter(c => c.lat && c.lon);
    if (citiesWithCoords.length === 0) {
        document.getElementById('resultSection').style.display = 'none';
        // Удаляем линии, если нет городов
        linesToCenter.forEach(line => map.removeLayer(line));
        linesToCenter = [];
        return;
    }
    
    // Проверяем, что карта инициализирована
    if (!map) {
        const firstCity = citiesWithCoords[0];
        initMap([firstCity.lat, firstCity.lon], 10);
        updateCityMarkers();
    }
    
    // Вычисляем среднюю точку всех городов с координатами
    const avgLocation = calculateAverageLocation(cities);
    
    if (!avgLocation) {
        return;
    }
    
    // Получаем информацию о средней точке
    let locationInfo = await reverseGeocode(avgLocation.lat, avgLocation.lon);
    
    // Проверяем, является ли это городом или населенным пунктом
    const isCity = locationInfo.city && 
                   locationInfo.city !== 'Ближайший город' && 
                   locationInfo.city !== 'Неизвестно';
    
    let resultLocation = {
        lat: avgLocation.lat,
        lon: avgLocation.lon,
        city: locationInfo.city,
        country: locationInfo.country,
        fullAddress: locationInfo.fullAddress
    };
    
    // Если это не город, ищем ближайший населенный пункт
    if (!isCity) {
        const nearestSettlement = await findNearestSettlement(avgLocation.lat, avgLocation.lon);
        resultLocation = {
            lat: nearestSettlement.lat,
            lon: nearestSettlement.lon,
            city: nearestSettlement.city,
            country: nearestSettlement.country,
            fullAddress: nearestSettlement.fullAddress
        };
    }
    
    // Отображаем результат
    document.getElementById('resultCity').textContent = resultLocation.city;
    document.getElementById('resultCountry').textContent = resultLocation.country;
    document.getElementById('resultSection').style.display = 'block';
    
    // Удаляем предыдущие маркеры
    markers.forEach(marker => {
        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    markers = [];
    
    // Добавляем маркер центральной точки (синий)
    const centerMarker = L.marker([avgLocation.lat, avgLocation.lon], {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34]
        })
    })
    .addTo(map)
    .bindPopup(`<b>Центральная точка</b><br>${avgLocation.lat.toFixed(6)}, ${avgLocation.lon.toFixed(6)}`);
    
    markers.push(centerMarker);
    
    // Добавляем маркер ближайшего населенного пункта (красный)
    const nearestMarker = L.marker([resultLocation.lat, resultLocation.lon], {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34]
        })
    })
    .addTo(map)
    .bindPopup(`<b>Ближайший населенный пункт</b><br>${resultLocation.city}, ${resultLocation.country}<br>${resultLocation.fullAddress}`);
    
    markers.push(nearestMarker);
    
    // Обновляем линии от городов до центральной точки
    updateLinesToCenter(avgLocation.lat, avgLocation.lon);
    
    // Обновляем границы карты для показа всех точек
    const allMarkers = [...cityMarkers, ...markers];
    const group = new L.featureGroup(allMarkers);
    map.fitBounds(group.getBounds().pad(0.1));
    
    // Сохраняем результат и все данные в кэш
    saveAllData();
}

// Очистка всех данных
async function clearAll() {
    cities = [];
    cityMarkers.forEach(marker => map.removeLayer(marker));
    cityMarkers = [];
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    linesToCenter.forEach(line => map.removeLayer(line));
    linesToCenter = [];
    
    await renderCitiesList();
    document.getElementById('resultSection').style.display = 'none';
    document.getElementById('cityInput').value = '';
    
    initMap();
    
    // Очищаем весь кэш
    Object.values(CACHE_KEYS).forEach(key => {
        removeFromCache(key);
    });
    removeFromCache('mapApp_reverseGeocodeCache');
    geocodeCache = {};
    reverseGeocodeCache = {};
}

// Загрузка сохраненных данных
async function loadSavedData() {
    // Загружаем все данные из кэша
    const mapState = loadAllData();
    
    // Фильтруем города без координат (не сохраняем города в процессе загрузки)
    cities = cities.filter(c => c.lat && c.lon);
    
    // Загружаем города
    if (cities.length > 0) {
        await renderCitiesList();
        
        // Инициализируем карту с сохраненным состоянием или первым городом
        if (mapState) {
            initMap(mapState.center, mapState.zoom);
        } else if (cities.length > 0) {
            const firstCity = cities[0];
            if (firstCity.lat && firstCity.lon) {
                initMap([firstCity.lat, firstCity.lon], 10);
            }
        }
        
        updateCityMarkers();
        
        // Загружаем сохраненный результат
        const savedResult = loadFromCache(CACHE_KEYS.RESULT);
        if (savedResult) {
            document.getElementById('resultCity').textContent = savedResult.city;
            document.getElementById('resultCountry').textContent = savedResult.country;
            document.getElementById('resultSection').style.display = 'block';
        } else {
            // Если результата нет, пересчитываем
            await calculateAverage();
        }
        
        // Обновляем границы карты
        if (cityMarkers.length > 0) {
            updateMapBounds();
        }
    } else if (mapState) {
        // Если есть сохраненное состояние карты, но нет городов
        initMap(mapState.center, mapState.zoom);
    }
}

// Обработчики событий
document.addEventListener('DOMContentLoaded', async () => {
    // Инициализация карты
    initMap();
    
    // Загружаем сохраненные данные
    await loadSavedData();
    
    // Сохраняем состояние карты при изменении
    if (map) {
        map.on('moveend', () => {
            saveAllData();
        });
        map.on('zoomend', () => {
            saveAllData();
        });
    }
    
    // Панель всегда открыта
    const panelContent = document.getElementById('panelContent');
    panelContent.classList.add('visible');
    
    // Обработчик добавления города
    document.getElementById('addCityBtn').addEventListener('click', addCity);
    document.getElementById('cityInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addCity();
        }
    });
    
});

