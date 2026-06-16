

require("dotenv").config();
const express = require("express");

const cors = require("cors");
const http = require("http");




const mongoose = require('mongoose');




const cookieParser = require('cookie-parser');

const helmet = require("helmet");

const rateLimit = require("express-rate-limit");

const app = express();
//app.use(express.json());

app.use(express.json({
  limit: "10mb"
}));

app.use(cookieParser());
app.use(helmet());


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

app.use(limiter);

//app.use(cors());
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true
}));





// 🔥 socket
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;



mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected Successfully");
  })
  .catch((err) => {
    console.error("MongoDB Connection Error:", err);
  });
 
app.use(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10
  })
);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));



  //خاص بنضام المهام 
app.use('/api/occurrences', require('./routes/occurrences'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/tasks', require('./routes/tasks'));




app.use('/api/job-leads', require('./routes/jobLeads'));







// تشغيل السيرفر
server.listen(PORT, () => {
   console.log(`🚀 Server running on port ${PORT}`);
});






