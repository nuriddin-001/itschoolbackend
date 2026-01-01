const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// BAZAGA ULANISH
mongoose.connect('mongodb://127.0.0.1:27017/uchqorgon_school')
  .then(async () => {
      console.log('MongoDB bazaga ulandi!');
      await createDefaultAdmin();
  })
  .catch(err => console.error('Baza xatosi:', err));

// ================= MODELLAR =================

const UserSchema = new mongoose.Schema({
    name: String,
    phone: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, default: 'student' },
    status: { type: String, default: 'active' }, 
    schedule: { type: String, default: 'odd_days' }, 
    course: { type: String, default: 'Foundation' },
    parentId: { type: String, default: "" }, 
    examPermission: { allowed: { type: Boolean, default: false }, examId: { type: String, default: "" } },
    payments: [{ month: String, amount: Number, date: { type: Date, default: Date.now }, admin: String, comment: String }]
}, { timestamps: true });
const User = mongoose.model('User', UserSchema);

const ExamSchema = new mongoose.Schema({
    title: String, 
    course: String, 
    type: { type: String, default: 'regular' }, 
    questions: [{ 
        question: String,
        options: [String], 
        correctAnswer: Number 
    }],
    practicalTask: { description: String, resourceLink: String },
    createdAt: { type: Date, default: Date.now }
});
const Exam = mongoose.model('Exam', ExamSchema);

const ExamResultSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
    dailyScore: { type: Number, default: 0 },
    theoryScore: { type: Number, default: 0 }, 
    practicalScore: { type: Number, default: 0 }, 
    practicalFile: { type: String, default: "" }, 
    totalScore: { type: Number, default: 0 },
    finalPercentage: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    isFinished: { type: Boolean, default: false },
    date: { type: Date, default: Date.now }
});
const ExamResult = mongoose.model('ExamResult', ExamResultSchema);

const GroupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    time: { type: String, required: true },
    days: { type: String, required: true, default: 'odd_days' }, 
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    messages: [{ sender: String, text: String, file: String, fileName: String, time: String, createdAt: { type: Date, default: Date.now } }],
    attendance: [{ date: String, records: [{ studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, status: { type: String, default: 'absent' }, reason: String }] }],
    grades: [{ date: String, records: [{ studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, score: { type: Number, default: 0 }, comment: String }] }]
}, { timestamps: true });
const Group = mongoose.model('Group', GroupSchema);

const NotificationSchema = new mongoose.Schema({
    title: String, message: String, target: { type: String, enum: ['all', 'student', 'parent', 'individual'], default: 'all' }, userId: { type: String, default: "" }, createdAt: { type: Date, default: Date.now }
});
const Notification = mongoose.model('Notification', NotificationSchema);

async function createDefaultAdmin() { try { const adminExists = await User.findOne({ role: 'admin' }); if (!adminExists) { const hashedPassword = await bcrypt.hash('admin123', 10); await User.create({ name: "Bosh Admin", phone: "998901234567", password: hashedPassword, role: "admin", status: "active" }); console.log("✅ YANGI ADMIN YARATILDI!"); } } catch (error) { console.error(error); } }

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
});

const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ================= API YO'NALISHLAR =================

app.post('/api/register', async (req, res) => {
    try {
        const { name, phone, password, role, schedule, course, parentId, status } = req.body;
        if (!name || !phone || !password) return res.status(400).json({ message: "Ism, Telefon va Parol kiritilishi shart!" });
        const existingUser = await User.findOne({ phone });
        if (existingUser) return res.status(400).json({ message: "Bu telefon raqam allaqachon ro'yxatdan o'tgan!" });
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({ name, phone, password: hashedPassword, role: role || 'student', schedule: schedule || 'odd_days', course: course || 'Foundation', parentId: parentId || "", status: status || 'active' });
        res.json({ message: "Muvaffaqiyatli yaratildi!", user: newUser });
    } catch (error) {
        console.error("Register Xatosi:", error); 
        if (error.code === 11000) return res.status(400).json({ message: "Bu telefon raqam allaqachon mavjud!" });
        res.status(500).json({ error: "Server xatosi: " + error.message });
    }
});

app.get('/api/dashboard/stats', async (req, res) => { try { const studentsCount = await User.countDocuments({ role: 'student', $or: [{ status: 'active' }, { status: { $exists: false } }] }); const parentsCount = await User.countDocuments({ role: 'parent' }); const groupsCount = await Group.countDocuments(); res.json({ students: studentsCount, parents: parentsCount, groups: groupsCount }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/dashboard/finance', async (req, res) => { try { const students = await User.find({ role: 'student' }); const monthlyRevenue = {}; let totalRevenue = 0; students.forEach(student => { if (student.payments && student.payments.length > 0) { student.payments.forEach(payment => { if (!monthlyRevenue[payment.month]) { monthlyRevenue[payment.month] = 0; } monthlyRevenue[payment.month] += payment.amount; totalRevenue += payment.amount; }); } }); res.json({ monthlyRevenue, totalRevenue }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/dashboard/broadcast', async (req, res) => { try { const { title, message, target, userId } = req.body; const finalUserId = userId ? String(userId) : ""; const mainNotification = new Notification({ title, message, target, userId: finalUserId }); await mainNotification.save(); if (target === 'individual' && finalUserId) { const student = await User.findById(finalUserId); if (student && student.parentId) { const parentNotification = new Notification({ title: `Farzandingiz haqida: ${title}`, message: message, target: 'individual', userId: student.parentId }); await parentNotification.save(); } } res.json({ message: "Xabar yuborildi!", notification: mainNotification }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/notifications/:userId', async (req, res) => { try { const { userId } = req.params; const user = await User.findById(userId); if (!user) return res.status(404).json({ message: "User topilmadi" }); const searchId = String(user._id); const notifications = await Notification.find({ $or: [ { target: 'all' }, { target: user.role }, { target: 'individual', userId: searchId } ] }).sort({ createdAt: -1 }); res.json(notifications); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/payments/pay', async (req, res) => { try { const { userId, amount, month, comment } = req.body; const user = await User.findById(userId); if(!user) return res.status(404).json({ message: "User topilmadi" }); user.payments.push({ month, amount, admin: 'Admin', comment: comment || "Izohsiz" }); await user.save(); res.json(user); } catch (error) { res.status(500).json({ error: error.message }); } });
app.put('/api/users/:id', async (req, res) => { try { const { name, phone, password, role, schedule, course, parentId, status } = req.body; const updateData = { name, phone, role, schedule, course, parentId, status }; if (password && password.trim() !== "") updateData.password = await bcrypt.hash(password, 10); const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }); res.json(updatedUser); } catch (error) { res.status(500).json({ error: "Xatolik" }); } });
app.post('/api/login', async (req, res) => { try { const { phone, password } = req.body; const user = await User.findOne({ phone }); if (!user) return res.status(400).json({ message: "Topilmadi" }); const isMatch = await bcrypt.compare(password, user.password); if (!isMatch) return res.status(400).json({ message: "Parol xato" }); const token = jwt.sign({ id: user._id, role: user.role, name: user.name }, "maxfiy_kalit", { expiresIn: "1d" }); res.json({ token, user: { _id: user._id, name: user.name, role: user.role, phone: user.phone, course: user.course, schedule: user.schedule, payments: user.payments, parentId: user.parentId, status: user.status } }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/users', async (req, res) => { try { const users = await User.find().select('-password').sort({ createdAt: -1 }); res.json(users); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/groups', async (req, res) => { try { const groups = await Group.find().populate('students', 'name role phone'); res.json(groups); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/groups', async (req, res) => { try { const { name, time, days, selectedStudents } = req.body; const newGroup = new Group({ name, time, days, students: selectedStudents }); await newGroup.save(); res.json(newGroup); } catch (err) { res.status(500).json({ error: err.message }); } });
app.put('/api/groups/:id', async (req, res) => { try { const { name, time, days, selectedStudents } = req.body; const updatedGroup = await Group.findByIdAndUpdate(req.params.id, { name, time, days, students: selectedStudents }, { new: true }).populate('students', 'name role'); res.json(updatedGroup); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/groups/:id/attendance', async (req, res) => { try { const { date, records } = req.body; const group = await Group.findById(req.params.id); if (!group) return res.status(404).json({ message: "Topilmadi" }); const existingIndex = group.attendance.findIndex(a => a.date === date); if (existingIndex !== -1) group.attendance[existingIndex].records = records; else group.attendance.push({ date, records }); await group.save(); res.json(group); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/groups/:id/grades', async (req, res) => { try { const { date, records } = req.body; const group = await Group.findById(req.params.id); if (!group) return res.status(404).json({ message: "Guruh topilmadi" }); const existingIndex = group.grades.findIndex(g => g.date === date); if (existingIndex !== -1) group.grades[existingIndex].records = records; else group.grades.push({ date, records }); await group.save(); res.json(group); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/groups/:id/message', upload.single('file'), async (req, res) => { try { const { sender, text, time } = req.body; const group = await Group.findById(req.params.id); if (!group) return res.status(404).json({ message: "Topilmadi" }); let fileUrl = null, fileName = null; if (req.file) { fileUrl = `/uploads/${req.file.filename}`; fileName = req.file.originalname; } group.messages.push({ sender, text, file: fileUrl, fileName, time }); await group.save(); res.json(group); } catch (err) { if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') { return res.status(400).json({ message: "Fayl hajmi 5MB dan oshmasligi kerak!" }); } res.status(500).json({ error: err.message }); } });

// ================= IMTIHON LOGIKASI (YANGILANGAN) =================

app.post('/api/exams', async (req, res) => { 
    try { 
        const { title, course, type, questions, practicalTask } = req.body; 
        const newExam = await Exam.create({ title, course, type, questions, practicalTask }); 
        res.json(newExam); 
    } catch (err) { res.status(500).json({ error: err.message }); } 
});

app.get('/api/exams', async (req, res) => { 
    try { 
        const exams = await Exam.find().sort({ createdAt: -1 }); 
        res.json(exams); 
    } catch (err) { res.status(500).json({ error: err.message }); } 
});

app.put('/api/exams/:id', async (req, res) => { 
    try { 
        const { title, course, type, questions, practicalTask } = req.body; 
        const updatedExam = await Exam.findByIdAndUpdate(req.params.id, { title, course, type, questions, practicalTask }, { new: true }); 
        res.json(updatedExam); 
    } catch (err) { res.status(500).json({ error: err.message }); } 
});

app.delete('/api/exams/:id', async (req, res) => { 
    try { 
        await Exam.findByIdAndDelete(req.params.id); 
        res.json({ message: "Imtihon o'chirildi" }); 
    } catch (err) { res.status(500).json({ error: err.message }); } 
});

app.post('/api/users/permit-exam', async (req, res) => {
    try {
        const { userId, examId, allow } = req.body;
        await User.findByIdAndUpdate(userId, { examPermission: { allowed: allow, examId: allow ? examId : "" } });
        res.json({ message: "Ruxsat o'zgartirildi", status: allow });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/exams/:id/start-random', async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ message: "Imtihon topilmadi" });
        const shuffled = exam.questions.sort(() => 0.5 - Math.random());
        const selectedQuestions = shuffled.slice(0, 25);
        const clientExam = {
            _id: exam._id,
            title: exam.title,
            course: exam.course,
            practicalTask: exam.practicalTask,
            questions: selectedQuestions.map(q => ({
                _id: q._id,
                question: q.question,
                options: q.options
            }))
        };
        res.json(clientExam);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. Test javoblarini topshirish (TO'G'IRLANGAN LOGIKA)
app.post('/api/exams/submit-answers', async (req, res) => {
    try {
        const { userId, examId, answers } = req.body; 
        // answers arrayi keladi: [0, 1, 2, -1, 3] (indexlar)

        const exam = await Exam.findById(examId);
        if (!exam) return res.status(404).json({ message: "Imtihon topilmadi" });

        let correctCount = 0;
        const pointPerQuestion = 2; 

        // SAVOLLARNI TEKSHIRISH
        answers.forEach((answerIndex, index) => {
            // exam.questions dagi savollar ketma-ketligi frontenddagi bilan bir xil bo'lishi shart
            if (exam.questions[index] && exam.questions[index].correctAnswer === answerIndex) {
                correctCount++;
            }
        });

        const theoryScore = correctCount * pointPerQuestion;

        let result = await ExamResult.findOne({ studentId: userId, examId: examId });
        if (result) {
            result.theoryScore = theoryScore;
            await result.save();
        } else {
            result = await ExamResult.create({ 
                studentId: userId, 
                examId: examId, 
                theoryScore,
                dailyScore: 0,
                practicalScore: 0
            });
        }
        
        // Ruxsatni yopish
        await User.findByIdAndUpdate(userId, { examPermission: { allowed: false, examId: "" } });

        res.json({ message: "Test topshirildi", theoryScore });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/exams/upload-practical', upload.single('file'), async (req, res) => {
    try {
        const { userId, examId } = req.body;
        let fileUrl = "";
        if (req.file) fileUrl = `/uploads/${req.file.filename}`;
        let result = await ExamResult.findOne({ studentId: userId, examId: examId });
        if (result) {
            result.practicalFile = fileUrl;
            await result.save();
        } else {
            await ExamResult.create({ studentId: userId, examId: examId, practicalFile: fileUrl });
        }
        res.json({ message: "Fayl yuklandi", fileUrl });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/exams/results', async (req, res) => {
    try {
        const { studentId, examId, dailyScore, practicalScore, theoryScore } = req.body;
        let result = await ExamResult.findOne({ studentId, examId });
        if (!result) {
            result = new ExamResult({ studentId, examId, dailyScore: 0, theoryScore: 0, practicalScore: 0, isFinished: true });
        }
        const finalDaily = Math.min(parseInt(dailyScore) || 0, 60);       
        const finalPractical = Math.min(parseInt(practicalScore) || 0, 50); 
        let finalTheory = result.theoryScore || 0;
        if (theoryScore !== undefined && theoryScore !== null) {
            finalTheory = Math.min(parseInt(theoryScore), 50); 
        }
        const totalRaw = finalDaily + finalTheory + finalPractical; 
        const finalPercentage = (totalRaw / 1.6).toFixed(1);        
        const passed = finalPercentage >= 60;
        result.dailyScore = finalDaily;
        result.theoryScore = finalTheory;
        result.practicalScore = finalPractical;
        result.totalScore = totalRaw;
        result.finalPercentage = finalPercentage;
        result.passed = passed;
        result.isFinished = true;
        result.date = new Date();
        await result.save();
        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/exams/results', async (req, res) => {
    try {
        const results = await ExamResult.find().populate('studentId', 'name course').populate('examId', 'title').sort({ date: -1 });
        res.json(results);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server ${PORT}-portda ishlamoqda...`));