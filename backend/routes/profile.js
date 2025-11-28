const express = require('express');
const router = express.Router();
const { db } = require('../firebase'); // <-- FIXED: destructured import

/**
 * POST /api/profile
 * Request body:
 * {
 *   "name": "Nick",
 *   "allergicFoods": ["nuts", "eggs"],
 *   "dislikedFoods": ["mushrooms"],
 *   "preferredFoods": ["vegan", "gluten-free"],
 *   "dietType": "vegan",
 *   "healthConditions": ["diabetes"]
 * }
 */
router.post('/', async (req, res) => {
  const {
    name,
    allergicFoods = [],
    dislikedFoods = [],
    preferredFoods = [],
    dietType = null,
    healthConditions = []
  } = req.body;

  // Validate required fields
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    // Create a new Firestore document with auto-generated ID
    const docRef = await db.collection('users').add({
      name,
      allergicFoods,
      dislikedFoods,
      preferredFoods,
      dietType,
      healthConditions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return res.json({
      status: 'Profile saved',
      profileId: docRef.id, // return the auto-generated ID
      name
    });
  } catch (err) {
    console.error('Error saving profile:', err);
    return res.status(500).json({ error: 'Error saving profile' });
  }
});

module.exports = router;
