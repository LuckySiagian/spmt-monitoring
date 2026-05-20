export const HUMAN_DIAGNOSTICS = {
  // STATUS ONLINE
  ONLINE_NORMAL: "Website dapat dibuka dan digunakan dengan normal. Server merespon dengan baik dan tidak ditemukan gangguan yang mempengaruhi akses pengguna.",
  ONLINE_SLOW: "Website masih dapat diakses dengan normal, namun respon server sedikit lebih lambat dari biasanya.",
  ONLINE_REDIRECT: "Website mengarahkan pengguna ke halaman atau alamat lain secara otomatis dan masih dapat diakses dengan normal.",
  ONLINE_RESTRICTED: "Website aktif dan server merespon dengan normal, namun akses ke halaman ini dibatasi sehingga memerlukan login atau izin tertentu.",
  
  // STATUS CRITICAL
  SSL_EXPIRED: "Sertifikat keamanan website sudah kadaluarsa sehingga browser dapat menampilkan peringatan keamanan kepada pengguna.",
  SSL_SELF_SIGNED: "Sertifikat keamanan website tidak dikenali sebagai sertifikat resmi sehingga koneksi dianggap tidak aman oleh browser.",
  SSL_INVALID_HOST: "Sertifikat keamanan website tidak sesuai dengan nama domain yang diakses sehingga browser akan menampilkan peringatan keamanan.",
  HTTP_500: "Server website mengalami gangguan internal sehingga halaman tidak dapat ditampilkan dengan normal.",
  HTTP_502: "Server website menerima respon yang tidak valid dari layanan backend atau server penghubung.",
  HTTP_503: "Website sedang mengalami beban tinggi atau dalam proses maintenance sehingga layanan sementara tidak tersedia.",
  HTTP_504: "Server membutuhkan waktu terlalu lama untuk mendapatkan respon sehingga koneksi gagal diproses.",
  WAF_BLOCK: "Akses ke website dibatasi oleh sistem keamanan atau firewall sehingga halaman tidak dapat dimuat dengan normal.",
  BOT_PROTECTION: "Website menggunakan sistem perlindungan otomatis yang membatasi akses monitoring atau bot.",
  CAPTCHA_BLOCK: "Website meminta verifikasi tambahan sebelum halaman dapat diakses karena sistem keamanan mendeteksi aktivitas tidak biasa.",
  RATE_LIMIT: "Server membatasi terlalu banyak permintaan dalam waktu singkat sehingga akses sementara dibatasi.",
  CONTENT_BLOCKED: "Sebagian konten website tidak dapat dimuat karena pembatasan keamanan atau konfigurasi server.",
  HIGH_RESPONSE_TIME: "Website masih dapat diakses, namun respon server sangat lambat dan dapat mengganggu pengalaman pengguna.",
  EMPTY_RESPONSE: "Server merespon permintaan tetapi tidak mengirimkan halaman atau data yang dapat ditampilkan.",
  CLOUDFLARE_PROTECTION: "Website menggunakan perlindungan tambahan dari Cloudflare sehingga akses monitoring dibatasi sementara.",
  
  // STATUS OFFLINE
  DNS_FAIL: "Alamat domain website tidak dapat ditemukan sehingga website gagal diakses melalui jaringan internet.",
  TIMEOUT: "Website membutuhkan waktu terlalu lama untuk merespon sehingga koneksi dianggap gagal.",
  CONNECTION_REFUSED: "Server menolak koneksi dari sistem monitoring sehingga halaman tidak dapat diakses.",
  NETWORK_UNREACHABLE: "Jaringan menuju server website tidak dapat dijangkau dari lokasi monitoring.",
  HOST_UNREACHABLE: "Server tujuan tidak dapat dihubungi sehingga website gagal dibuka.",
  TCP_FAILURE: "Koneksi ke server gagal dilakukan sehingga website tidak dapat diakses.",
  NO_HTTP_RESPONSE: "Server tidak memberikan respon HTTP sehingga halaman website gagal dimuat.",
  SERVER_DOWN: "Server website sedang tidak aktif atau tidak merespon permintaan sama sekali.",
  INTERNET_NODE_PROBLEM: "Sistem monitoring mengalami kendala koneksi internet sehingga status website belum dapat dipastikan secara akurat.",
  
  // STATUS MAINTENANCE
  MAINTENANCE_MODE: "Website sedang dalam proses maintenance atau perbaikan sistem sehingga layanan untuk sementara tidak dapat digunakan.",
  SCHEDULED_MAINTENANCE: "Website sedang menjalani pemeliharaan terjadwal untuk meningkatkan stabilitas dan performa layanan.",
}

export const getHumanNarrative = (key, status) => {
  return HUMAN_DIAGNOSTICS[key] || `Sistem mendeteksi kondisi ${status}. Sedang melakukan observasi lebih lanjut.`
}
