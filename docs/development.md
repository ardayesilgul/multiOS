# Geliştirme

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

## Proje yapısı

- `src/native/`: WPF uygulaması, yardımcılar ve paket başlatıcısı.
- `src/`: HTTP servisi, eşleşme, dosya saklama ve aktarım durumu.
- `public/`: iPhone sayfası ve stilleri.
- `scripts/`: derleme ve yerel kurulum araçları.
- `tests/`: ayrı servislerle çalışan API ve telefon arayüz testleri.

## Kısayollar ve yapılandırma

`npm run install:shortcut`, kurulu uygulama veya yerel derleme için Masaüstü ve
Başlat menüsü kısayollarını oluşturur.

`MULTIOS_SHORTCUT_URL`, varsayılan iCloud kestirme bağlantısını değiştirir.
Test ortamının dizin ve servis ayarları için [test belgesine](testing.md) bakın.
