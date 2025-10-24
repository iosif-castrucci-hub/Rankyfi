// ===================== UTILITIES =====================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function log1p(n){return Math.log(1+Math.max(0,n));}
function formatDistance(m){if(!m&&m!==0)return"";return m>=1000?(m/1000).toFixed(1)+" km":Math.round(m)+" m";}

// ===================== GLOBAL DOM =====================
const inputEl=document.getElementById("place-input");
const noResultsEl=document.getElementById("no-results");
const placeCardEl=document.getElementById("place-card");
const placeNameEl=document.getElementById("place-name");
const placeAddrEl=document.getElementById("place-address");
const placeRatingEl=document.getElementById("place-rating");
const reviewsDiv=document.getElementById("reviews-list");

// ===================== GOOGLE PLACES =====================
let mapDummy,placesService,autocompleteService;
window.initApp=function(){
  const dummy=document.createElement("div");
  dummy.style.display="none";
  document.body.appendChild(dummy);
  mapDummy=new google.maps.Map(dummy);
  placesService=new google.maps.places.PlacesService(mapDummy);
  autocompleteService=new google.maps.places.AutocompleteService();
  attachInputEvents();
  showMessage("Start typing your business name above 👆");
};

// ===================== AUTOCOMPLETE =====================
function attachInputEvents(){
  let t;
  inputEl.addEventListener("input",()=>{
    const q=(inputEl.value||"").trim();
    clearTimeout(t);
    if(q.length<3)return;
    t=setTimeout(()=>showPredictions(q),250);
  });
}

function showPredictions(query){
  autocompleteService.getPlacePredictions(
    {input:query,language:"en",types:["establishment"]},
    (preds,status)=>{
      if(status!==google.maps.places.PlacesServiceStatus.OK||!preds?.length){
        showMessage("No results found");
        return;
      }
      const first=preds[0];
      inputEl.value="";
      fetchPlaceDetails(first.place_id);
    }
  );
}

// ===================== DETAILS =====================
function fetchPlaceDetails(placeId){
  showMessage("Loading business info...");
  placesService.getDetails(
    {placeId,fields:["name","formatted_address","geometry","rating","user_ratings_total","types","place_id"]},
    (d,st)=>{
      if(st!==google.maps.places.PlacesServiceStatus.OK||!d){showMessage("Could not retrieve details.");return;}
      showPlaceAndRank(d);
    }
  );
}

function showPlaceAndRank(details){
  noResultsEl.classList.add("hidden");
  placeCardEl.classList.remove("hidden");
  placeNameEl.textContent=details.name||"Business";
  placeAddrEl.textContent=details.formatted_address||"";
  placeRatingEl.innerHTML=details.rating?`⭐ <strong>${details.rating}</strong> · (${details.user_ratings_total} reviews)`:"";
  buildRanking(details);
}

// ===================== RANKING =====================
function buildRanking(details){
  const loc=details.geometry?.location;if(!loc)return;
  const center=new google.maps.LatLng(loc.lat(),loc.lng());
  const req={location:center,radius:10000,type:"establishment",language:"en"};
  placesService.nearbySearch(req,(res,st)=>{
    if(st!==google.maps.places.PlacesServiceStatus.OK||!res?.length){showMessage("No nearby competitors found.");return;}
    finalizeRanking(details,center,res);
  });
}

function distanceMeters(from,to){
  if(!from||!to)return 0;
  const R=6371000;
  const lat1=from.lat(),lon1=from.lng();
  const lat2=typeof to.lat==="function"?to.lat():to.lat,lon2=typeof to.lng==="function"?to.lng():to.lng;
  const dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function scorePlace({rating=0,total=0,distanceM=0}){const km=distanceM/1000;return rating*20+log1p(total)*3-km*1.2;}

function finalizeRanking(target,center,list){
  const mapped=list.map(p=>({
    name:p.name||"",rating:p.rating||0,total:p.user_ratings_total||0,
    distanceM:distanceMeters(center,p.geometry?.location)
  }));
  const targetObj={name:target.name,rating:target.rating||0,total:target.user_ratings_total||0,distanceM:0};
  const ranked=[...mapped,targetObj].map(m=>({...m,score:scorePlace(m)})).sort((a,b)=>b.score-a.score);
  const pos=ranked.findIndex(r=>r.name===target.name)+1||"—";
  renderResults(ranked,pos,targetObj);
}

// ===================== RENDER =====================
function renderResults(list,pos,target){
  reviewsDiv.innerHTML=`<div class="ranking-card glass">
    <h3>📊 Estimated Local Ranking</h3>
    <p class="muted">Your business ranks approximately:</p>
    <div class="rank-number">${pos}${typeof pos==="number"?"º":""}</div>
    <p class="muted">Top competitors nearby:</p>
    <div style="margin-top:1rem;">
      ${list.slice(0,5).map(p=>`
        <div class="service-card glass" style="padding:0.8rem;border-radius:12px;margin-bottom:0.6rem;">
          <div style="font-weight:700;">${escapeHtml(p.name)}</div>
          <div style="color:rgba(255,255,255,.9);font-size:.95rem;">
            ⭐ ${p.rating.toFixed(1)} · ${p.total} reviews · 📍 ${formatDistance(p.distanceM)}
          </div>
        </div>`).join("")}
    </div>
  </div>`;
}

function showMessage(msg){
  noResultsEl.classList.remove("hidden");
  placeCardEl.classList.add("hidden");
  noResultsEl.innerHTML=`<p>${escapeHtml(msg)}</p>`;
}
