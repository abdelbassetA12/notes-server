const TaskOccurrence =
require("../models/TaskOccurrence");

const RecurringTask =
require("../models/RecurringTask");

const Category =
require("../models/Category");

const dayjs = require("dayjs");

async function generateTasksForDate(
  userId,
  date
) {

  const tasks =
    await RecurringTask.find({

      user: userId,

      active: true

    })
    .populate("category");

  const currentDay =
    dayjs(date).day();

  for (const task of tasks) {

    let shouldCreate = false;

    switch (task.frequencyType) {

      case "daily":

        shouldCreate = true;

        break;

      case "specific_days":

        shouldCreate =
          task.weekDays.includes(
            currentDay
          );

        break;

      case "weekly":

        shouldCreate = true;

        break;

      case "monthly":

        shouldCreate =
          dayjs(date).date() ===
          task.monthDay;

        break;

      case "every_x_days":

        const diff =
          dayjs(date).diff(
            dayjs(task.startDate),
            "day"
          );

        shouldCreate =
          diff %
          task.everyXDays === 0;

        break;

      default:

        break;
    }

    if (!shouldCreate) continue;
    
    await TaskOccurrence.updateOne(

  {
    task: task._id,
    date
  },

  {

    $set: {

      title: task.title,

      priority: task.priority,

      categoryName: task.category?.name || "",

      categoryColor: task.category?.color || "#6366F1",

      categoryIcon: task.category?.icon || "📁",

      targetValue: task.targetValue,

      targetUnit: task.targetUnit,

      preferredTime: task.preferredTime,

      description: task.description

    },

    $setOnInsert: {

      user: userId,

      task: task._id,

      date

    }

  },

  {
    upsert: true
  }

);
      /*
    await TaskOccurrence.updateOne(

      {
        task: task._id,
        date
      },

      {
        $setOnInsert: {

          user: userId,

          task: task._id,

          date,

          title: task.title,

          priority: task.priority,

          categoryName:
            task.category?.name || "",
            categoryColor:
            task.category?.color || "#6366F1",
            categoryIcon:
            task.category?.icon || "📁",

          targetValue:
            task.targetValue,

          targetUnit:
            task.targetUnit,
            preferredTime:
           task.preferredTime,
           

  description:
    task.description

        }

      },

      {
        upsert: true
      }

    );*/
     
  }
}

module.exports =
generateTasksForDate;