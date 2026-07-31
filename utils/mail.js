
//عند رفع المشروع استخدام هدا 
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({

  host: "smtp-relay.brevo.com",
  port: 2525,//بعد الرفع

  secure: false,

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },

  connectionTimeout: 30000

});

transporter.verify((error, success) => {

  if (error) {

    console.log("MAIL ERROR:");
    console.log(error);

  } else {

    console.log("MAIL SERVER READY");

  }

});

module.exports = transporter;

// في مرحلة التطوير استخدام هدا
/*
const nodemailer = require('nodemailer');



const transporter = nodemailer.createTransport({
 
  host: "smtp.gmail.com",
  port: 465,
  secure: true,

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }

});

transporter.verify((error, success) => {

  if (error) {

    console.log("MAIL ERROR:");
    console.log(error);

  } else {

    console.log("MAIL SERVER READY");

  }

});



module.exports = transporter;
*/