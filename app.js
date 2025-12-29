// Состояние приложения
let cities = []; // Массив всех вхождений городов (разрешаем дубликаты)
let map = null;
let markers = [];
let cityMarkers = []; // Массив маркеров городов, каждый маркер связан с индексом в cities

// Работа с cookies
function setCookie(name, value, days = 365) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) {
            try {
                return JSON.parse(decodeURIComponent(c.substring(nameEQ.length, c.length)));
            } catch (e) {
                return null;
            }
        }
    }
    return null;
}

// Сохранение городов в cookies
function saveCitiesToCookie() {
    setCookie('cities', cities);
}

// Загрузка городов из cookies
function loadCitiesFromCookie() {
    const savedCities = getCookie('cities');
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
            return {
                name: cityName,
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon),
                displayName: data[0].display_name
            };
        } else {
            throw new Error('Город не найден');
        }
    } catch (error) {
        throw new Error(`Ошибка при поиске города: ${error.message}`);
    }
}

// Reverse geocoding (преобразование координат в адрес)
async function reverseGeocode(lat, lon) {
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
        
        if (data && data.address) {
            const address = data.address;
            const city = address.city || address.town || address.village || address.municipality;
            
            // Если город неизвестный, ищем ближайший город
            if (!city || city === 'Неизвестно') {
                return await findNearestCityName(lat, lon);
            }
            
            return {
                city: city,
                country: address.country || 'Неизвестно',
                fullAddress: data.display_name
            };
        } else {
            return await findNearestCityName(lat, lon);
        }
    } catch (error) {
        return await findNearestCityName(lat, lon);
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

// Вычисление средней точки
function calculateAverageLocation(cities) {
    if (cities.length === 0) return null;
    
    let sumLat = 0;
    let sumLon = 0;
    
    cities.forEach(city => {
        sumLat += city.lat;
        sumLon += city.lon;
    });
    
    return {
        lat: sumLat / cities.length,
        lon: sumLon / cities.length
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

// Добавление города
async function addCity(cityNameToAdd = null) {
    const input = document.getElementById('cityInput');
    const cityName = cityNameToAdd || input.value.trim();
    
    if (!cityName) {
        showError('Введите название города');
        return;
    }
    
    showLoading();
    
    try {
        const city = await geocodeCity(cityName);
        cities.push(city);
        
        // Очистка сообщения "пусто"
        const citiesList = document.getElementById('citiesList');
        const emptyMsg = citiesList.querySelector('.empty-message');
        if (emptyMsg) {
            emptyMsg.remove();
        }
        
        renderCitiesList();
        
        // Если это первый город, показываем карту сразу
        if (cities.length === 1) {
            initMap([city.lat, city.lon], 10);
        }
        
        // Обновляем все маркеры городов
        updateCityMarkers();
        
        // Обновляем границы карты
        if (cities.length > 0) {
            updateMapBounds();
        }
        
        if (!cityNameToAdd) {
            input.value = '';
        }
        
        // Автоматически рассчитываем среднюю точку
        if (cities.length >= 1) {
            await calculateAverage();
        }
        
        // Сохраняем в cookies
        saveCitiesToCookie();
        
        if (!cityNameToAdd) {
            showSuccess(`Город "${cityName}" добавлен`);
        }
    } catch (error) {
        showError(error.message);
    } finally {
        hideLoading();
    }
}

// Обновление всех маркеров городов на карте
function updateCityMarkers() {
    // Удаляем все существующие маркеры
    cityMarkers.forEach(marker => map.removeLayer(marker));
    cityMarkers = [];
    
    // Создаем новые маркеры для всех городов
    cities.forEach(city => {
        const marker = L.marker([city.lat, city.lon])
            .addTo(map)
            .bindPopup(`<b>${city.name}</b><br>${city.displayName}`);
        cityMarkers.push(marker);
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
function renderCitiesList() {
    const citiesList = document.getElementById('citiesList');
    
    if (cities.length === 0) {
        citiesList.innerHTML = '<p class="empty-message">Добавьте города для определения ближайшего</p>';
        return;
    }
    
    const stats = getCityStats();
    
    citiesList.innerHTML = stats.map((stat, index) => `
        <div class="city-item">
            <div>
                <span class="city-name">${stat.name}</span>
                ${stat.count > 1 ? `<span class="city-count">×${stat.count}</span>` : ''}
                <span class="city-coords">(${stat.city.lat.toFixed(4)}, ${stat.city.lon.toFixed(4)})</span>
            </div>
            <div class="city-actions">
                <button class="add-more-btn" onclick="addCityAgain('${stat.name}')" title="Добавить еще раз">+</button>
                <button class="remove-btn" onclick="removeCityByName('${stat.name}')">Удалить</button>
            </div>
        </div>
    `).join('');
}

// Добавление того же города еще раз
async function addCityAgain(cityName) {
    await addCity(cityName);
}

// Удаление города по имени (удаляет одно вхождение)
function removeCityByName(cityName) {
    const index = cities.findIndex(c => c.name.toLowerCase() === cityName.toLowerCase());
    if (index === -1) return;
    
    // Удаляем город из массива
    cities.splice(index, 1);
    
    renderCitiesList();
    
    // Обновляем все маркеры городов
    if (cities.length > 0) {
        updateCityMarkers();
    } else {
        // Если городов не осталось, возвращаем карту к начальному виду
        cityMarkers.forEach(marker => map.removeLayer(marker));
        cityMarkers = [];
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
    if (cities.length === 0) {
        document.getElementById('resultSection').style.display = 'none';
        return;
    }
    
    // Если только один город, показываем его как результат
    if (cities.length === 1) {
        const city = cities[0];
        document.getElementById('resultCity').textContent = city.name;
        document.getElementById('resultCountry').textContent = 'Загрузка...';
        document.getElementById('resultCoords').textContent = `${city.lat.toFixed(6)}, ${city.lon.toFixed(6)}`;
        document.getElementById('resultSection').style.display = 'block';
        
        // Получаем информацию о стране
        const locationInfo = await reverseGeocode(city.lat, city.lon);
        document.getElementById('resultCountry').textContent = locationInfo.country;
        
        // Удаляем предыдущие маркеры
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];
        
        // Добавляем маркер ближайшего города
        const nearestMarker = L.marker([city.lat, city.lon], {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34]
            })
        })
        .addTo(map)
        .bindPopup(`<b>Ближайший город</b><br>${locationInfo.city}, ${locationInfo.country}<br>${locationInfo.fullAddress}`);
        
        markers.push(nearestMarker);
        return;
    }
    
    try {
        // Вычисляем среднюю точку
        const avgLocation = calculateAverageLocation(cities);
        
        // Находим ближайший город к средней точке
        const nearestCity = findNearestCity(avgLocation, cities);
        
        // Получаем информацию о ближайшем городе
        const locationInfo = await reverseGeocode(nearestCity.lat, nearestCity.lon);
        
        // Отображаем результат
        document.getElementById('resultCity').textContent = locationInfo.city;
        document.getElementById('resultCountry').textContent = locationInfo.country;
        document.getElementById('resultCoords').textContent = `${nearestCity.lat.toFixed(6)}, ${nearestCity.lon.toFixed(6)}`;
        document.getElementById('resultSection').style.display = 'block';
        
        // Удаляем предыдущие маркеры
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];
        
        // Добавляем маркер ближайшего города
        const nearestMarker = L.marker([nearestCity.lat, nearestCity.lon], {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34]
            })
        })
        .addTo(map)
        .bindPopup(`<b>Ближайший город</b><br>${locationInfo.city}, ${locationInfo.country}<br>${locationInfo.fullAddress}`);
        
        markers.push(nearestMarker);
        
        // Обновляем границы карты для показа всех точек
        const allMarkers = [...cityMarkers, nearestMarker];
        const group = new L.featureGroup(allMarkers);
        map.fitBounds(group.getBounds().pad(0.1));
    } catch (error) {
        console.error('Ошибка при расчете:', error);
    }
}

// Очистка всех данных
function clearAll() {
    cities = [];
    cityMarkers.forEach(marker => map.removeLayer(marker));
    cityMarkers = [];
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    renderCitiesList();
    document.getElementById('resultSection').style.display = 'none';
    document.getElementById('cityInput').value = '';
    
    initMap();
    
    // Очищаем cookies
    setCookie('cities', []);
}

// Загрузка сохраненных данных
async function loadSavedData() {
    const savedCities = loadCitiesFromCookie();
    if (savedCities && savedCities.length > 0) {
        cities = savedCities;
        renderCitiesList();
        
        // Инициализируем карту с первым городом
        if (cities.length > 0) {
            const firstCity = cities[0];
            initMap([firstCity.lat, firstCity.lon], 10);
            updateCityMarkers();
            await calculateAverage();
        }
    }
}

// Обработчики событий
document.addEventListener('DOMContentLoaded', async () => {
    // Инициализация карты
    initMap();
    
    // Загружаем сохраненные данные
    await loadSavedData();
    
    // Обработчик добавления города
    document.getElementById('addCityBtn').addEventListener('click', addCity);
    document.getElementById('cityInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addCity();
        }
    });
    
    // Обработчик очистки
    document.getElementById('clearBtn').addEventListener('click', clearAll);
});

