// =====================================
// SECTION SWITCHING (INDEX PAGE)
// =====================================
function showSection(sectionId) {
  const sections = document.querySelectorAll(".section");
  sections.forEach(section => {
    section.style.display = "none";
  });
  const active = document.getElementById(sectionId);
  if (active) {
    active.style.display = "block";
  }
}

// =====================================
// GAME PAGE TABS (legacy support)
// =====================================
function showTab(tabId) {
  const tabs = document.querySelectorAll(".tabContent");
  tabs.forEach(tab => {
    tab.style.display = "none";
  });
  const activeTab = document.getElementById(tabId);
  if (activeTab) {
    activeTab.style.display = "block";
  }
}
