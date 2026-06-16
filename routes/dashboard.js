const router = require("express").Router();

const auth = require("../middleware/auth");

const dayjs = require("dayjs");

const TaskOccurrence =
require("../models/TaskOccurrence");

const generateTasksForDate =
require("../utils/taskGenerator");

router.get("/today", auth, async (req, res) => {

  try {

    const today =
      dayjs().format("YYYY-MM-DD");

    await generateTasksForDate(
      req.user.id,
      today
    );

    const tasks =
      await TaskOccurrence.find({

        user: req.user.id,

        date: today

      }).sort({
        completed: 1,
        createdAt: 1
      });

    const total =
      tasks.length;

    const completed =
      tasks.filter(
        t => t.completed
      ).length;

    const pending =
      total - completed;

    const percent =
      total === 0
      ? 0
      : Math.round(
          completed /
          total *
          100
        );
         console.log(tasks);  

    res.json({

      tasks,

      stats: {

        total,

        completed,

        pending,

        percent

      }

    });
   

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});

router.get(
"/weekly",
auth,
async(req,res)=>{

try{

const data=[];

for(let i=6;i>=0;i--){

const date =
dayjs()
.subtract(i,"day")
.format("YYYY-MM-DD");

const count =
await TaskOccurrence.countDocuments({

user:req.user.id,

date,

completed:true

});

data.push({

day:
dayjs(date)
.format("ddd"),

completed:count

});

}

res.json(data);

}
catch(err){

res.status(500).json({
error:err.message
});

}

});

module.exports = router;