const router = require("express").Router();
const Category = require("../models/Category");
const auth = require("../middleware/auth");


// GET ALL


router.get("/", auth, async (req, res) => {
  try {

    const categories =
      await Category.find({
        user: req.user.id
      }).sort({ createdAt: -1 });

    res.json(categories);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }
});



// CREATE


router.post("/", auth, async (req, res) => {

  try {

    const {
      name,
      color,
      icon
    } = req.body;

    const category =
      await Category.create({

        user: req.user.id,

        name,

        color,

        icon

      });

    res.json(category);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});



// UPDATE
router.put("/:id", auth, async (req, res) => {

  try {

    const category =
      await Category.findOneAndUpdate(
        {
          _id: req.params.id,
          user: req.user.id
        },
        req.body,
        {
          new: true
        }
      );

    res.json(category);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});


// DELETE
router.delete("/:id", auth, async (req, res) => {

  try {

    await Category.deleteOne({
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

module.exports = router;