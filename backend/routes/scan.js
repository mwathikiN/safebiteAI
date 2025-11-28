const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, admin } = require('../firebase');

// ---- Import Vertex AI analyzer ----
const { analyzeImageWithVertex } = require('../services/aiAnalyzer');

// ------------------ Multer setup for temp local storage ------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// ------------------ POST /api/scan ------------------
router.post('/', upload.single('image'), async (req, res) => {
  let localFilePath;
  try {
    const userId = req.body.userId;
    if (!userId) return res.status(400).json({ error: true, message: 'User ID is required' });
    if (!req.file) return res.status(400).json({ error: true, message: 'No image uploaded' });

    localFilePath = req.file.path;
    const fileName = `scans/${userId}/${Date.now()}_${req.file.originalname}`;
    const bucket = admin.storage().bucket();

    // Upload to Firebase Storage
    await bucket.upload(localFilePath, {
      destination: fileName,
      metadata: { contentType: req.file.mimetype }
    });
    const imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    // Save initial scan record
    const scanDocRef = await db.collection('users')
      .doc(userId)
      .collection('scans')
      .add({
        imageUrl,
        createdAt: new Date().toISOString(),
        status: 'pending',
        result: null
      });

    // Fetch user profile
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      fs.unlinkSync(localFilePath);
      return res.status(404).json({ error: true, message: 'User profile not found' });
    }
    const userProfile = userDoc.data();

    // --- FIX: Ensure arrays exist before calling analyzer ---
    const safeProfile = {
      allergicFoods: Array.isArray(userProfile.allergicFoods) ? userProfile.allergicFoods : [],
      healthConditions: Array.isArray(userProfile.healthConditions) ? userProfile.healthConditions : []
    };

    // Call Vertex AI analyzer
    const aiResult = await analyzeImageWithVertex(localFilePath, safeProfile);

    // Update Firestore with AI result
    await db.collection('users').doc(userId)
      .collection('scans').doc(scanDocRef.id)
      .update({
        status: 'completed',
        result: aiResult
      });

    // Cleanup temp file
    fs.unlinkSync(localFilePath);

    // Return response in frontend-compatible format
    return res.json({
      status: 'Scan analyzed',
      scanId: scanDocRef.id,
      imageUrl,
      aiResult
    });

  } catch (err) {
    console.error('Error in scan route:', err);
    if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
    return res.status(500).json({
      error: true,
      message: err.message,
      stack: err.stack,
      details: err
    });
  }
});

module.exports = router;
