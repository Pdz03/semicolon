require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const app = express();
const path = require("path");
const http = require("http").createServer(app); // Wajib pakai http server untuk socket
const io = require("socket.io")(http);



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

    cached.promise = mongoose
      .connect(process.env.MONGODB_URI, opts)
      .then((mongoose) => {
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
  type: { type: String, default: "photo" }, // photo, chat, voice, collage
  image_url: String,
  caption: String,
  date: String,
  location: String,
  chat_data: [
    {
      sender: String, // 'me', 'her'
      text: String,
      time: String,
      quoted: String,
    },
  ],
  collage_data: [String], // Array of image URLs for collage
});
const SettingSchema = new mongoose.Schema({
  key: String,
  release_time: Date,
  unlock_code: String, // Kode dari kertas
  final_message: String,
  music_url: String,
});

const Memory = mongoose.model("Memory", MemorySchema);
const Setting = mongoose.model("Setting", SettingSchema);

// --- SCHEMA V2: CHAT HISTORY & SESSION ---
const ChatMessageSchema = new mongoose.Schema({
    session_id: String,
    sender: String, // 'fendi' (client) atau 'ida' (master)
    type: String,   // 'text', 'image', 'audio'
    content: String,
    created_at: { type: Date, default: Date.now }
});
const ChatMessage = mongoose.model('ChatMessage', ChatMessageSchema);

const SettingV2Schema = new mongoose.Schema({
    key: String,
    release_time: Date,
    dev_mode: { type: Boolean, default: true }, // Default true untuk masa testing
    step_timer: { type: Number, default: 60 }, // Timer menjauh (detik)
    current_session: { type: String, default: 'DEV_TEST_01' } // SESI DEFAULT
});
const SettingV2 = mongoose.model("SettingV2", SettingV2Schema);

// --- SCHEMA V2 TAMBAHAN ---
const LocationV2Schema = new mongoose.Schema({
  level: Number, // 1 sampai 5
  name: String, // Nama Wahana (Bisa diedit)
  lat: Number,
  lng: Number,
});
const TopicV2Schema = new mongoose.Schema({
  text: String,
  isActive: { type: Boolean, default: true }, // Fendi bisa on/off kan ini
});
const QuestionV2Schema = new mongoose.Schema({
  level: Number, // Level 1 (Mudah) sampai 5 (Susah)
  text: String, // Teks soal untuk dibacakan
  answer: String, // Jawaban angka
});

const LocationV2 = mongoose.model("LocationV2", LocationV2Schema);
const TopicV2 = mongoose.model("TopicV2", TopicV2Schema);
const QuestionV2 = mongoose.model("QuestionV2", QuestionV2Schema);

let gameState = {
    masterCode: null,
    currentLevel: 1,
    currentSubLevel: 1, // Menyimpan urutan soal (1 sampai 3)
    usedQuestions: [],  // Array Anti-Duplikat Soal
    usedTopics: [],     // Array Anti-Duplikat Topik Deep Talk
    paperCodes: ["3517", "4913"], // GANTI dengan 2 kode rahasia di kertasmu
    selectedWeeks: []
};

// Fungsi Pintar Mengambil Data (Biar bisa dipanggil berulang)
async function sendQuestionAndTopic() {
    const level = gameState.currentLevel;

    // 1. Ambil 1 Soal (Sesuai Level) yang BELUM PERNAH dipakai
    let questions = await QuestionV2.find({ 
        level: level, 
        _id: { $nin: gameState.usedQuestions } 
    });
    
    // Fallback: Kalau stok soal di level ini habis, reset tracker untuk level ini
    if (questions.length === 0) {
        questions = await QuestionV2.find({ level: level });
    }
    const randomQ = questions[Math.floor(Math.random() * questions.length)];
    gameState.usedQuestions.push(randomQ._id); // Catat soal ini udah kepakai

    // 2. Ambil 1 Topik Deep Talk yang BELUM PERNAH dipakai
    let topics = await TopicV2.find({ 
        isActive: true, 
        _id: { $nin: gameState.usedTopics } 
    });
    
    if (topics.length === 0) {
        topics = await TopicV2.find({ isActive: true });
    }
    const randomT = topics[Math.floor(Math.random() * topics.length)];
    gameState.usedTopics.push(randomT._id); // Catat topik ini udah kepakai

    // 3. Penentuan Role (Gantian Jawab PER WAHANA/LEVEL, bukan per soal)
    const readerDevice = (level % 2 !== 0) ? 'client' : 'master';

const config = await SettingV2.findOne({ key: 'config_v2' }); // Ambil status dev_mode

    io.to('cengklik_room').emit('start_level', {
        level: level,
        subLevel: gameState.currentSubLevel,
        questionText: randomQ.text,
        correctAnswer: randomQ.answer,
        topicText: randomT.text,
        reader: readerDevice,
        isDevMode: config.dev_mode // <-- Kirim status ini ke frontend
    });
}

// --- SOCKET.IO LOGIC ---
io.on("connection", (socket) => {
  console.log("📱 Device Terhubung:", socket.id);

  // ==========================================
  // TAHAP 1: SINKRONISASI KODE (PAIRING)
  // ==========================================

  // HP Master (Dipegang Ida) mengirim kode hasil generate sidik jari
  socket.on("master_set_code", (code) => {
    gameState.masterCode = code;
    socket.join("cengklik_room"); // Masuk ke room khusus kalian
    console.log("🔑 Master Code Set:", code);
  });

  // HP Client (Dipegang Fendi) mencoba memasukkan kode
  socket.on("client_submit_code", (code) => {
    // TAMPILKAN LOG DI TERMINAL SERVER
    console.log(`[DEBUG] Master simpan kode: '${gameState.masterCode}'`);
    console.log(`[DEBUG] Client kirim kode: '${code}'`);

    if (code === gameState.masterCode) {
      socket.join("cengklik_room");
      io.to("cengklik_room").emit("pairing_success");
      console.log("✅ PAIRING MATCH!");
    } else {
      socket.emit("pairing_failed");
      console.log("❌ PAIRING GAGAL!");
    }
  });

  // ==========================================
  // TAHAP 2: GAME LOOP & GANTIAN JAWAB
  // ==========================================

  // Saat GPS sampai di Wahana Baru
    socket.on('gps_arrived', async (level) => {
        gameState.currentLevel = level;
        gameState.currentSubLevel = 1; // Mulai dari soal pertama
        await sendQuestionAndTopic();
    });

  // Buka Deep Talk kalau jawaban benar
// Buka Deep Talk kalau jawaban benar
    socket.on('answer_correct', () => {
        io.to('cengklik_room').emit('unlock_deeptalk', {
            level: gameState.currentLevel,
            subLevel: gameState.currentSubLevel
        });
    });

    // Fitur Skip dari Dev Mode
    socket.on('skip_question', () => {
        io.to('cengklik_room').emit('unlock_deeptalk', {
            level: gameState.currentLevel,
            subLevel: gameState.currentSubLevel
        });
    });

    // Saat diklik "LANJUT" dari layar Deep Talk
    socket.on('request_next_step', async () => {
        if (gameState.currentSubLevel < 2) {
            // Lanjut soal ke-2 atau ke-3
            gameState.currentSubLevel++;
            await sendQuestionAndTopic();
        } else {
            // Level selesai (2 soal terjawab)
            if (gameState.currentLevel >= 5) {
                // JIKA LEVEL 5 SELESAI -> MASUK BABAK FINAL!
                io.to('cengklik_room').emit('start_endgame');
            } else {
                // JIKA BELUM LEVEL 5 -> KEMBALI KE RADAR, NAIK LEVEL
                gameState.currentLevel++; 
                io.to('cengklik_room').emit('back_to_radar');
            }
        }
    });
  // ==========================================
  // TAHAP 3: THE ENDGAME SCENE
  // ==========================================

  // 3.1 Konfirmasi Kertas
  socket.on("verify_paper", (codes) => {
    // codes = { code1: '1234', code2: '5678' }
    if (
      codes.code1 === gameState.paperCodes[0] &&
      codes.code2 === gameState.paperCodes[1]
    ) {
     io.to('cengklik_room').emit('paper_success');
        } else {
            socket.emit('paper_failed');
        }
  });

  socket.on('submit_paper_answer', (answer) => {
        socket.broadcast.to('cengklik_room').emit('receive_paper_answer', answer);
    });

  // 2. Minta durasi timer ke server
    socket.on('request_timer', async () => {
        const config = await SettingV2.findOne({ key: 'config_v2' });
        io.to('cengklik_room').emit('start_step_away', config.step_timer || 60);
    });

    // 3. Konfirmasi sudah menjauh / Timer habis
    socket.on('trigger_chat_session', () => {
        io.to('cengklik_room').emit('open_chat_session');
    });

    // 4. Terima dan Broadcast Media (VN, Teks, Foto)
// Terima, Simpan ke DB, lalu Broadcast Media
    socket.on('send_media', async (data) => {
        // 1. Ambil nama sesi yang sedang aktif saat ini
        const config = await SettingV2.findOne({ key: 'config_v2' });
        const activeSession = config.current_session || 'DEFAULT';

        // 2. Simpan obrolan ke Database MongoDB
        await ChatMessage.create({
            session_id: activeSession,
            sender: data.sender, // Menangkap siapa yang ngirim
            type: data.type,
            content: data.content
        });

        // 3. Lempar ke HP pasangannya supaya muncul di layar
        socket.broadcast.to('cengklik_room').emit('receive_media', data);
    });

    // 5. Akhiri Sesi & Buka Kalender
    socket.on('end_chat_session', () => {
        io.to('cengklik_room').emit('open_calendar');
    });

    // 6. Ida Submit Kalender
    socket.on('submit_calendar', (weeks) => {
        socket.broadcast.to('cengklik_room').emit('fendi_receive_calendar', weeks);
    });


  // 3.3 & 3.4 Kalender April
  socket.on("submit_april_weeks", (weeks) => {
    gameState.selectedWeeks = weeks;
    // Kirim pilihan minggu Ida ke HP Fendi
    socket.broadcast.to("cengklik_room").emit("show_fendi_response", weeks);
  });
});

app.use(bodyParser.json());

// Redirect root to /v2
app.get("/", (req, res) => {
  res.redirect("/v2");
});

// Fix asset paths for v1 (supporting relative paths like images/ and music/)
app.use("/v1/images", express.static(path.join(__dirname, "public/images")));
app.use("/v1/music", express.static(path.join(__dirname, "public/music")));

app.use(express.static(path.join(__dirname, "public")));
// --- INIT DATA (Jalankan sekali via browser: /init) ---
app.get("/init", async (req, res) => {
  // 1. Setup Settings
  await Setting.deleteMany({});
  await Setting.create({
    key: "config",
    release_time: new Date("2026-02-08T09:00:00+07:00"),
    unlock_code: "191025010802", // Sesuaikan kode di kertas
    final_message:
      "Proses kompilasi rindu selesai.\n\nSekarang, letakkan HP-mu.\nTutup matamu.\n\nJangan buka sebelum aku bilang 'Selesai'.",
    music_url: "/music/khsk.mp3", // Ganti link lagumu nanti
  });

  // 2. Setup Memories (Story Sequence)
  await Memory.deleteMany({});
  const story = [
    // 1. Chat Curhat (Blue bubble)
    {
      order: 1,
      type: "chat",
      date: "6 Juli 2025",
      location: "Chat",
      chat_data: [
        {
          sender: "me",
          text: "mbak Ida, aku sepedaan, sebener e mau ke stadion, tapi baru setengah jalan kaki udah mau nyerah karena jalannya nanjak terus 😅",
          time: "7:20 am",
        },
        {
          sender: "me",
          text: "lewat jalan pedesaan yang jarang ada motor lewat pagi pagi",
          time: "7:26 am",
        },
      ],
    },
    // 2. Chat Realisasi Sepedaan
    {
      order: 2,
      type: "chat",
      date: "12 Juli 2025",
      location: "WhatsApp",
      chat_data: [
        { sender: "her", text: "Mas sesok sepedaan tak?", time: "6:36 pm" },
        {
          sender: "me",
          text: "sepedaan, gimana jadi ke colomadu?",
          time: "6:36 pm",
        },
        { sender: "her", text: "Jadii", time: "6:36 pm" },
        {
          sender: "me",
          text: "okey, tujuannya ke mana inii colomadu nya",
          time: "6:38 pm",
        },
      ],
    },
    // 3. Saran Content Creator
    {
      order: 3,
      type: "chat",
      date: "2 Agustus 2025",
      location: "Momentum",
      chat_data: [
        {
          sender: "her",
          text: "Mending anda jadi content creator aja mas. Ngajarin orang coding 😇",
          time: "8:17 pm",
        },
      ],
    },
    // 4. Minta Support
    {
      order: 4,
      type: "chat",
      date: "August 2025",
      location: "WhatsApp",
      chat_data: [
        {
          sender: "me",
          text: "bismillah gasss\nsupport aku terus yaakk",
          time: "6:54 am",
          quoted: "Realisasikan mas",
        },
      ],
    },
    // Dummy Photos for interval
    {
      order: 5,
      type: "photo",
      image_url: "https://placehold.co/600x800/1a1a1a/FFF?text=Our+Moment+1",
      caption: "Melewati hari denganmu.",
      date: "September 2025",
      location: "Solo",
    },
    {
      order: 6,
      type: "photo",
      image_url: "https://placehold.co/600x800/1a1a1a/FFF?text=Our+Moment+2",
      caption: "Setiap langkah ada ceritanya.",
      date: "Oktober 2025",
      location: "Yogyakarta",
    },

    // 5. VN Style / Question
    {
      order: 7,
      type: "voice",
      date: "Momen Berharga",
      location: "Heart",
      caption:
        'kamu bertanya, "are we more than friend?" di situ lah pertama kalinya rasaku semakin tergugah, hingga akhirnya aku benar benar akan memberanikan diri mengungkapkan rasa',
      chat_data: [
        {
          sender: "me",
          text: "nggak tau, iseng aja, wkwk (0:24)",
          time: "6:07 am",
        },
      ],
    },

    // Next Photos
    {
      order: 8,
      type: "photo",
      image_url: "https://placehold.co/600x800/1a1a1a/FFF?text=Foto+Next",
      caption: "Dan cerita pun berlanjut...",
      date: "November 2025",
      location: "Magelang",
    },

    // 6. Final Collage
    {
      order: 9,
      type: "collage",
      caption:
        "dan banyak momen momen kecil tercipta juga sepanjang kita bersama ini",
      collage_data: [
        "https://placehold.co/300x400/222/FFF?text=Moment+1",
        "https://placehold.co/300x400/333/FFF?text=Moment+2",
        "https://placehold.co/300x400/444/FFF?text=Moment+3",
        "https://placehold.co/300x400/555/FFF?text=Moment+4",
        "https://placehold.co/300x400/666/FFF?text=Moment+5",
        "https://placehold.co/300x400/111/FFF?text=Moment+6",
        "https://placehold.co/300x400/777/FFF?text=Moment+7",
        "https://placehold.co/300x400/888/FFF?text=Moment+8",
      ],
    },
  ];
  await Memory.insertMany(story);

  res.send("Database Semicolon Re-Initialized with Full Story!");
});

// --- INIT DATA V2 FULL (Buka /init-v2 di browser) ---
app.get("/init-v2", async (req, res) => {
  // 1. Init Config Time
  const exist = await SettingV2.findOne({ key: "config_v2" });
  if (!exist) {
    await SettingV2.create({
      key: "config_v2",
      release_time: new Date("2026-03-24T09:00:00+07:00"),
    });
  }

  // 2. Init Lokasi (5 Wahana Kosong untuk diisi di Admin)
  await LocationV2.deleteMany({});
  const locs = [];
  for (let i = 1; i <= 5; i++) {
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
    "Bayanganmu tentang kita berdua 5 tahun dari sekarang itu kayak gimana?",
  ];
  await TopicV2.insertMany(topics.map((t) => ({ text: t, isActive: true })));

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
    { level: 5, text: "√10000 / √100 = ?", answer: "10" },
  ];
  await QuestionV2.insertMany(questions);

  res.send("Database V2 Initialized with Locations, Topics, and Questions!");
});

// --- API ROUTES ---

// API: Ubah Sesi Aktif
app.post('/api/v2/admin/set-session', async (req, res) => {
    const { secret, session_name } = req.body;
    if(secret !== 'sajak-admin') return res.status(403).json({error: 'Ditolak'});
    
    await SettingV2.findOneAndUpdate({ key: 'config_v2' }, { current_session: session_name });
    res.json({ success: true, session_name });
});

// API: Lihat Riwayat Chat Berdasarkan Sesi (Bisa kamu buka di browser nanti)
app.get('/api/v2/chat-history/:session', async (req, res) => {
    const history = await ChatMessage.find({ session_id: req.params.session }).sort({ created_at: 1 });
    res.json(history);
});

// --- API ADMIN V2 ---
// Ambil semua data admin
app.get('/api/v2/admin/data', async (req, res) => {
    const config = await SettingV2.findOne({ key: 'config_v2' });
    const locs = await LocationV2.find().sort({level: 1});
    const topics = await TopicV2.find();
    const questions = await QuestionV2.find().sort({level: 1});
    res.json({ config, locs, topics, questions }); // Tambahkan config di sini
});

// API Toggle Dev Mode
app.post('/api/v2/admin/toggle-dev', async (req, res) => {
    const { secret, dev_mode } = req.body;
    if(secret !== 'sajak-admin') return res.status(403).json({error: 'Ditolak'});
    
    await SettingV2.findOneAndUpdate({ key: 'config_v2' }, { dev_mode: dev_mode });
    res.json({ success: true, dev_mode });
});
// Update Lokasi
app.post("/api/v2/admin/update-loc", async (req, res) => {
  const { id, name, lat, lng, secret } = req.body;
  if (secret !== "sajak-admin")
    return res.status(403).json({ error: "Ditolak" });
  await LocationV2.findByIdAndUpdate(id, { name, lat, lng });
  res.json({ success: true });
});

// Update Topik (Teks atau Status Aktif)
app.post("/api/v2/admin/update-topic", async (req, res) => {
  const { id, text, isActive, secret } = req.body;
  if (secret !== "sajak-admin")
    return res.status(403).json({ error: "Ditolak" });
  await TopicV2.findByIdAndUpdate(id, { text, isActive });
  res.json({ success: true });
});

// Ambil status v2 (bisa disesuaikan jika ingin beda config)
app.get("/api/v2/status", async (req, res) => {
  const config = await SettingV2.findOne({ key: "config_v2" });
  res.json(config);
});

// --- API ADMIN: UPDATE COUNTDOWN V2 ---
app.post("/api/v2/update-time", async (req, res) => {
  const { new_time, secret } = req.body;

  // Keamanan standar biar nggak ada yang iseng nembak API
  if (secret !== "sajak-admin") {
    return res.status(403).json({ error: "Akses Ditolak: Kode Admin Salah" });
  }

  const config = await SettingV2.findOne({ key: "config_v2" });
  if (!config) return res.status(404).json({ error: "Data V2 belum di-init" });

  config.release_time = new Date(new_time);
  await config.save();

  res.json({ success: true, message: "Waktu berhasil diupdate!" });
});

// Cek Waktu & Status (Public)
app.get("/api/status", async (req, res) => {
  const config = await Setting.findOne({ key: "config" });
  res.json(config);
});

// Login Kode
app.post("/api/login", async (req, res) => {
  const { code } = req.body;
  const config = await Setting.findOne({ key: "config" });

  // Admin Bypass
  if (code === "sajak-admin") return res.json({ success: true, role: "admin" });

  // User Check
  if (code === config.unlock_code) {
    const now = new Date();
    if (now < config.release_time) {
      return res.json({ success: false, reason: "not_released" });
    }
    return res.json({ success: true, role: "user" });
  }
  return res.json({ success: false, reason: "wrong_code" });
});

// Ambil Memories (Hanya kalau sudah login)
app.get("/api/memories", async (req, res) => {
  const memories = await Memory.find().sort({ order: 1 });
  res.json(memories);
});

// --- SERVER ---
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT ?? "3001";

  http.listen(PORT, () =>
    console.log(`Server is running at http://localhost:${PORT}`),
  );
}
module.exports = app;
