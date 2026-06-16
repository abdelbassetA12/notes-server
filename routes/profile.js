
const router = require('express').Router();

const User = require('../models/User');



const upload = require('../utils/upload');
const auth = require('../middleware/auth');

const geoip = require('geoip-lite');
const ogs = require('open-graph-scraper');

const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');

const ipaddr = require('ipaddr.js');



const Joi = require('joi');

const dns = require('dns').promises;
const { URL } = require('url');






// ======================================================
// RATE LIMIT
// ======================================================

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    error: "Too many requests"
  }
});

router.use(apiLimiter);


// ======================================================
// HELPERS
// ======================================================

function clean(value) {
  if (typeof value !== "string") return value;

  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {}
  }).trim();
}


function deepClean(obj) {

  if (typeof obj === 'string') {
    return clean(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(deepClean);
  }

  if (
    typeof obj === 'object' &&
    obj !== null
  ) {

    const cleaned = {};

    for (const key in obj) {
      cleaned[key] = deepClean(obj[key]);
    }

    return cleaned;
  }

  return obj;
}
function safeBoolean(value) {
  return value === true || value === "true";
}
/*
function safeBoolean(value) {
  return value === true;
}
  */

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.socket.remoteAddress ||
    req.ip
  );
}


// ======================================================
// SSRF PROTECTION
// ======================================================
async function isSafeUrl(urlString) {

  try {

    const parsed =
      new URL(urlString);

    if (
      !['http:', 'https:']
      .includes(parsed.protocol)
    ) {
      return false;
    }

    const hostname =
      parsed.hostname;

    const { address } =
      await dns.lookup(hostname);

    const addr =
      ipaddr.parse(address);

    if (
      addr.range() !== 'unicast'
    ) {
      return false;
    }

    return true;

  } catch {

    return false;

  }

}


// ======================================================
// VALIDATION
// ======================================================
const updateProfileSchema = Joi.object({

  username: Joi.string()
    .min(3)
    .max(30)
    .pattern(/^[\p{L}0-9_]+$/u),

  newUsername: Joi.string()
    .min(3)
    .max(30)
    .pattern(/^[\p{L}0-9_]+$/u),

  bio: Joi.string()
    .allow('')
    .max(500),

  avatar: Joi.string()
    .allow(''),

  theme: Joi.string()
    .valid(
      'theme1',
      'theme2',
      'dark',
      'minimal'
    )

}).unknown(true);




const addLinkSchema = Joi.object({
  username: Joi.string().required(),

  title: Joi.string()
    .max(100)
    .required(),

  type: Joi.string()
    .valid(
      "link",
      "video",
      "whatsapp",
      "youtube",
      "product",
      "form"
    )
    .required(),

  content: Joi.object().required(),

  active: Joi.boolean()
});


// ======================================================
// AVATAR
// ======================================================

router.post('/upload-avatar',
  auth,
  upload.single('avatar'),
  async (req, res) => {

    try {

      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded'
        });
      }

      const imageUrl =
        req.file.secure_url ||
        req.file.path;

      await User.findByIdAndUpdate(
        req.user.id,
        {
          avatar: imageUrl
        }
      );

      res.json({
        imageUrl
      });

    } catch (err) {

      res.status(500).json({
        error: err.message
      });

    }

  }
);







// ======================================================
// UPDATE PROFILE
// ======================================================

router.post('/update', auth, async (req, res) => {

  try {

    const { error } =
      updateProfileSchema.validate(req.body);

    if (error) {
        console.log(error.details);
      return res.status(400).json({
        error: error.details[0].message
      }); 
    }
    let {
  newUsername,
  fullName,
  bio,

  phone,
  whatsapp,

  city,
  region,
  address,

  farmName,
  farmType,
  experienceYears,

  avatar,
  theme
} = req.body;
/*
    let {
      newUsername,
      bio,
      avatar,
      theme
    } = req.body;
*/
    newUsername = clean(newUsername);
    bio = clean(bio);
    avatar = clean(avatar);

    const existing = await User.findOne({
      username: newUsername
    });

    if (
      existing &&
      existing._id.toString() !== req.user.id
    ) {
      return res.status(400).json({
        error: "Username already exists"
      });
    }
   const updates = {};

Object.keys(req.body).forEach((key) => {

  if (
    req.body[key] !== undefined &&
    req.body[key] !== ""
  ) {
    updates[key] = req.body[key];
  }

});



 const user = await User.findByIdAndUpdate(
        req.user.id,
        {
  username: newUsername,

  fullName,
  bio,

  phone,
  whatsapp,

  city,
  region,
  address,

  farmName,
  farmType,
  experienceYears,

  avatar,
  theme
},
      
        {
          new: true
        }
      );
      
   if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }
   res.json({
  _id: user._id,
  username: user.username,
  fullName: user.fullName,
  bio: user.bio,
  phone: user.phone,
  whatsapp: user.whatsapp,
  city: user.city,
  region: user.region,
  address: user.address,
  farmName: user.farmName,
  farmType: user.farmType,
  experienceYears: user.experienceYears,
  avatar: user.avatar,
  theme: user.theme
});

   
    //res.json(user);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});






// ============================
// إضافة أيقونة اجتماعية
// ============================
router.post('/add-social', auth , async (req, res) => {
  try {
    const { username, platform, url, active } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "User not found" });

    user.socialIcons.push({ platform, url, active: active ?? true });
    await user.save();
    res.json(user.socialIcons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// تحديث أيقونة اجتماعية
// ============================
router.post('/update-social', auth , async (req, res) => {
  try {
    const { username, index, platform, url, active } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.socialIcons[index]) return res.status(404).json({ error: "Social icon not found" });
    user.socialIcons[index] = { platform, url, active };
    await user.save();
    res.json(user.socialIcons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================
// حذف أيقونة اجتماعية
// ============================
router.post('/delete-social', auth , async (req, res) => {
  try {
    const { username, index } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "User not found" });

    user.socialIcons.splice(index, 1);
    await user.save();
    res.json(user.socialIcons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




// ======================================================
// REORDER LINKS
// ======================================================

router.post(
  '/reorder-links',
  auth,
  async (req, res) => {

    try {

      const { links } = req.body;

      if (!Array.isArray(links)) {
        return res.status(400).json({
          error: "Invalid links"
        });
      }

      for (const item of links) {

        const link =
          await Link.findById(item.id);

        if (!link) continue;

        if (
          link.userId.toString() !==
          req.user.id
        ) {
          continue;
        }

        link.order =
          Number(item.order) || 0;

        await link.save();

      }

      res.json({
        success: true
      });

    } catch (err) {

      res.status(500).json({
        error: err.message
      });

    }

  }
);


// ======================================================
// REDIRECT
// ======================================================

router.get('/redirect/:id', async (req, res) => {

  try {

    const link =
      await Link.findById(req.params.id);

    if (!link || !link.active) {
      return res.status(404).send(
        'Link not found'
      );
    }

    const ip = getClientIp(req);

    const geo = geoip.lookup(ip);

    const country =
      geo?.country || "Unknown";

    const date = new Date();

    await Link.findByIdAndUpdate(
      req.params.id,
      {
        $inc: {
          clicks: 1
        },

        $push: {
          clicksHistory: {
            ip,
            userAgent:
              req.headers['user-agent'],
            country,
            date
          }
        }
      }
    );

    let target = "";

    // =========================
    // LINK
    // =========================

    if (link.type === "link") {
      target = link.content?.url;
    }

    // =========================
    // VIDEO
    // =========================

    if (link.type === "video") {
      target = link.content?.videoUrl;
    }

    // =========================
    // WHATSAPP
    // =========================

    if (link.type === "whatsapp") {

      target =
        `https://wa.me/${
          link.content?.phone
        }?text=${
          encodeURIComponent(
            link.content?.message || ""
          )
        }`;

    }

    // =========================
    // YOUTUBE
    // =========================

    if (link.type === "youtube") {

      const url =
        link.content?.youtubeUrl;

      const mode =
        link.content?.youtubeMode;

      const videoId =
        extractYouTubeId(url);

      if (mode === "open") {
        target = url;
      }

      if (
        mode === "embed" &&
        videoId
      ) {
        target =
          `https://www.youtube.com/embed/${videoId}`;
      }

      if (mode === "channel") {
        target = url;
      }

      if (mode === "playlist") {

        const playlistId =
          extractPlaylistId(url);

        if (playlistId) {

          target =
            `https://www.youtube.com/playlist?list=${playlistId}`;

        }

      }

    }

    if (!target) {
      return res.status(400).send(
        "Invalid link"
      );
    }

    const safe =
  await isSafeUrl(target);

if (!safe) {

  return res
    .status(400)
    .send("Unsafe URL");

}

    // =========================
    // SAFE URL
    // =========================

    const parsed = new URL(target);

    if (
      !['http:', 'https:']
        .includes(parsed.protocol)
    ) {
      return res.status(400).send(
        "Invalid protocol"
      );
    }

    res.redirect(target);

  } catch (err) {

    res.status(500).send(
      'Server error'
    );

  }

});


// ======================================================
// ANALYTICS
// ======================================================

router.get(
  '/analytics/:username',
  auth,
  async (req, res) => {

    try {

      const username =
        clean(req.params.username);

      const user =
        await User.findOne({
          username
        });

      if (!user) {
        return res.status(404).json({
          error: "User not found"
        });
      }

      // IMPORTANT
      // OWNER ONLY

      if (
        user._id.toString() !==
        req.user.id
      ) {
        return res.status(403).json({
          error: "Unauthorized"
        });
      }

      const links = await Link.find({
        userId: user._id
      });

      let totalClicks = 0;

      const daily = {};

      const countries = {};

      links.forEach(link => {

        totalClicks +=
          link.clicks || 0;

        link.clicksHistory.forEach(c => {

          const day =
            new Date(c.date)
            .toISOString()
            .split("T")[0];

          daily[day] =
            (daily[day] || 0) + 1;

          const country =
            c.country || "Unknown";

          countries[country] =
            (countries[country] || 0) + 1;

        });

      });


      const topLink = links.length
  ? [...links].sort(
      (a, b) => (b.clicks || 0) - (a.clicks || 0)
    )[0]
  : null;

      res.json({

        totalClicks,

        totalLinks:
          links.length,

        daily,

        countries,

        links,
         topLink

      });

    } catch (err) {

      res.status(500).json({
        error: err.message
      });

    }

  }
);


// ======================================================
// FORM SUBMIT
// ======================================================

router.post(
  '/submit-form/:linkId',
  async (req, res) => {

    try {

      const link =
        await Link.findById(
          req.params.linkId
        );

      if (
        !link ||
        link.type !== "form"
      ) {
        return res.status(400).json({
          error: "Invalid form"
        });
      }
      const formData = deepClean(req.body);
      //const formData = req.body;

      for (
        let field of
        link.content.formFields
      ) {

        if (
          field.required &&
          !formData[field.label]
        ) {
          return res.status(400).json({
            error:
              `${field.label} is required`
          });
        }

      }

      const ip = getClientIp(req);

      const geo = geoip.lookup(ip);

      await FormSubmission.create({

        linkId: link._id,

        data: formData,

        ip,

        country:
          geo?.country || "Unknown"

      });

      res.json({

        success: true,

        message:
          link.content
          ?.formSettings
          ?.successMessage ||
          "Sent!"

      });

    } catch (err) {

      res.status(500).json({
        error: err.message
      });

    }

  }
);





// ======================================================
// GET USER
// ======================================================

router.get('/:username', async (req, res) => {

  try {

    const username = clean(req.params.username);

    const user = await User.findOne({
      username
    });

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    const links = await Link.find({
      userId: user._id
    }).sort({
      pinned: -1,
      order: 1
    });

    const products = await Product.find({
  seller: user._id,
  active: true
}).sort({
  createdAt: -1
});

const reviews = await Review.find({
  reviewedUser: user._id
})
.populate(
  "reviewer",
  "username avatar"
)
.sort({
  createdAt: -1
});


    res.json({
  user: {
    _id: user._id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    farmName: user.farmName,
    farmType: user.farmType,
    experienceYears: user.experienceYears,
    city: user.city,
    region: user.region,
    phone: user.phone,
    whatsapp: user.whatsapp,
    bio: user.bio,
    avatar: user.avatar,
    totalSales: user.totalSales,
    productsCount: user.productsCount,
    followersCount: user.followersCount,
    averageRating: user.averageRating,
    reviewsCount: user.reviewsCount,
    identityVerified: user.identityVerified,
    isSellerVerified: user.isSellerVerified,
    isOnline: user.isOnline,
    socialIcons: user.socialIcons
  },
  links,
   products,
   reviews
   
  
 
});
  

/*
    res.json({
      user,
      links
    });
    */

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});


module.exports = router;   