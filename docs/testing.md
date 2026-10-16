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

Yerel uygulamanın `--capture <tam-png-yolu> --verify` modu; başlık yazısına
tıklamayı, pencereyi kapatıp tepsiye gizlemeyi, pencere gizliyken dosya almayı,
gezinmeyi, gönderilecek dosya hazırlamayı ve pano gösterimini kontrol eder;
ardından tepsideki çıkış işlemini çalıştırır. Bu modu ayrı `MULTIOS_PORT`,
`MULTIOS_DATA_DIR`, `MULTIOS_DROP_DIR` ve `MULTIOS_STAGED_DIR` değerleriyle,
`MULTIOS_DISABLE_CLIPBOARD=1` ve `MULTIOS_DISABLE_MDNS=1` ayarlarını kullanarak çalıştırın.

Gerçek iPhone izinleri, kestirme kurulumu, Wi-Fi değişiklikleri, uyku/uyanma,
HEIC kodekleri ve uzun videolar cihaz üzerinde ayrıca kontrol edilmelidir.
Otomatik kontroller her Windows yapılandırmasını kapsamaz.
