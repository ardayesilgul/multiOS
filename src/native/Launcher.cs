using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading;
using System.Windows.Forms;

namespace MultiOS
{
    static class Launcher
    {
        private const string AppName = "multiOS";
        private const string AppVersion = "0.2.0";

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string appRoot = Path.Combine(localAppData, AppName);
            string localAppDir = Path.Combine(appRoot, "app");
            Directory.CreateDirectory(localAppDir);

            // Kalıcı tekil çalıştırılabilir dosya (%LOCALAPPDATA%\multiOS\multiOS.exe)
            string persistentExe = Path.Combine(appRoot, AppName + ".exe");
            string currentExe = Assembly.GetExecutingAssembly().Location;

            if (!string.IsNullOrEmpty(currentExe) && File.Exists(currentExe))
            {
                if (!string.Equals(currentExe, persistentExe, StringComparison.OrdinalIgnoreCase))
                {
                    try
                    {
                        File.Copy(currentExe, persistentExe, true);
                    }
                    catch {}
                }
            }

            string targetForShortcut = File.Exists(persistentExe) ? persistentExe : currentExe;

            // --install veya --shortcut argümanı kontrolü
            bool isInstallOnly = false;
            bool silent = false;
            foreach (string arg in args)
            {
                if (arg.Equals("--install", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("--shortcut", StringComparison.OrdinalIgnoreCase))
                {
                    isInstallOnly = true;
                }
                else if (arg.Equals("--silent", StringComparison.OrdinalIgnoreCase))
                {
                    silent = true;
                }

            }

            // Kısayolları oluştur (Masaüstü ve Başlat Menüsü)
            EnsureShortcuts(targetForShortcut, appRoot);

            if (isInstallOnly)
            {
                MessageBox.Show(
                    "multiOS Masaüstü ve Başlat Menüsü kısayolu başarıyla oluşturuldu.\n\nHedef: " + targetForShortcut,
                    AppName,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
                return;
            }

            bool createdNew;
            using (Mutex mutex = new Mutex(true, "multiOS_Launcher_Global_Mutex_2026", out createdNew))
            {
                string markerFile = Path.Combine(localAppDir, ".version");
                string bundleVersion;
                using (Stream bundle = Assembly.GetExecutingAssembly().GetManifestResourceStream("AppBundle.zip"))
                using (SHA256 hash = SHA256.Create())
                    bundleVersion = AppVersion + ":" + BitConverter.ToString(hash.ComputeHash(bundle));
                bool needExtract = !File.Exists(markerFile) || File.ReadAllText(markerFile).Trim() != bundleVersion;

                if (needExtract)
                {
                    try
                    {
                        ExtractBundle(localAppDir);
                        File.WriteAllText(markerFile, bundleVersion);
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("Uygulama paket dosyaları açılamadı: " + ex.Message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                        return;
                    }
                }

                // Arka plan sistem tepsisi süpervizörünü başlat
                string trayExe = Path.Combine(localAppDir, "src", "native", "multios-tray.exe");
                if (File.Exists(trayExe))
                {
                    try
                    {
                        ProcessStartInfo psi = new ProcessStartInfo();
                        psi.FileName = trayExe;
                        psi.Arguments = silent ? "--silent" : "--show";
                        psi.WorkingDirectory = localAppDir;
                        psi.CreateNoWindow = true;
                        psi.UseShellExecute = false;
                        psi.WindowStyle = ProcessWindowStyle.Hidden;
                        Process.Start(psi);
                    }
                    catch {}
                }

            }
        }

        public static void EnsureShortcuts(string targetExe, string workingDir)
        {
            try
            {
                string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string desktopLnk = Path.Combine(desktopDir, AppName + ".lnk");
                CreateShortcut(desktopLnk, targetExe, workingDir, "multiOS — iPhone ve Windows arasında dosya paylaşımı");

                string programsDir = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                string startMenuLnk = Path.Combine(programsDir, AppName + ".lnk");
                CreateShortcut(startMenuLnk, targetExe, workingDir, "multiOS — iPhone ve Windows arasında dosya paylaşımı");
            }
            catch {}
        }

        public static void CreateShortcut(string shortcutPath, string targetExe, string workingDir, string description)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType == null) return;
                object shell = Activator.CreateInstance(shellType);
                object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
                Type shortcutType = shortcut.GetType();
                shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetExe });
                shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDir });
                shortcutType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { description });
                shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { targetExe + ",0" });
                shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
            }
            catch {}
        }

        private static void ExtractBundle(string targetDir)
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            using (Stream stream = assembly.GetManifestResourceStream("AppBundle.zip"))
            {
                if (stream == null) return;
                using (ZipArchive archive = new ZipArchive(stream))
                {
                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        string fullPath = Path.Combine(targetDir, entry.FullName);
                        if (string.IsNullOrEmpty(entry.Name))
                        {
                            Directory.CreateDirectory(fullPath);
                        }
                        else
                        {
                            Directory.CreateDirectory(Path.GetDirectoryName(fullPath));
                            entry.ExtractToFile(fullPath, true);
                        }
                    }
                }
                // Older bundles extracted these files in place; remove them on upgrade.
                foreach (string relativePath in new[] { @"public\desktop.html", @"src\native\TrayApp.cs", @"src\native\CapsuleWindow.xaml", @"src\native\ShellHelper.cs", @"src\native\multios-shell.exe" })
                {
                    string obsolete = Path.Combine(targetDir, relativePath);
                    if (File.Exists(obsolete)) File.Delete(obsolete);
                }
            }
        }

    }
}
