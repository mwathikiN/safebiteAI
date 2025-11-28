// Ensure DOM is fully loaded before attaching any listeners
document.addEventListener('DOMContentLoaded', () => {

  const BACKEND_URL = "https://safebite-backend-471218709027.us-central1.run.app";

  // -------------------- Scan Page Logic --------------------
  const uploadBtn = document.getElementById('uploadBtn');
  const continueBtn = document.getElementById('continueBtn');
  const fileInput = document.getElementById('fileInput');
  const uploadCard = document.getElementById('uploadCard');
  const resultsCard = document.getElementById('resultsCard');

  // Make file input clickable via custom button
  if(uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });
  }

  // Show selected file name (optional)
  if(fileInput) {
    fileInput.addEventListener('change', () => {
      if(fileInput.files.length > 0) {
        uploadBtn.textContent = `Selected: ${fileInput.files[0].name}`;
      }
    });
  }

  // Handle continue / scan
  if(continueBtn && fileInput && uploadCard && resultsCard) {
    continueBtn.addEventListener('click', async () => {
      if(!fileInput.files.length) {
        alert("Please upload or take a photo first!");
        return;
      }

      // Show processing animation
      uploadCard.style.opacity = 0.5;
      continueBtn.textContent = "Analyzing...";
      continueBtn.disabled = true;

      const safeCircle = resultsCard.querySelector('.circle-glow');
      const cautionTriangle = resultsCard.querySelector('.triangle-glow');

      if(safeCircle) safeCircle.style.animation = 'pulse 1.5s infinite alternate';
      if(cautionTriangle) cautionTriangle.style.animation = 'pulse 1.5s infinite alternate';

      // ---- REAL BACKEND REQUEST ----
      try {
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('image', file);

        // Replace 'testUser123' with actual userId from your app/session
        formData.append('userId', 'testUser123');

        const res = await fetch(`${BACKEND_URL}/api/scan`, {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        console.log("Backend response:", data);

        if(data.error){
          alert("Error: " + data.error);
          return;
        }

        // Hide upload card and show results card
        uploadCard.style.display = 'none';
        resultsCard.style.display = 'flex';

        // Display AI result (update according to your backend response structure)
        resultsCard.innerHTML = `
          <h2 class="text-xl font-bold mb-4 text-yellow-400">Scan Results</h2>
          <div class="space-y-2 text-gray-300">
            <p><strong>Detected Foods & Ingredients:</strong> ${data.aiResult?.raw || "N/A"}</p>
            <p><strong>Friendly Advice:</strong> ${data.aiResult?.friendlyAdvice || "N/A"}</p>
            <p><strong>Rating:</strong> ${data.aiResult?.dietCompatibility || "N/A"}</p>
            <img src="${data.imageUrl || ''}" alt="Meal Image" class="mt-3 rounded-xl" />
          </div>
        `;

      } catch(err) {
        console.error(err);
        alert("Scan failed. Check backend.");
      } finally {
        continueBtn.textContent = "Scan Now";
        continueBtn.disabled = false;
      }
    });
  }

  // -------------------- Homepage Scan Button Only Fix --------------------
  const scanNowBtn = document.getElementById('scanNowBtn');
  if(scanNowBtn) {
    scanNowBtn.addEventListener('click', () => {
      window.location.href = 'scan.html';
    });
  }

});

// -------------------- Optional Pulsing Animation for Neon Effect --------------------
const style = document.createElement('style');
style.innerHTML = `
@keyframes pulse {
  0% { transform: scale(1); box-shadow: 0 0 10px currentColor; }
  50% { transform: scale(1.05); box-shadow: 0 0 25px currentColor; }
  100% { transform: scale(1); box-shadow: 0 0 10px currentColor; }
}`;
document.head.appendChild(style);
