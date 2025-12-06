// routes/brand.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, admin } = require('../firebase');           // Firestore & Storage
const { analyzeDrinkWithVertex } = require('../services/brandScanner'); // Vertex AI

// ---------------- Multer setup for temporary storage ----------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// ---------------- POST /api/scan-brand ----------------
router.post('/scan-brand', upload.single('image'), async (req, res) => {
  let localFilePath;

  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: true, message: 'User ID is required' });
    if (!req.file) return res.status(400).json({ error: true, message: 'No image uploaded' });

    localFilePath = req.file.path;
    // 💡 NEW LINE: Extract the correct MIME type from the file object
    const fileMimeType = req.file.mimetype; 
    
    const bucket = admin.storage().bucket();
    const fileName = `scans/${userId}/${Date.now()}_${req.file.originalname}`;

    // ---------------- Upload image to Firebase Storage ----------------
    await bucket.upload(localFilePath, {
      destination: fileName,
      metadata: { contentType: req.file.mimetype }
    });
    const imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    // ---------------- Create initial Firestore record ----------------
    const scanDocRef = await db.collection('users')
      .doc(userId)
      .collection('scans')
      .add({
        imageUrl,
        createdAt: new Date().toISOString(),
        status: 'pending',
        result: null
      });

    // ---------------- Call Vertex AI to analyze the drink ----------------
    let aiResult;
    try {
      // 🎯 MODIFIED LINE: Pass the fileMimeType to the analysis function
      aiResult = await analyzeDrinkWithVertex(localFilePath, fileMimeType); 

      // Ensure all fields are always returned for frontend consistency
      aiResult = {
        brandName: aiResult.brandName || "Unknown",
        productType: aiResult.productType || "Unknown",
        manufacturer: aiResult.manufacturer || "",
        keyIngredients: Array.isArray(aiResult.keyIngredients) ? aiResult.keyIngredients : [],
        expiryDate: aiResult.expiryDate || "",
        warnings: Array.isArray(aiResult.warnings) ? aiResult.warnings : [],
        confidenceScore: typeof aiResult.confidenceScore === "number" ? aiResult.confidenceScore : 0,
        localizedAdvice: aiResult.localizedAdvice || "",
        promotionalNote: aiResult.promotionalNote || "",
        error: aiResult.error || false,
        message: aiResult.message || null,
      };

    } catch (aiErr) {
      console.error('❌ Vertex AI analysis error:', aiErr);
      aiResult = {
        brandName: "Unknown",
        productType: "Unknown",
        manufacturer: "",
        keyIngredients: [],
        expiryDate: "",
        warnings: [],
        confidenceScore: 0,
        localizedAdvice: "",
        promotionalNote: "",
        error: true,
        message: aiErr.message
      };
    }

    // ---------------- Update Firestore with AI result ----------------
    try {
      await db.collection('users').doc(userId)
        .collection('scans').doc(scanDocRef.id)
        .update({
          status: aiResult.error ? 'failed' : 'completed',
          result: aiResult
        });
    } catch (firestoreErr) {
      console.error('❌ Firestore update failed:', firestoreErr);
    }

    // ---------------- Cleanup temp file ----------------
    if (localFilePath && fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);

    // ---------------- Return result to frontend ----------------
    return res.json({
      status: aiResult.error ? 'AI analysis failed' : 'Scan analyzed',
      scanId: scanDocRef.id,
      imageUrl,
      aiResult
    });

  } catch (err) {
    console.error('Error in brand scan route:', err);
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