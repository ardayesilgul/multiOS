# Veriler ve güvenlik

- Gelen dosyalar varsayılan olarak `İndirilenler/multiOS` klasörüne kaydedilir.
  Ayarlar'dan Masaüstü'ndeki bir klasör dâhil, yazma izniniz olan herhangi bir
  klasörü seçebilirsiniz. Önceden alınan dosyalar yerlerinde kalır.
- Eşleşme bilgileri, geçmiş, pano önbelleği ve gönderim için hazırlanan dosya
  kopyaları `%APPDATA%/multiOS` altında tutulur. Bu klasörü ve kişisel eşleşme
  bağlantılarınızı başkalarıyla paylaşmayın.
- Gelen dosya geçmişini temizlemek özgün dosyaları silmez. Gönderim listesini
  temizlemek kaynakları değil, hazırlanmış kopyaları siler. Uygulamadaki pano
  kaydını temizlemek Windows panosunu değiştirmez.
- Telefondan gelen istekler eşleşme anahtarı gerektirir. Yerel masaüstü kontrolü
  yalnızca aynı bilgisayardan, yerel Host başlığıyla erişilebilir. Farklı web
  kaynaklarından gelen tarayıcı istekleri reddedilir.
- Aktarımlar şifreli HTTPS yerine yerel HTTP kullanır. Güvenilir bir özel ağ
  kullanın; servisi port yönlendirmeyle internete açmayın veya herkese açık bir
  sunucu olarak kullanmayın.
- Pano yardımcısı çalışırken Windows panosunu izler. Güncel pano içeriğine
  eşleşmiş cihazlar erişebilir. Durdurmak için tepsiden **Çıkış**'ı seçin.
  Telefondan panoya her istekte en fazla 50 MB boyutunda tek bir görsel gönderilebilir.
