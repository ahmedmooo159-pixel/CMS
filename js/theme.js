// Dynamic Branding Custom Theme System

function applyTheme(primaryColor, secondaryColor) {
  if (primaryColor) {
    document.documentElement.style.setProperty('--primary-color', primaryColor);
    // Auto-calculate hover variant (simple brightness reduction)
    document.documentElement.style.setProperty('--primary-hover', adjustColorBrightness(primaryColor, -15));
  }
  if (secondaryColor) {
    document.documentElement.style.setProperty('--secondary-color', secondaryColor);
    document.documentElement.style.setProperty('--secondary-hover', adjustColorBrightness(secondaryColor, -15));
  }
}

// Helper to darken colors dynamically
function adjustColorBrightness(hex, percent) {
  let R = parseInt(hex.substring(1, 3), 16);
  let G = parseInt(hex.substring(3, 5), 16);
  let B = parseInt(hex.substring(5, 7), 16);

  R = parseInt(R * (100 + percent) / 100);
  G = parseInt(G * (100 + percent) / 100);
  B = parseInt(B * (100 + percent) / 100);

  R = (R < 255) ? R : 255;  
  G = (G < 255) ? G : 255;  
  B = (B < 255) ? B : 255;  

  R = (R > 0) ? R : 0;
  G = (G > 0) ? G : 0;
  B = (B > 0) ? B : 0;

  const rHex = R.toString(16).padStart(2, '0');
  const gHex = G.toString(16).padStart(2, '0');
  const bHex = B.toString(16).padStart(2, '0');

  return `#${rHex}${gHex}${bHex}`;
}

// Load settings on load
document.addEventListener("DOMContentLoaded", async () => {
  // If Firebase is initialized properly
  try {
    if (window.isFirebaseConfigured) {
      const doc = await db.collection("clinics").doc("settings").get();
      if (doc.exists) {
        const data = doc.data();
        applyTheme(data.primaryColor, data.secondaryColor);
        updateClinicBranding(data);
      }
    } else {
      // Mock mode loads from localStorage
      const mockSettings = JSON.parse(localStorage.getItem("mock_firestore_clinics_settings") || "{}");
      if (mockSettings.primaryColor || mockSettings.secondaryColor) {
        applyTheme(mockSettings.primaryColor, mockSettings.secondaryColor);
        updateClinicBranding(mockSettings);
      }
    }
  } catch (err) {
    console.error("Error loading theme settings:", err);
  }
});

function updateClinicBranding(settings) {
  const clinicNameEl = document.getElementById("clinic-name");
  const clinicTaglineEl = document.getElementById("clinic-tagline");
  const logoContainer = document.getElementById("clinic-logo-container");
  
  if (settings.name && clinicNameEl) {
    clinicNameEl.textContent = settings.name;
  }
  if (settings.description && clinicTaglineEl) {
    clinicTaglineEl.textContent = settings.description;
  }
  if (settings.logo && logoContainer) {
    logoContainer.innerHTML = `<img src="${settings.logo}" alt="Clinic Logo" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
  }
}
