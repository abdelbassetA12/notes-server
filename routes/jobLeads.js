const express = require("express");
const router = express.Router();

const JobLead = require("../models/JobLead");
const auth = require("../middleware/auth");



const multer = require("multer");
const csv = require("csv-parser");

const XLSX = require("xlsx");
const fs = require("fs");
const sendJobEmail = require("../utils/jobMailer");

 
const upload = multer({
  dest: "uploads/"
});

router.post( "/import", auth, upload.single("file"),
  async (req, res) => {

    try {

      const rows = [];

      fs.createReadStream(
        req.file.path
      )
      .pipe(csv())
      .on("data", data => {

        rows.push({

          user: req.user.id,

          companyName:
            data.companyName,

          type:
            data.type || "hotel",

          country:
            data.country,

          city:
            data.city,

          email:
            data.email,

          phone:
            data.phone,

          website:
            data.website

        });

      })
      .on("end", async () => {

        await JobLead.insertMany(
          rows
        );

        fs.unlinkSync(
          req.file.path
        );

        res.json({
          success: true,
          imported:
            rows.length
        });

      });

    } catch (err) {

      res.status(500).json({
        error: err.message
      });

    }

  }
);

router.post( "/import-excel", auth, upload.single("file"),
  async (req, res) => {

    try {

      const workbook =
        XLSX.readFile(
          req.file.path
        );

      const sheetName =
        workbook.SheetNames[0];

      const worksheet =
        workbook.Sheets[sheetName];

      const data =
        XLSX.utils.sheet_to_json(
          worksheet
        );


        const leads = data.map(row => {

  const lead = {
    user: req.user.id,
    type: row.type || "hotel"
  };

  if (row.companyName) lead.companyName = row.companyName;
  if (row.country) lead.country = row.country;
  if (row.city) lead.city = row.city;
  if (row.email) lead.email = row.email;
  if (row.phone) lead.phone = row.phone;
  if (row.website) lead.website = row.website;
  if (row.contactPerson) lead.contactPerson = row.contactPerson;
  if (row.desiredJob) lead.desiredJob = row.desiredJob;

  return lead;

//}).filter(lead => lead.companyName);
}).filter(lead =>
  lead.companyName &&
  lead.email &&
  lead.email.trim() !== ""
);
    

      await JobLead.insertMany(
        leads
      );

      fs.unlinkSync(
        req.file.path
      );

      res.json({
        success: true,
        imported:
          leads.length
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        success: false,
        error: err.message
      });

    }

  }
);
// =====================================
// CREATE LEAD
// =====================================

router.post("/", auth, async (req, res) => {

  try {

    const lead = await JobLead.create({
      ...req.body,
      user: req.user.id
    });

    res.status(201).json({
      success: true,
      lead
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message
    });

  }

});

// =====================================
// GET ALL LEADS
// =====================================

router.get("/", auth, async (req, res) => {

  try {

    const {
      search,
      status,
      type,
      country,
      city,
      favorite,
      archived,
      page = 1,
      limit = 20
    } = req.query;

    const query = {
      user: req.user.id
    };

    // SEARCH

    if (search) {

      query.$or = [
        {
          companyName: {
            $regex: search,
            $options: "i"
          }
        },
        {
          country: {
            $regex: search,
            $options: "i"
          }
        },
        {
          city: {
            $regex: search,
            $options: "i"
          }
        },
        {
          email: {
            $regex: search,
            $options: "i"
          }
        }
      ];

    }

    // FILTERS

    if (status) {
      query.status = status;
    }

    if (type) {
      query.type = type;
    }

    if (country) {
      query.country = country;
    }

    if (city) {
      query.city = city;
    }

    if (favorite !== undefined) {
      query.favorite = favorite === "true";
    }

    if (archived !== undefined) {
      query.archived = archived === "true";
    }

    const leads = await JobLead.find(query)
      .sort({
        createdAt: -1
      })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await JobLead.countDocuments(
      query
    );

    res.json({
      success: true,
      leads,
      total,
      page: Number(page),
      pages: Math.ceil(
        total / Number(limit)
      )
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message
    });

  }

});



// =====================================
// UPDATE LEAD
// =====================================

router.put("/:id", auth, async (req, res) => {

  try {

    const lead =
      await JobLead.findOneAndUpdate(
        {
          _id: req.params.id,
          user: req.user.id
        },
        req.body,
        {
          new: true
        }
      );

    if (!lead) {

      return res.status(404).json({
        success: false,
        error: "Lead not found"
      });

    }

    res.json({
      success: true,
      lead
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      error: err.message
    });

  }

});

// =====================================
// UPDATE STATUS
// =====================================

router.patch( "/:id/status", auth, async (req, res) => {

    try {

      const lead =
        await JobLead.findOneAndUpdate(
          {
            _id: req.params.id,
            user: req.user.id
          },
          {
            status: req.body.status
          },
          {
            new: true
          }
        );

      if (!lead) {

        return res.status(404).json({
          success: false,
          error: "Lead not found"
        });

      }

      res.json({
        success: true,
        lead
      });

    } catch (err) {

      res.status(500).json({
        success: false,
        error: err.message
      });

    }

  }
);

// =====================================
// TOGGLE FAVORITE
// =====================================

router.patch( "/:id/favorite", auth, async (req, res) => {

    try {

      const lead = await JobLead.findOne({
        _id: req.params.id,
        user: req.user.id
      });

      if (!lead) {

        return res.status(404).json({
          success: false,
          error: "Lead not found"
        });

      }

      lead.favorite =
        !lead.favorite;

      await lead.save();

      res.json({
        success: true,
        lead
      });

    } catch (err) {

      res.status(500).json({
        success: false,
        error: err.message
      });

    }

  }
);

// =====================================
// TOGGLE ARCHIVE
// =====================================

router.patch( "/:id/archive", auth, async (req, res) => {

    try {

      const lead = await JobLead.findOne({
        _id: req.params.id,
        user: req.user.id
      });

      if (!lead) {

        return res.status(404).json({
          success: false,
          error: "Lead not found"
        });

      }

      lead.archived =
        !lead.archived;

      await lead.save();

      res.json({
        success: true,
        lead
      });

    } catch (err) {

      res.status(500).json({
        success: false,
        error: err.message
      });

    }

  }
);

// =====================================
// DELETE LEAD
// =====================================

router.delete( "/:id", auth, async (req, res) => {

    try {

      const lead =
        await JobLead.findOneAndDelete({
          _id: req.params.id,
          user: req.user.id
        });

      if (!lead) {

        return res.status(404).json({
          success: false,
          error: "Lead not found"
        });

      }

      res.json({
        success: true,
        message: "Lead deleted"
      });

    } catch (err) {

      res.status(500).json({
        success: false,
        error: err.message
      });

    }

  }
);

// =====================================
// DASHBOARD STATS
// =====================================

router.get( "/stats/overview", auth, async (req, res) => {

    try {

      const user = req.user.id;

      const total =
        await JobLead.countDocuments({
          user
        });

      const hotels =
        await JobLead.countDocuments({
          user,
          type: "hotel"
        });

      const restaurants =
        await JobLead.countDocuments({
          user,
          type: "restaurant"
        });

      const interviews =
        await JobLead.countDocuments({
          user,
          status: "interview"
        });

      const accepted =
        await JobLead.countDocuments({
          user,
          status: "accepted"
        });

      const waiting =
        await JobLead.countDocuments({
          user,
          status: "waiting_reply"
        });

      const emailsSent =
        await JobLead.countDocuments({
          user,
          status: {
            $in: [
              "email_sent",
              "waiting_reply",
              "interview",
              "accepted",
              "rejected"
            ]
          }
        });

      res.json({
        total,
        hotels,
        restaurants,
        interviews,
        accepted,
        waiting,
        emailsSent
      });

    } catch (err) {

      res.status(500).json({
        success: false,
        error: err.message
      });

    }

  }
);










// =====================================
// FILTERS
// =====================================

router.get("/filters", auth, async (req, res) => {

    try {

        const countries = await JobLead.distinct(
            "country",
            {
                user: req.user.id,
                country: {
                    $ne: ""
                }
            }
        );

        const cities = await JobLead.find(
            {
                user: req.user.id,
                city: {
                    $ne: ""
                }
            },
            "country city"
        );

        const result = {};

        cities.forEach(item => {

            if (!result[item.country]) {

                result[item.country] = [];

            }

            if (
                !result[item.country].includes(item.city)
            ) {

                result[item.country].push(item.city);

            }

        });

        res.json({

            success: true,

            countries,

            cities: result

        });

    } catch (err) {

        res.status(500).json({

            success: false,

            error: err.message

        });

    }

});



router.get("/emails", auth, async (req, res) => {

    const {
        search,
        status,
        type,
        country,
        city
    } = req.query;

    const query = {
        user: req.user.id
    };

    if (search) {
        query.$or = [
            {
                companyName: {
                    $regex: search,
                    $options: "i"
                }
            },
            {
                email: {
                    $regex: search,
                    $options: "i"
                }
            }
        ];
    }

    if (status) query.status = status;
    if (type) query.type = type;
    if (country) query.country = country;
    if (city) query.city = city;

    const leads = await JobLead.find(
        query,
        "email"
    );

    const emails = leads
        .filter(l => l.email)
        .map(l => l.email.trim());

    res.json({
        success: true,
        count: emails.length,
        emails
    });

});


 


router.post("/send", auth, async (req, res) => {

    try {

        const {
            search,
            status,
            type,
            country,
            city
        } = req.body;

        const query = {
            user: req.user.id,
            email: { $ne: "" }
        };

        if (search) {
            query.$or = [
                {
                    companyName: {
                        $regex: search,
                        $options: "i"
                    }
                },
                {
                    email: {
                        $regex: search,
                        $options: "i"
                    }
                }
            ];
        }

        if (status) query.status = status;
        if (type) query.type = type;
        if (country) query.country = country;
        if (city) query.city = city;

        const leads = await JobLead.find(query);

        let success = 0;
        let failed = 0;

        for (const lead of leads) {

            try {

                await sendJobEmail({

                    
                      to: lead.email,
                    company: lead.companyName

                });

                success++;

            } catch (err) {

                failed++;
                console.log(err);

            }

        }

        res.json({

            success: true,
            sent: success,
            failed,
            message: `${success} emails sent successfully.`

        });

    } catch (err) {

        res.status(500).json({

            success: false,
            error: err.message

        });

    }

});



// =====================================
// GET SINGLE LEAD
// =====================================

router.get("/:id", auth, async (req, res) => {

  try {

    const lead = await JobLead.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!lead) {

      return res.status(404).json({
        success: false,
        error: "Lead not found"
      });

    }

    res.json({
      success: true,
      lead
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      error: err.message
    });

  }

});

module.exports = router;