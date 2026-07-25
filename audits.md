# AUDIT.md — Log Temuan Audit

Agent mengisi file ini setiap kali menjalankan audit (langkah 1 dan 4 di AGENTS.md).
Setiap temuan wajib punya severity, lokasi, deskripsi, dan status.

Severity:
- **Critical** — bug/celah yang bisa menyebabkan data hilang, sistem down, atau
  eksploitasi keamanan (auth bypass, injection, secret bocor)
- **High** — bug fungsional signifikan, error handling hilang di jalur penting,
  validasi input tidak ada
- **Medium** — edge case tak tertangani, kode duplikat/tidak konsisten, performa
  buruk pada skala wajar
- **Low** — gaya kode, penamaan, dokumentasi, cleanup kecil

Status: `open` → `in-progress` → `fixed` → `verified`

---

## Ringkasan Audit Terakhir
- Tanggal audit: `<isi>`
- Ruang lingkup: `<seluruh project / modul tertentu>`
- Jumlah temuan: Critical `_` · High `_` · Medium `_` · Low `_`

---

## Kategori yang Wajib Dicek Setiap Audit

### 1. Keamanan
- Validasi & sanitasi input (user input, query param, file upload, payload API)
- Autentikasi & otorisasi (endpoint yang seharusnya protected tapi tidak)
- Secret/API key/password hardcoded di kode atau ter-commit ke git
- Injection (SQL, command, path traversal, XSS)
- Rate limiting pada endpoint publik/sensitif

### 2. Error Handling & Reliabilitas
- `catch` kosong atau error yang di-swallow tanpa logging
- Kegagalan network/IO tidak ditangani (timeout, retry, fallback)
- Race condition pada operasi async/paralel
- Null/undefined yang tidak dicek sebelum dipakai

### 3. Logika & Edge Case
- Input kosong, nol, negatif, sangat besar, karakter aneh
- Batas array/list (empty list, index out of range)
- Concurrency: dua request/proses mengubah data yang sama bersamaan
- Locale/timezone/encoding yang tidak konsisten

### 4. Test Coverage
- Fungsi/modul kritikal tanpa test sama sekali
- Test yang ada hanya menguji "happy path"
- Test yang di-skip/di-comment tanpa alasan jelas

### 5. Performa
- Query database N+1 atau tanpa index
- Loop/algoritma dengan kompleksitas tidak wajar untuk skala data project
- Resource (koneksi, file handle, memory) yang tidak di-release

### 6. Konsistensi & Maintainability
- Kode duplikat yang seharusnya di-ekstrak jadi fungsi/module bersama
- Konvensi penamaan/struktur folder yang tidak konsisten
- Dependency usang atau punya kerentanan keamanan diketahui
- `TODO`/`FIXME`/kode mati (dead code) yang dibiarkan

---

## Daftar Temuan

| ID | Severity | Lokasi (file:line) | Deskripsi | Status |
|----|----------|---------------------|-----------|--------|
| A001 | | | | open |

> Tambahkan baris baru untuk setiap temuan. Setelah temuan diperbaiki dan diverifikasi
> lewat test, ubah status jadi `verified` — jangan dihapus, biarkan sebagai riwayat.

---

## Riwayat Siklus Audit
| Siklus | Tanggal | Temuan Baru | Temuan Belum Selesai dari Siklus Sebelumnya | Catatan |
|--------|---------|--------------|-----------------------------------------------|---------|
| 1 | | | - | Audit awal |