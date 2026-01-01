const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  time: { type: String, required: true }, // Dars vaqti
  students: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' // User modeliga bog'laymiz
  }],
  messages: [{
    sender: String,      // Kim yozdi: 'Admin' yoki O'quvchi ismi
    text: String,
    file: String,        // Fayl nomi (agar bo'lsa)
    time: String,
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Group', groupSchema);