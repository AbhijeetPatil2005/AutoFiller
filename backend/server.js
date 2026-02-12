const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv').config();
const { errorHandler } = require('./middleware/errorMiddleware');
const connectDB = require('./config/db');
const port = process.env.PORT || 5000;

connectDB();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/profiles', require('./routes/profileRoutes'));
app.use('/api/mappings', require('./routes/mappingRoutes'));
app.use('/api/matchFields', require('./routes/matchRoutes'));


app.use(errorHandler);

app.listen(port, () => console.log(`Server started on port ${port}`));
