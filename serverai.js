require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const app = express();
const path = require("path");
const http = require("http").createServer(app);
const io = require("socket.io")(http);

// --- KONEKSI DB ---
let cached = global.mongoose || { conn: null, promise: null };
global.mongoose = cached;

async function connectDB() {
    if (cached.conn) return cached.conn;
    if (!cached.promise) {
        cached.promise = mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false }).then((m) => m);
    }
    cached.conn = await cached.promise;
    return cached.conn;
}

app.use(express.json());
app.use(bodyParser.json());
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// --- SCHEMAS ---
const SettingV3Schema = new mongoose.Schema({ key: String, release_time: Date });
const SettingV3 = mongoose.model("SettingV3", SettingV3Schema);

// --- STATE V3 (Pusat Kendali) ---
let v3State = {
    current_number: null,
    jasuke: { current_flag: 1, is_solved: false, data: {}, coordinates: [] },
    telur_gulung: {
        suwit_score: { fendi: 0, ida: 0 },
        suwit_choices: { fendi: null, ida: null },
        winner_bo5: null,
        player_colors: { fendi: null, ida: null }, // fendi: 'biru', ida: 'kuning'
        finding_results: [],
        current_turn: null, // Giliran scan
        current_pair_index: 1,
        scanned_status: { biru: false, kuning: false }
    },
    terang_bulan: { collected_flags: [] }
};

// --- TEMPAT TARUH RANDOM STRING QR ---
const pairingMap = {
    1: { biru: "628ab0b59b05dd46", kuning: "5721916a61b93811", type: "question", content: "Apa impresi pertamamu pas pertama kali kita sepedaan ke Colomadu?" },
    2: { biru: "3da9778e20bea48a", kuning: "359f4922cb28e0c7", type: "puzzle", content: [1, 2] },
    3: { biru: "0816e0edb64188e9", kuning: "ce5c0b55ed766dec", type: "question", content: "Dari semua momen LDR, hal kecil apa yang paling bikin kamu ngerasa disayang?" },
    4: { biru: "0365bbcce40aa2f9", kuning: "a5f8fe43bc6a4161", type: "puzzle", content: [3, 4] },
    5: { biru: "61ff890dc644acd7", kuning: "2cbd4a7f98afc591", type: "question", content: "Apa satu janji kecil yang pengen kita jaga bareng setelah PPG ini?" }
};

// --- API ---
app.get('/api/v3/status', async (req, res) => {
    let config = await SettingV3.findOne({ key: 'config_v3' });
    if (!config) config = await SettingV3.create({ key: 'config_v3', release_time: new Date("2026-04-12T09:00:00+07:00") });
    res.json(config);
});

// --- SOCKET ---
io.on("connection", (socket) => {
    socket.on("v3_join", () => socket.join("v3_room"));

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

    socket.on("v3_jasuke_submit_coords", (coords) => {
        v3State.jasuke.coordinates.push(coords);
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

    // Scan Logic
    socket.on("v3_tb_scan_qr", (data) => {
        if (data.player !== v3State.telur_gulung.current_turn) return socket.emit("v3_tb_scan_error", "Bukan giliranmu!");

        const playerColor = v3State.telur_gulung.player_colors[data.player];
        const pair = pairingMap[v3State.telur_gulung.current_pair_index];
        const expected = pair[playerColor];

        if (data.qr_code === expected) {
            v3State.telur_gulung.scanned_status[playerColor] = true;
            io.to("v3_room").emit("v3_tb_partial_success", { player: data.player, status: v3State.telur_gulung.scanned_status });

            if (v3State.telur_gulung.scanned_status.biru && v3State.telur_gulung.scanned_status.kuning) {
                io.to("v3_room").emit("v3_tb_pair_complete", { 
                    index: v3State.telur_gulung.current_pair_index, 
                    type: pair.type, 
                    content: pair.content 
                });
            } else {
                const otherPlayer = (data.player === 'fendi') ? 'ida' : 'fendi';
                v3State.telur_gulung.current_turn = otherPlayer;
                io.to("v3_room").emit("v3_tb_turn_change", v3State.telur_gulung.current_turn);
            }
        } else {
            socket.emit("v3_tb_scan_error", `Kode Salah! Cari Kupu-kupu ${playerColor.toUpperCase()}.`);
        }
    });

    socket.on("v3_tb_next_pair", () => {
        v3State.telur_gulung.current_pair_index++;
        v3State.telur_gulung.scanned_status = { biru: false, kuning: false };
        v3State.telur_gulung.current_turn = v3State.telur_gulung.finding_results[0];
        io.to("v3_room").emit("v3_tb_status", { idx: v3State.telur_gulung.current_pair_index, turn: v3State.telur_gulung.current_turn });
    });

    // Radar
    socket.on("v3_trb_init", () => {
        io.to("v3_room").emit("v3_trb_data", { coords: v3State.jasuke.coordinates, collected: v3State.terang_bulan.collected_flags });
    });
    socket.on("v3_trb_collect", (idx) => {
        if(!v3State.terang_bulan.collected_flags.includes(idx)) v3State.terang_bulan.collected_flags.push(idx);
        io.to("v3_room").emit("v3_trb_collected", v3State.terang_bulan.collected_flags);
        if(v3State.terang_bulan.collected_flags.length === 3) io.to("v3_room").emit("v3_trb_all_finish");
    });
});

app.use(express.static(path.join(__dirname, "public")));
const PORT = process.env.PORT || 3001;
http.listen(PORT, () => console.log(`Server ON port ${PORT}`));
module.exports = app;