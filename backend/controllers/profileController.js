// Temporary in-memory store (until we connect Firestore)
let profiles = {};

exports.saveProfile = (req, res) => {
    const { userId, allergies, preferences } = req.body;

    if (!userId) {
        return res.status(400).json({ error: "userId is required" });
    }

    profiles[userId] = {
        allergies: allergies || [],
        preferences: preferences || []
    };

    res.json({ message: "Profile saved successfully", profile: profiles[userId] });
};

exports.getProfile = (req, res) => {
    const { userId } = req.params;

    const profile = profiles[userId];

    if (!profile) {
        return res.status(404).json({ error: "No profile found for this user" });
    }

    res.json(profile);
};
