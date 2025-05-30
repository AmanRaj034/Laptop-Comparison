const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  laptop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Laptop",
    required: true,
  },
  comment: {
    type: String,
    required: true,
  }
}, { timestamps: true });

module.exports = mongoose.model("Comment", commentSchema);
