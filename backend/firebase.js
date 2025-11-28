// firebase.js (ADC Version)
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK using the Cloud Run service account (ADC)
// No environment variable needed, credentials are handled automatically by Cloud Run
admin.initializeApp({
  storageBucket: 'gs://workshop-genai-477501.firebasestorage.app',
});

// Firestore and Storage instances
const db = admin.firestore();
const bucket = admin.storage().bucket();

module.exports = { db, admin, bucket };
