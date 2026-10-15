<img align="left" src="assets/multios.png" alt="multiOS" width="56">

<h1 align="center">multiOS</h1>

<p align="center"><strong>Türkçe</strong> · <a href="README.en.md">English</a></p>

iPhone ile Windows arasında fotoğraf, dosya ve pano paylaşmak için geliştirdiğim
bir uygulama. İki cihazın aynı Wi-Fi ağına bağlı olması yeterli; dosyalar doğrudan
bilgisayarına gelir, bulut hesabı açmana gerek yok. Pencereyi kapatsan da sistem
tepsisinde çalışıp dosya almaya devam eder.

## Ekran görüntüleri

### Windows

<p align="center">
<a href="assets/screenshots/windows-light.png">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/screenshots/windows-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/screenshots/windows-light.png">
    <img alt="Windows · Gelen dosyalar" src="assets/screenshots/windows-light.png" width="600">
  </picture>
</a>
</p>

### Telefon

<table>
  <tr>
    <th width="50%">Dosyalar</th>
    <th width="50%">Pano</th>
  </tr>
  <tr>
    <td valign="top"><a href="assets/screenshots/phone-files-light.png">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/screenshots/phone-files-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/screenshots/phone-files-light.png">
    <img alt="Telefon · Dosya gönderme ve indirme" src="assets/screenshots/phone-files-light.png" width="100%">
  </picture>
</a></td>
    <td valign="top"><a href="assets/screenshots/phone-clipboard-light.png">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/screenshots/phone-clipboard-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/screenshots/phone-clipboard-light.png">
    <img alt="Telefon · Pano paylaşımı" src="assets/screenshots/phone-clipboard-light.png" width="100%">
  </picture>
</a></td>
  </tr>
  <tr>
    <td>Fotoğraf ve dosya gönderme, bilgisayardan indirme.</td>
    <td>Telefonla bilgisayar arasında metin ve görsel paylaşma.</td>
  </tr>
</table>

## Neler gerekiyor?

- Windows 10 veya 11, 64 bit ve .NET Framework 4.8.
- Geliştirme için Node.js 22 veya üzeri ve npm. Paketlenmiş uygulama Node.js'i içerir.
- iPhone ve bilgisayar aynı güvenilir yerel ağa bağlı olmalı. Windows Güvenlik
  Duvarı'nda özel ağlar için uygulamaya izin vermen gerekebilir. Misafir Wi-Fi ağları cihazlar
  arasındaki bağlantıyı engelleyebilir.
- HEIC önizlemeleri Windows'ta yüklü görüntü kodeklerine bağlıdır; özgün dosyayı
  almak için bu desteğe gerek yok.

## Çalıştırma

Repoyu klonladıktan sonra proje klasöründe PowerShell aç:

```powershell
npm ci
npm run build:native
npm start
```

Visual Studio kurmana gerek yok; derleme Windows'taki .NET Framework derleyicisini kullanır.
`npm run tray` uygulamayı ve servisi, `npm run start:silent` sadece servisi başlatır.
Tamamen kapatmak için sistem tepsisindeki **Çıkış** seçeneğini kullan.
Windows açıldığında başlamasını istersen Ayarlar'dan açabilirsin.

## iPhone bağlantısı

1. multiOS'ta **iPhone** bölümünü aç ve QR kodunu telefonunla okut.
2. Açılan sayfadan fotoğraf veya dosya gönderebilir, bilgisayarda hazırladığın
   dosyaları indirebilir ve panoyu paylaşabilirsin.
3. iOS Paylaş menüsünü de kullanmak istersen **Paylaş menüsü kurulumu** bölümünü aç.
   Kişisel gönderim adresini kopyala, **PC'ye Gönder** kestirmesini ekle ve kurulum
   sorusuna bu adresi yapıştır. Bunu bir kez yapman yeterli.

Her seferinde eşleştirmene gerek yok; bağlantı yeniden başlatmalarda ve güncellemelerde
korunur. Kolay erişmek için telefon sayfasını Ana Ekran'a ekleyebilirsin.

Adres seçerken önce `multios.local` seçeneğini dene. Ağında çalışmazsa IP adresini
kullanabilirsin; bilgisayarın IP'si değişirse kestirmedeki adresi de güncellemen gerekir.

## EXE oluşturma

```powershell
npm ci
npm run build:dist
```

Paket `dist/multiOS.exe` olarak oluşur. Derleme sırasında internet bağlantısı gerekir.
EXE'yi açtığında uygulama `%LOCALAPPDATA%/multiOS/app` altına kurulur;
Masaüstü ve Başlat menüsüne kısayol eklenir.

Mevcut kurulumu güncellemek için `scripts/update-local.ps1` kullanabilirsin.
Önce yedek alır, ardından yeni paketi kurar ve eşleşme bilgisini korur.
Aktarım devam ediyorsa güncellemeyi başlatmaz.

## Veriler ve güvenlik

- Gelen dosyalar varsayılan olarak `İndirilenler/multiOS` klasörüne kaydedilir.
  Ayarlar'dan Masaüstü dâhil, istediğin başka bir klasörü seçebilirsin. Önceden alınan dosyalar yerlerinde kalır.
- Eşleşme bilgileri, geçmiş, pano önbelleği ve gönderim için hazırlanan dosya
  kopyaları `%APPDATA%/multiOS` altında tutulur. Bu klasörü ve kişisel bağlantını başkalarıyla paylaşma.
- Gelen dosya geçmişini temizlemek özgün dosyaları silmez. Gönderim listesini
  temizlemek kaynakları değil, hazırlanmış kopyaları siler. Uygulamadaki pano
  kaydını temizlemek Windows panosunu değiştirmez.
- Telefondan gelen istekler eşleşme anahtarı gerektirir. Yerel masaüstü kontrolü
  yalnızca aynı bilgisayardan erişilebilir.
- Aktarımlar şifreli HTTPS yerine yerel HTTP kullanır. Güvenilir bir özel ağ
  kullan; servisi port yönlendirmeyle internete açma.
- Pano yardımcısı çalışırken Windows panosunu izler. Güncel pano içeriğine
  eşleşmiş cihazlar erişebilir. Durdurmak için tepsiden **Çıkış**'ı seç.
  Telefondan panoya her istekte en fazla 50 MB boyutunda tek bir görsel gönderilebilir.

## Testler

```powershell
npm run build:native
npm test
npx playwright install chromium
npm run test:ui
```

API testleri dosya aktarımı, eşleşme, kayıt klasörü ve geçmiş işlemlerini kontrol eder.
Telefon arayüz testleri gönderme, indirme, pano ve açık/koyu görünümü kapsar.
Testler geçici klasörlerle çalışır; kişisel dosyalarına ve Windows panosuna dokunmaz.

Chromium indirmek yerine bilgisayarındaki Edge'i kullanmak istersen:

```powershell
$env:MULTIOS_BROWSER_CHANNEL = 'msedge'
npm run test:ui
```

<details>
<summary>Masaüstü arayüz testi</summary>

`--capture <tam-png-yolu> --verify` modu; pencereyi kapatıp tepsiye gizlemeyi,
pencere gizliyken dosya almayı, gezinmeyi, dosya hazırlamayı ve panoyu kontrol eder.
Sonunda tepsideki çıkış işlemini çalıştırır.

Bu testi ayrı `MULTIOS_PORT`, `MULTIOS_DATA_DIR`, `MULTIOS_DROP_DIR` ve
`MULTIOS_STAGED_DIR` değerleriyle; `MULTIOS_DISABLE_CLIPBOARD=1` ve
`MULTIOS_DISABLE_MDNS=1` ayarlarını kullanarak çalıştır.

</details>

## Proje yapısı

- `src/native/`: WPF uygulaması, yardımcılar ve paket başlatıcısı.
- `src/`: HTTP servisi, eşleşme, dosya saklama ve aktarım durumu.
- `public/`: iPhone sayfası ve stilleri.
- `scripts/`: derleme ve yerel kurulum araçları.
- `tests/`: ayrı servislerle çalışan API ve telefon arayüz testleri.

## Lisans

[MIT](LICENSE) lisansıyla paylaşıyorum. Apple simgesinin atfı
[assets/NOTICE.md](assets/NOTICE.md) dosyasındadır. Bağımlılıkların kendi lisansları,
paket içindeki `node_modules` klasöründe korunur. Pakete eklenen Node.js'in lisansı
`runtime/LICENSE` dosyasındadır.
