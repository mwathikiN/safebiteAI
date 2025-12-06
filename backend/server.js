const express = require('express');
const app = express();
const cors = require('cors');


// Enable CORS (important if your frontend is calling this backend)
app.use(cors());

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
const profileRoutes = require('./routes/profile');
const scanRoutes = require('./routes/scan');
const brandRoutes = require('./routes/brand'); // <-- UNCOMMENTED

app.use('/api/profile', profileRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api', brandRoutes); // <-- UNCOMMENTED

// Cloud Run injects PORT automatically (must use 8080 default)
const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
