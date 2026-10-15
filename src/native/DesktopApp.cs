using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Shell;
using System.Windows.Threading;
using Microsoft.Win32;
using Forms = System.Windows.Forms;

namespace MultiOS
{
    public sealed class DesktopApp : Application
    {
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 4 * 1024 * 1024 };
        readonly HttpClient api;
        readonly HttpClient uploads;
        readonly string root;
        readonly string dataDir;
        readonly string preferencesPath;
        readonly EventWaitHandle showEvent;
        readonly HashSet<string> seen = new HashSet<string>();
        readonly Dictionary<string, BitmapSource> thumbnails = new Dictionary<string, BitmapSource>();
        readonly SemaphoreSlim thumbnailSlots = new SemaphoreSlim(2);
        Dictionary<string, object> preferences = new Dictionary<string, object>();
        Dictionary<string, object> status;
        Window window;
        Forms.NotifyIcon tray;
        DispatcherTimer timer;
        DispatcherTimer feedbackTimer;
        Process service;
        bool polling, staging, exiting, initialPoll = true, loadingSettings, dark, receiving, dropActive;
        DateTime lastStart = DateTime.MinValue;
        string page = "Receive", receiveSignature = "", sendSignature = "", pairUrl = "", clipboardImagePath = "";
        string qaCapture;
        int failures;

        [STAThread]
        public static void Main(string[] args)
        {
            bool created;
            using (var mutex = new Mutex(true, InstanceName("Desktop"), out created))
            {
                if (!created)
                {
                    if (!args.Contains("--silent") || args.Contains("--show"))
                        using (var signal = new EventWaitHandle(false, EventResetMode.AutoReset, InstanceName("Show"))) signal.Set();
                    return;
                }
                try { new DesktopApp(args).Run(); }
                catch (Exception e) {
                    int index = Array.IndexOf(args, "--capture");
                    if (index >= 0 && args.Length > index + 1) File.WriteAllText(args[index + 1] + ".error.txt", e.ToString());
                    else MessageBox.Show(e.Message, "multiOS", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }

        DesktopApp(string[] args)
        {
            root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"..\.."));
            dataDir = Environment.GetEnvironmentVariable("MULTIOS_DATA_DIR") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "multiOS");
            preferencesPath = Path.Combine(dataDir, "desktop-preferences.json");
            try { preferences = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(preferencesPath)); } catch { }
            int port;
            if (!int.TryParse(Environment.GetEnvironmentVariable("MULTIOS_PORT"), out port)) port = 5050;
            // Bypass system HTTP proxies only for this loopback connection.
            api = new HttpClient(new HttpClientHandler { UseProxy = false }) { BaseAddress = new Uri("http://127.0.0.1:" + port), Timeout = TimeSpan.FromSeconds(4) };
            uploads = new HttpClient(new HttpClientHandler { UseProxy = false }) { BaseAddress = api.BaseAddress, Timeout = TimeSpan.FromMinutes(30) };
            showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, InstanceName("Show"));
            ShutdownMode = ShutdownMode.OnExplicitShutdown;
            window = LoadWindow("MainWindow.xaml");
            MainWindow = window;
            string appIcon = Path.Combine(root, "assets", "multios.ico");
            if (File.Exists(appIcon)) window.Icon = BitmapFrame.Create(new Uri(appIcon));
            var signature = LoadBitmap(Path.Combine(root, "assets", "ardayesilgul-signature.png"));
            var signatureView = Control<Border>("Signature");
            signatureView.Visibility = signature == null ? Visibility.Collapsed : Visibility.Visible;
            if (signature != null) signatureView.OpacityMask = new ImageBrush(signature) { Stretch = Stretch.Uniform };
            new WindowChrome { CaptionHeight = 0, ResizeBorderThickness = new Thickness(5), GlassFrameThickness = new Thickness(0), CornerRadius = new CornerRadius(0) }.Set(window);
            WireWindow();
            SetupTray();
            ApplyTheme(GetBool(preferences, "dark"));
            SelectPage("Receive");
            loadingSettings = true;
            Control<CheckBox>("DarkTheme").IsChecked = dark;
            Control<CheckBox>("AutoStart").IsChecked = IsAutoStart();
            loadingSettings = false;
            timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            timer.Tick += async (s, e) => {
                if (showEvent.WaitOne(0)) ShowMain();
                await Poll();
            };
            timer.Start();
            if (args.Contains("--show") || !args.Contains("--silent")) ShowMain();
            int captureIndex = Array.IndexOf(args, "--capture");
            if (captureIndex >= 0 && args.Length > captureIndex + 1) qaCapture = args[captureIndex + 1];
            Startup += async (s, e) => {
                await Poll();
                if (qaCapture != null) {
                    if (args.Contains("--small")) { window.Width = window.MinWidth; window.Height = window.MinHeight; }
                    if (args.Contains("--device")) SelectPage("Device");
                    if (args.Contains("--send")) SelectPage("Send");
                    if (args.Contains("--clipboard")) SelectPage("Clipboard");
                    if (args.Contains("--settings")) SelectPage("Settings");
                    if (args.Contains("--dark")) ApplyTheme(true);
                    await Task.Delay(1200);
                    if (args.Contains("--verify")) {
                        if (InsideButton(Control<TextBlock>("BrandText").Inlines.FirstInline) ||
                            !InsideButton(Control<Button>("CloseButton").Content as DependencyObject))
                            throw new Exception("Title bar hit testing failed");
                        if (Control<Border>("Signature").OpacityMask == null) throw new Exception("Signature did not load");
                        if (Control<Button>("ClearReceived").IsEnabled || Control<Button>("ClearOutbound").IsEnabled)
                            throw new Exception("Empty lists allow clearing");
                        window.Close();
                        if (window.IsVisible) throw new Exception("Close did not hide the main window");
                        var health = await api.GetAsync("/api/status");
                        health.EnsureSuccessStatusCode();
                        using (var upload = new MultipartFormDataContent()) {
                            upload.Add(new ByteArrayContent(File.ReadAllBytes(Path.Combine(root, "assets", "multios.png"))), "file", "tray-qa.png");
                            var received = await api.PostAsync("/api/upload", upload);
                            received.EnsureSuccessStatusCode();
                        }
                        await Poll();
                        if (!Rows(status, "transfers").Any(t => Rows(t, "files").Any(f => Str(f, "name") == "tray-qa.png")))
                            throw new Exception("Upload was not received while the main window was hidden");
                        if (!Control<Button>("ClearReceived").IsEnabled) throw new Exception("Received history cannot be cleared");
                        var receivedRow = Control<StackPanel>("ReceiveList").Children.OfType<Grid>().First();
                        var fileActions = (StackPanel)receivedRow.Children[2];
                        if (receivedRow.ContextMenu != null || fileActions.Children.Count != 2 ||
                            ((Button)fileActions.Children[0]).Content.ToString() != "Aç" ||
                            ((Button)fileActions.Children[1]).Content.ToString() != "Konumu aç")
                            throw new Exception("Received file actions are not inline");
                        ShowMain();
                        Control<Button>("NavSend").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                        if (Control<Grid>("SendPage").Visibility != Visibility.Visible) throw new Exception("Navigation failed");
                        await StageFiles(new[] { Path.Combine(root, "assets", "multios.png") });
                        if (!Rows(status, "outbound").Any()) throw new Exception("Native file staging failed");
                        if (!Control<Button>("ClearOutbound").IsEnabled) throw new Exception("Staged list cannot be cleared");
                        using (var clip = new StringContent("{\"text\":\"pano-kontrol\"}", Encoding.UTF8, "application/json")) {
                            (await api.PostAsync("/api/clipboard/set", clip)).EnsureSuccessStatusCode();
                        }
                        await Poll();
                        SelectPage("Clipboard");
                        if (Control<ScrollViewer>("ClipboardPage").Visibility != Visibility.Visible || Control<TextBox>("ClipboardText").Text != "pano-kontrol" || Control<Button>("CopyClipboard").Visibility != Visibility.Visible)
                            throw new Exception("Clipboard page did not show the received text");
                        SelectPage("Settings");
                        File.WriteAllText(qaCapture + ".checks.txt", "PASS title text and buttons hit testing; empty-list actions disabled; close hides window; hidden-window upload; received actions stay inline; navigation; native file staging; staged action enabled; clipboard page shows received text");
                    }
                    Capture(window, qaCapture);
                    if (args.Contains("--verify")) tray.ContextMenuStrip.Items.OfType<Forms.ToolStripMenuItem>().Single(item => item.Text == "Çıkış").PerformClick();
                    else await ExitApp();
                }
            };
        }

        Window LoadWindow(string name)
        {
            using (var stream = File.OpenRead(Path.Combine(root, "src", "native", name))) return (Window)XamlReader.Load(stream);
        }
        static string InstanceName(string name) { return "multiOS_" + name + "_v2_" + Environment.UserName + "_" + (Environment.GetEnvironmentVariable("MULTIOS_PORT") ?? "5050"); }
        T Control<T>(string name) where T : FrameworkElement { return (T)window.FindName(name); }
        static SolidColorBrush Brush(string color) { return (SolidColorBrush)new BrushConverter().ConvertFromString(color); }
        static string Str(Dictionary<string, object> d, string key) { object v; return d != null && d.TryGetValue(key, out v) && v != null ? Convert.ToString(v) : ""; }
        static double Num(Dictionary<string, object> d, string key) { double n; return double.TryParse(Str(d, key), out n) ? n : 0; }
        static bool GetBool(Dictionary<string, object> d, string key) { return Str(d, key).Equals("True", StringComparison.OrdinalIgnoreCase); }
        static IEnumerable<Dictionary<string, object>> Rows(Dictionary<string, object> d, string key)
        {
            object value;
            if (d == null || !d.TryGetValue(key, out value) || !(value is IEnumerable)) return Enumerable.Empty<Dictionary<string, object>>();
            return ((IEnumerable)value).Cast<object>().OfType<Dictionary<string, object>>();
        }
        static string Bytes(double bytes) { return bytes >= 1073741824 ? (bytes / 1073741824).ToString("0.0") + " GB" : bytes >= 1048576 ? (bytes / 1048576).ToString("0.0") + " MB" : bytes >= 1024 ? (bytes / 1024).ToString("0") + " KB" : bytes.ToString("0") + " B"; }
        static string IconFor(string name) { return new[] { ".jpg", ".jpeg", ".png", ".heic", ".webp", ".gif" }.Contains(Path.GetExtension(name).ToLowerInvariant()) ? "\uEB9F" : "\uE8A5"; }

        void WireWindow()
        {
            Control<Grid>("TitleBar").MouseLeftButtonDown += (s, e) => {
                if (InsideButton(e.OriginalSource as DependencyObject)) return;
                if (e.ClickCount == 2) window.WindowState = window.WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
                else window.DragMove();
            };
            window.Closing += (s, e) => { if (!exiting) { e.Cancel = true; window.Hide(); } };
            window.PreviewKeyDown += (s, e) => { if (e.Key == Key.Escape) window.Hide(); };
            window.SizeChanged += (s, e) => {
                double size = window.ActualHeight < 620 ? 164 : 204;
                Control<Image>("QrImage").Width = size;
                Control<Image>("QrImage").Height = size;
            };
            Control<Button>("CloseButton").Click += (s, e) => window.Hide();
            Control<Button>("MinimizeButton").Click += (s, e) => window.WindowState = WindowState.Minimized;
            foreach (string p in new[] { "Receive", "Clipboard", "Send", "Device", "Settings" }) {
                string current = p;
                Control<Button>("Nav" + p).Click += (s, e) => SelectPage(current);
            }
            Control<Button>("PairFromEmpty").Click += (s, e) => SelectPage("Device");
            Control<Button>("OpenPairForSend").Click += (s, e) => SelectPage("Device");
            Control<Button>("FolderButton").Click += async (s, e) => await Post("/api/open-folder", new { });
            Control<Button>("SettingsFolder").Click += async (s, e) => await Post("/api/open-folder", new { });
            Control<Button>("ChooseReceiveFolder").Click += async (s, e) => {
                using (var dialog = new Forms.FolderBrowserDialog {
                    Description = "Gelen dosyaların kaydedileceği klasörü seçin",
                    SelectedPath = Str(status, "dropDir"), ShowNewFolderButton = true
                }) {
                    if (dialog.ShowDialog() == Forms.DialogResult.OK &&
                        await Post("/api/receive-folder", new { path = dialog.SelectedPath }) != null)
                        Feedback("Yeni dosyalar şuraya kaydedilecek: " + dialog.SelectedPath);
                }
            };
            Control<Button>("ResetReceiveFolder").Click += async (s, e) => {
                var folder = Str(status, "defaultDropDir");
                if (await Post("/api/receive-folder", new { path = folder }) != null)
                    Feedback("Kayıt konumu varsayılana döndü: " + folder);
            };
            Control<Button>("ClearReceived").Click += async (s, e) => {
                if (MessageBox.Show(window, "Gelen dosya geçmişi temizlensin mi? Alınan dosyalar korunacak.", "Geçmişi temizle", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes &&
                    await Post("/api/transfers/clear", new { }) != null) Feedback("Gelen dosya geçmişi temizlendi");
            };
            Control<Button>("ClearOutbound").Click += async (s, e) => {
                if (MessageBox.Show(window, "iPhone için hazırlanmış dosyalar temizlensin mi? Kaynak dosyalar korunacak.", "Gönderilecek dosyaları temizle", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes &&
                    await Post("/api/outbound/clear", new { }) != null) Feedback("Gönderilecek dosyalar temizlendi");
            };
            Control<Button>("ClearClipboard").Click += async (s, e) => { if (await Post("/api/clipboard/clear", new { }) != null) Feedback("Pano kaydı temizlendi"); };
            Control<Button>("ChooseFiles").Click += async (s, e) => {
                var dialog = new OpenFileDialog { Multiselect = true, Title = "iPhone'a gönderilecek dosyalar" };
                if (dialog.ShowDialog(window) == true) await StageFiles(dialog.FileNames);
            };
            var drop = Control<Border>("DropZone");
            drop.DragOver += (s, e) => { bool files = e.Data.GetDataPresent(DataFormats.FileDrop); e.Effects = files ? DragDropEffects.Copy : DragDropEffects.None; SetDropActive(files); e.Handled = true; };
            drop.DragLeave += (s, e) => SetDropActive(false);
            drop.Drop += async (s, e) => { SetDropActive(false); if (e.Data.GetDataPresent(DataFormats.FileDrop)) await StageFiles((string[])e.Data.GetData(DataFormats.FileDrop)); };
            Control<Button>("CopyPair").Click += (s, e) => {
                try { if (pairUrl.Length > 0) { Clipboard.SetText(pairUrl); Feedback("Bağlantı kopyalandı"); } } catch { Feedback("Pano şu an kullanılamıyor"); }
            };
            Control<Button>("CopyClipboard").Click += (s, e) => {
                try { string text = Control<TextBox>("ClipboardText").Text; if (text.Length > 0) Clipboard.SetText(text); Feedback("Metin kopyalandı"); } catch { Feedback("Pano şu an kullanılamıyor"); }
            };
            Control<Button>("CopyClipboardImage").Click += (s, e) => {
                try { var image = Control<Image>("ClipboardImage").Source as BitmapSource; if (image != null) { Clipboard.SetImage(image); Feedback("Görsel kopyalandı"); } } catch { Feedback("Pano şu an kullanılamıyor"); }
            };
            Control<CheckBox>("DarkTheme").Click += (s, e) => {
                if (loadingSettings) return;
                ApplyTheme(Control<CheckBox>("DarkTheme").IsChecked == true);
                preferences["dark"] = dark; SavePreferences();
            };
            Control<CheckBox>("AutoStart").Click += (s, e) => {
                try {
                    using (var key = Registry.CurrentUser.CreateSubKey(RunKey)) {
                        if (Control<CheckBox>("AutoStart").IsChecked == true)
                            key.SetValue("multiOS", "\"" + Process.GetCurrentProcess().MainModule.FileName + "\" --silent");
                        else key.DeleteValue("multiOS", false);
                    }
                } catch (Exception ex) { Feedback(ex.Message); Control<CheckBox>("AutoStart").IsChecked = IsAutoStart(); }
            };
            foreach (Button button in new[] { Control<Button>("CloseButton"), Control<Button>("MinimizeButton") })
                AutomationProperties.SetName(button, Convert.ToString(button.ToolTip));
        }

        void SetupTray()
        {
            var menu = new Forms.ContextMenuStrip();
            menu.Items.Add("multiOS'u aç", null, (s, e) => Dispatcher.Invoke(new Action(ShowMain)));
            menu.Items.Add("Gelen dosyalar", null, (s, e) => Dispatcher.Invoke(new Action(async () => await Post("/api/open-folder", new { }))));
            menu.Items.Add(new Forms.ToolStripSeparator());
            menu.Items.Add("Çıkış", null, (s, e) => Dispatcher.Invoke(new Action(async () => await ExitApp())));
            tray = new Forms.NotifyIcon { Text = "multiOS", ContextMenuStrip = menu, Visible = true };
            string iconPath = Path.Combine(root, "assets", "multios.ico");
            tray.Icon = File.Exists(iconPath) ? new System.Drawing.Icon(iconPath) : System.Drawing.SystemIcons.Application;
            tray.DoubleClick += (s, e) => Dispatcher.Invoke(new Action(ShowMain));
        }

        static bool InsideButton(DependencyObject element)
        {
            while (element != null) {
                if (element is Button) return true;
                element = element is Visual ? VisualTreeHelper.GetParent(element) : LogicalTreeHelper.GetParent(element);
            }
            return false;
        }

        void ShowMain() { window.Show(); if (window.WindowState == WindowState.Minimized) window.WindowState = WindowState.Normal; window.Activate(); }
        void SavePreferences() {
            try { Directory.CreateDirectory(dataDir); File.WriteAllText(preferencesPath + ".tmp", json.Serialize(preferences)); if (File.Exists(preferencesPath)) File.Delete(preferencesPath); File.Move(preferencesPath + ".tmp", preferencesPath); }
            catch (Exception e) { Feedback("Ayar kaydedilemedi: " + e.Message); }
        }
        bool IsAutoStart() { using (var key = Registry.CurrentUser.OpenSubKey(RunKey)) return key != null && key.GetValue("multiOS") != null; }

        void SelectPage(string next)
        {
            page = next;
            foreach (string p in new[] { "Receive", "Clipboard", "Send", "Device", "Settings" }) {
                Control<FrameworkElement>(p + "Page").Visibility = p == next ? Visibility.Visible : Visibility.Collapsed;
                Control<Button>("Nav" + p).Background = p == next ? Brush(dark ? "#38383A" : "#E4E4E9") : Brushes.Transparent;
                Control<Button>("Nav" + p).FontWeight = p == next ? FontWeights.Medium : FontWeights.Normal;
            }
            string[] titles = { "Gelen dosyalar", "Pano", "iPhone'a gönder", "iPhone", "Ayarlar" };
            string[] subtitles = { "iPhone'dan gelen fotoğraf ve dosyalar.", "Kopyaladığın son metin veya görsel.", "Dosyaları seç veya aşağıya bırak; iPhone'undan indirebilirsin.", "iPhone'unla aynı Wi-Fi ağında bağlantı kur.", "" };
            int index = Array.IndexOf(new[] { "Receive", "Clipboard", "Send", "Device", "Settings" }, next);
            Control<TextBlock>("PageTitle").Text = titles[index];
            Control<TextBlock>("PageSubtitle").Text = subtitles[index];
            Control<Button>("FolderButton").Visibility = next == "Receive" ? Visibility.Visible : Visibility.Collapsed;
            Control<Button>("ClearReceived").Visibility = next == "Receive" ? Visibility.Visible : Visibility.Collapsed;
            if (SystemParameters.ClientAreaAnimation) {
                var content = Control<FrameworkElement>(next + "Page");
                content.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0.5, 1, TimeSpan.FromMilliseconds(160)));
            }
        }

        void ApplyTheme(bool value)
        {
            dark = value;
            window.Background = Brush(dark ? "#1C1C1E" : "#F5F5F7");
            window.Foreground = Brush(dark ? "#E4E4E8" : "#38383E");
            window.Resources["Label"] = window.Foreground;
            window.Resources["Secondary"] = Brush(dark ? "#B9B9C0" : "#6C6C73");
            window.Resources["Surface"] = Brush(dark ? "#242426" : "#FFFFFF");
            window.Resources["Separator"] = Brush(dark ? "#404044" : "#E2E2E7");
            window.Resources["Accent"] = Brush(dark ? "#64ACFF" : "#0071E3");
            window.Resources["ControlFill"] = Brush(dark ? "#38383A" : "#ECECF0");
            window.Resources["TitleHover"] = Brush(dark ? "#4A4A4E" : "#E4E4E9");
            window.Resources["ScrollThumb"] = Brush(dark ? "#818188" : "#9999A1");
            dropActive = true; SetDropActive(false);
            foreach (string name in new[] { "AutoStart", "DarkTheme" }) Control<CheckBox>(name).Foreground = window.Foreground;
            receiveSignature = ""; sendSignature = "";
            SelectPage(page);
            if (status != null) RenderLists();
        }

        void SetDropActive(bool active)
        {
            if (dropActive == active) return;
            dropActive = active;
            var drop = Control<Border>("DropZone");
            drop.Background = Brush(active ? (dark ? "#26384D" : "#EAF3FF") : (dark ? "#303033" : "#F5F5F7"));
            drop.BorderBrush = active ? window.Resources["Accent"] as Brush : window.Resources["Separator"] as Brush;
            drop.BorderThickness = new Thickness(active ? 2 : 1);
        }

        async Task Poll()
        {
            if (polling || exiting) return;
            polling = true;
            try {
                var response = await api.GetAsync("/api/status");
                response.EnsureSuccessStatusCode();
                status = json.Deserialize<Dictionary<string, object>>(await response.Content.ReadAsStringAsync());
                failures = 0;
                Control<TextBlock>("SidebarStatus").Text = "Gönderime hazır";
                Control<System.Windows.Shapes.Ellipse>("StatusDot").Fill = Brush("#248A3D");
                Control<TextBlock>("NetworkLabel").Text = Str(status, "ip");
                Control<TextBlock>("DropPath").Text = Str(status, "dropDir");
                Control<Button>("ResetReceiveFolder").IsEnabled = !string.Equals(Str(status, "dropDir"), Str(status, "defaultDropDir"), StringComparison.OrdinalIgnoreCase);
                Control<TextBlock>("VersionLabel").Text = "multiOS " + Str(status, "version");
                Control<Button>("ChooseFiles").IsEnabled = !staging;
                Control<Button>("CopyPair").IsEnabled = true;
                if (pairUrl != Str(status, "pairUrl")) {
                    pairUrl = Str(status, "pairUrl");
                    Control<TextBlock>("PairAddress").Text = "http://" + Str(status, "ip") + ":" + Str(status, "port");
                    try { Control<Image>("QrImage").Source = Bitmap(await api.GetByteArrayAsync("/api/pair/qr")); } catch { }
                }
                object clip;
                var clipboard = status.TryGetValue("clipboard", out clip) ? clip as Dictionary<string, object> : null;
                string clipType = Str(clipboard, "type");
                string clipText = clipType == "text" ? Str(clipboard, "text") : "";
                string imagePath = clipType == "image" ? Str(clipboard, "path") : "";
                if (Control<TextBox>("ClipboardText").Text != clipText) Control<TextBox>("ClipboardText").Text = clipText;
                if (imagePath != clipboardImagePath) {
                    clipboardImagePath = imagePath;
                    Control<Image>("ClipboardImage").Source = imagePath.Length > 0 ? LoadBitmap(imagePath) : null;
                }
                bool hasText = clipText.Length > 0;
                bool hasImage = Control<Image>("ClipboardImage").Source != null;
                Control<TextBox>("ClipboardText").Visibility = hasText ? Visibility.Visible : Visibility.Collapsed;
                Control<Border>("ClipboardImagePanel").Visibility = hasImage ? Visibility.Visible : Visibility.Collapsed;
                Control<TextBlock>("ClipboardEmpty").Visibility = hasText || hasImage ? Visibility.Collapsed : Visibility.Visible;
                Control<Button>("CopyClipboard").Visibility = hasText ? Visibility.Visible : Visibility.Collapsed;
                Control<Button>("CopyClipboardImage").Visibility = hasImage ? Visibility.Visible : Visibility.Collapsed;
                Control<Button>("ClearClipboard").Visibility = hasText || hasImage ? Visibility.Visible : Visibility.Collapsed;
                RenderLists();
                RenderActivity();
                foreach (var t in Rows(status, "transfers")) {
                    string id = Str(t, "id");
                    if (Str(t, "state") == "done" && seen.Add(id) && !initialPoll) {
                        var names = Rows(t, "files").Select(f => Str(f, "name")).ToArray();
                        string message = names.Length == 1 ? "Dosya alındı: " + names[0] : names.Length + " dosya alındı";
                        tray.ShowBalloonTip(2500, "Dosya alındı", message.Length > 200 ? message.Substring(0, 197) + "…" : message, Forms.ToolTipIcon.Info);
                        Feedback(message);
                    }
                }
                initialPoll = false;
            } catch {
                failures++;
                receiving = false;
                Control<System.Windows.Shapes.Ellipse>("StatusDot").RenderTransform = Transform.Identity;
                Control<TextBlock>("SidebarStatus").Text = "Bağlantı bekleniyor";
                Control<System.Windows.Shapes.Ellipse>("StatusDot").Fill = Brush("#C07900");
                Control<Button>("ChooseFiles").IsEnabled = false;
                Control<Button>("CopyPair").IsEnabled = false;
                if ((DateTime.UtcNow - lastStart).TotalSeconds > 5 && (service == null || service.HasExited)) StartService();
            } finally { polling = false; }
        }

        void StartService()
        {
            lastStart = DateTime.UtcNow;
            try {
                string bundled = Path.Combine(root, "runtime", "node.exe");
                string node = File.Exists(bundled) ? bundled : "node.exe";
                service = Process.Start(new ProcessStartInfo(node, "\"" + Path.Combine(root, "src", "server.js") + "\" --silent") {
                    WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden
                });
            } catch (Exception e) { Feedback("Servis başlatılamadı: " + e.Message); }
        }

        void RenderLists()
        {
            string signature = json.Serialize(Rows(status, "transfers").Select(t => new { id = Str(t, "id"), state = Str(t, "state"), received = Str(t, "state") == "active" ? Num(t, "received") : 0 }));
            if (signature != receiveSignature) {
                receiveSignature = signature;
                var list = Control<StackPanel>("ReceiveList"); list.Children.Clear();
                foreach (var t in Rows(status, "transfers")) {
                    if (Str(t, "state") == "done") {
                        foreach (var f in Rows(t, "files")) {
                            string path = Str(f, "path");
                            var row = FileRow(Str(f, "name"), Bytes(Num(f, "size")) + " · Alındı", "/api/file/thumbnail?path=" + Uri.EscapeDataString(path));
                            var actions = (StackPanel)row.Children[2];
                            bool exists = File.Exists(path);
                            var open = ActionButton("Aç", "Dosyayı aç", async () => await Post("/api/file/open", new { path = path }), true);
                            open.IsEnabled = exists;
                            actions.Children.Add(open);
                            var reveal = ActionButton("Konumu aç", "Dosyayı klasörde göster", async () => await Post("/api/reveal", new { path = path }));
                            reveal.IsEnabled = exists;
                            actions.Children.Add(reveal);
                            list.Children.Add(row);
                        }
                    } else {
                        string name = "Dosya aktarımı"; object names;
                        if (t.TryGetValue("names", out names) && names is IEnumerable) name = string.Join(", ", ((IEnumerable)names).Cast<object>().Select(Convert.ToString));
                        var row = FileRow(name, Str(t, "state") == "failed" ? "Alınamadı · " + Str(t, "error") : Bytes(Num(t, "received")) + " · Alınıyor", null);
                        if (Str(t, "state") == "active") {
                            double total = Num(t, "total");
                            ((StackPanel)row.Children[1]).Children.Add(new ProgressBar {
                                Height = 3, Margin = new Thickness(0, 9, 0, 0),
                                Minimum = 0, Maximum = 100, Value = total > 0 ? Math.Min(100, Num(t, "received") / total * 100) : 0,
                                IsIndeterminate = total <= 0, Foreground = window.Resources["Accent"] as Brush,
                                Background = window.Resources["Separator"] as Brush
                            });
                        }
                        list.Children.Add(row);
                    }
                }
                Control<StackPanel>("ReceiveEmpty").Visibility = list.Children.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
                Control<Button>("ClearReceived").IsEnabled = list.Children.Count > 0;
            }
            signature = json.Serialize(Rows(status, "outbound"));
            if (signature != sendSignature) {
                sendSignature = signature;
                var list = Control<StackPanel>("SendList"); list.Children.Clear();
                foreach (var f in Rows(status, "outbound")) {
                    string id = Str(f, "id");
                    var row = FileRow(Str(f, "name"), Bytes(Num(f, "size")) + " · İndirilmeye hazır", Str(f, "thumbnailUrl"));
                    ((StackPanel)row.Children[2]).Children.Add(ActionButton("Kaldır", "Gönderilecek dosyayı listeden kaldır", async () => await Post("/api/outbound/remove", new { id = id })));
                    list.Children.Add(row);
                }
                Control<TextBlock>("SendCount").Text = list.Children.Count == 0 ? "Henüz dosya yok" : list.Children.Count + " dosya hazır";
                Control<Button>("ClearOutbound").IsEnabled = list.Children.Count > 0;
            }
        }

        Grid FileRow(string name, string detail, string thumbnailUrl)
        {
            var row = new Grid { Margin = new Thickness(0, 0, 0, 8), MinHeight = 76 };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(56) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var thumb = new Border { Width = 44, Height = 44, CornerRadius = new CornerRadius(8), Background = Brush(dark ? "#38383A" : "#F0F0F3"), VerticalAlignment = VerticalAlignment.Center, ClipToBounds = true };
            thumb.Child = new TextBlock { Text = IconFor(name), FontFamily = new FontFamily("Segoe MDL2 Assets"), FontSize = 22, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Foreground = Brush(dark ? "#B9B9C0" : "#626269") };
            row.Children.Add(thumb);
            var texts = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(4, 0, 12, 0) }; Grid.SetColumn(texts, 1);
            texts.Children.Add(new TextBlock { Text = name, FontWeight = FontWeights.Medium, TextTrimming = TextTrimming.CharacterEllipsis, TextWrapping = TextWrapping.NoWrap, ToolTip = name });
            texts.Children.Add(new TextBlock { Text = detail, FontSize = 12, Foreground = Brush(dark ? "#B9B9C0" : "#626269"), Margin = new Thickness(0, 5, 0, 0) }); row.Children.Add(texts);
            var actions = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center }; Grid.SetColumn(actions, 2); row.Children.Add(actions);
            if (!string.IsNullOrEmpty(thumbnailUrl)) LoadThumbnail(thumb, thumbnailUrl);
            return row;
        }

        async void LoadThumbnail(Border target, string url)
        {
            BitmapSource bitmap;
            if (thumbnails.TryGetValue(url, out bitmap)) { target.Child = new Image { Source = bitmap, Stretch = Stretch.UniformToFill }; return; }
            await thumbnailSlots.WaitAsync();
            try {
                if (!thumbnails.TryGetValue(url, out bitmap)) {
                    bitmap = Bitmap(await api.GetByteArrayAsync(url));
                    if (thumbnails.Count > 200) thumbnails.Clear();
                    thumbnails[url] = bitmap;
                }
                target.Child = new Image { Source = bitmap, Stretch = Stretch.UniformToFill };
            } catch { } finally { thumbnailSlots.Release(); }
        }

        Button ActionButton(string label, string tooltip, Func<Task> action, bool filled = false)
        {
            var button = new Button {
                MinHeight = 36, Padding = new Thickness(9, 5, 9, 5), Margin = new Thickness(2, 0, 2, 0), FontSize = 13,
                Background = filled ? window.Resources["ControlFill"] as Brush : Brushes.Transparent,
                Foreground = filled ? window.Foreground : Brush(dark ? "#C8C8CE" : "#55555C"),
                ToolTip = tooltip, Content = label
            };
            AutomationProperties.SetName(button, tooltip);
            button.Click += async (s, e) => { button.IsEnabled = false; try { await action(); } finally { button.IsEnabled = true; } };
            return button;
        }

        void RenderActivity()
        {
            var active = Rows(status, "transfers").FirstOrDefault(t => Str(t, "state") == "active");
            Control<TextBlock>("SidebarStatus").Text = active != null ? "Dosya alınıyor" : "Gönderime hazır";
            Control<System.Windows.Shapes.Ellipse>("StatusDot").Fill = active != null ? window.Resources["Accent"] as Brush : Brush("#248A3D");
            if (receiving != (active != null)) {
                receiving = active != null;
                var dot = Control<System.Windows.Shapes.Ellipse>("StatusDot");
                dot.RenderTransformOrigin = new Point(0.5, 0.5);
                dot.RenderTransform = new ScaleTransform(1, 1);
                if (receiving && SystemParameters.ClientAreaAnimation) {
                    var pulse = new DoubleAnimation(1, 1.45, TimeSpan.FromMilliseconds(700)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever };
                    ((ScaleTransform)dot.RenderTransform).BeginAnimation(ScaleTransform.ScaleXProperty, pulse);
                    ((ScaleTransform)dot.RenderTransform).BeginAnimation(ScaleTransform.ScaleYProperty, pulse);
                }
            }
        }

        async Task StageFiles(string[] paths)
        {
            if (staging) { Feedback("Önceki dosyalar hazırlanıyor"); return; }
            if (paths.Any(p => !File.Exists(p))) { Feedback("Yalnızca dosya seçebilirsiniz"); return; }
            staging = true; Control<Button>("ChooseFiles").IsEnabled = false;
            Control<TextBlock>("StageStatus").Text = "Hazırlanıyor…";
            try {
                using (var body = new MultipartFormDataContent()) {
                    foreach (string path in paths) body.Add(new StreamContent(File.OpenRead(path)), "file", Path.GetFileName(path));
                    var response = await uploads.PostAsync("/api/outbound/stage", body);
                    response.EnsureSuccessStatusCode();
                    var result = json.Deserialize<Dictionary<string, object>>(await response.Content.ReadAsStringAsync());
                    if (!GetBool(result, "ok")) throw new Exception(Str(result, "error"));
                    Feedback(paths.Length + " dosya iPhone için hazır");
                    SelectPage("Send");
                }
            } catch (Exception ex) { Feedback("Dosya hazırlanamadı: " + ex.Message); }
            finally { staging = false; Control<Button>("ChooseFiles").IsEnabled = failures == 0; Control<TextBlock>("StageStatus").Text = ""; }
            await Poll();
        }

        async Task<Dictionary<string, object>> Post(string url, object body)
        {
            try {
                using (var content = new StringContent(json.Serialize(body), Encoding.UTF8, "application/json")) {
                    var response = await api.PostAsync(url, content);
                    var result = json.Deserialize<Dictionary<string, object>>(await response.Content.ReadAsStringAsync());
                    if (!response.IsSuccessStatusCode || !GetBool(result, "ok")) throw new Exception(Str(result, "error"));
                    await Poll(); return result;
                }
            } catch (Exception e) { Feedback("İşlem tamamlanamadı: " + e.Message); return null; }
        }

        void Feedback(string message)
        {
            var label = Control<TextBlock>("Feedback");
            label.BeginAnimation(UIElement.OpacityProperty, null);
            label.Opacity = 1;
            label.Text = message;
            label.ToolTip = message;
            if (feedbackTimer == null) {
                feedbackTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(4) };
                feedbackTimer.Tick += (s, e) => {
                    feedbackTimer.Stop();
                    if (SystemParameters.ClientAreaAnimation)
                        label.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(180)));
                    else label.Opacity = 0;
                };
            }
            feedbackTimer.Stop(); feedbackTimer.Start();
        }
        static BitmapSource Bitmap(byte[] bytes) { using (var stream = new MemoryStream(bytes)) { var bitmap = new BitmapImage(); bitmap.BeginInit(); bitmap.CacheOption = BitmapCacheOption.OnLoad; bitmap.StreamSource = stream; bitmap.EndInit(); bitmap.Freeze(); return bitmap; } }
        static BitmapSource LoadBitmap(string path) { try { return Bitmap(File.ReadAllBytes(path)); } catch { return null; } }
        static void Capture(Window target, string path)
        {
            target.UpdateLayout();
            var bitmap = new RenderTargetBitmap((int)target.ActualWidth, (int)target.ActualHeight, 96, 96, PixelFormats.Pbgra32);
            bitmap.Render(target);
            var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(bitmap));
            using (var stream = File.Create(path)) encoder.Save(stream);
        }
        async Task ExitApp()
        {
            exiting = true; timer.Stop();
            try { await api.PostAsync("/api/shutdown", new StringContent("{}", Encoding.UTF8, "application/json")); } catch { }
            if (service != null && !service.HasExited) {
                try { if (!service.WaitForExit(1500)) service.Kill(); } catch { }
            }
            tray.Visible = false; tray.Dispose();
            showEvent.Dispose(); api.Dispose(); uploads.Dispose();
            Shutdown();
        }
    }

    static class ChromeExtension
    {
        public static void Set(this WindowChrome chrome, Window window) { WindowChrome.SetWindowChrome(window, chrome); }
    }
}
