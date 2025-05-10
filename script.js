// -----------------------------------------------------------------------------
// CONFIGURATION - VERIFY WEATHER_TIMEZONE IS SET
// -----------------------------------------------------------------------------
const GOOGLE_CLIENT_ID = '703738686639-q2esba52bj7636g0hu5lrelkv6nenb2u.apps.googleusercontent.com';
const WEATHER_LATITUDE = '39.4353';
const WEATHER_LONGITUDE = '-84.2030';
const WEATHER_UNITS = 'imperial'; // 'metric' for Celsius, 'imperial' for Fahrenheit
const WEATHER_TIMEZONE = 'America/New_York'; // Ensure this is correct for your location

// -----------------------------------------------------------------------------
// GLOBAL VARIABLES & CONSTANTS
// -----------------------------------------------------------------------------
const API_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';
let gapiClientInitialized = false;
let gisInitialized = false;
let googleTokenClient;

// DOM Elements
const clockElement = document.getElementById('clock');
const dateElement = document.getElementById('date');
const weatherIconElement = document.getElementById('weather-icon');
const temperatureElement = document.getElementById('temperature');
const weatherDetailsElement = document.getElementById('weather-details');
const calendarTitleElement = document.getElementById('calendar-title');
const calendarMessageElement = document.getElementById('calendar-message');
const calendarListElement = document.getElementById('calendar-list');
const quoteTextElement = document.getElementById('quote-text');
const quoteAuthorElement = document.getElementById('quote-author');
const userIconContainer = document.getElementById('userIconContainer');
const userIcon = document.getElementById('userIcon');
const settingsModal = document.getElementById('settingsModal');
const closeModalButton = document.getElementById('closeModalButton');
const googleSignInButtonContainer = document.getElementById('googleSignInButtonContainer');
const signOutButton = document.getElementById('signOutButton');
const refreshDataButton = document.getElementById('refreshDataButton');
const modalTitleElement = document.getElementById('modal-title');

const quotes = [
  { text: "The world is a book and those who do not travel read only one page.", author: "St. Augustine" },
  { text: "Adventure is worthwhile in itself.", author: "Amelia Earhart" },
  { text: "Not all those who wander are lost.", author: "J.R.R. Tolkien" },
  { text: "To travel is to live.", author: "Hans Christian Andersen" },
  { text: "Life is either a daring adventure or nothing at all.", author: "Helen Keller" },
  { text: "The journey of a thousand miles begins with a single step.", author: "Lao Tzu" }
];
let currentQuoteIndex = 0;

// -----------------------------------------------------------------------------
// INITIALIZATION & EVENT LISTENERS
// -----------------------------------------------------------------------------
window.onload = () => {
  console.log("Pocket Magic Mirror Initializing (v4)...");
  updateClockAndDate();
  setInterval(updateClockAndDate, 1000);

  displayQuote();
  setInterval(displayQuote, 30000);

  userIconContainer.addEventListener('click', openSettingsModal);
  closeModalButton.addEventListener('click', closeSettingsModal);
  settingsModal.addEventListener('click', (event) => {
    if (event.target === settingsModal) closeSettingsModal();
  });
  signOutButton.addEventListener('click', handleSignOut);
  refreshDataButton.addEventListener('click', refreshAllData);

  fetchWeather(); // Fetch weather on load
};

// --- Google API & Identity Services Load Callbacks ---
function gapiLoaded() {
  console.log("GAPI script loaded. Initializing GAPI client...");
  gapi.load('client', initializeGapiClient);
}

function gisLoaded() {
  console.log("GIS script loaded. Initializing GIS...");
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    console.error("Google Identity Services (GIS) not fully available for gisLoaded callback.");
    return;
  }

  try {
    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: API_SCOPES,
      callback: tokenResponseCallback,
    });

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
    });

    gisInitialized = true;
    console.log("Google Identity Services (GIS) fully initialized.");
    renderSignInButton();
    checkAuthAndLoadData();
  } catch (e) {
    console.error("Error during GIS initialization in gisLoaded:", e);
  }
}

async function initializeGapiClient() {
  try {
    await gapi.client.init({
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
    });
    gapiClientInitialized = true;
    console.log("GAPI client initialized.");
    checkAuthAndLoadData();
  } catch (error) {
    console.error("Error initializing GAPI client:", error);
    calendarMessageElement.textContent = 'Error setting up Google services.';
  }
}

function checkAuthAndLoadData() {
  if (gapiClientInitialized && gisInitialized) {
    console.log("GAPI and GIS ready. Checking auth status.");
    const storedTokenString = localStorage.getItem('google_auth_token');
    if (storedTokenString) {
      try {
        const tokenData = JSON.parse(storedTokenString);
        if (tokenData && tokenData.access_token) {
          gapi.client.setToken({ access_token: tokenData.access_token });
          console.log("Using stored access token.");
          updateUIAfterSignIn();
          fetchCalendarEvents();
        } else {
          localStorage.removeItem('google_auth_token');
          updateUIAfterSignOut();
          loadCalendarFromCache();
        }
      } catch (e) {
        localStorage.removeItem('google_auth_token');
        updateUIAfterSignOut();
        loadCalendarFromCache();
      }
    } else {
      updateUIAfterSignOut();
      loadCalendarFromCache();
    }
  }
}

function renderSignInButton() {
  if (!googleSignInButtonContainer || !gisInitialized) return;
  googleSignInButtonContainer.innerHTML = '';
  try {
    google.accounts.id.renderButton(
      googleSignInButtonContainer,
      { theme: "outline", size: "large", type: "standard", text: "signin_with" }
    );
  } catch (e) {
    console.error("Error rendering Google Sign-In button:", e);
  }
}

// -----------------------------------------------------------------------------
// AUTHENTICATION
// -----------------------------------------------------------------------------
function handleCredentialResponse(response) {
  console.log("Google Sign-In ID Token received via button:", response.credential ? "Yes" : "No");
  if (response.credential && googleTokenClient) {
    googleTokenClient.requestAccessToken({ prompt: '' });
  } else if (!googleTokenClient) {
    console.error("Google Token Client not initialized when ID token received.");
  }
}

function tokenResponseCallback(tokenResponse) {
  if (tokenResponse.error) {
    console.error("Error getting access token:", tokenResponse.error, tokenResponse);
    return;
  }
  if (tokenResponse.access_token) {
    console.log("Access Token obtained successfully via token client.");
    gapi.client.setToken({ access_token: tokenResponse.access_token });
    localStorage.setItem('google_auth_token', JSON.stringify({
      access_token: tokenResponse.access_token,
    }));
    updateUIAfterSignIn();
    fetchCalendarEvents();
    closeSettingsModal();
  }
}

function handleSignOut() {
  const token = gapi.client && gapi.client.getToken ? gapi.client.getToken() : null;
  if (token && token.access_token) {
    google.accounts.oauth2.revoke(token.access_token, () => {
      if (gapi.client) gapi.client.setToken(null);
      localStorage.removeItem('google_auth_token');
      updateUIAfterSignOut();
      closeSettingsModal();
      console.log('Access token revoked from Google and user signed out.');
    });
  } else {
    if (gapi.client) gapi.client.setToken(null);
    localStorage.removeItem('google_auth_token');
    updateUIAfterSignOut();
    closeSettingsModal();
    console.log("Signed out locally (no active token to revoke).");
  }
}

function updateUIAfterSignIn() {
  userIcon.classList.add('signed-in');
  if (googleSignInButtonContainer && googleSignInButtonContainer.firstChild) {
    googleSignInButtonContainer.firstChild.style.display = 'none';
  }
  signOutButton.style.display = 'block';
  modalTitleElement.textContent = "Account";
}

function updateUIAfterSignOut() {
  userIcon.classList.remove('signed-in');
  calendarListElement.innerHTML = '';
  calendarMessageElement.textContent = 'Sign in to see your schedule.';
  calendarMessageElement.style.display = 'block';
  calendarTitleElement.textContent = "Calendar"; // Reset title
  signOutButton.style.display = 'none';
  if (gisInitialized && googleSignInButtonContainer && !googleSignInButtonContainer.hasChildNodes()) {
    renderSignInButton();
  } else if (googleSignInButtonContainer && googleSignInButtonContainer.firstChild) {
    googleSignInButtonContainer.firstChild.style.display = 'block';
  }
  modalTitleElement.textContent = "Options";
}

// -----------------------------------------------------------------------------
// CLOCK & DATE
// -----------------------------------------------------------------------------
function updateClockAndDate() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  clockElement.textContent = `${String(displayHours)}:${String(minutes).padStart(2, '0')} ${ampm}`;
  const options = { weekday: 'long', month: 'long', day: 'numeric' };
  dateElement.textContent = now.toLocaleDateString(undefined, options);
}

// -----------------------------------------------------------------------------
// QUOTES
// -----------------------------------------------------------------------------
function displayQuote() {
  quoteTextElement.classList.add('fade');
  quoteAuthorElement.classList.add('fade');
  setTimeout(() => {
    currentQuoteIndex = (currentQuoteIndex + 1) % quotes.length;
    const currentQuote = quotes[currentQuoteIndex];
    quoteTextElement.textContent = `"${currentQuote.text}"`;
    quoteAuthorElement.textContent = currentQuote.author ? `- ${currentQuote.author}` : "";
    quoteTextElement.classList.remove('fade');
    quoteAuthorElement.classList.remove('fade');
  }, 750);
}

// -----------------------------------------------------------------------------
// WEATHER
// -----------------------------------------------------------------------------
async function fetchWeather() {
  if (!WEATHER_TIMEZONE) {
    console.error("WEATHER_TIMEZONE is not defined in configuration!");
    displayWeatherError("Weather timezone not configured.");
    return;
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LATITUDE}&longitude=${WEATHER_LONGITUDE}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=${WEATHER_UNITS === 'imperial' ? 'fahrenheit' : 'celsius'}&timezone=${encodeURIComponent(WEATHER_TIMEZONE)}`;
  console.log("Fetching weather from URL:", url);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      let errorBodyText = `HTTP error! status: ${response.status}`;
      if (response.status === 400) {
        try {
          const errorJson = await response.json();
          errorBodyText += ` - Reason: ${errorJson.reason || JSON.stringify(errorJson)}`;
        } catch (e) { /* ignore */ }
      }
      throw new Error(errorBodyText);
    }
    const data = await response.json();
    console.log("Weather data received:", data);
    displayWeather(data);
  } catch (error) {
    console.error("Error fetching weather from Open-Meteo:", error);
    displayWeatherError(error.message || "Could not fetch weather");
  }
}

function displayWeather(data) {
  if (!data || !data.current || data.current.temperature_2m === undefined || data.current.weather_code === undefined || !data.daily || !data.daily.temperature_2m_max || !data.daily.temperature_2m_min) {
    console.error("Invalid weather data structure received:", data);
    displayWeatherError("Weather data format error.");
    return;
  }
  const currentTemp = data.current.temperature_2m;
  const currentWeatherCode = data.current.weather_code;
  const dailyMax = data.daily.temperature_2m_max[0];
  const dailyMin = data.daily.temperature_2m_min[0];

  temperatureElement.textContent = `${Math.round(currentTemp)}°${WEATHER_UNITS === 'imperial' ? 'F' : 'C'}`;
  const description = getWeatherDescription(currentWeatherCode);
  let details = `${description}`;
  if (dailyMax !== undefined && dailyMin !== undefined) {
    details += ` (H: ${Math.round(dailyMax)}° L: ${Math.round(dailyMin)}°)`;
  }
  weatherDetailsElement.textContent = details;
  weatherIconElement.className = `fas ${getOpenMeteoIconClass(currentWeatherCode)} weather-icon-fa`;
}

function displayWeatherError(message) {
  temperatureElement.textContent = "--°";
  weatherDetailsElement.textContent = `Weather: ${message}`;
  weatherIconElement.className = 'fas fa-exclamation-circle weather-icon-fa';
}

function getOpenMeteoIconClass(code) {
  const map = { /* Map remains the same */
    0: 'fa-sun', 1: 'fa-cloud-sun', 2: 'fa-cloud', 3: 'fa-cloud-meatball',
    45: 'fa-smog', 48: 'fa-smog', 51: 'fa-cloud-rain', 53: 'fa-cloud-rain',
    55: 'fa-cloud-showers-heavy', 56: 'fa-cloud-rain', 57: 'fa-cloud-showers-heavy',
    61: 'fa-cloud-rain', 63: 'fa-cloud-rain', 65: 'fa-cloud-showers-heavy',
    66: 'fa-cloud-rain', 67: 'fa-cloud-showers-heavy', 71: 'fa-snowflake',
    73: 'fa-snowflake', 75: 'fa-snowflake',
    77: 'fa-snowflake', 80: 'fa-cloud-sun-rain', 81: 'fa-cloud-rain', 82: 'fa-cloud-showers-heavy',
    85: 'fa-snowflake', 86: 'fa-snowflake', 95: 'fa-bolt',
    96: 'fa-bolt-lightning', 99: 'fa-bolt-lightning',
  };
  return map[code] || 'fa-question-circle';
}

function getWeatherDescription(code) {
  const descriptions = { /* Descriptions remain the same */
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
    56: 'Light freezing drizzle', 57: 'Dense freezing drizzle', 61: 'Slight rain', 63: 'Rain', 65: 'Heavy rain',
    66: 'Light freezing rain', 67: 'Heavy freezing rain', 71: 'Slight snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Slight rain showers', 81: 'Rain showers', 82: 'Violent rain showers',
    85: 'Slight snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
  };
  return descriptions[code] || 'Unknown';
}

// -----------------------------------------------------------------------------
// GOOGLE CALENDAR
// -----------------------------------------------------------------------------
async function fetchCalendarEvents() {
  if (!gapiClientInitialized || !gapi.client || !gapi.client.getToken()) {
    if (!loadCalendarFromCache()) {
      calendarMessageElement.textContent = 'Sign in to load calendar.';
      calendarMessageElement.style.display = 'block';
      calendarListElement.innerHTML = '';
      calendarTitleElement.textContent = "Calendar";
    }
    return;
  }
  calendarMessageElement.textContent = 'Loading calendar events...';
  calendarMessageElement.style.display = 'block';
  calendarListElement.innerHTML = '';

  try {
    const now = new Date();
    // Fetch events for the next 7 days to have a good pool for "Upcoming"
    const timeMax = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));

    const response = await gapi.client.calendar.events.list({
      'calendarId': 'primary',
      'timeMin': now.toISOString(), // Show events starting from now
      'timeMax': timeMax.toISOString(),
      'showDeleted': false,
      'singleEvents': true,
      'maxResults': 10, // Fetch a bit more to ensure we can find some upcoming
      'orderBy': 'startTime'
    });

    const events = response.result.items;
    localStorage.setItem('calendar_events_cache', JSON.stringify(events));
    displayCalendarEvents(events);

  } catch (error) {
    console.error("Error fetching calendar events:", error);
    let errorMsg = 'Error loading calendar.';
    if (error.result && error.result.error) {
      errorMsg += ` (Code: ${error.result.error.code}, Message: ${error.result.error.message})`;
    }
    calendarMessageElement.textContent = errorMsg;
    if (error.result && (error.result.error.code === 401 || error.result.error.code === 403)) {
      handleSignOut();
    } else {
      loadCalendarFromCache();
    }
  }
}

function loadCalendarFromCache() {
  const cachedEventsJson = localStorage.getItem('calendar_events_cache');
  if (cachedEventsJson) {
    try {
      const cachedEvents = JSON.parse(cachedEventsJson);
      displayCalendarEvents(cachedEvents, true);
      return true;
    } catch (e) {
      localStorage.removeItem('calendar_events_cache');
      displayCalendarEvents([], true); // Show "no cached events"
      return false;
    }
  }
  displayCalendarEvents([], true); // Show "no cached events"
  return false;
}

function displayCalendarEvents(events, fromCache = false) {
  calendarListElement.innerHTML = '';
  calendarMessageElement.style.display = 'none';

  const now = new Date();
  const todayDateString = now.toDateString();
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrowDateString = tomorrowDate.toDateString();

  let eventsToDisplay = [];
  let finalTitle = "Upcoming Events"; // Default title if no events or only future events

  if (events && events.length > 0) {
    const todayEvents = events.filter(event => {
      const eventStartDate = new Date(event.start.dateTime || event.start.date);
      // API's timeMin: now.toISOString() should already filter out past timed events.
      // This filter is mainly to get events for the current calendar day.
      return eventStartDate.toDateString() === todayDateString;
    });

    if (todayEvents.length > 0) {
      finalTitle = "Today's Events";
      // For "Today's Events", show all events of today that haven't fully passed.
      // The API query with `timeMin: now.toISOString()` and `singleEvents: true` handles this well.
      // If an all-day event is ongoing, it will be included.
      // If a timed event started earlier today but ends after `now`, it's included.
      eventsToDisplay = todayEvents;
    } else {
      // No events for today (or all today's events have passed), show up to 3 upcoming
      finalTitle = "Upcoming Events";
      // `events` is already sorted by startTime and filtered by `timeMin: now.toISOString()`
      eventsToDisplay = events.slice(0, 3);
    }
  }

  calendarTitleElement.textContent = finalTitle;

  if (eventsToDisplay.length === 0) {
    // This block handles cases where:
    // 1. `events` array was initially empty.
    // 2. `events` had items, but `todayEvents` was empty, AND `events.slice(0,3)` also resulted in an empty list
    //    (e.g., all fetched events were for "today" but filtered out by a stricter check, or some other edge case).
    let message = "";
    if (fromCache) {
      message = (events && events.length > 0) ? 'No relevant cached events.' : 'No cached events.';
    } else {
      message = (events && events.length > 0) ? 'No relevant upcoming events.' : 'No upcoming events.';
    }
    calendarMessageElement.textContent = message;
    calendarMessageElement.style.display = 'block';
  } else {
    eventsToDisplay.forEach(event => {
      const start = event.start.dateTime || event.start.date;
      const eventDate = new Date(start);
      let timeString = '';

      if (finalTitle === "Today's Events") {
        // For "Today's Events", only show time or "All Day"
        if (event.start.dateTime) { // Event with a specific time
          timeString = eventDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        } else { // All-day event
          timeString = 'All Day';
        }
      } else { // Mode is "Upcoming Events"
        let datePrefix = '';
        if (eventDate.toDateString() === todayDateString) {
          datePrefix = "Today"; // e.g. "Today, All Day" or "Today, 7:00 PM"
        } else if (eventDate.toDateString() === tomorrowDateString) {
          datePrefix = "Tomorrow";
        } else {
          // For other dates, show a short version like "Fri, Oct 27"
          datePrefix = eventDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        }

        let timePart = event.start.dateTime ? eventDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'All Day';
        timeString = `${datePrefix}, ${timePart}`;
      }

      const li = document.createElement('li');
      const timeSpan = document.createElement('span');
      timeSpan.className = 'event-time';
      timeSpan.textContent = timeString;
      li.appendChild(timeSpan);
      li.appendChild(document.createTextNode(` ${event.summary || '(No Title)'}`));
      calendarListElement.appendChild(li);
    });
  }

  if (fromCache && eventsToDisplay.length > 0) { // Only add cache info if events are actually displayed from cache
    const cacheInfo = document.createElement('li');
    cacheInfo.textContent = "(Showing cached data)";
    cacheInfo.style.fontStyle = "italic";
    cacheInfo.style.fontSize = "0.9em";
    cacheInfo.style.opacity = "0.7";
    cacheInfo.style.paddingLeft = "0";
    cacheInfo.style.backgroundColor = "transparent";
    calendarListElement.appendChild(cacheInfo);
  }
}


// -----------------------------------------------------------------------------
// MODAL & REFRESH
// -----------------------------------------------------------------------------
function openSettingsModal() {
  settingsModal.classList.add('visible');
  const isSignedIn = gapiClientInitialized && gapi.client && gapi.client.getToken();
  if (isSignedIn) {
    if (googleSignInButtonContainer && googleSignInButtonContainer.firstChild) googleSignInButtonContainer.firstChild.style.display = 'none';
    signOutButton.style.display = 'block';
    modalTitleElement.textContent = "Account";
  } else {
    signOutButton.style.display = 'none';
    if (gisInitialized && googleSignInButtonContainer && !googleSignInButtonContainer.hasChildNodes()) renderSignInButton();
    else if (googleSignInButtonContainer && googleSignInButtonContainer.firstChild) googleSignInButtonContainer.firstChild.style.display = 'block';
    modalTitleElement.textContent = "Options";
  }
}
function closeSettingsModal() { settingsModal.classList.remove('visible'); }

function refreshAllData() {
  console.log("Refreshing all data...");
  fetchWeather();
  if (gapiClientInitialized && gapi.client && gapi.client.getToken()) {
    fetchCalendarEvents();
  } else if (!loadCalendarFromCache()) {
    // loadCalendarFromCache already calls displayCalendarEvents which handles titles/messages
    // If further specific action needed:
    // calendarMessageElement.textContent = 'Sign in to see your schedule.';
    // calendarListElement.innerHTML = '';
    // calendarTitleElement.textContent = "Calendar";
  }
  closeSettingsModal();
}

window.addEventListener('online', () => { console.log("Device online. Refreshing."); refreshAllData(); });
window.addEventListener('offline', () => {
  console.log("Device offline. Using cache.");
  if (!loadCalendarFromCache()) {
    // loadCalendarFromCache handles displaying appropriate "no cache" messages and titles.
    // If more specific offline messages are needed:
    // if (!gapiClientInitialized || !gapi.client || !gapi.client.getToken()) {
    //   calendarMessageElement.textContent = 'Offline. Sign in when online for calendar.';
    // } else {
    //   calendarMessageElement.textContent = 'Offline. No cached calendar events.';
    // }
    // calendarTitleElement.textContent = "Calendar";
    // calendarListElement.innerHTML = '';
  }
});
