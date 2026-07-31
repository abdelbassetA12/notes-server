
const mongoose = require("mongoose");

const EmailTemplateSchema = new mongoose.Schema({

    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true
    },

    name:{
        type:String,
        required:true
    },

    subject:{
        type:String,
        required:true
    },

    body:{
        type:String,
        required:true
    },

    isDefault:{
        type:Boolean,
        default:false
    }

},{
    timestamps:true
});

module.exports = mongoose.model(
    "EmailTemplate",
    EmailTemplateSchema
);
/*
const mongoose = require("mongoose");

const EmailTemplateSchema = new mongoose.Schema(
{
    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true,
        unique:true
    },

    subject:{
        type:String,
        required:true
    },

    body:{
        type:String,
        required:true
    }

},
{
    timestamps:true
}
);

module.exports = mongoose.model(
    "EmailTemplate",
    EmailTemplateSchema
);*/