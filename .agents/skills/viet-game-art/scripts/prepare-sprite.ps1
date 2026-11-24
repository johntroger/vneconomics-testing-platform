param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [int]$MaxHeight = 280,
  [int]$MaxWidth = 1600,
  [int]$Tolerance = 58,
  [int]$Despill = 1,
  [switch]$KeepBackground,
  [switch]$PixelArt
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $InputPath)) {
  throw "Input file not found: $InputPath"
}

$outDir = Split-Path -Parent $OutputPath
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

Add-Type -AssemblyName System.Drawing

$csharp = @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class VietSpriteProcessor
{
    private static double ColorDist(byte r1, byte g1, byte b1, byte r2, byte g2, byte b2)
    {
        int dr = r1 - r2;
        int dg = g1 - g2;
        int db = b1 - b2;
        return Math.Sqrt(dr * dr + dg * dg + db * db);
    }

    public static string Process(
        string inputPath,
        string outputPath,
        int maxHeight,
        int maxWidth,
        int tolerance,
        bool despill,
        bool keepBg,
        bool pixelArt)
    {
        using (Bitmap raw = new Bitmap(inputPath))
        using (Bitmap src = new Bitmap(raw.Width, raw.Height, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(src))
            {
                g.Clear(Color.Transparent);
                g.DrawImage(raw, 0, 0, raw.Width, raw.Height);
            }

            int w = src.Width;
            int h = src.Height;
            Rectangle rect = new Rectangle(0, 0, w, h);

            int cropX = 0, cropY = 0, cropW = w, cropH = h;

            if (!keepBg)
            {
                BitmapData data = src.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
                int stride = data.Stride;
                byte[] buf = new byte[stride * h];
                Marshal.Copy(data.Scan0, buf, 0, buf.Length);

                // Sample 4 corners for background color
                int[][] corners = new int[][] {
                    new int[] { Math.Min(2, w - 1), Math.Min(2, h - 1) },
                    new int[] { Math.Max(0, w - 3), Math.Min(2, h - 1) },
                    new int[] { Math.Min(2, w - 1), Math.Max(0, h - 3) },
                    new int[] { Math.Max(0, w - 3), Math.Max(0, h - 3) }
                };
                int sumR = 0, sumG = 0, sumB = 0;
                foreach (var c in corners)
                {
                    int idx = c[1] * stride + c[0] * 4;
                    sumB += buf[idx];
                    sumG += buf[idx + 1];
                    sumR += buf[idx + 2];
                }
                byte bgR = (byte)(sumR / 4);
                byte bgG = (byte)(sumG / 4);
                byte bgB = (byte)(sumB / 4);
                bool isChromaGreen = (bgG > bgR + 30) && (bgG > bgB + 30);

                bool[] visited = new bool[w * h];
                bool[] isBg = new bool[w * h];
                Queue<int> q = new Queue<int>();

                Func<int, int, bool> matchesBg = (px, py) =>
                {
                    int idx = py * stride + px * 4;
                    byte b = buf[idx];
                    byte gVal = buf[idx + 1];
                    byte r = buf[idx + 2];
                    byte a = buf[idx + 3];
                    if (a < 16) return true;
                    double dist = ColorDist(r, gVal, b, bgR, bgG, bgB);
                    if (dist <= tolerance) return true;
                    if (isChromaGreen && (gVal - Math.Max(r, b) > 26)) return true;
                    return false;
                };

                // Seed BFS from all 4 image edges (preserves white shirts/eyes inside closed outline)
                for (int x = 0; x < w; x++)
                {
                    int topIdx = x;
                    int botIdx = (h - 1) * w + x;
                    if (!visited[topIdx] && matchesBg(x, 0)) { visited[topIdx] = true; isBg[topIdx] = true; q.Enqueue(topIdx); }
                    if (!visited[botIdx] && matchesBg(x, h - 1)) { visited[botIdx] = true; isBg[botIdx] = true; q.Enqueue(botIdx); }
                }
                for (int y = 0; y < h; y++)
                {
                    int leftIdx = y * w;
                    int rightIdx = y * w + (w - 1);
                    if (!visited[leftIdx] && matchesBg(0, y)) { visited[leftIdx] = true; isBg[leftIdx] = true; q.Enqueue(leftIdx); }
                    if (!visited[rightIdx] && matchesBg(w - 1, y)) { visited[rightIdx] = true; isBg[rightIdx] = true; q.Enqueue(rightIdx); }
                }

                // Also seed enclosed chroma-green holes (e.g. between legs, arms, pigtails)
                if (isChromaGreen)
                {
                    for (int y = 1; y < h - 1; y++)
                    {
                        for (int x = 1; x < w - 1; x++)
                        {
                            int pIdx = y * w + x;
                            if (visited[pIdx]) continue;
                            int idx = y * stride + x * 4;
                            byte b = buf[idx];
                            byte gVal = buf[idx + 1];
                            byte r = buf[idx + 2];
                            if ((gVal - Math.Max(r, b) > 38) && ColorDist(r, gVal, b, bgR, bgG, bgB) <= tolerance)
                            {
                                visited[pIdx] = true;
                                isBg[pIdx] = true;
                                q.Enqueue(pIdx);
                            }
                        }
                    }
                }

                int[] dx = new int[] { -1, 1, 0, 0 };
                int[] dy = new int[] { 0, 0, -1, 1 };

                while (q.Count > 0)
                {
                    int cur = q.Dequeue();
                    int cx = cur % w;
                    int cy = cur / w;
                    for (int dir = 0; dir < 4; dir++)
                    {
                        int nx = cx + dx[dir];
                        int ny = cy + dy[dir];
                        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                        int nIdx = ny * w + nx;
                        if (visited[nIdx]) continue;
                        visited[nIdx] = true;
                        if (matchesBg(nx, ny))
                        {
                            isBg[nIdx] = true;
                            q.Enqueue(nIdx);
                        }
                    }
                }

                // Clear background pixels & clean fringe on boundary pixels
                int minX = w, minY = h, maxX = -1, maxY = -1;
                for (int y = 0; y < h; y++)
                {
                    for (int x = 0; x < w; x++)
                    {
                        int pIdx = y * w + x;
                        int bIdx = y * stride + x * 4;
                        if (isBg[pIdx])
                        {
                            buf[bIdx + 3] = 0;
                            continue;
                        }

                        // Check if touching background
                        bool touchesBg = false;
                        for (int dir = 0; dir < 4; dir++)
                        {
                            int nx = x + dx[dir];
                            int ny = y + dy[dir];
                            if (nx < 0 || nx >= w || ny < 0 || ny >= h || isBg[ny * w + nx])
                            {
                                touchesBg = true;
                                break;
                            }
                        }

                        if (touchesBg)
                        {
                            byte b = buf[bIdx];
                            byte gVal = buf[bIdx + 1];
                            byte r = buf[bIdx + 2];

                            if (despill && isChromaGreen && gVal > Math.Max(r, b))
                            {
                                buf[bIdx + 1] = Math.Max(r, b);
                                gVal = buf[bIdx + 1];
                            }

                            if (!pixelArt)
                            {
                                double dist = ColorDist(r, gVal, b, bgR, bgG, bgB);
                                double softLimit = tolerance * 1.45;
                                if (dist < softLimit)
                                {
                                    double ratio = Math.Max(0.15, (dist - tolerance * 0.5) / (softLimit - tolerance * 0.5));
                                    buf[bIdx + 3] = (byte)Math.Min(255, Math.Max(0, (int)(buf[bIdx + 3] * ratio)));
                                }
                            }
                        }

                        if (buf[bIdx + 3] > 16)
                        {
                            if (x < minX) minX = x;
                            if (y < minY) minY = y;
                            if (x > maxX) maxX = x;
                            if (y > maxY) maxY = y;
                        }
                    }
                }

                Marshal.Copy(buf, 0, data.Scan0, buf.Length);
                src.UnlockBits(data);

                if (maxX >= minX && maxY >= minY)
                {
                    int padSide = 4;
                    int padTop = 4;
                    int padBottom = 2; // Keep feet close to bottom-center anchor
                    cropX = Math.Max(0, minX - padSide);
                    cropY = Math.Max(0, minY - padTop);
                    int right = Math.Min(w - 1, maxX + padSide);
                    int bottom = Math.Min(h - 1, maxY + padBottom);
                    cropW = right - cropX + 1;
                    cropH = bottom - cropY + 1;
                }
            }

            // Compute target dimensions
            double scale = 1.0;
            if (maxHeight > 0 && cropH > maxHeight)
            {
                scale = Math.Min(scale, (double)maxHeight / cropH);
            }
            if (maxWidth > 0 && cropW > maxWidth)
            {
                scale = Math.Min(scale, (double)maxWidth / cropW);
            }

            int outW = Math.Max(1, (int)Math.Round(cropW * scale));
            int outH = Math.Max(1, (int)Math.Round(cropH * scale));

            using (Bitmap dst = new Bitmap(outW, outH, PixelFormat.Format32bppArgb))
            {
                using (Graphics g = Graphics.FromImage(dst))
                {
                    g.Clear(Color.Transparent);
                    if (pixelArt)
                    {
                        g.InterpolationMode = InterpolationMode.NearestNeighbor;
                        g.PixelOffsetMode = PixelOffsetMode.Half;
                        g.SmoothingMode = SmoothingMode.None;
                    }
                    else
                    {
                        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                        g.SmoothingMode = SmoothingMode.HighQuality;
                    }

                    g.DrawImage(
                        src,
                        new Rectangle(0, 0, outW, outH),
                        new Rectangle(cropX, cropY, cropW, cropH),
                        GraphicsUnit.Pixel);
                }

                if (outputPath.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) ||
                    outputPath.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase))
                {
                    ImageCodecInfo jpgEncoder = null;
                    foreach (var codec in ImageCodecInfo.GetImageEncoders())
                    {
                        if (codec.FormatID == ImageFormat.Jpeg.Guid) { jpgEncoder = codec; break; }
                    }
                    if (jpgEncoder != null)
                    {
                        EncoderParameters ep = new EncoderParameters(1);
                        ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 90L);
                        dst.Save(outputPath, jpgEncoder, ep);
                    }
                    else
                    {
                        dst.Save(outputPath, ImageFormat.Jpeg);
                    }
                }
                else
                {
                    dst.Save(outputPath, ImageFormat.Png);
                }
            }

            return string.Format("OK: {0}x{1} -> {2}x{3} saved to {4}", w, h, outW, outH, outputPath);
        }
    }
}
"@

if (-not ("VietSpriteProcessor" -as [type])) {
  Add-Type -TypeDefinition $csharp -ReferencedAssemblies System.Drawing
}

$result = [VietSpriteProcessor]::Process(
  (Resolve-Path -LiteralPath $InputPath).Path,
  [System.IO.Path]::GetFullPath($OutputPath),
  $MaxHeight,
  $MaxWidth,
  $Tolerance,
  ($Despill -gt 0),
  $KeepBackground.IsPresent,
  $PixelArt.IsPresent
)

Write-Output $result
