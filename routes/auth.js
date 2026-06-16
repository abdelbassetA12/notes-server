
const router = require('express').Router();
const User = require('../models/User');
// ❌ هذا غير موجود عندك

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');


const transporter = require('../utils/mail');



router.post('/register', async (req, res) => {
  try {

    const { username, email, password } = req.body;

    // VALIDATION
    if (!username || !email || !password) {
      return res.status(400).json({
        error: 'All fields required'
      });
    }

    // USERNAME EXISTS
    const existingUsername = await User.findOne({ username });

    if (existingUsername) {
      return res.status(400).json({
        error: 'Username already used'
      });
    }

    // EMAIL EXISTS
    const existingEmail = await User.findOne({ email });

    if (existingEmail) {
      return res.status(400).json({
        error: 'Email already used'
      });
    }

    // HASH PASSWORD
    const hashedPassword = await bcrypt.hash(password, 10);

    // GENERATE TOKEN
//const verificationToken = uuidv4();
const verificationCode =
Math.floor(100000 + Math.random() * 900000).toString();






    // CREATE USER
    
   const user = await User.create({
  username,
  email,
  password: hashedPassword,
   verificationCode,

  verificationCodeExpires:
    Date.now() + 1000 * 60 * 10,
  
  isVerified: false
});




const info = await transporter.sendMail({

  //from: process.env.EMAIL_USER,
   from: '"Qevora" <abdelbassetelhajiri02@gmail.com>',

  to: email,

  subject: "Verification Code",

  html: `
    <div style="font-family:Arial;padding:20px">

      <h2>
        BioLink Verification
      </h2>

      <p>
        Your verification code is:
      </p>

      <h1
        style="
          letter-spacing:5px;
          color:#6366f1;
        "
      >
        ${verificationCode}
      </h1>

      <p>
        This code expires in 10 minutes.
      </p>

    </div>
  `
});
console.log(info);
    

    res.json({
  message: 'Account created. Please verify your email.'
});

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }
});

router.post('/verify-code', async (req, res) => {

  try {

    const { email, code } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        error: 'User not found'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        error: 'Account already verified'
      });
    }

    if (user.verificationCode !== code) {
      return res.status(400).json({
        error: 'Invalid code'
      });
    }

    if (
      user.verificationCodeExpires < Date.now()
    ) {

      return res.status(400).json({
        error: 'Code expired'
      });

    }

    user.isVerified = true;

    user.verificationCode = null;
    user.verificationCodeExpires = null;

    await user.save();

    res.json({
      message: 'Email verified successfully'
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});



router.post('/login', async (req, res) => {

  try {

    const { username, password } = req.body;

    const user = await User.findOne({
      $or: [
        { username },
        { email: username }
      ]
    });

    if (!user) {
      return res.status(400).json({
        error: 'User not found'
      });
    }
  
    const isMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!isMatch) {
      return res.status(400).json({
        error: 'Wrong password'
      });
    }

     if (!user.isVerified) {

  // GENERATE NEW CODE
  const verificationCode =
    Math.floor(
      100000 + Math.random() * 900000
    ).toString();

  // SAVE CODE
  user.verificationCode = verificationCode;

  user.verificationCodeExpires =
    Date.now() + 1000 * 60 * 10;

  await user.save();

  // SEND EMAIL
  await transporter.sendMail({

  
     from: '"Qevora" <abdelbassetelhajiri02@gmail.com>',

    to: user.email,

    subject: 'Verify Your Email',

    html: `
      <div
        style="
          font-family:Arial;
          padding:20px;
        "
      >

        <h2>
          Email Verification
        </h2>

        <p>
          Your verification code is:
        </p>

        <h1
          style="
            color:#6366f1;
            letter-spacing:5px;
          "
        >
          ${verificationCode}
        </h1>

        <p>
          This code expires in 10 minutes.
        </p>

      </div>
    `
  });

  return res.status(403).json({

    error: 'EMAIL_NOT_VERIFIED',

    email: user.email,

    message:
      'Verification code sent again'

  });

}
/*
   if (!user.isVerified) {

  return res.status(403).json({
    error: 'EMAIL_NOT_VERIFIED',
    email: user.email
  });

}
  */

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d'
      }
    );
  
    res.cookie('token', token, {
      httpOnly: true,
       secure: true,
      //secure: false, // localhost

      //sameSite: 'lax',
        sameSite: "none",

      maxAge: 1000 * 60 * 60 * 24 * 7
    });

    res.json({
      message: 'Logged in',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio
      }
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});



router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    //sameSite: 'lax',
    //secure: false,
     secure: true,
      sameSite: "none"
  });

  res.json({ message: 'Logged out' });
});

router.post('/change-password', auth, async (req, res) => {
  const user = await User.findById(req.user.id);

  const isMatch = await bcrypt.compare(req.body.current, user.password);
  if (!isMatch) return res.status(400).json({ error: "Wrong password" });

  user.password = await bcrypt.hash(req.body.new, 10);
  await user.save();

  res.json({ message: "Password updated" });
});

router.post('/forgot-password', async (req, res) => {

  try {

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Email required'
      });
    }

    const user = await User.findOne({ email });

    // لا نكشف هل الحساب موجود أم لا
    if (!user) {
      return res.json({
        message: 'If this email exists, a reset code was sent.'
      });
    }

    // GENERATE CODE
    const resetCode =
      Math.floor(100000 + Math.random() * 900000).toString();

    user.resetPasswordCode = resetCode;

    user.resetPasswordExpires =
      Date.now() + 1000 * 60 * 10;

    await user.save();

    // SEND EMAIL
    await transporter.sendMail({

      from: '"Qevora" <abdelbassetelhajiri02@gmail.com>',

      to: email,

      subject: 'Reset Password Code',

      html: `
        <div style="font-family:Arial;padding:20px">

          <h2>Password Reset</h2>

          <p>Your password reset code is:</p>

          <h1
            style="
              color:#6366f1;
              letter-spacing:5px;
            "
          >
            ${resetCode}
          </h1>

          <p>
            This code expires in 10 minutes.
          </p>

        </div>
      `
    });

    res.json({
      message: 'Reset code sent'
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});

router.post('/verify-reset-code', async (req, res) => {

  try {

    const { email, code } = req.body;

    const user = await User.findOne({ email });

    if (!user) {

      return res.status(400).json({
        error: 'User not found'
      });

    }

    if (
      user.resetPasswordCode !== code
    ) {

      return res.status(400).json({
        error: 'Invalid code'
      });

    }

    if (
      user.resetPasswordExpires < Date.now()
    ) {

      return res.status(400).json({
        error: 'Code expired'
      });

    }

    res.json({
      success: true
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});

router.post('/update-password', async (req, res) => {

  try {

    const {
      email,
      newPassword
    } = req.body;

    const user = await User.findOne({ email });

    if (!user) {

      return res.status(400).json({
        error: 'User not found'
      });

    }

    // HASH PASSWORD
    const hashedPassword =
      await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;

    // CLEAR RESET DATA
    user.resetPasswordCode = null;

    user.resetPasswordExpires = null;

    await user.save();

    res.json({
      message: 'Password updated'
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});

/*
router.post('/reset-password', async (req, res) => {

  try {

    const {
      email,
      code,
      newPassword
    } = req.body;

    if (
      !email ||
      !code ||
      !newPassword
    ) {
      return res.status(400).json({
        error: 'All fields required'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        error: 'User not found'
      });
    }

    if (
      user.resetPasswordCode !== code
    ) {
      return res.status(400).json({
        error: 'Invalid code'
      });
    }

    if (
      user.resetPasswordExpires < Date.now()
    ) {
      return res.status(400).json({
        error: 'Code expired'
      });
    }

    // HASH NEW PASSWORD
    const hashedPassword =
      await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;

    // CLEAR RESET DATA
    user.resetPasswordCode = null;
    user.resetPasswordExpires = null;

    await user.save();

    res.json({
      message: 'Password reset successful'
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});
*/

router.delete('/delete-account', auth, async (req, res) => {
  await User.findByIdAndDelete(req.user.id);
  await Link.deleteMany({ userId: req.user.id });

  res.clearCookie('token');
  res.json({ message: "Account deleted" });
});


router.get('/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.json({
    id: user._id,

    username: user.username,
    fullName: user.fullName,

    bio: user.bio,
    avatar: user.avatar,
    theme: user.theme,

    phone: user.phone,
    whatsapp: user.whatsapp,

    city: user.city,
    region: user.region,
    address: user.address,

    farmName: user.farmName,
    farmType: user.farmType,
    experienceYears: user.experienceYears,

    socialIcons: user.socialIcons
  });
  /*
 res.json({
    id: user._id,
    username: user.username,
    avatar: user.avatar,
    bio: user.bio,
    theme: user.theme,
    socialIcons: user.socialIcons
  });*/

});

module.exports = router;
