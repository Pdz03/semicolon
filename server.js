require("dotenv").config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const app = express();
const path = require("path");

// --- KONEKSI DB ---
// --- KONEKSI DATABASE OPTIMIZED FOR VERCEL ---
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false, // Wajib false di serverless biar gak nunggu lama kalau putus
    };

    cached.promise = mongoose.connect(process.env.MONGODB_URI, opts).then((mongoose) => {
      console.log("✅ Terkoneksi ke MongoDB (Baru)");
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error("❌ Gagal koneksi DB:", e);
    throw e;
  }

  return cached.conn;
}

// Panggil fungsi connect di setiap request agar aman
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// --- SCHEMA ---
const MemorySchema = new mongoose.Schema({
    order: Number,
    type: { type: String, default: 'photo' }, // photo, chat, voice, collage
    image_url: String,
    caption: String,
    date: String,
    location: String,
    chat_data: [{
        sender: String, // 'me', 'her'
        text: String,
        time: String,
        quoted: String
    }],
    collage_data: [String] // Array of image URLs for collage
});
const SettingSchema = new mongoose.Schema({
    key: String,
    release_time: Date,
    unlock_code: String, // Kode dari kertas
    final_message: String,
    music_url: String
});

const Memory = mongoose.model('Memory', MemorySchema);
const Setting = mongoose.model('Setting', SettingSchema);

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
// --- INIT DATA (Jalankan sekali via browser: /init) ---
app.get('/init', async (req, res) => {
    // 1. Setup Settings
    await Setting.deleteMany({});
    await Setting.create({
        key: 'config',
        release_time: new Date('2026-02-08T09:00:00+07:00'),
        unlock_code: '191025010802', // Sesuaikan kode di kertas
        final_message: "Proses kompilasi rindu selesai.\n\nSekarang, letakkan HP-mu.\nTutup matamu.\n\nJangan buka sebelum aku bilang 'Selesai'.",
        music_url: "/music/khsk.mp3" // Ganti link lagumu nanti
    });

    // 2. Setup Memories (Story Sequence)
    await Memory.deleteMany({});
    const story = [
        // 1. Chat Curhat (Blue bubble)
        { 
            order: 1, 
            type: 'chat', 
            date: '6 Juli 2025', 
            location: 'Chat',
            chat_data: [
                { sender: 'me', text: 'mbak Ida, aku sepedaan, sebener e mau ke stadion, tapi baru setengah jalan kaki udah mau nyerah karena jalannya nanjak terus 😅', time: '7:20 am' },
                { sender: 'me', text: 'lewat jalan pedesaan yang jarang ada motor lewat pagi pagi', time: '7:26 am' }
            ]
        },
        // 2. Chat Realisasi Sepedaan
        {
            order: 2,
            type: 'chat',
            date: '12 Juli 2025',
            location: 'WhatsApp',
            chat_data: [
                { sender: 'her', text: 'Mas sesok sepedaan tak?', time: '6:36 pm' },
                { sender: 'me', text: 'sepedaan, gimana jadi ke colomadu?', time: '6:36 pm' },
                { sender: 'her', text: 'Jadii', time: '6:36 pm' },
                { sender: 'me', text: 'okey, tujuannya ke mana inii colomadu nya', time: '6:38 pm' }
            ]
        },
        // 3. Saran Content Creator
        {
            order: 3,
            type: 'chat',
            date: '2 Agustus 2025',
            location: 'Momentum',
            chat_data: [
                { sender: 'her', text: 'Mending anda jadi content creator aja mas. Ngajarin orang coding 😇', time: '8:17 pm' }
            ]
        },
        // 4. Minta Support
        {
            order: 4,
            type: 'chat',
            date: 'August 2025',
            location: 'WhatsApp',
            chat_data: [
                { sender: 'me', text: 'bismillah gasss\nsupport aku terus yaakk', time: '6:54 am', quoted: 'Realisasikan mas' }
            ]
        },
        // Dummy Photos for interval
        { order: 5, type: 'photo', image_url: "https://placehold.co/600x800/1a1a1a/FFF?text=Our+Moment+1", caption: "Melewati hari denganmu.", date: "September 2025", location: "Solo" },
        { order: 6, type: 'photo', image_url: "https://placehold.co/600x800/1a1a1a/FFF?text=Our+Moment+2", caption: "Setiap langkah ada ceritanya.", date: "Oktober 2025", location: "Yogyakarta" },
        
        // 5. VN Style / Question
        {
            order: 7,
            type: 'voice',
            date: 'Momen Berharga',
            location: 'Heart',
            caption: 'kamu bertanya, "are we more than friend?" di situ lah pertama kalinya rasaku semakin tergugah, hingga akhirnya aku benar benar akan memberanikan diri mengungkapkan rasa',
            chat_data: [
                { sender: 'me', text: 'nggak tau, iseng aja, wkwk (0:24)', time: '6:07 am' }
            ]
        },
        
        // Next Photos
        { order: 8, type: 'photo', image_url: "https://placehold.co/600x800/1a1a1a/FFF?text=Foto+Next", caption: "Dan cerita pun berlanjut...", date: "November 2025", location: "Magelang" },

        // 6. Final Collage
        {
            order: 9,
            type: 'collage',
            caption: 'dan banyak momen momen kecil tercipta juga sepanjang kita bersama ini',
            collage_data: [
                "https://placehold.co/300x400/222/FFF?text=Moment+1",
                "https://placehold.co/300x400/333/FFF?text=Moment+2",
                "https://placehold.co/300x400/444/FFF?text=Moment+3",
                "https://placehold.co/300x400/555/FFF?text=Moment+4",
                "https://placehold.co/300x400/666/FFF?text=Moment+5",
                "https://placehold.co/300x400/111/FFF?text=Moment+6",
                "https://placehold.co/300x400/777/FFF?text=Moment+7",
                "https://placehold.co/300x400/888/FFF?text=Moment+8"
            ]
        }
    ];
    await Memory.insertMany(story);

    res.send('Database Semicolon Re-Initialized with Full Story!');
});

// --- API ROUTES ---

// Cek Waktu & Status (Public)
app.get('/api/status', async (req, res) => {
    const config = await Setting.findOne({ key: 'config' });
    res.json(config);
});

// Login Kode
app.post('/api/login', async (req, res) => {
    const { code } = req.body;
    const config = await Setting.findOne({ key: 'config' });

    // Admin Bypass
    if (code === 'sajak-admin') return res.json({ success: true, role: 'admin' });

    // User Check
    if (code === config.unlock_code) {
        const now = new Date();
        
        return res.json({ success: true, role: 'user' });
    }
    return res.json({ success: false, reason: 'wrong_code' });
});

// Ambil Memories (Hanya kalau sudah login)
app.get('/api/memories', async (req, res) => {
    const memories = await Memory.find().sort({ order: 1 });
    res.json(memories);
});

// --- SERVER ---
if (process.env.NODE_ENV !== 'production') {
    const PORT = 3001;
    app.listen(PORT, () => console.log(`🚀 Semicolon running on port ${PORT}`));
}
module.exports = app;