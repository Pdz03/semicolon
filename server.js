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

const SettingV2Schema = new mongoose.Schema({
    key: String,
    release_time: Date
});
const SettingV2 = mongoose.model('SettingV2', SettingV2Schema);

app.use(bodyParser.json());

// Redirect root to /v2
app.get("/", (req, res) => {
    res.redirect("/v2");
});

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

// --- INIT DATA V2 FULL (Buka /init-v2 di browser) ---
app.get('/init-v2', async (req, res) => {
    // 1. Init Config Time
    const exist = await SettingV2.findOne({ key: 'config_v2' });
    if (!exist) {
        await SettingV2.create({ key: 'config_v2', release_time: new Date('2026-03-24T09:00:00+07:00') });
    }

    // 2. Init Lokasi (5 Wahana Kosong untuk diisi di Admin)
    await LocationV2.deleteMany({});
    const locs = [];
    for(let i=1; i<=5; i++) {
        locs.push({ level: i, name: `Wahana Level ${i}`, lat: 0, lng: 0 });
    }
    await LocationV2.insertMany(locs);

    // 3. Init 25 Topik Deep Talk
    await TopicV2.deleteMany({});
    const topics = [
        "Apa impresi pertamamu pas kita pertama kali jalan berdua dulu?",
        "Sebutkan satu hal kecil dari aku yang sering bikin kamu senyum sendiri.",
        "Apa ketakutan terbesarmu pas awal-awal kita mutusin buat LDR Magelang-Boyolali?",
        "Coba sebutin satu kebiasaan baruku yang baru kamu sadari akhir-akhir ini.",
        "Kalau hubungan kita ini ada soundtrack-nya, lagu apa yang paling cocok?",
        "Ekspektasi vs Realita: Apa yang paling beda setelah kita jadian dibanding pas PDKT?",
        "Momen apa yang paling bikin kamu deg-degan pas kita masih awal-awal deket?",
        "Kalau lagi jauh, hal apa dari aku yang paling sering kamu kangenin?",
        "Menurutmu, cara terbaik kita buat nyelesaiin beda pendapat itu gimana?",
        "Kalau dikasih tiket liburan berdua gratis, kamu pengen kita ke mana?",
        "Sifatku yang mana yang paling bikin kamu geregetan, tapi tetep kamu sayang?",
        "Perubahan paling positif apa yang kamu rasain di dirimu setelah kita bareng?",
        "Sebutin momen paling receh kita yang sampai sekarang masih bikin kamu ketawa.",
        "Bahasa cinta (Love Language) apa yang paling kerasa kamu dapetin dari aku?",
        "Hal apa yang pengen banget kamu lakuin bareng aku tapi belum kesampaian?",
        "Apa arti kata 'Pulang' atau 'Rumah' buat kamu sekarang?",
        "Gimana caramu meyakinkan diri waktu lagi capek atau ragu sama jarak kita?",
        "Coba deskripsiin hubungan kita saat ini pakai 3 kata aja.",
        "Kebiasaan anehku apa yang awalnya bikin kaget tapi akhirnya bisa kamu terima?",
        "Di momen apa kamu ngerasa paling dicintai sama aku?",
        "Hal apa yang bikin kamu ngerasa paling aman pas lagi sama aku?",
        "Apa yang paling kamu syukuri dari pertemuan kita di Solo/Jogja kemarin?",
        "Kalau kita bisa ulang satu hari dari masa lalu kita, hari apa yang kamu pilih?",
        "Apa pesan yang pengen banget kamu sampaikan ke aku tapi gengsi ngomongnya?",
        "Bayanganmu tentang kita berdua 5 tahun dari sekarang itu kayak gimana?"
    ];
    await TopicV2.insertMany(topics.map(t => ({ text: t, isActive: true })));

    // 4. Init 25 Bank Soal Matematika (5 Per Level) - Didesain untuk di-diktekan Fendi ke Ida
    await QuestionV2.deleteMany({});
    const questions = [
        // Level 1: Basic Math
        { level: 1, text: "(25 + 15) x 2 = ?", answer: "80" },
        { level: 1, text: "(100 / 4) + 15 = ?", answer: "40" },
        { level: 1, text: "(7 x 8) + 4 = ?", answer: "60" },
        { level: 1, text: "150 - 75 + 25 = ?", answer: "100" },
        { level: 1, text: "(250 / 2) + 25 = ?", answer: "150" },
        
        // Level 2: Pangkat & Akar
        { level: 2, text: "√144 x 3 = ?", answer: "36" },
        { level: 2, text: "(19 + 10) x 2 = ?", answer: "58" }, // Tanggal + Bulan
        { level: 2, text: "5² + 15 = ?", answer: "40" },
        { level: 2, text: "2⁴ x 3 = ?", answer: "48" },
        { level: 2, text: "√81 x √16 = ?", answer: "36" },
        
        // Level 3: Aljabar Dasar (Cari Variabel)
        { level: 3, text: "3a + 5 = 20. Berapa a?", answer: "5" },
        { level: 3, text: "2y - 10 = 20. Berapa y?", answer: "15" },
        { level: 3, text: "(10 + 5) x (10 - 5) = ?", answer: "75" },
        { level: 3, text: "4b - 8 = 16. Berapa b?", answer: "6" },
        { level: 3, text: "20% dari 150 = ?", answer: "30" },
        
        // Level 4: Logika Tipuan (BODMAS / KABATAKU)
        { level: 4, text: "2 + 2 x 4 = ?", answer: "10" }, 
        { level: 4, text: "(100 / 10) + 19 = ?", answer: "29" },
        { level: 4, text: "Jika x = 5, y = 4. Maka x² - y² = ?", answer: "9" },
        { level: 4, text: "√625 / 5 = ?", answer: "5" },
        { level: 4, text: "3³ - √49 = ?", answer: "20" },
        
        // Level 5: Rumit / Butuh Konsentrasi
        { level: 5, text: "((50 / 2) x 3) - 5 = ?", answer: "70" },
        { level: 5, text: "1000 / 8 = ?", answer: "125" },
        { level: 5, text: "(√225 x 2) - 10 = ?", answer: "20" },
        { level: 5, text: "(2026 - 2025) + 100 = ?", answer: "101" },
        { level: 5, text: "√10000 / √100 = ?", answer: "10" }
    ];
    await QuestionV2.insertMany(questions);

    res.send('Database V2 Initialized with Locations, Topics, and Questions!');
});


// --- API ROUTES ---

// --- API ADMIN V2 ---
// Ambil semua data
app.get('/api/v2/admin/data', async (req, res) => {
    const locs = await LocationV2.find().sort({level: 1});
    const topics = await TopicV2.find();
    const questions = await QuestionV2.find().sort({level: 1});
    res.json({ locs, topics, questions });
});

// Update Lokasi
app.post('/api/v2/admin/update-loc', async (req, res) => {
    const { id, name, lat, lng, secret } = req.body;
    if(secret !== 'sajak-admin') return res.status(403).json({error: 'Ditolak'});
    await LocationV2.findByIdAndUpdate(id, { name, lat, lng });
    res.json({success: true});
});

// Update Topik (Teks atau Status Aktif)
app.post('/api/v2/admin/update-topic', async (req, res) => {
    const { id, text, isActive, secret } = req.body;
    if(secret !== 'sajak-admin') return res.status(403).json({error: 'Ditolak'});
    await TopicV2.findByIdAndUpdate(id, { text, isActive });
    res.json({success: true});
});

// Ambil status v2 (bisa disesuaikan jika ingin beda config)
app.get('/api/v2/status', async (req, res) => {
    const config = await SettingV2.findOne({ key: 'config_v2' });
    res.json(config);
});

// --- API ADMIN: UPDATE COUNTDOWN V2 ---
app.post('/api/v2/update-time', async (req, res) => {
    const { new_time, secret } = req.body;
    
    // Keamanan standar biar nggak ada yang iseng nembak API
    if (secret !== 'sajak-admin') {
        return res.status(403).json({ error: 'Akses Ditolak: Kode Admin Salah' });
    }

    const config = await SettingV2.findOne({ key: 'config_v2' });
    if (!config) return res.status(404).json({ error: 'Data V2 belum di-init' });

    config.release_time = new Date(new_time);
    await config.save();
    
    res.json({ success: true, message: 'Waktu berhasil diupdate!' });
});

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
        if (now < config.release_time) {
            return res.json({ success: false, reason: 'not_released' });
        }
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
    const PORT = process.env.PORT ?? "3001";

    app.listen(PORT, () => console.log(`Server is running at http://localhost:${PORT}`));
}
module.exports = app;