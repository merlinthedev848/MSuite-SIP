using MerlinSip.Models;
using Windows.Devices.Enumeration;
using Windows.Graphics.Imaging;
using Windows.Media.Capture;
using Windows.Media.Capture.Frames;
using Windows.Storage.Streams;

namespace MerlinSip.Services;

public sealed class CameraPreviewSession
{
    private MediaCapture? _capture;
    private MediaFrameReader? _reader;
    private int _stopped;
    private int _pending;

    public event Action<int, int, byte[]>? FrameReady;
    public event Action<string>? Failed;

    public async Task StartAsync(MediaDeviceInfo device)
    {
        var found = await DeviceInformation.FindAllAsync(DeviceClass.VideoCapture);
        var match = Match(found, device);
        if (match is null)
        {
            Fail("No webcam was found.");
            return;
        }

        if (!await TryOpenAsync(match.Id, MediaCaptureSharingMode.ExclusiveControl))
        {
            if (Volatile.Read(ref _stopped) != 0 || !await TryOpenAsync(match.Id, MediaCaptureSharingMode.SharedReadOnly))
            {
                return;
            }
        }

        if (_capture is null)
        {
            return;
        }

        var source = ChooseSource(_capture);
        if (source is null)
        {
            Fail("The selected camera did not provide a video stream.");
            return;
        }

        try
        {
            await ChoosePreviewFormat(source);
        }
        catch
        {
        }

        _reader = await _capture.CreateFrameReaderAsync(source);
        _reader.FrameArrived += OnFrameArrived;
        var status = await _reader.StartAsync();
        if (status != MediaFrameReaderStartStatus.Success)
        {
            Fail("The selected camera could not be opened.");
        }
    }

    public void ReleaseFrameSlot()
    {
        Interlocked.Exchange(ref _pending, 0);
    }

    public async Task StopAsync()
    {
        if (Interlocked.Exchange(ref _stopped, 1) != 0)
        {
            return;
        }

        var reader = _reader;
        _reader = null;
        if (reader is not null)
        {
            reader.FrameArrived -= OnFrameArrived;
            try
            {
                await reader.StopAsync();
            }
            catch
            {
            }

            reader.Dispose();
        }

        var capture = _capture;
        _capture = null;
        capture?.Dispose();
    }

    private async Task<bool> TryOpenAsync(string deviceId, MediaCaptureSharingMode sharingMode)
    {
        var capture = new MediaCapture();
        try
        {
            await capture.InitializeAsync(new MediaCaptureInitializationSettings
            {
                VideoDeviceId = deviceId,
                StreamingCaptureMode = StreamingCaptureMode.Video,
                MemoryPreference = MediaCaptureMemoryPreference.Cpu,
                SharingMode = sharingMode
            });
            _capture?.Dispose();
            _capture = capture;
            return true;
        }
        catch (UnauthorizedAccessException)
        {
            capture.Dispose();
            Fail("Windows blocked the camera. Allow desktop apps under Settings, Privacy, Camera, then try again.");
            Interlocked.Exchange(ref _stopped, 1);
            return false;
        }
        catch (Exception error)
        {
            capture.Dispose();
            if (sharingMode == MediaCaptureSharingMode.ExclusiveControl)
            {
                Fail(Describe(error));
            }

            return false;
        }
    }

    private static DeviceInformation? Match(IEnumerable<DeviceInformation> devices, MediaDeviceInfo wanted)
    {
        DeviceInformation? fallback = null;
        foreach (var device in devices)
        {
            fallback ??= device;
            if (string.Equals(device.Id, wanted.Id, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(device.Name, wanted.Name, StringComparison.OrdinalIgnoreCase))
            {
                return device;
            }

            if (!string.IsNullOrWhiteSpace(wanted.Name) &&
                wanted.Name != "Default camera" &&
                device.Name.Contains(wanted.Name, StringComparison.OrdinalIgnoreCase))
            {
                return device;
            }
        }

        return string.Equals(wanted.Id, "default-video", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(wanted.Name, "Default camera", StringComparison.OrdinalIgnoreCase)
            ? fallback
            : null;
    }

    private static MediaFrameSource? ChooseSource(MediaCapture capture)
    {
        MediaFrameSource? color = null;
        MediaFrameSource? any = null;
        foreach (var source in capture.FrameSources.Values)
        {
            any ??= source;
            if (source.Info.SourceKind == MediaFrameSourceKind.Color)
            {
                color ??= source;
            }
        }

        return color ?? any;
    }

    private static async Task ChoosePreviewFormat(MediaFrameSource source)
    {
        MediaFrameFormat? best = null;
        var bestScore = int.MinValue;
        foreach (var format in source.SupportedFormats)
        {
            var width = (int)format.VideoFormat.Width;
            var height = (int)format.VideoFormat.Height;
            if (width < 160 || height < 120)
            {
                continue;
            }

            if (width > 1280 || height > 720)
            {
                continue;
            }

            var subtype = format.Subtype ?? "";
            var kind = subtype.Contains("YUY2", StringComparison.OrdinalIgnoreCase) ||
                subtype.Contains("NV12", StringComparison.OrdinalIgnoreCase) ? 3
                : subtype.Contains("RGB", StringComparison.OrdinalIgnoreCase) ? 2
                : subtype.Contains("MJPG", StringComparison.OrdinalIgnoreCase) ? 1
                : 0;
            if (kind == 0)
            {
                continue;
            }

            var score = (kind * 10_000_000) + (width * height);
            if (score > bestScore)
            {
                bestScore = score;
                best = format;
            }
        }

        if (best is not null)
        {
            await source.SetFormatAsync(best);
        }
    }

    private void OnFrameArrived(MediaFrameReader sender, MediaFrameArrivedEventArgs args)
    {
        if (Volatile.Read(ref _stopped) != 0 || Interlocked.CompareExchange(ref _pending, 1, 0) != 0)
        {
            return;
        }

        try
        {
            using var frame = sender.TryAcquireLatestFrame();
            var bitmap = frame?.VideoMediaFrame?.SoftwareBitmap;
            if (bitmap is null || !TryCopy(bitmap, out var width, out var height, out var pixels))
            {
                Interlocked.Exchange(ref _pending, 0);
                return;
            }

            FrameReady?.Invoke(width, height, pixels);
        }
        catch
        {
            Interlocked.Exchange(ref _pending, 0);
        }
    }

    private static bool TryCopy(SoftwareBitmap source, out int width, out int height, out byte[] pixels)
    {
        width = 0;
        height = 0;
        pixels = [];
        using var bitmap = SoftwareBitmap.Convert(source, BitmapPixelFormat.Bgra8, BitmapAlphaMode.Ignore);
        width = bitmap.PixelWidth;
        height = bitmap.PixelHeight;
        if (width <= 0 || height <= 0 || width > 4096 || height > 4096)
        {
            return false;
        }

        pixels = new byte[width * height * 4];
        var buffer = new global::Windows.Storage.Streams.Buffer((uint)pixels.Length);
        bitmap.CopyToBuffer(buffer);
        using var reader = DataReader.FromBuffer(buffer);
        reader.ReadBytes(pixels);
        for (var offset = 3; offset < pixels.Length; offset += 4)
        {
            pixels[offset] = 255;
        }

        return true;
    }

    private void Fail(string message)
    {
        if (Volatile.Read(ref _stopped) == 0)
        {
            Failed?.Invoke(message);
        }
    }

    private static string Describe(Exception error)
    {
        var text = error.Message ?? "";
        if (text.Contains("0xC00D3704", StringComparison.OrdinalIgnoreCase) ||
            text.Contains("0x80070020", StringComparison.OrdinalIgnoreCase) ||
            text.Contains("0xC00D3E85", StringComparison.OrdinalIgnoreCase) ||
            text.Contains("in use", StringComparison.OrdinalIgnoreCase))
        {
            return "That camera is in use by another app. Close the other app and try again.";
        }

        return string.IsNullOrWhiteSpace(text) || text.Length > 180
            ? "The selected camera could not be opened."
            : text;
    }
}

internal static class MediaFoundationCamera
{
    public static IReadOnlyList<MediaDeviceInfo> ListVideoDevices()
    {
        try
        {
            return Task.Run(async () =>
            {
                var found = await DeviceInformation.FindAllAsync(DeviceClass.VideoCapture);
                var devices = new List<MediaDeviceInfo>();
                foreach (var device in found)
                {
                    if (!string.IsNullOrWhiteSpace(device.Name))
                    {
                        devices.Add(new MediaDeviceInfo(device.Id, device.Name));
                    }
                }

                return (IReadOnlyList<MediaDeviceInfo>)devices;
            }).GetAwaiter().GetResult();
        }
        catch
        {
            return [];
        }
    }
}
