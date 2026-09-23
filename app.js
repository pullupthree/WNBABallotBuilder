// Sections that share a `group` can't reuse a player (e.g. First and Second Team).
// Individual awards have no group, so one player can win several of them.
const BALLOT_SECTIONS = [
  {
    id: "individual-awards",
    title: "Individual Awards",
    featured: true,
    awards: [
      { code: "MVP", name: "Most Valuable Player" },
      { code: "DPOY", name: "Defensive Player of the Year" },
      { code: "ROTY", name: "Rookie of the Year" },
      { code: "6POY", name: "Sixth Player of the Year" },
      { code: "MIP", name: "Most Improved Player" },
    ],
  },
  { id: "all-wnba-first", title: "All-WNBA First Team", slots: 5, group: "all-wnba" },
  { id: "all-wnba-second", title: "All-WNBA Second Team", slots: 5, group: "all-wnba" },
  { id: "all-defense-first", title: "All-Defense First Team", slots: 5, group: "all-defense" },
  { id: "all-defense-second", title: "All-Defense Second Team", slots: 5, group: "all-defense" },
  { id: "all-rookie", title: "All-Rookie Team", slots: 5, group: "all-rookie" },
];

const STORAGE_KEY = "pull-up-three-2026-ballot";

const ballot = document.querySelector("#ballot");
const dialog = document.querySelector("#player-dialog");
const form = document.querySelector("#player-form");
const dialogCategory = document.querySelector("#dialog-category");
const searchInput = document.querySelector("#player-search");
const teamFilter = document.querySelector("#team-filter");
const playerList = document.querySelector("#player-list");
const resultCount = document.querySelector("#result-count");
const clearButton = document.querySelector("#clear-selection");
const saveButton = document.querySelector("#save-selection");
const resetButton = document.querySelector("#reset-ballot");
const captureButton = document.querySelector("#capture-view");
const downloadButton = document.querySelector("#download-capture");
const exitCaptureButton = document.querySelector("#exit-capture");
const slotTemplate = document.querySelector("#slot-template");
const selectionCount = document.querySelector("#selection-count");
const progressFill = document.querySelector("#progress-fill");

const SLOTS = new Map(
  BALLOT_SECTIONS.flatMap((section) => sectionSlots(section).map((slot) => [slot.key, slot])),
);
const TOTAL_PICKS = SLOTS.size;

let players = [];
let playersById = new Map();
let activeSlotKey = null;
// The player the user explicitly clicked in the picker, so filtering doesn't discard it.
let pickedPlayerId = "";
let selections = loadSelections();

function loadSelections() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSelections() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selections));
  } catch {
    // Some browsers restrict localStorage for file:// pages; the ballot still works for the session.
  }
}

function sectionSlots(section) {
  if (section.featured) {
    return section.awards.map((award) => ({
      key: `${section.id}:${award.code}`,
      section,
      award,
      label: `${award.code} · ${award.name}`,
    }));
  }
  return Array.from({ length: section.slots }, (_, index) => ({
    key: `${section.id}:${index}`,
    section,
    label: `${section.title} · Spot ${index + 1}`,
  }));
}

function selectedPlayer(slotKey) {
  return playersById.get(selections[slotKey]);
}

function initials(player) {
  return `${player.firstName?.[0] ?? ""}${player.lastName?.[0] ?? ""}`.toUpperCase();
}

function createSlot(slotInfo) {
  const slot = slotTemplate.content.firstElementChild.cloneNode(true);
  slot.dataset.slotKey = slotInfo.key;

  if (slotInfo.award) {
    slot.querySelector(".award-label").hidden = false;
    slot.querySelector(".award-code").textContent = slotInfo.award.code;
    slot.querySelector(".award-name").textContent = slotInfo.award.name;
  }

  slot.addEventListener("click", () => openPlayerPicker(slotInfo.key));
  hydrateSlot(slot);
  return slot;
}

function hydrateSlot(slot) {
  const slotInfo = SLOTS.get(slot.dataset.slotKey);
  const player = selectedPlayer(slotInfo.key);
  const portrait = slot.querySelector(".portrait");
  const image = portrait.querySelector("img");
  const initialsMark = portrait.querySelector(".initials");
  const addMark = portrait.querySelector(".add-mark");
  const name = slot.querySelector(".player-name");
  const meta = slot.querySelector(".player-meta");

  if (!player) {
    slot.classList.add("is-empty");
    portrait.classList.remove("has-image");
    image.removeAttribute("src");
    image.alt = "";
    initialsMark.textContent = "";
    addMark.hidden = false;
    name.textContent = "Add player";
    meta.textContent = "";
    slot.setAttribute("aria-label", `${slotInfo.label}: add player`);
    return;
  }

  slot.classList.remove("is-empty");
  addMark.hidden = true;
  initialsMark.textContent = initials(player);
  name.textContent = player.fullName;
  meta.textContent = `${player.position} · ${player.team}`;
  slot.setAttribute("aria-label", `${slotInfo.label}: ${player.fullName}, ${player.team}. Change pick`);

  if (player.image) {
    image.src = player.image;
    portrait.classList.add("has-image");
  } else {
    image.removeAttribute("src");
    portrait.classList.remove("has-image");
  }
}

function renderBallot() {
  ballot.replaceChildren();

  BALLOT_SECTIONS.forEach((section) => {
    const sectionElement = document.createElement("section");
    sectionElement.className = `award-section${section.featured ? " is-featured" : ""}`;
    sectionElement.dataset.sectionId = section.id;

    const header = document.createElement("header");
    header.className = "award-section-header";
    const title = document.createElement("h2");
    title.textContent = section.title;
    const count = document.createElement("p");
    count.className = "section-count";
    header.append(title, count);

    const slots = document.createElement("div");
    slots.className = "award-slots";
    sectionSlots(section).forEach((slotInfo) => slots.append(createSlot(slotInfo)));

    sectionElement.append(header, slots);
    ballot.append(sectionElement);
  });

  updateProgress();
}

function updateProgress() {
  let total = 0;

  BALLOT_SECTIONS.forEach((section) => {
    const keys = sectionSlots(section).map((slot) => slot.key);
    const filled = keys.filter((key) => selectedPlayer(key)).length;
    total += filled;

    const sectionElement = ballot.querySelector(`[data-section-id="${section.id}"]`);
    if (!sectionElement) return;
    sectionElement.classList.toggle("is-complete", filled === keys.length);
    sectionElement.querySelector(".section-count").innerHTML = `<strong>${filled}</strong> / ${keys.length}`;
  });

  selectionCount.textContent = `${total} of ${TOTAL_PICKS} picks`;
  progressFill.style.width = `${(total / TOTAL_PICKS) * 100}%`;
  resetButton.disabled = total === 0;
}

function openPlayerPicker(slotKey) {
  if (document.body.classList.contains("capture-mode")) return;

  activeSlotKey = slotKey;
  pickedPlayerId = "";
  dialogCategory.textContent = SLOTS.get(slotKey).label;
  searchInput.value = "";
  teamFilter.value = "";
  clearButton.hidden = !selectedPlayer(slotKey);
  filterPlayers();

  dialog.showModal();
  playerList.querySelector("input:checked")?.closest(".player-option").scrollIntoView({ block: "center" });
  // Skip auto-focusing search on touch screens so the keyboard doesn't cover the list.
  if (window.matchMedia("(pointer: fine)").matches) searchInput.focus();
}

function closePlayerPicker() {
  dialog.close();
}

function playersUsedElsewhere() {
  const { section } = SLOTS.get(activeSlotKey);
  if (!section.group) return new Set();

  return new Set(
    [...SLOTS.values()]
      .filter((slot) => slot.section.group === section.group && slot.key !== activeSlotKey)
      .map((slot) => selections[slot.key])
      .filter(Boolean),
  );
}

function checkedPlayerId() {
  return playerList.querySelector("input:checked")?.value ?? "";
}

function filterPlayers() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const team = teamFilter.value;
  const usedIds = playersUsedElsewhere();

  const filtered = players.filter((player) => {
    const searchable = `${player.fullName} ${player.team} ${player.position}`.toLocaleLowerCase();
    return (!query || searchable.includes(query)) && (!team || player.team === team) && !usedIds.has(player.id);
  });

  const previousValue = pickedPlayerId || selections[activeSlotKey];
  const fragment = document.createDocumentFragment();

  filtered.forEach((player) => {
    const option = document.createElement("label");
    option.className = "player-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "player";
    input.value = player.id;

    const name = document.createElement("span");
    name.className = "option-name";
    name.textContent = player.fullName;

    const meta = document.createElement("span");
    meta.className = "option-meta";
    meta.textContent = `${player.position} · ${player.team}`;

    option.append(input, name, meta);
    fragment.append(option);
  });

  playerList.replaceChildren(fragment);

  // Keep the current pick checked when it's still visible. While searching, fall back to the
  // top match so typing a name and pressing Enter saves it.
  const inputs = [...playerList.querySelectorAll("input")];
  const match = inputs.find((input) => input.value === previousValue) ?? (query ? inputs[0] : null);
  if (match) match.checked = true;

  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = "No players match your search.";
    playerList.append(empty);
  }

  updateSaveButton();
  const hidden = usedIds.size ? ` (${usedIds.size} already picked)` : "";
  resultCount.textContent = `${filtered.length} player${filtered.length === 1 ? "" : "s"}${hidden}`;
}

function updateSaveButton() {
  saveButton.disabled = !checkedPlayerId();
}

function populateTeams() {
  const teams = [...new Set(players.map((player) => player.team))].sort((a, b) => a.localeCompare(b));
  teams.forEach((team) => {
    const option = document.createElement("option");
    option.value = team;
    option.textContent = team;
    teamFilter.append(option);
  });
}

function refreshSlot(slotKey) {
  const slot = ballot.querySelector(`[data-slot-key="${CSS.escape(slotKey)}"]`);
  if (slot) hydrateSlot(slot);
  updateProgress();
}

function applySelection(playerId) {
  if (!activeSlotKey || !playerId) return;
  selections[activeSlotKey] = playerId;
  saveSelections();
  refreshSlot(activeSlotKey);
  closePlayerPicker();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  applySelection(checkedPlayerId());
});

searchInput.addEventListener("input", filterPlayers);
teamFilter.addEventListener("change", filterPlayers);

playerList.addEventListener("change", () => {
  pickedPlayerId = checkedPlayerId();
  updateSaveButton();
});

playerList.addEventListener("dblclick", (event) => {
  const input = event.target.closest(".player-option")?.querySelector("input");
  if (input) applySelection(input.value);
});

playerList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  applySelection(checkedPlayerId());
});

document.querySelector("#close-dialog").addEventListener("click", closePlayerPicker);
document.querySelector("#cancel-selection").addEventListener("click", closePlayerPicker);

// Close when clicking the dimmed backdrop, but not when a drag inside the dialog ends outside it.
let pointerDownOnBackdrop = false;
dialog.addEventListener("pointerdown", (event) => {
  pointerDownOnBackdrop = event.target === dialog;
});
dialog.addEventListener("click", (event) => {
  if (pointerDownOnBackdrop && event.target === dialog) closePlayerPicker();
});

dialog.addEventListener("close", () => {
  activeSlotKey = null;
});

clearButton.addEventListener("click", () => {
  if (!activeSlotKey) return;
  const slotKey = activeSlotKey;
  delete selections[slotKey];
  saveSelections();
  refreshSlot(slotKey);
  closePlayerPicker();
});

resetButton.addEventListener("click", () => {
  if (!window.confirm("Clear every selection from this ballot?")) return;
  selections = {};
  saveSelections();
  renderBallot();
});

function enterCaptureMode() {
  document.body.classList.add("capture-mode");
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  exitCaptureButton.focus({ preventScroll: true });
}
function downloadPageAsPng() {
    // Select the element you want to screenshot (document.body for the full visible page)
    const element = document.body; 

    html2canvas(element, { useCORS: true }).then(canvas => {
        // Convert canvas data to a PNG URL
        const dataUrl = canvas.toDataURL("image/png");

        // Create a temporary link element to trigger the download
        const downloadLink = document.createElement("a");
        downloadLink.href = dataUrl;
        downloadLink.download = "ballot.png"; // File name

        // Trigger click and clean up
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    }).catch(error => {
        console.error("Oops, something went wrong!", error);
    });
}
function exitCaptureMode() {
  document.body.classList.remove("capture-mode");
  captureButton.focus({ preventScroll: true });
}

captureButton.addEventListener("click", enterCaptureMode);
downloadButton.addEventListener("click", downloadPageAsPng);
exitCaptureButton.addEventListener("click", exitCaptureMode);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !dialog.open && document.body.classList.contains("capture-mode")) {
    exitCaptureMode();
  }
});

function init() {
  if (!Array.isArray(window.WNBA_ROSTER)) {
    ballot.innerHTML = `
      <section class="award-section">
        <p class="list-empty">Roster unavailable. Make sure wnba_roster_data.js is in the same folder as index.html.</p>
      </section>`;
    return;
  }

  players = window.WNBA_ROSTER.map((player) => ({ ...player }));
  players.sort((a, b) => a.fullName.localeCompare(b.fullName));
  playersById = new Map(players.map((player) => [player.id, player]));
  populateTeams();
  renderBallot();
}

init();
