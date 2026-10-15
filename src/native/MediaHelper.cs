using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace MultiOS
{
    public static class MediaHelper
    {
        public static int Main(string[] args)
        {
            if (args.Length < 2)
            {
                Console.WriteLine("Usage: multios-media thumb <input> [output] [maxSize]");
                return 1;
            }

            string command = args[0].ToLowerInvariant();
            string inputPath = args[1];

            if (!File.Exists(inputPath))
            {
                Console.Error.WriteLine("Input file not found: " + inputPath);
                return 2;
            }

            try
            {
                if (command == "thumb")
                {
                    string outPath = args.Length > 2 ? args[2] : Path.ChangeExtension(inputPath, ".thumb.png");
                    int maxDim = args.Length > 3 ? int.Parse(args[3]) : 256;
                    return GenerateThumbnail(inputPath, outPath, maxDim) ? 0 : 3;
                }
                else
                {
                    Console.Error.WriteLine("Unknown command: " + command);
                    return 1;
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Error: " + ex.Message);
                return 9;
            }
        }

        private static bool GenerateThumbnail(string inputPath, string outPath, int maxDim)
        {
            string outDir = Path.GetDirectoryName(outPath);
            if (!string.IsNullOrEmpty(outDir)) Directory.CreateDirectory(outDir);

            // 1. Try WIC image decode (HEIC, JPG, PNG, WEBP, GIF, TIFF, BMP)
            try
            {
                Uri fileUri = new Uri(Path.GetFullPath(inputPath));
                BitmapDecoder decoder = BitmapDecoder.Create(fileUri, BitmapCreateOptions.None, BitmapCacheOption.OnLoad);
                if (decoder != null && decoder.Frames.Count > 0)
                {
                    BitmapFrame frame = decoder.Frames[0];
                    int origW = frame.PixelWidth;
                    int origH = frame.PixelHeight;

                    double scale = Math.Min(1.0, (double)maxDim / Math.Max(origW, origH));
                    BitmapSource source = frame;

                    if (scale < 0.999)
                    {
                        source = new TransformedBitmap(frame, new ScaleTransform(scale, scale));
                    }

                    PngBitmapEncoder encoder = new PngBitmapEncoder();
                    encoder.Frames.Add(BitmapFrame.Create(source));

                    using (FileStream fs = File.Create(outPath))
                    {
                        encoder.Save(fs);
                    }

                    long sz = new FileInfo(outPath).Length;
                    Console.WriteLine("{\"ok\":true,\"type\":\"image\",\"width\":" + source.PixelWidth + ",\"height\":" + source.PixelHeight + ",\"bytes\":" + sz + ",\"path\":\"" + Escape(outPath) + "\"}");
                    return true;
                }
            }
            catch
            {
                // WIC failed or not an image format, try fallback
            }

            // 2. Fallback: Shell associated icon (MOV, MP4, PDF, ZIP, etc.)
            try
            {
                using (Icon icon = Icon.ExtractAssociatedIcon(inputPath))
                {
                    if (icon != null)
                    {
                        using (Bitmap bmp = icon.ToBitmap())
                        {
                            bmp.Save(outPath, ImageFormat.Png);
                        }
                        long sz = new FileInfo(outPath).Length;
                        Console.WriteLine("{\"ok\":true,\"type\":\"icon\",\"width\":32,\"height\":32,\"bytes\":" + sz + ",\"path\":\"" + Escape(outPath) + "\"}");
                        return true;
                    }
                }
            }
            catch {}

            return false;
        }

        private static string Escape(string s)
        {
            if (s == null) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
        }
    }
}
