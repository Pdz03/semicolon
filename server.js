require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const fs = require("fs");
const multer = require("multer");
const cron = require("node-cron");
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

const BirthdayConfigSchema = new mongoose.Schema({
  target_date: Date,
  email_passcode: String,
  reward_passcode: String,
  scrapbook_photo_url: String,
  scrapbook_title: String,
  scrapbook_intro_text: String,
  scrapbook_outro_photo_url: String,
  scrapbook_outro_text: String,
  scrapbook_outro_audio_url: String,
  reward_image_1: String,
  reward_image_2: String,
  reward_image_3: String,
});
const BirthdayScrapbookSchema = new mongoose.Schema({
  notes: String,
  order: Number,
});
const BirthdayReplySchema = new mongoose.Schema({
  gift_choice: String,
  reply_message: String,
  voice_reply_url: String,
  photo_reply_url: String,
  photo_reply_note: String,
  created_at: { type: Date, default: Date.now },
});
const BirthdaySubscriberSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  created_at: { type: Date, default: Date.now },
  last_code_sent_at: Date,
  last_code_sent_for: String,
});

const BirthdayConfig = mongoose.model("BirthdayConfig", BirthdayConfigSchema);
const BirthdayScrapbook = mongoose.model("BirthdayScrapbook", BirthdayScrapbookSchema);
const BirthdayReply = mongoose.model("BirthdayReply", BirthdayReplySchema);
const BirthdaySubscriber = mongoose.model("BirthdaySubscriber", BirthdaySubscriberSchema);

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
    final_map_seen: { type: Boolean, default: false },
    session_stage: { type: String, default: "sync" },
    telur_gulung_phase: { type: String, default: "suit" },
    session_snapshot: { type: mongoose.Schema.Types.Mixed, default: {} }
});
const V31Progress = mongoose.model("V31Progress", V31ProgressSchema);

const V4CardSchema = new mongoose.Schema({
  type: { type: String, enum: ["truth", "dare"], required: true },
  level: { type: Number, enum: [1, 2, 3], required: true },
  content: { type: String, required: true },
});
const V4Card = mongoose.model("V4Card", V4CardSchema);

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
    "Apa ketakutan paling nyata tentang masa depan hubungan ini, dan bagaimana caranya kita hadapi sebagai satu tim?",
    "Kalau suatu saat rasa cemburu datang dari situasi yang tidak nyaman, kalimat dan sikap seperti apa yang paling membuatmu merasa dipilih dan ditenangkan?"
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

const v31PhysicalPairs = [
    { label: "A", biru: "628ab0b59b05dd46", kuning: "5721916a61b93811" },
    { label: "B", biru: "3da9778e20bea48a", kuning: "359f4922cb28e0c7" },
    { label: "C", biru: "0816e0edb64188e9", kuning: "ce5c0b55ed766dec" },
    { label: "D", biru: "0365bbcce40aa2f9", kuning: "a5f8fe43bc6a4161" },
    { label: "E", biru: "61ff890dc644acd7", kuning: "2cbd4a7f98afc591" }
];

const v31FlagCodes = ["delapandua", "duaempattiga", "duabelasempat"];

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
            current_turn: "fendi",
            coords_saved: 0,
            intro_ready: { ida: false, fendi: false }
        },
        telur_gulung: {
            intro_ready: { ida: false, fendi: false },
            phase: "suit",
            suwit_score: { ida: 0, fendi: 0 },
            suwit_choices: { ida: null, fendi: null },
            final_winner: null,
            player_colors: { ida: null, fendi: null },
            hiding_started: false,
            hiding_stopped: false,
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

function getFreshV4State() {
  return {
    players: [],
    suwitChoices: {},
    score: { fendi: 0, ida: 0 },
    totalRounds: 0,
    finalPunishment: "",
    phase: "lobby",
    loser: null,
    winner: null,
    currentCard: null,
    roundResolved: false,
    timerTarget: "11:00",
  };
}

let v4State = getFreshV4State();
const v4PlayerSockets = { fendi: null, ida: null };
const V4_CHOICES = ["batu", "gunting", "kertas"];

function normalizeV4PlayerName(name) {
  if (!name) return "";
  const value = String(name).trim().toLowerCase();
  return value === "fendi" || value === "ida" ? value : "";
}

function getV4Level(totalRounds) {
  if (totalRounds <= 2) return 1;
  if (totalRounds <= 5) return 2;
  return 3;
}

function getV4PublicState() {
  return {
    players: [...v4State.players],
    score: { ...v4State.score },
    totalRounds: v4State.totalRounds,
    finalPunishment: v4State.finalPunishment,
    phase: v4State.phase,
    loser: v4State.loser,
    winner: v4State.winner,
    currentCard: v4State.currentCard,
    roundResolved: v4State.roundResolved,
    timerTarget: v4State.timerTarget,
    connectedDevices: {
      host: Boolean(v4PlayerSockets.host),
      admin: Boolean(v4PlayerSockets.admin),
      fendi: Boolean(v4PlayerSockets.fendi),
      ida: Boolean(v4PlayerSockets.ida),
    },
  };
}

function emitV4State() {
  io.to("v4_room").emit("v4_state_sync", getV4PublicState());
}

function resetV4RoundChoices() {
  v4State.suwitChoices = {};
  v4State.roundResolved = false;
}

function resetV4GameState() {
  v4State = getFreshV4State();
  resetV4RoundChoices();
}

function resolveSuitWinner(fendiChoice, idaChoice) {
  if (fendiChoice === idaChoice) {
    return { isDraw: true, winner: null, loser: null };
  }

  const beats = {
    batu: "gunting",
    gunting: "kertas",
    kertas: "batu",
  };

  if (beats[fendiChoice] === idaChoice) {
    return { isDraw: false, winner: "fendi", loser: "ida" };
  }

  return { isDraw: false, winner: "ida", loser: "fendi" };
}

function getBirthdayDefaults() {
  return {
    target_date: new Date("2026-07-04T00:00:00+07:00"),
    email_passcode: "IDA-EMAIL",
    reward_passcode: "IDA-REWARD",
    scrapbook_photo_url: "https://placehold.co/1200x900/12091f/e9d5ff?text=Ida",
    scrapbook_title: "Scrapbook Spesial",
    scrapbook_intro_text: "Beberapa lembar kecil yang disimpan untuk dibuka perlahan.",
    scrapbook_outro_photo_url: "https://placehold.co/1200x900/12091f/e9d5ff?text=Penutup",
    scrapbook_outro_text: "Terima kasih sudah membuka setiap lembarnya sampai akhir.",
    scrapbook_outro_audio_url: "",
    reward_image_1: "https://placehold.co/800x800/312e81/e0e7ff?text=Kado+1",
    reward_image_2: "https://placehold.co/800x800/4c1d95/f5d0fe?text=Kado+2",
    reward_image_3: "https://placehold.co/800x800/1e3a8a/bfdbfe?text=Kado+3",
  };
}

async function ensureBirthdayConfig() {
  let config = await BirthdayConfig.findOne();
  if (!config) {
    config = await BirthdayConfig.create(getBirthdayDefaults());
  }
  return config;
}

function serializeBirthdayConfig(config) {
  return {
    target_date: config.target_date,
    scrapbook_photo_url: config.scrapbook_photo_url || "",
    scrapbook_title: config.scrapbook_title || "",
    scrapbook_intro_text: config.scrapbook_intro_text || "",
    scrapbook_outro_photo_url: config.scrapbook_outro_photo_url || "",
    scrapbook_outro_text: config.scrapbook_outro_text || "",
    scrapbook_outro_audio_url: config.scrapbook_outro_audio_url || "",
    reward_image_1: config.reward_image_1 || "",
    reward_image_2: config.reward_image_2 || "",
    reward_image_3: config.reward_image_3 || "",
  };
}

function buildFromAddress() {
  const rawFrom = (process.env.SMTP_FROM || "").trim();
  const smtpUser = (process.env.SMTP_USER || "").trim();

  if (!rawFrom) {
    return smtpUser;
  }

  if (rawFrom.includes("<") && rawFrom.includes(">")) {
    return rawFrom;
  }

  if (smtpUser) {
    return `"${rawFrom.replaceAll('"', "")}" <${smtpUser}>`;
  }

  return rawFrom;
}

const birthdayUploadDir = path.join(__dirname, "public/v-spesial/uploads");
if (!fs.existsSync(birthdayUploadDir)) {
  fs.mkdirSync(birthdayUploadDir, { recursive: true });
}

const birthdayStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, birthdayUploadDir),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname || "").toLowerCase() || "";
    const base = `${file.fieldname}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    cb(null, `${base}${safeExt}`);
  },
});

const birthdayUpload = multer({
  storage: birthdayStorage,
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

function getBirthdaySendKey(dateValue) {
  const date = new Date(dateValue);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function escapeBirthdayHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getBirthdayEmailTemplate() {
  const templatePath = path.join(__dirname, "public/v-spesial/email-template.html");
  return fs.readFileSync(templatePath, "utf8");
}

function renderBirthdayEmailTemplate({
  preheader = "Ada halaman kecil yang menunggu untuk dibuka.",
  eyebrow = "V-Spesial",
  title = "Momen spesialnya sudah tiba.",
  greeting = "Halo Ida Indarwati,",
  body = "Ada satu halaman kecil yang sedang menunggu untuk dibuka.",
  cardLabel = "Kode Untuk Ditulis",
  code = "",
  footer = "Silakan buka kembali halaman V-Spesial, lalu masukkan kode ini saat waktunya tiba.",
} = {}) {
  const template = getBirthdayEmailTemplate();
  const replacements = {
    "{{preheader}}": escapeBirthdayHtml(preheader),
    "{{eyebrow}}": escapeBirthdayHtml(eyebrow),
    "{{title}}": escapeBirthdayHtml(title),
    "{{greeting}}": escapeBirthdayHtml(greeting),
    "{{body}}": escapeBirthdayHtml(body),
    "{{card_label}}": escapeBirthdayHtml(cardLabel),
    "{{code}}": escapeBirthdayHtml(code),
    "{{footer}}": escapeBirthdayHtml(footer),
  };

  return Object.entries(replacements).reduce(
    (html, [placeholder, value]) => html.replaceAll(placeholder, value),
    template
  );
}

async function sendBirthdayCodes({ force = false } = {}) {
  const config = await ensureBirthdayConfig();
  const targetDate = config.target_date ? new Date(config.target_date) : null;
  if (!targetDate) {
    return { success: false, reason: "Tanggal target belum diatur.", sent_count: 0 };
  }

  const sendKey = getBirthdaySendKey(targetDate);
  const todayKey = getBirthdaySendKey(new Date());
  if (!force && sendKey !== todayKey) {
    return { success: false, reason: "Belum masuk tanggal target.", sent_count: 0, send_key: sendKey, today_key: todayKey };
  }

  const subscribers = await BirthdaySubscriber.find();
  if (!subscribers.length) {
    return { success: true, reason: "Belum ada email subscriber.", sent_count: 0, send_key: sendKey };
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { success: false, reason: "SMTP belum dikonfigurasi.", sent_count: 0 };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  let sentCount = 0;
  for (const subscriber of subscribers) {
    if (!force && subscriber.last_code_sent_for === sendKey) {
      continue;
    }

    const html = renderBirthdayEmailTemplate({
      preheader: "Momen spesialnya sudah tiba.",
      title: "Momen spesialnya sudah tiba.",
      greeting: "Halo Ida Indarwati,",
      body: "Ada satu halaman kecil yang sedang menunggu untuk dibuka.",
      cardLabel: "Kode Rahasia",
      code: config.email_passcode || "",
      footer: "Silakan buka kembali halaman V-Spesial, lalu masukkan kode ini saat waktunya tiba.",
    });

    await transporter.sendMail({
      from: buildFromAddress(),
      to: subscriber.email,
      subject: "Kode Rahasia V-Spesial",
      text: `Momen spesialnya sudah tiba. Kode rahasia: ${config.email_passcode || ""}`,
      html,
    });

    subscriber.last_code_sent_at = new Date();
    subscriber.last_code_sent_for = sendKey;
    await subscriber.save();
    sentCount += 1;
  }

  return { success: true, sent_count: sentCount, send_key: sendKey };
}

async function persistV31Session(extra = {}) {
    await V31Progress.findOneAndUpdate(
        { session_id: "current_v31" },
        {
            $set: {
                session_stage: v31State.stage,
                telur_gulung_phase: v31State.telur_gulung.phase,
                session_snapshot: {
                    stage: v31State.stage,
                    jasuke: {
                        current_flag: v31State.jasuke.current_flag,
                        current_turn: v31State.jasuke.current_turn,
                        coords_saved: v31State.jasuke.coords_saved,
                        active_question: v31State.jasuke.active_question
                    },
                    telur_gulung: {
                        phase: v31State.telur_gulung.phase,
                        suwit_score: v31State.telur_gulung.suwit_score,
                        suwit_choices: v31State.telur_gulung.suwit_choices,
                        final_winner: v31State.telur_gulung.final_winner,
                        player_colors: v31State.telur_gulung.player_colors,
                        hiding_started: v31State.telur_gulung.hiding_started,
                        hiding_stopped: v31State.telur_gulung.hiding_stopped,
                        hide_deadline: v31State.telur_gulung.hide_deadline,
                        finding_finished: v31State.telur_gulung.finding_finished,
                        first_finder: v31State.telur_gulung.first_finder,
                        current_turn: v31State.telur_gulung.current_turn,
                        active_pair_index: v31State.telur_gulung.active_pair_index,
                        first_scan: v31State.telur_gulung.first_scan,
                        solved_pairs: v31State.telur_gulung.solved_pairs
                    },
                    terang_bulan: {
                        unlocked_flags: v31State.terang_bulan.unlocked_flags
                    },
                    ...extra
                }
            }
        },
        { upsert: true }
    );
}



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
        if (progress?.session_snapshot?.stage) {
            v31State.stage = progress.session_snapshot.stage;
            if (progress.session_snapshot.jasuke) Object.assign(v31State.jasuke, progress.session_snapshot.jasuke);
            if (progress.session_snapshot.telur_gulung) Object.assign(v31State.telur_gulung, progress.session_snapshot.telur_gulung);
            if (progress.session_snapshot.terang_bulan?.unlocked_flags) {
                v31State.terang_bulan.unlocked_flags = progress.session_snapshot.terang_bulan.unlocked_flags;
            }
        }
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
                coords_saved: v31State.jasuke.coords_saved,
                current_turn: v31State.jasuke.current_turn,
                active_question: v31State.jasuke.active_question
            },
            telur_gulung: {
                phase: v31State.telur_gulung.phase,
                score: v31State.telur_gulung.suwit_score,
                choices: v31State.telur_gulung.suwit_choices,
                final_winner: v31State.telur_gulung.final_winner,
                player_colors: v31State.telur_gulung.player_colors,
                solved_pairs: v31State.telur_gulung.solved_pairs,
                current_turn: v31State.telur_gulung.current_turn,
                first_finder: v31State.telur_gulung.first_finder,
                hide_deadline: v31State.telur_gulung.hide_deadline,
                finding_finished: v31State.telur_gulung.finding_finished,
                active_pair_index: v31State.telur_gulung.active_pair_index,
                first_scan: v31State.telur_gulung.first_scan
            },
            terang_bulan: {
                unlocked_flags: v31State.terang_bulan.unlocked_flags
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
            persistV31Session();
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
                persistV31Session();
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
                v31State.telur_gulung.phase = "suit";
                persistV31Session();
                io.to("v31_room").emit("v31_stage_live", {
                    stage: "telur-gulung",
                    telur_gulung: {
                        phase: v31State.telur_gulung.phase,
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
                persistV31Session();
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
        io.to("v31_room").emit("v31_jasuke_answered", {
            by: payload.player
        });
        persistV31Session();
        io.to("v31_room").emit("v31_jasuke_need_coordinates", {
            flag: v31State.jasuke.current_flag,
            saved: v31State.jasuke.coords_saved
        });
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
            persistV31Session();
            io.to("v31_room").emit("v31_jasuke_complete");
            return;
        }
        v31State.jasuke.current_flag += 1;
        v31State.jasuke.current_turn = v31State.jasuke.current_turn === "ida" ? "fendi" : "ida";
        v31State.jasuke.active_question = buildV31JasukeQuestion(v31State.jasuke.current_flag);
        persistV31Session();
        io.to("v31_room").emit("v31_jasuke_next_question", {
            current_turn: v31State.jasuke.current_turn,
            question: v31State.jasuke.active_question,
            coords_saved: v31State.jasuke.coords_saved
        });
    });

    socket.on("v31_suwit_choice", ({ player, choice }) => {
        if (!player || !choice) return;
        v31State.telur_gulung.phase = "suit";
        v31State.telur_gulung.suwit_choices[player] = choice;
        persistV31Session();
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
            persistV31Session();
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
        v31State.telur_gulung.hiding_started = false;
        v31State.telur_gulung.hiding_stopped = false;
        persistV31Session();
        io.to("v31_room").emit("v31_colors_assigned", v31State.telur_gulung.player_colors);
    });

    socket.on("v31_start_hiding", () => {
        v31State.telur_gulung.hiding_started = true;
        v31State.telur_gulung.hiding_stopped = false;
        v31State.telur_gulung.hide_deadline = Date.now() + (90 * 1000);
        v31State.telur_gulung.phase = "finding";
        persistV31Session();
        io.to("v31_room").emit("v31_hiding_started", { deadline: v31State.telur_gulung.hide_deadline });
    });

    socket.on("v31_stop_hiding", () => {
        v31State.telur_gulung.hiding_started = false;
        v31State.telur_gulung.hiding_stopped = true;
        persistV31Session();
        io.to("v31_room").emit("v31_hiding_stopped");
    });

    socket.on("v31_finish_finding", ({ player, elapsedMs }) => {
        if (!player || v31State.telur_gulung.finding_finished.find((item) => item.player === player)) return;
        v31State.telur_gulung.phase = "finding";
        v31State.telur_gulung.finding_finished.push({ player, elapsedMs });
        v31State.telur_gulung.finding_finished.sort((a, b) => a.elapsedMs - b.elapsedMs);
        if (!v31State.telur_gulung.first_finder) {
            v31State.telur_gulung.first_finder = player;
            v31State.telur_gulung.current_turn = player;
        }
        persistV31Session();
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
            v31State.telur_gulung.phase = "finding";
            let pairIndex = v31PhysicalPairs.findIndex((pair) => pair.biru === qr_code || pair.kuning === qr_code);
            if (pairIndex === -1) return socket.emit("v31_telur_gulung_error", "QR code tidak dikenali.");
            if (solvedPairs.includes(pairIndex)) return socket.emit("v31_telur_gulung_error", "Pasangan kode ini sudah selesai.");
            const firstColor = v31PhysicalPairs[pairIndex].biru === qr_code ? "biru" : "kuning";
            v31State.telur_gulung.active_pair_index = pairIndex;
            v31State.telur_gulung.first_scan = { player, color: firstColor };
            v31State.telur_gulung.current_turn = player === "ida" ? "fendi" : "ida";
            persistV31Session();
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
        v31State.telur_gulung.phase = "completed";
        const rewardIndex = updated.solved_pairs.length;
        const reward = v31RewardSteps[rewardIndex];
        persistV31Session();
        io.to("v31_room").emit("v31_pair_completed", {
            reward_index: rewardIndex,
            pair_label: pair.label,
            reward
        });
        if (rewardIndex >= 5) {
            v31State.stage = "terang_bulan_intro";
            persistV31Session();
        }
    });

    socket.on("v31_next_pair", () => {
        v31State.telur_gulung.active_pair_index = null;
        v31State.telur_gulung.first_scan = null;
        v31State.telur_gulung.current_turn = v31State.telur_gulung.first_finder;
        v31State.telur_gulung.phase = "finding";
        persistV31Session();
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
        persistV31Session();
        io.to("v31_room").emit("v31_flag_unlocked", { unlocked_flags: v31State.terang_bulan.unlocked_flags });
        if (v31State.terang_bulan.unlocked_flags.length >= 3) {
            v31State.stage = "end";
            persistV31Session();
            io.to("v31_room").emit("v31_endgame_ready", {
                target: { lat: 34.781223, lng: 127.5562001 }
            });
        }
    });

    socket.on("v4_join", ({ role, player }) => {
        socket.join("v4_room");

        if (role === "host") {
            v4PlayerSockets.host = socket.id;
            socket.data.v4Role = "host";
            emitV4State();
            return;
        }

        if (role === "admin") {
            v4PlayerSockets.admin = socket.id;
            socket.data.v4Role = "admin";
            emitV4State();
            return;
        }

        if (role === "player") {
            const normalizedPlayer = normalizeV4PlayerName(player);
            if (!normalizedPlayer) {
                socket.emit("v4_error", "Pemain tidak valid.");
                return;
            }

            const existingSocketId = v4PlayerSockets[normalizedPlayer];
            if (existingSocketId && existingSocketId !== socket.id) {
                io.to(existingSocketId).emit("v4_force_logout", "Perangkat lain mengambil slot pemain ini.");
            }

            v4PlayerSockets[normalizedPlayer] = socket.id;
            socket.data.v4Role = "player";
            socket.data.v4Player = normalizedPlayer;
            if (!v4State.players.includes(normalizedPlayer)) {
                v4State.players.push(normalizedPlayer);
                v4State.players.sort();
            }
            emitV4State();
            return;
        }

        socket.emit("v4_error", "Role tidak valid.");
    });

    socket.on("v4_start_game", ({ punishment }) => {
        if (socket.id !== v4PlayerSockets.host) {
            socket.emit("v4_error", "Hanya host yang bisa memulai game.");
            return;
        }

        const hasPlayers = v4State.players.includes("fendi") && v4State.players.includes("ida");
        if (!hasPlayers) {
            socket.emit("v4_error", "Fendi dan Ida harus bergabung dulu.");
            return;
        }

        v4State.finalPunishment = String(punishment || "").trim();
        v4State.phase = "suit";
        v4State.loser = null;
        v4State.winner = null;
        v4State.currentCard = null;
        v4State.timerTarget = v4State.timerTarget || "11:00";
        resetV4RoundChoices();
        io.to("v4_room").emit("v4_game_started", getV4PublicState());
        emitV4State();
    });

    socket.on("v4_suwit_action", ({ choice }) => {
        const player = socket.data.v4Player;
        if (!player) {
            socket.emit("v4_error", "Slot pemain belum aktif.");
            return;
        }
        if (v4State.phase !== "suit") {
            socket.emit("v4_error", "Fase suit belum aktif.");
            return;
        }
        if (!V4_CHOICES.includes(choice)) {
            socket.emit("v4_error", "Pilihan suit tidak valid.");
            return;
        }

        v4State.suwitChoices[player] = choice;
        socket.emit("v4_choice_locked", { choice });
        io.to("v4_room").emit("v4_suwit_waiting", {
            locked: {
                fendi: Boolean(v4State.suwitChoices.fendi),
                ida: Boolean(v4State.suwitChoices.ida),
            },
        });

        const fendiChoice = v4State.suwitChoices.fendi;
        const idaChoice = v4State.suwitChoices.ida;
        if (!fendiChoice || !idaChoice) {
            emitV4State();
            return;
        }

        const result = resolveSuitWinner(fendiChoice, idaChoice);
        if (result.isDraw) {
            resetV4RoundChoices();
            io.to("v4_room").emit("v4_suwit_result", {
                isDraw: true,
                choices: { fendi: fendiChoice, ida: idaChoice },
                message: "SERI! ULANGI!",
            });
            v4State.phase = "suit";
            emitV4State();
            return;
        }

        v4State.winner = result.winner;
        v4State.loser = result.loser;
        v4State.phase = "tod_choice";
        v4State.roundResolved = true;
        io.to("v4_room").emit("v4_suwit_result", {
            isDraw: false,
            choices: { fendi: fendiChoice, ida: idaChoice },
            winner: result.winner,
            loser: result.loser,
        });
        emitV4State();
    });

    socket.on("v4_tod_choice", async ({ type }) => {
        const player = socket.data.v4Player;
        if (!player || player !== v4State.loser) {
            socket.emit("v4_error", "Hanya pemain yang kalah yang boleh memilih.");
            return;
        }
        if (v4State.phase !== "tod_choice") {
            socket.emit("v4_error", "Belum waktunya memilih Truth atau Dare.");
            return;
        }
        if (!["truth", "dare"].includes(type)) {
            socket.emit("v4_error", "Pilihan Truth/Dare tidak valid.");
            return;
        }

        const level = getV4Level(v4State.totalRounds);
        const cards = await V4Card.find({ type, level }).lean();
        if (!cards.length) {
            socket.emit("v4_error", "Kartu untuk level ini belum tersedia.");
            return;
        }

        const randomCard = cards[Math.floor(Math.random() * cards.length)];
        v4State.currentCard = {
            _id: String(randomCard._id),
            type: randomCard.type,
            level: randomCard.level,
            content: randomCard.content,
        };
        v4State.phase = "card";
        io.to("v4_room").emit("v4_card_revealed", {
            loser: v4State.loser,
            winner: v4State.winner,
            card: v4State.currentCard,
        });
        emitV4State();
    });

    socket.on("v4_next_round", () => {
        const player = socket.data.v4Player;
        if (!player || player !== v4State.winner) {
            socket.emit("v4_error", "Hanya pemenang ronde yang bisa lanjut.");
            return;
        }
        if (v4State.phase !== "card" || !v4State.loser) {
            socket.emit("v4_error", "Belum ada kartu aktif.");
            return;
        }

        v4State.score[v4State.loser] += 1;
        v4State.totalRounds += 1;

        const loserScore = v4State.score[v4State.loser];
        if (loserScore >= 5) {
            v4State.phase = "endgame";
            io.to("v4_room").emit("v4_endgame", {
                loser: v4State.loser,
                winner: v4State.winner,
                score: { ...v4State.score },
                finalPunishment: v4State.finalPunishment,
            });
            emitV4State();
            return;
        }

        v4State.phase = "suit";
        v4State.currentCard = null;
        v4State.loser = null;
        v4State.winner = null;
        resetV4RoundChoices();
        io.to("v4_room").emit("v4_round_reset", getV4PublicState());
        emitV4State();
    });

    socket.on("v4_reset_game", () => {
        const isAdmin = socket.id === v4PlayerSockets.admin;
        const isHost = socket.id === v4PlayerSockets.host;
        if (!isAdmin && !isHost) {
            socket.emit("v4_error", "Tidak punya akses reset game.");
            return;
        }

        const preservedTimerTarget = v4State.timerTarget || "11:00";
        resetV4GameState();
        v4State.timerTarget = preservedTimerTarget;
        io.to("v4_room").emit("v4_game_reset", getV4PublicState());
        emitV4State();
    });

    socket.on("disconnect", () => {
        if (socket.id === v4PlayerSockets.host) v4PlayerSockets.host = null;
        if (socket.id === v4PlayerSockets.admin) v4PlayerSockets.admin = null;

        const disconnectedPlayer = socket.data.v4Player;
        if (disconnectedPlayer && v4PlayerSockets[disconnectedPlayer] === socket.id) {
            v4PlayerSockets[disconnectedPlayer] = null;
        }

        emitV4State();
    });
});

const V4_ADMIN_PASSWORD = process.env.V4_ADMIN_PASSWORD || "sajak-admin";

function requireV4Admin(req, res, next) {
  const password = req.headers["x-v4-admin-password"];
  if (password !== V4_ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: "Password admin salah." });
  }
  next();
}

// Redirect root to /v4
app.get("/", (req, res) => {
  res.redirect("/v4");
});

// Fix asset paths for v1 (supporting relative paths like images/ and music/)
app.use("/v1/images", express.static(path.join(__dirname, "public/images")));
app.use("/v1/music", express.static(path.join(__dirname, "public/music")));
app.use("/v-spesial", express.static(path.join(__dirname, "public/v-spesial")));
app.use("/v4", express.static(path.join(__dirname, "public/v4"), { index: false, redirect: false }));

app.get("/v-spesial", (req, res) => {
  res.sendFile(path.join(__dirname, "public/v-spesial/index.html"));
});

app.get("/v-spesial/scrapbook", (req, res) => {
  res.sendFile(path.join(__dirname, "public/v-spesial/scrapbook.html"));
});

app.get("/v-spesial/reward", (req, res) => {
  res.sendFile(path.join(__dirname, "public/v-spesial/reward.html"));
});

app.get("/v-spesial/reveal-reward", (req, res) => {
  res.sendFile(path.join(__dirname, "public/v-spesial/reveal-reward.html"));
});

app.get("/v-spesial/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/v-spesial/admin.html"));
});

app.get("/v4", (req, res) => {
  res.sendFile(path.join(__dirname, "public/v4/host.html"));
});

app.get("/v4/host", (req, res) => {
  res.sendFile(path.join(__dirname, "public/v4/host.html"));
});

app.get("/v4/player", (req, res) => {
  res.sendFile(path.join(__dirname, "public/v4/player.html"));
});

app.get("/v4/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/v4/admin.html"));
});

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
  
  

// --- API V-SPESIAL ---
app.get("/api/v-bday/config", async (req, res) => {
  const config = await ensureBirthdayConfig();
  res.json(serializeBirthdayConfig(config));
});

app.get("/api/v-bday/admin/config", async (req, res) => {
  const { secret } = req.query;
  if (secret !== "sajak-admin") {
    return res.status(403).json({ error: "Akses ditolak" });
  }
  const config = await ensureBirthdayConfig();
  res.json(config);
});

app.post("/api/v-bday/validate-email-passcode", async (req, res) => {
  const { code } = req.body;
  const config = await ensureBirthdayConfig();
  res.json({ success: (code || "").trim() === (config.email_passcode || "").trim() });
});

app.post("/api/v-bday/validate-reward-passcode", async (req, res) => {
  const { code } = req.body;
  const config = await ensureBirthdayConfig();
  res.json({ success: (code || "").trim() === (config.reward_passcode || "").trim() });
});

app.get("/api/v-bday/reward-passcode", async (req, res) => {
  const config = await ensureBirthdayConfig();
  res.json({ reward_passcode: config.reward_passcode || "" });
});

app.get("/api/v-bday/scrapbook", async (req, res) => {
  const config = await ensureBirthdayConfig();
  const notes = await BirthdayScrapbook.find().sort({ order: 1, _id: 1 });
  res.json({
    scrapbook_photo_url: config.scrapbook_photo_url || "",
    scrapbook_title: config.scrapbook_title || "",
    scrapbook_intro_text: config.scrapbook_intro_text || "",
    scrapbook_outro_photo_url: config.scrapbook_outro_photo_url || "",
    scrapbook_outro_text: config.scrapbook_outro_text || "",
    scrapbook_outro_audio_url: config.scrapbook_outro_audio_url || "",
    reward_passcode: config.reward_passcode || "",
    notes,
  });
});

app.get("/api/v-bday/replies", async (req, res) => {
  const { secret } = req.query;
  if (secret !== "sajak-admin") {
    return res.status(403).json({ error: "Akses ditolak" });
  }
  const replies = await BirthdayReply.find().sort({ created_at: -1 });
  res.json(replies);
});

app.get("/api/v-bday/subscribers", async (req, res) => {
  const { secret } = req.query;
  if (secret !== "sajak-admin") {
    return res.status(403).json({ error: "Akses ditolak" });
  }
  const subscribers = await BirthdaySubscriber.find().sort({ created_at: -1 });
  res.json(subscribers);
});

app.get("/api/v-bday/subscriber-status", async (req, res) => {
  const subscriber = await BirthdaySubscriber.findOne().sort({ created_at: 1 });
  res.json({
    has_subscriber: Boolean(subscriber),
    email: subscriber?.email || "",
  });
});

app.post("/api/v-bday/subscribe-email", async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return res.status(400).json({ error: "Email tidak valid." });
  }

  const existing = await BirthdaySubscriber.findOne().sort({ created_at: 1 });
  if (existing && existing.email !== normalizedEmail) {
    return res.status(409).json({
      success: false,
      error: "Email untuk halaman ini sudah tersimpan. Tidak bisa menambah email baru.",
      existing_email: existing.email,
    });
  }

  if (existing && existing.email === normalizedEmail) {
    return res.json({ success: true, subscriber: existing, already_exists: true });
  }

  const subscriber = await BirthdaySubscriber.create({
    email: normalizedEmail,
    created_at: new Date(),
  });

  res.json({ success: true, subscriber, already_exists: false });
});

app.post("/api/v-bday/reply", birthdayUpload.fields([
  { name: "voice_reply", maxCount: 1 },
  { name: "photo_reply", maxCount: 1 },
]), async (req, res) => {
  const { gift_choice, reply_message, photo_reply_note } = req.body;
  if (!gift_choice) {
    return res.status(400).json({ error: "Pilihan kado wajib diisi." });
  }
  if (!reply_message && !req.files?.voice_reply?.[0] && !req.files?.photo_reply?.[0]) {
    return res.status(400).json({ error: "Minimal kirim salah satu: surat, pesan suara, atau foto." });
  }

  const saved = await BirthdayReply.create({
    gift_choice: String(gift_choice).trim(),
    reply_message: String(reply_message || "").trim(),
    voice_reply_url: req.files?.voice_reply?.[0] ? `/v-spesial/uploads/${req.files.voice_reply[0].filename}` : "",
    photo_reply_url: req.files?.photo_reply?.[0] ? `/v-spesial/uploads/${req.files.photo_reply[0].filename}` : "",
    photo_reply_note: String(photo_reply_note || "").trim(),
  });

  res.json({
    success: true,
    message: "Pesan tersimpan. Sampai ketemu hari Sabtu, Sayang.",
    reply: saved,
  });
});

app.post("/api/v-bday/admin/config", async (req, res) => {
  const {
    secret,
    target_date,
    email_passcode,
    reward_passcode,
    scrapbook_photo_url,
    scrapbook_title,
    scrapbook_intro_text,
    scrapbook_outro_photo_url,
    scrapbook_outro_text,
    scrapbook_outro_audio_url,
    reward_image_1,
    reward_image_2,
    reward_image_3,
  } = req.body;

  if (secret !== "sajak-admin") {
    return res.status(403).json({ error: "Akses ditolak" });
  }

  await ensureBirthdayConfig();
  const config = await BirthdayConfig.findOneAndUpdate(
    {},
    {
      target_date: target_date ? new Date(target_date) : null,
      email_passcode: email_passcode || "",
      reward_passcode: reward_passcode || "",
      scrapbook_photo_url: scrapbook_photo_url || "",
      scrapbook_title: scrapbook_title || "",
      scrapbook_intro_text: scrapbook_intro_text || "",
      scrapbook_outro_photo_url: scrapbook_outro_photo_url || "",
      scrapbook_outro_text: scrapbook_outro_text || "",
      scrapbook_outro_audio_url: scrapbook_outro_audio_url || "",
      reward_image_1: reward_image_1 || "",
      reward_image_2: reward_image_2 || "",
      reward_image_3: reward_image_3 || "",
    },
    { new: true }
  );

  res.json({ success: true, config });
});

app.post("/api/v-bday/admin/send-codes", async (req, res) => {
  const { secret, force } = req.body;
  if (secret !== "sajak-admin") {
    return res.status(403).json({ error: "Akses ditolak" });
  }

  const result = await sendBirthdayCodes({ force: Boolean(force) });
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.post("/api/v-bday/admin/reset-subscriber", async (req, res) => {
  const { secret } = req.body;
  if (secret !== "sajak-admin") {
    return res.status(403).json({ error: "Akses ditolak" });
  }

  const deleted = await BirthdaySubscriber.deleteMany({});
  res.json({ success: true, deleted_count: deleted.deletedCount || 0 });
});

app.post("/api/v-bday/admin/scrapbook", async (req, res) => {
  const { secret, notes, order } = req.body;
  if (secret !== "sajak-admin") {
    return res.status(403).json({ error: "Akses ditolak" });
  }

  const created = await BirthdayScrapbook.create({
    notes: notes || "",
    order: Number(order) || 0,
  });

  res.json({ success: true, item: created });
});

app.put("/api/v-bday/admin/scrapbook/:id", async (req, res) => {
  const { secret, notes, order } = req.body;
  if (secret !== "sajak-admin") {
    return res.status(403).json({ error: "Akses ditolak" });
  }

  const updated = await BirthdayScrapbook.findByIdAndUpdate(
    req.params.id,
    { notes: notes || "", order: Number(order) || 0 },
    { new: true }
  );

  res.json({ success: true, item: updated });
});

app.delete("/api/v-bday/admin/scrapbook/:id", async (req, res) => {
  const { secret } = req.body;
  if (secret !== "sajak-admin") {
    return res.status(403).json({ error: "Akses ditolak" });
  }

  await BirthdayScrapbook.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.post("/api/v-bday/send-email", async (req, res) => {
  const {
    to,
    subject = "Pesan Ulang Tahun untuk Ida",
    html,
    text,
    use_template,
    template_data,
  } = req.body;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(400).json({
      error: "SMTP belum dikonfigurasi. Isi SMTP_HOST, SMTP_PORT, SMTP_USER, dan SMTP_PASS di environment.",
    });
  }

  if (!to) {
    return res.status(400).json({ error: "Penerima email wajib diisi." });
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const result = await transporter.sendMail({
    from: buildFromAddress(),
    to,
    subject,
    text: text || "Ada pesan spesial untuk Ida.",
    html: use_template
      ? renderBirthdayEmailTemplate(template_data || {})
      : (html || renderBirthdayEmailTemplate()),
  });

  res.json({ success: true, messageId: result.messageId });
});

app.get("/api/v-bday/email-template-preview", async (req, res) => {
  const config = await ensureBirthdayConfig();
  const html = renderBirthdayEmailTemplate({
    preheader: "Momen spesialnya sudah tiba.",
    title: "Kode hadiah berhasil terkirim.",
    greeting: "Halo Ida Indarwati,",
    body: "Kode rahasia ini bisa kamu tulis di halaman utama V-Spesial saat momen itu tiba.",
    cardLabel: "Kode Untuk Ditulis",
    code: config.email_passcode || "#jangansampailupa",
    footer: "Simpan email ini dulu ya. Nanti cukup buka V-Spesial dan masukkan kodenya di sana.",
  });

  res.json({ success: true, html });
});

cron.schedule("*/10 * * * *", async () => {
  try {
    await connectDB();
    const result = await sendBirthdayCodes();
    if (result.success && result.sent_count > 0) {
      console.log(`[v-spesial] sent birthday codes to ${result.sent_count} subscriber(s) for ${result.send_key}`);
    }
  } catch (error) {
    console.error("[v-spesial] cron send codes failed:", error.message);
  }
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

app.get("/api/v4/state", async (req, res) => {
  res.json({ success: true, state: getV4PublicState() });
});

app.get("/api/v4/init-cards", async (req, res) => {
  const seedCards = [
    { type: "truth", level: 1, content: "Coba ceritain jujur, first impression kamu pas pertama kali liat profil sosmed pasanganmu gimana?" },
    { type: "truth", level: 1, content: "Hal paling receh apa yang sering bikin kalian berantem kecil atau ngambekan?" },
    { type: "dare", level: 1, content: "Tiruin gaya bicara atau kebiasaan pasanganmu pas dia lagi ngambek/kesel." },
    { type: "dare", level: 1, content: "Tahan tawa selama 1 menit sambil digombalin pasanganmu dan saling menatap mata." },
    { type: "truth", level: 2, content: "Waktu muter-muter cari kos di Magelang buat persiapan PPG, momen kecil apa dari pasanganmu yang paling bikin berkesan?" },
    { type: "truth", level: 2, content: "Momen LDR apa yang paling berat, dan gimana kamu ngelewatinnya pas lagi kangen banget sama pasanganmu?" },
    { type: "dare", level: 2, content: "Ceritain ulang detik-detik pas kalian jadian tanggal 19 Oktober di Balekambang versi sudut pandangmu, pakai gaya lebay/dramatis." },
    { type: "dare", level: 2, content: "Tunjukin satu chat/VN dari pasanganmu yang paling sering kamu buka ulang pas lagi rindu." },
    { type: "truth", level: 3, content: "Apa ketakutan terbesarmu dalam hubungan ini, dan gimana pasanganmu bisa bantu nenangin ketakutan itu?" },
    { type: "truth", level: 3, content: "Sebutkan satu janji kecil yang paling pengen kamu tepati buat hubungan kalian di masa depan nanti." },
    { type: "dare", level: 3, content: "Pegang kedua tangan pasanganmu, tatap matanya selama 1 menit penuh tanpa ngomong apa-apa, lalu peluk." },
    { type: "dare", level: 3, content: "Ucapkan 3 hal yang paling kamu syukuri dari kehadiran pasanganmu di hidupmu sambil mengelus tangannya." },
  ];

  await V4Card.deleteMany({});
  await V4Card.insertMany(seedCards);
  res.send("Data berhasil di-seed!");
});

app.post("/api/v4/admin/login", (req, res) => {
  const password = String(req.body?.password || "");
  if (password !== V4_ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: "Password admin salah." });
  }
  res.json({ success: true });
});

app.post("/api/v4/admin/timer", requireV4Admin, async (req, res) => {
  const timerTarget = String(req.body?.timerTarget || "").trim();
  const isValid = /^([01]\d|2[0-3]):([0-5]\d)$/.test(timerTarget);
  if (!isValid) {
    return res.status(422).json({ success: false, message: "Format jam harus HH:mm." });
  }

  v4State.timerTarget = timerTarget;
  emitV4State();
  res.json({ success: true, timerTarget });
});

app.get("/api/v4/cards", requireV4Admin, async (req, res) => {
  const cards = await V4Card.find().sort({ level: 1, type: 1, createdAt: 1, _id: 1 }).lean();
  res.json({ success: true, cards });
});

app.post("/api/v4/cards", requireV4Admin, async (req, res) => {
  const { type, level, content } = req.body || {};
  const card = await V4Card.create({
    type,
    level: Number(level),
    content: String(content || "").trim(),
  });
  res.json({ success: true, card });
});

app.put("/api/v4/cards/:id", requireV4Admin, async (req, res) => {
  const { type, level, content } = req.body || {};
  const card = await V4Card.findByIdAndUpdate(
    req.params.id,
    {
      type,
      level: Number(level),
      content: String(content || "").trim(),
    },
    { new: true, runValidators: true },
  ).lean();

  if (!card) {
    return res.status(404).json({ success: false, message: "Kartu tidak ditemukan." });
  }

  res.json({ success: true, card });
});

app.delete("/api/v4/cards/:id", requireV4Admin, async (req, res) => {
  const card = await V4Card.findByIdAndDelete(req.params.id).lean();
  if (!card) {
    return res.status(404).json({ success: false, message: "Kartu tidak ditemukan." });
  }
  res.json({ success: true });
});

// --- SERVER ---
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT ?? "3001";

  http.listen(PORT, () =>
    console.log(`Server is running at http://localhost:${PORT}`),
  );
}
module.exports = app;
