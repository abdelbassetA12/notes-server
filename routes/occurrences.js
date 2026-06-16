const router = require("express").Router();

const auth = require("../middleware/auth");

const TaskOccurrence =
require("../models/TaskOccurrence");


// COMPLETE
router.post(
"/:id/complete",
auth,
async (req,res)=>{

try{

const task =
await TaskOccurrence.findById(
req.params.id
);

task.completed = true;

task.completedAt = new Date();

task.progressValue =
task.targetValue;

await task.save();

res.json(task);

}
catch(err){

res.status(500).json({
error:err.message
});

}

});
module.exports = router;