<p>
  <img src="assets/readme-header.svg" alt="multiOS" width="100%">
</p>

<p align="center"><strong>Türkçe</strong> · <a href="README.en.md">English</a></p>

iPhone ve Windows arasında yerel ağ üzerinden fotoğraf, dosya ve pano içeriği
paylaşın. Windows uygulaması yerel bir WPF penceresi ve sistem tepsisiyle çalışır.
Dosyalar doğrudan cihazlar arasında aktarılır; bulut hesabı gerekmez.

[**Windows için indir · v0.2.0**](https://github.com/ardayesilgul/multiOS/releases/latest/download/multiOS.exe)

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

## Kurulum

Windows 10/11 (64 bit) ve .NET Framework 4.8 gerekir. EXE'yi açtığınızda uygulama
kurulur ve Masaüstü'ne kısayol eklenir. Node.js kurmanız gerekmez.

Pencereyi kapatmak uygulamayı sistem tepsisine gizler; dosya almaya devam eder.
Tamamen kapatmak için tepsiden **Çıkış**'ı seçin.

## iPhone'u bağlama

1. Telefon ve bilgisayarı aynı Wi-Fi ağına bağlayın.
2. multiOS'ta **iPhone** bölümünü açıp QR kodunu okutun.
3. Safari'de açılan sayfadan fotoğraf ve dosya gönderin, bilgisayardaki dosyaları
   indirin veya panoyu paylaşın.

Paylaş menüsünden göndermek için telefon sayfasındaki **Paylaş menüsü kurulumu**
bölümünü açın. Kişisel adresi kopyalayın, **PC'ye Gönder** kestirmesini ekleyin ve
kurulum sorusuna adresi yapıştırın. Bu işlem bir kez yapılır; eşleşme güncellemelerde korunur.

`multios.local` ağınızda çalışmazsa IP adresini kullanabilirsiniz. IP değişirse
kestirmedeki adresi de güncellemeniz gerekir. Windows Güvenlik Duvarı'nda özel ağlar
için uygulamaya izin verin.

## Dosyalar ve gizlilik

- Gelen dosyalar `İndirilenler/multiOS` klasörüne kaydedilir. Ayarlar'dan başka bir klasör seçebilirsiniz.
- Uygulama açıkken Windows panosu eşleşmiş telefondan erişilebilir.
- Aktarımlar yerel HTTP kullanır. Güvenilir bir özel ağ kullanın; servisi internete açmayın.
- HEIC önizlemesi Windows kodeklerine bağlıdır; dosyayı almak için kodek gerekmez.

[Verilerin saklandığı konumlar ve temizleme işlemleri](docs/data.md)

## Geliştirme

```powershell
npm ci
npm run build:native
npm start
```

Geliştirme için Node.js 22 veya üzeri gerekir.
[Derleme ve paketleme](docs/development.md) · [Test ayrıntıları](docs/testing.md)

```powershell
npm test
```

## Lisans

MIT; bkz. [LICENSE](LICENSE). Apple gezinme simgesinin atfı
[assets/NOTICE.md](assets/NOTICE.md) dosyasındadır. Bağımlılıkların kendi lisansları,
paket içindeki `node_modules` klasöründe korunur. Pakete eklenen Node.js'in lisansı
`runtime/LICENSE` dosyasındadır.

---

**Geliştirici:** [Arda Yeşilgül](https://github.com/ardayesilgul).
