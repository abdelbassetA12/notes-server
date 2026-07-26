const router = require("express").Router();

const auth = require("../middleware/auth");

const RecurringTask =
require("../models/RecurringTask");

const Category =
require("../models/Category");


// GET TASKS
router.get("/", auth, async (req, res) => {

  try {

    const tasks =
      await RecurringTask.find({
        user: req.user.id
      })
      .populate("category")
      .sort({ createdAt: -1 });

    res.json(tasks);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});


// CREATE TASK
router.post("/", auth, async (req, res) => {

  try {

    const {

      category,

      title,

      description,

      priority,

      frequencyType,

      everyXDays,

      weekDays,

      monthDay,

      targetValue,

      targetUnit,

      weeklyTarget,

      preferredTime,

      startDate

    } = req.body;

    const task =
      await RecurringTask.create({

        user: req.user.id,

        category,

        title,

        description,

        priority,

        frequencyType,

        everyXDays,

        weekDays,

        monthDay,

        targetValue,

        targetUnit,

        weeklyTarget,

        preferredTime,

        startDate

      });

    res.json(task);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});


// UPDATE
router.put("/:id", auth, async (req, res) => {
  
  try {

    const task =
      await RecurringTask.findOneAndUpdate(

        {
          _id: req.params.id,
          user: req.user.id
        },

        req.body,

        {
          new: true
        }

      );

    res.json(task);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});


// DELETE
router.delete("/:id", auth, async (req, res) => {

  try {

    await RecurringTask.deleteOne({
      _id: req.params.id,
      user: req.user.id
    });

    res.json({
      success: true
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});


// ACTIVATE / DEACTIVATE
router.patch("/:id/toggle", auth, async (req, res) => {

  try {

    const task =
      await RecurringTask.findOne({
        _id: req.params.id,
        user: req.user.id
      });

    task.active = !task.active;

    await task.save();

    res.json(task);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});

module.exports = router;