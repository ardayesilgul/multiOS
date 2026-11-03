# Testler

```powershell
npm run build:native
npm test
npx playwright install chromium
npm run test:ui
```

Testler ayrı servisler başlatıp geçici veriler kullanır; gerçek panoya, başlangıç
ayarlarına veya kısayollara dokunmaz. API kontrolleri yetkilendirme, dosya yükleme,
kesilen aktarımlar, yinelenen adlar, kalıcı kayıtlar, temizleme ve kayıt klasörü
seçimini kapsar. Telefon arayüz testleri gönderme/indirme, kontroller, açık/koyu
görünüm ve taşmaları kontrol eder. Ekran görüntüleri Git'e alınmayan `test-results/`
klasörüne yazılır. Yüklü Edge'i kullanmak için:

```powershell
$env:MULTIOS_BROWSER_CHANNEL = 'msedge'
npm run test:ui
```

Masaüstü penceresini ayrı test profiliyle açmak için:

```powershell
npm run test:native
```

Bu test bir Windows masaüstü oturumu gerektirir. Açık/koyu görünümde en küçük
pencereyi açar; tepsiye gizleme, gizliyken dosya alma, pano duraklatma/devam,
bağlantı kontrolü ve eşleşme yenileme/vazgeçme işlemlerini sınar. Sonunda tepsiden
çıkar ve test servisini durdurur. Paket içeriğini sınamak için açılmış uygulama
klasörünü `node tests/native.js <uygulama-klasörü>` ile verebilirsiniz.

Pano testleri `tests/fixtures/clipboard.js` sürecini kullanır; kişisel Windows
panosuna dokunmaz. Yardımcıdan gecikmeli onay, hata, kapanma ve zaman aşımı
senaryoları kontrol edilir. `--real-network` seçeneği ağ profilini Windows'tan okur;
ağ ve güvenlik duvarı ayarlarını değiştirmez.

Gerçek iPhone izinleri, kestirme kurulumu, Wi-Fi değişiklikleri, uyku/uyanma,
HEIC kodekleri ve uzun videolar cihaz üzerinde ayrıca kontrol edilmelidir.
Otomatik kontroller her Windows yapılandırmasını kapsamaz.
