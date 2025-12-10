SafebiteAI — AI Food & Drink Safety & Allergy Risk Scanner

SafebiteAI is an AI-powered platform that analyzes food and drink product images to detect allergy risks, harmful additives, and potential contaminants.
It provides localized advice for African users and ad-friendly suggestions, making it both informative and engaging.

Built with Node.js/Express backend, HTML/JS frontend, and Google Cloud AI technologies.

🔥 Key Features

Image-based food and drink scanning

Brand and ingredient recognition

AI-powered allergy & risk detection

Localized advice for African users

Promotional/ad-friendly notes for drinks

Personalized results via user profiles

Fast, mobile-first frontend experience

Scalable backend using Google Cloud

🛠 Prerequisites

Node.js (v18+ recommended)

npm (comes with Node.js)

Google Cloud Platform account with:

Vertex AI enabled

Firestore database

Cloud Storage

Cloud Run (for deployment)

🧩 Project Structure
SafebiteAI/
├── backend/           # Node.js + Express + Genkit + ADK + Vertex AI
├── frontend/          # HTML/JS mobile-first frontend
├── docs/              # Proposal PDF + slides PDF
├── media/             # Demo video + screenshots
├── safebite-secrets/  # Service account keys

🤖 Google AI Technologies Used

Google Vertex AI (Gemini models) — Image + text understanding

📄 Documentation

Project Proposal → docs/proposal.pdf

Project Slides → docs/slides.pdf

🎥 Demo Video
https://docs.google.com/videos/d/1B_8R-pqphO5pkX21SU_3YYJMId-OZOa8N5rlqeN0Tuw/edit?usp=drive_link

🚀 Running Backend Locally
cd backend
npm install
npm start


Backend runs on http://localhost:8080.

Example API Usage:

Create User Profile

curl -X POST http://localhost:8080/api/profile \
-H "Content-Type: application/json" \
-d '{
  "name": "Nick",
  "allergicFoods": ["nuts","eggs"],
  "dislikedFoods": ["mushrooms"],
  "preferredFoods": ["vegan","gluten-free"],
  "dietType": "vegan",
  "healthConditions": ["diabetes"]
}'


Food Scan

curl -X POST http://localhost:8080/api/scan-food \
-F "userId=<profileId>" \
-F "image=@testimage1.jpg"


Drink Scan

curl -X POST http://localhost:8080/api/scan-brand \
-F "userId=<profileId>" \
-F "image=@test-drink.jpg"

📱 Frontend Usage

The HTML/JS frontend communicates with the backend via REST API endpoints:

Profile Creation

Users fill dietary preferences, allergies, and health conditions

Frontend sends POST /api/profile

Backend returns profileId for personalized scans

Food Scanning

Users upload food product images

Frontend sends POST /api/scan-food with profileId

Receives JSON results with allergens, ingredients, and recommendations

Drink Scanning

Users upload drink label images

Frontend sends POST /api/scan-brand with profileId

Receives JSON results with brand info, ingredients, warnings, localized advice, and promotional note

Note: The frontend stores the returned profileId and reuses it for both food and drink scans.

☁️ Deploying to Cloud Run
gcloud run deploy safebite-backend \
--source ./backend \
--region us-central1 \
--allow-unauthenticated


Ensure the Cloud Run service account has permissions for Firestore, Cloud Storage, and Vertex AI.

🧪 Testing Locally

Use curl or Postman to test endpoints

Ensure images are correctly formatted (JPEG/PNG)

Confirm profileId is passed in requests for personalized results

📌 License

MIT License
