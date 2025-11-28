const admin = require('firebase-admin');
const serviceAccount = require('./routes/serviceAccountKey.json'); // path to your service account key

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'workshop-genai-477501.appspot.com' // your project bucket
});

const bucket = admin.storage().bucket();

// Try to get bucket metadata
bucket.getMetadata()
  .then(([metadata]) => {
    console.log('Bucket exists and is accessible:');
    console.log(metadata);
  })
  .catch(err => {
    console.error('Error accessing bucket:', err);
  });
