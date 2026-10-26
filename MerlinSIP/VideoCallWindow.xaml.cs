using System;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using MerlinSip.Models;
using MerlinSip.Services;

namespace MerlinSip;

public partial class VideoCallWindow : Window
{
    private readonly RtpVideoSession? _videoSession;
    private readonly DispatcherTimer _durationTimer;
    private readonly CameraPreviewSession _camera = new();
    private WriteableBitmap? _localBitmap;
    private DateTimeOffset _startTime;
    private bool _isMicMuted;
    private bool _isCameraMuted;
    private bool _isFullscreen;
    private int _closing;

    public event EventHandler? EndCallRequested;
    public event EventHandler<bool>? MuteMicRequested;
    public event EventHandler<bool>? ToggleCameraRequested;

    public VideoCallWindow(string callerName, string callerNumber, RtpVideoSession? videoSession = null)
    {
        InitializeComponent();
        _videoSession = videoSession;
        _startTime = DateTimeOffset.Now;

        CallerNameText.Text = string.IsNullOrWhiteSpace(callerName) ? "Remote User" : callerName;
        CallerNumberText.Text = $"Ext: {callerNumber}";

        var initials = GetInitials(callerName);
        ContactInitialsText.Text = initials;
        LargeInitialsText.Text = initials;

        if (_videoSession != null)
        {
            LocalCameraDeviceText.Text = _videoSession.VideoDevice.Name;
            _videoSession.LocalFrameUpdated += VideoSession_LocalFrameUpdated;
            _videoSession.RemoteFrameUpdated += VideoSession_RemoteFrameUpdated;
            _videoSession.CodecChanged += VideoSession_CodecChanged;
            UpdateCodecDisplay(_videoSession.NegotiatedCodec);
        }

        _durationTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(1)
        };
        _durationTimer.Tick += DurationTimer_Tick;
    }

    private static string GetInitials(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "VC";
        var parts = name.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 1) return parts[0].Length >= 2 ? parts[0][..2].ToUpperInvariant() : parts[0].ToUpperInvariant();
        return $"{char.ToUpperInvariant(parts[0][0])}{char.ToUpperInvariant(parts[^1][0])}";
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        _durationTimer.Start();
        ApplyMuteVisual();
        ApplyCameraVisual();
        var device = _videoSession?.VideoDevice ?? new MediaDeviceInfo("default-video", "Default camera");
        LocalCameraDeviceText.Text = device.Name;
        _camera.FrameReady += OnCameraFrame;
        _camera.Failed += OnCameraFailed;
        await _camera.StartAsync(device);
    }

    private void OnCameraFrame(int width, int height, byte[] pixels)
    {
        if (Volatile.Read(ref _closing) != 0)
        {
            _camera.ReleaseFrameSlot();
            return;
        }

        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.BeginInvoke(() => OnCameraFrame(width, height, pixels));
            return;
        }

        try
        {
            if (Volatile.Read(ref _closing) != 0 || !IsLoaded || _isCameraMuted)
            {
                return;
            }

            if (_localBitmap is null || _localBitmap.PixelWidth != width || _localBitmap.PixelHeight != height)
            {
                _localBitmap = new WriteableBitmap(width, height, 96, 96, PixelFormats.Bgra32, null);
            }

            _localBitmap.WritePixels(new Int32Rect(0, 0, width, height), pixels, width * 4, 0);
            LocalVideoImage.Source = _localBitmap;
            LocalCameraLiveDot.Fill = new SolidColorBrush(System.Windows.Media.Color.FromRgb(16, 185, 129));
            LocalCameraDeviceText.Text = $"{width}x{height}";
        }
        finally
        {
            _camera.ReleaseFrameSlot();
        }
    }

    private void OnCameraFailed(string message)
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.BeginInvoke(() => OnCameraFailed(message));
            return;
        }

        LocalCameraDeviceText.Text = message;
        LocalCameraLiveDot.Fill = new SolidColorBrush(System.Windows.Media.Color.FromRgb(148, 163, 184));
    }

    private void DurationTimer_Tick(object? sender, EventArgs e)
    {
        var elapsed = DateTimeOffset.Now - _startTime;
        CallDurationText.Text = elapsed.TotalHours >= 1
            ? elapsed.ToString(@"hh\:mm\:ss")
            : elapsed.ToString(@"mm\:ss");
    }

    public void SyncMicrophone(bool muted)
    {
        _isMicMuted = muted;
        ApplyMuteVisual();
    }

    private void VideoSession_LocalFrameUpdated(object? sender, VideoFrameEventArgs e)
    {
        Dispatcher.InvokeAsync(() =>
        {
            CameraMutedOverlay.Visibility = e.Muted ? Visibility.Visible : Visibility.Collapsed;
        });
    }

    private void VideoSession_RemoteFrameUpdated(object? sender, VideoFrameEventArgs e)
    {
        Dispatcher.InvokeAsync(() =>
        {
            if (RemoteVideoImage.Source is null)
            {
                RemoteCodecInfo.Text = "Video packets are arriving, but there is no picture to show yet.";
                StreamQualityLabel.Text = "Packets received, no picture";
            }
        });
    }

    private void VideoSession_CodecChanged(object? sender, string codec)
    {
        Dispatcher.InvokeAsync(() =>
        {
            UpdateCodecDisplay(codec);
        });
    }

    private void UpdateCodecDisplay(string codec)
    {
        YeastarProtocolBadge.Text = string.IsNullOrWhiteSpace(codec) ? "Video codec not negotiated" : codec;
    }

    private void MuteMicButton_Click(object sender, RoutedEventArgs e)
    {
        _isMicMuted = !_isMicMuted;
        ApplyMuteVisual();
        MuteMicRequested?.Invoke(this, _isMicMuted);
    }

    private void ApplyMuteVisual()
    {
        if (MuteMicButton.Template.FindName("BtnBdr", MuteMicButton) is System.Windows.Controls.Border bdr &&
            MuteMicButton.Template.FindName("BtnIcon", MuteMicButton) is System.Windows.Controls.TextBlock icon)
        {
            if (_isMicMuted)
            {
                bdr.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(220, 38, 38));
                icon.Text = "\uE74F";
            }
            else
            {
                bdr.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(31, 41, 55));
                icon.Text = "\uE720";
            }
        }
    }

    private void ToggleCameraButton_Click(object sender, RoutedEventArgs e)
    {
        _isCameraMuted = !_isCameraMuted;
        CameraMutedOverlay.Visibility = _isCameraMuted ? Visibility.Visible : Visibility.Collapsed;
        ApplyCameraVisual();
        ToggleCameraRequested?.Invoke(this, _isCameraMuted);
    }

    private void ApplyCameraVisual()
    {
        if (ToggleCameraButton.Template.FindName("BtnBdr", ToggleCameraButton) is System.Windows.Controls.Border bdr &&
            ToggleCameraButton.Template.FindName("BtnIcon", ToggleCameraButton) is System.Windows.Controls.TextBlock icon)
        {
            if (_isCameraMuted)
            {
                bdr.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(220, 38, 38));
                icon.Text = "\uE715";
            }
            else
            {
                bdr.Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(31, 41, 55));
                icon.Text = "\uE714";
            }
        }
    }

    private void RequestKeyframeButton_Click(object sender, RoutedEventArgs e)
    {
        _videoSession?.SendPictureLossIndication();
    }

    private void FullscreenButton_Click(object sender, RoutedEventArgs e)
    {
        _isFullscreen = !_isFullscreen;
        if (_isFullscreen)
        {
            WindowStyle = WindowStyle.None;
            WindowState = WindowState.Maximized;
        }
        else
        {
            WindowStyle = WindowStyle.SingleBorderWindow;
            WindowState = WindowState.Normal;
        }
    }

    private void EndCallButton_Click(object sender, RoutedEventArgs e)
    {
        EndCallRequested?.Invoke(this, EventArgs.Empty);
        Close();
    }

    private async void Window_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        if (Volatile.Read(ref _closing) == 2)
        {
            return;
        }

        e.Cancel = true;
        if (Interlocked.CompareExchange(ref _closing, 1, 0) != 0)
        {
            return;
        }

        _durationTimer.Stop();
        _camera.FrameReady -= OnCameraFrame;
        _camera.Failed -= OnCameraFailed;
        if (_videoSession != null)
        {
            _videoSession.LocalFrameUpdated -= VideoSession_LocalFrameUpdated;
            _videoSession.RemoteFrameUpdated -= VideoSession_RemoteFrameUpdated;
            _videoSession.CodecChanged -= VideoSession_CodecChanged;
        }

        try
        {
            await _camera.StopAsync();
        }
        catch
        {
        }

        Interlocked.Exchange(ref _closing, 2);
        _ = Dispatcher.BeginInvoke(DispatcherPriority.Background, () =>
        {
            try
            {
                Close();
            }
            catch (InvalidOperationException)
            {
            }
        });
    }
}
