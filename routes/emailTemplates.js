const express = require("express");
const router = express.Router();

const JobLead = require("../models/JobLead");
const auth = require("../middleware/auth");



const multer = require("multer");
const csv = require("csv-parser");

const XLSX = require("xlsx");
const fs = require("fs");
const sendJobEmail = require("../utils/jobMailer");


const EmailTemplate = require("../models/EmailTemplate");
router.post("/", auth, async(req,res)=>{

    const template = await EmailTemplate.create({

        user:req.user.id,

        name:req.body.name,

        subject:req.body.subject,

        body:req.body.body

    });

    res.json(template);

});

router.get("/", auth, async(req,res)=>{

    const templates = await EmailTemplate.find({

        user:req.user.id

    }).sort({

        isDefault:-1,

        updatedAt:-1

    });

    res.json(templates);

});
router.get("/:id", auth, async (req, res) => {

    const template = await EmailTemplate.findOne({

        _id: req.params.id,
        user: req.user.id

    });

    if (!template) {

        return res.status(404).json({
            message: "Template not found"
        });

    }

    res.json(template);

});

router.put("/:id", auth, async(req,res)=>{

    const template = await EmailTemplate.findOneAndUpdate(

        {

            _id:req.params.id,

            user:req.user.id

        },

        req.body,

        {

            new:true

        }

    );

    res.json(template);

});

router.delete("/:id", auth, async(req,res)=>{

    await EmailTemplate.findOneAndDelete({

        _id:req.params.id,

        user:req.user.id

    });

    res.json({

        success:true

    });

});

router.post("/:id/duplicate",auth,async(req,res)=>{

    const oldTemplate = await EmailTemplate.findOne({

        _id:req.params.id,

        user:req.user.id

    });

    const copy = await EmailTemplate.create({

        user:req.user.id,

        name:oldTemplate.name+" Copy",

        subject:oldTemplate.subject,

        body:oldTemplate.body

    });

    res.json(copy);

});

router.patch("/:id/default",auth,async(req,res)=>{

    await EmailTemplate.updateMany(

        {

            user:req.user.id

        },

        {

            isDefault:false

        }

    );

    await EmailTemplate.findByIdAndUpdate(

        req.params.id,

        {

            isDefault:true

        }

    );

    res.json({

        success:true

    });

});

 /*
router.post(
    "/template",
    auth,
    async (req,res)=>{

        try{

            const {subject,body}=req.body;

            const template =
                await EmailTemplate.findOneAndUpdate(

                    {
                        user:req.user.id
                    },

                    {
                        subject,
                        body
                    },

                    {
                        upsert:true,
                        new:true
                    }

                );

            res.json({

                success:true,
                template

            });

        }catch(err){

            res.status(500).json({

                success:false,
                error:err.message

            });

        }

    }
); */

module.exports = router;