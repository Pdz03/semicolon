#!/bin/bash

# 1. Masuk ke folder project secara absolut (Penting agar tidak nyasar)
cd /home/pdz03/SK-Project/semicolon

echo "Menarik kode terbaru dari GitHub..."
git pull origin main

echo "Install dependency baru (jaga-jaga kalau ada tambahan di package.json)..."
npm install

echo "Merestart server Node.js di PM2..."
pm2 restart semicolon

echo "Deploy Selesai!"
