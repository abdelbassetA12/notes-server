const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({

  // ===================================
  // AUTH
  // ===================================

  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  }, // اسم المستخدم

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  }, // البريد الإلكتروني

  password: {
    type: String,
    required: true,
    minlength: 6
  }, // كلمة المرور المشفرة

  isVerified: {
    type: Boolean,
    default: false
  }, // هل تم تفعيل الحساب

  verificationCode: String, // كود التفعيل

  verificationCodeExpires: Date, // انتهاء صلاحية كود التفعيل

  resetPasswordCode: String, // كود استعادة كلمة المرور

  resetPasswordExpires: Date, // انتهاء صلاحية الكود

  // ===================================
  // PROFILE
  // ===================================

 fullName: {
  type: String,
  default: ""
},
bio: {
  type: String,
  default: ""
},

avatar: {
  type: String,
  default: ""
},



  phone: {
  type: String,
  unique: true,
  sparse: true
}, // رقم الهاتف

  whatsapp:  {
  type: String,
  default: ""
}, // رقم الواتساب

  // ===================================
  // LOCATION
  // ===================================

city: {
  type: String,
  default: ""
},

  region: {
  type: String,
  default: ""
},

  address: {
  type: String,
  default: ""
},

  // ===================================
  // FARM INFORMATION
  // ===================================

  farmName: {
  type: String,
  default: ""
},

  farmType: {
    type: String,
    enum: [
      "commercial",
      "family",
      "organic",
      "breeding",
      "free_range"
    ]
  }, // نوع المزرعة

  experienceYears: {
    type: Number,
    default: 0
  }, // سنوات الخبرة

  // ===================================
  // SOCIAL MEDIA
  // ===================================

  socialIcons: [
    {
      platform: String,
      url: String,
      active: {
        type: Boolean,
        default: true
      }
    }
  ],


  notifications: {
  email: {
    type: Boolean,
    default: true
  },

  orders: {
    type: Boolean,
    default: true
  },

  messages: {
    type: Boolean,
    default: true
  }
},

  // ===================================
  // STATISTICS
  // ===================================

  totalSales: {
    type: Number,
    default: 0
  }, // عدد المبيعات

  totalPurchases: {
    type: Number,
    default: 0
  }, // عدد المشتريات

  productsCount: {
    type: Number,
    default: 0
  }, // عدد المنتجات المنشورة

  followersCount: {
    type: Number,
    default: 0
  }, // عدد المتابعين

  averageRating: {
    type: Number,
    default: 0
  }, // متوسط التقييم

  reviewsCount: {
    type: Number,
    default: 0
  }, // عدد التقييمات

  lastSeen: Date, // آخر نشاط للمستخدم
  isOnline: {
  type: Boolean,
  default: false
},
favorites: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: "Product"
}],

followers: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: "User"
}],

following: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: "User"
}],

  // ===================================
  // ACCOUNT
  // ===================================
    identityVerified: {
  type: Boolean,
  default: false
},
  isSellerVerified: {
    type: Boolean,
    default: false
  }, // بائع موثق


  isBlocked: {
    type: Boolean,
    default: false
  }, // محظور

  theme: {
    type: String,
    default: "theme1"
  },



  //خاص بنضام المهام 
  dailyStats: {
  streak: {
    type: Number,
    default: 0
  },

  totalCompleted: {
    type: Number,
    default: 0
  }
},
   //خاص بنضام المهام النهاية 





}, {
  timestamps: true
});

module.exports = mongoose.model("User", userSchema);
