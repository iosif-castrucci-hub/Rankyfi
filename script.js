// --- Google Maps Initialization ---
let mapDummy, placesService, autocompleteService;

window.initApp = function initApp() {
  const dummy = document.createElement("div");
  dummy.style.display = "none";
  document.body.appendChild(dummy);
  mapDummy = new google.maps.Map(dummy);
  placesService = new google.maps.places.PlacesService(mapDummy);
  autocompleteService = new google.maps.places.AutocompleteService();
  attachInputEvents();
  showMessage("Start typing your business name above 👆");
};

// --- Autocomplete ---
const inputEl = document.getElementById("place-input");
const noResultsEl = document.getElementById("no-results");
const placeCardEl = document.getElementById("place-card");
const placeNameEl = document.getElementById("place-name");
const placeAddrEl = document.getElementById("place-address");
const placeRatingEl = document.getElementById("place-rating");
const reviewsDiv = document.getElementById("reviews-list");

const acContainer = document.createElement("div");
acContainer.className = "autocomplete-results hidden";
inputEl.parentElement.appendChild(acContainer);

let debounceTimer = null;

function attachInputEvents() {
  inputEl.addEventListener("input", () => {
    const q = (inputEl.value || "").trim();
    if (q.length < 3) {
      acContainer.classList.add("hidden");
      acContainer.innerHTML = "";
      return;
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => showPredictions(q), 200);
  });
}

function showPredictions(query) {
  autocompleteService.getPlacePredictions(
    { input: query, language: "en", types: ["establishment"] },
    (preds, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !preds?.length) {
        acContainer.innerHTML = "<div class='autocomplete-item muted'>No results found</div>";
        acContainer.classList.remove("hidden");
        return;
      }
      acContainer.innerHTML = "";
      preds.slice(0, 6).forEach(p => {
        const el = document.createElement("div");
        el.className = "autocomplete-item";
        el.innerHTML = `<strong>${p.structured_formatting.main_text}</strong><div style="font-size:.9rem;color:rgba(255,255,255,.8)">${p.structured_formatting.secondary_text}</div>`;
        el.onclick = () => {
          fetchPlaceDetails(p.place_id);
          inputEl.value = ""; // clear after search
          acContainer.classList.add("hidden");
        };
        acContainer.appendChild(el);
      });
      acContainer.classList.remove("hidden");
    }
  );
}

// --- Display ---
function fetchPlaceDetails(placeId) {
  showMessage("Loading details...");
  placesService.getDetails(
    { placeId, fields: ["name", "formatted_address", "rating", "user_ratings_total"] },
    (details, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !details)
        return showMessage("Could not load business details.");
      showPlace(details);
    }
  );
}

function showPlace(details) {
  noResultsEl.classList.add("hidden");
  placeCardEl.classList.remove("hidden");
  placeNameEl.textContent = details.name || "Business";
  placeAddrEl.textContent = details.formatted_address || "";
  const r = details.rating || 0;
  const n = details.user_ratings_total || 0;
  placeRatingEl.innerHTML = `⭐ <strong>${r.toFixed(1)}</strong> · (${n} reviews)`;
}

function showMessage(msg) {
  noResultsEl.classList.remove("hidden");
  placeCardEl.classList.add("hidden");
  noResultsEl.innerHTML = `<p>${msg}</p>`;
}
