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

app.use(express.json()); 
app.use(bodyParser.json()); 

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

// --- SCHEMA V3 (BARU) ---
const SettingV3Schema = new mongoose.Schema({
    key: String,
    release_time: Date
});
const SettingV3 = mongoose.model("SettingV3", SettingV3Schema);

const V3ProgressSchema = new mongoose.Schema({
    session_id: { type: String, default: "current_v3" },
    coordinates: [{ lat: Number, lng: Number }],
    current_step: { type: Number, default: 1 },
    solved_physical_indices: [Number],
    player_colors: { fendi: String, ida: String }
});
const V3Progress = mongoose.model("V3Progress", V3ProgressSchema);

const SettingV31Schema = new mongoose.Schema({
    key: String,
    release_time: Date
});
const SettingV31 = mongoose.model("SettingV31", SettingV31Schema);

const V31ProgressSchema = new mongoose.Schema({
    session_id: { type: String, default: "current_v31" },
    coordinates: [{ lat: Number, lng: Number, label: String, code: String }],
    solved_pairs: [Number],
    assigned_codes: [String],
    last_sync_number: Number,
    final_map_seen: { type: Boolean, default: false }
});
const V31Progress = mongoose.model("V31Progress", V31ProgressSchema);

let v3State = {
    current_number: null,
    jasuke: { current_flag: 1, is_solved: false, data: {}, coordinates: [] },
    telur_gulung: {
        suwit_score: { fendi: 0, ida: 0 },
        suwit_choices: { fendi: null, ida: null },
        winner_bo5: null,
        player_colors: { fendi: null, ida: null }, // fendi: 'biru', ida: 'kuning'
        finding_results: [],
        current_step: 1,           // Progres reward (1 sampai 5)
        active_pair_index: null,   // Indeks di physicalPairs yang sedang dikerjakan
        solved_physical_indices: [], // Indeks physicalPairs yang sudah selesai
        scanned_colors: { biru: false, kuning: false },
        current_turn: null
    },
    terang_bulan: { collected_flags: [] }
};

const v31QuestionBank = [
    "Kalau ada masa sibuk yang bikin salah satu terasa sendirian, bentuk perhatian apa yang paling ingin kamu terima?",
    "Dalam masa menuju pernikahan, hal apa yang paling perlu kita jaga: komunikasi, kejujuran, atau cara meredakan ego? Kenapa?",
    "Kalau nanti kita sedang capek dan mudah tersulut, kode kecil apa yang bisa jadi tanda untuk berhenti menyerang dan mulai merangkul?",
    "Apa ketakutan paling nyata tentang masa depan hubungan ini, dan bagaimana caranya kita hadapi sebagai satu tim?"
];

const v31RewardSteps = {
    1: { type: "question", content: v31QuestionBank[0] },
    2: { type: "puzzle", content: [1, 2] },
    3: { type: "question", content: v31QuestionBank[2] },
    4: { type: "puzzle", content: [3, 4] },
    5: { type: "question", content: v31QuestionBank[4] }
};

// const v31PhysicalPairs = [
//     { label: "A", biru: "628ab0b59b05dd46", kuning: "V31-KUNING-A" },
//     { label: "B", biru: "3da9778e20bea48a", kuning: "V31-KUNING-B" },
//     { label: "C", biru: "V31-BIRU-C", kuning: "V31-KUNING-C" },
//     { label: "D", biru: "V31-BIRU-D", kuning: "V31-KUNING-D" },
//     { label: "E", biru: "V31-BIRU-E", kuning: "V31-KUNING-E" }
// ];

const V31physicalPairs = [
    { label: "A", biru: "628ab0b59b05dd46", kuning: "5721916a61b93811" },
    { label: "B", biru: "3da9778e20bea48a", kuning: "359f4922cb28e0c7" },
    { label: "C", biru: "0816e0edb64188e9", kuning: "ce5c0b55ed766dec" },
    { label: "D", biru: "0365bbcce40aa2f9", kuning: "a5f8fe43bc6a4161" },
    { label: "E", biru: "61ff890dc644acd7", kuning: "2cbd4a7f98afc591" }
];

const v31FlagCodes = ["depalandua", "duaempattiga", "duabelasempat"];

function buildV31JasukeQuestion(flag) {
    const j = Math.floor(Math.random() * 8) + 3;
    const s = Math.floor(Math.random() * 6) + 2;
    const k = Math.floor(Math.random() * 5) + 2;
    const templates = [
        { formula: `2J + S - K`, ans: (2 * j) + s - k },
        { formula: `J + 3S - K`, ans: j + (3 * s) - k },
        { formula: `2J + 2S + K`, ans: (2 * j) + (2 * s) + k },
        { formula: `4S + K - J`, ans: (4 * s) + k - j },
        { formula: `3K + J + S`, ans: (3 * k) + j + s }
    ];
    const chosen = templates[(flag - 1) % templates.length];
    return { flag, j, s, k, ...chosen };
}

function getFreshV31State() {
    return {
        current_number: null,
        stage: "sync",
        intro_ready: { ida: false, fendi: false },
        jasuke: {
            current_flag: 1,
            active_question: null,
            current_turn: "ida",
            coords_saved: 0,
            intro_ready: { ida: false, fendi: false }
        },
        telur_gulung: {
            intro_ready: { ida: false, fendi: false },
            suwit_score: { ida: 0, fendi: 0 },
            suwit_choices: { ida: null, fendi: null },
            final_winner: null,
            player_colors: { ida: null, fendi: null },
            hiding_started: false,
            hide_deadline: null,
            finding_started: { ida: null, fendi: null },
            finding_finished: [],
            first_finder: null,
            current_turn: null,
            active_pair_index: null,
            first_scan: null,
            solved_pairs: []
        },
        terang_bulan: {
            intro_ready: { ida: false, fendi: false },
            unlocked_flags: []
        }
    };
}

let v31State = getFreshV31State();



// --- URUTAN REWARD (Tetap urut 1-5) ---
const rewardSequence = {
    1: { type: "question", content: "Apa impresi pertamamu pas pertama kali kita sepedaan ke Colomadu?" },
    2: { type: "puzzle", content: [1, 2] },
    3: { type: "question", content: "Dari semua momen LDR, hal kecil apa yang paling bikin kamu ngerasa disayang?" },
    4: { type: "puzzle", content: [3, 4] },
    5: { type: "question", content: "Apa satu janji kecil yang pengen kita jaga bareng-bareng setelah PPG ini?" }
};

// --- API ROUTES V3 (BARU) ---
// Ambil Status Waktu V3
app.get('/api/v3/status', async (req, res) => {
    let config = await SettingV3.findOne({ key: 'config_v3' });
    // Auto-create jika belum ada di database
    if (!config) {
        config = await SettingV3.create({ 
            key: 'config_v3', 
            release_time: new Date("2026-04-12T09:00:00+07:00") 
        });
    }
    res.json(config);
});

// Admin V3: Update Waktu
app.post('/api/v3/admin/update-time', async (req, res) => {
    console.log(req.body); // Debug: Lihat data yang masuk
    const { new_time, secret } = req.body;
    
    if (secret !== "sajak-admin") {
        return res.status(403).json({ error: "Akses Ditolak: Kode Admin Salah" });
    }

    await SettingV3.findOneAndUpdate(
        { key: 'config_v3' }, 
        { release_time: new Date(new_time) },
        { upsert: true }
    );

    res.json({ success: true, message: "Waktu V3 berhasil diupdate!" });
});

app.get('/api/v3.1/status', async (req, res) => {
    let config = await SettingV31.findOne({ key: 'config_v31' });
    if (!config) {
        config = await SettingV31.create({
            key: 'config_v31',
            release_time: new Date("2026-04-25T09:00:00+07:00")
        });
    }
    res.json(config);
});

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

    // Masuk ke room secara diam-diam dari halaman awal untuk Ongoing Chat
  socket.on("join_ongoing_chat", () => {
    socket.join("cengklik_room");
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

  socket.on('trigger_the_end', () => {
        io.to('cengklik_room').emit('show_the_end');
    });

    // ------------------------------------------
  // SOCKET V3: METAMORPHOSIS (BARU)
  // ------------------------------------------
 socket.on("v3_join", () => socket.join("v3_room"));

     socket.on("v3_reset_all_data", async () => {
        await V3Progress.deleteMany({ session_id: "current_v3" });
        // Reset in-memory state
        v3State.jasuke = { current_flag: 1, is_solved: false, data: {}, coordinates: [] };
        v3State.telur_gulung = { suwit_score: { fendi: 0, ida: 0 }, suwit_choices: { fendi: null, ida: null }, winner_bo5: null, player_colors: { fendi: null, ida: null }, finding_results: [], current_step: 1, active_pair_index: null, solved_physical_indices: [], scanned_colors: { biru: false, kuning: false }, current_turn: null };
        v3State.terang_bulan = { collected_flags: [] };
        io.to("v3_room").emit("v3_force_reload");
    });

    // Handshake
    socket.on("v3_generate_number", () => {
        v3State.current_number = Math.floor(1000 + Math.random() * 9000);
        io.to("v3_room").emit("v3_receive_number", v3State.current_number);
    });
    socket.on("v3_submit_sync", (n) => {
        if (parseInt(n) === v3State.current_number) io.to("v3_room").emit("v3_sync_success");
        else socket.emit("v3_sync_failed");
    });

    // Jasuke
    socket.on("v3_jasuke_init", () => {
        const flag = v3State.jasuke.current_flag;
        const j = Math.floor(Math.random() * 20) + 10;
        const s = Math.floor(Math.random() * 15) + 5;
        const k = Math.floor(Math.random() * 10) + 2;
        let ans, formula;
        if (flag === 1) { ans = (j+s)-k; formula = "KODE RASA = (J + S) - K"; }
        else if (flag === 2) { ans = (j+k)-s; formula = "KODE RASA = (J + K) - S"; }
        else { ans = (j+s+k); formula = "KODE RASA = J + S + K"; }
        v3State.jasuke.data = { j, s, k, ans, formula, flag };
        v3State.jasuke.is_solved = false;
        io.to("v3_room").emit("v3_jasuke_data", v3State.jasuke.data);
    });

    socket.on("v3_jasuke_submit_answer", (ans) => {
        if (parseInt(ans) === v3State.jasuke.data.ans) {
            v3State.jasuke.is_solved = true;
            io.to("v3_room").emit("v3_jasuke_unlocked");
        } else socket.emit("v3_jasuke_failed");
    });

    socket.on("v3_jasuke_submit_coords", async (coords) => {
        await V3Progress.findOneAndUpdate({ session_id: "current_v3" }, { $push: { coordinates: coords } }, { upsert: true });
        if (v3State.jasuke.current_flag < 3) {
            v3State.jasuke.current_flag++;
            io.to("v3_room").emit("v3_jasuke_flag_success", { next_flag: v3State.jasuke.current_flag });
        } else io.to("v3_room").emit("v3_jasuke_all_success");
    });

    // Telur Gulung - Suwit
    socket.on("v3_suwit_action", (data) => {
        v3State.telur_gulung.suwit_choices[data.player] = data.choice;
        if (v3State.telur_gulung.suwit_choices.fendi && v3State.telur_gulung.suwit_choices.ida) {
            io.to("v3_room").emit("v3_suwit_both_locked");
        }
    });

    socket.on("v3_suwit_reveal", () => {
        const { fendi, ida } = v3State.telur_gulung.suwit_choices;
        let roundWinner = 'draw';
        if (fendi !== ida) {
            if ((fendi==='batu'&&ida==='gunting')||(fendi==='gunting'&&ida==='kertas')||(fendi==='kertas'&&ida==='batu')) {
                roundWinner = 'fendi'; v3State.telur_gulung.suwit_score.fendi++;
            } else {
                roundWinner = 'ida'; v3State.telur_gulung.suwit_score.ida++;
            }
        }
        if (v3State.telur_gulung.suwit_score.fendi === 3) v3State.telur_gulung.winner_bo5 = 'fendi';
        if (v3State.telur_gulung.suwit_score.ida === 3) v3State.telur_gulung.winner_bo5 = 'ida';

        io.to("v3_room").emit("v3_suwit_result", {
            choices: { fendi, ida },
            winner: roundWinner,
            score: v3State.telur_gulung.suwit_score,
            finalWinner: v3State.telur_gulung.winner_bo5
        });
        v3State.telur_gulung.suwit_choices = { fendi: null, ida: null };
    });

    socket.on("v3_tg_pick_color", (color) => {
        const winner = v3State.telur_gulung.winner_bo5;
        const other = (winner === 'fendi') ? 'ida' : 'fendi';
        const otherColor = (color === 'biru') ? 'kuning' : 'biru';
        v3State.telur_gulung.player_colors[winner] = color;
        v3State.telur_gulung.player_colors[other] = otherColor;
        io.to("v3_room").emit("v3_tg_color_chosen", v3State.telur_gulung.player_colors);
    });

    socket.on("v3_tg_start_hiding", () => io.to("v3_room").emit("v3_tg_hiding_go"));

    socket.on("v3_tg_finding_done", (data) => {
        if (!v3State.telur_gulung.finding_results.includes(data.player)) {
            v3State.telur_gulung.finding_results.push(data.player);
            if (v3State.telur_gulung.finding_results.length === 1) {
                v3State.telur_gulung.current_turn = data.player;
            }
        }
        io.to("v3_room").emit("v3_tg_finding_update", {
            results: v3State.telur_gulung.finding_results,
            turn: v3State.telur_gulung.current_turn
        });
    });

   // --- LOGIKA SCAN DYNAMIC FIX ---
    socket.on("v3_tb_scan_qr", async (data) => {
        if (data.player !== v3State.telur_gulung.current_turn) return socket.emit("v3_tb_scan_error", "Bukan giliranmu!");

        let progress = await V3Progress.findOne({ session_id: "current_v3" });
        const solvedDB = progress ? progress.solved_physical_indices : [];

        // FASE 1: Orang pertama scan kupu-kupu BEBAS (warna apapun)
        if (v3State.telur_gulung.active_pair_index === null) {
            let scannedColor = null;
            let foundIdx = physicalPairs.findIndex(p => p.biru === data.qr_code);
            
            if (foundIdx !== -1) {
                scannedColor = 'biru';
            } else {
                foundIdx = physicalPairs.findIndex(p => p.kuning === data.qr_code);
                if (foundIdx !== -1) {
                    scannedColor = 'kuning';
                }
            }
            
            if (foundIdx === -1) return socket.emit("v3_tb_scan_error", "Kupu-kupu tidak dikenali/salah scan!");
            if (solvedDB.includes(foundIdx)) return socket.emit("v3_tb_scan_error", "Kupu-kupu ini sudah pernah digunakan!");

            v3State.telur_gulung.active_pair_index = foundIdx;
            v3State.telur_gulung.first_scanned_color = scannedColor; // Catat warnanya
            
            const otherPlayer = (data.player === 'fendi') ? 'ida' : 'fendi';
            v3State.telur_gulung.current_turn = otherPlayer;
            
            // Tentukan target warna untuk pasangannya
            const nextTargetColor = (scannedColor === 'biru') ? 'kuning' : 'biru';

            io.to("v3_room").emit("v3_tb_partial_success", { 
                player: data.player, 
                next_target_color: nextTargetColor 
            });
        } 
        // FASE 2: Pasangannya WAJIB scan warna sebaliknya dari pasangan yang sama
        else {
            const currentPair = physicalPairs[v3State.telur_gulung.active_pair_index];
            const neededColor = (v3State.telur_gulung.first_scanned_color === 'biru') ? 'kuning' : 'biru';
            
            if (data.qr_code === currentPair[neededColor]) {
                const updated = await V3Progress.findOneAndUpdate(
                    { session_id: "current_v3" },
                    { $addToSet: { solved_physical_indices: v3State.telur_gulung.active_pair_index } },
                    { new: true, upsert: true }
                );

                const rewardIdx = updated.solved_physical_indices.length; 
                const reward = rewardSequence[rewardIdx];

                if (!reward) {
                    return socket.emit("v3_tb_scan_error", "Sistem mendeteksi semua memori sudah terbuka!");
                }

                io.to("v3_room").emit("v3_tb_pair_complete", { 
                    index: rewardIdx, 
                    type: reward.type, 
                    content: reward.content 
                });
            } else {
                socket.emit("v3_tb_scan_error", `Salah pasangannya! Kamu harus mencari kupu-kupu warna ${neededColor.toUpperCase()}.`);
            }
        }
    });

    socket.on("v3_tb_next_pair", () => {
        v3State.telur_gulung.active_pair_index = null;
        v3State.telur_gulung.first_scanned_color = null;
        if (v3State.telur_gulung.finding_results.length > 0) {
            v3State.telur_gulung.current_turn = v3State.telur_gulung.finding_results[0]; // Kembali ke pemenang finding
        }
        io.to("v3_room").emit("v3_tb_status", { turn: v3State.telur_gulung.current_turn });
    });

    // RADAR TERANG BULAN
    socket.on("v3_trb_init", async () => {
        const progress = await V3Progress.findOne({ session_id: "current_v3" });
        io.to("v3_room").emit("v3_trb_data", { 
            coords: progress ? progress.coordinates : [], 
            collected: v3State.terang_bulan.collected_flags 
        });
    });

    socket.on("v3_trb_collect", (idx) => {
        if(!v3State.terang_bulan.collected_flags.includes(idx)) v3State.terang_bulan.collected_flags.push(idx);
        io.to("v3_room").emit("v3_trb_collected", v3State.terang_bulan.collected_flags);
        if(v3State.terang_bulan.collected_flags.length === 3) io.to("v3_room").emit("v3_trb_all_finish");
    });

    // ------------------------------------------
    // SOCKET V3.1
    // ------------------------------------------
    socket.on("v31_join", async () => {
        socket.join("v31_room");
        const progress = await V31Progress.findOne({ session_id: "current_v31" });
        if (progress?.coordinates?.length) {
            v31State.jasuke.coords_saved = progress.coordinates.length;
        }
        if (progress?.solved_pairs?.length) {
            v31State.telur_gulung.solved_pairs = progress.solved_pairs;
        }
        socket.emit("v31_state_sync", {
            stage: v31State.stage,
            jasuke: {
                current_flag: v31State.jasuke.current_flag,
                coords_saved: v31State.jasuke.coords_saved
            },
            telur_gulung: {
                score: v31State.telur_gulung.suwit_score,
                final_winner: v31State.telur_gulung.final_winner,
                player_colors: v31State.telur_gulung.player_colors,
                solved_pairs: v31State.telur_gulung.solved_pairs,
                current_turn: v31State.telur_gulung.current_turn,
                first_finder: v31State.telur_gulung.first_finder
            }
        });
    });

    socket.on("v31_reset", async () => {
        await V31Progress.deleteMany({ session_id: "current_v31" });
        v31State = getFreshV31State();
        io.to("v31_room").emit("v31_force_reload");
    });

    socket.on("v31_generate_number", async () => {
        v31State.current_number = Math.floor(1000 + Math.random() * 9000);
        await V31Progress.findOneAndUpdate(
            { session_id: "current_v31" },
            { $set: { last_sync_number: v31State.current_number } },
            { upsert: true }
        );
        io.to("v31_room").emit("v31_number_generated", v31State.current_number);
    });

    socket.on("v31_submit_sync", (number) => {
        if (parseInt(number) === v31State.current_number) {
            v31State.stage = "jasuke_intro";
            io.to("v31_room").emit("v31_sync_success");
        } else {
            socket.emit("v31_sync_failed");
        }
    });

    socket.on("v31_intro_ready", ({ stage, player }) => {
        if (!player) return;
        if (stage === "jasuke") {
            v31State.jasuke.intro_ready[player] = true;
            if (v31State.jasuke.intro_ready.ida || v31State.jasuke.intro_ready.fendi) {
                v31State.stage = "jasuke_live";
                v31State.jasuke.active_question = buildV31JasukeQuestion(v31State.jasuke.current_flag);
                io.to("v31_room").emit("v31_stage_live", {
                    stage: "jasuke",
                    current_turn: v31State.jasuke.current_turn,
                    question: v31State.jasuke.active_question,
                    coords_saved: v31State.jasuke.coords_saved
                });
            }
        }
        if (stage === "telur-gulung") {
            v31State.telur_gulung.intro_ready[player] = true;
            if (v31State.telur_gulung.intro_ready.ida || v31State.telur_gulung.intro_ready.fendi) {
                v31State.stage = "telur_gulung_live";
                io.to("v31_room").emit("v31_stage_live", {
                    stage: "telur-gulung",
                    telur_gulung: {
                        score: v31State.telur_gulung.suwit_score,
                        final_winner: v31State.telur_gulung.final_winner
                    }
                });
            }
        }
        if (stage === "terang-bulan") {
            v31State.terang_bulan.intro_ready[player] = true;
            if (v31State.terang_bulan.intro_ready.ida || v31State.terang_bulan.intro_ready.fendi) {
                v31State.stage = "terang_bulan_live";
                io.to("v31_room").emit("v31_stage_live", { stage: "terang-bulan" });
            }
        }
    });

    socket.on("v31_jasuke_submit", (payload) => {
        if (!v31State.jasuke.active_question) return;
        if (payload?.player !== v31State.jasuke.current_turn) {
            return socket.emit("v31_jasuke_error", "Belum giliranmu.");
        }
        if (parseInt(payload.answer) !== v31State.jasuke.active_question.ans) {
            return socket.emit("v31_jasuke_error", "Jawaban belum tepat.");
        }
        const nextTurn = payload.player === "ida" ? "fendi" : "ida";
        io.to("v31_room").emit("v31_jasuke_answered", {
            by: payload.player,
            next_turn: nextTurn
        });
        if (payload.player === "fendi") {
            io.to("v31_room").emit("v31_jasuke_need_coordinates", {
                flag: v31State.jasuke.current_flag,
                saved: v31State.jasuke.coords_saved
            });
        } else {
            v31State.jasuke.current_turn = nextTurn;
            v31State.jasuke.active_question = buildV31JasukeQuestion(v31State.jasuke.current_flag);
            io.to("v31_room").emit("v31_jasuke_next_question", {
                current_turn: v31State.jasuke.current_turn,
                question: v31State.jasuke.active_question,
                coords_saved: v31State.jasuke.coords_saved
            });
        }
    });

    socket.on("v31_save_coordinates", async ({ lat, lng }) => {
        if (typeof lat !== "number" || typeof lng !== "number") {
            return socket.emit("v31_jasuke_error", "Koordinat tidak valid.");
        }
        const index = v31State.jasuke.coords_saved;
        const code = v31FlagCodes[index];
        const label = `Bendera ${index + 1}`;
        const updated = await V31Progress.findOneAndUpdate(
            { session_id: "current_v31" },
            { $push: { coordinates: { lat, lng, label, code } } },
            { new: true, upsert: true }
        );
        v31State.jasuke.coords_saved = updated.coordinates.length;
        if (v31State.jasuke.coords_saved >= 3) {
            v31State.stage = "telur_gulung_intro";
            io.to("v31_room").emit("v31_jasuke_complete");
            return;
        }
        v31State.jasuke.current_flag += 1;
        v31State.jasuke.current_turn = "ida";
        v31State.jasuke.active_question = buildV31JasukeQuestion(v31State.jasuke.current_flag);
        io.to("v31_room").emit("v31_jasuke_next_question", {
            current_turn: v31State.jasuke.current_turn,
            question: v31State.jasuke.active_question,
            coords_saved: v31State.jasuke.coords_saved
        });
    });

    socket.on("v31_suwit_choice", ({ player, choice }) => {
        if (!player || !choice) return;
        v31State.telur_gulung.suwit_choices[player] = choice;
        io.to("v31_room").emit("v31_suwit_waiting", { choices: v31State.telur_gulung.suwit_choices });
        if (v31State.telur_gulung.suwit_choices.ida && v31State.telur_gulung.suwit_choices.fendi) {
            const ida = v31State.telur_gulung.suwit_choices.ida;
            const fendi = v31State.telur_gulung.suwit_choices.fendi;
            let winner = "draw";
            if (ida !== fendi) {
                const idaWin = (ida === "batu" && fendi === "gunting") || (ida === "gunting" && fendi === "kertas") || (ida === "kertas" && fendi === "batu");
                winner = idaWin ? "ida" : "fendi";
                v31State.telur_gulung.suwit_score[winner] += 1;
            }
            if (v31State.telur_gulung.suwit_score.ida >= 3) v31State.telur_gulung.final_winner = "ida";
            if (v31State.telur_gulung.suwit_score.fendi >= 3) v31State.telur_gulung.final_winner = "fendi";
            io.to("v31_room").emit("v31_suwit_result", {
                ida,
                fendi,
                winner,
                score: v31State.telur_gulung.suwit_score,
                final_winner: v31State.telur_gulung.final_winner
            });
            v31State.telur_gulung.suwit_choices = { ida: null, fendi: null };
        }
    });

    socket.on("v31_pick_color", ({ player, color }) => {
        if (player !== v31State.telur_gulung.final_winner) {
            return socket.emit("v31_telur_gulung_error", "Yang memilih warna hanya pemenang BO5.");
        }
        const other = player === "ida" ? "fendi" : "ida";
        v31State.telur_gulung.player_colors[player] = color;
        v31State.telur_gulung.player_colors[other] = color === "biru" ? "kuning" : "biru";
        io.to("v31_room").emit("v31_colors_assigned", v31State.telur_gulung.player_colors);
    });

    socket.on("v31_start_hiding", () => {
        v31State.telur_gulung.hiding_started = true;
        v31State.telur_gulung.hide_deadline = Date.now() + (90 * 1000);
        io.to("v31_room").emit("v31_hiding_started", { deadline: v31State.telur_gulung.hide_deadline });
    });

    socket.on("v31_finish_finding", ({ player, elapsedMs }) => {
        if (!player || v31State.telur_gulung.finding_finished.find((item) => item.player === player)) return;
        v31State.telur_gulung.finding_finished.push({ player, elapsedMs });
        v31State.telur_gulung.finding_finished.sort((a, b) => a.elapsedMs - b.elapsedMs);
        if (!v31State.telur_gulung.first_finder) {
            v31State.telur_gulung.first_finder = player;
            v31State.telur_gulung.current_turn = player;
        }
        io.to("v31_room").emit("v31_finding_update", {
            results: v31State.telur_gulung.finding_finished,
            current_turn: v31State.telur_gulung.current_turn
        });
    });

    socket.on("v31_scan_qr", async ({ player, qr_code }) => {
        if (player !== v31State.telur_gulung.current_turn) {
            return socket.emit("v31_telur_gulung_error", "Bukan giliranmu untuk scan.");
        }
        const progress = await V31Progress.findOne({ session_id: "current_v31" });
        const solvedPairs = progress?.solved_pairs || [];
        if (v31State.telur_gulung.active_pair_index === null) {
            let pairIndex = v31PhysicalPairs.findIndex((pair) => pair.biru === qr_code || pair.kuning === qr_code);
            if (pairIndex === -1) return socket.emit("v31_telur_gulung_error", "QR code tidak dikenali.");
            if (solvedPairs.includes(pairIndex)) return socket.emit("v31_telur_gulung_error", "Pasangan kode ini sudah selesai.");
            const firstColor = v31PhysicalPairs[pairIndex].biru === qr_code ? "biru" : "kuning";
            v31State.telur_gulung.active_pair_index = pairIndex;
            v31State.telur_gulung.first_scan = { player, color: firstColor };
            v31State.telur_gulung.current_turn = player === "ida" ? "fendi" : "ida";
            io.to("v31_room").emit("v31_pair_started", {
                scanned_by: player,
                label: v31PhysicalPairs[pairIndex].label,
                first_color: firstColor,
                next_color: firstColor === "biru" ? "kuning" : "biru",
                current_turn: v31State.telur_gulung.current_turn
            });
            return;
        }
        const pair = v31PhysicalPairs[v31State.telur_gulung.active_pair_index];
        const requiredColor = v31State.telur_gulung.first_scan.color === "biru" ? "kuning" : "biru";
        if (pair[requiredColor] !== qr_code) {
            return socket.emit("v31_telur_gulung_error", `Pasangan belum cocok. Cari ${requiredColor.toUpperCase()} ${pair.label}.`);
        }
        const updated = await V31Progress.findOneAndUpdate(
            { session_id: "current_v31" },
            { $addToSet: { solved_pairs: v31State.telur_gulung.active_pair_index } },
            { new: true, upsert: true }
        );
        v31State.telur_gulung.solved_pairs = updated.solved_pairs;
        const rewardIndex = updated.solved_pairs.length;
        const reward = v31RewardSteps[rewardIndex];
        io.to("v31_room").emit("v31_pair_completed", {
            reward_index: rewardIndex,
            pair_label: pair.label,
            reward
        });
        if (rewardIndex >= 5) {
            v31State.stage = "terang_bulan_intro";
        }
    });

    socket.on("v31_next_pair", () => {
        v31State.telur_gulung.active_pair_index = null;
        v31State.telur_gulung.first_scan = null;
        v31State.telur_gulung.current_turn = v31State.telur_gulung.first_finder;
        io.to("v31_room").emit("v31_pair_reset", {
            current_turn: v31State.telur_gulung.current_turn,
            solved_pairs: v31State.telur_gulung.solved_pairs
        });
    });

    socket.on("v31_terang_bulan_init", async () => {
        const progress = await V31Progress.findOne({ session_id: "current_v31" });
        socket.emit("v31_terang_bulan_data", {
            coordinates: progress?.coordinates || [],
            unlocked_flags: v31State.terang_bulan.unlocked_flags
        });
    });

    socket.on("v31_submit_flag_code", async ({ index, code }) => {
        const progress = await V31Progress.findOne({ session_id: "current_v31" });
        const target = progress?.coordinates?.[index];
        if (!target) return socket.emit("v31_terang_bulan_error", "Bendera belum tersedia.");
        if ((code || "").trim().toUpperCase() !== target.code.toUpperCase()) {
            return socket.emit("v31_terang_bulan_error", `Kode untuk ${target.label} belum cocok.`);
        }
        if (!v31State.terang_bulan.unlocked_flags.includes(index)) {
            v31State.terang_bulan.unlocked_flags.push(index);
        }
        io.to("v31_room").emit("v31_flag_unlocked", { unlocked_flags: v31State.terang_bulan.unlocked_flags });
        if (v31State.terang_bulan.unlocked_flags.length >= 3) {
            io.to("v31_room").emit("v31_endgame_ready", {
                target: { lat: 34.781223, lng: 127.5562001 }
            });
        }
    });
});

// Redirect root to /v3
app.get("/", (req, res) => {
  res.redirect("/v3.1");
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
// --- INIT DATA V2 FULL (Buka /init-v2 di browser) ---
app.get("/init-v2-final", async (req, res) => {

  // 2. Init Lokasi (5 Wahana Kosong untuk diisi di Admin)
  await LocationV2.deleteMany({});
    const locs = [
        { level: 1, name: "Monorail", lat: -7.518464688988802, lng: 110.7255267018217 },
        { level: 2, name: "Rainbow Slide", lat: -7.518692120953196, lng: 110.72549039015423 },
        { level: 3, name: "Labirin Kaca & Rumah Terbalik", lat: -7.5186888715260585, lng: 110.7259338377485 },
        { level: 4, name: "Komidi Putar", lat: -7.518454826563591, lng: 110.72600431415573 },
        { level: 5, name: "Taman Sakura (Protokol Final)", lat: -7.518218651640496, lng: 110.7254041872245 }
    ];
    await LocationV2.insertMany(locs);

  // 3. Init 25 Topik Deep Talk

  // 4. Init 25 Bank Soal Matematika (5 Per Level) - Didesain untuk di-diktekan Fendi ke Ida
  await QuestionV2.deleteMany({});
    const questions = [
        // Level 1: Basic Math (Pemanasan)
        { level: 1, text: "45 + 55 - 20 = ?", answer: "80" },
        { level: 1, text: "12 x 5 + 10 = ?", answer: "70" },
        { level: 1, text: "(100 - 25) / 3 = ?", answer: "25" },
        { level: 1, text: "(60 / 4) x 2 = ?", answer: "30" },
        { level: 1, text: "15 + 15 + 15 + 15 = ?", answer: "60" },
        
        // Level 2: Pangkat & Akar Ringan
        { level: 2, text: "√64 x 5 = ?", answer: "40" },
        { level: 2, text: "6² - 16 = ?", answer: "20" },
        { level: 2, text: "3³ + 3 = ?", answer: "30" },
        { level: 2, text: "(√100 + 5) x 2 = ?", answer: "30" },
        { level: 2, text: "8² / 4 = ?", answer: "16" },
        
        // Level 3: Aljabar Dasar (Cari Nilai Variabel)
        { level: 3, text: "5a - 10 = 40. Berapa a?", answer: "10" },
        { level: 3, text: "(b / 2) + 15 = 25. Berapa b?", answer: "20" },
        { level: 3, text: "30% dari 200 = ?", answer: "60" },
        { level: 3, text: "7c = 49. Maka c x 2 = ?", answer: "14" },
        { level: 3, text: "100 - 4y = 60. Berapa y?", answer: "10" },
        
        // Level 4: Logika Tipuan (Awas Terkecoh!)
        { level: 4, text: "5 + 5 x 5 = ?", answer: "30" }, 
        { level: 4, text: "10 - 10 x 0 + 10 = ?", answer: "20" },
        { level: 4, text: "Setengah dari 50, dikali 2 = ?", answer: "50" },
        { level: 4, text: "√81 + 2 x 5 = ?", answer: "19" },
        { level: 4, text: "(20 / 2) + 5 x 0 = ?", answer: "10" },
        
        // Level 5: Konsentrasi Penuh (Endgame Prep)
        { level: 5, text: "((100 / 4) x 3) - 15 = ?", answer: "60" },
        { level: 5, text: "(√400 x 3) - 10 = ?", answer: "50" },
        { level: 5, text: "(2026 - 2000) x 2 = ?", answer: "52" },
        { level: 5, text: "(10³ / 100) + 15 = ?", answer: "25" },
        { level: 5, text: "(50 + 50) x (10 / 5) = ?", answer: "200" }
    ];
    await QuestionV2.insertMany(questions);

  res.send("Database V2 Initialized with New Locations and Questions!");
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

// --- API ENDGAME: AMBIL FOTO MEMORI SESI AKTIF ---
app.get('/api/v2/endgame/get-photos', async (req, res) => {
    try {
        // 1. Ambil nama sesi aktif saat ini
        const config = await SettingV2.findOne({ key: 'config_v2' });
        const sessId = config.current_session;

        if(!sessId) return res.status(404).json({error: "Sesi tidak ditemukan"});

        // 2. Query MongoDB: Cari 1 foto terakhir dari Ida, 1 dari Fendi
        // di sesi tersebut, sort berdasarkan waktu terbaru.
        const photoIda = await ChatMessage.findOne({ session_id: sessId, sender: 'ida', type: 'image' })
                                         .sort({ created_at: -1 });
        const photoFendi = await ChatMessage.findOne({ session_id: sessId, sender: 'fendi', type: 'image' })
                                           .sort({ created_at: -1 });

        // Kembalikan URL foto-fotonya (jika ada)
        res.json({
            ida: photoIda ? photoIda.content : null,
            fendi: photoFendi ? photoFendi.content : null
        });

    } catch (e) {
        res.status(500).json({error: e.message});
    }
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

// ==========================================
  // TAHAP V3: METAMORPHOSIS SYNC
  // ==========================================
  
  

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
