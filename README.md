<img align="left" src="assets/multios.png" alt="multiOS" width="88" height="88">
<img align="right" src="assets/header-spacer.svg" alt="" width="88" height="88">

<h1 align="center">multiOS</h1>

<br clear="both">

<p align="center"><strong>Türkçe</strong> · <a href="README.en.md">English</a></p>

iPhone ve Windows arasında yerel ağ üzerinden fotoğraf, dosya ve pano içeriği
paylaşın. Windows uygulaması yerel bir WPF penceresi ve sistem tepsisiyle çalışır.
Dosyalar doğrudan cihazlar arasında aktarılır; bulut hesabı gerekmez.

## Ekran görüntüleri

### Windows

<a href="assets/screenshots/windows-wide-light.png">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/screenshots/windows-wide-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/screenshots/windows-wide-light.png">
    <img alt="Windows · Gelen dosyalar" src="assets/screenshots/windows-wide-light.png" width="100%">
  </picture>
</a>

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
    <td>Fotoğraf gönderin, hazırlanan dosyaları indirin.</td>
    <td>Metin ve görselleri iki yönde paylaşın.</td>
  </tr>
</table>

## Gereksinimler

- Windows 10 veya 11, 64 bit ve .NET Framework 4.8.
- Geliştirme için Node.js 22 veya üzeri ve npm. Paketlenmiş uygulama Node.js'i içerir.
- iPhone ve bilgisayar aynı güvenilir yerel ağda olmalıdır. Windows Güvenlik
  Duvarı'nda özel ağlar için uygulamaya izin verin. Misafir Wi-Fi ağları cihazlar
  arasındaki bağlantıyı engelleyebilir.
- HEIC önizlemeleri Windows'ta yüklü görüntü kodeklerine bağlıdır; özgün dosyayı
  almak için önizleme desteği gerekmez.

## Kaynak koddan çalıştırma

Repoyu klonlayın, proje klasöründe PowerShell'i açın ve şu komutları çalıştırın:

```powershell
npm ci
npm run build:native
npm start
```

Derleme, Windows'un .NET Framework derleyicisiyle masaüstü uygulamasını, pano
yardımcısını ve küçük resim yardımcısını oluşturur. Visual Studio kurulumu gerekmez.
`npm run tray` yerel uygulamayı ve servisi başlatır. `npm run start:silent` yalnızca
servisi başlatır. Pencereyi kapattığınızda uygulama gizlenir ve dosya almaya devam
eder. Uygulamayı ve servisi tamamen durdurmak için sistem tepsisinden **Çıkış**'ı
seçin. Windows açılışında başlatma, Ayarlar'dan isteğe bağlı olarak açılır.

## iPhone'u bağlama

1. multiOS'ta **iPhone** bölümünü açıp QR kodunu telefonunuzla okutun.
2. Açılan sayfayı Safari'de kullanarak dosya gönderin veya bilgisayarda hazırlanan
   dosyaları indirin.
3. iOS Paylaş menüsünden göndermek için **Paylaş menüsü kurulumu** bölümünü açın.
   Önce kişisel gönderim adresini kopyalayın, ardından bağlantıdaki **PC'ye Gönder**
   kestirmesini ekleyin. Kurulum sorusuna kopyaladığınız adresi yapıştırıp kurulumu
   tamamlayın. Bu işlem yalnızca bir kez yapılır.

Paylaşılan kestirme, kurulumda kişisel gönderim adresinizi sorar. Bu adres telefon
sayfasından kopyalanan eşleşme anahtarını da içermelidir. Anahtar yeniden başlatma
ve güncellemelerde korunur; her kullanımda eşleştirme gerekmez. Ağınızda çalışıyorsa
`multios.local` adresini tercih edin. IP adresini kullanırsanız bilgisayarın IP'si
değiştiğinde kestirmedeki adresi de güncellemeniz gerekir.
Kolay erişim için telefon sayfasını Ana Ekran'a ekleyebilirsiniz.
`MULTIOS_SHORTCUT_URL` ortam değişkeni, varsayılan iCloud kestirme bağlantısını değiştirir.

## Tek dosyalık uygulama paketi oluşturma

```powershell
npm ci
npm run build:dist
```

Çıktı `dist/multiOS.exe` dosyasıdır. Derleme, geçici bir klasöre yalnızca uygulamanın
çalışması için gereken bağımlılıkları kurar ve pakete eklenen Node.js sürümünün
lisansını resmî Node.js reposundan indirir; internet bağlantısı gerekir. Paketi
çalıştırdığınızda dosyalar `%LOCALAPPDATA%/multiOS/app` altına açılır, Masaüstü ve
Başlat menüsü kısayolları oluşturulur ve yerel uygulama penceresi açılır.

Mevcut yerel kurulumu güncellemek için `scripts/update-local.ps1` kullanılabilir.
Script, kurulumu `%LOCALAPPDATA%/multiOS/backups` altına yedekler, uygulamayı
durdurur, yeni paketi yükler ve eşleşme anahtarının korunduğunu doğrular. Devam
eden bir aktarım varsa güncellemeyi başlatmaz.

## Veriler ve güvenlik

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

## Doğrulama

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

## Proje yapısı

- `src/native/`: WPF uygulaması, yardımcılar ve paket başlatıcısı.
- `src/`: HTTP servisi, eşleşme, dosya saklama ve aktarım durumu.
- `public/`: iPhone sayfası ve stilleri.
- `scripts/`: derleme ve yerel kurulum araçları.
- `tests/`: ayrı servislerle çalışan API ve telefon arayüz testleri.

## Lisans

MIT; bkz. [LICENSE](LICENSE). Apple gezinme simgesinin atfı
[assets/NOTICE.md](assets/NOTICE.md) dosyasındadır. Bağımlılıkların kendi lisansları,
paket içindeki `node_modules` klasöründe korunur. Pakete eklenen Node.js'in lisansı
`runtime/LICENSE` dosyasındadır.
