// ===================== UTILITIES =====================
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function log1p(n) {
  return Math.log(1 + Math.max(0, n));
}

function formatDistance(meters) {
  if (!meters && meters !== 0) return "";
  if (meters >= 1000) return (meters / 1000).toFixed(1) + " km";
  return Math.round(meters) + " m";
}

function getSafe(obj, path, def = "") {
  try {
    return path.split(".").reduce((o, k) => (o || {})[k], obj) ?? def;
  } catch {
    return def;
  }
}

// Haversine: distanza in metri
function distanceMeters(fromLatLng, toLocation) {
  try {
    if (!fromLatLng || !toLocation) return 0;
    const R = 6371000;
    const lat1 = fromLatLng.lat();
    const lon1 = fromLatLng.lng();
    const lat2 = (typeof toLocation.lat === "function") ? toLocation.lat() : toLocation.lat;
    const lon2 = (typeof toLocation.lng === "function") ? toLocation.lng() : toLocation.lng;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
              Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  } catch {
    return 0;
  }
}

// Punteggio composito: rating (forte), recensioni (attenuate), distanza (penalità)
function scorePlace({ rating = 0, total = 0, distanceM = 0 }) {
  const distKm = distanceM / 1000;
  return rating * 20 + log1p(total) * 3 - distKm * 1.2;
}

// ===================== DOM SHORTCUTS =====================
const inputEl = document.getElementById("place-input");
const noResultsEl = document.getElementById("no-results");
const placeCardEl = document.getElementById("place-card");
const placeNameEl = document.getElementById("place-name");
const placeAddrEl = document.getElementById("place-address");
const placeRatingEl = document.getElementById("place-rating");
const reviewsDiv = document.getElementById("reviews-list");

// Autocomplete dropdown
const acContainer = document.createElement("div");
acContainer.className = "autocomplete-results hidden";
inputEl.parentElement.appendChild(acContainer);

// ===================== GOOGLE PLACES SETUP =====================
let mapDummy = null;
let placesService = null;
let autocompleteService = null;

window.initApp = function initApp() {
  const dummy = document.createElement("div");
  dummy.style.display = "none";
  document.body.appendChild(dummy);
  mapDummy = new google.maps.Map(dummy);

  placesService = new google.maps.places.PlacesService(mapDummy);
  autocompleteService = new google.maps.places.AutocompleteService();

  attachInputEvents();

  // NON mostrare alcuna card iniziale
  noResultsEl.classList.add("hidden");
  placeCardEl.classList.add("hidden");
};

// ===================== AUTOCOMPLETE =====================
let debounceTimer = null;

function attachInputEvents() {
  inputEl.addEventListener("input", () => {
    const q = (inputEl.value || "").trim();
    if (q.length < 3) {
      acContainer.innerHTML = "";
      acContainer.classList.add("hidden");
      // nascondi messaggi e card quando l'input è breve
      noResultsEl.classList.add("hidden");
      placeCardEl.classList.add("hidden");
      return;
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => showPredictions(q), 220);
  });

  inputEl.addEventListener("focus", () => {
    if (acContainer.innerHTML) acContainer.classList.remove("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!acContainer.contains(e.target) && e.target !== inputEl) {
      acContainer.classList.add("hidden");
    }
  });

  // UX placeholder (opzionale)
  const ph = inputEl.getAttribute("placeholder") || "";
  inputEl.addEventListener("focus", () => inputEl.setAttribute("placeholder",""));
  inputEl.addEventListener("blur", () => { if (!inputEl.value) inputEl.setAttribute("placeholder", ph); });
}

function showPredictions(query) {
  autocompleteService.getPlacePredictions(
    { input: query, language: "en", types: ["establishment"] },
    (preds, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !preds || !preds.length) {
        acContainer.innerHTML = "<div class='autocomplete-item muted'>No results found</div>";
        acContainer.classList.remove("hidden");
        return;
      }
      acContainer.innerHTML = "";
      preds.slice(0, 6).forEach(p => {
        const el = document.createElement("div");
        el.className = "autocomplete-item";
        const main = escapeHtml(getSafe(p, "structured_formatting.main_text", ""));
        const sec  = escapeHtml(getSafe(p, "structured_formatting.secondary_text", ""));
        el.innerHTML = `<strong>${main}</strong><div style="font-size:.9rem;color:rgba(255,255,255,.8)">${sec}</div>`;
        
        // 🔥 versione aggiornata
        el.addEventListener("click", () => {
          // Mostra dettagli business
          fetchPlaceDetails(p.place_id);

          // Effetto “app-like”: chiude e pulisce la barra di ricerca dopo un breve delay
          acContainer.classList.add("hidden");
          setTimeout(() => {
            inputEl.value = "";      // svuota la barra
            inputEl.blur();          // chiude tastiera su mobile
          }, 300);
        });

        acContainer.appendChild(el);
      });
      acContainer.classList.remove("hidden");
    }
  );
}


// ===================== CATEGORY DETECTION =====================
// (lasciato identico per non rompere nulla)
const CATEGORY_MAP = [
  { test: /pizz|pizzeria/i,           type: "restaurant", keyword: "pizzeria" },
  { test: /trattor/i,                 type: "restaurant", keyword: "trattoria" },
  { test: /ristorant/i,               type: "restaurant", keyword: "" },
  { test: /osteria/i,                 type: "restaurant", keyword: "osteria" },
  { test: /sushi|giappo/i,            type: "restaurant", keyword: "sushi" },
  { test: /kebab/i,                   type: "restaurant", keyword: "kebab" },
  { test: /gelat|ice\s?cream/i,       type: "cafe",       keyword: "gelateria" },
  { test: /bar|pub/i,                 type: "bar",        keyword: "" },
  { test: /caff[eè]/i,                type: "cafe",       keyword: "" },
  { test: /panetter|forn|bakery/i,    type: "bakery",     keyword: "" },
  { test: /hotel|alberg|b&b|bnb/i,    type: "lodging",    keyword: "" },
  { test: /pasticc|pastry/i,          type: "bakery",     keyword: "pasticceria" },
  { test: /food|cucina|mangiare/i,    type: "restaurant", keyword: "" },
];

function detectCategory(queryText, placeTypes = []) {
  const q = (queryText || "").toLowerCase();
  for (const row of CATEGORY_MAP) {
    if (row.test.test(q)) return { type: row.type, keyword: row.keyword };
  }
  const t = (placeTypes || []).map(t => t.toLowerCase());
  if (t.includes("lodging"))     return { type: "lodging",    keyword: "" };
  if (t.includes("bar"))         return { type: "bar",        keyword: "" };
  if (t.includes("cafe"))        return { type: "cafe",       keyword: "" };
  if (t.includes("bakery"))      return { type: "bakery",     keyword: "" };
  if (t.includes("restaurant"))  return { type: "restaurant", keyword: "" };
  return { type: "restaurant", keyword: "" };
}

// ===================== PLACE DETAILS + RANKING =====================
function fetchPlaceDetails(placeId) {
  showMessage("Loading details...");
  placesService.getDetails(
    { placeId, fields: ["name","formatted_address","geometry","rating","user_ratings_total","types","place_id"] },
    (details, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !details) {
        showMessage("Could not load business details.");
        return;
      }
      showPlaceAndRank(details);
    }
  );
}

function showPlaceAndRank(details) {
  // header card
  noResultsEl.classList.add("hidden");
  placeCardEl.classList.remove("hidden");
  placeNameEl.textContent = getSafe(details,"name","Business");
  placeAddrEl.textContent = getSafe(details,"formatted_address","");
  const r = getSafe(details,"rating",null);
  const n = getSafe(details,"user_ratings_total",null);
  placeRatingEl.innerHTML = r ? `⭐ <strong>${escapeHtml(String(r))}</strong> ${n ? `· (${n} reviews)` : ""}` : "";

  // categoria per i vicini
  const { type, keyword } = detectCategory(inputEl.value, getSafe(details,"types",[]));

  // posizione / lista vicini
  buildRealRanking(details, { type, keyword });
}

function buildRealRanking(targetDetails, cat) {
  const location = getSafe(targetDetails, "geometry.location", null);
  if (!location) {
    renderRankingCard("—");
    renderNearbyPlaces([], 0);
    return;
  }
  const center = new google.maps.LatLng(location.lat(), location.lng());

  const nearbyReq = {
    location: center,
    radius: 2500,       // mantengo 2.5 km perché questa versione ti funzionava
    type: cat.type,
    language: "en"
  };
  if (cat.keyword) nearbyReq.keyword = cat.keyword;

  const textReq = {
    location: center,
    radius: 2500,
    query: cat.keyword ? `${cat.keyword} ${cat.type}` : cat.type,
    language: "en"
  };

  renderRankingCard("…");

  placesService.nearbySearch(nearbyReq, (res, st) => {
    if (st !== google.maps.places.PlacesServiceStatus.OK || !res || !res.length) {
      placesService.textSearch(textReq, (res2) => {
        finalizeRanking(targetDetails, center, res2 || []);
      });
    } else {
      finalizeRanking(targetDetails, center, res);
    }
  });
}

function finalizeRanking(targetDetails, center, rawList) {
  const mapped = (rawList || []).map(p => ({
    place_id: getSafe(p,"place_id",""),
    name: getSafe(p,"name",""),
    rating: getSafe(p,"rating",0),
    total: getSafe(p,"user_ratings_total",0),
    distanceM: distanceMeters(center, getSafe(p,"geometry.location",null))
  }));

  const target = {
    place_id: getSafe(targetDetails,"place_id",""),
    name: getSafe(targetDetails,"name",""),
    rating: getSafe(targetDetails,"rating",0),
    total: getSafe(targetDetails,"user_ratings_total",0),
    distanceM: 0
  };
  if (!mapped.some(m => m.place_id === target.place_id)) mapped.push(target);

  const withScore = mapped.map(m => ({ ...m, score: scorePlace(m) }));
  withScore.sort((a,b) => b.score - a.score);

  const idx = withScore.findIndex(x => x.place_id === target.place_id);
  const position = idx >= 0 ? idx + 1 : "—";

  renderRankingCard(position);
  const ahead = typeof position === "number" ? withScore.slice(0, Math.max(0, position - 1)) : [];
  renderNearbyPlaces(ahead.slice(0,7), position);
}

// ===================== RENDERING =====================
function renderRankingCard(position) {
  reviewsDiv.innerHTML = `
    <div class="ranking-card glass">
      <h3>📊 Estimated local position</h3>
      <p class="muted">Your current position in local search:</p>
      <div class="rank-number">${position}${typeof position === "number" ? "º" : ""}</div>
      <p class="muted">See who outranks you nearby:</p>
      <div id="nearby-list" style="margin-top:.6rem;"></div>

      <div style="display:flex;justify-content:center;margin-top:1.5rem;">
        <a 
          href="https://wa.me/393534907105?text=Hi%20👋%20I%20just%20checked%20my%20local%20ranking%20on%20Rankify%20and%20I%27d%20like%20to%20improve%20my%20visibility%20on%20Google.%20Can%20you%20help%3F"
          target="_blank"
          id="whatsappButton"
          class="whatsapp-btn pulse-mobile"
          style="
            background: linear-gradient(90deg, #25D366 0%, #1EBE5A 100%);
            color: white;
            font-weight: 600;
            padding: 0.9rem 1.8rem;
            border-radius: 50px;
            font-size: 1rem;
            box-shadow: 0 4px 14px rgba(0,0,0,0.25);
            text-decoration: none;
            transition: all 0.25s ease;
          "
          onmouseover="this.style.transform='scale(1.05)'"
          onmouseout="this.style.transform='scale(1)'"
        >
          💬 Improve my Google position
        </a>
      </div>
    </div>
  `;

  const whatsappBtn = document.getElementById("whatsappButton");
  if (whatsappBtn && navigator.vibrate) {
    whatsappBtn.addEventListener("click", () => navigator.vibrate(50));
  }
}

function renderNearbyPlaces(list, position) {
  const box = document.getElementById("nearby-list");
  if (!box) return;

  if (!list || list.length === 0) {
    box.innerHTML = `<p class="muted">We didn't find businesses outranking you nearby.</p>`;
    return;
  }

  let html = `<h4>🏆 Top competitors near you</h4>`;
  html += `<div style="display:flex;flex-direction:column;gap:.7rem;margin-top:.6rem;">`;
  list.forEach(item => {
    html += `
      <div class="service-card glass" style="padding:1rem;border-radius:12px;">
        <div style="font-weight:700;font-size:1.05rem;color:#fff">${escapeHtml(item.name)}</div>
        <div style="color:rgba(255,255,255,.85);font-size:.95rem;margin-top:.3rem;">
          <span style="color:gold;">⭐ ${item.rating.toFixed(1)}</span> · ${item.total} reviews · 📍 ${formatDistance(item.distanceM)}
        </div>
      </div>
    `;
  });
  html += `</div>`;
  box.innerHTML = html;
}

function showMessage(msg) {
  noResultsEl.classList.remove("hidden");
  placeCardEl.classList.add("hidden");
  noResultsEl.innerHTML = `<p>${escapeHtml(msg)}</p>`;
}
