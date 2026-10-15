using System;
using System.IO;
using System.Text;
using System.Drawing;
using System.Drawing.Imaging;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using System.Threading;

namespace MultiOS {
    static class ClipHelper {
        [DllImport("user32.dll", SetLastError = true)]
        static extern bool AddClipboardFormatListener(IntPtr hWnd);

        [DllImport("user32.dll", SetLastError = true)]
        static extern bool RemoveClipboardFormatListener(IntPtr hWnd);

        const int WM_CLIPBOARDUPDATE = 0x031D;

        class ListenerWindow : Form {
            Action onUpdate;
            public ListenerWindow(Action onUpdate) {
                this.onUpdate = onUpdate;
                this.ShowInTaskbar = false;
                this.WindowState = FormWindowState.Minimized;
                this.FormBorderStyle = FormBorderStyle.None;
                this.Width = 0;
                this.Height = 0;
            }

            protected override void OnHandleCreated(EventArgs e) {
                base.OnHandleCreated(e);
                AddClipboardFormatListener(this.Handle);
            }

            protected override void OnHandleDestroyed(EventArgs e) {
                RemoveClipboardFormatListener(this.Handle);
                base.OnHandleDestroyed(e);
            }

            protected override void WndProc(ref Message m) {
                if (m.Msg == WM_CLIPBOARDUPDATE) {
                    onUpdate();
                }
                base.WndProc(ref m);
            }
        }

        static string cacheDir;
        static bool suppressNext = false;
        static string lastText = null;

        static void SendJson(string json) {
            Console.WriteLine(json);
        }

        static void HandleUpdate() {
            if (suppressNext) {
                suppressNext = false;
                return;
            }

            try {
                if (Clipboard.ContainsText()) {
                    string text = Clipboard.GetText();
                    if (text == lastText) return;
                    lastText = text;

                    byte[] bytes = Encoding.UTF8.GetBytes(text);
                    string b64 = Convert.ToBase64String(bytes);
                    string snippet = text.Length > 80 ? text.Substring(0, 80).Replace("\r", " ").Replace("\n", " ") + "..." : text.Replace("\r", " ").Replace("\n", " ");
                    SendJson(string.Format("{{\"type\":\"text\",\"snippet\":\"{0}\",\"payload\":\"{1}\",\"ts\":{2}}}",
                        Escape(snippet), b64, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()));
                } else if (Clipboard.ContainsImage()) {
                    Image img = Clipboard.GetImage();
                    if (img != null) {
                        string fn = string.Format("clip_{0}.png", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                        string fullPath = Path.Combine(cacheDir, fn);
                        img.Save(fullPath, ImageFormat.Png);
                        long sz = new FileInfo(fullPath).Length;
                        SendJson(string.Format("{{\"type\":\"image\",\"path\":\"{0}\",\"size\":{1},\"width\":{2},\"height\":{3},\"ts\":{4}}}",
                            Escape(fullPath), sz, img.Width, img.Height, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()));
                        img.Dispose();
                    }
                }
            } catch {
                // Clipboard might be locked by another application temporarily
            }
        }

        static string Escape(string s) {
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
        }

        [STAThread]
        static void Main(string[] args) {
            cacheDir = args.Length > 0 ? args[0] : Path.Combine(Path.GetTempPath(), "multiOS_clip");
            Directory.CreateDirectory(cacheDir);

            AutoResetEvent ready = new AutoResetEvent(false);

            Thread stdinThread = new Thread(() => {
                ready.WaitOne();
                string line;
                while ((line = Console.ReadLine()) != null) {
                    line = line.Trim();
                    if (line.StartsWith("SET_TEXT ")) {
                        string b64 = line.Substring(9);
                        try {
                            byte[] data = Convert.FromBase64String(b64);
                            string text = Encoding.UTF8.GetString(data);
                            lastText = text;
                            suppressNext = true;
                            listener.Invoke(new Action(() => {
                                try {
                                    Clipboard.SetDataObject(text, true);
                                    SendJson("{\"type\":\"set_ok\",\"ts\":" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + "}");
                                } catch (Exception ex) {
                                    SendJson("{\"type\":\"set_err\",\"error\":\"" + Escape(ex.Message) + "\"}");
                                }
                            }));
                        } catch (Exception ex) {
                            SendJson("{\"type\":\"set_err\",\"error\":\"" + Escape(ex.Message) + "\"}");
                        }
                    } else if (line.StartsWith("SET_IMAGE ")) {
                        string imgPath = line.Substring(10).Trim();
                        try {
                            if (File.Exists(imgPath)) {
                                suppressNext = true;
                                listener.Invoke(new Action(() => {
                                    try {
                                        using (Image img = Image.FromFile(imgPath)) {
                                            Clipboard.SetDataObject(new Bitmap(img), true);
                                            SendJson("{\"type\":\"set_ok\",\"ts\":" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + "}");
                                        }
                                    } catch (Exception ex) {
                                        SendJson("{\"type\":\"set_err\",\"error\":\"" + Escape(ex.Message) + "\"}");
                                    }
                                }));
                            } else {
                                SendJson("{\"type\":\"set_err\",\"error\":\"Dosya bulunamadi\"}");
                            }
                        } catch (Exception ex) {
                            SendJson("{\"type\":\"set_err\",\"error\":\"" + Escape(ex.Message) + "\"}");
                        }
                    } else if (line.StartsWith("GET")) {
                        try {
                            listener.Invoke(new Action(HandleUpdate));
                        } catch {}
                    }
                }
                Environment.Exit(0);
            });
            stdinThread.IsBackground = true;
            stdinThread.Start();

            listener = new ListenerWindow(HandleUpdate);
            listener.HandleCreated += (s, e) => ready.Set();
            Application.Run(listener);
        }

        static ListenerWindow listener;
    }
}
