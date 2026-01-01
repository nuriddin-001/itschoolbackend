const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// 1. Bazaga ulanish
mongoose.connect('mongodb://127.0.0.1:27017/uchqorgon_school')
  .then(() => console.log('MongoDBga ulandik...'))
  .catch(err => console.error('Xatolik:', err));

// 2. User sxemasi (Server.js dagi bilan bir xil bo'lishi kk)
const UserSchema = new mongoose.Schema({
    name: String,
    phone: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, default: 'student' }
});

const User = mongoose.model('User', UserSchema);

const createAdmin = async () => {
    try {
        // Admin borligini tekshirish
        const exist = await User.findOne({ phone: "991234567" });
        if (exist) {
            console.log("Bu admin allaqachon bor!");
            process.exit();
        }

        // Parolni shifrlash (123 -> $2a$10$...)
        const hashedPassword = await bcrypt.hash("123", 10);

        // Admin yaratish
        const admin = new User({
            name: "Admin Boshliq",
            phone: "991234567",
            password: hashedPassword,
            role: "admin" // <-- ENG MUHIMI SHU
        });

        await admin.save();
        console.log("✅ ADMIN MUVAFFAQIYATLI YARATILDI!");
        console.log("Login: 991234567");
        console.log("Parol: 123");
    } catch (error) {
        console.error("Xatolik:", error);
    } finally {
        mongoose.connection.close();
    }
};

createAdmin();